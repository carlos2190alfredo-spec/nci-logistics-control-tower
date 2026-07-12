import { randomUUID } from "node:crypto";

const REQUEST_ID_MAX_LENGTH = 64;
const REQUEST_ID_PATTERN = /^[a-zA-Z0-9\-_.]{1,64}$/;

export function sanitizeRequestId(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim().slice(0, REQUEST_ID_MAX_LENGTH);
  return REQUEST_ID_PATTERN.test(trimmed) ? trimmed : null;
}

export function getRequestId(incomingHeader?: string | null): string {
  return sanitizeRequestId(incomingHeader) ?? randomUUID();
}

export type RequestContext = {
  requestId: string;
  method: string;
  route: string;
  clientIp: string;
  userAgent: string;
  tenantId?: string;
  userId?: string;
  role?: string;
  startedAt: number;
};

export function createRequestContext(opts: {
  incomingRequestId?: string | null;
  method?: string;
  route?: string;
  clientIp?: string;
  userAgent?: string;
}): RequestContext {
  return {
    requestId: getRequestId(opts.incomingRequestId),
    method: opts.method ?? "UNKNOWN",
    route: opts.route ?? "UNKNOWN",
    clientIp: safeClientIp(opts.clientIp),
    userAgent: safeUserAgent(opts.userAgent),
    startedAt: Date.now(),
  };
}

export function safeClientIp(raw?: string | null): string {
  if (!raw) return "unknown";
  const first = raw.split(",")[0]?.trim() ?? "unknown";
  return first.slice(0, 45);
}

export function safeUserAgent(raw?: string | null): string {
  if (!raw) return "unknown";
  return raw.slice(0, 200);
}

export function safeHeadersSummary(headers: Record<string, string | string[] | undefined>): Record<string, string> {
  const SAFE_HEADERS = [
    "content-type",
    "content-length",
    "accept",
    "accept-language",
    "origin",
    "host",
    "referer",
    "x-request-id",
  ];
  const result: Record<string, string> = {};
  for (const key of SAFE_HEADERS) {
    const value = headers[key];
    if (value) {
      result[key] = (Array.isArray(value) ? value[0] : value).slice(0, 200);
    }
  }
  return result;
}
