import "server-only";
import { z } from "zod";
import type {
  Conversation,
  Message,
  MessagesResponse,
} from "@/shared/contracts";
import { getSql } from "./db";
import { ApiError } from "./http";
import { lockPair, requireMessagingPair } from "./pairs";
import { boundedText } from "@/shared/contracts";
import { payloadHash } from "./operations";
interface Cursor {
  time: string;
  id: string;
  conversationId: string;
}
function encodeCursor(
  message: { server_time: Date | string; id: string },
  conversationId: string,
) {
  return Buffer.from(
    JSON.stringify({
      time: new Date(message.server_time).toISOString(),
      id: String(message.id),
      conversationId,
    }),
  ).toString("base64url");
}
function decodeCursor(value: string, conversationId: string): Cursor {
  try {
    if (value.length > 500) throw new Error();
    const parsed = z
      .object({
        time: z.string().datetime(),
        id: z
          .string()
          .regex(/^\d+$/)
          .refine((v) => BigInt(v) <= 9223372036854775807n),
        conversationId: z.string().uuid(),
      })
      .strict()
      .parse(JSON.parse(Buffer.from(value, "base64url").toString()));
    if (parsed.conversationId !== conversationId) throw new Error();
    return parsed;
  } catch {
    throw new ApiError(
      400,
      "VALIDATION_FAILED",
      "This message cursor is invalid. Reopen the conversation.",
    );
  }
}
const mapMessage = (m: Record<string, any>): Message => ({
  id: String(m.id),
  conversationId: m.conversation_id,
  senderId: m.sender_id,
  body: m.body,
  createdAt: new Date(m.server_time).toISOString(),
  clientOperationId: m.client_operation_id,
});
async function conversationInfo(
  actorId: string,
  id: string,
): Promise<Conversation> {
  const [row] =
    await getSql()`SELECT v.*,a.state,p.published,p.data,m.body AS latest_body,
 EXISTS(SELECT 1 FROM connections c WHERE c.low_id=v.low_id AND c.high_id=v.high_id AND c.active=true) AS connected,
 (SELECT published FROM profiles WHERE account_id=${actorId}) AS own_published
 FROM conversations v JOIN accounts a ON a.id=CASE WHEN v.low_id=${actorId} THEN v.high_id ELSE v.low_id END LEFT JOIN profiles p ON p.account_id=a.id LEFT JOIN messages m ON m.id=v.latest_message_id
 WHERE v.id=${id} AND (v.low_id=${actorId} OR v.high_id=${actorId})
 AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=v.low_id AND b.blocked_id=v.high_id) OR (b.blocker_id=v.high_id AND b.blocked_id=v.low_id))`;
  if (!row)
    throw new ApiError(404, "UNAVAILABLE", "This conversation is unavailable.");
  const available = row.state === "active" && row.published;
  return {
    id: row.id,
    recipientId: row.low_id === actorId ? row.high_id : row.low_id,
    displayName: available ? row.data.displayName : "Unavailable member",
    canMessage: available && row.own_published && row.connected,
    latestMessage: row.latest_body || "",
    updatedAt: new Date(row.latest_message_at || row.created_at).toISOString(),
  };
}
export async function listConversations(actorId: string) {
  const rows =
    await getSql()`SELECT v.id FROM conversations v WHERE (v.low_id=${actorId} OR v.high_id=${actorId}) AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=v.low_id AND b.blocked_id=v.high_id) OR (b.blocker_id=v.high_id AND b.blocked_id=v.low_id)) ORDER BY v.latest_message_at DESC,v.id`;
  const conversations: Conversation[] = [];
  for (const r of rows) {
    try {
      conversations.push(await conversationInfo(actorId, r.id));
    } catch (e) {
      if (!(e instanceof ApiError && e.status === 404)) throw e;
    }
  }
  return { conversations };
}
export async function messageHistory(
  actorId: string,
  id: string,
  url: URL,
): Promise<MessagesResponse> {
  z.string().uuid().parse(id);
  const before = url.searchParams.get("before"),
    after = url.searchParams.get("after");
  if (before && after)
    throw new ApiError(
      400,
      "VALIDATION_FAILED",
      "Use one message cursor at a time.",
    );
  const cursor = before || after ? decodeCursor((before || after)!, id) : null;
  const conversation = await conversationInfo(actorId, id);
  const sql = getSql();
  // Authorization is repeated in the data query; a newly committed block cannot leak a later history payload.
  const rows =
    await sql`SELECT m.* FROM messages m JOIN conversations v ON v.id=m.conversation_id WHERE v.id=${id}
 AND (v.low_id=${actorId} OR v.high_id=${actorId})
 AND EXISTS(SELECT 1 FROM accounts WHERE id=${actorId} AND state='active')
 AND NOT EXISTS(SELECT 1 FROM blocks b WHERE (b.blocker_id=v.low_id AND b.blocked_id=v.high_id) OR (b.blocker_id=v.high_id AND b.blocked_id=v.low_id))
 ${cursor ? (before ? sql`AND (m.server_time,m.id)<(${cursor.time}::timestamptz,${cursor.id}::bigint)` : sql`AND (m.server_time,m.id)>(${cursor.time}::timestamptz,${cursor.id}::bigint)`) : sql``}
 ORDER BY ${after ? sql`m.server_time ASC,m.id ASC` : sql`m.server_time DESC,m.id DESC`} LIMIT 31`;
  const hasMore = rows.length > 30;
  const selected = rows.slice(0, 30);
  if (!after) selected.reverse();
  // Revalidate rather than returning even previously read content after a concurrent completed block.
  await conversationInfo(actorId, id);
  return {
    conversation,
    messages: selected.map(mapMessage),
    before: selected.length ? encodeCursor(selected[0] as any, id) : null,
    after: selected.length
      ? encodeCursor(selected[selected.length - 1] as any, id)
      : after || null,
    hasMore,
  };
}
export async function sendMessage(actorId: string, input: unknown) {
  const body = z
    .object({
      recipientId: z.string().uuid(),
      body: boundedText(2000).refine((v) => !!v.trim(), "Enter a message."),
      clientOperationId: z.string().uuid(),
    })
    .strict()
    .parse(input);
  const hash = payloadHash({ recipientId: body.recipientId, body: body.body });
  const result = await getSql().begin(async (tx) => {
    const pair = await lockPair(tx, actorId, body.recipientId);
    requireMessagingPair(pair);
    const [existing] =
      await tx`SELECT * FROM messages WHERE sender_id=${actorId} AND client_operation_id=${body.clientOperationId}`;
    if (existing) {
      if (existing.payload_hash !== hash)
        throw new ApiError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "This message could not be retried safely. Reload the conversation to check its status.",
        );
      return existing;
    }
    const [rate] =
      await tx`SELECT count(*)::int AS count FROM messages WHERE sender_id=${actorId} AND server_time>clock_timestamp()-interval '1 minute'`;
    if (rate.count >= 60)
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "You’re sending too quickly. Try again later.",
      );
    const [conversation] =
      await tx`INSERT INTO conversations(low_id,high_id) VALUES(${pair.low},${pair.high}) ON CONFLICT(low_id,high_id) DO UPDATE SET low_id=EXCLUDED.low_id RETURNING *`;
    const [message] =
      await tx`INSERT INTO messages(conversation_id,sender_id,body,server_time,client_operation_id,payload_hash) VALUES(${conversation.id},${actorId},${body.body},GREATEST(date_trunc('milliseconds',clock_timestamp()),COALESCE(${conversation.latest_message_at}::timestamptz,'-infinity'::timestamptz)),${body.clientOperationId},${hash}) RETURNING *`;
    await tx`UPDATE conversations SET latest_message_id=${message.id},latest_message_at=${message.server_time} WHERE id=${conversation.id}`;
    return message;
  });
  return {
    message: mapMessage(result),
    conversation: await conversationInfo(actorId, result.conversation_id),
  };
}
