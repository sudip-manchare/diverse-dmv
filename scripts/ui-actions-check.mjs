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
const a = await browser.newContext({ viewport: { width: 360, height: 800 } }),
  b = await browser.newContext({ viewport: { width: 1440, height: 900 } });
async function api(context, path, method = "GET", data) {
  const r = await context.request.fetch(base + path, {
    method,
    headers,
    ...(data ? { data } : {}),
  });
  assert.equal(r.status(), 200, `${method} ${path}: ${await r.text()}`);
  return r.json();
}
async function fixture(context, name) {
  const r = await context.request.post(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-demo-key",
    {
      data: {
        email: `ui-${randomUUID()}@example.test`,
        password: "FictionalDemo42!",
        returnSecureToken: true,
      },
    },
  );
  const auth = await r.json();
  const { account } = await api(context, "/api/session", "POST", {
    idToken: auth.idToken,
    name,
  });
  let { profile } = await api(context, "/api/me/profile");
  ({ profile } = await api(context, "/api/me/profile", "PATCH", {
    version: profile.version,
    cosmeticVersion: profile.cosmeticVersion,
    data: {
      intentions: ["networking"],
      skills: ["React"],
      hereFor: "Meet frontend peers",
      lookingToConnectWith: "People learning React",
      fictional: true,
    },
  }));
  await api(context, "/api/me/profile/publish", "POST", {
    version: profile.version,
  });
  return account;
}
try {
  await fixture(a, "Alex UI Example");
  const B = await fixture(b, "Blake UI Example"),
    pa = await a.newPage(),
    pb = await b.newPage();
  await pa.goto(base + `/members/${B.id}`);
  await pa
    .getByRole("button", { name: "Connect with Blake UI Example" })
    .focus();
  await pa.keyboard.press("Enter");
  await pa.getByLabel("Introduction (optional)").fill("Fictional UI request");
  await pa.getByRole("button", { name: "Send request", exact: true }).focus();
  await pa.keyboard.press("Enter");
  await pa.getByText("Request pending", { exact: true }).waitFor();
  await pa.reload();
  await pa.getByText("Request pending", { exact: true }).waitFor();
  await pb.goto(base + "/connections/requests");
  await pb.getByRole("button", { name: "Accept", exact: true }).focus();
  await pb.keyboard.press("Enter");
  await pb
    .getByText("You’re now connected with Alex UI Example.", { exact: true })
    .waitFor();
  await pa.goto(base + "/connections/mine");
  await pa.getByRole("link", { name: "Message", exact: true }).click();
  await pa
    .getByLabel("Message Blake UI Example", { exact: true })
    .fill("Fictional first message via UI");
  await pa.getByRole("button", { name: "Send message", exact: true }).focus();
  await pa.keyboard.press("Enter");
  await pa.waitForURL(/\/messages\/[0-9a-f-]+$/);
  const thread = pa.url().split("/").at(-1);
  await pa
    .getByRole("list", { name: "Conversation history" })
    .getByText("Fictional first message via UI", { exact: true })
    .waitFor();
  results.push({
    check: "request-accept-first-message-keyboard",
    pass: true,
    description:
      "360px sender and desktop receiver used actual request, acceptance and first-message UI; keyboard activation, refreshed pending request and canonical saved thread.",
  });
  await pa.goto(base + "/connections/mine");
  await pa
    .getByRole("button", { name: "Remove connection", exact: true })
    .click();
  await pa
    .getByRole("dialog")
    .getByRole("button", { name: "Keep connection", exact: true })
    .evaluate((e) => {
      if (e !== document.activeElement)
        throw new Error("Destructive cancel did not receive focus");
    });
  await pa.keyboard.press("Escape");
  await pa
    .getByRole("button", { name: "Remove connection", exact: true })
    .click();
  await pa
    .getByRole("dialog")
    .getByRole("button", { name: "Remove connection", exact: true })
    .click();
  await pa
    .getByRole("heading", {
      name: "Your connections will appear here.",
      exact: true,
    })
    .waitFor();
  assert.equal(
    (await api(a, `/api/conversations/${thread}/messages`)).conversation
      .canMessage,
    false,
  );
  await pa.goto(base + `/members/${B.id}`);
  await pa.getByRole("button", { name: "Block member", exact: true }).click();
  await pa
    .getByRole("dialog")
    .getByRole("button", { name: "Block member", exact: true })
    .click();
  await pa.getByText("This profile is unavailable.", { exact: true }).waitFor();
  await pa.goto(base + "/settings");
  await pa.getByRole("button", { name: /Unblock/ }).click();
  await pa
    .getByRole("dialog")
    .getByRole("button", { name: /Unblock/ })
    .click();
  await pa.getByText("You haven’t blocked anyone.", { exact: true }).waitFor();
  assert.equal(
    (await api(a, `/api/conversations/${thread}/messages`)).conversation
      .canMessage,
    false,
  );
  await pa
    .getByRole("button", { name: "Unpublish profile", exact: true })
    .click();
  await pa
    .getByRole("dialog")
    .getByRole("button", { name: "Unpublish profile", exact: true })
    .click();
  await pa
    .getByText("Profile unpublished. Only you can view it.", { exact: true })
    .waitFor();
  assert.equal((await api(a, "/api/me/profile")).profile.published, false);
  await pa
    .getByRole("button", { name: "Request account deletion", exact: true })
    .click();
  await pa
    .getByRole("dialog")
    .getByRole("button", { name: "Submit deletion request", exact: true })
    .click();
  await pa.getByText("Deletion request received.", { exact: true }).waitFor();
  results.push({
    check: "safety-settings-ui",
    pass: true,
    description:
      "Remove confirmation safe focus/Escape, actual removal/read-only history, block/unblock without reconnection, unpublish persisted from Settings, deletion request clearly receipt only.",
  });
} catch (error) {
  results.push({
    check: "ui-actions-aborted",
    pass: false,
    error: String(error),
  });
  throw error;
} finally {
  await writeFile(
    "docs/implementation/evidence/ui-actions-check.json",
    JSON.stringify(results, null, 2),
  );
  console.log(JSON.stringify(results));
  await browser.close();
}
