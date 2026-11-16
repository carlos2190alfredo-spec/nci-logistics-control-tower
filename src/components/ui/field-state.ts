/**
 * Lógica pura de los campos de formulario (sin React ni "use client"): ids de
 * ayuda y error, cadena de `aria-describedby`, resolución del mensaje de error
 * y saneo de los `fieldErrors` que llegan de una server action.
 *
 * Vive aparte de los componentes para poder probarse en Vitest (entorno node)
 * y para que `field.tsx` pueda seguir siendo un componente de servidor.
 */

/** Mensajes de error por campo: la clave es el atributo `name` del control. */
export type FieldErrors = Readonly<Record<string, string>>;

/** Instancia única y congelada: comparar por referencia evita renders de más. */
export const EMPTY_FIELD_ERRORS: FieldErrors = Object.freeze({});

export function helpIdFor(controlId: string): string {
  return `${controlId}-help`;
}

export function errorIdFor(controlId: string): string {
  return `${controlId}-error`;
}

function hasOwn(target: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(target, key);
}

/**
 * Mensaje de error que corresponde a un campo.
 * - `explicit` (prop `error`) manda si se pasó, incluso vacío ("" = sin error).
 * - Si no se pasó, se lee `fieldErrors[name]` con comprobación de clave propia
 *   (un campo llamado `constructor` o `toString` no debe heredar del prototipo).
 */
export function resolveFieldError(name: string, explicit: string | undefined, fieldErrors: FieldErrors): string | undefined {
  const message = explicit !== undefined ? explicit : hasOwn(fieldErrors, name) ? fieldErrors[name] : undefined;
  return message ? message : undefined;
}

/** Une ids para `aria-describedby`; devuelve `undefined` si no hay ninguno. */
export function buildDescribedBy(ids: ReadonlyArray<string | false | null | undefined>): string | undefined {
  const joined = ids
    .filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    .map((id) => id.trim())
    .join(" ");
  return joined.length > 0 ? joined : undefined;
}

export type FieldDescription = {
  /** Mensaje de error efectivo (prop `error` o contexto del formulario). */
  error: string | undefined;
  /** true con error o con `aria-invalid` forzado por quien usa el campo. */
  invalid: boolean;
  /** Ids encadenados: primero el error (lo que hay que corregir), luego la ayuda y los ids ajenos. */
  describedBy: string | undefined;
  errorId: string;
  helpId: string;
};

/**
 * Todo lo que un control necesita para ser accesible: es la única fuente de
 * verdad de la relación campo ↔ error ↔ ayuda (las pruebas la fijan).
 */
export function describeField(input: {
  name: string;
  controlId: string;
  hasHelp: boolean;
  explicitError?: string;
  forceInvalid?: boolean;
  extraDescribedBy?: string;
  fieldErrors: FieldErrors;
}): FieldDescription {
  const error = resolveFieldError(input.name, input.explicitError, input.fieldErrors);
  const errorId = errorIdFor(input.controlId);
  const helpId = helpIdFor(input.controlId);
  return {
    error,
    invalid: error !== undefined || input.forceInvalid === true,
    describedBy: buildDescribedBy([error !== undefined && errorId, input.hasHelp && helpId, input.extraDescribedBy]),
    errorId,
    helpId,
  };
}

/**
 * Devuelve los errores sin el campo indicado. Si el campo no tenía error
 * devuelve la MISMA referencia: `setState` con el mismo valor no re-renderiza.
 */
export function removeFieldError(errors: FieldErrors, name: string): FieldErrors {
  if (!hasOwn(errors, name)) return errors;
  const next: Record<string, string> = {};
  for (const key of Object.keys(errors)) {
    if (key !== name) next[key] = errors[key];
  }
  return Object.keys(next).length === 0 ? EMPTY_FIELD_ERRORS : next;
}

/**
 * Sanea un mapa campo → texto recibido por la red: solo pares string→string y
 * sin la clave `__proto__`. Los mensajes vacíos no dicen nada y se descartan
 * (`keepEmpty` los conserva para `values`, donde "" es un valor legítimo).
 * Devuelve `undefined` si no queda ningún par.
 */
export function normalizeStringMap(input: unknown, options: { keepEmpty?: boolean } = {}): Record<string, string> | undefined {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return undefined;
  const clean: Record<string, string> = {};
  for (const key of Object.keys(input)) {
    if (key === "__proto__") continue;
    const value = (input as Record<string, unknown>)[key];
    if (typeof value === "string" && (options.keepEmpty || value.length > 0)) clean[key] = value;
  }
  return Object.keys(clean).length > 0 ? clean : undefined;
}
