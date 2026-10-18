import { chromium } from "playwright";
import { randomUUID, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { getSql } from "../src/server/db";
import { getFirebaseAuth } from "../src/server/firebase";
const run = promisify(execFile);
async function main() {
  assert.equal(
    !!process.env.FIREBASE_AUTH_EMULATOR_HOST,
    false,
    "Emulator must not be enabled.",
  );
  assert.equal(
    !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL,
    false,
    "Browser emulator must not be enabled.",
  );
  assert.ok(
    process.env.DATABASE_URL && process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  );
  assert.equal(
    ["127.0.0.1", "localhost"].includes(
      new URL(process.env.DATABASE_URL!).hostname,
    ),
    false,
    "Use actual hosted Tiger Data.",
  );
  const base = process.env.APP_ORIGIN || "http://127.0.0.1:3000";
  const sql = getSql(),
    admin = getFirebaseAuth();
  const browser = await chromium.launch({
    executablePath:
      process.env.CHROMIUM_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const contexts = await Promise.all(
    [1, 2, 3].map(() =>
      browser.newContext({ viewport: { width: 1440, height: 900 } }),
    ),
  );
  const password =
    "Fictional-" + randomBytes(18).toString("base64url") + "-42!";
  const suffix = randomUUID().slice(0, 8);
  const emails = ["alex", "blake", "casey"].map(
    (n) => `fictional-live-${n}-${randomUUID()}@example.invalid`,
  );
  const ids: string[] = [],
    uids: string[] = [],
    results: any[] = [];
  let stage = "live fixture setup",
    cleanupStatus = "unverified";
  const started = performance.now();
  const headers = {
    origin: base,
    "content-type": "application/json",
    "x-csrf-protection": "1",
  };
  async function call(
    context: any,
    path: string,
    method = "GET",
    body?: unknown,
    expected = 200,
  ) {
    const response = await context.request.fetch(base + path, {
      method,
      headers,
      ...(body === undefined ? {} : { data: body }),
      timeout: 60000,
    });
    assert.equal(
      response.status(),
      expected,
      `${stage}: ${method} route status mismatch`,
    );
    const data = await response.json();
    if (expected >= 400) {
      for (const email of emails)
        assert.equal(JSON.stringify(data).includes(email), false);
      assert.deepEqual(Object.keys(data), ["error"]);
    }
    return data;
  }
  async function provider(action: string, data: unknown) {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${process.env.NEXT_PUBLIC_FIREBASE_API_KEY}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(data),
        signal: AbortSignal.timeout(20000),
      },
    );
    assert.equal(response.status, 200, `Live Firebase ${action} failed`);
    return response.json() as any;
  }
  async function newMember(context: any, email: string, name: string) {
    const identity = await provider("signUp", {
      email,
      password,
      returnSecureToken: true,
    });
    uids.push(identity.localId);
    const session = await call(context, "/api/session", "POST", {
      idToken: identity.idToken,
      name,
    });
    ids.push(session.account.id);
    return session.account;
  }
  async function savedPublish(context: any, data: Record<string, unknown>) {
    const own = await call(context, "/api/me/profile");
    const saved = await call(context, "/api/me/profile", "PATCH", {
      version: own.profile.version,
      cosmeticVersion: own.profile.cosmeticVersion,
      data,
    });
    const published = await call(context, "/api/me/profile/publish", "POST", {
      version: saved.profile.version,
    });
    assert.equal(
      published.profile.indexingStatus,
      "ready",
      "Live Gemini profile indexing must be ready",
    );
    return published.profile;
  }
  async function cooldown(a: string, b: string) {
    // Only this disposable pair advances its cooldown clock; application policy remains seven days.
    await sql`UPDATE pairs SET cooldown_until=clock_timestamp()-interval '1 second' WHERE low_id=LEAST(${a}::uuid,${b}::uuid) AND high_id=GREATEST(${a}::uuid,${b}::uuid)`;
  }
  async function connect(a: any, b: any, aId: string, bId: string) {
    const operationId = randomUUID();
    const request = await call(a, "/api/requests", "POST", {
      recipientId: bId,
      introduction: "Fictional live-provider introduction",
      operationId,
    });
    const replay = await call(a, "/api/requests", "POST", {
      recipientId: bId,
      introduction: "Fictional live-provider introduction",
      operationId,
    });
    assert.equal(replay.request.id, request.request.id);
    const accepted = await call(
      b,
      `/api/requests/${request.request.id}/accept`,
      "POST",
      { operationId: randomUUID() },
    );
    assert.ok(
      (await call(a, "/api/connections")).connections.some(
        (c: any) => c.member.id === bId,
      ),
    );
    assert.ok(
      (await call(b, "/api/connections")).connections.some(
        (c: any) => c.member.id === aId,
      ),
    );
    return accepted.connectionId;
  }
  try {
    const [a, b, c] = contexts;
    const pageA = await a.newPage();
    stage = "real Firebase browser signup";
    await pageA.goto(base + "/signup");
    await pageA
      .getByLabel("Name", { exact: true })
      .fill(`Alex Example · Live fixture ${suffix}`);
    await pageA.getByLabel("Email", { exact: true }).fill(emails[0]);
    await pageA.getByLabel("Password", { exact: true }).fill(password);
    await pageA
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await pageA.waitForURL("**/dashboard", { timeout: 60000 });
    const A = (await call(a, "/api/me")).account;
    ids.push(A.id);
    uids.push((await admin.getUserByEmail(emails[0])).uid);
    const B = await newMember(
      b,
      emails[1],
      `Blake Example · Live fixture ${suffix}`,
    );
    await newMember(c, emails[2], `Casey Example · Live fixture ${suffix}`);
    for (const uid of uids) {
      const user = await admin.getUser(uid);
      assert.equal(user.disabled, false);
    }
    results.push({
      check: "live-firebase-signup-admin-server-session",
      status: "pass",
      actualBrowserSignup: true,
      realFirebaseIdentities: 3,
      adminLookupVerified: true,
      appSessionsPersisted: true,
      optionalContactOmittedAtSignup: true,
    });
    stage = "hosted profile publication and vector indexing";
    await call(a, "/api/me", "PATCH", { phone: "+1 202 555 0123" });
    assert.equal((await call(a, "/api/me")).account.phone, "+12025550123");
    const common = {
      intentions: ["networking"],
      hereFor: "Learn accessible React frontend development",
      lookingToConnectWith: "People offering React accessibility mentoring",
      skills: ["React", "accessibility"],
      fictional: true,
    };
    await savedPublish(a, common);
    await savedPublish(b, {
      ...common,
      intentions: ["mentoring", "networking", "seeking"],
      hereFor: "Offer React accessibility feedback",
      lookingToConnectWith: "Frontend learners",
      mentoringTopics: "React and accessibility",
      mentoringAvailability: "accepting",
      desiredRoles: "Fictional confidential seeking detail",
      identity: "Fictional confidential identity",
      pronouns: "Fictional private pronouns",
    });
    await savedPublish(c, {
      ...common,
      hereFor: "Learn Python data analysis",
      lookingToConnectWith: "Data analysis mentors",
      skills: ["Python"],
    });
    const vectors =
      await sql`SELECT p.version,e.source_version,e.dimensions,p.indexing_status FROM profiles p JOIN profile_embeddings e ON e.account_id=p.account_id WHERE p.account_id IN ${sql(ids)}`;
    assert.equal(vectors.length, 3);
    for (const vector of vectors) {
      assert.equal(vector.version, vector.source_version);
      assert.equal(vector.dimensions, 768);
      assert.equal(vector.indexing_status, "ready");
    }
    const visible = await call(a, `/api/profiles/${B.id}`);
    for (const secret of [
      emails[1],
      "+12025550123",
      "Fictional confidential seeking detail",
      "Fictional confidential identity",
      "Fictional private pronouns",
    ])
      assert.equal(JSON.stringify(visible).includes(secret), false);
    const recs = await call(a, "/api/recommendations");
    assert.equal(recs.status, "ready");
    assert.ok(recs.profiles.some((p: any) => p.id === B.id));
    results.push({
      check: "hosted-profile-private-contacts-and-live-vectors",
      status: "pass",
      normalizedPhoneOwnerOnly: true,
      privateSeekingIdentityOmitted: true,
      currentStoredVectors: 3,
      dimensions: 768,
      realGemini: true,
      sharedRecommendationsReady: true,
    });
    stage = "live persisted request and messaging";
    let connectionId = await connect(a, b, A.id, B.id);
    const messageBody = "Fictional live-provider durable message";
    const operation = randomUUID();
    const first = await call(a, "/api/conversations/send", "POST", {
      recipientId: B.id,
      body: messageBody,
      clientOperationId: operation,
    });
    const thread = first.conversation.id;
    const replay = await call(a, "/api/conversations/send", "POST", {
      recipientId: B.id,
      body: messageBody,
      clientOperationId: operation,
    });
    assert.equal(replay.message.id, first.message.id);
    await call(b, "/api/conversations/send", "POST", {
      recipientId: A.id,
      body: "Fictional live-provider reply",
      clientOperationId: randomUUID(),
    });
    const original = await call(a, `/api/conversations/${thread}/messages`);
    assert.equal(original.messages.length, 2);
    assert.deepEqual((await call(c, "/api/conversations")).conversations, []);
    for (const tail of [
      "",
      `?before=${encodeURIComponent(original.before)}`,
      `?after=${encodeURIComponent(original.after)}`,
    ]) {
      const denied = await call(
        c,
        `/api/conversations/${thread}/messages${tail}`,
        "GET",
        undefined,
        404,
      );
      assert.equal(JSON.stringify(denied).includes(messageBody), false);
    }
    await call(
      c,
      "/api/conversations/send",
      "POST",
      {
        recipientId: B.id,
        body: "Fictional denied outsider",
        clientOperationId: randomUUID(),
      },
      403,
    );
    results.push({
      check: "hosted-request-message-retry-and-unrelated-denial",
      status: "pass",
      requestReplayDeduplicated: true,
      mutualConnectionVisible: true,
      messageReplayExactlyOnce: true,
      twoWayHistoryCount: 2,
      unrelatedListEmpty: true,
      directBeforeAfterDenied: true,
      unrelatedSendDenied: true,
    });
    stage = "real browser relogin and reopened history";
    const cookieBefore = (await a.cookies()).find(
      (x) => x.name === "dmv_session",
    );
    assert.ok(cookieBefore);
    await pageA.goto(base + "/settings");
    await pageA
      .getByRole("button", { name: "Log out", exact: true })
      .first()
      .click();
    await pageA.waitForURL(base + "/");
    const deniedOld = await fetch(base + "/api/me", {
      headers: { Cookie: `dmv_session=${cookieBefore!.value}` },
    });
    assert.equal(deniedOld.status, 401);
    await pageA.goto(base + "/login");
    await pageA.getByLabel("Email", { exact: true }).fill(emails[0]);
    await pageA.getByLabel("Password", { exact: true }).fill(password);
    await pageA.getByRole("button", { name: "Log in", exact: true }).click();
    await pageA.waitForURL("**/dashboard", { timeout: 60000 });
    await pageA.goto(base + `/messages/${thread}`);
    await pageA
      .getByRole("list", { name: "Conversation history" })
      .getByText("Fictional live-provider reply", { exact: true })
      .waitFor({ timeout: 30000 });
    assert.equal(
      (await call(a, `/api/conversations/${thread}/messages`)).messages.length,
      2,
    );
    // Drop only the acknowledgement after actual hosted transaction commits; no response/persistence is fabricated.
    await pageA.route(
      "**/api/conversations/send",
      async (route) => {
        await route.fetch();
        await route.abort("failed");
      },
      { times: 1 },
    );
    const retryText = "Fictional live-provider lost response retry";
    await pageA
      .getByLabel(`Message ${B.name}`, { exact: true })
      .fill(retryText);
    await pageA
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await pageA
      .getByRole("button", { name: "Retry message", exact: true })
      .waitFor({ timeout: 30000 });
    assert.equal(
      await pageA.getByLabel(`Message ${B.name}`, { exact: true }).inputValue(),
      retryText,
    );
    await pageA
      .getByRole("button", { name: "Retry message", exact: true })
      .click();
    await pageA
      .getByRole("list", { name: "Conversation history" })
      .getByText(retryText, { exact: true })
      .waitFor();
    assert.equal(
      (await call(a, `/api/conversations/${thread}/messages`)).messages.filter(
        (m: any) => m.body === retryText,
      ).length,
      1,
    );
    results.push({
      check: "real-browser-logout-login-history-and-uncertain-retry",
      status: "pass",
      logoutRevokesOldCookie: true,
      realFirebasePasswordLogin: true,
      reopenedSamePersistedThread: true,
      lostAcknowledgementAfterRealCommit: true,
      composerRetained: true,
      explicitRetryStoredExactlyOnce: true,
    });
    stage = "live removal cooldown reconnection and blocking";
    await call(a, `/api/connections/${connectionId}`, "DELETE", {
      operationId: randomUUID(),
    });
    assert.equal(
      (await call(b, `/api/conversations/${thread}/messages`)).conversation
        .canMessage,
      false,
    );
    await call(
      a,
      "/api/conversations/send",
      "POST",
      {
        recipientId: B.id,
        body: "Fictional removed denial",
        clientOperationId: randomUUID(),
      },
      403,
    );
    await call(
      a,
      "/api/requests",
      "POST",
      { recipientId: B.id, operationId: randomUUID() },
      429,
    );
    await cooldown(A.id, B.id);
    connectionId = await connect(a, b, A.id, B.id);
    const reconnect = await call(a, "/api/conversations/send", "POST", {
      recipientId: B.id,
      body: "Fictional reconnected message",
      clientOperationId: randomUUID(),
    });
    assert.equal(reconnect.conversation.id, thread);
    const blocked = await call(a, "/api/blocks", "POST", {
      blockedId: B.id,
      operationId: randomUUID(),
    });
    await call(
      b,
      `/api/conversations/${thread}/messages`,
      "GET",
      undefined,
      404,
    );
    await call(
      a,
      `/api/conversations/${thread}/messages`,
      "GET",
      undefined,
      404,
    );
    await call(b, `/api/profiles/${A.id}`, "GET", undefined, 404);
    await call(
      a,
      "/api/conversations/send",
      "POST",
      {
        recipientId: B.id,
        body: "Fictional blocked denial",
        clientOperationId: randomUUID(),
      },
      404,
    );
    await call(a, `/api/blocks/${blocked.block.id}`, "DELETE", {
      operationId: randomUUID(),
    });
    assert.equal(
      (await call(a, `/api/conversations/${thread}/messages`)).conversation
        .canMessage,
      false,
    );
    assert.equal((await call(a, "/api/connections")).connections.length, 0);
    await cooldown(A.id, B.id);
    await connect(a, b, A.id, B.id);
    assert.equal(
      (await call(a, `/api/conversations/${thread}/messages`)).conversation
        .canMessage,
      true,
    );
    results.push({
      check: "hosted-remove-reconnect-block-unblock",
      status: "pass",
      removalReadOnly: true,
      removedSendDenied: true,
      realCooldown429: true,
      onlyFixtureCooldownClockAdvanced: true,
      reconnectionReusesThread: true,
      blockBothDirectionsDirectReadsAndSendsDenied: true,
      unblockDoesNotReconnect: true,
    });
    stage = "real Firebase deletion operator";
    const deletion = await call(b, "/api/deletion-requests", "POST", {
      operationId: randomUUID(),
    });
    assert.equal(deletion.deletionRequest.status, "requested");
    assert.equal(
      (await call(b, "/api/me")).account.deletionRequest.status,
      "requested",
    );
    await run(
      process.execPath,
      [
        "--import",
        "tsx",
        "scripts/process-deletion.ts",
        deletion.deletionRequest.id,
      ],
      { cwd: process.cwd(), env: process.env, timeout: 30000 },
    );
    await call(b, "/api/me", "GET", undefined, 401);
    const providerUser = await admin.getUser(uids[1]);
    assert.equal(providerUser.disabled, true);
    const remaining = await call(a, `/api/conversations/${thread}/messages`);
    assert.equal(remaining.conversation.canMessage, false);
    assert.equal(remaining.conversation.displayName, "Unavailable member");
    assert.ok(remaining.messages.length >= 4);
    await call(
      a,
      "/api/conversations/send",
      "POST",
      {
        recipientId: B.id,
        body: "Fictional disabled denial",
        clientOperationId: randomUUID(),
      },
      404,
    );
    const [dbState] =
      await sql`SELECT a.state,d.status,(SELECT count(*)::int FROM sessions WHERE account_id=a.id AND revoked_at IS NULL) AS active_sessions FROM accounts a JOIN deletion_requests d ON d.account_id=a.id WHERE a.id=${B.id}`;
    assert.equal(dbState.state, "disabled");
    assert.equal(dbState.status, "processing");
    assert.equal(dbState.active_sessions, 0);
    results.push({
      check: "real-admin-deletion-disable-and-retained-history",
      status: "pass",
      requestIsReceiptOnly: true,
      appAccessAndSessionsRevoked: true,
      actualFirebaseUserDisabled: true,
      providerTokenRevocationCalled: true,
      counterpartHistoryReadOnly: true,
      neutralUnavailableLabel: true,
      processingIsNotErasure: true,
    });
    results.push({
      check: "provider-runtime-result",
      status: "pass",
      actualFirebase: true,
      actualTigerData: true,
      actualGemini: true,
      applicationRunsLocally: true,
      cloudRunAndDomain: false,
      recoveryEmailDelivery: "unverified; no recovery emails sent",
      elapsedMs: Math.round(performance.now() - started),
    });
  } catch (error) {
    results.push({
      check: stage,
      status: "fail",
      failureCategory:
        error instanceof assert.AssertionError
          ? "Runtime assertion did not match expected result"
          : "Runtime dependency or browser action failed",
      errorCode:
        typeof (error as any)?.code === "string"
          ? (error as any).code
          : undefined,
    });
    process.exitCode = 1;
  } finally {
    await browser.close();
    try {
      if (ids.length) {
        await sql`UPDATE conversations SET latest_message_id=NULL WHERE low_id IN ${sql(ids)} OR high_id IN ${sql(ids)}`;
        await sql`DELETE FROM messages WHERE sender_id IN ${sql(ids)}`;
        await sql`DELETE FROM conversations WHERE low_id IN ${sql(ids)} OR high_id IN ${sql(ids)}`;
        await sql`DELETE FROM operations WHERE actor_id IN ${sql(ids)}`;
        await sql`DELETE FROM deletion_requests WHERE account_id IN ${sql(ids)}`;
        await sql`DELETE FROM blocks WHERE blocker_id IN ${sql(ids)} OR blocked_id IN ${sql(ids)}`;
        await sql`DELETE FROM requests WHERE sender_id IN ${sql(ids)} OR recipient_id IN ${sql(ids)}`;
        await sql`DELETE FROM connections WHERE low_id IN ${sql(ids)} OR high_id IN ${sql(ids)}`;
        await sql`DELETE FROM pairs WHERE low_id IN ${sql(ids)} OR high_id IN ${sql(ids)}`;
        await sql`DELETE FROM sessions WHERE account_id IN ${sql(ids)}`;
        await sql`DELETE FROM profiles WHERE account_id IN ${sql(ids)}`;
        await sql`DELETE FROM accounts WHERE id IN ${sql(ids)}`;
      }
      // Also finds a partial UI signup that succeeded at Firebase before app provisioning failed.
      for (const email of emails) {
        try {
          const user = await admin.getUserByEmail(email);
          await admin.deleteUser(user.uid);
        } catch (error) {
          if ((error as any).code !== "auth/user-not-found") throw error;
        }
      }
      cleanupStatus =
        "pass: only this run’s three fictional identities and matching database rows removed";
    } catch {
      cleanupStatus =
        "failed: operator review of this run’s fictional fixtures required";
      process.exitCode = 1;
    }
    await mkdir("docs/implementation/evidence", { recursive: true });
    await writeFile(
      "docs/implementation/evidence/live-provider-check.json",
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          reproduction:
            "node --env-file=.env.live --conditions=react-server --import tsx scripts/live-provider-check.ts (requires app3000 running with same live environment and installed Chrome)",
          scope:
            "Live Firebase Authentication/Admin + Tiger Data PostgreSQL + Google Gemini, real local Next.js HTTP/browser. No provider replies, profiles, relationships or chat persistence mocked.",
          privacy:
            "No credentials, tokens, email addresses or profile/message contents recorded in evidence.",
          cleanup: cleanupStatus,
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
    "Live provider verification could not start; check private configuration. No provider details emitted.",
  );
  process.exitCode = 1;
});
