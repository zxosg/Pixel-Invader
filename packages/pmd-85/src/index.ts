export type Pmd85ModeId =
  | "pmd85-2-tv"
  | "pmd85-2-rgb"
  | "pmd85-3-pal"
  | "pmd85-3-rgb"
  | "pmd85-colorace";

export type Pmd85GapPolicy = "zero" | "preserve-imported";

export interface Pmd85RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface Pmd85DecodedScreen {
  readonly mode: Pmd85ModeId;
  /** Six LSB-left pixel bits for each visible byte, in raster order. */
  readonly pixelMasks: Uint8Array;
  /** The original two attribute bits for each visible byte. */
  readonly attributes: Uint8Array;
  /** Black is index 0; foreground colors use indices 1..N. */
  readonly paletteIndices: Uint8Array;
  readonly gapBytes: Uint8Array;
}

export const PMD85_SCREEN_WIDTH = 288;
export const PMD85_SCREEN_HEIGHT = 256;
export const PMD85_BYTES_PER_LINE = 64;
export const PMD85_VISIBLE_BYTES_PER_LINE = 48;
export const PMD85_VISIBLE_BYTES = PMD85_VISIBLE_BYTES_PER_LINE * PMD85_SCREEN_HEIGHT;
export const PMD85_GAP_BYTES_PER_LINE = PMD85_BYTES_PER_LINE - PMD85_VISIBLE_BYTES_PER_LINE;
export const PMD85_GAP_BYTES = PMD85_GAP_BYTES_PER_LINE * PMD85_SCREEN_HEIGHT;
export const PMD85_VRAM_BYTES = PMD85_BYTES_PER_LINE * PMD85_SCREEN_HEIGHT;
export const PMD85_VRAM_BASE_ADDRESS = 0xc000;

export const PMD85_MODE_IDS = [
  "pmd85-2-tv",
  "pmd85-2-rgb",
  "pmd85-3-pal",
  "pmd85-3-rgb",
  "pmd85-colorace",
] as const satisfies readonly Pmd85ModeId[];

/** Native attribute-to-logical-foreground maps. TV/CV deliberately ignores blink bit 7. */
export const PMD85_NATIVE_ATTRIBUTE_MAPS = {
  "pmd85-2-tv": [0, 1, 0, 1],
  "pmd85-2-rgb": [0, 1, 2, 3],
  "pmd85-3-pal": [0, 1, 2, 3],
  "pmd85-3-rgb": [0, 1, 2, 3],
} as const satisfies Record<Exclude<Pmd85ModeId, "pmd85-colorace">, readonly number[]>;

/** Canonical (even, odd) attributes for Green, Red, Blue, Magenta, Yellow, Cyan, White. */
export const PMD85_COLORACE_CANONICAL_PAIRS = [
  [0, 0],
  [1, 1],
  [2, 2],
  [3, 3],
  [1, 0],
  [2, 0],
  [3, 0],
] as const;

/** Complete ColorAce pair matrix, indexed by [evenAttr][oddAttr], in canonical ink order. */
export const PMD85_COLORACE_PAIR_MATRIX = [
  [0, 4, 5, 6],
  [4, 1, 6, 3],
  [5, 6, 2, 3],
  [6, 3, 3, 3],
] as const;

export const PMD85_COLORACE_PURE_PALETTE = [
  { r: 0, g: 255, b: 0 },
  { r: 255, g: 0, b: 0 },
  { r: 0, g: 0, b: 255 },
  { r: 255, g: 0, b: 255 },
  { r: 255, g: 255, b: 0 },
  { r: 0, g: 255, b: 255 },
  { r: 255, g: 255, b: 255 },
] as const satisfies readonly Pmd85RgbColor[];

export function pmd85AttributeCellHeight(mode: Pmd85ModeId): 1 | 2 {
  return mode === "pmd85-colorace" ? 2 : 1;
}

export function pmd85ForegroundCount(mode: Pmd85ModeId): 2 | 4 | 7 {
  if (mode === "pmd85-2-tv") return 2;
  if (mode === "pmd85-colorace") return 7;
  return 4;
}

export function pmd85VisibleOffset(y: number, byteX: number): number {
  if (!Number.isInteger(y) || y < 0 || y >= PMD85_SCREEN_HEIGHT) {
    throw new RangeError("PMD 85 scanline is outside 0..255.");
  }
  if (!Number.isInteger(byteX) || byteX < 0 || byteX >= PMD85_VISIBLE_BYTES_PER_LINE) {
    throw new RangeError("PMD 85 visible byte coordinate is outside 0..47.");
  }
  return y * PMD85_BYTES_PER_LINE + byteX;
}

export function pmd85Address(y: number, byteX: number): number {
  return PMD85_VRAM_BASE_ADDRESS + pmd85VisibleOffset(y, byteX);
}

export function assertValidPmd85Screen(bytes: Uint8Array): void {
  if (bytes.length !== PMD85_VRAM_BYTES) {
    throw new RangeError(`PMD 85 screen must contain exactly ${PMD85_VRAM_BYTES} bytes.`);
  }
}

export function extractPmd85GapBytes(bytes: Uint8Array): Uint8Array {
  assertValidPmd85Screen(bytes);
  const gaps = new Uint8Array(PMD85_GAP_BYTES);
  for (let y = 0; y < PMD85_SCREEN_HEIGHT; y += 1) {
    const source = y * PMD85_BYTES_PER_LINE + PMD85_VISIBLE_BYTES_PER_LINE;
    gaps.set(bytes.subarray(source, source + PMD85_GAP_BYTES_PER_LINE), y * PMD85_GAP_BYTES_PER_LINE);
  }
  return gaps;
}

export function colorAceInkIndex(evenAttribute: number, oddAttribute: number): number {
  if (evenAttribute < 0 || evenAttribute > 3 || oddAttribute < 0 || oddAttribute > 3) {
    throw new RangeError("ColorAce attributes must be in the range 0..3.");
  }
  return PMD85_COLORACE_PAIR_MATRIX[evenAttribute]![oddAttribute]!;
}

export function decodePmd85Screen(bytes: Uint8Array, mode: Pmd85ModeId): Pmd85DecodedScreen {
  assertValidPmd85Screen(bytes);
  const pixelMasks = new Uint8Array(PMD85_VISIBLE_BYTES);
  const attributes = new Uint8Array(PMD85_VISIBLE_BYTES);
  const paletteIndices = new Uint8Array(PMD85_SCREEN_WIDTH * PMD85_SCREEN_HEIGHT);

  for (let y = 0; y < PMD85_SCREEN_HEIGHT; y += 1) {
    for (let byteX = 0; byteX < PMD85_VISIBLE_BYTES_PER_LINE; byteX += 1) {
      const visibleIndex = y * PMD85_VISIBLE_BYTES_PER_LINE + byteX;
      const value = bytes[y * PMD85_BYTES_PER_LINE + byteX] ?? 0;
      pixelMasks[visibleIndex] = value & 0x3f;
      attributes[visibleIndex] = value >>> 6;
    }
  }

  for (let y = 0; y < PMD85_SCREEN_HEIGHT; y += 1) {
    for (let byteX = 0; byteX < PMD85_VISIBLE_BYTES_PER_LINE; byteX += 1) {
      const visibleIndex = y * PMD85_VISIBLE_BYTES_PER_LINE + byteX;
      let ink: number;
      if (mode === "pmd85-colorace") {
        const evenY = y & ~1;
        const evenAttr = attributes[evenY * PMD85_VISIBLE_BYTES_PER_LINE + byteX] ?? 0;
        const oddAttr = attributes[(evenY + 1) * PMD85_VISIBLE_BYTES_PER_LINE + byteX] ?? 0;
        ink = colorAceInkIndex(evenAttr, oddAttr);
      } else {
        ink = PMD85_NATIVE_ATTRIBUTE_MAPS[mode][attributes[visibleIndex] ?? 0] ?? 0;
      }
      const mask = pixelMasks[visibleIndex] ?? 0;
      for (let pixel = 0; pixel < 6; pixel += 1) {
        paletteIndices[y * PMD85_SCREEN_WIDTH + byteX * 6 + pixel] =
          (mask & (1 << pixel)) !== 0 ? ink + 1 : 0;
      }
    }
  }

  return { mode, pixelMasks, attributes, paletteIndices, gapBytes: extractPmd85GapBytes(bytes) };
}

function validateVisiblePlanes(pixelMasks: Uint8Array, attributes: Uint8Array): void {
  if (pixelMasks.length !== PMD85_VISIBLE_BYTES || attributes.length !== PMD85_VISIBLE_BYTES) {
    throw new RangeError(`PMD 85 visible planes must contain exactly ${PMD85_VISIBLE_BYTES} entries.`);
  }
  for (let index = 0; index < PMD85_VISIBLE_BYTES; index += 1) {
    if ((pixelMasks[index] ?? 0) > 0x3f) throw new RangeError("PMD 85 pixel mask exceeds six bits.");
    if ((attributes[index] ?? 0) > 3) throw new RangeError("PMD 85 attribute exceeds two bits.");
  }
}

export function encodePmd85Screen(
  pixelMasks: Uint8Array,
  attributes: Uint8Array,
  gapPolicy: Pmd85GapPolicy = "zero",
  importedGapBytes?: Uint8Array,
): Uint8Array {
  validateVisiblePlanes(pixelMasks, attributes);
  if (gapPolicy === "preserve-imported" && importedGapBytes?.length !== PMD85_GAP_BYTES) {
    throw new RangeError(`Preserved PMD 85 gaps must contain exactly ${PMD85_GAP_BYTES} bytes.`);
  }
  const output = new Uint8Array(PMD85_VRAM_BYTES);
  for (let y = 0; y < PMD85_SCREEN_HEIGHT; y += 1) {
    for (let byteX = 0; byteX < PMD85_VISIBLE_BYTES_PER_LINE; byteX += 1) {
      const index = y * PMD85_VISIBLE_BYTES_PER_LINE + byteX;
      output[y * PMD85_BYTES_PER_LINE + byteX] =
        ((attributes[index] ?? 0) << 6) | (pixelMasks[index] ?? 0);
    }
    if (gapPolicy === "preserve-imported") {
      output.set(
        importedGapBytes!.subarray(y * PMD85_GAP_BYTES_PER_LINE, (y + 1) * PMD85_GAP_BYTES_PER_LINE),
        y * PMD85_BYTES_PER_LINE + PMD85_VISIBLE_BYTES_PER_LINE,
      );
    }
  }
  return output;
}

export function renderPmd85Rgba(
  decoded: Pmd85DecodedScreen,
  foregroundPalette: readonly Pmd85RgbColor[],
): Uint8Array {
  const expectedColors = pmd85ForegroundCount(decoded.mode);
  if (foregroundPalette.length !== expectedColors) {
    throw new RangeError(`PMD 85 ${decoded.mode} requires exactly ${expectedColors} foreground colors.`);
  }
  const rgba = new Uint8Array(PMD85_SCREEN_WIDTH * PMD85_SCREEN_HEIGHT * 4);
  for (let index = 0; index < decoded.paletteIndices.length; index += 1) {
    const paletteIndex = decoded.paletteIndices[index] ?? 0;
    const color = paletteIndex === 0 ? undefined : foregroundPalette[paletteIndex - 1];
    const offset = index * 4;
    rgba[offset] = color?.r ?? 0;
    rgba[offset + 1] = color?.g ?? 0;
    rgba[offset + 2] = color?.b ?? 0;
    rgba[offset + 3] = 255;
  }
  return rgba;
}

export function decodePmd85Rgba(
  bytes: Uint8Array,
  mode: Pmd85ModeId,
  foregroundPalette: readonly Pmd85RgbColor[],
): Uint8Array {
  return renderPmd85Rgba(decodePmd85Screen(bytes, mode), foregroundPalette);
}
