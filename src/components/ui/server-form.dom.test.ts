// @vitest-environment jsdom
import { Component, act, type ReactNode } from "react";
import { el as h } from "@/components/ui/test-element";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SubmitButton } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/checkbox";
import { deferred, mount, settle, typeInto, unmountAll } from "@/components/ui/dom-test-utils";
import { Field } from "@/components/ui/field";
import { GENERIC_ACTION_ERROR_MESSAGE, type FormAction } from "@/components/ui/form-submit";
import { ServerForm } from "@/components/ui/server-form";
import { actionError, actionOk, idleActionResult, type ActionResult } from "@/lib/server/action-result";

afterEach(unmountAll);

function redirectError() {
  return Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;push;/t/acme/customers?aviso=cliente-creado;307;" });
}

/** Límite de errores mínimo: lo que hace el RedirectBoundary del router de Next con lo que React le entrega. */
class Boundary extends Component<{ children: ReactNode; onCatch: (error: unknown) => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    this.props.onCatch(error);
  }
  render() {
    return this.state.failed ? h("p", { "data-testid": "boundary" }, "límite activado") : this.props.children;
  }
}

function formElements(container: HTMLElement) {
  return {
    form: container.querySelector("form")!,
    name: container.querySelector<HTMLInputElement>('input[name="name"]')!,
    email: container.querySelector<HTMLInputElement>('input[name="email"]')!,
    button: container.querySelector<HTMLButtonElement>('button[type="submit"]')!,
  };
}

/** Formulario típico: dos campos, una casilla y el botón de envío del kit. */
function customerForm(action: FormAction, props: { resetOnSuccess?: boolean; onSuccess?: (message: string) => void } = {}) {
  return h(
    ServerForm,
    { action, className: "grid gap-3", testId: "customer-form", ...props },
    h(Field, { key: "name", label: "Razón social", name: "name" }),
    h(Field, { key: "email", label: "Correo", name: "email", required: false, type: "email" }),
    h(SubmitButton, { key: "submit" }, "Registrar cliente"),
  );
}

/** El campo "Razón social" es obligatorio: sin él la validación nativa bloquea el envío (como en el navegador). */
async function fillRequired(container: HTMLElement, value = "Acme S.A.") {
  await typeInto(container.querySelector<HTMLInputElement>('input[name="name"]')!, value);
}

async function submit(form: HTMLFormElement, submitter?: HTMLElement) {
  await act(async () => {
    form.requestSubmit(submitter);
  });
  await settle();
}

describe("ServerForm: error de validación", () => {
  it("NO pierde lo escrito, muestra la alerta con foco y pinta el error junto al campo", async () => {
    const action = vi.fn<FormAction>(async () =>
      actionError("Revise los datos marcados.", { fieldErrors: { name: "Escriba la razón social." } }),
    );
    const { container } = await mount(customerForm(action));
    const { form, name, email, button } = formElements(container);

    await typeInto(name, "Acme S.A.");
    await typeInto(email, "ventas@acme.test");
    await submit(form);

    expect(action).toHaveBeenCalledTimes(1);
    // Lo escrito sigue ahí: este es el defecto de <form action> que ServerForm corrige.
    expect(name.value).toBe("Acme S.A.");
    expect(email.value).toBe("ventas@acme.test");

    const alert = container.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain("Revise los datos marcados.");
    // El foco va al contenedor de la alerta (tabIndex=-1), no se queda en el botón.
    expect(document.activeElement).toBe(alert?.parentElement);
    expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");

    // El error por campo llega por contexto al campo correcto y solo a él.
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(container.textContent).toContain("Escriba la razón social.");
    expect(email.getAttribute("aria-invalid")).toBeNull();
    // El botón vuelve a estar disponible para reintentar.
    expect(button.disabled).toBe(false);
  });

  it("editar un campo borra SOLO su error; el de los demás permanece", async () => {
    const action = vi.fn<FormAction>(async () =>
      actionError("Revise.", { fieldErrors: { name: "Escriba la razón social.", email: "Correo no válido." } }),
    );
    const { container } = await mount(customerForm(action));
    const { form, name, email } = formElements(container);

    await fillRequired(container);
    await submit(form);
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(email.getAttribute("aria-invalid")).toBe("true");

    await typeInto(name, "A");
    expect(name.getAttribute("aria-invalid")).toBeNull();
    expect(container.textContent).not.toContain("Escriba la razón social.");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(container.textContent).toContain("Correo no válido.");
  });

  it("un error repetido vuelve a llevar el foco a la alerta aunque el mensaje sea idéntico", async () => {
    const action = vi.fn<FormAction>(async () => actionError("Revise los datos marcados."));
    const { container } = await mount(customerForm(action));
    const { form, name } = formElements(container);

    await fillRequired(container);
    await submit(form);
    const first = document.activeElement;
    expect(first?.getAttribute("tabindex")).toBe("-1");

    name.focus();
    expect(document.activeElement).toBe(name);
    await submit(form);
    expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
    expect(document.activeElement?.textContent).toContain("Revise los datos marcados.");
  });

  it("le pasa a la acción el resultado anterior (misma firma que useActionState)", async () => {
    const results: ActionResult[] = [actionError("Primero falla.", { fieldErrors: { name: "x" } }), actionOk("Ahora sí.")];
    const action = vi.fn<FormAction>(async () => results.shift()!);
    const { container } = await mount(customerForm(action));
    const { form } = formElements(container);

    await fillRequired(container);
    await submit(form);
    await submit(form);
    expect(action.mock.calls[0][0]).toStrictEqual(idleActionResult);
    expect(action.mock.calls[1][0]).toStrictEqual({ status: "error", message: "Primero falla.", fieldErrors: { name: "x" } });
  });

  it("los errores por campo recién llegados de la red se sanean antes de publicarse", async () => {
    const hostile = { status: "error", message: "Revise.", fieldErrors: { name: "Mal nombre.", email: 99, ["__proto__"]: "x" } } as unknown as ActionResult;
    const action = vi.fn<FormAction>(async () => hostile);
    const { container } = await mount(customerForm(action));
    const { form, name, email } = formElements(container);
    await fillRequired(container);
    await submit(form);
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(email.getAttribute("aria-invalid")).toBeNull();
  });
});

describe("ServerForm: éxito", () => {
  it("resetea el formulario, anuncia el mensaje con role=status, llama onSuccess y devuelve el foco al botón", async () => {
    const action = vi.fn<FormAction>(async () => actionOk("Cliente registrado."));
    const onSuccess = vi.fn();
    const { container } = await mount(customerForm(action, { onSuccess }));
    const { form, name, email, button } = formElements(container);

    await typeInto(name, "Acme S.A.");
    await typeInto(email, "ventas@acme.test");
    button.focus();
    await submit(form, button);

    expect(name.value).toBe("");
    expect(email.value).toBe("");
    const status = container.querySelector('[role="status"]');
    expect(status?.textContent).toContain("Cliente registrado.");
    expect(status?.parentElement?.getAttribute("aria-live")).toBe("polite");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith("Cliente registrado.");
    expect(button.disabled).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it("resetOnSuccess={false} conserva los valores (formularios de edición)", async () => {
    const action = vi.fn<FormAction>(async () => actionOk("Cambios guardados."));
    const { container } = await mount(customerForm(action, { resetOnSuccess: false }));
    const { form, name } = formElements(container);

    await typeInto(name, "Acme Editado");
    await submit(form);
    expect(name.value).toBe("Acme Editado");
    expect(container.textContent).toContain("Cambios guardados.");
  });

  it("después de un error, un éxito limpia los errores por campo", async () => {
    const results: ActionResult[] = [actionError("Revise.", { fieldErrors: { name: "Falla." } }), actionOk("Listo.")];
    const action = vi.fn<FormAction>(async () => results.shift()!);
    const { container } = await mount(customerForm(action));
    const { form, name } = formElements(container);
    await fillRequired(container);
    await submit(form);
    expect(name.getAttribute("aria-invalid")).toBe("true");
    await submit(form);
    expect(name.getAttribute("aria-invalid")).toBeNull();
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });
});

describe("ServerForm: envío en curso", () => {
  it("deshabilita el botón, marca aria-busy y descarta un segundo envío hasta que termina", async () => {
    const pending = deferred<ActionResult>();
    const action = vi.fn<FormAction>(() => pending.promise);
    const { container } = await mount(customerForm(action));
    const { form, name, button } = formElements(container);

    await typeInto(name, "Acme");
    await act(async () => {
      form.requestSubmit();
      // Segundo envío en el mismo instante (doble clic, Intro repetido).
      form.requestSubmit();
    });

    expect(action).toHaveBeenCalledTimes(1);
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(form.getAttribute("aria-busy")).toBe("true");

    // Aun con el botón deshabilitado, Intro dentro del campo no relanza la acción.
    await act(async () => {
      form.requestSubmit();
    });
    expect(action).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(actionOk("Listo."));
    });
    await settle();
    expect(button.disabled).toBe(false);
    expect(form.getAttribute("aria-busy")).toBeNull();

    // Terminado, un nuevo envío SÍ se admite (el candado se liberó).
    await typeInto(name, "Otra");
    await submit(form);
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("si el navegador suelta el foco del botón mientras está deshabilitado (Firefox), al terminar se lo devuelve", async () => {
    const pending = deferred<ActionResult>();
    const action = vi.fn<FormAction>(() => pending.promise);
    const { container } = await mount(customerForm(action));
    const { form, button } = formElements(container);
    await fillRequired(container);

    button.focus();
    await act(async () => {
      form.requestSubmit(button);
    });
    expect(button.disabled).toBe(true);

    // jsdom no suelta el foco de un botón deshabilitado (`blur()` no hace nada con un elemento que ya no es
    // enfocable) y Firefox sí. Se simula esa pérdida haciendo que el documento diga que el foco está en <body>.
    Object.defineProperty(document, "activeElement", { configurable: true, get: () => document.body });
    const focus = vi.spyOn(button, "focus");
    try {
      // Mientras la acción sigue en curso no se toca el foco: el botón está deshabilitado y no podría recibirlo.
      expect(focus).not.toHaveBeenCalled();
      await act(async () => {
        pending.resolve(actionOk("Listo."));
      });
      await settle();
      expect(button.disabled).toBe(false);
      expect(focus).toHaveBeenCalledTimes(1);
    } finally {
      // Quita el sustituto de la instancia: vuelve a verse el getter real del prototipo.
      delete (document as unknown as Record<string, unknown>).activeElement;
    }
  });

  it("pero no le roba el foco si la persona ya lo movió a otro campo mientras esperaba", async () => {
    const pending = deferred<ActionResult>();
    const action = vi.fn<FormAction>(() => pending.promise);
    const { container } = await mount(customerForm(action));
    const { form, email, button } = formElements(container);
    await fillRequired(container);

    button.focus();
    await act(async () => {
      form.requestSubmit(button);
    });
    await act(async () => {
      button.blur();
      email.focus();
    });

    await act(async () => {
      pending.resolve(actionOk("Listo."));
    });
    await settle();
    expect(document.activeElement).toBe(email);
  });

  it("al reenviar retira el mensaje anterior y un éxito idéntico vuelve a montarse (se anuncia otra vez)", async () => {
    const pending = deferred<ActionResult>();
    const action = vi.fn<FormAction>(async () => actionOk("Cliente registrado."));
    const { container } = await mount(customerForm(action));
    const { form } = formElements(container);

    await fillRequired(container);
    await submit(form);
    const firstStatus = container.querySelector('[role="status"]');
    expect(firstStatus?.textContent).toContain("Cliente registrado.");

    // Segundo envío con la acción en curso: no debe verse el "Cliente registrado." anterior.
    action.mockImplementationOnce(() => pending.promise);
    await fillRequired(container, "Otra S.A.");
    await act(async () => {
      form.requestSubmit();
    });
    expect(container.querySelector('[role="status"]')).toBeNull();

    await act(async () => {
      pending.resolve(actionOk("Cliente registrado."));
    });
    await settle();
    const secondStatus = container.querySelector('[role="status"]');
    expect(secondStatus?.textContent).toContain("Cliente registrado.");
    // Nodo nuevo: una región viva solo anuncia lo que cambia.
    expect(secondStatus).not.toBe(firstStatus);
  });

  it("si se desmonta mientras corre la acción (la persona navegó), no llama a onSuccess ni falla", async () => {
    const pending = deferred<ActionResult>();
    const action = vi.fn<FormAction>(() => pending.promise);
    const onSuccess = vi.fn();
    const { container, root } = await mount(customerForm(action, { onSuccess }));
    await fillRequired(container);
    await act(async () => {
      container.querySelector("form")!.requestSubmit();
    });
    expect(action).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.unmount();
    });
    await act(async () => {
      pending.resolve(actionOk("Listo."));
    });
    await settle();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("incluye en el FormData el botón que originó el envío y los valores escritos", async () => {
    const action = vi.fn<FormAction>(async () => actionOk("ok"));
    const { container } = await mount(
      h(
        ServerForm,
        { action },
        h("input", { defaultValue: "Acme", key: "n", name: "name" }),
        h("button", { key: "b", name: "intent", type: "submit", value: "guardar-y-nuevo" }, "Guardar y nuevo"),
      ),
    );
    const button = container.querySelector("button")!;
    await submit(container.querySelector("form")!, button);
    const formData = action.mock.calls[0][1];
    expect([...formData.entries()]).toEqual([
      ["name", "Acme"],
      ["intent", "guardar-y-nuevo"],
    ]);
  });
});

describe("ServerForm: fallos que no son errores de negocio", () => {
  it("una excepción inesperada muestra un mensaje en español, conserva los datos y no filtra el error", async () => {
    const action = vi.fn<FormAction>(async () => {
      throw new Error("connect ECONNREFUSED 10.0.0.5:5432");
    });
    const { container } = await mount(customerForm(action));
    const { form, name, button } = formElements(container);
    await typeInto(name, "Acme");
    await submit(form);

    expect(container.querySelector('[role="alert"]')?.textContent).toContain(GENERIC_ACTION_ERROR_MESSAGE);
    expect(container.textContent).not.toContain("ECONNREFUSED");
    expect(name.value).toBe("Acme");
    expect(button.disabled).toBe(false);
  });

  it("NEXT_REDIRECT se deja propagar al límite de errores del router y NO se muestra como error", async () => {
    const error = redirectError();
    const action = vi.fn<FormAction>(async () => {
      throw error;
    });
    const caught: unknown[] = [];
    const { container } = await mount(h(Boundary, { onCatch: (e: unknown) => caught.push(e) }, customerForm(action)));
    const form = container.querySelector("form")!;

    await fillRequired(container);
    await submit(form);

    expect(caught).toEqual([error]);
    expect(caught[0]).toBe(error);
    // El límite reemplazó el árbol: no hay formulario ni alerta genérica.
    expect(container.querySelector('[data-testid="boundary"]')).not.toBeNull();
    expect(container.textContent).not.toContain(GENERIC_ACTION_ERROR_MESSAGE);
  });

  it("una acción que termina sin resultado (p. ej. navegó) no resetea ni muestra nada", async () => {
    const action = vi.fn(async () => undefined) as unknown as FormAction;
    const { container } = await mount(customerForm(action));
    const { form, name, button } = formElements(container);
    await typeInto(name, "Acme");
    await submit(form);

    expect(name.value).toBe("Acme");
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(button.disabled).toBe(false);
  });
});

describe("ServerForm: otros controles y atributos", () => {
  it("limpia el error al editar también controles que no son del kit (se usa el name del control)", async () => {
    const action = vi.fn<FormAction>(async () => actionError("Revise.", { fieldErrors: { raw: "Falla del control." } }));
    const { container } = await mount(
      h(
        ServerForm,
        { action },
        h(Field, { key: "f", label: "Campo del kit", name: "kit", required: false }),
        h("input", { "aria-label": "Control propio", key: "r", name: "raw" }),
        h("button", { key: "b", type: "submit" }, "Enviar"),
      ),
    );
    const raw = container.querySelector<HTMLInputElement>('input[name="raw"]')!;
    await submit(container.querySelector("form")!);
    expect(container.textContent).not.toContain("Falla del control.");
    // (la alerta global sí está; el mensaje por campo solo se pinta en los campos del kit)
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("Revise.");
    await typeInto(raw, "algo");
    expect(raw.value).toBe("algo");
  });

  it("CheckboxField recibe el error por contexto y se marca como inválido", async () => {
    const action = vi.fn<FormAction>(async () => actionError("Revise.", { fieldErrors: { accept: "Debe aceptar las condiciones." } }));
    const { container } = await mount(
      h(
        ServerForm,
        { action },
        h(CheckboxField, { key: "c", label: "Acepto las condiciones", name: "accept" }),
        h(SubmitButton, { key: "s" }, "Continuar"),
      ),
    );
    await submit(container.querySelector("form")!);
    const box = container.querySelector<HTMLInputElement>('input[name="accept"]')!;
    expect(box.getAttribute("aria-invalid")).toBe("true");
    expect(container.textContent).toContain("Debe aceptar las condiciones.");
  });

  it("expone testid, nombre accesible y method=dialog (un envío nativo temprano no navega)", async () => {
    const action = vi.fn<FormAction>(async () => actionOk("ok"));
    const { container } = await mount(h(ServerForm, { action, id: "f1", label: "Nuevo cliente", testId: "customer-form" }, h("button", { type: "submit" }, "Ok")));
    const form = container.querySelector("form")!;
    expect(form.getAttribute("data-testid")).toBe("customer-form");
    expect(form.getAttribute("aria-label")).toBe("Nuevo cliente");
    expect(form.id).toBe("f1");
    expect(form.getAttribute("method")).toBe("dialog");
  });

  it("cancela el envío nativo (preventDefault): ni navega ni cierra un <dialog> que lo contenga", async () => {
    const action = vi.fn<FormAction>(async () => actionOk("ok"));
    const { container } = await mount(h(ServerForm, { action }, h("button", { type: "submit" }, "Ok")));
    // method="dialog" ya hace inofensivo el envío nativo FUERA de un <dialog>, pero dentro de uno lo cerraría:
    // solo preventDefault lo evita. Un oyente en `document` corre DESPUÉS del de React (colgado del contenedor
    // raíz) y ve el estado final del evento.
    let prevented: boolean | undefined;
    const listener = (event: Event) => {
      prevented = event.defaultPrevented;
    };
    document.addEventListener("submit", listener);
    try {
      await submit(container.querySelector("form")!);
    } finally {
      document.removeEventListener("submit", listener);
    }
    expect(action).toHaveBeenCalledTimes(1);
    expect(prevented).toBe(true);
  });
});

describe("ServerForm: hidratación", () => {
  it("el HTML de servidor trae el botón de envío deshabilitado y la hidratación lo habilita", async () => {
    const action = vi.fn<FormAction>(async () => actionOk("ok"));
    const element = customerForm(action);
    const html = renderToString(element);
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*type="submit"/);

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    expect(container.querySelector("button")!.disabled).toBe(true);

    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(container, element, { onRecoverableError: (error) => { throw error; } });
    });
    expect(container.querySelector("button")!.disabled).toBe(false);

    // Tras hidratar, el envío funciona.
    await typeInto(container.querySelector<HTMLInputElement>('input[name="name"]')!, "Acme");
    await submit(container.querySelector("form")!);
    expect(action).toHaveBeenCalledTimes(1);

    await act(async () => root!.unmount());
    container.remove();
  });
});
