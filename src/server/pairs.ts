import "server-only";
import type { Transaction } from "./db";
import { ApiError } from "./http";
import { canonicalPair } from "./policy";
export async function lockPair(
  tx: Transaction,
  actorId: string,
  otherId: string,
) {
  if (actorId === otherId)
    throw new ApiError(400, "VALIDATION_FAILED", "Choose another member.");
  const [low, high] = canonicalPair(actorId, otherId);
  const accounts =
    await tx`SELECT * FROM accounts WHERE id IN (${low},${high}) ORDER BY id FOR UPDATE`;
  if (
    accounts.length !== 2 ||
    accounts.find((a) => a.id === actorId)?.state !== "active"
  )
    throw new ApiError(404, "UNAVAILABLE");
  await tx`INSERT INTO pairs(low_id,high_id) VALUES(${low},${high}) ON CONFLICT DO NOTHING`;
  const [pair] =
    await tx`SELECT * FROM pairs WHERE low_id=${low} AND high_id=${high} FOR UPDATE`;
  const blocks =
    await tx`SELECT id FROM blocks WHERE (blocker_id=${low} AND blocked_id=${high}) OR (blocker_id=${high} AND blocked_id=${low})`;
  const [connection] =
    await tx`SELECT * FROM connections WHERE low_id=${low} AND high_id=${high}`;
  const [pending] =
    await tx`SELECT * FROM requests WHERE low_id=${low} AND high_id=${high} AND status='pending'`;
  const profiles =
    await tx`SELECT * FROM profiles WHERE account_id IN (${low},${high})`;
  return {
    low,
    high,
    pair,
    accounts,
    blocked: blocks.length > 0,
    connection,
    pending,
    profiles,
  };
}
type PairContext = Awaited<ReturnType<typeof lockPair>>;
export function requireVisiblePair(context: PairContext) {
  if (
    context.blocked ||
    context.accounts.some((a) => a.state !== "active") ||
    context.profiles.length !== 2 ||
    context.profiles.some((p) => !p.published)
  )
    throw new ApiError(404, "UNAVAILABLE", "This member is unavailable.");
}
export function requireMessagingPair(context: PairContext) {
  requireVisiblePair(context);
  if (!context.connection?.active)
    throw new ApiError(403, "NOT_ALLOWED", "Connect before you can message.");
}
