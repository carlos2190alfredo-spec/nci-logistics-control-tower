/**
 * `createElement` con tipos más tolerantes para los archivos `*.test.ts`
 * (Vitest solo recoge `.test.ts`, así que no se puede usar JSX en las pruebas).
 * El tipado estricto de `createElement` exige `children` dentro de las props
 * aunque se pasen como argumentos; aquí los hijos van como argumentos y el
 * resto de props sigue verificándose contra el componente.
 */
import { createElement, type ComponentType, type ExoticComponent, type ReactElement, type ReactNode } from "react";

type PropsOf<P> = Omit<P, "children"> & { key?: string };

export function el<P>(type: ComponentType<P> | ExoticComponent<P>, props: PropsOf<P> | null, ...children: ReactNode[]): ReactElement;
export function el(type: string, props: Record<string, unknown> | null, ...children: ReactNode[]): ReactElement;
export function el(type: unknown, props: unknown, ...children: ReactNode[]): ReactElement {
  return createElement(type as string, props as object | null, ...children);
}
