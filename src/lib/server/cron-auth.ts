import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Autenticacion de los endpoints invocados por Vercel Cron.
 *
 * Vercel envia `Authorization: Bearer <CRON_SECRET>` cuando el proyecto define la variable
 * de entorno `CRON_SECRET`. Si la variable falta (o es demasiado corta) el endpoint debe
 * fallar cerrado: nunca ejecutar mantenimiento sin autenticar al llamador.
 */

/** Longitud minima aceptada para `CRON_SECRET` (el secreto no debe ser adivinable). */
export const CRON_SECRET_MIN_LENGTH = 16;

/** Devuelve `CRON_SECRET` si esta configurado y es suficientemente largo; si no, `null`. */
export function readCronSecret(env: Record<string, string | undefined> = process.env): string | null {
  const secret = env.CRON_SECRET?.trim();
  if (!secret || secret.length < CRON_SECRET_MIN_LENGTH) return null;
  return secret;
}

/**
 * Compara el encabezado `Authorization` con `Bearer <secret>` en tiempo constante.
 * Se comparan los SHA-256 de ambos valores para que `timingSafeEqual` reciba siempre
 * buffers de igual longitud y no se filtre la longitud del secreto.
 */
export function isAuthorizedCronRequest(authorizationHeader: string | null, secret: string): boolean {
  if (!authorizationHeader || !secret) return false;
  const match = /^Bearer (.+)$/.exec(authorizationHeader);
  if (!match) return false;

  const given = createHash("sha256").update(match[1]).digest();
  const expected = createHash("sha256").update(secret).digest();
  return timingSafeEqual(given, expected);
}
