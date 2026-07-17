import { describe, expect, it } from "vitest";
import { assembleHazmatRequirements, type EvaluatedDoc, type HazmatRequirementInput } from "./requirements";
import { evaluateHazmatReadiness } from "./readiness";

const base: HazmatRequirementInput = {
  hazardClass: "CLASE_3_LIQUIDOS_INFLAMABLES",
  driverCode: "DR-1",
  vehicleCode: "VH-1",
  tankCode: "TK-1",
  safetyDataSheetRef: "SDS-DIESEL-2026",
  authorizedRoute: "Panamá → Colón",
  authorizedSchedule: "06:00-18:00",
  contingencyPlanRef: "PC-2026",
};

const validDocs: EvaluatedDoc[] = [
  { entityType: "CONDUCTOR", entityId: "DR-1", effectiveStatus: "VIGENTE" },
  { entityType: "VEHICULO", entityId: "VH-1", effectiveStatus: "VIGENTE" },
  { entityType: "EQUIPO", entityId: "TK-1", effectiveStatus: "VIGENTE" },
];

describe("hazmat requirements assembly", () => {
  it("todos los documentos vigentes + campos => CUMPLE", () => {
    const reqs = assembleHazmatRequirements(base, validDocs);
    expect(evaluateHazmatReadiness(reqs).state).toBe("CUMPLE");
  });

  it("documento de conductor vencido => NO_CUMPLE (bloqueante)", () => {
    const docs = validDocs.map((d) =>
      d.entityType === "CONDUCTOR" ? { ...d, effectiveStatus: "VENCIDO" as const } : d,
    );
    const reqs = assembleHazmatRequirements(base, docs);
    const r = evaluateHazmatReadiness(reqs);
    expect(r.state).toBe("NO_CUMPLE");
    expect(r.blockingIssues.some((i) => i.key === "driver_docs")).toBe(true);
  });

  it("sin cisterna registrada => NO_CUMPLE", () => {
    const reqs = assembleHazmatRequirements({ ...base, tankCode: null }, validDocs);
    const r = evaluateHazmatReadiness(reqs);
    expect(r.state).toBe("NO_CUMPLE");
    expect(r.blockingIssues.some((i) => i.key === "tank_docs")).toBe(true);
  });

  it("sin hoja de seguridad => NO_CUMPLE (bloqueante)", () => {
    const reqs = assembleHazmatRequirements({ ...base, safetyDataSheetRef: "" }, validDocs);
    expect(evaluateHazmatReadiness(reqs).state).toBe("NO_CUMPLE");
  });

  it("sin plan de contingencia (no bloqueante) => CUMPLE_CON_OBSERVACIONES", () => {
    const reqs = assembleHazmatRequirements({ ...base, contingencyPlanRef: null }, validDocs);
    expect(evaluateHazmatReadiness(reqs).state).toBe("CUMPLE_CON_OBSERVACIONES");
  });

  it("matchea entityId insensible a mayúsculas/espacios", () => {
    const docs: EvaluatedDoc[] = [
      { entityType: "CONDUCTOR", entityId: " dr-1 ", effectiveStatus: "VIGENTE" },
      { entityType: "VEHICULO", entityId: "VH-1", effectiveStatus: "VIGENTE" },
      { entityType: "EQUIPO", entityId: "TK-1", effectiveStatus: "VIGENTE" },
    ];
    const reqs = assembleHazmatRequirements(base, docs);
    const driverReq = reqs.find((r) => r.key === "driver_docs");
    expect(driverReq?.valid).toBe(true);
  });
});
