"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import {
  getPartialSession,
  promoteSessionToMfaVerified,
  requireAuthenticatedUser,
  requiresMfaForRole,
} from "@/lib/server/auth";
import {
  createMfaChallenge,
  consumeMfaChallenge,
  deactivateMfa,
  hasRecentMfaVerification,
  regenerateRecoveryCodes,
  setupMfaSecret,
  userHasMfaActive,
  verifyAndActivateMfa,
  verifyMfaCode,
  verifyRecoveryCode,
} from "@/lib/server/mfa";
import { verifyPassword } from "@/lib/server/crypto";
import { getDb } from "@/lib/server/db";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { audit } from "@/lib/server/audit";
import { logger } from "@/lib/server/logger";

const totpSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

const recoverySchema = z.object({
  code: z.string().min(10),
});

export async function verifyMfaLoginAction(_: { error: string } | null, formData: FormData) {
  const session = await getPartialSession();
  if (!session) redirect("/login");
  if (session.authLevel !== "PARTIAL_MFA_PENDING") redirect("/login");

  const userRate = await enforceRateLimit({
    scope: "mfa.verify",
    key: session.userId,
    limit: 10,
    windowSeconds: 900,
  });
  if (!userRate.allowed) {
    logger.warn("mfa verify rate limited", { userId: session.userId });
    return { error: "Demasiados intentos. Espere unos minutos." };
  }

  const codeRaw = formData.get("code");
  const isRecoveryCode = formData.get("useRecovery") === "true";

  if (isRecoveryCode) {
    const parsed = recoverySchema.safeParse({ code: codeRaw });
    if (!parsed.success) return { error: "Codigo de recuperacion invalido." };

    const result = await verifyRecoveryCode(session.userId, parsed.data.code);
    if (!result.valid) {
      await audit({
        actorId: session.userId,
        actorRole: "USER",
        action: "mfa.recovery_code_failed",
        entity: "Session",
        entityId: session.id,
      });
      return { error: "Codigo de recuperacion invalido o ya utilizado." };
    }

    await promoteSessionToMfaVerified(session.id);
    await audit({
      actorId: session.userId,
      actorRole: "USER",
      action: "mfa.login_verified_recovery",
      entity: "Session",
      entityId: session.id,
      after: { remainingCodes: result.remainingCodes },
    });

    redirect(await getPostLoginRedirect(session.userId));
  }

  const parsed = totpSchema.safeParse({ code: codeRaw });
  if (!parsed.success) return { error: "Ingrese un codigo de 6 digitos." };

  const result = await verifyMfaCode(session.userId, parsed.data.code);
  if (!result.valid) {
    await audit({
      actorId: session.userId,
      actorRole: "USER",
      action: "mfa.login_code_failed",
      entity: "Session",
      entityId: session.id,
    });
    return { error: "Codigo incorrecto. Intente de nuevo." };
  }

  await promoteSessionToMfaVerified(session.id);
  await audit({
    actorId: session.userId,
    actorRole: "USER",
    action: "mfa.login_verified",
    entity: "Session",
    entityId: session.id,
  });

  redirect(await getPostLoginRedirect(session.userId));
}

async function getPostLoginRedirect(userId: string): Promise<string> {
  const db = getDb();
  const user = await db.user.findUnique({
    where: { id: userId },
    include: {
      tenantMemberships: { where: { active: true }, include: { tenant: true } },
      customerMemberships: {
        where: { active: true },
        include: { customerAccount: { include: { tenant: true } } },
      },
    },
  });

  if (user?.platformRole) return "/platform";
  const firstTenant = user?.tenantMemberships[0]?.tenant.slug;
  if (firstTenant) return `/t/${firstTenant}`;
  const firstCustomerTenant = user?.customerMemberships[0]?.customerAccount.tenant.slug;
  return firstCustomerTenant ? `/t/${firstCustomerTenant}/portal` : "/login";
}

export async function setupMfaAction() {
  const user = await requireAuthenticatedUser();
  const result = await setupMfaSecret(user.id, user.email);
  if ("error" in result) return { error: "MFA ya esta activado." };
  return { secret: result.secret, uri: result.uri };
}

export async function activateMfaAction(_: { error: string } | { recoveryCodes: string[] } | null, formData: FormData) {
  const user = await requireAuthenticatedUser();

  const parsed = totpSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) return { error: "Ingrese un codigo de 6 digitos." };

  const result = await verifyAndActivateMfa(user.id, parsed.data.code);
  if ("error" in result) {
    if (result.error === "INVALID_CODE") return { error: "Codigo incorrecto. Intente de nuevo." };
    if (result.error === "MFA_ALREADY_ACTIVE") return { error: "MFA ya esta activado." };
    return { error: "Error al activar MFA." };
  }

  return { recoveryCodes: result.recoveryCodes };
}

export async function deactivateMfaAction(_: { error: string } | { ok: boolean } | null, formData: FormData) {
  const user = await requireAuthenticatedUser();

  const password = formData.get("password");
  if (!password || typeof password !== "string") return { error: "Ingrese su contrasena." };

  const dbUser = await getDb().user.findUnique({ where: { id: user.id } });
  if (!dbUser) return { error: "Error interno." };

  const validPassword = await verifyPassword(dbUser.passwordHash, password);
  if (!validPassword) return { error: "Contrasena incorrecta." };

  const code = formData.get("code");
  if (!code || typeof code !== "string") return { error: "Ingrese un codigo TOTP." };

  const mfaResult = await verifyMfaCode(user.id, code);
  if (!mfaResult.valid) return { error: "Codigo TOTP incorrecto." };

  const result = await deactivateMfa(user.id);
  if ("error" in result) return { error: "MFA no esta activado." };

  return { ok: true };
}

export async function regenerateCodesAction(_: { error: string } | { recoveryCodes: string[] } | null, formData: FormData) {
  const user = await requireAuthenticatedUser();

  const password = formData.get("password");
  if (!password || typeof password !== "string") return { error: "Ingrese su contrasena." };

  const dbUser = await getDb().user.findUnique({ where: { id: user.id } });
  if (!dbUser) return { error: "Error interno." };

  const validPassword = await verifyPassword(dbUser.passwordHash, password);
  if (!validPassword) return { error: "Contrasena incorrecta." };

  const code = formData.get("code");
  if (!code || typeof code !== "string") return { error: "Ingrese un codigo TOTP." };

  const mfaResult = await verifyMfaCode(user.id, code);
  if (!mfaResult.valid) return { error: "Codigo TOTP incorrecto." };

  const result = await regenerateRecoveryCodes(user.id);
  if ("error" in result) return { error: "MFA no esta activado." };

  return { recoveryCodes: result.recoveryCodes };
}

export async function getMfaStatusAction() {
  const user = await requireAuthenticatedUser();
  const hasMfa = await userHasMfaActive(user.id);
  const requiresMfa = await requiresMfaForRole(user.id);

  let remainingCodes = 0;
  if (hasMfa) {
    remainingCodes = await getDb().mfaRecoveryCode.count({
      where: { userId: user.id, usedAt: null },
    });
  }

  return { hasMfa, requiresMfa, remainingCodes };
}

export async function requireRecentMfaOrPasswordAction(_: unknown, formData: FormData) {
  const user = await requireAuthenticatedUser();
  const hasMfa = await userHasMfaActive(user.id);

  if (hasMfa) {
    const recent = await hasRecentMfaVerification(user.id, 15);
    if (recent) return { ok: true };

    const code = formData.get("code");
    if (!code || typeof code !== "string") return { error: "Ingrese su codigo MFA." };

    const mfaResult = await verifyMfaCode(user.id, code);
    if (!mfaResult.valid) return { error: "Codigo incorrecto." };

    const session = await getPartialSession();
    if (session) {
      await createMfaChallenge(user.id, session.id, "reauth");
      const challenge = await getDb().mfaChallenge.findFirst({
        where: { userId: user.id, sessionId: session.id, purpose: "reauth" },
        orderBy: { createdAt: "desc" },
      });
      if (challenge) await consumeMfaChallenge(challenge.id, user.id);
    }

    return { ok: true };
  }

  const password = formData.get("password");
  if (!password || typeof password !== "string") return { error: "Ingrese su contrasena." };

  const dbUser = await getDb().user.findUnique({ where: { id: user.id } });
  if (!dbUser) return { error: "Error interno." };

  const validPassword = await verifyPassword(dbUser.passwordHash, password);
  if (!validPassword) return { error: "Contrasena incorrecta." };

  return { ok: true };
}
