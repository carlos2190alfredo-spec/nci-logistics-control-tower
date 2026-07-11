import { describe, it, expect } from "vitest";
import { stripExifClient } from "./photo-store";

function buildJpeg(...segments: number[][]): Uint8Array {
  return new Uint8Array([0xff, 0xd8, ...segments.flat()]);
}

function marker(id: number, dataSize: number): number[] {
  const data = new Array(dataSize).fill(0x41);
  const segLen = dataSize + 2;
  return [0xff, id, (segLen >> 8) & 0xff, segLen & 0xff, ...data];
}

describe("stripExifClient", () => {
  it("removes APP1 (Exif) marker", () => {
    const input = buildJpeg(
      marker(0xe1, 20),
      [0xff, 0xda, 0x00, 0x02],
      [0x01, 0x02, 0x03],
      [0xff, 0xd9],
    );
    const output = new Uint8Array(stripExifClient(input.buffer as ArrayBuffer));
    expect(output[0]).toBe(0xff);
    expect(output[1]).toBe(0xd8);
    expect(output.length).toBeLessThan(input.length);

    let foundApp1 = false;
    for (let i = 2; i < output.length - 1; i++) {
      if (output[i] === 0xff && output[i + 1] === 0xe1) foundApp1 = true;
    }
    expect(foundApp1).toBe(false);
  });

  it("removes APP2 (ICC) marker", () => {
    const input = buildJpeg(
      marker(0xe2, 15),
      [0xff, 0xda, 0x00, 0x02],
      [0xff, 0xd9],
    );
    const output = new Uint8Array(stripExifClient(input.buffer as ArrayBuffer));
    let foundApp2 = false;
    for (let i = 2; i < output.length - 1; i++) {
      if (output[i] === 0xff && output[i + 1] === 0xe2) foundApp2 = true;
    }
    expect(foundApp2).toBe(false);
  });

  it("removes COM (comment) marker", () => {
    const input = buildJpeg(
      marker(0xfe, 10),
      [0xff, 0xda, 0x00, 0x02],
      [0xff, 0xd9],
    );
    const output = new Uint8Array(stripExifClient(input.buffer as ArrayBuffer));
    let foundCom = false;
    for (let i = 2; i < output.length - 1; i++) {
      if (output[i] === 0xff && output[i + 1] === 0xfe) foundCom = true;
    }
    expect(foundCom).toBe(false);
  });

  it("preserves non-stripped markers (e.g. DQT, SOF)", () => {
    const dqt = marker(0xdb, 5);
    const input = buildJpeg(
      marker(0xe1, 10),
      dqt,
      [0xff, 0xda, 0x00, 0x02],
      [0xff, 0xd9],
    );
    const output = new Uint8Array(stripExifClient(input.buffer as ArrayBuffer));
    let foundDqt = false;
    for (let i = 2; i < output.length - 1; i++) {
      if (output[i] === 0xff && output[i + 1] === 0xdb) foundDqt = true;
    }
    expect(foundDqt).toBe(true);
  });

  it("returns original if not a JPEG", () => {
    const input = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const output = stripExifClient(input.buffer as ArrayBuffer);
    expect(new Uint8Array(output)).toEqual(input);
  });

  it("handles JPEG with no strippable markers", () => {
    const input = buildJpeg(
      marker(0xdb, 5),
      [0xff, 0xda, 0x00, 0x02],
      [0xff, 0xd9],
    );
    const output = new Uint8Array(stripExifClient(input.buffer as ArrayBuffer));
    expect(output.length).toBe(input.length);
  });
});
