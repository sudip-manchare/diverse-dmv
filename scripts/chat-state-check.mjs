import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:3000",
  headers = {
    origin: base,
    "x-csrf-protection": "1",
    "content-type": "application/json",
  },
  results = [];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const a = await browser.newContext({ viewport: { width: 1440, height: 900 } }),
  b = await browser.newContext();
async function api(ctx, path, method = "GET", data) {
  const r = await ctx.request.fetch(base + path, {
    method,
    headers,
    ...(data ? { data } : {}),
  });
  assert.equal(r.status(), 200, `${path}: ${r.status()}`);
  return r.json();
}
async function fixture(ctx, name) {
  const email = `chat-state-${randomUUID()}@example.test`,
    password = "FictionalDemo42!";
  const r = await ctx.request.post(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-demo-key",
    { data: { email, password, returnSecureToken: true } },
  );
  const user = await r.json();
  const { account } = await api(ctx, "/api/session", "POST", {
    idToken: user.idToken,
    name,
  });
  let { profile } = await api(ctx, "/api/me/profile");
  ({ profile } = await api(ctx, "/api/me/profile", "PATCH", {
    version: profile.version,
    cosmeticVersion: profile.cosmeticVersion,
    data: {
      intentions: ["networking"],
      skills: ["React"],
      hereFor: "Fictional peer learning",
      lookingToConnectWith: "React peers",
      fictional: true,
    },
  }));
  await api(ctx, "/api/me/profile/publish", "POST", {
    version: profile.version,
  });
  return { ...account, email, password };
}
async function login(page, actor) {
  await page.getByLabel("Email", { exact: true }).fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
}
try {
  const A = await fixture(a, "Alex Scroll Example"),
    B = await fixture(b, "Blake Scroll Example");
  const request = await api(a, "/api/requests", "POST", {
    recipientId: B.id,
    operationId: randomUUID(),
  });
  await api(b, `/api/requests/${request.request.id}/accept`, "POST", {
    operationId: randomUUID(),
  });
  let thread;
  for (let i = 0; i < 42; i++) {
    const r = await api(i % 2 ? a : b, "/api/conversations/send", "POST", {
      recipientId: i % 2 ? B.id : A.id,
      body: `Fictional scroll message ${i.toString().padStart(2, "0")}`,
      clientOperationId: randomUUID(),
    });
    thread = r.conversation.id;
  }
  const page = await a.newPage();
  await page.goto(base + `/messages/${thread}`);
  const history = page.getByRole("list", { name: "Conversation history" });
  await history.locator("li").first().waitFor();
  assert.equal(await history.locator("li").count(), 30);
  await page.waitForTimeout(200);
  await history.evaluate((e) => {
    e.scrollTop = 100;
  });
  const anchor = history.getByText("Fictional scroll message 13", {
    exact: true,
  });
  const oldY = (await anchor.boundingBox()).y;
  await page
    .getByRole("button", { name: "Load earlier messages", exact: true })
    .click();
  await page.waitForFunction(
    () => document.querySelectorAll(".history li").length === 42,
  );
  const newY = (await anchor.boundingBox()).y;
  assert.ok(Math.abs(newY - oldY) < 4, `Anchor shifted ${newY - oldY}`);
  await history.evaluate((e) => {
    e.scrollTop = 100;
  });
  const oldTop = await history.evaluate((e) => e.scrollTop);
  const composer = page.getByLabel("Message Blake Scroll Example", {
    exact: true,
  });
  await composer.focus();
  await api(b, "/api/conversations/send", "POST", {
    recipientId: A.id,
    body: "Fictional incoming while reading older",
    clientOperationId: randomUUID(),
  });
  await page
    .getByRole("button", { name: /new messages — Go to latest/ })
    .waitFor();
  assert.ok(
    Math.abs((await history.evaluate((e) => e.scrollTop)) - oldTop) < 4,
  );
  assert.equal(
    await composer.evaluate((e) => e === document.activeElement),
    true,
  );
  await page
    .getByRole("button", { name: /new messages — Go to latest/ })
    .click();
  assert.ok(
    await history.evaluate(
      (e) => e.scrollHeight - e.scrollTop - e.clientHeight < 4,
    ),
  );
  results.push({
    check: "history-anchor-new-message-focus",
    pass: true,
    earlierCount: 42,
    anchorShiftPixels: newY - oldY,
    description:
      "Real saved history prepended without anchor movement; incoming while reading older retained position and composer focus, with working Go to latest.",
  });
  await composer.fill("Fictional unsent actor-bound recovery");
  await api(a, "/api/session", "DELETE");
  await page
    .getByRole("heading", { name: "Log in to continue", exact: true })
    .waitFor();
  await page.getByRole("link", { name: "Log in", exact: true }).click();
  await login(page, A);
  await page.waitForURL(`**/messages/${thread}`);
  await composer.waitFor();
  assert.equal(
    await composer.inputValue(),
    "Fictional unsent actor-bound recovery",
  );
  assert.deepEqual(
    await page.evaluate(() => [
      Object.keys(localStorage),
      Object.keys(sessionStorage),
    ]),
    [[], []],
  );
  await api(a, "/api/session", "DELETE");
  await page.getByRole("link", { name: "Log in", exact: true }).waitFor();
  await page.getByRole("link", { name: "Log in", exact: true }).click();
  await login(page, B);
  await page.waitForURL(`**/messages/${thread}`);
  const switched = page.getByLabel("Message Alex Scroll Example", {
    exact: true,
  });
  await switched.waitFor();
  assert.equal(await switched.inputValue(), "");
  assert.equal(
    await page
      .getByText("Fictional unsent actor-bound recovery", { exact: true })
      .count(),
    0,
  );
  results.push({
    check: "chat-expiry-account-switch",
    pass: true,
    description:
      "Revoked session hid protected content. Same-account login recovered volatile unsent draft only after thread reauthorization; different-account login showed no prior draft and no browser storage.",
  });
  // Interrupt app provisioning after the real Firebase identity exists; next login must provision once.
  const ctx = await browser.newContext(),
    p = await ctx.newPage(),
    email = `partial-${randomUUID()}@example.test`,
    password = "FictionalDemo42!";
  await p.goto(base + "/signup");
  await p.getByLabel("Name", { exact: true }).fill("Partial Signup Example");
  await p.getByLabel("Email", { exact: true }).fill(email);
  await p.getByLabel("Password", { exact: true }).fill(password);
  await p.route("**/api/session", (r) => r.abort());
  await p.getByRole("button", { name: "Create account", exact: true }).click();
  await p
    .getByText(
      "Your account was created, but we couldn’t finish logging you in. Try again.",
      { exact: true },
    )
    .waitFor();
  await p.unroute("**/api/session");
  await p.goto(base + "/login");
  await login(p, { email, password });
  await p.waitForURL("**/dashboard");
  const before = await api(ctx, "/api/me");
  assert.equal(before.account.name, "Partial Signup Example");
  await p.getByRole("button", { name: "Log out", exact: true }).click();
  await p.waitForURL(base + "/");
  await p.goto(base + "/login");
  await login(p, { email, password });
  await p.waitForURL("**/dashboard");
  assert.equal((await api(ctx, "/api/me")).account.id, before.account.id);
  results.push({
    check: "partial-signup-recovery",
    pass: true,
    description:
      "Firebase creation succeeded while app session request was aborted; later login recovered original name and provisioned the same app account idempotently.",
  });
} catch (error) {
  results.push({
    check: "chat-state-aborted",
    pass: false,
    error: String(error),
  });
  throw error;
} finally {
  await writeFile(
    "docs/implementation/evidence/chat-state-check.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
  await browser.close();
}
