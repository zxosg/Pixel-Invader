import {
  DEFAULT_CONVERSION_SETTINGS,
  isCompatibleEnginePair,
  type ConversionSettings,
} from "@retro-converter/conversion-core";
import { sha256Hex } from "./artifacts.js";

export const BUILT_IN_PROFILE_ID = "org.retroconverter.zx48.default";
export const QL_PROFILE_ID = "org.retroconverter.sinclair-ql.default";
export const PMD85_PROFILE_ID = "org.retroconverter.tesla.pmd85.default";
export const PMD85_DEFAULT_PROFILE_ID = PMD85_PROFILE_ID;
export const PROFILE_STORAGE_KEY = "retro-converter.profiles.v4";
const MAX_PROFILE_BYTES = 256 * 1024;

export interface ConversionPreset {
  readonly id: string;
  readonly name: string;
  readonly settings: ConversionSettings;
}

export interface ConversionProfile {
  readonly schema_version: "5.0.0" | "6.0.0" | "7.0.0";
  readonly id: string;
  readonly platform_id: "zx-spectrum" | "sinclair-ql" | "pmd-85";
  readonly version: string;
  readonly name: string;
  readonly content_sha256: string;
  readonly palette: {
    readonly modes: Readonly<Record<string, {
      readonly screen_count: 1 | 2;
      readonly screens: readonly {
        readonly colors: readonly {
          readonly id: number;
          readonly name: string;
          readonly normal: string;
          readonly bright?: string;
        }[];
      }[];
      readonly base_calibration_id?: string;
      readonly calibrations?: readonly {
        readonly id: string;
        readonly name: string;
        readonly screens: readonly {
          readonly colors: readonly {
            readonly id: number;
            readonly name: string;
            readonly normal: string;
            readonly bright?: string;
          }[];
        }[];
      }[];
    }>>;
  };
  readonly preview: {
    readonly normal_channel: number;
    readonly bright_channel: number;
    readonly border_color: number;
    readonly pixel_aspect_ratio: number;
    readonly display_aspect_ratio: {
      readonly width: number;
      readonly height: number;
    };
  };
  readonly presets: readonly ConversionPreset[];
}

const defaultSettings: ConversionSettings = {
  ...DEFAULT_CONVERSION_SETTINGS,
  attributeOptimizerId: "zx-guide-reference-halo-v1",
  attributeSmoothing: 100,
  attributeHaloHorizontal: 2,
  attributeHaloVertical: 0,
};

const ZX_COLORS = [
  { id: 0, name: "Black", normal: "#000000", bright: "#000000" },
  { id: 1, name: "Blue", normal: "#0000cd", bright: "#0000ff" },
  { id: 2, name: "Red", normal: "#cd0000", bright: "#ff0000" },
  { id: 3, name: "Magenta", normal: "#cd00cd", bright: "#ff00ff" },
  { id: 4, name: "Green", normal: "#00cd00", bright: "#00ff00" },
  { id: 5, name: "Cyan", normal: "#00cdcd", bright: "#00ffff" },
  { id: 6, name: "Yellow", normal: "#cdcd00", bright: "#ffff00" },
  { id: 7, name: "White", normal: "#cdcdcd", bright: "#ffffff" },
] as const;

const QL_MODE8_COLORS = [
  { id: 0, name: "Black", normal: "#000000" },
  { id: 1, name: "Blue", normal: "#0000ff" },
  { id: 2, name: "Red", normal: "#ff0000" },
  { id: 3, name: "Magenta", normal: "#ff00ff" },
  { id: 4, name: "Green", normal: "#00ff00" },
  { id: 5, name: "Cyan", normal: "#00ffff" },
  { id: 6, name: "Yellow", normal: "#ffff00" },
  { id: 7, name: "White", normal: "#ffffff" },
] as const;

const QL_MODE4_COLORS = [
  { id: 0, name: "Black", normal: "#000000" },
  { id: 1, name: "Red", normal: "#ff0000" },
  { id: 2, name: "Green", normal: "#00ff00" },
  { id: 3, name: "White", normal: "#ffffff" },
] as const;

const PMD85_COLORS = {
  "pmd85-2-tv": [
    { id: 0, name: "Bright", normal: "#ffffff" },
    { id: 1, name: "Dim", normal: "#bfbfbf" },
  ],
  "pmd85-2-rgb": [
    { id: 0, name: "Green", normal: "#50ff50" },
    { id: 1, name: "Yellow", normal: "#ffff50" },
    { id: 2, name: "Cyan", normal: "#50ffff" },
    { id: 3, name: "White", normal: "#ffffff" },
  ],
  "pmd85-3-tv": [
    { id: 0, name: "White", normal: "#ffffff" },
    { id: 1, name: "Light gray", normal: "#b8b8b8" },
    { id: 2, name: "Gray", normal: "#777777" },
    { id: 3, name: "Dark gray", normal: "#444444" },
  ],
  "pmd85-3-pal": [
    { id: 0, name: "White", normal: "#ffffff" },
    { id: 1, name: "Green", normal: "#50ff50" },
    { id: 2, name: "Red", normal: "#ff5050" },
    { id: 3, name: "Brown", normal: "#a00000" },
  ],
  "pmd85-3-rgb": [
    { id: 0, name: "Green", normal: "#50ff50" },
    { id: 1, name: "Red", normal: "#ff5050" },
    { id: 2, name: "Blue", normal: "#5050ff" },
    { id: 3, name: "Magenta", normal: "#ff50ff" },
  ],
  "pmd85-colorace": [
    { id: 0, name: "Green", normal: "#00ff00" },
    { id: 1, name: "Red", normal: "#ff0000" },
    { id: 2, name: "Blue", normal: "#0000ff" },
    { id: 3, name: "Magenta", normal: "#ff00ff" },
    { id: 4, name: "Yellow", normal: "#ffff00" },
    { id: 5, name: "Cyan", normal: "#00ffff" },
    { id: 6, name: "White", normal: "#ffffff" },
  ],
} as const;

const PMD85_TTL_SATURATED_COLORS = {
  "pmd85-2-rgb": [
    { id: 0, name: "Green", normal: "#00ff00" },
    { id: 1, name: "Yellow", normal: "#ffff00" },
    { id: 2, name: "Cyan", normal: "#00ffff" },
    { id: 3, name: "White", normal: "#ffffff" },
  ],
  "pmd85-3-rgb": [
    { id: 0, name: "Green", normal: "#00ff00" },
    { id: 1, name: "Red", normal: "#ff0000" },
    { id: 2, name: "Blue", normal: "#0000ff" },
    { id: 3, name: "Magenta", normal: "#ff00ff" },
  ],
} as const;

const PMD85_COLORACE_SOFT_COLORS = [
  { id: 0, name: "Green", normal: "#50ff50" },
  { id: 1, name: "Red", normal: "#ff5050" },
  { id: 2, name: "Blue", normal: "#5050ff" },
  { id: 3, name: "Magenta", normal: "#ff50ff" },
  { id: 4, name: "Yellow", normal: "#ffff50" },
  { id: 5, name: "Cyan", normal: "#50ffff" },
  { id: 6, name: "White", normal: "#ffffff" },
] as const;

export const BUILT_IN_PROFILE: ConversionProfile = {
  schema_version: "7.0.0",
  id: BUILT_IN_PROFILE_ID,
  platform_id: "zx-spectrum",
  version: "1.0.0",
  name: "ZX Spectrum 48K standard",
  content_sha256: "built-in",
  palette: {
    modes: {
      "zx48-standard-256x192": {
        screen_count: 1,
        screens: [{ colors: ZX_COLORS }],
      },
      "zx48-mixed-256x192": {
        screen_count: 2,
        screens: [{ colors: ZX_COLORS }, { colors: ZX_COLORS }],
      },
      "zx48-vertical-spatial-256x192": {
        screen_count: 1,
        screens: [{ colors: ZX_COLORS }],
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
  presets: [
    { id: "default", name: "Default", settings: defaultSettings },
    {
      id: "vertical-spatial-v1",
      name: "Vertical spatial 8×1",
      settings: {
        ...DEFAULT_CONVERSION_SETTINGS,
        modeId: "zx48-vertical-spatial-256x192",
        attributeOptimizerId: "zx-vertical-spatial-uniform-v1",
        ditherEngineId: "vertical-spatial-none-v1",
        dithering: "none",
        ditheringAmount: 0,
        attributeHeight: 1,
        verticalSpatialMix: {
          schemaVersion: 1,
          algorithmId: "vertical-spatial-uniform-v1",
          calibrationId: "srgb-ideal-v1",
          swapRows: false,
        },
      },
    },
    {
      id: "vertical-spatial-detail-v1",
      name: "Vertical spatial detail · experimental",
      settings: {
        ...DEFAULT_CONVERSION_SETTINGS,
        modeId: "zx48-vertical-spatial-256x192",
        attributeOptimizerId: "zx-vertical-spatial-detail-v1",
        ditherEngineId: "vertical-spatial-none-v1",
        dithering: "none",
        ditheringAmount: 0,
        attributeHeight: 1,
        verticalSpatialMix: {
          schemaVersion: 1,
          algorithmId: "vertical-spatial-detail-v1",
          calibrationId: "srgb-ideal-v1",
          swapRows: true,
        },
      },
    },
    {
      id: "clean-exact",
      name: "Clean / exact",
      settings: {
        ...DEFAULT_CONVERSION_SETTINGS,
        framing: "fill",
        resampling: "bilinear",
        attributeOptimizerId: "zx-source-cell-v1",
        dithering: "none",
        ditherEngineId: "none-discrete-v2",
        ditheringAmount: 0,
      },
    },
    {
      id: "ordered-balanced",
      name: "Ordered balanced",
      settings: {
        ...DEFAULT_CONVERSION_SETTINGS,
        framing: "fill",
        resampling: "bilinear",
        attributeOptimizerId: "zx-guide-reference-halo-v1",
        dithering: "ordered",
        ditherEngineId: "ordered-strict-matrix-v6",
        ditheringAmount: 38,
        orderedMatrix: "bayer-4x4",
        attributeSmoothing: 100,
        attributeHaloHorizontal: 2,
        attributeHaloVertical: 0,
      },
    },
    {
      id: "error-diffusion-baseline",
      name: "Smooth diffusion",
      settings: {
        ...DEFAULT_CONVERSION_SETTINGS,
        framing: "fill",
        resampling: "bilinear",
        attributeOptimizerId: "zx-guide-reference-halo-v1",
        dithering: "error-diffusion",
        ditherEngineId: "error-diffusion-decorrelated-v3",
        ditheringAmount: 38,
        errorDiffusionRandomization: 0,
        attributeSmoothing: 100,
        attributeHaloHorizontal: 2,
        attributeHaloVertical: 0,
      },
    },
    {
      id: "reduced-edge-texture",
      name: "Reduced edge texture",
      settings: {
        ...DEFAULT_CONVERSION_SETTINGS,
        framing: "fill",
        resampling: "bilinear",
        attributeOptimizerId: "zx-source-cell-v1",
        dithering: "error-diffusion",
        ditherEngineId: "error-diffusion-decorrelated-v3",
        ditheringAmount: 38,
        errorDiffusionRandomization: 0,
      },
    },
    {
      id: "halo-v2-balanced",
      name: "Halo v2 strong",
      settings: {
        ...DEFAULT_CONVERSION_SETTINGS,
        framing: "fill",
        resampling: "bilinear",
        attributeOptimizerId: "zx-guide-reference-halo-v2",
        ditherEngineId: "ordered-strict-matrix-v6",
        dithering: "ordered",
        ditheringAmount: 50,
        orderedMatrix: "bayer-4x4",
        attributeHaloInfluence: 200,
      },
    },
    {
      id: "structured-edge-preserving",
      name: "Structured edge-preserving",
      settings: {
        ...DEFAULT_CONVERSION_SETTINGS,
        framing: "fill",
        resampling: "bilinear",
        attributeOptimizerId: "zx-structured-global-v4",
        ditherEngineId: "ordered-cell-pattern-v4",
        dithering: "ordered",
        ditheringAmount: 50,
        structured: {
          ...DEFAULT_CONVERSION_SETTINGS.structured,
          ditherAmountPermille: 500,
          ditherResponseCurveId: "power-035-percent-v2",
          colorAnchorModelId: "srgb-squared-v1",
          structuralModelId: "palette-topology-v1",
          objectiveWeights: {
            ...DEFAULT_CONVERSION_SETTINGS.structured.objectiveWeights,
            pixel: 192,
            rgbAnchor: 2048,
            patternReference: 1536,
            paletteDistribution: 1024,
            luminanceRank: 512,
            edgePolarity: 768,
            mean: 768,
            sharedEndpoint: 0,
          },
          candidateParameters: {
            ...DEFAULT_CONVERSION_SETTINGS.structured.candidateParameters,
            localAdmissibilityPermille: 100,
            boundaryCapPermille: 100,
          },
        },
      },
    },
  ],
};

export const QL_BUILT_IN_PROFILE: ConversionProfile = {
  schema_version: "7.0.0",
  id: QL_PROFILE_ID,
  platform_id: "sinclair-ql",
  version: "1.0.0",
  name: "Sinclair QL",
  content_sha256: "built-in",
  palette: {
    modes: {
      "mode8-256x256": {
        screen_count: 2,
        screens: [{ colors: QL_MODE8_COLORS }, { colors: QL_MODE8_COLORS }],
      },
      "mode8-plain-256x256": {
        screen_count: 1,
        screens: [{ colors: QL_MODE8_COLORS }],
      },
      "mode4-512x256": {
        screen_count: 2,
        screens: [{ colors: QL_MODE4_COLORS }, { colors: QL_MODE4_COLORS }],
      },
      "mode8-mode4-mixed-512x256": {
        screen_count: 2,
        screens: [{ colors: QL_MODE8_COLORS }, { colors: QL_MODE4_COLORS }],
      },
      "mode4-plain-512x256": {
        screen_count: 1,
        screens: [{ colors: QL_MODE4_COLORS }],
      },
      "mode8-vertical-spatial-256x256": {
        screen_count: 1,
        screens: [{ colors: QL_MODE8_COLORS }],
      },
      "mode4-vertical-spatial-512x256": {
        screen_count: 1,
        screens: [{ colors: QL_MODE4_COLORS }],
      },
    },
  },
  preview: {
    normal_channel: 255,
    bright_channel: 255,
    border_color: 0,
    pixel_aspect_ratio: 4 / 3,
    display_aspect_ratio: { width: 4, height: 3 },
  },
  presets: [{
    id: "default",
    name: "Default",
    settings: {
      ...DEFAULT_CONVERSION_SETTINGS,
      profileId: QL_PROFILE_ID,
      platformId: "sinclair-ql",
      modeId: "mode8-256x256",
      paletteSelections: [0, 1].map((screenIndex) => ({
        screenIndex,
        enabledColorIds: [0, 1, 2, 3, 4, 5, 6, 7],
      })),
    },
  }, {
    id: "vertical-spatial-mode8-v1",
    name: "Mode 8 vertical spatial",
    settings: {
      ...DEFAULT_CONVERSION_SETTINGS,
      profileId: QL_PROFILE_ID,
      platformId: "sinclair-ql",
      modeId: "mode8-vertical-spatial-256x256",
      attributeOptimizerId: "ql-vertical-spatial-uniform-v1",
      ditherEngineId: "vertical-spatial-none-v1",
      dithering: "none",
      ditheringAmount: 0,
      paletteSelections: [{ screenIndex: 0, enabledColorIds: [0, 1, 2, 3, 4, 5, 6, 7] }],
      verticalSpatialMix: {
        schemaVersion: 1,
        algorithmId: "vertical-spatial-uniform-v1",
        calibrationId: "srgb-ideal-v1",
        swapRows: false,
      },
    },
  }, {
    id: "vertical-spatial-mode4-v1",
    name: "Mode 4 vertical spatial",
    settings: {
      ...DEFAULT_CONVERSION_SETTINGS,
      profileId: QL_PROFILE_ID,
      platformId: "sinclair-ql",
      modeId: "mode4-vertical-spatial-512x256",
      attributeOptimizerId: "ql-vertical-spatial-uniform-v1",
      ditherEngineId: "vertical-spatial-none-v1",
      dithering: "none",
      ditheringAmount: 0,
      paletteSelections: [{ screenIndex: 0, enabledColorIds: [0, 1, 2, 3] }],
      verticalSpatialMix: {
        schemaVersion: 1,
        algorithmId: "vertical-spatial-uniform-v1",
        calibrationId: "srgb-ideal-v1",
        swapRows: false,
      },
    },
  }],
};

const PMD85_DEFAULT_MODE = "pmd85-3-rgb" as const;
const PMD85_DEFAULT_CALIBRATION = "emulator-soft";

function pmd85Preset(
  id: string,
  name: string,
  overrides: Partial<ConversionSettings>,
): ConversionPreset {
  return {
    id,
    name,
    settings: {
      ...DEFAULT_CONVERSION_SETTINGS,
      profileId: PMD85_PROFILE_ID,
      platformId: "pmd-85",
      modeId: PMD85_DEFAULT_MODE,
      attributeOptimizerId: "pmd85-cell-v1",
      framing: "fit",
      resampling: "lanczos",
      background: { r: 0, g: 0, b: 0 },
      borderColor: 0,
      attributeHeight: 1,
      screenFlickerSuppression: false,
      paletteSelections: [{
        screenIndex: 0,
        enabledColorIds: PMD85_COLORS[PMD85_DEFAULT_MODE].map((color) => color.id),
      }],
      orderedMatrix: "bayer-4x4",
      pmd85: {
        mode: PMD85_DEFAULT_MODE,
        paletteCalibrationId: PMD85_DEFAULT_CALIBRATION,
        gapPolicy: "zero",
      },
      ...overrides,
    },
  };
}

export const PMD85_BUILT_IN_PROFILE: ConversionProfile = {
  schema_version: "7.0.0",
  id: PMD85_PROFILE_ID,
  platform_id: "pmd-85",
  version: "1.2.0",
  name: "PMD 85",
  content_sha256: "built-in",
  palette: {
    modes: {
      "pmd85-2-tv": {
        screen_count: 1,
        screens: [{ colors: PMD85_COLORS["pmd85-2-tv"] }],
        base_calibration_id: "neutral-white",
        calibrations: [{
          id: "tv-grayscale",
          name: "TV/CV grayscale",
          screens: [{ colors: PMD85_COLORS["pmd85-2-tv"] }],
        }],
      },
      "pmd85-2-rgb": {
        screen_count: 1,
        screens: [{ colors: PMD85_COLORS["pmd85-2-rgb"] }],
        base_calibration_id: "emulator-soft",
        calibrations: [{
          id: "ttl-saturated",
          name: "TTL saturated RGB",
          screens: [{ colors: PMD85_TTL_SATURATED_COLORS["pmd85-2-rgb"] }],
        }],
      },
      "pmd85-3-tv": {
        screen_count: 1,
        screens: [{ colors: PMD85_COLORS["pmd85-3-tv"] }],
        base_calibration_id: "tv-grayscale",
      },
      "pmd85-3-pal": {
        screen_count: 1,
        screens: [{ colors: PMD85_COLORS["pmd85-3-pal"] }],
        base_calibration_id: "emulator-soft",
      },
      "pmd85-3-rgb": {
        screen_count: 1,
        screens: [{ colors: PMD85_COLORS["pmd85-3-rgb"] }],
        base_calibration_id: "emulator-soft",
        calibrations: [{
          id: "ttl-saturated",
          name: "TTL saturated RGB",
          screens: [{ colors: PMD85_TTL_SATURATED_COLORS["pmd85-3-rgb"] }],
        }],
      },
      "pmd85-colorace": {
        screen_count: 1,
        screens: [{ colors: PMD85_COLORS["pmd85-colorace"] }],
        base_calibration_id: "pure-rgb",
        calibrations: [{
          id: "emulator-soft",
          name: "Emulator-soft",
          screens: [{ colors: PMD85_COLORACE_SOFT_COLORS }],
        }],
      },
      "pmd85-2-rgb-vertical-spatial": {
        screen_count: 1,
        screens: [{ colors: PMD85_COLORS["pmd85-2-rgb"] }],
        base_calibration_id: "emulator-soft",
        calibrations: [{
          id: "ttl-saturated",
          name: "TTL saturated RGB",
          screens: [{ colors: PMD85_TTL_SATURATED_COLORS["pmd85-2-rgb"] }],
        }],
      },
      "pmd85-3-rgb-vertical-spatial": {
        screen_count: 1,
        screens: [{ colors: PMD85_COLORS["pmd85-3-rgb"] }],
        base_calibration_id: "emulator-soft",
        calibrations: [{
          id: "ttl-saturated",
          name: "TTL saturated RGB",
          screens: [{ colors: PMD85_TTL_SATURATED_COLORS["pmd85-3-rgb"] }],
        }],
      },
      "pmd85-3-pal-vertical-spatial": {
        screen_count: 1,
        screens: [{ colors: PMD85_COLORS["pmd85-3-pal"] }],
        base_calibration_id: "emulator-soft",
      },
    },
  },
  preview: {
    normal_channel: 255,
    bright_channel: 255,
    border_color: 0,
    pixel_aspect_ratio: 1,
    display_aspect_ratio: { width: 9, height: 8 },
  },
  presets: [
    pmd85Preset("default", "Default", {
      ditherEngineId: "none-discrete-v2",
      dithering: "none",
      ditheringAmount: 0,
    }),
    pmd85Preset("vertical-spatial-v2", "Vertical spatial detail v2", {
      modeId: "pmd85-3-rgb-vertical-spatial",
      attributeOptimizerId: "pmd85-vertical-spatial-detail-v2",
      ditherEngineId: "vertical-spatial-none-v1",
      dithering: "none",
      ditheringAmount: 0,
      verticalSpatialMix: {
        schemaVersion: 1,
        algorithmId: "vertical-spatial-pmd-detail-v2",
        calibrationId: "srgb-ideal-v1",
        swapRows: true,
      },
    }),
    pmd85Preset("clean-exact", "Clean / no dither", {
      ditherEngineId: "none-discrete-v2",
      dithering: "none",
      ditheringAmount: 0,
    }),
    pmd85Preset("ordered-balanced", "Ordered balanced", {
      ditherEngineId: "ordered-strict-matrix-v6",
      dithering: "ordered",
      ditheringAmount: 25,
    }),
    pmd85Preset("soft-diffusion", "Soft diffusion", {
      ditherEngineId: "error-diffusion-decorrelated-v3",
      dithering: "error-diffusion",
      ditheringAmount: 35,
      contrast: -5,
      saturation: -5,
      smoothing: 10,
    }),
  ],
};

export const PMD85_BUILT_IN_PROFILES = [PMD85_BUILT_IN_PROFILE] as const;

export const BUILT_IN_PROFILES = [
  BUILT_IN_PROFILE,
  QL_BUILT_IN_PROFILE,
  ...PMD85_BUILT_IN_PROFILES,
] as const;

export function profileModeScreens(
  profile: ConversionProfile,
  modeId: string,
  calibrationId?: string,
): ConversionProfile["palette"]["modes"][string]["screens"] {
  const mode = profile.palette.modes[modeId];
  if (!mode) throw new RangeError(`Profile ${profile.id} does not support ${modeId}.`);
  if (calibrationId === undefined || calibrationId === mode.base_calibration_id) return mode.screens;
  const calibration = mode.calibrations?.find((candidate) => candidate.id === calibrationId);
  if (!calibration) throw new RangeError(`Palette calibration ${calibrationId} is unavailable for ${modeId}.`);
  return calibration.screens;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateSettings(value: unknown): value is ConversionSettings {
  if (
    !isObject(value) ||
    !isObject(value.background) ||
    !isObject(value.crop) ||
    !isObject(value.pmd85) ||
    !isObject(value.structured) ||
    !isObject(value.structured.oklabWeights) ||
    !isObject(value.structured.objectiveWeights) ||
    !isObject(value.structured.boundaryParameters) ||
    !isObject(value.structured.candidateParameters)
  ) return false;
  const integerRange = (candidate: unknown, minimum: number, maximum: number) =>
    Number.isInteger(candidate) && (candidate as number) >= minimum && (candidate as number) <= maximum;
  const expectedPaletteSelections = [
    "zx48-mixed-256x192",
    "mode8-256x256",
    "mode4-512x256",
    "mode8-mode4-mixed-512x256",
  ].includes(String(value.modeId)) ? 2 : 1;
  return ["fit", "fill", "crop", "stretch"].includes(String(value.framing)) &&
    typeof value.profileId === "string" &&
    ["zx-spectrum", "sinclair-ql", "pmd-85"].includes(String(value.platformId)) &&
    [
      "zx48-standard-256x192",
      "zx48-mixed-256x192",
      "zx48-vertical-spatial-256x192",
      "mode8-256x256",
      "mode4-512x256",
      "mode8-mode4-mixed-512x256",
      "mode8-plain-256x256",
      "mode4-plain-512x256",
      "mode8-vertical-spatial-256x256",
      "mode4-vertical-spatial-512x256",
      "pmd85-2-tv",
      "pmd85-2-rgb",
      "pmd85-3-tv",
      "pmd85-3-pal",
      "pmd85-3-rgb",
      "pmd85-colorace",
      "pmd85-2-rgb-vertical-spatial",
      "pmd85-3-rgb-vertical-spatial",
      "pmd85-3-pal-vertical-spatial",
    ].includes(String(value.modeId)) &&
    ["pmd85-cell-v1", "pmd85-vertical-spatial-uniform-v1", "pmd85-vertical-spatial-detail-v2", "ql-vertical-spatial-uniform-v1", "zx-vertical-spatial-uniform-v1", "zx-vertical-spatial-detail-v1", "zx-adaptive-v1", "zx-source-cell-v1", "zx-guide-local-v1", "zx-guide-reference-halo-v1", "zx-guide-reference-halo-v2", "zx-guide-reference-rgb-halo-v3", "zx-block-dbs-global-v1", "zx-structured-global-v1", "zx-structured-global-v2", "zx-structured-global-v3", "zx-structured-global-v4"].includes(String(value.attributeOptimizerId)) &&
    [
      "none-v1",
      "vertical-spatial-none-v1",
      "vertical-spatial-ordered-v1",
      "vertical-spatial-error-diffusion-v1",
      "none-discrete-v2",
      "ordered-osg-v1",
      "ordered-unrestricted-v2",
      "ordered-local-tone-v3",
      "ordered-palette-pairs-v4",
      "ordered-baseline-additive-v5",
      "ordered-strict-matrix-v6",
      "ordered-coverage-normalized-v7",
      "ordered-mixed-phase-stable-v8",
      "ordered-clustered-dot-v1",
      "ordered-void-cluster-v1",
      "ordered-cell-pattern-v1",
      "ordered-cell-pattern-v2",
      "ordered-cell-pattern-v3",
      "ordered-cell-pattern-v4",
      "pattern-legal-mask-dbs-v1",
      "artistic-ordered-hybrid-v1",
      "error-diffusion-projected-v1",
      "error-diffusion-unrestricted-v2",
      "error-diffusion-decorrelated-v3",
      "error-diffusion-atkinson-v1",
      "error-diffusion-riemersma-v1",
      "error-diffusion-phase-balanced-v3",
      "error-diffusion-phase-balanced-checker-v3-1",
      "error-diffusion-phase-balanced-checker-v3-2",
      "error-diffusion-phase-balanced-checker-v3-3",
      "error-diffusion-checker-phase-v4",
      "error-diffusion-checker-phase-v4-4",
      "error-diffusion-checker-phase-v4-1",
      "error-diffusion-checker-phase-v4-2",
      "error-diffusion-checker-phase-v4-3",
      "error-diffusion-checker-phase-v5",
      "error-diffusion-matrix-guided-v1",
    ].includes(String(value.ditherEngineId)) &&
    [
      "ql-mixed-average-v1",
      "ql-mixed-low-perception-v2",
      "ql-mixed-high-detail-v2",
      "ql-mixed-balanced-v2",
    ].includes(String(value.qlMixedOptimizerId)) &&
    ["nearest", "bilinear", "lanczos"].includes(String(value.resampling)) &&
    [0, 90, 180, 270].includes(value.rotation as number) &&
    typeof value.mirrorHorizontal === "boolean" && typeof value.mirrorVertical === "boolean" &&
    (value.fillOffsetX === null || integerRange(value.fillOffsetX, 0, 65_535)) &&
    (value.fillOffsetY === null || integerRange(value.fillOffsetY, 0, 65_535)) &&
    integerRange(value.panOffsetX, -65_535, 65_535) &&
    integerRange(value.panOffsetY, -65_535, 65_535) &&
    ["background", "clamp", "wrap"].includes(String(value.panEdgeMode)) &&
    ["none", "source", "destination"].includes(String(value.cropAspectRatio)) &&
    integerRange(value.crop.x, 0, 65_535) &&
    integerRange(value.crop.y, 0, 65_535) &&
    integerRange(value.crop.width, 1, 65_536) &&
    integerRange(value.crop.height, 1, 65_536) &&
    integerRange(value.brightness, -100, 100) && integerRange(value.contrast, -100, 100) &&
    integerRange(value.saturation, -100, 100) && integerRange(value.gamma, 33, 300) &&
    integerRange(value.smoothing, 0, 100) && integerRange(value.sharpening, 0, 100) &&
    [value.background.r, value.background.g, value.background.b].every((channel) => integerRange(channel, 0, 255)) &&
    integerRange(value.borderColor, 0, 7) &&
    [1, 2, 4, 8].includes(value.attributeHeight as number) &&
    integerRange(value.attributeSmoothing, 0, 100) &&
    integerRange(value.attributeHaloInfluence, 0, 400) &&
    integerRange(value.attributeHaloHorizontal, 0, 2) &&
    integerRange(value.attributeHaloVertical, 0, 2) &&
    typeof value.screenFlickerSuppression === "boolean" &&
    Array.isArray(value.paletteSelections) &&
    value.paletteSelections.length === expectedPaletteSelections &&
    value.paletteSelections.every((selection, screenIndex) =>
      isObject(selection) &&
      selection.screenIndex === screenIndex &&
      Array.isArray(selection.enabledColorIds) &&
      selection.enabledColorIds.length >= 1 &&
      selection.enabledColorIds.length <= 8 &&
      selection.enabledColorIds.every((color) =>
        Number.isInteger(color) && color >= 0 && color <= 7
      ) &&
      new Set(selection.enabledColorIds).size === selection.enabledColorIds.length &&
      (
        value.platformId === "zx-spectrum"
          ? ["auto", "on", "off"].includes(String(selection.brightMode))
          : selection.brightMode === undefined
      )
    ) &&
    ["none", "ordered", "error-diffusion"].includes(String(value.dithering)) &&
    integerRange(value.ditheringAmount, 0, 100) &&
    integerRange(value.errorDiffusionRandomization, 0, 100) &&
    integerRange(value.errorDiffusionLineSuppression, 0, 100) &&
    (value.ditherEngineId !== "artistic-ordered-hybrid-v1" ||
      value.platformId === "zx-spectrum" && ["zx48-standard-256x192", "zx48-mixed-256x192"].includes(String(value.modeId)) ||
      value.platformId === "sinclair-ql" && ["mode8-plain-256x256", "mode4-plain-512x256", "mode8-256x256", "mode4-512x256", "mode8-mode4-mixed-512x256"].includes(String(value.modeId)) ||
      value.platformId === "pmd-85") &&
    (value.artisticPattern === undefined || ["auto", "checkerboard", "horizontal", "vertical"].includes(String(value.artisticPattern))) &&
    ["checkerboard-2x1", "bayer-2x2", "bayer-4x4", "bayer-8x8", "clustered-dot-4x4", "clustered-dot-8x8", "void-cluster-8x8"].includes(String(value.orderedMatrix)) &&
    value.structured.schemaVersion === 1 &&
    integerRange(value.structured.ditherAmountPermille, 0, 1000) &&
    ["linear-light-average-v1", "gamma-average-v1"].includes(String(value.structured.mixtureModelId)) &&
    value.structured.perceptualModelId === "oklab-quantized-v1" &&
    ["none-v1", "srgb-squared-v1"].includes(
      String(value.structured.colorAnchorModelId),
    ) &&
    ["none-v1", "palette-topology-v1"].includes(
      String(value.structured.structuralModelId),
    ) &&
    ["power-065-percent-v1", "power-035-percent-v2"].includes(
      String(value.structured.ditherResponseCurveId),
    ) &&
    Object.values(value.structured.oklabWeights).every((weight) =>
      integerRange(weight, 0, 65_536)
    ) &&
    Object.values(value.structured.objectiveWeights).every((weight) =>
      integerRange(weight, 0, 65_536)
    ) &&
    integerRange(value.structured.boundaryParameters.sourceDiscontinuityAllowance, 0, 65_536) &&
    integerRange(value.structured.boundaryParameters.edgeAttenuation, 0, 1024) &&
    integerRange(value.structured.candidateParameters.edgeImportanceWeight, 0, 65_536) &&
    integerRange(value.structured.candidateParameters.strongEdgeThreshold, 0, 1024) &&
    integerRange(value.structured.candidateParameters.importantMassPermille, 0, 1000) &&
    integerRange(value.structured.candidateParameters.localAdmissibilityPermille, 0, 1000) &&
    integerRange(value.structured.candidateParameters.boundaryCapPermille, 0, 1000) &&
    ["pmd85-2-tv", "pmd85-2-rgb", "pmd85-3-tv", "pmd85-3-pal", "pmd85-3-rgb", "pmd85-colorace"].includes(String(value.pmd85.mode)) &&
    typeof value.pmd85.paletteCalibrationId === "string" &&
    value.pmd85.paletteCalibrationId.length >= 1 &&
    value.pmd85.paletteCalibrationId.length <= 80 &&
    ["zero", "preserve-imported"].includes(String(value.pmd85.gapPolicy)) &&
    (
      value.platformId !== "pmd-85" ||
      (
        value.modeId === value.pmd85.mode ||
        (value.modeId === "pmd85-2-rgb-vertical-spatial" && value.pmd85.mode === "pmd85-2-rgb") ||
        (value.modeId === "pmd85-3-rgb-vertical-spatial" && value.pmd85.mode === "pmd85-3-rgb") ||
        (value.modeId === "pmd85-3-pal-vertical-spatial" && value.pmd85.mode === "pmd85-3-pal")
      )
    ) &&
    (
      value.platformId !== "pmd-85" ||
      String(value.modeId).startsWith("pmd85-") &&
      (
        value.attributeOptimizerId === "pmd85-cell-v1" ||
        value.attributeOptimizerId === "pmd85-vertical-spatial-uniform-v1" ||
        value.attributeOptimizerId === "pmd85-vertical-spatial-detail-v2"
      )
    ) &&
    (
      value.platformId !== "sinclair-ql" ||
      String(value.modeId).startsWith("mode")
    ) &&
    (
      value.platformId !== "zx-spectrum" ||
      String(value.modeId).startsWith("zx48-")
    ) &&
    (
      value.platformId === "sinclair-ql" ||
      isCompatibleEnginePair(
        value.attributeOptimizerId as never,
        value.ditherEngineId as never,
      )
    ) &&
    (String(value.modeId).includes("vertical-spatial")
      ? (
      isObject(value.verticalSpatialMix) &&
      value.verticalSpatialMix.schemaVersion === 1 &&
      value.verticalSpatialMix.algorithmId === (
        value.attributeOptimizerId === "zx-vertical-spatial-detail-v1"
          ? "vertical-spatial-detail-v1"
          : value.attributeOptimizerId === "pmd85-vertical-spatial-detail-v2"
            ? "vertical-spatial-pmd-detail-v2"
          : "vertical-spatial-uniform-v1"
      ) &&
      value.verticalSpatialMix.calibrationId === "srgb-ideal-v1" &&
      (value.verticalSpatialMix.swapRows === undefined || typeof value.verticalSpatialMix.swapRows === "boolean") &&
      value.ditherEngineId === (
        value.dithering === "none"
          ? "vertical-spatial-none-v1"
          : value.dithering === "ordered"
            ? "vertical-spatial-ordered-v1"
            : "vertical-spatial-error-diffusion-v1"
      ) &&
      (
        value.platformId === "zx-spectrum"
          ? [
              "zx-vertical-spatial-uniform-v1",
              "zx-vertical-spatial-detail-v1",
            ].includes(String(value.attributeOptimizerId))
          : value.platformId === "sinclair-ql"
            ? value.attributeOptimizerId === "ql-vertical-spatial-uniform-v1"
            : [
                "pmd85-vertical-spatial-uniform-v1",
                "pmd85-vertical-spatial-detail-v2",
              ].includes(String(value.attributeOptimizerId))
      )
      )
      : value.verticalSpatialMix === undefined &&
        !String(value.ditherEngineId).startsWith("vertical-spatial-")
    );
}

function rejectReferences(value: unknown, key = ""): void {
  if (/^(url|uri|path|script|code|macro|external|href|src)$/i.test(key)) {
    throw new Error(`PROFILE_EXTERNAL_REFERENCE: field ${key} is forbidden.`);
  }
  if (typeof value === "string" && /(?:[a-z]+:\/\/|\.\.[/\\]|^[/\\])/i.test(value)) {
    throw new Error("PROFILE_EXTERNAL_REFERENCE: URL or path-like strings are forbidden.");
  }
  if (Array.isArray(value)) value.forEach((item) => rejectReferences(item, key));
  else if (isObject(value)) for (const [childKey, child] of Object.entries(value)) rejectReferences(child, childKey);
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
}

function validateProfileScreens(value: unknown, screenCount: 1 | 2): boolean {
  return Array.isArray(value) && value.length === screenCount && value.every((screen) =>
    isObject(screen) &&
    Array.isArray(screen.colors) &&
    screen.colors.length >= 1 &&
    screen.colors.length <= 256 &&
    screen.colors.every((color, index) =>
      isObject(color) &&
      color.id === index &&
      typeof color.name === "string" &&
      color.name.length >= 1 &&
      color.name.length <= 80 &&
      typeof color.normal === "string" &&
      /^#[0-9a-f]{6}$/i.test(color.normal) &&
      (
        color.bright === undefined ||
        typeof color.bright === "string" && /^#[0-9a-f]{6}$/i.test(color.bright)
      )
    )
  );
}

export async function parseImportedProfile(bytes: Uint8Array): Promise<ConversionProfile> {
  if (bytes.length < 2 || bytes.length > MAX_PROFILE_BYTES) {
    throw new Error("PROFILE_LIMIT_EXCEEDED: profile must be 2 bytes through 256 KiB.");
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new Error("PROFILE_JSON_INVALID: profile is not valid UTF-8 JSON.");
  }
  rejectReferences(value);
  if (!isObject(value) || !["5.0.0", "6.0.0", "7.0.0"].includes(String(value.schema_version))) {
    throw new Error("PROFILE_SCHEMA_INVALID: schema version is unsupported.");
  }
  if (typeof value.id !== "string" || !/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(value.id)) {
    throw new Error("PROFILE_SCHEMA_INVALID: id is invalid.");
  }
  if (BUILT_IN_PROFILES.some((profile) => profile.id === value.id)) {
    throw new Error("PROFILE_BUILTIN_SHADOW: built-in profile id is protected.");
  }
  if (!["zx-spectrum", "sinclair-ql", "pmd-85"].includes(String(value.platform_id))) {
    throw new Error("PROFILE_SCHEMA_INVALID: platform is invalid.");
  }
  if (typeof value.version !== "string" || !/^\d+\.\d+\.\d+$/.test(value.version)) throw new Error("PROFILE_SCHEMA_INVALID: version is invalid.");
  if (typeof value.name !== "string" || value.name.length < 1 || value.name.length > 80) throw new Error("PROFILE_SCHEMA_INVALID: name is invalid.");
  if (
    !isObject(value.palette) ||
    !isObject(value.palette.modes) ||
    Object.keys(value.palette.modes).length < 1 ||
    !Object.values(value.palette.modes).every((mode) =>
      isObject(mode) &&
      (mode.screen_count === 1 || mode.screen_count === 2) &&
      validateProfileScreens(mode.screens, mode.screen_count as 1 | 2) &&
      (mode.base_calibration_id === undefined || (
        typeof mode.base_calibration_id === "string" &&
        /^[a-z0-9][a-z0-9-]{0,39}$/.test(mode.base_calibration_id)
      )) &&
      (mode.calibrations === undefined || (
        Array.isArray(mode.calibrations) &&
        mode.calibrations.length <= 16 &&
        new Set(mode.calibrations.map((calibration) =>
          isObject(calibration) ? calibration.id : undefined
        )).size === mode.calibrations.length &&
        mode.calibrations.every((calibration) =>
          isObject(calibration) &&
          typeof calibration.id === "string" &&
          /^[a-z0-9][a-z0-9-]{0,39}$/.test(calibration.id) &&
          calibration.id !== mode.base_calibration_id &&
          typeof calibration.name === "string" &&
          calibration.name.length >= 1 &&
          calibration.name.length <= 80 &&
          validateProfileScreens(calibration.screens, mode.screen_count as 1 | 2) &&
          (calibration.screens as Record<string, unknown>[]).every((screen, screenIndex) =>
            (screen.colors as unknown[]).length ===
            ((mode.screens as Record<string, unknown>[])[screenIndex]!.colors as unknown[]).length
          )
        )
      ))
    )
  ) throw new Error("PROFILE_SCHEMA_INVALID: palette descriptor is invalid.");
  if (!isObject(value.preview) || !isObject(value.preview.display_aspect_ratio) ||
    ![value.preview.normal_channel, value.preview.bright_channel].every((item) => Number.isInteger(item) && (item as number) >= 0 && (item as number) <= 255) ||
    !Number.isInteger(value.preview.border_color) || (value.preview.border_color as number) < 0 || (value.preview.border_color as number) > 7 ||
    typeof value.preview.pixel_aspect_ratio !== "number" || value.preview.pixel_aspect_ratio < 0.5 || value.preview.pixel_aspect_ratio > 2 ||
    !Number.isInteger(value.preview.display_aspect_ratio.width) ||
    (value.preview.display_aspect_ratio.width as number) < 1 ||
    (value.preview.display_aspect_ratio.width as number) > 64 ||
    !Number.isInteger(value.preview.display_aspect_ratio.height) ||
    (value.preview.display_aspect_ratio.height as number) < 1 ||
    (value.preview.display_aspect_ratio.height as number) > 64
  ) throw new Error("PROFILE_SCHEMA_INVALID: preview calibration is invalid.");
  if (!Array.isArray(value.presets) || value.presets.length < 1 || value.presets.length > 32) throw new Error("PROFILE_SCHEMA_INVALID: 1 through 32 presets are required.");
  const paletteModes = (value.palette as Record<string, unknown>).modes as
    Record<string, unknown>;
  const presetIds = new Set<string>();
  const presets: ConversionPreset[] = value.presets.map((raw) => {
    if (!isObject(raw) || typeof raw.id !== "string" || !/^[a-z0-9][a-z0-9-]{0,39}$/.test(raw.id) || presetIds.has(raw.id)) {
      throw new Error("PROFILE_SCHEMA_INVALID: preset id is invalid or duplicated.");
    }
    presetIds.add(raw.id);
    const settings = isObject(raw.settings)
      ? {
          ...raw.settings,
          pmd85: isObject(raw.settings.pmd85)
            ? raw.settings.pmd85
            : DEFAULT_CONVERSION_SETTINGS.pmd85,
          panOffsetX: raw.settings.panOffsetX === undefined ? 0 : raw.settings.panOffsetX,
          panOffsetY: raw.settings.panOffsetY === undefined ? 0 : raw.settings.panOffsetY,
          panEdgeMode: raw.settings.panEdgeMode === undefined
            ? "background"
            : raw.settings.panEdgeMode,
        }
      : raw.settings;
    if (typeof raw.name !== "string" || raw.name.length < 1 || raw.name.length > 80 || !validateSettings(settings)) {
      throw new Error("PROFILE_SCHEMA_INVALID: preset is incomplete.");
    }
    if (settings.platformId !== value.platform_id) {
      throw new Error("PROFILE_SCHEMA_INVALID: preset platform does not match its profile.");
    }
    const mode = paletteModes[settings.modeId];
    if (
      !isObject(mode) ||
      settings.paletteSelections.length !== mode.screen_count ||
      settings.paletteSelections.some((selection, screenIndex) =>
        selection.enabledColorIds.some((color) =>
          color < 0 ||
          color >= (
            (mode.screens as Record<string, unknown>[])[screenIndex]!
              .colors as unknown[]
          ).length
        )
      )
    ) {
      throw new Error("PROFILE_SCHEMA_INVALID: preset palette does not match its hardware mode.");
    }
    if (settings.platformId === "pmd-85") {
      const calibrationIds = [
        mode.base_calibration_id,
        ...(Array.isArray(mode.calibrations)
          ? mode.calibrations.map((calibration) =>
              isObject(calibration) ? calibration.id : undefined
            )
          : []),
      ];
      if (!calibrationIds.includes(settings.pmd85.paletteCalibrationId)) {
        throw new Error("PROFILE_SCHEMA_INVALID: preset calibration is unavailable for its hardware mode.");
      }
    }
    return { id: raw.id, name: raw.name, settings };
  });
  const projection = {
    schema_version: value.schema_version as "5.0.0" | "6.0.0" | "7.0.0",
    id: value.id,
    platform_id: value.platform_id as "zx-spectrum" | "sinclair-ql" | "pmd-85",
    version: value.version,
    name: value.name,
    palette: {
      modes: Object.fromEntries(
        Object.entries(paletteModes).map(([modeId, rawMode]) => {
          const mode = rawMode as Record<string, unknown>;
          return [modeId, {
            screen_count: mode.screen_count as 1 | 2,
            screens: (mode.screens as Record<string, unknown>[]).map((screen) => ({
              colors: (screen.colors as Record<string, unknown>[]).map((descriptor) => ({
                id: descriptor.id as number,
                name: descriptor.name as string,
                normal: descriptor.normal as string,
                ...(descriptor.bright === undefined
                  ? {}
                  : { bright: descriptor.bright as string }),
              })),
            })),
            ...(mode.base_calibration_id === undefined
              ? {}
              : { base_calibration_id: mode.base_calibration_id as string }),
            ...(mode.calibrations === undefined
              ? {}
              : {
                  calibrations: (mode.calibrations as Record<string, unknown>[]).map((calibration) => ({
                    id: calibration.id as string,
                    name: calibration.name as string,
                    screens: (calibration.screens as Record<string, unknown>[]).map((screen) => ({
                      colors: (screen.colors as Record<string, unknown>[]).map((descriptor) => ({
                        id: descriptor.id as number,
                        name: descriptor.name as string,
                        normal: descriptor.normal as string,
                        ...(descriptor.bright === undefined
                          ? {}
                          : { bright: descriptor.bright as string }),
                      })),
                    })),
                  })),
                }),
          }];
        }),
      ),
    },
    preview: {
      normal_channel: value.preview.normal_channel as number,
      bright_channel: value.preview.bright_channel as number,
      border_color: value.preview.border_color as number,
      pixel_aspect_ratio: value.preview.pixel_aspect_ratio,
      display_aspect_ratio: {
        width: value.preview.display_aspect_ratio.width as number,
        height: value.preview.display_aspect_ratio.height as number,
      },
    },
    presets,
  };
  const content_sha256 = await sha256Hex(new TextEncoder().encode(JSON.stringify(canonicalize(projection))));
  return { ...projection, content_sha256 };
}

export function loadStoredProfiles(storage: Storage): ConversionProfile[] {
  try {
    const parsed = JSON.parse(storage.getItem(PROFILE_STORAGE_KEY) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((profile): profile is ConversionProfile =>
      isObject(profile) && typeof profile.id === "string" &&
      !BUILT_IN_PROFILES.some((builtIn) => builtIn.id === profile.id),
    ).slice(0, 16).map((profile) => ({
      ...profile,
      presets: profile.presets.map((preset) => ({
        ...preset,
        settings: {
          ...preset.settings,
          panOffsetX: Number.isInteger(preset.settings.panOffsetX)
            ? preset.settings.panOffsetX
            : 0,
          panOffsetY: Number.isInteger(preset.settings.panOffsetY)
            ? preset.settings.panOffsetY
            : 0,
          panEdgeMode: ["background", "clamp", "wrap"].includes(
            preset.settings.panEdgeMode,
          )
            ? preset.settings.panEdgeMode
            : "background",
        },
      })),
    }));
  } catch {
    return [];
  }
}

export function saveStoredProfiles(storage: Storage, profiles: readonly ConversionProfile[]): void {
  storage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles.slice(0, 16)));
}
