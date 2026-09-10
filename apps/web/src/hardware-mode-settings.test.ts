import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONVERSION_SETTINGS,
  type ConversionSettings,
  type TargetModeId,
} from "@retro-converter/conversion-core";
import { retargetHardwareModeSettings } from "./hardware-mode-settings.js";

const personalized: ConversionSettings = {
  ...DEFAULT_CONVERSION_SETTINGS,
  framing: "crop",
  resampling: "nearest",
  rotation: 270,
  mirrorHorizontal: true,
  mirrorVertical: true,
  fillOffsetX: 19,
  fillOffsetY: 23,
  crop: { x: 31, y: 37, width: 401, height: 211 },
  cropAspectRatio: "source",
  brightness: 17,
  contrast: -22,
  saturation: 63,
  gamma: 141,
  smoothing: 4,
  sharpening: 7,
  dithering: "ordered",
  ditheringAmount: 63,
  verticalSpatialMix: {
    schemaVersion: 1,
    algorithmId: "vertical-spatial-uniform-v1",
    calibrationId: "srgb-ideal-v1",
    swapRows: true,
  },
};

const retainedKeys = [
  "framing",
  "resampling",
  "rotation",
  "mirrorHorizontal",
  "mirrorVertical",
  "fillOffsetX",
  "fillOffsetY",
  "crop",
  "cropAspectRatio",
  "brightness",
  "contrast",
  "saturation",
  "gamma",
  "smoothing",
  "sharpening",
] as const;

describe("hardware mode retargeting", () => {
  it.each<readonly [string, TargetModeId]>([
    ["ZX Spectrum", "zx48-mixed-256x192"],
    ["Sinclair QL", "mode4-plain-512x256"],
    ["PMD 85", "pmd85-colorace"],
  ])("retains geometry and image adjustments for %s", (_platform, modeId) => {
    const result = retargetHardwareModeSettings(personalized, { modeId });

    expect(result.modeId).toBe(modeId);
    for (const key of retainedKeys) {
      expect(result[key]).toEqual(personalized[key]);
    }
  });

  it("changes PMD hardware constraints without replacing the visual recipe", () => {
    const result = retargetHardwareModeSettings(personalized, {
      profileId: "org.retro-converter.pmd-85",
      platformId: "pmd-85",
      modeId: "pmd85-colorace",
      attributeOptimizerId: "pmd85-cell-v1",
      attributeHeight: 2,
      screenFlickerSuppression: false,
      paletteSelections: [{ screenIndex: 0, enabledColorIds: [1, 3] }],
      pmd85: { mode: "pmd85-colorace", paletteCalibrationId: "pure-rgb" },
    });

    expect(result.attributeHeight).toBe(2);
    expect(result.paletteSelections[0]?.enabledColorIds).toEqual([1, 3]);
    expect(result.pmd85).toEqual({
      ...personalized.pmd85,
      mode: "pmd85-colorace",
      paletteCalibrationId: "pure-rgb",
    });
    expect(result.brightness).toBe(personalized.brightness);
    expect(result.crop).toEqual(personalized.crop);
    expect(result.dithering).toBe(personalized.dithering);
    expect(result.ditheringAmount).toBe(personalized.ditheringAmount);
    expect(result.verticalSpatialMix).toEqual(personalized.verticalSpatialMix);
  });
});
