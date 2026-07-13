import type {
  AiRecommendationPriority,
  AiRecommendationType,
} from "@/generated/prisma";

export interface TenantContext {
  tenantId: string;
  tenantName: string;
  fleet: {
    totalVehicles: number;
    activeVehicles: number;
    vehiclesWithTripsLast30d: number;
  };
  drivers: {
    totalDrivers: number;
    activeDrivers: number;
    driversWithIncidentsLast30d: { driverId: string; name: string; count: number }[];
    idleDrivers: { driverId: string; name: string; lastTripDaysAgo: number }[];
  };
  operations: {
    tripsLast7d: number;
    tripsLast30d: number;
    deliveredLast7d: number;
    cancelledLast7d: number;
    avgCompletionDays: number;
  };
  customers: {
    totalCustomers: number;
    customersWithVolumeDrops: { customerId: string; name: string; dropPercent: number }[];
    customersWithPendingRequests: { customerId: string; name: string; pendingCount: number }[];
  };
  serviceTypes: {
    unusedServiceTypes: { id: string; name: string; daysSinceLastUse: number }[];
  };
  system: {
    activeAlerts: number;
    recurringAlerts: { title: string; count: number }[];
    fileGrowthPercent: number;
  };
}

export interface RecommendationRule {
  id: string;
  category: RuleCategory;
  evaluate(context: TenantContext): AiRecommendationInput | null;
}

export type RuleCategory =
  | "FLEET"
  | "DRIVERS"
  | "OPERATIONS"
  | "CUSTOMERS"
  | "SERVICE_TYPES"
  | "SYSTEM";

export interface AiRecommendationInput {
  ruleId: string;
  type: AiRecommendationType;
  priority: AiRecommendationPriority;
  title: string;
  description: string;
  data: Record<string, unknown>;
  actionRequired: boolean;
}

export interface AiEngineResult {
  recommendations: AiRecommendationInput[];
  rulesRun: number;
  matchesFound: number;
  durationMs: number;
}
