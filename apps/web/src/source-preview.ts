import {
  destinationGeometryFor,
  frameRgbaToDimensions,
  type ConversionSettings,
  type PlatformId,
  type TargetModeId,
} from "@retro-converter/conversion-core";

type SourcePreviewSettings = Pick<
  ConversionSettings,
  "framing" | "background" | "resampling" | "rotation" |
  "mirrorHorizontal" | "mirrorVertical" | "fillOffsetX" | "fillOffsetY" |
  "panOffsetX" | "panOffsetY" | "panEdgeMode" | "crop"
>;

export interface FramedSourcePreview {
  readonly rgba: Uint8Array;
  readonly width: number;
  readonly height: number;
}

export function frameFallbackSourcePreview(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  platformId: PlatformId,
  modeId: TargetModeId,
  settings: SourcePreviewSettings,
): FramedSourcePreview {
  const destination = destinationGeometryFor(platformId, modeId);
  return {
    rgba: frameRgbaToDimensions(
      source,
      sourceWidth,
      sourceHeight,
      destination.width,
      destination.height,
      settings,
      destination.pixelAspect,
    ),
    width: destination.width,
    height: destination.height,
  };
}
