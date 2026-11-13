import { describe, expect, it } from "vitest";
import {
  emailVerificationEmail,
  escapeHtml,
  invitationEmail,
  toSingleLine,
  welcomeTenantOwnerEmail,
  welcomeUserEmail,
} from "./email-templates";

const PAYLOAD = `<img src=x onerror="alert(1)">`;
const ESCAPED_PAYLOAD = "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;";

describe("escapeHtml / toSingleLine", () => {
  it("escapa los cinco caracteres peligrosos", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("colapsa saltos de linea y caracteres de control", () => {
    expect(toSingleLine("Linea 1\r\nLinea 2\tfin")).toBe("Linea 1 Linea 2 fin");
  });
});

describe("welcomeTenantOwnerEmail", () => {
  const base = {
    ownerName: PAYLOAD,
    tenantName: PAYLOAD,
    loginUrl: "https://app.example.com/login",
    verifyUrl: "https://app.example.com/verificar-email/tok",
    setPasswordUrl: "https://app.example.com/recuperar/tok2",
    setPasswordTtlHours: 48,
  };

  it("escapa nombre y empresa en el HTML", () => {
    const { html } = welcomeTenantOwnerEmail(base);
    expect(html).not.toContain(PAYLOAD);
    expect(html).toContain(ESCAPED_PAYLOAD);
  });

  it("no incluye ninguna contrasena, solo el enlace de un solo uso", () => {
    const { html, text } = welcomeTenantOwnerEmail(base);
    expect(html).not.toMatch(/contrasena temporal/i);
    expect(text).not.toMatch(/contrasena temporal/i);
    expect(html).toContain("https://app.example.com/recuperar/tok2");
    expect(text).toContain("https://app.example.com/recuperar/tok2");
    expect(text).toContain("48 horas");
  });

  it("sin enlace de contrasena (cuenta existente) indica usar la contrasena actual", () => {
    const { html, text } = welcomeTenantOwnerEmail({
      ...base,
      setPasswordUrl: undefined,
      verifyUrl: undefined,
    });
    expect(html).toContain("contrasena actual");
    expect(text).toContain("contrasena actual");
    expect(html).not.toContain("Establecer mi contrasena");
    expect(html).not.toContain("Verificar mi correo");
  });

  it("el asunto y el texto plano son de una sola linea por valor", () => {
    const { subject, text } = welcomeTenantOwnerEmail({
      ...base,
      tenantName: "Mi\nEmpresa",
      ownerName: "A\r\nB",
    });
    expect(subject).not.toMatch(/[\r\n]/);
    expect(text).toContain("Bienvenido, A B");
  });
});

describe("welcomeUserEmail", () => {
  it("escapa nombre, empresa, rol y quien invita; no incluye contrasena", () => {
    const { html, text } = welcomeUserEmail({
      userName: PAYLOAD,
      tenantName: PAYLOAD,
      role: PAYLOAD,
      invitedBy: PAYLOAD,
      verifyUrl: "https://app.example.com/verificar-email/tok",
      setPasswordUrl: "https://app.example.com/recuperar/tok2",
      setPasswordTtlHours: 48,
    });
    expect(html).not.toContain("<img");
    expect(html).toContain(ESCAPED_PAYLOAD);
    expect(html).not.toMatch(/contrasena temporal/i);
    expect(text).not.toMatch(/contrasena temporal/i);
    expect(html).toContain("https://app.example.com/recuperar/tok2");
  });
});

describe("emailVerificationEmail e invitationEmail", () => {
  it("escapan los valores controlados por usuarios", () => {
    const verification = emailVerificationEmail({
      userName: PAYLOAD,
      verifyUrl: "https://app.example.com/v/tok",
    });
    expect(verification.html).not.toContain("<img");
    expect(verification.html).toContain(ESCAPED_PAYLOAD);

    const invitation = invitationEmail({
      tenantName: PAYLOAD,
      role: PAYLOAD,
      invitedBy: PAYLOAD,
      inviteUrl: "https://app.example.com/invitacion/tok",
      expiresInHours: 72,
    });
    expect(invitation.html).not.toContain("<img");
    expect(invitation.html).toContain(ESCAPED_PAYLOAD);
  });

  it("descarta esquemas peligrosos en los enlaces de los botones", () => {
    const { html } = emailVerificationEmail({
      userName: "Ana",
      verifyUrl: "javascript:alert(1)",
    });
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="#"');
  });

  it("escapa comillas en la URL para no salir del atributo href", () => {
    const { html } = invitationEmail({
      tenantName: "Empresa",
      role: "Rol",
      invitedBy: "Ana",
      inviteUrl: 'https://app.example.com/x"onmouseover="alert(1)',
      expiresInHours: 72,
    });
    expect(html).not.toContain('"onmouseover="');
  });
});
