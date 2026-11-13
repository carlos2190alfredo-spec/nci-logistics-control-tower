import { describe, expect, it } from "vitest";
import {
  allowsIndexing,
  resolveSiteOrigin,
  siteOpenGraph,
  siteTwitter,
} from "./site";

describe("allowsIndexing", () => {
  it("solo permite indexar con APP_ENV=production", () => {
    expect(allowsIndexing({ APP_ENV: "production" })).toBe(true);
    expect(allowsIndexing({ APP_ENV: " production " })).toBe(true);
  });

  it("cierra la indexacion en local, staging, vacio o valores desconocidos", () => {
    for (const value of [
      "local",
      "staging",
      "",
      "Production",
      "prod",
      undefined,
    ]) {
      expect(allowsIndexing({ APP_ENV: value })).toBe(false);
    }
    expect(allowsIndexing({})).toBe(false);
  });
});

describe("resolveSiteOrigin", () => {
  it("prioriza NEXT_PUBLIC_APP_URL y descarta ruta y barra final", () => {
    expect(
      resolveSiteOrigin({
        NEXT_PUBLIC_APP_URL: "https://app.example.com/login/",
        VERCEL_PROJECT_PRODUCTION_URL: "otro.vercel.app",
      }),
    ).toBe("https://app.example.com");
  });

  it("usa el dominio de produccion de Vercel (sin protocolo) si falta la URL publica", () => {
    expect(
      resolveSiteOrigin({
        APP_URL: "https://app.example.com/ruta",
        VERCEL_PROJECT_PRODUCTION_URL: "nci.vercel.app",
      }),
    ).toBe("https://app.example.com");
    expect(
      resolveSiteOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "nci.vercel.app" }),
    ).toBe("https://nci.vercel.app");
  });

  it("ignora valores invalidos o con protocolo no http(s)", () => {
    expect(
      resolveSiteOrigin({
        NEXT_PUBLIC_APP_URL: "javascript:alert(1)",
        VERCEL_PROJECT_PRODUCTION_URL: "nci.vercel.app",
      }),
    ).toBe("https://nci.vercel.app");
    expect(resolveSiteOrigin({ NEXT_PUBLIC_APP_URL: "no es una url" })).toBe(
      "http://localhost:3000",
    );
  });

  it("cae a localhost sin configuracion", () => {
    expect(resolveSiteOrigin({})).toBe("http://localhost:3000");
  });
});

describe("metadatos compartidos", () => {
  it("siteOpenGraph y siteTwitter aplican los overrides", () => {
    expect(siteOpenGraph({ title: "Acceso", url: "/login" })).toMatchObject({
      type: "website",
      title: "Acceso",
      url: "/login",
    });
    expect(siteTwitter({ title: "Acceso" })).toMatchObject({
      card: "summary",
      title: "Acceso",
    });
  });
});
