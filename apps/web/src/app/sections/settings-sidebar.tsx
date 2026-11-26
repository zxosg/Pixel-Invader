import { useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
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

const WIDTH_KEY = "pixel-invader.sidebar-width";
const MIN_WIDTH = 340;
const MAX_WIDTH = 520;
const clampWidth = (value: number) => Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(value)));
const storedWidth = () => {
  try { const value = Number(localStorage.getItem(WIDTH_KEY)); return value > 0 ? clampWidth(value) : 380; } catch { return 380; }
};

export function SettingsSidebar() {
  const s = useAppState();
  const [width, setWidth] = useState(storedWidth);
  const [closed, setClosed] = useState<ReadonlySet<SidebarSection>>(new Set(["geometry", "palette"]));
  const persist = (value: number) => { try { localStorage.setItem(WIDTH_KEY, String(value)); } catch { /* storage unavailable */ } };
  const startResize = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (e: globalThis.PointerEvent) => setWidth(clampWidth(window.innerWidth - e.clientX));
    const up = (e: globalThis.PointerEvent) => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); persist(clampWidth(window.innerWidth - e.clientX)); };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const resizeKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const delta = event.key === "ArrowLeft" ? 16 : event.key === "ArrowRight" ? -16 : 0;
    if (delta !== 0) { const next = clampWidth(width + delta); setWidth(next); persist(next); }
  };
  const sectionProps = (section: SidebarSection) => ({
    className: "settings-sidebar-group",
    open: !closed.has(section),
    onToggle: (event: { currentTarget: HTMLDetailsElement }) => {
      const open = event.currentTarget.open;
      setClosed((prev) => { const next = new Set(prev); if (open) next.delete(section); else next.add(section); return next; });
    },
  });
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
    <aside className="settings-sidebar" aria-label="Conversion settings" style={{ "--sidebar-width": `${width}px` } as CSSProperties}>
      <div className="settings-sidebar-resize" role="separator" aria-orientation="vertical" aria-label="Resize settings sidebar" tabIndex={0} onPointerDown={startResize} onKeyDown={resizeKey} />
      <div className="settings-sidebar-header">
        <h2>Settings</h2>
        <div className="settings-tier" role="radiogroup" aria-label="Settings level">
          {SETTING_LEVELS.map((level) => <button key={level} type="button" role="radio" aria-checked={settingsLevel === level} className={settingsLevel === level ? "active" : ""} onClick={() => setSettingsLevel(level)}>{LEVEL_LABELS[level]}</button>)}
        </div>
        {raised ? <p className="settings-sidebar-note">Modified settings from higher tiers stay visible.</p> : null}
      </div>
      <div className="settings-sidebar-body">
        <details {...sectionProps("geometry")}><summary>{SECTION_LABELS.geometry}</summary><GeometryControls level={levels.geometry} /></details>
        <details {...sectionProps("adjustments")}><summary>{SECTION_LABELS.adjustments}</summary><AdjustmentsControls level={levels.adjustments} /></details>
        <details {...sectionProps("palette")}><summary>{SECTION_LABELS.palette}</summary><PaletteControls level={levels.palette} /></details>
        <details {...sectionProps("dithering")}><summary>{SECTION_LABELS.dithering}</summary><DitheringControls level={levels.dithering} /></details>
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
