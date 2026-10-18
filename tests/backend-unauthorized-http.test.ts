import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { emptyProfile } from "../src/shared/contracts";
const enabled = process.env.RUN_UNAUTHORIZED_HTTP_TESTS === "1";
test(
  "unrelated HTTP actor cannot list, cursor-read or send into another pair",
  { skip: !enabled },
  async () => {
    assert.equal(new URL(process.env.DATABASE_URL!).hostname, "127.0.0.1");
    assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
    const { getSql } = await import("../src/server/db");
    const { getFirebaseAuth } = await import("../src/server/firebase");
    const sql = getSql();
    const base = process.env.APP_ORIGIN || "http://127.0.0.1:3000";
    const headers = {
      "Content-Type": "application/json",
      Origin: base,
      "x-csrf-protection": "1",
    };
    const ids: string[] = [],
      uids: string[] = [],
      privateValues: string[] = [],
      results: any[] = [];
    const bodyMarker = `Fictional private message ${randomUUID()}`;
    privateValues.push(bodyMarker, "+12025550123");
    async function call(
      cookie: string,
      path: string,
      method = "GET",
      body?: unknown,
    ) {
      const response = await fetch(base + path, {
        method,
        headers: { ...headers, Cookie: cookie },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: response.status, data: (await response.json()) as any };
    }
    async function actor(name: string) {
      const email = `fictional-access-${randomUUID()}@example.invalid`;
      privateValues.push(email);
      const signup = await fetch(
        "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo",
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            email,
            password: "Fictional-only-password-123!",
            returnSecureToken: true,
          }),
        },
      );
      assert.equal(signup.status, 200);
      const auth = (await signup.json()) as any;
      uids.push(auth.localId);
      const response = await fetch(base + "/api/session", {
        method: "POST",
        headers,
        body: JSON.stringify({
          idToken: auth.idToken,
          name,
          phone: "+12025550123",
        }),
      });
      assert.equal(response.status, 200);
      const cookie = response.headers.get("set-cookie")!.split(";")[0];
      const me = await call(cookie, "/api/me");
      assert.equal(me.status, 200);
      const id = me.data.account.id;
      ids.push(id);
      const p = {
        ...emptyProfile(name),
        intentions: ["networking"],
        hereFor: "Meet testing peers",
        lookingToConnectWith: "Peers",
        skills: ["Testing"],
        fictional: true,
      };
      await sql`UPDATE profiles SET data=${sql.json(p)},published=true,indexing_status='pending' WHERE account_id=${id}`;
      return { id, cookie };
    }
    try {
      const a = await actor("Fictional Access Alex"),
        b = await actor("Fictional Access Blake"),
        c = await actor("Fictional Access Casey");
      const req = await call(a.cookie, "/api/requests", "POST", {
        recipientId: b.id,
        operationId: randomUUID(),
      });
      assert.equal(req.status, 200);
      const accepted = await call(
        b.cookie,
        `/api/requests/${req.data.request.id}/accept`,
        "POST",
        { operationId: randomUUID() },
      );
      assert.equal(accepted.status, 200);
      const sent = await call(a.cookie, "/api/conversations/send", "POST", {
        recipientId: b.id,
        body: bodyMarker,
        clientOperationId: randomUUID(),
      });
      assert.equal(sent.status, 200);
      const thread = sent.data.conversation.id;
      const ownHistory = await call(
        a.cookie,
        `/api/conversations/${thread}/messages`,
      );
      assert.equal(ownHistory.status, 200);
      assert.equal(ownHistory.data.messages.length, 1);
      assert.ok(ownHistory.data.before);
      assert.ok(ownHistory.data.after);
      const attempts = [
        {
          name: "unrelated-list",
          path: "/api/conversations",
          method: "GET",
          expected: 200,
        },
        {
          name: "unrelated-direct-history",
          path: `/api/conversations/${thread}/messages`,
          method: "GET",
          expected: 404,
        },
        {
          name: "unrelated-before-cursor",
          path: `/api/conversations/${thread}/messages?before=${encodeURIComponent(ownHistory.data.before)}`,
          method: "GET",
          expected: 404,
        },
        {
          name: "unrelated-after-cursor",
          path: `/api/conversations/${thread}/messages?after=${encodeURIComponent(ownHistory.data.after)}`,
          method: "GET",
          expected: 404,
        },
        {
          name: "unrelated-direct-send",
          path: "/api/conversations/send",
          method: "POST",
          body: {
            recipientId: b.id,
            body: "Fictional denied unauthorized send",
            clientOperationId: randomUUID(),
          },
          expected: 403,
        },
      ];
      for (const attempt of attempts) {
        const result = await call(
          c.cookie,
          attempt.path,
          attempt.method,
          attempt.body,
        );
        assert.equal(result.status, attempt.expected, attempt.name);
        const output = JSON.stringify(result.data);
        for (const sensitive of privateValues)
          assert.equal(
            output.includes(sensitive),
            false,
            attempt.name + " leaked sensitive content",
          );
        assert.equal(
          output.includes(thread),
          false,
          attempt.name + " leaked pair identifier",
        );
        if (attempt.expected === 200)
          assert.deepEqual(result.data, { conversations: [] });
        else {
          assert.deepEqual(Object.keys(result.data), ["error"]);
          assert.ok(
            ["UNAVAILABLE", "NOT_ALLOWED"].includes(result.data.error.code),
          );
          assert.equal(result.data.error.fields, undefined);
          assert.equal(
            result.data.error.message,
            attempt.expected === 404
              ? "This conversation is unavailable."
              : "Connect before you can message.",
          );
        }
        results.push({
          check: attempt.name,
          status: "pass",
          httpStatus: result.status,
          ...(attempt.expected === 200
            ? { emptyAuthorizedList: true }
            : { errorCode: result.data.error.code, neutralError: true }),
          noMessageBodyPreviewPhoneEmailOrPairId: true,
        });
      }
      for (const owner of [a, b, c])
        assert.equal((await call(owner.cookie, "/api/me")).status, 200);
      const bHistory = await call(
        b.cookie,
        `/api/conversations/${thread}/messages`,
      );
      assert.equal(bHistory.status, 200);
      assert.equal(bHistory.data.messages.length, 1);
      assert.equal(bHistory.data.messages[0].body, bodyMarker);
      assert.equal(bHistory.data.conversation.canMessage, true);
      const [saved] =
        await sql`SELECT count(*)::int AS count FROM messages WHERE conversation_id=${thread}`;
      assert.equal(saved.count, 1);
      const [cSent] =
        await sql`SELECT count(*)::int AS count FROM messages WHERE sender_id=${c.id}`;
      assert.equal(cSent.count, 0);
      results.push({
        check: "authorized-state-preserved",
        status: "pass",
        allThreeSessionsStillValid: true,
        pairHistoryStillReadable: true,
        connectedPairStillCanMessage: true,
        persistedMessageCount: 1,
        unrelatedSavedMessageCount: 0,
      });
    } catch (error) {
      results.push({
        check: "execution",
        status: "fail",
        error: error instanceof Error ? error.message : "Unknown test failure",
      });
      throw error;
    } finally {
      if (ids.length) {
        await sql`UPDATE conversations SET latest_message_id=NULL WHERE low_id IN ${sql(ids)} OR high_id IN ${sql(ids)}`;
        await sql`DELETE FROM messages WHERE sender_id IN ${sql(ids)}`;
        await sql`DELETE FROM conversations WHERE low_id IN ${sql(ids)} OR high_id IN ${sql(ids)}`;
        await sql`DELETE FROM operations WHERE actor_id IN ${sql(ids)}`;
        await sql`DELETE FROM requests WHERE sender_id IN ${sql(ids)} OR recipient_id IN ${sql(ids)}`;
        await sql`DELETE FROM connections WHERE low_id IN ${sql(ids)} OR high_id IN ${sql(ids)}`;
        await sql`DELETE FROM pairs WHERE low_id IN ${sql(ids)} OR high_id IN ${sql(ids)}`;
        await sql`DELETE FROM sessions WHERE account_id IN ${sql(ids)}`;
        await sql`DELETE FROM profiles WHERE account_id IN ${sql(ids)}`;
        await sql`DELETE FROM accounts WHERE id IN ${sql(ids)}`;
      }
      for (const uid of uids) await getFirebaseAuth().deleteUser(uid);
      await mkdir("docs/implementation/evidence", { recursive: true });
      await writeFile(
        "docs/implementation/evidence/unauthorized-check.json",
        JSON.stringify(
          {
            checkedAt: new Date().toISOString(),
            scope:
              "Actual Next.js HTTP with three isolated fictional Firebase emulator accounts and local PostgreSQL persistence; A/B connected and C unrelated.",
            reproduction:
              "RUN_UNAUTHORIZED_HTTP_TESTS=1 node --env-file=.env.local --conditions=react-server --import tsx --test tests/backend-unauthorized-http.test.ts",
            noSourceMocks: true,
            cleanup:
              "Only the three disposable fixture identities and their records removed; other fixtures unchanged.",
            results,
          },
          null,
          2,
        ) + "\n",
      );
      await sql.end();
    }
  },
);
