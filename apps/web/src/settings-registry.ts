import type { ApplicationSettings } from "./application-settings.js";
import type { WorkspaceLayoutId } from "./workspace-preferences.js";
import { ATTRIBUTE_OPTIMIZERS, DEFAULT_CONVERSION_SETTINGS, DITHER_ENGINES } from "@retro-converter/conversion-core";

export type SettingCategory =
  | "startup"
  | "workspace"
  | "mouse"
  | "dithering"
  | "geometry"
  | "adjustments"
  | "palette"
  | "editor";

export type SettingScope = "application" | "conversion" | "project";
export type SettingPresetId =
  | "all"
  | "startup"
  | "workspace-mouse"
  | "conversion-quality"
  | "palette-attributes"
  | "editor"
  | "modified";

export type SettingControl<T> =
  | { readonly kind: "boolean" }
  | { readonly kind: "select"; readonly options: readonly { readonly value: T; readonly label: string }[] }
  | { readonly kind: "number"; readonly min: number; readonly max: number; readonly step: number }
  | { readonly kind: "slider"; readonly min: number; readonly max: number; readonly step: number; readonly unit?: string }
  | { readonly kind: "text" }
  | { readonly kind: "color" }
  | { readonly kind: "palette" }
  | { readonly kind: "readonly" }
  | { readonly kind: "action"; readonly action: string };

export type SettingOptionProvider = "profiles" | "presets" | "modes" | "pmd-calibrations";

export interface SettingsContext {
  readonly workspaceMode?: string;
  readonly modeId?: string;
  readonly dithering?: string;
}

export interface SettingDefinition<T = unknown> {
  readonly id: string;
  readonly category: SettingCategory;
  readonly label: string;
  readonly description: string;
  readonly keywords?: readonly string[];
  readonly presets?: readonly SettingPresetId[];
  readonly scope: SettingScope;
  readonly control: SettingControl<T>;
  readonly optionProvider?: SettingOptionProvider;
  readonly defaultValue: T;
  readonly validate: (value: unknown) => T | null;
  /** A null value is a valid setting value rather than a validation failure. */
  readonly acceptsNull?: boolean;
  readonly isAvailable?: (context: SettingsContext) => boolean;
  readonly isEnabled?: (values: Readonly<Record<string, unknown>>, context: SettingsContext) => boolean;
  readonly disabledReason?: string;
}

const oneOf = <T>(values: readonly T[], _fallback: T) => (value: unknown): T | null =>
  values.includes(value as T) ? value as T : null;
const bool = (value: unknown): boolean | null => typeof value === "boolean" ? value : null;
const finiteNumber = (min: number, max: number) => (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
const integerNumber = (min: number, max: number) => (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : null;
const text = (value: unknown): string | null => typeof value === "string" ? value : null;
const rgbColor = (value: unknown): { r: number; g: number; b: number } | null => {
  if (typeof value !== "object" || value === null) return null;
  const color = value as Record<string, unknown>;
  return [color.r, color.g, color.b].every((channel) => typeof channel === "number" && Number.isInteger(channel) && channel >= 0 && channel <= 255)
    ? { r: color.r as number, g: color.g as number, b: color.b as number }
    : null;
};
const nullableNumber = (min: number, max: number) => (value: unknown): number | null =>
  value === null || (typeof value === "number" && Number.isInteger(value) && value >= min && value <= max) ? value as number | null : null;
const orderedMatrixOptions = [
  ["checkerboard-2x1", "Checkerboard 2×1"], ["bayer-2x2", "Bayer 2×2"], ["bayer-4x4", "Bayer 4×4"],
  ["bayer-8x8", "Bayer 8×8"], ["clustered-dot-4x4", "Clustered dot 4×4"],
  ["clustered-dot-8x8", "Clustered dot 8×8"], ["void-cluster-8x8", "Void-and-cluster 8×8"],
] as const;

const categories: Record<SettingCategory, string> = {
  startup: "Startup", workspace: "Workspace", mouse: "Mouse behavior", dithering: "Dithering",
  geometry: "Geometry", adjustments: "Image adjustments", palette: "Palette and attributes", editor: "Editor",
};

export const SETTING_CATEGORIES = categories;

export const SETTINGS_REGISTRY: readonly SettingDefinition[] = [
  { id: "profileId", category: "startup", label: "Profile", description: "The conversion profile used at startup.", scope: "application", control: { kind: "select", options: [] }, optionProvider: "profiles", defaultValue: "org.retroconverter.zx48.default", validate: text, keywords: ["startup", "target"] },
  { id: "presetId", category: "startup", label: "Preset", description: "A curated conversion recipe for the selected profile.", scope: "application", control: { kind: "select", options: [] }, optionProvider: "presets", defaultValue: "default", validate: text, keywords: ["recipe"] },
  { id: "modeId", category: "startup", label: "Hardware mode", description: "The target hardware mode used for new conversions.", scope: "application", control: { kind: "select", options: [] }, optionProvider: "modes", defaultValue: "zx48-standard-256x192", validate: text, keywords: ["target", "hardware"] },
  { id: "framing", category: "startup", label: "Framing", description: "How the source image is framed in the target dimensions.", scope: "conversion", control: { kind: "select", options: [{ value: "fill", label: "Fill" }, { value: "fit", label: "Fit" }, { value: "crop", label: "Crop" }, { value: "stretch", label: "Stretch" }] }, defaultValue: "fill", validate: oneOf(["fill", "fit", "crop", "stretch"] as const, "fill") },
  { id: "workspaceLayout", category: "startup", label: "Startup workspace layout", description: "The built-in workbench arrangement used when the application starts or Workspace is reset.", scope: "application", control: { kind: "select", options: (["conversion", "palette", "dithering", "tilemap", "editor", "inspection"] as WorkspaceLayoutId[]).map((value) => ({ value, label: value[0]!.toUpperCase() + value.slice(1) })) }, defaultValue: "conversion", validate: oneOf(["conversion", "palette", "dithering", "tilemap", "editor", "inspection"] as const, "conversion") },
  { id: "synchronizePan", category: "workspace", label: "Synchronize PAN", description: "Keep source and result preview scrolling aligned.", scope: "application", control: { kind: "boolean" }, defaultValue: true, validate: bool },
  { id: "synchronizeZoom", category: "workspace", label: "Synchronize zoom", description: "Keep source and result preview zoom levels aligned.", scope: "application", control: { kind: "boolean" }, defaultValue: true, validate: bool },
  { id: "showCompareEngines", category: "workspace", label: "Show Compare engines", description: "Show the optional engine comparison tool in the Tools panel.", scope: "application", control: { kind: "boolean" }, defaultValue: false, validate: bool },
  { id: "mouseWheelZoom", category: "mouse", label: "Mouse-wheel zoom", description: "Zoom previews with the mouse wheel.", scope: "application", control: { kind: "boolean" }, defaultValue: true, validate: bool, keywords: ["scroll", "zoom"] },
  { id: "dithering", category: "dithering", label: "Dithering mode", description: "The method used to distribute palette error.", scope: "conversion", control: { kind: "select", options: [{ value: "none", label: "None" }, { value: "ordered", label: "Ordered" }, { value: "error-diffusion", label: "Error diffusion" }] }, defaultValue: "none", validate: oneOf(["none", "ordered", "error-diffusion"] as const, "none"), keywords: ["quality", "pattern"], presets: ["conversion-quality"] },
  { id: "ditheringAmount", category: "dithering", label: "Dithering amount", description: "Strength of the selected dithering method (0–100%).", scope: "conversion", control: { kind: "slider", min: 0, max: 100, step: 1, unit: "%" }, defaultValue: 100, validate: finiteNumber(0, 100), presets: ["conversion-quality"] },
  { id: "artisticPattern", category: "dithering", label: "Artistic pattern preference", description: "Nested motif family for Artistic ordered hybrid. 8×1 cells use row-local motifs.", scope: "conversion", control: { kind: "select", options: ["auto", "checkerboard", "horizontal", "vertical"].map((value) => ({ value, label: value })) }, defaultValue: "auto", validate: oneOf(["auto", "checkerboard", "horizontal", "vertical"] as const, "auto") },
  { id: "orderedMatrix", category: "dithering", label: "Ordered matrix", description: "The threshold matrix used by ordered dithering.", scope: "conversion", control: { kind: "select", options: orderedMatrixOptions.map(([value, label]) => ({ value, label })) }, defaultValue: "bayer-4x4", validate: oneOf(orderedMatrixOptions.map(([value]) => value), "bayer-4x4"), isEnabled: (values) => values.dithering === "ordered", disabledReason: "Available when Dithering mode is Ordered.", presets: ["conversion-quality"] },
  { id: "resampling", category: "geometry", label: "Resampling", description: "Filter used when resizing the source image.", scope: "conversion", control: { kind: "select", options: [{ value: "nearest", label: "Nearest neighbour" }, { value: "bilinear", label: "Bilinear" }, { value: "lanczos", label: "Lanczos" }] }, defaultValue: "bilinear", validate: oneOf(["nearest", "bilinear", "lanczos"] as const, "bilinear") },
  { id: "rotation", category: "geometry", label: "Rotation", description: "Rotate the source before conversion.", scope: "conversion", control: { kind: "select", options: [{ value: 0, label: "0° (none)" }, { value: 90, label: "90°" }, { value: 180, label: "180°" }, { value: 270, label: "270°" }] }, defaultValue: 0, validate: oneOf([0, 90, 180, 270] as const, 0) },
  { id: "mirrorHorizontal", category: "geometry", label: "Mirror horizontally", description: "Flip the source left to right before conversion.", scope: "conversion", control: { kind: "boolean" }, defaultValue: false, validate: bool },
  { id: "mirrorVertical", category: "geometry", label: "Mirror vertically", description: "Flip the source top to bottom before conversion.", scope: "conversion", control: { kind: "boolean" }, defaultValue: false, validate: bool },
  { id: "fillOffsetX", category: "geometry", label: "Fill horizontal offset", description: "Horizontal source-pixel offset used by Fill framing.", scope: "conversion", control: { kind: "number", min: 0, max: 10000, step: 1 }, defaultValue: null, validate: nullableNumber(0, 10000), acceptsNull: true, isEnabled: (values) => values.framing === "fill", disabledReason: "Available when Framing is Fill." },
  { id: "fillOffsetY", category: "geometry", label: "Fill vertical offset", description: "Vertical source-pixel offset used by Fill framing.", scope: "conversion", control: { kind: "number", min: 0, max: 10000, step: 1 }, defaultValue: null, validate: nullableNumber(0, 10000), acceptsNull: true, isEnabled: (values) => values.framing === "fill", disabledReason: "Available when Framing is Fill." },
  { id: "panOffsetX", category: "geometry", label: "Pan horizontal offset", description: "Output-pixel translation applied after the source image is rescaled.", scope: "conversion", control: { kind: "number", min: -65535, max: 65535, step: 1 }, defaultValue: 0, validate: integerNumber(-65535, 65535), keywords: ["pan", "pixel", "attribute", "alignment"] },
  { id: "panOffsetY", category: "geometry", label: "Pan vertical offset", description: "Output-pixel translation applied after the source image is rescaled.", scope: "conversion", control: { kind: "number", min: -65535, max: 65535, step: 1 }, defaultValue: 0, validate: integerNumber(-65535, 65535), keywords: ["pan", "pixel", "attribute", "alignment"] },
  { id: "panEdgeMode", category: "geometry", label: "Pan edge handling", description: "How pixels outside the shifted source bitmap are filled.", scope: "conversion", control: { kind: "select", options: [{ value: "background", label: "Background" }, { value: "clamp", label: "Clamp" }, { value: "wrap", label: "Wrap" }] }, defaultValue: "background", validate: oneOf(["background", "clamp", "wrap"] as const, "background"), keywords: ["pan", "background", "tile"] },
  { id: "background", category: "geometry", label: "Background color", description: "RGB color used for letterbox areas and panning edges.", scope: "conversion", control: { kind: "color" }, defaultValue: DEFAULT_CONVERSION_SETTINGS.background, validate: rgbColor, keywords: ["RGB", "color", "letterbox", "edge"] },
  { id: "cropAspectRatio", category: "geometry", label: "Crop aspect ratio", description: "Optional aspect-ratio lock for the crop rectangle.", scope: "conversion", control: { kind: "select", options: [{ value: "none", label: "No aspect ratio" }, { value: "source", label: "Source image" }, { value: "destination", label: "Destination" }] }, defaultValue: "none", validate: oneOf(["none", "source", "destination"] as const, "none"), isEnabled: (values) => values.framing === "crop", disabledReason: "Available when Framing is Crop." },
  { id: "cropX", category: "geometry", label: "Crop X", description: "Left edge of the crop rectangle in source pixels.", scope: "conversion", control: { kind: "number", min: 0, max: 10000, step: 1 }, defaultValue: 0, validate: finiteNumber(0, 10000), isEnabled: (values) => values.framing === "crop", disabledReason: "Available when Framing is Crop." },
  { id: "cropY", category: "geometry", label: "Crop Y", description: "Top edge of the crop rectangle in source pixels.", scope: "conversion", control: { kind: "number", min: 0, max: 10000, step: 1 }, defaultValue: 0, validate: finiteNumber(0, 10000), isEnabled: (values) => values.framing === "crop", disabledReason: "Available when Framing is Crop." },
  { id: "cropWidth", category: "geometry", label: "Crop width", description: "Width of the crop rectangle in source pixels.", scope: "conversion", control: { kind: "number", min: 1, max: 10000, step: 1 }, defaultValue: 256, validate: finiteNumber(1, 10000), isEnabled: (values) => values.framing === "crop", disabledReason: "Available when Framing is Crop." },
  { id: "cropHeight", category: "geometry", label: "Crop height", description: "Height of the crop rectangle in source pixels.", scope: "conversion", control: { kind: "number", min: 1, max: 10000, step: 1 }, defaultValue: 192, validate: finiteNumber(1, 10000), isEnabled: (values) => values.framing === "crop", disabledReason: "Available when Framing is Crop." },
  { id: "brightness", category: "adjustments", label: "Brightness", description: "Adjust source luminance before conversion.", scope: "conversion", control: { kind: "slider", min: -100, max: 100, step: 1 }, defaultValue: 0, validate: finiteNumber(-100, 100) },
  { id: "contrast", category: "adjustments", label: "Contrast", description: "Adjust source contrast before conversion.", scope: "conversion", control: { kind: "slider", min: -100, max: 100, step: 1 }, defaultValue: 0, validate: finiteNumber(-100, 100) },
  { id: "saturation", category: "adjustments", label: "Saturation", description: "Adjust source color intensity.", scope: "conversion", control: { kind: "slider", min: -100, max: 100, step: 1 }, defaultValue: 0, validate: finiteNumber(-100, 100) },
  { id: "gamma", category: "adjustments", label: "Gamma", description: "Adjust source transfer curve. 100% is neutral.", scope: "conversion", control: { kind: "slider", min: 33, max: 300, step: 1, unit: "%" }, defaultValue: 100, validate: finiteNumber(33, 300) },
  { id: "smoothing", category: "adjustments", label: "Smoothing", description: "Reduce high-frequency source detail before conversion.", scope: "conversion", control: { kind: "slider", min: 0, max: 100, step: 1, unit: "%" }, defaultValue: 0, validate: finiteNumber(0, 100) },
  { id: "sharpening", category: "adjustments", label: "Sharpening", description: "Enhance source edges before conversion.", scope: "conversion", control: { kind: "slider", min: 0, max: 100, step: 1, unit: "%" }, defaultValue: 0, validate: finiteNumber(0, 100) },
  { id: "attributeHeight", category: "palette", label: "Attribute dimensions", description: "Height of software attribute cells.", scope: "conversion", control: { kind: "select", options: [{ value: 1, label: "8×1" }, { value: 2, label: "8×2" }, { value: 4, label: "8×4" }, { value: 8, label: "8×8" }] }, defaultValue: 8, validate: oneOf([1, 2, 4, 8] as const, 8) },
  { id: "attributeOptimizerId", category: "palette", label: "Attribute optimizer", description: "Algorithm used to select palette attributes.", scope: "conversion", control: { kind: "select", options: ATTRIBUTE_OPTIMIZERS.map((item) => ({ value: item.id, label: item.name })) }, defaultValue: "zx-guide-reference-halo-v1", validate: oneOf(ATTRIBUTE_OPTIMIZERS.map((item) => item.id), "zx-guide-reference-halo-v1") },
  { id: "attributeSmoothing", category: "palette", label: "Attribute smoothing", description: "Smooth attribute selection where supported.", scope: "conversion", control: { kind: "slider", min: 0, max: 100, step: 1, unit: "%" }, defaultValue: 0, validate: finiteNumber(0, 100), isEnabled: (values) => values.dithering !== "none", disabledReason: "Unavailable when dithering is disabled." },
  { id: "attributeHaloInfluence", category: "palette", label: "Halo influence", description: "Strength of edge-aware halo guidance.", scope: "conversion", control: { kind: "slider", min: 0, max: 400, step: 1, unit: "%" }, defaultValue: 100, validate: finiteNumber(0, 400), isEnabled: (values) => String(values.attributeOptimizerId).includes("halo"), disabledReason: "Available for halo optimizers." },
  { id: "attributeHaloHorizontal", category: "palette", label: "Horizontal halo", description: "Horizontal radius of halo guidance.", scope: "conversion", control: { kind: "select", options: [{ value: 0, label: "0 px" }, { value: 1, label: "1 px" }, { value: 2, label: "2 px" }] }, defaultValue: 1, validate: oneOf([0, 1, 2] as const, 1), isEnabled: (values) => values.dithering !== "none", disabledReason: "Unavailable when dithering is disabled." },
  { id: "attributeHaloVertical", category: "palette", label: "Vertical halo", description: "Vertical radius of halo guidance.", scope: "conversion", control: { kind: "select", options: [{ value: 0, label: "0 px" }, { value: 1, label: "1 px" }, { value: 2, label: "2 px" }] }, defaultValue: 0, validate: oneOf([0, 1, 2] as const, 0), isEnabled: (values) => values.dithering !== "none" && Number(values.attributeHeight) >= 4, disabledReason: "Available for 8×4 and 8×8 attributes when dithering is enabled." },
  { id: "screenFlickerSuppression", category: "palette", label: "Screen flicker suppression", description: "Balance paired screens to reduce visible temporal flicker.", scope: "conversion", control: { kind: "boolean" }, defaultValue: true, validate: bool, isEnabled: (_values, context) => context.modeId?.includes("mixed") === true || context.modeId?.includes("256x256") === true, disabledReason: "Available for paired-screen targets." },
  { id: "paletteSelections", category: "palette", label: "Palette selections", description: "Choose the colors and BRIGHT policy available to each output screen.", scope: "conversion", control: { kind: "palette" }, defaultValue: DEFAULT_CONVERSION_SETTINGS.paletteSelections, validate: (value) => Array.isArray(value) ? value as typeof DEFAULT_CONVERSION_SETTINGS.paletteSelections : null },
  { id: "borderColor", category: "palette", label: "Border color", description: "ZX border color used around the converted screen.", scope: "conversion", control: { kind: "number", min: 0, max: 15, step: 1 }, defaultValue: 0, validate: finiteNumber(0, 15), isAvailable: (context) => context.modeId?.startsWith("zx48-") === true, disabledReason: "Available for ZX Spectrum targets." },
  { id: "verticalSpatialSwapRows", category: "palette", label: "Swap physical row order", description: "Allow vertical-spatial output to exchange physical row order.", scope: "conversion", control: { kind: "boolean" }, defaultValue: false, validate: bool, isEnabled: (_values, context) => context.modeId?.includes("vertical-spatial") === true, disabledReason: "Available for vertical-spatial modes." },
  { id: "qlMixedOptimizerId", category: "palette", label: "QL mixed optimizer", description: "Optimizer used for QL mixed-resolution color blending.", scope: "conversion", control: { kind: "select", options: [{ value: "ql-mixed-average-v1", label: "Average v1" }, { value: "ql-mixed-low-perception-v2", label: "Low perception v2" }, { value: "ql-mixed-high-detail-v2", label: "High detail v2" }, { value: "ql-mixed-balanced-v2", label: "Balanced v2" }] }, defaultValue: "ql-mixed-balanced-v2", validate: oneOf(["ql-mixed-average-v1", "ql-mixed-low-perception-v2", "ql-mixed-high-detail-v2", "ql-mixed-balanced-v2"] as const, "ql-mixed-balanced-v2"), isEnabled: (_values, context) => context.modeId === "mode8-mode4-mixed-512x256", disabledReason: "Available for QL mixed mode." },
  { id: "ditherEngineId", category: "dithering", label: "Dither engine", description: "Concrete versioned engine used by the worker.", scope: "conversion", control: { kind: "select", options: DITHER_ENGINES.map((item) => ({ value: item.id, label: item.name })) }, defaultValue: "none-discrete-v2", validate: oneOf(DITHER_ENGINES.map((item) => item.id), "none-discrete-v2") },
  { id: "errorDiffusionRandomization", category: "dithering", label: "Error randomization", description: "Deterministically break repeating Error-diffusion patterns.", scope: "conversion", control: { kind: "slider", min: 0, max: 100, step: 1, unit: "%" }, defaultValue: 0, validate: finiteNumber(0, 100), isEnabled: (values) => values.dithering === "error-diffusion", disabledReason: "Available for Error diffusion." },
  { id: "errorDiffusionLineSuppression", category: "dithering", label: "Line suppression", description: "Reduce vertical diffusion runs while retaining short transitions.", scope: "conversion", control: { kind: "slider", min: 0, max: 100, step: 1, unit: "%" }, defaultValue: 50, validate: finiteNumber(0, 100), isEnabled: (values) => values.dithering === "error-diffusion", disabledReason: "Available for Error diffusion." },
  { id: "pmd85PaletteCalibrationId", category: "palette", label: "PMD 85 palette calibration", description: "Calibration used to interpret PMD 85 output colors.", scope: "conversion", control: { kind: "select", options: [{ value: "pure-rgb", label: "Pure RGB" }, { value: "neutral-white", label: "Neutral white/silver" }, { value: "emulator-soft", label: "Emulator soft" }] }, optionProvider: "pmd-calibrations", defaultValue: "pure-rgb", validate: oneOf(["pure-rgb", "neutral-white", "emulator-soft"] as const, "pure-rgb"), isAvailable: (context) => context.modeId?.startsWith("pmd85-") === true, disabledReason: "Available for PMD 85 targets." },
  { id: "pmd85GapPolicy", category: "palette", label: "PMD 85 gap policy", description: "Preserve imported gap bytes or zero-fill them on reconversion.", scope: "conversion", control: { kind: "select", options: [{ value: "preserve-imported", label: "Preserve imported" }, { value: "zero", label: "Zero-fill" }] }, defaultValue: "preserve-imported", validate: oneOf(["preserve-imported", "zero"] as const, "preserve-imported"), isAvailable: (context) => context.modeId?.startsWith("pmd85-") === true, disabledReason: "Available for PMD 85 targets." },
];

export const SETTING_FILTER_PRESETS: readonly { readonly id: SettingPresetId; readonly label: string }[] = [
  { id: "all", label: "All settings" }, { id: "startup", label: "Startup" }, { id: "workspace-mouse", label: "Workspace and mouse" },
  { id: "conversion-quality", label: "Conversion quality" }, { id: "palette-attributes", label: "Palette and attributes" },
  { id: "editor", label: "Editor" }, { id: "modified", label: "Modified settings" },
];

export function settingMatchesSearch(definition: SettingDefinition, query: string): boolean {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return true;
  return [definition.id, definition.label, definition.description, ...(definition.keywords ?? [])]
    .some((value) => value.toLocaleLowerCase().includes(needle));
}

export function filterSettings(definitions: readonly SettingDefinition[], query: string, category: SettingCategory | "all", preset: SettingPresetId, values: Readonly<Record<string, unknown>>): readonly SettingDefinition[] {
  return definitions.filter((definition) => settingMatchesSearch(definition, query)
    && (category === "all" || definition.category === category)
    && (preset === "all" || preset === "modified" ? (preset !== "modified" || !Object.is(values[definition.id], definition.defaultValue)) : (definition.presets ?? []).includes(preset) || (preset === "startup" && definition.category === "startup") || (preset === "workspace-mouse" && (definition.category === "workspace" || definition.category === "mouse"))));
}

export function createSettingsDraft(values: object): Record<string, unknown> {
  const source = values as Record<string, unknown>;
  return Object.fromEntries(SETTINGS_REGISTRY.map((definition) => [definition.id, Object.prototype.hasOwnProperty.call(source, definition.id) ? source[definition.id] : definition.defaultValue]));
}

export function validateSettingsDraft(values: Readonly<Record<string, unknown>>, definitions = SETTINGS_REGISTRY): { readonly values: Record<string, unknown>; readonly errors: Record<string, string> } {
  const next: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const definition of definitions) {
    const value = definition.validate(values[definition.id]);
    if (value === null && !definition.acceptsNull) errors[definition.id] = `Enter a valid value for ${definition.label}.`;
    else next[definition.id] = value;
  }
  return { values: next, errors };
}

export function serializeSettingsByScope(values: Readonly<Record<string, unknown>>, definitions = SETTINGS_REGISTRY): Record<SettingScope, Record<string, unknown>> {
  const result: Record<SettingScope, Record<string, unknown>> = { application: {}, conversion: {}, project: {} };
  for (const definition of definitions) {
    const value = definition.validate(values[definition.id]);
    if (value !== null || definition.acceptsNull) result[definition.scope][definition.id] = value;
  }
  return result;
}

export function loadRegisteredValues(raw: unknown, definitions = SETTINGS_REGISTRY): Record<string, unknown> {
  const source = typeof raw === "object" && raw !== null ? raw as Record<string, unknown> : {};
  return Object.fromEntries(definitions.map((definition) => [definition.id, definition.validate(source[definition.id]) ?? definition.defaultValue]));
}

export function applicationSettingsValues(settings: ApplicationSettings): Record<string, unknown> {
  return { ...settings };
}
