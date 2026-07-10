"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { consumeResetToken, pruneStaleResetTokens, requestPasswordReset, RESET_MAX_PASSWORD_LENGTH, RESET_MIN_PASSWORD_LENGTH } from "@/lib/server/password-reset";
import { enforceRateLimit } from "@/lib/server/rate-limit";
import { logger } from "@/lib/server/logger";

const RESET_DELAY_MS = 300;

async function constantDelay() {
  await new Promise((resolve) => setTimeout(resolve, RESET_DELAY_MS));
}

async function clientIp() {
  const store = await headers();
  return store.get("x-forwarded-for")?.split(",")[0]?.trim() ?? store.get("x-real-ip") ?? "local";
}

const emailSchema = z.object({ email: z.string().email().max(255) });

export async function requestResetAction(_: unknown, formData: FormData) {
  const parsed = emailSchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    await constantDelay();
    return { done: true } as const;
  }
  const email = parsed.data.email.toLowerCase();
  const ip = await clientIp();

  const [emailLimit, ipLimit] = await Promise.all([
    enforceRateLimit({ scope: "auth.password_reset.email", key: email, limit: 5, windowSeconds: 15 * 60 }),
    enforceRateLimit({ scope: "auth.password_reset.ip", key: ip, limit: 20, windowSeconds: 15 * 60 }),
  ]);
  if (!emailLimit.allowed || !ipLimit.allowed) {
    logger.warn("password reset rate limited");
    await constantDelay();
    return { done: true } as const;
  }

  try {
    await requestPasswordReset(email, ip);
  } catch (error) {
    logger.error("password reset request error", { error: error instanceof Error ? error.message : "unknown" });
  }
  await pruneStaleResetTokens().catch(() => undefined);
  await constantDelay();
  return { done: true } as const;
}

const resetSchema = z
  .object({
    token: z.string().min(20).max(200),
    password: z.string().min(RESET_MIN_PASSWORD_LENGTH).max(RESET_MAX_PASSWORD_LENGTH),
    confirmation: z.string().min(RESET_MIN_PASSWORD_LENGTH).max(RESET_MAX_PASSWORD_LENGTH),
  })
  .refine((value) => value.password === value.confirmation, { path: ["confirmation"], message: "Las contrasenas no coinciden." });

export async function resetPasswordAction(_: unknown, formData: FormData) {
  const parsed = resetSchema.safeParse({
    token: formData.get("token"),
    password: formData.get("password"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) {
    await constantDelay();
    return { error: "INVALID_PAYLOAD" as const, message: parsed.error.issues[0]?.message ?? "Datos invalidos." };
  }

  const ip = await clientIp();
  const rate = await enforceRateLimit({ scope: "auth.password_reset.consume", key: ip, limit: 10, windowSeconds: 15 * 60 });
  if (!rate.allowed) {
    await constantDelay();
    return { error: "RATE_LIMITED" as const, message: "Demasiados intentos. Reintente mas tarde." };
  }

  const outcome = await consumeResetToken(parsed.data.token, parsed.data.password);
  await constantDelay();
  if (!outcome.ok) {
    return { error: outcome.reason, message: "El enlace ya no es valido." };
  }
  redirect("/login?password-reset=ok");
}
