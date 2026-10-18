import { withApi } from "@/server/http";
export const runtime = "nodejs";
import { requireAccount } from "@/server/auth";
import { requestDeletion } from "@/server/accounts";
import { readJson } from "@/server/http";
export const POST = withApi(async (request) =>
  requestDeletion((await requireAccount(request)).id, await readJson(request)),
);
