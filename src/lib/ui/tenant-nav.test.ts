import { describe, expect, it } from "vitest";
import type { TenantRole } from "@/generated/prisma";
import { getTenantNavGroups } from "@/lib/ui/tenant-nav";

const labels = (role: TenantRole) =>
  getTenantNavGroups("acme", role).flatMap((group) => group.items.map((item) => item.label));

describe("getTenantNavGroups (ADR-038)", () => {
  it("el propietario y operaciones ven los catálogos, Nuevo viaje y Conductores", () => {
    for (const role of ["TENANT_OWNER", "OPERATIONS_MANAGER"] as const) {
      expect(labels(role), role).toEqual(
        expect.arrayContaining(["Nuevo viaje", "Clientes", "Flota", "Lugares", "Tipos de servicio", "Conductores"]),
      );
    }
  });

  it("el administrador gestiona catálogos pero no crea viajes (igual que hoy no asigna ni convierte)", () => {
    const admin = labels("TENANT_ADMIN");
    expect(admin).toContain("Clientes");
    expect(admin).not.toContain("Nuevo viaje");
  });

  it("el despachador crea viajes y ve los catálogos, sin Conductores", () => {
    const dispatcher = labels("DISPATCHER");
    expect(dispatcher).toContain("Nuevo viaje");
    expect(dispatcher).toContain("Clientes");
    expect(dispatcher).not.toContain("Conductores");
  });

  it("el conductor no ve ninguno de los ítems nuevos", () => {
    const driver = labels("DRIVER");
    for (const label of ["Nuevo viaje", "Clientes", "Flota", "Lugares", "Tipos de servicio", "Conductores"]) {
      expect(driver).not.toContain(label);
    }
  });

  it("solo el menú existente contiene «portal cliente» (los E2E exigen un único enlace)", () => {
    const matches = labels("TENANT_OWNER").filter((label) => label.toLowerCase().includes("portal cliente"));
    expect(matches).toEqual(["Portal cliente"]);
  });

  it("«Viajes activos» es exacto para que /trips/new no marque dos ítems", () => {
    const trips = getTenantNavGroups("acme", "TENANT_OWNER").flatMap((group) => group.items).find((item) => item.label === "Viajes activos");
    expect(trips && "exact" in trips ? trips.exact : false).toBe(true);
  });
});
