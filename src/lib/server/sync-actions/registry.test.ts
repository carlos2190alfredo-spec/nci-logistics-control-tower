import { describe, expect, it } from "vitest";
import { SYNC_ACTION_REGISTRY, isKnownSyncAction } from "./registry";

const VALID_TENANT_ROLES = new Set([
  "TENANT_OWNER",
  "TENANT_ADMIN",
  "OPERATIONS_MANAGER",
  "DISPATCHER",
  "SAFETY_MANAGER",
  "DRIVER",
]);

describe("sync action registry", () => {
  it("isKnownSyncAction reconoce acciones registradas", () => {
    expect(isKnownSyncAction("driver.create")).toBe(true);
    expect(isKnownSyncAction("incident.report")).toBe(true);
  });

  it("isKnownSyncAction rechaza acciones desconocidas", () => {
    expect(isKnownSyncAction("trip.delete")).toBe(false);
    expect(isKnownSyncAction("")).toBe(false);
    expect(isKnownSyncAction("__proto__")).toBe(false);
  });

  it("cada entrada tiene handler y roles permitidos válidos", () => {
    for (const [actionId, entry] of Object.entries(SYNC_ACTION_REGISTRY)) {
      expect(typeof entry.handler, `${actionId}.handler`).toBe("function");
      expect(entry.allowedRoles.length, `${actionId}.allowedRoles`).toBeGreaterThan(0);
      for (const role of entry.allowedRoles) {
        expect(VALID_TENANT_ROLES.has(role), `${actionId}: rol inválido ${role}`).toBe(true);
      }
    }
  });

  it("driver.create restringe a roles administrativos", () => {
    const entry = SYNC_ACTION_REGISTRY["driver.create"];
    expect(entry.allowedRoles).not.toContain("DRIVER");
    expect(entry.allowedRoles).not.toContain("DISPATCHER");
    expect(entry.allowedRoles).toContain("TENANT_OWNER");
  });
});
