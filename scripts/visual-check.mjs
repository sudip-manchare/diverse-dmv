import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, writeFile } from "node:fs/promises";
const out = "docs/implementation/evidence";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
});
const context = await browser.newContext();
const page = await context.newPage();
const findings = [];
for (const [label, width, height] of [
  ["desktop", 1440, 900],
  ["mobile", 360, 800],
  ["zoom-reflow", 720, 900],
]) {
  await page.setViewportSize({ width, height });
  await page.goto("http://127.0.0.1:3000/", { waitUntil: "networkidle" });
  await page.screenshot({
    path: `${out}/landing-${label}.png`,
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  const axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  findings.push({
    label,
    width,
    height,
    overflow,
    violations: axe.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      description: v.description,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  });
}
await page
  .getByRole("button", { name: "Explore the DMV community — join or log in" })
  .click();
await page.getByRole("dialog").waitFor();
await page.keyboard.press("Escape");
findings.push({
  dialogClosed: (await page.getByRole("dialog").count()) === 0,
  focusReturned: await page
    .getByRole("button", { name: "Explore the DMV community — join or log in" })
    .evaluate((e) => document.activeElement === e),
});
await writeFile(`${out}/visual-check.json`, JSON.stringify(findings, null, 2));
console.log(JSON.stringify(findings));
await browser.close();
