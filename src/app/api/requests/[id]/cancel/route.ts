import { withApi } from "@/server/http";
export const runtime = "nodejs";
import { requireAccount } from "@/server/auth";
import { transitionRequest } from "@/server/relationships";
import { readJson } from "@/server/http";
export const POST = withApi(
  async (request, context: { params: Promise<{ id: string }> }) =>
    transitionRequest(
      (await requireAccount(request)).id,
      (await context.params).id,
      "cancel",
      await readJson(request),
    ),
);
