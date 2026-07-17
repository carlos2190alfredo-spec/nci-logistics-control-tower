"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/server/audit";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { hasPermission } from "@/lib/server/tenant-permissions";

const ASSET_TYPES = ["VEHICULO", "EQUIPO"] as const;
const TYPES = ["PREVENTIVO", "CORRECTIVO", "INSPECCION"] as const;
const MANAGE_ROLES = ["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER"] as const;

function parseDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}
function num(v?: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const createSchema = z.object({
  assetType: z.enum(ASSET_TYPES),
  assetCode: z.string().min(1).max(40),
  type: z.enum(TYPES),
  description: z.string().min(2).max(500),
  provider: z.string().max(120).optional(),
  cost: z.string().optional(),
  scheduledAt: z.string().optional(),
  odometerKm: z.string().optional(),
  nextServiceKm: z.string().optional(),
  nextServiceAt: z.string().optional(),
  blocksAsset: z.boolean().default(true),
});

export async function createMaintenanceOrderAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [...MANAGE_ROLES]);
  if (!hasPermission(membership.role, "tenant.maintenance.manage")) {
    redirect(`/t/${tenantSlug}/maintenance`);
  }
  const parsed = createSchema.parse({
    assetType: formData.get("assetType"),
    assetCode: formData.get("assetCode"),
    type: formData.get("type"),
    description: formData.get("description"),
    provider: formData.get("provider")?.toString()?.trim() || undefined,
    cost: formData.get("cost")?.toString() || undefined,
    scheduledAt: formData.get("scheduledAt")?.toString() || undefined,
    odometerKm: formData.get("odometerKm")?.toString() || undefined,
    nextServiceKm: formData.get("nextServiceKm")?.toString() || undefined,
    nextServiceAt: formData.get("nextServiceAt")?.toString() || undefined,
    blocksAsset: formData.get("blocksAsset") !== "off",
  });

  const created = await getDb().maintenanceOrder.create({
    data: {
      tenantId: tenant.id,
      assetType: parsed.assetType,
      assetCode: parsed.assetCode,
      type: parsed.type,
      description: parsed.description,
      provider: parsed.provider ?? null,
      cost: num(parsed.cost),
      scheduledAt: parseDate(parsed.scheduledAt),
      odometerKm: num(parsed.odometerKm),
      nextServiceKm: num(parsed.nextServiceKm),
      nextServiceAt: parseDate(parsed.nextServiceAt),
      blocksAsset: parsed.blocksAsset,
      status: "PROGRAMADO",
      createdById: user.id,
    },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "maintenance.create",
    entity: "MaintenanceOrder",
    entityId: created.id,
    after: { assetType: parsed.assetType, assetCode: parsed.assetCode, type: parsed.type, blocksAsset: parsed.blocksAsset },
  });

  revalidatePath(`/t/${tenantSlug}/maintenance`);
  redirect(`/t/${tenantSlug}/maintenance`);
}

const transitionSchema = z.object({
  orderId: z.string().uuid(),
  action: z.enum(["start", "complete", "cancel"]),
});

const STATUS_MAP = { start: "EN_PROGRESO", complete: "COMPLETADO", cancel: "CANCELADO" } as const;

export async function transitionMaintenanceOrderAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [...MANAGE_ROLES]);
  if (!hasPermission(membership.role, "tenant.maintenance.manage")) {
    redirect(`/t/${tenantSlug}/maintenance`);
  }
  const parsed = transitionSchema.parse({
    orderId: formData.get("orderId"),
    action: formData.get("action"),
  });

  const order = await getDb().maintenanceOrder.findFirst({
    where: { id: parsed.orderId, tenantId: tenant.id },
    select: { id: true, status: true },
  });
  if (!order) redirect(`/t/${tenantSlug}/maintenance`);

  const nextStatus = STATUS_MAP[parsed.action];
  await getDb().maintenanceOrder.update({
    where: { id: parsed.orderId },
    data: {
      status: nextStatus,
      ...(parsed.action === "start" ? { startedAt: new Date() } : {}),
      ...(parsed.action === "complete" ? { completedAt: new Date() } : {}),
    },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "maintenance.transition",
    entity: "MaintenanceOrder",
    entityId: parsed.orderId,
    before: { status: order!.status },
    after: { status: nextStatus },
  });

  revalidatePath(`/t/${tenantSlug}/maintenance`);
  redirect(`/t/${tenantSlug}/maintenance`);
}
