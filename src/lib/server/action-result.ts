/**
 * Resultado tipado de una server action invocada desde un formulario con
 * `useActionState`. Toda regla de negocio que bloquee una accion debe
 * devolver `actionError(...)` con un mensaje en español para el usuario, en
 * vez de un `return` silencioso.
 *
 * Archivo SIN "use server": un modulo "use server" solo puede exportar
 * funciones async.
 */
export type ActionResult =
  | { status: "idle" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export const idleActionResult: ActionResult = { status: "idle" };

export function actionOk(message: string): ActionResult {
  return { status: "success", message };
}

export function actionError(message: string): ActionResult {
  return { status: "error", message };
}

/** Marca de conflicto de concurrencia para abortar una transaccion Prisma. */
export class StaleStateError extends Error {
  constructor(public readonly currentStatus?: string) {
    super("stale_state");
    this.name = "StaleStateError";
  }
}
