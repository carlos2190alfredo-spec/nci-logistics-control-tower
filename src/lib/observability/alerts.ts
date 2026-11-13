import { isLocalEnv } from "@/lib/app-env";
import { getDb } from "@/lib/server/db";
import { describeMailError, sendMail } from "@/lib/server/mail";
import { logger } from "./logger";

export type AlertInput = {
  severity: "P0" | "P1" | "P2";
  source: string;
  title: string;
  description: string;
  dedupeKey: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
  /**
   * `false` registra la alerta sin enviar correo. Para alertas del propio
   * canal de correo: reintentar por SMTP solo sumaria otro timeout.
   */
  notify?: boolean;
};

/** Destinatario de desarrollo (Mailpit). Fuera de `local` solo se usa `OPS_ALERT_EMAIL`. */
const LOCAL_ALERT_RECIPIENT = "admin@nci-lct.local";

function resolveAlertRecipient(): string | null {
  const configured = process.env.OPS_ALERT_EMAIL?.trim();
  if (configured) return configured;
  return isLocalEnv() ? LOCAL_ALERT_RECIPIENT : null;
}

const COOLDOWN_MINUTES: Record<string, number> = {
  P0: 5,
  P1: 30,
  P2: 60,
};

export async function raiseAlert(input: AlertInput): Promise<{ created: boolean; alertId: string }> {
  const db = getDb();
  const now = new Date();

  const existing = await db.operationalAlert.findUnique({
    where: { dedupeKey: input.dedupeKey },
  });

  if (existing) {
    const cooldownMs = (COOLDOWN_MINUTES[input.severity] ?? 30) * 60 * 1000;
    const lastSeen = existing.lastSeenAt.getTime();
    const withinCooldown = now.getTime() - lastSeen < cooldownMs;

    await db.operationalAlert.update({
      where: { id: existing.id },
      data: {
        lastSeenAt: now,
        occurrenceCount: { increment: 1 },
        status: "ACTIVE",
        resolvedAt: null,
        description: input.description,
      },
    });

    if (!withinCooldown && existing.status === "ACTIVE") {
      await sendAlertNotification(input);
    }

    return { created: false, alertId: existing.id };
  }

  const alert = await db.operationalAlert.create({
    data: {
      severity: input.severity,
      source: input.source,
      title: input.title,
      description: input.description,
      dedupeKey: input.dedupeKey,
      tenantId: input.tenantId,
      status: "ACTIVE",
      firstSeenAt: now,
      lastSeenAt: now,
      metadataJson: input.metadata ? JSON.parse(JSON.stringify(input.metadata)) : undefined,
    },
  });

  logger.security("alert.raised", {
    service: "alerts",
    component: input.source,
    outcome: input.severity,
    safeMessage: input.title,
  });

  await sendAlertNotification(input);

  return { created: true, alertId: alert.id };
}

export async function resolveAlert(dedupeKey: string): Promise<boolean> {
  const db = getDb();
  const existing = await db.operationalAlert.findUnique({
    where: { dedupeKey },
  });

  if (!existing || existing.status === "RESOLVED") return false;

  await db.operationalAlert.update({
    where: { id: existing.id },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });

  logger.info("alert.resolved", {
    service: "alerts",
    component: existing.source,
    safeMessage: existing.title,
  });

  return true;
}

export async function getActiveAlerts() {
  const db = getDb();
  return db.operationalAlert.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ severity: "asc" }, { lastSeenAt: "desc" }],
    take: 50,
  });
}

async function sendAlertNotification(input: AlertInput) {
  if (input.notify === false) return;

  const recipient = resolveAlertRecipient();
  if (!recipient) {
    logger.warn("alert.notification.skipped", {
      service: "alerts",
      component: input.source,
      safeMessage: "OPS_ALERT_EMAIL no esta definido: la alerta se registro pero no se envio correo.",
    });
    return;
  }

  try {
    // Mismo transporte que el resto de la app (MAIL_USER/MAIL_PASSWORD/MAIL_SECURE, timeouts).
    await sendMail({
      to: recipient,
      subject: `[${input.severity}] ${input.title}`,
      text: [
        `Severidad: ${input.severity}`,
        `Fuente: ${input.source}`,
        `Titulo: ${input.title}`,
        "",
        input.description,
        "",
        `Clave de deduplicacion: ${input.dedupeKey}`,
        `Timestamp: ${new Date().toISOString()}`,
      ].join("\n"),
    });
  } catch (err) {
    const failure = describeMailError(err);
    logger.warn("alert.notification.failed", {
      service: "alerts",
      errorCode: failure.code,
      safeMessage: failure.message,
    });
  }
}
