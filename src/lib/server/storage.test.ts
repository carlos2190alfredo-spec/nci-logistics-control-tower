import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_FILE_BYTES,
  UploadRejectedError,
  detectMimeFromMagicBytes,
  isValidSignaturePng,
  safeFilename,
  validateUploadedFile,
} from "./storage";

const MB = 1024 * 1024;

function fileWith(bytes: number[], size: number, name: string, type: string) {
  const data = new Uint8Array(size);
  data.set(bytes);
  return new File([data], name, { type });
}

const jpegHeader = [0xff, 0xd8, 0xff, 0xe0];

describe("storage security", () => {
  it("detecta PNG por magic bytes", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectMimeFromMagicBytes(png)).toBe("image/png");
  });

  it("detecta JPEG", () => {
    expect(detectMimeFromMagicBytes(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
  });

  it("detecta PDF", () => {
    expect(detectMimeFromMagicBytes(Buffer.from("%PDF-1.4"))).toBe("application/pdf");
  });

  it("rechaza contenido HTML disfrazado", () => {
    expect(detectMimeFromMagicBytes(Buffer.from("<html><script>"))).toBeNull();
  });

  it("safeFilename sanitiza path traversal", () => {
    expect(safeFilename("../../../etc/passwd")).not.toContain("../");
    expect(safeFilename("../../../etc/passwd")).toBe("..-..-..-etc-passwd");
  });

  it("isValidSignaturePng rechaza data URL vacio o corto", () => {
    expect(isValidSignaturePng("")).toBe(false);
    expect(isValidSignaturePng("data:image/svg+xml,<svg/>")).toBe(false);
    expect(isValidSignaturePng("data:image/png;base64,aGVsbG8=")).toBe(false);
  });

  it("isValidSignaturePng acepta PNG grande", () => {
    const large = "data:image/png;base64," + "A".repeat(400);
    expect(isValidSignaturePng(large)).toBe(true);
  });
});

describe("limite de subida (Vercel ~4,5 MB, Server Actions bodySizeLimit)", () => {
  it("el tope por archivo es 3 MB", () => {
    expect(MAX_UPLOAD_FILE_BYTES).toBe(3 * MB);
  });

  it("deja al menos 1 MB de margen bajo el bodySizeLimit de next.config.ts, que a su vez queda bajo 4,5 MB", () => {
    const config = readFileSync("next.config.ts", "utf8");
    const match = /SERVER_ACTIONS_BODY_LIMIT\s*=\s*"(\d+)mb"/.exec(config);
    expect(match).not.toBeNull();
    const bodyLimitBytes = Number(match![1]) * MB;

    expect(config).toContain("bodySizeLimit: SERVER_ACTIONS_BODY_LIMIT");
    expect(bodyLimitBytes).toBeLessThan(4.5 * MB);
    expect(bodyLimitBytes - MAX_UPLOAD_FILE_BYTES).toBeGreaterThanOrEqual(1 * MB);
  });

  it("acepta un JPEG valido dentro del limite", async () => {
    const result = await validateUploadedFile(fileWith(jpegHeader, 2 * MB, "foto.jpg", "image/jpeg"));
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.filename).toBe("foto.jpg");
    expect(result.buffer.length).toBe(2 * MB);
  });

  it("acepta exactamente el tope y rechaza un byte de mas con el limite en el mensaje", async () => {
    await expect(
      validateUploadedFile(fileWith(jpegHeader, MAX_UPLOAD_FILE_BYTES, "foto.jpg", "image/jpeg")),
    ).resolves.toBeDefined();

    const tooBig = fileWith(jpegHeader, MAX_UPLOAD_FILE_BYTES + 1, "foto.jpg", "image/jpeg");
    await expect(validateUploadedFile(tooBig)).rejects.toThrow(UploadRejectedError);
    await expect(validateUploadedFile(tooBig)).rejects.toThrow(/entre 32 bytes y 3 MB/);
  });

  it("sigue rechazando archivos de 5 MB que antes se aceptaban", async () => {
    await expect(validateUploadedFile(fileWith(jpegHeader, 5 * MB, "foto.jpg", "image/jpeg"))).rejects.toThrow(
      UploadRejectedError,
    );
  });

  it("mantiene la validacion de MIME, extension y magic bytes", async () => {
    await expect(validateUploadedFile(fileWith(jpegHeader, 1024, "foto.exe", "application/x-msdownload"))).rejects.toThrow(
      /Tipo de archivo no permitido/,
    );
    await expect(validateUploadedFile(fileWith(jpegHeader, 1024, "foto.png", "image/jpeg"))).rejects.toThrow(
      /extension/,
    );
    await expect(
      validateUploadedFile(fileWith([0x3c, 0x68, 0x74, 0x6d, 0x6c], 1024, "foto.jpg", "image/jpeg")),
    ).rejects.toThrow(/contenido/);
    await expect(validateUploadedFile(fileWith(jpegHeader, 8, "foto.jpg", "image/jpeg"))).rejects.toThrow(/entre 32 bytes/);
  });
});
