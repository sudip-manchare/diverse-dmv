import { withApi, ApiError, readJson } from "@/server/http";
import { searchOffices } from "@/server/offices";
export const runtime = "nodejs";
export const POST = withApi(async (request: Request) => {
  if (Number(request.headers.get("content-length") || 0) > 8192)
    throw new ApiError(413, "PAYLOAD_TOO_LARGE");
  const body = await readJson(request);
  if (Buffer.byteLength(JSON.stringify(body)) > 8192)
    throw new ApiError(413, "PAYLOAD_TOO_LARGE");
  return searchOffices(body, request);
});
