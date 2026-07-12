import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "../src/generated/prisma";
import { createTransport } from "nodemailer";

const db = new PrismaClient();

async function main() {
  console.log("\n  Test de alertas — Mailpit\n");

  const dedupeKey = `test-alert-${Date.now()}`;

  const alert = await db.operationalAlert.create({
    data: {
      severity: "P2",
      source: "ops:alerts:test",
      title: "Alerta de prueba",
      description: "Esta es una alerta de prueba generada por el script ops:alerts:test.",
      dedupeKey,
      status: "ACTIVE",
      firstSeenAt: new Date(),
      lastSeenAt: new Date(),
    },
  });
  console.log(`  ✓ Alerta creada: ${alert.id}`);

  try {
    const mailHost = process.env.MAIL_HOST ?? "localhost";
    const mailPort = Number(process.env.MAIL_PORT ?? "1025");
    const transport = createTransport({ host: mailHost, port: mailPort, secure: false });

    await transport.sendMail({
      from: '"NCI LCT Ops" <ops@nci-lct.local>',
      to: "admin@nci-lct.local",
      subject: `[P2] Alerta de prueba`,
      text: [
        "Severidad: P2",
        "Fuente: ops:alerts:test",
        "Titulo: Alerta de prueba",
        "",
        "Esta alerta fue generada como prueba del sistema de alertas.",
        `Clave: ${dedupeKey}`,
        `Timestamp: ${new Date().toISOString()}`,
      ].join("\n"),
    });
    console.log("  ✓ Email enviado a Mailpit");
  } catch (err) {
    console.log(`  ⚠ No se pudo enviar email: ${err instanceof Error ? err.message : "Error"}`);
    console.log("    Mailpit puede no estar corriendo (opcional en desarrollo)");
  }

  await db.operationalAlert.update({
    where: { id: alert.id },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
  console.log(`  ✓ Alerta resuelta`);

  console.log("\n  Test completado exitosamente.\n");
  await db.$disconnect();
}

main().catch((err) => {
  console.error("Error fatal:", err);
  process.exit(1);
});
