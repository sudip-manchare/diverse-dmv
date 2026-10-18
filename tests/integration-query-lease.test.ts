import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { getSql } from "../src/server/db";
import {
  queryVector,
  sourceHash,
  EMBEDDING_MODEL,
  EMBEDDING_TEMPLATE,
  EMBEDDING_DIMENSIONS,
} from "../src/server/embeddings";
test(
  "durable real query lease: overlap, cache outage, expired recovery, failure cleanup and successor protection",
  { skip: process.env.RUN_LIVE_DISCOVERY_TESTS !== "true" },
  async () => {
    const sql = getSql(),
      id = randomUUID(),
      realFetch = globalThis.fetch;
    const key = process.env.GEMINI_API_KEY,
      legacy = process.env.GOOGLE_API_KEY;
    const restoreKeys = () => {
      if (key) process.env.GEMINI_API_KEY = key;
      if (legacy) process.env.GOOGLE_API_KEY = legacy;
    };
    async function deferredQuery(document: string) {
      let notify!: () => void, release!: () => void;
      const started = new Promise<void>((resolve) => {
        notify = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      let intercepted = false;
      globalThis.fetch = async (input, init) => {
        if (!intercepted && String(input).includes(":embedContent")) {
          intercepted = true;
          notify();
          await gate;
        }
        return realFetch(input, init);
      };
      const pending = queryVector(id, document);
      await Promise.race([
        started,
        new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Embedding request did not start")),
            15000,
          ).unref(),
        ),
      ]);
      return { pending, release };
    }
    try {
      await sql`INSERT INTO accounts(id,auth_uid,name,email) VALUES(${id},${"lease-test-" + id},'Fictional query lease test',${id + "@example.test"})`;
      const document = "Find fictional frontend accessibility mentors.";
      const first = await deferredQuery(document);
      assert.equal(
        await queryVector(id, document),
        null,
        "overlap must report pending without duplicate provider request",
      );
      first.release();
      const ready = await first.pending;
      assert.equal(ready?.vector.length, 768);
      globalThis.fetch = realFetch;
      assert.equal(
        (await sql`SELECT * FROM query_embedding_leases WHERE account_id=${id}`)
          .length,
        0,
      );
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      assert.deepEqual(
        await queryVector(id, document),
        ready,
        "current cache remains usable during outage",
      );
      await assert.rejects(
        () => queryVector(id, "Find fictional database engineering mentors."),
        { code: "DEPENDENCY_UNAVAILABLE" },
      );
      assert.equal(
        (await sql`SELECT * FROM query_embedding_leases WHERE account_id=${id}`)
          .length,
        0,
        "failed generation releases lease",
      );
      restoreKeys();
      const expired = "Find fictional Python data pipeline guidance.";
      await sql`INSERT INTO query_embedding_leases(account_id,input_hash,model,template_version,dimensions,lease_token,lease_until) VALUES(${id},${sourceHash(expired)},${EMBEDDING_MODEL},${EMBEDDING_TEMPLATE},${EMBEDDING_DIMENSIONS},${randomUUID()},now()-interval '1 minute')`;
      assert.equal((await queryVector(id, expired))?.vector.length, 768);
      assert.equal(
        (await sql`SELECT * FROM query_embedding_leases WHERE account_id=${id}`)
          .length,
        0,
      );
      const replaced = "Find fictional people offering TypeScript review.";
      const stale = await deferredQuery(replaced);
      const successor = randomUUID();
      await sql`UPDATE query_embedding_leases SET lease_token=${successor},lease_until=now()+interval '45 seconds' WHERE account_id=${id} AND input_hash=${sourceHash(replaced)}`;
      stale.release();
      assert.equal(await stale.pending, null);
      globalThis.fetch = realFetch;
      assert.equal(
        (
          await sql`SELECT lease_token FROM query_embedding_leases WHERE account_id=${id}`
        )[0].lease_token,
        successor,
        "obsolete request cannot release successor lease",
      );
      assert.equal(
        (
          await sql`SELECT * FROM query_embeddings WHERE account_id=${id} AND input_hash=${sourceHash(replaced)}`
        ).length,
        0,
      );
    } finally {
      globalThis.fetch = realFetch;
      restoreKeys();
      await sql`DELETE FROM accounts WHERE id=${id}`;
      await sql.end();
    }
  },
);
