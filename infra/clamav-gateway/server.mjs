// Gateway HTTPS → clamd (ADR-036). Expone solo /scan y /health con token Bearer y
// /livez sin datos para el health check de Fly. clamd escucha en 127.0.0.1:3310
// dentro de la misma maquina y nunca se publica.
import { createServer } from "node:http";
import { connect } from "node:net";
import { timingSafeEqual } from "node:crypto";

const TOKEN = process.env.GATEWAY_TOKEN ?? "";
const PORT = Number(process.env.PORT ?? 8080);
const MAX_BYTES = 6 * 1024 * 1024; // la app limita archivos a 3 MiB (Vercel ~4,5 MB por peticion); margen holgado
const CLAMD = { host: "127.0.0.1", port: 3310 };

if (TOKEN.length < 32) {
  console.error("GATEWAY_TOKEN requerido (minimo 32 caracteres)");
  process.exit(1);
}

function authorized(req) {
  const header = req.headers.authorization ?? "";
  const given = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
  const expected = Buffer.from(TOKEN);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

function clamd(payload) {
  return new Promise((resolve, reject) => {
    const socket = connect(CLAMD, () => socket.end(payload));
    const chunks = [];
    socket.setTimeout(30_000);
    socket.on("data", (c) => chunks.push(c));
    socket.on("end", () => resolve(Buffer.concat(chunks).toString("utf8").replace(/\0/g, "").trim()));
    socket.on("timeout", () => { socket.destroy(); reject(new Error("clamd timeout")); });
    socket.on("error", reject);
  });
}

function instream(file) {
  const size = Buffer.alloc(4);
  size.writeUInt32BE(file.length, 0);
  return Buffer.concat([Buffer.from("zINSTREAM\0"), size, file, Buffer.alloc(4, 0)]);
}

function parse(reply) {
  if (reply.endsWith("OK")) return { verdict: "CLEAN", detail: reply };
  const found = /:\s*(.+)\s+FOUND/.exec(reply);
  if (found) return { verdict: "INFECTED", detail: found[1] };
  return { verdict: "ERROR", detail: reply.slice(0, 200) };
}

function send(res, status, body) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
}

async function pong() {
  try { return (await clamd(Buffer.from("zPING\0"))) === "PONG"; } catch { return false; }
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url ?? "/", "http://gateway");
  if (req.method === "GET" && pathname === "/livez") {
    return send(res, (await pong()) ? 200 : 503, {});
  }
  if (!authorized(req)) return send(res, 401, { error: "unauthorized" });

  if (req.method === "GET" && pathname === "/health") {
    return (await pong()) ? send(res, 200, { status: "ok" }) : send(res, 503, { status: "clamd-down" });
  }
  if (req.method !== "POST" || pathname !== "/scan") return send(res, 404, { error: "not found" });

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BYTES) return send(res, 413, { error: "too large" });
    chunks.push(chunk);
  }
  try {
    send(res, 200, parse(await clamd(instream(Buffer.concat(chunks)))));
  } catch (error) {
    send(res, 502, { verdict: "ERROR", detail: String(error).slice(0, 200) });
  }
}).listen(PORT, () => console.log(`clamav-gateway escuchando en :${PORT}`));
