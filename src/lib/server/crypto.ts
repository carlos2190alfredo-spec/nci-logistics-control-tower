import { createHash, createHmac, randomBytes } from "node:crypto";
import argon2 from "argon2";
// Ruta relativa: seed.ts y los scripts importan este modulo con tsx y no deben depender del tsconfig del cwd.
import { isLocalEnv } from "../app-env";

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

/** Largo mínimo de `SESSION_METADATA_KEY` fuera de local (el .env.example pide 64 hex). */
export const MIN_SESSION_METADATA_KEY_LENGTH = 32;

/**
 * Hash HMAC-SHA256 con secreto del servidor. Se usa para identificar sesiones e IPs
 * en la UI y en logs sin exponer valores en claro.
 *
 * El secreto vive en `SESSION_METADATA_KEY`. Fuera de `local` es obligatorio: sin clave el
 * hash sería un SHA-256 simple con un prefijo público (el repositorio es público), y una
 * IP o un correo se recuperarían por fuerza bruta. Solo en `local` se acepta el SHA-256
 * simple, para no exigir configuración en desarrollo.
 */
export function keyedHash(value: string, purpose: string) {
  const key = process.env.SESSION_METADATA_KEY;

  if (!isLocalEnv() && (!key || key.length < MIN_SESSION_METADATA_KEY_LENGTH)) {
    throw new Error(
      `SESSION_METADATA_KEY es obligatoria fuera de local (minimo ${MIN_SESSION_METADATA_KEY_LENGTH} caracteres; genere una con: openssl rand -hex 32).`,
    );
  }

  if (!key) return hashToken(`${purpose}:${value}`);
  return createHmac("sha256", key).update(`${purpose}:${value}`).digest("hex");
}

export async function hashPassword(password: string) {
  return argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });
}

export async function verifyPassword(hash: string, password: string) {
  return argon2.verify(hash, password);
}
