import type { DayOfWeek } from "@/generated/prisma";

export interface DriverCandidate {
  id: string;
  name: string;
  code: string;
  status: string;
  vehicleType?: string;
  tenantId: string;
}

export interface DriverWorkScheduleEntry {
  driverId: string;
  dayOfWeek: DayOfWeek;
  startTimeLocal: string;
  endTimeLocal: string;
  breakStartLocal?: string | null;
  breakEndLocal?: string | null;
  isActive: boolean;
}

export interface DriverAvailabilityExceptionEntry {
  driverId: string;
  date: Date;
  type: string;
  startTimeLocal?: string | null;
  endTimeLocal?: string | null;
}

export interface AssignedTrip {
  tripId: string;
  driverId: string;
  scheduledAt: Date;
  estimatedEndAt?: Date | null;
  status: string;
}

export interface DriverStats {
  driverId: string;
  incidentsLast30d: number;
  tripsToday: number;
  lastPwaSyncAt?: Date | null;
}

export interface RecommendationInput {
  tenantId: string;
  tripId: string;
  plannedStartAt: Date;
  requiredVehicleType?: string;
  drivers: DriverCandidate[];
  workSchedules: DriverWorkScheduleEntry[];
  availabilityExceptions: DriverAvailabilityExceptionEntry[];
  assignedTrips: AssignedTrip[];
  driverStats: DriverStats[];
  estimatedDurationSeconds?: number;
}

export interface ScoredDriver {
  driverId: string;
  driverName: string;
  driverCode: string;
  score: number;
  isEligible: boolean;
  reasons: string[];
  warnings: string[];
  disqualificationReason?: string;
}

export interface RecommendationResult {
  recommended: ScoredDriver | null;
  alternatives: ScoredDriver[];
  disqualified: ScoredDriver[];
  explanation: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  generatedBy: "RULES_ENGINE";
}

const DAY_MAP: Record<number, DayOfWeek> = {
  0: "SUNDAY",
  1: "MONDAY",
  2: "TUESDAY",
  3: "WEDNESDAY",
  4: "THURSDAY",
  5: "FRIDAY",
  6: "SATURDAY",
};

export function recommendDriverForTrip(input: RecommendationInput): RecommendationResult {
  const {
    tenantId,
    plannedStartAt,
    requiredVehicleType,
    drivers,
    workSchedules,
    availabilityExceptions,
    assignedTrips,
    driverStats,
    estimatedDurationSeconds,
  } = input;

  const validDrivers = drivers.filter((d) => d.tenantId === tenantId);

  if (validDrivers.length === 0) {
    return {
      recommended: null,
      alternatives: [],
      disqualified: [],
      explanation: "No hay conductores disponibles en este tenant.",
      riskLevel: "HIGH",
      generatedBy: "RULES_ENGINE",
    };
  }

  const dayOfWeek = DAY_MAP[plannedStartAt.getDay()];
  const timeLocal = formatTimeLocal(plannedStartAt);
  const dateStr = plannedStartAt.toISOString().slice(0, 10);
  const estimatedEnd = estimatedDurationSeconds
    ? new Date(plannedStartAt.getTime() + estimatedDurationSeconds * 1000)
    : new Date(plannedStartAt.getTime() + 3600_000);

  const statsMap = new Map(driverStats.map((s) => [s.driverId, s]));

  const scored: ScoredDriver[] = validDrivers.map((driver) => {
    let score = 0;
    const reasons: string[] = [];
    const warnings: string[] = [];
    let disqualificationReason: string | undefined;

    if (driver.status !== "AVAILABLE") {
      disqualificationReason = `Conductor inactivo (estado: ${driver.status})`;
      score -= 20;
    }

    const schedule = workSchedules.find(
      (ws) => ws.driverId === driver.id && ws.dayOfWeek === dayOfWeek && ws.isActive,
    );

    if (schedule) {
      if (isTimeInRange(timeLocal, schedule.startTimeLocal, schedule.endTimeLocal)) {
        score += 30;
        reasons.push("Dentro de horario laboral");
      } else {
        score -= 30;
        warnings.push("Fuera de horario laboral");
      }

      if (schedule.breakStartLocal && schedule.breakEndLocal) {
        if (isTimeInRange(timeLocal, schedule.breakStartLocal, schedule.breakEndLocal)) {
          score -= 10;
          warnings.push("En horario de descanso");
        }
      }
    } else {
      score -= 10;
      warnings.push("Sin horario configurado para este dia");
    }

    const exception = availabilityExceptions.find(
      (e) => e.driverId === driver.id && e.date.toISOString().slice(0, 10) === dateStr,
    );

    if (exception) {
      if (exception.type === "EXTRA_SHIFT") {
        score += 5;
        reasons.push("Turno extra registrado");
      } else {
        disqualificationReason = `No disponible: ${exceptionTypeLabel(exception.type)}`;
        score -= 40;
      }
    }

    const conflictingTrips = assignedTrips.filter((t) => {
      if (t.driverId !== driver.id) return false;
      if (t.status === "CANCELLED" || t.status === "CLOSED") return false;
      const tripEnd = t.estimatedEndAt ?? new Date(t.scheduledAt.getTime() + 3600_000);
      return plannedStartAt < tripEnd && estimatedEnd > t.scheduledAt;
    });

    if (conflictingTrips.length > 0) {
      score -= 40;
      disqualificationReason = `Conflicto con ${conflictingTrips.length} viaje(s) asignado(s)`;
      warnings.push(`Solapamiento con viaje(s): ${conflictingTrips.map((t) => t.tripId.slice(0, 8)).join(", ")}`);
    } else {
      score += 20;
      reasons.push("Sin conflicto de viajes");
    }

    if (requiredVehicleType && driver.vehicleType) {
      if (driver.vehicleType.toLowerCase() === requiredVehicleType.toLowerCase()) {
        score += 15;
        reasons.push("Vehiculo compatible");
      } else {
        score -= 10;
        warnings.push(`Vehiculo ${driver.vehicleType} no coincide con requerido ${requiredVehicleType}`);
      }
    }

    const stats = statsMap.get(driver.id);
    if (stats) {
      if (stats.incidentsLast30d > 3) {
        score -= 15;
        warnings.push(`${stats.incidentsLast30d} incidencias en 30 dias`);
      } else if (stats.incidentsLast30d === 0) {
        score += 10;
        reasons.push("Sin incidencias recientes");
      }

      const maxTripsDay = 5;
      if (stats.tripsToday < maxTripsDay) {
        const loadScore = Math.round(10 * (1 - stats.tripsToday / maxTripsDay));
        score += loadScore;
        reasons.push(`Carga del dia: ${stats.tripsToday} viaje(s)`);
      } else {
        score -= 5;
        warnings.push(`Alta carga: ${stats.tripsToday} viajes hoy`);
      }

      if (stats.lastPwaSyncAt) {
        const syncAgeMs = Date.now() - stats.lastPwaSyncAt.getTime();
        const ONE_HOUR = 3600_000;
        if (syncAgeMs < ONE_HOUR) {
          score += 5;
          reasons.push("PWA sincronizada recientemente");
        } else if (syncAgeMs > 24 * ONE_HOUR) {
          score -= 10;
          warnings.push("PWA sin sincronizacion en 24h+");
        }
      }
    }

    const isEligible = !disqualificationReason;

    return {
      driverId: driver.id,
      driverName: driver.name,
      driverCode: driver.code,
      score,
      isEligible,
      reasons,
      warnings,
      disqualificationReason,
    };
  });

  scored.sort((a, b) => b.score - a.score);

  const eligible = scored.filter((s) => s.isEligible);
  const disqualified = scored.filter((s) => !s.isEligible);

  const recommended = eligible[0] ?? null;
  const alternatives = eligible.slice(1);

  let riskLevel: "LOW" | "MEDIUM" | "HIGH" = "LOW";
  if (!recommended) {
    riskLevel = "HIGH";
  } else if (recommended.warnings.length > 2 || recommended.score < 30) {
    riskLevel = "MEDIUM";
  }

  let explanation: string;
  if (!recommended) {
    explanation = `No se encontro conductor elegible. ${disqualified.length} conductor(es) descartado(s).`;
  } else {
    explanation = `${recommended.driverName} (${recommended.driverCode}) recomendado con score ${recommended.score}. ${recommended.reasons.join(". ")}.`;
    if (recommended.warnings.length > 0) {
      explanation += ` Advertencias: ${recommended.warnings.join(". ")}.`;
    }
  }

  return {
    recommended,
    alternatives,
    disqualified,
    explanation,
    riskLevel,
    generatedBy: "RULES_ENGINE",
  };
}

function formatTimeLocal(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function isTimeInRange(time: string, start: string, end: string): boolean {
  return time >= start && time <= end;
}

function exceptionTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    DAY_OFF: "Dia libre",
    VACATION: "Vacaciones",
    SICK_LEAVE: "Incapacidad",
    EXTRA_SHIFT: "Turno extra",
    CUSTOM_UNAVAILABLE: "No disponible",
  };
  return labels[type] ?? type;
}
