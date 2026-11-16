"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { actionError, type ActionResult } from "@/lib/server/action-result";
import { audit } from "@/lib/server/audit";
import { getApiSessionUser } from "@/lib/server/auth";
import { getDb } from "@/lib/server/db";
import { acceptInvitation } from "@/lib/server/invitation-accept";
import { logger } from "@/lib/server/logger";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { invitationFailureMessage } from "@/lib/ui/invitation-notices";

async function clientIp() {
  const store = await headers();
  return store.get("x-forwarded-for")?.split(",")[0]?.trim() ?? store.get("x-real-ip") ?? "local";
}

const text = (value: FormDataEntryValue | null) => (typeof value === "string" ? value : undefined);

/**
 * Acepta una invitación al equipo. El correo, el rol y la empresa salen de la invitación guardada (por el hash del
 * token), nunca del formulario; la sesión, de la cookie. Sin sesión solo se puede crear una cuenta NUEVA.
 */
export async function acceptInvitationAction(_previous: ActionResult, formData: FormData): Promise<ActionResult> {
  const token = text(formData.get("token")) ?? "";

  const rate = await enforceRateLimit({ scope: "auth.invitation.accept", key: await clientIp(), limit: 10, windowSeconds: 15 * 60 });
  if (!rate.allowed) {
    return actionError("Demasiados intentos. Espere unos minutos e intente de nuevo.");
  }

  const sessionUser = await getApiSessionUser();
  const outcome = await acceptInvitation(getDb(), {
    token,
    sessionUserId: sessionUser?.id ?? null,
    name: text(formData.get("name")),
    password: text(formData.get("password")),
    confirmation: text(formData.get("confirmation")),
  });

  if (!outcome.ok) {
    const message = invitationFailureMessage(outcome.reason, outcome.message);
    return actionError(message, outcome.field ? { fieldErrors: { [outcome.field]: message } } : undefined);
  }

  try {
    await audit({
      tenantId: outcome.tenantId,
      actorId: outcome.userId,
      actorRole: outcome.role,
      action: "invitation.accept",
      entity: "UserInvitation",
      entityId: outcome.invitationId,
      after: { newAccount: outcome.newAccount, role: outcome.role },
    });
  } catch (error) {
    // La cuenta y la membresía ya están confirmadas: un fallo de auditoría no debe dejar a la persona sin entrar.
    logger.error("invitation.accept audit failed", { error: error instanceof Error ? error.message : "unknown" });
  }

  redirect(outcome.newAccount ? "/login?invitation=ok" : `/t/${outcome.tenantSlug}`);
}
