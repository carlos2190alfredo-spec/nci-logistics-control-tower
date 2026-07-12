import { NextResponse } from "next/server";
import { runLivenessCheck } from "@/lib/observability/health";

export async function GET() {
  const result = await runLivenessCheck();
  return NextResponse.json(result, {
    headers: { "Cache-Control": "no-store" },
  });
}

export const dynamic = "force-dynamic";
