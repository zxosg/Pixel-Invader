import {
  ZX_BITMAP_BYTES,
  ZX_SCREEN_HEIGHT,
  ZX_SCREEN_WIDTH,
  zxBitmapOffset,
} from "@retro-converter/zx-spectrum";

export function zxBitmapToMonochromeRgba(
  encodedScreen: Uint8Array,
): Uint8Array {
  if (encodedScreen.length < ZX_BITMAP_BYTES) {
    throw new RangeError(
      `ZX bitmap requires at least ${ZX_BITMAP_BYTES} bytes.`,
    );
  }
  const rgba = new Uint8Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT * 4);
  for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
    for (let xByte = 0; xByte < ZX_SCREEN_WIDTH / 8; xByte += 1) {
      const packed = encodedScreen[zxBitmapOffset(xByte, y)] ?? 0;
      for (let bit = 0; bit < 8; bit += 1) {
        const value = (packed & (0x80 >> bit)) === 0 ? 0 : 255;
        const target = (y * ZX_SCREEN_WIDTH + xByte * 8 + bit) * 4;
        rgba[target] = value;
        rgba[target + 1] = value;
        rgba[target + 2] = value;
        rgba[target + 3] = 255;
      }
    }
  }
  return rgba;
}

export function mergeMonochromeRgba(
  first: Uint8Array,
  second: Uint8Array,
): Uint8Array {
  if (
    first.length !== second.length ||
    first.length % 4 !== 0
  ) {
    throw new RangeError("Monochrome previews must have matching RGBA lengths.");
  }
  const merged = new Uint8Array(first.length);
  for (let offset = 0; offset < first.length; offset += 4) {
    const value = Math.floor(
      ((first[offset] ?? 0) + (second[offset] ?? 0)) / 2,
    );
    merged[offset] = value;
    merged[offset + 1] = value;
    merged[offset + 2] = value;
    merged[offset + 3] = 255;
  }
  return merged;
}
