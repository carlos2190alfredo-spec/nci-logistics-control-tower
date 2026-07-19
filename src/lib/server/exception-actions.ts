"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/server/audit";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { hasPermission } from "@/lib/server/tenant-permissions";

const GATES = ["COMPLIANCE", "MAINTENANCE"] as const;
const SCOPES = ["TRIP", "ASSET"] as const;
const APPROVE_ROLES = ["TENANT_OWNER", "TENANT_ADMIN", "SAFETY_MANAGER"] as const;

function parseDate(v?: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const createSchema = z.object({
  gate: z.enum(GATES),
  scope: z.enum(SCOPES),
  targetKey: z.string().min(1).max(120),
  justification: z.string().min(4).max(1000),
  evidenceRef: z.string().max(200).optional(),
  expiresAt: z.string().optional(),
});

export async function approveComplianceExceptionAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [...APPROVE_ROLES]);
  if (!hasPermission(membership.role, "tenant.exceptions.approve")) {
    redirect(`/t/${tenantSlug}/compliance`);
  }
  const parsed = createSchema.parse({
    gate: formData.get("gate"),
    scope: formData.get("scope"),
    targetKey: formData.get("targetKey"),
    justification: formData.get("justification"),
    evidenceRef: formData.get("evidenceRef")?.toString()?.trim() || undefined,
    expiresAt: formData.get("expiresAt")?.toString() || undefined,
  });

  const created = await getDb().complianceException.create({
    data: {
      tenantId: tenant.id,
      gate: parsed.gate,
      scope: parsed.scope,
      targetKey: parsed.targetKey,
      justification: parsed.justification,
      evidenceRef: parsed.evidenceRef ?? null,
      expiresAt: parseDate(parsed.expiresAt),
      approverId: user.id,
    },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "compliance.exception.approve",
    entity: "ComplianceException",
    entityId: created.id,
    after: {
      gate: parsed.gate,
      scope: parsed.scope,
      targetKey: parsed.targetKey,
      expiresAt: parsed.expiresAt ?? null,
    },
  });

  revalidatePath(`/t/${tenantSlug}/compliance`);
  redirect(`/t/${tenantSlug}/compliance`);
}

const revokeSchema = z.object({ exceptionId: z.string().uuid() });

export async function revokeComplianceExceptionAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [...APPROVE_ROLES]);
  if (!hasPermission(membership.role, "tenant.exceptions.approve")) {
    redirect(`/t/${tenantSlug}/compliance`);
  }
  const { exceptionId } = revokeSchema.parse({ exceptionId: formData.get("exceptionId") });

  const existing = await getDb().complianceException.findFirst({
    where: { id: exceptionId, tenantId: tenant.id },
    select: { id: true, revokedAt: true },
  });
  if (!existing) redirect(`/t/${tenantSlug}/compliance`);
  if (existing!.revokedAt) redirect(`/t/${tenantSlug}/compliance`);

  await getDb().complianceException.update({
    where: { id: exceptionId },
    data: { revokedAt: new Date(), revokedById: user.id },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "compliance.exception.revoke",
    entity: "ComplianceException",
    entityId: exceptionId,
  });

  revalidatePath(`/t/${tenantSlug}/compliance`);
  redirect(`/t/${tenantSlug}/compliance`);
}
