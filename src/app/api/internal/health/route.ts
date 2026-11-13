import { NextResponse } from "next/server";
import { runHealthChecksCached } from "@/lib/observability/health";
import { logger } from "@/lib/observability/logger";

const responseHeaders = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

/**
 * Endpoint publico (sin sesion) para monitores externos. Solo expone `status` y `checkedAt`.
 * El resumen se cachea ~20 s por instancia (ver `runHealthChecksCached`) para que no pueda
 * usarse como amplificador de carga contra Postgres, S3 o el gateway de ClamAV.
 * Para probes baratos usar `/api/internal/liveness`.
 */
export async function GET() {
  try {
    const summary = await runHealthChecksCached();

    return NextResponse.json(
      { status: summary.status, checkedAt: summary.checkedAt },
      { status: summary.status === "HEALTHY" ? 200 : 503, headers: responseHeaders },
    );
  } catch (error) {
    // Un fallo del propio chequeo cuenta como no saludable (contrato 200/503).
    logger.error("health.check.failed", {
      service: "health",
      safeMessage: error instanceof Error ? error.message.slice(0, 200) : "health check failed",
    });
    return NextResponse.json(
      { status: "UNHEALTHY", checkedAt: new Date().toISOString() },
      { status: 503, headers: responseHeaders },
    );
  }
}

export const dynamic = "force-dynamic";
