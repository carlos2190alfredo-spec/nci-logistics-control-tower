const BRAND_COLOR = "#0f172a";
const ACCENT_COLOR = "#2563eb";
const BG_COLOR = "#f8fafc";
const CARD_BG = "#ffffff";
const TEXT_COLOR = "#1e293b";
const MUTED_COLOR = "#64748b";
const BORDER_COLOR = "#e2e8f0";

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
    <a href="${url}" style="display:inline-block;background:${ACCENT_COLOR};color:#fff;padding:14px 32px;border-radius:8px;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.3px">${text}</a>
  </td></tr></table>`;
}

function infoBox(items: { label: string; value: string }[]): string {
  const rows = items
    .map(
      (i) =>
        `<tr><td style="padding:8px 12px;font-size:13px;color:${MUTED_COLOR};border-bottom:1px solid ${BORDER_COLOR}">${i.label}</td><td style="padding:8px 12px;font-size:13px;font-weight:600;color:${TEXT_COLOR};border-bottom:1px solid ${BORDER_COLOR}">${i.value}</td></tr>`,
    )
    .join("");
  return `<table width="100%" cellpadding="0" cellspacing="0" style="background:${BG_COLOR};border:1px solid ${BORDER_COLOR};border-radius:8px;margin:16px 0">${rows}</table>`;
}

export function welcomeTenantOwnerEmail(opts: {
  ownerName: string;
  tenantName: string;
  verifyUrl: string;
  loginUrl: string;
  tempPassword: string;
}): { subject: string; html: string; text: string } {
  const subject = `Bienvenido a ${opts.tenantName} — NCI Logistics Control Tower`;
  const html = layout(`
    <h1 style="margin:0 0 8px;font-size:22px;color:${TEXT_COLOR}">Bienvenido, ${opts.ownerName}</h1>
    <p style="margin:0 0 20px;font-size:15px;color:${MUTED_COLOR};line-height:1.6">
      Su cuenta de <strong>${opts.tenantName}</strong> ha sido creada exitosamente en NCI Logistics Control Tower.
      Antes de iniciar sesion, confirme su correo electronico.
    </p>
    ${button("Verificar mi correo electronico", opts.verifyUrl)}
    <p style="margin:0 0 16px;font-size:14px;color:${TEXT_COLOR};line-height:1.5">
      Una vez verificado su correo, inicie sesion con las siguientes credenciales:
    </p>
    ${infoBox([
      { label: "Empresa", value: opts.tenantName },
      { label: "Rol", value: "Propietario (Owner)" },
      { label: "Contrasena temporal", value: opts.tempPassword },
    ])}
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
    `Bienvenido, ${opts.ownerName}`,
    ``,
    `Su cuenta de ${opts.tenantName} ha sido creada en NCI Logistics Control Tower.`,
    ``,
    `Verifique su correo: ${opts.verifyUrl}`,
    ``,
    `Contrasena temporal: ${opts.tempPassword}`,
    ``,
    `Despues de verificar e iniciar sesion, configure la autenticacion de dos factores (MFA).`,
  ].join("\n");
  return { subject, html, text };
}

export function welcomeUserEmail(opts: {
  userName: string;
  tenantName: string;
  role: string;
  verifyUrl: string;
  tempPassword: string;
  invitedBy: string;
}): { subject: string; html: string; text: string } {
  const subject = `Ha sido agregado a ${opts.tenantName} — NCI Logistics Control Tower`;
  const html = layout(`
    <h1 style="margin:0 0 8px;font-size:22px;color:${TEXT_COLOR}">Hola, ${opts.userName}</h1>
    <p style="margin:0 0 20px;font-size:15px;color:${MUTED_COLOR};line-height:1.6">
      <strong>${opts.invitedBy}</strong> le ha agregado al equipo de <strong>${opts.tenantName}</strong>
      en NCI Logistics Control Tower. Confirme su correo electronico para activar su cuenta.
    </p>
    ${button("Verificar mi correo electronico", opts.verifyUrl)}
    ${infoBox([
      { label: "Empresa", value: opts.tenantName },
      { label: "Rol", value: opts.role },
      { label: "Contrasena temporal", value: opts.tempPassword },
    ])}
    <p style="margin:16px 0 0;font-size:13px;color:${MUTED_COLOR};line-height:1.5">
      Inicie sesion despues de verificar su correo. Se recomienda configurar la autenticacion de dos factores
      desde <strong>Seguridad</strong> en su perfil.
    </p>
    <hr style="border:none;border-top:1px solid ${BORDER_COLOR};margin:24px 0">
    <p style="margin:0;font-size:12px;color:${MUTED_COLOR}">
      Si no esperaba este correo, puede ignorarlo. El enlace de verificacion expira en 48 horas.
    </p>
  `);
  const text = [
    `Hola, ${opts.userName}`,
    ``,
    `${opts.invitedBy} le ha agregado a ${opts.tenantName} con el rol ${opts.role}.`,
    ``,
    `Verifique su correo: ${opts.verifyUrl}`,
    `Contrasena temporal: ${opts.tempPassword}`,
  ].join("\n");
  return { subject, html, text };
}

export function emailVerificationEmail(opts: {
  userName: string;
  verifyUrl: string;
}): { subject: string; html: string; text: string } {
  const subject = "Verifique su correo — NCI Logistics Control Tower";
  const html = layout(`
    <h1 style="margin:0 0 8px;font-size:22px;color:${TEXT_COLOR}">Verificacion de correo</h1>
    <p style="margin:0 0 20px;font-size:15px;color:${MUTED_COLOR};line-height:1.6">
      Hola ${opts.userName}, haga clic en el siguiente boton para confirmar su direccion de correo electronico.
    </p>
    ${button("Verificar correo electronico", opts.verifyUrl)}
    <p style="margin:16px 0 0;font-size:12px;color:${MUTED_COLOR}">
      Si no solicito esta verificacion, ignore este correo. El enlace expira en 48 horas.
    </p>
  `);
  const text = [
    `Verificacion de correo`,
    ``,
    `Hola ${opts.userName}, verifique su correo: ${opts.verifyUrl}`,
  ].join("\n");
  return { subject, html, text };
}

export function invitationEmail(opts: {
  tenantName: string;
  role: string;
  invitedBy: string;
  inviteUrl: string;
  expiresInHours: number;
}): { subject: string; html: string; text: string } {
  const subject = `Invitacion a ${opts.tenantName} — NCI Logistics Control Tower`;
  const html = layout(`
    <h1 style="margin:0 0 8px;font-size:22px;color:${TEXT_COLOR}">Invitacion al equipo</h1>
    <p style="margin:0 0 20px;font-size:15px;color:${MUTED_COLOR};line-height:1.6">
      <strong>${opts.invitedBy}</strong> le invita a unirse a <strong>${opts.tenantName}</strong>
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
      Este enlace expira en ${opts.expiresInHours} horas. Si no esperaba esta invitacion, puede ignorar este correo.
    </p>
  `);
  const text = [
    `${opts.invitedBy} le invita a ${opts.tenantName} con el rol ${opts.role}.`,
    ``,
    `Acepte la invitacion: ${opts.inviteUrl}`,
    ``,
    `Expira en ${opts.expiresInHours} horas.`,
  ].join("\n");
  return { subject, html, text };
}
