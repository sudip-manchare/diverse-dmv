import { requireAccount } from "@/server/auth";
import { withApi } from "@/server/http";
import { recommendations } from "@/server/discovery";
export const runtime = "nodejs";
export const GET = withApi(async (request: Request) =>
  recommendations((await requireAccount(request)).id),
);
