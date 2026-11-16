// @vitest-environment jsdom
import { type ReactElement } from "react";
import { el as h } from "@/components/ui/test-element";
import { afterEach, describe, expect, it } from "vitest";
import { CheckboxField } from "@/components/ui/checkbox";
import { Field, SelectField, TextArea } from "@/components/ui/field";
import { DEFAULT_FORM_CONTEXT, FormContext } from "@/components/ui/form-context";
import { SubmitButton } from "@/components/ui/button";
import { mount, unmountAll } from "@/components/ui/dom-test-utils";

afterEach(unmountAll);

function withErrors(fieldErrors: Record<string, string>, children: ReactElement | ReactElement[]) {
  return h(FormContext.Provider, { value: { ...DEFAULT_FORM_CONTEXT, fieldErrors } }, children);
}

/** Busca por atributo: los ids de useId llevan caracteres que un selector `#id` tendría que escapar. */
function byId(container: HTMLElement, id: string) {
  return container.querySelector(`[id="${id}"]`);
}

function controlOf(container: HTMLElement, name: string) {
  const control = container.querySelector<HTMLElement>(`[name="${name}"]`);
  if (!control) throw new Error(`No hay control ${name}`);
  return control;
}

/** Resuelve los ids de aria-describedby a los elementos reales: lo que oye un lector de pantalla. */
function describedText(container: HTMLElement, control: HTMLElement): string[] {
  return (control.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => byId(container, id)?.textContent?.trim() ?? `<<sin elemento ${id}>>`);
}

describe("Field con error del formulario", () => {
  it("pinta el mensaje, marca aria-invalid, pone borde de error y encadena error + ayuda", async () => {
    const { container } = await mount(
      withErrors({ plate: "Ya existe un vehículo con esa placa." }, h(Field, { help: "Se guarda en mayúsculas.", label: "Placa", name: "plate" })),
    );
    const input = controlOf(container, "plate");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.className).toContain("border-danger");
    // twMerge debe haber quitado el borde neutro: dos colores de borde a la vez serían ambiguos.
    expect(input.className).not.toMatch(/(^|\s)border-border(\s|$)/);
    expect(input.className).not.toContain("hover:border-border-strong");
    expect(input.className).not.toContain("focus:border-primary");
    expect(describedText(container, input)).toEqual(["Ya existe un vehículo con esa placa.", "Se guarda en mayúsculas."]);
    // El mensaje es un nodo real con el id al que apunta el control.
    const message = byId(container, input.getAttribute("aria-describedby")!.split(" ")[0]);
    expect(message?.tagName).toBe("P");
    expect(message?.className).toContain("text-danger");
    // La etiqueta sigue apuntando al control.
    expect(container.querySelector("label")?.getAttribute("for")).toBe(input.id);
  });

  it("sin ayuda, aria-describedby apunta solo al error", async () => {
    const { container } = await mount(withErrors({ name: "Escriba la razón social." }, h(Field, { label: "Razón social", name: "name" })));
    expect(describedText(container, controlOf(container, "name"))).toEqual(["Escriba la razón social."]);
  });

  it("el error de un campo no contamina a los demás", async () => {
    const { container } = await mount(
      withErrors({ a: "Falla A" }, [h(Field, { key: "a", label: "A", name: "a" }), h(Field, { help: "Ayuda B", key: "b", label: "B", name: "b" })]),
    );
    const b = controlOf(container, "b");
    expect(b.getAttribute("aria-invalid")).toBeNull();
    expect(b.className).not.toContain("border-danger");
    expect(describedText(container, b)).toEqual(["Ayuda B"]);
    expect(container.textContent).toContain("Falla A");
  });

  it("la prop error funciona sin ServerForm y gana sobre el contexto; error='' lo suprime", async () => {
    const { container } = await mount(
      withErrors({ x: "Del contexto", y: "Del contexto Y" }, [
        h(Field, { error: "Explícito", key: "x", label: "X", name: "x" }),
        h(Field, { error: "", key: "y", label: "Y", name: "y" }),
      ]),
    );
    expect(describedText(container, controlOf(container, "x"))).toEqual(["Explícito"]);
    expect(controlOf(container, "y").getAttribute("aria-invalid")).toBeNull();
    expect(container.textContent).not.toContain("Del contexto Y");
  });

  it("aria-invalid forzado marca el control aunque no haya mensaje", async () => {
    const { container } = await mount(h(Field, { "aria-invalid": true, label: "A", name: "a" }));
    const input = controlOf(container, "a");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    expect(input.getAttribute("aria-describedby")).toBeNull();
  });

  it("aria-describedby ajeno se conserva al final de la cadena", async () => {
    const { container } = await mount(
      withErrors({ a: "Falla" }, h(Field, { "aria-describedby": "externo", help: "Ayuda", label: "A", name: "a" })),
    );
    const ids = controlOf(container, "a").getAttribute("aria-describedby")!.split(" ");
    expect(ids).toHaveLength(3);
    expect(ids[2]).toBe("externo");
  });

  it("dos campos iguales en la misma página no comparten ids (cada etiqueta apunta a su control)", async () => {
    const { container } = await mount(
      withErrors({ motivo: "Escriba el motivo." }, [h(Field, { key: "1", label: "Motivo", name: "motivo" }), h(Field, { key: "2", label: "Motivo", name: "motivo" })]),
    );
    const inputs = [...container.querySelectorAll("input")];
    expect(new Set(inputs.map((input) => input.id)).size).toBe(2);
    const ids = inputs.flatMap((input) => (input.getAttribute("aria-describedby") ?? "").split(" "));
    expect(new Set(ids).size).toBe(ids.length);
    for (const label of container.querySelectorAll("label")) {
      expect(container.querySelectorAll(`[id="${label.htmlFor}"]`)).toHaveLength(1);
    }
  });

  it("id propio: el control y los ids de ayuda/error derivan de él", async () => {
    const { container } = await mount(withErrors({ a: "Falla" }, h(Field, { help: "Ayuda", id: "mi-campo", label: "A", name: "a" })));
    const input = controlOf(container, "a");
    expect(input.id).toBe("mi-campo");
    expect(input.getAttribute("aria-describedby")).toBe("mi-campo-error mi-campo-help");
    expect(container.querySelector("#mi-campo-error")?.textContent).toBe("Falla");
    expect(container.querySelector("#mi-campo-help")?.textContent).toBe("Ayuda");
    expect(container.querySelector("label")?.htmlFor).toBe("mi-campo");
  });
});

describe("TextArea y SelectField con error", () => {
  it("TextArea: mismo contrato que Field", async () => {
    const { container } = await mount(
      withErrors({ notes: "Máximo 200 caracteres." }, h(TextArea, { help: "Visible para operaciones.", label: "Notas", name: "notes" })),
    );
    const area = controlOf(container, "notes");
    expect(area.tagName).toBe("TEXTAREA");
    expect(area.getAttribute("aria-invalid")).toBe("true");
    expect(area.className).toContain("border-danger");
    expect(describedText(container, area)).toEqual(["Máximo 200 caracteres.", "Visible para operaciones."]);
  });

  it("SelectField: mismo contrato que Field", async () => {
    const { container } = await mount(
      withErrors({ type: "Seleccione un tipo." }, h(SelectField, { label: "Tipo", name: "type", options: [{ label: "Seco", value: "SECO" }] })),
    );
    const select = controlOf(container, "type");
    expect(select.tagName).toBe("SELECT");
    expect(select.getAttribute("aria-invalid")).toBe("true");
    expect(select.className).toContain("border-danger");
    expect(describedText(container, select)).toEqual(["Seleccione un tipo."]);
  });
});

describe("CheckboxField", () => {
  it("se asocia con su etiqueta, respeta defaultChecked y envía 'on' por defecto", async () => {
    const { container } = await mount(h(CheckboxField, { defaultChecked: true, label: "Cliente activo", name: "active" }));
    const box = controlOf(container, "active") as HTMLInputElement;
    expect(box.type).toBe("checkbox");
    expect(box.checked).toBe(true);
    expect(box.value).toBe("on");
    expect(container.querySelector("label")?.htmlFor).toBe(box.id);
    expect(container.querySelector("label")?.textContent).toContain("Cliente activo");
  });

  it("lleva ayuda enlazada y, con error del formulario, aria-invalid y el error primero", async () => {
    const { container } = await mount(
      withErrors({ terms: "Debe aceptar." }, h(CheckboxField, { help: "Sin esto no puede continuar.", label: "Acepto", name: "terms", required: true })),
    );
    const box = controlOf(container, "terms");
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(describedText(container, box)).toEqual(["Debe aceptar.", "Sin esto no puede continuar."]);
    expect((box as HTMLInputElement).required).toBe(true);
  });

  it("deshabilitada: el control lo está y la fila no invita al clic", async () => {
    const { container } = await mount(h(CheckboxField, { disabled: true, label: "Bloqueada", name: "x" }));
    expect((controlOf(container, "x") as HTMLInputElement).disabled).toBe(true);
  });
});

describe("atributos nuevos de Field", () => {
  it("min, max, step, pattern, minLength, list, readOnly, disabled, inputMode y autoComplete llegan al input", async () => {
    const { container } = await mount(
      h(Field, {
        autoComplete: "tel",
        disabled: false,
        inputMode: "decimal",
        label: "Monto",
        list: "sugerencias",
        max: 100,
        min: "0",
        minLength: 2,
        name: "amount",
        pattern: "[0-9.]+",
        readOnly: true,
        step: "any",
        type: "number",
      }),
    );
    const input = controlOf(container, "amount") as HTMLInputElement;
    expect(input.getAttribute("min")).toBe("0");
    expect(input.getAttribute("max")).toBe("100");
    expect(input.getAttribute("step")).toBe("any");
    expect(input.getAttribute("pattern")).toBe("[0-9.]+");
    expect(input.getAttribute("minlength")).toBe("2");
    expect(input.getAttribute("list")).toBe("sugerencias");
    expect(input.getAttribute("inputmode")).toBe("decimal");
    expect(input.getAttribute("autocomplete")).toBe("tel");
    expect(input.readOnly).toBe(true);
    expect(input.disabled).toBe(false);
    expect(input.type).toBe("number");
  });

  it("step solo se escribe cuando se pide: sin step el HTML no cambia (paso nativo 1)", async () => {
    const { container } = await mount(
      h("form", null, [
        h(Field, { key: "a", label: "Con step", name: "withStep", step: "any", type: "number" }),
        h(Field, { key: "b", label: "Sin step", name: "withoutStep", type: "number" }),
      ]),
    );
    expect(controlOf(container, "withStep").getAttribute("step")).toBe("any");
    expect(controlOf(container, "withoutStep").hasAttribute("step")).toBe(false);
  });

  it("disabled y readOnly deshabilitan o bloquean el control; value controlado se refleja", async () => {
    const { container } = await mount(
      h("form", null, [
        h(Field, { disabled: true, key: "a", label: "A", name: "a" }),
        h(Field, { key: "b", label: "B", name: "b", onChange: () => {}, value: "fijo" }),
      ]),
    );
    expect((controlOf(container, "a") as HTMLInputElement).disabled).toBe(true);
    expect((controlOf(container, "b") as HTMLInputElement).value).toBe("fijo");
  });
});

describe("SelectField: opción vacía y opciones con disabled", () => {
  it("placeholder sin allowEmpty: marcador deshabilitado, seleccionado al inicio y obligatorio si required", async () => {
    const { container } = await mount(
      h("form", null, h(SelectField, { label: "Cliente", name: "customerId", options: [{ label: "Acme", value: "1" }, { label: "Beta", value: "2" }], placeholder: "Seleccione un cliente", required: true })),
    );
    const select = controlOf(container, "customerId") as HTMLSelectElement;
    const first = select.options[0];
    expect(first.value).toBe("");
    expect(first.textContent).toBe("Seleccione un cliente");
    expect(first.disabled).toBe(true);
    // Sin `defaultValue=""` el navegador elegiría "Acme" (la primera no deshabilitada).
    expect(select.value).toBe("");
    expect(select.selectedIndex).toBe(0);
    expect(select.validity.valueMissing).toBe(true);
  });

  it("allowEmpty: la opción vacía se puede elegir (campo opcional) y envía cadena vacía", async () => {
    const { container } = await mount(
      h("form", null, h(SelectField, { allowEmpty: true, label: "Equipo", name: "equipmentId", options: [{ label: "CHS-01", value: "e1" }], placeholder: "Sin equipo" })),
    );
    const select = controlOf(container, "equipmentId") as HTMLSelectElement;
    expect(select.options[0].disabled).toBe(false);
    expect(select.value).toBe("");
    expect(select.validity.valueMissing).toBe(false);
    expect(new FormData(select.form!).get("equipmentId")).toBe("");
  });

  it("defaultValue gana sobre el marcador", async () => {
    const { container } = await mount(
      h(SelectField, { defaultValue: "2", label: "Cliente", name: "c", options: [{ label: "Acme", value: "1" }, { label: "Beta", value: "2" }], placeholder: "Seleccione" }),
    );
    expect((controlOf(container, "c") as HTMLSelectElement).value).toBe("2");
  });

  it("las opciones admiten disabled y children se pinta después", async () => {
    const { container } = await mount(
      h(
        SelectField,
        { label: "Vehículo", name: "vehicleId", options: [{ label: "TRK-01", value: "v1" }, { disabled: true, label: "TRK-02 · en mantenimiento", value: "v2" }] },
        h("option", { value: "extra" }, "Extra"),
      ),
    );
    const select = controlOf(container, "vehicleId") as HTMLSelectElement;
    expect([...select.options].map((option) => [option.value, option.disabled])).toEqual([
      ["v1", false],
      ["v2", true],
      ["extra", false],
    ]);
  });

  it("sin placeholder no añade opción vacía (uso original con children)", async () => {
    const { container } = await mount(h(SelectField, { label: "Tipo", name: "t" }, h("option", { value: "A" }, "A"), h("option", { value: "B" }, "B")));
    const select = controlOf(container, "t") as HTMLSelectElement;
    expect(select.options).toHaveLength(2);
    expect(select.value).toBe("A");
  });
});

describe("SubmitButton fuera y dentro de un formulario con contexto", () => {
  it("fuera de ServerForm no se deshabilita (contexto neutro)", async () => {
    const { container } = await mount(h("form", null, h(SubmitButton, null, "Guardar")));
    const button = container.querySelector("button")!;
    expect(button.disabled).toBe(false);
    expect(button.getAttribute("aria-busy")).toBe("false");
  });

  it("con pending del contexto se deshabilita, anuncia ocupado y muestra el spinner sin cambiar el texto", async () => {
    const { container } = await mount(
      h(FormContext.Provider, { value: { ...DEFAULT_FORM_CONTEXT, pending: true } }, h("form", null, h(SubmitButton, null, "Guardar"))),
    );
    const button = container.querySelector("button")!;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.querySelector("svg")).not.toBeNull();
    expect(button.textContent).toBe("Guardar");
  });

  it("con ready=false (antes de hidratar) queda deshabilitado pero sin spinner", async () => {
    const { container } = await mount(
      h(FormContext.Provider, { value: { ...DEFAULT_FORM_CONTEXT, ready: false } }, h("form", null, h(SubmitButton, null, "Guardar"))),
    );
    const button = container.querySelector("button")!;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("false");
    expect(button.querySelector("svg")).toBeNull();
  });

  it("disabled propio (p. ej. 'Importar 0 filas') lo deshabilita sin spinner ni aria-busy, y no afecta a los demás", async () => {
    const { container } = await mount(
      h("form", null, h(SubmitButton, { disabled: true, key: "a" }, "Importar 0 filas"), h(SubmitButton, { disabled: false, key: "b" }, "Importar 3 filas")),
    );
    const [blocked, free] = [...container.querySelectorAll("button")];
    expect(blocked.disabled).toBe(true);
    expect(blocked.getAttribute("aria-busy")).toBe("false");
    expect(blocked.querySelector("svg")).toBeNull();
    expect(free.disabled).toBe(false);
  });

  it("disabled propio sigue deshabilitado aunque el formulario ya esté listo y sin envío en curso", async () => {
    const { container } = await mount(
      h(FormContext.Provider, { value: { ...DEFAULT_FORM_CONTEXT, ready: true, pending: false } }, h("form", null, h(SubmitButton, { disabled: true }, "Guardar"))),
    );
    expect(container.querySelector("button")!.disabled).toBe(true);
  });
});
