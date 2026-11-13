import { beforeEach, describe, expect, it, vi } from "vitest";

const db = {
  tenant: { findUnique: vi.fn() },
  tenantMembership: { findFirst: vi.fn() },
  customerMembership: { findFirst: vi.fn() },
  userMfaSecret: { findUnique: vi.fn() },
  session: { findUnique: vi.fn(), update: vi.fn() },
};

vi.mock("@/lib/server/db", () => ({ getDb: () => db }));
vi.mock("@/lib/server/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/server/crypto", () => ({
  createOpaqueToken: vi.fn(),
  hashToken: (token: string) => `hash:${token}`,
  keyedHash: vi.fn(),
  verifyPassword: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "token" }), set: vi.fn(), delete: vi.fn() }),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { getApiSessionUser, requireTenantPermission, resolveTenantAccess } from "./auth";

const TENANT = { id: "tenant-1", slug: "acme", status: "ACTIVE" };

function mockSession(authLevel: "MFA_VERIFIED" | "PASSWORD_ONLY" | "PARTIAL_MFA_PENDING", userId = "user-1") {
  db.session.findUnique.mockResolvedValue({
    id: "session-1",
    authLevel,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    lastSeenAt: new Date(),
    user: { id: userId, active: true, name: "Ana" },
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  db.tenant.findUnique.mockResolvedValue(TENANT);
  db.customerMembership.findFirst.mockResolvedValue(null);
  db.userMfaSecret.findUnique.mockResolvedValue({ verified: true });
});

describe("resolveTenantAccess", () => {
  it("niega un tenant suspendido, archivado o cancelado aunque la membresia exista", async () => {
    for (const status of ["SUSPENDED", "ARCHIVED", "CANCELLED"]) {
      db.tenant.findUnique.mockResolvedValue({ ...TENANT, status });
      db.tenantMembership.findFirst.mockResolvedValue({ role: "TENANT_OWNER" });
      expect(await resolveTenantAccess("user-1", "acme"), status).toMatchObject({ ok: false, reason: "TENANT_INACTIVE" });
    }
    db.tenant.findUnique.mockResolvedValue(null);
    expect(await resolveTenantAccess("user-1", "acme")).toMatchObject({ ok: false, reason: "TENANT_INACTIVE" });
  });

  it("niega a propietario y administrador sin MFA verificado, pero no a otros roles", async () => {
    db.userMfaSecret.findUnique.mockResolvedValue(null);
    for (const role of ["TENANT_OWNER", "TENANT_ADMIN"]) {
      db.tenantMembership.findFirst.mockResolvedValue({ role });
      expect(await resolveTenantAccess("user-1", "acme"), role).toMatchObject({ ok: false, reason: "MFA_REQUIRED" });
    }
    db.tenantMembership.findFirst.mockResolvedValue({ role: "DISPATCHER" });
    expect(await resolveTenantAccess("user-1", "acme")).toMatchObject({ ok: true });
  });

  it("acepta a un propietario con MFA verificado y devuelve tenant y membresia del servidor", async () => {
    db.tenantMembership.findFirst.mockResolvedValue({ id: "m-1", role: "TENANT_OWNER" });
    const access = await resolveTenantAccess("user-1", "acme");
    expect(access).toMatchObject({ ok: true, tenant: { id: "tenant-1" }, membership: { role: "TENANT_OWNER" } });
    expect(db.tenantMembership.findFirst).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", userId: "user-1", active: true },
    });
  });

  it("distingue al cliente del portal (sin membresia de tenant) de un extrano", async () => {
    db.tenantMembership.findFirst.mockResolvedValue(null);
    db.customerMembership.findFirst.mockResolvedValue({ id: "c-1" });
    expect(await resolveTenantAccess("user-1", "acme")).toMatchObject({ ok: false, reason: "CUSTOMER_ONLY" });
    db.customerMembership.findFirst.mockResolvedValue(null);
    expect(await resolveTenantAccess("user-1", "acme")).toMatchObject({ ok: false, reason: "NO_MEMBERSHIP" });
  });

  it("aplica la lista de roles permitidos", async () => {
    db.tenantMembership.findFirst.mockResolvedValue({ role: "DRIVER" });
    expect(await resolveTenantAccess("user-1", "acme", ["DISPATCHER"])).toMatchObject({
      ok: false,
      reason: "ROLE_DENIED",
      role: "DRIVER",
    });
  });
});

describe("requireTenantPermission(tenant.view) (AT-03)", () => {
  it("redirige al conductor a su app en lugar de mostrar el centro de control", async () => {
    mockSession("PASSWORD_ONLY");
    db.tenantMembership.findFirst.mockResolvedValue({ role: "DRIVER" });
    await expect(requireTenantPermission("acme", "tenant.view")).rejects.toThrow("REDIRECT:/t/acme/driver");
  });

  it("redirige al cliente del portal a su portal", async () => {
    mockSession("PASSWORD_ONLY");
    db.tenantMembership.findFirst.mockResolvedValue(null);
    db.customerMembership.findFirst.mockResolvedValue({ id: "c-1" });
    await expect(requireTenantPermission("acme", "tenant.view")).rejects.toThrow("REDIRECT:/t/acme/portal");
  });

  it("envia a un administrador sin MFA a configurarlo", async () => {
    mockSession("PASSWORD_ONLY");
    db.tenantMembership.findFirst.mockResolvedValue({ role: "TENANT_ADMIN" });
    db.userMfaSecret.findUnique.mockResolvedValue(null);
    await expect(requireTenantPermission("acme", "tenant.view")).rejects.toThrow(
      "REDIRECT:/account/security/mfa/setup",
    );
  });

  it("deja pasar a los roles con tenant.view", async () => {
    mockSession("PASSWORD_ONLY");
    for (const role of ["OPERATIONS_MANAGER", "DISPATCHER", "SAFETY_MANAGER"]) {
      db.tenantMembership.findFirst.mockResolvedValue({ role });
      const context = await requireTenantPermission("acme", "tenant.view");
      expect(context.membership.role).toBe(role);
      expect(context.tenant.id).toBe("tenant-1");
    }
  });
});

describe("getApiSessionUser", () => {
  it("devuelve null sin sesion o con MFA pendiente, y el usuario con sesion completa", async () => {
    db.session.findUnique.mockResolvedValue(null);
    expect(await getApiSessionUser()).toBeNull();
    mockSession("PARTIAL_MFA_PENDING");
    expect(await getApiSessionUser()).toBeNull();
    mockSession("MFA_VERIFIED");
    expect(await getApiSessionUser()).toMatchObject({ id: "user-1" });
  });
});
