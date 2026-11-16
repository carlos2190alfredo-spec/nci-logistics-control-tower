/**
 * Etiquetas, valores permitidos y sugerencias de los catálogos (módulo puro).
 *
 * Los valores internos (`AVAILABLE`, `WALK_IN`…) nunca se muestran crudos: cada uno tiene una
 * etiqueta en español. Los textos nuevos llevan ortografía completa y tratamiento de "usted"
 * (R3 §5.5). Los esquemas de `schemas.ts` toman de aquí los valores permitidos para que la
 * interfaz y la validación del servidor no puedan discrepar.
 */

import type { StatusTone } from "@/lib/ui/status";

// ---------------------------------------------------------------------------
// Estado de vehículos y equipos
// ---------------------------------------------------------------------------

/**
 * `Vehicle.status` y `Equipment.status` son `String` libres en la base de datos (sin enum): esta es la
 * lista cerrada que la aplicación escribe. `INACTIVE` es el "borrado lógico": las guardas de
 * asignación ya exigen `AVAILABLE`, así que un activo inactivo nunca se asigna.
 */
export const ASSET_STATUSES = ["AVAILABLE", "OUT_OF_SERVICE", "INACTIVE"] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const assetStatusLabel: Record<AssetStatus, string> = {
  AVAILABLE: "Disponible",
  OUT_OF_SERVICE: "Fuera de servicio",
  INACTIVE: "Inactivo",
};

export const assetStatusTone: Record<AssetStatus, StatusTone> = {
  AVAILABLE: "success",
  OUT_OF_SERVICE: "warning",
  INACTIVE: "neutral",
};

export function isAssetStatus(value: unknown): value is AssetStatus {
  return typeof value === "string" && (ASSET_STATUSES as readonly string[]).includes(value);
}

/**
 * Convierte un valor crudo en texto legible: `ON_TRIP` → "On trip". Es la red de seguridad para los
 * estados que escribió código antiguo o un script y que este módulo no conoce.
 */
function humanizeToken(value: string): string {
  const words = value.trim().replace(/[_\-\s]+/g, " ").toLowerCase();
  return words === "" ? "" : words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Para MOSTRAR un estado guardado: tolera mayúsculas/minúsculas y espacios (`"available "` → AVAILABLE).
 * Para VALIDAR lo que se escribe use `isAssetStatus`, que es estricto.
 */
function knownAssetStatus(status: unknown): AssetStatus | null {
  if (typeof status !== "string") return null;
  const canonical = status.trim().toUpperCase();
  return isAssetStatus(canonical) ? canonical : null;
}

/** Etiqueta de cualquier estado guardado: la conocida, o el valor crudo legible si es desconocido. */
export function assetStatusText(status: string): string {
  const known = knownAssetStatus(status);
  if (known) return assetStatusLabel[known];
  return humanizeToken(String(status ?? "")) || "Sin estado";
}

/** Tono de cualquier estado guardado; los desconocidos se muestran en neutro. */
export function assetStatusToneFor(status: string): StatusTone {
  const known = knownAssetStatus(status);
  return known ? assetStatusTone[known] : "neutral";
}

// ---------------------------------------------------------------------------
// Tipos de vehículo y equipo (sugerencias, no una lista cerrada)
// ---------------------------------------------------------------------------

/** El tipo es texto libre (cada empresa tiene su taxonomía): estas son solo sugerencias para el formulario. */
export const VEHICLE_TYPE_SUGGESTIONS = [
  "Tracto camión",
  "Camión rígido",
  "Cabezal",
  "Camión cisterna",
  "Pickup",
  "Furgoneta",
] as const;

export const EQUIPMENT_TYPE_SUGGESTIONS = [
  "Chasis portacontenedor 20'",
  "Chasis portacontenedor 40'",
  "Chasis extensible",
  "Plataforma",
  "Cama baja",
  "Furgón / remolque cerrado",
  "Tanque / cisterna",
] as const;

/** Valores por defecto cuando el tipo se deja en blanco. */
export const DEFAULT_VEHICLE_TYPE = "Vehículo";
export const DEFAULT_EQUIPMENT_TYPE = "Equipo";

// ---------------------------------------------------------------------------
// Origen de una solicitud de servicio
// ---------------------------------------------------------------------------

/** Canales que una persona de operaciones puede registrar en "Nuevo viaje". */
export const REQUEST_SOURCES = ["OPERATIONS", "PHONE", "WHATSAPP", "EMAIL", "WALK_IN"] as const;
export type RequestSource = (typeof REQUEST_SOURCES)[number];

export const requestSourceLabel: Record<RequestSource, string> = {
  OPERATIONS: "Registrado por operaciones",
  PHONE: "Teléfono",
  WHATSAPP: "WhatsApp",
  EMAIL: "Correo",
  WALK_IN: "Presencial",
};

/** `ServiceRequest.source` por defecto: la solicitud la creó el propio cliente. No es elegible desde operaciones. */
export const PORTAL_REQUEST_SOURCE = "PORTAL";

export function isRequestSource(value: unknown): value is RequestSource {
  return typeof value === "string" && (REQUEST_SOURCES as readonly string[]).includes(value);
}

/** Etiqueta de cualquier valor guardado en `ServiceRequest.source` (incluye `PORTAL` y valores antiguos). */
export function requestSourceText(source: string): string {
  if (isRequestSource(source)) return requestSourceLabel[source];
  if (source === PORTAL_REQUEST_SOURCE) return "Portal de clientes";
  return humanizeToken(String(source ?? "")) || "Sin origen";
}

// ---------------------------------------------------------------------------
// Usuarios del portal de un cliente
// ---------------------------------------------------------------------------

/** Debe coincidir con el enum `CustomerRole` de Prisma (lo verifica `labels.test.ts` en compilación). */
export const PORTAL_ROLES = ["CUSTOMER_ADMIN", "CUSTOMER_VIEWER"] as const;
export type PortalRole = (typeof PORTAL_ROLES)[number];

export const PORTAL_ROLE_OPTIONS: readonly { value: PortalRole; label: string }[] = [
  { value: "CUSTOMER_ADMIN", label: "Administrador (puede solicitar servicios)" },
  { value: "CUSTOMER_VIEWER", label: "Solo consulta" },
];

// ---------------------------------------------------------------------------
// Datos del viaje (Nuevo viaje)
// ---------------------------------------------------------------------------

/** Prioridades de un viaje. Las etiquetas ya existen en `priorityLabel` (`src/lib/ui/status.ts`). */
export const TRIP_PRIORITIES = ["NORMAL", "URGENT"] as const;
export type TripPriority = (typeof TRIP_PRIORITIES)[number];

/** Estado de carga de un contenedor, con los mismos valores que el formulario del portal. */
export const LOAD_STATUSES = ["LOADED", "EMPTY"] as const;
export type LoadStatus = (typeof LOAD_STATUSES)[number];

export const loadStatusLabel: Record<LoadStatus, string> = {
  LOADED: "Cargado",
  EMPTY: "Vacío",
};
