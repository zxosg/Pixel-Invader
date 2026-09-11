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

  it("normalizes legacy Custom startup layouts to Conversion", () => {
    expect(validateApplicationSettings({
      ...DEFAULT_APPLICATION_SETTINGS,
      workspaceLayout: "custom",
    })?.workspaceLayout).toBe("conversion");
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
