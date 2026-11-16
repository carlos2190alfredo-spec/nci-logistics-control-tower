import { config } from "dotenv";
// Solo `.env.local` y `.env` (como los scripts del repositorio). NUNCA `.env.staging.local`: estas pruebas no
// deben poder apuntar a la nube. Las variables ya exportadas en la terminal tienen prioridad; la guarda lo valida.
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

import { PrismaClient } from "../../../src/generated/prisma";
import { getAppEnv } from "../../../src/lib/app-env";
import { evaluateTestDbGuard } from "../../../scripts/lib/db-test-guard";

export type Db = PrismaClient;

/**
 * Cliente de Prisma para las pruebas con base real. Lanza (no omite) si el destino no es la base local: una
 * prueba de base de datos que se salta en silencio da una falsa sensación de cobertura.
 */
export function connectTestDb(): Db {
  let appEnv;
  try {
    appEnv = getAppEnv();
  } catch (error) {
    throw new Error(`pnpm test:db BLOQUEADO: ${(error as Error).message}`);
  }
  const guard = evaluateTestDbGuard({ databaseUrl: process.env.DATABASE_URL, appEnv });
  if (!guard.ok) throw new Error(`pnpm test:db BLOQUEADO: ${guard.reason}`);
  return new PrismaClient();
}

export type Deferred<T = void> = { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void };

/** Promesa que se resuelve desde fuera: sirve para ordenar a mano dos transacciones. */
export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Falla con un mensaje claro si `promise` no termina en `ms` (p. ej. una consulta que debía NO esperar un bloqueo). */
export async function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: no terminó en ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
