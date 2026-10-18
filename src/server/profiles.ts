import "server-only";
import { z } from "zod";
import {
  profileSchema,
  publishSchema,
  type ProfileData,
  type OwnProfile,
  type MemberProfile,
} from "@/shared/contracts";
import { getSql } from "./db";
import { ApiError } from "./http";
import {
  projectProfileData,
  canonicalPair,
  type ViewerAudience,
} from "./policy";
import { enqueueProfileIndex, attemptProfileIndex } from "./embeddings";
import { versionSchema } from "./validation";
interface ProfileRow {
  account_id: string;
  data: ProfileData;
  version: number;
  cosmetic_version: number;
  published: boolean;
  indexing_status: string;
}
function projectProfile(row: ProfileRow, audience: ViewerAudience = "owner") {
  return {
    id: row.account_id,
    data: projectProfileData(row.data, audience),
    version: row.version,
    cosmeticVersion: row.cosmetic_version,
    published: row.published,
    indexingStatus:
      row.indexing_status === "draft" ? "none" : row.indexing_status,
  };
}
export async function ownProfile(id: string) {
  const [row] = await getSql()`SELECT * FROM profiles WHERE account_id=${id}`;
  if (!row)
    throw new ApiError(404, "UNAVAILABLE", "We couldn’t load your profile.");
  return {
    profile: projectProfile(row as ProfileRow) as OwnProfile,
    previews: {
      member: projectProfileData(row.data, "member"),
      connection: projectProfileData(row.data, "connection"),
    },
  };
}
export async function memberProfile(
  actorId: string,
  id: string,
): Promise<MemberProfile> {
  z.string().uuid().parse(id);
  const sql = getSql();
  const [low, high] = canonicalPair(actorId, id);
  const [row] =
    await sql`SELECT p.* FROM profiles p JOIN accounts a ON a.id=p.account_id WHERE p.account_id=${id} AND p.published=true AND a.state='active' AND NOT EXISTS(SELECT 1 FROM blocks WHERE (blocker_id=${actorId} AND blocked_id=${id}) OR (blocker_id=${id} AND blocked_id=${actorId}))`;
  if (!row)
    throw new ApiError(404, "UNAVAILABLE", "This profile is unavailable.");
  const [connection] =
    await sql`SELECT id FROM connections WHERE low_id=${low} AND high_id=${high} AND active=true`;
  const [request] =
    await sql`SELECT id,sender_id FROM requests WHERE low_id=${low} AND high_id=${high} AND status='pending'`;
  const [pair] =
    await sql`SELECT cooldown_until FROM pairs WHERE low_id=${low} AND high_id=${high}`;
  const [own] =
    await sql`SELECT published FROM profiles WHERE account_id=${actorId}`;
  return {
    id,
    data: projectProfileData(
      row.data,
      actorId === id ? "owner" : connection ? "connection" : "member",
    ),
    relationship: connection
      ? "connected"
      : request
        ? request.sender_id === actorId
          ? "outgoing"
          : "incoming"
        : "none",
    requestId: request?.id,
    connectionId: connection?.id,
    canMessage: !!connection && !!own?.published,
    retryAt: pair?.cooldown_until
      ? new Date(pair.cooldown_until).toISOString()
      : undefined,
  };
}
export async function editProfile(id: string, input: unknown) {
  const body = z
    .object({
      version: z.number().int().positive(),
      cosmeticVersion: z.number().int().positive(),
      data: profileSchema.partial(),
    })
    .strict()
    .parse(input);
  const sql = getSql();
  await sql.begin(async (tx) => {
    const [account] =
      await tx`SELECT id,state FROM accounts WHERE id=${id} FOR UPDATE`;
    if (account?.state !== "active") throw new ApiError(401, "UNAUTHENTICATED");
    const [row] =
      await tx`SELECT * FROM profiles WHERE account_id=${id} FOR UPDATE`;
    if (
      row.version !== body.version ||
      row.cosmetic_version !== body.cosmeticVersion
    )
      throw new ApiError(
        409,
        "STALE_STATE",
        "Your information changed elsewhere. Review the latest version before saving.",
      );
    const data = profileSchema.parse({ ...row.data, ...body.data });
    data.skills = [
      ...new Map(
        data.skills.map((v) => [v.trim().toLocaleLowerCase("en-US"), v.trim()]),
      ).values(),
    ];
    data.intentions = [...new Set(data.intentions)];
    if (row.published) publishSchema.parse(data);
    const contentBefore = { ...profileSchema.parse(row.data), fish: undefined };
    const contentAfter = { ...data, fish: undefined };
    const contentChanged =
      JSON.stringify(contentBefore) !== JSON.stringify(contentAfter);
    const cosmeticChanged = row.data.fish !== data.fish;
    const version = row.version + (contentChanged ? 1 : 0);
    await tx`UPDATE profiles SET data=${tx.json(data)},version=${version},cosmetic_version=cosmetic_version+${cosmeticChanged ? 1 : 0},indexing_status=${contentChanged && row.published ? "pending" : row.indexing_status},updated_at=clock_timestamp() WHERE account_id=${id}`;
    if (contentChanged && row.published)
      await enqueueProfileIndex(tx, id, version);
  });
  await attemptProfileIndex(id);
  return ownProfile(id);
}
export async function publishProfile(
  id: string,
  input: unknown,
  publish: boolean,
) {
  const { version } = versionSchema.parse(input);
  const sql = getSql();
  await sql.begin(async (tx) => {
    const [account] =
      await tx`SELECT id,state FROM accounts WHERE id=${id} FOR UPDATE`;
    if (account?.state !== "active") throw new ApiError(401, "UNAUTHENTICATED");
    const [row] =
      await tx`SELECT * FROM profiles WHERE account_id=${id} FOR UPDATE`;
    if (row.version !== version) throw new ApiError(409, "STALE_STATE");
    if (publish) publishSchema.parse(row.data);
    if (row.published === publish) return;
    await tx`UPDATE profiles SET published=${publish},version=version+1,indexing_status=${publish ? "pending" : "draft"},updated_at=clock_timestamp() WHERE account_id=${id}`;
    if (publish) await enqueueProfileIndex(tx, id, row.version + 1);
  });
  await attemptProfileIndex(id);
  return ownProfile(id);
}
