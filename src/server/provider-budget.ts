import { getSql } from "./db";
import { ApiError } from "./http";
/** Durable caps across Cloud Run instances. Increment before outbound calls. */
export async function takeProviderBudget(
  bucket: string,
  maximum: number,
  seconds: number,
) {
  const sql = getSql();
  const window = Math.floor(Date.now() / (seconds * 1000));
  const key = `${bucket}:${window}`;
  const rows = await sql`
    INSERT INTO provider_budgets(bucket,calls,expires_at)
    VALUES (${key},1,now()+${seconds}*interval '1 second')
    ON CONFLICT(bucket) DO UPDATE SET calls=provider_budgets.calls+1
    WHERE provider_budgets.calls < ${maximum}
    RETURNING calls`;
  if (!rows.length)
    throw new ApiError(
      429,
      "RATE_LIMITED",
      "This service is busy. Try again later.",
    );
}
