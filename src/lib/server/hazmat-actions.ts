"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/server/audit";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { hasPermission } from "@/lib/server/tenant-permissions";

const HAZARD_CLASSES = [
  "CLASE_1_EXPLOSIVOS", "CLASE_2_GASES", "CLASE_3_LIQUIDOS_INFLAMABLES",
  "CLASE_4_SOLIDOS_INFLAMABLES", "CLASE_5_COMBURENTES", "CLASE_6_TOXICOS",
  "CLASE_7_RADIACTIVOS", "CLASE_8_CORROSIVOS", "CLASE_9_VARIOS", "NO_APLICA",
] as const;

const MANAGE_ROLES = ["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "SAFETY_MANAGER"] as const;

const createSchema = z.object({
  reference: z.string().min(2).max(80),
  productName: z.string().min(2).max(120),
  productType: z.string().max(80).optional(),
  unNumber: z.string().max(16).optional(),
  hazardClass: z.enum(HAZARD_CLASSES).default("NO_APLICA"),
  safetyDataSheetRef: z.string().max(200).optional(),
  cargoOwner: z.string().max(120).optional(),
  loadPoint: z.string().max(120).optional(),
  deliveryPoint: z.string().max(120).optional(),
  quantity: z.string().optional(),
  unit: z.string().max(20).optional(),
  driverCode: z.string().max(40).optional(),
  vehicleCode: z.string().max(40).optional(),
  tankCode: z.string().max(40).optional(),
  authorizedRoute: z.string().max(200).optional(),
  authorizedSchedule: z.string().max(120).optional(),
  contingencyPlanRef: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
});

function num(v?: string): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function createHazmatShipmentAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [...MANAGE_ROLES]);
  if (!hasPermission(membership.role, "tenant.hazmat.manage")) {
    redirect(`/t/${tenantSlug}/hazmat`);
  }

  const parsed = createSchema.parse({
    reference: formData.get("reference"),
    productName: formData.get("productName"),
    productType: formData.get("productType")?.toString()?.trim() || undefined,
    unNumber: formData.get("unNumber")?.toString()?.trim() || undefined,
    hazardClass: formData.get("hazardClass") || "NO_APLICA",
    safetyDataSheetRef: formData.get("safetyDataSheetRef")?.toString()?.trim() || undefined,
    cargoOwner: formData.get("cargoOwner")?.toString()?.trim() || undefined,
    loadPoint: formData.get("loadPoint")?.toString()?.trim() || undefined,
    deliveryPoint: formData.get("deliveryPoint")?.toString()?.trim() || undefined,
    quantity: formData.get("quantity")?.toString() || undefined,
    unit: formData.get("unit")?.toString()?.trim() || undefined,
    driverCode: formData.get("driverCode")?.toString()?.trim() || undefined,
    vehicleCode: formData.get("vehicleCode")?.toString()?.trim() || undefined,
    tankCode: formData.get("tankCode")?.toString()?.trim() || undefined,
    authorizedRoute: formData.get("authorizedRoute")?.toString()?.trim() || undefined,
    authorizedSchedule: formData.get("authorizedSchedule")?.toString()?.trim() || undefined,
    contingencyPlanRef: formData.get("contingencyPlanRef")?.toString()?.trim() || undefined,
    notes: formData.get("notes")?.toString()?.trim() || undefined,
  });

  const created = await getDb().hazmatShipment.create({
    data: {
      tenantId: tenant.id,
      reference: parsed.reference,
      productName: parsed.productName,
      productType: parsed.productType ?? null,
      unNumber: parsed.unNumber ?? null,
      hazardClass: parsed.hazardClass,
      safetyDataSheetRef: parsed.safetyDataSheetRef ?? null,
      cargoOwner: parsed.cargoOwner ?? null,
      loadPoint: parsed.loadPoint ?? null,
      deliveryPoint: parsed.deliveryPoint ?? null,
      quantity: num(parsed.quantity),
      unit: parsed.unit ?? null,
      driverCode: parsed.driverCode ?? null,
      vehicleCode: parsed.vehicleCode ?? null,
      tankCode: parsed.tankCode ?? null,
      authorizedRoute: parsed.authorizedRoute ?? null,
      authorizedSchedule: parsed.authorizedSchedule ?? null,
      contingencyPlanRef: parsed.contingencyPlanRef ?? null,
      notes: parsed.notes ?? null,
      status: "ORDEN_RECIBIDA",
      complianceState: "NO_VERIFICADO",
    },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "hazmat.create",
    entity: "HazmatShipment",
    entityId: created.id,
    after: { reference: parsed.reference, hazardClass: parsed.hazardClass, unNumber: parsed.unNumber },
  });

  revalidatePath(`/t/${tenantSlug}/hazmat`);
  redirect(`/t/${tenantSlug}/hazmat`);
}
