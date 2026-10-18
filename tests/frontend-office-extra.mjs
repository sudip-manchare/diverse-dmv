import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const base = process.env.APP_ORIGIN || "http://127.0.0.1:3000",
  out = "docs/implementation/evidence";
const results = [],
  contrast = [];
let calls = 0;
const profile = await mkdtemp(join(tmpdir(), "dmv-office-zoom-"));
await mkdir(profile + "/Default");
await writeFile(
  profile + "/Default/Preferences",
  JSON.stringify({
    partition: { default_zoom_level: { x: Math.log(2) / Math.log(1.2) } },
  }),
);
const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.CHROMIUM_PATH || undefined,
  headless: true,
  viewport: null,
  args: ["--window-size=1440,900"],
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const section = page.locator("#office-explorer");
page.on("request", (r) => {
  if (new URL(r.url()).pathname === "/api/offices/search") calls++;
});
async function check(check, fn) {
  try {
    results.push({ check, status: "pass", ...(await fn()) });
    console.log(JSON.stringify({ check, status: "pass" }));
  } catch (e) {
    results.push({
      check,
      status: "fail",
      error: e.name,
      detail:
        e.name === "AssertionError"
          ? e.message
          : "Browser action did not complete.",
    });
  }
}
async function colors(
  locator,
  label,
  { disabled = false, focus = false, border = false, pseudo } = {},
) {
  const value = await locator.evaluate((el, pseudo) => {
    const s = getComputedStyle(el, pseudo);
    let parent = el,
      bg = "rgb(255, 255, 255)";
    while (parent) {
      const p = getComputedStyle(parent);
      if (
        p.backgroundColor !== "rgba(0, 0, 0, 0)" &&
        p.backgroundColor !== "transparent"
      ) {
        bg = p.backgroundColor;
        break;
      }
      parent = parent.parentElement;
    }
    const parentBg = getComputedStyle(
      el.closest("#office-explorer"),
    ).backgroundColor;
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext("2d");
    const normalize = (color, backdrop = "white") => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = backdrop;
      ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      return `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
    };
    return {
      originalForeground: s.color,
      foreground: normalize(s.color, bg),
      background: normalize(bg),
      outerBackground: normalize(parentBg),
      border: normalize(s.borderTopColor, parentBg),
      outline: normalize(s.outlineColor, parentBg),
      outlineWidth: s.outlineWidth,
      filter: s.filter,
      opacity: s.opacity,
      fontWeight: s.fontWeight,
      fontSize: s.fontSize,
    };
  }, pseudo);
  const rgb = (s) =>
    s
      .match(/[\d.]+/g)
      .slice(0, 3)
      .map(Number);
  const lum = (s) => {
    const c = rgb(s)
      .map((x) => x / 255)
      .map((x) => (x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
  };
  const ratio = (a, b) =>
    (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  const textRatio = ratio(value.foreground, value.background),
    boundaryRatio = ratio(value.border, value.outerBackground),
    focusRatio = ratio(value.outline, value.outerBackground);
  contrast.push({
    label,
    ...value,
    textRatio: Number(textRatio.toFixed(2)),
    ...(border ? { boundaryRatio: Number(boundaryRatio.toFixed(2)) } : {}),
    ...(focus ? { focusRatio: Number(focusRatio.toFixed(2)) } : {}),
    disabledExempt: disabled,
  });
  if (!disabled) {
    assert.ok(textRatio >= 4.5, `${label} text contrast >=4.5:1`);
    if (border)
      assert.ok(boundaryRatio >= 3, `${label} boundary contrast >=3:1`);
    if (focus) assert.ok(focusRatio >= 3, `${label} focus contrast >=3:1`);
  }
  return value;
}
try {
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await section
    .getByRole("button", { name: "Load office map", exact: true })
    .waitFor();
  await page.waitForFunction(
    () =>
      getComputedStyle(document.querySelector("#office-explorer"))
        .backgroundColor === "rgb(237, 245, 244)",
  );
  await check("K06-office-controls-normal-hover-focus-disabled", async () => {
    const field = section.getByLabel("Company name"),
      button = section.getByRole("button", {
        name: "Load office map",
        exact: true,
      });
    await colors(field, "company input normal", { border: true });
    await colors(section.getByLabel("Explore an area"), "area select normal", {
      border: true,
    });
    await colors(field, "company placeholder", { pseudo: "::placeholder" });
    await colors(button, "load map normal", { border: true });
    await button.hover();
    await colors(button, "load map hover", { border: true });
    await field.focus();
    await colors(field, "company input focus", { focus: true, border: true });
    return { runtimeComputedStyles: true };
  });
  if (process.env.OFFICE_CONTRAST_ONLY) {
    await writeFile(
      out + "/office-contrast.json",
      JSON.stringify(
        {
          testedAt: new Date().toISOString(),
          results,
          contrast,
          method:
            "Browser canvas CSS color normalization and alpha compositing before WCAG luminance calculations.",
        },
        null,
        2,
      ) + "\n",
    );
    await context.close();
    await rm(profile, { recursive: true, force: true });
    console.log(JSON.stringify({ results, contrast }));
    process.exit(0);
  }
  let release, started;
  const gate = new Promise((r) => (release = r)),
    requested = new Promise((r) => (started = r));
  await page.route(
    "**/api/offices/search",
    async (route) => {
      started();
      await gate;
      await route.continue();
    },
    { times: 1 },
  );
  const responseWait = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/offices/search",
  );
  await section
    .getByRole("button", { name: "Load office map", exact: true })
    .click();
  await requested;
  await check("K06-office-busy-disabled", async () => {
    const button = section.getByRole("button", {
      name: "Search offices",
      exact: true,
    });
    assert.ok(await button.isDisabled());
    await colors(button, "search busy disabled", { disabled: true });
    assert.ok(await section.getByLabel("Company name").isDisabled());
    return {
      actualPendingRequest: true,
      disabledTextExemptFromWCAGMinimum: true,
    };
  });
  release();
  const response = await responseWait;
  assert.equal(response.status(), 200);
  const data = await response.json();
  await section
    .getByRole("status")
    .filter({ hasText: `${data.offices.length} offices shown` })
    .waitFor();
  await check("MAP-05-actual-200pct-browser-zoom", async () => {
    await page.locator(".gm-style-cc").first().waitFor({ state: "visible" });
    await page.waitForTimeout(800);
    const metrics = await page.evaluate(() => ({
      innerWidth,
      outerWidth,
      devicePixelRatio,
      visualScale: visualViewport.scale,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    assert.equal(metrics.outerWidth, 1440);
    assert.equal(metrics.innerWidth, 720);
    assert.equal(metrics.devicePixelRatio, 2);
    assert.equal(metrics.visualScale, 1);
    assert.equal(metrics.overflow, false);
    assert.equal(
      await page
        .locator(".google-office-map")
        .evaluate((e) => e.getBoundingClientRect().height),
      300,
    );
    await page.locator(".google-office-map").scrollIntoViewIfNeeded();
    const cdp = await context.newCDPSession(page);
    const capture = await cdp.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await writeFile(
      out + "/office-native-200pct-viewport.png",
      Buffer.from(capture.data, "base64"),
    );
    await cdp.detach();
    const axe = await new AxeBuilder({ page })
      .include("#office-explorer")
      .analyze();
    assert.equal(axe.violations.length, 0);
    return {
      ...metrics,
      method:
        "Native Chromium profile zoom; no pinch scale or device scale override.",
      offices: data.offices.length,
      automatedViolations: [],
    };
  });
  if (process.env.OFFICE_ZOOM_CAPTURE_ONLY) {
    await writeFile(
      out + "/office-zoom-visual.json",
      JSON.stringify(
        {
          testedAt: new Date().toISOString(),
          results,
          attribution:
            "Waited for visible Google attribution DOM before capture.",
        },
        null,
        2,
      ) + "\n",
    );
    await context.close();
    await rm(profile, { recursive: true, force: true });
    console.log(JSON.stringify({ results }));
    process.exit(0);
  }
  await check("MAP-04-MAP-05-marker-keyboard-modern-event", async () => {
    const marker = page.locator("gmp-advanced-marker").first();
    await marker.waitFor();
    await marker.focus();
    assert.ok(
      await marker.evaluate(
        (e) =>
          e === document.activeElement || e.contains(document.activeElement),
      ),
    );
    await page.keyboard.press("Enter");
    await section.locator(".office-details").waitFor();
    await page.keyboard.press("Escape");
    assert.ok(
      await section
        .getByRole("list", { name: "Office results" })
        .getByRole("button")
        .first()
        .evaluate((e) => e === document.activeElement),
    );
    const row = section
      .getByRole("list", { name: "Office results" })
      .getByRole("button")
      .first();
    await row.click();
    await colors(row, "office row selected");
    await page.keyboard.press("Escape");
    return {
      markerEnterOpensDetails: true,
      escapeReturnsSynchronizedRow: true,
    };
  });
  await check("MAP-02-company-Unicode-limit-no-truncation", async () => {
    const input = section.getByLabel("Company name");
    const before = calls;
    await input.fill("🐟".repeat(80));
    assert.equal(await input.inputValue(), "🐟".repeat(80));
    assert.equal(await input.getAttribute("aria-invalid"), "false");
    await section.getByText("80/80 characters", { exact: true }).waitFor();
    await input.fill("🐟".repeat(81));
    assert.equal(await input.inputValue(), "🐟".repeat(81));
    assert.equal(await input.getAttribute("aria-invalid"), "true");
    await section
      .getByRole("button", { name: "Search offices", exact: true })
      .click();
    await section
      .getByText("Use 80 characters or fewer for the company name.", {
        exact: true,
      })
      .waitFor();
    assert.equal(calls, before);
    await colors(
      section.getByRole("alert").locator("p"),
      "office validation error",
    );
    await input.fill("");
    return {
      eightyAstralCodePointsRetained: true,
      eightyOneRejectedBeforeProvider: true,
      noSilentTruncation: true,
    };
  });
  await check("MAP-02-real-broad-query-pagination", async () => {
    await page.waitForTimeout(8000);
    await section.getByLabel("Company name").fill("office");
    const wait = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/offices/search",
    );
    await section
      .getByRole("button", { name: "Search offices", exact: true })
      .click();
    const firstResponse = await wait;
    assert.equal(firstResponse.status(), 200);
    const first = await firstResponse.json();
    await section
      .getByRole("status")
      .filter({ hasText: `${first.offices.length} offices shown` })
      .waitFor();
    if (!first.nextPageToken)
      return {
        firstPageCount: first.offices.length,
        pagination: "unverified: actual provider did not return nextPageToken",
      };
    const denied = await context.request.post(base + "/api/offices/search", {
      headers: { origin: base, "x-csrf-protection": "1" },
      data: {
        preset: "metro",
        company: "changed query",
        pageToken: first.nextPageToken,
      },
    });
    assert.equal(denied.status(), 400);
    await page.waitForTimeout(8000);
    const nextWait = page.waitForResponse(
      (r) => new URL(r.url()).pathname === "/api/offices/search",
    );
    await section
      .getByRole("button", { name: "Load more offices", exact: true })
      .click();
    const nextResponse = await nextWait;
    assert.equal(nextResponse.status(), 200);
    const next = await nextResponse.json();
    const unique = new Set(
      [...first.offices, ...next.offices].map((o) => o.id),
    );
    await page.waitForFunction(
      (n) =>
        document.querySelectorAll("#office-explorer .office-results li")
          .length === n,
      unique.size,
    );
    return {
      firstPageCount: first.offices.length,
      nextPageCount: next.offices.length,
      loadedUniqueCount: unique.size,
      changedQueryTokenRejected: true,
      actualProviderPages: true,
    };
  });
} catch (e) {
  results.push({
    check: "office-extra-unexpected",
    status: "fail",
    error: e.name,
    detail:
      e.name === "AssertionError" ? e.message : "Browser readiness failed.",
  });
} finally {
  await context.close();
  await rm(profile, { recursive: true, force: true });
}
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const mobile = await browser.newContext({
  viewport: { width: 360, height: 800 },
  isMobile: true,
  hasTouch: true,
  reducedMotion: "reduce",
});
const mp = await mobile.newPage();
await check("MAP-05-emulated-touch-360px", async () => {
  await mp.goto(base, { waitUntil: "domcontentloaded" });
  await mp.waitForTimeout(8000);
  const s = mp.locator("#office-explorer");
  const wait = mp.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/offices/search",
  );
  await s.getByRole("button", { name: "Load office map", exact: true }).tap();
  const response = await wait;
  assert.equal(response.status(), 200);
  const data = await response.json();
  const row = s
    .getByRole("list", { name: "Office results" })
    .getByRole("button")
    .first();
  await row.tap();
  await s.locator(".office-details").waitFor();
  await s
    .getByRole("button", { name: "Back to office results", exact: true })
    .tap();
  assert.ok(await row.evaluate((e) => e === document.activeElement));
  const metrics = await mp.evaluate(() => ({
    width: innerWidth,
    touchPoints: navigator.maxTouchPoints,
    overflow: document.documentElement.scrollWidth > innerWidth,
  }));
  assert.equal(metrics.width, 360);
  assert.ok(metrics.touchPoints > 0);
  assert.equal(metrics.overflow, false);
  await mp.locator(".google-office-map").scrollIntoViewIfNeeded();
  await mp.screenshot({
    path: out + "/office-mobile-touch-viewport.png",
    fullPage: false,
  });
  return {
    ...metrics,
    offices: data.offices.length,
    actualTouchEvents: true,
    nativeHandset: false,
  };
});
await browser.close();
await writeFile(
  out + "/office-extra.json",
  JSON.stringify(
    {
      testedAt: new Date().toISOString(),
      results,
      contrast,
      limitations: [
        "Native mobile software keyboard and screen reader not tested.",
        "This targeted office contrast matrix is not full application K06 conformance.",
        "Production key restrictions/quota/policy/deployment are not established by demo-key browser tests.",
      ],
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify({ results, contrast }));
