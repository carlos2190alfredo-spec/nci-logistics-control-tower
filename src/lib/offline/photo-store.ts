"use client";

/**
 * Offline photo storage in IndexedDB.
 * Photos are stored as blobs with metadata, keyed by a local ID.
 * EXIF stripping happens client-side before storage via stripExifClient().
 * Sync uploads photos via FormData to the server pipeline.
 *
 * Quota: max 50 photos per owner, max 10 MB per photo.
 * Photos older than 7 days auto-purge on next access.
 */

const PHOTO_DB_NAME = "nci-lct-photos";
const PHOTO_DB_VERSION = 1;
const PHOTO_STORE = "photos";
const MAX_PHOTOS_PER_OWNER = 50;
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type PhotoStatus =
  | "LOCAL_PENDING"
  | "READY_TO_UPLOAD"
  | "UPLOADING"
  | "UPLOADED_QUARANTINE"
  | "AVAILABLE"
  | "FAILED"
  | "CONFLICT";

export type OfflinePhoto = {
  localPhotoId: string;
  ownerKey: string;
  tripId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  blob: Blob;
  thumbnailDataUrl?: string;
  contentHash?: string;
  status: PhotoStatus;
  idempotencyKey: string;
  fileAttachmentId?: string;
  createdAt: number;
  lastAttemptAt?: number;
  attempts: number;
  errorDetail?: string;
};

function openPhotoDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(PHOTO_DB_NAME, PHOTO_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        const store = db.createObjectStore(PHOTO_STORE, { keyPath: "localPhotoId" });
        store.createIndex("owner_status", ["ownerKey", "status"], { unique: false });
        store.createIndex("owner_trip", ["ownerKey", "tripId"], { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Photo DB open failed"));
  });
}

async function withPhotoStore<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => Promise<T> | T): Promise<T> {
  const db = await openPhotoDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(PHOTO_STORE, mode);
      const store = tx.objectStore(PHOTO_STORE);
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

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

export async function storePhoto(photo: OfflinePhoto): Promise<void> {
  if (photo.sizeBytes > MAX_PHOTO_BYTES) {
    throw new Error(`Photo exceeds ${MAX_PHOTO_BYTES / 1024 / 1024} MB limit`);
  }

  const existing = await listPhotosForOwner(photo.ownerKey);
  if (existing.length >= MAX_PHOTOS_PER_OWNER) {
    throw new Error(`Photo quota exceeded (max ${MAX_PHOTOS_PER_OWNER})`);
  }

  await withPhotoStore("readwrite", (store) => req(store.put(photo)));
}

export async function getPhoto(localPhotoId: string): Promise<OfflinePhoto | undefined> {
  return withPhotoStore("readonly", (store) => req(store.get(localPhotoId)));
}

export async function updatePhoto(localPhotoId: string, patch: Partial<OfflinePhoto>): Promise<void> {
  await withPhotoStore("readwrite", async (store) => {
    const existing = await req(store.get(localPhotoId));
    if (!existing) return;
    await req(store.put({ ...existing, ...patch }));
  });
}

export async function removePhoto(localPhotoId: string): Promise<void> {
  await withPhotoStore("readwrite", (store) => req(store.delete(localPhotoId)));
}

export async function listPhotosForOwner(ownerKey: string): Promise<OfflinePhoto[]> {
  return withPhotoStore("readonly", async (store) => {
    const index = store.index("owner_status");
    const items: OfflinePhoto[] = [];
    for (const status of ["LOCAL_PENDING", "READY_TO_UPLOAD", "UPLOADING", "UPLOADED_QUARANTINE", "AVAILABLE", "FAILED", "CONFLICT"] as PhotoStatus[]) {
      const range = IDBKeyRange.only([ownerKey, status]);
      await new Promise<void>((resolve, reject) => {
        const cursor = index.openCursor(range);
        cursor.onsuccess = () => {
          const c = cursor.result;
          if (!c) return resolve();
          items.push(c.value as OfflinePhoto);
          c.continue();
        };
        cursor.onerror = () => reject(cursor.error);
      });
    }
    return items;
  });
}

export async function listPendingPhotos(ownerKey: string): Promise<OfflinePhoto[]> {
  return withPhotoStore("readonly", async (store) => {
    const index = store.index("owner_status");
    const range = IDBKeyRange.only([ownerKey, "READY_TO_UPLOAD"]);
    const items: OfflinePhoto[] = [];
    return new Promise((resolve, reject) => {
      const cursor = index.openCursor(range);
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return resolve(items);
        items.push(c.value as OfflinePhoto);
        c.continue();
      };
      cursor.onerror = () => reject(cursor.error);
    });
  });
}

export async function purgeExpiredPhotos(ownerKey: string): Promise<number> {
  const cutoff = Date.now() - PHOTO_TTL_MS;
  return withPhotoStore("readwrite", async (store) => {
    let purged = 0;
    return new Promise<number>((resolve, reject) => {
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return resolve(purged);
        const photo = c.value as OfflinePhoto;
        if (photo.ownerKey === ownerKey && photo.createdAt < cutoff) {
          c.delete();
          purged++;
        }
        c.continue();
      };
      cursor.onerror = () => reject(cursor.error);
    });
  });
}

export async function purgeOwnerPhotos(ownerKey: string): Promise<number> {
  return withPhotoStore("readwrite", async (store) => {
    let purged = 0;
    return new Promise<number>((resolve, reject) => {
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return resolve(purged);
        const photo = c.value as OfflinePhoto;
        if (photo.ownerKey === ownerKey) {
          c.delete();
          purged++;
        }
        c.continue();
      };
      cursor.onerror = () => reject(cursor.error);
    });
  });
}

/**
 * Client-side EXIF stripping for JPEG.
 * Removes APP1 (Exif), APP2 (ICC), APP12, APP13 (IPTC), COM markers.
 */
export function stripExifClient(arrayBuffer: ArrayBuffer): ArrayBuffer {
  const view = new Uint8Array(arrayBuffer);
  if (view.length < 4 || view[0] !== 0xff || view[1] !== 0xd8) return arrayBuffer;

  const result: Uint8Array[] = [new Uint8Array([0xff, 0xd8])];
  let offset = 2;

  while (offset < view.length - 1) {
    if (view[offset] !== 0xff) break;
    const marker = view[offset + 1];

    if (marker === 0xd9 || marker === 0xda) {
      result.push(view.slice(offset));
      break;
    }

    if (offset + 3 >= view.length) break;
    const segLen = (view[offset + 2] << 8) | view[offset + 3];
    const total = 2 + segLen;

    const strip = marker === 0xe1 || marker === 0xe2 || marker === 0xec || marker === 0xed || marker === 0xfe;
    if (strip) {
      offset += total;
      continue;
    }

    result.push(view.slice(offset, offset + total));
    offset += total;
  }

  let totalLen = 0;
  for (const chunk of result) totalLen += chunk.length;
  const out = new Uint8Array(totalLen);
  let pos = 0;
  for (const chunk of result) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out.buffer;
}

export async function listPhotosForTrip(ownerKey: string, tripId: string): Promise<OfflinePhoto[]> {
  return withPhotoStore("readonly", async (store) => {
    const index = store.index("owner_trip");
    const range = IDBKeyRange.only([ownerKey, tripId]);
    const items: OfflinePhoto[] = [];
    return new Promise((resolve, reject) => {
      const cursor = index.openCursor(range);
      cursor.onsuccess = () => {
        const c = cursor.result;
        if (!c) return resolve(items);
        items.push(c.value as OfflinePhoto);
        c.continue();
      };
      cursor.onerror = () => reject(cursor.error);
    });
  });
}

export async function computeContentHash(buffer: ArrayBuffer): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createThumbnailDataUrl(blob: Blob, maxSize = 120): Promise<string> {
  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(maxSize / bitmap.width, maxSize / bitmap.height, 1);
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = new OffscreenCanvas(w, h);
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const thumbBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.6 });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(thumbBlob);
  });
}
