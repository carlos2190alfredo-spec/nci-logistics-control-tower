import { describe, expect, it } from "vitest";
import { actionError, actionOk, idleActionResult, isActionResult } from "@/lib/server/action-result";

describe("actionError / actionOk (retrocompatibilidad)", () => {
  it("actionError(msg) conserva exactamente la forma original, sin claves nuevas", () => {
    // toStrictEqual: una clave `fieldErrors: undefined` haría fallar esta prueba.
    expect(actionError("No se pudo")).toStrictEqual({ status: "error", message: "No se pudo" });
    expect(Object.keys(actionError("x"))).toEqual(["status", "message"]);
  });

  it("actionOk e idle no cambian", () => {
    expect(actionOk("Listo")).toStrictEqual({ status: "success", message: "Listo" });
    expect(idleActionResult).toStrictEqual({ status: "idle" });
  });

  it("añade fieldErrors y values solo cuando traen contenido", () => {
    const withErrors = actionError("Revise los datos.", { fieldErrors: { name: "Escriba el nombre." } });
    expect(withErrors).toStrictEqual({ status: "error", message: "Revise los datos.", fieldErrors: { name: "Escriba el nombre." } });

    const withBoth = actionError("Revise.", { fieldErrors: { a: "1" }, values: { a: "x", b: "" } });
    expect(withBoth).toStrictEqual({ status: "error", message: "Revise.", fieldErrors: { a: "1" }, values: { a: "x", b: "" } });
  });

  it("omite objetos vacíos o ausentes (no devuelve `fieldErrors: {}`)", () => {
    expect(actionError("x", { fieldErrors: {} })).toStrictEqual({ status: "error", message: "x" });
    expect(actionError("x", { values: {} })).toStrictEqual({ status: "error", message: "x" });
    expect(actionError("x", {})).toStrictEqual({ status: "error", message: "x" });
    expect(actionError("x", undefined)).toStrictEqual({ status: "error", message: "x" });
  });
});

describe("isActionResult", () => {
  it("acepta las tres formas válidas", () => {
    expect(isActionResult({ status: "idle" })).toBe(true);
    expect(isActionResult({ status: "success", message: "ok" })).toBe(true);
    expect(isActionResult({ status: "error", message: "mal" })).toBe(true);
    expect(isActionResult(actionError("x", { fieldErrors: { a: "b" } }))).toBe(true);
  });

  it("rechaza lo que una acción sin resultado o con forma inesperada podría devolver", () => {
    expect(isActionResult(undefined)).toBe(false);
    expect(isActionResult(null)).toBe(false);
    expect(isActionResult("success")).toBe(false);
    expect(isActionResult(42)).toBe(false);
    expect(isActionResult({})).toBe(false);
    expect(isActionResult({ status: "success" })).toBe(false);
    expect(isActionResult({ status: "error", message: 5 })).toBe(false);
    expect(isActionResult({ status: "otro", message: "x" })).toBe(false);
  });
});
