"use client";

import { OfflineForm } from "@/components/offline/offline-form";
import { SubmitButton } from "@/components/ui/button";
import { TextArea } from "@/components/ui/field";

/**
 * Formulario de incidencia para operaciones. Usa la cola offline generica:
 * si hay conexion envia normal al server action; si no, encola y sincroniza
 * al recuperar senal. El actionId "incident.report" debe existir en
 * SYNC_ACTION_REGISTRY.
 */
export function OperationsIncidentForm({
  tripId,
  action,
}: {
  tripId: string;
  action: (formData: FormData) => Promise<unknown> | unknown;
}) {
  return (
    <OfflineForm
      action={action}
      actionId="incident.report"
      className="grid gap-2.5"
      offlineLabel="Registrar incidencia"
      offlineToast="Incidencia guardada localmente. Se enviara al recuperar conexion."
    >
      <input name="tripId" type="hidden" value={tripId} />
      <input name="category" type="hidden" value="Retraso" />
      <TextArea
        help="El cliente vera este mensaje en su portal."
        label="Incidencia visible al cliente"
        name="customerMessage"
      />
      <SubmitButton variant="accent">Registrar incidencia</SubmitButton>
    </OfflineForm>
  );
}
