import { describe, expect, it } from "vitest";
import {
  MIN_BOOTSTRAP_PASSWORD_LENGTH,
  parseBootstrapInput,
} from "./bootstrap-input";

const VALID = {
  BOOTSTRAP_ADMIN_EMAIL: "  Carlos.Admin@Empresa-Real.com ",
  BOOTSTRAP_ADMIN_NAME: " Carlos Admin ",
  BOOTSTRAP_ADMIN_PASSWORD: "correct-horse-battery-staple-91",
};

function parse(overrides: Record<string, string | undefined> = {}) {
  return parseBootstrapInput({ ...VALID, ...overrides });
}

describe("parseBootstrapInput", () => {
  it("normaliza el correo y el nombre y conserva la contrasena tal cual", () => {
    expect(parse()).toEqual({
      email: "carlos.admin@empresa-real.com",
      name: "Carlos Admin",
      password: VALID.BOOTSTRAP_ADMIN_PASSWORD,
    });
  });

  it("exige las tres variables", () => {
    expect(() => parseBootstrapInput({})).toThrow(
      /BOOTSTRAP_ADMIN_EMAIL[\s\S]*BOOTSTRAP_ADMIN_NAME[\s\S]*BOOTSTRAP_ADMIN_PASSWORD/,
    );
  });

  it(`rechaza contrasenas de menos de ${MIN_BOOTSTRAP_PASSWORD_LENGTH} caracteres`, () => {
    expect(() =>
      parse({
        BOOTSTRAP_ADMIN_PASSWORD: "a".repeat(MIN_BOOTSTRAP_PASSWORD_LENGTH - 1),
      }),
    ).toThrow(/al menos 16/);
    expect(() =>
      parse({
        BOOTSTRAP_ADMIN_PASSWORD: "a".repeat(MIN_BOOTSTRAP_PASSWORD_LENGTH),
      }),
    ).not.toThrow();
  });

  it.each([
    "NCIPlatform2026!",
    "PanatruckOwner2026!",
    "TransLogistica2026!",
    "Distribuciones2026!",
  ])("rechaza la contrasena demo publica %s", (password) => {
    expect(() => parse({ BOOTSTRAP_ADMIN_PASSWORD: password })).toThrow(
      /demo publicada/,
    );
  });

  it.each([
    "platform@nci.local",
    "a@b.test",
    "a@b.invalid",
    "a@example.com",
    "a@mail.example",
    "a@localhost",
  ])("rechaza el correo no enrutable %s", (email) => {
    expect(() => parse({ BOOTSTRAP_ADMIN_EMAIL: email })).toThrow(
      /BOOTSTRAP_ADMIN_EMAIL/,
    );
  });

  it("rechaza un correo mal formado", () => {
    expect(() => parse({ BOOTSTRAP_ADMIN_EMAIL: "no-es-correo" })).toThrow(
      /correo valido/,
    );
  });

  it("rechaza un nombre vacio", () => {
    expect(() => parse({ BOOTSTRAP_ADMIN_NAME: " " })).toThrow(
      /BOOTSTRAP_ADMIN_NAME/,
    );
  });

  it("nunca incluye la contrasena en el mensaje de error", () => {
    const secret = "S3cretoMuyLargo-NoImprimir";
    try {
      parse({
        BOOTSTRAP_ADMIN_EMAIL: "malo@x.local",
        BOOTSTRAP_ADMIN_PASSWORD: secret,
      });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain(secret);
    }
    try {
      parse({ BOOTSTRAP_ADMIN_PASSWORD: "corta-1234" });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain("corta-1234");
    }
  });
});
