import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
const base = process.env.APP_ORIGIN || "http://127.0.0.1:3000";
const out = "docs/implementation/evidence";
const results = [],
  requests = [],
  responses = [];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
page.setDefaultTimeout(30000);
const section = page.locator("#office-explorer");
page.on("request", (request) => {
  const u = new URL(request.url());
  if (u.pathname === "/api/offices/search")
    requests.push(request.postDataJSON());
});
page.on("response", async (response) => {
  if (new URL(response.url()).pathname === "/api/offices/search") {
    try {
      const data = await response.json();
      responses.push({
        status: response.status(),
        count: data.offices?.length,
        mode: data.mode,
        area: data.area,
        hasNextPage: !!data.nextPageToken,
        closed: data.offices?.filter(
          (o) => o.businessStatus === "CLOSED_TEMPORARILY",
        ).length,
        missingAddress: data.offices?.filter((o) => !o.address).length,
        duplicateIds: data.offices
          ? data.offices.length - new Set(data.offices.map((o) => o.id)).size
          : undefined,
      });
    } catch {}
  }
});
async function check(id, fn) {
  try {
    const evidence = await fn();
    results.push({ check: id, status: "pass", ...evidence });
    console.log(JSON.stringify({ check: id, status: "pass" }));
  } catch (error) {
    results.push({
      check: id,
      status: "fail",
      error: error.name,
      detail:
        error.name === "AssertionError"
          ? error.message
          : "Browser action did not complete; see scoped stage.",
    });
  }
}
let lastSearchAt = 0;
async function search(action) {
  const waitMs = Math.max(0, 7500 - (Date.now() - lastSearchAt));
  if (waitMs) await page.waitForTimeout(waitMs);
  lastSearchAt = Date.now();
  const wait = page.waitForResponse(
    (r) => new URL(r.url()).pathname === "/api/offices/search",
  );
  await action();
  const response = await wait;
  assert.equal(response.status(), 200, "Actual office search HTTP status");
  const data = await response.json();
  await section
    .getByRole("status")
    .filter({ hasText: `${data.offices.length} offices shown` })
    .waitFor();
  assert.equal(
    await section
      .getByRole("list", { name: "Office results" })
      .locator("li")
      .count(),
    data.offices.length,
  );
  assert.equal(
    new Set(data.offices.map((o) => o.id)).size,
    data.offices.length,
  );
  return data;
}
let ready = false,
  latest;
try {
  await mkdir(out, { recursive: true });
  await page.goto(base, { waitUntil: "domcontentloaded" });
  await check("MAP-08-lazy-load-before-explicit-action", async () => {
    await section
      .getByRole("button", { name: "Load office map", exact: true })
      .waitFor();
    await page.waitForTimeout(800);
    assert.equal(
      await page
        .locator('script[src*="maps.googleapis.com/maps/api/js"]')
        .count(),
      0,
    );
    assert.equal(requests.length, 0);
    return { sdkLoaded: false, officeSearchCalls: 0 };
  });
  await check("MAP-04-hero-account-entry-separate", async () => {
    const hero = page.getByRole("button", {
      name: "Explore the DMV community — join or log in",
      exact: true,
    });
    await hero.click();
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(requests.length, 0);
    return {
      heroOpensAccountDialog: true,
      officeMapOutsideHeroButton:
        (await hero.locator("#office-explorer").count()) === 0,
    };
  });
  await check("MAP-01-initial-live-Google-offices", async () => {
    latest = await search(() =>
      page
        .getByRole("link", { name: "Explore office map", exact: true })
        .first()
        .click(),
    );
    ready = true;
    assert.ok(
      latest.offices.length > 3,
      "Initial real provider result count exceeds three-company ceiling.",
    );
    assert.ok(latest.offices.length <= 20);
    assert.equal(
      await page.evaluate(() => document.activeElement?.id),
      "office-title",
    );
    await page.waitForFunction(
      () => document.querySelectorAll("gmp-advanced-marker").length > 0,
    );
    assert.equal(
      await page.locator("gmp-advanced-marker").count(),
      latest.offices.length,
    );
    return {
      count: latest.offices.length,
      cap: 20,
      markersMatchList: true,
      headingFocused: true,
      actualProvider: true,
    };
  });
  if (ready) {
    await check("MAP-01-regional-presets-real-provider", async () => {
      const areas = [];
      for (const preset of ["dc", "maryland", "virginia", "baltimore"]) {
        await section.getByLabel("Explore an area").selectOption(preset);
        latest = await search(() =>
          section
            .getByRole("button", { name: "Search offices", exact: true })
            .click(),
        );
        assert.ok(latest.offices.length > 0, `${preset} returned real offices`);
        assert.ok(latest.offices.length <= 20);
        areas.push({
          preset,
          count: latest.offices.length,
          radius: latest.area.radius,
        });
      }
      return { areas };
    });
    await check("MAP-02-company-query-and-pagination", async () => {
      await section.getByLabel("Explore an area").selectOption("metro");
      await section.getByLabel("Company name").fill("Microsoft");
      latest = await search(() =>
        section
          .getByRole("button", { name: "Search offices", exact: true })
          .click(),
      );
      const first = latest.offices.length;
      assert.equal(latest.mode, "company");
      assert.ok(first <= 20);
      let pagination = "not offered by actual provider";
      if (latest.nextPageToken) {
        const wait = page.waitForResponse(
          (r) => new URL(r.url()).pathname === "/api/offices/search",
        );
        await section
          .getByRole("button", { name: "Load more offices", exact: true })
          .click();
        const response = await wait;
        assert.equal(response.status(), 200);
        const next = await response.json();
        const count = new Set(
          [...latest.offices, ...next.offices].map((o) => o.id),
        ).size;
        await page.waitForFunction(
          (count) =>
            document.querySelectorAll("#office-explorer .office-results li")
              .length === count,
          count,
        );
        pagination = "actual next page deduplicated";
      }
      return { firstPageCount: first, pagination };
    });
    await check("MAP-03-explicit-area-search-only", async () => {
      await section.getByLabel("Company name").fill("");
      await section.getByLabel("Explore an area").selectOption("dc");
      latest = await search(() =>
        section
          .getByRole("button", { name: "Search offices", exact: true })
          .click(),
      );
      const before = requests.length;
      const map = page.locator(".google-office-map");
      await map.scrollIntoViewIfNeeded();
      const box = await map.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width / 2 + 80,
        box.y + box.height / 2 + 40,
        { steps: 12 },
      );
      await page.mouse.up();
      await page.waitForTimeout(1200);
      assert.equal(requests.length, before);
      await section
        .getByText("Map moved. Search this area to update offices.", {
          exact: true,
        })
        .waitFor();
      latest = await search(() =>
        section
          .getByRole("button", { name: "Search this area", exact: true })
          .click(),
      );
      assert.ok(requests.at(-1).area);
      assert.equal(requests.length, before + 1);
      return {
        panSearchCalls: 0,
        explicitSearchCalls: 1,
        radius: latest.area.radius,
      };
    });
    await check("MAP-04-list-pin-details-focus-return", async () => {
      const row = section
        .getByRole("list", { name: "Office results" })
        .getByRole("button")
        .first();
      const name = await row.locator("strong").innerText();
      await row.click();
      const details = section.getByRole("region", {
        name: `Office details: ${name}`,
        exact: true,
      });
      await details.waitFor();
      assert.equal(await details.getByRole("heading").innerText(), name);
      assert.equal(await row.getAttribute("aria-pressed"), "true");
      assert.ok(
        await details
          .getByRole("link", { name: /View on Google Maps/ })
          .getAttribute("href"),
      );
      assert.equal(await page.getByRole("dialog").count(), 0);
      await page.keyboard.press("Escape");
      assert.ok(await row.evaluate((e) => e === document.activeElement));
      const marker = page.locator("gmp-advanced-marker").first();
      await marker.click({ force: true });
      await details.waitFor();
      await details
        .getByRole("button", { name: "Back to office results", exact: true })
        .click();
      assert.ok(await row.evaluate((e) => e === document.activeElement));
      return {
        rowSelectsDetails: true,
        pinSelectsSameDetails: true,
        escapeAndCloseRestoreRow: true,
      };
    });
    await check("MAP-05-desktop-list-keyboard", async () => {
      const rows = section
        .getByRole("list", { name: "Office results" })
        .getByRole("button");
      const count = await rows.count();
      await rows.first().focus();
      for (let i = 0; i < count; i++) {
        assert.ok(
          await rows.nth(i).evaluate((e) => e === document.activeElement),
        );
        await page.keyboard.press("Enter");
        await section.locator(".office-details").waitFor();
        await page.keyboard.press("Escape");
        assert.ok(
          await rows.nth(i).evaluate((e) => e === document.activeElement),
        );
        if (i < count - 1) await page.keyboard.press("Tab");
      }
      return {
        officeRowsOpenedWithKeyboard: count,
        focusReturned: true,
        start:
          "First result received focus; all following rows/actions reached via Tab/Enter/Escape.",
      };
    });
    await check(
      "DIVE-05-MAP-07-attribution-and-policy-destinations",
      async () => {
        assert.ok(
          await section.getByText("Google Maps", { exact: true }).count(),
        );
        await section
          .getByText(
            "Results are not a complete directory. An office listing does not mean the company is hiring.",
            { exact: true },
          )
          .waitFor();
        for (const path of ["/terms", "/privacy"]) {
          const response = await context.request.get(base + path);
          assert.equal(response.status(), 200);
        }
        assert.equal(
          await section.getByRole("link", { name: /careers/i }).count(),
          0,
        );
        await section
          .getByRole("button", { name: "Search this area", exact: true })
          .focus();
        await section.screenshot({ path: out + "/office-desktop.png" });
        return {
          googleAttributionPresent: true,
          termsPrivacyHTTP200: true,
          noInventedCareersLinks: true,
          disclaimerVisible: true,
          productionRestrictions:
            "Not established by browser demo-key evidence.",
        };
      },
    );
    await check("MAP-05-mobile-real-results", async () => {
      await page.setViewportSize({ width: 360, height: 800 });
      await section.getByRole("heading").scrollIntoViewIfNeeded();
      await page.evaluate(
        () =>
          new Promise((r) =>
            requestAnimationFrame(() => requestAnimationFrame(r)),
          ),
      );
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
        false,
      );
      const height = await page
        .locator(".google-office-map")
        .evaluate((e) => e.getBoundingClientRect().height);
      assert.equal(height, 300);
      const row = section
        .getByRole("list", { name: "Office results" })
        .getByRole("button")
        .first();
      await row.tap().catch(() => row.click());
      await section.locator(".office-details").waitFor();
      await section
        .getByRole("button", { name: "Back to office results", exact: true })
        .click();
      const axe = await new AxeBuilder({ page })
        .include("#office-explorer")
        .analyze();
      assert.equal(
        axe.violations.length,
        0,
        "Office mobile automated accessibility violations",
      );
      await section.screenshot({ path: out + "/office-mobile.png" });
      return {
        mapHeight: height,
        overflow: false,
        automatedViolations: axe.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          targets: v.nodes.map((n) => n.target),
        })),
        touchNote:
          "Mobile width browser interaction; not native handset/software keyboard.",
      };
    });
    await check("MAP-06-real-empty-company-query", async () => {
      await section
        .getByLabel("Company name")
        .fill(`FictionalNoSuchOffice${randomUUID().replaceAll("-", "")}`);
      latest = await search(() =>
        section
          .getByRole("button", { name: "Search offices", exact: true })
          .click(),
      );
      assert.equal(latest.offices.length, 0);
      await section
        .getByText(
          "No offices found for this search. Try a smaller area or a company name.",
          { exact: true },
        )
        .waitFor();
      return { actualProviderZeroResults: true };
    });
    await check("MAP-06-real-network-failure-and-retry", async () => {
      await section.getByLabel("Company name").fill("");
      await page.route(
        "**/api/offices/search",
        (route) => route.abort("failed"),
        { times: 1 },
      );
      await section
        .getByRole("button", { name: "Search offices", exact: true })
        .click();
      await section
        .getByText("We couldn’t load office listings. Try again.", {
          exact: true,
        })
        .waitFor();
      latest = await search(() =>
        section
          .getByRole("button", { name: "Retry office search", exact: true })
          .click(),
      );
      return {
        fault: "Browser aborted network request, no fabricated response.",
        retryCount: latest.offices.length,
      };
    });
  }
} catch (error) {
  results.push({
    check: "office-journey-unexpected",
    status: "fail",
    error: error.name,
  });
} finally {
  const blocked = await browser.newContext({
    viewport: { width: 360, height: 800 },
  });
  const p = await blocked.newPage();
  await check("MAP-08-SDK-blocked-account-entry-still-works", async () => {
    await p.route("https://maps.googleapis.com/maps/api/js**", (r) =>
      r.abort("blockedbyclient"),
    );
    await p.goto(base, { waitUntil: "domcontentloaded" });
    await p
      .locator("#office-explorer")
      .getByRole("button", { name: "Load office map", exact: true })
      .click();
    await p
      .getByText(
        "The office map is unavailable right now. You can still join the community.",
        { exact: true },
      )
      .waitFor();
    await p
      .getByRole("button", {
        name: "Explore the DMV community — join or log in",
        exact: true,
      })
      .click();
    await p.getByRole("dialog").waitFor();
    await p
      .getByRole("dialog")
      .getByRole("link", { name: "Join community", exact: true })
      .click();
    await p.waitForURL("**/signup");
    return { SDKNetworkBlocked: true, heroJoinStillNavigates: true };
  });
  await blocked.close();
  results.push({
    check: "MAP-03-production-key-restrictions",
    status: "unverified",
    reason:
      "Nonproduction demo-key configuration does not establish separately restricted production browser/server keys, billing quotas or Cloud Run deployment.",
  });
  results.push({
    check: "MAP-06-quota-closed-missing-details",
    status: "unverified",
    reason:
      "Only actual provider data/failures count; no synthetic closed/missing-place/quota replies used.",
    observedClosed: responses.reduce((n, r) => n + (r.closed || 0), 0),
    observedMissingAddress: responses.reduce(
      (n, r) => n + (r.missingAddress || 0),
      0,
    ),
  });
  await writeFile(
    out + "/office-browser-journey.json",
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        browser: browser.version(),
        environment:
          "Actual Google Maps JS / Places provider via explicitly enabled nonproduction demo mode; local Next.js, not production deployment.",
        results,
        requests: requests.map((r) => ({
          keys: Object.keys(r).sort(),
          preset: r.preset,
          hasCompany: !!r.company,
          hasPageToken: !!r.pageToken,
          area: r.area,
        })),
        responses,
      },
      null,
      2,
    ) + "\n",
  );
  await browser.close();
  console.log(JSON.stringify({ results }));
}
