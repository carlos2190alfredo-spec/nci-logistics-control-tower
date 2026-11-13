import { beforeEach, describe, expect, it, vi } from "vitest";

const getApiSessionUser = vi.fn();
const resolveTenantAccess = vi.fn();
const processSyncActionBatch = vi.fn();
const enforceRateLimit = vi.fn();

vi.mock("@/lib/server/auth", () => ({
  getApiSessionUser: (...args: unknown[]) => getApiSessionUser(...args),
  resolveTenantAccess: (...args: unknown[]) => resolveTenantAccess(...args),
}));
vi.mock("@/lib/server/sync-actions/processor", () => ({
  processSyncActionBatch: (...args: unknown[]) => processSyncActionBatch(...args),
}));
vi.mock("@/lib/server/rate-limit", () => ({
  enforceRateLimit: (...args: unknown[]) => enforceRateLimit(...args),
}));

import { POST } from "./route";

const USER = { id: "user-1", name: "Ana" };
const KEY_A = "11111111-1111-4111-8111-111111111111";
const KEY_B = "22222222-2222-4222-8222-222222222222";

function action(tenantSlug: string, idempotencyKey = KEY_A) {
  return {
    schemaVersion: 1,
    idempotencyKey,
    clientQueuedAt: "2026-01-01T00:00:00.000Z",
    localSequence: 0,
    tenantSlug,
    actionId: "incident.report",
    formData: { description: "x" },
  };
}

function post(actions: unknown[]) {
  return POST(
    new Request("http://localhost:3000/api/sync/actions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        host: "localhost:3000",
        origin: "http://localhost:3000",
      },
      body: JSON.stringify({ schemaVersion: 1, actions }),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getApiSessionUser.mockResolvedValue(USER);
  enforceRateLimit.mockResolvedValue({ allowed: true });
  processSyncActionBatch.mockResolvedValue([]);
});

describe("POST /api/sync/actions (AT-04)", () => {
  it("responde 401 JSON sin sesion completa, sin tocar el procesador", async () => {
    getApiSessionUser.mockResolvedValue(null);
    const response = await post([action("acme")]);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: "AUTH_REQUIRED" });
    expect(resolveTenantAccess).not.toHaveBeenCalled();
    expect(processSyncActionBatch).not.toHaveBeenCalled();
  });

  it.each([
    ["tenant suspendido o archivado", "TENANT_INACTIVE"],
    ["usuario sin membresia", "NO_MEMBERSHIP"],
    ["propietario/administrador sin MFA verificado", "MFA_REQUIRED"],
  ])("responde 403 y no procesa nada: %s", async (_label, reason) => {
    resolveTenantAccess.mockResolvedValue({ ok: false, reason, role: null });
    const response = await post([action("acme")]);
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "ACCESS_DENIED" });
    expect(resolveTenantAccess).toHaveBeenCalledWith(USER.id, "acme");
    expect(processSyncActionBatch).not.toHaveBeenCalled();
  });

  it("rechaza un lote que mezcla tenants antes de resolver acceso", async () => {
    const response = await post([action("acme", KEY_A), action("otra", KEY_B)]);
    expect(response.status).toBe(400);
    expect(resolveTenantAccess).not.toHaveBeenCalled();
    expect(processSyncActionBatch).not.toHaveBeenCalled();
  });

  it("procesa el lote con tenant y rol resueltos en servidor", async () => {
    resolveTenantAccess.mockResolvedValue({
      ok: true,
      tenant: { id: "tenant-1", slug: "acme" },
      membership: { role: "OPERATIONS_MANAGER" },
    });
    const response = await post([action("acme")]);
    expect(response.status).toBe(200);
    expect(processSyncActionBatch).toHaveBeenCalledTimes(1);
    expect(processSyncActionBatch.mock.calls[0][0]).toEqual({
      userId: USER.id,
      userName: USER.name,
      tenantId: "tenant-1",
      tenantSlug: "acme",
      role: "OPERATIONS_MANAGER",
    });
  });
});
