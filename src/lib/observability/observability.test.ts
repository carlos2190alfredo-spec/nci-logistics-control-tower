import { describe, expect, it } from "vitest";
import { sanitizeRequestId, safeClientIp, safeUserAgent, safeHeadersSummary, getRequestId } from "./request-context";
import { redact } from "./logger";
import { AppError, toSafeError, safeSerializeError } from "./errors";

describe("sanitizeRequestId", () => {
  it("accepts valid UUID", () => {
    expect(sanitizeRequestId("550e8400-e29b-41d4-a716-446655440000")).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("rejects empty string", () => {
    expect(sanitizeRequestId("")).toBeNull();
  });

  it("rejects null/undefined", () => {
    expect(sanitizeRequestId(null)).toBeNull();
    expect(sanitizeRequestId(undefined)).toBeNull();
  });

  it("rejects strings with special characters", () => {
    expect(sanitizeRequestId("abc<script>alert(1)</script>")).toBeNull();
  });

  it("truncates to 64 chars", () => {
    const long = "a".repeat(100);
    expect(sanitizeRequestId(long)?.length).toBe(64);
  });

  it("allows alphanumeric with hyphens, dots, underscores", () => {
    expect(sanitizeRequestId("req_123-abc.456")).toBe("req_123-abc.456");
  });
});

describe("getRequestId", () => {
  it("generates UUID when no incoming header", () => {
    const id = getRequestId();
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
  });

  it("uses sanitized incoming header", () => {
    expect(getRequestId("my-request-123")).toBe("my-request-123");
  });

  it("generates new ID for invalid incoming header", () => {
    const id = getRequestId("<script>");
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
  });
});

describe("safeClientIp", () => {
  it("returns first IP from comma-separated list", () => {
    expect(safeClientIp("1.2.3.4, 5.6.7.8")).toBe("1.2.3.4");
  });

  it("returns unknown for null", () => {
    expect(safeClientIp(null)).toBe("unknown");
  });

  it("truncates long IPs", () => {
    expect(safeClientIp("a".repeat(100)).length).toBe(45);
  });
});

describe("safeUserAgent", () => {
  it("truncates to 200 chars", () => {
    expect(safeUserAgent("x".repeat(300)).length).toBe(200);
  });

  it("returns unknown for null", () => {
    expect(safeUserAgent(null)).toBe("unknown");
  });
});

describe("safeHeadersSummary", () => {
  it("only includes safe headers", () => {
    const result = safeHeadersSummary({
      "content-type": "application/json",
      "authorization": "Bearer secret123",
      "cookie": "session=abc",
      "host": "localhost",
    });
    expect(result["content-type"]).toBe("application/json");
    expect(result["host"]).toBe("localhost");
    expect(result["authorization"]).toBeUndefined();
    expect(result["cookie"]).toBeUndefined();
  });
});

describe("logger redact", () => {
  it("redacts password fields", () => {
    const result = redact({ password: "secret123", name: "test" }) as Record<string, unknown>;
    expect(result.password).toBe("[REDACTED]");
    expect(result.name).toBe("test");
  });

  it("redacts otp field", () => {
    const result = redact({ otp: "123456" }) as Record<string, unknown>;
    expect(result.otp).toBe("[REDACTED]");
  });

  it("redacts mfa field", () => {
    const result = redact({ mfa: "secret" }) as Record<string, unknown>;
    expect(result.mfa).toBe("[REDACTED]");
  });

  it("redacts recoveryCode field", () => {
    const result = redact({ recoveryCode: "abcd-efgh" }) as Record<string, unknown>;
    expect(result.recoveryCode).toBe("[REDACTED]");
  });

  it("redacts backupEncryptionKey field", () => {
    const result = redact({ backupEncryptionKey: "deadbeef" }) as Record<string, unknown>;
    expect(result.backupEncryptionKey).toBe("[REDACTED]");
  });

  it("redacts databaseUrl field", () => {
    const result = redact({ databaseUrl: "postgresql://user:pass@host/db" }) as Record<string, unknown>;
    expect(result.databaseUrl).toBe("[REDACTED]");
  });

  it("redacts objectKey field", () => {
    const result = redact({ objectKey: "tenants/abc/docs/secret.pdf" }) as Record<string, unknown>;
    expect(result.objectKey).toBe("[REDACTED]");
  });

  it("redacts signedUrl parameters", () => {
    const url = "http://localhost:9000/bucket/key?X-Amz-Signature=abc123&X-Amz-Credential=cred";
    const result = redact(url) as string;
    expect(result).not.toContain("abc123");
    expect(result).not.toContain("=cred");
  });

  it("redacts data:image URLs", () => {
    const result = redact("data:image/png;base64,iVBORw0KGgo=") as string;
    expect(result).toBe("[REDACTED](dataurl)");
  });

  it("redacts session field", () => {
    const result = redact({ session: "token123" }) as Record<string, unknown>;
    expect(result.session).toBe("[REDACTED]");
  });

  it("redacts cookie field", () => {
    const result = redact({ cookie: "nci_lct_session=abc" }) as Record<string, unknown>;
    expect(result.cookie).toBe("[REDACTED]");
  });

  it("redacts nested objects", () => {
    const result = redact({ user: { password: "secret", name: "Alice" } }) as Record<string, Record<string, unknown>>;
    expect(result.user.password).toBe("[REDACTED]");
    expect(result.user.name).toBe("Alice");
  });

  it("truncates long strings", () => {
    const long = "x".repeat(300);
    const result = redact(long) as string;
    expect(result.length).toBeLessThanOrEqual(241);
  });

  it("limits array to 10 elements", () => {
    const arr = Array.from({ length: 20 }, (_, i) => i);
    const result = redact(arr) as number[];
    expect(result.length).toBe(10);
  });

  it("limits depth to 4", () => {
    const deep = { a: { b: { c: { d: { e: "secret" } } } } };
    const result = redact(deep) as Record<string, unknown>;
    expect(JSON.stringify(result)).toContain("[REDACTED]");
  });

  it("handles null and undefined", () => {
    expect(redact(null)).toBeNull();
    expect(redact(undefined)).toBeUndefined();
  });

  it("preserves numbers and booleans", () => {
    expect(redact(42)).toBe(42);
    expect(redact(true)).toBe(true);
  });
});

describe("AppError", () => {
  it("creates safe error with category", () => {
    const err = new AppError("auth");
    expect(err.code).toBe("AUTH_REQUIRED");
    expect(err.safeMessage).toBe("Se requiere autenticacion.");
    expect(err.category).toBe("auth");
  });

  it("allows custom code and message", () => {
    const err = new AppError("validation", { code: "CUSTOM_CODE", safeMessage: "Custom message" });
    expect(err.code).toBe("CUSTOM_CODE");
    expect(err.safeMessage).toBe("Custom message");
  });
});

describe("toSafeError", () => {
  it("converts AppError to SafeError", () => {
    const err = new AppError("not_found");
    const safe = toSafeError(err, "req-123");
    expect(safe.code).toBe("RESOURCE_NOT_FOUND");
    expect(safe.requestId).toBe("req-123");
  });

  it("converts unknown error to critical SafeError", () => {
    const safe = toSafeError(new Error("something broke"), "req-456");
    expect(safe.code).toBe("INTERNAL_ERROR");
    expect(safe.category).toBe("critical");
    expect(safe.requestId).toBe("req-456");
  });
});

describe("safeSerializeError", () => {
  it("serializes Error with truncated message", () => {
    const err = new Error("x".repeat(1000));
    const result = safeSerializeError(err);
    expect(result.name).toBe("Error");
    expect(result.message.length).toBe(500);
  });

  it("serializes non-Error values", () => {
    const result = safeSerializeError("string error");
    expect(result.name).toBe("UnknownError");
    expect(result.message).toBe("string error");
  });
});
