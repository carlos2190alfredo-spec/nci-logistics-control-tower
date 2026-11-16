import { readFileSync } from "node:fs";
import { type ReactElement } from "react";
import { el as h } from "@/components/ui/test-element";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SubmitButton } from "@/components/ui/button";
import { Field, SelectField, TextArea } from "@/components/ui/field";
import legacy from "./__fixtures__/legacy-field-markup.json";

/**
 * Regresión de marcado: `legacy-field-markup.json` contiene el HTML que
 * producían `Field`, `TextArea`, `SelectField` y `SubmitButton` ANTES de
 * extenderlos (commit 9a080a5), generado con usos reales del repo
 * (contenedores, portal, evidencia, login, MFA). Si un uso existente cambia
 * una sola clase o atributo, esta prueba falla.
 *
 * Los ids de `useId` se normalizan a "ID" para no depender del formato de React.
 *
 * Las comillas simples se normalizan de su entidad HTML a `'` (también en el
 * fixture). No es un capricho: Tailwind escanea TODOS los archivos del
 * repositorio, JSON incluido, en busca de clases. La clase del select lleva un
 * `url()` con comillas; si el fixture la guarda con la comilla escapada como
 * entidad, Tailwind genera un `url()` inválido en el CSS compilado y
 * `next build` falla al intentar resolverlo como archivo. Con la comilla real el
 * candidato es idéntico al de `field.tsx` y no añade nada al CSS. Por la misma
 * razón NO se escribe aquí, ni en ningún archivo, esa clase con la entidad.
 */
function render(element: ReactElement): string {
  return renderToStaticMarkup(h("form", null, element)).replace(/_R_[0-9a-z]+_/g, "ID").replaceAll("&#x27;", "'");
}

const option = (value: string, label: string) => h("option", { value }, label);

const cases: Record<string, ReactElement> = {
  containersReferencia: h(Field, { label: "Referencia", name: "reference", placeholder: "EMPRESA-CT-0001", required: true }),
  containersFreeDays: h(Field, {
    help: "Días libres pactados para demurrage/detention.",
    label: "Días libres",
    name: "freeDays",
    required: false,
    type: "number",
  }),
  containersSelect: h(SelectField, { label: "Operación", name: "operationType" }, option("IMPORTACION", "Importación"), option("EXPORTACION", "Exportación")),
  containersTextArea: h(TextArea, { label: "Observaciones", name: "notes" }),
  portalDestino: h(Field, {
    defaultValue: "Puerto de Balboa",
    label: "Destino",
    name: "destination",
    placeholder: "Terminal, puerto o dirección de entrega",
  }),
  portalTextAreaHelp: h(TextArea, {
    help: "Estas instrucciones serán visibles para el equipo operativo.",
    label: "Instrucciones visibles",
    name: "customerNotes",
  }),
  portalSelectDefault: h(SelectField, { defaultValue: "URGENT", label: "Prioridad", name: "priority" }, option("NORMAL", "Normal"), option("URGENT", "Urgente")),
  loginEmail: h(Field, { autoComplete: "username", defaultValue: "a@b.co", label: "Correo", name: "email", required: true, type: "email" }),
  mfaCode: h(Field, { autoComplete: "one-time-code", inputMode: "numeric", label: "Codigo", maxLength: 6, name: "code", type: "text" }),
  evidenceFile: h(Field, {
    accept: "image/jpeg,image/png",
    help: "Formatos: JPG.",
    label: "Fotografia o documento de evidencia",
    name: "evidenceFile",
    type: "file",
  }),
  classNames: h(Field, { className: "sm:col-span-2", inputClassName: "font-mono uppercase", label: "Placa", name: "plate" }),
  selectClassNames: h(SelectField, { className: "self-end", help: "Ayuda", label: "Estado", required: true, selectClassName: "min-w-40", name: "status" }, option("A", "A")),
  textareaRows: h(TextArea, { className: "sm:col-span-2", defaultValue: "hola", label: "Notas", name: "n", placeholder: "Escriba", required: true, rows: 5 }),
  submitIdle: h(SubmitButton, null, "Registrar contenedor"),
  submitVariants: h(SubmitButton, { className: "w-full", size: "lg", variant: "success" }, "Registrar evidencia y firma"),
};

describe("marcado de los usos existentes (retrocompatibilidad)", () => {
  it("el fixture y los casos cubren exactamente lo mismo", () => {
    expect(Object.keys(cases).sort()).toEqual(Object.keys(legacy).sort());
  });

  for (const key of Object.keys(cases)) {
    it(`${key}: el HTML es idéntico al de la versión anterior`, () => {
      expect(render(cases[key])).toBe((legacy as Record<string, string>)[key]);
    });
  }

  it("el fixture no contiene entidades HTML (Tailwind lo escanea y generaría url() inválidos que rompen el build)", () => {
    const text = readFileSync(new URL("./__fixtures__/legacy-field-markup.json", import.meta.url), "utf8");
    expect(text).not.toMatch(/&(#x?[0-9a-f]+|quot|amp|lt|gt|apos);/i);
    // Y la clase del select conserva la forma válida que ya usa field.tsx.
    expect(text).toContain("data:image/svg+xml;charset=utf-8,");
  });

  it("la ayuda sigue enlazada con aria-describedby y el control con su etiqueta", () => {
    const html = render(cases.portalTextAreaHelp);
    expect(html).toContain('aria-describedby="ID-help"');
    expect(html).toContain('id="ID-help"');
    expect(html).toContain('for="ID"');
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("-error");
  });

  it("`required` sigue siendo true por defecto en Field y false en TextArea/SelectField", () => {
    expect(render(h(Field, { label: "A", name: "a" }))).toContain('required=""');
    expect(render(h(TextArea, { label: "A", name: "a" }))).not.toContain("required");
    expect(render(h(SelectField, { label: "A", name: "a" }, option("x", "X")))).not.toContain("required");
  });
});
