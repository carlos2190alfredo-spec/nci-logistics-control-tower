"use client";

import { useState } from "react";
import { PackageCheck } from "lucide-react";
import { EvidencePhotoCapture } from "@/components/offline/evidence-photo-capture";
import { SignaturePad } from "@/components/signature-pad";
import { Alert, Field, SubmitButton, TextArea } from "@/components/ui";
import { submitProofAction } from "@/lib/server/actions";

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
  const [, setPhotoCount] = useState(0);

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
      <form action={submitProofAction.bind(null, tenantSlug)} className="grid gap-3">
        <input name="tripId" type="hidden" value={tripId} />
        <Field defaultValue="Receptor Demo" label="Nombre del receptor" name="receiverName" />
        <TextArea label="Observacion de entrega" name="observation" />
        <EvidencePhotoCapture
          ownerKey={ownerKey}
          tripId={tripId}
          onPhotoCountChange={setPhotoCount}
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
      </form>
    </div>
  );
}
