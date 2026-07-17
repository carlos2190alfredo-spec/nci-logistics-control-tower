/**
 * Cálculo determinista de días libres, demurrage, detention y almacenaje.
 *
 * PURO: sin base de datos ni IA. Las tarifas y días libres son datos del
 * tenant (nunca asumidos). El sistema solo proyecta/consolida en base a esos
 * datos y a fechas verificadas.
 */

export type FreeTimeRisk =
  | "SIN_RIESGO"
  | "RIESGO_PROXIMO"
  | "RIESGO_ALTO"
  | "CARGO_ACUMULANDOSE"
  | "CARGO_CERRADO";

export type FreeTimeResult = {
  /** Días transcurridos desde `startAt` (0 si aún no inicia). */
  elapsedDays: number;
  /** Días libres ya consumidos (máx = freeDays). */
  freeDaysConsumed: number;
  /** Días libres restantes (0 si ya se agotaron). */
  freeDaysRemaining: number;
  /** Días facturables (transcurridos por encima de los libres). */
  chargeableDays: number;
  /** Monto (chargeableDays * ratePerDay), redondeado a 2 decimales. null si no hay tarifa. */
  amount: number | null;
  risk: FreeTimeRisk;
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Días completos entre dos fechas (piso, nunca negativo). */
export function fullDaysBetween(from: Date, to: Date): number {
  const diff = Math.floor((to.getTime() - from.getTime()) / MS_PER_DAY);
  return diff > 0 ? diff : 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Calcula el estado de tiempo/cargo de un contenedor.
 * - `startAt`: inicio del conteo (p.ej. disponibilidad para demurrage,
 *   gate-out para detention). Si es null/futuro → sin transcurso.
 * - `endAt`: cierre del conteo (p.ej. retiro / devolución de vacío). Si está
 *   presente, el cargo se considera CERRADO y se calcula hasta esa fecha.
 * - `freeDays`: días libres pactados.
 * - `ratePerDay`: tarifa por día facturable (moneda del tenant).
 */
export function computeFreeTime(input: {
  startAt: Date | null | undefined;
  endAt?: Date | null;
  freeDays: number;
  ratePerDay?: number | null;
  now: Date;
}): FreeTimeResult {
  const freeDays = Math.max(0, Math.floor(input.freeDays));

  if (!input.startAt || input.startAt.getTime() > input.now.getTime()) {
    return {
      elapsedDays: 0,
      freeDaysConsumed: 0,
      freeDaysRemaining: freeDays,
      chargeableDays: 0,
      amount: input.ratePerDay != null ? 0 : null,
      risk: "SIN_RIESGO",
    };
  }

  const until = input.endAt ?? input.now;
  const elapsedDays = fullDaysBetween(input.startAt, until);
  const freeDaysConsumed = Math.min(elapsedDays, freeDays);
  const freeDaysRemaining = Math.max(0, freeDays - elapsedDays);
  const chargeableDays = Math.max(0, elapsedDays - freeDays);
  const amount = input.ratePerDay != null ? round2(chargeableDays * input.ratePerDay) : null;

  let risk: FreeTimeRisk;
  if (input.endAt) {
    risk = "CARGO_CERRADO";
  } else if (chargeableDays > 0) {
    risk = "CARGO_ACUMULANDOSE";
  } else if (freeDaysRemaining <= 1) {
    risk = "RIESGO_ALTO";
  } else if (freeDaysRemaining <= 3) {
    risk = "RIESGO_PROXIMO";
  } else {
    risk = "SIN_RIESGO";
  }

  return { elapsedDays, freeDaysConsumed, freeDaysRemaining, chargeableDays, amount, risk };
}
