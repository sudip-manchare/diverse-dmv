import test from "node:test";
import assert from "node:assert/strict";
import { GET, POST } from "../src/app/api/jobs/embeddings/route";

test("indexing schedulers fail closed and keep GET/POST credentials separate", async () => {
  const previous = {
    cron: process.env.CRON_SECRET,
    indexing: process.env.INDEXING_JOB_SECRET,
    database: process.env.DATABASE_URL,
  };
  // An authorized request must reach the dependency gate without touching any database.
  process.env.DATABASE_URL = "";
  const cron = "fictional-cron-secret-".repeat(3);
  const indexing = "fictional-post-secret-".repeat(3);
  const request = (method: string, secret?: string) =>
    new Request("https://example.invalid/api/jobs/embeddings", {
      method,
      headers: secret ? { authorization: `Bearer ${secret}` } : {},
    });
  async function check(
    handler: typeof GET,
    method: string,
    secret: string | undefined,
    status: number,
  ) {
    const response = await handler(request(method, secret));
    assert.equal(response.status, status);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(
      (await response.json()).error.code,
      status === 403 ? "NOT_ALLOWED" : "DEPENDENCY_UNAVAILABLE",
    );
  }
  try {
    delete process.env.CRON_SECRET;
    delete process.env.INDEXING_JOB_SECRET;
    await check(GET, "GET", undefined, 403);
    await check(POST, "POST", undefined, 403);
    process.env.CRON_SECRET = "short";
    await check(GET, "GET", "short", 403);
    process.env.CRON_SECRET = cron;
    process.env.INDEXING_JOB_SECRET = indexing;
    await check(GET, "GET", indexing, 403);
    await check(POST, "POST", cron, 403);
    await check(GET, "GET", "é".repeat(cron.length), 403);
    await check(GET, "GET", cron, 503);
    await check(POST, "POST", indexing, 503);
  } finally {
    for (const [name, value] of Object.entries({
      CRON_SECRET: previous.cron,
      INDEXING_JOB_SECRET: previous.indexing,
      DATABASE_URL: previous.database,
    })) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
