import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPLICATION_SETTINGS,
  APPLICATION_SETTINGS_KEY,
  loadApplicationSettings,
  resolveApplicationSettings,
  saveApplicationSettings,
  validateApplicationSettings,
} from "./application-settings.js";

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    clear: () => { values.clear(); },
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

describe("application settings", () => {
  it("provides safe defaults and round-trips valid values", () => {
    const store = storage();
    expect(loadApplicationSettings(store)).toEqual(DEFAULT_APPLICATION_SETTINGS);
    const value = { ...DEFAULT_APPLICATION_SETTINGS, profileId: "custom", mouseWheelZoom: false };
    saveApplicationSettings(store, value);
    expect(store.getItem(APPLICATION_SETTINGS_KEY)).not.toBeNull();
    expect(loadApplicationSettings(store)).toEqual(value);
  });

  it("falls back for malformed storage", () => {
    const store = storage();
    store.setItem(APPLICATION_SETTINGS_KEY, "not json");
    expect(loadApplicationSettings(store)).toEqual(DEFAULT_APPLICATION_SETTINGS);
    expect(validateApplicationSettings({ ...DEFAULT_APPLICATION_SETTINGS, framing: "bad" })).toBeNull();
  });

  it("keeps older saved settings compatible with typography defaults", () => {
    const legacy = { ...DEFAULT_APPLICATION_SETTINGS } as Record<string, unknown>;
    delete legacy.uiFontFamily;
    delete legacy.windowTitleFontSize;
    delete legacy.windowTitleFontWeight;
    delete legacy.uiLabelFontSize;
    delete legacy.uiLabelFontWeight;
    delete legacy.uiBodyFontSize;
    delete legacy.uiBodyFontWeight;
    expect(validateApplicationSettings(legacy)).toMatchObject(DEFAULT_APPLICATION_SETTINGS);
  });

  it("normalizes invalid typography fields independently", () => {
    const result = validateApplicationSettings({
      ...DEFAULT_APPLICATION_SETTINGS,
      uiFontFamily: "missing",
      windowTitleFontSize: 99,
      uiLabelFontWeight: "heavy",
      uiBodyFontSize: 16,
    });
    expect(result).toMatchObject({
      uiFontFamily: DEFAULT_APPLICATION_SETTINGS.uiFontFamily,
      windowTitleFontSize: DEFAULT_APPLICATION_SETTINGS.windowTitleFontSize,
      uiLabelFontWeight: DEFAULT_APPLICATION_SETTINGS.uiLabelFontWeight,
      uiBodyFontSize: 16,
    });
  });

  it("normalizes legacy Custom startup layouts to Conversion", () => {
    expect(validateApplicationSettings({
      ...DEFAULT_APPLICATION_SETTINGS,
      workspaceLayout: "custom",
    })?.workspaceLayout).toBe("conversion");
  });

  it("migrates the legacy comparison flag to Development mode", () => {
    expect(validateApplicationSettings({
      ...DEFAULT_APPLICATION_SETTINGS,
      developmentMode: undefined,
      showCompareEngines: true,
    })).toMatchObject({ developmentMode: true });
    expect(validateApplicationSettings({
      ...DEFAULT_APPLICATION_SETTINGS,
      developmentMode: undefined,
      showCompareEngines: false,
    })).toMatchObject({ developmentMode: false });
  });

  it("prefers Development mode when both settings are present", () => {
    expect(validateApplicationSettings({
      ...DEFAULT_APPLICATION_SETTINGS,
      developmentMode: false,
      showCompareEngines: true,
    })?.developmentMode).toBe(false);
  });

  it("writes the canonical Development mode field", () => {
    const store = storage();
    saveApplicationSettings(store, {
      ...DEFAULT_APPLICATION_SETTINGS,
      developmentMode: true,
    });
    const saved = JSON.parse(store.getItem(APPLICATION_SETTINGS_KEY) ?? "null") as Record<string, unknown>;
    expect(saved.developmentMode).toBe(true);
    expect(saved.showCompareEngines).toBeUndefined();
  });

  it("resolves missing profile, preset, and incompatible mode", () => {
    const result = resolveApplicationSettings(
      { ...DEFAULT_APPLICATION_SETTINGS, profileId: "missing", presetId: "missing", modeId: "missing" as never },
      {
        profiles: [{ id: DEFAULT_APPLICATION_SETTINGS.profileId, presets: [{ id: "default" }, { id: "alt" }] }],
        compatibleModeIds: [DEFAULT_APPLICATION_SETTINGS.modeId],
      },
    );
    expect(result.profileId).toBe(DEFAULT_APPLICATION_SETTINGS.profileId);
    expect(result.presetId).toBe(DEFAULT_APPLICATION_SETTINGS.presetId);
    expect(result.modeId).toBe(DEFAULT_APPLICATION_SETTINGS.modeId);
  });
});
