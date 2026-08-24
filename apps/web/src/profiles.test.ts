import { describe, expect, it } from "vitest";
import { DEFAULT_CONVERSION_SETTINGS } from "@retro-converter/conversion-core";
import {
  BUILT_IN_PROFILE_ID,
  PMD85_BUILT_IN_PROFILES,
  QL_BUILT_IN_PROFILE,
  parseImportedProfile,
} from "./profiles.js";

function profile(overrides: Record<string, unknown> = {}) {
  return {
    schema_version: "5.0.0",
    id: "org.example.zx-profile",
    platform_id: "zx-spectrum",
    version: "1.0.0",
    name: "Example profile",
    palette: {
      modes: {
        "zx48-standard-256x192": {
          screen_count: 1,
          screens: [{ colors: [
            { id: 0, name: "Black", normal: "#000000", bright: "#000000" },
            { id: 1, name: "Blue", normal: "#0000cd", bright: "#0000ff" },
            { id: 2, name: "Red", normal: "#cd0000", bright: "#ff0000" },
            { id: 3, name: "Magenta", normal: "#cd00cd", bright: "#ff00ff" },
            { id: 4, name: "Green", normal: "#00cd00", bright: "#00ff00" },
            { id: 5, name: "Cyan", normal: "#00cdcd", bright: "#00ffff" },
            { id: 6, name: "Yellow", normal: "#cdcd00", bright: "#ffff00" },
            { id: 7, name: "White", normal: "#cdcdcd", bright: "#ffffff" },
          ] }],
        },
      },
    },
    preview: {
      normal_channel: 205,
      bright_channel: 255,
      border_color: 0,
      pixel_aspect_ratio: 1,
      display_aspect_ratio: { width: 4, height: 3 },
    },
    presets: [{ id: "default", name: "Default", settings: DEFAULT_CONVERSION_SETTINGS }],
    ...overrides,
  };
}

async function parse(value: unknown) {
  return parseImportedProfile(new TextEncoder().encode(JSON.stringify(value)));
}

describe("declarative profiles", () => {
  it("registers one PMD 85 machine profile with native and spatial targets", () => {
    expect(PMD85_BUILT_IN_PROFILES).toHaveLength(1);
    const candidate = PMD85_BUILT_IN_PROFILES[0]!;
    expect(candidate.name).toBe("PMD 85");
    expect(Object.keys(candidate.palette.modes)).toEqual([
      "pmd85-2-tv",
      "pmd85-2-rgb",
      "pmd85-3-pal",
      "pmd85-3-rgb",
      "pmd85-colorace",
      "pmd85-2-rgb-vertical-spatial",
      "pmd85-3-rgb-vertical-spatial",
      "pmd85-3-pal-vertical-spatial",
    ]);
    expect(candidate.schema_version).toBe("7.0.0");
    expect(candidate.platform_id).toBe("pmd-85");
    expect(candidate.presets.map((preset) => preset.id)).toEqual([
      "default",
      "vertical-spatial-v1",
      "clean-exact",
      "ordered-balanced",
      "soft-diffusion",
    ]);
    for (const preset of candidate.presets) {
      const settings = preset.settings;
      expect(settings.attributeOptimizerId).toBe(
        preset.id === "vertical-spatial-v1"
          ? "pmd85-vertical-spatial-uniform-v1"
          : "pmd85-cell-v1",
      );
      expect(settings.pmd85).not.toHaveProperty("blinkPhase");
      expect(settings.pmd85).not.toHaveProperty("animation");
    }
    const defaultPreset = candidate.presets.find((preset) => preset.id === "default")!;
    expect(defaultPreset.settings.dithering).toBe("none");
    expect(defaultPreset.settings.ditheringAmount).toBe(0);
    expect(defaultPreset.settings.pmd85.crtAspect)
      .toBe("approximate-4:3");
    const colorAce = candidate.palette.modes["pmd85-colorace"]!;
    expect(colorAce.base_calibration_id).toBe("pure-rgb");
    expect(colorAce.calibrations?.map((calibration) => calibration.id)).toEqual(["emulator-soft"]);
  });

  it("accepts schema-5 profiles without the new PMD settings through the compatibility adapter", async () => {
    const { pmd85: _legacyMissing, ...legacySettings } = DEFAULT_CONVERSION_SETTINGS;
    const result = await parse(profile({
      presets: [{ id: "default", name: "Default", settings: legacySettings }],
    }));
    expect(result.presets[0]?.settings.pmd85).toEqual(DEFAULT_CONVERSION_SETTINGS.pmd85);
  });
  it("describes the heterogeneous QL Low/High palettes per screen", () => {
    const mode = QL_BUILT_IN_PROFILE.palette.modes[
      "mode8-mode4-mixed-512x256"
    ];
    expect(mode?.screen_count).toBe(2);
    expect(mode?.screens[0]?.colors).toHaveLength(8);
    expect(mode?.screens[1]?.colors).toHaveLength(4);
    expect(mode?.screens[1]?.colors.map((color) => color.name)).toEqual([
      "Black",
      "Red",
      "Green",
      "White",
    ]);
  });

  it("validates and hashes complete declarative presets", async () => {
    const result = await parse(profile());
    expect(result.id).toBe("org.example.zx-profile");
    expect(result.content_sha256).toHaveLength(64);
    expect(result.presets[0]?.settings).toEqual(DEFAULT_CONVERSION_SETTINGS);
  });

  it("requires bounded smoothing and sharpening settings", async () => {
    const invalid = profile({
      presets: [{
        id: "default",
        name: "Default",
        settings: { ...DEFAULT_CONVERSION_SETTINGS, smoothing: 101 },
      }],
    });
    await expect(parse(invalid)).rejects.toThrow("PROFILE_SCHEMA_INVALID");
  });

  it("requires bounded attribute smoothing", async () => {
    const invalid = profile({
      presets: [{
        id: "default",
        name: "Default",
        settings: { ...DEFAULT_CONVERSION_SETTINGS, attributeSmoothing: -1 },
      }],
    });
    await expect(parse(invalid)).rejects.toThrow("PROFILE_SCHEMA_INVALID");
  });

  it("requires attribute halo radii from zero through two pixels", async () => {
    const invalid = profile({
      presets: [{
        id: "default",
        name: "Default",
        settings: { ...DEFAULT_CONVERSION_SETTINGS, attributeHaloHorizontal: 3 },
      }],
    });
    await expect(parse(invalid)).rejects.toThrow("PROFILE_SCHEMA_INVALID");
  });

  it("requires bounded Error-diffusion randomization", async () => {
    const invalid = profile({
      presets: [{
        id: "default",
        name: "Default",
        settings: {
          ...DEFAULT_CONVERSION_SETTINGS,
          errorDiffusionRandomization: 101,
        },
      }],
    });
    await expect(parse(invalid)).rejects.toThrow("PROFILE_SCHEMA_INVALID");
  });

  it("requires bounded Error-diffusion line suppression", async () => {
    const invalid = profile({
      presets: [{
        id: "default",
        name: "Default",
        settings: {
          ...DEFAULT_CONVERSION_SETTINGS,
          errorDiffusionLineSuppression: -1,
        },
      }],
    });
    await expect(parse(invalid)).rejects.toThrow("PROFILE_SCHEMA_INVALID");
  });

  it("requires palette selections to match the profile mode descriptor", async () => {
    const invalid = profile({
      presets: [{
        id: "default",
        name: "Default",
        settings: {
          ...DEFAULT_CONVERSION_SETTINGS,
          paletteSelections: [
            ...DEFAULT_CONVERSION_SETTINGS.paletteSelections,
            {
              screenIndex: 1,
              enabledColorIds: [0, 7],
              brightMode: "auto",
            },
          ],
        },
      }],
    });
    await expect(parse(invalid)).rejects.toThrow("PROFILE_SCHEMA_INVALID");
  });

  it("protects the built-in profile from shadowing", async () => {
    await expect(parse(profile({ id: BUILT_IN_PROFILE_ID }))).rejects.toThrow("PROFILE_BUILTIN_SHADOW");
  });

  it("rejects executable or external-reference fields", async () => {
    await expect(parse(profile({ script: "alert(1)" }))).rejects.toThrow("PROFILE_EXTERNAL_REFERENCE");
    await expect(parse(profile({ homepage: "https://example.com" }))).rejects.toThrow("PROFILE_EXTERNAL_REFERENCE");
  });
});
