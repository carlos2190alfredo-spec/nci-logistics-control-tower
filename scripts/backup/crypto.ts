import { createCipheriv, createDecipheriv, randomBytes, createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { stat } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Transform } from "node:stream";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const HEADER_MAGIC = Buffer.from("NCIBAK01");

function getEncryptionKey(): Buffer {
  const hex = process.env.BACKUP_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      "BACKUP_ENCRYPTION_KEY must be a 64-character hex string (32 bytes). Generate with: openssl rand -hex 32",
    );
  }
  return Buffer.from(hex, "hex");
}

export async function encryptFile(inputPath: string, outputPath: string): Promise<{ iv: string; authTag: string }> {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  const header = Buffer.alloc(HEADER_MAGIC.length + IV_LENGTH);
  HEADER_MAGIC.copy(header, 0);
  iv.copy(header, HEADER_MAGIC.length);

  const writeStream = createWriteStream(outputPath);
  writeStream.write(header);

  const readStream = createReadStream(inputPath);
  await pipeline(readStream, cipher, writeStream);

  const authTag = cipher.getAuthTag();
  const fd = createWriteStream(outputPath, { flags: "a" });
  fd.write(authTag);
  fd.end();
  await new Promise<void>((resolve, reject) => {
    fd.on("finish", resolve);
    fd.on("error", reject);
  });

  return { iv: iv.toString("hex"), authTag: authTag.toString("hex") };
}

export async function decryptFile(inputPath: string, outputPath: string): Promise<void> {
  const key = getEncryptionKey();
  const fileSize = (await stat(inputPath)).size;

  if (fileSize < HEADER_MAGIC.length + IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error("Encrypted file too small — corrupted or not a valid backup");
  }

  const headerBuf = Buffer.alloc(HEADER_MAGIC.length + IV_LENGTH);
  const headerStream = createReadStream(inputPath, { start: 0, end: headerBuf.length - 1 });
  let headerOffset = 0;
  for await (const chunk of headerStream) {
    (chunk as Buffer).copy(headerBuf, headerOffset);
    headerOffset += (chunk as Buffer).length;
  }

  const magic = headerBuf.subarray(0, HEADER_MAGIC.length);
  if (!magic.equals(HEADER_MAGIC)) {
    throw new Error("Invalid backup file — magic header mismatch");
  }

  const iv = headerBuf.subarray(HEADER_MAGIC.length, HEADER_MAGIC.length + IV_LENGTH);

  const authTagBuf = Buffer.alloc(AUTH_TAG_LENGTH);
  const tagStream = createReadStream(inputPath, {
    start: fileSize - AUTH_TAG_LENGTH,
    end: fileSize - 1,
  });
  let tagOffset = 0;
  for await (const chunk of tagStream) {
    (chunk as Buffer).copy(authTagBuf, tagOffset);
    tagOffset += (chunk as Buffer).length;
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });
  decipher.setAuthTag(authTagBuf);

  const ciphertextStart = HEADER_MAGIC.length + IV_LENGTH;
  const ciphertextEnd = fileSize - AUTH_TAG_LENGTH - 1;

  const readStream = createReadStream(inputPath, { start: ciphertextStart, end: ciphertextEnd });
  const writeStream = createWriteStream(outputPath);

  await pipeline(readStream, decipher, writeStream);
}

export function sha256File(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}

export function sha256Buffer(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

export { getEncryptionKey, ALGORITHM, HEADER_MAGIC };
