import { withApi } from "@/server/http";
export const runtime = "nodejs";
import { requireAccount } from "@/server/auth";
import { publishProfile } from "@/server/profiles";
import { readJson } from "@/server/http";
export const POST = withApi(async (request) =>
  publishProfile(
    (await requireAccount(request)).id,
    await readJson(request),
    false,
  ),
);
