/**
 * Límites constantes de los catálogos de la empresa y de la importación CSV (ADR-038).
 *
 * Módulo puro (sin I/O ni dependencias de servidor): lo usan por igual los esquemas de
 * validación, las acciones de servidor y los formularios (`maxLength`), de modo que el
 * navegador y el servidor nunca discrepen sobre cuánto cabe en un campo.
 */

/** Tamaño máximo de un archivo CSV a importar (1 MiB). Muy por debajo del cuerpo de Server Action (4 MB). */
export const MAX_IMPORT_BYTES = 1_048_576;
/** Filas de datos máximas por importación (sin contar el encabezado). */
export const MAX_IMPORT_ROWS = 1000;
/**
 * Columnas máximas de un archivo de importación. Cada fila se completa hasta el ancho del encabezado:
 * sin este tope, un encabezado de 100 000 columnas y 1000 filas ocuparía cientos de millones de celdas.
 */
export const MAX_IMPORT_COLUMNS = 100;

/** Topes fijos por empresa: estos catálogos no tienen campo de plan. */
export const MAX_EQUIPMENT_PER_TENANT = 1000;
export const MAX_LOCATIONS_PER_TENANT = 5000;
export const MAX_SERVICE_TYPES_PER_TENANT = 50;

/**
 * Tamaño de página por defecto de las listas. Debe coincidir con `parsePagination`
 * (`src/lib/pagination/parse.ts`); `limits.test.ts` lo comprueba.
 */
export const PAGE_SIZE_DEFAULT = 20;

/**
 * Opciones para `$transaction` cuando una transacción escribe muchas filas (importaciones).
 * El valor por defecto de Prisma (5 s) se queda corto con 1000 filas.
 */
export const BULK_TRANSACTION_OPTIONS = { timeout: 30_000, maxWait: 10_000 } as const;

/** Longitud máxima de un código normalizado (`normalizeCode`). */
export const CODE_MAX_LENGTH = 32;
/** Longitud máxima de un código derivado de un nombre (`slugCode`). */
export const SLUG_CODE_MAX_LENGTH = 40;

export type LengthRange = { readonly min: number; readonly max: number };

/**
 * Longitudes (en caracteres) de cada campo de texto. Fuente única para los esquemas de
 * `schemas.ts` y para los atributos `minLength`/`maxLength` de los formularios.
 * `min: 0` indica un campo opcional.
 */
export const FIELD_LIMITS = {
  customer: {
    name: { min: 2, max: 120 },
    code: { min: 1, max: CODE_MAX_LENGTH },
    taxId: { min: 0, max: 40 },
    contactName: { min: 0, max: 120 },
    contactEmail: { min: 0, max: 200 },
    contactPhone: { min: 0, max: 40 },
    address: { min: 0, max: 300 },
    internalNotes: { min: 0, max: 1000 },
  },
  vehicle: {
    plate: { min: 3, max: 15 },
    code: { min: 1, max: CODE_MAX_LENGTH },
    type: { min: 0, max: 60 },
  },
  equipment: {
    code: { min: 2, max: CODE_MAX_LENGTH },
    type: { min: 0, max: 60 },
  },
  location: {
    name: { min: 2, max: 120 },
    address: { min: 0, max: 300 },
  },
  serviceType: {
    name: { min: 2, max: 80 },
  },
  portalUser: {
    name: { min: 2, max: 100 },
    email: { min: 0, max: 200 },
  },
  trip: {
    origin: { min: 2, max: 200 },
    destination: { min: 2, max: 200 },
    contactName: { min: 0, max: 100 },
    contactPhone: { min: 0, max: 40 },
    notes: { min: 0, max: 1000 },
    container: {
      number: { min: 0, max: 20 },
      size: { min: 0, max: 20 },
      type: { min: 0, max: 40 },
      shippingLine: { min: 0, max: 80 },
      terminal: { min: 0, max: 80 },
      sealNumber: { min: 0, max: 30 },
      bookingReference: { min: 0, max: 60 },
    },
  },
} as const satisfies Record<string, Record<string, unknown>>;
