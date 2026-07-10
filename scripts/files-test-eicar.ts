import { Socket } from "node:net";

const EICAR = "X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*";
const HOST = process.env.CLAMAV_HOST ?? "localhost";
const PORT = Number(process.env.CLAMAV_PORT ?? "3310");
const TIMEOUT_MS = 30_000;

function sendCommand(command: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const chunks: Buffer[] = [];
    socket.setTimeout(TIMEOUT_MS);
    socket.on("data", (c) => chunks.push(c));
    socket.on("end", () => resolve(Buffer.concat(chunks)));
    socket.on("error", reject);
    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("timeout"));
    });
    socket.connect(PORT, HOST, () => socket.end(command));
  });
}

async function main() {
  console.log(`Testing ClamAV at ${HOST}:${PORT}...`);

  const pingResp = await sendCommand(Buffer.from("zPING\0"));
  const pong = pingResp.toString("utf8").replace(/\0/g, "").trim();
  if (pong !== "PONG") {
    console.error(`FAIL: ClamAV did not respond PONG (got: ${pong})`);
    process.exit(1);
  }
  console.log("PASS: ClamAV PING → PONG");

  const eicarBuf = Buffer.from(EICAR, "ascii");
  const header = Buffer.from("zINSTREAM\0");
  const size = Buffer.alloc(4);
  size.writeUInt32BE(eicarBuf.length, 0);
  const terminator = Buffer.alloc(4, 0);
  const command = Buffer.concat([header, size, eicarBuf, terminator]);

  const scanResp = await sendCommand(command);
  const result = scanResp.toString("utf8").replace(/\0/g, "").trim();
  console.log(`ClamAV response: ${result}`);

  if (!result.includes("FOUND")) {
    console.error("FAIL: ClamAV did NOT detect EICAR as INFECTED");
    process.exit(1);
  }
  if (!result.includes("Eicar")) {
    console.error("FAIL: ClamAV response does not mention Eicar signature");
    process.exit(1);
  }
  console.log("PASS: EICAR correctly detected as INFECTED");

  const cleanBuf = Buffer.from("This is a clean test file with enough data to pass.", "utf8");
  const cleanSize = Buffer.alloc(4);
  cleanSize.writeUInt32BE(cleanBuf.length, 0);
  const cleanCmd = Buffer.concat([header, cleanSize, cleanBuf, terminator]);
  const cleanResp = await sendCommand(cleanCmd);
  const cleanResult = cleanResp.toString("utf8").replace(/\0/g, "").trim();
  console.log(`Clean file response: ${cleanResult}`);

  if (!cleanResult.endsWith("OK")) {
    console.error("FAIL: Clean file was NOT marked OK");
    process.exit(1);
  }
  console.log("PASS: Clean file correctly marked OK");

  console.log("\nAll EICAR tests passed.");
}

main().catch((err) => {
  console.error("EICAR test failed:", err);
  process.exit(1);
});
