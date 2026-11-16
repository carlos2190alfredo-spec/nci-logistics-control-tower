import { PrismaClient } from "../../src/generated/prisma";

/**
 * Playwright globalSetup: limpia los buckets de rate-limit relacionados con
 * autenticación antes de la corrida completa. Sin esto, especs que repiten
 * logins con MFA (mismo owner) agotan la ventana de `mfa.verify` /
 * `auth.login` y hacen que tests tardíos fallen con "Demasiados intentos".
 */
export default async function globalSetup() {
  const db = new PrismaClient();
  try {
    await db.rateLimitBucket.deleteMany({
      where: {
        scope: {
          in: ["mfa.verify", "auth.mfa.verify", "auth.login", "login", "auth.invitation.accept"],
        },
      },
    });
  } finally {
    await db.$disconnect();
  }
}
