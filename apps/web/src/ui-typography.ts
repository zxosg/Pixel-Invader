export type UiFontFamilyId = "inter" | "system" | "segoe";
export type UiFontWeight = "normal" | "bold";

export interface UiTypographySettings {
  readonly uiFontFamily: UiFontFamilyId;
  readonly windowTitleFontSize: number;
  readonly windowTitleFontWeight: UiFontWeight;
  readonly uiLabelFontSize: number;
  readonly uiLabelFontWeight: UiFontWeight;
  readonly uiBodyFontSize: number;
  readonly uiBodyFontWeight: UiFontWeight;
}

export const UI_FONT_SIZE_MIN = 6;
export const UI_FONT_SIZE_MAX = 24;

export const UI_FONT_FAMILY_OPTIONS: readonly { readonly value: UiFontFamilyId; readonly label: string }[] = [
  { value: "inter", label: "Inter with system fallback" },
  { value: "system", label: "System UI" },
  { value: "segoe", label: "Segoe UI with system fallback" },
];

export const UI_FONT_FAMILY_STACKS: Readonly<Record<UiFontFamilyId, string>> = {
  inter: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  system: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  segoe: '"Segoe UI", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
};

export const DEFAULT_UI_TYPOGRAPHY: UiTypographySettings = {
  uiFontFamily: "inter",
  windowTitleFontSize: 12,
  windowTitleFontWeight: "bold",
  uiLabelFontSize: 11,
  uiLabelFontWeight: "bold",
  uiBodyFontSize: 12,
  uiBodyFontWeight: "normal",
};

const FONT_FAMILIES = new Set<UiFontFamilyId>(UI_FONT_FAMILY_OPTIONS.map(({ value }) => value));
const FONT_WEIGHTS = new Set<UiFontWeight>(["normal", "bold"]);

function validFontSize(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= UI_FONT_SIZE_MIN && value <= UI_FONT_SIZE_MAX;
}

function validFontFamily(value: unknown): value is UiFontFamilyId {
  return typeof value === "string" && FONT_FAMILIES.has(value as UiFontFamilyId);
}

function validFontWeight(value: unknown): value is UiFontWeight {
  return typeof value === "string" && FONT_WEIGHTS.has(value as UiFontWeight);
}

export function validateUiTypographySettings(value: unknown): UiTypographySettings | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Record<string, unknown>;
  return validFontFamily(candidate.uiFontFamily) &&
      validFontSize(candidate.windowTitleFontSize) &&
      validFontWeight(candidate.windowTitleFontWeight) &&
      validFontSize(candidate.uiLabelFontSize) &&
      validFontWeight(candidate.uiLabelFontWeight) &&
      validFontSize(candidate.uiBodyFontSize) &&
      validFontWeight(candidate.uiBodyFontWeight)
    ? {
        uiFontFamily: candidate.uiFontFamily,
        windowTitleFontSize: candidate.windowTitleFontSize,
        windowTitleFontWeight: candidate.windowTitleFontWeight,
        uiLabelFontSize: candidate.uiLabelFontSize,
        uiLabelFontWeight: candidate.uiLabelFontWeight,
        uiBodyFontSize: candidate.uiBodyFontSize,
        uiBodyFontWeight: candidate.uiBodyFontWeight,
      }
    : null;
}

export function loadUiTypographySettings(value: unknown): UiTypographySettings {
  if (value === undefined) return DEFAULT_UI_TYPOGRAPHY;
  if (typeof value !== "object" || value === null) return DEFAULT_UI_TYPOGRAPHY;
  const candidate = value as Record<string, unknown>;
  const merged = {
    ...DEFAULT_UI_TYPOGRAPHY,
    uiFontFamily: candidate.uiFontFamily,
    windowTitleFontSize: candidate.windowTitleFontSize,
    windowTitleFontWeight: candidate.windowTitleFontWeight,
    uiLabelFontSize: candidate.uiLabelFontSize,
    uiLabelFontWeight: candidate.uiLabelFontWeight,
    uiBodyFontSize: candidate.uiBodyFontSize,
    uiBodyFontWeight: candidate.uiBodyFontWeight,
  };
  return {
    uiFontFamily: validFontFamily(merged.uiFontFamily) ? merged.uiFontFamily : DEFAULT_UI_TYPOGRAPHY.uiFontFamily,
    windowTitleFontSize: validFontSize(merged.windowTitleFontSize) ? merged.windowTitleFontSize : DEFAULT_UI_TYPOGRAPHY.windowTitleFontSize,
    windowTitleFontWeight: validFontWeight(merged.windowTitleFontWeight) ? merged.windowTitleFontWeight : DEFAULT_UI_TYPOGRAPHY.windowTitleFontWeight,
    uiLabelFontSize: validFontSize(merged.uiLabelFontSize) ? merged.uiLabelFontSize : DEFAULT_UI_TYPOGRAPHY.uiLabelFontSize,
    uiLabelFontWeight: validFontWeight(merged.uiLabelFontWeight) ? merged.uiLabelFontWeight : DEFAULT_UI_TYPOGRAPHY.uiLabelFontWeight,
    uiBodyFontSize: validFontSize(merged.uiBodyFontSize) ? merged.uiBodyFontSize : DEFAULT_UI_TYPOGRAPHY.uiBodyFontSize,
    uiBodyFontWeight: validFontWeight(merged.uiBodyFontWeight) ? merged.uiBodyFontWeight : DEFAULT_UI_TYPOGRAPHY.uiBodyFontWeight,
  };
}

export function uiTypographyFromRecord(value: Readonly<Record<string, unknown>>): UiTypographySettings {
  return loadUiTypographySettings(value);
}

export function uiTypographyCssVariables(settings: UiTypographySettings): Record<string, string> {
  return {
    "--ui-font-family": UI_FONT_FAMILY_STACKS[settings.uiFontFamily],
    "--ui-title-font-size": `${settings.windowTitleFontSize}px`,
    "--ui-title-font-weight": settings.windowTitleFontWeight === "bold" ? "700" : "400",
    "--ui-label-font-size": `${settings.uiLabelFontSize}px`,
    "--ui-label-font-weight": settings.uiLabelFontWeight === "bold" ? "700" : "400",
    "--ui-body-font-size": `${settings.uiBodyFontSize}px`,
    "--ui-body-font-weight": settings.uiBodyFontWeight === "bold" ? "700" : "400",
  };
}
