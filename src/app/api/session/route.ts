import { withApi } from "@/server/http";
export const runtime = "nodejs";
import { createSession, deleteSession } from "@/server/auth";
export const POST = withApi(createSession);
export const DELETE = withApi(async () => deleteSession());
