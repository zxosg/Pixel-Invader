import {
  frameRgbaToDimensions,
  type ConversionSettings,
  type PlatformId,
  type TargetModeId,
} from "@retro-converter/conversion-core";

type SourcePreviewSettings = Pick<
  ConversionSettings,
  "framing" | "background" | "resampling" | "rotation" |
  "mirrorHorizontal" | "mirrorVertical" | "fillOffsetX" | "fillOffsetY" |
  "crop"
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
  pmdCrtAspect: ConversionSettings["pmd85"]["crtAspect"],
  settings: SourcePreviewSettings,
): FramedSourcePreview {
  const isPmd = platformId === "pmd-85";
  const isQl = platformId === "sinclair-ql";
  const qlUsesMode4Width = modeId === "mode4-512x256" ||
    modeId === "mode4-plain-512x256" ||
    modeId === "mode4-vertical-spatial-512x256" ||
    modeId === "mode8-mode4-mixed-512x256";
  const width = isPmd ? 288 : isQl && qlUsesMode4Width ? 512 : 256;
  const height = isPmd || isQl ? 256 : 192;
  const pixelAspect = isPmd
    ? pmdCrtAspect === "approximate-4:3"
      ? { width: 32, height: 27 }
      : { width: 1, height: 1 }
    : isQl
      ? qlUsesMode4Width
        ? { width: 2, height: 3 }
        : { width: 4, height: 3 }
      : { width: 1, height: 1 };
  return {
    rgba: frameRgbaToDimensions(
      source,
      sourceWidth,
      sourceHeight,
      width,
      height,
      settings,
      pixelAspect,
    ),
    width,
    height,
  };
}
