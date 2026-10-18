import { NextResponse } from "next/server";
import { officeConfig } from "@/server/office-config";
export async function GET() {
  const config = officeConfig();
  return NextResponse.json(
    config.enabled
      ? {
          enabled: true,
          browserKey: config.browserKey,
          mapId: config.mapId,
          demo: config.demo,
        }
      : { enabled: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
