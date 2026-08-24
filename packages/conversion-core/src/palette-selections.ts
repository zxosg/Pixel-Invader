import type {
  BrightMode,
  ConversionSettings,
  PaletteSelection,
  TargetModeId,
} from "./types.js";

export function outputScreenCount(modeId: TargetModeId): 1 | 2 {
  return modeId === "zx48-mixed-256x192" ||
      modeId === "mode8-256x256" ||
      modeId === "mode4-512x256" ||
      modeId === "mode8-mode4-mixed-512x256"
    ? 2
    : 1;
}

export function targetUsesVerticalSpatialMix(modeId: TargetModeId): boolean {
  return modeId.includes("vertical-spatial");
}

export function paletteSelection(
  settings: ConversionSettings,
  screenIndex: number,
): PaletteSelection {
  const selection = settings.paletteSelections[screenIndex];
  if (selection === undefined || selection.screenIndex !== screenIndex) {
    throw new RangeError(`Palette selection for Screen ${screenIndex + 1} is missing.`);
  }
  return selection;
}

export function zxBrightMode(
  settings: ConversionSettings,
  screenIndex = 0,
): BrightMode {
  const mode = paletteSelection(settings, screenIndex).brightMode;
  if (mode === undefined) {
    throw new RangeError(`ZX Screen ${screenIndex + 1} BRIGHT mode is missing.`);
  }
  return mode;
}

export function paletteSelectionsMatch(
  left: PaletteSelection,
  right: PaletteSelection,
): boolean {
  return left.brightMode === right.brightMode &&
    left.enabledColorIds.length === right.enabledColorIds.length &&
    left.enabledColorIds.every((color) => right.enabledColorIds.includes(color));
}
