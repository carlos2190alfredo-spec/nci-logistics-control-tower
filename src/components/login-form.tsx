"use client";

import { useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { loginAction } from "@/lib/server/actions";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

/** `demoDefaults` solo llega en APP_ENV=local; en staging el formulario arranca vacio. */
export function LoginForm({ demoDefaults }: { demoDefaults?: { email: string; password: string } }) {
  const [state, action] = useActionState(loginAction, { message: "" });
  const params = useSearchParams();
  const passwordResetOk = params.get("password-reset") === "ok";

  return (
    <form action={action} className="grid gap-4">
      {passwordResetOk ? (
        <Alert tone="success" title="Contraseña restablecida">
          Ya puede iniciar sesión con la nueva contraseña.
        </Alert>
      ) : null}
      <Field autoComplete="username" defaultValue={demoDefaults?.email} label="Correo" name="email" required type="email" />
      <Field autoComplete="current-password" defaultValue={demoDefaults?.password} label="Contrasena" name="password" required type="password" />
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
