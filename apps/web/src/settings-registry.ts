import type { ApplicationSettings } from "./application-settings.js";
import type { WorkspaceLayoutId } from "./workspace-preferences.js";

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
  | { readonly kind: "readonly" }
  | { readonly kind: "action"; readonly action: string };

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
  readonly defaultValue: T;
  readonly validate: (value: unknown) => T | null;
  readonly isAvailable?: (context: SettingsContext) => boolean;
  readonly isEnabled?: (values: Readonly<Record<string, unknown>>, context: SettingsContext) => boolean;
  readonly disabledReason?: string;
}

const oneOf = <T>(values: readonly T[], fallback: T) => (value: unknown): T | null =>
  values.includes(value as T) ? value as T : fallback;
const bool = (value: unknown): boolean | null => typeof value === "boolean" ? value : null;
const finiteNumber = (min: number, max: number) => (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= min && value <= max ? value : null;
const text = (value: unknown): string | null => typeof value === "string" ? value : null;
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
  { id: "profileId", category: "startup", label: "Profile", description: "The conversion profile used at startup.", scope: "application", control: { kind: "text" }, defaultValue: "org.retroconverter.zx48.default", validate: text, keywords: ["startup", "target"] },
  { id: "presetId", category: "startup", label: "Preset", description: "A curated conversion recipe for the selected profile.", scope: "application", control: { kind: "text" }, defaultValue: "default", validate: text, keywords: ["recipe"] },
  { id: "modeId", category: "startup", label: "Hardware mode", description: "The target hardware mode used for new conversions.", scope: "application", control: { kind: "text" }, defaultValue: "zx48-standard-256x192", validate: text, keywords: ["target", "hardware"] },
  { id: "framing", category: "startup", label: "Framing", description: "How the source image is framed in the target dimensions.", scope: "conversion", control: { kind: "select", options: [{ value: "fill", label: "Fill" }, { value: "fit", label: "Fit" }, { value: "crop", label: "Crop" }] }, defaultValue: "fill", validate: oneOf(["fill", "fit", "crop"] as const, "fill") },
  { id: "workspaceLayout", category: "workspace", label: "Workspace layout", description: "The arrangement of preview and editing panes.", scope: "application", control: { kind: "select", options: (["conversion", "palette", "tilemap", "editor", "inspection", "custom"] as WorkspaceLayoutId[]).map((value) => ({ value, label: value[0]!.toUpperCase() + value.slice(1) })) }, defaultValue: "conversion", validate: oneOf(["conversion", "palette", "tilemap", "editor", "inspection", "custom"] as const, "conversion") },
  { id: "synchronizePan", category: "workspace", label: "Synchronize PAN", description: "Keep source and result preview scrolling aligned.", scope: "application", control: { kind: "boolean" }, defaultValue: true, validate: bool },
  { id: "mouseWheelZoom", category: "mouse", label: "Mouse-wheel zoom", description: "Zoom previews with the mouse wheel.", scope: "application", control: { kind: "boolean" }, defaultValue: true, validate: bool, keywords: ["scroll", "zoom"] },
  { id: "dithering", category: "dithering", label: "Dithering mode", description: "The method used to distribute palette error.", scope: "conversion", control: { kind: "select", options: [{ value: "none", label: "None" }, { value: "ordered", label: "Ordered" }, { value: "error-diffusion", label: "Error diffusion" }] }, defaultValue: "none", validate: oneOf(["none", "ordered", "error-diffusion"] as const, "none"), keywords: ["quality", "pattern"], presets: ["conversion-quality"] },
  { id: "ditheringAmount", category: "dithering", label: "Dithering amount", description: "Strength of the selected dithering method (0–100%).", scope: "conversion", control: { kind: "slider", min: 0, max: 100, step: 1, unit: "%" }, defaultValue: 100, validate: finiteNumber(0, 100), presets: ["conversion-quality"] },
  { id: "artisticPattern", category: "dithering", label: "Artistic pattern preference", description: "Nested motif family for Artistic ordered hybrid. 8×1 cells use row-local motifs.", scope: "conversion", control: { kind: "select", options: ["auto", "checkerboard", "horizontal", "vertical"].map((value) => ({ value, label: value })) }, defaultValue: "auto", validate: oneOf(["auto", "checkerboard", "horizontal", "vertical"] as const, "auto") },
  { id: "orderedMatrix", category: "dithering", label: "Ordered matrix", description: "The threshold matrix used by ordered dithering.", scope: "conversion", control: { kind: "select", options: orderedMatrixOptions.map(([value, label]) => ({ value, label })) }, defaultValue: "bayer-4x4", validate: oneOf(orderedMatrixOptions.map(([value]) => value), "bayer-4x4"), isEnabled: (values) => values.dithering === "ordered", disabledReason: "Available when Dithering mode is Ordered.", presets: ["conversion-quality"] },
  { id: "resampling", category: "geometry", label: "Resampling", description: "Filter used when resizing the source image.", scope: "conversion", control: { kind: "select", options: [{ value: "nearest", label: "Nearest neighbour" }, { value: "bilinear", label: "Bilinear" }, { value: "lanczos", label: "Lanczos" }] }, defaultValue: "bilinear", validate: oneOf(["nearest", "bilinear", "lanczos"] as const, "bilinear") },
  { id: "rotation", category: "geometry", label: "Rotation", description: "Rotate the source before conversion.", scope: "conversion", control: { kind: "select", options: [{ value: 0, label: "0° (none)" }, { value: 90, label: "90°" }, { value: 180, label: "180°" }, { value: 270, label: "270°" }] }, defaultValue: 0, validate: oneOf([0, 90, 180, 270] as const, 0) },
  { id: "brightness", category: "adjustments", label: "Brightness", description: "Adjust source luminance before conversion.", scope: "conversion", control: { kind: "slider", min: -100, max: 100, step: 1 }, defaultValue: 0, validate: finiteNumber(-100, 100) },
  { id: "contrast", category: "adjustments", label: "Contrast", description: "Adjust source contrast before conversion.", scope: "conversion", control: { kind: "slider", min: -100, max: 100, step: 1 }, defaultValue: 0, validate: finiteNumber(-100, 100) },
  { id: "saturation", category: "adjustments", label: "Saturation", description: "Adjust source color intensity.", scope: "conversion", control: { kind: "slider", min: -100, max: 100, step: 1 }, defaultValue: 0, validate: finiteNumber(-100, 100) },
  { id: "gamma", category: "adjustments", label: "Gamma", description: "Adjust source transfer curve. 100% is neutral.", scope: "conversion", control: { kind: "slider", min: 33, max: 300, step: 1, unit: "%" }, defaultValue: 100, validate: finiteNumber(33, 300) },
  { id: "attributeHeight", category: "palette", label: "Attribute dimensions", description: "Height of software attribute cells.", scope: "conversion", control: { kind: "select", options: [{ value: 1, label: "8×1" }, { value: 2, label: "8×2" }, { value: 4, label: "8×4" }, { value: 8, label: "8×8" }] }, defaultValue: 8, validate: oneOf([1, 2, 4, 8] as const, 8) },
  { id: "bright", category: "palette", label: "BRIGHT", description: "Allow bright palette entries where supported.", scope: "conversion", control: { kind: "boolean" }, defaultValue: true, validate: bool, presets: ["palette-attributes"] },
  { id: "flash", category: "palette", label: "FLASH", description: "Allow flashing attributes where supported.", scope: "conversion", control: { kind: "boolean" }, defaultValue: false, validate: bool, presets: ["palette-attributes"] },
  { id: "paintMode", category: "editor", label: "Paint mode", description: "Choose how clicking a bitmap pixel changes it: Set turns it on, Reset turns it off, Toggle flips it, and Inspect leaves it unchanged.", scope: "project", control: { kind: "select", options: [{ value: "set", label: "Set (turn on)" }, { value: "reset", label: "Reset (turn off)" }, { value: "toggle", label: "Toggle" }, { value: "none", label: "Inspect only" }] }, defaultValue: "toggle", validate: oneOf(["set", "reset", "toggle", "none"] as const, "toggle"), isAvailable: (context) => context.workspaceMode !== "tilemap", disabledReason: "Bitmap editor settings are unavailable in tilemap mode." },
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
  return Object.fromEntries(SETTINGS_REGISTRY.map((definition) => [definition.id, source[definition.id] ?? definition.defaultValue]));
}

export function validateSettingsDraft(values: Readonly<Record<string, unknown>>, definitions = SETTINGS_REGISTRY): { readonly values: Record<string, unknown>; readonly errors: Record<string, string> } {
  const next: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const definition of definitions) {
    const value = definition.validate(values[definition.id]);
    if (value === null) errors[definition.id] = `Enter a valid value for ${definition.label}.`;
    else next[definition.id] = value;
  }
  return { values: next, errors };
}

export function serializeSettingsByScope(values: Readonly<Record<string, unknown>>, definitions = SETTINGS_REGISTRY): Record<SettingScope, Record<string, unknown>> {
  const result: Record<SettingScope, Record<string, unknown>> = { application: {}, conversion: {}, project: {} };
  for (const definition of definitions) {
    const value = definition.validate(values[definition.id]);
    if (value !== null) result[definition.scope][definition.id] = value;
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
