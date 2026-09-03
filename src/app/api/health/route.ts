import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: process.env.npm_package_name ?? "app",
    timestamp: new Date().toISOString(),
  });
}
