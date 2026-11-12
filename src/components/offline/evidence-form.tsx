"use client";

import { useState } from "react";
import { AlertTriangle, PackageCheck } from "lucide-react";
import { EvidencePhotoCapture } from "@/components/offline/evidence-photo-capture";
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
        <Field
          accept="image/jpeg,image/png,image/webp,application/pdf"
          help="Formatos: JPG, PNG, WEBP o PDF."
          label="Fotografia o documento de evidencia"
          name="evidenceFile"
          type="file"
        />
        <SignaturePad />
        <SubmitButton size="lg" variant="success">
          Registrar evidencia y firma
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
