import nodemailer from "nodemailer";
import { isLocalEnv } from "@/lib/app-env";
import { logger } from "@/lib/server/logger";

/**
 * Unico transporte SMTP de la aplicacion. Todo correo (notificaciones, reset de
 * contrasena, alertas operativas, invitaciones, bienvenida, verificacion) debe
 * pasar por `sendMail()`/`trySendMail()` para que `MAIL_USER`, `MAIL_PASSWORD`,
 * `MAIL_SECURE` y el puerto 465 (TLS implicito, p. ej. Resend) se respeten en
 * todos los flujos.
 */

// Timeouts explicitos: sin ellos un SMTP inalcanzable cuelga la funcion serverless.
export const MAIL_CONNECTION_TIMEOUT_MS = 8_000;
export const MAIL_GREETING_TIMEOUT_MS = 8_000;
export const MAIL_SOCKET_TIMEOUT_MS = 15_000;

const LOCAL_MAIL_FROM = "NCI Logistics Control Tower <no-reply@nci.local>";

type Env = Record<string, string | undefined>;

/** Configuracion de correo ausente o inconsistente (nunca contiene secretos). */
export class MailConfigError extends Error {
  readonly code = "ECONFIG";
  constructor(message: string) {
    super(message);
    this.name = "MailConfigError";
  }
}

/**
 * Version pura (sin leer `process.env`) de la configuracion del transporte.
 * Fuera de `local` no hay valores por defecto: un `localhost:1025` en la nube
 * solo produce ECONNREFUSED y oculta el problema real (falta configurar SMTP).
 */
export function buildTransportOptions(env: Env, local: boolean) {
  const host = env.MAIL_HOST?.trim() || (local ? "localhost" : undefined);
  if (!host) {
    throw new MailConfigError(
      "Falta MAIL_HOST: el correo no esta configurado para este entorno.",
    );
  }

  const port = Number(env.MAIL_PORT?.trim() || 1025);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new MailConfigError("MAIL_PORT no es un puerto valido.");
  }

  const user = env.MAIL_USER?.trim();
  const pass = env.MAIL_PASSWORD;
  if (!local && Boolean(user) !== Boolean(pass)) {
    throw new MailConfigError(
      "MAIL_USER y MAIL_PASSWORD deben definirse juntos.",
    );
  }

  const secure = env.MAIL_SECURE === "true" || port === 465;
  const auth = user && pass ? { user, pass } : undefined;

  return {
    host,
    port,
    secure,
    ...(auth ? { auth } : {}),
    // Con credenciales y sin TLS implicito, exigir STARTTLS: nunca autenticar en claro.
    ...(auth && !secure && !local ? { requireTLS: true } : {}),
    connectionTimeout: MAIL_CONNECTION_TIMEOUT_MS,
    greetingTimeout: MAIL_GREETING_TIMEOUT_MS,
    socketTimeout: MAIL_SOCKET_TIMEOUT_MS,
  };
}

/** Remitente configurado. Fuera de `local` es obligatorio (el proveedor exige un dominio verificado). */
export function resolveMailFrom(env: Env, local: boolean): string {
  const from = env.MAIL_FROM?.trim();
  if (from) return from;
  if (local) return LOCAL_MAIL_FROM;
  throw new MailConfigError(
    "Falta MAIL_FROM: defina un remitente de un dominio verificado en el proveedor.",
  );
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const local = isLocalEnv();
  const transport = nodemailer.createTransport(
    buildTransportOptions(process.env, local),
  );
  await transport.sendMail({
    from: resolveMailFrom(process.env, local),
    to: opts.to,
    // El asunto es una sola linea: evita inyectar cabeceras con saltos de linea.
    subject: opts.subject.replace(/[\r\n]+/g, " ").trim(),
    text: opts.text,
    ...(opts.html ? { html: opts.html } : {}),
  });
}

const EMAIL_PATTERN = /[^\s<>"',;:()]+@[^\s<>"',;:()]+/g;

/** Resume un error de envio sin secretos ni direcciones de correo (apto para logs, alertas y metadata). */
export function describeMailError(error: unknown): {
  code: string;
  message: string;
} {
  if (error instanceof Error) {
    const rawCode = (error as { code?: unknown }).code;
    return {
      code:
        typeof rawCode === "string" && rawCode
          ? rawCode
          : error.name || "ERROR",
      message: error.message
        .replace(EMAIL_PATTERN, "[correo]")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 200),
    };
  }
  return { code: "UNKNOWN", message: "Error de envio desconocido." };
}

export type MailSendResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

/**
 * Envia sin lanzar nunca. Para efectos secundarios posteriores a una accion de
 * negocio ya confirmada: un fallo de correo no debe revertir ni abortar la accion.
 * Registra el fallo con el logger (sin secretos) y devuelve el resultado.
 */
export async function trySendMail(
  opts: { to: string; subject: string; text: string; html?: string },
  context: { event: string; component: string; tenantId?: string },
): Promise<MailSendResult> {
  try {
    await sendMail(opts);
    return { ok: true };
  } catch (error) {
    const failure = describeMailError(error);
    logger.error(context.event, {
      service: "mail",
      component: context.component,
      tenantId: context.tenantId,
      outcome: "FAILED",
      errorCode: failure.code,
      safeMessage: failure.message,
    });
    return { ok: false, ...failure };
  }
}
