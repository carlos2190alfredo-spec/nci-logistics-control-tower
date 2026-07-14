"use server";

import { revalidatePath } from "next/cache";
import { audit } from "@/lib/server/audit";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import {
  generateTenantOperationsSummary,
  analyzeTripRisk,
  explainDriverRecommendation,
  summarizeTenantFeedback,
  summarizeIncidents,
} from "@/lib/ai/copilot-actions";
import { getDeepSeekHealthStatus } from "@/lib/ai/deepseek-health";
import { sanitizeAiInput, markUntrustedContent } from "@/lib/ai/prompt-safety";

async function logInvocation(
  tenantId: string,
  userId: string,
  requestId: string,
  purpose: string,
  provider: string,
  model: string,
  status: string,
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
  durationMs: number,
  fallbackUsed: boolean,
  errorCode?: string,
  safeErrorMessage?: string,
) {
  const db = getDb();
  await db.aiInvocation.create({
    data: {
      tenantId,
      userId,
      requestId,
      provider,
      model,
      purpose,
      status,
      inputCharCount: 0,
      outputCharCount: 0,
      promptTokens,
      completionTokens,
      totalTokens,
      durationMs,
      fallbackUsed,
      errorCode,
      safeErrorMessage,
    },
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await db.aiUsageDaily.upsert({
    where: { tenantId_date: { tenantId, date: today } },
    create: {
      tenantId,
      date: today,
      requestCount: 1,
      successCount: status === "SUCCESS" ? 1 : 0,
      failureCount: status === "FAILED" ? 1 : 0,
      fallbackCount: fallbackUsed ? 1 : 0,
      blockedCount: status === "BLOCKED" ? 1 : 0,
      promptTokens,
      completionTokens,
      totalTokens,
    },
    update: {
      requestCount: { increment: 1 },
      successCount: status === "SUCCESS" ? { increment: 1 } : undefined,
      failureCount: status === "FAILED" ? { increment: 1 } : undefined,
      fallbackCount: fallbackUsed ? { increment: 1 } : undefined,
      blockedCount: status === "BLOCKED" ? { increment: 1 } : undefined,
      promptTokens: { increment: promptTokens },
      completionTokens: { increment: completionTokens },
      totalTokens: { increment: totalTokens },
    },
  });
}

export async function generateOperationsSummaryAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
  ]);

  const db = getDb();
  const aiSetting = await db.tenantAiSetting.findUnique({ where: { tenantId: tenant.id } });
  const aiEnabled = aiSetting?.enabled ?? false;

  const requestId = crypto.randomUUID();
  const { result, completion } = await generateTenantOperationsSummary({
    tenantId: tenant.id,
    userId: user.id,
    requestId,
    tenantAiEnabled: aiEnabled,
  });

  await logInvocation(
    tenant.id, user.id, requestId, "operations_summary",
    completion.provider, completion.model, result ? "SUCCESS" : "FALLBACK",
    completion.promptTokens, completion.completionTokens, completion.totalTokens,
    completion.durationMs, completion.fallbackUsed,
  );

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "ai.copilot.operations_summary",
    entity: "Tenant",
    entityId: tenant.id,
    after: { provider: completion.provider, fallbackUsed: completion.fallbackUsed },
  });

  revalidatePath(`/t/${tenantSlug}/admin/operations-copilot`);
}

export async function analyzeTripRiskAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const tripId = String(formData.get("tripId") ?? "");
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "DISPATCHER",
  ]);

  const db = getDb();
  const aiSetting = await db.tenantAiSetting.findUnique({ where: { tenantId: tenant.id } });
  const aiEnabled = aiSetting?.enabled ?? false;

  const requestId = crypto.randomUUID();
  const { result, completion } = await analyzeTripRisk({
    tenantId: tenant.id,
    userId: user.id,
    requestId,
    tenantAiEnabled: aiEnabled,
    tripId,
  });

  await logInvocation(
    tenant.id, user.id, requestId, "trip_risk",
    completion.provider, completion.model, result ? "SUCCESS" : "FALLBACK",
    completion.promptTokens, completion.completionTokens, completion.totalTokens,
    completion.durationMs, completion.fallbackUsed,
  );

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "ai.copilot.trip_risk",
    entity: "Trip",
    entityId: tripId,
    after: { provider: completion.provider },
  });

  revalidatePath(`/t/${tenantSlug}`);
}

export async function explainRecommendationAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const tripId = String(formData.get("tripId") ?? "");
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER", "DISPATCHER",
  ]);

  const db = getDb();
  const aiSetting = await db.tenantAiSetting.findUnique({ where: { tenantId: tenant.id } });
  const aiEnabled = aiSetting?.enabled ?? false;

  const rec = await db.driverAssignmentRecommendation.findFirst({
    where: { tenantId: tenant.id, tripId },
    orderBy: { createdAt: "desc" },
  });

  if (!rec) return;

  const recContext = sanitizeAiInput(JSON.stringify({
    score: rec.score,
    rank: rec.rank,
    riskLevel: rec.riskLevel,
    explanation: rec.explanation,
    reasons: rec.reasonsJson,
    warnings: rec.warningsJson,
  }));

  const requestId = crypto.randomUUID();
  const { result, completion } = await explainDriverRecommendation({
    tenantId: tenant.id,
    userId: user.id,
    requestId,
    tenantAiEnabled: aiEnabled,
    recommendationContext: recContext,
  });

  await logInvocation(
    tenant.id, user.id, requestId, "driver_recommendation_explanation",
    completion.provider, completion.model, result ? "SUCCESS" : "FALLBACK",
    completion.promptTokens, completion.completionTokens, completion.totalTokens,
    completion.durationMs, completion.fallbackUsed,
  );

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "ai.copilot.recommendation_explanation",
    entity: "Trip",
    entityId: tripId,
    after: { provider: completion.provider },
  });

  revalidatePath(`/t/${tenantSlug}`);
}

export async function summarizeFeedbackAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN",
  ]);

  const db = getDb();
  const aiSetting = await db.tenantAiSetting.findUnique({ where: { tenantId: tenant.id } });
  const aiEnabled = aiSetting?.enabled ?? false;

  const requestId = crypto.randomUUID();
  const { result, completion } = await summarizeTenantFeedback({
    tenantId: tenant.id,
    userId: user.id,
    requestId,
    tenantAiEnabled: aiEnabled,
  });

  await logInvocation(
    tenant.id, user.id, requestId, "feedback_summary",
    completion.provider, completion.model, result ? "SUCCESS" : "FALLBACK",
    completion.promptTokens, completion.completionTokens, completion.totalTokens,
    completion.durationMs, completion.fallbackUsed,
  );

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "ai.copilot.feedback_summary",
    entity: "Tenant",
    entityId: tenant.id,
    after: { provider: completion.provider },
  });

  revalidatePath(`/t/${tenantSlug}/admin/operations-copilot`);
}

export async function summarizeIncidentsAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
  ]);

  const db = getDb();
  const aiSetting = await db.tenantAiSetting.findUnique({ where: { tenantId: tenant.id } });
  const aiEnabled = aiSetting?.enabled ?? false;

  const requestId = crypto.randomUUID();
  const { result, completion } = await summarizeIncidents({
    tenantId: tenant.id,
    userId: user.id,
    requestId,
    tenantAiEnabled: aiEnabled,
  });

  await logInvocation(
    tenant.id, user.id, requestId, "incident_summary",
    completion.provider, completion.model, result ? "SUCCESS" : "FALLBACK",
    completion.promptTokens, completion.completionTokens, completion.totalTokens,
    completion.durationMs, completion.fallbackUsed,
  );

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "ai.copilot.incident_summary",
    entity: "Tenant",
    entityId: tenant.id,
    after: { provider: completion.provider },
  });

  revalidatePath(`/t/${tenantSlug}/admin/operations-copilot`);
}

export async function getCopilotStatusAction(tenantSlug: string) {
  const { tenant } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
  ]);

  const db = getDb();
  const aiSetting = await db.tenantAiSetting.findUnique({ where: { tenantId: tenant.id } });
  const aiEnabled = aiSetting?.enabled ?? false;
  const health = getDeepSeekHealthStatus(aiEnabled);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const usage = await db.aiUsageDaily.findUnique({
    where: { tenantId_date: { tenantId: tenant.id, date: today } },
  });

  const recentInvocations = await db.aiInvocation.findMany({
    where: { tenantId: tenant.id },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      purpose: true,
      provider: true,
      status: true,
      durationMs: true,
      fallbackUsed: true,
      createdAt: true,
    },
  });

  return {
    health,
    aiEnabled,
    usage: usage ?? null,
    recentInvocations,
  };
}
