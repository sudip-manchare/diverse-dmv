import { chromium } from "playwright";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const base = "http://127.0.0.1:3000",
  out = "docs/implementation/evidence/keyboard-journey.json";
const headers = {
  origin: base,
  "x-csrf-protection": "1",
  "content-type": "application/json",
};
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const a = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    timezoneId: "America/New_York",
  }),
  b = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    timezoneId: "America/New_York",
  }),
  pa = await a.newPage(),
  pb = await b.newPage(),
  results = [],
  actions = [];
pa.setDefaultTimeout(30000);
pa.setDefaultNavigationTimeout(30000);
pb.setDefaultTimeout(30000);
pb.setDefaultNavigationTimeout(30000);
const suffix = randomUUID(),
  email = `keyboard-${suffix}@example.test`,
  password = "FictionalDemo42!";
async function api(c, path, method = "GET", data) {
  const r = await c.request.fetch(base + path, {
    method,
    headers,
    ...(data ? { data } : {}),
  });
  assert.equal(r.status(), 200, `${method} ${path}`);
  return r.json();
}
async function recipient() {
  const r = await b.request.post(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-demo-key",
    {
      data: {
        email: `mentor-${suffix}@example.test`,
        password,
        returnSecureToken: true,
      },
    },
  );
  const auth = await r.json();
  const { account } = await api(b, "/api/session", "POST", {
    idToken: auth.idToken,
    name: "Sky Keyboard Example",
  });
  let { profile } = await api(b, "/api/me/profile");
  ({ profile } = await api(b, "/api/me/profile", "PATCH", {
    version: profile.version,
    cosmeticVersion: profile.cosmeticVersion,
    data: {
      intentions: ["mentoring"],
      skills: ["Rust", "Orbital mechanics", "Flight software"],
      hereFor:
        "Mentor Rust flight software and orbital mechanics simulation learners",
      lookingToConnectWith:
        "Beginners learning Rust aerospace simulation and orbital navigation",
      happyToHelp:
        "Rust spacecraft flight software, orbital mechanics simulation and aerospace navigation",
      mentoringTopics:
        "Rust aerospace software and orbital navigation simulations",
      mentoringAvailability: "accepting",
      fictional: true,
    },
  }));
  await api(b, "/api/me/profile/publish", "POST", { version: profile.version });
  return account;
}
async function tabTo(page, target, label) {
  await target.waitFor({ state: "visible" });
  let tabs = 0;
  while (!(await target.evaluate((e) => document.activeElement === e))) {
    assert.ok(tabs < 160, `Tab traversal cannot reach ${label}`);
    await page.keyboard.press("Tab");
    tabs++;
  }
  await page.waitForTimeout(100);
  const focus = await target.evaluate((e) => {
    const c = getComputedStyle(e),
      r = e.getBoundingClientRect();
    return {
      outlineStyle: c.outlineStyle,
      outlineWidth: c.outlineWidth,
      outlineColor: c.outlineColor,
      visible:
        r.width > 0 &&
        r.height > 0 &&
        (e.tagName === "TEXTAREA"
          ? Math.min(r.bottom, innerHeight) - Math.max(r.top, 0) >= 44
          : r.top >= -1 && r.bottom <= innerHeight + 1),
      fullyVisible: r.top >= -1 && r.bottom <= innerHeight + 1,
      focusScrollNote:
        e.tagName === "TEXTAREA"
          ? "Native textarea focus scrolls its first-line caret into view; require44 visible pixels, not entire multiline field."
          : "Require whole action/control, allowing1px fractional scroll rounding.",
      tag: e.tagName.toLowerCase(),
      top: r.top,
      bottom: r.bottom,
      viewportHeight: innerHeight,
    };
  });
  assert.notEqual(focus.outlineStyle, "none", `No visible outline: ${label}`);
  assert.ok(
    parseFloat(focus.outlineWidth) >= 2,
    `Insufficient focus outline: ${label}`,
  );
  assert.ok(
    focus.visible,
    `Focused control obscured: ${label} (${JSON.stringify(focus)})`,
  );
  actions.push({
    actor: page === pa ? "A" : "B",
    target: label,
    tabs,
    ...focus,
  });
}
async function activate(page, target, label, key = "Enter") {
  await tabTo(page, target, label);
  await page.keyboard.press(key);
}
async function type(page, target, label, value) {
  await tabTo(page, target, label);
  await page.keyboard.type(value);
}
try {
  const B = await recipient();
  await pb.goto(base + "/dashboard", { waitUntil: "networkidle" });
  await pa.goto(base, { waitUntil: "networkidle" });
  await activate(
    pa,
    pa.getByRole("link", { name: /^Join community/ }).first(),
    "Landing Join community",
  );
  await pa.waitForURL("**/signup");
  await type(
    pa,
    pa.getByLabel("Name", { exact: true }),
    "Signup name",
    "Robin Keyboard Example",
  );
  await type(
    pa,
    pa.getByLabel("Email", { exact: true }),
    "Signup email",
    email,
  );
  await type(
    pa,
    pa.getByLabel("Password", { exact: true }),
    "Signup password",
    password,
  );
  await activate(
    pa,
    pa.getByRole("button", { name: "Create account", exact: true }),
    "Create account",
  );
  await pa.waitForURL("**/dashboard");
  results.push({ stage: "landing-signup-dashboard", pass: true });
  await activate(
    pa,
    pa.getByRole("link", { name: "Complete profile", exact: true }),
    "Complete profile",
  );
  await pa.waitForURL("**/profile/setup");
  await activate(
    pa,
    pa.getByLabel("Networking / exploring", { exact: true }),
    "Networking intention",
    "Space",
  );
  await type(
    pa,
    pa.getByLabel("Here for", { exact: true }),
    "Here for",
    "Learn Rust flight software for orbital mechanics simulations",
  );
  await type(
    pa,
    pa.getByLabel("Looking to connect with", { exact: true }),
    "Looking to connect with",
    "Mentors offering Rust aerospace simulation and orbital navigation",
  );
  await type(
    pa,
    pa.getByLabel("Skills or interests", { exact: true }),
    "Skills or interests",
    "Rust, Orbital mechanics",
  );
  await activate(
    pa,
    pa.getByRole("button", { name: "Save and preview", exact: true }),
    "Save and preview",
  );
  await pa
    .getByRole("heading", { name: "Preview your profile", exact: true })
    .waitFor();
  await tabTo(
    pa,
    pa.getByLabel("View as", { exact: true }),
    "Preview audience",
  );
  await pa.keyboard.press("c");
  await pa.keyboard.press("Tab");
  assert.equal(
    await pa.getByLabel("View as", { exact: true }).inputValue(),
    "connection",
  );
  await activate(
    pa,
    pa.getByRole("button", { name: "Publish profile", exact: true }),
    "Publish profile",
  );
  await pa.waitForURL("**/profile");
  results.push({ stage: "profile-setup-preview-publication", pass: true });
  await activate(
    pa,
    pa.getByRole("link", { name: "Go to dashboard", exact: true }),
    "Go to dashboard",
  );
  await pa.waitForURL("**/dashboard");
  await activate(
    pa,
    pa.getByRole("link", { name: "See all in Connections", exact: true }),
    "Discover navigation",
  );
  await pa.waitForURL("**/connections/discover");
  const candidate = pa
    .locator(".boat-grid > li")
    .filter({ has: pa.locator(`a[href="/members/${B.id}"]`) });
  for (let attempt = 0; attempt < 5 && !(await candidate.count()); attempt++) {
    await pa.waitForTimeout(1500);
    if (await candidate.count()) break;
    await activate(
      pa,
      pa.getByRole("button", { name: /Refresh people/ }),
      "Refresh people after matching preparation",
    );
  }
  await candidate.waitFor({ state: "visible", timeout: 15000 });
  await activate(
    pa,
    candidate.getByRole("button", {
      name: "Connect with Sky Keyboard Example",
      exact: true,
    }),
    "Connect with recommended member",
  );
  await pa.getByRole("dialog").waitFor();
  await type(
    pa,
    pa.getByLabel("Introduction (optional)", { exact: true }),
    "Request introduction",
    "Fictional keyboard journey: may I ask about Rust flight software?",
  );
  await activate(
    pa,
    pa.getByRole("button", { name: "Send request", exact: true }),
    "Send request",
  );
  await pa.getByRole("dialog").waitFor({ state: "hidden" });
  results.push({
    stage: "real-vector-discovery-request",
    pass: true,
    description:
      "Prepared fictional mentor was retrieved by genuine shared recommendation service; request sent through keyboard-operated dialog.",
  });
  await activate(
    pb,
    pb.getByRole("link", { name: "Connections", exact: true }),
    "B Connections",
  );
  await pb.waitForURL("**/connections/discover");
  await activate(
    pb,
    pb.getByRole("link", { name: "Requests", exact: true }),
    "B Requests",
  );
  await pb.waitForURL("**/connections/requests");
  await activate(
    pb,
    pb.getByRole("button", { name: "Accept", exact: true }),
    "B Accept request",
  );
  await pb
    .getByText("You’re now connected with Robin Keyboard Example.", {
      exact: true,
    })
    .waitFor();
  results.push({ stage: "second-account-explicit-acceptance", pass: true });
  await activate(
    pa,
    pa.getByRole("link", { name: "My connections", exact: true }),
    "A My connections",
  );
  await pa.waitForURL("**/connections/mine");
  await activate(
    pa,
    pa.getByRole("link", { name: "Message", exact: true }),
    "Message accepted connection",
  );
  await pa.waitForURL("**/messages/new?recipient=*");
  await type(
    pa,
    pa.getByLabel("Message Sky Keyboard Example", { exact: true }),
    "First message",
    "Fictional keyboard journey message, persisted for reopened history.",
  );
  await activate(
    pa,
    pa.getByRole("button", { name: "Send message", exact: true }),
    "Send first message",
  );
  await pa.waitForURL(/\/messages\/[0-9a-f-]+$/);
  const thread = pa.url().split("/").at(-1);
  await pa
    .getByRole("list", { name: "Conversation history" })
    .getByText(
      "Fictional keyboard journey message, persisted for reopened history.",
      { exact: true },
    )
    .waitFor();
  results.push({ stage: "first-message-canonical-history", pass: true });
  await activate(
    pa,
    pa.getByRole("button", { name: "Log out", exact: true }),
    "Log out",
  );
  await pa.waitForURL(base + "/");
  await activate(
    pa,
    pa.getByRole("link", { name: "Log in", exact: true }).first(),
    "Returning Log in",
  );
  await pa.waitForURL("**/login");
  await type(pa, pa.getByLabel("Email", { exact: true }), "Login email", email);
  await type(
    pa,
    pa.getByLabel("Password", { exact: true }),
    "Login password",
    password,
  );
  await activate(
    pa,
    pa.getByRole("button", { name: "Log in", exact: true }),
    "Log in submit",
  );
  await pa.waitForURL("**/dashboard");
  await activate(
    pa,
    pa.getByRole("link", { name: "Messages", exact: true }),
    "Messages navigation",
  );
  await pa.waitForURL("**/messages");
  await activate(
    pa,
    pa.locator(`a[href="/messages/${thread}"]`),
    "Reopen saved conversation",
  );
  await pa.waitForURL(`**/messages/${thread}`);
  await pa
    .getByRole("list", { name: "Conversation history" })
    .getByText(
      "Fictional keyboard journey message, persisted for reopened history.",
      { exact: true },
    )
    .waitFor();
  await tabTo(
    pa,
    pa.getByRole("list", { name: "Conversation history" }),
    "Keyboard-scrollable reopened history",
  );
  results.push({ stage: "logout-login-reopened-history", pass: true });
  results.push({
    check: "K01-full-keyboard-journey",
    pass: true,
    description:
      "One uninterrupted primary-account browser journey. Navigation/actions used only Tab/Enter/Space and native select type-ahead; all entered form/message text used keyboard typing. No locator focus/click/fill calls or direct route navigation after initial landing. Separate recipient prepared via API then accepted via keyboard in second browser. Every selected control checked for visible >=2px focus outline and viewport visibility.",
  });
} catch (e) {
  results.push({
    check: "keyboard-journey-aborted",
    pass: false,
    error: String(e),
  });
  throw e;
} finally {
  await writeFile(
    out,
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        browser: await browser.version(),
        viewport: { width: 1440, height: 900 },
        environment:
          "Local Next.js/Firebase Authentication emulator/PostgreSQL; live Gemini; fictional accounts.",
        results,
        actions,
        notClaimed: [
          "Screen-reader journey",
          "Native mobile software keyboard",
        ],
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(results));
  await browser.close();
}
