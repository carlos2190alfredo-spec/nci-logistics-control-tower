import { PrismaClient } from "@/generated/prisma";

declare global {
  var __nciPrisma: PrismaClient | undefined;
}

export function getDb() {
  if (!globalThis.__nciPrisma) {
    globalThis.__nciPrisma = new PrismaClient();
  }

  return globalThis.__nciPrisma;
}
