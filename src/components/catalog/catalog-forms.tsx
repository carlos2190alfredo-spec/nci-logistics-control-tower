"use client";

import { CheckboxField, Field, ServerForm, SubmitButton } from "@/components/ui";
import type { ActionResult } from "@/lib/server/action-result";

type Action = (previous: ActionResult, formData: FormData) => Promise<ActionResult>;

export function LocationForm({
  action,
  mode,
  initial,
}: {
  action: Action;
  mode: "create" | "edit";
  initial?: { name: string; address: string };
}) {
  return (
    <ServerForm action={action} className="grid items-start gap-3 sm:grid-cols-2" label="Datos del lugar" resetOnSuccess={mode === "create"} testId="location-form">
      <Field
        defaultValue={initial?.name ?? ""}
        help="Tal como quiere verlo en los viajes, p. ej. «Patio Colón»."
        label="Nombre del lugar"
        name="name"
      />
      <Field defaultValue={initial?.address ?? ""} label="Dirección" name="address" required={false} />
      <div className="sm:col-span-2">
        <SubmitButton>{mode === "create" ? "Agregar lugar" : "Guardar cambios"}</SubmitButton>
      </div>
    </ServerForm>
  );
}

export function ServiceTypeForm({
  action,
  mode,
  initial,
}: {
  action: Action;
  mode: "create" | "edit";
  initial?: { name: string; requiresEquipment: boolean };
}) {
  return (
    <ServerForm action={action} className="grid gap-3" label="Datos del servicio" resetOnSuccess={mode === "create"} testId="service-type-form">
      <Field defaultValue={initial?.name ?? ""} label="Nombre del servicio" name="name" />
      <CheckboxField
        defaultChecked={initial?.requiresEquipment ?? true}
        help="Si la desmarca, podrá asignar el viaje sin equipo."
        label="Este servicio usa chasis o remolque"
        name="requiresEquipment"
      />
      <div>
        <SubmitButton>{mode === "create" ? "Crear servicio" : "Guardar cambios"}</SubmitButton>
      </div>
    </ServerForm>
  );
}
