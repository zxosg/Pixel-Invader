import { describe, expect, it } from "vitest";
import {
  PMD85_COLORACE_PURE_PALETTE,
  PMD85_GAP_BYTES,
  PMD85_SCREEN_HEIGHT,
  PMD85_SCREEN_WIDTH,
  PMD85_VISIBLE_BYTES,
  encodePmd85Screen,
  pmd85ForegroundCount,
} from "@retro-converter/pmd-85";
import {
  QL_SCREEN_BYTES,
  QL_SCREEN_HEIGHT,
} from "@retro-converter/sinclair-ql";
import { ZX_BITMAP_BYTES, ZX_SCREEN_HEIGHT, ZX_SCREEN_WIDTH, zxBitmapOffset } from "@retro-converter/zx-spectrum";
import {
  applyNativeResultPixel,
  applyNativeResultPixels,
  createNativeResultBitmap,
  nativePaletteForResult,
  type NativeResultFrameInput,
} from "./result-bitmap-editor.js";

function zxInput(encoded = new Uint8Array(6912)): NativeResultFrameInput {
  return {
    platformId: "zx-spectrum",
    modeId: "zx48-standard-256x192",
    hardwareModeId: "zx48-standard-256x192",
    encoded,
    nativeWidth: ZX_SCREEN_WIDTH,
    nativeHeight: ZX_SCREEN_HEIGHT,
    attributeHeight: 8,
  };
}

function qlInput(mode: "mode8-256x256" | "mode4-512x256", encoded = new Uint8Array(QL_SCREEN_BYTES)): NativeResultFrameInput {
  return {
    platformId: "sinclair-ql",
    modeId: mode,
    hardwareModeId: mode,
    encoded,
    nativeWidth: mode === "mode8-256x256" ? 256 : 512,
    nativeHeight: QL_SCREEN_HEIGHT,
    attributeHeight: null,
  };
}

function pmdInput(
  hardwareModeId = "pmd85-3-rgb",
  encoded = encodePmd85Screen(new Uint8Array(PMD85_VISIBLE_BYTES), new Uint8Array(PMD85_VISIBLE_BYTES)),
  gapPolicy: "zero" | "preserve-imported" = "zero",
  importedGapBytes?: Uint8Array,
): NativeResultFrameInput {
  return {
    platformId: "pmd-85",
    modeId: hardwareModeId,
    hardwareModeId,
    encoded,
    nativeWidth: PMD85_SCREEN_WIDTH,
    nativeHeight: PMD85_SCREEN_HEIGHT,
    attributeHeight: hardwareModeId.includes("colorace") ? 2 : 1,
    pmd85ForegroundPalette: hardwareModeId.includes("colorace")
      ? PMD85_COLORACE_PURE_PALETTE
      : Array.from({ length: pmd85ForegroundCount(hardwareModeId.replace(/-vertical-spatial$/, "") as never) }, (_, index) => ({ r: index + 1, g: index + 2, b: index + 3 })),
    pmd85GapPolicy: gapPolicy,
    ...(importedGapBytes === undefined ? {} : { pmd85ImportedGapBytes: importedGapBytes }),
  };
}

describe("native result bitmap editor", () => {
  it("edits ZX bitmap bits without changing attributes and normalizes palette state", () => {
    const encoded = new Uint8Array(6912);
    encoded[ZX_BITMAP_BYTES] = 0x47;
    const input = zxInput(encoded);
    const bitmap = createNativeResultBitmap(input);
    const edited = applyNativeResultPixel(bitmap, input, 0, 0, "set", 7);
    expect(edited.encoded[zxBitmapOffset(0, 0)]).toBe(0x80);
    expect(edited.encoded[ZX_BITMAP_BYTES]).toBe(0x47);
    expect(edited.paletteIndices[0]).toBe(1);
    const reset = applyNativeResultPixel(edited, input, 0, 0, "toggle", 7);
    expect(reset.encoded[zxBitmapOffset(0, 0)]).toBe(0);
    expect(reset.encoded[ZX_BITMAP_BYTES]).toBe(0x47);
  });

  it("round-trips QL Mode 8 and Mode 4 native palette indices", () => {
    for (const mode of ["mode8-256x256", "mode4-512x256"] as const) {
      const input = qlInput(mode);
      const bitmap = createNativeResultBitmap(input);
      const edited = applyNativeResultPixel(bitmap, input, 0, 0, "set", mode === "mode8-256x256" ? 7 : 3);
      expect(edited.paletteIndices[0]).toBe(mode === "mode8-256x256" ? 7 : 3);
      const decodedAgain = createNativeResultBitmap({ ...input, encoded: edited.encoded });
      expect(decodedAgain.paletteIndices[0]).toBe(edited.paletteIndices[0]);
      expect(edited.encoded.length).toBe(QL_SCREEN_BYTES);
    }
  });

  it("supports vertical-spatial QL and PMD hardware frame identifiers", () => {
    const ql = createNativeResultBitmap({ ...qlInput("mode8-256x256"), hardwareModeId: "mode8-vertical-spatial-256x256" });
    expect(ql.width).toBe(256);
    const pmd = createNativeResultBitmap(pmdInput("pmd85-3-rgb-vertical-spatial"));
    expect(pmd.width).toBe(PMD85_SCREEN_WIDTH);
  });

  it("re-encodes PMD pixels and preserves imported gap bytes", () => {
    const gaps = new Uint8Array(PMD85_GAP_BYTES).fill(0xa5);
    const input = pmdInput(
      "pmd85-3-rgb",
      encodePmd85Screen(new Uint8Array(PMD85_VISIBLE_BYTES), new Uint8Array(PMD85_VISIBLE_BYTES), "preserve-imported", gaps),
      "preserve-imported",
      gaps,
    );
    const bitmap = createNativeResultBitmap(input);
    const edited = applyNativeResultPixel(bitmap, input, 0, 0, "set", 2);
    expect(edited.encoded[0]).toBe(0x41);
    expect(edited.encoded[48]).toBe(0xa5);
    expect(edited.encoded.length).toBe(PMD85_SCREEN_HEIGHT * 64);
  });

  it("uses native PMD ColorAce palette attributes", () => {
    const input = pmdInput("pmd85-colorace");
    const bitmap = createNativeResultBitmap(input);
    const edited = applyNativeResultPixel(bitmap, input, 0, 0, "set", 5);
    expect((edited.encoded[0]! & 0x3f)).toBe(1);
    expect(edited.encoded[0]! >> 6).toBe(1);
    expect(edited.encoded[64]! >> 6).toBe(0);
    expect(nativePaletteForResult(input)).toHaveLength(7);
  });

  it("uses RES to clear pixels through the native pixel brush", () => {
    const encoded = new Uint8Array(6912);
    encoded[zxBitmapOffset(0, 0)] = 0x80;
    const input = zxInput(encoded);
    const bitmap = createNativeResultBitmap(input);
    const cleared = applyNativeResultPixels(bitmap, input, [{ x: 0, y: 0 }], "and", 7);
    expect(cleared.encoded[zxBitmapOffset(0, 0)]).toBe(0);
  });
});
