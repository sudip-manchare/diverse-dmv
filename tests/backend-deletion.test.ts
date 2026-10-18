import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { emptyProfile } from "../src/shared/contracts";
const enabled = process.env.RUN_DELETION_TESTS === "1";
const run = promisify(execFile);
test(
  "deletion receipt, operator disabling, revoked sessions and counterpart retained history",
  { skip: !enabled },
  async () => {
    assert.equal(
      new URL(process.env.DATABASE_URL!).hostname,
      "127.0.0.1",
      "This destructive fixture test requires the isolated local database.",
    );
    assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
    const { getSql } = await import("../src/server/db");
    const { getFirebaseAuth } = await import("../src/server/firebase");
    const sql = getSql();
    const origin = process.env.APP_ORIGIN || "http://127.0.0.1:3000";
    const ids: string[] = [],
      authUids: string[] = [],
      evidence: Record<string, unknown> = {};
    const headers = {
      "Content-Type": "application/json",
      Origin: origin,
      "x-csrf-protection": "1",
    };
    async function call(
      path: string,
      cookie: string,
      method = "GET",
      body?: unknown,
    ) {
      const response = await fetch(origin + path, {
        method,
        headers: { ...headers, Cookie: cookie },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, body: (await response.json()) as any };
    }
    async function create(name: string) {
      const signup = await fetch(
        "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            email: `fictional-deletion-${randomUUID()}@example.invalid`,
            password: "Fictional-only-password-123!",
            returnSecureToken: true,
          }),
        },
      );
      assert.equal(signup.status, 200);
      const identity = (await signup.json()) as any;
      authUids.push(identity.localId);
      const response = await fetch(origin + "/api/session", {
        method: "POST",
        headers,
        body: JSON.stringify({ idToken: identity.idToken, name }),
      });
      assert.equal(response.status, 200);
      const cookie = response.headers.get("set-cookie")!.split(";")[0];
      const me = await call("/api/me", cookie);
      assert.equal(me.status, 200);
      const id = me.body.account.id;
      ids.push(id);
      // Directly provision only disposable published fixture profiles; no embedding provider calls are part of this test.
      const profile = {
        ...emptyProfile(name),
        intentions: ["networking"],
        hereFor: "Meet testing peers",
        lookingToConnectWith: "Peers",
        skills: ["Testing"],
        fictional: true,
      };
      await sql`UPDATE profiles SET data=${sql.json(profile)},published=true,indexing_status='pending' WHERE account_id=${id}`;
      return { id, cookie, authUid: identity.localId };
    }
    try {
      const a = await create("Fictional Deletion Alex"),
        b = await create("Fictional Deletion Blake");
      const requested = await call("/api/requests", a.cookie, "POST", {
        recipientId: b.id,
        operationId: randomUUID(),
      });
      assert.equal(requested.status, 200);
      const accepted = await call(
        `/api/requests/${requested.body.request.id}/accept`,
        b.cookie,
        "POST",
        { operationId: randomUUID() },
      );
      assert.equal(accepted.status, 200);
      const sent = await call("/api/conversations/send", a.cookie, "POST", {
        recipientId: b.id,
        body: "Fictional retained conversation evidence",
        clientOperationId: randomUUID(),
      });
      assert.equal(sent.status, 200);
      const threadId = sent.body.conversation.id;
      const operationId = randomUUID();
      const receipt = await call("/api/deletion-requests", a.cookie, "POST", {
        operationId,
      });
      assert.equal(receipt.status, 200);
      assert.equal(receipt.body.deletionRequest.status, "requested");
      const repeated = await call("/api/deletion-requests", a.cookie, "POST", {
        operationId,
      });
      assert.equal(
        repeated.body.deletionRequest.id,
        receipt.body.deletionRequest.id,
      );
      const before = await call("/api/me", a.cookie);
      assert.equal(before.status, 200);
      assert.equal(before.body.account.deletionRequest.status, "requested");
      evidence.receipt = {
        status: "pass",
        requestOnlyKeepsAccess: true,
        retryDeduplicated: true,
        doesNotClaimErasure: true,
      };
      const invokeOperator = (
        emulatorHost = process.env.FIREBASE_AUTH_EMULATOR_HOST,
      ) =>
        run(
          process.execPath,
          [
            "--import",
            "tsx",
            "scripts/process-deletion.ts",
            receipt.body.deletionRequest.id,
          ],
          {
            cwd: process.cwd(),
            env: {
              ...process.env,
              NODE_ENV: "development",
              FIREBASE_AUTH_EMULATOR_HOST: emulatorHost,
            },
          },
        );
      await assert.rejects(() => invokeOperator("127.0.0.1:1"));
      const revokedDuringOutage = await call("/api/me", a.cookie);
      assert.equal(revokedDuringOutage.status, 401);
      evidence.providerFailure = {
        status: "pass",
        simulatedUnavailableLocalEmulator: true,
        operatorFailedHonestly: true,
        applicationAccessAlreadyRevoked: true,
        oldCookieHttpStatus: revokedDuringOutage.status,
      };
      await invokeOperator();
      const revoked = await call("/api/me", a.cookie);
      assert.equal(revoked.status, 401);
      const [record] =
        await sql`SELECT a.state,p.published,p.version,d.status,(SELECT count(*)::int FROM sessions WHERE account_id=a.id AND revoked_at IS NULL) AS active_sessions FROM accounts a JOIN profiles p ON p.account_id=a.id JOIN deletion_requests d ON d.account_id=a.id WHERE a.id=${a.id}`;
      assert.equal(record.state, "disabled");
      assert.equal(record.published, false);
      assert.equal(record.status, "processing");
      assert.equal(record.active_sessions, 0);
      const providerUser = await getFirebaseAuth().getUser(a.authUid);
      assert.equal(providerUser.disabled, true);
      assert.ok(providerUser.tokensValidAfterTime);
      evidence.operator = {
        status: "pass",
        appAccountDisabled: true,
        appSessionRevoked: true,
        oldCookieHttpStatus: revoked.status,
        profileUnpublished: true,
        firebaseUserDisabled: true,
        firebaseTokenRevocationRecorded: true,
        deletionStatus: record.status,
      };
      const history = await call(
        `/api/conversations/${threadId}/messages`,
        b.cookie,
      );
      assert.equal(history.status, 200);
      assert.equal(history.body.messages.length, 1);
      assert.equal(history.body.conversation.canMessage, false);
      assert.equal(history.body.conversation.displayName, "Unavailable member");
      const directProfile = await call(`/api/profiles/${a.id}`, b.cookie);
      assert.equal(directProfile.status, 404);
      const deniedSend = await call(
        "/api/conversations/send",
        b.cookie,
        "POST",
        {
          recipientId: a.id,
          body: "Must not save",
          clientOperationId: randomUUID(),
        },
      );
      assert.equal(deniedSend.status, 404);
      evidence.counterpart = {
        status: "pass",
        historyRetained: true,
        canMessage: false,
        label: "Unavailable member",
        directProfileHttpStatus: directProfile.status,
        sendDeniedHttpStatus: deniedSend.status,
      };
      await invokeOperator();
      const [rerun] =
        await sql`SELECT p.version,a.state,d.status FROM profiles p JOIN accounts a ON a.id=p.account_id JOIN deletion_requests d ON d.account_id=a.id WHERE a.id=${a.id}`;
      assert.equal(rerun.state, "disabled");
      assert.equal(rerun.status, "processing");
      assert.equal(
        rerun.version,
        record.version,
        "Operator retry must not invalidate the source version again.",
      );
      evidence.retry = {
        status: "pass",
        stillDisabled: true,
        sourceVersionUnchanged: true,
        noErasureClaim: true,
      };
      evidence.regression = {
        initialResult: "fail",
        cause:
          "Repeating operator processing unnecessarily incremented the profile source version.",
        fix: "Invalidate source only on initial active-account disable or a still-published profile; preserve completed account/request states.",
        retest: "pass",
        sourceVersionStableOnRepeat: true,
      };
      evidence.result = "pass";
    } catch (error) {
      evidence.result = "fail";
      evidence.failure =
        error instanceof Error ? error.message : "Unknown assertion failure";
      throw error;
    } finally {
      if (ids.length) {
        await sql`UPDATE conversations SET latest_message_id=NULL WHERE low_id IN ${sql(ids)} OR high_id IN ${sql(ids)}`;
        await sql`DELETE FROM messages WHERE sender_id IN ${sql(ids)}`;
        await sql`DELETE FROM conversations WHERE low_id IN ${sql(ids)} OR high_id IN ${sql(ids)}`;
        await sql`DELETE FROM operations WHERE actor_id IN ${sql(ids)}`;
        await sql`DELETE FROM deletion_requests WHERE account_id IN ${sql(ids)}`;
        await sql`DELETE FROM requests WHERE sender_id IN ${sql(ids)} OR recipient_id IN ${sql(ids)}`;
        await sql`DELETE FROM connections WHERE low_id IN ${sql(ids)} OR high_id IN ${sql(ids)}`;
        await sql`DELETE FROM pairs WHERE low_id IN ${sql(ids)} OR high_id IN ${sql(ids)}`;
        await sql`DELETE FROM sessions WHERE account_id IN ${sql(ids)}`;
        await sql`DELETE FROM profiles WHERE account_id IN ${sql(ids)}`;
        await sql`DELETE FROM accounts WHERE id IN ${sql(ids)}`;
      }
      for (const uid of authUids) await getFirebaseAuth().deleteUser(uid);
      evidence.fixtureCleanup =
        "Only disposable fixture account IDs and Auth emulator UIDs removed; other fixtures unchanged.";
      await mkdir("docs/implementation/evidence", { recursive: true });
      await writeFile(
        "docs/implementation/evidence/deletion-check.json",
        JSON.stringify(
          {
            checkedAt: new Date().toISOString(),
            scope:
              "Local PostgreSQL + Firebase Auth emulator + Next.js development API; not production deletion/retention verification",
            reproduction:
              "RUN_DELETION_TESTS=1 with isolated local DATABASE_URL, DATABASE_SSL=disable, FIREBASE_PROJECT_ID=demo-diverse-dmv, FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099, APP_ORIGIN=http://127.0.0.1:3000; node --conditions=react-server --import tsx --test tests/backend-deletion.test.ts",
            ...evidence,
          },
          null,
          2,
        ) + "\n",
      );
      await sql.end();
    }
  },
);
