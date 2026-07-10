import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/**
 * Contrato de uploads:
 * - MIME declarado por el navegador se valida contra whitelist.
 * - Magic bytes se verifican en el servidor (los primeros bytes reales del archivo).
 * - Tamaño máximo 5 MB.
 * - Nombre se normaliza; la ruta final la construye el servidor con prefijo por tenant.
 * - Firma se persiste como data URL PNG en DB con validación de longitud mínima.
 */

const allowedMimeTypes = new Map([
  ["image/jpeg", [".jpg", ".jpeg"]],
  ["image/png", [".png"]],
  ["image/webp", [".webp"]],
  ["application/pdf", [".pdf"]],
]);

const maxFileBytes = 5 * 1024 * 1024;
const minFileBytes = 32;
const DEFAULT_SIGNED_TTL = 60;

let s3Client: S3Client | null = null;

export function getStorageClient() {
  if (!s3Client) {
    s3Client = new S3Client({
      region: "local",
      endpoint: process.env.MINIO_ENDPOINT ?? "http://localhost:9000",
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY ?? "nci_minio",
        secretAccessKey: process.env.MINIO_SECRET_KEY ?? "nci_minio_password",
      },
    });
  }

  return s3Client;
}

export function getStorageBucket() {
  return process.env.MINIO_BUCKET ?? "nci-logistics-local";
}

export function safeFilename(name: string) {
  const normalized = name
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();

  return normalized || "document";
}

export function extensionForMime(mimeType: string) {
  return allowedMimeTypes.get(mimeType)?.[0] ?? "";
}

/** Verifica que los primeros bytes del archivo coincidan con el MIME declarado. */
export function detectMimeFromMagicBytes(buffer: Buffer): string | null {
  if (buffer.length < 4) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
    // RIFF; verificar WEBP en offset 8..12.
    if (buffer.length >= 12 && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
    return null;
  }
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) return "application/pdf";
  return null;
}

export class UploadRejectedError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * Valida un File del navegador: MIME declarado, extensión, tamaño y magic bytes.
 * Devuelve `{ filename, buffer }` para que el llamador no vuelva a leer el archivo.
 */
export async function validateUploadedFile(file: File): Promise<{ filename: string; buffer: Buffer; mimeType: string }> {
  const allowedExtensions = allowedMimeTypes.get(file.type);
  if (!allowedExtensions) {
    throw new UploadRejectedError("UPLOAD_REJECTED", "Tipo de archivo no permitido.");
  }
  if (file.size < minFileBytes || file.size > maxFileBytes) {
    throw new UploadRejectedError("UPLOAD_REJECTED", `El archivo debe pesar entre ${minFileBytes} bytes y 5 MB.`);
  }

  const filename = safeFilename(file.name);
  const hasAllowedExtension = allowedExtensions.some((extension) => filename.endsWith(extension));
  if (!hasAllowedExtension) {
    throw new UploadRejectedError("UPLOAD_REJECTED", "La extension del archivo no coincide con el tipo MIME.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const detected = detectMimeFromMagicBytes(buffer);
  if (!detected || detected !== file.type) {
    throw new UploadRejectedError("UPLOAD_REJECTED", "El contenido del archivo no coincide con el tipo declarado.");
  }

  return { filename, buffer, mimeType: detected };
}

export async function uploadBuffer(input: {
  objectKey: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
  contentDisposition?: string;
}) {
  await getStorageClient().send(
    new PutObjectCommand({
      Bucket: getStorageBucket(),
      Key: input.objectKey,
      Body: input.body,
      ContentType: input.contentType,
      ContentDisposition: input.contentDisposition,
    }),
  );
}

/**
 * URL firmada de lectura con TTL breve. Los llamadores deciden si redirigir
 * o proxear el contenido; los cachés HTTP no deben persistir estas URLs.
 */
export async function getSignedReadUrl(
  objectKey: string,
  options: { expiresIn?: number; contentDisposition?: string } = {},
) {
  return getSignedUrl(
    getStorageClient(),
    new GetObjectCommand({
      Bucket: getStorageBucket(),
      Key: objectKey,
      ResponseContentDisposition: options.contentDisposition,
    }),
    { expiresIn: options.expiresIn ?? DEFAULT_SIGNED_TTL },
  );
}

export async function fileToBuffer(file: File) {
  return Buffer.from(await file.arrayBuffer());
}

/** Valida la firma como data URL PNG con longitud mínima. Se comparte con el POD. */
export function isValidSignaturePng(input: string): boolean {
  const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(input);
  if (!match) return false;
  const bytes = Buffer.byteLength(match[1], "base64");
  return bytes >= 200;
}
