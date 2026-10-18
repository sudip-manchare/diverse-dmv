import { createHash } from "node:crypto";
import type { Transaction } from "./db";
import { ApiError } from "./http";
export const payloadHash = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
export async function replayOperation(
  tx: Transaction,
  actorId: string,
  id: string,
  action: string,
  payload: unknown,
) {
  const [prior] =
    await tx`SELECT * FROM operations WHERE actor_id=${actorId} AND operation_id=${id}`;
  if (!prior) return null;
  if (prior.action !== action || prior.payload_hash !== payloadHash(payload))
    throw new ApiError(
      409,
      "IDEMPOTENCY_CONFLICT",
      "This action could not be retried safely. Refresh its status before trying again.",
    );
  return prior.result;
}
export async function saveOperation(
  tx: Transaction,
  actorId: string,
  id: string,
  action: string,
  payload: unknown,
  result: unknown,
) {
  await tx`INSERT INTO operations(actor_id,operation_id,action,payload_hash,result) VALUES(${actorId},${id},${action},${payloadHash(payload)},${tx.json(result as never)})`;
  return result;
}
