/**
 * Logger centralizado con redacción para el servidor.
 * Nunca escribe contraseñas, tokens de sesión, cookies, firmas base64, signed URLs
 * completas ni contenido de documentos. Los eventos operativos usan `audit()`;
 * este módulo cubre trazas técnicas.
 */

const REDACTED = "[REDACTED]";

const SENSITIVE_KEYS = new Set([
  "password",
  "passwordHash",
  "token",
  "tokenHash",
  "cookie",
  "authorization",
  "signature",
  "signatureData",
  "signatureSvg",
  "secret",
  "accessKeyId",
  "secretAccessKey",
]);

const URL_TOKEN_KEYS = ["X-Amz-Signature", "X-Amz-Credential", "X-Amz-Security-Token"];

function redactUrl(value: string) {
  try {
    const url = new URL(value);
    let modified = false;
    for (const key of URL_TOKEN_KEYS) {
      if (url.searchParams.has(key)) {
        url.searchParams.set(key, REDACTED);
        modified = true;
      }
    }
    return modified ? url.toString() : value;
  } catch {
    return value;
  }
}

function truncate(value: string, max = 240) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

export function redact(input: unknown, depth = 0): unknown {
  if (input === null || input === undefined) return input;
  if (depth > 4) return REDACTED;
  if (typeof input === "string") {
    if (input.startsWith("data:image/")) return `${REDACTED}(dataurl)`;
    if (input.startsWith("http")) return redactUrl(input);
    return truncate(input);
  }
  if (typeof input === "number" || typeof input === "boolean" || typeof input === "bigint") {
    return input;
  }
  if (Array.isArray(input)) {
    return input.slice(0, 10).map((item) => redact(item, depth + 1));
  }
  if (typeof input === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input)) {
      if (SENSITIVE_KEYS.has(key)) {
        result[key] = REDACTED;
        continue;
      }
      result[key] = redact(value, depth + 1);
    }
    return result;
  }
  return REDACTED;
}

type LogLevel = "debug" | "info" | "warn" | "error";

function emit(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const payload = {
    level,
    at: new Date().toISOString(),
    msg: message,
    ...(context ? { ctx: redact(context) } : {}),
  };
  const line = JSON.stringify(payload);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (level === "debug") {
    if (process.env.NODE_ENV !== "production") console.debug(line);
  } else console.info(line);
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>) => emit("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => emit("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => emit("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => emit("error", message, context),
};
