"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { resetPasswordAction } from "@/lib/server/password-reset-actions";

const initialState: { error?: string; message?: string } = {};

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, initialState);

  return (
    <form action={action} className="grid gap-4">
      <input name="token" type="hidden" value={token} />
      <Field help="Minimo 10 caracteres." label="Nueva contrasena" name="password" type="password" />
      <Field label="Confirmar contrasena" name="confirmation" type="password" />
      {state.error ? <Alert tone="danger">{state.message ?? "No se pudo completar la operacion."}</Alert> : null}
      <SubmitButton size="lg" variant="secondary">
        Cambiar contrasena
      </SubmitButton>
    </form>
  );
}
