import { type Pmd85RgbColor } from "@retro-converter/pmd-85";
import { hexToRgb } from "./dithering-labels.js";
import { profileModeScreens, type ConversionProfile } from "./profiles.js";

/**
 * Native PMD 85 foreground palette for a result's own mode. The displayed result can outlive a
 * target-profile change, so the palette must follow the result rather than the current selection.
 */
export function pmd85PaletteForResult(
  profiles: readonly ConversionProfile[],
  selectedProfile: ConversionProfile,
  resultModeId: string,
  calibrationId: string,
): readonly Pmd85RgbColor[] {
  const candidates = [selectedProfile, ...profiles].filter(
    (profile) => profile.platform_id === "pmd-85" && profile.palette.modes[resultModeId] !== undefined,
  );
  for (const profile of candidates) {
    for (const calibration of [calibrationId, undefined]) {
      try {
        const colors = profileModeScreens(profile, resultModeId, calibration)[0]?.colors;
        if (colors !== undefined) return colors.map((color) => hexToRgb(color.normal));
      } catch {
        // try the base calibration, then the next profile
      }
    }
  }
  return [];
}
