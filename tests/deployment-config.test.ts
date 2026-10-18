import test from "node:test";
import assert from "node:assert/strict";
import { validateConfig } from "../deployment/check-config.mjs";

const runtime = {
  APP_ORIGIN: "https://community.example.com",
  DATABASE_URL: "postgres://operator:example@db.example.com/community",
  FIREBASE_PROJECT_ID: "community",
  GEMINI_API_KEY: "test-only",
  INDEXING_JOB_SECRET: "x".repeat(32),
};

test("deployment accepts hosted origins and loopback smoke tests", () => {
  assert.doesNotThrow(() => validateConfig(runtime));
  assert.doesNotThrow(() =>
    validateConfig({ ...runtime, APP_ORIGIN: "http://localhost:8080" }),
  );
  for (const origin of [
    "http://community.example.com",
    "https://community.example.com/",
    "https://community.example.com/path",
  ])
    assert.throws(
      () => validateConfig({ ...runtime, APP_ORIGIN: origin }),
      /APP_ORIGIN/,
    );
});

test("deployment rejects emulator and mixed Firebase project configuration", () => {
  assert.throws(
    () =>
      validateConfig({
        ...runtime,
        FIREBASE_AUTH_EMULATOR_HOST: "localhost:9099",
      }),
    /EMULATOR/,
  );
  assert.throws(
    () =>
      validateConfig({
        ...runtime,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "another-project",
      }),
    /project IDs/,
  );
  assert.throws(
    () =>
      validateConfig({
        ...runtime,
        FIREBASE_SERVICE_ACCOUNT_JSON: '{"private_key":"do-not-print"}',
      }),
    /credential/,
  );
});

test("configuration failures do not disclose supplied secrets", () => {
  assert.throws(
    () =>
      validateConfig({
        ...runtime,
        DATABASE_URL: "private-database-secret",
        FIREBASE_SERVICE_ACCOUNT_JSON: "private-admin-secret",
      }),
    (error: Error) => {
      assert.ok(!error.message.includes("private-database-secret"));
      assert.ok(!error.message.includes("private-admin-secret"));
      return true;
    },
  );
});

test("Maps needs complete configuration or explicit prototype opt-in", () => {
  const maps = {
    ...runtime,
    GOOGLE_MAPS_ENABLED: "true",
    OFFICE_PAGE_TOKEN_SECRET: "y".repeat(32),
  };
  assert.throws(() => validateConfig(maps), /Maps browser key/);
  assert.doesNotThrow(() =>
    validateConfig({
      ...maps,
      NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY: "browser-test",
      GOOGLE_PLACES_SERVER_KEY: "server-test",
    }),
  );
  assert.throws(
    () =>
      validateConfig({ ...maps, REACT_APP_GOOGLE_MAPS_DEMO_KEY: "demo-test" }),
    /Maps browser key/,
  );
  assert.doesNotThrow(() =>
    validateConfig({
      ...maps,
      GOOGLE_MAPS_DEMO_MODE: "true",
      REACT_APP_GOOGLE_MAPS_DEMO_KEY: "demo-test",
    }),
  );
});

test("build fails before producing a client with missing Firebase settings", () => {
  assert.throws(
    () => validateConfig({}, "build"),
    /NEXT_PUBLIC_FIREBASE_API_KEY/,
  );
  assert.doesNotThrow(() =>
    validateConfig(
      {
        NEXT_PUBLIC_FIREBASE_API_KEY: "test",
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "test.firebaseapp.com",
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: "test",
        NEXT_PUBLIC_FIREBASE_APP_ID: "test",
      },
      "build",
    ),
  );
});
