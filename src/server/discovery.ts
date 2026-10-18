import "server-only";
import { getSql } from "./db";
import { projectProfileData } from "./policy";
import { ApiError } from "./http";
import {
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
  EMBEDDING_TEMPLATE,
  queryDocument,
  queryVector,
  sourceHash,
  vectorLiteral,
} from "./embeddings";
import type {
  ProfileData,
  ProfileProjection,
  RecommendationsResponse,
} from "@/shared/contracts";
function recommendationReason(p: ProfileProjection): string {
  if (
    p.intentions.includes("mentoring") &&
    p.mentoringAvailability === "accepting" &&
    p.mentoringTopics
  )
    return `Offers mentoring in ${p.mentoringTopics.slice(0, 120)}`;
  if (p.intentions.includes("hiring") && p.opportunitySummary)
    return `Shares a hiring opportunity · self-reported`;
  if (p.happyToHelp) return `Happy to help with ${p.happyToHelp.slice(0, 120)}`;
  if (p.skills.length)
    return `Skills or interests include ${p.skills.slice(0, 3).join(", ")}`;
  return "Open to professional connections";
}
export async function recommendations(
  accountId: string,
): Promise<RecommendationsResponse> {
  const sql = getSql();
  const own = (
    await sql`SELECT p.*,a.state FROM profiles p JOIN accounts a ON a.id=p.account_id WHERE p.account_id=${accountId}`
  )[0];
  if (!own || own.state !== "active")
    throw new ApiError(401, "UNAUTHENTICATED");
  const document = queryDocument(own.data as ProfileData);
  if (!own.published || !document)
    return { status: "setup_required", profiles: [] };
  const query = await queryVector(accountId, document);
  // The query cache is private and input-bound. Check intent again after the provider call.
  const refreshed = (
    await sql`SELECT p.*,a.state FROM profiles p JOIN accounts a ON a.id=p.account_id WHERE p.account_id=${accountId}`
  )[0];
  if (!refreshed?.published || refreshed.state !== "active")
    return { status: "setup_required", profiles: [] };
  if (
    sourceHash(queryDocument(refreshed.data as ProfileData)) !==
    (query?.hash ?? sourceHash(document))
  )
    throw new ApiError(
      409,
      "STALE_STATE",
      "Your matching information changed. Refresh recommendations.",
    );
  if (!query) return { status: "indexing", profiles: [] };
  const rows = await sql`
    SELECT p.*,pair.cooldown_until FROM profiles p
    JOIN accounts a ON a.id=p.account_id
    JOIN profile_embeddings e ON e.account_id=p.account_id
    LEFT JOIN pairs pair ON pair.low_id=LEAST(p.account_id,${accountId}::uuid) AND pair.high_id=GREATEST(p.account_id,${accountId}::uuid)
    WHERE p.account_id<>${accountId} AND p.published=true AND a.state='active'
      AND p.indexing_status='ready' AND e.source_version=p.version
      AND e.model=${EMBEDDING_MODEL} AND e.dimensions=${EMBEDDING_DIMENSIONS} AND e.template_version=${EMBEDDING_TEMPLATE}
      AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=${accountId} AND b.blocked_id=p.account_id) OR (b.blocked_id=${accountId} AND b.blocker_id=p.account_id))
      AND NOT EXISTS(SELECT 1 FROM connections c WHERE c.low_id=LEAST(p.account_id,${accountId}::uuid) AND c.high_id=GREATEST(p.account_id,${accountId}::uuid) AND c.active=true)
      AND NOT EXISTS(SELECT 1 FROM requests r WHERE r.low_id=LEAST(p.account_id,${accountId}::uuid) AND r.high_id=GREATEST(p.account_id,${accountId}::uuid) AND r.status='pending')
    ORDER BY e.embedding <=> ${vectorLiteral(query.vector)}::vector,p.account_id LIMIT 20`;
  return {
    status: "ready",
    profiles: rows.map((row) => {
      const data = projectProfileData(row.data as ProfileData, "member");
      return {
        id: row.account_id,
        data,
        relationship: "none",
        canMessage: false,
        reason: recommendationReason(data),
        ...(row.cooldown_until && new Date(row.cooldown_until) > new Date()
          ? { retryAt: new Date(row.cooldown_until).toISOString() }
          : {}),
      };
    }),
  };
}
