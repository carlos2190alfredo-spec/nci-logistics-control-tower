import { describe, expect, it } from "vitest";
import {
  MANIFEST_STAGES,
  manifestStageIndex,
  manifestStages,
} from "@/lib/ui/manifest";

describe("manifiesto de hitos del cliente", () => {
  it("tiene seis hitos en orden", () => {
    expect(MANIFEST_STAGES).toEqual([
      "Solicitud",
      "Asignación",
      "En ruta",
      "Entrega",
      "Evidencia",
      "POD",
    ]);
  });

  it("agrupa estados internos en etapas", () => {
    expect(manifestStageIndex("CONFIRMED")).toBe(0);
    expect(manifestStageIndex("DRIVER_CONFIRMED")).toBe(1);
    expect(manifestStageIndex("IN_TRANSIT")).toBe(2);
    expect(manifestStageIndex("DELIVERY_FAILED")).toBe(3);
    expect(manifestStageIndex("EVIDENCE_SUBMITTED")).toBe(4);
    expect(manifestStageIndex("EVIDENCE_APPROVED")).toBe(5);
  });

  it("marca hechos, actual y pendientes", () => {
    expect(manifestStages("IN_TRANSIT").map((s) => s.state)).toEqual([
      "done",
      "done",
      "current",
      "pending",
      "pending",
      "pending",
    ]);
  });

  it("un viaje cerrado tiene todo sellado y uno cancelado nada", () => {
    expect(manifestStages("CLOSED").every((s) => s.state === "done")).toBe(
      true,
    );
    expect(
      manifestStages("CANCELLED").every((s) => s.state === "pending"),
    ).toBe(true);
  });
});
