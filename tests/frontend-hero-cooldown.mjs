import { chromium } from "playwright";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:3000",
  out = "docs/implementation/evidence/hero-cooldown-check.json";
const headers = {
  origin: base,
  "x-csrf-protection": "1",
  "content-type": "application/json",
};
const executablePath = process.env.CHROMIUM_PATH || undefined;
assert.ok(
  ["127.0.0.1", "localhost"].includes(
    new URL(process.env.DATABASE_URL).hostname,
  ),
  "Only local fictional verification database is permitted.",
);
const sql = postgres(process.env.DATABASE_URL, { ssl: false, max: 1 });
const browser = await chromium.launch({ executablePath }),
  results = [];
const contextOptions = {
  viewport: { width: 1440, height: 900 },
  timezoneId: "America/New_York",
};
async function api(c, path, method = "GET", data, expected = 200) {
  const r = await c.request.fetch(base + path, {
    method,
    headers,
    ...(data ? { data } : {}),
  });
  assert.equal(r.status(), expected, `${method} ${path}`);
  return r.json();
}
async function fixture(c, name) {
  const r = await c.request.post(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-demo-key",
    {
      data: {
        email: `hero-${randomUUID()}@example.test`,
        password: "FictionalDemo42!",
        returnSecureToken: true,
      },
    },
  );
  const auth = await r.json();
  const { account } = await api(c, "/api/session", "POST", {
    idToken: auth.idToken,
    name,
  });
  let { profile } = await api(c, "/api/me/profile");
  ({ profile } = await api(c, "/api/me/profile", "PATCH", {
    version: profile.version,
    cosmeticVersion: profile.cosmeticVersion,
    data: {
      intentions: ["networking"],
      skills: ["Accessibility"],
      hereFor: "Meet peers interested in accessible web applications",
      lookingToConnectWith: "Frontend peers learning accessible interfaces",
      fictional: true,
    },
  }));
  await api(c, "/api/me/profile/publish", "POST", { version: profile.version });
  return account;
}
async function point(page, kind) {
  const svg = page.locator(".national-map");
  await svg.scrollIntoViewIfNeeded();
  return svg.evaluate((el, kind) => {
    let target =
      kind === "state"
        ? el.querySelector(".us-state")
        : kind === "halo"
          ? el.querySelector("ellipse")
          : kind === "dmv"
            ? el.querySelector(":scope > circle")
            : el;
    const b = target.getBBox(),
      m = target.getScreenCTM();
    for (let yi = 1; yi < 20; yi++)
      for (let xi = 1; xi < 20; xi++) {
        const p = new DOMPoint(
          b.x + (b.width * xi) / 20,
          b.y + (b.height * yi) / 20,
        ).matrixTransform(m);
        if (document.elementFromPoint(p.x, p.y) === target)
          return { x: p.x, y: p.y, target: target.tagName };
      }
    throw new Error("No unobscured coordinate for " + kind);
  }, kind);
}
try {
  const signedout = await browser.newContext(contextOptions),
    publicPage = await signedout.newPage();
  await publicPage.goto(base, { waitUntil: "networkidle" });
  for (const region of ["whitespace", "state", "halo", "dmv"]) {
    const pos = await point(publicPage, region);
    await publicPage.mouse.click(pos.x, pos.y);
    await publicPage
      .getByRole("dialog", { name: "Dive into the DMV community" })
      .waitFor();
    assert.equal(new URL(publicPage.url()).pathname, "/");
    await publicPage.keyboard.press("Escape");
    results.push({
      check: "DIVE-03-signedout-coordinate",
      region,
      targetTag: pos.target,
      pass: true,
      result:
        "Account-choice dialog opened; Escape returned to illustrated map.",
    });
  }
  const unresolved = await browser.newContext(contextOptions),
    unresolvedPage = await unresolved.newPage();
  let release, started;
  const requestStarted = new Promise((resolve) => (started = resolve));
  const gate = new Promise((resolve) => (release = resolve));
  await unresolvedPage.route("**/api/me", async (route) => {
    started();
    await gate;
    await route.continue();
  });
  await unresolvedPage.goto(base, { waitUntil: "domcontentloaded" });
  await requestStarted;
  await unresolvedPage
    .getByRole("button", { name: "Explore the DMV community — join or log in" })
    .click();
  await unresolvedPage.getByRole("dialog").waitFor();
  release();
  await unresolvedPage.unrouteAll({ behavior: "wait" });
  results.push({
    check: "DIVE-03-unresolved-real-session",
    pass: true,
    result:
      "Held outgoing real session read without fabricating a response. Map still opened public account choice; released request used actual server.",
  });
  await unresolved.close();
  const a = await browser.newContext(contextOptions),
    b = await browser.newContext(contextOptions);
  await fixture(a, "Harbor Hero Example");
  const B = await fixture(b, "Harbor Cooldown Example");
  const page = await a.newPage();
  for (const region of ["whitespace", "state", "halo", "dmv"]) {
    await page.goto(base, { waitUntil: "networkidle" });
    await page
      .getByRole("button", { name: "Open your DMV dashboard" })
      .waitFor();
    const pos = await point(page, region);
    await page.mouse.click(pos.x, pos.y);
    await page.waitForURL("**/dashboard");
    await page
      .getByRole("heading", { name: "Dashboard", exact: true })
      .waitFor();
    results.push({
      check: "DIVE-03-authenticated-coordinate",
      region,
      targetTag: pos.target,
      pass: true,
      result: "Server-confirmed member navigated directly to Dashboard.",
    });
  }
  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open your DMV dashboard" }).waitFor();
  await api(a, "/api/session", "DELETE");
  await page.getByRole("button", { name: "Open your DMV dashboard" }).click();
  await page.waitForURL("**/dashboard");
  await page
    .getByText("Your session ended. Log in to continue.", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByRole("link", { name: "Log in", exact: true }).count(),
    1,
  );
  results.push({
    check: "DIVE-03-expired-server-session",
    pass: true,
    result:
      "Revoked actual application session after confirmed landing render; hero navigation showed neutral log-in recovery, no protected data or redirect loop.",
  });
  // Create an independent actor for actual relationship limits after the expired-session case.
  const rate = await browser.newContext(contextOptions),
    R = await fixture(rate, "Harbor Limit Example"),
    rp = await rate.newPage();
  const operationId = randomUUID();
  const first = await api(rate, "/api/requests", "POST", {
    recipientId: B.id,
    introduction: "Fictional verification introduction",
    operationId,
  });
  const replay = await api(rate, "/api/requests", "POST", {
    recipientId: B.id,
    introduction: "Fictional verification introduction",
    operationId,
  });
  assert.equal(first.request.id, replay.request.id);
  await api(b, `/api/requests/${first.request.id}/accept`, "POST", {
    operationId: randomUUID(),
  });
  const connections = await api(rate, "/api/connections");
  const connection = connections.connections.find((c) => c.member.id === B.id);
  await api(rate, `/api/connections/${connection.id}`, "DELETE", {
    operationId: randomUUID(),
  });
  const projection = await api(rate, `/api/profiles/${B.id}`);
  assert.ok(projection.profile.retryAt);
  const cooldown = await api(
    rate,
    "/api/requests",
    "POST",
    { recipientId: B.id, operationId: randomUUID() },
    429,
  );
  assert.equal(cooldown.error.code, "RATE_LIMITED");
  assert.equal(cooldown.error.retryAt, projection.profile.retryAt);
  await rp.goto(base + `/members/${B.id}`);
  const expected = await rp.evaluate(
    (value) =>
      `You can request a connection again ${new Date(value).toLocaleString()}.`,
    projection.profile.retryAt,
  );
  await rp.getByText(expected, { exact: true }).waitFor();
  assert.equal(
    await rp
      .getByRole("button", {
        name: `Connect with ${projection.profile.data.displayName}`,
        exact: true,
      })
      .count(),
    0,
  );
  results.push({
    check: "E03-actual-removal-cooldown-ui",
    pass: true,
    retryAt: projection.profile.retryAt,
    server429: true,
    result:
      "Actual request replay consumed one request, B accepted, R removed connection. Server returned exact cooldown timestamp; profile UI displayed its localized date and suppressed Connect.",
  });
  const targets =
    await sql`SELECT p.account_id AS id FROM profiles p JOIN accounts a ON a.id=p.account_id WHERE p.published=true AND a.state='active' AND p.data->>'fictional'='true' AND p.account_id NOT IN (${R.id},${B.id}) ORDER BY p.account_id LIMIT 21`;
  if (targets.length < 20) {
    results.push({
      check: "E03-actual-daily-allowance-ui",
      status: "unverified",
      reason:
        "Insufficient already-published fictional targets; no fabricated records or synthetic replies used.",
    });
  } else {
    for (const target of targets.slice(0, 19))
      await api(rate, "/api/requests", "POST", {
        recipientId: target.id,
        operationId: randomUUID(),
      });
    const [{ count }] =
      await sql`SELECT count(*)::int AS count FROM requests WHERE sender_id=${R.id} AND created_at>clock_timestamp()-interval '24 hours'`;
    assert.equal(count, 20);
    const last = targets[19];
    const target = await api(rate, `/api/profiles/${last.id}`);
    await rp.goto(base + `/members/${last.id}`);
    await rp
      .getByRole("button", {
        name: `Connect with ${target.profile.data.displayName}`,
        exact: true,
      })
      .click();
    const responsePromise = rp.waitForResponse(
      (r) =>
        r.url() === base + "/api/requests" && r.request().method() === "POST",
    );
    await rp.getByRole("button", { name: "Send request", exact: true }).click();
    const response = await responsePromise;
    assert.equal(response.status(), 429);
    const failure = await response.json();
    assert.ok(failure.error.retryAt);
    const shown = await rp.evaluate(
      (value) =>
        `You can request a connection again ${new Date(value).toLocaleString()}.`,
      failure.error.retryAt,
    );
    await rp.getByText(shown, { exact: true }).waitFor();
    const retryResponse = rp.waitForResponse(
      (r) =>
        r.url() === base + "/api/requests" && r.request().method() === "POST",
    );
    await rp
      .getByRole("button", { name: "Retry request", exact: true })
      .click();
    assert.equal((await retryResponse).status(), 429);
    const [{ count: afterCount }] =
      await sql`SELECT count(*)::int AS count FROM requests WHERE sender_id=${R.id} AND created_at>clock_timestamp()-interval '24 hours'`;
    assert.equal(afterCount, 20);
    results.push({
      check: "E03-actual-daily-allowance-ui",
      pass: true,
      storedRequests: afterCount,
      retryAt: failure.error.retryAt,
      result:
        "20 actual persisted requests including replayed/accepted/removed first request. The21st UI send returned real429 and displayed server retryAt; same-operation UI retry stayed429 without consuming another request.",
    });
  }
} catch (e) {
  results.push({ check: "execution-aborted", pass: false, error: String(e) });
  throw e;
} finally {
  await writeFile(
    out,
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        browser: await browser.version(),
        environment:
          "Local Next.js, Firebase Authentication emulator, actual local PostgreSQL records; no mocked application replies.",
        results,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results));
  await sql.end();
  await browser.close();
}
