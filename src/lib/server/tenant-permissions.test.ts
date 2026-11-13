import { describe, expect, it } from "vitest";
import type { TenantRole } from "@/generated/prisma";
import {
  MFA_REQUIRED_TENANT_ROLES,
  evaluateTenantAccess,
  getRolesForPermission,
  hasPermission,
  tenantAccessRedirect,
  tenantHomePath,
} from "@/lib/server/tenant-permissions";

const ALL_ROLES: TenantRole[] = [
  "TENANT_OWNER",
  "TENANT_ADMIN",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "SAFETY_MANAGER",
  "DRIVER",
];

const base = { tenantActive: true, hasCustomerMembership: false, mfaVerified: true } as const;

describe("tenant home and operations view (AT-03)", () => {
  it("never gives the control center (tenant.view) to the driver", () => {
    expect(hasPermission("DRIVER", "tenant.view")).toBe(false);
    expect(getRolesForPermission("tenant.view")).not.toContain("DRIVER");
  });

  it("sends the driver to their app and everyone else with tenant.view to the control center", () => {
    expect(tenantHomePath("acme", "DRIVER")).toBe("/t/acme/driver");
    for (const role of ALL_ROLES.filter((r) => r !== "DRIVER")) {
      expect(tenantHomePath("acme", role), role).toBe("/t/acme");
    }
  });

  it("never redirects a denied role to a page it cannot open (no redirect loops)", () => {
    for (const role of ALL_ROLES) {
      const target = tenantAccessRedirect("ROLE_DENIED", "acme", role);
      if (target === "/t/acme") expect(hasPermission(role, "tenant.view"), role).toBe(true);
      if (target === "/t/acme/driver") expect(role).toBe("DRIVER");
    }
  });
});

describe("evaluateTenantAccess (AT-04)", () => {
  it("denies every role when the tenant is not ACTIVE", () => {
    for (const role of ALL_ROLES) {
      expect(evaluateTenantAccess({ ...base, tenantActive: false, role })).toEqual({
        ok: false,
        reason: "TENANT_INACTIVE",
      });
    }
  });

  it("denies users without membership and routes portal customers to the portal", () => {
    expect(evaluateTenantAccess({ ...base, role: null })).toEqual({ ok: false, reason: "NO_MEMBERSHIP" });
    expect(evaluateTenantAccess({ ...base, role: null, hasCustomerMembership: true })).toEqual({
      ok: false,
      reason: "CUSTOMER_ONLY",
    });
    expect(tenantAccessRedirect("CUSTOMER_ONLY", "acme", null)).toBe("/t/acme/portal");
    expect(tenantAccessRedirect("NO_MEMBERSHIP", "acme", null)).toBe("/login");
    expect(tenantAccessRedirect("TENANT_INACTIVE", "acme", null)).toBe("/login");
  });

  it("requires verified MFA for owner and admin, and only for them", () => {
    expect([...MFA_REQUIRED_TENANT_ROLES].sort()).toEqual(["TENANT_ADMIN", "TENANT_OWNER"]);
    for (const role of ALL_ROLES) {
      const decision = evaluateTenantAccess({ ...base, role, mfaVerified: false });
      if (MFA_REQUIRED_TENANT_ROLES.includes(role)) {
        expect(decision, role).toEqual({ ok: false, reason: "MFA_REQUIRED" });
      } else {
        expect(decision, role).toEqual({ ok: true });
      }
    }
    expect(evaluateTenantAccess({ ...base, role: "TENANT_OWNER", mfaVerified: true })).toEqual({ ok: true });
    expect(tenantAccessRedirect("MFA_REQUIRED", "acme", "TENANT_OWNER")).toBe("/account/security/mfa/setup");
  });

  it("enforces the allowed roles before the MFA check", () => {
    const allowed = getRolesForPermission("tenant.view");
    expect(evaluateTenantAccess({ ...base, role: "DRIVER", allowedRoles: allowed })).toEqual({
      ok: false,
      reason: "ROLE_DENIED",
    });
    expect(evaluateTenantAccess({ ...base, role: "DISPATCHER", allowedRoles: allowed })).toEqual({ ok: true });
    expect(
      evaluateTenantAccess({ ...base, role: "TENANT_ADMIN", allowedRoles: ["DRIVER"], mfaVerified: false }),
    ).toEqual({
      ok: false,
      reason: "ROLE_DENIED",
    });
  });

  it("accepts any tenant role when no role list is given", () => {
    for (const role of ALL_ROLES.filter((r) => !MFA_REQUIRED_TENANT_ROLES.includes(r))) {
      expect(evaluateTenantAccess({ ...base, role }), role).toEqual({ ok: true });
    }
  });
});
