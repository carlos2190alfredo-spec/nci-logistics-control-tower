"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { parseForm } from "@/lib/catalog/form";
import { portalUserInputSchema } from "@/lib/catalog/schemas";
import { actionError, actionOk, type ActionResult } from "@/lib/server/action-result";
import { audit } from "@/lib/server/audit";
import { requireTenantPermission } from "@/lib/server/auth";
import { hashPassword } from "@/lib/server/crypto";
import { evaluatePortalAccessGrant } from "@/lib/server/customer-user-rules";
import { getDb } from "@/lib/server/db";
import { isUniqueViolation } from "@/lib/server/db-errors";
import { generateUnusablePassword } from "@/lib/server/password-reset";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { lockTenantForCreate } from "@/lib/server/trip-creation";
import { consumeOnboardingMailQuota, sendCustomerWelcomeMail } from "@/lib/server/welcome-mail";

/**
 * Acceso de usuarios externos al portal de un cliente (ADR-038). Solo roles con MFA (`tenant.customers.portal`).
 * Sin campo de contrasena: cuenta nueva = contrasena inutilizable + enlace de un solo uso (ADR-037). El
 * `tenantId` de la membresia sale de la cuenta verificada en el servidor (la tabla no tiene FK a tenants).
 */

const TX_OPTIONS = { timeout: 15_000, maxWait: 5_000 } as const;

export async function createCustomerUserAction(tenantSlug: string, _previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.customers.portal");
  const parsed = parseForm(portalUserInputSchema, formData);
  if (!parsed.ok) return actionError(parsed.message, { fieldErrors: parsed.fieldErrors, values: parsed.values });
  const input = parsed.data;
  const db = getDb();

  const account = await db.customerAccount.findFirst({
    where: { id: input.customerAccountId, tenantId: tenant.id, active: true },
    select: { id: true, name: true, tenantId: true },
  });
  if (!account) return actionError("El cliente no existe o está inactivo.");

  // Cupo de correos de alta del tenant (compartido con altas de usuarios): evita usar la plataforma como relay.
  if (!(await consumeOnboardingMailQuota(tenant.id))) {
    return actionError("Se alcanzó el máximo de correos de alta por hora. Intente de nuevo más tarde.");
  }

  // El hash se calcula fuera de la transaccion (argon2 es costoso).
  const passwordHash = await hashPassword(generateUnusablePassword());

  let outcome:
    | { kind: "created"; userId: string; membershipId: string }
    | { kind: "reactivated"; membershipId: string }
    | { kind: "already" }
    | { kind: "reject"; scope: "global" | "local"; reason: string; message: string };
  try {
    outcome = await db.$transaction(async (tx) => {
      await lockTenantForCreate(tx, tenant.id);
      const existing = await tx.user.findUnique({
        where: { email: input.email },
        select: { id: true, active: true, platformRole: true },
      });
      const [memberships, team] = existing
        ? await Promise.all([
            tx.customerMembership.findMany({ where: { tenantId: tenant.id, userId: existing.id }, select: { id: true, customerAccountId: true, role: true, active: true } }),
            tx.tenantMembership.findFirst({ where: { tenantId: tenant.id, userId: existing.id, active: true }, select: { id: true } }),
          ])
        : [[], null];
      const decision = evaluatePortalAccessGrant({
        existingUser: existing ? { active: existing.active, platformRole: existing.platformRole } : null,
        customerMemberships: memberships,
        isTeamMember: team !== null,
        target: { customerAccountId: account.id, role: input.role },
      });
      switch (decision.kind) {
        case "create_user_and_membership": {
          const created = await tx.user.create({
            data: { name: input.name, email: input.email, passwordHash, emailVerified: false },
            select: { id: true },
          });
          const row = await tx.customerMembership.create({
            data: { tenantId: account.tenantId, customerAccountId: account.id, userId: created.id, role: input.role },
            select: { id: true },
          });
          return { kind: "created" as const, userId: created.id, membershipId: row.id };
        }
        case "reactivate_membership":
          await tx.customerMembership.updateMany({
            where: { id: decision.membershipId, tenantId: tenant.id },
            data: { active: true, role: input.role },
          });
          return { kind: "reactivated" as const, membershipId: decision.membershipId };
        case "already_has_access":
          return { kind: "already" as const };
        case "reject":
          return decision;
      }
    }, TX_OPTIONS);
  } catch (error) {
    if (isUniqueViolation(error)) return actionError("Ese correo ya tiene acceso o se está registrando. Intente de nuevo.");
    throw error;
  }

  if (outcome.kind === "reject") {
    if (outcome.scope === "global") {
      // Rechazos globales: motivo real solo a la auditoria, y tope de intentos (evita sondear que correos existen).
      const attempts = await enforceRateLimit({ scope: "auth.customer_access_reject", key: `${tenant.id}:${user.id}`, limit: 10, windowSeconds: 3600 });
      await audit({
        tenantId: tenant.id, actorId: user.id, actorRole: membership.role,
        action: "customer_user.grant_rejected", entity: "CustomerAccount", entityId: account.id, after: { reason: outcome.reason },
      });
      if (!attempts.allowed) return actionError("Demasiados intentos. Espere unos minutos antes de volver a intentarlo.");
    }
    return actionError(outcome.message, { fieldErrors: { email: outcome.message } });
  }
  if (outcome.kind === "already") return actionOk("Esa persona ya tiene acceso a este cliente.");

  revalidatePath(`/t/${tenantSlug}`, "layout");
  if (outcome.kind === "reactivated") {
    await audit({
      tenantId: tenant.id, actorId: user.id, actorRole: membership.role,
      action: "customer_user.reactivate", entity: "CustomerMembership", entityId: outcome.membershipId, after: { role: input.role },
    });
    return actionOk("Acceso reactivado. La persona entra con su contraseña actual.");
  }

  // Auditar ANTES de enviar el correo; si el correo falla la alta no se revierte.
  await audit({
    tenantId: tenant.id, actorId: user.id, actorRole: membership.role,
    action: "customer_user.create", entity: "CustomerMembership", entityId: outcome.membershipId,
    after: { customerAccountId: account.id, role: input.role },
  });
  const mail = await sendCustomerWelcomeMail({
    tenantId: tenant.id,
    tenantName: tenant.name,
    customerName: account.name,
    userId: outcome.userId,
    to: input.email,
    userName: input.name,
  });
  if (!mail.ok) {
    await audit({
      tenantId: tenant.id, actorId: user.id, actorRole: membership.role,
      action: "customer_user.welcome_email_failed", entity: "CustomerMembership", entityId: outcome.membershipId, after: { code: mail.code },
    });
    return actionOk("Acceso creado, pero no se pudo enviar el correo. Use «Reenviar enlace» más tarde.");
  }
  return actionOk("Acceso creado. Se envió un correo con un enlace para crear la contraseña (válido 48 horas).");
}

/** Desactiva o reactiva el acceso de una persona (se enlaza con `.bind(null, slug, membershipId, active)`). */
export async function setCustomerAccessActiveAction(tenantSlug: string, membershipId: string, active: boolean): Promise<void> {
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.customers.portal");
  const db = getDb();
  const result = await db.$transaction(async (tx) => {
    await lockTenantForCreate(tx, tenant.id);
    const row = await tx.customerMembership.findFirst({
      where: { id: membershipId, tenantId: tenant.id },
      select: { id: true, userId: true, customerAccountId: true, customerAccount: { select: { active: true } } },
    });
    if (!row) return { notice: "acceso-no-valido", customerId: null as string | null };
    if (active) {
      if (!row.customerAccount.active) return { notice: "acceso-cliente-inactivo", customerId: row.customerAccountId };
      const other = await tx.customerMembership.count({
        where: { tenantId: tenant.id, userId: row.userId, active: true, id: { not: row.id } },
      });
      if (other > 0) return { notice: "acceso-otro-cliente", customerId: row.customerAccountId };
    }
    await tx.customerMembership.updateMany({ where: { id: row.id, tenantId: tenant.id }, data: { active } });
    return { notice: active ? "acceso-reactivado" : "acceso-desactivado", customerId: row.customerAccountId };
  }, TX_OPTIONS);

  if (result.notice === "acceso-reactivado" || result.notice === "acceso-desactivado") {
    await audit({
      tenantId: tenant.id, actorId: user.id, actorRole: membership.role,
      action: active ? "customer_user.reactivate" : "customer_user.deactivate", entity: "CustomerMembership", entityId: membershipId,
    });
  }
  revalidatePath(`/t/${tenantSlug}`, "layout");
  redirect(
    result.customerId
      ? `/t/${tenantSlug}/customers/${result.customerId}?aviso=${result.notice}`
      : `/t/${tenantSlug}/customers?aviso=${result.notice}`,
  );
}

/** Reenvia el enlace para crear la contrasena (solo si la persona nunca inicio sesion: no anula tokens de quien ya usa su cuenta). */
export async function resendCustomerAccessAction(tenantSlug: string, membershipId: string): Promise<void> {
  const { user, tenant, membership } = await requireTenantPermission(tenantSlug, "tenant.customers.portal");
  const db = getDb();
  const row = await db.customerMembership.findFirst({
    where: { id: membershipId, tenantId: tenant.id, active: true },
    select: {
      id: true,
      customerAccountId: true,
      customerAccount: { select: { name: true, active: true } },
      user: { select: { id: true, name: true, email: true, active: true, platformRole: true, lastLoginAt: true } },
    },
  });
  if (!row || !row.customerAccount.active) redirect(`/t/${tenantSlug}/customers?aviso=acceso-no-valido`);
  const back = `/t/${tenantSlug}/customers/${row.customerAccountId}`;
  if (!row.user.active || row.user.platformRole || row.user.lastLoginAt) redirect(`${back}?aviso=reenvio-no-aplica`);

  const limit = await enforceRateLimit({ scope: "customer.access_resend", key: tenant.id, limit: 10, windowSeconds: 3600 });
  if (!limit.allowed || !(await consumeOnboardingMailQuota(tenant.id))) redirect(`${back}?aviso=reenvio-limite`);

  const mail = await sendCustomerWelcomeMail({
    tenantId: tenant.id,
    tenantName: tenant.name,
    customerName: row.customerAccount.name,
    userId: row.user.id,
    to: row.user.email,
    userName: row.user.name,
  });
  await audit({
    tenantId: tenant.id, actorId: user.id, actorRole: membership.role,
    action: mail.ok ? "customer_user.resend" : "customer_user.welcome_email_failed", entity: "CustomerMembership", entityId: row.id,
  });
  redirect(`${back}?aviso=${mail.ok ? "acceso-reenviado" : "reenvio-fallo"}`);
}
