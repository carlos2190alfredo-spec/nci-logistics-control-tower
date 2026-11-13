import { describe, expect, it } from "vitest";
import type { HealthCheckResult } from "@/lib/observability/health";
import {
  HEALTH_ALERT_DEDUPE_KEY,
  RESCAN_MAX_AGE_MS,
  RESCAN_MIN_AGE_MS,
  buildHealthAlert,
  rescanWindow,
} from "./cron-maintenance";

function check(overrides: Partial<HealthCheckResult> & Pick<HealthCheckResult, "name">): HealthCheckResult {
  return {
    status: "HEALTHY",
    durationMs: 12,
    checkedAt: "2026-11-13T09:00:00.000Z",
    severity: "critical",
    ...overrides,
  };
}

describe("buildHealthAlert", () => {
  it("no genera alerta si todo esta saludable o solo degradado", () => {
    expect(buildHealthAlert({ status: "HEALTHY", checks: [check({ name: "postgresql" })] })).toBeNull();
    expect(
      buildHealthAlert({
        status: "DEGRADED",
        checks: [check({ name: "mailpit", status: "DEGRADED", severity: "warning" })],
      }),
    ).toBeNull();
  });

  it("genera P0 cuando cae Postgres o el storage", () => {
    const alert = buildHealthAlert({
      status: "UNHEALTHY",
      checks: [
        check({ name: "postgresql" }),
        check({
          name: "storage",
          status: "UNHEALTHY",
          message: "getaddrinfo ENOTFOUND interno.example",
          remediation: "Verificar MINIO_ENDPOINT",
        }),
      ],
    });

    expect(alert).not.toBeNull();
    expect(alert?.severity).toBe("P0");
    expect(alert?.dedupeKey).toBe(HEALTH_ALERT_DEDUPE_KEY);
    expect(alert?.source).toBe("health");
    expect(alert?.title).toContain("storage");
    expect(alert?.title).not.toContain("postgresql");
    expect(alert?.description).toContain("Verificar MINIO_ENDPOINT");
  });

  it("no filtra mensajes de error crudos en la descripcion ni en los metadatos", () => {
    const alert = buildHealthAlert({
      status: "UNHEALTHY",
      checks: [
        check({ name: "postgresql", status: "UNHEALTHY", message: "no se pudo conectar a host-secreto.internal:5432" }),
      ],
    });

    expect(JSON.stringify(alert)).not.toContain("host-secreto");
  });

  it("genera P1 cuando solo cae el antivirus", () => {
    const alert = buildHealthAlert({
      status: "UNHEALTHY",
      checks: [
        check({ name: "postgresql" }),
        check({ name: "clamav", status: "UNHEALTHY", remediation: "Verificar la app de Fly.io" }),
      ],
    });

    expect(alert?.severity).toBe("P1");
    expect(alert?.title).toBe("Servicios no saludables: clamav");
  });
});

describe("rescanWindow", () => {
  it("espera 10 minutos antes de reintentar y se rinde a los 7 dias", () => {
    const now = new Date("2026-11-13T09:00:00.000Z");
    const { olderThan, newerThan } = rescanWindow(now);

    expect(now.getTime() - olderThan.getTime()).toBe(RESCAN_MIN_AGE_MS);
    expect(now.getTime() - newerThan.getTime()).toBe(RESCAN_MAX_AGE_MS);
    expect(RESCAN_MIN_AGE_MS).toBe(10 * 60 * 1000);
    expect(RESCAN_MAX_AGE_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});
