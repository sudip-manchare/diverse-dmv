import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const context = await browser.newContext({
    viewport: { width: 360, height: 800 },
    reducedMotion: "reduce",
  }),
  page = await context.newPage();
const base = "http://127.0.0.1:3000",
  email = `draft-${randomUUID()}@example.test`,
  password = "FictionalDemo42!",
  results = [];
const headers = {
  origin: base,
  "x-csrf-protection": "1",
  "content-type": "application/json",
};
async function authCall(action, data) {
  const r = await context.request.post(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:${action}?key=fake-demo-key`,
    { data },
  );
  assert.equal(r.status(), 200);
  return r.json();
}
try {
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto(base);
  await page
    .getByRole("button", { name: "Explore the DMV community — join or log in" })
    .focus();
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Tab");
  assert.ok(
    await page
      .getByRole("dialog")
      .evaluate((d) => d.contains(document.activeElement)),
  );
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await page
    .getByRole("button", { name: "Load office map", exact: true })
    .click();
  await page
    .getByText(
      "The office map is unavailable right now. You can still join the community.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    requests.some((u) => u.includes("maps.googleapis.com")),
    false,
  );
  await page
    .getByRole("link", { name: /Join community/ })
    .first()
    .click();
  await page.waitForURL("**/signup");
  results.push({
    check: "keyboard-hero-sdk-unavailable",
    pass: true,
    description:
      "Keyboard opens/traps/closes hero dialog. Disabled office provider shows honest fallback without loading SDK, and Join remains usable.",
  });
  const user = await authCall("signUp", {
    email,
    password,
    returnSecureToken: true,
  });
  const session = await context.request.post(base + "/api/session", {
    headers,
    data: { idToken: user.idToken, name: "Draft Example" },
  });
  assert.equal(session.status(), 200);
  await page.goto(base);
  await page.getByRole("button", { name: "Open your DMV dashboard" }).click();
  await page.waitForURL("**/dashboard");
  results.push({
    check: "signed-in-hero",
    pass: true,
    description:
      "Server-confirmed active account activates hero directly to Dashboard.",
  });
  await page.goto(base + "/profile/edit");
  await page
    .getByRole("button", { name: "Preview profile", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Publish profile", exact: true })
    .click();
  await page
    .getByText("Check the highlighted fields.", { exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Display name", { exact: true }).inputValue(),
    "Draft Example",
  );
  results.push({
    check: "publication-errors",
    pass: true,
    description:
      "Incomplete saved preview cannot publish; field-linked error summary retains name and safe values.",
  });
  await page
    .getByLabel("Here for", { exact: true })
    .fill("Unsaved fictional same-account draft");
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page.getByRole("dialog", { name: "Leave without saving?" }).waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "Keep editing", exact: true })
      .evaluate((e) => e === document.activeElement),
    true,
  );
  await page.keyboard.press("Escape");
  await context.request.delete(base + "/api/session", { headers });
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await page.getByRole("link", { name: "Log in", exact: true }).click();
  await page.waitForURL("**/login?*");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL("**/profile/edit");
  await page
    .getByRole("button", { name: "Restore unsaved changes", exact: true })
    .click();
  assert.equal(
    await page.getByLabel("Here for", { exact: true }).inputValue(),
    "Unsaved fictional same-account draft",
  );
  const storage = await page.evaluate(() => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
  }));
  assert.deepEqual(storage, { local: [], session: [] });
  results.push({
    check: "draft-expiry-recovery",
    pass: true,
    description:
      "Dirty navigation safe focus/Escape; real revoked session, same-tab login and explicit Restore recover actor-bound unsaved text. No local/session storage entries.",
  });
  // Leave via explicit discard before testing recovery.
  await page.getByRole("link", { name: "Dashboard", exact: true }).click();
  await page
    .getByRole("button", { name: "Leave without saving", exact: true })
    .click();
  await page.waitForURL("**/dashboard");
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  results.push({
    check: "setup-state-axe",
    violations: axe.violations.map((v) => ({
      id: v.id,
      targets: v.nodes.map((n) => n.target),
    })),
  });
  await page.goto(base + "/recover");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Check your email", exact: true })
    .waitFor();
  const codesResponse = await context.request.get(
    "http://127.0.0.1:9099/emulator/v1/projects/demo-diverse-dmv/oobCodes",
  );
  const codes = await codesResponse.json();
  const code = codes.oobCodes.find(
    (x) => x.email === email && x.requestType === "PASSWORD_RESET",
  );
  assert.ok(code);
  await authCall("resetPassword", {
    oobCode: code.oobCode,
    newPassword: "FictionalChanged42!",
  });
  await authCall("signInWithPassword", {
    email,
    password: "FictionalChanged42!",
    returnSecureToken: true,
  });
  await page
    .getByRole("button", { name: "Send another link", exact: true })
    .click();
  await page
    .getByLabel("Email", { exact: true })
    .fill(`unknown-${randomUUID()}@example.test`);
  await page
    .getByRole("button", { name: "Send reset link", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Check your email", exact: true })
    .waitFor();
  results.push({
    check: "password-recovery-emulator",
    pass: true,
    description:
      "Recovery UI acknowledged known/unknown identically; actual emulator reset code changed credential and new password authenticated. Email delivery/provider-hosted production reset unverified.",
  });
} catch (error) {
  results.push({
    check: "state-check-aborted",
    pass: false,
    error: String(error),
  });
  throw error;
} finally {
  await writeFile(
    "docs/implementation/evidence/state-check.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
  await browser.close();
}
