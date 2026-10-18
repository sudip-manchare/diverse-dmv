import { withApi } from "@/server/http";
export const runtime = "nodejs";
import { requireAccount } from "@/server/auth";
import { ownProfile, editProfile } from "@/server/profiles";
import { readJson } from "@/server/http";
export const GET = withApi(async (request) =>
  ownProfile((await requireAccount(request)).id),
);
export const PATCH = withApi(async (request) =>
  editProfile((await requireAccount(request)).id, await readJson(request)),
);
