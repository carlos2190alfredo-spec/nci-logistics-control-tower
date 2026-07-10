"use client";

/**
 * Wrapper mínimo sobre IndexedDB para la cola offline del conductor.
 * Sin dependencias externas.
 *
 * Aislamiento: cada registro guarda `ownerKey = userId:tenantId:driverId`.
 * Todas las consultas se filtran por ownerKey; una sesión NUNCA ve datos de otra.
 */

export const DB_NAME = "nci-lct-driver";
export const DB_VERSION = 1;
export const COMMAND_STORE = "commands";

export type LocalCommandStatus =
  | "PENDING"
  | "SYNCING"
  | "SYNCED"
  | "RETRYABLE_ERROR"
  | "CONFLICT"
  | "REJECTED"
  | "DISCARDED";

export type LocalCommandRecord = {
  localCommandId: string;
  ownerKey: string;
  tenantSlug: string;
  actionType: "trip.transition" | "trip.incident";
  status: LocalCommandStatus;
  attempts: number;
  createdAt: number;
  queuedAt: number;
  lastAttemptAt?: number;
  nextRetryAt?: number;
  lastErrorCode?: string;
  localSequence: number;
  command: unknown;
  serverEventId?: string;
  serverTimestamp?: string;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(COMMAND_STORE)) {
        const store = db.createObjectStore(COMMAND_STORE, { keyPath: "localCommandId" });
        store.createIndex("owner_status", ["ownerKey", "status"], { unique: false });
        store.createIndex("owner_sequence", ["ownerKey", "localSequence"], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(COMMAND_STORE, mode);
      const store = tx.objectStore(COMMAND_STORE);
      Promise.resolve()
        .then(() => fn(store))
        .then((value) => {
          tx.oncomplete = () => resolve(value);
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error);
        })
        .catch(reject);
    });
  } finally {
    db.close();
  }
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putCommand(record: LocalCommandRecord) {
  await withStore("readwrite", async (store) => requestToPromise(store.put(record)));
}

export async function updateCommand(localCommandId: string, patch: Partial<LocalCommandRecord>) {
  await withStore("readwrite", async (store) => {
    const existing = await requestToPromise(store.get(localCommandId));
    if (!existing) return;
    await requestToPromise(store.put({ ...existing, ...patch }));
  });
}

export async function removeCommand(localCommandId: string) {
  await withStore("readwrite", async (store) => requestToPromise(store.delete(localCommandId)));
}

export async function getPendingCommandsForOwner(ownerKey: string): Promise<LocalCommandRecord[]> {
  return withStore("readonly", async (store) => {
    const index = store.index("owner_sequence");
    const range = IDBKeyRange.bound([ownerKey, 0], [ownerKey, Number.MAX_SAFE_INTEGER]);
    const items: LocalCommandRecord[] = [];
    return new Promise<LocalCommandRecord[]>((resolve, reject) => {
      const request = index.openCursor(range);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve(items);
        const record = cursor.value as LocalCommandRecord;
        if (record.ownerKey === ownerKey) items.push(record);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function nextLocalSequence(ownerKey: string): Promise<number> {
  const existing = await getPendingCommandsForOwner(ownerKey);
  return existing.reduce((max, record) => Math.max(max, record.localSequence), 0) + 1;
}

/**
 * Elimina TODOS los comandos de un ownerKey. Usado en cleanup por logout o
 * al descartar acciones pendientes con confirmación.
 */
export async function purgeOwner(ownerKey: string): Promise<number> {
  return withStore("readwrite", async (store) => {
    const index = store.index("owner_sequence");
    const range = IDBKeyRange.bound([ownerKey, 0], [ownerKey, Number.MAX_SAFE_INTEGER]);
    let deleted = 0;
    return new Promise<number>((resolve, reject) => {
      const request = index.openCursor(range);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve(deleted);
        cursor.delete();
        deleted += 1;
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  });
}

/** Elimina comandos SYNCED antiguos (>24h) para el owner dado. */
export async function purgeSyncedOlderThan(ownerKey: string, maxAgeMs: number) {
  const cutoff = Date.now() - maxAgeMs;
  await withStore("readwrite", async (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve();
        const record = cursor.value as LocalCommandRecord;
        if (record.ownerKey === ownerKey && record.status === "SYNCED" && record.queuedAt < cutoff) {
          cursor.delete();
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export function computeOwnerKey(input: { userId: string; tenantId: string; driverId: string | null }) {
  return `${input.userId}::${input.tenantId}::${input.driverId ?? "no-driver"}`;
}
