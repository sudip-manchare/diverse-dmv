import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const browserKey =
  process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY ||
  process.env.REACT_APP_GOOGLE_MAPS_DEMO_KEY;
if (!browserKey) throw new Error("Browser Maps configuration missing");
const evidence = {
  checkedAt: new Date().toISOString(),
  scope:
    "Actual Google Maps JavaScript browser-only probe; no Places request, office coverage or key-restriction claim",
  source: process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY
    ? "canonical-browser-key"
    : "owner-demo-key-alias",
  origin: "http://localhost:3011",
  restrictionMetadata: "unverified: administrative key metadata unavailable",
  checks: [],
  errors: [],
};
const scriptKey = JSON.stringify(browserKey).replaceAll("<", "\\u003c");
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Google browser-map verification</title><style>body{font:18px system-ui;margin:24px}#map{width:100%;height:580px}p{max-width:800px}</style><h1>Browser map verification</h1><p>Live Google map centered on Washington, D.C. The test marker identifies the map center, not an office. Office search is not enabled by this probe.</p><div id="map" aria-label="Live Google map test"></div><script>window.probe={ready:false,tiles:false,marker:false,authFailure:false};window.gm_authFailure=()=>{window.probe.authFailure=true};window.mapReady=async()=>{try{const {Map}=await google.maps.importLibrary('maps');const {AdvancedMarkerElement}=await google.maps.importLibrary('marker');const map=new Map(document.getElementById('map'),{center:{lat:38.9072,lng:-77.0369},zoom:11,mapId:'DEMO_MAP_ID'});new AdvancedMarkerElement({map,position:{lat:38.9072,lng:-77.0369},title:'Test center — not an office'});window.probe.ready=true;window.probe.marker=true;google.maps.event.addListenerOnce(map,'tilesloaded',()=>window.probe.tiles=true)}catch{window.probe.failed=true}};const s=document.createElement('script');s.src='https://maps.googleapis.com/maps/api/js?key='+encodeURIComponent(${scriptKey})+'&v=weekly&loading=async&callback=mapReady';s.onerror=()=>window.probe.failed=true;document.head.appendChild(s);</script></html>`;
const server = createServer((_req, res) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(html);
});
await new Promise((resolve) => server.listen(3011, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH ||
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  });
  const page = await browser.newPage({
    viewport: { width: 1200, height: 850 },
  });
  page.on("console", (msg) => {
    const code = msg
      .text()
      .match(
        /(?:Google Maps JavaScript API (?:error|warning):\s*)?([A-Za-z]+(?:MapError|ApiError|KeyMapError|NotActivatedMapError|DeniedMapError))/,
      )?.[1];
    if (code && !evidence.errors.includes(code)) evidence.errors.push(code);
  });
  await page.goto("http://localhost:3011");
  await page
    .waitForFunction(
      () =>
        window.probe.tiles || window.probe.authFailure || window.probe.failed,
      { timeout: 25000 },
    )
    .catch(() => {});
  await page.waitForTimeout(2500);
  const actual = await page.evaluate(() => window.probe);
  evidence.checks.push({
    check: "actual-browser-map-and-advanced-marker",
    status:
      actual.ready &&
      actual.tiles &&
      actual.marker &&
      !actual.authFailure &&
      !actual.failed
        ? "pass"
        : "fail",
    actual,
  });
  evidence.checks.push({
    check: "map-accessible-region",
    status:
      (await page.getByRole("region", { name: "Map", exact: true }).count()) > 0
        ? "pass"
        : "unverified",
  });
  await page.screenshot({
    path: "docs/implementation/evidence/maps-browser-probe.png",
    fullPage: true,
  });
  evidence.screenshot = "maps-browser-probe.png";
} catch (err) {
  evidence.checks.push({
    check: "probe-runtime",
    status: "fail",
    errorType: err?.name || "Error",
  });
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
await writeFile(
  "docs/implementation/evidence/maps-browser-probe.json",
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(
  JSON.stringify({ checks: evidence.checks, errors: evidence.errors }),
);
