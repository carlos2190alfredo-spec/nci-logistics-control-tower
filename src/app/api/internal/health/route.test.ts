import { beforeEach, describe, expect, it, vi } from "vitest";

const runHealthChecksCached = vi.fn();

vi.mock("@/lib/observability/health", () => ({ runHealthChecksCached }));
vi.mock("@/lib/observability/logger", () => ({ logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

const summary = (status: string) => ({
  status,
  checkedAt: "2026-11-13T09:00:00.000Z",
  uptime: 10,
  version: "1.2.3",
  commit: "abc123",
  environment: "staging",
  nodeVersion: "v24",
  checks: [{ name: "postgresql", status: "UNHEALTHY", message: "detalle interno" }],
});

describe("GET /api/internal/health", () => {
  beforeEach(() => {
    runHealthChecksCached.mockReset();
  });

  it("responde 200 con solo status y checkedAt cuando todo esta saludable", async () => {
    runHealthChecksCached.mockResolvedValue(summary("HEALTHY"));
    const { GET } = await import("./route");

    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "HEALTHY", checkedAt: "2026-11-13T09:00:00.000Z" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("responde 503 sin filtrar detalles cuando no esta saludable", async () => {
    runHealthChecksCached.mockResolvedValue(summary("UNHEALTHY"));
    const { GET } = await import("./route");

    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(Object.keys(body).sort()).toEqual(["checkedAt", "status"]);
    expect(JSON.stringify(body)).not.toContain("detalle interno");
  });

  it("responde 503 UNHEALTHY si el propio chequeo lanza", async () => {
    runHealthChecksCached.mockRejectedValue(new Error("ANTIVIRUS_URL requiere ANTIVIRUS_TOKEN."));
    const { GET } = await import("./route");

    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(503);
    expect(body.status).toBe("UNHEALTHY");
    expect(JSON.stringify(body)).not.toContain("ANTIVIRUS");
  });
});
