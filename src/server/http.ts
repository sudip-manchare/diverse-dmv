import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { randomUUID } from "node:crypto";
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message = "This action is unavailable. Try again.",
    public fields?: Record<string, string>,
    public retryAt?: string,
  ) {
    super(message);
  }
}
function assertOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = process.env.APP_ORIGIN || new URL(request.url).origin;
  if (
    !origin ||
    origin !== expected ||
    request.headers.get("x-csrf-protection") !== "1"
  )
    throw new ApiError(
      403,
      "NOT_ALLOWED",
      "This request could not be verified. Reload and try again.",
    );
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new ApiError(403, "NOT_ALLOWED");
}
// One MiB covers the complete profile at every field limit, including escaped Unicode.
// The transport limit is separate from the shared Unicode code-point field limits.
export const MAX_JSON_BODY_BYTES = 1_048_576;
export async function readJson(request: Request) {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new ApiError(400, "VALIDATION_FAILED", "Send a JSON request.");
  const tooLarge = () =>
    new ApiError(400, "VALIDATION_FAILED", "This request is too large.");
  const invalid = () =>
    new ApiError(400, "VALIDATION_FAILED", "Check the submitted information.");
  const length = request.headers.get("content-length");
  if (length !== null) {
    if (!/^\d+$/.test(length)) throw invalid();
    if (BigInt(length) > BigInt(MAX_JSON_BODY_BYTES)) {
      await request.body?.cancel().catch(() => {});
      throw tooLarge();
    }
  }
  const reader = request.body?.getReader();
  if (!reader) throw invalid();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  const chunks: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_JSON_BODY_BYTES) {
        await reader.cancel().catch(() => {});
        throw tooLarge();
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return JSON.parse(chunks.join(""));
  } catch (error) {
    if (error instanceof ApiError) throw error;
    await reader.cancel().catch(() => {});
    throw invalid();
  } finally {
    reader.releaseLock();
  }
}
export function withApi<T extends unknown[]>(
  fn: (request: Request, ...args: T) => Promise<unknown>,
) {
  return async (request: Request, ...args: T) => {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(request.method))
        assertOrigin(request);
      const result = await fn(request, ...args);
      const response =
        result instanceof Response ? result : NextResponse.json(result);
      response.headers.set("Cache-Control", "private, no-store");
      response.headers.set("Vary", "Cookie");
      return response;
    } catch (error) {
      if (error instanceof ZodError) {
        const fields: Record<string, string> = {};
        for (const issue of error.issues)
          fields[issue.path.join(".")] = issue.message;
        return NextResponse.json(
          {
            error: {
              code: "VALIDATION_FAILED",
              message: "Check the highlighted fields.",
              fields,
            },
          },
          { status: 400, headers: { "Cache-Control": "private, no-store" } },
        );
      }
      const safe =
        error instanceof ApiError
          ? error
          : new ApiError(
              503,
              "DEPENDENCY_UNAVAILABLE",
              "We couldn’t confirm this operation. Try again.",
            );
      const correlationId = randomUUID();
      // Content-free diagnostics: never log an exception, SQL, token or request body.
      if (!(error instanceof ApiError))
        console.error(
          JSON.stringify({ event: "api_dependency_error", correlationId }),
        );
      return NextResponse.json(
        {
          error: {
            code: safe.code,
            message: safe.message,
            fields: safe.fields,
            retryAt: safe.retryAt,
            correlationId,
          },
        },
        {
          status: safe.status,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
  };
}
