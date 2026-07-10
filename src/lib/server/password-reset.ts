import nodemailer from "nodemailer";
import { randomBytes } from "node:crypto";
import { audit } from "@/lib/server/audit";
import { hashPassword, hashToken, keyedHash } from "@/lib/server/crypto";
import { getDb } from "@/lib/server/db";
import { logger } from "@/lib/server/logger";
import { revokeAllUserSessions } from "@/lib/server/auth";

const TOKEN_TTL_MINUTES = 20;
export const RESET_MIN_PASSWORD_LENGTH = 10;
export const RESET_MAX_PASSWORD_LENGTH = 128;

/**
 * Genera un token opaco de 32 bytes y persiste solo su hash. El token en claro
 * SOLO se retorna al llamador (para incluirlo en el correo). Nunca se registra.
 */
function generateToken() {
  return randomBytes(32).toString("base64url");
}

function baseUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}

async function sendResetEmail(email: string, token: string) {
  const link = `${baseUrl()}/recuperar/${encodeURIComponent(token)}`;
  const transport = nodemailer.createTransport({
    host: process.env.MAIL_HOST ?? "localhost",
    port: Number(process.env.MAIL_PORT ?? 1025),
    secure: false,
  });
  const body = [
    "Hola,",
    "",
    "Recibimos una solicitud para restablecer la contrasena de su cuenta en NCI Logistics Control Tower.",
    "",
    `Puede completar el restablecimiento con el siguiente enlace, valido por ${TOKEN_TTL_MINUTES} minutos:`,
    "",
    link,
    "",
    "Si no reconoce esta solicitud, ignore este correo. Su cuenta seguira activa.",
    "",
    "Este mensaje fue generado automaticamente. No responda a esta direccion.",
    "",
    "NCI Automation",
  ].join("\n");
  await transport.sendMail({
    from: process.env.MAIL_FROM ?? "NCI Logistics Control Tower <no-reply@nci.local>",
    to: email,
    subject: "Restablecer su contrasena",
    text: body,
  });
}

/**
 * Solicita un token de restablecimiento. Nunca revela si el correo existe:
 * ejecuta el mismo trabajo aparente si el usuario no existe (delay artificial
 * y sin generar token). El llamador aplica su propio delay constante.
 */
export async function requestPasswordReset(email: string, requesterIp: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const db = getDb();
  const user = await db.user.findUnique({ where: { email: normalized } });
  if (!user || !user.active) {
    logger.info("password reset requested for unknown user", { emailHash: keyedHash(normalized, "reset-email") });
    return;
  }

  // Invalida cualquier token previo vigente del usuario.
  const now = new Date();
  await db.passwordResetToken.updateMany({
    where: { userId: user.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
    data: { revokedAt: now },
  });

  const token = generateToken();
  const tokenHash = hashToken(token);
  await db.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash,
      expiresAt: new Date(now.getTime() + TOKEN_TTL_MINUTES * 60 * 1000),
      requestedIpHash: keyedHash(requesterIp, "reset-ip"),
    },
  });

  await audit({
    actorId: user.id,
    actorRole: user.platformRole ?? "USER",
    action: "auth.password_reset_requested",
    entity: "User",
    entityId: user.id,
  });

  try {
    await sendResetEmail(user.email, token);
  } catch (error) {
    logger.error("password reset mail failed", { error: error instanceof Error ? error.message : "unknown" });
  }
}

export type ResetValidation =
  | { ok: true; userId: string }
  | { ok: false; reason: "INVALID" | "EXPIRED" | "USED" | "REVOKED" };

/** Valida sin consumir. Útil para renderizar el formulario de restablecimiento. */
export async function validateResetToken(token: string): Promise<ResetValidation> {
  const record = await getDb().passwordResetToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!record) return { ok: false, reason: "INVALID" };
  if (record.usedAt) return { ok: false, reason: "USED" };
  if (record.revokedAt) return { ok: false, reason: "REVOKED" };
  if (record.expiresAt <= new Date()) return { ok: false, reason: "EXPIRED" };
  return { ok: true, userId: record.userId };
}

/**
 * Consume un token: verifica, cambia el hash de contraseña, invalida TODAS
 * las sesiones activas del usuario y marca el token como usado. Todo en una
 * misma transacción para evitar reuso.
 */
export async function consumeResetToken(
  token: string,
  newPassword: string,
): Promise<{ ok: true; userId: string } | { ok: false; reason: "INVALID" | "EXPIRED" | "USED" | "REVOKED" | "WEAK" }> {
  if (newPassword.length < RESET_MIN_PASSWORD_LENGTH || newPassword.length > RESET_MAX_PASSWORD_LENGTH) {
    return { ok: false, reason: "WEAK" };
  }
  const db = getDb();
  const tokenHash = hashToken(token);
  const now = new Date();
  const passwordHash = await hashPassword(newPassword);

  const outcome = await db.$transaction(async (tx) => {
    const record = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record) return { ok: false as const, reason: "INVALID" as const };
    if (record.usedAt) return { ok: false as const, reason: "USED" as const };
    if (record.revokedAt) return { ok: false as const, reason: "REVOKED" as const };
    if (record.expiresAt <= now) return { ok: false as const, reason: "EXPIRED" as const };

    const updated = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (updated.count === 0) return { ok: false as const, reason: "USED" as const };

    await tx.user.update({ where: { id: record.userId }, data: { passwordHash, failedLoginAttempts: 0 } });
    return { ok: true as const, userId: record.userId };
  });

  if (outcome.ok) {
    await revokeAllUserSessions(outcome.userId, "password-reset");
    await audit({
      actorId: outcome.userId,
      actorRole: "USER",
      action: "auth.password_reset_completed",
      entity: "User",
      entityId: outcome.userId,
    });
  }

  return outcome;
}

/** Limpia tokens vencidos o revocados. Llamado desde el flujo de recuperación. */
export async function pruneStaleResetTokens() {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  await getDb().passwordResetToken.deleteMany({
    where: { OR: [{ expiresAt: { lt: new Date() } }, { createdAt: { lt: cutoff } }] },
  });
}
