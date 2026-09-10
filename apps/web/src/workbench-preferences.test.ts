import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKBENCH_PREFERENCES,
  WORKBENCH_PREFERENCES_KEY,
  loadWorkbenchPreferences,
  saveWorkbenchPreferences,
} from "./workbench-preferences.js";

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: (key: string) => key === WORKBENCH_PREFERENCES_KEY ? value : null,
    setItem: (key: string, next: string) => {
      if (key === WORKBENCH_PREFERENCES_KEY) value = next;
    },
  };
}

describe("workbench preferences", () => {
  it("falls back safely for missing or malformed preferences", () => {
    expect(loadWorkbenchPreferences(memoryStorage("{broken")))
      .toEqual(DEFAULT_WORKBENCH_PREFERENCES);
  });

  it("round-trips the desktop workbench arrangement", () => {
    const storage = memoryStorage();
    const preferences = {
      ...DEFAULT_WORKBENCH_PREFERENCES,
      dock: "right" as const,
      minimized: false,
      sideWidth: 480,
      bottomHeight: 320,
      floatingX: 180,
      floatingY: 72,
      toolsFloating: true,
      toolsFloatingX: 540,
      toolsFloatingY: 128,
      toolsFloatingWidth: 520,
      toolsFloatingHeight: 360,
      windowOrder: ["tools", "dithering", "palette", "geometry", "adjustments", "settings"] as const,
      paletteFloating: true,
      paletteFloatingX: 220,
      paletteFloatingY: 80,
      paletteFloatingWidth: 640,
      paletteFloatingHeight: 420,
      ditheringFloating: true,
      ditheringFloatingX: 620,
      ditheringFloatingY: 112,
      ditheringFloatingWidth: 580,
      ditheringFloatingHeight: 400,
      toolsOpen: true,
      sectionsOpen: {
        ...DEFAULT_WORKBENCH_PREFERENCES.sectionsOpen,
        geometry: false,
        dithering: false,
      },
    };
    saveWorkbenchPreferences(storage, preferences);
    expect(loadWorkbenchPreferences(storage)).toEqual(preferences);
  });

  it("rejects incomplete or out-of-range values", () => {
    const storage = memoryStorage(JSON.stringify({
      ...DEFAULT_WORKBENCH_PREFERENCES,
      sideWidth: 900,
    }));
    expect(loadWorkbenchPreferences(storage)).toEqual(DEFAULT_WORKBENCH_PREFERENCES);
  });

  it("accepts legacy preferences without a saved window order", () => {
    const legacy = { ...DEFAULT_WORKBENCH_PREFERENCES } as Record<string, unknown>;
    delete legacy.windowOrder;
    expect(loadWorkbenchPreferences(memoryStorage(JSON.stringify(legacy)))).toMatchObject({
      windowOrder: DEFAULT_WORKBENCH_PREFERENCES.windowOrder,
    });
  });

  it("migrates the legacy four-window order when geometry and adjustments were not floatable", () => {
    const legacy = {
      ...DEFAULT_WORKBENCH_PREFERENCES,
      windowOrder: ["dithering", "palette", "tools", "settings"],
    };
    expect(loadWorkbenchPreferences(memoryStorage(JSON.stringify(legacy))).windowOrder)
      .toEqual(["settings", "tools", "geometry", "adjustments", "dithering", "palette"]);
  });

  it("rejects duplicate floating window order entries", () => {
    const storage = memoryStorage(JSON.stringify({
      ...DEFAULT_WORKBENCH_PREFERENCES,
      windowOrder: ["settings", "tools", "tools", "dithering"],
    }));
    expect(loadWorkbenchPreferences(storage)).toEqual(DEFAULT_WORKBENCH_PREFERENCES);
  });
});
