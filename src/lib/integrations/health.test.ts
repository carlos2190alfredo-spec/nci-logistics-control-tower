import { describe, expect, it } from "vitest";
import { evaluateConnectorHealth, type ConnectorHealthInput } from "./health";

const NOW = new Date("2026-07-17T12:00:00.000Z");
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000);

const base = (over: Partial<ConnectorHealthInput> = {}): ConnectorHealthInput => ({
  enabled: true,
  status: "ENABLED",
  requiredCredentials: 2,
  presentCredentials: 2,
  lastSyncAt: daysAgo(1),
  recentProcessed: 10,
  recentFailed: 0,
  now: NOW,
  ...over,
});

describe("connector health", () => {
  it("desactivado cuando no está habilitado", () => {
    const r = evaluateConnectorHealth(base({ enabled: false, status: "DISABLED" }));
    expect(r.health).toBe("DESACTIVADO");
  });

  it("requiere credenciales si faltan", () => {
    const r = evaluateConnectorHealth(base({ presentCredentials: 1 }));
    expect(r.health).toBe("REQUIERE_CREDENCIALES");
    expect(r.credentialsComplete).toBe(false);
    expect(r.recommendedAction).toContain("1 de 2");
  });

  it("activo cuando todo está en orden", () => {
    const r = evaluateConnectorHealth(base());
    expect(r.health).toBe("ACTIVO");
    expect(r.daysSinceSync).toBe(1);
  });

  it("error cuando el estado es ERROR", () => {
    const r = evaluateConnectorHealth(base({ status: "ERROR" }));
    expect(r.health).toBe("ERROR");
  });

  it("error cuando los fallos dominan", () => {
    const r = evaluateConnectorHealth(base({ recentProcessed: 2, recentFailed: 5 }));
    expect(r.health).toBe("ERROR");
  });

  it("degradado con algunos fallos", () => {
    const r = evaluateConnectorHealth(base({ recentProcessed: 10, recentFailed: 2 }));
    expect(r.health).toBe("DEGRADADO");
  });

  it("activo pero advierte si no sincroniza hace días", () => {
    const r = evaluateConnectorHealth(base({ lastSyncAt: daysAgo(10) }));
    expect(r.health).toBe("ACTIVO");
    expect(r.recommendedAction).toContain("días");
  });

  it("sin credenciales requeridas se considera completo", () => {
    const r = evaluateConnectorHealth(base({ requiredCredentials: 0, presentCredentials: 0 }));
    expect(r.credentialsComplete).toBe(true);
  });
});
