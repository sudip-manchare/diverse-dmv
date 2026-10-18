import assert from "node:assert/strict";
import test from "node:test";
import { officeConfig } from "../src/server/office-config";
import { GET } from "../src/app/api/offices/config/route";

test("office browser configuration uses explicit browser aliases without exposing server credentials", async () => {
  const names = [
    "GOOGLE_MAPS_ENABLED",
    "GOOGLE_MAPS_DEMO_MODE",
    "NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY",
    "REACT_APP_GOOGLE_MAPS_DEMO_KEY",
    "GOOGLE_PLACES_SERVER_KEY",
    "OFFICE_PAGE_TOKEN_SECRET",
    "DATABASE_URL",
  ];
  const before = Object.fromEntries(
    names.map((name) => [name, process.env[name]]),
  );
  try {
    process.env.GOOGLE_MAPS_ENABLED = "true";
    process.env.GOOGLE_MAPS_DEMO_MODE = "true";
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
    process.env.REACT_APP_GOOGLE_MAPS_DEMO_KEY =
      "fictional-public-demo-browser-key";
    process.env.GOOGLE_PLACES_SERVER_KEY = "fictional-private-places-key";
    process.env.OFFICE_PAGE_TOKEN_SECRET =
      "fictional-private-pagination-key-at-least-32";
    process.env.DATABASE_URL = "fictional-private-database-url";
    const alias = await (await GET()).json();
    assert.equal(alias.browserKey, "fictional-public-demo-browser-key");
    assert.equal(alias.enabled, true);
    assert(!JSON.stringify(alias).includes("fictional-private"));
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY =
      "fictional-public-canonical-browser-key";
    assert.equal(
      (await (await GET()).json()).browserKey,
      "fictional-public-canonical-browser-key",
    );
    delete process.env.GOOGLE_PLACES_SERVER_KEY;
    assert.equal(officeConfig().placesKey, "fictional-public-demo-browser-key");
    assert.equal((await (await GET()).json()).demo, true);
    process.env.GOOGLE_MAPS_DEMO_MODE = "false";
    assert.deepEqual(await (await GET()).json(), { enabled: false });
    process.env.GOOGLE_PLACES_SERVER_KEY = "fictional-private-places-key";
    assert.equal((await (await GET()).json()).enabled, true);
    assert.equal(officeConfig().placesKey, "fictional-private-places-key");
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
    assert.deepEqual(await (await GET()).json(), { enabled: false });
    process.env.GOOGLE_MAPS_ENABLED = "false";
    assert.deepEqual(await (await GET()).json(), { enabled: false });
  } finally {
    for (const name of names) {
      if (before[name] === undefined) delete process.env[name];
      else process.env[name] = before[name];
    }
  }
});

test("office company limit counts Unicode code points after trimming", async () => {
  const { officeInputSchema } = await import("../src/server/offices");
  assert(
    officeInputSchema.safeParse({ company: "  " + "🚢".repeat(80) + "  " })
      .success,
  );
  assert(!officeInputSchema.safeParse({ company: "🚢".repeat(81) }).success);
});
