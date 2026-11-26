import { type SettingCategory, type SettingDefinition, type SettingLevel, SETTING_LEVELS, SETTINGS_REGISTRY } from "./settings-registry.js";

// Target selection lives in the workflow bar and the palette is edited in its own window.
const SIDEBAR_EXCLUDED_IDS: ReadonlySet<string> = new Set(["profileId", "presetId", "modeId", "paletteSelections"]);

export interface SidebarGroup {
  readonly category: SettingCategory;
  readonly definitions: readonly SettingDefinition[];
}

/**
 * Conversion settings shown for a tier. A setting that differs from its default is
 * always shown, so a value hidden by a lower tier can never silently affect a result.
 */
export function sidebarSettings(
  level: SettingLevel,
  values: Readonly<Record<string, unknown>>,
  definitions: readonly SettingDefinition[] = SETTINGS_REGISTRY,
): readonly SettingDefinition[] {
  const maxRank = SETTING_LEVELS.indexOf(level);
  return definitions.filter((definition) =>
    definition.scope === "conversion" &&
    !SIDEBAR_EXCLUDED_IDS.has(definition.id) &&
    definition.control.kind !== "readonly" &&
    (SETTING_LEVELS.indexOf(definition.level) <= maxRank ||
      (definition.id in values && !Object.is(values[definition.id], definition.defaultValue) &&
        JSON.stringify(values[definition.id]) !== JSON.stringify(definition.defaultValue))));
}

export function groupSidebarSettings(definitions: readonly SettingDefinition[]): readonly SidebarGroup[] {
  const groups = new Map<SettingCategory, SettingDefinition[]>();
  for (const definition of definitions) groups.set(definition.category, [...(groups.get(definition.category) ?? []), definition]);
  return [...groups].map(([category, defs]) => ({ category, definitions: defs }));
}

export type SidebarSection = "geometry" | "adjustments" | "palette" | "dithering";

const SECTION_OF_CATEGORY: Partial<Record<SettingCategory, SidebarSection>> = {
  startup: "geometry", geometry: "geometry", adjustments: "adjustments", palette: "palette", dithering: "dithering",
};

// Engine ids follow the chosen method automatically, so they must not escalate a tier by themselves.
const DERIVED_IDS: ReadonlySet<string> = new Set(["ditherEngineId"]);

/**
 * Effective tier of each sidebar section: the selected tier, raised when a setting
 * hidden by that tier has been changed so the change stays visible and resettable.
 */
export function sidebarSectionLevels(
  level: SettingLevel,
  values: Readonly<Record<string, unknown>>,
  extraModified: Partial<Record<SidebarSection, SettingLevel>> = {},
  definitions: readonly SettingDefinition[] = SETTINGS_REGISTRY,
): Record<SidebarSection, SettingLevel> {
  const result: Record<SidebarSection, SettingLevel> = { geometry: level, adjustments: level, palette: level, dithering: level };
  const raise = (section: SidebarSection, candidate: SettingLevel) => {
    if (SETTING_LEVELS.indexOf(candidate) > SETTING_LEVELS.indexOf(result[section])) result[section] = candidate;
  };
  for (const definition of sidebarSettings("expert", values, definitions)) {
    const section = SECTION_OF_CATEGORY[definition.category];
    if (section === undefined || DERIVED_IDS.has(definition.id)) continue;
    if (SETTING_LEVELS.indexOf(definition.level) > SETTING_LEVELS.indexOf(level) && definition.id in values &&
      JSON.stringify(values[definition.id]) !== JSON.stringify(definition.defaultValue)) raise(section, definition.level);
  }
  for (const [section, extra] of Object.entries(extraModified) as [SidebarSection, SettingLevel][]) raise(section, extra);
  return result;
}
