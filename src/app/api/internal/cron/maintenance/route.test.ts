import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const runMaintenance = vi.fn();
const runObservedJob = vi.fn();

vi.mock("@/lib/server/cron-maintenance", () => ({ runMaintenance }));
vi.mock("@/lib/observability/job-runner", () => ({ runObservedJob }));
vi.mock("@/lib/server/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const secret = "cron-secret-de-prueba-0123456789";

const okSummary = {
  ok: true,
  failedTasks: [],
  rescan: { eligible: 2, attempted: 2, promoted: 1, rejected: 1, stillPending: 0, failed: 0, skipped: 0, abandoned: 0 },
  prune: { rateLimitBuckets: 5, offlineReceipts: 0, syncReceipts: 1 },
  health: { status: "HEALTHY", alertRaised: false, alertResolved: false },
};

function request(authorization?: string) {
  return new Request("https://example.test/api/internal/cron/maintenance", {
    headers: authorization ? { authorization } : {},
  });
}

/** Simula runObservedJob: ejecuta la funcion y traduce el resultado como el real. */
function passthroughJob() {
  runObservedJob.mockImplementation(async (_name: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      return { id: "job-1", jobName: "maintenance.daily", status: "SUCCESS", durationMs: 42 };
    } catch {
      return { id: "job-1", jobName: "maintenance.daily", status: "FAILED", durationMs: 42 };
    }
  });
}

describe("GET /api/internal/cron/maintenance", () => {
  beforeEach(() => {
    runMaintenance.mockReset();
    runObservedJob.mockReset();
    passthroughJob();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("falla cerrado con 503 si CRON_SECRET no esta configurado, aunque el encabezado sea correcto", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { GET } = await import("./route");

    const response = await GET(request(`Bearer ${secret}`));
    expect(response.status).toBe(503);
    expect(runMaintenance).not.toHaveBeenCalled();
  });

  it("falla cerrado con 503 si CRON_SECRET es demasiado corto", async () => {
    vi.stubEnv("CRON_SECRET", "corto");
    const { GET } = await import("./route");

    const response = await GET(request("Bearer corto"));
    expect(response.status).toBe(503);
    expect(runMaintenance).not.toHaveBeenCalled();
  });

  it("responde 401 sin encabezado o con secreto incorrecto y no ejecuta nada", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    const { GET } = await import("./route");

    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer incorrecto"))).status).toBe(401);
    expect((await GET(request(secret))).status).toBe(401);
    expect(runMaintenance).not.toHaveBeenCalled();
    expect(runObservedJob).not.toHaveBeenCalled();
  });

  it("ejecuta el mantenimiento con el Bearer correcto y devuelve solo conteos", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    runMaintenance.mockResolvedValue(okSummary);
    const { GET } = await import("./route");

    const response = await GET(request(`Bearer ${secret}`));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({
      ok: true,
      durationMs: 42,
      rescan: { promoted: 1, rejected: 1 },
      prune: { rateLimitBuckets: 5 },
    });
    expect(runObservedJob).toHaveBeenCalledWith("maintenance.daily", expect.any(Function), {
      triggeredBy: "vercel-cron",
    });
  });

  it("responde 500 con el resumen cuando alguna tarea fallo", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    runMaintenance.mockResolvedValue({ ...okSummary, ok: false, failedTasks: ["health"], health: null });
    const { GET } = await import("./route");

    const response = await GET(request(`Bearer ${secret}`));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.failedTasks).toEqual(["health"]);
  });

  it("responde 500 generico si falla el registro del job", async () => {
    vi.stubEnv("CRON_SECRET", secret);
    runObservedJob.mockRejectedValue(new Error("conexion a la base de datos perdida"));
    const { GET } = await import("./route");

    const response = await GET(request(`Bearer ${secret}`));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ ok: false, error: "MAINTENANCE_FAILED" });
  });
});
