import { withApi } from "@/server/http";
export const runtime = "nodejs";
import { requireAccount } from "@/server/auth";
import { listRequests, sendRequest } from "@/server/relationships";
import { readJson } from "@/server/http";
export const GET = withApi(async (request) =>
  listRequests((await requireAccount(request)).id),
);
export const POST = withApi(async (request) =>
  sendRequest((await requireAccount(request)).id, await readJson(request)),
);
