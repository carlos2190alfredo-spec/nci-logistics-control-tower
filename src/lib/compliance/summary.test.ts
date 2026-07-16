import { describe, expect, it } from "vitest";
import { summarizeCompliance, type EvaluableDocument } from "./summary";

const NOW = new Date("2026-07-16T12:00:00.000Z");
const inDays = (d: number) => new Date(NOW.getTime() + d * 24 * 60 * 60 * 1000);
const ALERTS = [30, 15, 7];

const doc = (over: Partial<EvaluableDocument>): EvaluableDocument => ({
  status: "VIGENTE",
  expiresAt: inDays(365),
  alertDaysBefore: ALERTS,
  blocksDispatch: false,
  ...over,
});

describe("summarizeCompliance", () => {
  it("todo vigente => VERDE", () => {
    const r = summarizeCompliance([doc({}), doc({})], NOW);
    expect(r.light).toBe("VERDE");
    expect(r.blockingCount).toBe(0);
  });

  it("documento bloqueante vencido => ROJO", () => {
    const r = summarizeCompliance(
      [doc({ blocksDispatch: true, expiresAt: inDays(-1) })],
      NOW,
    );
    expect(r.light).toBe("ROJO");
    expect(r.blockingCount).toBe(1);
    expect(r.documents[0].effectiveStatus).toBe("VENCIDO");
  });

  it("documento bloqueante pendiente => GRIS (info incompleta)", () => {
    const r = summarizeCompliance(
      [doc({ blocksDispatch: true, status: "PENDIENTE", expiresAt: null })],
      NOW,
    );
    expect(r.light).toBe("GRIS");
  });

  it("documento próximo a vencer (no bloqueante) => AMARILLO", () => {
    const r = summarizeCompliance([doc({ expiresAt: inDays(10) })], NOW);
    expect(r.light).toBe("AMARILLO");
    expect(r.documents[0].effectiveStatus).toBe("PROXIMO_A_VENCER");
  });

  it("rojo tiene prioridad sobre amarillo y gris", () => {
    const r = summarizeCompliance(
      [
        doc({ expiresAt: inDays(5) }), // amarillo
        doc({ blocksDispatch: true, status: "PENDIENTE", expiresAt: null }), // gris
        doc({ blocksDispatch: true, expiresAt: inDays(-2) }), // rojo
      ],
      NOW,
    );
    expect(r.light).toBe("ROJO");
  });

  it("suspendido bloqueante => ROJO aunque la fecha sea válida", () => {
    const r = summarizeCompliance(
      [doc({ blocksDispatch: true, status: "SUSPENDIDO", expiresAt: inDays(100) })],
      NOW,
    );
    expect(r.light).toBe("ROJO");
    expect(r.documents[0].effectiveStatus).toBe("SUSPENDIDO");
  });

  it("cuenta por estado efectivo", () => {
    const r = summarizeCompliance(
      [doc({}), doc({ expiresAt: inDays(10) }), doc({ expiresAt: inDays(-1) })],
      NOW,
    );
    expect(r.counts.VIGENTE).toBe(1);
    expect(r.counts.PROXIMO_A_VENCER).toBe(1);
    expect(r.counts.VENCIDO).toBe(1);
  });

  it("lista vacía => VERDE sin documentos", () => {
    const r = summarizeCompliance([], NOW);
    expect(r.light).toBe("VERDE");
    expect(r.documents).toHaveLength(0);
  });
});
