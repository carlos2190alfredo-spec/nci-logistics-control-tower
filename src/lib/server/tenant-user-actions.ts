"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { TenantRole } from "@/generated/prisma";
import { audit } from "@/lib/server/audit";
import { requireTenantRole } from "@/lib/server/auth";
import { hashPassword } from "@/lib/server/crypto";
import { getDb } from "@/lib/server/db";
import { logger } from "@/lib/server/logger";
import {
  MembershipRuleError,
  evaluateMembershipChange,
  type MembershipDenialCode,
} from "@/lib/server/membership-rules";
import { generateUnusablePassword } from "@/lib/server/password-reset";
import { consumeOnboardingMailQuota, sendMemberWelcomeMail } from "@/lib/server/welcome-mail";
import { tenantRoleLabel } from "@/lib/ui/status";

const usersPath = (tenantSlug: string) => `/t/${tenantSlug}/admin/users`;

/**
 * Registra el intento denegado (log de seguridad + auditoria) y vuelve al
 * listado con un codigo de error. El rol del actor se valida SIEMPRE aqui, en
 * el servidor: la UI oculta el rol de propietario pero eso no es una barrera.
 */
async function denyMembershipChange(args: {
  tenantId: string;
  tenantSlug: string;
  actorId: string;
  actorRole: TenantRole;
  code: MembershipDenialCode;
  membershipId?: string;
  attemptedRole?: string;
}): Promise<never> {
  logger.security("tenant.membership.change_denied", {
    service: "tenant-users",
    tenantId: args.tenantId,
    userId: args.actorId,
    role: args.actorRole,
    outcome: args.code,
  });
  await audit({
    tenantId: args.tenantId,
    actorId: args.actorId,
    actorRole: args.actorRole,
    action: "user.change_denied",
    entity: "TenantMembership",
    entityId: args.membershipId ?? null,
    after: { code: args.code, attemptedRole: args.attemptedRole ?? null },
  });
  redirect(`${usersPath(args.tenantSlug)}?error=${args.code.toLowerCase()}`);
}

const createUserSchema = z.object({
  name: z.string().min(2).max(100),
  email: z.string().email().max(200),
  // Opcional y NUNCA se envia por correo. Si se omite, la cuenta nueva nace con una
  // contrasena aleatoria y la persona define la suya con un enlace de un solo uso.
  password: z.string().min(8).max(100).optional(),
  role: z.enum(["TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "SAFETY_MANAGER", "DRIVER"]),
});

export async function createTenantUserAction(tenantSlug: string, formData: FormData) {
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, ["TENANT_OWNER", "TENANT_ADMIN"]);
  const parsed = createUserSchema.parse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password") || undefined,
    role: formData.get("role"),
  });
  const role: TenantRole = parsed.role;

  const decision = evaluateMembershipChange({
    actor: { userId: user.id, role: membership.role },
    next: { role, active: true },
  });
  if (!decision.ok) {
    return denyMembershipChange({
      tenantId: tenant.id,
      tenantSlug,
      actorId: user.id,
      actorRole: membership.role,
      code: decision.code,
      attemptedRole: role,
    });
  }

  const db = getDb();
  const normalizedEmail = parsed.email.toLowerCase().trim();

  // Cuenta nueva = correo saliente: se limita por tenant para que un administrador
  // no use el dominio de la plataforma como relay de spam o phishing.
  const alreadyExists = await db.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } });

  // "Crear" nunca agrega roles a quien YA es miembro de este tenant (incluido el propio
  // actor o un propietario): el unique es (tenant, usuario, rol) y una segunda membresia
  // permitiria autoconcederse roles o eludir la proteccion de propietarios. Para cambiar
  // un rol existente se usa la edicion, que si aplica evaluateMembershipChange con destino.
  if (alreadyExists) {
    const alreadyMember = await db.tenantMembership.findFirst({
      where: { tenantId: tenant.id, userId: alreadyExists.id },
      select: { id: true },
    });
    if (alreadyMember) redirect(`${usersPath(tenantSlug)}?error=already_member`);
  }

  if (!alreadyExists && !(await consumeOnboardingMailQuota(tenant.id))) {
    redirect(`${usersPath(tenantSlug)}?error=rate_limited`);
  }

  const passwordHash = await hashPassword(parsed.password ?? generateUnusablePassword());

  const { account, isNewUser } = await db.$transaction(async (tx) => {
    let found = await tx.user.findUnique({ where: { email: normalizedEmail } });
    let created = false;
    if (!found) {
      found = await tx.user.create({
        data: {
          name: parsed.name,
          email: normalizedEmail,
          passwordHash,
          emailVerified: false,
        },
      });
      created = true;
    }

    const existingMembership = await tx.tenantMembership.findFirst({
      where: { tenantId: tenant.id, userId: found.id, role },
    });
    if (!existingMembership) {
      await tx.tenantMembership.create({
        data: { tenantId: tenant.id, userId: found.id, role },
      });
    }
    return { account: found, isNewUser: created };
  });

  // La auditoria va ANTES del correo: la cuenta ya existe y debe quedar registrada
  // aunque el envio falle o la funcion se corte por tiempo.
  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "user.create",
    entity: "User",
    entityId: account.id,
    after: { name: parsed.name, email: normalizedEmail, role, newAccount: isNewUser },
  });

  let welcomeFailed = false;
  if (isNewUser) {
    const result = await sendMemberWelcomeMail({
      tenantId: tenant.id,
      tenantName: tenant.name,
      userId: account.id,
      to: normalizedEmail,
      userName: parsed.name,
      roleLabel: tenantRoleLabel[role] ?? role,
      invitedBy: user.name,
    });
    if (!result.ok) {
      // La cuenta ya esta creada: no se aborta. Queda en log, auditoria y en el
      // parametro `warning` del listado. Recuperable con "Recuperar contrasena".
      welcomeFailed = true;
      await audit({
        tenantId: tenant.id,
        actorId: user.id,
        actorRole: membership.role,
        action: "user.welcome_email_failed",
        entity: "User",
        entityId: account.id,
        after: { errorCode: result.code },
      });
    }
  }

  revalidatePath(usersPath(tenantSlug));
  redirect(welcomeFailed ? `${usersPath(tenantSlug)}?warning=welcome_email_failed` : usersPath(tenantSlug));
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
  const role: TenantRole = parsed.role;

  const db = getDb();
  let changed;
  try {
    changed = await db.$transaction(async (tx) => {
      // Bloquea los propietarios activos: dos cambios simultaneos no pueden dejar
      // al tenant sin propietario (cada uno vera al otro ya aplicado).
      const owners = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM tenant_memberships
        WHERE tenant_id = ${tenant.id}::uuid AND role = 'TENANT_OWNER' AND active = true
        FOR UPDATE`;

      const target = await tx.tenantMembership.findFirstOrThrow({
        where: { id: membershipId, tenantId: tenant.id },
        include: { user: true },
      });

      const decision = evaluateMembershipChange({
        actor: { userId: user.id, role: membership.role },
        target: { userId: target.userId, role: target.role, active: target.active },
        next: { role, active: parsed.active },
        activeOwnerCount: owners.length,
      });
      if (!decision.ok) throw new MembershipRuleError(decision.code);

      // `User` es global: si la persona tambien pertenece a otro tenant (o es de
      // plataforma) este tenant no puede renombrarla.
      let canRename = !target.user.platformRole;
      if (canRename) {
        const otherTenants = await tx.tenantMembership.count({
          where: { userId: target.userId, tenantId: { not: tenant.id } },
        });
        const otherCustomerLinks = await tx.customerMembership.count({
          where: { userId: target.userId, tenantId: { not: tenant.id } },
        });
        canRename = otherTenants === 0 && otherCustomerLinks === 0;
      }

      if (canRename) {
        await tx.user.update({ where: { id: target.userId }, data: { name: parsed.name } });
      }
      await tx.tenantMembership.update({
        where: { id: membershipId },
        data: { role, active: parsed.active },
      });
      return { target, nameUpdated: canRename };
    });
  } catch (error) {
    if (error instanceof MembershipRuleError) {
      return denyMembershipChange({
        tenantId: tenant.id,
        tenantSlug,
        actorId: user.id,
        actorRole: membership.role,
        code: error.code,
        membershipId,
        attemptedRole: role,
      });
    }
    throw error;
  }

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "user.update",
    entity: "TenantMembership",
    entityId: membershipId,
    before: { name: changed.target.user.name, role: changed.target.role, active: changed.target.active },
    after: { ...parsed, nameUpdated: changed.nameUpdated },
  });

  revalidatePath(usersPath(tenantSlug));
  redirect(usersPath(tenantSlug));
}

export async function toggleMembershipAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const membershipId = String(formData.get("membershipId") ?? "");
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, ["TENANT_OWNER", "TENANT_ADMIN"]);

  const db = getDb();
  let target;
  try {
    target = await db.$transaction(async (tx) => {
      const owners = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM tenant_memberships
        WHERE tenant_id = ${tenant.id}::uuid AND role = 'TENANT_OWNER' AND active = true
        FOR UPDATE`;

      const current = await tx.tenantMembership.findFirstOrThrow({
        where: { id: membershipId, tenantId: tenant.id },
      });

      const decision = evaluateMembershipChange({
        actor: { userId: user.id, role: membership.role },
        target: { userId: current.userId, role: current.role, active: current.active },
        next: { role: current.role, active: !current.active },
        activeOwnerCount: owners.length,
      });
      if (!decision.ok) throw new MembershipRuleError(decision.code);

      await tx.tenantMembership.update({
        where: { id: membershipId },
        data: { active: !current.active },
      });
      return current;
    });
  } catch (error) {
    if (error instanceof MembershipRuleError) {
      return denyMembershipChange({
        tenantId: tenant.id,
        tenantSlug,
        actorId: user.id,
        actorRole: membership.role,
        code: error.code,
        membershipId,
      });
    }
    throw error;
  }

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

  revalidatePath(usersPath(tenantSlug));
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
