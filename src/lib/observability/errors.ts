export type ErrorCategory = "validation" | "auth" | "forbidden" | "not_found" | "dependency" | "rate_limit" | "critical";

export type SafeError = {
  code: string;
  message: string;
  category: ErrorCategory;
  requestId?: string;
};

const CATEGORY_CODES: Record<ErrorCategory, string> = {
  validation: "VALIDATION_ERROR",
  auth: "AUTH_REQUIRED",
  forbidden: "ACCESS_DENIED",
  not_found: "RESOURCE_NOT_FOUND",
  dependency: "SERVICE_UNAVAILABLE",
  rate_limit: "RATE_LIMITED",
  critical: "INTERNAL_ERROR",
};

const CATEGORY_MESSAGES: Record<ErrorCategory, string> = {
  validation: "Los datos proporcionados no son validos.",
  auth: "Se requiere autenticacion.",
  forbidden: "No tiene permiso para esta accion.",
  not_found: "El recurso solicitado no existe.",
  dependency: "Un servicio externo no esta disponible. Intente de nuevo.",
  rate_limit: "Demasiadas solicitudes. Espere un momento.",
  critical: "Ocurrio un error interno. Contacte al administrador.",
};

export function toSafeError(error: unknown, requestId?: string): SafeError {
  if (error instanceof AppError) {
    return {
      code: error.code,
      message: error.safeMessage,
      category: error.category,
      requestId,
    };
  }

  return {
    code: CATEGORY_CODES.critical,
    message: CATEGORY_MESSAGES.critical,
    category: "critical",
    requestId,
  };
}

export function safeErrorMessage(category: ErrorCategory): string {
  return CATEGORY_MESSAGES[category];
}

export function safeErrorCode(category: ErrorCategory): string {
  return CATEGORY_CODES[category];
}

export class AppError extends Error {
  readonly code: string;
  readonly category: ErrorCategory;
  readonly safeMessage: string;

  constructor(category: ErrorCategory, opts?: { code?: string; safeMessage?: string; cause?: unknown }) {
    super(opts?.safeMessage ?? CATEGORY_MESSAGES[category]);
    this.category = category;
    this.code = opts?.code ?? CATEGORY_CODES[category];
    this.safeMessage = opts?.safeMessage ?? CATEGORY_MESSAGES[category];
    if (opts?.cause) this.cause = opts.cause;
  }
}

export function safeSerializeError(error: unknown): { message: string; name: string; stack?: string } {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message.slice(0, 500),
      ...(process.env.NODE_ENV !== "production" ? { stack: error.stack?.slice(0, 1000) } : {}),
    };
  }
  return { name: "UnknownError", message: String(error).slice(0, 500) };
}
