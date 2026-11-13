const BRAND_COLOR = "#0f172a";
const ACCENT_COLOR = "#2563eb";
const BG_COLOR = "#f8fafc";
const CARD_BG = "#ffffff";
const TEXT_COLOR = "#1e293b";
const MUTED_COLOR = "#64748b";
const BORDER_COLOR = "#e2e8f0";

/**
 * Escapa HTML. TODO valor que no sea una constante de plantilla (nombres de
 * usuario, empresa, rol, quien invita, URLs) pasa por aqui antes de entrar al
 * HTML: los valores los eligen administradores de tenant y el correo sale del
 * dominio de la plataforma.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Colapsa saltos de linea y caracteres de control: para asuntos y cuerpos de texto plano. */
export function toSingleLine(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").trim();
}

/** Solo http(s): cualquier otro esquema (javascript:, data:) se descarta. */
function safeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? url
      : "#";
  } catch {
    return "#";
  }
}

/** Valor de usuario listo para HTML. */
const h = (value: string) => escapeHtml(toSingleLine(value));

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${BG_COLOR};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${BG_COLOR};padding:40px 20px">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%">
  <tr><td style="background:${BRAND_COLOR};padding:24px 32px;border-radius:12px 12px 0 0">
    <table width="100%"><tr>
      <td style="color:#fff;font-size:18px;font-weight:700;letter-spacing:0.5px">NCI Logistics Control Tower</td>
      <td align="right" style="color:rgba(255,255,255,0.7);font-size:12px">NCI Automation</td>
    </tr></table>
  </td></tr>
  <tr><td style="background:${CARD_BG};padding:32px;border:1px solid ${BORDER_COLOR};border-top:none">
    ${content}
  </td></tr>
  <tr><td style="padding:20px 32px;text-align:center">
    <p style="margin:0;font-size:12px;color:${MUTED_COLOR}">Este correo fue enviado automaticamente por NCI Logistics Control Tower.</p>
    <p style="margin:4px 0 0;font-size:12px;color:${MUTED_COLOR}">Tecnologia de NCI Automation &mdash; Panama</p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function button(text: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td>
    <a href="${escapeHtml(safeUrl(url))}" style="display:inline-block;background:${ACCENT_COLOR};color:#fff;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.3px">${h(text)}</a>
  </td></tr></table>`;
}

function infoBox(items: { label: string; value: string }[]): string {
  const rows = items
    .map(
      (i) =>
        `<tr><td style="padding:8px 12px;font-size:13px;color:${MUTED_COLOR};border-bottom:1px solid ${BORDER_COLOR}">${h(i.label)}</td><td style="padding:8px 12px;font-size:13px;font-weight:600;color:${TEXT_COLOR};border-bottom:1px solid ${BORDER_COLOR}">${h(i.value)}</td></tr>`,
    )
    .join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:${BG_COLOR};border:1px solid ${BORDER_COLOR};border-radius:8px;margin:16px 0">${rows}</table>`;
}

type EmailContent = { subject: string; html: string; text: string };

/**
 * Bloque de acceso de una cuenta nueva. Nunca incluye una contrasena: la
 * persona define la suya con un enlace de un solo uso (flujo de restablecimiento).
 */
function accessBlock(opts: {
  setPasswordUrl?: string;
  setPasswordTtlHours?: number;
  loginUrl?: string;
}): string {
  if (opts.setPasswordUrl) {
    const ttl = opts.setPasswordTtlHours
      ? `El enlace es de un solo uso y expira en ${opts.setPasswordTtlHours} horas.`
      : "El enlace es de un solo uso.";
    return `
    <p style="margin:0 0 4px;font-size:14px;color:${TEXT_COLOR};line-height:1.5">
      Para entrar por primera vez, defina su contrasena con el siguiente enlace:
    </p>
    ${button("Establecer mi contrasena", opts.setPasswordUrl)}
    <p style="margin:0 0 16px;font-size:12px;color:${MUTED_COLOR}">${h(ttl)}</p>`;
  }
  return `
    <p style="margin:0 0 16px;font-size:14px;color:${TEXT_COLOR};line-height:1.5">
      Inicie sesion con su contrasena actual${opts.loginUrl ? ` en <a href="${escapeHtml(safeUrl(opts.loginUrl))}" style="color:${ACCENT_COLOR}">${h(opts.loginUrl)}</a>` : ""}.
    </p>`;
}

function accessText(opts: {
  setPasswordUrl?: string;
  setPasswordTtlHours?: number;
  loginUrl?: string;
}): string[] {
  if (opts.setPasswordUrl) {
    return [
      `Defina su contrasena (enlace de un solo uso${opts.setPasswordTtlHours ? `, expira en ${opts.setPasswordTtlHours} horas` : ""}):`,
      opts.setPasswordUrl,
    ];
  }
  return [
    `Inicie sesion con su contrasena actual${opts.loginUrl ? `: ${opts.loginUrl}` : "."}`,
  ];
}

export function welcomeTenantOwnerEmail(opts: {
  ownerName: string;
  tenantName: string;
  loginUrl: string;
  /** Se omite si el correo ya estaba verificado. */
  verifyUrl?: string;
  /** Se omite si la cuenta ya existia: conserva su contrasena. */
  setPasswordUrl?: string;
  setPasswordTtlHours?: number;
}): EmailContent {
  const subject = `Bienvenido a ${toSingleLine(opts.tenantName)} — NCI Logistics Control Tower`;
  const html = layout(`
    <h1 style="margin:0 0 8px;font-size:22px;color:${TEXT_COLOR}">Bienvenido, ${h(opts.ownerName)}</h1>
    <p style="margin:0 0 20px;font-size:15px;color:${MUTED_COLOR};line-height:1.6">
      Su cuenta de <strong>${h(opts.tenantName)}</strong> ha sido creada exitosamente en NCI Logistics Control Tower.
    </p>
    ${infoBox([
      { label: "Empresa", value: opts.tenantName },
      { label: "Rol", value: "Propietario (Owner)" },
    ])}
    ${accessBlock(opts)}
    ${opts.verifyUrl ? `<p style="margin:0 0 4px;font-size:14px;color:${TEXT_COLOR};line-height:1.5">Confirme tambien su correo electronico:</p>${button("Verificar mi correo electronico", opts.verifyUrl)}` : ""}
    <p style="margin:16px 0 0;font-size:13px;color:${MUTED_COLOR};line-height:1.5">
      <strong>Importante:</strong> Despues de iniciar sesion por primera vez, se le pedira configurar la
      autenticacion de dos factores (MFA) para proteger su cuenta. Necesitara una aplicacion autenticadora
      como Google Authenticator o Authy.
    </p>
    <hr style="border:none;border-top:1px solid ${BORDER_COLOR};margin:24px 0">
    <p style="margin:0;font-size:12px;color:${MUTED_COLOR}">
      Si no solicito esta cuenta, ignore este correo. El enlace de verificacion expira en 48 horas.
    </p>
  `);
  const text = [
    `Bienvenido, ${toSingleLine(opts.ownerName)}`,
    ``,
    `Su cuenta de ${toSingleLine(opts.tenantName)} ha sido creada en NCI Logistics Control Tower.`,
    ``,
    ...accessText(opts),
    ...(opts.verifyUrl ? [``, `Verifique su correo: ${opts.verifyUrl}`] : []),
    ``,
    `Despues de iniciar sesion, configure la autenticacion de dos factores (MFA).`,
  ].join("\n");
  return { subject, html, text };
}

export function welcomeUserEmail(opts: {
  userName: string;
  tenantName: string;
  role: string;
  invitedBy: string;
  loginUrl?: string;
  verifyUrl: string;
  setPasswordUrl?: string;
  setPasswordTtlHours?: number;
}): EmailContent {
  const subject = `Ha sido agregado a ${toSingleLine(opts.tenantName)} — NCI Logistics Control Tower`;
  const html = layout(`
    <h1 style="margin:0 0 8px;font-size:22px;color:${TEXT_COLOR}">Hola, ${h(opts.userName)}</h1>
    <p style="margin:0 0 20px;font-size:15px;color:${MUTED_COLOR};line-height:1.6">
      <strong>${h(opts.invitedBy)}</strong> le ha agregado al equipo de <strong>${h(opts.tenantName)}</strong>
      en NCI Logistics Control Tower.
    </p>
    ${infoBox([
      { label: "Empresa", value: opts.tenantName },
      { label: "Rol", value: opts.role },
    ])}
    ${accessBlock(opts)}
    <p style="margin:0 0 4px;font-size:14px;color:${TEXT_COLOR};line-height:1.5">Confirme tambien su correo electronico:</p>
    ${button("Verificar mi correo electronico", opts.verifyUrl)}
    <p style="margin:16px 0 0;font-size:13px;color:${MUTED_COLOR};line-height:1.5">
      Se recomienda configurar la autenticacion de dos factores desde <strong>Seguridad</strong> en su perfil.
    </p>
    <hr style="border:none;border-top:1px solid ${BORDER_COLOR};margin:24px 0">
    <p style="margin:0;font-size:12px;color:${MUTED_COLOR}">
      Si no esperaba este correo, puede ignorarlo. El enlace de verificacion expira en 48 horas.
    </p>
  `);
  const text = [
    `Hola, ${toSingleLine(opts.userName)}`,
    ``,
    `${toSingleLine(opts.invitedBy)} le ha agregado a ${toSingleLine(opts.tenantName)} con el rol ${toSingleLine(opts.role)}.`,
    ``,
    ...accessText(opts),
    ``,
    `Verifique su correo: ${opts.verifyUrl}`,
  ].join("\n");
  return { subject, html, text };
}

export function emailVerificationEmail(opts: {
  userName: string;
  verifyUrl: string;
}): EmailContent {
  const subject = "Verifique su correo — NCI Logistics Control Tower";
  const html = layout(`
    <h1 style="margin:0 0 8px;font-size:22px;color:${TEXT_COLOR}">Verificacion de correo</h1>
    <p style="margin:0 0 20px;font-size:15px;color:${MUTED_COLOR};line-height:1.6">
      Hola ${h(opts.userName)}, haga clic en el siguiente boton para confirmar su direccion de correo electronico.
    </p>
    ${button("Verificar correo electronico", opts.verifyUrl)}
    <p style="margin:16px 0 0;font-size:12px;color:${MUTED_COLOR}">
      Si no solicito esta verificacion, ignore este correo. El enlace expira en 48 horas.
    </p>
  `);
  const text = [
    `Verificacion de correo`,
    ``,
    `Hola ${toSingleLine(opts.userName)}, verifique su correo: ${opts.verifyUrl}`,
  ].join("\n");
  return { subject, html, text };
}

export function invitationEmail(opts: {
  tenantName: string;
  role: string;
  invitedBy: string;
  inviteUrl: string;
  expiresInHours: number;
}): EmailContent {
  const subject = `Invitacion a ${toSingleLine(opts.tenantName)} — NCI Logistics Control Tower`;
  const html = layout(`
    <h1 style="margin:0 0 8px;font-size:22px;color:${TEXT_COLOR}">Invitacion al equipo</h1>
    <p style="margin:0 0 20px;font-size:15px;color:${MUTED_COLOR};line-height:1.6">
      <strong>${h(opts.invitedBy)}</strong> le invita a unirse a <strong>${h(opts.tenantName)}</strong>
      en NCI Logistics Control Tower.
    </p>
    ${infoBox([
      { label: "Empresa", value: opts.tenantName },
      { label: "Rol asignado", value: opts.role },
      { label: "Invitado por", value: opts.invitedBy },
    ])}
    ${button("Aceptar invitacion", opts.inviteUrl)}
    <hr style="border:none;border-top:1px solid ${BORDER_COLOR};margin:24px 0">
    <p style="margin:0;font-size:12px;color:${MUTED_COLOR}">
      Este enlace expira en ${Number(opts.expiresInHours)} horas. Si no esperaba esta invitacion, puede ignorar este correo.
    </p>
  `);
  const text = [
    `${toSingleLine(opts.invitedBy)} le invita a ${toSingleLine(opts.tenantName)} con el rol ${toSingleLine(opts.role)}.`,
    ``,
    `Acepte la invitacion: ${opts.inviteUrl}`,
    ``,
    `Expira en ${Number(opts.expiresInHours)} horas.`,
  ].join("\n");
  return { subject, html, text };
}
