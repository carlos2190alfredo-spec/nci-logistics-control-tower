import { createHash, createHmac, randomBytes } from "node:crypto";
import argon2 from "argon2";

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function createOpaqueToken() {
  return randomBytes(32).toString("base64url");
}

/**
 * Hash HMAC-SHA256 con secreto local. Se usa para identificar sesiones e IPs
 * en la UI sin exponer valores en claro. El secreto vive en el entorno; si no
 * está definido, cae a hash SHA-256 simple (aceptable en local).
 */
export function keyedHash(value: string, purpose: string) {
  const key = process.env.SESSION_METADATA_KEY;
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
