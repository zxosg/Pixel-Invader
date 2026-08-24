export type QlMode = "mode8-256x256" | "mode4-512x256";

export interface QlRgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export const QL_SCREEN_HEIGHT = 256;
export const QL_BYTES_PER_LINE = 128;
export const QL_SCREEN_BYTES = QL_BYTES_PER_LINE * QL_SCREEN_HEIGHT;

export const QL_MODE8_PALETTE = [
  { r: 0, g: 0, b: 0 },
  { r: 0, g: 0, b: 255 },
  { r: 255, g: 0, b: 0 },
  { r: 255, g: 0, b: 255 },
  { r: 0, g: 255, b: 0 },
  { r: 0, g: 255, b: 255 },
  { r: 255, g: 255, b: 0 },
  { r: 255, g: 255, b: 255 },
] as const satisfies readonly QlRgbColor[];

export const QL_MODE4_PALETTE = [
  { r: 0, g: 0, b: 0 },
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 255, b: 0 },
  { r: 255, g: 255, b: 255 },
] as const satisfies readonly QlRgbColor[];

export function qlModeWidth(mode: QlMode): 256 | 512 {
  return mode === "mode8-256x256" ? 256 : 512;
}

export function qlModePalette(mode: QlMode): readonly QlRgbColor[] {
  return mode === "mode8-256x256" ? QL_MODE8_PALETTE : QL_MODE4_PALETTE;
}

function validateIndices(indices: Uint8Array, mode: QlMode): void {
  const width = qlModeWidth(mode);
  const paletteSize = qlModePalette(mode).length;
  if (indices.length !== width * QL_SCREEN_HEIGHT) {
    throw new RangeError("QL pixel index length does not match the selected mode.");
  }
  for (const value of indices) {
    if (value >= paletteSize) {
      throw new RangeError("QL pixel index is outside the selected mode palette.");
    }
  }
}

export function encodeQlScreen(indices: Uint8Array, mode: QlMode): Uint8Array {
  validateIndices(indices, mode);
  const bytes = new Uint8Array(QL_SCREEN_BYTES);
  if (mode === "mode8-256x256") {
    for (let y = 0; y < QL_SCREEN_HEIGHT; y += 1) {
      for (let x = 0; x < 256; x += 4) {
        let greenAndFlash = 0;
        let redAndBlue = 0;
        for (let pixel = 0; pixel < 4; pixel += 1) {
          const color = indices[y * 256 + x + pixel] ?? 0;
          const shift = 6 - pixel * 2;
          greenAndFlash |= ((color >> 2) & 1) << (shift + 1);
          redAndBlue |= ((color >> 1) & 1) << (shift + 1);
          redAndBlue |= (color & 1) << shift;
        }
        const offset = y * QL_BYTES_PER_LINE + x / 2;
        bytes[offset] = greenAndFlash;
        bytes[offset + 1] = redAndBlue;
      }
    }
  } else {
    for (let y = 0; y < QL_SCREEN_HEIGHT; y += 1) {
      for (let x = 0; x < 512; x += 8) {
        let green = 0;
        let red = 0;
        for (let pixel = 0; pixel < 8; pixel += 1) {
          const color = indices[y * 512 + x + pixel] ?? 0;
          const shift = 7 - pixel;
          red |= (color & 1) << shift;
          green |= ((color >> 1) & 1) << shift;
        }
        const offset = y * QL_BYTES_PER_LINE + x / 4;
        bytes[offset] = green;
        bytes[offset + 1] = red;
      }
    }
  }
  return bytes;
}

export function decodeQlScreen(bytes: Uint8Array, mode: QlMode): Uint8Array {
  assertValidQlScreen(bytes, mode);
  const width = qlModeWidth(mode);
  const indices = new Uint8Array(width * QL_SCREEN_HEIGHT);
  if (mode === "mode8-256x256") {
    for (let y = 0; y < QL_SCREEN_HEIGHT; y += 1) {
      for (let x = 0; x < 256; x += 4) {
        const offset = y * QL_BYTES_PER_LINE + x / 2;
        const greenAndFlash = bytes[offset] ?? 0;
        const redAndBlue = bytes[offset + 1] ?? 0;
        for (let pixel = 0; pixel < 4; pixel += 1) {
          const shift = 6 - pixel * 2;
          indices[y * 256 + x + pixel] =
            (((greenAndFlash >> (shift + 1)) & 1) << 2) |
            (((redAndBlue >> (shift + 1)) & 1) << 1) |
            ((redAndBlue >> shift) & 1);
        }
      }
    }
  } else {
    for (let y = 0; y < QL_SCREEN_HEIGHT; y += 1) {
      for (let x = 0; x < 512; x += 8) {
        const offset = y * QL_BYTES_PER_LINE + x / 4;
        const green = bytes[offset] ?? 0;
        const red = bytes[offset + 1] ?? 0;
        for (let pixel = 0; pixel < 8; pixel += 1) {
          const shift = 7 - pixel;
          indices[y * 512 + x + pixel] =
            (((green >> shift) & 1) << 1) | ((red >> shift) & 1);
        }
      }
    }
  }
  return indices;
}

export function assertValidQlScreen(bytes: Uint8Array, mode: QlMode): void {
  if (bytes.length !== QL_SCREEN_BYTES) {
    throw new RangeError(`QL screen must contain exactly ${QL_SCREEN_BYTES} bytes.`);
  }
  if (mode === "mode8-256x256") {
    for (let offset = 0; offset < bytes.length; offset += 2) {
      if (((bytes[offset] ?? 0) & 0x55) !== 0) {
        throw new RangeError(`QL Mode 8 FLASH bit is set at byte ${offset}.`);
      }
    }
  }
}

export function renderQlRgba(indices: Uint8Array, mode: QlMode): Uint8Array {
  validateIndices(indices, mode);
  const palette = qlModePalette(mode);
  const rgba = new Uint8Array(indices.length * 4);
  for (let index = 0; index < indices.length; index += 1) {
    const color = palette[indices[index] ?? 0] ?? palette[0]!;
    const offset = index * 4;
    rgba[offset] = color.r;
    rgba[offset + 1] = color.g;
    rgba[offset + 2] = color.b;
    rgba[offset + 3] = 255;
  }
  return rgba;
}
