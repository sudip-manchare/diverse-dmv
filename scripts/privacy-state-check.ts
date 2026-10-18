import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { getSql } from "../src/server/db";
import { getFirebaseAuth } from "../src/server/firebase";
import {
  candidateDocument,
  sourceHash,
  enqueueProfileIndex,
  drainEmbeddingJobs,
} from "../src/server/embeddings";
import { recommendations } from "../src/server/discovery";
async function main() {
  assert.equal(
    new URL(process.env.DATABASE_URL!).hostname,
    "127.0.0.1",
    "Only local isolated fixture database is allowed.",
  );
  assert.equal(process.env.FIREBASE_AUTH_EMULATOR_HOST, "127.0.0.1:9099");
  const sql = getSql(),
    base = "http://127.0.0.1:3000";
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
  });
  const contexts = await Promise.all(
    [1, 2, 3].map(() =>
      browser.newContext({ viewport: { width: 1440, height: 900 } }),
    ),
  );
  const ids: string[] = [],
    uids: string[] = [],
    evidence: any[] = [];
  const token = randomUUID().slice(0, 8);
  const marker = {
    seeking: `FictionalRestrictedSeeking-${token}`,
    pronouns: `FictionalPronouns-${token}`,
    identity: `FictionalIdentity-${token}`,
    affiliations: `FictionalAffiliations-${token}`,
    intro: `FictionalPrivateIntroduction-${token}`,
    message: `FictionalPrivateMessage-${token}`,
    topic: `Accessible React mentoring ${token}`,
  };
  const headers = {
    origin: base,
    "content-type": "application/json",
    "x-csrf-protection": "1",
  };
  const emails: string[] = [];
  let currentStage = "initializing";
  async function api(
    context: any,
    path: string,
    method = "GET",
    body?: unknown,
  ) {
    const res = await context.request.fetch(base + path, {
      method,
      headers,
      ...(body === undefined ? {} : { data: body }),
    });
    assert.equal(
      res.status(),
      200,
      `${method} ${path} returned ${res.status()}`,
    );
    return await res.json();
  }
  async function create(
    context: any,
    name: string,
    fields: Record<string, unknown>,
  ) {
    const email = `fictional-privacy-${randomUUID()}@example.invalid`;
    emails.push(email);
    const signup = await context.request.post(
      "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo",
      {
        data: { email, password: "FictionalOnly42!", returnSecureToken: true },
      },
    );
    assert.equal(signup.status(), 200);
    const auth = await signup.json();
    uids.push(auth.localId);
    const session = await api(context, "/api/session", "POST", {
      idToken: auth.idToken,
      name,
      phone: "+12025550123",
    });
    ids.push(session.account.id);
    const own = await api(context, "/api/me/profile");
    const saved = await api(context, "/api/me/profile", "PATCH", {
      version: own.profile.version,
      cosmeticVersion: own.profile.cosmeticVersion,
      data: {
        intentions: ["networking"],
        hereFor: "Learn accessible React frontend development",
        lookingToConnectWith: "People offering React accessibility guidance",
        skills: ["React", "accessibility"],
        fictional: true,
        ...fields,
      },
    });
    const published = await api(context, "/api/me/profile/publish", "POST", {
      version: saved.profile.version,
    });
    assert.equal(
      published.profile.indexingStatus,
      "ready",
      "Live Gemini must produce current ready embedding.",
    );
    return session.account;
  }
  function assertProjection(
    data: any,
    scope: Record<string, string>,
    connection: boolean,
  ) {
    for (const field of ["seeking", "pronouns", "identity", "affiliations"]) {
      const expected =
        scope[field] === "members" ||
        (connection && scope[field] === "connections");
      const value = field === "seeking" ? data.desiredRoles : data[field];
      assert.equal(
        value,
        expected ? marker[field as keyof typeof marker] : undefined,
        `${currentStage}: ${field} ${connection ? "connection" : "member"} projection`,
      );
      if (field === "seeking")
        assert.equal(data.intentions.includes("seeking"), expected);
    }
    const serialized = JSON.stringify(data);
    for (const email of emails) assert.equal(serialized.includes(email), false);
    assert.equal(serialized.includes("+12025550123"), false);
    for (const field of [
      "seekingVisibility",
      "pronounsVisibility",
      "identityVisibility",
      "affiliationsVisibility",
    ])
      assert.equal(data[field], undefined);
  }
  async function captureProviderInput(
    accountId: string,
    scope: Record<string, string>,
    paused: boolean,
  ) {
    const realFetch = globalThis.fetch;
    let captured: any = null;
    globalThis.fetch = async (input: any, init?: any) => {
      if (
        String(input).includes("generativelanguage.googleapis.com") &&
        init?.body
      ) {
        const body = JSON.parse(init.body);
        const text = body.content.parts[0].text;
        for (const value of [
          ...emails,
          "+12025550123",
          marker.pronouns,
          marker.identity,
          marker.affiliations,
          marker.intro,
          marker.message,
        ])
          assert.equal(
            text.includes(value),
            false,
            "Forbidden data entered real provider request.",
          );
        assert.equal(
          text.includes(marker.seeking),
          scope.seeking === "members",
        );
        assert.equal(text.includes(marker.topic), !paused);
        captured = {
          taskType: body.taskType,
          dimension: body.outputDimensionality,
          sourceHash: sourceHash(text),
          restrictedValuesAbsent: true,
          seekingIncludedOnlyIfMembers: scope.seeking === "members",
          activeMentoringIncluded: !paused,
        };
      }
      return realFetch(input, init);
    };
    try {
      await sql.begin(async (tx) => {
        await tx`SELECT id FROM accounts WHERE id=${accountId} FOR UPDATE`;
        const [p] =
          await tx`SELECT version FROM profiles WHERE account_id=${accountId} FOR UPDATE`;
        await tx`UPDATE profiles SET indexing_status='pending' WHERE account_id=${accountId}`;
        await enqueueProfileIndex(tx, accountId, p.version);
      });
      const result = await drainEmbeddingJobs(1, accountId);
      assert.equal(result.completed, 1);
      assert.ok(captured, "Real outgoing Gemini request must be observed.");
      const [stored] =
        await sql`SELECT p.version,p.data,p.indexing_status,e.source_version,e.source_hash FROM profiles p JOIN profile_embeddings e ON e.account_id=p.account_id WHERE p.account_id=${accountId}`;
      assert.equal(stored.source_version, stored.version);
      assert.equal(stored.indexing_status, "ready");
      assert.equal(stored.source_hash, captured.sourceHash);
      assert.equal(
        sourceHash(candidateDocument(stored.data)),
        captured.sourceHash,
      );
      return {
        ...captured,
        storedSourceVersion: stored.source_version,
        currentProfileVersion: stored.version,
        realProviderForwarded: true,
      };
    } finally {
      globalThis.fetch = realFetch;
    }
  }
  try {
    currentStage = "fixture publication";
    const [a, b, c] = contexts;
    const scope1 = {
      seeking: "private",
      pronouns: "connections",
      identity: "members",
      affiliations: "private",
    };
    const A = await create(a, `Fictional Privacy Alex ${token}`, {});
    const B = await create(b, `Fictional Privacy Blake ${token}`, {
      intentions: ["seeking", "mentoring", "networking"],
      hereFor: "Offer accessible frontend development guidance",
      lookingToConnectWith: "React learners",
      mentoringTopics: marker.topic,
      mentoringAvailability: "accepting",
      desiredRoles: marker.seeking,
      pronouns: marker.pronouns,
      identity: marker.identity,
      affiliations: marker.affiliations,
      seekingVisibility: scope1.seeking,
      pronounsVisibility: scope1.pronouns,
      identityVisibility: scope1.identity,
      affiliationsVisibility: scope1.affiliations,
    });
    const C = await create(c, `Fictional Privacy Casey ${token}`, {});
    // Isolate only C's results through real stored directed blocks owned by this disposable viewer.
    await sql`INSERT INTO blocks(blocker_id,blocked_id) SELECT ${C.id}::uuid,id FROM accounts WHERE id NOT IN (${B.id},${C.id}) ON CONFLICT DO NOTHING`;
    const request = await api(a, "/api/requests", "POST", {
      recipientId: B.id,
      introduction: marker.intro,
      operationId: randomUUID(),
    });
    await api(b, `/api/requests/${request.request.id}/accept`, "POST", {
      operationId: randomUUID(),
    });
    await api(a, "/api/conversations/send", "POST", {
      recipientId: B.id,
      body: marker.message,
      clientOperationId: randomUUID(),
    });
    const dashboard = await c.newPage(),
      discover = await c.newPage();
    await dashboard.goto(base + "/dashboard");
    await discover.goto(base + "/connections/discover");
    const bName = `Fictional Privacy Blake ${token}`;
    async function inspectBrowsers(paused: boolean, seekingVisible: boolean) {
      const snapshots = [];
      for (const [name, page] of [
        ["Dashboard", dashboard],
        ["Discover", discover],
      ] as const) {
        const pending = page.waitForResponse(
          (r) =>
            r.url() === base + "/api/recommendations" && r.status() === 200,
        );
        await page.getByRole("button", { name: /Refresh people/ }).click();
        const response = await pending;
        const payload = await response.json();
        const returned = payload.profiles.find((p: any) => p.id === B.id);
        assert.ok(returned);
        const card = page.locator("article.boat-profile").filter({
          has: page.getByRole("link", { name: bName, exact: true }),
        });
        await card.waitFor();
        const text = await card.innerText();
        assert.equal(text.includes("Offers mentoring in"), !paused);
        assert.equal(text.includes("Seeking opportunities"), seekingVisible);
        for (const sensitive of [
          marker.pronouns,
          marker.identity,
          marker.affiliations,
          marker.intro,
          marker.message,
          ...emails,
          "+12025550123",
        ])
          assert.equal(text.includes(sensitive), false);
        if (!seekingVisible)
          assert.equal(
            JSON.stringify(returned).includes(marker.seeking),
            false,
          );
        assert.equal(
          returned.reason.startsWith("Offers mentoring in"),
          !paused,
        );
        snapshots.push({
          surface: name,
          actualApiReady: payload.status === "ready",
          boatPresent: true,
          activeMentoringReason: !paused,
          seekingBadge: seekingVisible,
          restrictedCardTextAbsent: true,
          reason: paused
            ? "Visible skills/interests fact"
            : "Current accepting mentoring offer",
        });
      }
      return snapshots;
    }
    const stages = [
      scope1,
      {
        seeking: "members",
        pronouns: "private",
        identity: "connections",
        affiliations: "members",
      },
      {
        seeking: "connections",
        pronouns: "members",
        identity: "private",
        affiliations: "connections",
      },
    ];
    for (let i = 0; i < stages.length; i++) {
      currentStage = `audience cycle ${i + 1}`;
      const scope = stages[i];
      const paused = i === 2;
      if (i === 1) {
        const own = await api(b, "/api/me/profile");
        await api(b, "/api/me/profile", "PATCH", {
          version: own.profile.version,
          cosmeticVersion: own.profile.cosmeticVersion,
          data: {
            seekingVisibility: scope.seeking,
            pronounsVisibility: scope.pronouns,
            identityVisibility: scope.identity,
            affiliationsVisibility: scope.affiliations,
          },
        });
      }
      if (i === 2) {
        const editor = await b.newPage();
        await editor.goto(base + "/profile/edit");
        await editor
          .getByLabel("Who can see that you’re seeking opportunities?")
          .selectOption(scope.seeking);
        await editor
          .locator("summary")
          .filter({ hasText: /^Identity$/ })
          .click();
        await editor
          .getByLabel("Pronouns audience")
          .selectOption(scope.pronouns);
        await editor
          .getByLabel("Identity audience")
          .selectOption(scope.identity);
        await editor
          .getByLabel("Affiliations audience")
          .selectOption(scope.affiliations);
        await editor
          .locator("summary")
          .filter({ hasText: /^Mentoring$/ })
          .click();
        await editor
          .getByLabel("Mentoring availability")
          .selectOption("paused");
        const saved = editor.waitForResponse(
          (r) =>
            r.url() === base + "/api/me/profile" &&
            r.request().method() === "PATCH" &&
            r.status() === 200,
        );
        await editor
          .getByRole("button", { name: "Save changes", exact: true })
          .click();
        const savedBody = await (await saved).json();
        assert.equal(savedBody.profile.data.mentoringAvailability, "paused");
        assert.equal(savedBody.profile.indexingStatus, "ready");
        await editor.close();
      }
      const owner = await api(b, "/api/me/profile");
      assertProjection(owner.previews.member, scope, false);
      assertProjection(owner.previews.connection, scope, true);
      assertProjection(
        (await api(a, `/api/profiles/${B.id}`)).profile.data,
        scope,
        true,
      );
      assertProjection(
        (await api(c, `/api/profiles/${B.id}`)).profile.data,
        scope,
        false,
      );
      const provider = await captureProviderInput(B.id, scope, paused);
      const recs = await api(c, "/api/recommendations");
      const candidate = recs.profiles.find((p: any) => p.id === B.id);
      assert.ok(candidate);
      assertProjection(candidate.data, scope, false);
      for (const value of [
        marker.pronouns,
        marker.identity,
        marker.affiliations,
        marker.intro,
        marker.message,
        ...emails,
      ])
        assert.equal(candidate.reason.includes(value), false);
      const surfaces = await inspectBrowsers(
        paused,
        scope.seeking === "members",
      );
      evidence.push({
        check: `independent-scopes-${i + 1}`,
        status: "pass",
        scopes: scope,
        ownerSavedVersion: owner.profile.version,
        ownerPreviewAndDirectApiAgree: true,
        provider,
        surfaces,
        pauseSavedViaActualUi: paused,
      });
    }
    currentStage = "query input";
    await sql`DELETE FROM query_embeddings WHERE account_id=${C.id}`;
    const realFetch = globalThis.fetch;
    let queryCaptured = false;
    globalThis.fetch = async (input: any, init?: any) => {
      if (
        String(input).includes("generativelanguage.googleapis.com") &&
        init?.body
      ) {
        const body = JSON.parse(init.body);
        assert.equal(body.taskType, "RETRIEVAL_QUERY");
        const text = body.content.parts[0].text;
        for (const value of [
          ...Object.values(marker),
          ...emails,
          "+12025550123",
        ])
          assert.equal(text.includes(value), false);
        queryCaptured = true;
      }
      return realFetch(input, init);
    };
    try {
      const result = await recommendations(C.id);
      assert.equal(result.status, "ready");
      assert.ok(queryCaptured);
    } finally {
      globalThis.fetch = realFetch;
    }
    const [stillConnected] =
      await sql`SELECT active FROM connections WHERE low_id=LEAST(${A.id}::uuid,${B.id}::uuid) AND high_id=GREATEST(${A.id}::uuid,${B.id}::uuid)`;
    assert.equal(stillConnected.active, true);
    const history = await api(a, "/api/conversations");
    assert.equal(history.conversations.length, 1);
    evidence.push({
      check: "live-query-exclusions-and-existing-relationship",
      status: "pass",
      realQueryForwarded: true,
      identityContactPrivateSeekingMessagesIntrosAbsent: true,
      pausedMentoringPreservedConnectionAndConversation: true,
    });
  } catch (error) {
    evidence.push({
      check: currentStage,
      status: "fail",
      error: error instanceof Error ? error.message : "Unknown test failure",
    });
    throw error;
  } finally {
    await browser.close();
    if (ids.length) {
      await sql`UPDATE conversations SET latest_message_id=NULL WHERE low_id IN ${sql(ids)} OR high_id IN ${sql(ids)}`;
      await sql`DELETE FROM messages WHERE sender_id IN ${sql(ids)}`;
      await sql`DELETE FROM conversations WHERE low_id IN ${sql(ids)} OR high_id IN ${sql(ids)}`;
      await sql`DELETE FROM operations WHERE actor_id IN ${sql(ids)}`;
      await sql`DELETE FROM blocks WHERE blocker_id IN ${sql(ids)} OR blocked_id IN ${sql(ids)}`;
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
      "docs/implementation/evidence/privacy-state-check.json",
      JSON.stringify(
        {
          checkedAt: new Date().toISOString(),
          environment:
            "Actual local Next.js, PostgreSQL, Firebase Auth emulator and live Gemini; browser Chromium; no recommendations or provider replies mocked.",
          reproduction:
            "Set CHROMIUM_PATH to the installed Chrome executable; node --env-file=.env --env-file=.env.local --conditions=react-server --import tsx scripts/privacy-state-check.ts",
          providerCapture:
            "Dedicated harness observes outgoing payload assertions then forwards unchanged fetch to real Gemini; fixture-only current-version indexing is requeued for evidence. Evidence records hashes/booleans rather than profile/contact/message contents.",
          cleanup:
            "Only three disposable fictional accounts and their own interactions/blocks removed; other profiles unchanged.",
          results: evidence,
        },
        null,
        2,
      ) + "\n",
    );
    await sql.end();
  }
}
main().catch(() => {
  console.error("Privacy state check failed; see sanitized evidence.");
  process.exitCode = 1;
});
