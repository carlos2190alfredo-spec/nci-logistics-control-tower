import { NextResponse } from "next/server";
import { runHealthChecks } from "@/lib/observability/health";

export async function GET() {
  const summary = await runHealthChecks();

  const publicSummary = {
    status: summary.status,
    checkedAt: summary.checkedAt,
  };

  return NextResponse.json(publicSummary, {
    status: summary.status === "HEALTHY" ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const dynamic = "force-dynamic";
