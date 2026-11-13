/**
 * Preparacion de fotos y archivos de evidencia en el navegador, antes de enviarlos.
 *
 * Vercel rechaza cuerpos de mas de ~4,5 MB y las Server Actions solo aceptan hasta
 * `bodySizeLimit` (4 MB, ver `next.config.ts`). El servidor acepta archivos de hasta
 * `MAX_UPLOAD_FILE_BYTES` (3 MB, `src/lib/server/storage.ts`). Una foto de camara pesa
 * facilmente 3-10 MB, asi que se reduce aqui: se redimensiona y se recodifica como JPEG
 * (el canvas tampoco conserva EXIF) hasta quedar bajo `TARGET_IMAGE_BYTES`.
 *
 * El servidor sigue validando MIME declarado, extension y magic bytes; esto solo evita
 * que el envio falle por tamano. Modulo sin estado ni efectos al importarlo.
 */

/** Debe coincidir con `MAX_UPLOAD_FILE_BYTES` de storage.ts (lo verifica storage.test.ts). */
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;
/** Objetivo de tamano de una foto reducida: deja margen para firma y campos del formulario. */
export const TARGET_IMAGE_BYTES = 2 * 1024 * 1024;
/** Fotos mas pesadas que esto ni se intentan decodificar (memoria del telefono). */
export const MAX_RAW_IMAGE_BYTES = 25 * 1024 * 1024;

/** Pasos de reduccion: del mas fiel al mas agresivo. Se corta en el primero que cabe. */
export const ENCODING_LADDER: ReadonlyArray<{ maxDimension: number; quality: number }> = [
  { maxDimension: 2048, quality: 0.82 },
  { maxDimension: 1600, quality: 0.76 },
  { maxDimension: 1280, quality: 0.7 },
  { maxDimension: 1024, quality: 0.62 },
];

const IMAGE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];

export class PhotoTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoTooLargeError";
  }
}

export type PreparedImage = {
  blob: Blob;
  filename: string;
  mimeType: string;
  /** `true` si se recodifico como JPEG (ya sin EXIF); `false` si es el archivo original. */
  reencoded: boolean;
};

export function isReducibleImage(mimeType: string): boolean {
  return IMAGE_MIME_TYPES.includes(mimeType);
}

/** "2,5 MB" (coma decimal, como el resto de la interfaz en espanol). */
export function formatMegabytes(bytes: number): string {
  const value = bytes / 1024 / 1024;
  return `${Number.isInteger(value) ? value : value.toFixed(1).replace(".", ",")} MB`;
}

/** Reduce proporcionalmente para que el lado mayor no pase de `maxDimension` (nunca amplia). */
export function scaleToFit(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxDimension) return { width, height };
  const scale = maxDimension / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Cambia la extension del nombre ("IMG_1.PNG" -> "IMG_1.jpg"); sin nombre usa "foto". */
export function replaceExtension(filename: string, extension: string): string {
  const base = filename.replace(/\.[^./\\]+$/, "").trim();
  return `${base || "foto"}.${extension}`;
}

function tooLargeImageError() {
  return new PhotoTooLargeError(
    `La foto es demasiado pesada y no se pudo reducir a ${formatMegabytes(MAX_UPLOAD_BYTES)}. Tome otra foto con menor resolucion.`,
  );
}

async function decodeImage(file: Blob): Promise<ImageBitmap> {
  try {
    // Aplica la orientacion EXIF al decodificar: al recodificar se pierde la etiqueta.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return createImageBitmap(file);
  }
}

async function encodeJpeg(bitmap: ImageBitmap, width: number, height: number, quality: number): Promise<Blob | null> {
  const canvas: OffscreenCanvas | HTMLCanvasElement =
    typeof OffscreenCanvas !== "undefined"
      ? new OffscreenCanvas(width, height)
      : Object.assign(document.createElement("canvas"), { width, height });
  const context = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (!context) return null;

  // JPEG no tiene transparencia: un PNG/WebP con alfa se veria negro sin este fondo.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);

  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: "image/jpeg", quality });
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Recodifica como JPEG probando `ENCODING_LADDER`. Devuelve el primer resultado que cabe en
 * `TARGET_IMAGE_BYTES`; si ninguno cabe, el mas pequeno que logro generar.
 */
async function reencodeAsJpeg(file: Blob): Promise<Blob | null> {
  const bitmap = await decodeImage(file);
  try {
    let smallest: Blob | null = null;
    for (const step of ENCODING_LADDER) {
      const { width, height } = scaleToFit(bitmap.width, bitmap.height, step.maxDimension);
      const candidate = await encodeJpeg(bitmap, width, height, step.quality);
      if (!candidate) continue;
      if (candidate.size <= TARGET_IMAGE_BYTES) return candidate;
      if (!smallest || candidate.size < smallest.size) smallest = candidate;
    }
    return smallest;
  } finally {
    bitmap.close();
  }
}

/**
 * Deja una foto (JPEG, PNG o WebP) lista para subir. Si ya pesa poco se devuelve tal cual
 * (el llamador quita EXIF de los JPEG); si no, se reduce. Lanza `PhotoTooLargeError`, con un
 * mensaje listo para mostrar, si no hay forma de dejarla bajo `MAX_UPLOAD_BYTES`.
 */
export async function prepareImageForUpload(file: File): Promise<PreparedImage> {
  const original: PreparedImage = { blob: file, filename: file.name, mimeType: file.type, reencoded: false };
  if (file.size <= TARGET_IMAGE_BYTES) return original;

  let reduced: Blob | null = null;
  try {
    reduced = await reencodeAsJpeg(file);
  } catch {
    // Navegador sin decodificador o imagen corrupta: se decide con el archivo original abajo.
  }

  if (reduced && reduced.size < file.size && reduced.size <= MAX_UPLOAD_BYTES) {
    return { blob: reduced, filename: replaceExtension(file.name, "jpg"), mimeType: "image/jpeg", reencoded: true };
  }
  if (file.size <= MAX_UPLOAD_BYTES) return original;
  throw tooLargeImageError();
}

/** Lanza `PhotoTooLargeError` si el archivo (que no se puede reducir, como un PDF) excede el limite. */
export function assertFitsUploadLimit(file: Blob): void {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new PhotoTooLargeError(
      `El archivo pesa ${formatMegabytes(file.size)} y el maximo es ${formatMegabytes(MAX_UPLOAD_BYTES)}. Comprima el documento o adjunte una fotografia.`,
    );
  }
}

/**
 * Prepara el archivo del campo "evidencia" del formulario: reduce las fotos y valida el
 * tamano del resto (PDF). Devuelve el mismo `File` si no hizo falta cambiarlo.
 */
export async function prepareEvidenceFile(file: File): Promise<File> {
  if (!isReducibleImage(file.type)) {
    assertFitsUploadLimit(file);
    return file;
  }

  if (file.size > MAX_RAW_IMAGE_BYTES) {
    throw new PhotoTooLargeError(`La foto excede el limite de ${formatMegabytes(MAX_RAW_IMAGE_BYTES)}.`);
  }

  const prepared = await prepareImageForUpload(file);
  if (!prepared.reencoded) return file;
  return new File([prepared.blob], prepared.filename, { type: prepared.mimeType, lastModified: Date.now() });
}
