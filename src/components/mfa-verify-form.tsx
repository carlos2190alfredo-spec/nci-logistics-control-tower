"use client";

import { useActionState, useState } from "react";
import { verifyMfaLoginAction } from "@/lib/server/mfa-actions";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

export function MfaVerifyForm() {
  const [state, action] = useActionState(verifyMfaLoginAction, { error: "" });
  const [useRecovery, setUseRecovery] = useState(false);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="useRecovery" value={useRecovery ? "true" : "false"} />
      {useRecovery ? (
        <Field
          label="Codigo de recuperacion"
          name="code"
          type="text"
          autoComplete="off"
          placeholder="xxxxx-xxxxx-xxxxx-xxxxx"
        />
      ) : (
        <Field
          label="Codigo de verificacion"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
        />
      )}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}
      <SubmitButton size="lg" variant="secondary">
        {useRecovery ? "Usar codigo de recuperacion" : "Verificar"}
      </SubmitButton>
      <button
        type="button"
        onClick={() => setUseRecovery(!useRecovery)}
        className="text-center text-xs font-medium text-primary transition-colors hover:text-primary-hover"
      >
        {useRecovery ? "Usar codigo de autenticador" : "¿No tiene acceso al autenticador?"}
      </button>
    </form>
  );
}
