import { describe, expect, it } from "vitest";
import {
  MAIL_CONNECTION_TIMEOUT_MS,
  MAIL_GREETING_TIMEOUT_MS,
  MAIL_SOCKET_TIMEOUT_MS,
  MailConfigError,
  buildTransportOptions,
  describeMailError,
  resolveMailFrom,
} from "./mail";

describe("buildTransportOptions", () => {
  it("Resend (smtp.resend.com:465) usa TLS implicito y credenciales", () => {
    const options = buildTransportOptions(
      {
        MAIL_HOST: "smtp.resend.com",
        MAIL_PORT: "465",
        MAIL_USER: "resend",
        MAIL_PASSWORD: "re_clave",
      },
      false,
    );
    expect(options.host).toBe("smtp.resend.com");
    expect(options.port).toBe(465);
    expect(options.secure).toBe(true);
    expect(options.auth).toEqual({ user: "resend", pass: "re_clave" });
  });

  it("respeta MAIL_SECURE=true en otros puertos", () => {
    const options = buildTransportOptions(
      { MAIL_HOST: "smtp.example.com", MAIL_PORT: "2465", MAIL_SECURE: "true" },
      true,
    );
    expect(options.secure).toBe(true);
  });

  it("exige STARTTLS con credenciales en 587 fuera de local", () => {
    const options = buildTransportOptions(
      {
        MAIL_HOST: "smtp.resend.com",
        MAIL_PORT: "587",
        MAIL_USER: "resend",
        MAIL_PASSWORD: "x",
      },
      false,
    );
    expect(options.secure).toBe(false);
    expect((options as { requireTLS?: boolean }).requireTLS).toBe(true);
  });

  it("incluye timeouts de conexion, saludo y socket", () => {
    const options = buildTransportOptions(
      { MAIL_HOST: "smtp.example.com", MAIL_PORT: "587" },
      false,
    );
    expect(options.connectionTimeout).toBe(MAIL_CONNECTION_TIMEOUT_MS);
    expect(options.greetingTimeout).toBe(MAIL_GREETING_TIMEOUT_MS);
    expect(options.socketTimeout).toBe(MAIL_SOCKET_TIMEOUT_MS);
    for (const ms of [
      options.connectionTimeout,
      options.greetingTimeout,
      options.socketTimeout,
    ]) {
      expect(ms).toBeGreaterThanOrEqual(5_000);
      expect(ms).toBeLessThanOrEqual(20_000);
    }
  });

  it("en local usa Mailpit (localhost:1025) sin autenticacion", () => {
    const options = buildTransportOptions({}, true);
    expect(options.host).toBe("localhost");
    expect(options.port).toBe(1025);
    expect(options.secure).toBe(false);
    expect(options.auth).toBeUndefined();
  });

  it("ignora credenciales vacias en local (plantilla .env.example)", () => {
    const options = buildTransportOptions(
      { MAIL_HOST: "localhost", MAIL_USER: "", MAIL_PASSWORD: "" },
      true,
    );
    expect(options.auth).toBeUndefined();
  });

  it("fuera de local falla sin MAIL_HOST (no cae a localhost)", () => {
    expect(() => buildTransportOptions({}, false)).toThrow(MailConfigError);
    expect(() => buildTransportOptions({}, false)).toThrow(/MAIL_HOST/);
  });

  it("fuera de local falla si solo hay MAIL_USER o solo MAIL_PASSWORD", () => {
    expect(() =>
      buildTransportOptions(
        { MAIL_HOST: "smtp.resend.com", MAIL_USER: "resend" },
        false,
      ),
    ).toThrow(/MAIL_PASSWORD/);
    expect(() =>
      buildTransportOptions(
        { MAIL_HOST: "smtp.resend.com", MAIL_PASSWORD: "x" },
        false,
      ),
    ).toThrow(/MAIL_USER/);
  });

  it("rechaza puertos invalidos", () => {
    expect(() =>
      buildTransportOptions({ MAIL_HOST: "h", MAIL_PORT: "abc" }, true),
    ).toThrow(/MAIL_PORT/);
    expect(() =>
      buildTransportOptions({ MAIL_HOST: "h", MAIL_PORT: "70000" }, true),
    ).toThrow(/MAIL_PORT/);
  });
});

describe("resolveMailFrom", () => {
  it("usa MAIL_FROM cuando existe", () => {
    expect(
      resolveMailFrom({ MAIL_FROM: "NCI <no-reply@nciautomation.com>" }, false),
    ).toBe("NCI <no-reply@nciautomation.com>");
  });

  it("tiene remitente por defecto solo en local", () => {
    expect(resolveMailFrom({}, true)).toContain("no-reply@nci.local");
    expect(() => resolveMailFrom({}, false)).toThrow(/MAIL_FROM/);
  });
});

describe("describeMailError", () => {
  it("devuelve el codigo de nodemailer", () => {
    const error = Object.assign(
      new Error("Invalid login: 535 Authentication failed"),
      { code: "EAUTH" },
    );
    expect(describeMailError(error)).toEqual({
      code: "EAUTH",
      message: "Invalid login: 535 Authentication failed",
    });
  });

  it("no filtra direcciones de correo ni saltos de linea", () => {
    const error = Object.assign(
      new Error("Recipient <persona@empresa.com> rejected:\n550 no such user"),
      {
        code: "EENVELOPE",
      },
    );
    const result = describeMailError(error);
    expect(result.message).not.toContain("persona@empresa.com");
    expect(result.message).not.toContain("\n");
    expect(result.message).toContain("[correo]");
  });

  it("acota la longitud del mensaje", () => {
    expect(
      describeMailError(new Error("x".repeat(1000))).message.length,
    ).toBeLessThanOrEqual(200);
  });

  it("tolera valores que no son Error", () => {
    expect(describeMailError("boom").code).toBe("UNKNOWN");
  });

  it("describe los errores de configuracion sin secretos", () => {
    const result = describeMailError(
      new MailConfigError("Falta MAIL_HOST: el correo no esta configurado."),
    );
    expect(result.code).toBe("ECONFIG");
  });
});
