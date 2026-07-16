import { createHash } from "node:crypto";
import { getDb } from "@/lib/server/db";
import { ErrorCodes } from "@/lib/server/errors";
import { logger } from "@/lib/server/logger";
import { audit } from "@/lib/server/audit";
import {
  canonicalizeAction,
  type SyncAction,
  type SyncActionResult,
} from "@/lib/offline/generic-protocol";
import { getSyncActionEntry, type SyncCtx } from "@/lib/server/sync-actions/registry";
import { recordToFormData } from "@/lib/offline/generic-protocol";

const RECEIPT_TTL_DAYS = 30;

function hashAction(action: SyncAction): string {
  return createHash("sha256").update(canonicalizeAction(action)).digest("hex");
}

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

/**
 * Procesa un lote de acciones offline genéricas.
 * - Idempotencia: SyncActionReceipt.tenantId_userId_idempotencyKey UNIQUE.
 * - Payload tamper detection vía hash SHA-256 del canonicalizado.
 * - Whitelist por actionId (SYNC_ACTION_REGISTRY).
 * - Role check por handler.
 * - Una acción fallida NO aborta el lote.
 */
export async function processSyncActionBatch(
  ctx: SyncCtx,
  actions: SyncAction[],
): Promise<SyncActionResult[]> {
  const results: SyncActionResult[] = [];
  // Orden por localSequence para que un cliente que encoló varias acciones
  // dependientes las vea aplicadas en orden.
  const ordered = [...actions].sort((a, b) => a.localSequence - b.localSequence);
  const db = getDb();

  for (const action of ordered) {
    const payloadHash = hashAction(action);

    // Whitelist server-side. Si un cliente inyecta un actionId desconocido
    // (incluidos "__proto__"/"constructor"), se rechaza sin ejecutar nada.
    const entry = getSyncActionEntry(action.actionId);
    if (!entry) {
      results.push({
        idempotencyKey: action.idempotencyKey,
        status: "REJECTED",
        errorCode: "UNKNOWN_ACTION",
        serverTimestamp: new Date().toISOString(),
        retryable: false,
      });
      continue;
    }

    if (!entry.allowedRoles.includes(ctx.role)) {
      results.push({
        idempotencyKey: action.idempotencyKey,
        status: "UNAUTHORIZED",
        errorCode: ErrorCodes.ACCESS_DENIED,
        serverTimestamp: new Date().toISOString(),
        retryable: false,
      });
      continue;
    }

    try {
      // Chequeo previo: si existe receipt, devolver su resultado.
      const existing = await db.syncActionReceipt.findUnique({
        where: {
          tenantId_userId_idempotencyKey: {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            idempotencyKey: action.idempotencyKey,
          },
        },
      });

      if (existing) {
        if (existing.payloadHash !== payloadHash) {
          await audit({
            tenantId: ctx.tenantId,
            actorId: ctx.userId,
            actorRole: ctx.role,
            action: "sync.action.payload_tampered",
            entity: "SyncActionReceipt",
            entityId: existing.id,
            before: { previousHash: existing.payloadHash },
            after: { attemptedHash: payloadHash, actionId: action.actionId },
          });
          results.push({
            idempotencyKey: action.idempotencyKey,
            status: "REJECTED",
            errorCode: ErrorCodes.PAYLOAD_TAMPERED,
            serverTimestamp: new Date().toISOString(),
            retryable: false,
          });
          continue;
        }

        const status: SyncActionResult["status"] =
          existing.status === "ACCEPTED"
            ? "DUPLICATE"
            : (existing.status as SyncActionResult["status"]);

        results.push({
          idempotencyKey: action.idempotencyKey,
          status,
          serverEntityId: existing.resultEntityId ?? undefined,
          errorCode: existing.errorCode ?? undefined,
          serverTimestamp: existing.processedAt.toISOString(),
          retryable: false,
        });
        continue;
      }

      // Ejecutar handler. Race condition: si otra request con misma key
      // llega antes del commit, el UNIQUE del receipt aborta la tx.
      const formData = recordToFormData(action.formData);
      const handlerResult = await entry.handler(ctx, formData);

      if (!handlerResult.ok) {
        try {
          await db.syncActionReceipt.create({
            data: {
              tenantId: ctx.tenantId,
              userId: ctx.userId,
              idempotencyKey: action.idempotencyKey,
              actionId: action.actionId,
              payloadHash,
              status: handlerResult.retryable ? "FAILED" : "REJECTED",
              errorCode: handlerResult.errorCode,
              clientQueuedAt: new Date(action.clientQueuedAt),
              expiresAt: new Date(Date.now() + RECEIPT_TTL_DAYS * 24 * 60 * 60 * 1000),
            },
          });
        } catch (e) {
          if (!isPrismaUniqueViolation(e)) throw e;
        }
        results.push({
          idempotencyKey: action.idempotencyKey,
          status: handlerResult.retryable ? "RETRYABLE" : "REJECTED",
          errorCode: handlerResult.errorCode,
          serverTimestamp: new Date().toISOString(),
          retryable: handlerResult.retryable,
        });
        continue;
      }

      // Éxito: registrar receipt.
      try {
        await db.syncActionReceipt.create({
          data: {
            tenantId: ctx.tenantId,
            userId: ctx.userId,
            idempotencyKey: action.idempotencyKey,
            actionId: action.actionId,
            payloadHash,
            status: "ACCEPTED",
            resultEntityId: handlerResult.entityId,
            clientQueuedAt: new Date(action.clientQueuedAt),
            expiresAt: new Date(Date.now() + RECEIPT_TTL_DAYS * 24 * 60 * 60 * 1000),
          },
        });
      } catch (e) {
        if (isPrismaUniqueViolation(e)) {
          // Otra request ganó la carrera después de que ejecutamos: no es un
          // problema — la mutation ya se aplicó (idempotencia de negocio).
        } else {
          throw e;
        }
      }

      results.push({
        idempotencyKey: action.idempotencyKey,
        status: "ACCEPTED",
        serverEntityId: handlerResult.entityId,
        serverTimestamp: new Date().toISOString(),
        retryable: false,
      });
    } catch (error) {
      logger.error("generic sync action failed", {
        idempotencyKey: action.idempotencyKey,
        actionId: action.actionId,
        error: error instanceof Error ? error.message : "unknown",
      });
      results.push({
        idempotencyKey: action.idempotencyKey,
        status: "RETRYABLE",
        errorCode: ErrorCodes.SYNC_RETRYABLE,
        serverTimestamp: new Date().toISOString(),
        retryable: true,
      });
    }
  }

  return results;
}

/** Limpia recibos vencidos. Se puede llamar desde un cron. */
export async function pruneExpiredSyncReceipts() {
  await getDb().syncActionReceipt.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
