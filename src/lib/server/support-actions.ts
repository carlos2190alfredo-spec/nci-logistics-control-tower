"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/server/audit";
import { requirePlatformRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

const ALLOWED_ROLES = ["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"] as const;

const startSchema = z.object({
  tenantId: z.string().uuid(),
  reason: z.string().min(4).max(500),
  durationMinutes: z.coerce.number().int().min(5).max(240).default(60),
});

/** Inicia una sesión de soporte para un tenant. Auditada; expira a los N min. */
export async function startSupportSessionAction(formData: FormData) {
  const user = await requirePlatformRole([...ALLOWED_ROLES]);
  const parsed = startSchema.parse({
    tenantId: formData.get("tenantId"),
    reason: formData.get("reason"),
    durationMinutes: formData.get("durationMinutes") ?? "60",
  });

  const db = getDb();
  const tenant = await db.tenant.findFirst({ where: { id: parsed.tenantId } });
  if (!tenant) redirect("/platform/tenants");

  // Cerrar automáticamente cualquier sesión previa aún activa del mismo usuario
  // sobre el mismo tenant, para mantener el estado de auditoría consistente.
  await db.tenantSupportSession.updateMany({
    where: { tenantId: parsed.tenantId, userId: user.id, endedAt: null },
    data: { endedAt: new Date(), endedById: user.id, closeNotes: "Reemplazada por nueva sesión" },
  });

  const created = await db.tenantSupportSession.create({
    data: {
      tenantId: parsed.tenantId,
      userId: user.id,
      reason: parsed.reason,
      expiresAt: new Date(Date.now() + parsed.durationMinutes * 60_000),
    },
  });

  await audit({
    tenantId: parsed.tenantId,
    actorId: user.id,
    actorRole: user.platformRole ?? "PLATFORM_SUPPORT",
    action: "support.session.start",
    entity: "TenantSupportSession",
    entityId: created.id,
    after: { reason: parsed.reason, durationMinutes: parsed.durationMinutes },
  });

  revalidatePath(`/platform/tenants/${parsed.tenantId}`);
  revalidatePath(`/t/${tenant!.slug}`);
  redirect(`/t/${tenant!.slug}`);
}

const endSchema = z.object({
  sessionId: z.string().uuid(),
  closeNotes: z.string().max(500).optional(),
});

export async function endSupportSessionAction(formData: FormData) {
  const user = await requirePlatformRole([...ALLOWED_ROLES]);
  const parsed = endSchema.parse({
    sessionId: formData.get("sessionId"),
    closeNotes: formData.get("closeNotes")?.toString()?.trim() || undefined,
  });

  const db = getDb();
  const existing = await db.tenantSupportSession.findUnique({
    where: { id: parsed.sessionId },
    select: { id: true, tenantId: true, endedAt: true, userId: true, tenant: { select: { slug: true } } },
  });
  if (!existing) redirect("/platform/tenants");
  if (existing.endedAt) redirect(`/platform/tenants/${existing.tenantId}`);

  await db.tenantSupportSession.update({
    where: { id: parsed.sessionId },
    data: { endedAt: new Date(), endedById: user.id, closeNotes: parsed.closeNotes ?? null },
  });

  await audit({
    tenantId: existing.tenantId,
    actorId: user.id,
    actorRole: user.platformRole ?? "PLATFORM_SUPPORT",
    action: "support.session.end",
    entity: "TenantSupportSession",
    entityId: parsed.sessionId,
    after: { closeNotes: parsed.closeNotes ?? null },
  });

  revalidatePath(`/platform/tenants/${existing.tenantId}`);
  revalidatePath(`/t/${existing.tenant.slug}`);
  redirect(`/platform/tenants/${existing.tenantId}`);
}
