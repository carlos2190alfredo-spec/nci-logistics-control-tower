/**
 * `parseForm`: convierte un `FormData` en datos validados sin lanzar nunca.
 *
 * Qué hace:
 *  - Lee SOLO los campos que declara el esquema (más los alias de `opts.nested`). Los campos internos
 *    que Next añade a las acciones (`$ACTION_ID_…`, `$ACTION_KEY`…) y cualquier campo inventado por un
 *    cliente malicioso ni siquiera se miran: no hay asignación masiva por esta vía.
 *  - Vacío → `undefined` (el esquema decide si es obligatorio u opcional). Archivos → ignorados.
 *  - Casillas de verificación (campos booleanos del esquema, detectados solos, y los de `opts.booleans`):
 *    marcada (`on`, `true`, `1`, `yes`, `si`) → `true`; ausente → `false`. Así una casilla desmarcada
 *    nunca queda "sin enviar" y no puede reactivar un valor por defecto.
 *  - Campos con punto (`container.number`) se anidan; `opts.nested` permite nombres planos de formulario
 *    con destino anidado: `{ containerNumber: "container.number" }`.
 *  - Falla con `fieldErrors` por campo (clave = nombre del campo en el formulario), un `message` resumen
 *    que NOMBRA el primer campo con problema, y `values` (las cadenas enviadas) para repintar el formulario
 *    y que la persona no pierda lo que escribió.
 *
 * Ejemplo en una acción de servidor:
 *
 *   const parsed = parseForm(customerInputSchema, formData);
 *   if (!parsed.ok) return actionError(parsed.message, { fieldErrors: parsed.fieldErrors, values: parsed.values });
 *   const { name, contactEmail } = parsed.data; // ya normalizados
 */

import { z } from "zod";
import { safeParseInput } from "./schemas";
import { normalizeText } from "./normalize";

export type ParseFormOptions = {
  /** Campos (nombre de formulario o ruta con punto) que son casillas de verificación aunque el esquema no lo diga. */
  booleans?: string[];
  /**
   * Alias: nombre del campo en el formulario → ruta en el esquema. Con `{ containerNumber: "container.number" }`
   * el campo `containerNumber` del formulario alimenta `container.number`, y sus errores se devuelven bajo la
   * clave `containerNumber`.
   */
  nested?: Record<string, string>;
};

export type ParseFormFailure = {
  ok: false;
  /** Frase lista para mostrar: nombra el primer campo con problema. */
  message: string;
  /** Un mensaje por campo, indexado por el nombre del campo en el formulario. */
  fieldErrors: Record<string, string>;
  /** Cadenas enviadas, para repintar el formulario. Nunca incluye archivos. */
  values: Record<string, string>;
};

export type ParseFormResult<S extends z.ZodType> = { ok: true; data: z.output<S> } | ParseFormFailure;

/** Un campo que el formulario puede enviar. */
export type FormField = {
  /** Ruta con punto dentro del esquema (`container.number`). */
  path: string;
  /** El esquema lo declara booleano (casilla). */
  boolean: boolean;
};

const GENERIC_FAILURE = "No se pudo procesar el formulario. Revise los datos e inténtelo de nuevo.";
/** Tope de caracteres que se devuelven por valor: acota el tamaño de la respuesta ante una carga absurda. */
const MAX_ECHO_LENGTH = 2000;
const TRUE_TOKENS = new Set(["on", "true", "1", "yes", "si", "sí"]);
const FORBIDDEN_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

/** Quita envoltorios (opcional, nulo, valor por defecto, tubería) hasta llegar al tipo "de fondo". */
function unwrap(schema: z.ZodType): z.ZodType {
  let current: z.ZodType = schema;
  for (let depth = 0; depth < 20; depth += 1) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable || current instanceof z.ZodDefault) {
      current = current.unwrap() as z.ZodType;
    } else if (current instanceof z.ZodPipe) {
      current = current.in as z.ZodType;
    } else {
      break;
    }
  }
  return current;
}

function collectFields(schema: z.ZodType, prefix: string, out: FormField[]): void {
  const inner = unwrap(schema);
  if (inner instanceof z.ZodObject) {
    for (const [key, child] of Object.entries(inner.shape)) {
      collectFields(child as z.ZodType, prefix === "" ? key : `${prefix}.${key}`, out);
    }
    return;
  }
  if (prefix !== "") out.push({ path: prefix, boolean: inner instanceof z.ZodBoolean });
}

/**
 * Campos que un esquema acepta, como rutas con punto (`["name", "container.number", …]`), en el orden
 * del esquema. Atraviesa objetos anidados y envoltorios (opcional, valor por defecto, transformación).
 */
export function describeFormFields(schema: z.ZodType): FormField[] {
  const fields: FormField[] = [];
  collectFields(schema, "", fields);
  return fields;
}

function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split(".");
  if (segments.some((segment) => FORBIDDEN_SEGMENTS.has(segment))) return;
  let cursor = target;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const key = segments[index];
    const next = cursor[key];
    if (typeof next === "object" && next !== null) {
      cursor = next as Record<string, unknown>;
    } else {
      const created: Record<string, unknown> = {};
      cursor[key] = created;
      cursor = created;
    }
  }
  cursor[segments[segments.length - 1]] = value;
}

function isChecked(value: string): boolean {
  return TRUE_TOKENS.has(normalizeText(value).toLowerCase());
}

const has = (object: object, key: string): boolean => Object.prototype.hasOwnProperty.call(object, key);

function failure(message: string, fieldErrors: Record<string, string> = {}, values: Record<string, string> = {}): ParseFormFailure {
  return { ok: false, message, fieldErrors, values };
}

type FormInput = { name: string; path: string; boolean: boolean };

/**
 * Convierte `formData` en datos validados con `schema`. No lanza nunca: cualquier fallo inesperado
 * se devuelve como un error genérico en español.
 */
export function parseForm<S extends z.ZodType>(
  schema: S,
  formData: FormData,
  opts: ParseFormOptions = {},
): ParseFormResult<S> {
  try {
    const fields = describeFormFields(schema);
    const booleanNames = new Set(opts.booleans ?? []);

    const inputs: FormInput[] = fields.map((field) => ({
      name: field.path,
      path: field.path,
      boolean: field.boolean || booleanNames.has(field.path),
    }));
    // Por cada ruta, el nombre con el que se reportan sus errores (el alias, si existe).
    const reportedName = new Map<string, string>(fields.map((field) => [field.path, field.path]));
    const booleanPaths = new Map<string, boolean>(fields.map((field) => [field.path, field.boolean]));
    for (const [name, path] of Object.entries(opts.nested ?? {})) {
      inputs.push({
        name,
        path,
        boolean: (booleanPaths.get(path) ?? false) || booleanNames.has(name) || booleanNames.has(path),
      });
      reportedName.set(path, name);
    }

    const raw: Record<string, unknown> = {};
    const values: Record<string, string> = {};
    for (const input of inputs) {
      // `getAll` + filtro: los archivos (objetos `File`) no son cadenas y se descartan.
      const entries = formData.getAll(input.name).filter((entry): entry is string => typeof entry === "string");
      if (input.boolean) {
        const checked = entries.some(isChecked);
        setPath(raw, input.path, checked);
        if (checked) values[input.name] = "on";
        continue;
      }
      if (entries.length === 0) continue;
      const first = entries[0];
      values[input.name] = first.slice(0, MAX_ECHO_LENGTH);
      if (first.trim() !== "") setPath(raw, input.path, first);
    }

    const result = safeParseInput(schema, raw);
    if (result.success) return { ok: true, data: result.data as z.output<S> };

    const fieldErrors: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.map(String).join(".");
      if (path === "") continue;
      const key = reportedName.get(path) ?? path;
      if (!has(fieldErrors, key)) fieldErrors[key] = issue.message;
    }

    const firstIssue = result.error.issues[0];
    const withPath = firstIssue.path.length > 0;
    const others = Object.keys(fieldErrors).length - (withPath ? 1 : 0);
    let message = firstIssue.message;
    if (others > 0) message += others === 1 ? " Hay 1 campo más por revisar." : ` Hay ${others} campos más por revisar.`;
    return failure(message, fieldErrors, values);
  } catch {
    return failure(GENERIC_FAILURE);
  }
}
