"use client";

import { useActionState, useState, useEffect } from "react";
import { ShieldCheck, Copy, Check } from "lucide-react";
import { setupMfaAction, activateMfaAction } from "@/lib/server/mfa-actions";
import { Alert } from "@/components/ui/alert";
import { SubmitButton } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Card } from "@/components/ui/card";

type SetupData = { secret: string; uri: string } | null;

export function MfaSetupFlow(_props: { userEmail: string }) {
  const [setupData, setSetupData] = useState<SetupData>(null);
  const [qrSvg, setQrSvg] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [activateState, activateAction] = useActionState(activateMfaAction, null);

  const recoveryCodes = activateState && "recoveryCodes" in activateState ? (activateState.recoveryCodes as string[] | null) : null;

  useEffect(() => {
    let cancelled = false;
    setupMfaAction().then((result) => {
      if (cancelled) return;
      if ("error" in result) return;
      setSetupData(result);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!setupData?.uri) return;
    let cancelled = false;
    import("qrcode").then((QRCode) => {
      QRCode.toString(setupData.uri, { type: "svg", margin: 2 }).then((svg) => {
        if (!cancelled) setQrSvg(svg);
      });
    });
    return () => { cancelled = true; };
  }, [setupData?.uri]);

  function handleCopySecret() {
    if (!setupData?.secret) return;
    navigator.clipboard.writeText(setupData.secret).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (recoveryCodes) {
    return (
      <Card className="grid gap-4">
        <div className="flex items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-success-soft">
            <ShieldCheck aria-hidden className="size-5 text-success-strong" />
          </div>
          <div>
            <p className="font-semibold text-foreground">MFA activado exitosamente</p>
            <p className="text-sm text-muted-foreground">
              Guarde estos codigos de recuperacion en un lugar seguro. No se mostraran de nuevo.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-muted p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Codigos de recuperacion</p>
          <div className="grid grid-cols-2 gap-1 font-mono text-sm" data-testid="recovery-codes-list">
            {recoveryCodes.map((code, i) => (
              <p key={i}>{code}</p>
            ))}
          </div>
        </div>

        <Alert tone="warning" title="Importante">
          Cada codigo solo puede usarse una vez. Si pierde su dispositivo autenticador, necesitara estos codigos para acceder a su cuenta.
        </Alert>

        <a
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
          href="/account/security"
        >
          Continuar a seguridad
        </a>
      </Card>
    );
  }

  if (!setupData) {
    return (
      <Card className="grid place-items-center p-8">
        <p className="text-sm text-muted-foreground">Preparando configuracion...</p>
      </Card>
    );
  }

  return (
    <Card className="grid gap-5">
      <div>
        <p className="font-semibold text-foreground">Paso 1: Escanee el codigo QR</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Abra su aplicacion autenticadora (Google Authenticator, Authy, 1Password) y escanee el siguiente codigo.
        </p>
      </div>

      {qrSvg ? (
        <div
          className="mx-auto w-48 rounded-xl border border-border bg-white p-3"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
          data-testid="mfa-qr-code"
        />
      ) : (
        <div className="mx-auto flex size-48 items-center justify-center rounded-xl border border-border bg-muted">
          <p className="text-xs text-muted-foreground">Generando QR...</p>
        </div>
      )}

      <div>
        <p className="text-sm font-medium text-foreground">¿No puede escanear? Ingrese este codigo manualmente:</p>
        <div className="mt-2 flex items-center gap-2">
          <code className="flex-1 rounded-lg border border-border bg-muted px-3 py-2 font-mono text-sm tracking-wider" data-testid="mfa-manual-secret">
            {setupData.secret}
          </code>
          <button
            className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
            onClick={handleCopySecret}
            type="button"
          >
            {copied ? <Check aria-hidden className="size-4 text-success-strong" /> : <Copy aria-hidden className="size-4" />}
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
      </div>

      <div>
        <p className="font-semibold text-foreground">Paso 2: Verifique el codigo</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ingrese el codigo de 6 digitos que muestra su aplicacion autenticadora para completar la configuracion.
        </p>
      </div>

      <form action={activateAction} className="grid gap-4">
        <Field
          label="Codigo de verificacion"
          name="code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
        />
        {activateState && "error" in activateState && activateState.error ? (
          <Alert tone="danger">{activateState.error}</Alert>
        ) : null}
        <SubmitButton size="lg" variant="secondary">
          Activar autenticacion de dos factores
        </SubmitButton>
      </form>
    </Card>
  );
}
