"use client";

/**
 * ServerForm: formulario para server actions que devuelven `ActionResult` y
 * que NO pierde lo escrito cuando la acción falla.
 *
 * Por qué existe: React 19 resetea el formulario al terminar CUALQUIER
 * `<form action>`, incluso si la acción devolvió un error de validación (así
 * se vacía un formulario largo por un campo mal escrito). `ServerForm` no usa
 * `<form action>`: intercepta `onSubmit`, lee `FormData` y llama a la acción
 * dentro de `useTransition`. Resultado:
 * - éxito: muestra el mensaje y resetea el formulario (`resetOnSuccess`, por
 *   defecto true; use `false` en formularios de edición).
 * - error: NO resetea, muestra la alerta con foco y publica `fieldErrors` por
 *   contexto (`Field`, `TextArea`, `SelectField` y `CheckboxField` los pintan
 *   junto al control con `aria-invalid` y `aria-describedby`). El error de un
 *   campo se borra al editarlo.
 * - mientras corre: `SubmitButton`/`ConfirmSubmit` quedan deshabilitados, un
 *   segundo envío se ignora y se retira el mensaje del envío anterior.
 * - excepción inesperada (red, 500, despliegue nuevo): mensaje en español y los
 *   datos siguen ahí.
 * - `redirect()` (y `notFound()`) dentro de la acción: Next RECHAZA la promesa
 *   con un error `NEXT_REDIRECT`; `ServerForm` lo deja propagar hasta el router
 *   (ver `form-submit.ts`). No se convierte en mensaje de error.
 *
 * Ejemplo mínimo (Server Component):
 *
 *   import { Field, ServerForm, SubmitButton } from "@/components/ui";
 *   import { createCustomerAction } from "@/lib/server/customer-actions";
 *
 *   <ServerForm action={createCustomerAction.bind(null, tenantSlug)} className="grid gap-3" testId="customer-form">
 *     <Field label="Razón social" name="name" />
 *     <SubmitButton>Registrar cliente</SubmitButton>
 *   </ServerForm>
 *
 * y en la acción ("use server", firma `(tenantSlug, previous, formData)`):
 *
 *   if (!name) return actionError("Revise los datos marcados.", { fieldErrors: { name: "Escriba la razón social." } });
 *   return actionOk("Cliente registrado.");
 *
 * Notas:
 * - Los hijos pueden ser JSX de servidor; `action` puede ser una server action
 *   enlazada con `.bind(null, slug)`.
 * - `onSuccess` es una función: solo puede pasarse desde un componente de cliente.
 * - Mantiene la validación nativa del navegador (`required`, `pattern`, ...).
 * - Antes de hidratar, el envío nativo queda inactivo: el botón de envío está
 *   deshabilitado y el formulario usa `method="dialog"` (un envío nativo no
 *   navega ni vuelca los campos en la URL).
 */
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { EMPTY_FIELD_ERRORS, removeFieldError, type FieldErrors } from "@/components/ui/field-state";
import { FormContext, useHydrated, type FormContextValue } from "@/components/ui/form-context";
import { runFormAction, type FormAction, type FormActionOutcome } from "@/components/ui/form-submit";
import { idleActionResult, type ActionResult } from "@/lib/server/action-result";

export type ServerFormProps = {
  /** Server action `(previous, formData) => ActionResult`, normalmente enlazada con `.bind(null, tenantSlug)`. */
  action: FormAction;
  children: ReactNode;
  className?: string;
  /** Resetea el formulario tras un éxito (por defecto true). Use false en edición. */
  resetOnSuccess?: boolean;
  /** Se llama tras un éxito (después del reset). Solo desde componentes de cliente. */
  onSuccess?: (message: string) => void;
  /** `data-testid` del formulario. */
  testId?: string;
  /** Nombre accesible del formulario (lo expone como región "form"). */
  label?: string;
  id?: string;
};

/** `new FormData(form, submitter)` incluye nombre y valor del botón pulsado; si el navegador no lo admite, cae al formulario solo. */
function readFormData(form: HTMLFormElement, submitter: HTMLElement | null): FormData {
  try {
    return submitter ? new FormData(form, submitter) : new FormData(form);
  } catch {
    return new FormData(form);
  }
}

function submitterOf(nativeEvent: Event): HTMLElement | null {
  const candidate = (nativeEvent as Partial<SubmitEvent>).submitter;
  return candidate instanceof HTMLElement ? candidate : null;
}

export function ServerForm({ action, children, className, resetOnSuccess = true, onSuccess, testId, label, id }: ServerFormProps) {
  const [result, setResult] = useState<ActionResult>(idleActionResult);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>(EMPTY_FIELD_ERRORS);
  const [pending, startTransition] = useTransition();
  const ready = useHydrated();
  const formRef = useRef<HTMLFormElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  /** Candado síncrono: `pending` tarda un render en reflejarse y un doble clic cabe en ese hueco. */
  const inFlightRef = useRef(false);
  /** Resultado anterior, para el primer argumento de la acción (misma firma que `useActionState`). */
  const previousRef = useRef<ActionResult>(idleActionResult);
  /** Botón que originó el envío: se le devuelve el foco al terminar si el foco se perdió. */
  const submitterRef = useRef<HTMLElement | null>(null);
  /** Si la persona navegó a otra página mientras corría la acción, no se toca el estado ni se llama a `onSuccess`. */
  const mountedRef = useRef(true);

  const clearError = useCallback((name: string) => {
    setFieldErrors((current) => removeFieldError(current, name));
  }, []);

  function applyOutcome(outcome: FormActionOutcome) {
    if (outcome.kind === "no-result" || !mountedRef.current) return;
    const next = outcome.result;
    previousRef.current = next;
    setResult(next);
    setFieldErrors(next.status === "error" && next.fieldErrors ? next.fieldErrors : EMPTY_FIELD_ERRORS);
    if (next.status === "success") {
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(next.message);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlightRef.current) return;
    const submitter = submitterOf(event.nativeEvent);
    const formData = readFormData(event.currentTarget, submitter);
    inFlightRef.current = true;
    submitterRef.current = submitter;
    // Se retira el mensaje anterior: durante el envío no debe verse un "Guardado" viejo y,
    // al volver a montarse, un éxito idéntico se anuncia otra vez a los lectores de pantalla
    // (si el nodo no cambia, una región viva no repite lo mismo). Los errores por campo se
    // conservan hasta la respuesta: siguen siendo ciertos mientras nadie edite el campo.
    setResult(idleActionResult);
    startTransition(async () => {
      try {
        // Si la acción hace `redirect()`, `runFormAction` relanza el error y React
        // lo entrega al router: el `finally` solo libera el candado.
        const outcome = await runFormAction(action, previousRef.current, formData);
        // Tras un `await` la actualización de estado debe volver a envolverse en una transición.
        startTransition(() => applyOutcome(outcome));
      } finally {
        inFlightRef.current = false;
      }
    });
  }

  /** Editar un campo borra su error (el `name` del control es la clave de `fieldErrors`). */
  function handleChange(event: ChangeEvent<HTMLFormElement>) {
    const name = (event.target as Partial<HTMLInputElement>).name;
    if (typeof name === "string" && name.length > 0) clearError(name);
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Cada fallo es un objeto nuevo: el efecto se repite aunque el mensaje sea el mismo.
  useEffect(() => {
    if (result.status === "error") feedbackRef.current?.focus();
  }, [result]);

  // El botón pulsado se deshabilita mientras corre y el navegador suelta el foco:
  // al terminar se le devuelve, salvo que el foco ya esté en otro sitio (p. ej. la alerta de error).
  useEffect(() => {
    if (pending) return;
    const submitter = submitterRef.current;
    submitterRef.current = null;
    if (!submitter?.isConnected) return;
    const active = document.activeElement;
    if (active === null || active === document.body) submitter.focus();
  }, [pending]);

  const context = useMemo<FormContextValue>(() => ({ pending, ready, fieldErrors, clearError }), [pending, ready, fieldErrors, clearError]);

  return (
    <FormContext.Provider value={context}>
      <form
        aria-busy={pending || undefined}
        aria-label={label}
        className={className}
        data-testid={testId}
        id={id}
        method="dialog"
        onChange={handleChange}
        onSubmit={handleSubmit}
        ref={formRef}
      >
        {children}
        {result.status === "error" ? (
          <div className="col-span-full scroll-mt-24 rounded-lg" ref={feedbackRef} tabIndex={-1}>
            <Alert tone="danger">{result.message}</Alert>
          </div>
        ) : null}
        {result.status === "success" ? (
          <div aria-live="polite" className="col-span-full">
            <Alert tone="success">{result.message}</Alert>
          </div>
        ) : null}
      </form>
    </FormContext.Provider>
  );
}
