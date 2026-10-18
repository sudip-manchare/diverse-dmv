import { withApi } from "@/server/http";
export const runtime = "nodejs";
import { requireAccount } from "@/server/auth";
import { unblockMember } from "@/server/relationships";
import { readJson } from "@/server/http";
export const DELETE = withApi(
  async (request, context: { params: Promise<{ id: string }> }) =>
    unblockMember(
      (await requireAccount(request)).id,
      (await context.params).id,
      await readJson(request),
    ),
);
