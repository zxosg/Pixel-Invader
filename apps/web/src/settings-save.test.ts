import { describe, expect, it } from "vitest";
import { DEFAULT_CONVERSION_SETTINGS } from "@retro-converter/conversion-core";
import { BUILT_IN_PROFILES, PMD85_PROFILE_ID, QL_PROFILE_ID } from "./profiles.js";
import { canonicalizeSettingsForSave } from "./settings-save.js";

describe("canonical Settings Save", () => {
  it("retargets a one-screen ZX draft to QL without stale palette metadata", () => {
    const result = canonicalizeSettingsForSave({
      current: DEFAULT_CONVERSION_SETTINGS,
      profiles: BUILT_IN_PROFILES,
      draft: {
        profileId: QL_PROFILE_ID,
        presetId: "default",
        modeId: "mode8-256x256",
        framing: "fill",
        dithering: "none",
        ditheringAmount: 0,
        paletteSelections: [{ screenIndex: 0, enabledColorIds: [0, 7], brightMode: "on" }],
      },
    });

    expect(result.profile.id).toBe(QL_PROFILE_ID);
    expect(result.conversion.platformId).toBe("sinclair-ql");
    expect(result.conversion.paletteSelections).toHaveLength(2);
    expect(result.conversion.paletteSelections.every((selection) => selection.brightMode === undefined)).toBe(true);
    expect(result.conversion.paletteSelections.every((selection) => selection.enabledColorIds.length > 0)).toBe(true);
  });

  it("retargets a two-screen ZX draft to PMD with valid hardware fields", () => {
    const result = canonicalizeSettingsForSave({
      current: { ...DEFAULT_CONVERSION_SETTINGS, modeId: "zx48-mixed-256x192", paletteSelections: [
        { screenIndex: 0, enabledColorIds: [0, 7], brightMode: "auto" },
        { screenIndex: 1, enabledColorIds: [0, 7], brightMode: "auto" },
      ] },
      profiles: BUILT_IN_PROFILES,
      draft: {
        profileId: PMD85_PROFILE_ID,
        presetId: "default",
        modeId: "pmd85-3-rgb",
        framing: "fill",
        dithering: "none",
        ditheringAmount: 0,
        paletteSelections: [
          { screenIndex: 0, enabledColorIds: [0, 7], brightMode: "on" },
          { screenIndex: 1, enabledColorIds: [1, 2], brightMode: "off" },
        ],
        attributeHeight: 8,
        pmd85PaletteCalibrationId: "invalid-for-this-mode",
      },
    });

    expect(result.profile.id).toBe(PMD85_PROFILE_ID);
    expect(result.conversion.paletteSelections).toHaveLength(1);
    expect(result.conversion.paletteSelections[0]?.brightMode).toBeUndefined();
    expect(result.conversion.attributeHeight).toBe(1);
    expect(result.conversion.pmd85.paletteCalibrationId).toBe("emulator-soft");
  });
});
