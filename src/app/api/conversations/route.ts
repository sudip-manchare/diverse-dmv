import { withApi } from "@/server/http";
export const runtime = "nodejs";
import { requireAccount } from "@/server/auth";
import { listConversations } from "@/server/messages";
export const GET = withApi(async (request) =>
  listConversations((await requireAccount(request)).id),
);
