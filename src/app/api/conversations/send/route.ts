import { withApi } from "@/server/http";
export const runtime = "nodejs";
import { requireAccount } from "@/server/auth";
import { sendMessage } from "@/server/messages";
import { readJson } from "@/server/http";
export const POST = withApi(async (request) =>
  sendMessage((await requireAccount(request)).id, await readJson(request)),
);
