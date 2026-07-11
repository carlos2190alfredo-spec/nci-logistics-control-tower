"use server";

import { getDb } from "@/lib/server/db";
import { audit } from "@/lib/server/audit";
import {
  encryptSecret,
  decryptSecret,
  generateTotpSecret,
  generateTotpUri,
  verifyTotpCode,
  generateRecoveryCodes,
  hashRecoveryCode,
} from "@/lib/server/mfa-crypto";

const CHALLENGE_TTL_MINUTES = 5;
const CHALLENGE_MAX_ATTEMPTS = 5;

export async function setupMfaSecret(userId: string, userEmail: string) {
  const db = getDb();

  const existing = await db.userMfaSecret.findUnique({ where: { userId } });
  if (existing?.verified) {
    return { error: "MFA_ALREADY_ACTIVE" as const };
  }

  if (existing && !existing.verified) {
    await db.userMfaSecret.delete({ where: { userId } });
  }

  const secret = generateTotpSecret();
  const { encrypted, iv, authTag } = encryptSecret(secret);

  await db.userMfaSecret.create({
    data: {
      userId,
      encryptedSecret: encrypted,
      iv,
      authTag,
      algorithm: "SHA1",
      digits: 6,
      period: 30,
      verified: false,
    },
  });

  const uri = generateTotpUri(secret, userEmail);
  return { secret, uri };
}

export async function verifyAndActivateMfa(userId: string, code: string) {
  const db = getDb();

  const mfaSecret = await db.userMfaSecret.findUnique({ where: { userId } });
  if (!mfaSecret) return { error: "MFA_NOT_SETUP" as const };
  if (mfaSecret.verified) return { error: "MFA_ALREADY_ACTIVE" as const };

  const secret = decryptSecret(mfaSecret.encryptedSecret, mfaSecret.iv, mfaSecret.authTag);
  const valid = verifyTotpCode(secret, code);
  if (!valid) return { error: "INVALID_CODE" as const };

  const recoveryCodes = generateRecoveryCodes();
  const codeHashes = recoveryCodes.map((c) => ({
    userId,
    codeHash: hashRecoveryCode(c),
  }));

  await db.$transaction([
    db.userMfaSecret.update({
      where: { userId },
      data: { verified: true, verifiedAt: new Date() },
    }),
    db.mfaRecoveryCode.createMany({ data: codeHashes }),
  ]);

  await audit({
    actorId: userId,
    actorRole: "USER",
    action: "mfa.activated",
    entity: "UserMfaSecret",
    entityId: mfaSecret.id,
  });

  return { recoveryCodes };
}

export async function verifyMfaCode(userId: string, code: string): Promise<{ valid: boolean }> {
  const db = getDb();
  const mfaSecret = await db.userMfaSecret.findUnique({ where: { userId } });
  if (!mfaSecret?.verified) return { valid: false };

  const secret = decryptSecret(mfaSecret.encryptedSecret, mfaSecret.iv, mfaSecret.authTag);
  return { valid: verifyTotpCode(secret, code) };
}

export async function verifyRecoveryCode(userId: string, code: string): Promise<{ valid: boolean; remainingCodes: number }> {
  const db = getDb();
  const codeHash = hashRecoveryCode(code);

  const existing = await db.mfaRecoveryCode.findUnique({
    where: { userId_codeHash: { userId, codeHash } },
  });

  if (!existing || existing.usedAt) {
    const remaining = await db.mfaRecoveryCode.count({ where: { userId, usedAt: null } });
    return { valid: false, remainingCodes: remaining };
  }

  await db.mfaRecoveryCode.update({
    where: { id: existing.id },
    data: { usedAt: new Date() },
  });

  await audit({
    actorId: userId,
    actorRole: "USER",
    action: "mfa.recovery_code_used",
    entity: "MfaRecoveryCode",
    entityId: existing.id,
  });

  const remaining = await db.mfaRecoveryCode.count({ where: { userId, usedAt: null } });
  return { valid: true, remainingCodes: remaining };
}

export async function deactivateMfa(userId: string) {
  const db = getDb();

  const mfaSecret = await db.userMfaSecret.findUnique({ where: { userId } });
  if (!mfaSecret?.verified) return { error: "MFA_NOT_ACTIVE" as const };

  await db.$transaction([
    db.userMfaSecret.delete({ where: { userId } }),
    db.mfaRecoveryCode.deleteMany({ where: { userId } }),
    db.mfaChallenge.deleteMany({ where: { userId } }),
  ]);

  await audit({
    actorId: userId,
    actorRole: "USER",
    action: "mfa.deactivated",
    entity: "User",
    entityId: userId,
  });

  return { ok: true };
}

export async function regenerateRecoveryCodes(userId: string) {
  const db = getDb();

  const mfaSecret = await db.userMfaSecret.findUnique({ where: { userId } });
  if (!mfaSecret?.verified) return { error: "MFA_NOT_ACTIVE" as const };

  const recoveryCodes = generateRecoveryCodes();
  const codeHashes = recoveryCodes.map((c) => ({
    userId,
    codeHash: hashRecoveryCode(c),
  }));

  await db.$transaction([
    db.mfaRecoveryCode.deleteMany({ where: { userId } }),
    db.mfaRecoveryCode.createMany({ data: codeHashes }),
  ]);

  await audit({
    actorId: userId,
    actorRole: "USER",
    action: "mfa.recovery_codes_regenerated",
    entity: "User",
    entityId: userId,
  });

  return { recoveryCodes };
}

export async function userHasMfaActive(userId: string): Promise<boolean> {
  const mfaSecret = await getDb().userMfaSecret.findUnique({ where: { userId } });
  return mfaSecret?.verified === true;
}

export async function getRemainingRecoveryCodes(userId: string): Promise<number> {
  return getDb().mfaRecoveryCode.count({ where: { userId, usedAt: null } });
}

export async function createMfaChallenge(userId: string, sessionId: string, purpose: string) {
  const db = getDb();
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MINUTES * 60 * 1000);

  const challenge = await db.mfaChallenge.create({
    data: { userId, sessionId, purpose, expiresAt, maxAttempts: CHALLENGE_MAX_ATTEMPTS },
  });

  return challenge;
}

export async function consumeMfaChallenge(challengeId: string, userId: string): Promise<{ ok: boolean; error?: string }> {
  const db = getDb();
  const challenge = await db.mfaChallenge.findFirst({
    where: { id: challengeId, userId },
  });

  if (!challenge) return { ok: false, error: "CHALLENGE_NOT_FOUND" };
  if (challenge.completedAt) return { ok: false, error: "CHALLENGE_ALREADY_COMPLETED" };
  if (challenge.expiresAt < new Date()) return { ok: false, error: "CHALLENGE_EXPIRED" };
  if (challenge.attempts >= challenge.maxAttempts) return { ok: false, error: "CHALLENGE_MAX_ATTEMPTS" };

  await db.mfaChallenge.update({
    where: { id: challengeId },
    data: { completedAt: new Date() },
  });

  return { ok: true };
}

export async function incrementChallengeAttempts(challengeId: string): Promise<{ exhausted: boolean }> {
  const db = getDb();
  const challenge = await db.mfaChallenge.update({
    where: { id: challengeId },
    data: { attempts: { increment: 1 } },
  });
  return { exhausted: challenge.attempts >= challenge.maxAttempts };
}

export async function hasRecentMfaVerification(userId: string, windowMinutes: number = 15): Promise<boolean> {
  const db = getDb();
  const since = new Date(Date.now() - windowMinutes * 60 * 1000);

  const recent = await db.mfaChallenge.findFirst({
    where: {
      userId,
      completedAt: { gte: since },
      purpose: { in: ["login", "reauth"] },
    },
    orderBy: { completedAt: "desc" },
  });

  return recent !== null;
}
