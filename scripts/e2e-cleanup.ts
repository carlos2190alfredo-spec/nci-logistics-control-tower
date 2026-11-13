/**
 * Elimina los viajes que las corridas E2E acumulan en los tenants demo.
 *
 * Conserva los viajes del seed (su solicitud tiene `cargoDetails.demo = true`)
 * y borra el resto: viajes `OFFLINE-E2E-*` (sin solicitud) y viajes creados al
 * convertir solicitudes desde el portal durante las pruebas. Solo actua sobre
 * tenants con `isDemo = true`.
 *
 * Por defecto es un dry-run que solo cuenta; `--apply` borra.
 *   pnpm e2e:cleanup          # cuenta
 *   pnpm e2e:cleanup --apply  # borra
 */
import { config } from "dotenv";
config({ path: ".env" });
config({ path: ".env.local", override: true });

import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaClient } from "../src/generated/prisma";

const apply = process.argv.includes("--apply");
const db = new PrismaClient();
const BUCKET = process.env.MINIO_BUCKET ?? "nci-logistics-local";
const s3 = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT ?? "http://localhost:9000",
  region: "us-east-1",
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY ?? "nci_minio",
    secretAccessKey: process.env.MINIO_SECRET_KEY ?? "nci_minio_password",
  },
  forcePathStyle: true,
});

async function main() {
  const tenants = await db.tenant.findMany({ where: { isDemo: true }, select: { id: true, slug: true } });
  if (tenants.length === 0) {
    console.log("No hay tenants demo.");
    return;
  }

  const objectKeys: string[] = [];
  for (const tenant of tenants) {
    const rows = await db.$queryRaw<{ id: string; service_request_id: string | null }[]>`
      SELECT tr.id, tr.service_request_id
      FROM trips tr
      LEFT JOIN service_requests sr ON sr.id = tr.service_request_id
      WHERE tr.tenant_id = ${tenant.id}::uuid
        AND COALESCE(sr.cargo_details->>'demo', 'false') <> 'true'`;
    const tripIds = rows.map((row) => row.id);
    const requestIds = rows.flatMap((row) => (row.service_request_id ? [row.service_request_id] : []));
    const keep = await db.trip.count({ where: { tenantId: tenant.id } }) - tripIds.length;

    if (tripIds.length === 0) {
      console.log(`${tenant.slug}: nada que limpiar (${keep} viajes del seed).`);
      continue;
    }

    const proofIds = (
      await db.proofOfDelivery.findMany({ where: { tenantId: tenant.id, tripId: { in: tripIds } }, select: { id: true } })
    ).map((proof) => proof.id);
    const linkedToTrips = { tenantId: tenant.id, OR: [{ tripId: { in: tripIds } }, { proofId: { in: proofIds } }] };
    const [documents, attachments, incidents, receipts] = await Promise.all([
      db.document.findMany({ where: linkedToTrips, select: { objectKey: true } }),
      db.fileAttachment.findMany({ where: linkedToTrips, select: { objectKey: true, quarantineKey: true } }),
      db.incident.count({ where: { tenantId: tenant.id, tripId: { in: tripIds } } }),
      db.offlineCommandReceipt.count({ where: { tenantId: tenant.id, tripId: { in: tripIds } } }),
    ]);

    console.log(
      `${tenant.slug}: ${tripIds.length} viajes E2E (se conservan ${keep} del seed), ` +
        `${requestIds.length} solicitudes, ${documents.length} documentos, ${attachments.length} adjuntos, ` +
        `${incidents} incidentes, ${receipts} recibos offline.`,
    );
    if (!apply) continue;

    await db.$transaction(async (tx) => {
      await tx.document.deleteMany({ where: linkedToTrips });
      await tx.fileAttachment.deleteMany({ where: linkedToTrips });
      await tx.incident.deleteMany({ where: { tenantId: tenant.id, tripId: { in: tripIds } } });
      await tx.offlineCommandReceipt.deleteMany({ where: { tenantId: tenant.id, tripId: { in: tripIds } } });
      // Sin FK: solo se desvinculan para no dejar referencias colgantes.
      await tx.container.updateMany({ where: { tenantId: tenant.id, tripId: { in: tripIds } }, data: { tripId: null } });
      await tx.hazmatShipment.updateMany({ where: { tenantId: tenant.id, tripId: { in: tripIds } }, data: { tripId: null } });
      // Eventos, paradas, asignaciones, POD, finanzas, estimaciones y recomendaciones caen en cascada.
      await tx.trip.deleteMany({ where: { tenantId: tenant.id, id: { in: tripIds } } });
      await tx.serviceRequest.deleteMany({ where: { tenantId: tenant.id, id: { in: requestIds } } });
    }, { timeout: 120_000 });

    objectKeys.push(
      ...documents.map((doc) => doc.objectKey),
      ...attachments.flatMap((file) => [file.objectKey, file.quarantineKey].filter((key): key is string => Boolean(key))),
    );
  }

  if (!apply) {
    console.log("\nDry-run: no se borro nada. Ejecute con --apply para limpiar.");
    return;
  }

  let removed = 0;
  for (const key of new Set(objectKeys)) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
      removed += 1;
    } catch (error) {
      console.warn(`No se pudo borrar ${key} de MinIO: ${(error as Error).message}`);
    }
  }
  console.log(`\nLimpieza aplicada. Objetos de MinIO borrados: ${removed}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
