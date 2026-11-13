import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_UPLOAD_FILE_BYTES } from "@/lib/server/storage";
import {
  ENCODING_LADDER,
  MAX_RAW_IMAGE_BYTES,
  MAX_UPLOAD_BYTES,
  PhotoTooLargeError,
  TARGET_IMAGE_BYTES,
  assertFitsUploadLimit,
  formatMegabytes,
  prepareEvidenceFile,
  prepareImageForUpload,
  replaceExtension,
  scaleToFit,
} from "./photo-compress";

const MB = 1024 * 1024;

function jpegFile(bytes: number, name = "IMG_0001.JPG") {
  const data = new Uint8Array(bytes);
  data.set([0xff, 0xd8, 0xff, 0xe0]);
  return new File([data], name, { type: "image/jpeg" });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("limites de subida", () => {
  it("el limite del cliente coincide con el del servidor", () => {
    expect(MAX_UPLOAD_BYTES).toBe(MAX_UPLOAD_FILE_BYTES);
  });

  it("el objetivo de reduccion cabe con holgura bajo el limite", () => {
    expect(TARGET_IMAGE_BYTES).toBeLessThan(MAX_UPLOAD_BYTES);
    expect(MAX_UPLOAD_BYTES).toBeLessThan(MAX_RAW_IMAGE_BYTES);
  });

  it("la escalera de reduccion es monotona (cada paso es mas agresivo)", () => {
    for (let i = 1; i < ENCODING_LADDER.length; i++) {
      expect(ENCODING_LADDER[i].maxDimension).toBeLessThan(ENCODING_LADDER[i - 1].maxDimension);
      expect(ENCODING_LADDER[i].quality).toBeLessThan(ENCODING_LADDER[i - 1].quality);
    }
  });
});

describe("helpers puros", () => {
  it("scaleToFit reduce proporcionalmente y nunca amplia", () => {
    expect(scaleToFit(4000, 3000, 2048)).toEqual({ width: 2048, height: 1536 });
    expect(scaleToFit(3000, 4000, 2048)).toEqual({ width: 1536, height: 2048 });
    expect(scaleToFit(800, 600, 2048)).toEqual({ width: 800, height: 600 });
  });

  it("replaceExtension cambia la extension y tolera nombres vacios o sin extension", () => {
    expect(replaceExtension("IMG_1.PNG", "jpg")).toBe("IMG_1.jpg");
    expect(replaceExtension("foto.final.webp", "jpg")).toBe("foto.final.jpg");
    expect(replaceExtension("sin-extension", "jpg")).toBe("sin-extension.jpg");
    expect(replaceExtension("", "jpg")).toBe("foto.jpg");
  });

  it("formatMegabytes usa coma decimal", () => {
    expect(formatMegabytes(3 * MB)).toBe("3 MB");
    expect(formatMegabytes(2.5 * MB)).toBe("2,5 MB");
  });
});

describe("assertFitsUploadLimit", () => {
  it("acepta archivos dentro del limite y rechaza los que lo exceden con mensaje en espanol", () => {
    expect(() => assertFitsUploadLimit(new Blob([new Uint8Array(MAX_UPLOAD_BYTES)]))).not.toThrow();
    expect(() => assertFitsUploadLimit(new Blob([new Uint8Array(MAX_UPLOAD_BYTES + 1)]))).toThrow(PhotoTooLargeError);
    expect(() => assertFitsUploadLimit(new Blob([new Uint8Array(4 * MB)]))).toThrow(/maximo es 3 MB/);
  });
});

describe("prepareImageForUpload", () => {
  it("no toca las fotos que ya pesan poco", async () => {
    const file = jpegFile(1 * MB);
    const prepared = await prepareImageForUpload(file);
    expect(prepared.blob).toBe(file);
    expect(prepared.reencoded).toBe(false);
    expect(prepared.filename).toBe("IMG_0001.JPG");
  });

  it("sin decodificador acepta la foto original si cabe en el limite", async () => {
    const file = jpegFile(2.5 * MB);
    const prepared = await prepareImageForUpload(file);
    expect(prepared.blob).toBe(file);
    expect(prepared.reencoded).toBe(false);
  });

  it("sin decodificador rechaza con mensaje claro si la foto excede el limite", async () => {
    await expect(prepareImageForUpload(jpegFile(5 * MB))).rejects.toThrow(PhotoTooLargeError);
    await expect(prepareImageForUpload(jpegFile(5 * MB))).rejects.toThrow(/demasiado pesada/);
  });

  it("recodifica como JPEG con el primer paso de la escalera que cabe", async () => {
    const close = vi.fn();
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue({ width: 4000, height: 3000, close }));

    const sizes = [Math.round(2.6 * MB), Math.round(1.4 * MB)];
    const drawn: Array<{ width: number; height: number }> = [];
    const convertToBlob = vi.fn(async () => new Blob([new Uint8Array(sizes.shift() ?? 0)], { type: "image/jpeg" }));
    class FakeOffscreenCanvas {
      constructor(
        public width: number,
        public height: number,
      ) {
        drawn.push({ width, height });
      }
      getContext() {
        return { fillRect: vi.fn(), drawImage: vi.fn(), fillStyle: "", imageSmoothingQuality: "high" };
      }
      convertToBlob = convertToBlob;
    }
    vi.stubGlobal("OffscreenCanvas", FakeOffscreenCanvas);

    const file = jpegFile(8 * MB, "IMG_0002.PNG");
    const prepared = await prepareImageForUpload(file);

    expect(prepared.reencoded).toBe(true);
    expect(prepared.mimeType).toBe("image/jpeg");
    expect(prepared.filename).toBe("IMG_0002.jpg");
    expect(prepared.blob.size).toBe(Math.round(1.4 * MB));
    expect(drawn).toEqual([
      { width: 2048, height: 1536 },
      { width: 1600, height: 1200 },
    ]);
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe("prepareEvidenceFile", () => {
  it("rechaza PDF que excede el limite sin intentar reducirlo", async () => {
    const pdf = new File([new Uint8Array(4 * MB)], "acta.pdf", { type: "application/pdf" });
    await expect(prepareEvidenceFile(pdf)).rejects.toThrow(PhotoTooLargeError);
  });

  it("devuelve el mismo File cuando no hace falta reducir", async () => {
    const pdf = new File([new Uint8Array(1 * MB)], "acta.pdf", { type: "application/pdf" });
    expect(await prepareEvidenceFile(pdf)).toBe(pdf);
    const photo = jpegFile(1 * MB);
    expect(await prepareEvidenceFile(photo)).toBe(photo);
  });

  it("rechaza fotos por encima del limite de entrada", async () => {
    await expect(prepareEvidenceFile(jpegFile(MAX_RAW_IMAGE_BYTES + 1))).rejects.toThrow(/excede el limite/);
  });
});
