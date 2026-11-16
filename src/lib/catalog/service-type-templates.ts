/**
 * Plantillas de tipo de servicio (ADR-038): constantes en código, sin tabla nueva.
 *
 * Una empresa recién creada no tiene ningún tipo de servicio y sin ellos "Nuevo viaje" no puede
 * usarse. "Cargar plantillas" instancia estas filas en `service_types` con un `upsert` por
 * `(tenantId, code)`, de modo que repetirlo no duplica nada.
 *
 * Los códigos `CONTAINER`, `FUEL` y `SPECIAL` y sus nombres deben coincidir AL CARÁCTER con
 * `prisma/seed.ts`: las pruebas E2E y `Driver.authorizations` (que guarda códigos de tipo de
 * servicio) dependen de ellos. `service-type-templates.test.ts` lo comprueba leyendo el seed.
 */

export type ServiceTypeTemplate = {
  /** Clave estable, única por empresa. Los conductores se autorizan por este código. */
  readonly code: string;
  readonly name: string;
  /** `false`: el servicio no usa chasis ni remolque y la asignación no exige equipo. */
  readonly requiresEquipment: boolean;
  /** Documentos que respaldan el servicio (mismos valores que el seed). */
  readonly requiredDocs: readonly string[];
  /** Texto de ayuda que ve la persona al elegir qué plantillas cargar. */
  readonly description: string;
};

export const SERVICE_TYPE_TEMPLATES: readonly ServiceTypeTemplate[] = [
  {
    code: "CONTAINER",
    name: "Transporte de contenedor",
    requiresEquipment: true,
    requiredDocs: ["orden", "evidencia"],
    description: "Traslado de contenedores cargados entre puertos, patios y clientes. Requiere un chasis o equipo.",
  },
  {
    code: "EMPTY_RETURN",
    name: "Retorno de contenedor vacío",
    requiresEquipment: true,
    requiredDocs: ["orden", "evidencia"],
    description: "Devolución de contenedores vacíos al patio o a la naviera. Requiere un chasis o equipo.",
  },
  {
    code: "FUEL",
    name: "Transporte de combustible",
    requiresEquipment: true,
    requiredDocs: ["orden", "evidencia"],
    description: "Transporte de combustible en camión cisterna o tanque. Requiere un equipo.",
  },
  {
    code: "GENERAL",
    name: "Carga general",
    requiresEquipment: false,
    requiredDocs: ["orden", "evidencia"],
    description: "Mercancía suelta o paletizada que viaja en un solo camión, sin chasis ni remolque. No requiere equipo.",
  },
  {
    code: "SPECIAL",
    name: "Carga terrestre o especial",
    requiresEquipment: true,
    requiredDocs: ["orden", "evidencia"],
    description: "Carga que necesita un equipo particular, como una cama baja o una plataforma. Requiere un equipo.",
  },
];

/** Forma de la fila a crear (compatible con `Prisma.ServiceTypeUncheckedCreateInput`; el módulo no importa Prisma). */
export type ServiceTypeCreateData = {
  tenantId: string;
  code: string;
  name: string;
  active: true;
  requiresEquipment: boolean;
  optionalFields: Record<string, never>;
  requiredDocs: string[];
};

/** Datos para crear la plantilla en una empresa. Devuelve copias: modificar el resultado no altera la constante. */
export function templateToCreateData(template: ServiceTypeTemplate, tenantId: string): ServiceTypeCreateData {
  return {
    tenantId,
    code: template.code,
    name: template.name,
    active: true,
    requiresEquipment: template.requiresEquipment,
    optionalFields: {},
    requiredDocs: [...template.requiredDocs],
  };
}

/**
 * Plantillas que aún no existen en la empresa (por código, sin distinguir mayúsculas), en el orden
 * oficial. Con `selectedCodes` se limita a las que la persona marcó.
 */
export function templatesToLoad(
  existingCodes: Iterable<string>,
  selectedCodes?: Iterable<string>,
): ServiceTypeTemplate[] {
  const taken = new Set<string>();
  for (const code of existingCodes) taken.add(String(code).trim().toUpperCase());
  const selected = selectedCodes ? new Set<string>([...selectedCodes].map((c) => String(c).trim().toUpperCase())) : null;
  return SERVICE_TYPE_TEMPLATES.filter(
    (template) => !taken.has(template.code) && (selected === null || selected.has(template.code)),
  );
}

export function findServiceTypeTemplate(code: string): ServiceTypeTemplate | undefined {
  const wanted = String(code).trim().toUpperCase();
  return SERVICE_TYPE_TEMPLATES.find((template) => template.code === wanted);
}
