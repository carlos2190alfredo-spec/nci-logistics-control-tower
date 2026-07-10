import { describe, expect, it } from "vitest";
import { isValidSignatureDataUrl } from "./pod-pdf";

describe("pod-pdf signature validation", () => {
  it("acepta data URL PNG con longitud mínima", () => {
    const dataUrl = "data:image/png;base64," + "A".repeat(400);
    expect(isValidSignatureDataUrl(dataUrl)).toBe(true);
  });

  it("rechaza data URL PNG demasiado corto", () => {
    expect(isValidSignatureDataUrl("data:image/png;base64,aGVsbG8=")).toBe(false);
  });

  it("rechaza data URL JPEG o SVG", () => {
    expect(isValidSignatureDataUrl("data:image/jpeg;base64,AAAA")).toBe(false);
    expect(isValidSignatureDataUrl("data:image/svg+xml,<svg/>")).toBe(false);
  });

  it("rechaza null o undefined", () => {
    expect(isValidSignatureDataUrl(null)).toBe(false);
    expect(isValidSignatureDataUrl(undefined)).toBe(false);
  });
});
