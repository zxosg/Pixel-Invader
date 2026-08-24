export type ExifOrientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

function read16(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  if (offset + 2 > bytes.length) return 0;
  return littleEndian
    ? (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8)
    : ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function read32(bytes: Uint8Array, offset: number, littleEndian: boolean): number {
  if (offset + 4 > bytes.length) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint32(offset, littleEndian);
}

export function parseExifOrientation(bytes: Uint8Array): ExifOrientation {
  if (bytes.length < 8) return 1;
  const byteOrder = String.fromCharCode(bytes[0] ?? 0, bytes[1] ?? 0);
  if (byteOrder !== "II" && byteOrder !== "MM") return 1;
  const littleEndian = byteOrder === "II";
  if (read16(bytes, 2, littleEndian) !== 42) return 1;

  const ifdOffset = read32(bytes, 4, littleEndian);
  if (ifdOffset + 2 > bytes.length) return 1;
  const entryCount = read16(bytes, ifdOffset, littleEndian);
  if (entryCount > 1_024) return 1;

  for (let index = 0; index < entryCount; index += 1) {
    const entryOffset = ifdOffset + 2 + index * 12;
    if (entryOffset + 12 > bytes.length) return 1;
    const tag = read16(bytes, entryOffset, littleEndian);
    if (tag !== 0x0112) continue;
    const type = read16(bytes, entryOffset + 2, littleEndian);
    const count = read32(bytes, entryOffset + 4, littleEndian);
    if (type !== 3 || count !== 1) return 1;
    const value = read16(bytes, entryOffset + 8, littleEndian);
    return value >= 1 && value <= 8 ? (value as ExifOrientation) : 1;
  }
  return 1;
}

export function applyExifOrientation(
  source: Uint8Array,
  width: number,
  height: number,
  orientation: ExifOrientation,
): { width: number; height: number; rgba: Uint8Array } {
  if (orientation === 1) return { width, height, rgba: source };
  const swapsAxes = orientation >= 5;
  const outputWidth = swapsAxes ? height : width;
  const outputHeight = swapsAxes ? width : height;
  const output = new Uint8Array(source.length);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let dx = x;
      let dy = y;
      switch (orientation) {
        case 2: dx = width - 1 - x; break;
        case 3: dx = width - 1 - x; dy = height - 1 - y; break;
        case 4: dy = height - 1 - y; break;
        case 5: dx = y; dy = x; break;
        case 6: dx = height - 1 - y; dy = x; break;
        case 7: dx = height - 1 - y; dy = width - 1 - x; break;
        case 8: dx = y; dy = width - 1 - x; break;
      }
      const sourceOffset = (y * width + x) * 4;
      const outputOffset = (dy * outputWidth + dx) * 4;
      output.set(source.subarray(sourceOffset, sourceOffset + 4), outputOffset);
    }
  }
  return { width: outputWidth, height: outputHeight, rgba: output };
}
