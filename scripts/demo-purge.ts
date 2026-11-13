/**
 * Retira los datos demo antes de operar con clientes reales (OPS-03, F5).
 *
 * El seed crea tenants demo (`isDemo = true`) y ocho cuentas `*.local` que comparten una sola
 * contrasena (SEED_PASSWORD) y, las tres con MFA, un solo secreto TOTP (SEED_TOTP_SECRET).
 * Este script borra solo eso:
 *   - los tenants con `isDemo = true` y todo lo que cuelga de ellos;
 *   - los usuarios cuyo correo termina en `.local` (dominio no enrutable: ningun cliente real
 *     lo tiene) y que no pertenecen a ningun tenant real.
 * Un usuario `.local` que no se puede borrar (tiene feedback o invitaciones en un tenant real)
 * se desactiva y se revocan sus sesiones. No toca usuarios con correo real.
 *
 *   CONFIRM_DB_HOST=<host> pnpm demo:purge           # dry-run (por defecto): solo cuenta
 *   CONFIRM_DB_HOST=<host> pnpm demo:purge --apply   # borra
 *
 * - Un host que no es local exige `CONFIRM_DB_HOST` igual al host, tambien en dry-run.
 * - Con `--apply` exige que, despues de purgar, quede al menos un PLATFORM_SUPER_ADMIN activo
 *   que no sea demo (cree uno antes con `pnpm prod:bootstrap`): evita quedarse sin acceso.
 * - Los archivos de los tenants demo en el bucket se borran si hay MINIO_* en el entorno.
 *
 * Despues: retirar SEED_PASSWORD y SEED_TOTP_SECRET de Vercel y de los archivos locales.
 */
import { config } from "dotenv";
// Precedencia: variables exportadas > .env.local > .env (dotenv no pisa lo ya definido).
config({ path: ".env.local" });
config({ path: ".env" });

import { DeleteObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Prisma, PrismaClient } from "../src/generated/prisma";
import { isLocalDbHost, parseDbTarget, requireConfirmedHost } from "./lib/db-target";

const LABEL = "demo:purge";
const apply = process.argv.includes("--apply");
const prisma = new PrismaClient();

function log(message = "") {
  console.log(message ? `[${LABEL}] ${message}` : "");
}

function fail(message: string): never {
  console.error(`\n[${LABEL}] BLOQUEADO: ${message}\n`);
  process.exit(1);
}

type DemoTenant = { id: string; slug: string; name: string };

/** Claves de objetos (documentos y adjuntos) de un tenant, para borrarlas del bucket despues. */
async function collectObjectKeys(tenantId: string): Promise<string[]> {
  const [documents, attachments] = await Promise.all([
    prisma.document.findMany({
      where: { tenantId },
      select: { objectKey: true },
    }),
    prisma.fileAttachment.findMany({
      where: { tenantId },
      select: { objectKey: true, quarantineKey: true },
    }),
  ]);
  const keys = [
    ...documents.map((doc) => doc.objectKey),
    ...attachments.flatMap((file) => [file.objectKey, file.quarantineKey]),
  ].filter((key): key is string => Boolean(key));
  return [...new Set(keys)];
}

async function describeTenant(tenant: DemoTenant) {
  const [trips, documents, attachments, memberships] = await Promise.all([
    prisma.trip.count({ where: { tenantId: tenant.id } }),
    prisma.document.count({ where: { tenantId: tenant.id } }),
    prisma.fileAttachment.count({ where: { tenantId: tenant.id } }),
    prisma.tenantMembership.count({ where: { tenantId: tenant.id } }),
  ]);
  log(
    `  tenant ${tenant.slug} (${tenant.name}): ${trips} viajes, ${documents} documentos, ${attachments} adjuntos, ${memberships} membresias`,
  );
}

/**
 * Borra un tenant demo. Los hijos con `onDelete: Restrict` hacia hermanos (viajes y solicitudes
 * hacia clientes y tipos de servicio; asignaciones hacia vehiculos, equipos y conductores) se
 * eliminan primero; el resto cae en cascada al borrar el tenant. Las tablas con `tenant_id` sin
 * FK a `tenants` se limpian explicitamente. Todo en una transaccion: o se borra completo o nada.
 */
async function deleteTenant(tenantId: string) {
  await prisma.$transaction(
    async (tx) => {
      await tx.operationalAlert.deleteMany({ where: { tenantId } });
      await tx.attachmentReceipt.deleteMany({ where: { tenantId } });
      // Eventos, ubicaciones, asignaciones, POD, finanzas, paradas, estimaciones y recomendaciones caen en cascada.
      await tx.trip.deleteMany({ where: { tenantId } });
      await tx.serviceRequest.deleteMany({ where: { tenantId } });
      await tx.auditLog.deleteMany({ where: { tenantId } });
      await tx.tenant.delete({ where: { id: tenantId } });
    },
    { timeout: 120_000, maxWait: 15_000 },
  );
}

async function deleteOrDeactivateUser(
  userId: string,
): Promise<"deleted" | "deactivated"> {
  try {
    await prisma.user.delete({ where: { id: userId } });
    return "deleted";
  } catch (error) {
    // P2003: tiene feedback, comentarios o invitaciones en tenants reales (FK Restrict).
    if (
      !(error instanceof Prisma.PrismaClientKnownRequestError) ||
      error.code !== "P2003"
    )
      throw error;
    await prisma.$transaction([
      prisma.user.update({ where: { id: userId }, data: { active: false } }),
      prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
    return "deactivated";
  }
}

function storageClient(): {
  client: S3Client;
  bucket: string;
  endpoint: string;
} | null {
  const endpoint = process.env.MINIO_ENDPOINT;
  const accessKeyId = process.env.MINIO_ACCESS_KEY;
  const secretAccessKey = process.env.MINIO_SECRET_KEY;
  const bucket = process.env.MINIO_BUCKET;
  if (!endpoint || !accessKeyId || !secretAccessKey || !bucket) return null;
  return {
    client: new S3Client({
      endpoint,
      // `||` y no `??`: .env.example trae STORAGE_REGION="" (cadena vacia).
      region: process.env.STORAGE_REGION || "us-east-1",
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
    }),
    bucket,
    endpoint: new URL(endpoint).host,
  };
}

async function deleteObjects(keys: string[]) {
  if (keys.length === 0) return;
  const storage = storageClient();
  if (!storage) {
    log(
      `AVISO: ${keys.length} objeto(s) de los tenants demo siguen en el bucket: faltan MINIO_ENDPOINT, ` +
        "MINIO_ACCESS_KEY, MINIO_SECRET_KEY y MINIO_BUCKET en el entorno. Borrelos desde Supabase Storage.",
    );
    return;
  }
  // Coherencia: con una base remota nunca se borra en un MinIO local (dotenv completa MINIO_*
  // desde .env.local cuando solo se exporta DATABASE_URL) ni al reves.
  const dbTarget = parseDbTarget(process.env.DATABASE_URL);
  const dbIsLocal = dbTarget ? isLocalDbHost(dbTarget) : false;
  const storageHost = new URL(process.env.MINIO_ENDPOINT as string).hostname.toLowerCase();
  const storageIsLocal = ["localhost", "127.0.0.1", "[::1]", "::1", "minio", "host.docker.internal"].includes(storageHost);
  if (dbIsLocal !== storageIsLocal) {
    log(
      `AVISO: ${keys.length} objeto(s) no se borraron: la base (${dbIsLocal ? "local" : "remota"}) y el ` +
        `almacenamiento (${storageIsLocal ? "local" : "remoto"}) no corresponden al mismo entorno. ` +
        "Exporte MINIO_ENDPOINT, MINIO_ACCESS_KEY, MINIO_SECRET_KEY y MINIO_BUCKET del entorno correcto.",
    );
    return;
  }
  log(
    `Borrando ${keys.length} objeto(s) de ${storage.bucket} en ${storage.endpoint}...`,
  );
  let removed = 0;
  for (const key of keys) {
    try {
      await storage.client.send(
        new DeleteObjectCommand({ Bucket: storage.bucket, Key: key }),
      );
      removed += 1;
    } catch (error) {
      console.warn(
        `[${LABEL}] No se pudo borrar ${key}: ${error instanceof Error ? error.name : "error"}`,
      );
    }
  }
  log(`Objetos borrados: ${removed} de ${keys.length}.`);
}

async function main() {
  requireConfirmedHost(LABEL);
  log(
    apply
      ? "Modo: APLICAR (borra datos)."
      : "Modo: dry-run (no borra nada). Use --apply para ejecutar.",
  );

  const tenants: DemoTenant[] = await prisma.tenant.findMany({
    where: { isDemo: true },
    select: { id: true, slug: true, name: true },
    orderBy: { slug: "asc" },
  });
  const demoTenantIds = new Set(tenants.map((tenant) => tenant.id));

  log(`Tenants demo (isDemo = true): ${tenants.length}`);
  for (const tenant of tenants) await describeTenant(tenant);

  const candidates = await prisma.user.findMany({
    where: { email: { endsWith: ".local", mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      active: true,
      platformRole: true,
      tenantMemberships: { select: { tenantId: true } },
      customerMemberships: { select: { tenantId: true } },
    },
    orderBy: { email: "asc" },
  });

  const purgeUsers = candidates.filter((user) =>
    [...user.tenantMemberships, ...user.customerMemberships].every(
      (membership) => demoTenantIds.has(membership.tenantId),
    ),
  );
  const keptUsers = candidates.filter((user) => !purgeUsers.includes(user));

  log(`Usuarios .local a retirar: ${purgeUsers.length}`);
  for (const user of purgeUsers) {
    log(
      `  ${user.email}${user.platformRole ? ` [${user.platformRole}]` : ""}${user.active ? "" : " (ya inactivo)"}`,
    );
  }
  for (const user of keptUsers) {
    log(
      `  CONSERVADO ${user.email}: pertenece a un tenant que no es demo. Revisenlo a mano.`,
    );
  }

  // Usuarios con correo real que solo pertenecen a tenants demo: no se tocan, pero quedan sin tenant.
  const realUsersOnlyInDemo = await prisma.user.findMany({
    where: {
      NOT: { email: { endsWith: ".local", mode: "insensitive" } },
      OR: [
        {
          tenantMemberships: { some: { tenantId: { in: [...demoTenantIds] } } },
        },
        {
          customerMemberships: {
            some: { tenantId: { in: [...demoTenantIds] } },
          },
        },
      ],
    },
    select: {
      email: true,
      tenantMemberships: { select: { tenantId: true } },
      customerMemberships: { select: { tenantId: true } },
    },
  });
  for (const user of realUsersOnlyInDemo) {
    const memberships = [
      ...user.tenantMemberships,
      ...user.customerMemberships,
    ];
    const onlyDemo = memberships.every((membership) =>
      demoTenantIds.has(membership.tenantId),
    );
    log(
      onlyDemo
        ? `  REVISAR ${user.email}: correo real vinculado solo a tenants demo; no se borra y quedara sin tenant.`
        : `  REVISAR ${user.email}: correo real con membresias en tenants demo y reales; solo se pierden las demo.`,
    );
  }

  const purgingSuperAdmin = purgeUsers.some(
    (user) => user.platformRole === "PLATFORM_SUPER_ADMIN",
  );
  const remainingAdmins = await prisma.user.count({
    where: {
      platformRole: "PLATFORM_SUPER_ADMIN",
      active: true,
      id: { notIn: purgeUsers.map((user) => user.id) },
    },
  });
  log(`PLATFORM_SUPER_ADMIN activos que quedarian: ${remainingAdmins}`);
  if (purgingSuperAdmin && remainingAdmins === 0) {
    const message =
      "al purgar no quedaria ningun PLATFORM_SUPER_ADMIN activo. Cree antes el administrador real con `pnpm prod:bootstrap`.";
    if (apply) fail(message);
    log(`AVISO: ${message}`);
  }

  if (!apply) {
    log();
    log("Dry-run: no se borro nada. Ejecute con --apply para aplicar.");
    return;
  }

  if (tenants.length === 0 && purgeUsers.length === 0) {
    log("No hay nada que retirar.");
    return;
  }

  const objectKeys: string[] = [];
  for (const tenant of tenants)
    objectKeys.push(...(await collectObjectKeys(tenant.id)));

  for (const tenant of tenants) {
    await deleteTenant(tenant.id);
    log(`Tenant ${tenant.slug} borrado.`);
  }

  const deleted: string[] = [];
  const deactivated: string[] = [];
  for (const user of purgeUsers) {
    const outcome = await deleteOrDeactivateUser(user.id);
    (outcome === "deleted" ? deleted : deactivated).push(user.email);
  }
  log(
    `Usuarios borrados: ${deleted.length}. Desactivados (no se pudieron borrar): ${deactivated.length}.`,
  );
  for (const email of deactivated) log(`  desactivado ${email}`);

  await deleteObjects(objectKeys);

  await prisma.auditLog.create({
    data: {
      actorRole: "SYSTEM",
      action: "demo.purge",
      entity: "Tenant",
      after: {
        source: LABEL,
        tenants: tenants.map((tenant) => tenant.slug),
        usersDeleted: deleted.length,
        usersDeactivated: deactivated.length,
      },
    },
  });

  log();
  log("Purga aplicada. Pendiente fuera del codigo:");
  log(
    "  - Retirar SEED_PASSWORD y SEED_TOTP_SECRET de Vercel y de los archivos de entorno locales.",
  );
  log("  - No vuelva a ejecutar `pnpm db:seed` contra esta base.");
}

main()
  .catch((error) => {
    console.error(
      `[${LABEL}] Error: ${error instanceof Error ? error.message : "desconocido"}`,
    );
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
