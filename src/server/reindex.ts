import "server-only";
import { getSql } from "./db";
import { ApiError } from "./http";
import { versionSchema } from "./validation";
import { ownProfile } from "./profiles";
import { enqueueProfileIndex, attemptProfileIndex } from "./embeddings";
export async function reindexProfile(id: string, input: unknown) {
  const { version } = versionSchema.parse(input);
  await getSql().begin(async (tx) => {
    const [account] =
      await tx`SELECT state FROM accounts WHERE id=${id} FOR UPDATE`;
    if (account?.state !== "active") throw new ApiError(401, "UNAUTHENTICATED");
    const [profile] =
      await tx`SELECT * FROM profiles WHERE account_id=${id} FOR UPDATE`;
    if (!profile.published) throw new ApiError(403, "NOT_ALLOWED");
    if (profile.version !== version) throw new ApiError(409, "STALE_STATE");
    const [recent] =
      await tx`SELECT hits FROM rate_limits WHERE bucket=${"reindex:" + id} AND window_start>clock_timestamp()-interval '1 minute'`;
    if (recent)
      throw new ApiError(
        429,
        "RATE_LIMITED",
        "Preparation was requested recently. Try again later.",
      );
    await tx`INSERT INTO rate_limits(bucket,window_start,hits) VALUES(${"reindex:" + id},clock_timestamp(),1)`;
    await tx`UPDATE profiles SET indexing_status='pending' WHERE account_id=${id}`;
    await enqueueProfileIndex(tx, id, version);
  });
  await attemptProfileIndex(id);
  return ownProfile(id);
}
