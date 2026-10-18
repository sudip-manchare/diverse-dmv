import postgres from "postgres";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
async function main() {
  const requestId = process.argv[2];
  if (!requestId || !/^[a-f0-9-]{36}$/.test(requestId))
    throw new Error("Usage: npm run process-deletion -- <request UUID>");
  if (!process.env.DATABASE_URL || !process.env.FIREBASE_PROJECT_ID)
    throw new Error("DATABASE_URL and FIREBASE_PROJECT_ID are required.");
  const sql = postgres(process.env.DATABASE_URL, {
    max: 1,
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
  });
  try {
    const account = await sql.begin(async (tx) => {
      const [request] =
        await tx`SELECT * FROM deletion_requests WHERE id=${requestId}`;
      if (!request) throw new Error("Deletion request not found.");
      const [account] =
        await tx`SELECT * FROM accounts WHERE id=${request.account_id} FOR UPDATE`;
      await tx`UPDATE accounts SET state='disabled',updated_at=clock_timestamp() WHERE id=${account.id} AND state='active'`;
      // Retries keep the original invalidation version; an already-deleted account is never re-enabled or downgraded.
      await tx`UPDATE profiles SET published=false,version=version+CASE WHEN published OR ${account.state === "active"} THEN 1 ELSE 0 END,indexing_status='draft' WHERE account_id=${account.id}`;
      await tx`UPDATE sessions SET revoked_at=clock_timestamp() WHERE account_id=${account.id}`;
      await tx`UPDATE deletion_requests SET status='processing' WHERE id=${requestId} AND status='requested'`;
      return account;
    });
    // Access is already revoked durably even if Firebase is temporarily unavailable.
    initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID,
      credential: process.env.FIREBASE_SERVICE_ACCOUNT_JSON
        ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
        : applicationDefault(),
    });
    await getAuth().revokeRefreshTokens(account.auth_uid);
    await getAuth().updateUser(account.auth_uid, { disabled: true });
    console.log(
      "Account access disabled and Firebase tokens revoked. Request remains processing; this is not data erasure.",
    );
  } finally {
    await sql.end();
  }
}
main().catch(() => {
  console.error(
    "Operation failed. Verify provider access and configuration; no sensitive diagnostics emitted.",
  );
  process.exitCode = 1;
});
