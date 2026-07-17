"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/server/audit";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { hasPermission } from "@/lib/server/tenant-permissions";

const KINDS = ["INGRESO", "COSTO"] as const;
const CATEGORIES = [
  "TARIFA_BASE", "RECARGO", "ESPERA_FACTURABLE", "DEMURRAGE_FACTURABLE", "DETENTION_FACTURABLE",
  "REEMBOLSABLE", "SERVICIO_ADICIONAL", "AJUSTE", "IMPUESTO", "COMBUSTIBLE", "PEAJE", "VIATICOS",
  "CONDUCTOR", "SUBCONTRATISTA", "MANTENIMIENTO", "GASTOS_PORTUARIOS", "ALMACENAJE", "RETENCION",
  "ESPERA_COSTO", "DEMURRAGE_COSTO", "DETENTION_COSTO", "REENTREGA", "CARGOS_TERMINAL",
  "REPARACION", "SEGURO", "ADMINISTRATIVO", "OTRO",
] as const;

const MANAGE_ROLES = ["TENANT_OWNER", "TENANT_ADMIN"] as const;

const schema = z.object({
  tripId: z.string().uuid(),
  kind: z.enum(KINDS),
  category: z.enum(CATEGORIES),
  amount: z.coerce.number().finite().nonnegative(),
  currency: z.string().max(3).default("USD"),
  billable: z.boolean().default(true),
  notes: z.string().max(500).optional(),
});

export async function addFinancialEntryAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [...MANAGE_ROLES]);
  if (!hasPermission(membership.role, "tenant.finance.manage")) {
    redirect(`/t/${tenantSlug}/finance`);
  }

  const parsed = schema.parse({
    tripId: formData.get("tripId"),
    kind: formData.get("kind"),
    category: formData.get("category"),
    amount: formData.get("amount"),
    currency: formData.get("currency")?.toString() || "USD",
    billable: formData.get("billable") !== "off",
    notes: formData.get("notes")?.toString()?.trim() || undefined,
  });

  const trip = await getDb().trip.findFirst({
    where: { id: parsed.tripId, tenantId: tenant.id },
    select: { id: true },
  });
  if (!trip) redirect(`/t/${tenantSlug}/finance`);

  const created = await getDb().tripFinancialEntry.create({
    data: {
      tenantId: tenant.id,
      tripId: parsed.tripId,
      kind: parsed.kind,
      category: parsed.category,
      amount: parsed.amount,
      currency: parsed.currency,
      billable: parsed.billable,
      notes: parsed.notes ?? null,
      createdById: user.id,
    },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "finance.entry.create",
    entity: "TripFinancialEntry",
    entityId: created.id,
    after: { kind: parsed.kind, category: parsed.category, amount: parsed.amount },
  });

  revalidatePath(`/t/${tenantSlug}/finance`);
  redirect(`/t/${tenantSlug}/finance`);
}
