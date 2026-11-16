"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { EMPTY_FIELD_ERRORS, type FieldErrors } from "@/components/ui/field-state";

/**
 * Estado que `ServerForm` comparte con los controles de su subárbol
 * (campos, botones de envío, confirmaciones).
 */
export type FormContextValue = {
  /** true mientras la server action del formulario está en curso. */
  pending: boolean;
  /**
   * false durante el render de servidor y la hidratación. `ServerForm` envía
   * por JavaScript: antes de hidratar, el botón de envío permanece
   * deshabilitado para que un clic temprano no haga un envío nativo.
   */
  ready: boolean;
  /** Errores por campo devueltos por la última ejecución (clave = `name` del control). */
  fieldErrors: FieldErrors;
  /** Quita el error de un campo (se llama sola al editarlo). */
  clearError: (name: string) => void;
};

const noop = () => {};

/**
 * Valor fuera de un `ServerForm`: sin errores, sin pendiente y `ready: true`
 * (nada se deshabilita), de modo que los usos existentes no cambian.
 */
export const DEFAULT_FORM_CONTEXT: FormContextValue = {
  pending: false,
  ready: true,
  fieldErrors: EMPTY_FIELD_ERRORS,
  clearError: noop,
};

export const FormContext = createContext<FormContextValue>(DEFAULT_FORM_CONTEXT);

/** Seguro fuera de un `ServerForm`: devuelve valores por defecto vacíos. */
export function useFormContext(): FormContextValue {
  return useContext(FormContext);
}

const subscribeToNothing = () => noop;

/**
 * false en el servidor y en el primer render de hidratación; true después.
 * (`useSyncExternalStore` evita el desajuste de hidratación sin `useEffect`.)
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}
