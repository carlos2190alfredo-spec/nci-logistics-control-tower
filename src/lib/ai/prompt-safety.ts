const INJECTION_PATTERNS = [
  /ignore\s+(previous|prior|all)\s+instructions/i,
  /reveal\s+(system\s+prompt|api\s+key|secret|password)/i,
  /act\s+as\s+(admin|administrator|root|superuser|platform)/i,
  /bypass\s+(tenant|security|auth|role|permission)/i,
  /delete\s+(records|data|users|database|tabla)/i,
  /change\s+(role|permission|my\s+role)/i,
  /show\s+(secrets|keys|passwords|tokens|credentials)/i,
  /ignora\s+(las\s+)?instrucciones/i,
  /revela\s+(las\s+)?claves/i,
  /mu[eé]strame\s+datos\s+de\s+otros/i,
  /cambia\s+mis?\s+permisos/i,
  /ejecuta\s+una?\s+acci[oó]n/i,
  /datos?\s+de\s+otros?\s+clientes?/i,
  /datos?\s+de\s+otros?\s+tenants?/i,
  /system\s*:\s*/i,
  /\[\s*INST\s*\]/i,
  /<\|im_start\|>/i,
  /\bDAN\b.*\bjailbreak\b/i,
];

const SECRET_PATTERNS = [
  /\b[A-Za-z0-9+/]{40,}\b/,
  /sk-[a-zA-Z0-9]{20,}/,
  /AIza[a-zA-Z0-9_-]{35}/,
  /AKIA[0-9A-Z]{16}/,
  /ghp_[A-Za-z0-9]{36}/,
  /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/,
];

const SIGNED_URL_PATTERN = /https?:\/\/[^\s]*[?&](X-Amz-Signature|Signature|sig)=[^\s&]*/gi;
const OBJECT_KEY_PATTERN = /[a-f0-9-]{36}\/[a-f0-9-]{36}\.[a-z]{3,4}/gi;
const BASE64_LARGE_PATTERN = /data:[a-z]+\/[a-z]+;base64,[A-Za-z0-9+/=]{100,}/g;
const PHONE_PATTERN = /\+?\d{1,4}[-.\s]?\(?\d{1,3}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}/g;

export function detectPromptInjection(text: string): { detected: boolean; patterns: string[] } {
  const found: string[] = [];
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      found.push(pattern.source);
    }
  }
  return { detected: found.length > 0, patterns: found };
}

export function sanitizeAiInput(text: string): string {
  let sanitized = text;
  sanitized = stripSecrets(sanitized);
  sanitized = stripSignedUrls(sanitized);
  sanitized = stripObjectKeys(sanitized);
  sanitized = stripBase64(sanitized);
  return sanitized;
}

export function stripSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(new RegExp(pattern.source, "g"), "[REDACTED]");
  }
  return result;
}

export function stripSignedUrls(text: string): string {
  return text.replace(SIGNED_URL_PATTERN, "[SIGNED_URL_REDACTED]");
}

export function stripObjectKeys(text: string): string {
  return text.replace(OBJECT_KEY_PATTERN, "[OBJECT_KEY]");
}

export function stripBase64(text: string): string {
  return text.replace(BASE64_LARGE_PATTERN, "[BASE64_REDACTED]");
}

export function stripPhones(text: string): string {
  return text.replace(PHONE_PATTERN, "[PHONE]");
}

export function markUntrustedContent(text: string): string {
  return `[CONTENIDO_USUARIO: ${text}]`;
}

export function enforceTenantContext(tenantId: string, contextTenantId: string): void {
  if (tenantId !== contextTenantId) {
    throw new Error("AI_TENANT_CONTEXT_VIOLATION");
  }
}

export function limitContextSize(text: string, maxChars = 8000): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n[CONTEXTO TRUNCADO]";
}

export function sanitizeModelOutput(output: string): string {
  let sanitized = output;
  for (const pattern of SECRET_PATTERNS) {
    sanitized = sanitized.replace(new RegExp(pattern.source, "g"), "[REDACTED]");
  }
  sanitized = sanitized.replace(SIGNED_URL_PATTERN, "[URL_REDACTED]");
  sanitized = sanitized.replace(BASE64_LARGE_PATTERN, "[DATA_REDACTED]");
  return sanitized;
}
