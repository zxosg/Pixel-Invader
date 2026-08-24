import { describe, expect, it } from "vitest";
import {
  ENGINE_PREFERENCES_KEY,
  loadEnginePreferences,
  saveEnginePreferences,
} from "./engine-preferences.js";

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: (key: string) => key === ENGINE_PREFERENCES_KEY ? value : null,
    setItem: (key: string, next: string) => {
      if (key === ENGINE_PREFERENCES_KEY) value = next;
    },
  };
}

describe("engine preferences", () => {
  it("falls back safely when no valid preference exists", () => {
    expect(loadEnginePreferences(memoryStorage("{broken")))
      .toEqual({
        attributeOptimizerId: "zx-guide-reference-halo-v1",
        ditherEngineId: "none-discrete-v2",
      });
  });

  it("round-trips the last selected engines", () => {
    const storage = memoryStorage();
    saveEnginePreferences(storage, {
      attributeOptimizerId: "zx-guide-reference-halo-v1",
      ditherEngineId: "error-diffusion-unrestricted-v2",
    });
    expect(loadEnginePreferences(storage)).toEqual({
      attributeOptimizerId: "zx-guide-reference-halo-v1",
      ditherEngineId: "error-diffusion-unrestricted-v2",
    });
  });

  it("replaces unknown IDs independently with safe defaults", () => {
    const storage = memoryStorage(JSON.stringify({
      attributeOptimizerId: "unknown",
      ditherEngineId: "ordered-unrestricted-v2",
    }));
    expect(loadEnginePreferences(storage)).toEqual({
      attributeOptimizerId: "zx-guide-reference-halo-v1",
      ditherEngineId: "ordered-unrestricted-v2",
    });
  });

  it("rejects retained engines that do not support the startup target", () => {
    const storage = memoryStorage(JSON.stringify({
      attributeOptimizerId: "zx-vertical-spatial-uniform-v1",
      ditherEngineId: "vertical-spatial-ordered-v1",
    }));
    expect(loadEnginePreferences(storage, {
      platformId: "zx-spectrum",
      modeId: "zx48-standard-256x192",
    })).toEqual({
      attributeOptimizerId: "zx-guide-reference-halo-v1",
      ditherEngineId: "none-discrete-v2",
    });
  });
});
