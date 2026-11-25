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
