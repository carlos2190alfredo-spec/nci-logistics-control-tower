import { describe, expect, it } from "vitest";
import {
  HAZMAT_SEQUENCE,
  canTransitionHazmat,
  nextHazmatStatuses,
} from "./lifecycle";

describe("hazmat lifecycle", () => {
  it("desde ORDEN_RECIBIDA avanza al siguiente + CANCELADA", () => {
    expect(nextHazmatStatuses("ORDEN_RECIBIDA")).toEqual(["VALIDACION_CLIENTE", "CANCELADA"]);
  });

  it("permite avanzar en secuencia", () => {
    expect(canTransitionHazmat("APROBACION_OPERACIONAL", "PROGRAMADA")).toBe(true);
    expect(canTransitionHazmat("APROBACION_OPERACIONAL", "CANCELADA")).toBe(true);
  });

  it("rechaza saltos fuera de secuencia", () => {
    expect(canTransitionHazmat("ORDEN_RECIBIDA", "UNIDAD_DESPACHADA")).toBe(false);
    expect(canTransitionHazmat("EN_TRANSITO", "ORDEN_RECIBIDA")).toBe(false);
  });

  it("estados terminales no avanzan", () => {
    expect(nextHazmatStatuses("EXPEDIENTE_CERRADO")).toEqual([]);
    expect(nextHazmatStatuses("CANCELADA")).toEqual([]);
  });

  it("la secuencia es única y no contiene CANCELADA", () => {
    expect(HAZMAT_SEQUENCE).not.toContain("CANCELADA");
    expect(new Set(HAZMAT_SEQUENCE).size).toBe(HAZMAT_SEQUENCE.length);
  });
});
