import { withApi } from "@/server/http";
export const runtime = "nodejs";
import { requireAccount } from "@/server/auth";
import { listConnections } from "@/server/relationships";
export const GET = withApi(async (request) =>
  listConnections((await requireAccount(request)).id),
);
