"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/server/audit";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { hasPermission } from "@/lib/server/tenant-permissions";

const ENTITY_TYPES = [
  "TENANT", "CLIENTE", "PROVEEDOR", "SUBCONTRATISTA", "CONDUCTOR", "VEHICULO",
  "EQUIPO", "CONTENEDOR", "MERCANCIA", "ORDEN", "VIAJE", "CONTRATO", "RUTA",
  "TERMINAL", "NAVIERA", "AEROPUERTO",
] as const;

const SEVERITIES = ["INFO", "BAJA", "MEDIA", "ALTA", "CRITICA"] as const;

const createSchema = z.object({
  entityType: z.enum(ENTITY_TYPES),
  entityId: z.string().min(1).max(120),
  documentType: z.string().min(2).max(80),
  name: z.string().min(2).max(160),
  number: z.string().max(80).optional(),
  issuingAuthority: z.string().max(120).optional(),
  holder: z.string().max(120).optional(),
  issuedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  criticality: z.enum(SEVERITIES).default("MEDIA"),
  blocksDispatch: z.boolean().default(false),
  notes: z.string().max(1000).optional(),
});

function parseDate(v?: string): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

const ALLOWED_MANAGE = ["TENANT_OWNER", "TENANT_ADMIN", "SAFETY_MANAGER"] as const;
const ALLOWED_VERIFY = ["TENANT_OWNER", "TENANT_ADMIN", "SAFETY_MANAGER"] as const;

export async function createComplianceDocumentAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [...ALLOWED_MANAGE]);
  if (!hasPermission(membership.role, "tenant.compliance.manage")) {
    redirect(`/t/${tenantSlug}/compliance`);
  }

  const parsed = createSchema.parse({
    entityType: formData.get("entityType"),
    entityId: formData.get("entityId"),
    documentType: formData.get("documentType"),
    name: formData.get("name"),
    number: formData.get("number")?.toString()?.trim() || undefined,
    issuingAuthority: formData.get("issuingAuthority")?.toString()?.trim() || undefined,
    holder: formData.get("holder")?.toString()?.trim() || undefined,
    issuedAt: formData.get("issuedAt")?.toString() || undefined,
    expiresAt: formData.get("expiresAt")?.toString() || undefined,
    criticality: formData.get("criticality") || "MEDIA",
    blocksDispatch: formData.get("blocksDispatch") === "on",
    notes: formData.get("notes")?.toString()?.trim() || undefined,
  });

  const created = await getDb().complianceDocument.create({
    data: {
      tenantId: tenant.id,
      entityType: parsed.entityType,
      entityId: parsed.entityId,
      documentType: parsed.documentType,
      name: parsed.name,
      number: parsed.number ?? null,
      issuingAuthority: parsed.issuingAuthority ?? null,
      holder: parsed.holder ?? null,
      issuedAt: parseDate(parsed.issuedAt),
      expiresAt: parseDate(parsed.expiresAt),
      criticality: parsed.criticality,
      blocksDispatch: parsed.blocksDispatch,
      notes: parsed.notes ?? null,
      status: "PENDIENTE",
    },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "compliance.document.create",
    entity: "ComplianceDocument",
    entityId: created.id,
    after: { entityType: parsed.entityType, documentType: parsed.documentType, blocksDispatch: parsed.blocksDispatch },
  });

  revalidatePath(`/t/${tenantSlug}/compliance`);
  redirect(`/t/${tenantSlug}/compliance`);
}

const verifySchema = z.object({
  documentId: z.string().uuid(),
  decision: z.enum(["VIGENTE", "RECHAZADO", "SUSPENDIDO"]),
  validationSource: z.string().max(200).optional(),
});

export async function verifyComplianceDocumentAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [...ALLOWED_VERIFY]);
  if (!hasPermission(membership.role, "tenant.compliance.verify")) {
    redirect(`/t/${tenantSlug}/compliance`);
  }

  const parsed = verifySchema.parse({
    documentId: formData.get("documentId"),
    decision: formData.get("decision"),
    validationSource: formData.get("validationSource")?.toString()?.trim() || undefined,
  });

  const doc = await getDb().complianceDocument.findFirst({
    where: { id: parsed.documentId, tenantId: tenant.id },
  });
  if (!doc) redirect(`/t/${tenantSlug}/compliance`);

  await getDb().complianceDocument.update({
    where: { id: parsed.documentId },
    data: {
      status: parsed.decision,
      validationSource: parsed.validationSource ?? null,
      verifiedById: user.id,
      verifiedAt: new Date(),
    },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "compliance.document.verify",
    entity: "ComplianceDocument",
    entityId: parsed.documentId,
    before: { status: doc?.status },
    after: { status: parsed.decision },
  });

  revalidatePath(`/t/${tenantSlug}/compliance`);
  redirect(`/t/${tenantSlug}/compliance`);
}
