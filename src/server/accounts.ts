import "server-only";
import { z } from "zod";
import { getSql } from "./db";
import { ownProfile } from "./profiles";
import { phoneSchema, operationSchema } from "./validation";
import { boundedText } from "@/shared/contracts";
import { ApiError } from "./http";
import type { AccountRow } from "./auth";
import { replayOperation, saveOperation } from "./operations";
export async function ownAccount(account: AccountRow) {
  const [request] =
    await getSql()`SELECT id,status,created_at FROM deletion_requests WHERE account_id=${account.id}`;
  const { profile } = await ownProfile(account.id);
  return {
    account: {
      id: account.id,
      name: account.name,
      email: account.email,
      phone: account.phone,
      deletionRequest: request
        ? {
            id: request.id,
            status: request.status,
            createdAt: new Date(request.created_at).toISOString(),
          }
        : null,
    },
    profile,
  };
}
export async function editAccount(account: AccountRow, input: unknown) {
  const body = z
    .object({
      name: boundedText(100)
        .refine((v) => !!v.trim(), "Enter your name.")
        .optional(),
      phone: phoneSchema.optional(),
    })
    .strict()
    .parse(input);
  const [updated] =
    await getSql()`UPDATE accounts SET name=${body.name ?? account.name},phone=${body.phone === undefined ? account.phone : body.phone || null},updated_at=clock_timestamp() WHERE id=${account.id} AND state='active' RETURNING *`;
  if (!updated) throw new ApiError(401, "UNAUTHENTICATED");
  return ownAccount(updated as AccountRow);
}
export async function requestDeletion(actorId: string, input: unknown) {
  const { operationId } = operationSchema.parse(input);
  return getSql().begin(async (tx) => {
    const [account] =
      await tx`SELECT id,state FROM accounts WHERE id=${actorId} FOR UPDATE`;
    if (account?.state !== "active") throw new ApiError(401, "UNAUTHENTICATED");
    const prior = await replayOperation(
      tx,
      actorId,
      operationId,
      "deletion",
      {},
    );
    if (prior) return prior;
    const [row] =
      await tx`INSERT INTO deletion_requests(account_id) VALUES(${actorId}) ON CONFLICT(account_id) DO UPDATE SET account_id=EXCLUDED.account_id RETURNING id,status,created_at`;
    return saveOperation(
      tx,
      actorId,
      operationId,
      "deletion",
      {},
      {
        deletionRequest: {
          id: row.id,
          status: row.status,
          createdAt: new Date(row.created_at).toISOString(),
        },
      },
    );
  });
}
