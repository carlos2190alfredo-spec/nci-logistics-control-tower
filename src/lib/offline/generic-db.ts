"use client";

/**
 * IndexedDB para la cola offline GENÉRICA (acciones no-conductor).
 * Base independiente de `nci-lct-driver` para evitar migraciones cruzadas
 * y aislar el ciclo de vida de cada cola.
 *
 * Aislamiento: cada record guarda `ownerKey = userId:tenantId`.
 */

export const SYNC_DB_NAME = "nci-lct-sync";
export const SYNC_DB_VERSION = 1;
export const SYNC_STORE = "actions";

export type SyncLocalStatus =
  | "PENDING"
  | "SYNCING"
  | "SYNCED"
  | "RETRYABLE_ERROR"
  | "REJECTED"
  | "DISCARDED";

export type SyncLocalRecord = {
  localId: string;
  ownerKey: string;
  tenantSlug: string;
  actionId: string;
  status: SyncLocalStatus;
  attempts: number;
  createdAt: number;
  queuedAt: number;
  lastAttemptAt?: number;
  nextRetryAt?: number;
  lastErrorCode?: string;
  localSequence: number;
  /** Payload completo listo para POST al endpoint /api/sync/actions. */
  action: unknown;
  serverEntityId?: string;
  serverTimestamp?: string;
  /** Texto humano opcional para el badge (ej. "Crear solicitud CLIENTE X"). */
  label?: string;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SYNC_DB_NAME, SYNC_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SYNC_STORE)) {
        const store = db.createObjectStore(SYNC_STORE, { keyPath: "localId" });
        store.createIndex("owner_status", ["ownerKey", "status"], { unique: false });
        store.createIndex("owner_sequence", ["ownerKey", "localSequence"], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(SYNC_STORE, mode);
      const store = tx.objectStore(SYNC_STORE);
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

function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putSyncRecord(record: SyncLocalRecord) {
  await withStore("readwrite", async (store) => req(store.put(record)));
}

export async function updateSyncRecord(localId: string, patch: Partial<SyncLocalRecord>) {
  await withStore("readwrite", async (store) => {
    const existing = await req(store.get(localId));
    if (!existing) return;
    await req(store.put({ ...existing, ...patch }));
  });
}

export async function removeSyncRecord(localId: string) {
  await withStore("readwrite", async (store) => req(store.delete(localId)));
}

export async function listSyncRecordsForOwner(ownerKey: string): Promise<SyncLocalRecord[]> {
  return withStore("readonly", async (store) => {
    const index = store.index("owner_sequence");
    const range = IDBKeyRange.bound([ownerKey, 0], [ownerKey, Number.MAX_SAFE_INTEGER]);
    return new Promise<SyncLocalRecord[]>((resolve, reject) => {
      const items: SyncLocalRecord[] = [];
      const request = index.openCursor(range);
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve(items);
        const record = cursor.value as SyncLocalRecord;
        if (record.ownerKey === ownerKey) items.push(record);
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export async function nextSyncSequence(ownerKey: string): Promise<number> {
  const existing = await listSyncRecordsForOwner(ownerKey);
  return existing.reduce((max, record) => Math.max(max, record.localSequence), 0) + 1;
}

export async function purgeSyncOwner(ownerKey: string): Promise<number> {
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

export async function purgeSyncedOlderThan(ownerKey: string, maxAgeMs: number) {
  const cutoff = Date.now() - maxAgeMs;
  await withStore("readwrite", async (store) => {
    return new Promise<void>((resolve, reject) => {
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve();
        const record = cursor.value as SyncLocalRecord;
        if (record.ownerKey === ownerKey && record.status === "SYNCED" && record.queuedAt < cutoff) {
          cursor.delete();
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error);
    });
  });
}

export function computeSyncOwnerKey(input: { userId: string; tenantId: string }) {
  return `${input.userId}::${input.tenantId}`;
}
