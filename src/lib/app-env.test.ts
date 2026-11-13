import { afterEach, describe, expect, it, vi } from "vitest";
import { envOrLocalDefault, getAppEnv, isLocalEnv } from "./app-env";

function setEnv(appEnv: string | undefined, nodeEnv: string | undefined) {
  vi.stubEnv("APP_ENV", appEnv);
  vi.stubEnv("NODE_ENV", nodeEnv);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getAppEnv", () => {
  it.each(["local", "staging", "production"] as const)(
    "acepta APP_ENV=%s exacto",
    (value) => {
      setEnv(value, "production");
      expect(getAppEnv()).toBe(value);
    },
  );

  it("APP_ENV explicito gana sobre NODE_ENV", () => {
    setEnv("local", "production");
    expect(getAppEnv()).toBe("local");
    setEnv("staging", "development");
    expect(getAppEnv()).toBe("staging");
  });

  it("sin APP_ENV y NODE_ENV=production resuelve a production, nunca a local", () => {
    setEnv(undefined, "production");
    expect(getAppEnv()).toBe("production");
    expect(isLocalEnv()).toBe(false);
  });

  it("sin APP_ENV y fuera de produccion resuelve a local", () => {
    for (const nodeEnv of ["development", "test", undefined]) {
      setEnv(undefined, nodeEnv);
      expect(getAppEnv()).toBe("local");
      expect(isLocalEnv()).toBe(true);
    }
  });

  it("trata APP_ENV vacio como no definido", () => {
    setEnv("", "production");
    expect(getAppEnv()).toBe("production");
    setEnv("", "development");
    expect(getAppEnv()).toBe("local");
  });

  it.each([
    "prod",
    "Production",
    "LOCAL",
    "stage",
    "dev",
    " staging",
    "staging ",
    "true",
    "0",
  ])(
    "lanza con APP_ENV=%j (un typo no puede reactivar las credenciales demo)",
    (value) => {
      setEnv(value, "development");
      expect(() => getAppEnv()).toThrow(/APP_ENV/);
      expect(() => isLocalEnv()).toThrow(/APP_ENV/);
    },
  );

  it("no vuelca un valor largo completo en el mensaje de error", () => {
    setEnv("x".repeat(500), "development");
    expect(() => getAppEnv()).toThrow(/APP_ENV/);
    try {
      getAppEnv();
    } catch (error) {
      expect((error as Error).message.length).toBeLessThan(200);
    }
  });
});

describe("isLocalEnv", () => {
  it("solo es verdadero en el perfil local", () => {
    setEnv("local", "production");
    expect(isLocalEnv()).toBe(true);
    setEnv("staging", "production");
    expect(isLocalEnv()).toBe(false);
    setEnv("production", "production");
    expect(isLocalEnv()).toBe(false);
  });
});

describe("envOrLocalDefault", () => {
  it("devuelve la variable cuando existe, en cualquier perfil", () => {
    setEnv("staging", "production");
    vi.stubEnv("NCI_TEST_VAR", "valor-real");
    expect(envOrLocalDefault("NCI_TEST_VAR", "dev-default")).toBe("valor-real");
  });

  it("usa el valor de desarrollo solo en local", () => {
    setEnv("local", "development");
    vi.stubEnv("NCI_TEST_VAR", undefined);
    expect(envOrLocalDefault("NCI_TEST_VAR", "dev-default")).toBe(
      "dev-default",
    );
  });

  it("lanza fuera de local cuando falta la variable", () => {
    setEnv("staging", "production");
    vi.stubEnv("NCI_TEST_VAR", undefined);
    expect(() => envOrLocalDefault("NCI_TEST_VAR", "dev-default")).toThrow(
      /NCI_TEST_VAR/,
    );
  });

  it("lanza sin APP_ENV bajo NODE_ENV=production (no cae a los secretos de desarrollo)", () => {
    setEnv(undefined, "production");
    vi.stubEnv("NCI_TEST_VAR", undefined);
    expect(() => envOrLocalDefault("NCI_TEST_VAR", "dev-default")).toThrow(
      /APP_ENV=production/,
    );
  });
});
