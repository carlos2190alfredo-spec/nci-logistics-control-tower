"use client";

import { Field, ServerForm, SubmitButton, TextArea } from "@/components/ui";
import type { ActionResult } from "@/lib/server/action-result";

export type CustomerFormValues = {
  name?: string | null;
  taxId?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  internalNotes?: string | null;
};

/** Formulario de alta y de edicion de un cliente (mismos campos; el codigo lo asigna el sistema). */
export function CustomerForm({
  action,
  initial,
  submitLabel,
  resetOnSuccess,
}: {
  action: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  initial?: CustomerFormValues;
  submitLabel: string;
  resetOnSuccess: boolean;
}) {
  const v = (value: string | null | undefined) => value ?? "";
  return (
    <ServerForm action={action} className="grid gap-4" label="Datos del cliente" resetOnSuccess={resetOnSuccess} testId="customer-form">
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <Field defaultValue={v(initial?.name)} label="Nombre o razón social" name="name" />
        <Field
          defaultValue={v(initial?.taxId)}
          help="Opcional. Se usará en documentos y facturación."
          label="RUC"
          name="taxId"
          required={false}
        />
        <Field defaultValue={v(initial?.contactName)} label="Nombre del contacto" name="contactName" required={false} />
        <Field
          defaultValue={v(initial?.contactEmail)}
          inputMode="email"
          label="Correo del contacto"
          name="contactEmail"
          required={false}
          type="email"
        />
        <Field
          defaultValue={v(initial?.contactPhone)}
          inputMode="tel"
          label="Teléfono del contacto"
          name="contactPhone"
          required={false}
        />
      </div>
      <details className="rounded-lg border border-border p-3" open={Boolean(initial?.address || initial?.internalNotes)}>
        <summary className="cursor-pointer text-sm font-semibold text-foreground">Más datos</summary>
        <div className="mt-3 grid gap-3">
          <Field defaultValue={v(initial?.address)} label="Dirección" name="address" required={false} />
          <TextArea
            defaultValue={v(initial?.internalNotes)}
            help="Solo las ve su equipo, nunca el cliente."
            label="Notas internas"
            name="internalNotes"
            required={false}
            rows={3}
          />
        </div>
      </details>
      <div>
        <SubmitButton>{submitLabel}</SubmitButton>
      </div>
    </ServerForm>
  );
}
