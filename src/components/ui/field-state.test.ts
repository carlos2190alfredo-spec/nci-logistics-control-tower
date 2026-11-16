import { describe, expect, it } from "vitest";
import {
  buildDescribedBy,
  describeField,
  EMPTY_FIELD_ERRORS,
  errorIdFor,
  helpIdFor,
  normalizeStringMap,
  removeFieldError,
  resolveFieldError,
} from "@/components/ui/field-state";

describe("ids de ayuda y error", () => {
  it("derivan del id del control (el de ayuda conserva el sufijo histórico)", () => {
    expect(helpIdFor("abc")).toBe("abc-help");
    expect(errorIdFor("abc")).toBe("abc-error");
  });
});

describe("resolveFieldError", () => {
  it("lee fieldErrors[name] cuando no hay prop", () => {
    expect(resolveFieldError("email", undefined, { email: "Escriba un correo válido." })).toBe("Escriba un correo válido.");
  });

  it("la prop explícita gana sobre el contexto", () => {
    expect(resolveFieldError("email", "Otro", { email: "Del contexto" })).toBe("Otro");
  });

  it('error="" explícito significa "sin error" y NO cae al contexto', () => {
    expect(resolveFieldError("email", "", { email: "Del contexto" })).toBeUndefined();
  });

  it("no mezcla errores de otros campos", () => {
    expect(resolveFieldError("name", undefined, { email: "x" })).toBeUndefined();
  });

  it("un campo llamado como una propiedad del prototipo no hereda nada", () => {
    for (const name of ["constructor", "toString", "hasOwnProperty", "__proto__", "valueOf"]) {
      expect(resolveFieldError(name, undefined, {})).toBeUndefined();
    }
  });

  it("encuentra un campo legítimo con nombre de prototipo si el servidor lo devolvió", () => {
    const errors = JSON.parse('{"constructor":"Revise este campo."}') as Record<string, string>;
    expect(resolveFieldError("constructor", undefined, errors)).toBe("Revise este campo.");
  });
});

describe("buildDescribedBy", () => {
  it("descarta vacíos y falsos, recorta y une con espacio", () => {
    expect(buildDescribedBy(["a-error", false, undefined, null, " ", "a-help ", ""])).toBe("a-error a-help");
  });

  it("devuelve undefined si no queda nada (el atributo no se escribe)", () => {
    expect(buildDescribedBy([false, undefined, null, ""])).toBeUndefined();
    expect(buildDescribedBy([])).toBeUndefined();
  });
});

describe("describeField (campo ↔ error ↔ ayuda)", () => {
  const base = { name: "plate", controlId: "ctl", hasHelp: true, fieldErrors: EMPTY_FIELD_ERRORS };

  it("sin error y con ayuda describe SOLO la ayuda: igual que el HTML histórico", () => {
    const d = describeField(base);
    expect(d.error).toBeUndefined();
    expect(d.invalid).toBe(false);
    expect(d.describedBy).toBe("ctl-help");
  });

  it("sin error y sin ayuda no hay aria-describedby", () => {
    expect(describeField({ ...base, hasHelp: false }).describedBy).toBeUndefined();
  });

  it("con error encadena error y ayuda (primero lo que hay que corregir)", () => {
    const d = describeField({ ...base, fieldErrors: { plate: "La placa ya existe." } });
    expect(d.error).toBe("La placa ya existe.");
    expect(d.invalid).toBe(true);
    expect(d.describedBy).toBe("ctl-error ctl-help");
    expect(d.errorId).toBe("ctl-error");
    expect(d.helpId).toBe("ctl-help");
  });

  it("con error y sin ayuda solo apunta al error (no a una ayuda inexistente)", () => {
    const d = describeField({ ...base, hasHelp: false, fieldErrors: { plate: "x" } });
    expect(d.describedBy).toBe("ctl-error");
  });

  it("añade ids ajenos al final", () => {
    const d = describeField({ ...base, extraDescribedBy: "hint-1", fieldErrors: { plate: "x" } });
    expect(d.describedBy).toBe("ctl-error ctl-help hint-1");
  });

  it("aria-invalid forzado marca inválido sin mensaje y sin apuntar a un error que no existe", () => {
    const d = describeField({ ...base, forceInvalid: true });
    expect(d.invalid).toBe(true);
    expect(d.error).toBeUndefined();
    expect(d.describedBy).toBe("ctl-help");
  });

  it("un error de otro campo no vuelve inválido a este", () => {
    expect(describeField({ ...base, fieldErrors: { code: "x" } }).invalid).toBe(false);
  });
});

describe("removeFieldError", () => {
  it("devuelve la MISMA referencia si el campo no tenía error (setState no re-renderiza)", () => {
    const errors = { a: "1" };
    expect(removeFieldError(errors, "b")).toBe(errors);
    expect(removeFieldError(EMPTY_FIELD_ERRORS, "a")).toBe(EMPTY_FIELD_ERRORS);
  });

  it("quita solo el campo indicado y no muta la entrada", () => {
    const errors = Object.freeze({ a: "1", b: "2" });
    const next = removeFieldError(errors, "a");
    expect(next).toEqual({ b: "2" });
    expect(errors).toEqual({ a: "1", b: "2" });
  });

  it("al quitar el último devuelve la constante vacía compartida", () => {
    expect(removeFieldError({ a: "1" }, "a")).toBe(EMPTY_FIELD_ERRORS);
  });

  it("no confunde claves del prototipo con errores", () => {
    const errors = { a: "1" };
    expect(removeFieldError(errors, "toString")).toBe(errors);
  });
});

describe("normalizeStringMap (lo que llega por la red no se da por bueno)", () => {
  it("conserva solo pares string→string no vacíos", () => {
    expect(normalizeStringMap({ a: "x", b: 5, c: null, d: "", e: { z: 1 }, f: ["y"] })).toEqual({ a: "x" });
  });

  it("descarta __proto__ y no contamina el prototipo", () => {
    const hostile = JSON.parse('{"__proto__":"x","ok":"y"}') as unknown;
    const clean = normalizeStringMap(hostile);
    expect(clean).toEqual({ ok: "y" });
    expect(Object.getPrototypeOf(clean)).toBe(Object.prototype);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("devuelve undefined para entradas que no son un mapa o quedan vacías", () => {
    expect(normalizeStringMap(undefined)).toBeUndefined();
    expect(normalizeStringMap(null)).toBeUndefined();
    expect(normalizeStringMap("texto")).toBeUndefined();
    expect(normalizeStringMap(["a"])).toBeUndefined();
    expect(normalizeStringMap({})).toBeUndefined();
    expect(normalizeStringMap({ a: "" })).toBeUndefined();
  });

  it("keepEmpty conserva valores vacíos (para `values`)", () => {
    expect(normalizeStringMap({ a: "", b: "x" }, { keepEmpty: true })).toEqual({ a: "", b: "x" });
  });
});
