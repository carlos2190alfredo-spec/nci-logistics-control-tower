// @vitest-environment jsdom
import { act } from "react";
import { el as h } from "@/components/ui/test-element";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { byText, click, deferred, mount, press, settle, unmountAll } from "@/components/ui/dom-test-utils";
import { Field } from "@/components/ui/field";
import type { FormAction } from "@/components/ui/form-submit";
import { ServerForm } from "@/components/ui/server-form";
import { actionOk, type ActionResult } from "@/lib/server/action-result";

afterEach(unmountAll);

const props = {
  confirmLabel: "Sí, desactivar",
  label: "Desactivar",
  message: "¿Desactivar a Acme S.A.? También se desactivará el acceso de sus usuarios.",
};

/** `<form>` sencillo, como el de una acción de fila: cuenta los envíos que de verdad se producen. */
async function mountRowForm(children?: ReturnType<typeof h>) {
  const submits: FormData[] = [];
  const view = await mount(
    h(
      "form",
      {
        onSubmit: (event: { preventDefault: () => void; currentTarget: HTMLFormElement }) => {
          event.preventDefault();
          submits.push(new FormData(event.currentTarget));
        },
      },
      h(ConfirmSubmit, props, children),
    ),
  );
  return { ...view, submits, form: view.container.querySelector("form")! };
}

function buttons(container: HTMLElement) {
  return [...container.querySelectorAll("button")].map((button) => ({ text: button.textContent?.trim(), type: button.type, disabled: button.disabled }));
}

describe("ConfirmSubmit: estado inicial y apertura", () => {
  it("al inicio solo existe el botón que abre la pregunta (type=button): no hay botón de envío en el DOM", async () => {
    const { container, submits } = await mountRowForm();
    expect(buttons(container)).toEqual([{ text: "Desactivar", type: "button", disabled: false }]);
    expect(container.textContent).not.toContain("¿Desactivar a Acme");

    await click(container.querySelector("button")!);
    // Abrir la pregunta NO envía nada.
    expect(submits).toHaveLength(0);
  });

  it("al abrir muestra la pregunta, los dos botones y manda el foco a Cancelar (la opción menos destructiva)", async () => {
    const { container } = await mountRowForm();
    await click(container.querySelector("button")!);

    const group = container.querySelector('[role="group"]')!;
    expect(group.textContent).toContain(props.message);
    expect(group.getAttribute("aria-labelledby")).toBe(group.querySelector("p")!.id);
    expect(buttons(container)).toEqual([
      { text: "Sí, desactivar", type: "submit", disabled: false },
      { text: "Cancelar", type: "button", disabled: false },
    ]);
    expect(document.activeElement).toBe(byText(container, "button", "Cancelar"));
    // El contenedor permanente es una región viva: el cambio se anuncia.
    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live?.contains(group)).toBe(true);
  });
});

describe("ConfirmSubmit: confirmar, cancelar y Escape", () => {
  it("solo el botón de confirmación envía el formulario, y lo hace una vez", async () => {
    const { container, submits } = await mountRowForm();
    await click(container.querySelector("button")!);
    expect(submits).toHaveLength(0);
    await click(byText(container, "button", "Sí, desactivar"));
    expect(submits).toHaveLength(1);
  });

  it("Cancelar cierra sin enviar y devuelve el foco al botón original", async () => {
    const { container, submits } = await mountRowForm();
    await click(container.querySelector("button")!);
    await click(byText(container, "button", "Cancelar"));

    expect(submits).toHaveLength(0);
    expect(buttons(container)).toEqual([{ text: "Desactivar", type: "button", disabled: false }]);
    expect(document.activeElement).toBe(container.querySelector("button"));
  });

  it("Escape cancela, no envía y devuelve el foco", async () => {
    const { container, submits } = await mountRowForm();
    await click(container.querySelector("button")!);
    await press(byText(container, "button", "Cancelar"), "Escape");

    expect(submits).toHaveLength(0);
    expect(container.querySelector('[role="group"]')).toBeNull();
    expect(document.activeElement).toBe(container.querySelector("button"));
  });

  it("otras teclas no cierran la confirmación", async () => {
    const { container } = await mountRowForm();
    await click(container.querySelector("button")!);
    await press(byText(container, "button", "Cancelar"), "Tab");
    await press(byText(container, "button", "Cancelar"), "a");
    expect(container.querySelector('[role="group"]')).not.toBeNull();
  });

  it("los hijos (p. ej. un campo oculto) solo existen y se envían una vez abierta la confirmación", async () => {
    const { container, form, submits } = await mountRowForm(h("input", { name: "customerId", type: "hidden", value: "c-1" }));
    expect(new FormData(form).has("customerId")).toBe(false);

    await click(container.querySelector("button")!);
    await click(byText(container, "button", "Sí, desactivar"));
    expect(submits[0].get("customerId")).toBe("c-1");
  });
});

describe("ConfirmSubmit dentro de un ServerForm", () => {
  it("durante el envío deshabilita ambos botones, ignora Escape y se cierra solo al terminar", async () => {
    const pending = deferred<ActionResult>();
    const action = vi.fn<FormAction>(() => pending.promise);
    const { container } = await mount(
      h(
        ServerForm,
        { action },
        h(Field, { key: "reason", label: "Motivo del cambio", name: "reason", required: false }),
        h(ConfirmSubmit, { key: "c", ...props }),
      ),
    );
    await click(container.querySelector("button")!);
    await click(byText(container, "button", "Sí, desactivar"));
    expect(action).toHaveBeenCalledTimes(1);

    // En curso: confirmar con spinner, cancelar bloqueado y Escape sin efecto.
    const confirm = byText<HTMLButtonElement>(container, "button", "Sí, desactivar");
    expect(confirm.disabled).toBe(true);
    expect(confirm.getAttribute("aria-busy")).toBe("true");
    expect(confirm.querySelector("svg")).not.toBeNull();
    expect(byText<HTMLButtonElement>(container, "button", "Cancelar").disabled).toBe(true);
    await press(container.querySelector('[role="group"]')!, "Escape");
    expect(container.querySelector('[role="group"]')).not.toBeNull();

    await act(async () => {
      pending.resolve(actionOk("Cliente desactivado."));
    });
    await settle();
    expect(container.querySelector('[role="group"]')).toBeNull();
    expect(buttons(container).filter((b) => b.type === "button" || b.type === "submit")).toEqual([{ text: "Desactivar", type: "button", disabled: false }]);
    expect(container.textContent).toContain("Cliente desactivado.");
    // El botón de confirmación desapareció con el foco: vuelve al botón original (no se pierde en <body>).
    expect(document.activeElement).toBe(byText(container, "button", "Desactivar"));
  });

  it("si la acción falla la confirmación también se cierra y el error queda visible", async () => {
    const action = vi.fn<FormAction>(async () => ({ status: "error", message: "No se pudo desactivar." }));
    const { container } = await mount(h(ServerForm, { action }, h(ConfirmSubmit, props)));
    await click(container.querySelector("button")!);
    await click(byText(container, "button", "Sí, desactivar"));
    await settle();
    expect(container.querySelector('[role="group"]')).toBeNull();
    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("No se pudo desactivar.");
    // Con un error el foco lo recoge la alerta del formulario, no el botón original.
    expect(document.activeElement).toBe(alert?.parentElement);
  });
});
