import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
import postgres from "postgres";
import { applicationDefault, cert, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
const base =
  process.env.LIVE_APP_URL || process.env.APP_ORIGIN || "http://127.0.0.1:3000";
const suffix = randomUUID().slice(0, 8),
  password = `Live-Fictional-${randomUUID()}!`;
const out = "docs/implementation/evidence",
  metadataPath = `/tmp/diverse-dmv-live-browser-fixtures-${suffix}.json`;
assert.equal(
  !!process.env.FIREBASE_AUTH_EMULATOR_HOST,
  false,
  "Live browser verification must not use the auth emulator.",
);
assert.equal(
  !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL,
  false,
  "Live browser verification must not use browser auth emulator configuration.",
);
const databaseIsTiger = process.env.DATABASE_URL
  ? !["127.0.0.1", "localhost", "::1"].includes(
      new URL(process.env.DATABASE_URL).hostname,
    )
  : false;
assert.equal(
  databaseIsTiger,
  true,
  "Live verification requires the managed Tiger Data connection, supplied only in environment.",
);
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const contexts = await Promise.all(
  [0, 1, 2].map(() =>
    browser.newContext({
      viewport: { width: 1440, height: 900 },
      timezoneId: "America/New_York",
    }),
  ),
);
const pages = await Promise.all(contexts.map((c) => c.newPage()));
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });
const admin = getAuth(
  initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID,
    credential: process.env.FIREBASE_SERVICE_ACCOUNT_JSON
      ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
      : applicationDefault(),
  }),
);
let stage = "setup";
const results = [],
  fixtures = [],
  hosts = new Set(),
  network = [],
  cleanup = [];
for (const page of pages) {
  page.setDefaultTimeout(45000);
  page.setDefaultNavigationTimeout(45000);
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame())
      network.push({ navigation: new URL(frame.url()).pathname });
  });
  page.on("pageerror", (e) => network.push({ pageError: e.name }));
  page.on("response", (r) => {
    const u = new URL(r.url());
    if (u.hostname.includes("identitytoolkit") || u.pathname === "/api/session")
      network.push({ path: u.pathname, status: r.status() });
  });
  page.on("requestfailed", (r) => {
    const u = new URL(r.url());
    if (u.hostname.includes("identitytoolkit") || u.pathname === "/api/session")
      network.push({ path: u.pathname, failure: r.failure()?.errorText });
  });
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.hostname.includes("identitytoolkit") || u.port === "9099")
      hosts.add(u.hostname + (u.port ? ":" + u.port : ""));
  });
}
const names = [
  `Avery Live Fictional ${suffix}`,
  `Blake Live Fictional ${suffix}`,
  `Casey Live Fictional ${suffix}`,
];
const email = (index) => `live-browser-${suffix}-${index}@example.test`;
const headers = {
  origin: base,
  "content-type": "application/json",
  "x-csrf-protection": "1",
};
async function api(context, path, method = "GET", data, expected = 200) {
  const response = await context.request.fetch(base + path, {
    method,
    headers,
    ...(data ? { data } : {}),
  });
  assert.equal(response.status(), expected, `${method} ${path} status`);
  return response.json();
}
async function signup(index) {
  stage = `UI signup ${["A", "B", "C"][index]}`;
  const page = pages[index],
    context = contexts[index];
  fixtures.push({
    actor: ["A", "B", "C"][index],
    email: email(index),
    accountId: null,
  });
  await writeFile(
    metadataPath,
    JSON.stringify(
      {
        purpose: "Fictional live-browser cleanup metadata; no passwords/tokens",
        fixtures,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  await page.goto(base + "/signup", { waitUntil: "domcontentloaded" });
  await page.getByText(/^At least \d+ characters/).waitFor();
  await page.evaluate(() => {
    window.__formDiagnostic = [];
    document
      .querySelector("form")
      .addEventListener("submit", (e) =>
        queueMicrotask(() =>
          window.__formDiagnostic.push({ submitPrevented: e.defaultPrevented }),
        ),
      );
  });
  await page.getByLabel("Name", { exact: true }).fill(names[index]);
  await page.getByLabel("Email", { exact: true }).fill(email(index));
  await page.getByLabel("Password", { exact: true }).fill(password);
  assert.equal(
    await page.getByLabel("Name", { exact: true }).inputValue(),
    names[index],
  );
  assert.equal(
    await page.getByLabel("Email", { exact: true }).inputValue(),
    email(index),
  );
  assert.ok(
    (await page.getByLabel("Password", { exact: true }).inputValue()) ===
      password,
    "Signup password input retained its in-memory value.",
  );
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  stage = `UI signup ${["A", "B", "C"][index]} after click`;
  await page.waitForURL("**/dashboard");
  const { account, profile } = await api(context, "/api/me");
  assert.equal(account.phone, null);
  assert.equal(profile.data.linkedinUrl, "");
  assert.equal(profile.published, false);
  fixtures[index].accountId = account.id;
  await writeFile(
    metadataPath,
    JSON.stringify(
      {
        purpose:
          "Fictional live-browser verification cleanup. No passwords or tokens.",
        fixtures,
      },
      null,
      2,
    ),
    { mode: 0o600 },
  );
  await api(context, "/api/me/profile", "PATCH", {
    version: profile.version,
    cosmeticVersion: profile.cosmeticVersion,
    data: { fictional: true },
  });
  return account;
}
async function setup(index) {
  stage = `UI profile setup/publication ${["A", "B", "C"][index]}`;
  const page = pages[index];
  await page
    .getByRole("link", { name: "Complete profile", exact: true })
    .click();
  await page.getByLabel("Display name", { exact: true }).waitFor();
  await page
    .getByLabel(index === 0 ? "Networking / exploring" : "Mentoring", {
      exact: true,
    })
    .check();
  await page
    .getByLabel("Here for", { exact: true })
    .fill(
      index === 0
        ? "Learn Rust flight software for orbital mechanics simulations"
        : index === 1
          ? "Offer Rust spacecraft software and orbital mechanics mentoring"
          : "Offer Python statistics and biomedical data analysis mentoring",
    );
  await page
    .getByLabel("Looking to connect with", { exact: true })
    .fill(
      index === 0
        ? "Mentors offering Rust aerospace simulation and orbital navigation"
        : index === 1
          ? "Beginners learning Rust spacecraft software and orbital navigation"
          : "People learning Python statistics for biomedical data",
    );
  await page
    .getByLabel("Skills or interests", { exact: true })
    .fill(
      index === 2
        ? "Python, Statistics, Biomedical data"
        : "Rust, Orbital mechanics, Flight software",
    );
  if (index > 0) {
    await page
      .getByText("Mentoring", { exact: true })
      .filter({ has: page.locator("xpath=self::summary") })
      .count()
      .catch(() => 0);
    await page
      .locator("summary")
      .filter({ hasText: /^Mentoring$/ })
      .click();
    await page
      .getByLabel("Help topics (optional)", { exact: true })
      .fill(
        index === 1
          ? "Rust spacecraft simulation, aerospace navigation and orbital mechanics"
          : "Python biomedical statistics",
      );
    await page
      .getByLabel("Mentoring availability", { exact: true })
      .selectOption("accepting");
  }
  await page
    .getByRole("button", { name: "Save and preview", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Preview your profile", exact: true })
    .waitFor();
  await page.getByLabel("View as", { exact: true }).selectOption("member");
  assert.equal(
    await page.getByText("Fictional demo profile", { exact: true }).count(),
    1,
  );
  await page.getByLabel("View as", { exact: true }).selectOption("connection");
  await page
    .getByRole("button", { name: "Publish profile", exact: true })
    .click();
  await page.waitForURL("**/profile");
  const own = await api(contexts[index], "/api/me/profile");
  assert.equal(own.profile.published, true);
  assert.equal(own.profile.data.fictional, true);
  return own.profile;
}
try {
  await mkdir(out, { recursive: true });
  const accounts = [];
  for (let i = 0; i < 3; i++) {
    accounts.push(await signup(i));
    const profile = await setup(i);
    results.push({
      check: "live-ui-signup-profile-publication",
      actor: ["A", "B", "C"][i],
      pass: true,
      optionalPhoneLinkedInSkipped: true,
      fictional: true,
      sourceVersion: profile.version,
      indexingStatus: profile.indexingStatus,
      description:
        "Real Firebase UI signup, server session, UI profile setup, both saved audience previews, explicit Publish profile.",
    });
  }
  const [a, , c] = contexts,
    [pa, pb] = pages,
    [, B] = accounts;
  await pa.getByRole("link", { name: "Go to dashboard", exact: true }).click();
  await pa.waitForURL("**/dashboard");
  await pa
    .getByRole("link", { name: "See all in Connections", exact: true })
    .click();
  await pa.waitForURL("**/connections/discover");
  const candidate = pa
    .locator(".boat-grid > li")
    .filter({ has: pa.locator(`a[href="/members/${B.id}"]`) });
  for (let attempt = 0; attempt < 6 && !(await candidate.count()); attempt++) {
    await pa.waitForTimeout(2000);
    if (await candidate.count()) break;
    await pa.getByRole("button", { name: /Refresh people/ }).click();
  }
  await candidate.waitFor({ state: "visible", timeout: 15000 });
  const retrieved = await api(a, "/api/recommendations");
  assert.equal(retrieved.status, "ready");
  assert.ok(retrieved.profiles.some((p) => p.id === B.id));
  results.push({
    check: "live-stored-vector-discovery-ui",
    pass: true,
    description:
      "Real live Gemini/Tiger Data recommendation response included fictional member B and UI rendered their boat and literal Connect action.",
  });
  await candidate.screenshot({ path: out + "/live-recommendation-boat.png" });
  await candidate
    .getByRole("button", { name: `Connect with ${names[1]}`, exact: true })
    .click();
  await pa
    .getByLabel("Introduction (optional)", { exact: true })
    .fill(
      "Fictional live verification: I would love guidance on Rust orbital simulations.",
    );
  await pa.getByRole("button", { name: "Send request", exact: true }).click();
  await pa.getByRole("dialog").waitFor({ state: "hidden" });
  await pb.getByRole("link", { name: "Connections", exact: true }).click();
  await pb.getByRole("link", { name: "Requests", exact: true }).click();
  const incoming = pb.locator(".list-row").filter({ hasText: names[0] });
  await incoming.getByRole("button", { name: "Accept", exact: true }).click();
  await pb
    .getByText(`You’re now connected with ${names[0]}.`, { exact: true })
    .waitFor();
  await pa.getByRole("link", { name: "My connections", exact: true }).click();
  const connected = pa.locator(".list-row").filter({ hasText: names[1] });
  await connected.getByRole("link", { name: "Message", exact: true }).click();
  await pa.waitForURL("**/messages/new?recipient=*");
  const first = "Fictional live message from Avery: thanks for connecting.";
  await pa.getByLabel(`Message ${names[1]}`, { exact: true }).fill(first);
  await pa.getByRole("button", { name: "Send message", exact: true }).click();
  await pa.waitForURL(/\/messages\/[0-9a-f-]+$/);
  const thread = pa.url().split("/").at(-1);
  await pa
    .getByRole("list", { name: "Conversation history" })
    .getByText(first, { exact: true })
    .waitFor();
  await pb.getByRole("link", { name: "My connections", exact: true }).click();
  await pb
    .locator(".list-row")
    .filter({ hasText: names[0] })
    .getByRole("link", { name: "Message", exact: true })
    .click();
  await pb
    .getByRole("list", { name: "Conversation history" })
    .getByText(first, { exact: true })
    .waitFor();
  const reply =
    "Fictional live reply from Blake: happy to discuss orbital simulations.";
  await pb.getByLabel(`Message ${names[0]}`, { exact: true }).fill(reply);
  const deliveryStart = performance.now();
  await pb.getByRole("button", { name: "Send message", exact: true }).click();
  await pa
    .getByRole("list", { name: "Conversation history" })
    .getByText(reply, { exact: true })
    .waitFor({ timeout: 10000 });
  const visibleMs = Math.round(performance.now() - deliveryStart);
  assert.ok(
    visibleMs <= 5000,
    "Live incoming message exceeded the 5-second target.",
  );
  results.push({
    check: "live-ui-mutual-connection-two-way-chat",
    pass: true,
    visibleMs,
    description:
      "Persisted request and explicit acceptance through separate browsers, first-message canonical thread, two-way UI messaging stored in Tiger Data.",
  });
  await api(c, `/api/conversations/${thread}/messages`, "GET", undefined, 404);
  assert.equal(
    (await api(c, "/api/conversations")).conversations.some(
      (t) => t.id === thread,
    ),
    false,
  );
  results.push({
    check: "live-third-account-thread-denial",
    pass: true,
    description:
      "Unrelated real Firebase account C received no A/B history or conversation-list entry.",
  });
  const lost = "Fictional live retry: save once even if its response is lost.";
  await pa.route(
    "**/api/conversations/send",
    async (route) => {
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await pa.getByLabel(`Message ${names[1]}`, { exact: true }).fill(lost);
  await pa.getByRole("button", { name: "Send message", exact: true }).click();
  await pa
    .getByRole("button", { name: "Retry message", exact: true })
    .waitFor();
  assert.equal(
    await pa.getByLabel(`Message ${names[1]}`, { exact: true }).inputValue(),
    lost,
  );
  await pa.getByRole("button", { name: "Retry message", exact: true }).click();
  await pa
    .getByRole("list", { name: "Conversation history" })
    .getByText(lost, { exact: true })
    .waitFor();
  assert.equal(
    (await api(a, `/api/conversations/${thread}/messages`)).messages.filter(
      (m) => m.body === lost,
    ).length,
    1,
  );
  results.push({
    check: "live-lost-commit-response-ui-retry",
    pass: true,
    description:
      "Real server committed to Tiger Data before test dropped response; UI retained immutable snapshot and explicit same-operation retry returned exactly one persisted message. No mocked persistence or API body.",
  });
  await pa.getByRole("button", { name: "Log out", exact: true }).click();
  await pa.waitForURL(base + "/");
  await pa.getByRole("link", { name: "Log in", exact: true }).first().click();
  await pa.getByLabel("Email", { exact: true }).fill(email(0));
  await pa.getByLabel("Password", { exact: true }).fill(password);
  await pa.getByRole("button", { name: "Log in", exact: true }).click();
  await pa.waitForURL("**/dashboard");
  await pa.getByRole("link", { name: "Messages", exact: true }).click();
  await pa.locator(`a[href="/messages/${thread}"]`).click();
  await pa
    .getByRole("list", { name: "Conversation history" })
    .getByText(lost, { exact: true })
    .waitFor();
  await pa.reload();
  await pa
    .getByRole("list", { name: "Conversation history" })
    .getByText(reply, { exact: true })
    .waitFor();
  assert.equal(
    (await api(a, `/api/conversations/${thread}/messages`)).messages.length,
    3,
  );
  await pa.screenshot({
    path: out + "/live-messages-desktop.png",
    fullPage: false,
  });
  await pa.setViewportSize({ width: 360, height: 800 });
  await pa.reload({ waitUntil: "domcontentloaded" });
  await pa
    .getByRole("list", { name: "Conversation history" })
    .getByText(lost, { exact: true })
    .waitFor();
  await pa.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await pa.screenshot({
    path: out + "/live-messages-mobile.png",
    fullPage: false,
  });
  assert.equal(
    await pa.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  const axe = await new AxeBuilder({ page: pa })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  results.push({
    check: "live-ui-relogin-refreshed-history",
    pass: true,
    messageCount: 3,
    description:
      "Actual Firebase UI logout/login, Messages list reopen and browser refresh preserved same ordered two-participant history including safely retried message.",
  });
  results.push({
    check: "live-mobile-chat-accessibility",
    pass: axe.violations.length === 0,
    overflow: false,
    violations: axe.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target),
    })),
  });
  assert.ok(hosts.has("identitytoolkit.googleapis.com"));
  assert.equal(
    [...hosts].some((h) => h.includes("9099")),
    false,
  );
  results.push({
    check: "actual-live-provider-boundary",
    pass: true,
    firebaseHostObserved: "identitytoolkit.googleapis.com",
    firebaseEmulatorRequests: 0,
    managedTigerConfigured: true,
    gemini: "real",
    cloudRunDeployment: false,
  });
} catch (error) {
  results.push({
    check: "live-browser-journey-aborted",
    pass: false,
    stage,
    uiAlerts: await Promise.all(
      pages.map((page) =>
        page
          .locator('[role="alert"]')
          .allTextContents()
          .catch(() => []),
      ),
    ),
    providerHostsObserved: [...hosts],
    network,
    trace: String(error.stack)
      .split("\n")
      .filter((l) => l.includes("frontend-live-journey.mjs:")),
    formEvent: await pages[0].evaluate(() => window.__formDiagnostic),
    formState: await pages[0].evaluate(() => ({
      buttons: [...document.querySelectorAll("button")].map((b) => ({
        text: b.textContent,
        disabled: b.disabled,
      })),
      invalid: [...document.querySelectorAll(":invalid")].map((e) => ({
        id: e.id,
        reason: e.validationMessage,
      })),
      policy: document
        .querySelector("#password")
        ?.closest(".field")
        ?.querySelector(".help")?.textContent,
    })),
    locationPaths: pages.map((page) => {
      try {
        return new URL(page.url()).pathname;
      } catch {
        return "not-loaded";
      }
    }),
    error:
      error?.name === "AssertionError"
        ? String(error.message)
        : error?.name || "Unexpected runtime failure",
  });
  throw new Error("Live browser journey failed. See sanitized evidence.");
} finally {
  for (let i = 0; i < fixtures.length; i++) {
    try {
      const { profile } = await api(contexts[i], "/api/me/profile");
      if (profile.published)
        await api(contexts[i], "/api/me/profile/unpublish", "POST", {
          version: profile.version,
        });
    } catch {
      /* Scoped teardown below also covers interrupted application provisioning. */
    }
  }
  try {
    const ids = fixtures.map((f) => f.accountId).filter(Boolean);
    if (ids.length)
      await sql.begin(async (tx) => {
        await tx`UPDATE conversations SET latest_message_id=NULL WHERE low_id IN ${tx(ids)} OR high_id IN ${tx(ids)}`;
        await tx`DELETE FROM messages WHERE sender_id IN ${tx(ids)}`;
        await tx`DELETE FROM conversations WHERE low_id IN ${tx(ids)} OR high_id IN ${tx(ids)}`;
        await tx`DELETE FROM operations WHERE actor_id IN ${tx(ids)}`;
        await tx`DELETE FROM deletion_requests WHERE account_id IN ${tx(ids)}`;
        await tx`DELETE FROM blocks WHERE blocker_id IN ${tx(ids)} OR blocked_id IN ${tx(ids)}`;
        await tx`DELETE FROM requests WHERE sender_id IN ${tx(ids)} OR recipient_id IN ${tx(ids)}`;
        await tx`DELETE FROM connections WHERE low_id IN ${tx(ids)} OR high_id IN ${tx(ids)}`;
        await tx`DELETE FROM pairs WHERE low_id IN ${tx(ids)} OR high_id IN ${tx(ids)}`;
        await tx`DELETE FROM sessions WHERE account_id IN ${tx(ids)}`;
        await tx`DELETE FROM profiles WHERE account_id IN ${tx(ids)}`;
        await tx`DELETE FROM accounts WHERE id IN ${tx(ids)}`;
      });
    for (const fixture of fixtures) {
      try {
        const user = await admin.getUserByEmail(fixture.email);
        await admin.deleteUser(user.uid);
      } catch (error) {
        if (error.code !== "auth/user-not-found") throw error;
      }
    }
    cleanup.push({
      pass: true,
      scope:
        "Only this run’s attempted fictional Firebase identities and matching Tiger Data account/pair/profile/vector/session/message records removed.",
    });
  } catch {
    cleanup.push({
      pass: false,
      scope:
        "Operator cleanup required for this run’s fictional fixtures; metadata contains no credentials.",
    });
    process.exitCode = 1;
  }
  await writeFile(
    out + "/live-browser-journey.json",
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        browser: await browser.version(),
        environment:
          "Actual Firebase Authentication and Admin verification; configured Tiger Data PostgreSQL; live Gemini; localhost Next.js UI, not Cloud Run.",
        results,
        cleanup,
        fixtureMetadata: metadataPath,
      },
      null,
      2,
    ),
  );
  console.log(
    JSON.stringify({ results, cleanup, fixtureMetadata: metadataPath }),
  );
  await sql.end();
  await browser.close();
}
