import { Prisma } from "@/generated/prisma";
import type { NotificationChannel } from "@/generated/prisma";
import { getDb } from "@/lib/server/db";
import { logger } from "@/lib/server/logger";
import { trySendMail } from "@/lib/server/mail";

type NotificationInput = {
  tenantId: string;
  customerAccountId?: string | null;
  channel: NotificationChannel;
  recipient: string;
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
};

/**
 * Registra y entrega una notificacion. Se invoca DESPUES de que la accion de
 * negocio ya se confirmo, asi que nunca lanza: un fallo de correo deja la fila
 * en FAILED (con el motivo, sin secretos, en `metadata.deliveryError`) y la
 * accion que la origino continua. Devuelve `null` solo si la propia fila no se
 * pudo persistir o actualizar (se registra en el log).
 */
export async function sendLocalNotification(input: NotificationInput) {
  const db = getDb();

  let deliveryId: string;
  try {
    const delivery = await db.notificationDelivery.create({
      data: {
        tenantId: input.tenantId,
        customerAccountId: input.customerAccountId ?? null,
        channel: input.channel,
        recipient: input.recipient,
        subject: input.subject,
        body: input.body,
        metadata: JSON.parse(
          JSON.stringify(input.metadata ?? {}),
        ) as Prisma.InputJsonValue,
      },
    });
    deliveryId = delivery.id;
  } catch (error) {
    logger.error("notification.persist_failed", {
      service: "notifications",
      tenantId: input.tenantId,
      outcome: "FAILED",
      safeMessage:
        error instanceof Error ? error.message.slice(0, 200) : "persist failed",
    });
    return null;
  }

  let failure: { code: string; message: string } | null = null;
  if (input.channel === "EMAIL") {
    const result = await trySendMail(
      { to: input.recipient, subject: input.subject, text: input.body },
      {
        event: "notification.email_failed",
        component: "notifications",
        tenantId: input.tenantId,
      },
    );
    if (!result.ok) failure = { code: result.code, message: result.message };
  }

  try {
    return await db.notificationDelivery.update({
      where: { id: deliveryId },
      data: failure
        ? {
            status: "FAILED",
            metadata: JSON.parse(
              JSON.stringify({
                ...(input.metadata ?? {}),
                deliveryError: failure,
              }),
            ) as Prisma.InputJsonValue,
          }
        : { status: "SENT", sentAt: new Date() },
    });
  } catch (error) {
    logger.error("notification.status_update_failed", {
      service: "notifications",
      tenantId: input.tenantId,
      outcome: failure ? "FAILED" : "SENT",
      safeMessage:
        error instanceof Error
          ? error.message.slice(0, 200)
          : "status update failed",
    });
    return null;
  }
}
