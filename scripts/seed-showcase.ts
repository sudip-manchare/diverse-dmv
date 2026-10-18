import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import assert from "node:assert/strict";
import { getSql } from "../src/server/db";
import { getFirebaseAuth } from "../src/server/firebase";
import {
  enqueueProfileIndex,
  drainEmbeddingJobs,
} from "../src/server/embeddings";
import { showcaseFixtures } from "./showcase-fixtures";

const credentialFile = "DEMO_LOGINS.local.json";
const loginGuide = "DEMO_LOGINS.local.md";
const evidenceFile = "docs/implementation/evidence/showcase-accounts.json";

async function main() {
  assert.equal(
    process.env.ALLOW_FICTIONAL_SEED,
    "true",
    "Explicit demo seed opt-in required",
  );
  const base = process.env.APP_ORIGIN || "http://127.0.0.1:3000";
  const credentials: Record<string, string> = existsSync(credentialFile)
    ? JSON.parse(readFileSync(credentialFile, "utf8"))
    : {};
  const sql = getSql();
  const auth = getFirebaseAuth();
  const results: Record<string, unknown>[] = [];
  const sessions: string[] = [];
  let stage = "fixture provisioning";
  const headers = {
    origin: base,
    "content-type": "application/json",
    "x-csrf-protection": "1",
  };
  async function call(
    path: string,
    cookie: string,
    method = "GET",
    body?: unknown,
  ) {
    const response = await fetch(base + path, {
      method,
      headers: { ...headers, cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(60000),
    });
    assert.equal(response.status, 200, `Application route failed: ${path}`);
    return response;
  }
  try {
    for (const f of showcaseFixtures) {
      // Refuse collisions before creating identities or changing database rows.
      const accounts =
        await sql`SELECT a.id,a.auth_uid,a.email,p.data FROM accounts a LEFT JOIN profiles p ON p.account_id=a.id WHERE a.id=${f.id} OR a.auth_uid=${f.uid} OR a.email=${f.email}`;
      for (const a of accounts) {
        assert.ok(
          a.id === f.id &&
            a.auth_uid === f.uid &&
            a.email === f.email &&
            a.data?.fictional === true,
          "Fixture collision",
        );
      }
      let user;
      try {
        user = await auth.getUser(f.uid);
      } catch (error) {
        if ((error as { code?: string }).code !== "auth/user-not-found")
          throw error;
      }
      if (user) {
        assert.equal(user.email, f.email, "Identity collision");
        assert.equal(
          user.disabled,
          false,
          "Fixture was disabled; preserve owner changes",
        );
        assert.ok(
          credentials[f.email],
          "Existing account has no local credential; refusing password reset",
        );
      } else {
        credentials[f.email] ??=
          `Demo-${randomBytes(18).toString("base64url")}-7!`;
        // Persist before provider mutation so interrupted runs can recover.
        writeFileSync(
          credentialFile,
          JSON.stringify(credentials, null, 2) + "\n",
          { mode: 0o600 },
        );
        await auth.createUser({
          uid: f.uid,
          email: f.email,
          displayName: f.data.displayName,
          password: credentials[f.email],
        });
      }
      await sql.begin(async (tx) => {
        await tx`INSERT INTO accounts(id,auth_uid,name,email) VALUES(${f.id},${f.uid},${f.data.displayName},${f.email}) ON CONFLICT(id) DO NOTHING`;
        const inserted =
          await tx`INSERT INTO profiles(account_id,data,published,indexing_status) VALUES(${f.id},${tx.json(f.data)},true,'pending') ON CONFLICT(account_id) DO NOTHING RETURNING account_id`;
        if (inserted.length) await enqueueProfileIndex(tx, f.id, 1);
      });
      await drainEmbeddingJobs(1, f.id);
      console.log(
        `Provisioned fictional ${f.category.toLowerCase()}: ${f.name}`,
      );
    }
    writeFileSync(
      loginGuide,
      [
        "# Diverse DMV demo logins (local only)",
        "",
        `Open ${base}/login. All accounts below are fictional, published demo profiles.`,
        "",
        "This file and its JSON companion are excluded from Git, Docker and Vercel uploads. Keep them local; these passwords grant access to the demo accounts.",
        "",
        "| Category | Name | Email | Password |",
        "| --- | --- | --- | --- |",
        ...showcaseFixtures.map(
          (f) =>
            `| ${f.category} | ${f.name} | ${f.email} | \`${credentials[f.email]}\` |`,
        ),
        "",
        "Start with **Maya Chen** for frontend matches, **Zoe Brooks** for data, or **Eli Rivera** for UX. See [the demo walkthrough](docs/DEMO_ACCOUNTS.md) for scenarios.",
        "",
        "These reserved example.test addresses have no inbox. Password-reset email delivery cannot be demonstrated with these accounts.",
        "",
      ].join("\n"),
      { mode: 0o600 },
    );

    stage = "publication and stored embeddings";
    const ids = showcaseFixtures.map((f) => f.id);
    const vectors =
      await sql`SELECT p.account_id,p.published,p.version,p.indexing_status,e.source_version,e.dimensions FROM profiles p LEFT JOIN profile_embeddings e ON e.account_id=p.account_id WHERE p.account_id IN ${sql(ids)}`;
    assert.equal(vectors.length, 12);
    for (const v of vectors) {
      assert.equal(v.published, true);
      assert.equal(v.indexing_status, "ready");
      assert.equal(v.source_version, v.version);
      assert.equal(v.dimensions, 768);
    }
    console.log(
      "Verified 12 published profiles with current stored Gemini vectors.",
    );
    for (const f of showcaseFixtures) {
      stage = `password login and recommendations: ${f.name}`;
      const identityResponse = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: f.email,
            password: credentials[f.email],
            returnSecureToken: true,
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
      assert.equal(
        identityResponse.status,
        200,
        "Firebase password login failed",
      );
      const identity = await identityResponse.json();
      const session = await call("/api/session", "", "POST", {
        idToken: identity.idToken,
      });
      const cookie = session.headers.get("set-cookie")?.split(";")[0];
      assert.ok(cookie);
      sessions.push(cookie);
      assert.equal((await session.json()).account.id, f.id);
      const own = await (await call("/api/me/profile", cookie)).json();
      assert.equal(own.profile.published, true);
      const recs = await (await call("/api/recommendations", cookie)).json();
      assert.equal(recs.status, "ready");
      assert.ok(
        recs.profiles.length >= 3,
        "Expected several eligible recommendations",
      );
      assert.ok(recs.profiles.every((p: { id: string }) => p.id !== f.id));
      results.push({
        name: f.name,
        category: f.category,
        passwordLogin: "pass",
        serverSession: "pass",
        publication: "pass",
        storedEmbedding: "pass",
        dimensions: 768,
        recommendations: recs.profiles.length,
        topMatches: recs.profiles
          .slice(0, 5)
          .map((p: { data: { displayName: string } }) => p.data.displayName),
      });
      await call("/api/session", cookie, "DELETE");
      sessions.pop();
      console.log(
        `Verified ${f.name}: login and ${recs.profiles.length} live recommendations.`,
      );
    }
  } catch (error) {
    results.push({
      stage,
      status: "fail",
      category:
        error instanceof assert.AssertionError
          ? "assertion"
          : "provider-or-configuration",
      code: (error as { code?: string }).code,
    });
    process.exitCode = 1;
    console.error(
      `Showcase provisioning or verification failed at ${stage}; no credentials printed.`,
    );
  } finally {
    for (const cookie of sessions)
      await call("/api/session", cookie, "DELETE").catch(() => {});
    mkdirSync("docs/implementation/evidence", { recursive: true });
    writeFileSync(
      evidenceFile,
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          scope:
            "Live Firebase password authentication, local Next.js server sessions, Tiger Data profiles and Gemini vector recommendations. No simulated provider data. No connections or messages created.",
          results,
        },
        null,
        2,
      ) + "\n",
    );
    await sql.end();
  }
}
main().catch(() => {
  console.error(
    "Showcase setup could not start. Check private configuration; no credentials printed.",
  );
  process.exitCode = 1;
});
