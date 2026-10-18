import { withApi } from "@/server/http";
export const runtime = "nodejs";
import { requireAccount } from "@/server/auth";
import { ownAccount, editAccount } from "@/server/accounts";
import { readJson } from "@/server/http";
export const GET = withApi(async (request) =>
  ownAccount(await requireAccount(request)),
);
export const PATCH = withApi(async (request) =>
  editAccount(await requireAccount(request), await readJson(request)),
);
