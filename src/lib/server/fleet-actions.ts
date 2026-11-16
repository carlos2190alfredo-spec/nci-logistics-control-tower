"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { parseForm } from "@/lib/catalog/form";
import { MAX_EQUIPMENT_PER_TENANT } from "@/lib/catalog/limits";
import { equipmentInputSchema, equipmentUpdateSchema, vehicleInputSchema, vehicleUpdateSchema } from "@/lib/catalog/schemas";
import { TERMINAL_TRIP_STATUSES } from "@/lib/domain/state-machine";
import { actionError, actionOk, type ActionResult } from "@/lib/server/action-result";
import { audit } from "@/lib/server/audit";
import { requireTenantPermission } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { isUniqueViolation } from "@/lib/server/db-errors";
import { assertWithinPlanLimit, PlanLimitError } from "@/lib/server/plan-limits";
import { lockTenantForCreate } from "@/lib/server/trip-creation";

/**
 * Flota (ADR-038). Vehiculos y equipos nunca se borran: se inactivan (`status = "INACTIVE"`; las guardas de
 * asignacion ya exigen `AVAILABLE`). `code` es inmutable (cumplimiento y mantenimiento enlazan por texto) y la
 * placa solo cambia si ningun documento de cumplimiento esta vinculado a la placa anterior.
 */

const TX_OPTIONS = { timeout: 15_000, maxWait: 5_000 } as const;
const insensitive = (value: string) => ({ equals: value, mode: "insensitive" as const });

export async function createVehicleAction(tenantSlug: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.manage");
  const parsed = parseForm(vehicleInputSchema, formData);
  if (!parsed.ok) return actionError(parsed.message, { fieldErrors: parsed.fieldErrors, values: parsed.values });
  const { plate, code, type } = parsed.data;

  try {
    const created = await getDb().$transaction(async (tx) => {
      await assertWithinPlanLimit(tx, { tenantId: tenant.id, resource: "vehicles", adding: 1 });
      // La placa y el codigo comparten espacio de identidad: ninguna fila (ni inactiva) puede repetirlas.
      const clash = await tx.vehicle.findFirst({
        where: {
          tenantId: tenant.id,
          OR: [
            { plate: insensitive(plate) },
            { code: insensitive(plate) },
            { plate: insensitive(code) },
            { code: insensitive(code) },
          ],
        },
        select: { plate: true, status: true },
      });
      if (clash) {
        throw new RangeError(
          clash.status === "INACTIVE"
            ? "Ya existe un vehículo inactivo con esa placa o unidad. Búsquelo en la lista (filtro «Inactivos») y reactívelo."
            : "Ya existe un vehículo con esa placa o número de unidad.",
        );
      }
      return tx.vehicle.create({ data: { tenantId: tenant.id, plate, code, type } });
    }, TX_OPTIONS);

    await audit({
      tenantId: tenant.id, actorId: user.id, actorRole: membership.role,
      action: "vehicle.create", entity: "Vehicle", entityId: created.id, after: { plate: created.plate, code: created.code },
    });
    revalidatePath(`/t/${tenantSlug}`, "layout");
    return actionOk(`Vehículo ${created.plate} agregado.`);
  } catch (error) {
    if (error instanceof PlanLimitError || error instanceof RangeError) return actionError(error.message);
    if (isUniqueViolation(error)) return actionError("Ya existe un vehículo con esa placa o número de unidad.");
    throw error;
  }
}

export async function updateVehicleAction(
  tenantSlug: string,
  vehicleId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.manage");
  const parsed = parseForm(vehicleUpdateSchema, formData);
  if (!parsed.ok) return actionError(parsed.message, { fieldErrors: parsed.fieldErrors, values: parsed.values });
  const { plate, type } = parsed.data;
  const db = getDb();

  const vehicle = await db.vehicle.findFirst({ where: { id: vehicleId, tenantId: tenant.id } });
  if (!vehicle) return actionError("El vehículo no existe en su empresa.");

  if (plate.toLowerCase() !== vehicle.plate.toLowerCase()) {
    const clash = await db.vehicle.findFirst({
      where: { tenantId: tenant.id, id: { not: vehicle.id }, OR: [{ plate: insensitive(plate) }, { code: insensitive(plate) }] },
      select: { id: true },
    });
    if (clash) return actionError("Ya existe otro vehículo con esa placa.", { fieldErrors: { plate: "Ya existe otro vehículo con esa placa." } });
    // Los documentos de cumplimiento enlazan por texto: si cuelgan de la placa anterior, cambiarla los dejaria huerfanos.
    if (vehicle.plate !== vehicle.code) {
      const linked = await db.complianceDocument.count({
        where: { tenantId: tenant.id, entityType: "VEHICULO", entityId: vehicle.plate },
      });
      if (linked > 0) {
        return actionError(
          "No se puede cambiar la placa: tiene documentos de cumplimiento vinculados a la placa actual. Inactive este vehículo y registre uno nuevo.",
          { fieldErrors: { plate: "Hay documentos vinculados a la placa actual." } },
        );
      }
    }
  }

  try {
    const result = await db.vehicle.updateMany({ where: { id: vehicle.id, tenantId: tenant.id }, data: { plate, type } });
    if (result.count === 0) return actionError("El vehículo no existe en su empresa.");
  } catch (error) {
    if (isUniqueViolation(error)) return actionError("Ya existe otro vehículo con esa placa.");
    throw error;
  }
  await audit({
    tenantId: tenant.id, actorId: user.id, actorRole: membership.role,
    action: "vehicle.update", entity: "Vehicle", entityId: vehicle.id, before: { plate: vehicle.plate, type: vehicle.type }, after: { plate, type },
  });
  revalidatePath(`/t/${tenantSlug}`, "layout");
  return actionOk("Cambios guardados.");
}

export async function createEquipmentAction(tenantSlug: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.manage");
  const parsed = parseForm(equipmentInputSchema, formData);
  if (!parsed.ok) return actionError(parsed.message, { fieldErrors: parsed.fieldErrors, values: parsed.values });
  const { code, type } = parsed.data;

  try {
    const created = await getDb().$transaction(async (tx) => {
      await lockTenantForCreate(tx, tenant.id);
      if ((await tx.equipment.count({ where: { tenantId: tenant.id } })) >= MAX_EQUIPMENT_PER_TENANT) {
        throw new RangeError(`Alcanzó el máximo de ${MAX_EQUIPMENT_PER_TENANT} equipos. Inactive los que ya no use.`);
      }
      const clash = await tx.equipment.findFirst({ where: { tenantId: tenant.id, code: insensitive(code) }, select: { status: true } });
      if (clash) {
        throw new RangeError(
          clash.status === "INACTIVE"
            ? "Ya existe un equipo inactivo con ese código. Búsquelo en la lista (filtro «Inactivos») y reactívelo."
            : "Ya existe un equipo con ese código.",
        );
      }
      return tx.equipment.create({ data: { tenantId: tenant.id, code, type } });
    }, TX_OPTIONS);

    await audit({
      tenantId: tenant.id, actorId: user.id, actorRole: membership.role,
      action: "equipment.create", entity: "Equipment", entityId: created.id, after: { code: created.code },
    });
    revalidatePath(`/t/${tenantSlug}`, "layout");
    return actionOk(`Equipo ${created.code} agregado.`);
  } catch (error) {
    if (error instanceof RangeError) return actionError(error.message);
    if (isUniqueViolation(error)) return actionError("Ya existe un equipo con ese código.");
    throw error;
  }
}

export async function updateEquipmentAction(
  tenantSlug: string,
  equipmentId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.manage");
  const parsed = parseForm(equipmentUpdateSchema, formData);
  if (!parsed.ok) return actionError(parsed.message, { fieldErrors: parsed.fieldErrors, values: parsed.values });
  const result = await getDb().equipment.updateMany({
    where: { id: equipmentId, tenantId: tenant.id },
    data: { type: parsed.data.type },
  });
  if (result.count === 0) return actionError("El equipo no existe en su empresa.");
  await audit({
    tenantId: tenant.id, actorId: user.id, actorRole: membership.role,
    action: "equipment.update", entity: "Equipment", entityId: equipmentId, after: { type: parsed.data.type },
  });
  revalidatePath(`/t/${tenantSlug}`, "layout");
  return actionOk("Cambios guardados.");
}

/**
 * Inactiva o reactiva (se enlaza con `.bind(null, slug, kind, id, active)` en un `<form action>`).
 * Inactivar se bloquea si hay viajes no terminales con ese activo; reactivar un vehiculo cuenta para el plan.
 */
export async function setAssetActiveAction(
  tenantSlug: string,
  kind: "vehicle" | "equipment",
  assetId: string,
  active: boolean,
): Promise<void> {
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.manage");
  const back = `/t/${tenantSlug}/fleet/${kind === "vehicle" ? "vehicles" : "equipment"}/${assetId}`;
  const list = `/t/${tenantSlug}/fleet?vista=${kind === "vehicle" ? "vehiculos" : "equipos"}`;
  let notice: string;

  try {
    notice = await getDb().$transaction(async (tx) => {
      await lockTenantForCreate(tx, tenant.id);
      const asset =
        kind === "vehicle"
          ? await tx.vehicle.findFirst({ where: { id: assetId, tenantId: tenant.id }, select: { id: true, status: true } })
          : await tx.equipment.findFirst({ where: { id: assetId, tenantId: tenant.id }, select: { id: true, status: true } });
      if (!asset) return "activo-no-existe";
      if (!active) {
        const busy = await tx.trip.count({
          where: {
            tenantId: tenant.id,
            status: { notIn: [...TERMINAL_TRIP_STATUSES] },
            ...(kind === "vehicle" ? { vehicleId: assetId } : { equipmentId: assetId }),
          },
        });
        if (busy > 0) return "inactivar-bloqueado";
      } else if (kind === "vehicle" && asset.status === "INACTIVE") {
        await assertWithinPlanLimit(tx, { tenantId: tenant.id, resource: "vehicles", adding: 1 });
      }
      const data = { status: active ? "AVAILABLE" : "INACTIVE" };
      if (kind === "vehicle") await tx.vehicle.updateMany({ where: { id: assetId, tenantId: tenant.id }, data });
      else await tx.equipment.updateMany({ where: { id: assetId, tenantId: tenant.id }, data });
      return active ? "activo-reactivado" : "activo-inactivado";
    }, TX_OPTIONS);
  } catch (error) {
    if (error instanceof PlanLimitError) redirect(`${back}?aviso=limite-plan`);
    throw error;
  }

  if (notice === "activo-reactivado" || notice === "activo-inactivado") {
    await audit({
      tenantId: tenant.id, actorId: user.id, actorRole: membership.role,
      action: `${kind}.${active ? "reactivate" : "deactivate"}`, entity: kind === "vehicle" ? "Vehicle" : "Equipment", entityId: assetId,
    });
  }
  revalidatePath(`/t/${tenantSlug}`, "layout");
  redirect(notice === "activo-no-existe" ? `${list}&aviso=${notice}` : `${back}?aviso=${notice}`);
}
