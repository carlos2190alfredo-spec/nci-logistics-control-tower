import { describe, expect, it } from "vitest";
import { evaluateHazmatReadiness, hazmatAllowsDispatch, type HazmatRequirement } from "./readiness";

const req = (over: Partial<HazmatRequirement>): HazmatRequirement => ({
  key: "k",
  label: "Requisito",
  present: true,
  valid: true,
  blocking: true,
  ...over,
});

describe("hazmat readiness", () => {
  it("sin requisitos => NO_VERIFICADO", () => {
    expect(evaluateHazmatReadiness([]).state).toBe("NO_VERIFICADO");
  });

  it("todo presente y válido => CUMPLE", () => {
    const r = evaluateHazmatReadiness([req({ key: "ppc" }), req({ key: "sds", blocking: false })]);
    expect(r.state).toBe("CUMPLE");
    expect(r.satisfied).toHaveLength(2);
  });

  it("requisito bloqueante ausente => NO_CUMPLE", () => {
    const r = evaluateHazmatReadiness([req({ key: "ppc", present: false })]);
    expect(r.state).toBe("NO_CUMPLE");
    expect(r.blockingIssues).toHaveLength(1);
  });

  it("requisito bloqueante inválido (vencido) => NO_CUMPLE", () => {
    const r = evaluateHazmatReadiness([req({ key: "seguro", valid: false })]);
    expect(r.state).toBe("NO_CUMPLE");
  });

  it("solo problema no bloqueante => CUMPLE_CON_OBSERVACIONES", () => {
    const r = evaluateHazmatReadiness([
      req({ key: "ppc" }),
      req({ key: "contingencia", blocking: false, present: false }),
    ]);
    expect(r.state).toBe("CUMPLE_CON_OBSERVACIONES");
    expect(r.observations).toHaveLength(1);
  });

  it("bloqueante tiene prioridad sobre observación", () => {
    const r = evaluateHazmatReadiness([
      req({ key: "ppc", present: false }),
      req({ key: "contingencia", blocking: false, present: false }),
    ]);
    expect(r.state).toBe("NO_CUMPLE");
  });

  it("hazmatAllowsDispatch: CUMPLE y CUMPLE_CON_OBSERVACIONES permiten", () => {
    expect(hazmatAllowsDispatch("CUMPLE")).toBe(true);
    expect(hazmatAllowsDispatch("CUMPLE_CON_OBSERVACIONES")).toBe(true);
    expect(hazmatAllowsDispatch("NO_CUMPLE")).toBe(false);
    expect(hazmatAllowsDispatch("NO_VERIFICADO")).toBe(false);
    expect(hazmatAllowsDispatch("REQUIERE_APROBACION")).toBe(false);
  });
});
