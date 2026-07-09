"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/server/actions";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, { message: "" });

  return (
    <form action={action} className="grid gap-4">
      <Field defaultValue="platform@nci.local" label="Correo" name="email" type="email" />
      <Field defaultValue="NCIPlatform2026!" label="Contrasena" name="password" type="password" />
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <SubmitButton size="lg" variant="secondary">
        Entrar
      </SubmitButton>
    </form>
  );
}
