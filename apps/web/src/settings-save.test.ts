import { describe, expect, it } from "vitest";
import { DEFAULT_CONVERSION_SETTINGS } from "@retro-converter/conversion-core";
import { BUILT_IN_PROFILE, BUILT_IN_PROFILES, PMD85_PROFILE_ID, QL_PROFILE_ID } from "./profiles.js";
import { canonicalizeSettingsForSave } from "./settings-save.js";

describe("canonical Settings Save", () => {
  it("persists the ZX mixed attribute-only setting", () => {
    const result = canonicalizeSettingsForSave({
      current: { ...DEFAULT_CONVERSION_SETTINGS, modeId: "zx48-mixed-256x192" },
      profiles: BUILT_IN_PROFILES,
      draft: {
        profileId: BUILT_IN_PROFILE.id,
        presetId: BUILT_IN_PROFILE.presets[0]!.id,
        modeId: "zx48-mixed-256x192",
        zxMixedAttributesOnly: true,
      },
    });
    expect(result.conversion.zxMixedAttributesOnly).toBe(true);
  });

  it("keeps export border and zoom preferences out of conversion settings", () => {
    const draft = {
      profileId: BUILT_IN_PROFILE.id,
      presetId: BUILT_IN_PROFILE.presets[0]!.id,
      modeId: DEFAULT_CONVERSION_SETTINGS.modeId,
      framing: DEFAULT_CONVERSION_SETTINGS.framing,
      dithering: DEFAULT_CONVERSION_SETTINGS.dithering,
      ditheringAmount: DEFAULT_CONVERSION_SETTINGS.ditheringAmount,
    };
    const baseline = canonicalizeSettingsForSave({ current: DEFAULT_CONVERSION_SETTINGS, profiles: BUILT_IN_PROFILES, draft });
    const exportOnly = canonicalizeSettingsForSave({
      current: DEFAULT_CONVERSION_SETTINGS,
      profiles: BUILT_IN_PROFILES,
      draft: {
        ...draft,
        exportBorderEnabled: false,
        exportBorderWidth: 0,
        exportBorderColor: { r: 12, g: 34, b: 56 },
        exportZoomFactor: 4,
      },
    });
    expect(exportOnly.conversion).toEqual(baseline.conversion);
    expect(exportOnly.application).toMatchObject({
      exportBorderEnabled: false,
      exportBorderWidth: 0,
      exportBorderColor: { r: 12, g: 34, b: 56 },
      exportZoomFactor: 4,
    });
  });

  it("preserves the experimental joint Mixed engine pair", () => {
    const paletteSelections = [
      { screenIndex: 0, enabledColorIds: [0, 2, 7], brightMode: "off" as const },
      { screenIndex: 1, enabledColorIds: [1, 4, 6], brightMode: "on" as const },
    ];
    const current = {
      ...DEFAULT_CONVERSION_SETTINGS,
      modeId: "zx48-mixed-256x192" as const,
      paletteSelections,
    };
    const result = canonicalizeSettingsForSave({
      current,
      profiles: BUILT_IN_PROFILES,
      draft: {
        profileId: BUILT_IN_PROFILE.id,
        presetId: BUILT_IN_PROFILE.presets[0]!.id,
        modeId: "zx48-mixed-256x192",
        attributeOptimizerId: "zx-mixed-joint-cell-v1",
        ditherEngineId: "zx-mixed-dual-fs-v1",
        framing: "fill",
        dithering: "error-diffusion",
        ditheringAmount: 65,
        paletteSelections,
      },
    });
    expect(result.conversion.attributeOptimizerId)
      .toBe("zx-mixed-joint-cell-v1");
    expect(result.conversion.ditherEngineId).toBe("zx-mixed-dual-fs-v1");
  });

  it("preserves the experimental BRIGHT-locked ordered v9 selection", () => {
    const result = canonicalizeSettingsForSave({
      current: DEFAULT_CONVERSION_SETTINGS,
      profiles: BUILT_IN_PROFILES,
      draft: {
        profileId: BUILT_IN_PROFILE.id,
        presetId: BUILT_IN_PROFILE.presets[0]!.id,
        modeId: "zx48-standard-256x192",
        attributeOptimizerId: "zx-guide-reference-halo-v1",
        ditherEngineId: "ordered-bright-locked-cell-v9",
        framing: "fill",
        dithering: "ordered",
        ditheringAmount: 50,
        orderedMatrix: "bayer-4x4",
        paletteSelections: [{
          screenIndex: 0,
          enabledColorIds: [0, 7],
          brightMode: "auto",
        }],
      },
    });
    expect(result.conversion.attributeOptimizerId)
      .toBe("zx-guide-reference-halo-v1");
    expect(result.conversion.ditherEngineId)
      .toBe("ordered-bright-locked-cell-v9");
  });

  it("preserves the experimental coverage cell-scored BRIGHT v10 selection", () => {
    const result = canonicalizeSettingsForSave({
      current: DEFAULT_CONVERSION_SETTINGS,
      profiles: BUILT_IN_PROFILES,
      draft: {
        profileId: BUILT_IN_PROFILE.id,
        presetId: BUILT_IN_PROFILE.presets[0]!.id,
        modeId: "zx48-standard-256x192",
        attributeOptimizerId: "zx-guide-reference-halo-v1",
        ditherEngineId: "ordered-coverage-bright-scored-v10",
        framing: "fill",
        dithering: "ordered",
        ditheringAmount: 50,
        orderedMatrix: "bayer-4x4",
        paletteSelections: [{
          screenIndex: 0,
          enabledColorIds: [0, 7],
          brightMode: "auto",
        }],
      },
    });
    expect(result.conversion.attributeOptimizerId)
      .toBe("zx-guide-reference-halo-v1");
    expect(result.conversion.ditherEngineId)
      .toBe("ordered-coverage-bright-scored-v10");
  });

  it("preserves edge-aware Mixed v2 and boundary-aware dual-FS selections", () => {
    const paletteSelections = [
      { screenIndex: 0, enabledColorIds: [0, 7], brightMode: "auto" as const },
      { screenIndex: 1, enabledColorIds: [0, 7], brightMode: "auto" as const },
    ];
    const result = canonicalizeSettingsForSave({
      current: {
        ...DEFAULT_CONVERSION_SETTINGS,
        modeId: "zx48-mixed-256x192",
        paletteSelections,
      },
      profiles: BUILT_IN_PROFILES,
      draft: {
        profileId: BUILT_IN_PROFILE.id,
        presetId: BUILT_IN_PROFILE.presets[0]!.id,
        modeId: "zx48-mixed-256x192",
        attributeOptimizerId: "zx-mixed-joint-cell-v2",
        ditherEngineId: "zx-mixed-dual-fs-boundary-v1",
        framing: "fill",
        dithering: "error-diffusion",
        ditheringAmount: 65,
        paletteSelections,
      },
    });
    expect(result.conversion.attributeOptimizerId).toBe("zx-mixed-joint-cell-v2");
    expect(result.conversion.ditherEngineId).toBe("zx-mixed-dual-fs-boundary-v1");
  });

  it("preserves the quantization-aware Mixed optimizer with an independent dither engine", () => {
    const paletteSelections = [
      { screenIndex: 0, enabledColorIds: [0, 7], brightMode: "auto" as const },
      { screenIndex: 1, enabledColorIds: [0, 7], brightMode: "auto" as const },
    ];
    const result = canonicalizeSettingsForSave({
      current: {
        ...DEFAULT_CONVERSION_SETTINGS,
        modeId: "zx48-mixed-256x192",
        paletteSelections,
      },
      profiles: BUILT_IN_PROFILES,
      draft: {
        profileId: BUILT_IN_PROFILE.id,
        presetId: BUILT_IN_PROFILE.presets[0]!.id,
        modeId: "zx48-mixed-256x192",
        attributeOptimizerId: "zx-mixed-joint-quantized-v1",
        ditherEngineId: "none-discrete-v2",
        framing: "fill",
        dithering: "none",
        ditheringAmount: 55,
        paletteSelections,
      },
    });
    expect(result.conversion.attributeOptimizerId).toBe("zx-mixed-joint-quantized-v1");
    expect(result.conversion.ditherEngineId).toBe("none-discrete-v2");
  });

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
