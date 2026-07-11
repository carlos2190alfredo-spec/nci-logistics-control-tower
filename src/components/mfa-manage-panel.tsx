"use client";

import { useActionState, useState } from "react";
import { ShieldCheck, Key, ShieldOff } from "lucide-react";
import { deactivateMfaAction, regenerateCodesAction } from "@/lib/server/mfa-actions";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Card } from "@/components/ui/card";

export function MfaManagePanel() {
  const [showDeactivate, setShowDeactivate] = useState(false);
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [deactivateState, deactivateAction] = useActionState(deactivateMfaAction, null);
  const [regenerateState, regenerateAction] = useActionState(regenerateCodesAction, null);

  if (deactivateState && "ok" in deactivateState && deactivateState.ok) {
    return (
      <Card className="grid gap-4">
        <Alert tone="success" title="MFA desactivado">
          La autenticacion de dos factores ha sido desactivada. Su cuenta ahora solo usa contrasena.
        </Alert>
        <a
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          href="/account/security"
        >
          Volver a seguridad
        </a>
      </Card>
    );
  }

  if (regenerateState && "recoveryCodes" in regenerateState && regenerateState.recoveryCodes) {
    return (
      <Card className="grid gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-success-soft">
            <Key aria-hidden className="size-5 text-success-strong" />
          </div>
          <div>
            <p className="font-semibold text-foreground">Codigos regenerados</p>
            <p className="text-sm text-muted-foreground">
              Los codigos anteriores fueron invalidados. Guarde estos nuevos codigos en un lugar seguro.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted p-4">
          <div className="grid grid-cols-2 gap-1 font-mono text-sm" data-testid="recovery-codes-list">
            {regenerateState.recoveryCodes.map((code: string, i: number) => (
              <p key={i}>{code}</p>
            ))}
          </div>
        </div>

        <Alert tone="warning" title="Importante">
          Cada codigo solo puede usarse una vez. No se mostraran de nuevo.
        </Alert>

        <a
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          href="/account/security"
        >
          Continuar
        </a>
      </Card>
    );
  }

  return (
    <div className="grid gap-4">
      <Card className="grid gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-success-soft">
            <ShieldCheck aria-hidden className="size-5 text-success-strong" />
          </div>
          <div>
            <p className="font-semibold text-foreground">MFA activo</p>
            <p className="text-sm text-muted-foreground">
              Su cuenta esta protegida con autenticacion de dos factores.
            </p>
          </div>
        </div>
      </Card>

      <Card className="grid gap-4">
        <div className="flex items-center gap-3">
          <Key aria-hidden className="size-5 text-muted-foreground" />
          <p className="font-semibold text-foreground">Regenerar codigos de recuperacion</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Genera nuevos codigos e invalida los anteriores. Necesita su contrasena y un codigo TOTP actual.
        </p>

        {showRegenerate ? (
          <form action={regenerateAction} className="grid gap-3">
            <Field label="Contrasena actual" name="password" type="password" />
            <Field
              label="Codigo TOTP actual"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
            />
            {regenerateState && "error" in regenerateState && regenerateState.error ? (
              <Alert tone="danger">{regenerateState.error}</Alert>
            ) : null}
            <div className="flex gap-2">
              <SubmitButton variant="secondary">Regenerar codigos</SubmitButton>
              <button
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                onClick={() => setShowRegenerate(false)}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            onClick={() => setShowRegenerate(true)}
            type="button"
          >
            Regenerar codigos
          </button>
        )}
      </Card>

      <Card className="grid gap-4">
        <div className="flex items-center gap-3">
          <ShieldOff aria-hidden className="size-5 text-danger" />
          <p className="font-semibold text-foreground">Desactivar autenticacion de dos factores</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Desactivar MFA reduce la seguridad de su cuenta. Necesita su contrasena y un codigo TOTP actual.
        </p>

        {showDeactivate ? (
          <form action={deactivateAction} className="grid gap-3">
            <Field label="Contrasena actual" name="password" type="password" />
            <Field
              label="Codigo TOTP actual"
              name="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="000000"
            />
            {deactivateState && "error" in deactivateState && deactivateState.error ? (
              <Alert tone="danger">{deactivateState.error}</Alert>
            ) : null}
            <div className="flex gap-2">
              <SubmitButton variant="danger">Desactivar MFA</SubmitButton>
              <button
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
                onClick={() => setShowDeactivate(false)}
                type="button"
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-danger/30 bg-surface px-4 py-2 text-sm font-medium text-danger transition-colors hover:bg-danger-soft/30"
            onClick={() => setShowDeactivate(true)}
            type="button"
          >
            Desactivar MFA
          </button>
        )}
      </Card>
    </div>
  );
}
