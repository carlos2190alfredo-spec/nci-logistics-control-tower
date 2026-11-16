"use client";

import { Field, SelectField, ServerForm, SubmitButton } from "@/components/ui";
import { PORTAL_ROLE_OPTIONS } from "@/lib/catalog/labels";
import type { ActionResult } from "@/lib/server/action-result";

/** "Dar acceso al portal": sin campo de contrasena; la persona crea la suya con un enlace de un solo uso. */
export function PortalUserForm({
  action,
  customerAccountId,
}: {
  action: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  customerAccountId: string;
}) {
  return (
    <ServerForm action={action} className="grid items-start gap-3 sm:grid-cols-2" label="Dar acceso al portal" testId="portal-user-form">
      <input name="customerAccountId" type="hidden" value={customerAccountId} />
      <Field label="Nombre de la persona" name="name" />
      <Field help="Recibirá un enlace de un solo uso (48 horas) para crear su contraseña." inputMode="email" label="Correo de acceso" name="email" type="email" />
      <SelectField
        defaultValue="CUSTOMER_ADMIN"
        label="Rol en el portal"
        name="role"
        options={PORTAL_ROLE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        required
      />
      <div className="sm:col-span-2">
        <SubmitButton>Dar acceso</SubmitButton>
      </div>
    </ServerForm>
  );
}
