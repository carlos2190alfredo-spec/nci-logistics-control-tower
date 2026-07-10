"use client";

import { useState, type FormEvent } from "react";
import { LogOut } from "lucide-react";
import { useOfflineContext } from "@/components/offline/offline-provider";
import { forcePurgeOwner } from "@/lib/offline/queue";
import type { QueueOwner } from "@/lib/offline/queue";
import { logoutAction } from "@/lib/server/actions";

/**
 * Guard de logout con acciones pendientes en el conductor.
 * - Si NO hay pendientes: <form action={logoutAction}> (misma UX que antes).
 * - Si SÍ hay pendientes: intercepta el submit y abre confirmación.
 */
export function LogoutGuard({ owner }: { owner: QueueOwner }) {
  const { pending, retryable, conflicts, rejected, sync } = useOfflineContext();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const outstanding = pending.length + retryable.length + conflicts.length + rejected.length;

  async function attemptSync() {
    setBusy(true);
    try {
      await sync();
    } finally {
      setBusy(false);
    }
  }

  async function forceLogout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    try {
      await forcePurgeOwner(owner);
      await logoutAction();
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form
        action={logoutAction}
        onSubmit={(event) => {
          if (outstanding > 0) {
            event.preventDefault();
            setConfirming(true);
          }
        }}
      >
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-nav-border px-3 text-sm font-semibold text-nav-foreground transition-colors hover:bg-nav-surface"
          type="submit"
        >
          <LogOut aria-hidden className="size-4" />
          Salir
        </button>
      </form>

      {confirming ? (
        <div aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-nav/60 backdrop-blur-sm" role="dialog">
          <div className="max-w-md rounded-xl border border-border bg-surface p-5 shadow-lg">
            <h3 className="text-base font-bold text-foreground">Hay acciones sin sincronizar</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Tiene <span className="font-semibold tabular-nums">{outstanding}</span>{" "}
              accion(es) pendientes en este dispositivo. Si cierra sesion sin sincronizar, esas acciones se perderan.
            </p>
            <div className="mt-4 grid gap-2 sm:flex sm:justify-end">
              <button
                className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm font-semibold text-foreground hover:bg-muted"
                disabled={busy}
                onClick={() => setConfirming(false)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="min-h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
                disabled={busy}
                onClick={() => {
                  void attemptSync();
                }}
                type="button"
              >
                Sincronizar ahora
              </button>
              <form onSubmit={forceLogout}>
                <button
                  className="min-h-10 rounded-lg bg-danger px-3 text-sm font-semibold text-white hover:bg-danger-hover"
                  disabled={busy}
                  type="submit"
                >
                  Salir descartando
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
