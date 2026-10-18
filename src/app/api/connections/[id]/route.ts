import { withApi } from "@/server/http";
export const runtime = "nodejs";
import { requireAccount } from "@/server/auth";
import { removeConnection } from "@/server/relationships";
import { readJson } from "@/server/http";
export const DELETE = withApi(
  async (request, context: { params: Promise<{ id: string }> }) =>
    removeConnection(
      (await requireAccount(request)).id,
      (await context.params).id,
      await readJson(request),
    ),
);
