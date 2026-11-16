"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { parseForm } from "@/lib/catalog/form";
import { MAX_LOCATIONS_PER_TENANT, MAX_SERVICE_TYPES_PER_TENANT } from "@/lib/catalog/limits";
import { slugCode } from "@/lib/catalog/normalize";
import { uniqueSlugCode } from "@/lib/catalog/codes";
import { locationInputSchema, serviceTypeInputSchema } from "@/lib/catalog/schemas";
import { actionError, actionOk, type ActionResult } from "@/lib/server/action-result";
import { audit } from "@/lib/server/audit";
import { requireTenantPermission } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { isUniqueViolation } from "@/lib/server/db-errors";
import { ensureServiceTypeTemplates } from "@/lib/server/service-type-seed";
import { lockTenantForCreate } from "@/lib/server/trip-creation";

/** Lugares frecuentes y tipos de servicio (ADR-038). Cada accion se autoriza sola y se acota por tenant. */

const TX_OPTIONS = { timeout: 15_000, maxWait: 5_000 } as const;
const insensitive = (value: string) => ({ equals: value, mode: "insensitive" as const });

// ---------------------------------------------------------------------------
// Lugares
// ---------------------------------------------------------------------------

export async function createLocationAction(tenantSlug: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.manage");
  const parsed = parseForm(locationInputSchema, formData);
  if (!parsed.ok) return actionError(parsed.message, { fieldErrors: parsed.fieldErrors, values: parsed.values });
  const input = parsed.data;
  try {
    const created = await getDb().$transaction(async (tx) => {
      await lockTenantForCreate(tx, tenant.id);
      if ((await tx.location.count({ where: { tenantId: tenant.id } })) >= MAX_LOCATIONS_PER_TENANT) {
        throw new RangeError(`Alcanzó el máximo de ${MAX_LOCATIONS_PER_TENANT} lugares.`);
      }
      if (await tx.location.findFirst({ where: { tenantId: tenant.id, name: insensitive(input.name) }, select: { id: true } })) {
        throw new RangeError("Ya existe un lugar con ese nombre.");
      }
      return tx.location.create({
        data: { tenantId: tenant.id, name: input.name, address: input.address, latitude: input.latitude, longitude: input.longitude },
      });
    }, TX_OPTIONS);
    await audit({
      tenantId: tenant.id, actorId: user.id, actorRole: membership.role,
      action: "location.create", entity: "Location", entityId: created.id, after: { name: created.name },
    });
    revalidatePath(`/t/${tenantSlug}`, "layout");
    return actionOk(`Lugar «${created.name}» agregado.`);
  } catch (error) {
    if (error instanceof RangeError) return actionError(error.message, { fieldErrors: { name: error.message } });
    if (isUniqueViolation(error)) return actionError("Ya existe un lugar con ese nombre.");
    throw error;
  }
}

export async function updateLocationAction(
  tenantSlug: string,
  locationId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.manage");
  const parsed = parseForm(locationInputSchema, formData);
  if (!parsed.ok) return actionError(parsed.message, { fieldErrors: parsed.fieldErrors, values: parsed.values });
  const input = parsed.data;
  const db = getDb();
  const clash = await db.location.findFirst({
    where: { tenantId: tenant.id, id: { not: locationId }, name: insensitive(input.name) },
    select: { id: true },
  });
  if (clash) return actionError("Ya existe otro lugar con ese nombre.", { fieldErrors: { name: "Ya existe otro lugar con ese nombre." } });
  try {
    const result = await db.location.updateMany({
      where: { id: locationId, tenantId: tenant.id },
      // Las coordenadas no se editan en esta pantalla: no se tocan (un lugar con coordenadas no las pierde).
      data: { name: input.name, address: input.address },
    });
    if (result.count === 0) return actionError("El lugar no existe en su empresa.");
  } catch (error) {
    if (isUniqueViolation(error)) return actionError("Ya existe otro lugar con ese nombre.");
    throw error;
  }
  await audit({
    tenantId: tenant.id, actorId: user.id, actorRole: membership.role,
    action: "location.update", entity: "Location", entityId: locationId, after: { name: input.name },
  });
  revalidatePath(`/t/${tenantSlug}`, "layout");
  return actionOk("Cambios guardados.");
}

export async function setLocationActiveAction(tenantSlug: string, locationId: string, active: boolean): Promise<void> {
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.manage");
  const result = await getDb().location.updateMany({ where: { id: locationId, tenantId: tenant.id }, data: { active } });
  if (result.count === 0) redirect(`/t/${tenantSlug}/locations?aviso=registro-no-existe`);
  await audit({
    tenantId: tenant.id, actorId: user.id, actorRole: membership.role,
    action: active ? "location.reactivate" : "location.deactivate", entity: "Location", entityId: locationId,
  });
  revalidatePath(`/t/${tenantSlug}`, "layout");
  redirect(`/t/${tenantSlug}/locations/${locationId}?aviso=${active ? "lugar-reactivado" : "lugar-inactivado"}`);
}

// ---------------------------------------------------------------------------
// Tipos de servicio
// ---------------------------------------------------------------------------

export async function createServiceTypeAction(tenantSlug: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.manage");
  const parsed = parseForm(serviceTypeInputSchema, formData, { booleans: ["requiresEquipment"] });
  if (!parsed.ok) return actionError(parsed.message, { fieldErrors: parsed.fieldErrors, values: parsed.values });
  const input = parsed.data;
  try {
    const created = await getDb().$transaction(async (tx) => {
      await lockTenantForCreate(tx, tenant.id);
      const existing = await tx.serviceType.findMany({ where: { tenantId: tenant.id }, select: { code: true, name: true } });
      if (existing.length >= MAX_SERVICE_TYPES_PER_TENANT) {
        throw new RangeError(`Alcanzó el máximo de ${MAX_SERVICE_TYPES_PER_TENANT} tipos de servicio.`);
      }
      if (existing.some((row) => row.name.trim().toLowerCase() === input.name.toLowerCase())) {
        throw new RangeError("Ya existe un tipo de servicio con ese nombre.");
      }
      const code = uniqueSlugCode(slugCode(input.name), new Set(existing.map((row) => row.code)));
      return tx.serviceType.create({
        data: { tenantId: tenant.id, code, name: input.name, requiresEquipment: input.requiresEquipment, requiredDocs: ["orden", "evidencia"] },
      });
    }, TX_OPTIONS);
    await audit({
      tenantId: tenant.id, actorId: user.id, actorRole: membership.role,
      action: "service_type.create", entity: "ServiceType", entityId: created.id, after: { code: created.code, name: created.name },
    });
    revalidatePath(`/t/${tenantSlug}`, "layout");
    return actionOk(`Servicio «${created.name}» creado.`);
  } catch (error) {
    if (error instanceof RangeError) return actionError(error.message, { fieldErrors: { name: error.message } });
    if (isUniqueViolation(error)) return actionError("Ya existe un tipo de servicio con ese nombre.");
    throw error;
  }
}

export async function updateServiceTypeAction(
  tenantSlug: string,
  serviceTypeId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.manage");
  const parsed = parseForm(serviceTypeInputSchema, formData, { booleans: ["requiresEquipment"] });
  if (!parsed.ok) return actionError(parsed.message, { fieldErrors: parsed.fieldErrors, values: parsed.values });
  const result = await getDb().serviceType.updateMany({
    where: { id: serviceTypeId, tenantId: tenant.id },
    data: { name: parsed.data.name, requiresEquipment: parsed.data.requiresEquipment },
  });
  if (result.count === 0) return actionError("El tipo de servicio no existe en su empresa.");
  await audit({
    tenantId: tenant.id, actorId: user.id, actorRole: membership.role,
    action: "service_type.update", entity: "ServiceType", entityId: serviceTypeId,
    after: { name: parsed.data.name, requiresEquipment: parsed.data.requiresEquipment },
  });
  revalidatePath(`/t/${tenantSlug}`, "layout");
  return actionOk("Cambios guardados.");
}

export async function setServiceTypeActiveAction(tenantSlug: string, serviceTypeId: string, active: boolean): Promise<void> {
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.manage");
  const db = getDb();
  const back = `/t/${tenantSlug}/services/${serviceTypeId}`;
  const notice = await db.$transaction(async (tx) => {
    await lockTenantForCreate(tx, tenant.id);
    const type = await tx.serviceType.findFirst({ where: { id: serviceTypeId, tenantId: tenant.id }, select: { id: true, active: true } });
    if (!type) return "registro-no-existe";
    if (!active && type.active) {
      const others = await tx.serviceType.count({ where: { tenantId: tenant.id, active: true, id: { not: serviceTypeId } } });
      if (others === 0) return "servicio-ultimo-activo";
    }
    await tx.serviceType.updateMany({ where: { id: serviceTypeId, tenantId: tenant.id }, data: { active } });
    return active ? "servicio-reactivado" : "servicio-inactivado";
  }, TX_OPTIONS);
  if (notice === "servicio-reactivado" || notice === "servicio-inactivado") {
    await audit({
      tenantId: tenant.id, actorId: user.id, actorRole: membership.role,
      action: active ? "service_type.reactivate" : "service_type.deactivate", entity: "ServiceType", entityId: serviceTypeId,
    });
  }
  revalidatePath(`/t/${tenantSlug}`, "layout");
  redirect(notice === "registro-no-existe" ? `/t/${tenantSlug}/services?aviso=${notice}` : `${back}?aviso=${notice}`);
}

/** Agrega los tipos de servicio sugeridos que aun no existen (formulario del boton; sin datos de entrada). */
export async function loadServiceTypeTemplatesAction(tenantSlug: string): Promise<void> {
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.manage");
  const created = await getDb().$transaction(async (tx) => {
    await lockTenantForCreate(tx, tenant.id);
    return ensureServiceTypeTemplates(tx, tenant.id);
  }, TX_OPTIONS);
  if (created.length > 0) {
    await audit({
      tenantId: tenant.id, actorId: user.id, actorRole: membership.role,
      action: "service_type.load_templates", entity: "ServiceType", entityId: tenant.id, after: { codes: created },
    });
  }
  revalidatePath(`/t/${tenantSlug}`, "layout");
  redirect(`/t/${tenantSlug}/services?aviso=${created.length > 0 ? "tipos-agregados" : "tipos-ya-existen"}`);
}
