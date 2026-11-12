"use client";

import { useActionState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { idleActionResult, type ActionResult } from "@/lib/server/action-result";

/**
 * Formulario para server actions que devuelven `ActionResult`.
 * Muestra debajo del contenido el mensaje de exito o el motivo exacto del
 * bloqueo (cumplimiento, mantenimiento, conflicto de agenda, estado cambiado).
 */
export function ActionForm({
  action,
  children,
  className,
}: {
  action: (previous: ActionResult, formData: FormData) => Promise<ActionResult>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, idleActionResult);

  return (
    <form action={formAction} className={className}>
      {children}
      {state.status === "error" ? <Alert tone="danger">{state.message}</Alert> : null}
      {state.status === "success" ? <Alert tone="success">{state.message}</Alert> : null}
    </form>
  );
}
