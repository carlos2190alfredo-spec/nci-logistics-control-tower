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
  "otp",
  "mfa",
  "mfaCode",
  "recoveryCode",
  "session",
  "sessionToken",
  "signedUrl",
  "objectKey",
  "base64",
  "backupEncryptionKey",
  "minioSecretKey",
  "databaseUrl",
  "encryptedSecret",
  "authTag",
  "iv",
  "codeHash",
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

export type LogLevel = "debug" | "info" | "warn" | "error" | "security" | "audit" | "job" | "metric";

export type LogContext = {
  requestId?: string;
  tenantId?: string;
  userId?: string;
  role?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  service?: string;
  component?: string;
  outcome?: string;
  errorCode?: string;
  safeMessage?: string;
  [key: string]: unknown;
};

function emit(level: LogLevel, event: string, context?: LogContext) {
  const payload: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    level,
    event,
  };

  if (context) {
    const { requestId, tenantId, userId, role, route, method, statusCode, durationMs, service, component, outcome, errorCode, safeMessage, ...rest } = context;
    if (requestId) payload.requestId = requestId;
    if (tenantId) payload.tenantId = tenantId;
    if (userId) payload.userId = userId;
    if (role) payload.role = role;
    if (route) payload.route = route;
    if (method) payload.method = method;
    if (statusCode !== undefined) payload.statusCode = statusCode;
    if (durationMs !== undefined) payload.durationMs = durationMs;
    if (service) payload.service = service;
    if (component) payload.component = component;
    if (outcome) payload.outcome = outcome;
    if (errorCode) payload.errorCode = errorCode;
    if (safeMessage) payload.safeMessage = safeMessage;
    const extra = Object.keys(rest).length > 0 ? redact(rest) : undefined;
    if (extra && typeof extra === "object") {
      payload.ctx = extra;
    }
  }

  const line = JSON.stringify(payload);

  switch (level) {
    case "error":
    case "security":
      console.error(line);
      break;
    case "warn":
      console.warn(line);
      break;
    case "debug":
      if (process.env.NODE_ENV !== "production") console.debug(line);
      break;
    default:
      console.info(line);
      break;
  }
}

export const logger = {
  debug: (event: string, context?: LogContext) => emit("debug", event, context),
  info: (event: string, context?: LogContext) => emit("info", event, context),
  warn: (event: string, context?: LogContext) => emit("warn", event, context),
  error: (event: string, context?: LogContext) => emit("error", event, context),
  security: (event: string, context?: LogContext) => emit("security", event, context),
  audit: (event: string, context?: LogContext) => emit("audit", event, context),
  job: (event: string, context?: LogContext) => emit("job", event, context),
  metric: (event: string, context?: LogContext) => emit("metric", event, context),
};
