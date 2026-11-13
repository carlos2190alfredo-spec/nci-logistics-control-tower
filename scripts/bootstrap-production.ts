/**
 * Bootstrap de produccion (OPS-03): deja una base recien migrada lista para operar sin
 * sembrar datos demo.
 *
 *   1. Upserta los planes de tenant (`prisma/plans.ts`, la misma definicion que el seed).
 *      Sin planes la UI no puede crear tenants (`findUniqueOrThrow` en `tenant-actions.ts`).
 *   2. Crea el primer PLATFORM_SUPER_ADMIN con un correo real y una contrasena propia.
 *
 * Es idempotente y nunca pisa datos existentes: no cambia la contrasena ni el rol de un
 * usuario que ya existe, y no modifica planes existentes (solo informa si difieren).
 *
 * Variables (no se aceptan por argumento para que no queden en el historial del shell):
 *   DATABASE_URL                 base de datos destino
 *   CONFIRM_DB_HOST              obligatorio si el host no es local: debe ser igual al host
 *   BOOTSTRAP_ADMIN_EMAIL        buzon real (no .local / .test / example.*)
 *   BOOTSTRAP_ADMIN_NAME         nombre visible
 *   BOOTSTRAP_ADMIN_PASSWORD     minimo 16 caracteres; nunca se imprime
 *
 *   CONFIRM_DB_HOST=<host> BOOTSTRAP_ADMIN_EMAIL=... BOOTSTRAP_ADMIN_NAME=... \
 *     BOOTSTRAP_ADMIN_PASSWORD=... pnpm prod:bootstrap
 *
 * MFA: no se crea un secreto TOTP. La app lo exige en el primer ingreso: `signIn` abre una
 * sesion PASSWORD_ONLY, el login redirige a /platform y `requirePlatformRole`
 * (`src/lib/server/auth.ts`) manda a /account/security/mfa/setup mientras el usuario no
 * tenga un secreto TOTP verificado. Asi el secreto nace en el dispositivo del operador y
 * nunca pasa por este script.
 */
import { config } from "dotenv";
// Precedencia: variables exportadas > .env.local > .env (dotenv no pisa lo ya definido).
config({ path: ".env.local" });
config({ path: ".env" });

import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma";
import { hashPassword } from "../src/lib/server/crypto";
import { planDrift, TENANT_PLANS, upsertTenantPlans } from "../prisma/plans";
import { parseBootstrapInput } from "./lib/bootstrap-input";
import { requireConfirmedHost } from "./lib/db-target";

const LABEL = "prod:bootstrap";
const prisma = new PrismaClient();

function log(message: string) {
  console.log(`[${LABEL}] ${message}`);
}

function fail(message: string): never {
  console.error(`\n[${LABEL}] ${message}\n`);
  process.exit(1);
}

/** Los errores de consulta de Prisma pueden volcar los argumentos (incluido el hash): solo tipo y codigo. */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return "error desconocido";
  if (
    error.name === "PrismaClientKnownRequestError" ||
    error.name === "PrismaClientValidationError"
  ) {
    const code = (error as { code?: string }).code;
    return `${error.name}${code ? ` ${code}` : ""}`;
  }
  return error.message;
}

function printMfaNotice() {
  log("MFA: la app exige enrolar un segundo factor en el primer ingreso.");
  log("  - Inicie sesion en /login con el correo del administrador.");
  log(
    "  - El login lleva a /platform y la app redirige a /account/security/mfa/setup",
  );
  log("    hasta que haya un secreto TOTP verificado (requirePlatformRole).");
  log(
    "  - Escanee el QR con una app autenticadora y guarde los codigos de recuperacion.",
  );
}

async function bootstrapPlans() {
  const existing = new Map(
    (await prisma.tenantPlan.findMany()).map((plan) => [plan.code, plan]),
  );
  await upsertTenantPlans(prisma);

  log("Planes de tenant:");
  for (const definition of TENANT_PLANS) {
    const row = existing.get(definition.code);
    if (!row) {
      log(`  + ${definition.code}: creado`);
      continue;
    }
    const drift = planDrift(definition, row);
    log(
      drift.length > 0
        ? `  = ${definition.code}: ya existia y difiere de prisma/plans.ts en [${drift.join(", ")}]; no se modifica`
        : `  = ${definition.code}: ya existia`,
    );
  }
}

async function main() {
  requireConfirmedHost(LABEL);

  let input: ReturnType<typeof parseBootstrapInput>;
  try {
    input = parseBootstrapInput(process.env);
  } catch (error) {
    return fail(`Entrada invalida:\n${(error as Error).message}`);
  }

  await bootstrapPlans();

  const existingUser = await prisma.user.findUnique({
    where: { email: input.email },
    select: { platformRole: true, active: true },
  });

  if (existingUser) {
    if (existingUser.platformRole !== "PLATFORM_SUPER_ADMIN") {
      return fail(
        `El usuario ${input.email} ya existe sin ser PLATFORM_SUPER_ADMIN. Este script nunca cambia la ` +
          "contrasena ni el rol de un usuario existente: use otro correo.",
      );
    }
    log(
      `El administrador ${input.email} ya existe${existingUser.active ? "" : " (INACTIVO)"}; no se modifica nada.`,
    );
    if (!existingUser.active)
      log(
        "Reactivelo manualmente (active=true) si es el administrador que necesita.",
      );
    printMfaNotice();
    return;
  }

  const id = randomUUID();
  const passwordHash = await hashPassword(input.password);
  await prisma.$transaction([
    prisma.user.create({
      data: {
        id,
        email: input.email,
        name: input.name,
        passwordHash,
        platformRole: "PLATFORM_SUPER_ADMIN",
        active: true,
        // El operador controla el buzon y no hay correo de verificacion antes del primer ingreso.
        emailVerified: true,
      },
    }),
    prisma.auditLog.create({
      data: {
        actorId: id,
        actorRole: "PLATFORM_SUPER_ADMIN",
        action: "platform.bootstrap",
        entity: "User",
        entityId: id,
        after: { platformRole: "PLATFORM_SUPER_ADMIN", source: LABEL },
      },
    }),
  ]);

  log(
    `Administrador de plataforma creado: ${input.email} (la contrasena no se imprime ni se guarda en claro).`,
  );
  printMfaNotice();

  const others = await prisma.user.count({
    where: {
      platformRole: "PLATFORM_SUPER_ADMIN",
      active: true,
      id: { not: id },
    },
  });
  if (others > 0) {
    log(
      `AVISO: hay ${others} PLATFORM_SUPER_ADMIN activo(s) mas (por ejemplo platform@nci.local del seed demo). ` +
        "Verifique su acceso nuevo y ejecute `pnpm demo:purge` para retirar las cuentas demo.",
    );
  }
  log("Retire BOOTSTRAP_ADMIN_PASSWORD del entorno y del historial del shell.");
}

main()
  .catch((error) => {
    console.error(`[${LABEL}] Error: ${describeError(error)}`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
