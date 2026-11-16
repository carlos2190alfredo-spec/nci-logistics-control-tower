/**
 * Lista de arranque ("Primeros pasos") del Resumen (ADR-038). Funcion pura: recibe conteos y permisos y
 * devuelve los pasos; no lee la base ni importa nada del servidor.
 */
export type StartupCounts = {
  /** Tipos de servicio activos. */
  serviceTypes: number;
  /** De ellos, los que requieren chasis o remolque. */
  serviceTypesRequiringEquipment: number;
  customers: number;
  vehicles: number;
  equipment: number;
  drivers: number;
  trips: number;
};

export type StartupPermissions = {
  canManageCatalogs: boolean;
  canManageDrivers: boolean;
  canCreateTrips: boolean;
};

export type StartupStepKey = "service-types" | "customers" | "vehicles" | "equipment" | "drivers" | "first-trip";

export type StartupStep = {
  key: StartupStepKey;
  label: string;
  description: string;
  /** null cuando el rol no puede hacer el paso: se muestra sin enlace. */
  href: string | null;
  done: boolean;
};

const NOT_ALLOWED = "Lo registra el propietario o el administrador.";

export function buildStartupSteps(counts: StartupCounts, permissions: StartupPermissions, base: string): StartupStep[] {
  // Solo quien administra los catalogos ve la lista: es quien puede completarla.
  if (!permissions.canManageCatalogs) return [];

  const steps: StartupStep[] = [];
  if (counts.serviceTypes === 0) {
    steps.push({
      key: "service-types",
      label: "Elija sus tipos de servicio",
      description: "Agregue los sugeridos (contenedor, combustible, carga general…) y ajuste los que use.",
      href: `${base}/services`,
      done: false,
    });
  }
  steps.push(
    {
      key: "customers",
      label: "Registre su primer cliente",
      description: "Los viajes se crean para un cliente.",
      href: `${base}/customers`,
      done: counts.customers >= 1,
    },
    {
      key: "vehicles",
      label: "Registre un vehículo",
      description: "El tracto o camión con el que presta el servicio.",
      href: `${base}/fleet?vista=vehiculos`,
      done: counts.vehicles >= 1,
    },
  );
  if (counts.serviceTypesRequiringEquipment >= 1) {
    steps.push({
      key: "equipment",
      label: "Registre un chasis o remolque",
      description: "Los servicios con contenedor, combustible o carga especial lo necesitan para poder asignarse.",
      href: `${base}/fleet?vista=equipos`,
      done: counts.equipment >= 1,
    });
  }
  steps.push(
    {
      key: "drivers",
      label: "Registre un conductor",
      description: "Quien realizará los viajes.",
      href: permissions.canManageDrivers ? `${base}/admin/drivers/new` : null,
      done: counts.drivers >= 1,
    },
    {
      key: "first-trip",
      label: "Cree su primer viaje",
      description: permissions.canCreateTrips
        ? "Registre un pedido y asígnele unidad y conductor."
        : "Lo crea operaciones o el propietario.",
      href: permissions.canCreateTrips ? `${base}/trips/new` : null,
      done: counts.trips >= 1,
    },
  );

  // Los pasos que el rol no puede hacer se explican en vez de quedar como enlace muerto.
  return steps.map((step) => (step.href === null && !step.done && step.key !== "first-trip" ? { ...step, description: NOT_ALLOWED } : step));
}

/** true si falta algo: la lista se oculta cuando todo esta completo. */
export function hasPendingSteps(steps: readonly StartupStep[]): boolean {
  return steps.some((step) => !step.done);
}
