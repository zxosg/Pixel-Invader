import { useAppState } from "../app-state.js";
import { SETTING_LEVELS, SETTINGS_REGISTRY, type SettingLevel } from "../../settings-registry.js";
import { sidebarSectionLevels, type SidebarSection } from "../../settings-sidebar-model.js";
import { GeometryControls } from "./geometry-settings-window.js";
import { AdjustmentsControls } from "./adjustments-settings-window.js";
import { PaletteControls } from "./palette-settings-window.js";
import { DitheringControls } from "./dithering-controls.js";

const LEVEL_LABELS: Record<SettingLevel, string> = { basic: "Basic", advanced: "Advanced", expert: "Expert" };

const SECTION_LABELS: Record<SidebarSection, string> = {
  geometry: "Geometry", adjustments: "Image adjustments", palette: "Palette and attributes", dithering: "Dithering",
};

export function SettingsSidebar() {
  const s = useAppState();
  const { conversionSettings, settingsLevel, setSettingsLevel, setUiLayout } = s;
  const settings = conversionSettings as unknown as Record<string, unknown>;
  const values = Object.fromEntries(SETTINGS_REGISTRY.map((definition) => [definition.id, readValue(conversionSettings, definition.id, settings)]));
  const extraAdjustments = conversionSettings.hueShift !== 0 && conversionSettings.hueShift !== undefined ||
    conversionSettings.hslSaturation !== 0 && conversionSettings.hslSaturation !== undefined ||
    conversionSettings.lightness !== 0 && conversionSettings.lightness !== undefined ||
    conversionSettings.colorize === true;
  const levels = sidebarSectionLevels(settingsLevel, values, extraAdjustments ? { adjustments: "advanced" } : {});
  const raised = (Object.keys(levels) as SidebarSection[]).some((section) => levels[section] !== settingsLevel);

  return (
    <aside className="settings-sidebar" aria-label="Conversion settings">
      <div className="settings-sidebar-header">
        <h2>Settings</h2>
        <div className="settings-tier" role="radiogroup" aria-label="Settings level">
          {SETTING_LEVELS.map((level) => <button key={level} type="button" role="radio" aria-checked={settingsLevel === level} className={settingsLevel === level ? "active" : ""} onClick={() => setSettingsLevel(level)}>{LEVEL_LABELS[level]}</button>)}
        </div>
        {raised ? <p className="settings-sidebar-note">Modified settings from higher tiers stay visible.</p> : null}
      </div>
      <div className="settings-sidebar-body">
        <details className="settings-sidebar-group" open><summary>{SECTION_LABELS.geometry}</summary><GeometryControls level={levels.geometry} /></details>
        <details className="settings-sidebar-group" open><summary>{SECTION_LABELS.adjustments}</summary><AdjustmentsControls level={levels.adjustments} /></details>
        <details className="settings-sidebar-group" open><summary>{SECTION_LABELS.palette}</summary><PaletteControls level={levels.palette} /></details>
        <details className="settings-sidebar-group" open><summary>{SECTION_LABELS.dithering}</summary><DitheringControls level={levels.dithering} /></details>
      </div>
      <div className="settings-sidebar-footer">
        <button type="button" className="secondary compact" onClick={() => setUiLayout("pro")}>Pro workspace…</button>
      </div>
    </aside>
  );
}

function readValue(settings: AppConversionSettings, id: string, record: Record<string, unknown>): unknown {
  switch (id) {
    case "cropX": return settings.crop.x;
    case "cropY": return settings.crop.y;
    case "cropWidth": return settings.crop.width;
    case "cropHeight": return settings.crop.height;
    case "pmd85PaletteCalibrationId": return settings.pmd85.paletteCalibrationId;
    case "pmd85GapPolicy": return settings.pmd85.gapPolicy;
    case "verticalSpatialSwapRows": return settings.verticalSpatialMix?.swapRows ?? false;
    default: return record[id];
  }
}
type AppConversionSettings = ReturnType<typeof useAppState>["conversionSettings"];
