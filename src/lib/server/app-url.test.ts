import { describe, expect, it } from "vitest";
import { AppUrlError, resolveAppBaseUrl } from "./app-url";

describe("resolveAppBaseUrl", () => {
  it("prefiere NEXT_PUBLIC_APP_URL sobre APP_URL y Vercel", () => {
    const url = resolveAppBaseUrl(
      {
        NEXT_PUBLIC_APP_URL: "https://app.example.com",
        APP_URL: "https://otra.example.com",
        VERCEL_PROJECT_PRODUCTION_URL: "proyecto.vercel.app",
      },
      false,
    );
    expect(url).toBe("https://app.example.com");
  });

  it("usa APP_URL cuando falta NEXT_PUBLIC_APP_URL (o esta vacia)", () => {
    expect(
      resolveAppBaseUrl(
        { NEXT_PUBLIC_APP_URL: "  ", APP_URL: "https://otra.example.com" },
        false,
      ),
    ).toBe("https://otra.example.com");
  });

  it("construye https desde VERCEL_PROJECT_PRODUCTION_URL (sin protocolo)", () => {
    expect(
      resolveAppBaseUrl(
        { VERCEL_PROJECT_PRODUCTION_URL: "nci.vercel.app" },
        false,
      ),
    ).toBe("https://nci.vercel.app");
  });

  it("no duplica el protocolo si Vercel ya lo incluye", () => {
    expect(
      resolveAppBaseUrl(
        { VERCEL_PROJECT_PRODUCTION_URL: "https://nci.vercel.app" },
        false,
      ),
    ).toBe("https://nci.vercel.app");
  });

  it("quita barras finales", () => {
    expect(
      resolveAppBaseUrl(
        { NEXT_PUBLIC_APP_URL: "https://app.example.com///" },
        false,
      ),
    ).toBe("https://app.example.com");
  });

  it("cae a http://localhost:3000 solo en perfil local", () => {
    expect(resolveAppBaseUrl({}, true)).toBe("http://localhost:3000");
  });

  it("acepta http y localhost configurados en perfil local", () => {
    expect(
      resolveAppBaseUrl({ NEXT_PUBLIC_APP_URL: "http://localhost:4000" }, true),
    ).toBe("http://localhost:4000");
  });

  it("lanza un error claro fuera de local sin configuracion", () => {
    expect(() => resolveAppBaseUrl({}, false)).toThrow(AppUrlError);
    expect(() => resolveAppBaseUrl({}, false)).toThrow(/NEXT_PUBLIC_APP_URL/);
  });

  it("rechaza http fuera de local", () => {
    expect(() =>
      resolveAppBaseUrl(
        { NEXT_PUBLIC_APP_URL: "http://app.example.com" },
        false,
      ),
    ).toThrow(/https/);
  });

  it("rechaza localhost fuera de local aunque use https", () => {
    expect(() =>
      resolveAppBaseUrl(
        { NEXT_PUBLIC_APP_URL: "https://localhost:3000" },
        false,
      ),
    ).toThrow(/localhost/);
    expect(() =>
      resolveAppBaseUrl({ NEXT_PUBLIC_APP_URL: "https://127.0.0.1" }, false),
    ).toThrow(/localhost/);
  });

  it("rechaza valores que no son URL", () => {
    expect(() =>
      resolveAppBaseUrl({ NEXT_PUBLIC_APP_URL: "no-es-una-url" }, false),
    ).toThrow(/URL valida/);
    expect(() =>
      resolveAppBaseUrl({ NEXT_PUBLIC_APP_URL: "javascript:alert(1)" }, true),
    ).toThrow(/http/);
  });
});
