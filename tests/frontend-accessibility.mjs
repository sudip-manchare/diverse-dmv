import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile, mkdtemp, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
const exe = process.env.CHROMIUM_PATH || undefined;
const base = "http://127.0.0.1:3000",
  out = "docs/implementation/evidence",
  findings = [];
const headers = {
  origin: base,
  "x-csrf-protection": "1",
  "content-type": "application/json",
};
async function api(c, path, method = "GET", data) {
  const r = await c.request.fetch(base + path, {
    method,
    headers,
    ...(data ? { data } : {}),
  });
  assert.equal(r.status(), 200, `${method} ${path}`);
  return r.json();
}
async function fixture(c) {
  const r = await c.request.post(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-demo-key",
    {
      data: {
        email: `accessibility-${randomUUID()}@example.test`,
        password: "FictionalDemo42!",
        returnSecureToken: true,
      },
    },
  );
  const auth = await r.json();
  await api(c, "/api/session", "POST", {
    idToken: auth.idToken,
    name: "Morgan Accessibility Example",
  });
}
const browser = await chromium.launch({ executablePath: exe });
const c = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const p = await c.newPage();
try {
  await p.goto(base, { waitUntil: "networkidle" });
  await p.keyboard.press("Tab");
  const skip = await p.evaluate(() => document.activeElement?.textContent);
  assert.equal(skip, "Skip to main content");
  await p.keyboard.press("Enter");
  const skipTarget = await p.evaluate(() => document.activeElement?.id);
  findings.push({
    check: "keyboard-skip-link",
    pass: skipTarget === "main",
    focusedTarget: skipTarget,
  });
  const map = p.getByRole("button", {
    name: "Explore the DMV community — join or log in",
  });
  await map.focus();
  await p.keyboard.press("Enter");
  await p.getByRole("dialog").waitFor();
  const dialogFocus = await p.evaluate(() => document.activeElement?.id);
  let trapped = true;
  for (let i = 0; i < 9; i++) {
    await p.keyboard.press("Tab");
    if (!(await p.evaluate(() => !!document.activeElement?.closest("dialog"))))
      trapped = false;
  }
  await p.keyboard.press("Escape");
  assert.equal(await p.getByRole("dialog").count(), 0);
  const restored = await map.evaluate((e) => document.activeElement === e);
  findings.push({
    check: "keyboard-map-dialog",
    pass: dialogFocus === "dialog-heading" && trapped && restored,
    entryFocus: dialogFocus,
    tabTrap: trapped,
    escapeRestored: restored,
  });
  const motion = await p.evaluate(() => ({
    reduce: matchMedia("(prefers-reduced-motion: reduce)").matches,
    runningAnimations: document
      .getAnimations()
      .filter((a) => a.playState === "running").length,
    transition: getComputedStyle(document.querySelector(".map-stage"))
      .transitionDuration,
  }));
  findings.push({
    check: "reduced-motion",
    pass:
      motion.reduce &&
      motion.runningAnimations === 0 &&
      motion.transition === "0s",
    ...motion,
  });
  await fixture(c);
  await p.goto(base + "/profile/edit");
  await p.getByLabel("Display name", { exact: true }).waitFor();
  await p.getByRole("button", { name: "Preview profile", exact: true }).click();
  await p.getByRole("button", { name: "Publish profile", exact: true }).click();
  await p.getByText("Check the highlighted fields.", { exact: true }).waitFor();
  const summaryFocused = await p.evaluate(
    () => !!document.activeElement?.querySelector('[role="alert"]'),
  );
  await p
    .getByRole("link", { name: "Tell us what you are here for.", exact: true })
    .focus();
  await p.keyboard.press("Enter");
  await p.waitForTimeout(60);
  const fieldFocused = await p
    .locator("#hereFor")
    .evaluate((e) => document.activeElement === e);
  findings.push({
    check: "required-error-summary-keyboard",
    pass: summaryFocused && fieldFocused,
    summaryFocused,
    fieldFocused,
  });
  await p.getByLabel("Networking / exploring", { exact: true }).check();
  await p
    .getByLabel("Here for", { exact: true })
    .fill("Learn accessible frontend development");
  await p
    .getByLabel("Looking to connect with", { exact: true })
    .fill("People offering React and accessibility guidance");
  await p
    .getByLabel("Skills or interests", { exact: true })
    .fill("React, accessibility");
  await p.getByText("Introduction", { exact: true }).click();
  await p
    .getByLabel("Headline (optional)", { exact: true })
    .fill("A".repeat(161));
  await p.getByText("Introduction", { exact: true }).click();
  await p.getByRole("button", { name: "Save changes", exact: true }).click();
  await p.getByText("Check the highlighted fields.", { exact: true }).waitFor();
  await p
    .getByRole("link", { name: "Use 160 characters or fewer.", exact: true })
    .focus();
  await p.keyboard.press("Enter");
  await p.waitForTimeout(60);
  const hiddenField = await p.locator("#headline").evaluate((e) => ({
    focused: document.activeElement === e,
    disclosureOpen: e.closest("details")?.open,
    ariaInvalid: e.getAttribute("aria-invalid"),
    describedBy: e.getAttribute("aria-describedby"),
  }));
  findings.push({
    check: "optional-error-summary-expands-field",
    pass:
      hiddenField.focused &&
      hiddenField.disclosureOpen &&
      hiddenField.ariaInvalid === "true",
    ...hiddenField,
  });
  await p
    .getByLabel("Headline (optional)", { exact: true })
    .fill("Learning accessible web development");
  await p
    .getByRole("button", { name: "Save and preview", exact: true })
    .click();
  await p
    .getByRole("heading", { name: "Preview your profile", exact: true })
    .waitFor();
  await p.getByRole("button", { name: "Publish profile", exact: true }).click();
  await p.waitForURL("**/profile");
  let own = await api(c, "/api/me/profile");
  await api(c, "/api/me/profile", "PATCH", {
    version: own.profile.version,
    cosmeticVersion: own.profile.cosmeticVersion,
    data: { fictional: true },
  });
  await p.goto(base + "/dashboard", { waitUntil: "networkidle" });
  await p.getByRole("heading", { name: "Dashboard", exact: true }).waitFor();
  await p.screenshot({
    path: out + "/dashboard-desktop-viewport.png",
    fullPage: false,
  });
  await p.setViewportSize({ width: 360, height: 800 });
  await p.screenshot({
    path: out + "/dashboard-mobile-viewport.png",
    fullPage: false,
  });
  const mobile = await p.evaluate(() => ({
    width: innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    navReachable: [...document.querySelectorAll(".main-nav a")].every(
      (e) => e.getBoundingClientRect().right <= innerWidth,
    ),
  }));
  const axe = await new AxeBuilder({ page: p })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  findings.push({
    check: "dashboard-mobile-final",
    pass:
      mobile.scrollWidth <= mobile.width &&
      mobile.navReachable &&
      axe.violations.length === 0,
    ...mobile,
    violations: axe.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      targets: v.nodes.map((n) => n.target),
    })),
  });
  const state = await c.storageState();
  for (const zoom of [1, 2]) {
    const dir = await mkdtemp("/tmp/diverse-a11y-zoom-");
    await mkdir(dir + "/Default");
    await writeFile(
      dir + "/Default/Preferences",
      JSON.stringify({
        partition: {
          default_zoom_level: { x: Math.log(zoom) / Math.log(1.2) },
        },
      }),
    );
    const zoomContext = await chromium.launchPersistentContext(dir, {
      executablePath: exe,
      headless: true,
      viewport: null,
      args: ["--window-size=1440,900"],
      reducedMotion: "reduce",
    });
    await zoomContext.addCookies(state.cookies);
    const zp = await zoomContext.newPage();
    for (const route of ["/", "/dashboard", "/profile/edit", "/messages"]) {
      await zp.goto(base + route, { waitUntil: "networkidle" });
      const metrics = await zp.evaluate(() => ({
        innerWidth,
        outerWidth,
        devicePixelRatio,
        visualScale: visualViewport.scale,
        scrollWidth: document.documentElement.scrollWidth,
        overflow: document.documentElement.scrollWidth > innerWidth,
      }));
      const cdp = await zoomContext.newCDPSession(zp);
      const lm = await cdp.send("Page.getLayoutMetrics");
      await cdp.detach();
      const az = await new AxeBuilder({ page: zp })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
        .analyze();
      findings.push({
        check: "actual-browser-zoom",
        zoom,
        route,
        pass:
          metrics.outerWidth === 1440 &&
          metrics.innerWidth === 1440 / zoom &&
          metrics.devicePixelRatio === zoom &&
          metrics.visualScale === 1 &&
          !metrics.overflow &&
          az.violations.length === 0,
        method:
          "Chromium isolated profile partition.default_zoom_level.x; no Emulation.setPageScaleFactor, no deviceScaleFactor override, no emulated viewport resizing",
        ...metrics,
        cdpCssViewportWidth: lm.cssLayoutViewport.clientWidth,
        violations: az.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          targets: v.nodes.map((n) => n.target),
        })),
      });
      if (zoom === 2) {
        const screenshotSession = await zoomContext.newCDPSession(zp);
        const screenshot = await screenshotSession.send(
          "Page.captureScreenshot",
          { format: "png", fromSurface: true, captureBeyondViewport: false },
        );
        await writeFile(
          out +
            `/browser-200pct-${route === "/" ? "landing" : route.replaceAll("/", "-").slice(1)}.png`,
          Buffer.from(screenshot.data, "base64"),
        );
        await screenshotSession.detach();
      }
    }
    await zoomContext.close();
    await rm(dir, { recursive: true, force: true });
  }
  findings.push({
    check: "screen-reader-and-native-mobile-keyboard",
    status: "unverified",
    reason:
      "No VoiceOver/NVDA or native mobile software keyboard session executed. Automated semantic checks are not a screen-reader pass.",
  });
} catch (e) {
  findings.push({ check: "execution-aborted", pass: false, error: String(e) });
  throw e;
} finally {
  await writeFile(
    out + "/accessibility-extra.json",
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        browser: await browser.version(),
        environment:
          "Local Next.js; Firebase Authentication emulator; local PostgreSQL; live Gemini indexing where invoked.",
        retests: [
          {
            check: "keyboard-skip-link",
            initial: "fail: fragment navigation did not focus main",
            fix: "Added tabIndex=-1 to public/protected main landmarks",
            retest: "pass",
          },
          {
            check: "keyboard-map-dialog",
            initial:
              "fail: native dialog Tab cycle reached browser chrome/body",
            fix: "Explicit first/last enabled-control Tab cycling; native modal Escape/focus return retained",
            retest: "pass",
          },
        ],
        results: findings,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(findings));
  await browser.close();
}
