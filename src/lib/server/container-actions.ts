"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/server/audit";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { hasPermission } from "@/lib/server/tenant-permissions";
import { canTransitionContainer, dateStampForStatus } from "@/lib/containers/lifecycle";
import type { ContainerStatus } from "@/generated/prisma";

const OPERATION_TYPES = ["IMPORTACION", "EXPORTACION", "TRANSITO", "REEXPORTACION", "MOVIMIENTO_NACIONAL"] as const;
const SIZES = ["S20", "S40", "S45", "OTRO"] as const;
const TYPES = ["SECO", "REFRIGERADO", "OPEN_TOP", "FLAT_RACK", "TANQUE", "ESPECIAL"] as const;
const CHARGE_TYPES = [
  "ALMACENAJE_PORTUARIO", "DEMURRAGE", "DETENTION", "RETENCION", "ESPERA",
  "STANDBY", "MANIOBRAS", "SOBRECOSTO", "REENTREGA", "REPROGRAMACION", "TERCEROS",
] as const;

const MANAGE_ROLES = ["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "DISPATCHER"] as const;

function parseDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function parseInt0(v?: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

const createSchema = z.object({
  reference: z.string().min(2).max(80),
  operationType: z.enum(OPERATION_TYPES),
  size: z.enum(SIZES).default("S40"),
  type: z.enum(TYPES).default("SECO"),
  containerNumber: z.string().max(20).optional(),
  shippingLine: z.string().max(80).optional(),
  terminal: z.string().max(80).optional(),
  booking: z.string().max(80).optional(),
  sealNumber: z.string().max(40).optional(),
  freeDays: z.string().optional(),
  returnDeadline: z.string().optional(),
  notes: z.string().max(1000).optional(),
});

export async function createContainerAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [...MANAGE_ROLES]);
  if (!hasPermission(membership.role, "tenant.containers.manage")) {
    redirect(`/t/${tenantSlug}/containers`);
  }

  const parsed = createSchema.parse({
    reference: formData.get("reference"),
    operationType: formData.get("operationType"),
    size: formData.get("size") || "S40",
    type: formData.get("type") || "SECO",
    containerNumber: formData.get("containerNumber")?.toString()?.trim() || undefined,
    shippingLine: formData.get("shippingLine")?.toString()?.trim() || undefined,
    terminal: formData.get("terminal")?.toString()?.trim() || undefined,
    booking: formData.get("booking")?.toString()?.trim() || undefined,
    sealNumber: formData.get("sealNumber")?.toString()?.trim() || undefined,
    freeDays: formData.get("freeDays")?.toString() || undefined,
    returnDeadline: formData.get("returnDeadline")?.toString() || undefined,
    notes: formData.get("notes")?.toString()?.trim() || undefined,
  });

  const created = await getDb().container.create({
    data: {
      tenantId: tenant.id,
      reference: parsed.reference,
      operationType: parsed.operationType,
      size: parsed.size,
      type: parsed.type,
      containerNumber: parsed.containerNumber ?? null,
      shippingLine: parsed.shippingLine ?? null,
      terminal: parsed.terminal ?? null,
      booking: parsed.booking ?? null,
      sealNumber: parsed.sealNumber ?? null,
      freeDays: parseInt0(parsed.freeDays),
      returnDeadline: parseDate(parsed.returnDeadline),
      notes: parsed.notes ?? null,
      status: "SOLICITUD_RECIBIDA",
    },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "container.create",
    entity: "Container",
    entityId: created.id,
    after: { reference: parsed.reference, operationType: parsed.operationType },
  });

  revalidatePath(`/t/${tenantSlug}/containers`);
  redirect(`/t/${tenantSlug}/containers/${created.id}`);
}

const transitionSchema = z.object({
  containerId: z.string().uuid(),
  nextStatus: z.string().min(2).max(40),
});

export async function transitionContainerAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [...MANAGE_ROLES]);
  if (!hasPermission(membership.role, "tenant.containers.manage")) {
    redirect(`/t/${tenantSlug}/containers`);
  }
  const parsed = transitionSchema.parse({
    containerId: formData.get("containerId"),
    nextStatus: formData.get("nextStatus"),
  });
  const nextStatus = parsed.nextStatus as ContainerStatus;

  const container = await getDb().container.findFirst({
    where: { id: parsed.containerId, tenantId: tenant.id },
  });
  if (!container) redirect(`/t/${tenantSlug}/containers`);

  // Validación determinista de la transición.
  if (!canTransitionContainer(container!.status, nextStatus)) {
    redirect(`/t/${tenantSlug}/containers/${parsed.containerId}`);
  }

  const stampField = dateStampForStatus(nextStatus);
  await getDb().container.update({
    where: { id: parsed.containerId },
    data: {
      status: nextStatus,
      ...(stampField && !container![stampField] ? { [stampField]: new Date() } : {}),
    },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "container.transition",
    entity: "Container",
    entityId: parsed.containerId,
    before: { status: container!.status },
    after: { status: nextStatus },
  });

  revalidatePath(`/t/${tenantSlug}/containers/${parsed.containerId}`);
  redirect(`/t/${tenantSlug}/containers/${parsed.containerId}`);
}

const RELEASE_STATES = ["PENDIENTE", "LIBERADO", "RECHAZADO", "RETENIDO"] as const;

const releaseSchema = z.object({
  containerId: z.string().uuid(),
  releaseStatus: z.enum(RELEASE_STATES),
  reason: z.string().max(500).optional(),
});

/**
 * Registra una excepción de liberación aduanera/portuaria del contenedor
 * (liberado / rechazado / retenido). El motivo queda auditado. Determinista;
 * no sustituye a la autoridad, solo registra el resultado verificado.
 */
export async function setContainerReleaseAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [...MANAGE_ROLES]);
  if (!hasPermission(membership.role, "tenant.containers.manage")) {
    redirect(`/t/${tenantSlug}/containers`);
  }
  const parsed = releaseSchema.parse({
    containerId: formData.get("containerId"),
    releaseStatus: formData.get("releaseStatus"),
    reason: formData.get("reason")?.toString()?.trim() || undefined,
  });

  const container = await getDb().container.findFirst({
    where: { id: parsed.containerId, tenantId: tenant.id },
    select: { id: true, releaseStatus: true },
  });
  if (!container) redirect(`/t/${tenantSlug}/containers`);

  await getDb().container.update({
    where: { id: parsed.containerId },
    data: { releaseStatus: parsed.releaseStatus },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "container.release.update",
    entity: "Container",
    entityId: parsed.containerId,
    before: { releaseStatus: container!.releaseStatus },
    after: { releaseStatus: parsed.releaseStatus, reason: parsed.reason ?? null },
  });

  revalidatePath(`/t/${tenantSlug}/containers/${parsed.containerId}`);
  redirect(`/t/${tenantSlug}/containers/${parsed.containerId}`);
}

const chargeSchema = z.object({
  containerId: z.string().uuid(),
  type: z.enum(CHARGE_TYPES),
  freeDays: z.string().optional(),
  ratePerDay: z.string().optional(),
  currency: z.string().max(3).default("USD"),
  startAt: z.string().optional(),
  billable: z.boolean().default(true),
  notes: z.string().max(500).optional(),
});

export async function addContainerChargeAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [...MANAGE_ROLES]);
  if (!hasPermission(membership.role, "tenant.containers.manage")) {
    redirect(`/t/${tenantSlug}/containers`);
  }
  const parsed = chargeSchema.parse({
    containerId: formData.get("containerId"),
    type: formData.get("type"),
    freeDays: formData.get("freeDays")?.toString() || undefined,
    ratePerDay: formData.get("ratePerDay")?.toString() || undefined,
    currency: formData.get("currency")?.toString() || "USD",
    startAt: formData.get("startAt")?.toString() || undefined,
    billable: formData.get("billable") !== "off",
    notes: formData.get("notes")?.toString()?.trim() || undefined,
  });

  const container = await getDb().container.findFirst({
    where: { id: parsed.containerId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!container) redirect(`/t/${tenantSlug}/containers`);

  const rate = parsed.ratePerDay ? Number(parsed.ratePerDay) : null;
  const created = await getDb().containerCharge.create({
    data: {
      tenantId: tenant.id,
      containerId: parsed.containerId,
      type: parsed.type,
      freeDays: parseInt0(parsed.freeDays) ?? 0,
      ratePerDay: rate != null && Number.isFinite(rate) ? rate : null,
      currency: parsed.currency,
      startAt: parseDate(parsed.startAt),
      billable: parsed.billable,
      notes: parsed.notes ?? null,
      status: "PROYECTADO",
    },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "container.charge.create",
    entity: "ContainerCharge",
    entityId: created.id,
    after: { type: parsed.type, billable: parsed.billable },
  });

  revalidatePath(`/t/${tenantSlug}/containers/${parsed.containerId}`);
  redirect(`/t/${tenantSlug}/containers/${parsed.containerId}`);
}
