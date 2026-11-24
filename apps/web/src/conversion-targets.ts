import { zxBitmapOffset } from "@retro-converter/zx-spectrum";
import { type Pmd85ModeId } from "@retro-converter/pmd-85";
import { type ConversionSettings, type DitheringMethod, type DitherEngineId, type Pmd85TargetModeId, type TargetModeId } from "@retro-converter/conversion-core";

export function pmdHardwareModeForTarget(mode: Pmd85TargetModeId): Pmd85ModeId {
  if (mode === "pmd85-2-rgb-vertical-spatial") return "pmd85-2-rgb";
  if (mode === "pmd85-3-rgb-vertical-spatial") return "pmd85-3-rgb";
  if (mode === "pmd85-3-pal-vertical-spatial") return "pmd85-3-pal";
  return mode;
}

export function targetProducesMultipleFrames(
  platformId: ConversionSettings["platformId"],
  modeId: TargetModeId,
): boolean {
  return modeId.includes("vertical-spatial") ||
    modeId === "zx48-mixed-256x192" ||
    (platformId === "sinclair-ql" && (
      modeId === "mode8-256x256" ||
      modeId === "mode4-512x256" ||
      modeId === "mode8-mode4-mixed-512x256"
    ));
}

export function verticalSpatialDitherEngine(method: DitheringMethod): DitherEngineId {
  return method === "ordered"
    ? "vertical-spatial-ordered-v1"
    : method === "error-diffusion"
      ? "vertical-spatial-error-diffusion-v1"
      : "vertical-spatial-none-v1";
}

export function unpackZxBitmap(encoded: Uint8Array): Uint8Array {
  const pixels = new Uint8Array(256 * 192);
  for (let y = 0; y < 192; y += 1) {
    for (let xByte = 0; xByte < 32; xByte += 1) {
      const packed = encoded[zxBitmapOffset(xByte, y)] ?? 0;
      for (let bit = 0; bit < 8; bit += 1) {
        pixels[y * 256 + xByte * 8 + bit] = (packed & (0x80 >> bit)) === 0 ? 0 : 1;
      }
    }
  }
  return pixels;
}
