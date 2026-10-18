import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { spawn } from "node:child_process";

// Load before spawning Next: its development restart cannot forward --env-file.
const env = { ...process.env };
for (const path of [".env", ".env.live"]) {
  if (existsSync(path))
    Object.assign(env, parseEnv(readFileSync(path, "utf8")));
}
const missing = [
  "DATABASE_URL",
  "FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_API_KEY",
].filter((name) => !env[name]);
if (!env.FIREBASE_SERVICE_ACCOUNT_JSON && !env.GOOGLE_APPLICATION_CREDENTIALS) {
  missing.push(
    "GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON",
  );
}
if (missing.length) {
  console.error(`Configure .env.live first. Missing: ${missing.join(", ")}`);
  process.exit(1);
}
if (
  env.GOOGLE_APPLICATION_CREDENTIALS &&
  !existsSync(env.GOOGLE_APPLICATION_CREDENTIALS)
) {
  console.error("The configured server credential file is unavailable.");
  process.exit(1);
}
env.FIREBASE_AUTH_EMULATOR_HOST = "";
env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL = "";
console.log("Starting the local application with configured live providers.");
const child = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "dev",
    "--hostname",
    "127.0.0.1",
    ...process.argv.slice(2),
  ],
  { env, stdio: "inherit" },
);
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
child.on("error", () => {
  console.error("The application could not start.");
  process.exit(1);
});
child.on("exit", (code) => process.exit(code ?? 1));
