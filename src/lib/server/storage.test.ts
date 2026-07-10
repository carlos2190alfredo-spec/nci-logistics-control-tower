import { describe, expect, it } from "vitest";
import { detectMimeFromMagicBytes, isValidSignaturePng, safeFilename } from "./storage";

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
