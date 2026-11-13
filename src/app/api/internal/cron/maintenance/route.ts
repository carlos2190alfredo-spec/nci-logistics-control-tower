import { NextResponse } from "next/server";
import { runObservedJob } from "@/lib/observability/job-runner";
import { isAuthorizedCronRequest, readCronSecret } from "@/lib/server/cron-auth";
import { runMaintenance, type MaintenanceSummary } from "@/lib/server/cron-maintenance";
import { logger } from "@/lib/server/logger";

const headers = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
};

/**
 * GET /api/internal/cron/maintenance
 *
 * Mantenimiento diario (vercel.json -> crons). Vercel lo invoca con
 * `Authorization: Bearer <CRON_SECRET>`. Falla cerrado: sin CRON_SECRET configurado responde
 * 503 y no ejecuta nada; con un secreto incorrecto responde 401.
 * La respuesta es un resumen solo con conteos y estados.
 */
export async function GET(request: Request) {
  const secret = readCronSecret();
  if (!secret) {
    logger.error("cron.maintenance.not_configured", {
      service: "maintenance",
      safeMessage: "CRON_SECRET no esta configurado o es demasiado corto",
    });
    return NextResponse.json({ error: "CRON_NOT_CONFIGURED" }, { status: 503, headers });
  }

  if (!isAuthorizedCronRequest(request.headers.get("authorization"), secret)) {
    logger.warn("cron.maintenance.unauthorized", { service: "maintenance" });
    return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401, headers });
  }

  const result: { summary?: MaintenanceSummary } = {};

  try {
    const job = await runObservedJob(
      "maintenance.daily",
      async () => {
        const summary = await runMaintenance();
        result.summary = summary;
        // Deja la corrida como FAILED en job_runs si alguna tarea fallo.
        if (!summary.ok) throw new Error(`Tareas con falla: ${summary.failedTasks.join(", ")}`);
        return { ...summary };
      },
      { triggeredBy: "vercel-cron" },
    );

    const ok = job.status === "SUCCESS";
    return NextResponse.json(
      { ok, durationMs: job.durationMs, ...result.summary },
      { status: ok ? 200 : 500, headers },
    );
  } catch (error) {
    logger.error("cron.maintenance.failed", {
      service: "maintenance",
      safeMessage: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return NextResponse.json({ ok: false, error: "MAINTENANCE_FAILED" }, { status: 500, headers });
  }
}

export const dynamic = "force-dynamic";
// Presupuesto de rescan (15 s) + un escaneo lento (~40 s) + prune + health caben en 60 s.
export const maxDuration = 60;
