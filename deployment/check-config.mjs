import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const publicFirebase = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
];

export function validateConfig(env, phase = "runtime") {
  const errors = [];
  const present = (key) => Boolean(env[key]?.trim());
  const required = (key) => {
    if (!present(key)) errors.push(`${key} is required`);
  };
  const secret = (key) => {
    if ((env[key]?.length || 0) < 32)
      errors.push(`${key} must contain at least 32 characters`);
  };
  if (phase === "build") {
    publicFirebase.forEach(required);
  } else {
    ["APP_ORIGIN", "DATABASE_URL", "FIREBASE_PROJECT_ID"].forEach(required);
    try {
      const origin = new URL(env.APP_ORIGIN);
      const local = ["localhost", "127.0.0.1", "[::1]"].includes(
        origin.hostname,
      );
      if (
        origin.origin !== env.APP_ORIGIN ||
        (origin.protocol !== "https:" &&
          !(local && origin.protocol === "http:"))
      )
        errors.push(
          "APP_ORIGIN must be an exact HTTPS origin (HTTP is allowed on loopback)",
        );
    } catch {
      errors.push("APP_ORIGIN must be a valid origin");
    }
    try {
      if (
        !["postgres:", "postgresql:"].includes(
          new URL(env.DATABASE_URL).protocol,
        )
      )
        errors.push("DATABASE_URL must use PostgreSQL");
    } catch {
      errors.push("DATABASE_URL must be a valid PostgreSQL URL");
    }
    if (env.DATABASE_SSL && !["require", "disable"].includes(env.DATABASE_SSL))
      errors.push("DATABASE_SSL must be require or disable");
    if (!present("GEMINI_API_KEY") && !present("GOOGLE_API_KEY"))
      errors.push("GEMINI_API_KEY (or GOOGLE_API_KEY) is required");
    if (present("INDEXING_JOB_SECRET")) secret("INDEXING_JOB_SECRET");
    if (present("CRON_SECRET")) secret("CRON_SECRET");
    for (const key of [
      "FIREBASE_AUTH_EMULATOR_HOST",
      "NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_URL",
    ])
      if (present(key))
        errors.push(`${key} must be unset in the deployment image`);
    if (
      present("NEXT_PUBLIC_FIREBASE_PROJECT_ID") &&
      env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== env.FIREBASE_PROJECT_ID
    )
      errors.push("Firebase browser and server project IDs must match");
    // Omitting an explicit credential permits the provider's Application Default Credentials.
    if (
      present("FIREBASE_SERVICE_ACCOUNT_JSON") ||
      present("GOOGLE_APPLICATION_CREDENTIALS")
    ) {
      try {
        const account = JSON.parse(
          env.FIREBASE_SERVICE_ACCOUNT_JSON ||
            readFileSync(env.GOOGLE_APPLICATION_CREDENTIALS, "utf8"),
        );
        if (
          !account.client_email ||
          !account.private_key ||
          account.project_id !== env.FIREBASE_PROJECT_ID
        )
          errors.push(
            "Firebase Admin credential must belong to FIREBASE_PROJECT_ID",
          );
      } catch {
        errors.push("Firebase Admin credential must be readable, valid JSON");
      }
    }
    if (env.GOOGLE_MAPS_ENABLED === "true") {
      const demoKey =
        env.GOOGLE_MAPS_DEMO_MODE === "true" &&
        present("REACT_APP_GOOGLE_MAPS_DEMO_KEY");
      if (!present("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY") && !demoKey)
        errors.push("A Maps browser key is required when Maps is enabled");
      if (!present("GOOGLE_PLACES_SERVER_KEY") && !demoKey)
        errors.push("A Places server key is required when Maps is enabled");
      secret("OFFICE_PAGE_TOKEN_SECRET");
    }
  }
  if (errors.length) throw new Error(errors.join("; "));
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    validateConfig(process.env, process.argv[2]);
  } catch (error) {
    console.error(`Deployment configuration: ${error.message}`);
    process.exitCode = 1;
  }
}
