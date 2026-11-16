/** Lector minimo de la API de Mailpit local (UI en :8025) para verificar los correos que envia la app. */
const BASE = process.env.MAILPIT_URL ?? "http://localhost:8025";

export type MailMessage = { id: string; subject: string; text: string; html: string };

export async function waitForMail(to: string, timeoutMs = 30_000): Promise<MailMessage> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${BASE}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
    if (res.ok) {
      const found = (await res.json()) as { messages?: { ID: string; Subject: string }[] };
      const first = found.messages?.[0];
      if (first) {
        const detail = (await (await fetch(`${BASE}/api/v1/message/${first.ID}`)).json()) as { Text?: string; HTML?: string };
        return { id: first.ID, subject: first.Subject, text: detail.Text ?? "", html: detail.HTML ?? "" };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No llegó ningún correo a ${to} en ${timeoutMs} ms`);
}

export async function mailCount(to: string): Promise<number> {
  const res = await fetch(`${BASE}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`);
  const found = (await res.json()) as { messages_count?: number; messages?: unknown[] };
  return found.messages_count ?? found.messages?.length ?? 0;
}

export async function deleteMailTo(to: string): Promise<void> {
  await fetch(`${BASE}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`, { method: "DELETE" }).catch(() => undefined);
}
