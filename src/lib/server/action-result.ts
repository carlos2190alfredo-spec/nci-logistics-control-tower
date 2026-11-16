/**
 * Resultado tipado de una server action invocada desde un formulario con
 * `useActionState` (`ActionForm`) o desde `ServerForm`. Toda regla de negocio
 * que bloquee una accion debe devolver `actionError(...)` con un mensaje en
 * español para el usuario, en vez de un `return` silencioso.
 *
 * El error admite dos extras opcionales (Fase 1, ADR-038):
 * - `fieldErrors`: mensaje por campo, con el atributo `name` del control como
 *   clave. `ServerForm` los publica por contexto y `Field`/`TextArea`/
 *   `SelectField` los pintan junto al control (`aria-invalid` + `aria-describedby`).
 * - `values`: eco de lo recibido para quien necesite repintarlo. `ServerForm`
 *   NO lo necesita (no resetea el formulario al fallar); `ActionForm` lo ignora.
 *   Nunca devuelva secretos (contraseñas, tokens) en `values`.
 *
 * Archivo SIN "use server": un modulo "use server" solo puede exportar
 * funciones async.
 */
export type ActionResult =
  | { status: "idle" }
  | { status: "success"; message: string }
  | {
      status: "error";
      message: string;
      fieldErrors?: Record<string, string>;
      values?: Record<string, string>;
    };

export const idleActionResult: ActionResult = { status: "idle" };

export function actionOk(message: string): ActionResult {
  return { status: "success", message };
}

/**
 * `actionError("x")` conserva su forma original `{ status, message }`: las
 * claves nuevas solo existen cuando se pasan con contenido, de modo que las
 * pruebas y los consumidores previos (`toStrictEqual`) no cambian.
 */
export function actionError(
  message: string,
  extra?: { fieldErrors?: Record<string, string>; values?: Record<string, string> },
): ActionResult {
  const result: Extract<ActionResult, { status: "error" }> = { status: "error", message };
  if (extra?.fieldErrors && Object.keys(extra.fieldErrors).length > 0) result.fieldErrors = extra.fieldErrors;
  if (extra?.values && Object.keys(extra.values).length > 0) result.values = extra.values;
  return result;
}

/**
 * Guarda de tipo para lo que llega de una server action por la red: una accion
 * que termina sin resultado (p. ej. una navegacion) o con una forma inesperada
 * no debe tratarse como `ActionResult`.
 */
export function isActionResult(value: unknown): value is ActionResult {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { status?: unknown; message?: unknown };
  if (candidate.status === "idle") return true;
  if (candidate.status === "success" || candidate.status === "error") return typeof candidate.message === "string";
  return false;
}

/** Marca de conflicto de concurrencia para abortar una transaccion Prisma. */
export class StaleStateError extends Error {
  constructor(public readonly currentStatus?: string) {
    super("stale_state");
    this.name = "StaleStateError";
  }
}
