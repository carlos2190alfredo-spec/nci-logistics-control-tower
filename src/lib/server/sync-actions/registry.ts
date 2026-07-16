import { z } from "zod";
import type { TenantRole } from "@/generated/prisma";
import { audit } from "@/lib/server/audit";
import { getDb } from "@/lib/server/db";
import { ErrorCodes } from "@/lib/server/errors";

export type SyncCtx = {
  userId: string;
  userName: string;
  tenantId: string;
  tenantSlug: string;
  role: TenantRole;
};

export type SyncHandlerResult =
  | { ok: true; entityId: string }
  | { ok: false; errorCode: string; retryable: boolean };

export type SyncHandler = (ctx: SyncCtx, formData: FormData) => Promise<SyncHandlerResult>;

export type SyncRegistryEntry = {
  handler: SyncHandler;
  allowedRoles: readonly TenantRole[];
};

const ALL_TENANT_ROLES: readonly TenantRole[] = [
  "TENANT_OWNER",
  "TENANT_ADMIN",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "SAFETY_MANAGER",
  "DRIVER",
];

// ---------------------------------------------------------------------------
// incident.report — cualquier miembro del tenant puede reportar una incidencia
//                   sobre un viaje del tenant.
// ---------------------------------------------------------------------------
const reportIncidentSchema = z.object({
  tripId: z.string().uuid(),
  category: z.string().min(1).max(64),
  internalDescription: z.string().min(1).max(500),
  customerMessage: z.string().max(500).optional(),
});

const reportIncidentHandler: SyncHandler = async (ctx, formData) => {
  const parsed = reportIncidentSchema.parse({
    tripId: formData.get("tripId"),
    category: formData.get("category"),
    internalDescription:
      formData.get("internalDescription") ||
      formData.get("customerMessage") ||
      "Incidencia registrada.",
    customerMessage: formData.get("customerMessage")?.toString() || undefined,
  });

  const db = getDb();
  const trip = await db.trip.findFirst({
    where: { id: parsed.tripId, tenantId: ctx.tenantId },
    select: { id: true, customerAccountId: true },
  });
  if (!trip) return { ok: false, errorCode: ErrorCodes.RESOURCE_NOT_FOUND, retryable: false };

  const incident = await db.incident.create({
    data: {
      tenantId: ctx.tenantId,
      customerAccountId: trip.customerAccountId,
      tripId: trip.id,
      category: parsed.category,
      priority: "MEDIUM",
      internalDescription: parsed.internalDescription,
      customerMessage: parsed.customerMessage ?? null,
      visibleToCustomer: Boolean(parsed.customerMessage),
    },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "incident.create.sync",
    entity: "Incident",
    entityId: incident.id,
    after: parsed,
  });

  return { ok: true, entityId: incident.id };
};

// ---------------------------------------------------------------------------
// driver.create — crear conductor (OWNER, ADMIN, OPERATIONS_MANAGER)
// ---------------------------------------------------------------------------
const createDriverSchema = z.object({
  name: z.string().min(2).max(100),
  code: z.string().min(2).max(20),
  license: z.string().min(2).max(50),
  phone: z.string().max(30).optional(),
});

const createDriverHandler: SyncHandler = async (ctx, formData) => {
  const parsed = createDriverSchema.parse({
    name: formData.get("name"),
    code: formData.get("code"),
    license: formData.get("license"),
    phone: formData.get("phone")?.toString()?.trim() || undefined,
  });

  const db = getDb();
  const driver = await db.driver.create({
    data: {
      tenantId: ctx.tenantId,
      name: parsed.name,
      code: parsed.code,
      license: parsed.license,
      phone: parsed.phone || null,
      status: "AVAILABLE",
    },
  });

  await audit({
    tenantId: ctx.tenantId,
    actorId: ctx.userId,
    actorRole: ctx.role,
    action: "driver.create.sync",
    entity: "Driver",
    entityId: driver.id,
    after: parsed,
  });

  return { ok: true, entityId: driver.id };
};

// ---------------------------------------------------------------------------
// Registry
//
// Se usa un objeto con prototipo nulo para que claves como "__proto__" o
// "constructor" NO existan de forma implícita. Sin esto, un actionId
// malicioso pasaría el chequeo de existencia por herencia de prototipo.
// ---------------------------------------------------------------------------
export const SYNC_ACTION_REGISTRY: Record<string, SyncRegistryEntry> = Object.assign(
  Object.create(null),
  {
    "incident.report": {
      handler: reportIncidentHandler,
      allowedRoles: ALL_TENANT_ROLES,
    },
    "driver.create": {
      handler: createDriverHandler,
      allowedRoles: ["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER"],
    },
  },
);

export function isKnownSyncAction(actionId: string): boolean {
  return Object.hasOwn(SYNC_ACTION_REGISTRY, actionId);
}

/** Lookup seguro: solo devuelve entradas propias, nunca del prototipo. */
export function getSyncActionEntry(actionId: string): SyncRegistryEntry | undefined {
  return Object.hasOwn(SYNC_ACTION_REGISTRY, actionId)
    ? SYNC_ACTION_REGISTRY[actionId]
    : undefined;
}
