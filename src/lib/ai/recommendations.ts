import type {
  AiEngineResult,
  AiRecommendationInput,
  RecommendationRule,
  TenantContext,
} from "./types";
import { validateTenantIsolation, assertNoCriticalAction, filterSensitiveFields } from "./safety";

const rules: RecommendationRule[] = [
  {
    id: "fleet-low-utilization",
    category: "FLEET",
    evaluate(ctx) {
      if (ctx.fleet.totalVehicles === 0) return null;
      const utilization = ctx.fleet.vehiclesWithTripsLast30d / ctx.fleet.totalVehicles;
      if (utilization >= 0.2) return null;
      return {
        ruleId: "fleet-low-utilization",
        type: "OPTIMIZATION",
        priority: "MEDIUM",
        title: "Baja utilizacion de flota",
        description: `Solo ${ctx.fleet.vehiclesWithTripsLast30d} de ${ctx.fleet.totalVehicles} vehiculos tuvieron viajes en los ultimos 30 dias (${Math.round(utilization * 100)}%).`,
        data: { totalVehicles: ctx.fleet.totalVehicles, used: ctx.fleet.vehiclesWithTripsLast30d, utilization: Math.round(utilization * 100) },
        actionRequired: false,
      };
    },
  },
  {
    id: "driver-high-incidents",
    category: "DRIVERS",
    evaluate(ctx) {
      const high = ctx.drivers.driversWithIncidentsLast30d.filter((d) => d.count > 3);
      if (high.length === 0) return null;
      return {
        ruleId: "driver-high-incidents",
        type: "ALERT",
        priority: "HIGH",
        title: "Conductores con alta tasa de incidencias",
        description: `${high.length} conductor(es) con mas de 3 incidencias en 30 dias.`,
        data: { drivers: high.map((d) => ({ id: d.driverId, count: d.count })) },
        actionRequired: true,
      };
    },
  },
  {
    id: "driver-idle",
    category: "DRIVERS",
    evaluate(ctx) {
      if (ctx.drivers.idleDrivers.length === 0) return null;
      return {
        ruleId: "driver-idle",
        type: "INSIGHT",
        priority: "LOW",
        title: "Conductores sin actividad reciente",
        description: `${ctx.drivers.idleDrivers.length} conductor(es) sin viaje asignado en los ultimos 14 dias.`,
        data: { count: ctx.drivers.idleDrivers.length, drivers: ctx.drivers.idleDrivers.slice(0, 5) },
        actionRequired: false,
      };
    },
  },
  {
    id: "ops-high-cancellation",
    category: "OPERATIONS",
    evaluate(ctx) {
      if (ctx.operations.tripsLast7d === 0) return null;
      const rate = ctx.operations.cancelledLast7d / ctx.operations.tripsLast7d;
      if (rate < 0.15) return null;
      return {
        ruleId: "ops-high-cancellation",
        type: "ALERT",
        priority: "HIGH",
        title: "Alta tasa de cancelacion",
        description: `${Math.round(rate * 100)}% de viajes cancelados en los ultimos 7 dias (${ctx.operations.cancelledLast7d}/${ctx.operations.tripsLast7d}).`,
        data: { cancelled: ctx.operations.cancelledLast7d, total: ctx.operations.tripsLast7d, rate: Math.round(rate * 100) },
        actionRequired: true,
      };
    },
  },
  {
    id: "customer-pending-requests",
    category: "CUSTOMERS",
    evaluate(ctx) {
      if (ctx.customers.customersWithPendingRequests.length === 0) return null;
      return {
        ruleId: "customer-pending-requests",
        type: "SUGGESTION",
        priority: "MEDIUM",
        title: "Clientes con solicitudes pendientes",
        description: `${ctx.customers.customersWithPendingRequests.length} cliente(s) con 5+ solicitudes sin convertir.`,
        data: { customers: ctx.customers.customersWithPendingRequests.slice(0, 5) },
        actionRequired: false,
      };
    },
  },
  {
    id: "service-unused",
    category: "SERVICE_TYPES",
    evaluate(ctx) {
      if (ctx.serviceTypes.unusedServiceTypes.length === 0) return null;
      return {
        ruleId: "service-unused",
        type: "INSIGHT",
        priority: "LOW",
        title: "Tipos de servicio sin uso",
        description: `${ctx.serviceTypes.unusedServiceTypes.length} tipo(s) de servicio sin viajes en 30 dias.`,
        data: { serviceTypes: ctx.serviceTypes.unusedServiceTypes },
        actionRequired: false,
      };
    },
  },
  {
    id: "system-alerts-recurring",
    category: "SYSTEM",
    evaluate(ctx) {
      if (ctx.system.recurringAlerts.length === 0) return null;
      return {
        ruleId: "system-alerts-recurring",
        type: "ALERT",
        priority: "HIGH",
        title: "Alertas recurrentes en el sistema",
        description: `${ctx.system.recurringAlerts.length} alerta(s) activas con 3+ ocurrencias.`,
        data: { alerts: ctx.system.recurringAlerts },
        actionRequired: true,
      };
    },
  },
  {
    id: "system-storage-growth",
    category: "SYSTEM",
    evaluate(ctx) {
      if (ctx.system.fileGrowthPercent < 20) return null;
      return {
        ruleId: "system-storage-growth",
        type: "INSIGHT",
        priority: "MEDIUM",
        title: "Crecimiento rapido de almacenamiento",
        description: `Los archivos crecieron ${ctx.system.fileGrowthPercent}% en los ultimos 30 dias.`,
        data: { growthPercent: ctx.system.fileGrowthPercent },
        actionRequired: false,
      };
    },
  },
];

export class RulesBasedRecommendationEngine {
  evaluate(tenantId: string, context: TenantContext): AiEngineResult {
    const start = Date.now();
    validateTenantIsolation(tenantId, context);

    const recommendations: AiRecommendationInput[] = [];
    for (const rule of rules) {
      const result = rule.evaluate(context);
      if (result) {
        recommendations.push(filterSensitiveFields(assertNoCriticalAction(result)));
      }
    }

    return {
      recommendations,
      rulesRun: rules.length,
      matchesFound: recommendations.length,
      durationMs: Date.now() - start,
    };
  }
}
