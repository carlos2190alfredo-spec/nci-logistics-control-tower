/**
 * Utilidades de prueba con DOM (jsdom) para los componentes de formulario.
 * Solo las importan archivos `*.dom.test.ts` con `// @vitest-environment jsdom`:
 * Vitest corre en entorno node por defecto y el repo no incluye
 * @testing-library, así que se usa `react-dom/client` + `act` directamente.
 */
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Mounted = { container: HTMLDivElement; root: Root };
const mounted: Mounted[] = [];

/**
 * Promesas de `deferred()` que su prueba todavía no resolvió. React 19 entrelaza
 * las acciones asíncronas en vuelo (`startTransition(async …)`): mientras una no
 * termine, las actualizaciones de transición de TODO lo que se monte después no
 * se confirman. Si una aserción falla antes de resolverla, esa acción quedaría
 * colgada para siempre y las pruebas siguientes del archivo fallarían por un
 * motivo que no es suyo. `unmountAll` las libera para que un fallo siga siendo
 * un solo fallo.
 */
const unsettled = new Set<() => void>();

/** Errores que React captura en un límite (p. ej. NEXT_REDIRECT) no deben ensuciar la salida de las pruebas. */
export type MountOptions = { onCaughtError?: (error: unknown) => void; onUncaughtError?: (error: unknown) => void };

export async function mount(element: ReactElement, options: MountOptions = {}) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container, {
    onCaughtError: options.onCaughtError ?? (() => {}),
    onUncaughtError: options.onUncaughtError ?? (() => {}),
  });
  mounted.push({ container, root });
  await act(async () => {
    root.render(element);
  });
  return { container, root };
}

export async function unmountAll() {
  // Primero se liberan las acciones colgadas (resuelven con `undefined`: el formulario lo trata como "sin resultado").
  if (unsettled.size > 0) {
    const release = [...unsettled];
    unsettled.clear();
    await act(async () => {
      for (const resolveIfPending of release) resolveIfPending();
    });
    await settle();
  }
  for (const { container, root } of mounted.splice(0)) {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
}

/** Deja pasar microtareas y temporizadores de 0 ms dentro de `act` (acciones asíncronas en transiciones). */
export async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/**
 * Escribe en un control no controlado como lo haría una persona. React vigila
 * el valor con un descriptor propio: se usa el setter nativo del prototipo para
 * que el evento `input` sea reconocido como un cambio real.
 */
export async function typeInto(control: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = control instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error("No se encontró el setter nativo de value");
  await act(async () => {
    setter.call(control, value);
    control.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

export async function click(element: Element) {
  await act(async () => {
    (element as HTMLElement).click();
  });
}

export async function press(element: Element, key: string) {
  await act(async () => {
    element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

export function byText<T extends Element = HTMLElement>(container: ParentNode, selector: string, text: string): T {
  const found = [...container.querySelectorAll<T>(selector)].find((node) => node.textContent?.trim() === text);
  if (!found) throw new Error(`No se encontró <${selector}> con el texto "${text}"`);
  return found;
}

export function deferred<T>() {
  let settled = false;
  let resolveInner!: (value: T) => void;
  let rejectInner!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolveInner = res;
    rejectInner = rej;
  });
  const resolve = (value: T) => {
    settled = true;
    resolveInner(value);
  };
  const reject = (reason: unknown) => {
    settled = true;
    rejectInner(reason);
  };
  unsettled.add(() => {
    if (!settled) resolve(undefined as T);
  });
  return { promise, resolve, reject };
}
