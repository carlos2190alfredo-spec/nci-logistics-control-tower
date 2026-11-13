import type { Prisma } from "@/generated/prisma";
import { EVIDENCE_DOCUMENT_VISIBILITY } from "@/lib/domain/proof-evidence";
import type { HealthSummary, ServiceStatus } from "@/lib/observability/health";
import { runHealthChecks } from "@/lib/observability/health";
import { raiseAlert, resolveAlert, type AlertInput } from "@/lib/observability/alerts";
import { getDb } from "@/lib/server/db";
import { FilePipelineError, promoteFile, rejectFile, scanFile } from "@/lib/server/file-pipeline";
import { logger } from "@/lib/server/logger";
import { pruneExpiredRateLimits } from "@/lib/server/rate-limit";

/**
 * Mantenimiento diario invocado por Vercel Cron (`/api/internal/cron/maintenance`).
 *
 * Vercel no tiene procesos en segundo plano, asi que lo que antes dependia de "llamado
 * ocasionalmente" vive aqui:
 *  1. Reescanear archivos que quedaron en cuarentena porque el antivirus no estaba disponible.
 *  2. Purgar buckets de rate limit y recibos offline vencidos.
 *  3. Ejecutar los health checks y levantar/resolver la alerta operativa.
 *
 * Cada tarea es independiente: una falla se registra, se reporta en el resumen y no impide
 * que corran las demas. El resumen solo contiene conteos y estados (nunca datos de negocio).
 */

/** Un archivo reciente puede estar escaneandose en la peticion original: esperar antes de reintentar. */
export const RESCAN_MIN_AGE_MS = 10 * 60 * 1000;
/** Pasado este tiempo se deja de reintentar automaticamente (queda en cuarentena y se contabiliza). */
export const RESCAN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Maximo de archivos por ejecucion; el resto se atiende en la siguiente corrida. */
export const RESCAN_BATCH_SIZE = 25;
/** No se inician reescaneos nuevos despues de este tiempo desde el inicio de la tarea. */
export const RESCAN_TIME_BUDGET_MS = 15_000;

export const HEALTH_ALERT_DEDUPE_KEY = "health.unhealthy";

export type RescanSummary = {
  /** Archivos elegibles en total (pueden ser mas que el lote de esta corrida). */
  eligible: number;
  attempted: number;
  promoted: number;
  rejected: number;
  /** El escaneo no dio veredicto (gateway con error): siguen pendientes para la proxima corrida. */
  stillPending: number;
  failed: number;
  /** Elegibles que no se intentaron (fuera del lote, sin antivirus o sin tiempo). */
  skipped: number;
  /** Pendientes mas viejos que `RESCAN_MAX_AGE_MS`: requieren revision manual. */
  abandoned: number;
};

export type PruneSummary = {
  /** `null` indica que esa purga fallo. */
  rateLimitBuckets: number | null;
  offlineReceipts: number | null;
  syncReceipts: number | null;
};

export type HealthTaskSummary = {
  status: ServiceStatus;
  alertRaised: boolean;
  alertResolved: boolean;
};

export type MaintenanceSummary = {
  ok: boolean;
  failedTasks: string[];
  rescan: RescanSummary | null;
  prune: PruneSummary;
  health: HealthTaskSummary | null;
};

/** Ventana de antiguedad de los archivos a reescanear respecto a `now`. */
export function rescanWindow(now: Date) {
  return {
    olderThan: new Date(now.getTime() - RESCAN_MIN_AGE_MS),
    newerThan: new Date(now.getTime() - RESCAN_MAX_AGE_MS),
  };
}

/** Servicios cuya caida deja la plataforma inutilizable (P0 segun docs/ALERTING_POLICY.md). */
const P0_CHECKS = new Set(["postgresql", "prisma", "minio", "storage"]);

/**
 * Construye la alerta operativa a partir del resumen de salud. Devuelve `null` si el estado
 * no es UNHEALTHY. No incluye mensajes de error crudos (pueden contener hosts internos):
 * solo nombres, estados y la remediacion estatica de cada chequeo.
 */
export function buildHealthAlert(summary: Pick<HealthSummary, "status" | "checks">): AlertInput | null {
  if (summary.status !== "UNHEALTHY") return null;

  const failing = summary.checks.filter((check) => check.status === "UNHEALTHY");
  if (failing.length === 0) return null;

  const names = failing.map((check) => check.name);
  const severity: AlertInput["severity"] = failing.some((check) => P0_CHECKS.has(check.name)) ? "P0" : "P1";

  return {
    severity,
    source: "health",
    title: `Servicios no saludables: ${names.join(", ")}`,
    description: [
      "El chequeo de salud diario detecto servicios criticos con falla.",
      ...failing.map((check) => `- ${check.name}: ${check.remediation ?? "sin remediacion registrada"}`),
    ].join("\n"),
    dedupeKey: HEALTH_ALERT_DEDUPE_KEY,
    metadata: {
      checks: failing.map((check) => ({ name: check.name, status: check.status, durationMs: check.durationMs })),
    },
  };
}

type RescanOutcome = "promoted" | "rejected" | "pending";

/** Marca el recibo del upload (si existe) para que el chofer vea el resultado final. */
async function settleReceipt(fileAttachmentId: string, status: "COMPLETE" | "REJECTED") {
  await getDb().attachmentReceipt.updateMany({
    where: { fileAttachmentId, status: "PENDING_SCAN" },
    data: { status },
  });
}

/**
 * Crea el Document (INTERNAL, pendiente de revision) cuando el archivo se promueve tarde. En el flujo normal
 * el Document se crea justo despues de promover; si el escaneo quedo pendiente nunca se creo.
 * Todo se deriva de la fila FileAttachment (tenant, viaje) y se valida contra el tenant del viaje.
 */
async function publishPromotedDocument(fileAttachmentId: string, objectKey: string) {
  const db = getDb();
  const attachment = await db.fileAttachment.findUnique({
    where: { id: fileAttachmentId },
    select: {
      tenantId: true,
      tripId: true,
      proofId: true,
      filename: true,
      mimeType: true,
      sizeBytes: true,
      bucket: true,
      uploadedById: true,
    },
  });
  if (!attachment?.tripId) return;

  const existing = await db.document.findFirst({
    where: { tenantId: attachment.tenantId, objectKey },
    select: { id: true },
  });
  if (existing) return;

  const trip = await db.trip.findFirst({
    where: { id: attachment.tripId, tenantId: attachment.tenantId },
    select: { customerAccountId: true },
  });
  if (!trip) return;

  await db.document.create({
    data: {
      tenantId: attachment.tenantId,
      customerAccountId: trip.customerAccountId,
      tripId: attachment.tripId,
      proofId: attachment.proofId,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      bucket: attachment.bucket,
      objectKey,
      // Evidencia del conductor: nace INTERNAL como en el flujo normal; solo
      // approveProofAction la publica al cliente.
      visibility: EVIDENCE_DOCUMENT_VISIBILITY,
      uploadedById: attachment.uploadedById,
    },
  });
}

async function processStuckFile(fileAttachmentId: string, alreadyClean: boolean): Promise<RescanOutcome> {
  if (!alreadyClean) {
    const result = await scanFile(fileAttachmentId);
    if (result.verdict === "INFECTED") {
      await rejectFile(fileAttachmentId);
      await settleReceipt(fileAttachmentId, "REJECTED");
      return "rejected";
    }
    if (result.verdict !== "CLEAN") return "pending";
  }

  const { objectKey } = await promoteFile(fileAttachmentId);
  await publishPromotedDocument(fileAttachmentId, objectKey);
  await settleReceipt(fileAttachmentId, "COMPLETE");
  return "promoted";
}

/**
 * Reescanea archivos atascados: en QUARANTINE/PENDING_SCAN (antivirus caido o sin veredicto)
 * o en CLEAN sin promover (la copia a su ubicacion final fallo). Lote acotado, del mas viejo al
 * mas nuevo; un fallo en un archivo no detiene el lote. Si el antivirus no responde se corta
 * el lote (cada intento costaria varios segundos y todos fallarian igual).
 */
export async function rescanStuckFiles(
  now: Date = new Date(),
  timeBudgetMs: number = RESCAN_TIME_BUDGET_MS,
): Promise<RescanSummary> {
  const db = getDb();
  const { olderThan, newerThan } = rescanWindow(now);
  const stuckWhere: Prisma.FileAttachmentWhereInput = {
    createdAt: { lt: olderThan, gt: newerThan },
    OR: [{ status: { in: ["QUARANTINE", "PENDING_SCAN"] } }, { status: "CLEAN", objectKey: null }],
  };

  const [batch, eligible, abandoned] = await Promise.all([
    db.fileAttachment.findMany({
      where: stuckWhere,
      orderBy: { createdAt: "asc" },
      take: RESCAN_BATCH_SIZE,
      select: { id: true, status: true },
    }),
    db.fileAttachment.count({ where: stuckWhere }),
    db.fileAttachment.count({
      where: { status: { in: ["QUARANTINE", "PENDING_SCAN"] }, createdAt: { lte: newerThan } },
    }),
  ]);

  const summary: RescanSummary = {
    eligible,
    attempted: 0,
    promoted: 0,
    rejected: 0,
    stillPending: 0,
    failed: 0,
    skipped: 0,
    abandoned,
  };

  const startedAt = Date.now();
  let index = 0;
  for (; index < batch.length; index++) {
    if (Date.now() - startedAt > timeBudgetMs) break;
    const row = batch[index];

    try {
      const outcome = await processStuckFile(row.id, row.status === "CLEAN");
      summary.attempted++;
      if (outcome === "promoted") summary.promoted++;
      else if (outcome === "rejected") summary.rejected++;
      else summary.stillPending++;
    } catch (error) {
      if (error instanceof FilePipelineError && error.code === "AV_UNAVAILABLE") {
        logger.warn("maintenance.rescan.av_unavailable", { service: "maintenance" });
        break;
      }
      if (error instanceof FilePipelineError && error.code === "INVALID_STATE") {
        // Otro proceso lo atendio entre la consulta y el escaneo.
        continue;
      }
      summary.attempted++;
      summary.failed++;
      logger.error("maintenance.rescan.file_failed", {
        service: "maintenance",
        fileAttachmentId: row.id,
        safeMessage: error instanceof Error ? error.message.slice(0, 200) : "unknown",
      });
    }
  }

  summary.skipped = Math.max(0, eligible - summary.attempted);
  if (abandoned > 0) {
    logger.warn("maintenance.rescan.abandoned_files", { service: "maintenance", abandoned });
  }
  return summary;
}

async function countOrNull(label: string, fn: () => Promise<number>): Promise<number | null> {
  try {
    return await fn();
  } catch (error) {
    logger.error("maintenance.prune.failed", {
      service: "maintenance",
      component: label,
      safeMessage: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return null;
  }
}

/** Purga registros con vencimiento propio que ninguna ruta limpiaba (crecen sin limite). */
export async function pruneExpiredRecords(now: Date = new Date()): Promise<PruneSummary> {
  const db = getDb();
  const [rateLimitBuckets, offlineReceipts, syncReceipts] = await Promise.all([
    countOrNull("rate_limit_buckets", () => pruneExpiredRateLimits()),
    countOrNull(
      "offline_command_receipts",
      async () => (await db.offlineCommandReceipt.deleteMany({ where: { expiresAt: { lt: now } } })).count,
    ),
    countOrNull(
      "sync_action_receipts",
      async () => (await db.syncActionReceipt.deleteMany({ where: { expiresAt: { lt: now } } })).count,
    ),
  ]);
  return { rateLimitBuckets, offlineReceipts, syncReceipts };
}

/** Ejecuta los health checks (datos frescos, sin cache) y levanta o resuelve la alerta. */
export async function checkHealthAndAlert(): Promise<HealthTaskSummary> {
  const summary = await runHealthChecks();
  const alert = buildHealthAlert(summary);

  if (alert) {
    await raiseAlert(alert);
    return { status: summary.status, alertRaised: true, alertResolved: false };
  }

  const alertResolved = await resolveAlert(HEALTH_ALERT_DEDUPE_KEY);
  return { status: summary.status, alertRaised: false, alertResolved };
}

async function guarded<T>(task: string, failedTasks: string[], fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (error) {
    failedTasks.push(task);
    logger.error("maintenance.task.failed", {
      service: "maintenance",
      component: task,
      safeMessage: error instanceof Error ? error.message.slice(0, 200) : "unknown",
    });
    return null;
  }
}

export async function runMaintenance(now: Date = new Date()): Promise<MaintenanceSummary> {
  const failedTasks: string[] = [];

  const rescan = await guarded("rescan", failedTasks, () => rescanStuckFiles(now));
  const prune = await pruneExpiredRecords(now);
  const health = await guarded("health", failedTasks, () => checkHealthAndAlert());

  if (Object.values(prune).some((value) => value === null)) failedTasks.push("prune");

  return { ok: failedTasks.length === 0, failedTasks, rescan, prune, health };
}
