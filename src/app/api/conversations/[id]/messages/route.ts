import { withApi } from "@/server/http";
export const runtime = "nodejs";
import { requireAccount } from "@/server/auth";
import { messageHistory } from "@/server/messages";
export const GET = withApi(
  async (request, context: { params: Promise<{ id: string }> }) =>
    messageHistory(
      (await requireAccount(request)).id,
      (await context.params).id,
      new URL(request.url),
    ),
);
