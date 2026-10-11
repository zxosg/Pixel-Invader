import { describe, expect, it } from "vitest";
import {
  ENGINE_PREFERENCES_KEY,
  isAttributeOptimizerAvailableForTarget,
  loadEnginePreferences,
  resolveEnginePreferencesForTarget,
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

  it("retargets all ZX Mixed-only experimental optimizers to a usable single-screen baseline", () => {
    for (const attributeOptimizerId of [
      "zx-mixed-joint-cell-v1",
      "zx-mixed-joint-cell-v2",
      "zx-mixed-joint-quantized-v1",
    ] as const) {
      const resolved = resolveEnginePreferencesForTarget(
        { platformId: "zx-spectrum", modeId: "zx48-standard-256x192" },
        { attributeOptimizerId, ditherEngineId: "error-diffusion-decorrelated-v3" },
        "error-diffusion",
      );
      expect(resolved).toEqual({
        attributeOptimizerId: "zx-guide-reference-halo-v1",
        ditherEngineId: "error-diffusion-decorrelated-v3",
      });
    }
  });

  it("replaces a Mixed-only dither engine while retaining its method when leaving Mixed", () => {
    expect(resolveEnginePreferencesForTarget(
      { platformId: "zx-spectrum", modeId: "zx48-standard-256x192" },
      { attributeOptimizerId: "zx-mixed-joint-quantized-v1", ditherEngineId: "zx-mixed-dual-fs-v1" },
      "error-diffusion",
    )).toEqual({
      attributeOptimizerId: "zx-guide-reference-halo-v1",
      ditherEngineId: "error-diffusion-decorrelated-v3",
    });
  });

  it("preserves a compatible optimizer and engine and hides mode-exclusive optimizers", () => {
    expect(resolveEnginePreferencesForTarget(
      { platformId: "zx-spectrum", modeId: "zx48-mixed-256x192" },
      { attributeOptimizerId: "zx-mixed-joint-quantized-v1", ditherEngineId: "none-discrete-v2" },
      "none",
    )).toEqual({
      attributeOptimizerId: "zx-mixed-joint-quantized-v1",
      ditherEngineId: "none-discrete-v2",
    });
    expect(isAttributeOptimizerAvailableForTarget(
      "zx-spectrum", "zx48-standard-256x192", "zx-mixed-joint-cell-v1",
    )).toBe(false);
    expect(isAttributeOptimizerAvailableForTarget(
      "zx-spectrum", "zx48-mixed-256x192", "zx-mixed-joint-cell-v1",
    )).toBe(true);
  });
});
