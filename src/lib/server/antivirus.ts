import { Socket } from "node:net";
import { logger } from "@/lib/server/logger";

export type ScanVerdict = "CLEAN" | "INFECTED" | "ERROR";

export interface ScanResult {
  verdict: ScanVerdict;
  detail: string;
}

export interface AntivirusProvider {
  scan(buffer: Buffer): Promise<ScanResult>;
  ping(): Promise<boolean>;
}

const CLAMAV_HOST = process.env.CLAMAV_HOST ?? "localhost";
const CLAMAV_PORT = Number(process.env.CLAMAV_PORT ?? "3310");
const CLAMAV_TIMEOUT_MS = 30_000;

function sendClamdCommand(command: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const chunks: Buffer[] = [];

    socket.setTimeout(CLAMAV_TIMEOUT_MS);
    socket.on("data", (chunk) => chunks.push(chunk));
    socket.on("end", () => resolve(Buffer.concat(chunks)));
    socket.on("error", reject);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("ClamAV timeout"));
    });

    socket.connect(CLAMAV_PORT, CLAMAV_HOST, () => {
      socket.end(command);
    });
  });
}

function buildInstreamCommand(fileBuffer: Buffer): Buffer {
  const header = Buffer.from("zINSTREAM\0");
  const sizePrefix = Buffer.alloc(4);
  sizePrefix.writeUInt32BE(fileBuffer.length, 0);
  const terminator = Buffer.alloc(4, 0);
  return Buffer.concat([header, sizePrefix, fileBuffer, terminator]);
}

function parseInstreamResponse(response: string): ScanResult {
  const trimmed = response.replace(/\0/g, "").trim();
  if (trimmed.endsWith("OK")) {
    return { verdict: "CLEAN", detail: trimmed };
  }
  if (trimmed.includes("FOUND")) {
    const match = /:\s*(.+)\s+FOUND/.exec(trimmed);
    return { verdict: "INFECTED", detail: match?.[1] ?? trimmed };
  }
  return { verdict: "ERROR", detail: trimmed };
}

export class ClamAVProvider implements AntivirusProvider {
  async scan(buffer: Buffer): Promise<ScanResult> {
    try {
      const command = buildInstreamCommand(buffer);
      const response = await sendClamdCommand(command);
      const result = parseInstreamResponse(response.toString("utf8"));
      logger.info("clamav scan complete", {
        verdict: result.verdict,
        sizeBytes: buffer.length,
      });
      return result;
    } catch (error) {
      logger.error("clamav scan failed", { error: String(error) });
      return { verdict: "ERROR", detail: String(error) };
    }
  }

  async ping(): Promise<boolean> {
    try {
      const response = await sendClamdCommand(Buffer.from("zPING\0"));
      return response.toString("utf8").replace(/\0/g, "").trim() === "PONG";
    } catch {
      return false;
    }
  }
}

let provider: AntivirusProvider | null = null;

export function getAntivirusProvider(): AntivirusProvider {
  if (!provider) {
    provider = new ClamAVProvider();
  }
  return provider;
}

export function setAntivirusProvider(p: AntivirusProvider) {
  provider = p;
}
