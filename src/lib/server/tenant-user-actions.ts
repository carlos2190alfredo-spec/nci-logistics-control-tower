"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { TenantRole } from "@/generated/prisma/enums";
import { audit } from "@/lib/server/audit";
import { requireTenantRole } from "@/lib/server/auth";
import { hashPassword } from "@/lib/server/crypto";
import { getDb } from "@/lib/server/db";
import { sendMail } from "@/lib/server/mail";
import { welcomeUserEmail } from "@/lib/server/email-templates";
import { generateEmailVerifyToken } from "@/lib/server/email-verification";
import { tenantRoleLabel } from "@/lib/ui/status";

const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(200),
  password: z.string().min(8).max(100),
  role: z.enum(["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "SAFETY_MANAGER", "DRIVER"]),
});

export async function createTenantUserAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, ["TENANT_OWNER", "TENANT_ADMIN"]);
  const parsed = createUserSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
  });

  const db = getDb();
  const passwordHash = await hashPassword(parsed.password);
  const normalizedEmail = parsed.email.toLowerCase();
  let isNewUser = false;

  const newUser = await db.$transaction(async (tx) => {
    let existingUser = await tx.user.findUnique({ where: { email: normalizedEmail } });
    if (!existingUser) {
      existingUser = await tx.user.create({
        data: {
          name: parsed.name,
          email: normalizedEmail,
          passwordHash,
          emailVerified: false,
        },
      });
      isNewUser = true;
    }

    const existingMembership = await tx.tenantMembership.findFirst({
      where: { tenantId: tenant.id, userId: existingUser.id, role: parsed.role as TenantRole },
    });
    if (existingMembership) return existingUser;

    await tx.tenantMembership.create({
      data: {
        tenantId: tenant.id,
        userId: existingUser.id,
        role: parsed.role as TenantRole,
      },
    });
    return existingUser;
  });

  if (isNewUser) {
    const verifyToken = await generateEmailVerifyToken(newUser.id);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    const verifyUrl = `${baseUrl}/verificar-email/${verifyToken}`;
    const roleLabel = tenantRoleLabel[parsed.role as TenantRole] ?? parsed.role;
    const email = welcomeUserEmail({
      userName: parsed.name,
      tenantName: tenant.name,
      role: roleLabel,
      verifyUrl,
      tempPassword: parsed.password,
      invitedBy: user.name,
    });
    await sendMail({ to: normalizedEmail, ...email });
  }

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "user.create",
    entity: "User",
    entityId: newUser.id,
    after: { name: parsed.name, email: parsed.email, role: parsed.role },
  });

  revalidatePath(`/t/${tenantSlug}/admin/users`);
  redirect(`/t/${tenantSlug}/admin/users`);
}

const updateUserSchema = z.object({
  name: z.string().min(2).max(100),
  role: z.enum(["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "SAFETY_MANAGER", "DRIVER"]),
  active: z.boolean(),
});

export async function updateTenantUserAction(tenantSlug: string, membershipId: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, ["TENANT_OWNER", "TENANT_ADMIN"]);
  const parsed = updateUserSchema.parse({
    name: formData.get("name"),
    role: formData.get("role"),
    active: formData.get("active") === "on",
  });

  const db = getDb();
  const target = await db.tenantMembership.findFirstOrThrow({
    where: { id: membershipId, tenantId: tenant.id },
    include: { user: true },
  });

  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: target.userId },
      data: { name: parsed.name },
    });
    await tx.tenantMembership.update({
      where: { id: membershipId },
      data: { role: parsed.role as TenantRole, active: parsed.active },
    });
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "user.update",
    entity: "TenantMembership",
    entityId: membershipId,
    before: { name: target.user.name, role: target.role, active: target.active },
    after: parsed,
  });

  revalidatePath(`/t/${tenantSlug}/admin/users`);
  redirect(`/t/${tenantSlug}/admin/users`);
}

export async function toggleMembershipAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, ["TENANT_OWNER", "TENANT_ADMIN"]);

  const db = getDb();
  const target = await db.tenantMembership.findFirstOrThrow({
    where: { id: membershipId, tenantId: tenant.id },
  });

  await db.tenantMembership.update({
    where: { id: membershipId },
    data: { active: !target.active },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: target.active ? "user.deactivate" : "user.activate",
    entity: "TenantMembership",
    entityId: membershipId,
    before: { active: target.active },
    after: { active: !target.active },
  });

  revalidatePath(`/t/${tenantSlug}/admin/users`);
}

const createDriverSchema = z.object({
  name: z.string().min(2).max(100),
  code: z.string().min(2).max(20),
  license: z.string().min(2).max(50),
  phone: z.string().max(30).optional(),
});

export async function createDriverAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
  ]);
  const parsed = createDriverSchema.parse({
    name: formData.get("name"),
    code: formData.get("code"),
    license: formData.get("license"),
    phone: formData.get("phone")?.toString()?.trim() || undefined,
  });

  const db = getDb();
  const driver = await db.driver.create({
    data: {
      tenantId: tenant.id,
      name: parsed.name,
      code: parsed.code,
      license: parsed.license,
      phone: parsed.phone || null,
      status: "AVAILABLE",
    },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "driver.create",
    entity: "Driver",
    entityId: driver.id,
    after: parsed,
  });

  revalidatePath(`/t/${tenantSlug}/admin/drivers`);
  redirect(`/t/${tenantSlug}/admin/drivers`);
}

const updateDriverSchema = z.object({
  name: z.string().min(2).max(100),
  license: z.string().min(2).max(50),
  phone: z.string().max(30).optional(),
  status: z.enum(["AVAILABLE", "ON_TRIP", "OFF_DUTY", "INACTIVE"]),
});

export async function updateDriverAction(tenantSlug: string, driverId: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
  ]);
  const parsed = updateDriverSchema.parse({
    name: formData.get("name"),
    license: formData.get("license"),
    phone: formData.get("phone")?.toString()?.trim() || undefined,
    status: formData.get("status"),
  });

  const db = getDb();
  const existing = await db.driver.findFirstOrThrow({
    where: { id: driverId, tenantId: tenant.id },
  });

  await db.driver.update({
    where: { id: driverId },
    data: {
      name: parsed.name,
      license: parsed.license,
      phone: parsed.phone || null,
      status: parsed.status,
    },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "driver.update",
    entity: "Driver",
    entityId: driverId,
    before: { name: existing.name, license: existing.license, status: existing.status },
    after: parsed,
  });

  revalidatePath(`/t/${tenantSlug}/admin/drivers`);
  redirect(`/t/${tenantSlug}/admin/drivers`);
}
