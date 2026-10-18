/** Real browser/API state verification. No recommendation response interception.
 * Run against disposable local DB + Firebase emulator only:
 * node --env-file=.env --env-file=.env.local --conditions=react-server --import tsx scripts/discovery-state-check.mjs
 * Creates/cleans its own fictional accounts. Starts an isolated temporary Next
 * dev instance with Gemini keys blank to exercise cache/outage boundaries.
 */
import { chromium } from "playwright";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { writeFile, mkdtemp, cp, symlink, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import assert from "node:assert/strict";
import { queryVector, queryDocument } from "../src/server/embeddings.ts";
import { getSql } from "../src/server/db.ts";
if (!process.env.DATABASE_URL || !process.env.FIREBASE_AUTH_EMULATOR_HOST)
  throw new Error("Disposable local DB and Firebase emulator are required.");
const base = process.env.STATE_CHECK_ORIGIN || "http://127.0.0.1:3000";
const failureBase = "http://127.0.0.1:3001";
const out = "docs/implementation/evidence";
const results = [];
const fixtureIds = [];
const identities = [];
const sql = postgres(process.env.DATABASE_URL, {
  ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
  max: 2,
});
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const candidateContext = await browser.newContext();
const page = await context.newPage();
let child;
let temporary;
const headers = (origin) => ({
  origin,
  "x-csrf-protection": "1",
  "content-type": "application/json",
});
async function api(ctx, path, method = "GET", data, origin = base) {
  const response = await ctx.request.fetch(origin + path, {
    method,
    headers: headers(origin),
    ...(data ? { data } : {}),
  });
  assert.equal(response.status(), 200, `${path}: ${response.status()}`);
  return response.json();
}
async function fixture(ctx, name) {
  const response = await ctx.request.post(
    `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-demo-key`,
    {
      data: {
        email: `discovery-state-${randomUUID()}@example.test`,
        password: "FictionalDemo42!",
        returnSecureToken: true,
      },
    },
  );
  assert.equal(response.status(), 200);
  const user = await response.json();
  identities.push(user.idToken);
  const { account } = await api(ctx, "/api/session", "POST", {
    idToken: user.idToken,
    name,
  });
  fixtureIds.push(account.id);
  return account;
}
async function complete(ctx, details) {
  let { profile } = await api(ctx, "/api/me/profile");
  ({ profile } = await api(ctx, "/api/me/profile", "PATCH", {
    version: profile.version,
    cosmeticVersion: profile.cosmeticVersion,
    data: {
      intentions: ["networking"],
      skills: ["Accessibility", "React"],
      hereFor: "Fictional learning accessible React components.",
      lookingToConnectWith:
        "Frontend peers who offer accessible React guidance.",
      fictional: true,
      ...details,
    },
  }));
  return api(ctx, "/api/me/profile/publish", "POST", {
    version: profile.version,
  });
}
const surfaces = [
  ["dashboard", "/dashboard"],
  ["discover", "/connections/discover"],
];
async function checkState(
  label,
  expected,
  { origin = base, expectedHttp = 200, description } = {},
) {
  const observations = [];
  for (const [surface, path] of surfaces) {
    const responsePromise = page.waitForResponse(
      (r) =>
        new URL(r.url()).origin === origin &&
        new URL(r.url()).pathname === "/api/recommendations" &&
        r.request().method() === "GET",
    );
    await page.goto(origin + path);
    let response = await responsePromise;
    let body = await response.json();
    for (
      let retry = 0;
      retry < 30 &&
      body.status === "indexing" &&
      (expected.startsWith("ready") || expected === "dependencyunavailable");
      retry++
    ) {
      await page.waitForTimeout(400);
      const refreshed = page.waitForResponse(
        (r) =>
          new URL(r.url()).origin === origin &&
          new URL(r.url()).pathname === "/api/recommendations",
      );
      await page.getByRole("button", { name: /Refresh people/ }).click();
      response = await refreshed;
      body = await response.json();
    }
    assert.equal(response.status(), expectedHttp);
    if (expected === "setup_required") {
      assert.equal(body.status, "setup_required");
      await page
        .getByRole("heading", {
          name: "Tell us who you’d like to meet.",
          exact: true,
        })
        .waitFor();
    }
    if (expected === "indexing") {
      assert.equal(body.status, "indexing");
      await page
        .getByText("Your matching information is still being prepared.", {
          exact: true,
        })
        .waitFor();
    }
    if (expected === "readyempty") {
      assert.equal(body.status, "ready");
      assert.equal(body.profiles.length, 0);
      await page
        .getByRole("heading", {
          name: "No people to show right now.",
          exact: true,
        })
        .waitFor();
    }
    if (expected === "readypopulated") {
      assert.equal(body.status, "ready");
      assert.ok(body.profiles.length > 0);
      await page.locator(".boat-profile").first().waitFor();
      assert.equal(
        await page.locator(".boat-profile").count(),
        body.profiles.length,
      );
      for (const member of body.profiles) {
        await page
          .locator(`.boat-profile:has(a[href="/members/${member.id}"])`)
          .getByRole("heading", { name: member.data.displayName, exact: true })
          .waitFor();
      }
      assert.equal(
        await page
          .locator('.boat-profile .boat-hull[aria-hidden="true"]')
          .count(),
        body.profiles.length,
      );
    }
    if (expected === "dependencyunavailable") {
      assert.equal(body.error.code, "DEPENDENCY_UNAVAILABLE");
      await page
        .getByText("Recommendations are unavailable right now.", {
          exact: true,
        })
        .waitFor();
      assert.equal(
        await page
          .getByRole("button", { name: "Retry recommendations", exact: true })
          .isEnabled(),
        true,
      );
    }
    const boats = await page.locator(".boat-profile").count();
    if (expected !== "readypopulated") assert.equal(boats, 0);
    await page.screenshot({
      path: `${out}/discovery-${label}-${surface}.png`,
      fullPage: true,
    });
    observations.push({
      surface,
      path,
      http: response.status(),
      apiState: body.status ?? body.error?.code,
      loadedProfileCount: body.profiles?.length ?? 0,
      renderedBoatCount: boats,
      profileIds: body.profiles?.map((p) => p.id) ?? [],
      hasLiteralConnect: boats
        ? await page
            .locator(".boat-profile")
            .getByRole("button", { name: /^Connect with / })
            .count()
        : 0,
    });
  }
  if (expected === "readypopulated")
    assert.deepEqual(
      observations[0].profileIds,
      observations[1].profileIds,
      "Dashboard and Discover must use identical current shared results",
    );
  results.push({ check: label, status: "pass", description, observations });
  return observations;
}
try {
  await mkdir(out, { recursive: true });
  const actor = await fixture(context, "Fictional State Reviewer");
  await checkState("setup-required", "setup_required", {
    description:
      "Actual unpublished/incomplete authenticated profile. Both surfaces offer setup; no example boats.",
  });
  await fixture(candidateContext, "Fictional State Mentor");
  await complete(candidateContext, {
    intentions: ["mentoring", "networking"],
    mentoringAvailability: "accepting",
    mentoringTopics: "Accessible React and TypeScript components",
    happyToHelp: "React accessibility",
  });
  await complete(context, {});
  await checkState("ready-populated", "readypopulated", {
    description:
      "Actual stored Gemini candidate embeddings and shared SQL retrieval. Boat count/names exactly match authorized API results; boat/fish decoration hidden from accessibility tree.",
  });
  // Give only this actor blocks on all currently eligible candidates; no candidate data changes.
  for (let pass = 0; pass < 10; pass++) {
    const data = await api(context, "/api/recommendations");
    if (!data.profiles.length) break;
    for (const member of data.profiles) {
      await api(context, "/api/blocks", "POST", {
        blockedId: member.id,
        operationId: randomUUID(),
      });
    }
  }
  await checkState("ready-empty", "readyempty", {
    description:
      "Real authoritative actor-specific blocks remove all eligible candidates; server returns ready with zero results, with explicit empty guidance and no decorative example profiles.",
  });
  await sql`DELETE FROM blocks WHERE blocker_id=${actor.id}`;
  await checkState("restored-populated", "readypopulated", {
    description:
      "Removing this disposable actor’s test blocks restores actual eligible results on both surfaces.",
  });
  // Candidate indexing is separate from owner query readiness. Preserve that distinction.
  await sql.begin(async (tx) => {
    await tx`SELECT id FROM accounts WHERE id=${actor.id} FOR UPDATE`;
    const [p] =
      await tx`UPDATE profiles SET version=version+1,indexing_status='pending' WHERE account_id=${actor.id} RETURNING version`;
    await tx`INSERT INTO embedding_jobs(account_id,source_version,next_attempt_at) VALUES(${actor.id},${p.version},now()+interval '5 minutes')`;
  });
  await checkState("candidate-pending-query-cached", "readypopulated", {
    description:
      "Own candidate representation is genuinely queued/pending. Existing current input-bound query cache still retrieves real candidates; candidate indexing is not falsely treated as query pending.",
  });
  // Hold an actual query provider call briefly; overlapping browser requests observe its durable lease.
  await sql`DELETE FROM query_embeddings WHERE account_id=${actor.id}`;
  const [actorSource] =
    await sql`SELECT data FROM profiles WHERE account_id=${actor.id}`;
  const realFetch = globalThis.fetch;
  let releaseQuery, notifyQuery;
  const queryStarted = new Promise((resolve) => {
    notifyQuery = resolve;
  });
  const releaseGate = new Promise((resolve) => {
    releaseQuery = resolve;
  });
  let intercepted = false;
  globalThis.fetch = async (input, init) => {
    if (!intercepted && String(input).includes(":embedContent")) {
      intercepted = true;
      notifyQuery();
      await releaseGate;
    }
    return realFetch(input, init);
  };
  const generation = queryVector(actor.id, queryDocument(actorSource.data));
  try {
    await queryStarted;
    await checkState("query-indexing", "indexing", {
      description:
        "A real uncached query-generation request owns the durable actor/input lease and is awaiting actual Gemini. Overlapping Dashboard/Discover requests truthfully show indexing, not empty or invented boats.",
    });
    releaseQuery();
    assert.ok(await generation);
  } finally {
    releaseQuery();
    globalThis.fetch = realFetch;
  }
  await checkState("query-indexing-complete", "readypopulated", {
    description:
      "The original awaited real Gemini query completed and released its lease. Both surfaces now render authorized actual vector results.",
  });

  // Independent fault instance. No .env/.env.local changes and no shared-server shutdown.
  temporary = await mkdtemp(join(tmpdir(), "diverse-discovery-outage-"));
  for (const path of [
    "src",
    "public",
    "package.json",
    "tsconfig.json",
    "next.config.ts",
    "postcss.config.mjs",
  ])
    await cp(path, join(temporary, path), { recursive: true });
  await symlink(
    join(process.cwd(), "node_modules"),
    join(temporary, "node_modules"),
    "dir",
  );
  child = spawn(
    process.execPath,
    [
      join(process.cwd(), "node_modules/next/dist/bin/next"),
      "dev",
      "--webpack",
      "--hostname",
      "127.0.0.1",
      "--port",
      "3001",
    ],
    {
      cwd: temporary,
      env: {
        ...process.env,
        NODE_ENV: "development",
        APP_ORIGIN: failureBase,
        GEMINI_API_KEY: "",
        GOOGLE_API_KEY: "",
        NEXT_TELEMETRY_DISABLED: "1",
      },
      stdio: ["ignore", "ignore", "ignore"],
    },
  );
  let healthy = false;
  for (let tries = 0; tries < 80; tries++) {
    try {
      const r = await fetch(failureBase + "/api/health", {
        signal: AbortSignal.timeout(3000),
      });
      if (r.ok) {
        healthy = true;
        break;
      }
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert.ok(healthy, "Isolated missing-key instance did not become healthy");
  await checkState("provider-outage-current-cache", "readypopulated", {
    origin: failureBase,
    description:
      "Isolated same-code service has both Gemini key variables deliberately empty. Correctly keyed existing query cache continues serving actual stored vector results.",
  });
  let { profile } = await api(
    context,
    "/api/me/profile",
    "GET",
    undefined,
    failureBase,
  );
  const changed = await api(
    context,
    "/api/me/profile",
    "PATCH",
    {
      version: profile.version,
      cosmeticVersion: profile.cosmeticVersion,
      data: {
        hereFor: "Fictional changed intent for Python data pipelines.",
        lookingToConnectWith: "Data mentors for SQL and Python pipelines.",
      },
    },
    failureBase,
  );
  assert.equal(
    changed.profile.data.hereFor,
    "Fictional changed intent for Python data pipelines.",
  );
  await checkState("dependency-unavailable", "dependencyunavailable", {
    origin: failureBase,
    expectedHttp: 503,
    description:
      "Committed matching edit changes input and invalidates the old query cache. Missing provider access returns real503; saved profile remains intact, Retry is offered and no boats are fabricated.",
  });
  const beforeRetry = await api(
    context,
    "/api/me/profile",
    "GET",
    undefined,
    failureBase,
  );
  const retryResponse = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/recommendations",
  );
  await page
    .getByRole("button", { name: "Retry recommendations", exact: true })
    .click();
  assert.equal((await retryResponse).status(), 503);
  const afterRetry = await api(
    context,
    "/api/me/profile",
    "GET",
    undefined,
    failureBase,
  );
  assert.deepEqual(afterRetry.profile, beforeRetry.profile);
  results.push({
    check: "failed-provider-retry",
    status: "pass",
    description:
      "Actual Retry returns503 without changing or losing the committed profile.",
  });
} catch (error) {
  results.push({ check: "execution", status: "fail", error: String(error) });
  process.exitCode = 1;
} finally {
  if (child) {
    child.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]);
  }
  if (fixtureIds.length) {
    await sql`DELETE FROM sessions WHERE account_id IN ${sql(fixtureIds)}`;
    await sql`DELETE FROM operations WHERE actor_id IN ${sql(fixtureIds)}`;
    await sql`DELETE FROM blocks WHERE blocker_id IN ${sql(fixtureIds)} OR blocked_id IN ${sql(fixtureIds)}`;
    await sql`DELETE FROM requests WHERE sender_id IN ${sql(fixtureIds)} OR recipient_id IN ${sql(fixtureIds)}`;
    await sql`DELETE FROM connections WHERE low_id IN ${sql(fixtureIds)} OR high_id IN ${sql(fixtureIds)}`;
    await sql`DELETE FROM pairs WHERE low_id IN ${sql(fixtureIds)} OR high_id IN ${sql(fixtureIds)}`;
    await sql`DELETE FROM profiles WHERE account_id IN ${sql(fixtureIds)}`;
    await sql`DELETE FROM accounts WHERE id IN ${sql(fixtureIds)}`;
  }
  for (const idToken of identities)
    await fetch(
      `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:delete?key=fake-demo-key`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idToken }),
      },
    );
  await sql.end();
  await getSql().end();
  await browser.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
  const evidence = {
    recordedAt: new Date().toISOString(),
    environment:
      "Local Next.js + Firebase Auth emulator + isolated PostgreSQL + live Gemini; secondary missing-key instance for provider outage",
    fixtureCleanup:
      "Only this run’s two disposable accounts/identities/blocks/jobs/vectors removed; no other profile data changed",
    noResponseMocks: true,
    results,
  };
  await writeFile(
    `${out}/discovery-state-check.json`,
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence));
}
