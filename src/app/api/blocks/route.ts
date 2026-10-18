import { withApi } from "@/server/http";
export const runtime = "nodejs";
import { requireAccount } from "@/server/auth";
import { listBlocks, blockMember } from "@/server/relationships";
import { readJson } from "@/server/http";
export const GET = withApi(async (request) =>
  listBlocks((await requireAccount(request)).id),
);
export const POST = withApi(async (request) =>
  blockMember((await requireAccount(request)).id, await readJson(request)),
);
