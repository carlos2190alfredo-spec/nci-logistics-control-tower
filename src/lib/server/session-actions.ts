"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAuthenticatedUser, getCurrentSession, revokeAllUserSessions, revokeOtherSessions, revokeSessionById } from "@/lib/server/auth";

export async function revokeSessionAction(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  if (!sessionId) return;
  const user = await requireAuthenticatedUser();
  const current = await getCurrentSession();
  await revokeSessionById(user.id, sessionId);
  // Si el usuario revoco su propia sesion activa, salir.
  if (current && current.id === sessionId) {
    redirect("/login");
  }
  revalidatePath("/account/sessions");
}

export async function revokeOtherSessionsAction() {
  const user = await requireAuthenticatedUser();
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  await revokeOtherSessions(user.id, current!.id);
  revalidatePath("/account/sessions");
}

export async function revokeAllSessionsAction() {
  const user = await requireAuthenticatedUser();
  await revokeAllUserSessions(user.id, "user-initiated");
  redirect("/login");
}
