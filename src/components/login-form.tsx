"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loginAction } from "@/lib/server/actions";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

export function LoginForm() {
  const [state, action] = useActionState(loginAction, { message: "" });
  const params = useSearchParams();
  const passwordResetOk = params.get("password-reset") === "ok";

  return (
    <form action={action} className="grid gap-4">
      {passwordResetOk ? (
        <Alert tone="success" title="Contrasena restablecida">
          Ya puede iniciar sesion con la nueva contrasena.
        </Alert>
      ) : null}
      <Field defaultValue="platform@nci.local" label="Correo" name="email" type="email" />
      <Field defaultValue="NCIPlatform2026!" label="Contrasena" name="password" type="password" />
      {state.message ? <Alert tone="danger">{state.message}</Alert> : null}
      <SubmitButton size="lg" variant="secondary">
        Entrar
      </SubmitButton>
      <p className="text-center text-xs text-muted-foreground">
        <Link className="font-medium text-primary transition-colors hover:text-primary-hover" href="/recuperar">
          Olvide mi contrasena
        </Link>
      </p>
    </form>
  );
}
