import "server-only";
import { z } from "zod";
import { boundedText } from "@/shared/contracts";
import { getSql } from "./db";
import { ApiError } from "./http";
import { lockPair, requireVisiblePair } from "./pairs";
import { memberProfile } from "./profiles";
import { replayOperation, saveOperation } from "./operations";
import { operationSchema } from "./validation";
const REQUESTS_PER_DAY = 20;
export async function sendRequest(actorId: string, input: unknown) {
  const body = z
    .object({
      recipientId: z.string().uuid(),
      introduction: boundedText(500).optional().default(""),
      operationId: z.string().uuid(),
    })
    .strict()
    .parse(input);
  return getSql().begin(async (tx) => {
    const pair = await lockPair(tx, actorId, body.recipientId);
    requireVisiblePair(pair);
    const payload = {
      recipientId: body.recipientId,
      introduction: body.introduction,
    };
    const prior = await replayOperation(
      tx,
      actorId,
      body.operationId,
      "request",
      payload,
    );
    if (prior) {
      const [current] =
        await tx`SELECT id,status FROM requests WHERE id=${prior.request.id}`;
      return { request: current };
    }
    if (pair.pending || pair.connection?.active)
      throw new ApiError(
        409,
        "STALE_STATE",
        "This relationship has changed. Review your requests or connections.",
      );
    if (
      pair.pair.cooldown_until &&
      new Date(pair.pair.cooldown_until) > new Date()
    )
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "You can send another request after the waiting period.",
        undefined,
        new Date(pair.pair.cooldown_until).toISOString(),
      );
    const [count] =
      await tx`SELECT count(*)::int AS count,min(created_at) AS earliest FROM requests WHERE sender_id=${actorId} AND created_at>clock_timestamp()-interval '24 hours'`;
    if (count.count >= REQUESTS_PER_DAY)
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "You have reached the request limit. Try again later.",
        undefined,
        new Date(new Date(count.earliest).getTime() + 86400000).toISOString(),
      );
    const [request] =
      await tx`INSERT INTO requests(low_id,high_id,sender_id,recipient_id,introduction) VALUES(${pair.low},${pair.high},${actorId},${body.recipientId},${body.introduction}) RETURNING id,status`;
    return saveOperation(tx, actorId, body.operationId, "request", payload, {
      request,
    });
  });
}
export async function transitionRequest(
  actorId: string,
  id: string,
  action: "accept" | "decline" | "cancel",
  input: unknown,
) {
  z.string().uuid().parse(id);
  const { operationId } = operationSchema.parse(input);
  const sql = getSql();
  const [initial] =
    await sql`SELECT * FROM requests WHERE id=${id} AND (sender_id=${actorId} OR recipient_id=${actorId})`;
  if (!initial) throw new ApiError(404, "UNAVAILABLE");
  return sql.begin(async (tx) => {
    const other =
      initial.sender_id === actorId ? initial.recipient_id : initial.sender_id;
    const pair = await lockPair(tx, actorId, other);
    requireVisiblePair(pair);
    const [request] = await tx`SELECT * FROM requests WHERE id=${id}`;
    if (
      (action === "cancel" && request.sender_id !== actorId) ||
      (action !== "cancel" && request.recipient_id !== actorId)
    )
      throw new ApiError(403, "NOT_ALLOWED");
    const prior = await replayOperation(tx, actorId, operationId, action, {
      id,
    });
    if (prior)
      return {
        request: { id, status: request.status },
        connectionId: pair.connection?.active ? pair.connection.id : undefined,
      };
    if (request.status !== "pending")
      throw new ApiError(
        409,
        "STALE_STATE",
        "This request has changed. Refresh requests.",
      );
    const status =
      action === "accept"
        ? "accepted"
        : action === "decline"
          ? "declined"
          : "cancelled";
    await tx`UPDATE requests SET status=${status},updated_at=clock_timestamp() WHERE id=${id}`;
    let connectionId;
    if (action === "accept") {
      const [connection] =
        await tx`INSERT INTO connections(low_id,high_id) VALUES(${pair.low},${pair.high}) ON CONFLICT(low_id,high_id) DO UPDATE SET active=true,accepted_at=clock_timestamp(),removed_at=NULL RETURNING id`;
      connectionId = connection.id;
    } else
      await tx`UPDATE pairs SET cooldown_until=clock_timestamp()+interval '7 days' WHERE low_id=${pair.low} AND high_id=${pair.high}`;
    return saveOperation(
      tx,
      actorId,
      operationId,
      action,
      { id },
      { request: { id, status }, ...(connectionId ? { connectionId } : {}) },
    );
  });
}
export async function listRequests(actorId: string) {
  const rows =
    await getSql()`SELECT r.* FROM requests r WHERE (sender_id=${actorId} OR recipient_id=${actorId}) AND status='pending' AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=r.low_id AND b.blocked_id=r.high_id) OR (b.blocker_id=r.high_id AND b.blocked_id=r.low_id)) ORDER BY created_at DESC`;
  const result: { incoming: unknown[]; outgoing: unknown[] } = {
    incoming: [],
    outgoing: [],
  };
  for (const r of rows) {
    const other = r.sender_id === actorId ? r.recipient_id : r.sender_id;
    try {
      const member = await memberProfile(actorId, other);
      result[r.sender_id === actorId ? "outgoing" : "incoming"].push({
        id: r.id,
        senderId: r.sender_id,
        recipientId: r.recipient_id,
        introduction: r.introduction,
        createdAt: new Date(r.created_at).toISOString(),
        status: r.status,
        member,
      });
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
    }
  }
  return result;
}
export async function listConnections(actorId: string) {
  const rows =
    await getSql()`SELECT c.*,v.id AS conversation_id FROM connections c LEFT JOIN conversations v ON v.low_id=c.low_id AND v.high_id=c.high_id WHERE (c.low_id=${actorId} OR c.high_id=${actorId}) AND c.active=true ORDER BY c.accepted_at DESC`;
  const connections = [];
  for (const r of rows) {
    try {
      connections.push({
        id: r.id,
        member: await memberProfile(
          actorId,
          r.low_id === actorId ? r.high_id : r.low_id,
        ),
        conversationId: r.conversation_id,
      });
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
    }
  }
  return { connections };
}
export async function removeConnection(
  actorId: string,
  id: string,
  input: unknown,
) {
  z.string().uuid().parse(id);
  const { operationId } = operationSchema.parse(input);
  const sql = getSql();
  const [initial] =
    await sql`SELECT * FROM connections WHERE id=${id} AND (low_id=${actorId} OR high_id=${actorId})`;
  if (!initial) throw new ApiError(404, "UNAVAILABLE");
  return sql.begin(async (tx) => {
    const pair = await lockPair(
      tx,
      actorId,
      initial.low_id === actorId ? initial.high_id : initial.low_id,
    );
    if (pair.blocked) throw new ApiError(404, "UNAVAILABLE");
    const prior = await replayOperation(tx, actorId, operationId, "remove", {
      id,
    });
    if (prior) return prior;
    if (!pair.connection?.active) throw new ApiError(409, "STALE_STATE");
    await tx`UPDATE connections SET active=false,removed_at=clock_timestamp() WHERE id=${id}`;
    await tx`UPDATE pairs SET cooldown_until=clock_timestamp()+interval '7 days' WHERE low_id=${pair.low} AND high_id=${pair.high}`;
    return saveOperation(
      tx,
      actorId,
      operationId,
      "remove",
      { id },
      { ok: true },
    );
  });
}
export async function blockMember(actorId: string, input: unknown) {
  const body = z
    .object({ blockedId: z.string().uuid(), operationId: z.string().uuid() })
    .strict()
    .parse(input);
  return getSql().begin(async (tx) => {
    const pair = await lockPair(tx, actorId, body.blockedId);
    const prior = await replayOperation(
      tx,
      actorId,
      body.operationId,
      "block",
      { id: body.blockedId },
    );
    if (prior) {
      const [current] =
        await tx`SELECT id FROM blocks WHERE blocker_id=${actorId} AND blocked_id=${body.blockedId}`;
      return { block: current || null };
    }
    const [block] =
      await tx`INSERT INTO blocks(blocker_id,blocked_id) VALUES(${actorId},${body.blockedId}) ON CONFLICT(blocker_id,blocked_id) DO UPDATE SET blocker_id=EXCLUDED.blocker_id RETURNING id`;
    await tx`UPDATE requests SET status='blocked',updated_at=clock_timestamp() WHERE low_id=${pair.low} AND high_id=${pair.high} AND status='pending'`;
    await tx`UPDATE connections SET active=false,removed_at=clock_timestamp() WHERE low_id=${pair.low} AND high_id=${pair.high} AND active=true`;
    await tx`UPDATE pairs SET cooldown_until=clock_timestamp()+interval '7 days' WHERE low_id=${pair.low} AND high_id=${pair.high}`;
    return saveOperation(
      tx,
      actorId,
      body.operationId,
      "block",
      { id: body.blockedId },
      { block },
    );
  });
}
export async function listBlocks(actorId: string) {
  const rows =
    await getSql()`SELECT b.id,b.blocked_id FROM blocks b WHERE b.blocker_id=${actorId} ORDER BY b.created_at DESC`;
  // No cached name/profile leaks through the blocked member's current unpublished state.
  return {
    blocks: rows.map((r) => ({
      id: r.id,
      blockedId: r.blocked_id,
      name: "Blocked member",
    })),
  };
}
export async function unblockMember(
  actorId: string,
  id: string,
  input: unknown,
) {
  z.string().uuid().parse(id);
  const { operationId } = operationSchema.parse(input);
  const sql = getSql();
  const [block] =
    await sql`SELECT * FROM blocks WHERE id=${id} AND blocker_id=${actorId}`;
  if (!block) {
    return sql.begin(async (tx) => {
      const [actor] =
        await tx`SELECT state FROM accounts WHERE id=${actorId} FOR UPDATE`;
      if (actor?.state !== "active") throw new ApiError(401, "UNAUTHENTICATED");
      const prior = await replayOperation(tx, actorId, operationId, "unblock", {
        id,
      });
      if (prior) return prior;
      return saveOperation(
        tx,
        actorId,
        operationId,
        "unblock",
        { id },
        { ok: true },
      );
    });
  }
  return sql.begin(async (tx) => {
    await lockPair(tx, actorId, block.blocked_id);
    const prior = await replayOperation(tx, actorId, operationId, "unblock", {
      id,
    });
    if (prior) return prior;
    await tx`DELETE FROM blocks WHERE id=${id} AND blocker_id=${actorId}`;
    return saveOperation(
      tx,
      actorId,
      operationId,
      "unblock",
      { id },
      { ok: true },
    );
  });
}
