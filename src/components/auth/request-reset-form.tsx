"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { requestResetAction } from "@/lib/server/password-reset-actions";

export function RequestResetForm() {
  const [state, action] = useActionState(requestResetAction, { done: false });

  if (state.done) {
    return (
      <Alert tone="success" title="Solicitud recibida">
        Si el correo existe en nuestra base, recibira un enlace en unos minutos.
      </Alert>
    );
  }

  return (
    <form action={action} className="grid gap-4">
      <Field label="Correo" name="email" placeholder="usuario@empresa" type="email" />
      <SubmitButton size="lg" variant="secondary">
        Enviar enlace
      </SubmitButton>
      <p className="text-xs text-muted-foreground">
        Por seguridad, la respuesta es la misma exista o no el correo.
      </p>
    </form>
  );
}
