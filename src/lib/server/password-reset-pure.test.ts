import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Verificaciones estáticas del módulo de recuperación: no persiste el token en
 * claro, siempre se guarda el hash SHA-256. Se detecta por análisis del source
 * (equivalente a un lint específico).
 */
const source = readFileSync("src/lib/server/password-reset.ts", "utf8");

describe("password-reset (static contract)", () => {
  it("nunca persiste el token en claro (solo hash)", () => {
    // No debe haber "tokenHash: token" ni "tokenHash: rawToken"
    expect(source).not.toMatch(/tokenHash:\s*token[^H]/);
    expect(source).not.toMatch(/tokenHash:\s*rawToken/);
    expect(source).toContain("hashToken(token)");
  });

  it("aplica TTL corto en minutos", () => {
    expect(source).toContain("TOKEN_TTL_MINUTES");
    const match = source.match(/const TOKEN_TTL_MINUTES = (\d+)/);
    expect(match).toBeTruthy();
    const minutes = Number(match?.[1] ?? "0");
    expect(minutes).toBeGreaterThanOrEqual(10);
    expect(minutes).toBeLessThanOrEqual(60);
  });

  it("marca el token como usado dentro de una transaccion", () => {
    expect(source).toContain("db.$transaction");
    expect(source).toContain("usedAt: now");
  });

  it("revoca todas las sesiones tras reset exitoso", () => {
    expect(source).toContain("revokeAllUserSessions(outcome.userId");
  });

  it("responde silenciosamente si el usuario no existe (sin filtracion)", () => {
    // El path del usuario inexistente NO debe hacer create ni sendMail.
    const guard = source.match(/if \(!user \|\| !user\.active\) \{[\s\S]+?return;\s*\}/);
    expect(guard).toBeTruthy();
    expect(guard?.[0]).not.toContain("sendMail");
    expect(guard?.[0]).not.toContain("passwordResetToken.create");
  });
});
