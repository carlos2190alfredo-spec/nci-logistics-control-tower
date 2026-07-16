import nodemailer from "nodemailer";
import { Prisma } from "@/generated/prisma";
import { NotificationChannel } from "@/generated/prisma";
import { getDb } from "@/lib/server/db";

type NotificationInput = {
  tenantId: string;
  customerAccountId?: string | null;
  channel: NotificationChannel;
  recipient: string;
  subject: string;
  body: string;
  metadata?: Record<string, unknown>;
};

export async function sendLocalNotification(input: NotificationInput) {
  const db = getDb();
  const delivery = await db.notificationDelivery.create({
    data: {
      tenantId: input.tenantId,
      customerAccountId: input.customerAccountId ?? null,
      channel: input.channel,
      recipient: input.recipient,
      subject: input.subject,
      body: input.body,
      metadata: JSON.parse(JSON.stringify(input.metadata ?? {})) as Prisma.InputJsonValue,
    },
  });

  if (input.channel === "EMAIL") {
    const transport = nodemailer.createTransport({
      host: process.env.MAIL_HOST ?? "localhost",
      port: Number(process.env.MAIL_PORT ?? 1025),
      secure: false,
    });

    await transport.sendMail({
      from: process.env.MAIL_FROM ?? "NCI Logistics Control Tower <no-reply@nci.local>",
      to: input.recipient,
      subject: input.subject,
      text: input.body,
    });
  }

  return db.notificationDelivery.update({
    where: { id: delivery.id },
    data: { status: "SENT", sentAt: new Date() },
  });
}
