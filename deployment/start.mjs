import { validateConfig } from "./check-config.mjs";

try {
  validateConfig(process.env);
} catch (error) {
  console.error(`Deployment configuration: ${error.message}`);
  process.exit(1);
}

try {
  await import("../server.js");
} catch {
  console.error(
    "Application startup failed; inspect the runtime configuration.",
  );
  process.exitCode = 1;
}
