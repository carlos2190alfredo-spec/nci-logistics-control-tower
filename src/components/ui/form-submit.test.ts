import { describe, expect, it, vi } from "vitest";
import {
  classifyActionFailure,
  GENERIC_ACTION_ERROR_MESSAGE,
  isFrameworkControlFlowError,
  normalizeActionResult,
  runFormAction,
  STALE_DEPLOYMENT_ERROR_MESSAGE,
  type FormAction,
} from "@/components/ui/form-submit";
import { actionError, actionOk, idleActionResult, type ActionResult } from "@/lib/server/action-result";

/** Error idéntico al que Next rechaza cuando una server action hace `redirect()` (server-action-reducer). */
function redirectError(destination = "/t/acme/customers?aviso=cliente-creado") {
  return Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;push;${destination};307;` });
}

function notFoundError(status = 404) {
  return Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;" + status), { digest: `NEXT_HTTP_ERROR_FALLBACK;${status}` });
}

function formWith(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

describe("isFrameworkControlFlowError", () => {
  it("reconoce redirect y las páginas de acceso (404/403/401)", () => {
    expect(isFrameworkControlFlowError(redirectError())).toBe(true);
    expect(isFrameworkControlFlowError(redirectError("/login"))).toBe(true);
    expect(isFrameworkControlFlowError({ digest: "NEXT_REDIRECT" })).toBe(true);
    expect(isFrameworkControlFlowError(notFoundError(404))).toBe(true);
    expect(isFrameworkControlFlowError(notFoundError(403))).toBe(true);
    expect(isFrameworkControlFlowError(notFoundError(401))).toBe(true);
    expect(isFrameworkControlFlowError({ digest: "NEXT_NOT_FOUND" })).toBe(true);
  });

  it("no confunde fallos reales con señales de control", () => {
    expect(isFrameworkControlFlowError(new Error("boom"))).toBe(false);
    // En producción Next sustituye el mensaje y deja un digest numérico: es un fallo, no una redirección.
    expect(isFrameworkControlFlowError(Object.assign(new Error("x"), { digest: "3948572" }))).toBe(false);
    expect(isFrameworkControlFlowError(Object.assign(new Error("x"), { digest: 12 }))).toBe(false);
    expect(isFrameworkControlFlowError({ digest: "NEXT_REDIRECTED_LATER" })).toBe(false);
    expect(isFrameworkControlFlowError("NEXT_REDIRECT")).toBe(false);
    expect(isFrameworkControlFlowError(null)).toBe(false);
    expect(isFrameworkControlFlowError(undefined)).toBe(false);
  });
});

describe("classifyActionFailure", () => {
  it("distingue control, despliegue nuevo e inesperado", () => {
    expect(classifyActionFailure(redirectError())).toBe("control-flow");
    expect(classifyActionFailure(Object.assign(new Error("x"), { name: "UnrecognizedActionError" }))).toBe("stale-deployment");
    expect(classifyActionFailure(new TypeError("Failed to fetch"))).toBe("unexpected");
    expect(classifyActionFailure("texto")).toBe("unexpected");
  });
});

describe("normalizeActionResult", () => {
  it("deja intactos éxito e idle", () => {
    const ok = actionOk("Listo");
    expect(normalizeActionResult(ok)).toBe(ok);
    expect(normalizeActionResult(idleActionResult)).toBe(idleActionResult);
  });

  it("sanea fieldErrors y values que llegan por la red", () => {
    const dirty = {
      status: "error",
      message: "Revise.",
      fieldErrors: { name: "Escriba el nombre.", extra: 7, vacio: "" },
      values: { name: "", plate: "abc" },
      ajeno: "se descarta",
    } as unknown as ActionResult;
    expect(normalizeActionResult(dirty)).toStrictEqual({
      status: "error",
      message: "Revise.",
      fieldErrors: { name: "Escriba el nombre." },
      values: { name: "", plate: "abc" },
    });
  });

  it("un error sin extras queda como { status, message }", () => {
    expect(normalizeActionResult({ status: "error", message: "x", fieldErrors: {} })).toStrictEqual({ status: "error", message: "x" });
  });
});

describe("runFormAction", () => {
  it("pasa el resultado anterior y el FormData a la acción (misma firma que useActionState)", async () => {
    const action = vi.fn<FormAction>(async () => actionOk("Guardado."));
    const previous = actionError("Antes falló.");
    const formData = formWith({ name: "Acme" });
    const outcome = await runFormAction(action, previous, formData);
    expect(action).toHaveBeenCalledExactlyOnceWith(previous, formData);
    expect(outcome).toStrictEqual({ kind: "result", result: { status: "success", message: "Guardado." } });
  });

  it("devuelve el error de negocio con sus errores por campo, saneados", async () => {
    const outcome = await runFormAction(
      async () => actionError("Revise los datos.", { fieldErrors: { name: "Escriba la razón social." } }),
      idleActionResult,
      formWith({}),
    );
    expect(outcome).toStrictEqual({
      kind: "result",
      result: { status: "error", message: "Revise los datos.", fieldErrors: { name: "Escriba la razón social." } },
    });
  });

  it("una acción que termina sin resultado (undefined) no toca el estado: kind no-result", async () => {
    const action = (async () => undefined) as unknown as FormAction;
    expect(await runFormAction(action, idleActionResult, formWith({}))).toStrictEqual({ kind: "no-result" });
  });

  it("una forma inesperada tampoco se toma por resultado", async () => {
    const action = (async () => ({ status: "weird" })) as unknown as FormAction;
    expect(await runFormAction(action, idleActionResult, formWith({}))).toStrictEqual({ kind: "no-result" });
  });

  it("NEXT_REDIRECT se propaga TAL CUAL (misma instancia), no se convierte en mensaje", async () => {
    const error = redirectError();
    const action: FormAction = async () => {
      throw error;
    };
    await expect(runFormAction(action, idleActionResult, formWith({}))).rejects.toBe(error);
  });

  it("notFound()/forbidden() también se propagan", async () => {
    for (const status of [404, 403, 401]) {
      const error = notFoundError(status);
      await expect(
        runFormAction(
          async () => {
            throw error;
          },
          idleActionResult,
          formWith({}),
        ),
      ).rejects.toBe(error);
    }
  });

  it("un fallo inesperado se vuelve un mensaje en español y NO filtra el error original", async () => {
    const outcome = await runFormAction(
      async () => {
        throw new Error("connect ECONNREFUSED 10.0.0.5:5432 password=hunter2");
      },
      idleActionResult,
      formWith({}),
    );
    expect(outcome.kind).toBe("failed");
    if (outcome.kind !== "failed") return;
    expect(outcome.result).toStrictEqual({ status: "error", message: GENERIC_ACTION_ERROR_MESSAGE });
    expect(JSON.stringify(outcome)).not.toContain("hunter2");
    expect(JSON.stringify(outcome)).not.toContain("ECONNREFUSED");
  });

  it("una excepción síncrona dentro de la acción también se captura", async () => {
    const action = (() => {
      throw new TypeError("Failed to fetch");
    }) as unknown as FormAction;
    const outcome = await runFormAction(action, idleActionResult, formWith({}));
    expect(outcome).toStrictEqual({ kind: "failed", result: { status: "error", message: GENERIC_ACTION_ERROR_MESSAGE } });
  });

  it("un despliegue nuevo (UnrecognizedActionError) pide recargar la página", async () => {
    const stale = Object.assign(new Error('Server Action "x" was not found on the server.'), { name: "UnrecognizedActionError" });
    const outcome = await runFormAction(
      async () => {
        throw stale;
      },
      idleActionResult,
      formWith({}),
    );
    expect(outcome).toStrictEqual({ kind: "failed", result: { status: "error", message: STALE_DEPLOYMENT_ERROR_MESSAGE } });
  });

  it("los mensajes genéricos están en español completo (tildes y 'usted' implícito)", () => {
    expect(GENERIC_ACTION_ERROR_MESSAGE).toMatch(/operación/);
    expect(GENERIC_ACTION_ERROR_MESSAGE).toMatch(/conexión/);
    expect(STALE_DEPLOYMENT_ERROR_MESSAGE).toMatch(/aplicación/);
  });
});
