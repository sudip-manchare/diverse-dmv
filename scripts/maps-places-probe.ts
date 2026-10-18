import { writeFile } from "node:fs/promises";
import { officeConfig } from "../src/server/office-config";
import { searchOffices, insideCircle } from "../src/server/offices";
import { getSql } from "../src/server/db";
import { OFFICE_PRESETS } from "../src/lib/office-contract";

async function main() {
  const evidence: Record<string, unknown> = {
    checkedAt: new Date().toISOString(),
    scope:
      "Actual bounded Places API (New) request through application service, no mocked response and no stored Places content",
    configuration: {
      enabled: officeConfig().enabled,
      demo: officeConfig().demo,
      separateServerCredential: !!process.env.GOOGLE_PLACES_SERVER_KEY,
    },
    request: { preset: "dc", maxResultCount: 20, type: "corporate_office" },
    checks: [],
  };
  try {
    const origin = process.env.APP_ORIGIN || "http://localhost:3000";
    const response = await searchOffices(
      { preset: "dc" },
      new Request(`${origin}/api/offices/search`, {
        method: "POST",
        headers: { origin },
      }),
    );
    evidence.checks = [
      {
        check: "real-places-nearby-bounded-search",
        status: "pass",
        count: response.offices.length,
        atMost20: response.offices.length <= 20,
        allWithinRequestedCircle: response.offices.every((o) =>
          insideCircle(OFFICE_PRESETS.dc, o.lat, o.lng),
        ),
        noPermanentClosure: response.offices.every(
          (o) => o.businessStatus !== "CLOSED_PERMANENTLY",
        ),
        attributionFieldsPresent: response.offices.every((o) =>
          Array.isArray(o.attributions),
        ),
      },
    ];
  } catch (error) {
    const e = error as { code?: string; status?: number };
    evidence.checks = [
      {
        check: "real-places-nearby-bounded-search",
        status: "fail",
        code: e.code || "PROBE_FAILED",
        httpStatus: e.status,
      },
    ];
  } finally {
    if (process.env.DATABASE_URL) await getSql().end({ timeout: 3 });
  }
  await writeFile(
    "docs/implementation/evidence/maps-places-probe.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence));
}
main().catch(() => {
  console.error("Probe could not complete");
  process.exitCode = 1;
});
