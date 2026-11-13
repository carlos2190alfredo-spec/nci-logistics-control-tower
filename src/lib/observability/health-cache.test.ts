import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();
const storageSend = vi.fn();
const ping = vi.fn();

vi.mock("@/lib/server/db", () => ({ getDb: () => ({ $queryRaw: queryRaw }) }));
vi.mock("@/lib/server/storage", () => ({
  getStorageBucket: () => "bucket-de-prueba",
  getStorageClient: () => ({ send: storageSend }),
}));
vi.mock("@/lib/server/antivirus", () => ({ getAntivirusProvider: () => ({ ping }) }));
vi.mock("./logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

describe("runHealthChecksCached", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-13T09:00:00.000Z"));
    vi.stubEnv("APP_ENV", "staging");
    vi.stubEnv("ANTIVIRUS_URL", "https://gateway.example.test");
    queryRaw.mockReset().mockResolvedValue([{ now: new Date() }]);
    storageSend.mockReset().mockResolvedValue({});
    ping.mockReset().mockResolvedValue(true);
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("no vuelve a consultar Postgres, S3 ni el gateway dentro de la ventana de cache", async () => {
    const { runHealthChecksCached } = await import("./health");

    const first = await runHealthChecksCached();
    const second = await runHealthChecksCached();

    expect(first.status).toBe("HEALTHY");
    expect(second).toBe(first);
    expect(queryRaw).toHaveBeenCalledTimes(2); // postgresql + prisma, una sola vez
    expect(storageSend).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it("comparte un unico calculo entre peticiones concurrentes", async () => {
    const { runHealthChecksCached } = await import("./health");

    await Promise.all([runHealthChecksCached(), runHealthChecksCached(), runHealthChecksCached()]);

    expect(storageSend).toHaveBeenCalledTimes(1);
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it("vuelve a ejecutar los chequeos cuando vence la ventana de ~20 s", async () => {
    const { runHealthChecksCached, PUBLIC_HEALTH_CACHE_TTL_MS } = await import("./health");
    expect(PUBLIC_HEALTH_CACHE_TTL_MS).toBe(20_000);

    await runHealthChecksCached();
    vi.setSystemTime(new Date("2026-11-13T09:00:19.000Z"));
    await runHealthChecksCached();
    expect(ping).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-11-13T09:00:21.000Z"));
    await runHealthChecksCached();
    expect(ping).toHaveBeenCalledTimes(2);
  });

  it("runHealthChecks (readiness y cron) siempre ejecuta datos frescos", async () => {
    const { runHealthChecks } = await import("./health");

    await runHealthChecks();
    await runHealthChecks();

    expect(ping).toHaveBeenCalledTimes(2);
  });

  it("un fallo del gateway se reporta como UNHEALTHY sin lanzar", async () => {
    ping.mockRejectedValue(new Error("ANTIVIRUS_URL requiere ANTIVIRUS_TOKEN."));
    const { runHealthChecks } = await import("./health");

    const summary = await runHealthChecks();
    expect(summary.status).toBe("UNHEALTHY");
    expect(summary.checks.find((check) => check.name === "clamav")?.status).toBe("UNHEALTHY");
  });
});
