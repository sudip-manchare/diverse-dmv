import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { getSql, type Transaction } from "./db";
import { ApiError } from "./http";
import { takeProviderBudget } from "./provider-budget";
import type { ProfileData } from "@/shared/contracts";
export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;
export const EMBEDDING_TEMPLATE = "professional-visible-v1";
/** Conservative UTF-8 byte budget keeps even unusual Unicode below 2,048 tokens. */
export function boundedDocument(parts: string[]) {
  let output = "";
  for (const ch of parts.filter(Boolean).join("\n")) {
    if (Buffer.byteLength(output + ch, "utf8") > 1800) break;
    output += ch;
  }
  return output;
}
export const sourceHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export function candidateDocument(p: ProfileData) {
  const visibleRoles = p.intentions.filter(
    (role) => role !== "seeking" || p.seekingVisibility === "members",
  );
  return boundedDocument([
    `Professional intentions: ${visibleRoles.join(", ")}`,
    p.happyToHelp && `Offers help with: ${p.happyToHelp}`,
    p.intentions.includes("mentoring") &&
    p.mentoringAvailability === "accepting"
      ? `Currently offers mentoring: ${p.mentoringTopics}. Audience: ${p.mentoringAudience}. Interaction: ${p.mentoringInteraction}`
      : "",
    p.intentions.includes("hiring")
      ? `Self-reported hiring offer: ${p.opportunitySummary}; organization: ${p.hiringOrganization}; relationship: ${p.hiringRelationship}`
      : "",
    `Skills or learning interests (not verified expertise): ${p.skills.join(", ")}`,
    `Here for (may describe needs or offers): ${p.hereFor}`,
    `Seeks people and help: ${p.lookingToConnectWith}`,
    p.lookingFor && `Needs: ${p.lookingFor}`,
    p.headline && `Professional introduction: ${p.headline}`,
    p.bio && `Professional context: ${p.bio}`,
    p.experienceLevel && `Self-described experience: ${p.experienceLevel}`,
    p.intentions.includes("seeking") && p.seekingVisibility === "members"
      ? `Seeks opportunities: ${p.desiredRoles}; ${p.opportunityTypes}; ${p.careerInterests}; ${p.nextStep}`
      : "",
    p.intentions.includes("networking")
      ? `Learning goals: ${p.learningGoals}; Interests: ${p.networkingInterests}; Collaboration sought: ${p.collaborationIdeas}; Discussion topics: ${p.discussionTopics}`
      : "",
  ]);
}
export function queryDocument(p: ProfileData) {
  if (
    !p.hereFor.trim() ||
    !p.lookingToConnectWith.trim() ||
    !p.intentions.length ||
    !p.skills.length
  )
    return "";
  return boundedDocument([
    `Find people whose capabilities and offers support these goals: ${p.hereFor}`,
    `Desired people, experience or help: ${p.lookingToConnectWith}`,
  ]);
}
export function normalizedVector(value: unknown): number[] {
  if (
    !Array.isArray(value) ||
    value.length !== EMBEDDING_DIMENSIONS ||
    value.some((v) => typeof v !== "number" || !Number.isFinite(v))
  )
    throw new ApiError(
      503,
      "DEPENDENCY_UNAVAILABLE",
      "Matching is unavailable right now. Try again.",
    );
  const norm = Math.hypot(...value);
  if (!Number.isFinite(norm) || norm === 0)
    throw new ApiError(503, "DEPENDENCY_UNAVAILABLE");
  return value.map((v) => v / norm);
}
export const vectorLiteral = (vector: number[]) => `[${vector.join(",")}]`;
export async function embedText(
  input: string,
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY",
) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey)
    throw new ApiError(
      503,
      "DEPENDENCY_UNAVAILABLE",
      "Matching is unavailable right now. Try again.",
    );
  if (!input || Buffer.byteLength(input, "utf8") > 1800)
    throw new ApiError(400, "VALIDATION_FAILED");
  await takeProviderBudget("gemini-minute", 60, 60);
  await takeProviderBudget(
    "gemini-day",
    Math.max(
      1,
      Math.min(10000, Number(process.env.GEMINI_DAILY_CALL_LIMIT) || 500),
    ),
    86400,
  );
  let response: Response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text: input }] },
          taskType,
          outputDimensionality: EMBEDDING_DIMENSIONS,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      },
    );
  } catch {
    throw new ApiError(
      503,
      "DEPENDENCY_UNAVAILABLE",
      "Matching is unavailable right now. Try again.",
    );
  }
  if (!response.ok)
    throw new ApiError(
      503,
      "DEPENDENCY_UNAVAILABLE",
      "Matching is unavailable right now. Try again.",
    );
  const result = await response.json();
  return normalizedVector(result.embedding?.values);
}
export async function enqueueProfileIndex(
  tx: Transaction,
  accountId: string,
  version: number,
) {
  await tx`DELETE FROM query_embeddings WHERE account_id=${accountId}`;
  await tx`INSERT INTO embedding_jobs(account_id,source_version) VALUES(${accountId},${version})
    ON CONFLICT(account_id,source_version) DO UPDATE SET status='pending',attempts=0,next_attempt_at=now(),lease_token=NULL,lease_until=NULL,error_code=NULL`;
}
/** Leased, durable recovery. Every provider call is awaited outside any transaction. */
export async function drainEmbeddingJobs(maximum = 4, accountId?: string) {
  const sql = getSql();
  let completed = 0;
  let failed = 0;
  let obsolete = 0;
  for (let n = 0; n < Math.max(1, Math.min(10, maximum)); n++) {
    const token = randomUUID();
    const jobs =
      await sql`UPDATE embedding_jobs SET status='running',lease_token=${token},lease_until=now()+interval '60 seconds',attempts=attempts+1
      WHERE id=(SELECT id FROM embedding_jobs WHERE (${accountId ?? null}::uuid IS NULL OR account_id=${accountId ?? null}::uuid) AND ((status='pending' AND next_attempt_at<=now()) OR (status='running' AND lease_until<now())) ORDER BY next_attempt_at,id FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id,account_id,source_version,attempts`;
    const job = jobs[0];
    if (!job) break;
    try {
      const sources =
        await sql`SELECT p.*,a.state FROM profiles p JOIN accounts a ON a.id=p.account_id WHERE p.account_id=${job.account_id}`;
      const source = sources[0];
      if (
        !source ||
        !source.published ||
        source.state !== "active" ||
        source.version !== job.source_version
      ) {
        await sql`UPDATE embedding_jobs SET status='obsolete',lease_until=NULL WHERE id=${job.id} AND lease_token=${token}`;
        obsolete++;
        continue;
      }
      const document = candidateDocument(source.data as ProfileData);
      const hash = sourceHash(document);
      const vector = await embedText(document, "RETRIEVAL_DOCUMENT");
      const saved = await sql.begin(async (tx) => {
        const accounts =
          await tx`SELECT state FROM accounts WHERE id=${job.account_id} FOR UPDATE`;
        const current = (
          await tx`SELECT * FROM profiles WHERE account_id=${job.account_id} FOR UPDATE`
        )[0];
        const lease = (
          await tx`SELECT id FROM embedding_jobs WHERE id=${job.id} AND lease_token=${token} AND status='running' FOR UPDATE`
        )[0];
        if (!lease) return false;
        if (
          accounts[0]?.state !== "active" ||
          !current?.published ||
          current.version !== job.source_version ||
          sourceHash(candidateDocument(current.data as ProfileData)) !== hash
        ) {
          await tx`UPDATE embedding_jobs SET status='obsolete',lease_until=NULL WHERE id=${job.id}`;
          return false;
        }
        await tx`INSERT INTO profile_embeddings(account_id,embedding,source_version,source_hash,model,dimensions,template_version)
          VALUES(${job.account_id},${vectorLiteral(vector)}::vector,${job.source_version},${hash},${EMBEDDING_MODEL},${EMBEDDING_DIMENSIONS},${EMBEDDING_TEMPLATE})
          ON CONFLICT(account_id) DO UPDATE SET embedding=excluded.embedding,source_version=excluded.source_version,source_hash=excluded.source_hash,model=excluded.model,dimensions=excluded.dimensions,template_version=excluded.template_version,updated_at=now()`;
        await tx`UPDATE profiles SET indexing_status='ready' WHERE account_id=${job.account_id}`;
        await tx`UPDATE embedding_jobs SET status='complete',lease_until=NULL,error_code=NULL WHERE id=${job.id}`;
        return true;
      });
      if (saved) completed++;
      else obsolete++;
    } catch {
      failed++;
      await sql.begin(async (tx) => {
        await tx`SELECT id FROM accounts WHERE id=${job.account_id} FOR UPDATE`;
        const status = job.attempts >= 5 ? "failed" : "pending";
        await tx`UPDATE profiles SET indexing_status=${status} WHERE account_id=${job.account_id} AND version=${job.source_version} AND published=true
          AND EXISTS(SELECT 1 FROM embedding_jobs WHERE id=${job.id} AND lease_token=${token} AND status='running')`;
        await tx`UPDATE embedding_jobs SET status=${status},lease_until=NULL,error_code='PROVIDER_UNAVAILABLE',next_attempt_at=now()+${Math.min(900, 15 * 2 ** job.attempts)}*interval '1 second'
          WHERE id=${job.id} AND lease_token=${token} AND status='running'`;
      });
    }
  }
  // Eligibility is authoritative immediately; these remove derived records after unpublish/disable.
  await sql`DELETE FROM profile_embeddings e USING profiles p,accounts a WHERE e.account_id=p.account_id AND a.id=p.account_id AND (NOT p.published OR a.state<>'active')`;
  await sql`DELETE FROM query_embeddings q USING profiles p,accounts a WHERE q.account_id=p.account_id AND a.id=p.account_id AND (NOT p.published OR a.state<>'active')`;
  await sql`DELETE FROM provider_budgets WHERE expires_at < now()-interval '1 day'`;
  return { completed, failed, obsolete };
}
export async function queryVector(accountId: string, document: string) {
  const sql = getSql(),
    hash = sourceHash(document),
    token = randomUUID();
  const readCache = async () => {
    const rows =
      await sql`SELECT embedding::text AS embedding FROM query_embeddings WHERE account_id=${accountId} AND input_hash=${hash} AND model=${EMBEDDING_MODEL} AND dimensions=${EMBEDDING_DIMENSIONS} AND template_version=${EMBEDDING_TEMPLATE}`;
    return rows[0]
      ? { hash, vector: JSON.parse(rows[0].embedding) as number[] }
      : null;
  };
  const cached = await readCache();
  if (cached) return cached;
  const claimed =
    await sql`INSERT INTO query_embedding_leases(account_id,input_hash,model,template_version,dimensions,lease_token,lease_until)
    VALUES(${accountId},${hash},${EMBEDDING_MODEL},${EMBEDDING_TEMPLATE},${EMBEDDING_DIMENSIONS},${token},now()+interval '45 seconds')
    ON CONFLICT(account_id,input_hash,model,template_version,dimensions) DO UPDATE SET lease_token=excluded.lease_token,lease_until=excluded.lease_until
    WHERE query_embedding_leases.lease_until < now() RETURNING lease_token`;
  // A competing caller may have completed after our first cache read.
  if (!claimed.length) return readCache();
  try {
    const completedDuringClaim = await readCache();
    if (completedDuringClaim) return completedDuringClaim;
    const vector = await embedText(document, "RETRIEVAL_QUERY");
    // A replaced lease cannot overwrite the work of its successor.
    await sql`INSERT INTO query_embeddings(account_id,input_hash,model,template_version,dimensions,embedding)
      SELECT ${accountId},${hash},${EMBEDDING_MODEL},${EMBEDDING_TEMPLATE},${EMBEDDING_DIMENSIONS},${vectorLiteral(vector)}::vector
      WHERE EXISTS(SELECT 1 FROM query_embedding_leases WHERE account_id=${accountId} AND input_hash=${hash} AND model=${EMBEDDING_MODEL} AND template_version=${EMBEDDING_TEMPLATE} AND dimensions=${EMBEDDING_DIMENSIONS} AND lease_token=${token})
      ON CONFLICT DO NOTHING`;
    return readCache();
  } finally {
    // Await cleanup; expiry still recovers an interrupted request/database outage.
    try {
      await sql`DELETE FROM query_embedding_leases WHERE account_id=${accountId} AND input_hash=${hash} AND model=${EMBEDDING_MODEL} AND template_version=${EMBEDDING_TEMPLATE} AND dimensions=${EMBEDDING_DIMENSIONS} AND lease_token=${token}`;
    } catch {
      /* Lease expires in 45 seconds. */
    }
  }
}

/** A committed profile remains successful even when its provider is unavailable. */
export async function attemptProfileIndex(accountId: string) {
  try {
    await drainEmbeddingJobs(1, accountId);
  } catch {
    /* Durable queue and scheduler retain recovery ownership. */
  }
}
