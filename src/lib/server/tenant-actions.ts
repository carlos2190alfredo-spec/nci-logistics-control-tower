"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { TenantPlanCode, TenantStatus } from "@/generated/prisma/enums";
import { audit } from "@/lib/server/audit";
import { requirePlatformRole } from "@/lib/server/auth";
import { hashPassword } from "@/lib/server/crypto";
import { getDb } from "@/lib/server/db";
import { sendMail } from "@/lib/server/mail";
import { welcomeTenantOwnerEmail } from "@/lib/server/email-templates";
import { generateEmailVerifyToken } from "@/lib/server/email-verification";

const createTenantSchema = z.object({
  name: z.string().min(2).max(100),
  legalName: z.string().min(2).max(200),
  slug: z.string().min(3).max(60).regex(/^[a-z0-9-]+$/),
  planCode: z.enum(["DEMO", "STARTER", "PROFESSIONAL", "ENTERPRISE"]),
  country: z.string().min(2).max(10).default("PA"),
  currency: z.string().min(3).max(3).default("USD"),
  ownerName: z.string().min(2).max(100),
  ownerEmail: z.string().email().max(200),
  contactName: z.string().max(100).optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().max(30).optional(),
  taxId: z.string().max(50).optional(),
  internalNotes: z.string().max(2000).optional(),
  isDemo: z.boolean().default(false),
});

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  let pwd = "";
  for (let i = 0; i < 12; i++) pwd += chars[bytes[i] % chars.length];
  return pwd;
}

export async function createTenantFullAction(formData: FormData) {
  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN"]);

  const contactEmail = formData.get("contactEmail")?.toString()?.trim();
  const parsed = createTenantSchema.parse({
    name: formData.get("name"),
    legalName: formData.get("legalName"),
    slug: formData.get("slug"),
    planCode: formData.get("planCode"),
    country: formData.get("country") || "PA",
    currency: formData.get("currency") || "USD",
    ownerName: formData.get("ownerName"),
    ownerEmail: formData.get("ownerEmail"),
    contactName: formData.get("contactName")?.toString()?.trim() || undefined,
    contactEmail: contactEmail || undefined,
    contactPhone: formData.get("contactPhone")?.toString()?.trim() || undefined,
    taxId: formData.get("taxId")?.toString()?.trim() || undefined,
    internalNotes: formData.get("internalNotes")?.toString()?.trim() || undefined,
    isDemo: formData.get("isDemo") === "on",
  });

  const db = getDb();
  const plan = await db.tenantPlan.findUniqueOrThrow({ where: { code: parsed.planCode as TenantPlanCode } });

  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const ownerEmailNorm = parsed.ownerEmail.toLowerCase().trim();

  const { tenant, ownerUser } = await db.$transaction(async (tx) => {
    const t = await tx.tenant.create({
      data: {
        name: parsed.name,
        legalName: parsed.legalName,
        slug: parsed.slug,
        planId: plan.id,
        status: "ACTIVE",
        subscriptionStatus: parsed.isDemo ? "TRIAL" : "TRIAL",
        isDemo: parsed.isDemo,
        country: parsed.country,
        currency: parsed.currency,
        contactName: parsed.contactName || parsed.ownerName,
        contactEmail: parsed.contactEmail || ownerEmailNorm,
        contactPhone: parsed.contactPhone || null,
        taxId: parsed.taxId || null,
        internalNotes: parsed.internalNotes || null,
        activatedAt: new Date(),
        branding: { create: { wordmark: parsed.name } },
        settings: { create: {} },
        features: {
          create: [
            { key: "portal", enabled: plan.portalEnabled },
            { key: "driver_app", enabled: plan.driverAppEnabled },
            { key: "notifications", enabled: plan.notificationsEnabled },
            { key: "reports", enabled: plan.reportsEnabled },
            { key: "integrations", enabled: plan.integrationsEnabled },
          ],
        },
      },
    });

    let ou = await tx.user.findUnique({ where: { email: ownerEmailNorm } });
    if (!ou) {
      ou = await tx.user.create({
        data: {
          name: parsed.ownerName,
          email: ownerEmailNorm,
          passwordHash,
          emailVerified: false,
        },
      });
    }

    await tx.tenantMembership.create({
      data: { tenantId: t.id, userId: ou.id, role: "TENANT_OWNER" },
    });

    return { tenant: t, ownerUser: ou };
  });

  const verifyToken = await generateEmailVerifyToken(ownerUser.id);
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const verifyUrl = `${baseUrl}/verificar-email/${verifyToken}`;
  const email = welcomeTenantOwnerEmail({
    ownerName: parsed.ownerName,
    tenantName: parsed.name,
    verifyUrl,
    loginUrl: `${baseUrl}/login`,
    tempPassword,
  });
  await sendMail({ to: ownerEmailNorm, ...email });

  await audit({
    actorId: user.id,
    actorRole: user.platformRole,
    action: "tenant.create",
    entity: "Tenant",
    entityId: tenant.id,
    after: { ...parsed, ownerUserId: ownerUser.id },
  });
  revalidatePath("/platform");
  revalidatePath("/platform/tenants");
  redirect(`/platform/tenants/${tenant.id}`);
}

const updateTenantSchema = z.object({
  name: z.string().min(2).max(100),
  legalName: z.string().min(2).max(200),
  country: z.string().min(2).max(10),
  currency: z.string().min(3).max(3),
  contactName: z.string().max(100).optional(),
  contactEmail: z.string().email().optional().or(z.literal("")),
  contactPhone: z.string().max(30).optional(),
  taxId: z.string().max(50).optional(),
  internalNotes: z.string().max(2000).optional(),
});

export async function updateTenantAction(tenantId: string, formData: FormData) {
  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN"]);
  const db = getDb();
  const existing = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });

  const contactEmail = formData.get("contactEmail")?.toString()?.trim();
  const parsed = updateTenantSchema.parse({
    name: formData.get("name"),
    legalName: formData.get("legalName"),
    country: formData.get("country") || existing.country,
    currency: formData.get("currency") || existing.currency,
    contactName: formData.get("contactName")?.toString()?.trim() || undefined,
    contactEmail: contactEmail || undefined,
    contactPhone: formData.get("contactPhone")?.toString()?.trim() || undefined,
    taxId: formData.get("taxId")?.toString()?.trim() || undefined,
    internalNotes: formData.get("internalNotes")?.toString()?.trim() || undefined,
  });

  const updated = await db.tenant.update({
    where: { id: tenantId },
    data: {
      name: parsed.name,
      legalName: parsed.legalName,
      country: parsed.country,
      currency: parsed.currency,
      contactName: parsed.contactName || null,
      contactEmail: parsed.contactEmail || null,
      contactPhone: parsed.contactPhone || null,
      taxId: parsed.taxId || null,
      internalNotes: parsed.internalNotes || null,
    },
  });

  await audit({
    actorId: user.id,
    actorRole: user.platformRole,
    action: "tenant.update",
    entity: "Tenant",
    entityId: tenantId,
    before: existing,
    after: updated,
  });
  revalidatePath("/platform/tenants");
  redirect(`/platform/tenants/${tenantId}`);
}

export async function changeTenantStatusAction(formData: FormData) {
  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN"]);
  const tenantId = String(formData.get("tenantId") ?? "");
  const action = String(formData.get("action") ?? "") as "suspend" | "reactivate" | "archive";

  const db = getDb();
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });

  const statusMap: Record<string, TenantStatus> = {
    suspend: "SUSPENDED",
    reactivate: "ACTIVE",
    archive: "ARCHIVED",
  };
  const newStatus = statusMap[action];
  if (!newStatus) return;

  const now = new Date();
  const updated = await db.tenant.update({
    where: { id: tenantId },
    data: {
      status: newStatus,
      archivedAt: newStatus === "ARCHIVED" ? now : null,
    },
  });

  await audit({
    actorId: user.id,
    actorRole: user.platformRole,
    action: `tenant.${action}`,
    entity: "Tenant",
    entityId: tenantId,
    before: { status: tenant.status },
    after: { status: updated.status },
  });
  revalidatePath("/platform/tenants");
  revalidatePath(`/platform/tenants/${tenantId}`);
}

export async function changeTenantPlanAction(formData: FormData) {
  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN"]);
  const tenantId = String(formData.get("tenantId") ?? "");
  const planCode = String(formData.get("planCode") ?? "") as TenantPlanCode;

  const db = getDb();
  const tenant = await db.tenant.findUniqueOrThrow({
    where: { id: tenantId },
    include: { plan: true },
  });

  const newPlan = await db.tenantPlan.findUniqueOrThrow({ where: { code: planCode } });
  if (tenant.planId === newPlan.id) return;

  await db.tenant.update({
    where: { id: tenantId },
    data: { planId: newPlan.id },
  });

  await audit({
    actorId: user.id,
    actorRole: user.platformRole,
    action: "tenant.change_plan",
    entity: "Tenant",
    entityId: tenantId,
    before: { plan: tenant.plan.code },
    after: { plan: planCode },
  });
  revalidatePath("/platform/tenants");
  revalidatePath(`/platform/tenants/${tenantId}`);
}
