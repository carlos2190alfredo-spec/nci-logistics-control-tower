import type { HazmatComplianceState } from "@/generated/prisma";

/**
 * Evaluación DETERMINISTA de la aptitud de cumplimiento de una orden de
 * combustible / mercancía peligrosa.
 *
 * Puro: sin base de datos ni IA. Recibe una checklist ya resuelta de requisitos
 * (cada uno presente/válido/bloqueante) y devuelve el estado de cumplimiento.
 * La IA NUNCA autoriza un despacho; solo puede explicar este resultado.
 */

export type HazmatRequirement = {
  key: string;
  label: string;
  /** El documento/dato existe. */
  present: boolean;
  /** El documento/dato es válido (no vencido, no rechazado). */
  valid: boolean;
  /** Si su ausencia/invalidez impide el despacho. */
  blocking: boolean;
};

export type HazmatReadiness = {
  state: HazmatComplianceState;
  satisfied: HazmatRequirement[];
  blockingIssues: HazmatRequirement[];
  observations: HazmatRequirement[];
};

function isIssue(r: HazmatRequirement): boolean {
  return !r.present || !r.valid;
}

/**
 * - Sin requisitos definidos → NO_VERIFICADO.
 * - Algún requisito BLOQUEANTE ausente/inválido → NO_CUMPLE.
 * - Solo requisitos no bloqueantes con problema → CUMPLE_CON_OBSERVACIONES.
 * - Todo presente y válido → CUMPLE.
 */
export function evaluateHazmatReadiness(requirements: HazmatRequirement[]): HazmatReadiness {
  if (requirements.length === 0) {
    return { state: "NO_VERIFICADO", satisfied: [], blockingIssues: [], observations: [] };
  }

  const blockingIssues = requirements.filter((r) => r.blocking && isIssue(r));
  const observations = requirements.filter((r) => !r.blocking && isIssue(r));
  const satisfied = requirements.filter((r) => !isIssue(r));

  let state: HazmatComplianceState;
  if (blockingIssues.length > 0) state = "NO_CUMPLE";
  else if (observations.length > 0) state = "CUMPLE_CON_OBSERVACIONES";
  else state = "CUMPLE";

  return { state, satisfied, blockingIssues, observations };
}

/** ¿El estado permite despachar sin aprobación de excepción? */
export function hazmatAllowsDispatch(state: HazmatComplianceState): boolean {
  return state === "CUMPLE" || state === "CUMPLE_CON_OBSERVACIONES";
}
