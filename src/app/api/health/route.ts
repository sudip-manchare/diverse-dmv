import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json(
    { status: "ok", service: "diverse-dmv", version: "0.1.0" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
