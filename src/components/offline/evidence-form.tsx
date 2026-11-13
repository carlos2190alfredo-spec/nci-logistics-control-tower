"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { AlertTriangle, PackageCheck } from "lucide-react";
import { EvidencePhotoCapture } from "@/components/offline/evidence-photo-capture";
import {
  MAX_UPLOAD_BYTES,
  PhotoTooLargeError,
  formatMegabytes,
  prepareEvidenceFile,
} from "@/components/offline/photo-compress";
import { SignaturePad } from "@/components/signature-pad";
import { ActionForm, Alert, Field, SubmitButton, TextArea } from "@/components/ui";
import { submitProofAction } from "@/lib/server/actions";
import type { OfflinePhoto } from "@/lib/offline/photo-store";

export function EvidenceForm({
  tenantSlug,
  tripId,
  ownerKey,
  proofRejected,
  rejectionReason,
}: {
  tenantSlug: string;
  tripId: string;
  ownerKey: string;
  proofRejected: boolean;
  rejectionReason?: string | null;
}) {
  const [photos, setPhotos] = useState<OfflinePhoto[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [preparingFile, setPreparingFile] = useState(false);
  const fileRequest = useRef(0);

  /**
   * El archivo del formulario viaja en la Server Action, que Vercel limita a ~4,5 MB:
   * las fotos se reducen en el navegador y lo que no cabe se rechaza aqui, con un mensaje,
   * en lugar de fallar en el servidor con una pagina de error.
   */
  async function handleEvidenceFileChange(event: ChangeEvent<HTMLElement>) {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== "file" || input.name !== "evidenceFile") return;

    const request = ++fileRequest.current;
    const file = input.files?.[0];
    setFileError(null);
    if (!file) {
      setPreparingFile(false);
      return;
    }

    setPreparingFile(true);
    try {
      const prepared = await prepareEvidenceFile(file);
      if (request !== fileRequest.current) return;
      if (prepared !== file) {
        try {
          const transfer = new DataTransfer();
          transfer.items.add(prepared);
          input.files = transfer.files;
        } catch {
          throw new PhotoTooLargeError("Su navegador no pudo reducir la foto. Use el boton Capturar foto.");
        }
      }
    } catch (error) {
      if (request !== fileRequest.current) return;
      input.value = "";
      setFileError(error instanceof PhotoTooLargeError ? error.message : "No se pudo procesar el archivo. Intente con otro.");
    } finally {
      if (request === fileRequest.current) setPreparingFile(false);
    }
  }

  const availableIds = photos
    .filter((p) => p.status === "AVAILABLE" && p.fileAttachmentId)
    .map((p) => p.fileAttachmentId!);
  const pendingSync = photos.filter(
    (p) => !["AVAILABLE", "CONFLICT", "FAILED"].includes(p.status),
  );
  const hasPendingPhotos = pendingSync.length > 0;

  return (
    <div className="mt-4 grid gap-3 rounded-xl border border-border bg-surface-sunken/60 p-3.5">
      <p className="flex items-center gap-2 text-sm font-bold text-foreground">
        <PackageCheck aria-hidden className="size-4.5 text-success" />
        Evidencia de entrega
      </p>
      {proofRejected && (
        <Alert tone="danger" title="Evidencia rechazada">
          {rejectionReason ?? "Vuelva a capturar la evidencia."}
        </Alert>
      )}
      {hasPendingPhotos && (
        <div className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-xs font-medium text-warning-strong">
          <AlertTriangle aria-hidden className="mt-0.5 size-3.5 shrink-0" />
          <span>
            {pendingSync.length} foto(s) aun se estan sincronizando. Espere a que
            terminen antes de enviar la evidencia para que se incluyan en el POD.
          </span>
        </div>
      )}
      <ActionForm action={submitProofAction.bind(null, tenantSlug)} className="grid gap-3">
        <input name="tripId" type="hidden" value={tripId} />
        <input name="availablePhotoIds" type="hidden" value={availableIds.join(",")} />
        <Field defaultValue="Receptor Demo" label="Nombre del receptor" name="receiverName" />
        <TextArea label="Observacion de entrega" name="observation" />
        <EvidencePhotoCapture
          ownerKey={ownerKey}
          tripId={tripId}
          onPhotosChange={setPhotos}
        />
        <div onChange={handleEvidenceFileChange}>
          <Field
            accept="image/jpeg,image/png,image/webp,application/pdf"
            help={`Formatos: JPG, PNG, WEBP o PDF. Maximo ${formatMegabytes(MAX_UPLOAD_BYTES)}; las fotos se reducen automaticamente.`}
            label="Fotografia o documento de evidencia"
            name="evidenceFile"
            type="file"
          />
        </div>
        {fileError ? <Alert tone="danger">{fileError}</Alert> : null}
        <SignaturePad />
        {/* Bloquea el envio (tambien con Enter) mientras se reduce la foto elegida. */}
        <fieldset className="min-w-0" disabled={preparingFile}>
          <SubmitButton className="w-full" size="lg" variant="success">
            Registrar evidencia y firma
          </SubmitButton>
        </fieldset>
      </ActionForm>
    </div>
  );
}
