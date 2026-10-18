import { chromium } from "playwright";
import { writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
const base = process.env.APP_ORIGIN || "http://127.0.0.1:3000",
  out = "docs/implementation/evidence";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const section = page.locator("#office-explorer");
try {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  const wait = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/offices/search",
  );
  await section
    .getByRole("button", { name: "Load office map", exact: true })
    .click();
  const response = await wait;
  assert.equal(response.status(), 200);
  const result = await response.json();
  await section
    .getByRole("status")
    .filter({ hasText: `${result.offices.length} offices shown` })
    .waitFor();
  await page.waitForFunction(
    () => document.querySelectorAll("gmp-advanced-marker").length > 0,
  );
  await page.locator(".gm-style-cc").first().waitFor({ state: "visible" });
  await page.waitForTimeout(800);
  await section
    .getByRole("button", { name: "Search this area", exact: true })
    .focus();
  await section.screenshot({ path: out + "/office-desktop.png" });
  await page.setViewportSize({ width: 360, height: 800 });
  await section
    .getByRole("button", { name: "Search this area", exact: true })
    .focus();
  await page.evaluate(
    () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  await section.screenshot({ path: out + "/office-mobile.png" });
  await page.locator(".google-office-map").scrollIntoViewIfNeeded();
  await page.screenshot({
    path: out + "/office-mobile-viewport.png",
    fullPage: false,
  });
  await writeFile(
    out + "/office-visual-review.json",
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        provider: "Actual Google Maps/Places nonproduction demo mode",
        count: result.offices.length,
        desktopWidth: 1440,
        mobileWidth: 360,
        focus:
          "Search this area inside captured office region; no clipped off-section skip link.",
        overflow: await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
