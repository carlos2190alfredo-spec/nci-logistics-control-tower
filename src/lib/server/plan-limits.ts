import type { PrismaClient } from "@/generated/prisma";
import { lockTenantForCreate, type Tx } from "@/lib/server/trip-creation";

/**
 * Límites del plan contratado (ADR-038): una sola definición de "usado" que comparten la pantalla
 * (barras de uso, lista de arranque) y las acciones que dan de alta.
 *
 * Módulo SIN "use server": un módulo "use server" solo puede exportar funciones async y cada export suyo
 * es un endpoint público.
 *
 * Qué se aplica y qué solo se muestra:
 * - Se APLICAN (`assertWithinPlanLimit`): vehículos y clientes, en altas por formulario y por CSV.
 * - Solo se MUESTRAN: usuarios, conductores y documentos (fuera de alcance de la Fase 1).
 * Equipos, lugares y tipos de servicio no tienen campo de plan: su tope fijo vive en `catalog/limits.ts`.
 */

export type PlanResource = "users" | "drivers" | "vehicles" | "customers" | "documents";

export type PlanLimits = {
  maxUsers: number;
  maxDrivers: number;
  maxVehicles: number;
  maxCustomers: number;
  maxDocuments: number;
};

/** Lo que necesita el mensaje al usuario; `PlanLimitError` lo cumple, así que se puede pasar tal cual. */
export type PlanLimitDetails = { resource: PlanResource; max: number; used: number; adding: number; planName: string };

export type PlanUsage = {
  plan: PlanLimits & { name: string; code: string };
  usage: Record<PlanResource, number>;
};

/** Delegados de Prisma que necesita este módulo: los cumplen `PrismaClient` y el cliente de una `tx`. */
export type PlanUsageDb = Pick<
  Tx | PrismaClient,
  "tenant" | "tenantMembership" | "driver" | "vehicle" | "customerAccount" | "document"
>;

const PLAN_SELECT = {
  name: true,
  code: true,
  maxUsers: true,
  maxDrivers: true,
  maxVehicles: true,
  maxCustomers: true,
  maxDocuments: true,
} as const;

const MAX_FIELD: Record<PlanResource, keyof PlanLimits> = {
  users: "maxUsers",
  drivers: "maxDrivers",
  vehicles: "maxVehicles",
  customers: "maxCustomers",
  documents: "maxDocuments",
};

/** Límite del plan para un recurso. */
export function planMaxFor(plan: PlanLimits, resource: PlanResource): number {
  return plan[MAX_FIELD[resource]];
}

/**
 * Función pura: ¿cabe `adding` más sobre `used` con un tope `max`? `remaining` es el cupo libre actual
 * (nunca negativo, aunque el tenant ya esté por encima tras bajar de plan). Se permite llegar
 * exactamente al tope. Entradas que no sean enteros no negativos fallan cerrado (`ok: false`).
 */
export function evaluatePlanLimit(input: { used: number; adding: number; max: number }): { ok: boolean; remaining: number } {
  const { used, adding, max } = input;
  const valid = [used, adding, max].every((n) => Number.isInteger(n) && n >= 0);
  if (!valid) return { ok: false, remaining: 0 };
  return { ok: used + adding <= max, remaining: Math.max(0, max - used) };
}

const RESOURCE_NOUNS: Record<PlanResource, { singular: string; plural: string }> = {
  users: { singular: "usuario", plural: "usuarios" },
  drivers: { singular: "conductor", plural: "conductores" },
  vehicles: { singular: "vehículo", plural: "vehículos" },
  customers: { singular: "cliente", plural: "clientes" },
  documents: { singular: "documento", plural: "documentos" },
};

function noun(resource: PlanResource, quantity: number): string {
  const { singular, plural } = RESOURCE_NOUNS[resource];
  return quantity === 1 ? singular : plural;
}

/**
 * Mensaje para el usuario (usted, ortografía completa).
 * - `create`: "Su plan Starter permite hasta 10 vehículos y ya tiene 10 registrados. Para agregar más…"
 * - `import`: "La importación agregaría 40 clientes pero su plan Starter admite 6 y ya tiene 4. No se importó nada."
 */
export function planLimitMessage(details: PlanLimitDetails, mode: "create" | "import" = "create"): string {
  const { resource, max, used, adding } = details;
  const plan = details.planName.trim() === "" ? "actual" : details.planName.trim();
  if (mode === "import") {
    return `La importación agregaría ${adding} ${noun(resource, adding)} pero su plan ${plan} admite ${max} y ya tiene ${used}. No se importó nada.`;
  }
  return `Su plan ${plan} permite hasta ${max} ${noun(resource, max)} y ya tiene ${used} ${
    used === 1 ? "registrado" : "registrados"
  }. Para agregar más, solicite ampliar el plan a NCI Automation.`;
}

/**
 * Se lanza dentro de la transacción para revertirla. `message` ya es el texto para el usuario (modo
 * `create`); para una importación use `planLimitMessage(error, "import")`.
 */
export class PlanLimitError extends Error {
  readonly resource: PlanResource;
  readonly max: number;
  readonly used: number;
  readonly adding: number;
  readonly planName: string;

  constructor(details: PlanLimitDetails) {
    super(planLimitMessage(details));
    this.name = "PlanLimitError";
    this.resource = details.resource;
    this.max = details.max;
    this.used = details.used;
    this.adding = details.adding;
    this.planName = details.planName;
  }
}

/**
 * La definición única de "usado". Clientes y vehículos cuentan solo los activos: sin borrado, inactivar
 * es la única forma de liberar cupo ante un error de captura. Usuarios, conductores y documentos cuentan
 * todas las filas (como las barras de Configuración).
 */
function countUsed(db: PlanUsageDb, tenantId: string, resource: PlanResource): Promise<number> {
  switch (resource) {
    case "customers":
      return db.customerAccount.count({ where: { tenantId, active: true } });
    case "vehicles":
      return db.vehicle.count({ where: { tenantId, status: { not: "INACTIVE" } } });
    case "users":
      return db.tenantMembership.count({ where: { tenantId } });
    case "drivers":
      return db.driver.count({ where: { tenantId } });
    case "documents":
      return db.document.count({ where: { tenantId } });
  }
}

async function readPlan(db: PlanUsageDb, tenantId: string) {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { plan: { select: PLAN_SELECT } } });
  if (!tenant) throw new Error("No se encontró la empresa para calcular el uso de su plan.");
  return tenant.plan;
}

/** Plan contratado y uso actual de cada recurso: lo que muestran las barras de uso y la lista de arranque. */
export async function getPlanUsage(db: PlanUsageDb, tenantId: string): Promise<PlanUsage> {
  const [plan, users, drivers, vehicles, customers, documents] = await Promise.all([
    readPlan(db, tenantId),
    countUsed(db, tenantId, "users"),
    countUsed(db, tenantId, "drivers"),
    countUsed(db, tenantId, "vehicles"),
    countUsed(db, tenantId, "customers"),
    countUsed(db, tenantId, "documents"),
  ]);
  return {
    plan: {
      name: plan.name,
      code: plan.code,
      maxUsers: plan.maxUsers,
      maxDrivers: plan.maxDrivers,
      maxVehicles: plan.maxVehicles,
      maxCustomers: plan.maxCustomers,
      maxDocuments: plan.maxDocuments,
    },
    usage: { users, drivers, vehicles, customers, documents },
  };
}

/**
 * Verifica que `adding` altas más caben en el plan, SIN carrera, y lanza `PlanLimitError` si no.
 *
 * Debe llamarse dentro de la misma transacción que crea las filas: bloquea el tenant
 * (`lockTenantForCreate`), lee el plan ya con el bloqueo (un cambio de plan concurrente queda
 * serializado), cuenta con la definición única y recién entonces decide. Dos altas simultáneas con un
 * solo cupo libre se turnan: la segunda ve la fila de la primera y es rechazada. El bloqueo dura hasta el
 * COMMIT, así que en importaciones largas conviene validar el CSV antes de abrir la transacción.
 */
export async function assertWithinPlanLimit(
  tx: Tx,
  input: { tenantId: string; resource: "vehicles" | "customers"; adding: number },
): Promise<void> {
  const { tenantId, resource, adding } = input;
  if (resource !== "vehicles" && resource !== "customers") {
    throw new RangeError("Solo se aplican límites de plan a vehículos y clientes.");
  }
  if (!Number.isInteger(adding) || adding < 0) throw new RangeError("La cantidad a agregar debe ser un entero no negativo.");

  await lockTenantForCreate(tx, tenantId);
  const plan = await readPlan(tx, tenantId);
  const used = await countUsed(tx, tenantId, resource);
  const max = planMaxFor(plan, resource);
  if (!evaluatePlanLimit({ used, adding, max }).ok) {
    throw new PlanLimitError({ resource, max, used, adding, planName: plan.name });
  }
}
