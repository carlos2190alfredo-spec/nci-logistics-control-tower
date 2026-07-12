import { NextResponse } from "next/server";
import { requirePlatformRole } from "@/lib/server/auth";
import { runHealthChecks } from "@/lib/observability/health";

export async function GET() {
  try {
    await requirePlatformRole(["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"]);
  } catch {
    return NextResponse.json(
      { error: "ACCESS_DENIED", message: "Se requiere rol de plataforma." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const summary = await runHealthChecks();

  return NextResponse.json(summary, {
    status: summary.status === "HEALTHY" ? 200 : 503,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const dynamic = "force-dynamic";
