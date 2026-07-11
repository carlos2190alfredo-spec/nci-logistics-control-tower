"use client";

import {
  listPendingPhotos,
  listPhotosForOwner,
  updatePhoto,
  removePhoto,
  type OfflinePhoto,
  type PhotoStatus,
} from "@/lib/offline/photo-store";
import type { QueueOwner } from "@/lib/offline/queue";

const MAX_CONCURRENT = 2;
const MAX_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 16_000;
const QUARANTINE_POLL_MS = 10_000;
const AVAILABLE_CLEANUP_MS = 24 * 60 * 60 * 1000;

export type PhotoSyncEvent =
  | { type: "upload_start"; localPhotoId: string }
  | { type: "upload_progress"; localPhotoId: string; status: PhotoStatus }
  | { type: "upload_complete"; localPhotoId: string; fileAttachmentId: string }
  | { type: "upload_failed"; localPhotoId: string; error: string; retriable: boolean }
  | { type: "conflict"; localPhotoId: string }
  | { type: "cleanup"; localPhotoId: string }
  | { type: "cycle_complete"; uploaded: number; failed: number; pending: number };

export type PhotoSyncListener = (event: PhotoSyncEvent) => void;

function backoffMs(attempt: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attempt, MAX_BACKOFF_MS);
}

function ownerKey(owner: QueueOwner): string {
  return `${owner.userId}::${owner.tenantId}::${owner.driverId ?? "no-driver"}`;
}

export async function runPhotoSyncCycle(
  owner: QueueOwner,
  listener?: PhotoSyncListener,
): Promise<{ uploaded: number; failed: number; pending: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { uploaded: 0, failed: 0, pending: 0 };
  }

  const key = ownerKey(owner);
  const pending = await listPendingPhotos(key);
  if (pending.length === 0) {
    await cleanupAvailablePhotos(key, listener);
    await pollQuarantinePhotos(key, owner, listener);
    return { uploaded: 0, failed: 0, pending: 0 };
  }

  const eligible = pending.filter((p) => {
    if (p.attempts >= MAX_ATTEMPTS) return false;
    if (p.lastAttemptAt) {
      const wait = backoffMs(p.attempts);
      if (Date.now() - p.lastAttemptAt < wait) return false;
    }
    return true;
  });

  let uploaded = 0;
  let failed = 0;

  const batches: OfflinePhoto[][] = [];
  for (let i = 0; i < eligible.length; i += MAX_CONCURRENT) {
    batches.push(eligible.slice(i, i + MAX_CONCURRENT));
  }

  for (const batch of batches) {
    const results = await Promise.allSettled(
      batch.map((photo) => uploadSinglePhoto(photo, owner, listener)),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) uploaded++;
      else failed++;
    }
  }

  await cleanupAvailablePhotos(key, listener);
  await pollQuarantinePhotos(key, owner, listener);

  const remainingPending = await listPendingPhotos(key);
  const result = { uploaded, failed, pending: remainingPending.length };
  listener?.({ type: "cycle_complete", ...result });
  return result;
}

async function uploadSinglePhoto(
  photo: OfflinePhoto,
  owner: QueueOwner,
  listener?: PhotoSyncListener,
): Promise<boolean> {
  listener?.({ type: "upload_start", localPhotoId: photo.localPhotoId });

  await updatePhoto(photo.localPhotoId, {
    status: "UPLOADING",
    lastAttemptAt: Date.now(),
    attempts: photo.attempts + 1,
  });
  listener?.({ type: "upload_progress", localPhotoId: photo.localPhotoId, status: "UPLOADING" });

  try {
    const formData = new FormData();
    formData.append("idempotencyKey", photo.idempotencyKey);
    formData.append("tripId", photo.tripId);
    if (photo.contentHash) formData.append("contentHash", photo.contentHash);
    formData.append("file", photo.blob, photo.filename);

    const response = await fetch(`/api/t/${owner.tenantSlug}/driver/attachment`, {
      method: "POST",
      credentials: "same-origin",
      body: formData,
    });

    if (response.status === 401 || response.status === 403) {
      await updatePhoto(photo.localPhotoId, {
        status: "FAILED",
        errorDetail: "Sesion expirada",
      });
      listener?.({ type: "upload_failed", localPhotoId: photo.localPhotoId, error: "Sesion expirada", retriable: false });
      return false;
    }

    if (response.status === 429) {
      await updatePhoto(photo.localPhotoId, {
        status: "READY_TO_UPLOAD",
        errorDetail: "Demasiadas solicitudes",
      });
      listener?.({ type: "upload_failed", localPhotoId: photo.localPhotoId, error: "Rate limited", retriable: true });
      return false;
    }

    if (!response.ok) {
      await updatePhoto(photo.localPhotoId, {
        status: "READY_TO_UPLOAD",
        errorDetail: `HTTP ${response.status}`,
      });
      listener?.({ type: "upload_failed", localPhotoId: photo.localPhotoId, error: `HTTP ${response.status}`, retriable: true });
      return false;
    }

    const body = await response.json() as {
      receipt: string;
      fileAttachmentId?: string;
      fileStatus?: string;
    };

    if (body.receipt === "DUPLICATE" || body.receipt === "ACCEPTED" || body.receipt === "COMPLETE") {
      const newStatus: PhotoStatus = body.fileStatus === "AVAILABLE" || body.fileStatus === "CLEAN"
        ? "AVAILABLE"
        : "UPLOADED_QUARANTINE";

      await updatePhoto(photo.localPhotoId, {
        status: newStatus,
        fileAttachmentId: body.fileAttachmentId,
        errorDetail: undefined,
      });

      if (newStatus === "AVAILABLE") {
        listener?.({ type: "upload_complete", localPhotoId: photo.localPhotoId, fileAttachmentId: body.fileAttachmentId ?? "" });
      } else {
        listener?.({ type: "upload_progress", localPhotoId: photo.localPhotoId, status: newStatus });
      }
      return true;
    }

    if (body.receipt === "REJECTED") {
      await updatePhoto(photo.localPhotoId, {
        status: "CONFLICT",
        fileAttachmentId: body.fileAttachmentId,
        errorDetail: "Archivo rechazado por el servidor",
      });
      listener?.({ type: "conflict", localPhotoId: photo.localPhotoId });
      return false;
    }

    if (body.receipt === "PENDING" || body.receipt === "PROCESSING") {
      await updatePhoto(photo.localPhotoId, {
        status: "UPLOADED_QUARANTINE",
        fileAttachmentId: body.fileAttachmentId,
        errorDetail: undefined,
      });
      listener?.({ type: "upload_progress", localPhotoId: photo.localPhotoId, status: "UPLOADED_QUARANTINE" });
      return true;
    }

    await updatePhoto(photo.localPhotoId, {
      status: "READY_TO_UPLOAD",
      errorDetail: `Respuesta inesperada: ${body.receipt}`,
    });
    listener?.({ type: "upload_failed", localPhotoId: photo.localPhotoId, error: `Unknown receipt: ${body.receipt}`, retriable: true });
    return false;
  } catch (error) {
    await updatePhoto(photo.localPhotoId, {
      status: "READY_TO_UPLOAD",
      errorDetail: error instanceof Error ? error.message : "Error de red",
    });
    listener?.({
      type: "upload_failed",
      localPhotoId: photo.localPhotoId,
      error: error instanceof Error ? error.message : "Error de red",
      retriable: true,
    });
    return false;
  }
}

async function pollQuarantinePhotos(
  key: string,
  owner: QueueOwner,
  listener?: PhotoSyncListener,
): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const allPhotos = await listPhotosForOwner(key);
  const quarantined = allPhotos.filter(
    (p) => p.status === "UPLOADED_QUARANTINE" && p.fileAttachmentId,
  );

  for (const photo of quarantined) {
    if (photo.lastAttemptAt && Date.now() - photo.lastAttemptAt < QUARANTINE_POLL_MS) {
      continue;
    }

    try {
      const response = await fetch(
        `/api/t/${owner.tenantSlug}/driver/attachment?idempotencyKey=${encodeURIComponent(photo.idempotencyKey)}`,
        { credentials: "same-origin" },
      );

      if (!response.ok) continue;

      const body = await response.json() as {
        receipt: string;
        fileAttachmentId?: string;
        fileStatus?: string;
      };

      await updatePhoto(photo.localPhotoId, { lastAttemptAt: Date.now() });

      if (body.fileStatus === "AVAILABLE" || body.fileStatus === "CLEAN") {
        await updatePhoto(photo.localPhotoId, {
          status: "AVAILABLE",
          fileAttachmentId: body.fileAttachmentId ?? photo.fileAttachmentId,
        });
        listener?.({ type: "upload_complete", localPhotoId: photo.localPhotoId, fileAttachmentId: body.fileAttachmentId ?? "" });
      } else if (body.fileStatus === "INFECTED" || body.receipt === "REJECTED") {
        await updatePhoto(photo.localPhotoId, {
          status: "CONFLICT",
          errorDetail: "Archivo rechazado por escaneo de seguridad",
        });
        listener?.({ type: "conflict", localPhotoId: photo.localPhotoId });
      }
    } catch {
      // Network error during poll — will retry next cycle
    }
  }
}

async function cleanupAvailablePhotos(
  key: string,
  listener?: PhotoSyncListener,
): Promise<void> {
  const allPhotos = await listPhotosForOwner(key);
  const availableOld = allPhotos.filter(
    (p) => p.status === "AVAILABLE" && Date.now() - p.createdAt > AVAILABLE_CLEANUP_MS,
  );

  for (const photo of availableOld) {
    await removePhoto(photo.localPhotoId);
    listener?.({ type: "cleanup", localPhotoId: photo.localPhotoId });
  }
}
