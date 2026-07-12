import { getDb } from "@/lib/server/db";
import { logger } from "./logger";

export type AlertInput = {
  severity: "P0" | "P1" | "P2";
  source: string;
  title: string;
  description: string;
  dedupeKey: string;
  tenantId?: string;
  metadata?: Record<string, unknown>;
};

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
  try {
    const mailHost = process.env.MAIL_HOST ?? "localhost";
    const mailPort = Number(process.env.MAIL_PORT ?? "1025");
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({ host: mailHost, port: mailPort, secure: false });

    await transport.sendMail({
      from: '"NCI LCT Ops" <ops@nci-lct.local>',
      to: "admin@nci-lct.local",
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
    logger.warn("alert.notification.failed", {
      service: "alerts",
      safeMessage: err instanceof Error ? err.message.slice(0, 200) : "email send failed",
    });
  }
}
