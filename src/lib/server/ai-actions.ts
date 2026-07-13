"use server";

import { revalidatePath } from "next/cache";
import type { AiRecommendationStatus } from "@/generated/prisma";
import { audit } from "@/lib/server/audit";
import { requireTenantRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { buildTenantContext } from "@/lib/ai/context-builder";
import { RulesBasedRecommendationEngine } from "@/lib/ai/recommendations";

export async function changeRecommendationStatusAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const recommendationId = String(formData.get("recommendationId") ?? "");
  const newStatus = String(formData.get("status") ?? "") as AiRecommendationStatus;
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
  ]);

  const validStatuses: AiRecommendationStatus[] = ["PENDING", "VIEWED", "ACTED", "DISMISSED"];
  if (!validStatuses.includes(newStatus)) return;

  const db = getDb();
  const rec = await db.aiRecommendation.findFirstOrThrow({
    where: { id: recommendationId, tenantId: tenant.id },
  });

  const now = new Date();
  await db.aiRecommendation.update({
    where: { id: recommendationId },
    data: {
      status: newStatus,
      viewedAt: newStatus === "VIEWED" ? now : rec.viewedAt,
      actedAt: newStatus === "ACTED" ? now : rec.actedAt,
      dismissedAt: newStatus === "DISMISSED" ? now : rec.dismissedAt,
    },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: `recommendation.${newStatus.toLowerCase()}`,
    entity: "AiRecommendation",
    entityId: recommendationId,
    before: { status: rec.status },
    after: { status: newStatus },
  });

  revalidatePath(`/t/${tenantSlug}/admin/recommendations`);
}

export async function generateRecommendationsAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN",
  ]);

  const db = getDb();

  const aiSetting = await db.tenantAiSetting.findUnique({
    where: { tenantId: tenant.id },
  });
  if (!aiSetting?.enabled) return;

  const context = await buildTenantContext(tenant.id);
  const engine = new RulesBasedRecommendationEngine();
  const result = engine.evaluate(tenant.id, context);

  for (const rec of result.recommendations) {
    const existing = await db.aiRecommendation.findFirst({
      where: {
        tenantId: tenant.id,
        ruleId: rec.ruleId,
        status: { in: ["PENDING", "VIEWED"] },
      },
    });
    if (existing) continue;

    await db.aiRecommendation.create({
      data: {
        tenantId: tenant.id,
        ruleId: rec.ruleId,
        type: rec.type,
        priority: rec.priority,
        title: rec.title,
        description: rec.description,
        data: (rec.data ?? {}) as Record<string, string | number>,
        actionRequired: rec.actionRequired,
      },
    });
  }

  await db.aiInsightEvent.create({
    data: {
      tenantId: tenant.id,
      type: "manual_generation",
      rulesRun: result.rulesRun,
      matchesFound: result.matchesFound,
      durationMs: result.durationMs,
      data: { triggeredBy: user.id },
    },
  });

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: "ai.generate_recommendations",
    entity: "AiInsightEvent",
    after: { rulesRun: result.rulesRun, matchesFound: result.matchesFound },
  });

  revalidatePath(`/t/${tenantSlug}/admin/recommendations`);
}

export async function toggleAiSettingAction(formData: FormData) {
  const tenantSlug = String(formData.get("tenantSlug") ?? "");
  const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
    "TENANT_OWNER", "TENANT_ADMIN",
  ]);

  const db = getDb();
  const existing = await db.tenantAiSetting.findUnique({
    where: { tenantId: tenant.id },
  });

  if (existing) {
    await db.tenantAiSetting.update({
      where: { tenantId: tenant.id },
      data: { enabled: !existing.enabled },
    });
  } else {
    await db.tenantAiSetting.create({
      data: { tenantId: tenant.id, enabled: true },
    });
  }

  const newEnabled = existing ? !existing.enabled : true;

  await audit({
    tenantId: tenant.id,
    actorId: user.id,
    actorRole: membership.role,
    action: newEnabled ? "ai.enable" : "ai.disable",
    entity: "TenantAiSetting",
    before: { enabled: existing?.enabled ?? false },
    after: { enabled: newEnabled },
  });

  revalidatePath(`/t/${tenantSlug}/admin/recommendations`);
}
