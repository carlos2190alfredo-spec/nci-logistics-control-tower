"use client";

import { useActionState } from "react";
import { loginAction } from "@/lib/server/actions";
import { Field, SubmitButton } from "@/components/ui";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, { message: "" });

  return (
    <form action={action} className="grid gap-4">
      <Field label="Correo" name="email" type="email" defaultValue="platform@nci.local" />
      <Field label="Contrasena" name="password" type="password" defaultValue="NCIPlatform2026!" />
      {state.message ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.message}</p> : null}
      <SubmitButton>Entrar</SubmitButton>
    </form>
  );
}
