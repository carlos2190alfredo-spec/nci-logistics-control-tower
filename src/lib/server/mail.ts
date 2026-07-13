import nodemailer from "nodemailer";

function getTransport() {
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST ?? "localhost",
    port: Number(process.env.MAIL_PORT ?? 1025),
    secure: false,
  });
}

export async function sendMail(opts: { to: string; subject: string; text: string }) {
  const transport = getTransport();
  await transport.sendMail({
    from: process.env.MAIL_FROM ?? "nci-lct@nci.local",
    to: opts.to,
    subject: opts.subject,
    text: opts.text,
  });
}
