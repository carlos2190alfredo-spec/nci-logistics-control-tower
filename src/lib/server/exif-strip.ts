/**
 * Strips EXIF and other metadata from JPEG images by removing APP1 (Exif),
 * APP2 (ICC), APP12, APP13 (IPTC), and COM markers. Leaves APP0 (JFIF) intact.
 * PNG and WebP pass through unchanged (no EXIF by default in PNG; WebP EXIF
 * is rare and typically absent from phone cameras via browser capture APIs).
 */
export function stripExif(buffer: Buffer): Buffer {
  if (buffer.length < 4) return buffer;
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return buffer;

  const result: Buffer[] = [Buffer.from([0xff, 0xd8])];
  let offset = 2;

  while (offset < buffer.length - 1) {
    if (buffer[offset] !== 0xff) break;

    const marker = buffer[offset + 1];

    if (marker === 0xd9) {
      result.push(buffer.subarray(offset));
      break;
    }
    if (marker === 0xda) {
      result.push(buffer.subarray(offset));
      break;
    }

    if (offset + 3 >= buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset + 2);
    const totalLength = 2 + segmentLength;

    const strip =
      marker === 0xe1 ||
      marker === 0xe2 ||
      marker === 0xec ||
      marker === 0xed ||
      marker === 0xfe;

    if (strip) {
      offset += totalLength;
      continue;
    }

    result.push(buffer.subarray(offset, offset + totalLength));
    offset += totalLength;
  }

  return Buffer.concat(result);
}
