import { describe, expect, it } from "vitest";
import type { CustomerRole } from "@/generated/prisma";
import { priorityLabel } from "@/lib/ui/status";
import {
  ASSET_STATUSES,
  EQUIPMENT_TYPE_SUGGESTIONS,
  LOAD_STATUSES,
  PORTAL_REQUEST_SOURCE,
  PORTAL_ROLES,
  PORTAL_ROLE_OPTIONS,
  REQUEST_SOURCES,
  TRIP_PRIORITIES,
  VEHICLE_TYPE_SUGGESTIONS,
  assetStatusLabel,
  assetStatusText,
  assetStatusTone,
  assetStatusToneFor,
  isAssetStatus,
  isRequestSource,
  loadStatusLabel,
  requestSourceLabel,
  requestSourceText,
  type PortalRole,
} from "./labels";

// Comprobación en compilación: los roles del portal deben ser exactamente los del enum de Prisma.
type SameSet<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;
type _PortalRolesMatchPrisma = Assert<SameSet<PortalRole, CustomerRole>>;

describe("estados de vehículos y equipos", () => {
  it("la lista cerrada tiene los tres estados acordados", () => {
    expect([...ASSET_STATUSES]).toEqual(["AVAILABLE", "OUT_OF_SERVICE", "INACTIVE"]);
  });

  it("cada estado tiene la etiqueta en español acordada", () => {
    expect(assetStatusLabel).toEqual({
      AVAILABLE: "Disponible",
      OUT_OF_SERVICE: "Fuera de servicio",
      INACTIVE: "Inactivo",
    });
  });

  it("cada estado tiene un tono válido y el inactivo no se pinta como disponible", () => {
    const tones = ["neutral", "info", "progress", "success", "warning", "danger"];
    for (const status of ASSET_STATUSES) expect(tones).toContain(assetStatusTone[status]);
    expect(assetStatusTone.AVAILABLE).toBe("success");
    expect(assetStatusTone.OUT_OF_SERVICE).toBe("warning");
    expect(assetStatusTone.INACTIVE).toBe("neutral");
  });

  it("assetStatusText devuelve la etiqueta de los conocidos", () => {
    expect(assetStatusText("AVAILABLE")).toBe("Disponible");
    expect(assetStatusText("INACTIVE")).toBe("Inactivo");
  });

  it("assetStatusText nunca muestra un valor crudo en mayúsculas: lo vuelve legible", () => {
    expect(assetStatusText("ON_TRIP")).toBe("On trip");
    expect(assetStatusText("some-legacy value")).toBe("Some legacy value");
    expect(assetStatusText("")).toBe("Sin estado");
    expect(assetStatusText(undefined as unknown as string)).toBe("Sin estado");
  });

  it("assetStatusToneFor usa el tono neutro para estados desconocidos", () => {
    expect(assetStatusToneFor("AVAILABLE")).toBe("success");
    expect(assetStatusToneFor("ON_TRIP")).toBe("neutral");
  });

  it("para mostrar, un estado conocido escrito con otras mayúsculas o espacios se reconoce igual", () => {
    expect(assetStatusText("available")).toBe("Disponible");
    expect(assetStatusText("  Out_Of_Service ")).toBe("Fuera de servicio");
    expect(assetStatusText("inactive")).toBe("Inactivo");
    expect(assetStatusToneFor("available")).toBe("success");
    expect(assetStatusToneFor(" out_of_service")).toBe("warning");
    // Para escribir sigue siendo estricto: un valor así nunca debe guardarse.
    expect(isAssetStatus("available")).toBe(false);
    expect(isAssetStatus(" AVAILABLE")).toBe(false);
  });

  it("los estados que no son de la lista (ni parecidos) nunca se confunden con uno conocido", () => {
    expect(assetStatusText("AVAILABLE_SOON")).toBe("Available soon");
    expect(assetStatusText("NOT_AVAILABLE")).toBe("Not available");
    expect(assetStatusToneFor("NOT_AVAILABLE")).toBe("neutral");
    expect(assetStatusText(5 as unknown as string)).toBe("5");
    expect(assetStatusToneFor(null as unknown as string)).toBe("neutral");
  });

  it("isAssetStatus solo acepta los valores exactos", () => {
    expect(isAssetStatus("AVAILABLE")).toBe(true);
    expect(isAssetStatus("available")).toBe(false);
    expect(isAssetStatus(null)).toBe(false);
  });
});

describe("sugerencias de tipo", () => {
  it("coinciden con la lista acordada, con tildes", () => {
    expect([...VEHICLE_TYPE_SUGGESTIONS]).toEqual([
      "Tracto camión",
      "Camión rígido",
      "Cabezal",
      "Camión cisterna",
      "Pickup",
      "Furgoneta",
    ]);
    expect([...EQUIPMENT_TYPE_SUGGESTIONS]).toEqual([
      "Chasis portacontenedor 20'",
      "Chasis portacontenedor 40'",
      "Chasis extensible",
      "Plataforma",
      "Cama baja",
      "Furgón / remolque cerrado",
      "Tanque / cisterna",
    ]);
  });

  it("no tienen repetidos", () => {
    expect(new Set(VEHICLE_TYPE_SUGGESTIONS).size).toBe(VEHICLE_TYPE_SUGGESTIONS.length);
    expect(new Set(EQUIPMENT_TYPE_SUGGESTIONS).size).toBe(EQUIPMENT_TYPE_SUGGESTIONS.length);
  });
});

describe("origen de la solicitud", () => {
  it("los canales y sus etiquetas son los acordados", () => {
    expect([...REQUEST_SOURCES]).toEqual(["OPERATIONS", "PHONE", "WHATSAPP", "EMAIL", "WALK_IN"]);
    expect(requestSourceLabel).toEqual({
      OPERATIONS: "Registrado por operaciones",
      PHONE: "Teléfono",
      WHATSAPP: "WhatsApp",
      EMAIL: "Correo",
      WALK_IN: "Presencial",
    });
  });

  it("isRequestSource acepta los cinco canales y rechaza PORTAL, minúsculas y no-cadenas", () => {
    for (const source of REQUEST_SOURCES) expect(isRequestSource(source)).toBe(true);
    expect(isRequestSource(PORTAL_REQUEST_SOURCE)).toBe(false); // PORTAL lo fija el portal, no operaciones
    expect(isRequestSource("phone")).toBe(false);
    expect(isRequestSource("")).toBe(false);
    expect(isRequestSource(undefined)).toBe(false);
    expect(isRequestSource(["PHONE"])).toBe(false);
  });

  it("requestSourceText cubre PORTAL y los valores desconocidos sin exponer texto crudo", () => {
    expect(requestSourceText("PHONE")).toBe("Teléfono");
    expect(requestSourceText("PORTAL")).toBe("Portal de clientes");
    expect(requestSourceText("SMOKE_SIGNAL")).toBe("Smoke signal");
    expect(requestSourceText("")).toBe("Sin origen");
  });
});

describe("usuarios del portal", () => {
  it("las opciones son las acordadas, con el valor del enum y la etiqueta en español", () => {
    expect(PORTAL_ROLE_OPTIONS).toEqual([
      { value: "CUSTOMER_ADMIN", label: "Administrador (puede solicitar servicios)" },
      { value: "CUSTOMER_VIEWER", label: "Solo consulta" },
    ]);
    expect(PORTAL_ROLE_OPTIONS.map((option) => option.value)).toEqual([...PORTAL_ROLES]);
  });
});

describe("datos del viaje", () => {
  it("las prioridades coinciden con las etiquetas que ya existen en la interfaz", () => {
    expect([...TRIP_PRIORITIES].sort()).toEqual(Object.keys(priorityLabel).sort());
  });

  it("el estado de carga usa los valores del formulario del portal", () => {
    expect([...LOAD_STATUSES]).toEqual(["LOADED", "EMPTY"]);
    expect(loadStatusLabel).toEqual({ LOADED: "Cargado", EMPTY: "Vacío" });
  });
});
