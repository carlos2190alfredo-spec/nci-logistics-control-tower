import { describe, expect, it } from "vitest";
import { stripExif } from "./exif-strip";

describe("stripExif", () => {
  it("returns non-JPEG buffers unchanged", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(stripExif(png)).toEqual(png);
  });

  it("returns short buffers unchanged", () => {
    const tiny = Buffer.from([0xff, 0xd8]);
    expect(stripExif(tiny)).toEqual(tiny);
  });

  it("strips APP1 (Exif) marker from JPEG", () => {
    const soi = Buffer.from([0xff, 0xd8]);
    const app0Len = Buffer.alloc(2);
    app0Len.writeUInt16BE(10, 0);
    const app0 = Buffer.concat([Buffer.from([0xff, 0xe0]), app0Len, Buffer.alloc(8)]);
    const app1Len = Buffer.alloc(2);
    app1Len.writeUInt16BE(20, 0);
    const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), app1Len, Buffer.alloc(18)]);
    const sos = Buffer.from([0xff, 0xda, 0x00, 0x02, 0x01, 0x02, 0x03]);

    const jpeg = Buffer.concat([soi, app0, app1, sos]);
    const stripped = stripExif(jpeg);

    expect(stripped.indexOf(0xe1)).toBe(-1);
    expect(stripped.subarray(0, 2)).toEqual(soi);
    const app0Start = stripped.indexOf(0xe0);
    expect(app0Start).toBeGreaterThan(0);
  });

  it("strips COM marker (0xFE)", () => {
    const soi = Buffer.from([0xff, 0xd8]);
    const comLen = Buffer.alloc(2);
    comLen.writeUInt16BE(8, 0);
    const com = Buffer.concat([Buffer.from([0xff, 0xfe]), comLen, Buffer.alloc(6)]);
    const sos = Buffer.from([0xff, 0xda, 0x00, 0x02]);
    const jpeg = Buffer.concat([soi, com, sos]);
    const stripped = stripExif(jpeg);
    expect(stripped.includes(0xfe)).toBe(false);
  });

  it("preserves APP0 (JFIF) marker", () => {
    const soi = Buffer.from([0xff, 0xd8]);
    const app0Len = Buffer.alloc(2);
    app0Len.writeUInt16BE(6, 0);
    const app0 = Buffer.concat([Buffer.from([0xff, 0xe0]), app0Len, Buffer.alloc(4)]);
    const sos = Buffer.from([0xff, 0xda, 0x00, 0x02]);
    const jpeg = Buffer.concat([soi, app0, sos]);
    const stripped = stripExif(jpeg);
    expect(stripped.length).toBe(jpeg.length);
  });
});
