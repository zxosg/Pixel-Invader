import type { VerticalSpatialDiagnostics } from "@retro-converter/conversion-core";

export type OutputPreviewStage = "screen-1" | "screen-2" | "merged";

export function defaultOutputPreviewStage(
  modeId: string,
  producesMultipleFrames: boolean,
): OutputPreviewStage {
  if (modeId.includes("vertical-spatial")) return "screen-1";
  return producesMultipleFrames ? "merged" : "screen-1";
}

export function verticalSpatialPreviewForStage(
  stage: OutputPreviewStage,
  physicalRgba: Uint8Array,
  physicalWidth: number,
  physicalHeight: number,
  analytic: VerticalSpatialDiagnostics,
): { readonly rgba: Uint8Array; readonly width: number; readonly height: number } {
  if (stage === "screen-1") {
    return {
      rgba: physicalRgba,
      width: physicalWidth,
      height: physicalHeight,
    };
  }
  return {
    rgba: analytic.analyticPreviewRgba,
    width: analytic.logicalWidth,
    height: analytic.logicalHeight,
  };
}
