import {
  renderAttributeFrameRgba,
} from "@retro-converter/conversion-core";
import {
  PMD85_COLORACE_CANONICAL_PAIRS,
  PMD85_NATIVE_ATTRIBUTE_MAPS,
  PMD85_SCREEN_HEIGHT,
  PMD85_SCREEN_WIDTH,
  PMD85_VISIBLE_BYTES_PER_LINE,
  decodePmd85Screen,
  encodePmd85Screen,
  pmd85ForegroundCount,
  renderPmd85Rgba,
  type Pmd85GapPolicy,
  type Pmd85ModeId,
  type Pmd85RgbColor,
} from "@retro-converter/pmd-85";
import {
  QL_SCREEN_HEIGHT,
  decodeQlScreen,
  encodeQlScreen,
  qlModePalette,
  qlModeWidth,
  renderQlRgba,
  type QlMode,
} from "@retro-converter/sinclair-ql";
import {
  ZX_BITMAP_BYTES,
  ZX_SCREEN_HEIGHT,
  ZX_SCREEN_WIDTH,
  zxBitmapOffset,
} from "@retro-converter/zx-spectrum";
import type { PlatformId } from "@retro-converter/conversion-core";
import {
  bitmapEditorBrushPixels,
  type BitmapEditorBrushSize,
  type BitmapEditorOperation,
} from "./bitmap-editor-tools.js";

export type NativeResultPaintMode = "set" | "reset" | "toggle";

export interface NativeResultFrameInput {
  readonly platformId: PlatformId;
  readonly modeId: string;
  readonly hardwareModeId: string;
  readonly encoded: Uint8Array;
  readonly nativeWidth: number;
  readonly nativeHeight: number;
  readonly attributeHeight: 1 | 2 | 4 | 8 | null;
  readonly pmd85ForegroundPalette?: readonly Pmd85RgbColor[];
  readonly pmd85GapPolicy?: Pmd85GapPolicy;
  readonly pmd85ImportedGapBytes?: Uint8Array;
}

export interface NativeResultBitmap {
  readonly platformId: PlatformId;
  readonly modeId: string;
  readonly hardwareModeId: string;
  readonly width: number;
  readonly height: number;
  /** Native palette index per logical pixel. ZX uses 0/1 bitmap state. */
  readonly paletteIndices: Uint8Array;
  readonly encoded: Uint8Array;
  readonly rgba: Uint8Array;
}

function unpackZxBitmap(encoded: Uint8Array): Uint8Array {
  if (encoded.length < ZX_BITMAP_BYTES) {
    throw new RangeError("ZX result bitmap is truncated.");
  }
  const pixels = new Uint8Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT);
  for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
    for (let xByte = 0; xByte < 32; xByte += 1) {
      const packed = encoded[zxBitmapOffset(xByte, y)] ?? 0;
      for (let bit = 0; bit < 8; bit += 1) {
        pixels[y * ZX_SCREEN_WIDTH + xByte * 8 + bit] =
          (packed & (0x80 >> bit)) === 0 ? 0 : 1;
      }
    }
  }
  return pixels;
}

function packZxBitmap(pixels: Uint8Array, encoded: Uint8Array): Uint8Array {
  if (pixels.length !== ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT) {
    throw new RangeError("ZX result pixel plane has invalid dimensions.");
  }
  const next = encoded.slice();
  for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
    for (let xByte = 0; xByte < 32; xByte += 1) {
      let packed = 0;
      for (let bit = 0; bit < 8; bit += 1) {
        packed |= (pixels[y * ZX_SCREEN_WIDTH + xByte * 8 + bit] ?? 0) << (7 - bit);
      }
      next[zxBitmapOffset(xByte, y)] = packed;
    }
  }
  return next;
}

function renderZx(encoded: Uint8Array, attributeHeight: 1 | 2 | 4 | 8): Uint8Array {
  return renderAttributeFrameRgba(
    unpackZxBitmap(encoded),
    encoded.subarray(ZX_BITMAP_BYTES),
    attributeHeight,
  );
}

function assertPmdPalette(
  mode: Pmd85ModeId,
  palette: readonly Pmd85RgbColor[] | undefined,
): readonly Pmd85RgbColor[] {
  if (palette === undefined || palette.length !== pmd85ForegroundCount(mode)) {
    throw new RangeError(`PMD 85 ${mode} requires its native foreground palette.`);
  }
  return palette;
}

function pmdAttributeForPalette(mode: Pmd85ModeId, paletteIndex: number): number {
  if (mode === "pmd85-colorace") {
    const pair = PMD85_COLORACE_CANONICAL_PAIRS[paletteIndex - 1];
    if (pair === undefined) throw new RangeError("PMD ColorAce palette index is invalid.");
    return pair[0];
  }
  const map = PMD85_NATIVE_ATTRIBUTE_MAPS[mode];
  const attribute = map.findIndex((value) => value === paletteIndex - 1);
  if (attribute < 0) throw new RangeError("PMD 85 palette index is not representable.");
  return attribute;
}

function resultDimensions(input: NativeResultFrameInput): { width: number; height: number } {
  if (input.platformId === "zx-spectrum") return { width: ZX_SCREEN_WIDTH, height: ZX_SCREEN_HEIGHT };
  if (input.platformId === "sinclair-ql") {
    const mode = qlHardwareMode(input.hardwareModeId);
    return { width: qlModeWidth(mode), height: QL_SCREEN_HEIGHT };
  }
  return { width: PMD85_SCREEN_WIDTH, height: PMD85_SCREEN_HEIGHT };
}

function qlHardwareMode(hardwareModeId: string): QlMode {
  return hardwareModeId.startsWith("mode8-") ? "mode8-256x256" : "mode4-512x256";
}

function pmdHardwareMode(hardwareModeId: string): Pmd85ModeId {
  const base = hardwareModeId.replace(/-vertical-spatial$/, "");
  if (base === "pmd85-2-tv" || base === "pmd85-2-rgb" || base === "pmd85-3-tv" ||
      base === "pmd85-3-pal" || base === "pmd85-3-rgb" || base === "pmd85-colorace") {
    return base;
  }
  throw new RangeError(`Unsupported PMD 85 result mode: ${hardwareModeId}.`);
}

export function createNativeResultBitmap(input: NativeResultFrameInput): NativeResultBitmap {
  const dimensions = resultDimensions(input);
  if (input.platformId === "zx-spectrum") {
    if (input.attributeHeight === null) throw new RangeError("ZX result attribute height is missing.");
    const encoded = input.encoded.slice();
    return {
      platformId: input.platformId,
      modeId: input.modeId,
      hardwareModeId: input.hardwareModeId,
      ...dimensions,
      paletteIndices: unpackZxBitmap(encoded),
      encoded,
      rgba: renderZx(encoded, input.attributeHeight),
    };
  }
  if (input.platformId === "sinclair-ql") {
    const mode = qlHardwareMode(input.hardwareModeId);
    const paletteIndices = decodeQlScreen(input.encoded, mode);
    return {
      platformId: input.platformId,
      modeId: input.modeId,
      hardwareModeId: input.hardwareModeId,
      ...dimensions,
      paletteIndices,
      encoded: input.encoded.slice(),
      rgba: renderQlRgba(paletteIndices, mode),
    };
  }
  const mode = pmdHardwareMode(input.hardwareModeId);
  const decoded = decodePmd85Screen(input.encoded, mode);
  const palette = assertPmdPalette(mode, input.pmd85ForegroundPalette);
  return {
    platformId: input.platformId,
    modeId: input.modeId,
    hardwareModeId: input.hardwareModeId,
    ...dimensions,
    paletteIndices: decoded.paletteIndices,
    encoded: input.encoded.slice(),
    rgba: renderPmd85Rgba(decoded, palette),
  };
}

export function cloneNativeResultBitmap(bitmap: NativeResultBitmap): NativeResultBitmap {
  return {
    ...bitmap,
    paletteIndices: bitmap.paletteIndices.slice(),
    encoded: bitmap.encoded.slice(),
    rgba: bitmap.rgba.slice(),
  };
}

export function applyNativeResultPixel(
  bitmap: NativeResultBitmap,
  input: NativeResultFrameInput,
  x: number,
  y: number,
  paintMode: NativeResultPaintMode,
  selectedPaletteIndex = 1,
): NativeResultBitmap {
  if (!Number.isInteger(x) || x < 0 || x >= bitmap.width || !Number.isInteger(y) || y < 0 || y >= bitmap.height) {
    throw new RangeError("Result editor pixel is outside the native frame.");
  }
  const nextIndices = bitmap.paletteIndices.slice();
  const index = y * bitmap.width + x;
  const current = nextIndices[index] ?? 0;
  const nextValue = bitmap.platformId === "zx-spectrum"
    ? paintMode === "reset" ? 0 : paintMode === "toggle" ? current === 0 ? 1 : 0 : 1
    : paintMode === "reset"
      ? 0
      : paintMode === "toggle"
        ? current === 0 ? Math.max(1, selectedPaletteIndex) : 0
        : Math.max(1, selectedPaletteIndex);
  nextIndices[index] = nextValue;

  if (bitmap.platformId === "zx-spectrum") {
    const encoded = packZxBitmap(nextIndices, bitmap.encoded);
    if (input.attributeHeight === null) throw new RangeError("ZX result attribute height is missing.");
    return { ...bitmap, paletteIndices: nextIndices, encoded, rgba: renderZx(encoded, input.attributeHeight) };
  }

  if (bitmap.platformId === "sinclair-ql") {
    const mode = qlHardwareMode(input.hardwareModeId);
    const encoded = encodeQlScreen(nextIndices, mode);
    return { ...bitmap, paletteIndices: nextIndices, encoded, rgba: renderQlRgba(nextIndices, mode) };
  }

  const mode = pmdHardwareMode(input.hardwareModeId);
  const palette = assertPmdPalette(mode, input.pmd85ForegroundPalette);
  const decoded = decodePmd85Screen(bitmap.encoded, mode);
  const byteX = Math.floor(x / 6);
  const pixelBit = 1 << (x % 6);
  const byteIndex = y * PMD85_VISIBLE_BYTES_PER_LINE + byteX;
  const pixelMasks = decoded.pixelMasks.slice();
  const attributes = decoded.attributes.slice();
  if (nextValue === 0) {
    pixelMasks[byteIndex] = (pixelMasks[byteIndex] ?? 0) & ~pixelBit;
  } else {
    pixelMasks[byteIndex] = (pixelMasks[byteIndex] ?? 0) | pixelBit;
    if (mode === "pmd85-colorace") {
      const pair = PMD85_COLORACE_CANONICAL_PAIRS[nextValue - 1];
      if (pair === undefined) throw new RangeError("PMD ColorAce palette index is invalid.");
      const evenIndex = (y & ~1) * PMD85_VISIBLE_BYTES_PER_LINE + byteX;
      const oddIndex = (y | 1) * PMD85_VISIBLE_BYTES_PER_LINE + byteX;
      attributes[evenIndex] = pair[0];
      attributes[oddIndex] = pair[1];
    } else {
      attributes[byteIndex] = pmdAttributeForPalette(mode, nextValue);
    }
  }
  const encoded = encodePmd85Screen(
    pixelMasks,
    attributes,
    input.pmd85GapPolicy ?? "zero",
    input.pmd85ImportedGapBytes,
  );
  const nextDecoded = decodePmd85Screen(encoded, mode);
  return {
    ...bitmap,
    paletteIndices: nextDecoded.paletteIndices,
    encoded,
    rgba: renderPmd85Rgba(nextDecoded, palette),
  };
}

export function applyNativeResultBrush(
  bitmap: NativeResultBitmap,
  input: NativeResultFrameInput,
  x: number,
  y: number,
  size: BitmapEditorBrushSize,
  operation: BitmapEditorOperation,
  selectedPaletteIndex = 1,
): NativeResultBitmap {
  // A point brush has no picked mask of its own: Copy/OR set the pixel, RES
  // clears it, and XOR toggles it. Picked-cell composition uses the explicit
  // mask path in the ZX attribute-cell editor.
  if (operation === "none") return cloneNativeResultBitmap(bitmap);
  const paintMode: NativeResultPaintMode = operation === "xor" ? "toggle" : operation === "and" ? "reset" : "set";
  let next = bitmap;
  for (const pixel of bitmapEditorBrushPixels(x, y, size, bitmap.width, bitmap.height)) {
    next = applyNativeResultPixel(next, input, pixel.x, pixel.y, paintMode, selectedPaletteIndex);
  }
  return next;
}

export function applyNativeResultPixels(
  bitmap: NativeResultBitmap,
  input: NativeResultFrameInput,
  pixels: readonly { readonly x: number; readonly y: number }[],
  operation: BitmapEditorOperation,
  selectedPaletteIndex = 1,
): NativeResultBitmap {
  if (operation === "none") return cloneNativeResultBitmap(bitmap);
  const paintMode: NativeResultPaintMode = operation === "xor" ? "toggle" : operation === "and" ? "reset" : "set";
  let next = bitmap;
  for (const pixel of pixels) {
    next = applyNativeResultPixel(next, input, pixel.x, pixel.y, paintMode, selectedPaletteIndex);
  }
  return next;
}

export function nativePaletteForResult(
  input: NativeResultFrameInput,
): readonly { readonly index: number; readonly r: number; readonly g: number; readonly b: number }[] {
  if (input.platformId === "sinclair-ql") {
    return qlModePalette(qlHardwareMode(input.hardwareModeId)).map((color, index) => ({ index, ...color }));
  }
  if (input.platformId === "pmd-85") {
    return assertPmdPalette(pmdHardwareMode(input.hardwareModeId), input.pmd85ForegroundPalette)
      .map((color, index) => ({ index: index + 1, ...color }));
  }
  return [];
}
