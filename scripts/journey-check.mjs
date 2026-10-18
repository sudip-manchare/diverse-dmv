import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:3000",
  out = "docs/implementation/evidence";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const evidence = [];
const suffix = Date.now();
const password = "FictionalDemo42!";
const contexts = await Promise.all(
  [0, 1, 2].map(() =>
    browser.newContext({ viewport: { width: 1440, height: 900 } }),
  ),
);
async function call(context, path, method = "GET", body, expected = 200) {
  const response = await context.request.fetch(base + path, {
    method,
    headers: {
      origin: base,
      "content-type": "application/json",
      "x-csrf-protection": "1",
    },
    ...(body === undefined ? {} : { data: body }),
  });
  const data = await response.json();
  assert.equal(
    response.status(),
    expected,
    `${method} ${path}: ${JSON.stringify(data)}`,
  );
  return data;
}
async function login(context, email) {
  const response = await context.request.post(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-demo-key",
    { data: { email, password, returnSecureToken: true } },
  );
  const auth = await response.json();
  return call(context, "/api/session", "POST", { idToken: auth.idToken });
}
async function newMember(context, name, email) {
  const response = await context.request.post(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-demo-key",
    { data: { email, password, returnSecureToken: true } },
  );
  const auth = await response.json();
  return call(context, "/api/session", "POST", { idToken: auth.idToken, name });
}
try {
  const [a, b, c] = contexts;
  const page = await a.newPage();
  const emailA = `alex-${suffix}@example.test`,
    emailB = `blake-${suffix}@example.test`,
    emailC = `casey-${suffix}@example.test`;
  await page.goto(base + "/signup");
  await page.getByLabel("Name", { exact: true }).fill("Alex Example");
  await page.getByLabel("Email", { exact: true }).fill(emailA);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await page.waitForURL("**/dashboard", { timeout: 30000 });
  const A = (await call(a, "/api/me")).account;
  evidence.push({
    check: "signup-minimal",
    pass: true,
    description:
      "UI signup skipped phone/LinkedIn, server account persisted, dashboard accessible.",
  });
  await page
    .getByRole("link", { name: "Complete profile", exact: true })
    .click();
  await page.getByLabel("Display name", { exact: true }).waitFor();
  await page.getByLabel("Networking / exploring", { exact: true }).check();
  await page
    .getByLabel("Here for", { exact: true })
    .fill("Learn accessible frontend development");
  await page
    .getByLabel("Looking to connect with", { exact: true })
    .fill("People offering React and accessibility guidance");
  await page
    .getByLabel("Skills or interests", { exact: true })
    .fill("React, accessibility");
  await page
    .getByRole("button", { name: "Save and preview", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Preview your profile", exact: true })
    .waitFor();
  await page.screenshot({
    path: `${out}/profile-preview-desktop.png`,
    fullPage: true,
  });
  await page.getByLabel("View as", { exact: true }).selectOption("connection");
  await page
    .getByRole("button", { name: "Publish profile", exact: true })
    .click();
  await page.waitForURL("**/profile", { timeout: 60000 });
  const B = (await newMember(b, "Blake Example", emailB)).account,
    C = (await newMember(c, "Casey Example", emailC)).account;
  for (const [context, fields] of [
    [a, { fictional: true }],
    [
      b,
      {
        intentions: ["mentoring", "networking", "seeking"],
        hereFor: "Offer React and accessibility feedback",
        lookingToConnectWith: "Frontend beginners seeking mentoring",
        skills: ["React", "accessibility"],
        happyToHelp: "React portfolio and accessibility feedback",
        mentoringTopics: "React and accessibility",
        mentoringAvailability: "accepting",
        pronouns: "private test pronouns",
        identity: "private test identity",
        desiredRoles: "private test job search",
        fictional: true,
      },
    ],
    [
      c,
      {
        intentions: ["mentoring", "networking"],
        hereFor: "Offer Python and data analysis guidance",
        lookingToConnectWith: "Data science learners",
        skills: ["Python", "data analysis"],
        happyToHelp: "Python and statistics",
        mentoringTopics: "Python and data analysis",
        mentoringAvailability: "accepting",
        fictional: true,
      },
    ],
  ]) {
    let { profile } = await call(context, "/api/me/profile");
    ({ profile } = await call(context, "/api/me/profile", "PATCH", {
      version: profile.version,
      cosmeticVersion: profile.cosmeticVersion,
      data: fields,
    }));
    if (!profile.published)
      await call(context, "/api/me/profile/publish", "POST", {
        version: profile.version,
      });
  }
  evidence.push({
    check: "profile-ui-publication",
    pass: true,
    description:
      "Actual UI minimal setup, saved member/connection preview and explicit publication; B/C real persisted fictional profiles.",
  });
  const member = await call(a, `/api/profiles/${B.id}`);
  const serialized = JSON.stringify(member);
  for (const secret of [
    emailB,
    "private test pronouns",
    "private test identity",
    "private test job search",
  ])
    assert.equal(serialized.includes(secret), false);
  assert.equal(member.profile.data.intentions.includes("seeking"), false);
  const initial = await call(a, "/api/recommendations");
  assert.equal(initial.status, "ready");
  assert.ok(initial.profiles.some((p) => p.id === B.id));
  await page.goto(base + "/dashboard");
  await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  await page
    .getByRole("link", { name: /Blake Example/ })
    .first()
    .waitFor();
  await page.screenshot({
    path: `${out}/dashboard-desktop.png`,
    fullPage: true,
  });
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  evidence.push({
    check: "dashboard-axe",
    violations: axe.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target),
    })),
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({
    path: `${out}/dashboard-mobile.png`,
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
    false,
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  const op = randomUUID();
  const req = await call(a, "/api/requests", "POST", {
    recipientId: B.id,
    introduction: "Fictional test: I would love React feedback.",
    operationId: op,
  });
  const repeat = await call(a, "/api/requests", "POST", {
    recipientId: B.id,
    introduction: "Fictional test: I would love React feedback.",
    operationId: op,
  });
  assert.equal(req.request.id, repeat.request.id);
  const incoming = await call(b, "/api/requests");
  assert.ok(incoming.incoming.some((r) => r.id === req.request.id));
  await call(
    c,
    `/api/requests/${req.request.id}/accept`,
    "POST",
    { operationId: randomUUID() },
    404,
  );
  await call(b, `/api/requests/${req.request.id}/accept`, "POST", {
    operationId: randomUUID(),
  });
  const mine = await call(a, "/api/connections");
  assert.ok(mine.connections.some((x) => x.member.id === B.id));
  const messageOp = randomUUID();
  const msg = await call(a, "/api/conversations/send", "POST", {
    recipientId: B.id,
    body: "Fictional test: hello from Alex.",
    clientOperationId: messageOp,
  });
  const retry = await call(a, "/api/conversations/send", "POST", {
    recipientId: B.id,
    body: "Fictional test: hello from Alex.",
    clientOperationId: messageOp,
  });
  assert.equal(msg.message.id, retry.message.id);
  await call(b, "/api/conversations/send", "POST", {
    recipientId: A.id,
    body: "Fictional test: hello from Blake.",
    clientOperationId: randomUUID(),
  });
  const thread = msg.conversation.id;
  await call(c, `/api/conversations/${thread}/messages`, "GET", undefined, 404);
  assert.equal((await call(c, "/api/conversations")).conversations.length, 0);
  let history = await call(a, `/api/conversations/${thread}/messages`);
  assert.equal(history.messages.length, 2);
  await call(a, "/api/session", "DELETE");
  await call(a, `/api/conversations/${thread}/messages`, "GET", undefined, 401);
  await login(a, emailA);
  history = await call(a, `/api/conversations/${thread}/messages`);
  assert.equal(history.messages.length, 2);
  evidence.push({
    check: "requests-and-durable-history",
    pass: true,
    description:
      "Real persisted request, retry identity, unrelated acceptance/history/list denial, mutual connection, two-way messages, same-operation retry exactly once and history after logout/login.",
  });
  await page.goto(base + `/messages/${thread}`);
  await page
    .getByRole("list", { name: "Conversation history" })
    .getByText("Fictional test: hello from Blake.", { exact: true })
    .waitFor({ timeout: 30000 });
  await page.screenshot({
    path: `${out}/messages-desktop.png`,
    fullPage: true,
  });
  await page.setViewportSize({ width: 360, height: 800 });
  await page.screenshot({ path: `${out}/messages-mobile.png`, fullPage: true });
  // Fault injection drops the response AFTER the real server commits; no persistence is mocked.
  const lostText = "Fictional retry: saved once despite a lost response.";
  await page.route(
    "**/api/conversations/send",
    async (route) => {
      await route.fetch();
      await route.abort("failed");
    },
    { times: 1 },
  );
  await page
    .getByLabel("Message Blake Example", { exact: true })
    .fill(lostText);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await page
    .getByRole("button", { name: "Retry message", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByLabel("Message Blake Example", { exact: true })
      .inputValue(),
    lostText,
  );
  await page
    .getByRole("button", { name: "Retry message", exact: true })
    .click();
  await page
    .getByRole("list", { name: "Conversation history" })
    .getByText(lostText, { exact: true })
    .waitFor();
  assert.equal(
    (await call(a, `/api/conversations/${thread}/messages`)).messages.filter(
      (m) => m.body === lostText,
    ).length,
    1,
  );
  const pageB = await b.newPage();
  await pageB.goto(base + `/messages/${thread}`);
  await pageB.getByLabel("Message Alex Example", { exact: true }).waitFor();
  const timedText = "Fictional delivery timing check.";
  const started = performance.now();
  await call(a, "/api/conversations/send", "POST", {
    recipientId: B.id,
    body: timedText,
    clientOperationId: randomUUID(),
  });
  await pageB
    .getByRole("list", { name: "Conversation history" })
    .getByText(timedText, { exact: true })
    .waitFor({ timeout: 5000 });
  const visibleMs = Math.round(performance.now() - started);
  assert.ok(visibleMs <= 5000);
  evidence.push({
    check: "uncertain-send-ui-and-delivery",
    pass: true,
    visibleMs,
    description:
      "Lost real commit response retained composer and operation; explicit UI retry produced exactly one stored message. Incoming message observed in second browser.",
  });
  const chatAxe = await new AxeBuilder({ page: pageB })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  evidence.push({
    check: "chat-axe",
    violations: chatAxe.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target),
    })),
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.waitForURL(base + "/");
  await page.goto(base + "/login");
  await page.getByLabel("Email", { exact: true }).fill(emailA);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL("**/dashboard");
  await page.goto(base + `/messages/${thread}`);
  await page
    .getByRole("list", { name: "Conversation history" })
    .getByText(lostText, { exact: true })
    .waitFor();
  evidence.push({
    check: "ui-relogin-history",
    pass: true,
    description:
      "Actual Log out and Log in UI reopened the persisted thread including retried message.",
  });
  await call(
    a,
    `/api/connections/${mine.connections.find((x) => x.member.id === B.id).id}`,
    "DELETE",
    { operationId: randomUUID() },
  );
  assert.equal(
    (await call(a, `/api/conversations/${thread}/messages`)).conversation
      .canMessage,
    false,
  );
  await call(
    a,
    "/api/conversations/send",
    "POST",
    { recipientId: B.id, body: "denied", clientOperationId: randomUUID() },
    403,
  );
  const blocked = await call(a, "/api/blocks", "POST", {
    blockedId: B.id,
    operationId: randomUUID(),
  });
  await call(b, `/api/conversations/${thread}/messages`, "GET", undefined, 404);
  await call(a, `/api/conversations/${thread}/messages`, "GET", undefined, 404);
  await call(b, `/api/profiles/${A.id}`, "GET", undefined, 404);
  await call(a, `/api/blocks/${blocked.block.id}`, "DELETE", {
    operationId: randomUUID(),
  });
  assert.equal(
    (await call(a, `/api/conversations/${thread}/messages`)).conversation
      .canMessage,
    false,
  );
  evidence.push({
    check: "remove-block-unblock",
    pass: true,
    description:
      "Removal retained read-only history and stopped sending; block hid both directions/direct profile; unblock restored history without connection.",
  });
  evidence.push({
    check: "accounts",
    ids: { A: A.id, B: B.id, C: C.id },
    emulator: true,
    localPostgres: true,
    gemini: "live",
    deployment: false,
  });
} catch (error) {
  evidence.push({
    check: "journey-aborted",
    pass: false,
    error: String(error),
  });
  throw error;
} finally {
  await writeFile(
    `${out}/journey-check.json`,
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
  await browser.close();
}
