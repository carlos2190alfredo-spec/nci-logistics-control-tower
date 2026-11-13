"use client";

import { useCallback, useEffect, useState } from "react";
import { Camera, ImageIcon, Trash2, Loader2 } from "lucide-react";
import {
  MAX_RAW_IMAGE_BYTES,
  MAX_UPLOAD_BYTES,
  PhotoTooLargeError,
  formatMegabytes,
  prepareImageForUpload,
} from "@/components/offline/photo-compress";
import {
  storePhoto,
  listPhotosForTrip,
  removePhoto,
  updatePhoto,
  stripExifClient,
  computeContentHash,
  createThumbnailDataUrl,
  type OfflinePhoto,
} from "@/lib/offline/photo-store";

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];

/** Fotos guardadas antes del limite de 3 MB que aun esperan subir (el servidor las rechazaria). */
function isOversizedPending(photo: OfflinePhoto) {
  return photo.sizeBytes > MAX_UPLOAD_BYTES && ["READY_TO_UPLOAD", "LOCAL_PENDING"].includes(photo.status);
}

/**
 * Reduce en el sitio las fotos pendientes que quedaron guardadas por encima del limite de
 * subida; las que no se pueden reducir se marcan como fallidas (con motivo) para que el
 * chofer las elimine y vuelva a capturar en vez de reintentar para siempre.
 */
async function shrinkOversizedPhotos(photos: OfflinePhoto[]) {
  for (const photo of photos.filter(isOversizedPending)) {
    try {
      const source = new File([photo.blob], photo.filename, { type: photo.mimeType });
      // Pesa mas que el limite: o se reduce (reencoded) o lanza PhotoTooLargeError.
      const prepared = await prepareImageForUpload(source);
      await updatePhoto(photo.localPhotoId, {
        blob: prepared.blob,
        filename: prepared.filename,
        mimeType: prepared.mimeType,
        sizeBytes: prepared.blob.size,
        contentHash: await computeContentHash(await prepared.blob.arrayBuffer()),
        attempts: 0,
        errorDetail: undefined,
      });
    } catch {
      await updatePhoto(photo.localPhotoId, {
        status: "FAILED",
        errorDetail: `Foto demasiado pesada (maximo ${formatMegabytes(MAX_UPLOAD_BYTES)}). Eliminela y capture otra.`,
      });
    }
  }
}

function generateId() {
  if ("randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function EvidencePhotoCapture({
  ownerKey,
  tripId,
  onPhotosChange,
}: {
  ownerKey: string;
  tripId: string;
  onPhotosChange?: (photos: OfflinePhoto[]) => void;
}) {
  const [photos, setPhotos] = useState<OfflinePhoto[]>([]);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let list = await listPhotosForTrip(ownerKey, tripId);
      if (list.some(isOversizedPending)) {
        await shrinkOversizedPhotos(list);
        list = await listPhotosForTrip(ownerKey, tripId);
      }
      if (cancelled) return;
      setPhotos(list);
      onPhotosChange?.(list);
    })().catch(() => {
      // IndexedDB no disponible: la lista queda vacia y la captura sigue mostrando su error propio.
    });
    return () => { cancelled = true; };
  }, [ownerKey, tripId, onPhotosChange, refreshKey]);

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1);
  }, []);

  const handleCapture = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      e.target.value = "";

      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError("Formato no soportado. Use JPG, PNG o WEBP.");
        return;
      }
      if (file.size > MAX_RAW_IMAGE_BYTES) {
        setError(`La foto excede el limite de ${formatMegabytes(MAX_RAW_IMAGE_BYTES)}.`);
        return;
      }

      setError(null);
      setProcessing(true);

      try {
        // Reduce la foto para que quepa en el limite de subida (Vercel ~4,5 MB por peticion).
        const prepared = await prepareImageForUpload(file);
        let buffer = await prepared.blob.arrayBuffer();

        // Una foto recodificada ya no trae EXIF; el original se limpia a nivel de bytes.
        if (prepared.mimeType === "image/jpeg" && !prepared.reencoded) {
          buffer = stripExifClient(buffer);
        }

        const blob = new Blob([buffer], { type: prepared.mimeType });
        if (blob.size > MAX_UPLOAD_BYTES) {
          throw new PhotoTooLargeError(
            `La foto es demasiado pesada (maximo ${formatMegabytes(MAX_UPLOAD_BYTES)}). Tome otra foto con menor resolucion.`,
          );
        }
        const [contentHash, thumbnailDataUrl] = await Promise.all([
          computeContentHash(buffer),
          createThumbnailDataUrl(blob),
        ]);

        const idempotencyKey = generateId();
        const photo: OfflinePhoto = {
          localPhotoId: generateId(),
          ownerKey,
          tripId,
          filename: prepared.filename,
          mimeType: prepared.mimeType,
          sizeBytes: blob.size,
          blob,
          thumbnailDataUrl,
          contentHash,
          status: "READY_TO_UPLOAD",
          idempotencyKey,
          createdAt: Date.now(),
          attempts: 0,
        };

        await storePhoto(photo);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al procesar la foto.");
      } finally {
        setProcessing(false);
      }
    },
    [ownerKey, tripId, refresh],
  );

  const handleRemove = useCallback(
    async (localPhotoId: string) => {
      await removePhoto(localPhotoId);
      await refresh();
    },
    [refresh],
  );

  const uploadable = photos.filter((p) => !["AVAILABLE", "CONFLICT"].includes(p.status));
  const failedDetail = photos.find((p) => p.status === "FAILED" && p.errorDetail)?.errorDetail;

  return (
    <div className="grid gap-2">
      <p className="text-sm font-medium text-foreground">Fotos de evidencia</p>

      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {photos.map((photo) => (
            <div
              className="group relative size-20 overflow-hidden rounded-lg border border-border bg-surface-sunken"
              key={photo.localPhotoId}
            >
              {photo.thumbnailDataUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element -- data URL from IndexedDB */
                <img
                  alt={photo.filename}
                  className="size-full object-cover"
                  src={photo.thumbnailDataUrl}
                />
              ) : (
                <div className="grid size-full place-items-center">
                  <ImageIcon className="size-6 text-muted-foreground" />
                </div>
              )}
              <PhotoStatusBadge status={photo.status} />
              {["READY_TO_UPLOAD", "FAILED", "LOCAL_PENDING"].includes(photo.status) && (
                <button
                  aria-label="Eliminar foto"
                  className="absolute right-0.5 top-0.5 rounded-full bg-danger p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => handleRemove(photo.localPhotoId)}
                  type="button"
                >
                  <Trash2 className="size-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-xs font-medium text-danger-strong">{error}</p>
      )}
      {!error && failedDetail && (
        <p className="text-xs font-medium text-danger-strong">{failedDetail}</p>
      )}

      <label className="inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-muted">
        {processing ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Procesando...
          </>
        ) : (
          <>
            <Camera className="size-4" />
            Capturar foto
          </>
        )}
        <input
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="sr-only"
          disabled={processing}
          onChange={handleCapture}
          type="file"
        />
      </label>

      <p className="text-xs text-muted-foreground">
        {photos.length}/50 fotos · {uploadable.length > 0 ? `${uploadable.length} pendiente(s) de sincronizar` : "Todas sincronizadas"}
      </p>

      <input name="offlinePhotoCount" type="hidden" value={photos.length} />
      <input name="offlinePhotoIds" type="hidden" value={photos.map((p) => p.localPhotoId).join(",")} />
    </div>
  );
}

function PhotoStatusBadge({ status }: { status: OfflinePhoto["status"] }) {
  const config: Record<string, { bg: string; label: string }> = {
    LOCAL_PENDING: { bg: "bg-warning", label: "Procesando" },
    READY_TO_UPLOAD: { bg: "bg-info", label: "Pendiente" },
    UPLOADING: { bg: "bg-primary", label: "Subiendo" },
    UPLOADED_QUARANTINE: { bg: "bg-warning", label: "Verificando" },
    AVAILABLE: { bg: "bg-success", label: "Listo" },
    FAILED: { bg: "bg-danger", label: "Error" },
    CONFLICT: { bg: "bg-danger", label: "Conflicto" },
  };
  const c = config[status] ?? { bg: "bg-muted", label: status };
  return (
    <span className={`absolute bottom-0 inset-x-0 py-0.5 text-center text-[9px] font-bold text-white ${c.bg}`}>
      {c.label}
    </span>
  );
}
