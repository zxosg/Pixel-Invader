import { describe, expect, it } from "vitest";
import {
  SAVED_WORKBENCH_LAYOUTS_KEY,
  createSavedWorkbenchLayoutId,
  loadSavedWorkbenchLayouts,
  normalizeSavedLayoutName,
  saveSavedWorkbenchLayouts,
} from "./saved-workbench-layouts.js";
import { DEFAULT_WORKBENCH_PREFERENCES } from "./workbench-preferences.js";
import { DEFAULT_WORKSPACE_PREFERENCES } from "./workspace-preferences.js";

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: (key: string) => key === SAVED_WORKBENCH_LAYOUTS_KEY ? value : null,
    setItem: (key: string, next: string) => {
      if (key === SAVED_WORKBENCH_LAYOUTS_KEY) value = next;
    },
  };
}

describe("saved workbench layouts", () => {
  it("normalizes names and creates stable-readable ids", () => {
    expect(normalizeSavedLayoutName("  Palette   review  ")).toBe("Palette review");
    expect(createSavedWorkbenchLayoutId("Palette review")).toMatch(/^palette-review-[a-z0-9]+$/);
  });

  it("round-trips valid saved layouts", () => {
    const storage = memoryStorage();
    const layout = {
      id: "palette-review-abc",
      name: "Palette review",
      workspaceMode: "palette" as const,
      workspace: DEFAULT_WORKSPACE_PREFERENCES,
      workbench: DEFAULT_WORKBENCH_PREFERENCES,
    };
    saveSavedWorkbenchLayouts(storage, [layout]);
    expect(loadSavedWorkbenchLayouts(storage)).toEqual([layout]);
  });

  it("ignores malformed entries", () => {
    const storage = memoryStorage(JSON.stringify([
      { id: "ok", name: "Okay", workspaceMode: "palette", workspace: {}, workbench: {} },
      { id: "bad", name: "", workspaceMode: "palette", workspace: {}, workbench: {} },
      "bad",
    ]));
    expect(loadSavedWorkbenchLayouts(storage)).toHaveLength(1);
    expect(loadSavedWorkbenchLayouts(storage)[0]?.id).toBe("ok");
  });
});
