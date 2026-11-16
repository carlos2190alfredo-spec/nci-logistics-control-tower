import { describe, expect, it } from "vitest";
import { buildStartupSteps, hasPendingSteps, type StartupCounts } from "@/lib/onboarding/startup-steps";

const empty: StartupCounts = { serviceTypes: 5, serviceTypesRequiringEquipment: 4, customers: 0, vehicles: 0, equipment: 0, drivers: 0, trips: 0 };
const full = { canManageCatalogs: true, canManageDrivers: true, canCreateTrips: true };
const keys = (steps: { key: string }[]) => steps.map((step) => step.key);

describe("buildStartupSteps", () => {
  it("un tenant vacío con tipos sembrados: cliente, vehículo, equipo, conductor y primer viaje, en ese orden", () => {
    const steps = buildStartupSteps(empty, full, "/t/acme");
    expect(keys(steps)).toEqual(["customers", "vehicles", "equipment", "drivers", "first-trip"]);
    expect(steps.every((step) => !step.done)).toBe(true);
    expect(steps[0].href).toBe("/t/acme/customers");
  });

  it("el paso de tipos de servicio solo aparece si no hay ninguno activo", () => {
    expect(keys(buildStartupSteps({ ...empty, serviceTypes: 0, serviceTypesRequiringEquipment: 0 }, full, "/t/a"))[0]).toBe("service-types");
    expect(keys(buildStartupSteps(empty, full, "/t/a"))).not.toContain("service-types");
  });

  it("el paso de equipo solo aparece si algún servicio activo lo requiere", () => {
    expect(keys(buildStartupSteps({ ...empty, serviceTypesRequiringEquipment: 0 }, full, "/t/a"))).not.toContain("equipment");
  });

  it("marca como hechos los pasos con registros y se oculta al completar todo", () => {
    const done = buildStartupSteps({ ...empty, customers: 1, vehicles: 2, equipment: 1, drivers: 3, trips: 4 }, full, "/t/a");
    expect(done.every((step) => step.done)).toBe(true);
    expect(hasPendingSteps(done)).toBe(false);
    expect(hasPendingSteps(buildStartupSteps(empty, full, "/t/a"))).toBe(true);
  });

  it("solo quienes administran catálogos ven la lista", () => {
    expect(buildStartupSteps(empty, { ...full, canManageCatalogs: false }, "/t/a")).toEqual([]);
  });

  it("sin permiso para crear viajes o conductores, el paso no tiene enlace y lo explica", () => {
    const steps = buildStartupSteps(empty, { canManageCatalogs: true, canManageDrivers: false, canCreateTrips: false }, "/t/a");
    const trip = steps.find((step) => step.key === "first-trip")!;
    const driver = steps.find((step) => step.key === "drivers")!;
    expect(trip.href).toBeNull();
    expect(trip.description).toMatch(/operaciones o el propietario/);
    expect(driver.href).toBeNull();
    expect(driver.description).toMatch(/propietario o el administrador/);
  });

  it("ningún texto contiene «portal cliente» (colisiona con el menú en los E2E)", () => {
    for (const step of buildStartupSteps(empty, full, "/t/a")) {
      expect(`${step.label} ${step.description}`.toLowerCase()).not.toContain("portal cliente");
    }
  });
});
