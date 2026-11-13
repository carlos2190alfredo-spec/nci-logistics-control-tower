import { appUrl } from "@/lib/server/app-url";
import { getDb } from "@/lib/server/db";
import { createOpaqueToken } from "@/lib/server/crypto";
import { sendMail } from "@/lib/server/mail";
import { emailVerificationEmail } from "@/lib/server/email-templates";

const VERIFY_TOKEN_TTL_HOURS = 48;

export async function generateEmailVerifyToken(
  userId: string,
): Promise<string> {
  const token = createOpaqueToken();
  const expiresAt = new Date(Date.now() + VERIFY_TOKEN_TTL_HOURS * 3600000);
  const db = getDb();
  await db.user.update({
    where: { id: userId },
    data: { emailVerifyToken: token, emailVerifyTokenExpiresAt: expiresAt },
  });
  return token;
}

/**
 * Envia el correo de verificacion. Lanza si el envio falla: quien la invoque
 * decide como mostrarlo (no hay llamadores dentro de una accion ya confirmada).
 */
export async function sendVerificationEmail(userId: string): Promise<void> {
  const db = getDb();
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { name: true, email: true, emailVerified: true },
  });
  if (user.emailVerified) return;

  const token = await generateEmailVerifyToken(userId);
  const verifyUrl = buildVerifyUrl(token);
  const email = emailVerificationEmail({ userName: user.name, verifyUrl });
  await sendMail({
    to: user.email,
    subject: email.subject,
    text: email.text,
    html: email.html,
  });
}

export async function verifyEmailToken(
  token: string,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const db = getDb();
  const user = await db.user.findUnique({
    where: { emailVerifyToken: token },
    select: { id: true, emailVerified: true, emailVerifyTokenExpiresAt: true },
  });

  if (!user)
    return {
      ok: false,
      error: "Enlace de verificacion invalido o ya utilizado.",
    };
  if (user.emailVerified) {
    return { ok: true, userId: user.id };
  }
  if (
    user.emailVerifyTokenExpiresAt &&
    user.emailVerifyTokenExpiresAt < new Date()
  ) {
    return {
      ok: false,
      error: "El enlace de verificacion ha expirado. Solicite uno nuevo.",
    };
  }

  await db.user.update({
    where: { id: user.id },
    data: { emailVerified: true },
  });

  return { ok: true, userId: user.id };
}

/** Enlace de verificacion; la base sale de `getAppBaseUrl()` (sin fallback a localhost fuera de local). */
export function buildVerifyUrl(token: string): string {
  return appUrl(`/verificar-email/${encodeURIComponent(token)}`);
}
