import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKSPACE_PREFERENCES,
  loadWorkspacePreferences,
  saveWorkspacePreferences,
} from "./workspace-preferences.js";

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => { value = next; },
  };
}

describe("workspace preferences", () => {
  it("falls back safely for missing or malformed preferences", () => {
    expect(loadWorkspacePreferences(memoryStorage("{broken") as unknown as Storage))
      .toEqual(DEFAULT_WORKSPACE_PREFERENCES);
  });

  it("round-trips a custom inspection layout", () => {
    const storage = memoryStorage();
    const preferences = {
      ...DEFAULT_WORKSPACE_PREFERENCES,
      layout: "custom" as const,
      sourceContent: "inspector" as const,
      resultContent: "palette-usage" as const,
      previewZoom: 8 as const,
      inspectionDrawerOpen: true,
    };
    saveWorkspacePreferences(storage as unknown as Storage, preferences);
    expect(loadWorkspacePreferences(storage as unknown as Storage)).toEqual(preferences);
  });

  it("rejects incomplete or unsupported values", () => {
    const storage = memoryStorage(JSON.stringify({
      ...DEFAULT_WORKSPACE_PREFERENCES,
      sourceContent: "unknown",
    }));
    expect(loadWorkspacePreferences(storage as unknown as Storage)).toEqual(DEFAULT_WORKSPACE_PREFERENCES);
  });

  it("migrates the removed tile editor pane to the unified editor", () => {
    const storage = memoryStorage(JSON.stringify({
      ...DEFAULT_WORKSPACE_PREFERENCES,
      layout: "custom",
      sourceContent: "tile-editor",
      resultContent: "tile-editor",
    }));

    expect(loadWorkspacePreferences(storage as unknown as Storage).sourceContent)
      .toBe("unified-editor");
    expect(loadWorkspacePreferences(storage as unknown as Storage).resultContent)
      .toBe("unified-editor");
  });

  it("accepts independent high zoom values and the bitmap editor pane", () => {
    const storage = memoryStorage(JSON.stringify({
      ...DEFAULT_WORKSPACE_PREFERENCES,
      layout: "editor",
      sourceContent: "result-image",
      resultContent: "bitmap-editor",
      sourceZoom: 8,
      resultZoom: 16,
    }));
    const loaded = loadWorkspacePreferences(storage as unknown as Storage);
    expect(loaded.layout).toBe("editor");
    expect(loaded.resultContent).toBe("bitmap-editor");
    expect(loaded.resultZoom).toBe(16);
  });
});
