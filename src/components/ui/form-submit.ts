/**
 * Lógica pura del envío de `ServerForm` (sin React): ejecuta la server action,
 * normaliza lo que vuelve por la red y decide qué errores se muestran y cuáles
 * deben seguir su camino hacia Next.js.
 *
 * Contrato con el framework (verificado en `server-action-reducer` de Next 16):
 * - `redirect()` dentro de una server action invocada de forma programática
 *   RECHAZA la promesa con un error cuyo `digest` empieza por `NEXT_REDIRECT`.
 *   Ese error no es un fallo: lo recoge el `RedirectBoundary` del router.
 *   `runFormAction` lo vuelve a lanzar tal cual (déjalo propagar).
 * - `notFound()`/`forbidden()`/`unauthorized()` siguen la misma ruta con un
 *   `digest` `NEXT_HTTP_ERROR_FALLBACK;<código>`.
 * - Cualquier otro error (red caída, 500, versión desplegada distinta) se
 *   convierte en un `ActionResult` de error en español: el formulario NO se
 *   pierde ni cae a `error.tsx`.
 */
import { actionError, isActionResult, type ActionResult } from "@/lib/server/action-result";
import { normalizeStringMap } from "@/components/ui/field-state";

export type FormAction = (previous: ActionResult, formData: FormData) => Promise<ActionResult>;

export const GENERIC_ACTION_ERROR_MESSAGE =
  "No se pudo completar la operación. Revise su conexión e intente de nuevo; sus datos siguen en el formulario.";

export const STALE_DEPLOYMENT_ERROR_MESSAGE =
  "La aplicación se actualizó mientras trabajaba. Recargue la página e intente de nuevo.";

export type ActionFailureKind = "control-flow" | "stale-deployment" | "unexpected";

function digestOf(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("digest" in error)) return undefined;
  const digest = (error as { digest?: unknown }).digest;
  return typeof digest === "string" ? digest : undefined;
}

/**
 * Señales de control de Next.js que NO son fallos: redirección y páginas de
 * acceso (404/403/401). Quien las captura debe relanzarlas.
 */
export function isFrameworkControlFlowError(error: unknown): boolean {
  const digest = digestOf(error);
  if (digest === undefined) return false;
  return (
    digest === "NEXT_REDIRECT" ||
    digest.startsWith("NEXT_REDIRECT;") ||
    digest.startsWith("NEXT_HTTP_ERROR_FALLBACK;") ||
    digest === "NEXT_NOT_FOUND"
  );
}

export function classifyActionFailure(error: unknown): ActionFailureKind {
  if (isFrameworkControlFlowError(error)) return "control-flow";
  if (typeof error === "object" && error !== null && (error as { name?: unknown }).name === "UnrecognizedActionError") {
    return "stale-deployment";
  }
  return "unexpected";
}

/**
 * Deja el resultado con la forma exacta del tipo: descarta claves ajenas y
 * sanea `fieldErrors`/`values` (lo que cruza la red no se da por bueno).
 */
export function normalizeActionResult(result: ActionResult): ActionResult {
  if (result.status !== "error") return result;
  const clean: Extract<ActionResult, { status: "error" }> = { status: "error", message: result.message };
  const fieldErrors = normalizeStringMap(result.fieldErrors);
  const values = normalizeStringMap(result.values, { keepEmpty: true });
  if (fieldErrors) clean.fieldErrors = fieldErrors;
  if (values) clean.values = values;
  return clean;
}

export type FormActionOutcome =
  /** La acción devolvió un `ActionResult` válido (éxito, error de negocio o idle). */
  | { kind: "result"; result: ActionResult }
  /** La acción terminó sin resultado (p. ej. navegó): no se toca el estado ni se resetea. */
  | { kind: "no-result" }
  /** La acción lanzó un error inesperado: se muestra un mensaje genérico y se conservan los datos. */
  | { kind: "failed"; result: ActionResult };

/**
 * Ejecuta la acción. Relanza (sin envolver) las señales de control de Next;
 * convierte el resto de excepciones en un error visible.
 */
export async function runFormAction(action: FormAction, previous: ActionResult, formData: FormData): Promise<FormActionOutcome> {
  try {
    const value: unknown = await action(previous, formData);
    if (isActionResult(value)) return { kind: "result", result: normalizeActionResult(value) };
    return { kind: "no-result" };
  } catch (error) {
    const failure = classifyActionFailure(error);
    if (failure === "control-flow") throw error;
    return {
      kind: "failed",
      result: actionError(failure === "stale-deployment" ? STALE_DEPLOYMENT_ERROR_MESSAGE : GENERIC_ACTION_ERROR_MESSAGE),
    };
  }
}
