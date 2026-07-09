import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const allowedMimeTypes = new Map([
  ["image/jpeg", [".jpg", ".jpeg"]],
  ["image/png", [".png"]],
  ["image/webp", [".webp"]],
  ["application/pdf", [".pdf"]],
]);

const maxFileBytes = 5 * 1024 * 1024;

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

export async function validateUploadedFile(file: File) {
  const allowedExtensions = allowedMimeTypes.get(file.type);
  if (!allowedExtensions) {
    throw new Error("Tipo de archivo no permitido.");
  }

  if (file.size <= 0 || file.size > maxFileBytes) {
    throw new Error("El archivo debe pesar entre 1 byte y 5 MB.");
  }

  const filename = safeFilename(file.name);
  const hasAllowedExtension = allowedExtensions.some((extension) => filename.endsWith(extension));
  if (!hasAllowedExtension) {
    throw new Error("La extension del archivo no coincide con el tipo MIME.");
  }

  return filename;
}

export async function uploadBuffer(input: {
  objectKey: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
}) {
  await getStorageClient().send(
    new PutObjectCommand({
      Bucket: getStorageBucket(),
      Key: input.objectKey,
      Body: input.body,
      ContentType: input.contentType,
    }),
  );
}

export async function getSignedReadUrl(objectKey: string, expiresIn = 300) {
  return getSignedUrl(
    getStorageClient(),
    new GetObjectCommand({
      Bucket: getStorageBucket(),
      Key: objectKey,
    }),
    { expiresIn },
  );
}

export async function fileToBuffer(file: File) {
  return Buffer.from(await file.arrayBuffer());
}
