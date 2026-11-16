"use client";

import { Field, ServerForm, SubmitButton } from "@/components/ui";
import { EQUIPMENT_TYPE_SUGGESTIONS, VEHICLE_TYPE_SUGGESTIONS } from "@/lib/catalog/labels";
import type { ActionResult } from "@/lib/server/action-result";

type Action = (previous: ActionResult, formData: FormData) => Promise<ActionResult>;

/** Alta (placa, numero de unidad y tipo) y edicion (placa y tipo) de un vehiculo. */
export function VehicleForm({
  action,
  mode,
  initial,
}: {
  action: Action;
  mode: "create" | "edit";
  initial?: { plate: string; type: string };
}) {
  return (
    <ServerForm action={action} className="grid items-start gap-3 sm:grid-cols-2" label="Datos del vehículo" resetOnSuccess={mode === "create"} testId="vehicle-form">
      <Field
        defaultValue={initial?.plate ?? ""}
        help="Se usa para vincular sus documentos de cumplimiento."
        label="Placa"
        name="plate"
      />
      {mode === "create" ? (
        <Field help="Si lo deja vacío se usa la placa." label="Número de unidad" name="code" required={false} />
      ) : null}
      <Field defaultValue={initial?.type ?? ""} label="Tipo de vehículo" list="tipos-vehiculo" name="type" required={false} />
      <datalist id="tipos-vehiculo">
        {VEHICLE_TYPE_SUGGESTIONS.map((type) => (
          <option key={type} value={type} />
        ))}
      </datalist>
      <div className="sm:col-span-2">
        <SubmitButton>{mode === "create" ? "Agregar vehículo" : "Guardar cambios"}</SubmitButton>
      </div>
    </ServerForm>
  );
}

/** Alta (codigo y tipo) y edicion (tipo) de un equipo: chasis, remolque, plataforma, etc. */
export function EquipmentForm({
  action,
  mode,
  initial,
}: {
  action: Action;
  mode: "create" | "edit";
  initial?: { type: string };
}) {
  return (
    <ServerForm action={action} className="grid items-start gap-3 sm:grid-cols-2" label="Datos del equipo" resetOnSuccess={mode === "create"} testId="equipment-form">
      {mode === "create" ? (
        <Field help="El número o código con el que lo identifica, p. ej. CH-40-01." label="Código del equipo" name="code" />
      ) : null}
      <Field defaultValue={initial?.type ?? ""} label="Tipo de equipo" list="tipos-equipo" name="type" required={false} />
      <datalist id="tipos-equipo">
        {EQUIPMENT_TYPE_SUGGESTIONS.map((type) => (
          <option key={type} value={type} />
        ))}
      </datalist>
      <div className="sm:col-span-2">
        <SubmitButton>{mode === "create" ? "Agregar equipo" : "Guardar cambios"}</SubmitButton>
      </div>
    </ServerForm>
  );
}
