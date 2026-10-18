import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { drainEmbeddingJobs } from "@/server/embeddings";
export const runtime = "nodejs";
export const maxDuration = 120;
/** Machine endpoint: bearer secret replaces cookie/Origin authentication. */
async function drain(request: Request, expected: string | undefined) {
  const provided =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (
    !expected ||
    expected.length < 32 ||
    Buffer.byteLength(expected) !== Buffer.byteLength(provided) ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
  )
    return NextResponse.json(
      { error: { code: "NOT_ALLOWED", message: "Not allowed." } },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  try {
    return NextResponse.json(await drainEmbeddingJobs(4), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      {
        error: {
          code: "DEPENDENCY_UNAVAILABLE",
          message: "Indexing is temporarily unavailable.",
        },
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

/** Portable external scheduler. */
export async function POST(request: Request) {
  return drain(request, process.env.INDEXING_JOB_SECRET);
}

/** Vercel Cron sends GET and supplies its configured CRON_SECRET bearer. */
export async function GET(request: Request) {
  return drain(request, process.env.CRON_SECRET);
}
