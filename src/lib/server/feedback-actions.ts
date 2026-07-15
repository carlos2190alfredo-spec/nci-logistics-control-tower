"use server";

import { revalidatePath } from "next/cache";
import type { FeedbackStatus } from "@/generated/prisma";
import { audit } from "@/lib/server/audit";
import { requireTenantRole } from "@/lib/server/auth";
import { requirePlatformRole } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";

export async function changeFeedbackStatusAction(formData: FormData) {
  const feedbackId = String(formData.get("feedbackId") ?? "");
  const newStatus = String(formData.get("status") ?? "") as FeedbackStatus;
  const context = String(formData.get("context") ?? "platform");

  const validStatuses: FeedbackStatus[] = [
    "SUBMITTED", "IN_REVIEW", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED", "CLOSED", "WONT_FIX",
  ];
  if (!validStatuses.includes(newStatus)) return;

  const db = getDb();

  if (context === "platform") {
    const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"]);
    const feedback = await db.tenantFeedback.findUniqueOrThrow({ where: { id: feedbackId } });
    const oldStatus = feedback.status;

    await db.tenantFeedback.update({
      where: { id: feedbackId },
      data: { status: newStatus },
    });

    await audit({
      tenantId: feedback.tenantId,
      actorId: user.id,
      actorRole: user.platformRole,
      action: "feedback.status_change",
      entity: "TenantFeedback",
      entityId: feedbackId,
      before: { status: oldStatus },
      after: { status: newStatus },
    });

    revalidatePath("/platform/feedback");
    revalidatePath(`/platform/feedback/${feedbackId}`);
  } else {
    const tenantSlug = String(formData.get("tenantSlug") ?? "");
    const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
      "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
    ]);
    const feedback = await db.tenantFeedback.findFirstOrThrow({
      where: { id: feedbackId, tenantId: tenant.id },
    });
    const oldStatus = feedback.status;

    await db.tenantFeedback.update({
      where: { id: feedbackId },
      data: { status: newStatus },
    });

    await audit({
      tenantId: tenant.id,
      actorId: user.id,
      actorRole: membership.role,
      action: "feedback.status_change",
      entity: "TenantFeedback",
      entityId: feedbackId,
      before: { status: oldStatus },
      after: { status: newStatus },
    });

    revalidatePath(`/t/${tenantSlug}/admin/feedback`);
    revalidatePath(`/t/${tenantSlug}/admin/feedback/${feedbackId}`);
  }
}

export async function respondToFeedbackAction(formData: FormData) {
  const feedbackId = String(formData.get("feedbackId") ?? "");
  const response = String(formData.get("response") ?? "").trim().slice(0, 2000);
  if (!response) return;

  const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"]);
  const db = getDb();

  const feedback = await db.tenantFeedback.findUniqueOrThrow({ where: { id: feedbackId } });

  await db.tenantFeedback.update({
    where: { id: feedbackId },
    data: {
      response,
      respondedById: user.id,
      respondedAt: new Date(),
      status: feedback.status === "SUBMITTED" ? "IN_REVIEW" : feedback.status,
    },
  });

  await audit({
    tenantId: feedback.tenantId,
    actorId: user.id,
    actorRole: user.platformRole,
    action: "feedback.respond",
    entity: "TenantFeedback",
    entityId: feedbackId,
    after: { responseLength: response.length },
  });

  revalidatePath("/platform/feedback");
  revalidatePath(`/platform/feedback/${feedbackId}`);
}

export async function addFeedbackCommentAction(formData: FormData) {
  const feedbackId = String(formData.get("feedbackId") ?? "");
  const body = String(formData.get("body") ?? "").trim().slice(0, 2000);
  const isInternal = formData.get("isInternal") === "on";
  const context = String(formData.get("context") ?? "platform");
  if (!body) return;

  const db = getDb();

  if (context === "platform") {
    const user = await requirePlatformRole(["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT"]);
    const feedback = await db.tenantFeedback.findUniqueOrThrow({ where: { id: feedbackId } });

    await db.feedbackComment.create({
      data: {
        feedbackId,
        authorId: user.id,
        body,
        isInternal,
      },
    });

    await audit({
      tenantId: feedback.tenantId,
      actorId: user.id,
      actorRole: user.platformRole,
      action: "feedback.comment",
      entity: "FeedbackComment",
      after: { feedbackId, isInternal },
    });

    revalidatePath("/platform/feedback");
    revalidatePath(`/platform/feedback/${feedbackId}`);
  } else {
    const tenantSlug = String(formData.get("tenantSlug") ?? "");
    const { user, tenant, membership } = await requireTenantRole(tenantSlug, [
      "TENANT_OWNER", "TENANT_ADMIN", "OPERATIONS_MANAGER",
    ]);
    await db.tenantFeedback.findFirstOrThrow({
      where: { id: feedbackId, tenantId: tenant.id },
    });

    await db.feedbackComment.create({
      data: {
        feedbackId,
        authorId: user.id,
        body,
        isInternal: false,
      },
    });

    await audit({
      tenantId: tenant.id,
      actorId: user.id,
      actorRole: membership.role,
      action: "feedback.comment",
      entity: "FeedbackComment",
      after: { feedbackId },
    });

    revalidatePath(`/t/${tenantSlug}/admin/feedback`);
    revalidatePath(`/t/${tenantSlug}/admin/feedback/${feedbackId}`);
  }
}
