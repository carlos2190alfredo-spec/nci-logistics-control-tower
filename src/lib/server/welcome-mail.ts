import { appUrl } from "@/lib/server/app-url";
import {
  welcomeTenantOwnerEmail,
  welcomeUserEmail,
} from "@/lib/server/email-templates";
import {
  buildVerifyUrl,
  generateEmailVerifyToken,
} from "@/lib/server/email-verification";
import { logger } from "@/lib/server/logger";
import { describeMailError, trySendMail } from "@/lib/server/mail";
import {
  SETUP_TOKEN_TTL_HOURS,
  issuePasswordSetupToken,
  passwordResetUrl,
} from "@/lib/server/password-reset";
import { enforceRateLimit } from "@/lib/server/rate-limit";

/**
 * Correos de bienvenida de cuentas nuevas (propietario de tenant y miembros).
 *
 * Se envian DESPUES de confirmar el alta, asi que nunca lanzan: si fallan
 * (SMTP caido, URL publica sin configurar) devuelven `{ ok: false }` y la accion
 * decide como avisar. La cuenta se activa con un enlace de un solo uso para
 * definir la contrasena; ningun correo lleva una contrasena.
 *
 * Archivo SIN "use server": no son server actions ni endpoints publicos.
 */

export type WelcomeMailResult = { ok: true } | { ok: false; code: string };

// Tope de correos de alta/invitacion por tenant y hora: evita usar el dominio de la
// plataforma como relay de spam o phishing desde una cuenta de administrador.
const ONBOARDING_MAIL_LIMIT = 50;
const ONBOARDING_MAIL_WINDOW_SECONDS = 60 * 60;

/** Consume una unidad del cupo horario del tenant. `false` = cupo agotado. */
export async function consumeOnboardingMailQuota(
  tenantId: string,
): Promise<boolean> {
  const outcome = await enforceRateLimit({
    scope: "tenant.onboarding_mail",
    key: tenantId,
    limit: ONBOARDING_MAIL_LIMIT,
    windowSeconds: ONBOARDING_MAIL_WINDOW_SECONDS,
  });
  return outcome.allowed;
}

function failed(
  event: string,
  tenantId: string,
  error: unknown,
): WelcomeMailResult {
  const failure = describeMailError(error);
  logger.error(event, {
    service: "mail",
    component: "welcome-mail",
    tenantId,
    outcome: "FAILED",
    errorCode: failure.code,
    safeMessage: failure.message,
  });
  return { ok: false, code: failure.code };
}

export async function sendOwnerWelcomeMail(input: {
  tenantId: string;
  tenantName: string;
  userId: string;
  to: string;
  ownerName: string;
  /** Cuenta creada ahora: recibe enlace para definir contrasena. Si ya existia, conserva la suya. */
  isNewUser: boolean;
  emailVerified: boolean;
}): Promise<WelcomeMailResult> {
  try {
    const verifyUrl = input.emailVerified
      ? undefined
      : buildVerifyUrl(await generateEmailVerifyToken(input.userId));
    const setPasswordUrl = input.isNewUser
      ? passwordResetUrl(await issuePasswordSetupToken(input.userId))
      : undefined;
    const content = welcomeTenantOwnerEmail({
      ownerName: input.ownerName,
      tenantName: input.tenantName,
      loginUrl: appUrl("/login"),
      verifyUrl,
      setPasswordUrl,
      setPasswordTtlHours: SETUP_TOKEN_TTL_HOURS,
    });
    const result = await trySendMail(
      { to: input.to, ...content },
      {
        event: "welcome_mail.owner_failed",
        component: "welcome-mail",
        tenantId: input.tenantId,
      },
    );
    return result.ok ? { ok: true } : { ok: false, code: result.code };
  } catch (error) {
    return failed("welcome_mail.owner_failed", input.tenantId, error);
  }
}

export async function sendMemberWelcomeMail(input: {
  tenantId: string;
  tenantName: string;
  userId: string;
  to: string;
  userName: string;
  roleLabel: string;
  invitedBy: string;
}): Promise<WelcomeMailResult> {
  try {
    const verifyUrl = buildVerifyUrl(
      await generateEmailVerifyToken(input.userId),
    );
    const setPasswordUrl = passwordResetUrl(
      await issuePasswordSetupToken(input.userId),
    );
    const content = welcomeUserEmail({
      userName: input.userName,
      tenantName: input.tenantName,
      role: input.roleLabel,
      invitedBy: input.invitedBy,
      loginUrl: appUrl("/login"),
      verifyUrl,
      setPasswordUrl,
      setPasswordTtlHours: SETUP_TOKEN_TTL_HOURS,
    });
    const result = await trySendMail(
      { to: input.to, ...content },
      {
        event: "welcome_mail.member_failed",
        component: "welcome-mail",
        tenantId: input.tenantId,
      },
    );
    return result.ok ? { ok: true } : { ok: false, code: result.code };
  } catch (error) {
    return failed("welcome_mail.member_failed", input.tenantId, error);
  }
}
