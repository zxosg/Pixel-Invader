import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKBENCH_PREFERENCES,
  WORKBENCH_PREFERENCES_KEY,
  loadWorkbenchPreferences,
  moveWorkbenchWindowDock,
  reorderWorkbenchWindowOrder,
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
  it("reorders tiled windows before and after a target", () => {
    const order = ["settings", "tools", "geometry", "adjustments", "dithering"] as const;
    expect(reorderWorkbenchWindowOrder(order, "dithering", "tools", "before"))
      .toEqual(["settings", "dithering", "tools", "geometry", "adjustments"]);
    expect(reorderWorkbenchWindowOrder(order, "tools", "dithering", "after"))
      .toEqual(["settings", "geometry", "adjustments", "dithering", "tools"]);
  });

  it("appends a window when the destination dock has no target", () => {
    const order = ["settings", "tools", "geometry", "adjustments"] as const;
    expect(reorderWorkbenchWindowOrder(order, "tools", null, "append"))
      .toEqual(["settings", "geometry", "adjustments", "tools"]);
  });

  it("preserves destination proportions and normalizes both docks on a cross-dock move", () => {
    const layouts = {
      ...DEFAULT_WORKBENCH_PREFERENCES.windowLayouts,
      tools: { ...DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.tools, dock: "left" as const, dockRatio: 2, minimized: false },
      geometry: { ...DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.geometry, dock: "left" as const, dockRatio: 1, minimized: false },
      adjustments: { ...DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.adjustments, dock: "right" as const, dockRatio: 3, minimized: false },
      palette: { ...DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.palette, dock: "right" as const, dockRatio: 1, minimized: false },
    };
    const moved = moveWorkbenchWindowDock(layouts, "tools", "right", false);
    expect(moved.tools.dock).toBe("right");
    expect(moved.tools.dockRatio).toBeCloseTo(3 / 5);
    expect(moved.adjustments.dockRatio).toBeCloseTo(3 / 5 * 3);
    expect(moved.palette.dockRatio).toBeCloseTo(1 / 5 * 3);
    expect(moved.geometry.dockRatio).toBeCloseTo(1);
  });

  it("does not allocate a minimized moved window into active dock ratios", () => {
    const layouts = {
      ...DEFAULT_WORKBENCH_PREFERENCES.windowLayouts,
      tools: { ...DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.tools, dock: "left" as const, dockRatio: 2 },
      geometry: { ...DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.geometry, dock: "right" as const, dockRatio: 2 },
    };
    const moved = moveWorkbenchWindowDock(layouts, "tools", "right", true);
    expect(moved.tools.minimized).toBe(true);
    expect(moved.tools.dockRatio).toBe(2);
    expect(moved.geometry.dockRatio).toBe(2);
  });

  it("keeps same-dock proportions when only the minimized state changes", () => {
    const layouts = {
      ...DEFAULT_WORKBENCH_PREFERENCES.windowLayouts,
      tools: { ...DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.tools, dock: "bottom" as const, dockRatio: 2 },
      geometry: { ...DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.geometry, dock: "bottom" as const, dockRatio: 1 },
    };
    const moved = moveWorkbenchWindowDock(layouts, "tools", "bottom", true);
    expect(moved.tools.minimized).toBe(true);
    expect(moved.tools.dockRatio).toBe(2);
    expect(moved.geometry.dockRatio).toBe(1);
  });

  it("leaves the order unchanged for an unknown target", () => {
    const order = ["settings", "tools", "geometry"] as const;
    expect(reorderWorkbenchWindowOrder(order, "tools", "result", "before"))
      .toEqual(order);
  });

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
      toolsDock: "floating" as const,
      toolsFloatingX: 540,
      toolsFloatingY: 128,
      toolsFloatingWidth: 520,
      toolsFloatingHeight: 360,
      windowOrder: ["tools", "dithering", "palette", "geometry", "adjustments", "settings", "tilemap", "result", "source"] as const,
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
      tilemapFloating: true,
      tilemapFloatingX: 520,
      tilemapFloatingY: 96,
      tilemapFloatingWidth: 720,
      tilemapFloatingHeight: 420,
      tilemapFloatingAutoHeight: false,
      sourceFloating: true,
      sourceFloatingX: 64,
      sourceFloatingY: 72,
      sourceFloatingWidth: 640,
      sourceFloatingHeight: 420,
      sourceFloatingAutoHeight: false,
      resultFloating: true,
      resultFloatingX: 760,
      resultFloatingY: 72,
      resultFloatingWidth: 760,
      resultFloatingHeight: 420,
      resultFloatingAutoHeight: false,
      sourceDockedWidth: 1.2,
      resultDockedWidth: 0.8,
      windowLayouts: {
        ...DEFAULT_WORKBENCH_PREFERENCES.windowLayouts,
        source: {
          ...DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.source,
          dockRatio: 1.75,
        },
      },
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

  it("migrates the legacy Tools floating flag to the dock state", () => {
    const legacy = { ...DEFAULT_WORKBENCH_PREFERENCES, toolsFloating: true } as Record<string, unknown>;
    delete legacy.toolsDock;
    expect(loadWorkbenchPreferences(memoryStorage(JSON.stringify(legacy))).toolsDock)
      .toBe("floating");
  });

  it("migrates the aggregate settings layout into promoted window layouts", () => {
    const legacy = {
      ...DEFAULT_WORKBENCH_PREFERENCES,
      dock: "left" as const,
      minimized: false,
      toolsDock: "right" as const,
      toolsOpen: true,
      geometryFloating: true,
      sectionsOpen: {
        ...DEFAULT_WORKBENCH_PREFERENCES.sectionsOpen,
        geometry: false,
      },
    } as Record<string, unknown>;
    delete legacy.windowLayouts;
    const migrated = loadWorkbenchPreferences(memoryStorage(JSON.stringify(legacy)));
    expect(migrated.windowLayouts.geometry).toMatchObject({ dock: "floating", minimized: false, open: false });
    expect(migrated.windowLayouts.adjustments.dock).toBe("left");
    expect(migrated.windowLayouts.tools).toMatchObject({ dock: "right", minimized: false, open: true });
    expect(migrated.windowLayouts.source.dock).toBe("center");
  });

  it("rejects an invalid Tools dock state", () => {
    const storage = memoryStorage(JSON.stringify({
      ...DEFAULT_WORKBENCH_PREFERENCES,
      toolsDock: "diagonal",
    }));
    expect(loadWorkbenchPreferences(storage)).toEqual(DEFAULT_WORKBENCH_PREFERENCES);
  });

  it("appends source and result when migrating the current six-window order", () => {
    const legacy = { ...DEFAULT_WORKBENCH_PREFERENCES } as Record<string, unknown>;
    legacy.windowOrder = ["dithering", "palette", "tools", "settings", "geometry", "adjustments"];
    delete legacy.sourceFloating;
    delete legacy.sourceFloatingX;
    delete legacy.sourceFloatingY;
    delete legacy.sourceFloatingWidth;
    delete legacy.sourceFloatingHeight;
    delete legacy.sourceFloatingAutoHeight;
    delete legacy.resultFloating;
    delete legacy.resultFloatingX;
    delete legacy.resultFloatingY;
    delete legacy.resultFloatingWidth;
    delete legacy.resultFloatingHeight;
    delete legacy.resultFloatingAutoHeight;
    delete legacy.sourceDockedWidth;
    delete legacy.resultDockedWidth;
    expect(loadWorkbenchPreferences(memoryStorage(JSON.stringify(legacy))).windowOrder)
      .toEqual(["dithering", "palette", "tools", "settings", "geometry", "adjustments", "tilemap", "source", "result"]);
  });

  it("migrates the legacy four-window order when geometry and adjustments were not floatable", () => {
    const legacy = {
      ...DEFAULT_WORKBENCH_PREFERENCES,
      windowOrder: ["dithering", "palette", "tools", "settings"],
    };
    expect(loadWorkbenchPreferences(memoryStorage(JSON.stringify(legacy))).windowOrder)
      .toEqual(["settings", "tools", "geometry", "adjustments", "dithering", "palette", "tilemap", "source", "result"]);
  });

  it("rejects duplicate floating window order entries", () => {
    const storage = memoryStorage(JSON.stringify({
      ...DEFAULT_WORKBENCH_PREFERENCES,
      windowOrder: ["settings", "tools", "tools", "dithering"],
    }));
    expect(loadWorkbenchPreferences(storage)).toEqual(DEFAULT_WORKBENCH_PREFERENCES);
  });

  it("rejects invalid preview dimensions", () => {
    const storage = memoryStorage(JSON.stringify({
      ...DEFAULT_WORKBENCH_PREFERENCES,
      sourceFloatingWidth: 200,
    }));
    expect(loadWorkbenchPreferences(storage)).toEqual(DEFAULT_WORKBENCH_PREFERENCES);
  });

  it("preserves fully collapsed dock sizes", () => {
    const preferences = {
      ...DEFAULT_WORKBENCH_PREFERENCES,
      sideWidth: 0,
      bottomHeight: 0,
      windowLayouts: {
        ...DEFAULT_WORKBENCH_PREFERENCES.windowLayouts,
        tools: { ...DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.tools, dockSize: 0 },
        geometry: { ...DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.geometry, dockSize: 0 },
      },
    };
    const storage = memoryStorage();
    saveWorkbenchPreferences(storage, preferences);
    expect(loadWorkbenchPreferences(storage)).toEqual(preferences);
  });

  it("migrates tiled window ratios when older layouts omit them", () => {
    const legacy = JSON.parse(JSON.stringify(DEFAULT_WORKBENCH_PREFERENCES)) as Record<string, unknown>;
    const layouts = legacy.windowLayouts as Record<string, Record<string, unknown>>;
    const source = layouts.source;
    if (source === undefined) throw new Error("source layout missing");
    delete source.dockRatio;
    const loaded = loadWorkbenchPreferences(memoryStorage(JSON.stringify(legacy)));
    expect(loaded.windowLayouts.source.dockRatio).toBe(1);
  });

  it("rejects invalid tiled window ratios", () => {
    const invalid = JSON.parse(JSON.stringify(DEFAULT_WORKBENCH_PREFERENCES)) as Record<string, unknown>;
    const layouts = invalid.windowLayouts as Record<string, Record<string, unknown>>;
    const source = layouts.source;
    if (source === undefined) throw new Error("source layout missing");
    source.dockRatio = 0;
    expect(loadWorkbenchPreferences(memoryStorage(JSON.stringify(invalid)))).toEqual(DEFAULT_WORKBENCH_PREFERENCES);
  });

  it("migrates the current eight-window order by inserting Tilemap before previews", () => {
    const legacy = { ...DEFAULT_WORKBENCH_PREFERENCES } as Record<string, unknown>;
    legacy.windowOrder = ["settings", "tools", "geometry", "adjustments", "palette", "dithering", "source", "result"];
    delete legacy.tilemapFloating;
    delete legacy.tilemapFloatingX;
    delete legacy.tilemapFloatingY;
    delete legacy.tilemapFloatingWidth;
    delete legacy.tilemapFloatingHeight;
    delete legacy.tilemapFloatingAutoHeight;
    expect(loadWorkbenchPreferences(memoryStorage(JSON.stringify(legacy))).windowOrder)
      .toEqual(["settings", "tools", "geometry", "adjustments", "palette", "dithering", "tilemap", "source", "result"]);
    expect(loadWorkbenchPreferences(memoryStorage(JSON.stringify(legacy))).tilemapFloating).toBe(false);
  });

  it("rejects duplicate Tilemap window order entries", () => {
    const storage = memoryStorage(JSON.stringify({
      ...DEFAULT_WORKBENCH_PREFERENCES,
      windowOrder: ["settings", "tools", "geometry", "adjustments", "palette", "dithering", "tilemap", "tilemap", "result"],
    }));
    expect(loadWorkbenchPreferences(storage)).toEqual(DEFAULT_WORKBENCH_PREFERENCES);
  });

  it("rejects invalid Tilemap floating dimensions", () => {
    const storage = memoryStorage(JSON.stringify({
      ...DEFAULT_WORKBENCH_PREFERENCES,
      tilemapFloatingWidth: 240,
    }));
    expect(loadWorkbenchPreferences(storage)).toEqual(DEFAULT_WORKBENCH_PREFERENCES);
  });
});
