import { withApi } from "@/server/http";
export const runtime = "nodejs";
import { requireAccount } from "@/server/auth";
import { reindexProfile } from "@/server/reindex";
import { readJson } from "@/server/http";
export const POST = withApi(async (request) =>
  reindexProfile((await requireAccount(request)).id, await readJson(request)),
);
