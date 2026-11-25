import { type DitheringMethod, ditherMethodForEngine, latestDitherEngineForMethod, type DitherEngineId, type ConversionSettings, type RgbColor } from "@retro-converter/conversion-core";
import { useAppState } from "../app-state.js";
import { hexToRgb, rgbToHex } from "../../dithering-labels.js";
import { SETTING_CATEGORIES, SETTING_LEVELS, type SettingDefinition, type SettingLevel } from "../../settings-registry.js";
import { groupSidebarSettings, sidebarSettings } from "../../settings-sidebar-model.js";

const LEVEL_LABELS: Record<SettingLevel, string> = { basic: "Basic", advanced: "Advanced", expert: "Expert" };

function readValue(settings: ConversionSettings, id: string): unknown {
  switch (id) {
    case "cropX": return settings.crop.x;
    case "cropY": return settings.crop.y;
    case "cropWidth": return settings.crop.width;
    case "cropHeight": return settings.crop.height;
    case "pmd85PaletteCalibrationId": return settings.pmd85.paletteCalibrationId;
    case "pmd85GapPolicy": return settings.pmd85.gapPolicy;
    case "verticalSpatialSwapRows": return settings.verticalSpatialMix?.swapRows ?? false;
    default: return (settings as unknown as Record<string, unknown>)[id];
  }
}

function writeValue(settings: ConversionSettings, id: string, value: unknown): ConversionSettings {
  switch (id) {
    case "cropX": return { ...settings, crop: { ...settings.crop, x: Number(value) } };
    case "cropY": return { ...settings, crop: { ...settings.crop, y: Number(value) } };
    case "cropWidth": return { ...settings, crop: { ...settings.crop, width: Number(value) } };
    case "cropHeight": return { ...settings, crop: { ...settings.crop, height: Number(value) } };
    case "pmd85PaletteCalibrationId": return { ...settings, pmd85: { ...settings.pmd85, paletteCalibrationId: String(value) } };
    case "pmd85GapPolicy": return { ...settings, pmd85: { ...settings.pmd85, gapPolicy: value as ConversionSettings["pmd85"]["gapPolicy"] } };
    case "verticalSpatialSwapRows": return settings.verticalSpatialMix === undefined ? settings : { ...settings, verticalSpatialMix: { ...settings.verticalSpatialMix, swapRows: Boolean(value) } };
    case "dithering": return { ...settings, dithering: value as DitheringMethod, ditherEngineId: latestDitherEngineForMethod(value as DitheringMethod) };
    case "ditherEngineId": return { ...settings, ditherEngineId: value as DitherEngineId, dithering: ditherMethodForEngine(value as DitherEngineId) };
    default: return { ...settings, [id]: value } as ConversionSettings;
  }
}

export function SettingsSidebar() {
  const s = useAppState();
  const { applySettings, conversionSettings, settingsLevel, setSettingsLevel, setUiLayout, workspaceMode, targetModeId, dithering } = s;
  const values = Object.fromEntries(
    sidebarSettings("expert", {}).map((definition) => [definition.id, readValue(conversionSettings, definition.id)]),
  );
  const context = { workspaceMode, modeId: String(targetModeId), dithering: String(dithering) };
  const visible = sidebarSettings(settingsLevel, values)
    .filter((definition) => (definition.isAvailable?.(context) ?? true) && definition.optionProvider === undefined);
  const hiddenModified = sidebarSettings("expert", values).length - sidebarSettings("expert", {}).length;
  const update = (definition: SettingDefinition, value: unknown) => applySettings(writeValue(conversionSettings, definition.id, value));

  const renderControl = (definition: SettingDefinition) => {
    const value = values[definition.id] ?? definition.defaultValue;
    const enabled = definition.isEnabled?.(values, context) ?? true;
    const common = { id: `sidebar-${definition.id}`, disabled: !enabled };
    const control = definition.control;
    switch (control.kind) {
      case "boolean": return <input {...common} type="checkbox" checked={Boolean(value)} onChange={(event) => update(definition, event.target.checked)} />;
      case "select": return <select {...common} value={String(value)} onChange={(event) => update(definition, control.options.find((option) => String(option.value) === event.target.value)?.value ?? event.target.value)}>
        {control.options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
      </select>;
      case "slider": return <div className="sidebar-slider">
        <input {...common} type="range" min={control.min} max={control.max} step={control.step} value={Number(value)} onChange={(event) => update(definition, Number(event.target.value))} />
        <output htmlFor={common.id}>{String(value)}{control.unit ?? ""}</output>
      </div>;
      case "number": return <input {...common} type="number" min={control.min} max={control.max} step={control.step} value={Number(value)} onChange={(event) => update(definition, Number(event.target.value))} />;
      case "color": return <input {...common} type="color" value={rgbToHex(value as RgbColor)} onChange={(event) => update(definition, hexToRgb(event.target.value))} />;
      default: return null;
    }
  };

  return (
    <aside className="settings-sidebar" aria-label="Conversion settings">
      <div className="settings-sidebar-header">
        <h2>Settings</h2>
        <div className="settings-tier" role="radiogroup" aria-label="Settings level">
          {SETTING_LEVELS.map((level) => <button key={level} type="button" role="radio" aria-checked={settingsLevel === level} className={settingsLevel === level ? "active" : ""} onClick={() => setSettingsLevel(level)}>{LEVEL_LABELS[level]}</button>)}
        </div>
        {hiddenModified > 0 && settingsLevel !== "expert" ? <p className="settings-sidebar-note">Modified settings from higher tiers stay visible.</p> : null}
      </div>
      <div className="settings-sidebar-body">
        {groupSidebarSettings(visible).map((group) => <fieldset key={group.category} className="settings-sidebar-group">
          <legend>{SETTING_CATEGORIES[group.category]}</legend>
          {group.definitions.map((definition) => <div className="settings-sidebar-row" key={definition.id}>
            <label htmlFor={`sidebar-${definition.id}`} title={definition.description}>{definition.label}</label>
            {renderControl(definition)}
          </div>)}
        </fieldset>)}
      </div>
      <div className="settings-sidebar-footer">
        <button type="button" className="secondary compact" onClick={() => setUiLayout("pro")}>Pro workspace…</button>
      </div>
    </aside>
  );
}
