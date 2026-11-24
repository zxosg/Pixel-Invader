import type { AppState } from "../app-state.js";
import { BUILT_IN_PROFILE } from "../../profiles.js";
import { type BrightMode, type DitherEngineId, type DitheringMethod, ditherMethodForEngine, latestDitherEngineForMethod, type RgbColor, type TargetModeId } from "@retro-converter/conversion-core";
import { uiTypographyCssVariables, uiTypographyFromRecord } from "../../ui-typography.js";
import { filterSettings, resetSettingsCategory, SETTING_CATEGORIES, SETTING_FILTER_PRESETS, type SettingCategory, type SettingDefinition, type SettingPresetId, SETTINGS_REGISTRY, validateSettingsDraft } from "../../settings-registry.js";
import { type ApplicationSettings, DEFAULT_APPLICATION_SETTINGS } from "../../application-settings.js";
import { hexToRgb, rgbToHex } from "../../dithering-labels.js";
import { type CSSProperties } from "react";

export function SettingsDialog({ s }: { s: AppState }) {
  const {
    profiles,
    saveApplicationSettingsDraft,
    setSettingsBaseline,
    setSettingsCategory,
    setSettingsDraft,
    setSettingsOpen,
    setSettingsPreset,
    setSettingsSearch,
    settingsBaseline,
    settingsCategory,
    settingsDraft,
    settingsOpen,
    settingsPreset,
    settingsSearch,
    workspaceMode,
  } = s;
  return (
    <>{settingsOpen && settingsDraft !== null ? (() => {
     const draftProfile = profiles.find(({ id }) => id === settingsDraft.profileId) ?? BUILT_IN_PROFILE;
     const draftModes = Object.keys(draftProfile.palette.modes) as TargetModeId[];
     const draftTypography = uiTypographyFromRecord(settingsDraft);
     const visibleSettings = filterSettings(SETTINGS_REGISTRY, settingsSearch, settingsCategory, settingsPreset, settingsDraft, settingsBaseline ?? settingsDraft);
     const updateSetting = (definition: SettingDefinition, value: unknown) => {
       const next = { ...settingsDraft, [definition.id]: value };
       if (definition.id === "dithering") {
         next.ditherEngineId = latestDitherEngineForMethod(value as DitheringMethod);
       } else if (definition.id === "ditherEngineId") {
         next.dithering = ditherMethodForEngine(value as DitherEngineId);
       }
       setSettingsDraft(next);
     };
     const renderSettingControl = (definition: SettingDefinition) => {
       const value = settingsDraft[definition.id] ?? definition.defaultValue;
       const context = { workspaceMode, modeId: String(settingsDraft.modeId), dithering: String(settingsDraft.dithering) };
       const available = definition.isAvailable?.(context) ?? true;
       const enabled = available && (definition.isEnabled?.(settingsDraft, context) ?? true);
       const common = { id: `setting-${definition.id}`, "aria-describedby": `setting-help-${definition.id}` };
       if (definition.id === "profileId") return <select {...common} value={String(value)} onChange={(event) => {
         const profile = profiles.find(({ id }) => id === event.target.value) ?? BUILT_IN_PROFILE;
         setSettingsDraft({ ...settingsDraft, profileId: profile.id, presetId: profile.presets[0]?.id ?? "default", modeId: (Object.keys(profile.palette.modes)[0] ?? DEFAULT_APPLICATION_SETTINGS.modeId) as TargetModeId });
       }}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select>;
       if (definition.id === "presetId") return <select {...common} value={String(value)} onChange={(event) => updateSetting(definition, event.target.value)}>{draftProfile.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select>;
       if (definition.id === "modeId") return <select {...common} value={String(value)} onChange={(event) => updateSetting(definition, event.target.value)}>{draftModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select>;
       if (definition.id === "pmd85PaletteCalibrationId") {
         const draftModePalette = draftProfile.palette.modes[String(settingsDraft.modeId) as TargetModeId];
         const calibrations = draftModePalette?.calibrations ?? [];
         const baseCalibration = draftModePalette?.base_calibration_id;
         return <select {...common} value={String(value)} disabled={!enabled} onChange={(event) => updateSetting(definition, event.target.value)}>{baseCalibration === undefined ? null : <option value={baseCalibration}>{baseCalibration}</option>}{calibrations.map((calibration) => <option key={calibration.id} value={calibration.id}>{calibration.name}</option>)}</select>;
       }
       if (definition.control.kind === "boolean") return <input {...common} type="checkbox" checked={Boolean(value)} disabled={!enabled} onChange={(event) => updateSetting(definition, event.target.checked)} />;
       if (definition.control.kind === "color") {
         const color = value as RgbColor;
         return <div className="settings-color-control">
           <input {...common} type="color" value={rgbToHex(color)} disabled={!enabled} onChange={(event) => updateSetting(definition, hexToRgb(event.target.value))} />
           <span>{rgbToHex(color).toUpperCase()}</span>
         </div>;
       }
       if (definition.control.kind === "palette") {
         const selections = Array.isArray(value) ? value as Array<{ screenIndex: number; enabledColorIds: readonly number[]; brightMode?: BrightMode }> : [];
         const screens = draftProfile.palette.modes[String(settingsDraft.modeId) as TargetModeId]?.screens ?? [];
         return <div className="settings-palette-selector">{screens.map((screen, screenIndex) => {
           const selection = selections.find((candidate) => candidate.screenIndex === screenIndex) ?? { screenIndex, enabledColorIds: [] };
           return <div key={screenIndex} className="settings-palette-screen"><div className="settings-palette-colors">{screen.colors.map((color) => {
             const selected = selection.enabledColorIds.includes(color.id);
             const nextSelections = selections.map((candidate) => candidate.screenIndex === screenIndex ? { ...candidate, enabledColorIds: selected ? candidate.enabledColorIds.filter((id) => id !== color.id) : [...candidate.enabledColorIds, color.id].sort((a, b) => a - b) } : candidate);
             return <button key={color.id} type="button" className={`palette-option${selected ? " selected" : ""}`} disabled={!enabled} aria-label={`${selected ? "Remove" : "Add"} ${color.name}`} aria-pressed={selected} onClick={() => updateSetting(definition, nextSelections)}><span className="palette-swatch" style={{ background: selection.brightMode === "on" ? color.bright : color.normal }} /></button>;
           })}</div><select aria-label={`Screen ${screenIndex + 1} BRIGHT policy`} disabled={!enabled} value={selection.brightMode ?? "auto"} onChange={(event) => updateSetting(definition, selections.map((candidate) => candidate.screenIndex === screenIndex ? { ...candidate, brightMode: event.target.value as BrightMode } : candidate))}><option value="auto">BRIGHT auto</option><option value="on">BRIGHT on</option><option value="off">BRIGHT off</option></select></div>;
         })}</div>;
       }
       const selectControl = definition.control;
       if (selectControl.kind === "select") return <select {...common} value={String(value)} disabled={!enabled} onChange={(event) => {
         const option = selectControl.options.find((candidate) => String(candidate.value) === event.target.value);
         updateSetting(definition, option?.value ?? event.target.value);
       }}>{selectControl.options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select>;
       if (definition.control.kind === "slider") return <div className="settings-slider"><input {...common} type="range" min={definition.control.min} max={definition.control.max} step={definition.control.step} value={Number(value)} disabled={!enabled} onChange={(event) => updateSetting(definition, Number(event.target.value))} /><output htmlFor={common.id}>{String(value)}{definition.control.unit ?? ""}</output></div>;
       if (definition.control.kind === "number") return <input {...common} type="number" min={definition.control.min} max={definition.control.max} step={definition.control.step} value={Number(value)} disabled={!enabled} onChange={(event) => updateSetting(definition, Number(event.target.value))} />;
       return <input {...common} type="text" value={String(value)} disabled={!enabled} onChange={(event) => updateSetting(definition, event.target.value)} />;
     };
     return (
       <div className="settings-modal-backdrop" role="presentation" onMouseDown={(event) => {
         if (event.target === event.currentTarget) {
           setSettingsOpen(false);
           setSettingsDraft(null);
           setSettingsBaseline(null);
         }
       }}>
         <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="application-settings-title" onKeyDown={(event) => {
           if (event.key === "Escape") { setSettingsOpen(false); setSettingsDraft(null); setSettingsBaseline(null); }
         }}>
           <div className="settings-modal-header">
             <div>
               <h2 id="application-settings-title">Settings</h2>
               <p>Searchable settings for startup, conversion, workspace, and editing.</p>
             </div>
             <button className="secondary compact" type="button" onClick={() => {
               setSettingsOpen(false);
               setSettingsDraft(null);
             }}>×</button>
           </div>
           <div className="settings-toolbar">
             <input autoFocus type="search" placeholder="Search settings…" aria-label="Search settings" value={settingsSearch} onChange={(event) => setSettingsSearch(event.target.value)} />
             <select aria-label="Category" value={settingsCategory} onChange={(event) => setSettingsCategory(event.target.value as SettingCategory | "all")}><option value="all">All categories</option>{Object.entries(SETTING_CATEGORIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
             <select aria-label="Filter preset" value={settingsPreset} onChange={(event) => setSettingsPreset(event.target.value as SettingPresetId)}>{SETTING_FILTER_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select>
           </div>
           <div className="settings-result-count" role="status">{visibleSettings.length} setting{visibleSettings.length === 1 ? "" : "s"}</div>
           <section
             className="settings-typography-preview"
             style={uiTypographyCssVariables(draftTypography) as CSSProperties}
             aria-label="Typography preview"
           >
             <div className="settings-typography-preview-heading">Typography preview</div>
             <div className="typography-preview-window-title">Window title · Floating</div>
             <div className="typography-preview-label"><span>UI label</span><strong>Sample value</strong></div>
             <p className="typography-preview-body">Palette, Attributes, and Dithering body text uses the selected size and weight.</p>
             <code className="typography-preview-monospace">Diagnostic 0x7F · 256×192</code>
           </section>
           <div className="settings-modal-content">
             {visibleSettings.length === 0 ? <p className="settings-empty">No settings match your search or filters.</p> : Object.entries(SETTING_CATEGORIES).map(([category, label]) => {
               const definitions = visibleSettings.filter((definition) => definition.category === category);
               if (definitions.length === 0) return null;
               return <fieldset key={category} id={`settings-${category}`}><legend>{label}</legend>{definitions.map((definition) => {
                 const definitionContext = { workspaceMode, modeId: String(settingsDraft.modeId), dithering: String(settingsDraft.dithering) };
                 const definitionAvailable = definition.isAvailable?.(definitionContext) ?? true;
                 const definitionEnabled = definition.isEnabled?.(settingsDraft, definitionContext) ?? true;
                 return <div className="setting-row" key={definition.id}>
                 <div><label htmlFor={`setting-${definition.id}`}><span>{definition.label}</span>{Object.is(settingsDraft[definition.id], settingsBaseline?.[definition.id]) ? null : <span className="setting-modified" title="Modified">●</span>}</label><p id={`setting-help-${definition.id}`}>{definition.description}{definition.disabledReason && (!definitionAvailable || !definitionEnabled) ? ` ${definition.disabledReason}` : ""}</p></div>
                 <div className="setting-control">{renderSettingControl(definition)}</div>
               </div>;
               })}</fieldset>;
             })}
           </div>
           <div className="settings-modal-actions">
             <button className="secondary" type="button" onClick={() => {
               const category = settingsCategory === "all" ? "all" : settingsCategory;
               const label = category === "all" ? "all settings" : SETTING_CATEGORIES[category];
               if (window.confirm(`Reset ${label} to defaults?`)) {
                 setSettingsDraft(resetSettingsCategory(settingsDraft, category) as ApplicationSettings & Record<string, unknown>);
               }
             }}>{settingsCategory === "all" ? "Reset all" : `Reset ${SETTING_CATEGORIES[settingsCategory]}`}</button>
             <span className="action-spacer" aria-hidden="true" />
             <button className="secondary" type="button" onClick={() => { setSettingsOpen(false); setSettingsDraft(null); setSettingsBaseline(null); }}>Cancel</button>
             <button className="primary" type="button" onClick={saveApplicationSettingsDraft} disabled={Object.keys(validateSettingsDraft(settingsDraft).errors).length > 0}>Save</button>
           </div>
         </section>
       </div>
     );
   })() : null}</>
  );
}
