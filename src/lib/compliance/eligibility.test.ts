import { describe, expect, it } from "vitest";
import { filterDocsForRefs, tripEntityRefs } from "./eligibility";
import type { ComplianceEntityType } from "@/generated/prisma";

type Doc = {
  entityType: ComplianceEntityType;
  entityId: string;
  status: "VIGENTE";
  expiresAt: null;
  alertDaysBefore: number[];
  blocksDispatch: boolean;
};

const d = (entityType: ComplianceEntityType, entityId: string): Doc => ({
  entityType,
  entityId,
  status: "VIGENTE",
  expiresAt: null,
  alertDaysBefore: [],
  blocksDispatch: false,
});

describe("compliance eligibility", () => {
  const docs = [
    d("CONDUCTOR", "DRV-001"),
    d("VEHICULO", "VH-1"),
    d("VEHICULO", "PA-1234"),
    d("CONDUCTOR", "DRV-999"),
    d("CONTENEDOR", "MSCU-1234567"),
  ];

  it("filtra por referencias exactas de tipo+id", () => {
    const r = filterDocsForRefs(docs, [{ entityType: "CONDUCTOR", entityId: "DRV-001" }]);
    expect(r).toHaveLength(1);
    expect(r[0].entityId).toBe("DRV-001");
  });

  it("matchea varias referencias", () => {
    const r = filterDocsForRefs(docs, [
      { entityType: "CONDUCTOR", entityId: "DRV-001" },
      { entityType: "VEHICULO", entityId: "VH-1" },
    ]);
    expect(r).toHaveLength(2);
  });

  it("es insensible a mayúsculas y espacios en entityId", () => {
    const r = filterDocsForRefs(docs, [{ entityType: "VEHICULO", entityId: "  pa-1234 " }]);
    expect(r).toHaveLength(1);
    expect(r[0].entityId).toBe("PA-1234");
  });

  it("no cruza tipos de entidad", () => {
    const r = filterDocsForRefs(docs, [{ entityType: "EQUIPO", entityId: "DRV-001" }]);
    expect(r).toHaveLength(0);
  });

  it("sin referencias => vacío", () => {
    expect(filterDocsForRefs(docs, [])).toHaveLength(0);
  });

  it("tripEntityRefs arma refs de conductor + vehículo (código y placa)", () => {
    const refs = tripEntityRefs({ driverCode: "DRV-001", vehicleCode: "VH-1", vehiclePlate: "PA-1234" });
    expect(refs).toEqual([
      { entityType: "CONDUCTOR", entityId: "DRV-001" },
      { entityType: "VEHICULO", entityId: "VH-1" },
      { entityType: "VEHICULO", entityId: "PA-1234" },
    ]);
  });

  it("tripEntityRefs ignora valores vacíos/nulos", () => {
    const refs = tripEntityRefs({ driverCode: null, vehicleCode: "", vehiclePlate: "PA-1234" });
    expect(refs).toEqual([{ entityType: "VEHICULO", entityId: "PA-1234" }]);
  });
});
