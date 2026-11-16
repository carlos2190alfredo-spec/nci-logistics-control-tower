import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  INVITABLE_ROLES,
  INVITATION_PASSWORD_MAX_LENGTH,
  INVITATION_PASSWORD_MIN_LENGTH,
  INVITATION_TOKEN_PATTERN,
  invitationStatus,
  isInvitableRole,
  planInvitationAcceptance,
} from "./invitation-rules";

const NOW = new Date("2026-12-01T12:00:00.000Z");
const future = new Date(NOW.getTime() + 3600_000);
const past = new Date(NOW.getTime() - 3600_000);

describe("roles invitables", () => {
  it("nunca incluyen al propietario", () => {
    expect(INVITABLE_ROLES).not.toContain("TENANT_OWNER");
    expect(isInvitableRole("TENANT_OWNER")).toBe(false);
    expect(isInvitableRole("PLATFORM_ADMIN")).toBe(false);
    expect(isInvitableRole("")).toBe(false);
  });

  it.each(["TENANT_ADMIN", "OPERATIONS_MANAGER", "DISPATCHER", "SAFETY_MANAGER", "DRIVER"])("%s es invitable", (role) => {
    expect(isInvitableRole(role)).toBe(true);
  });
});

describe("invitationStatus", () => {
  it("válida mientras no vence ni se usa", () => {
    expect(invitationStatus({ role: "DISPATCHER", expiresAt: future, usedAt: null }, NOW)).toBe("VALID");
  });

  it("vencida justo en el instante de expiración (fail closed)", () => {
    expect(invitationStatus({ role: "DISPATCHER", expiresAt: NOW, usedAt: null }, NOW)).toBe("EXPIRED");
    expect(invitationStatus({ role: "DISPATCHER", expiresAt: past, usedAt: null }, NOW)).toBe("EXPIRED");
  });

  it("usada tiene prioridad sobre vigente", () => {
    expect(invitationStatus({ role: "DISPATCHER", expiresAt: future, usedAt: past }, NOW)).toBe("USED");
  });

  it("inexistente o con un rol que una invitación nunca concede es inválida", () => {
    expect(invitationStatus(null, NOW)).toBe("INVALID");
    expect(invitationStatus({ role: "TENANT_OWNER", expiresAt: future, usedAt: null }, NOW)).toBe("INVALID");
  });
});

describe("INVITATION_TOKEN_PATTERN", () => {
  it("acepta un token opaco de 43 caracteres base64url", () => {
    expect(INVITATION_TOKEN_PATTERN.test("A".repeat(43))).toBe(true);
    expect(INVITATION_TOKEN_PATTERN.test("abc-DEF_123456789012345678901234567890123")).toBe(true);
  });

  it("rechaza vacíos, cortos, largos y con caracteres raros antes de consultar la base", () => {
    for (const bad of ["", "corto", "A".repeat(19), "A".repeat(101), `${"A".repeat(30)}%20`, `${"A".repeat(30)} x`, `${"A".repeat(30)}/..`]) {
      expect(INVITATION_TOKEN_PATTERN.test(bad), bad).toBe(false);
    }
  });
});

describe("planInvitationAcceptance", () => {
  it("sin cuenta se crea una, haya o no sesión de otra persona", () => {
    expect(planInvitationAcceptance({ account: { kind: "none" }, sessionUserId: null })).toEqual({ action: "CREATE_ACCOUNT" });
    expect(planInvitationAcceptance({ account: { kind: "none" }, sessionUserId: "otro" })).toEqual({ action: "CREATE_ACCOUNT" });
  });

  it("con cuenta activa exige sesión de ESA cuenta", () => {
    const account = { kind: "active", userId: "u1" } as const;
    expect(planInvitationAcceptance({ account, sessionUserId: null })).toEqual({ action: "NEEDS_LOGIN" });
    expect(planInvitationAcceptance({ account, sessionUserId: "u2" })).toEqual({ action: "WRONG_ACCOUNT" });
    expect(planInvitationAcceptance({ account, sessionUserId: "u1" })).toEqual({ action: "JOIN_EXISTING", userId: "u1" });
  });

  it("una cuenta inactiva nunca acepta, ni con sesión", () => {
    expect(planInvitationAcceptance({ account: { kind: "inactive" }, sessionUserId: null })).toEqual({ action: "UNAVAILABLE" });
    expect(planInvitationAcceptance({ account: { kind: "inactive" }, sessionUserId: "u1" })).toEqual({ action: "UNAVAILABLE" });
  });
});

describe("política de contraseña", () => {
  it("es la misma que la del restablecimiento (password-reset.ts)", () => {
    const source = readFileSync("src/lib/server/password-reset.ts", "utf8");
    expect(source).toContain(`RESET_MIN_PASSWORD_LENGTH = ${INVITATION_PASSWORD_MIN_LENGTH};`);
    expect(source).toContain(`RESET_MAX_PASSWORD_LENGTH = ${INVITATION_PASSWORD_MAX_LENGTH};`);
  });
});
