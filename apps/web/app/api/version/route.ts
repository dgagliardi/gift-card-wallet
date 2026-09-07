import { NextResponse } from "next/server";
import { readSourceSha } from "@/lib/source-version";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return NextResponse.json({
    sourceSha: readSourceSha(),
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION || null,
    nodeVersion: process.versions.node,
  }, { headers: { "Cache-Control": "no-store" } });
}
