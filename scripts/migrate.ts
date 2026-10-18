import { readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import postgres from "postgres";
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const sql = postgres(process.env.DATABASE_URL, {
    max: 1,
    ssl: process.env.DATABASE_SSL === "disable" ? false : "require",
  });
  try {
    await sql`CREATE TABLE IF NOT EXISTS schema_migrations(name text PRIMARY KEY,sha256 text NOT NULL,applied_at timestamptz NOT NULL DEFAULT clock_timestamp())`;
    for (const name of (await readdir("db/migrations"))
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const content = await readFile(`db/migrations/${name}`, "utf8");
      const hash = createHash("sha256").update(content).digest("hex");
      await sql.begin(async (tx) => {
        await tx`SELECT pg_advisory_xact_lock(15746821)`;
        const [existing] =
          await tx`SELECT sha256 FROM schema_migrations WHERE name=${name}`;
        if (existing) {
          if (existing.sha256 !== hash)
            throw new Error(`Migration changed after application: ${name}`);
          return;
        }
        await tx.unsafe(content);
        await tx`INSERT INTO schema_migrations(name,sha256) VALUES(${name},${hash})`;
        console.log(`Applied ${name}`);
      });
    }
  } finally {
    await sql.end();
  }
}
main().catch(() => {
  console.error(
    "Operation failed. Verify provider access and configuration; no sensitive diagnostics emitted.",
  );
  process.exitCode = 1;
});
