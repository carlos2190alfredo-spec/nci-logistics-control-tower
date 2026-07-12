import { NextResponse } from "next/server";
import { requirePlatformRole } from "@/lib/server/auth";
import { collectMetrics } from "@/lib/observability/metrics";

export async function GET() {
  try {
    await requirePlatformRole(["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"]);
  } catch {
    return NextResponse.json(
      { error: "ACCESS_DENIED", message: "Se requiere rol de plataforma." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }

  const metrics = await collectMetrics();

  return NextResponse.json(metrics, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const dynamic = "force-dynamic";
