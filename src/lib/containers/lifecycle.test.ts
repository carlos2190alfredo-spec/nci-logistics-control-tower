import { describe, expect, it } from "vitest";
import {
  CONTAINER_SEQUENCE,
  canTransitionContainer,
  dateStampForStatus,
  nextContainerStatuses,
} from "./lifecycle";

describe("container lifecycle", () => {
  it("desde SOLICITUD_RECIBIDA avanza al siguiente + CANCELADO", () => {
    expect(nextContainerStatuses("SOLICITUD_RECIBIDA")).toEqual([
      "VALIDACION_COMERCIAL",
      "CANCELADO",
    ]);
  });

  it("permite la transición al siguiente estado", () => {
    expect(canTransitionContainer("GATE_IN", "RETIRADO")).toBe(true);
    expect(canTransitionContainer("GATE_IN", "CANCELADO")).toBe(true);
  });

  it("rechaza saltos fuera de secuencia", () => {
    expect(canTransitionContainer("SOLICITUD_RECIBIDA", "GATE_OUT")).toBe(false);
    expect(canTransitionContainer("LIBERADO", "SOLICITUD_RECIBIDA")).toBe(false);
  });

  it("estados terminales no permiten avanzar", () => {
    expect(nextContainerStatuses("EXPEDIENTE_CERRADO")).toEqual([]);
    expect(nextContainerStatuses("CANCELADO")).toEqual([]);
    expect(canTransitionContainer("CANCELADO", "SOLICITUD_RECIBIDA")).toBe(false);
  });

  it("el penúltimo estado solo avanza a EXPEDIENTE_CERRADO (+CANCELADO)", () => {
    expect(nextContainerStatuses("CARGOS_CONCILIADOS")).toEqual([
      "EXPEDIENTE_CERRADO",
      "CANCELADO",
    ]);
  });

  it("estampa fecha en hitos de gate/vacío/EIR", () => {
    expect(dateStampForStatus("GATE_IN")).toBe("gateInAt");
    expect(dateStampForStatus("GATE_OUT")).toBe("gateOutAt");
    expect(dateStampForStatus("VACIO_DEVUELTO")).toBe("emptyReturnedAt");
    expect(dateStampForStatus("EIR_CONFIRMADO")).toBe("eirConfirmedAt");
  });

  it("no estampa fecha en estados sin hito", () => {
    expect(dateStampForStatus("EN_TRANSITO")).toBeNull();
    expect(dateStampForStatus("SOLICITUD_RECIBIDA")).toBeNull();
  });

  it("la secuencia no contiene CANCELADO y es única", () => {
    expect(CONTAINER_SEQUENCE).not.toContain("CANCELADO");
    expect(new Set(CONTAINER_SEQUENCE).size).toBe(CONTAINER_SEQUENCE.length);
  });
});
