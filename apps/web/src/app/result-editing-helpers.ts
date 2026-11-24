import { type NativeResultBitmap } from "../result-bitmap-editor.js";
import { type WorkerConversionResult, type WorkerPmd85Import } from "../worker/client.js";
import { type ConversionSettings } from "@retro-converter/conversion-core";
import { PMD85_SCREEN_HEIGHT, PMD85_SCREEN_WIDTH } from "@retro-converter/pmd-85";

export function expandResultPreviewForFrame(
  bitmap: NativeResultBitmap,
  frame: WorkerConversionResult["frames"][number],
): Uint8Array {
  if (bitmap.rgba.length === frame.previewRgba.length) return bitmap.rgba.slice();
  if (bitmap.platformId === "sinclair-ql" && bitmap.width * 2 === frame.nativeWidth * 2 &&
      frame.previewRgba.length === bitmap.rgba.length * 2) {
    const expanded = new Uint8Array(frame.previewRgba.length);
    for (let y = 0; y < bitmap.height; y += 1) {
      for (let x = 0; x < bitmap.width; x += 1) {
        const source = (y * bitmap.width + x) * 4;
        const target = (y * bitmap.width * 2 + x * 2) * 4;
        expanded.set(bitmap.rgba.subarray(source, source + 4), target);
        expanded.set(bitmap.rgba.subarray(source, source + 4), target + 4);
      }
    }
    return expanded;
  }
  return bitmap.rgba.slice();
}

export function directPmd85Result(
  imported: WorkerPmd85Import,
  settings: ConversionSettings,
): WorkerConversionResult {
  const artifact = Uint8Array.from(imported.originalBytes);
  const rgba = Uint8Array.from(imported.image.rgba);
  return {
    artifact,
    scr: Uint8Array.from(artifact),
    platformId: "pmd-85",
    modeId: imported.mode,
    width: PMD85_SCREEN_WIDTH,
    height: PMD85_SCREEN_HEIGHT,
    pixelAspectRatio: imported.pixelAspectRatio,
    attributeOptimizerId: "pmd85-cell-v1",
    ditherEngineId: settings.ditherEngineId,
    paletteSelections: settings.paletteSelections,
    frames: [{
      hardwareModeId: imported.mode,
      nativeWidth: PMD85_SCREEN_WIDTH,
      nativeHeight: PMD85_SCREEN_HEIGHT,
      nativePixelAspectRatio: imported.pixelAspectRatio,
      encoded: Uint8Array.from(artifact),
      paletteIndices: imported.paletteIndices,
      previewRgba: rgba,
    }],
    sourcePreviewRgba: Uint8Array.from(rgba),
    preConstraintPreviewRgba: Uint8Array.from(rgba),
    mergedPreviewRgba: Uint8Array.from(rgba),
    previewRgba: Uint8Array.from(rgba),
    score: 0,
    attributeHeight: imported.attributeHeight,
  };
}
