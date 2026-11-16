"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { parseForm } from "@/lib/catalog/form";
import { CUSTOMER_CODE_PREFIX, nextCodeFromExisting } from "@/lib/catalog/codes";
import { customerInputSchema, customerUpdateSchema } from "@/lib/catalog/schemas";
import { actionError, actionOk, type ActionResult } from "@/lib/server/action-result";
import { audit } from "@/lib/server/audit";
import { requireTenantPermission } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { isUniqueViolation } from "@/lib/server/db-errors";
import { assertWithinPlanLimit, PlanLimitError } from "@/lib/server/plan-limits";

/**
 * Clientes (ADR-038). Cada accion se autoriza sola (`tenant.catalogs.manage`), el tenant sale de la
 * ruta + sesion, y todo id recibido se busca con `{ id, tenantId }`. Nunca se borra: se desactiva.
 */

const TX_OPTIONS = { timeout: 15_000, maxWait: 5_000 } as const;

export async function createCustomerAction(
  tenantSlug: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.manage");
  const parsed = parseForm(customerInputSchema, formData);
  if (!parsed.ok) return actionError(parsed.message, { fieldErrors: parsed.fieldErrors, values: parsed.values });
  const input = parsed.data;

  try {
    const created = await getDb().$transaction(async (tx) => {
      await assertWithinPlanLimit(tx, { tenantId: tenant.id, resource: "customers", adding: 1 });
      const existing = await tx.customerAccount.findMany({ where: { tenantId: tenant.id }, select: { code: true } });
      const code = input.code ?? nextCodeFromExisting(existing.map((row) => row.code), CUSTOMER_CODE_PREFIX);
      return tx.customerAccount.create({
        data: {
          tenantId: tenant.id,
          code,
          name: input.name,
          taxId: input.taxId ?? null,
          contactName: input.contactName ?? null,
          contactEmail: input.contactEmail ?? null,
          contactPhone: input.contactPhone ?? null,
          address: input.address ?? null,
          internalNotes: input.internalNotes ?? null,
        },
      });
    }, TX_OPTIONS);

    await audit({
      tenantId: tenant.id,
      actorId: user.id,
      actorRole: membership.role,
      action: "customer.create",
      entity: "CustomerAccount",
      entityId: created.id,
      after: { code: created.code, name: created.name },
    });
    revalidatePath(`/t/${tenantSlug}`, "layout");
    return actionOk(`Cliente «${created.name}» creado con el código ${created.code}.`);
  } catch (error) {
    if (error instanceof PlanLimitError) return actionError(error.message);
    if (error instanceof RangeError) return actionError(error.message);
    if (isUniqueViolation(error)) return actionError("Ya existe un cliente con ese código. Intente de nuevo.");
    throw error;
  }
}

export async function updateCustomerAction(
  tenantSlug: string,
  customerId: string,
  _previous: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.manage");
  const parsed = parseForm(customerUpdateSchema, formData);
  if (!parsed.ok) return actionError(parsed.message, { fieldErrors: parsed.fieldErrors, values: parsed.values });
  const input = parsed.data;

  const result = await getDb().customerAccount.updateMany({
    where: { id: customerId, tenantId: tenant.id },
    data: {
      name: input.name,
      taxId: input.taxId ?? null,
      contactName: input.contactName ?? null,
      contactEmail: input.contactEmail ?? null,
      contactPhone: input.contactPhone ?? null,
      address: input.address ?? null,
      internalNotes: input.internalNotes ?? null,
    },
  });
  if (result.count === 0) return actionError("El cliente no existe en su empresa.");

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "customer.update",
    entity: "CustomerAccount",
    entityId: customerId,
    after: { name: input.name },
  });
  revalidatePath(`/t/${tenantSlug}`, "layout");
  return actionOk("Cambios guardados.");
}

/**
 * Desactiva o reactiva un cliente (se enlaza con `.bind(null, slug, id, active)` en un `<form action>`).
 * Desactivar tambien desactiva TODOS sus accesos al portal en la misma transaccion; reactivar NO los
 * reactiva (cada usuario se reactiva por separado). Reactivar cuenta contra el limite del plan.
 */
export async function setCustomerActiveAction(tenantSlug: string, customerId: string, active: boolean): Promise<void> {
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.catalogs.manage");
  const base = `/t/${tenantSlug}/customers/${customerId}`;
  let notice: string;

  try {
    notice = await getDb().$transaction(async (tx) => {
      const customer = await tx.customerAccount.findFirst({
        where: { id: customerId, tenantId: tenant.id },
        select: { id: true, active: true },
      });
      if (!customer) return "cliente-no-existe";
      if (customer.active === active) return active ? "cliente-reactivado" : "cliente-desactivado";
      if (active) {
        await assertWithinPlanLimit(tx, { tenantId: tenant.id, resource: "customers", adding: 1 });
        await tx.customerAccount.updateMany({ where: { id: customerId, tenantId: tenant.id }, data: { active: true } });
        return "cliente-reactivado";
      }
      await tx.customerAccount.updateMany({ where: { id: customerId, tenantId: tenant.id }, data: { active: false } });
      await tx.customerMembership.updateMany({
        where: { tenantId: tenant.id, customerAccountId: customerId, active: true },
        data: { active: false },
      });
      return "cliente-desactivado";
    }, TX_OPTIONS);
  } catch (error) {
    if (error instanceof PlanLimitError) redirect(`${base}?aviso=limite-plan`);
    throw error;
  }

  if (notice !== "cliente-no-existe") {
    await audit({
      tenantId: tenant.id,
      actorId: user.id,
      actorRole: membership.role,
      action: active ? "customer.reactivate" : "customer.deactivate",
      entity: "CustomerAccount",
      entityId: customerId,
    });
  }
  revalidatePath(`/t/${tenantSlug}`, "layout");
  redirect(notice === "cliente-no-existe" ? `/t/${tenantSlug}/customers?aviso=${notice}` : `${base}?aviso=${notice}`);
}
