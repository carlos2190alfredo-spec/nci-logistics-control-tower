import { describe, expect, it } from "vitest";
import { resolveNotice, type PageNoticeMessages } from "@/components/ui/page-notice";

const messages: PageNoticeMessages = {
  "cliente-creado": { tone: "success", message: "Cliente registrado." },
  "cliente-desactivado": { tone: "warning", message: "Cliente desactivado.", title: "Acceso al portal desactivado" },
};

describe("resolveNotice", () => {
  it("devuelve la entrada del diccionario para un código conocido", () => {
    expect(resolveNotice("cliente-creado", messages)).toEqual({ tone: "success", message: "Cliente registrado." });
    expect(resolveNotice("cliente-desactivado", messages)?.title).toBe("Acceso al portal desactivado");
  });

  it("un código desconocido, vacío o ausente no muestra nada", () => {
    expect(resolveNotice("no-existe", messages)).toBeNull();
    expect(resolveNotice("", messages)).toBeNull();
    expect(resolveNotice(undefined, messages)).toBeNull();
    expect(resolveNotice([], messages)).toBeNull();
  });

  it("nunca refleja texto arbitrario del query string", () => {
    const hostile = "<img src=x onerror=alert(1)> Su cuenta fue suspendida, llame al 555-0100";
    expect(resolveNotice(hostile, messages)).toBeNull();
  });

  it("los códigos que coinciden con propiedades del prototipo no devuelven nada (ni lanzan)", () => {
    for (const code of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf", "__defineGetter__"]) {
      expect(resolveNotice(code, messages)).toBeNull();
    }
  });

  it("con el parámetro repetido (?aviso=a&aviso=b) usa el primero", () => {
    expect(resolveNotice(["cliente-creado", "cliente-desactivado"], messages)?.message).toBe("Cliente registrado.");
    expect(resolveNotice(["no-existe", "cliente-creado"], messages)).toBeNull();
  });

  it("ignora entradas del diccionario con forma inválida", () => {
    const broken = { roto: { tone: "info" } } as unknown as PageNoticeMessages;
    expect(resolveNotice("roto", broken)).toBeNull();
  });

  it("un diccionario con una clave llamada como una propiedad heredada sí la encuentra si es propia", () => {
    const own = JSON.parse('{"constructor":{"tone":"info","message":"Propia."}}') as PageNoticeMessages;
    expect(resolveNotice("constructor", own)?.message).toBe("Propia.");
  });
});
