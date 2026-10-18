/** Create a persisted, explicitly fictional connected demo pair; preserve existing state. */
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
const base = process.env.APP_ORIGIN || "http://127.0.0.1:3000";
const headers = {
  Origin: base,
  "Content-Type": "application/json",
  "x-csrf-protection": "1",
};
async function main() {
  assert.equal(process.env.ALLOW_FICTIONAL_SEED, "true");
  assert.ok(process.env.DEMO_ACCOUNT_PASSWORD);
  const actors: { id: string; email: string; cookie: string }[] = [];
  async function api(
    actor: { cookie: string },
    path: string,
    method = "GET",
    body?: unknown,
  ) {
    const response = await fetch(base + path, {
      method,
      headers: { ...headers, Cookie: actor.cookie },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error("Demo application operation failed.");
    return response.json();
  }
  try {
    for (const [suffix, email] of [
      ["1", "avery@example.test"],
      ["2", "river@example.test"],
      ["3", "jules@example.test"],
    ]) {
      const response: Response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
        {
          method: "POST",
          headers,
          body: JSON.stringify({
            email,
            password: process.env.DEMO_ACCOUNT_PASSWORD,
            returnSecureToken: true,
          }),
        },
      );
      assert.equal(response.status, 200);
      const identity = await response.json();
      const session = await fetch(base + "/api/session", {
        method: "POST",
        headers,
        body: JSON.stringify({ idToken: identity.idToken }),
      });
      assert.equal(session.status, 200);
      const actor = {
        id: `30000000-0000-4000-8000-00000000000${suffix}`,
        email,
        cookie: session.headers.get("set-cookie")!.split(";")[0],
      };
      actors.push(actor);
      const me = await api(actor, "/api/me");
      assert.equal(me.account.id, actor.id);
      assert.equal(me.profile.data.fictional, true);
    }
    const [a, b, c] = actors;
    const connections = await api(a, "/api/connections");
    if (
      !connections.connections.some(
        (connection: any) => connection.member.id === b.id,
      )
    ) {
      const request = await api(a, "/api/requests", "POST", {
        recipientId: b.id,
        introduction: "Fictional demo: let’s share what we are learning.",
        operationId: "40000000-0000-4000-8000-000000000001",
      });
      await api(b, `/api/requests/${request.request.id}/accept`, "POST", {
        operationId: "40000000-0000-4000-8000-000000000002",
      });
    }
    const first = await api(a, "/api/conversations/send", "POST", {
      recipientId: b.id,
      body: "Fictional demo: hello River! I’m exploring accessible web development and data projects.",
      clientOperationId: "40000000-0000-4000-8000-000000000003",
    });
    await api(b, "/api/conversations/send", "POST", {
      recipientId: a.id,
      body: "Fictional demo: hello Avery! Happy to compare notes and share React accessibility resources.",
      clientOperationId: "40000000-0000-4000-8000-000000000004",
    });
    const history = await api(
      a,
      `/api/conversations/${first.conversation.id}/messages`,
    );
    const denied = await fetch(
      `${base}/api/conversations/${first.conversation.id}/messages`,
      { headers: { Cookie: c.cookie } },
    );
    assert.equal(denied.status, 404);
    const evidence = {
      recordedAt: new Date().toISOString(),
      providers: "Actual Firebase Authentication + Tiger Data + Gemini",
      fictionalAccounts: actors.map(({ id, email }) => ({ id, email })),
      connectedPair: [a.id, b.id],
      unrelatedAccount: c.id,
      conversationId: first.conversation.id,
      persistedMessages: history.messages.length,
      unrelatedHistoryHttp: denied.status,
      passwordLocation: "Ignored local .env.demo; no value included",
      persistentFixtures: true,
    };
    await writeFile(
      "docs/implementation/evidence/live-demo-ready.json",
      JSON.stringify(evidence, null, 2) + "\n",
    );
    console.log(
      "Three live fictional demo logins ready; connected pair has durable history; unrelated account denied.",
    );
  } finally {
    for (const actor of actors)
      await fetch(base + "/api/session", {
        method: "DELETE",
        headers: { ...headers, Cookie: actor.cookie },
      }).catch(() => {});
  }
}
main().catch(() => {
  console.error(
    "Demo preparation failed; existing accounts and history preserved. No credentials logged.",
  );
  process.exitCode = 1;
});
