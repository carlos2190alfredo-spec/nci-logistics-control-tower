"use client";

import { Field } from "@/components/ui/field";
import { ServerForm } from "@/components/ui/server-form";
import { SubmitButton } from "@/components/ui/button";
import { acceptInvitationAction } from "@/lib/server/invitation-accept-actions";

/**
 * `create`: la persona define su nombre y contraseña. `join`: ya tiene cuenta y sesión; solo confirma.
 * Usa `ServerForm` para que un error (contraseñas distintas, p. ej.) NO vacíe lo que escribió.
 */
export function AcceptInvitationForm({ token, mode }: { token: string; mode: "create" | "join" }) {
  return (
    <ServerForm action={acceptInvitationAction} className="grid gap-4" label="Aceptar invitación" resetOnSuccess={false} testId="accept-invitation-form">
      <input name="token" type="hidden" value={token} />
      {mode === "create" ? (
        <>
          <Field autoComplete="name" label="Su nombre" maxLength={100} minLength={2} name="name" />
          <Field autoComplete="new-password" help="Mínimo 10 caracteres." label="Contraseña" maxLength={128} minLength={10} name="password" type="password" />
          <Field autoComplete="new-password" label="Confirmar contraseña" maxLength={128} minLength={10} name="confirmation" type="password" />
        </>
      ) : null}
      <SubmitButton size="lg" variant="secondary">
        {mode === "create" ? "Crear mi cuenta y aceptar" : "Aceptar invitación"}
      </SubmitButton>
    </ServerForm>
  );
}
