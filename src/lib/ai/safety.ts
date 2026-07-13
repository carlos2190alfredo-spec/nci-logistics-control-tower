import type { AiRecommendationInput, TenantContext } from "./types";

export function validateTenantIsolation(tenantId: string, context: TenantContext): void {
  if (context.tenantId !== tenantId) {
    throw new Error("AI_TENANT_ISOLATION_VIOLATION: context tenantId mismatch");
  }
}

export function assertNoCriticalAction(recommendation: AiRecommendationInput): AiRecommendationInput {
  if (recommendation.actionRequired) {
    return { ...recommendation, data: { ...recommendation.data, requiresConfirmation: true } };
  }
  return recommendation;
}

export function filterSensitiveFields(recommendation: AiRecommendationInput): AiRecommendationInput {
  const sensitiveKeys = ["passwordHash", "token", "secret", "apiKey", "encryptedSecret", "iv", "authTag"];
  const cleanData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(recommendation.data)) {
    if (!sensitiveKeys.includes(key)) {
      cleanData[key] = value;
    }
  }
  return { ...recommendation, data: cleanData };
}
