import { withApi } from "@/server/http";
export const runtime = "nodejs";
import { requireAccount } from "@/server/auth";
import { memberProfile } from "@/server/profiles";
export const GET = withApi(
  async (request, context: { params: Promise<{ id: string }> }) => ({
    profile: await memberProfile(
      (await requireAccount(request)).id,
      (await context.params).id,
    ),
  }),
);
