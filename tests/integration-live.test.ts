import { test } from "node:test";
import assert from "node:assert/strict";
import { getSql } from "../src/server/db";
import { recommendations } from "../src/server/discovery";
import {
  ownProfile,
  editProfile,
  publishProfile,
} from "../src/server/profiles";
import {
  drainEmbeddingJobs,
  enqueueProfileIndex,
} from "../src/server/embeddings";
const live = process.env.RUN_LIVE_DISCOVERY_TESTS === "true";
const A = "30000000-0000-4000-8000-000000000001",
  B = "30000000-0000-4000-8000-000000000002",
  C = "30000000-0000-4000-8000-000000000003";
test(
  "real Gemini → stored pgvector → changed-intent retrieval, visibility, stale-version and lease recovery",
  { skip: !live },
  async () => {
    const sql = getSql();
    try {
      const vectors =
        await sql`SELECT account_id,vector_dims(embedding) AS dims,source_version,model FROM profile_embeddings WHERE account_id IN (${A},${B},${C})`;
      assert.equal(vectors.length, 3);
      assert.ok(
        vectors.every(
          (v) => v.dims === 768 && v.model === "gemini-embedding-001",
        ),
      );
      let a = (await ownProfile(A)).profile;
      await editProfile(A, {
        version: a.version,
        cosmeticVersion: a.cosmeticVersion,
        data: {
          hereFor: "Learn accessible frontend development with React.",
          lookingToConnectWith:
            "Frontend developers offering React, TypeScript and web accessibility mentoring.",
        },
      });
      const first = await recommendations(A);
      assert.equal(
        first.profiles.filter((p) => p.id === B || p.id === C)[0]?.id,
        B,
      );
      const firstHash = (
        await sql`SELECT input_hash FROM query_embeddings WHERE account_id=${A}`
      )[0].input_hash;
      a = (await ownProfile(A)).profile;
      await editProfile(A, {
        version: a.version,
        cosmeticVersion: a.cosmeticVersion,
        data: {
          hereFor:
            "Build PostgreSQL databases and Python data engineering pipelines.",
          lookingToConnectWith:
            "Data engineering mentors offering PostgreSQL tuning, SQL and Python pipeline guidance.",
        },
      });
      const second = await recommendations(A);
      assert.equal(
        second.profiles.filter((p) => p.id === B || p.id === C)[0]?.id,
        C,
      );
      const secondHash = (
        await sql`SELECT input_hash FROM query_embeddings WHERE account_id=${A}`
      )[0].input_hash;
      assert.notEqual(secondHash, firstHash);
      let c = (await ownProfile(C)).profile;
      await publishProfile(C, { version: c.version }, false);
      assert.ok(!(await recommendations(A)).profiles.some((p) => p.id === C));
      c = (await ownProfile(C)).profile;
      const publicationKey = process.env.GEMINI_API_KEY,
        publicationLegacyKey = process.env.GOOGLE_API_KEY;
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      try {
        await publishProfile(C, { version: c.version }, true);
      } finally {
        if (publicationKey) process.env.GEMINI_API_KEY = publicationKey;
        if (publicationLegacyKey)
          process.env.GOOGLE_API_KEY = publicationLegacyKey;
      }

      assert.ok(
        !(await recommendations(A)).profiles.some((p) => p.id === C),
        "old vector must not satisfy republished version",
      );
      await sql`UPDATE embedding_jobs SET next_attempt_at=now() WHERE account_id=${C} AND status='pending'`;
      await drainEmbeddingJobs(10);
      assert.ok((await recommendations(A)).profiles.some((p) => p.id === C));
      await sql`INSERT INTO blocks(blocker_id,blocked_id) VALUES(${C},${A}) ON CONFLICT DO NOTHING`;
      assert.ok(!(await recommendations(A)).profiles.some((p) => p.id === C));
      await sql`DELETE FROM blocks WHERE blocker_id=${C} AND blocked_id=${A}`;
      // Persist a running job with an expired lease, simulating an interrupted worker.
      const b = (await ownProfile(B)).profile;
      await sql.begin(async (tx) => {
        await enqueueProfileIndex(tx, B, b.version);
        await tx`UPDATE profiles SET indexing_status='pending' WHERE account_id=${B}`;
        await tx`UPDATE embedding_jobs SET status='running',lease_until=now()-interval '1 minute',lease_token=gen_random_uuid() WHERE account_id=${B} AND source_version=${b.version}`;
      });
      assert.ok(!(await recommendations(A)).profiles.some((p) => p.id === B));
      const recovered = await drainEmbeddingJobs(10);
      assert.ok(recovered.completed >= 1);
      assert.ok((await recommendations(A)).profiles.some((p) => p.id === B));
      // Pause an actual outbound embedding call, then commit a newer source version.
      const beforeRace = (await ownProfile(B)).profile;
      await sql.begin(async (tx) => {
        await enqueueProfileIndex(tx, B, beforeRace.version);
        await tx`UPDATE profiles SET indexing_status='pending' WHERE account_id=${B}`;
      });
      const realFetch = globalThis.fetch;
      let announceStart!: () => void;
      let releaseProvider!: () => void;
      const started = new Promise<void>((resolve) => {
        announceStart = resolve;
      });
      const released = new Promise<void>((resolve) => {
        releaseProvider = resolve;
      });
      let intercepted = false;
      globalThis.fetch = async (input, init) => {
        if (!intercepted && String(input).includes(":embedContent")) {
          intercepted = true;
          announceStart();
          await released;
        }
        return realFetch(input, init);
      };
      const staleWork = drainEmbeddingJobs(1, B);
      try {
        await Promise.race([
          started,
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error("Worker did not reach provider")),
              10000,
            ).unref(),
          ),
        ]);
        await sql.begin(async (tx) => {
          await tx`SELECT id FROM accounts WHERE id=${B} FOR UPDATE`;
          await tx`UPDATE profiles SET version=version+1,indexing_status='pending' WHERE account_id=${B}`;
          await enqueueProfileIndex(tx, B, beforeRace.version + 1);
        });
        releaseProvider();
        const staleResult = await staleWork;
        assert.equal(staleResult.obsolete, 1);
        assert.equal(
          (
            await sql`SELECT source_version FROM profile_embeddings WHERE account_id=${B}`
          )[0].source_version,
          beforeRace.version,
        );
        assert.ok(!(await recommendations(A)).profiles.some((p) => p.id === B));
      } finally {
        releaseProvider();
        globalThis.fetch = realFetch;
      }
      // Missing provider access is a controlled outage; it must preserve the committed source.
      const key = process.env.GEMINI_API_KEY,
        legacyKey = process.env.GOOGLE_API_KEY;
      delete process.env.GEMINI_API_KEY;
      delete process.env.GOOGLE_API_KEY;
      try {
        const failed = await drainEmbeddingJobs(1, B);
        assert.equal(failed.failed, 1);
        const job = (
          await sql`SELECT status,attempts,next_attempt_at FROM embedding_jobs WHERE account_id=${B} AND source_version=${beforeRace.version + 1}`
        )[0];
        assert.equal(job.status, "pending");
        assert.equal(job.attempts, 1);
        assert.ok(new Date(job.next_attempt_at) > new Date());
        assert.equal(
          (await ownProfile(B)).profile.version,
          beforeRace.version + 1,
        );
      } finally {
        if (key) process.env.GEMINI_API_KEY = key;
        if (legacyKey) process.env.GOOGLE_API_KEY = legacyKey;
      }
      await sql`UPDATE embedding_jobs SET next_attempt_at=now() WHERE account_id=${B} AND source_version=${beforeRace.version + 1}`;
      assert.equal((await drainEmbeddingJobs(1, B)).completed, 1);
      assert.equal(
        (
          await sql`SELECT source_version FROM profile_embeddings WHERE account_id=${B}`
        )[0].source_version,
        beforeRace.version + 1,
      );
      console.log(
        JSON.stringify({
          evidence: "live-discovery",
          database:
            process.env.TEST_DATABASE_LABEL ||
            "local PostgreSQL 17 + pgvector (not Tiger Data)",
          storedVectors: vectors.length,
          dimensions: 768,
          firstRecommended: B,
          afterIntentChange: C,
          checks: [
            "current stored embeddings",
            "changed intent + changed query hash",
            "immediate unpublish",
            "stale version exclusion",
            "republication indexing",
            "reverse block exclusion",
            "expired lease recovery",
            "in-flight stale completion rejected",
            "provider failure preserves source + backs off",
            "provider recovery stores latest version",
          ],
        }),
      );
    } finally {
      await sql`DELETE FROM blocks WHERE blocker_id=${C} AND blocked_id=${A}`;
      await sql.end();
    }
  },
);
