/** No secret values or provider bodies are printed. Network probes use fictional text only. */
import { getSql } from "../src/server/db";
import { embedText } from "../src/server/embeddings";
import { officeConfig } from "../src/server/office-config";
import {
  getApps,
  initializeApp,
  applicationDefault,
  cert,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
async function main() {
  const results: { provider: string; status: string; detail: string }[] = [];
  if (process.env.DATABASE_URL) {
    try {
      const sql = getSql();
      await sql`SELECT 1`;
      const ext =
        await sql`SELECT extversion FROM pg_extension WHERE extname='vector'`;
      results.push({
        provider: "PostgreSQL",
        status: ext.length ? "pass" : "fail",
        detail: ext.length
          ? "Connected; pgvector installed. Tiger Data provenance must be checked against configured service."
          : "Connected; vector extension absent.",
      });
    } catch {
      results.push({
        provider: "PostgreSQL",
        status: "fail",
        detail: "Connection or extension probe failed; no credentials logged.",
      });
    }
  } else
    results.push({
      provider: "Tiger Data",
      status: "unverified",
      detail: "DATABASE_URL absent.",
    });
  if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
    try {
      const vector = await embedText(
        "Fictional test member offers accessible frontend mentoring.",
        "RETRIEVAL_DOCUMENT",
      );
      results.push({
        provider: "Gemini",
        status: "pass",
        detail: `Live ${vector.length}-dimensional vector; normalized length ${Math.hypot(...vector).toFixed(6)}. No profile data used.`,
      });
    } catch {
      results.push({
        provider: "Gemini",
        status: "fail",
        detail:
          "Live embedding probe failed (requires migrated database quota table and provider access); no key or provider body logged.",
      });
    }
  } else
    results.push({
      provider: "Gemini",
      status: "unverified",
      detail: "GEMINI_API_KEY / GOOGLE_API_KEY absent.",
    });
  if (
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  ) {
    try {
      const app =
        getApps()[0] ||
        initializeApp({
          credential: process.env.FIREBASE_SERVICE_ACCOUNT_JSON
            ? cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))
            : applicationDefault(),
        });
      await getAuth(app).listUsers(1);
      results.push({
        provider: "Firebase Admin",
        status: "pass",
        detail:
          "Identity service reachable; browser signup/recovery still needs runtime verification.",
      });
    } catch {
      results.push({
        provider: "Firebase Admin",
        status: "fail",
        detail:
          "Administrative identity probe failed; account data not printed.",
      });
    }
  } else
    results.push({
      provider: "Firebase Admin",
      status: "unverified",
      detail:
        "No explicit admin credentials; deployed ADC requires separate verification.",
    });
  results.push({
    provider: "Google Maps / Places",
    status: "unverified",
    detail: officeConfig().enabled
      ? officeConfig().demo
        ? "Explicit prototype configuration ready. Separate live Maps/Places evidence is required; demo mode does not verify production restrictions."
        : "Configuration ready; live map/Places and restrictions require separate verification."
      : "Disabled or incomplete configuration. Explicit demo mode is available for the owner-authorized prototype; community launch requires restricted production keys and policy review.",
  });
  results.push({
    provider: "Vercel / HTTPS domain",
    status: "unverified",
    detail:
      "Owner deferred deployment. No hosting or domain observation established by this script.",
  });
  console.log(
    JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2),
  );
  if (process.env.DATABASE_URL) await getSql().end();
  if (results.some((r) => r.status === "fail")) process.exitCode = 1;
}
main().catch(() => {
  console.error("Provider preflight could not finish.");
  process.exitCode = 1;
});
