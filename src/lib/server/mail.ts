import nodemailer from "nodemailer";

function getTransport() {
  const host = process.env.MAIL_HOST ?? "localhost";
  const port = Number(process.env.MAIL_PORT ?? 1025);
  const user = process.env.MAIL_USER;
  const pass = process.env.MAIL_PASSWORD;
  const secure = process.env.MAIL_SECURE === "true" || port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    ...(user && pass ? { auth: { user, pass } } : {}),
  });
}

export async function sendMail(opts: { to: string; subject: string; text: string; html?: string }) {
  const transport = getTransport();
  await transport.sendMail({
    from: process.env.MAIL_FROM ?? "NCI Logistics Control Tower <no-reply@nci.local>",
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
    ...(opts.html ? { html: opts.html } : {}),
  });
}
