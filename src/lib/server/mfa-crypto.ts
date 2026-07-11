import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { TOTP } from "otpauth";

const ALGORITHM = "aes-256-gcm";
const TOTP_ISSUER = "NCI Logistics Control Tower";
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_CODE_BYTES = 10;

export function getEncryptionKey(): Buffer {
  const hex = process.env.MFA_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("MFA_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plaintext: string): { encrypted: string; iv: string; authTag: string } {
  const key = getEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");
  const authTag = cipher.getAuthTag().toString("base64");
  return { encrypted, iv: iv.toString("base64"), authTag };
}

export function decryptSecret(encrypted: string, ivB64: string, authTagB64: string): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, "base64", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export function generateTotpSecret(): string {
  const bytes = randomBytes(20);
  const base32Chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let result = "";
  let bits = 0;
  let value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += base32Chars[(value >>> bits) & 0x1f];
    }
  }
  if (bits > 0) {
    result += base32Chars[(value << (5 - bits)) & 0x1f];
  }
  return result;
}

export function generateTotpUri(secret: string, userEmail: string): string {
  const totp = new TOTP({
    issuer: TOTP_ISSUER,
    label: userEmail,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  return totp.toString();
}

export function verifyTotpCode(secret: string, code: string): boolean {
  const totp = new TOTP({
    issuer: TOTP_ISSUER,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret,
  });
  const delta = totp.validate({ token: code, window: 1 });
  return delta !== null;
}

export function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const raw = randomBytes(RECOVERY_CODE_BYTES).toString("hex");
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`);
  }
  return codes;
}

export function hashRecoveryCode(code: string): string {
  const normalized = code.replace(/-/g, "").toLowerCase();
  return createHash("sha256").update(normalized).digest("hex");
}
