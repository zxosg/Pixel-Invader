import {
  ATTRIBUTE_OPTIMIZERS,
  DITHER_ENGINES,
  isCompatibleEnginePair,
  type AttributeOptimizerId,
  type DitherEngineId,
  type DitheringMethod,
  type PlatformId,
  type TargetModeId,
} from "@retro-converter/conversion-core";

export const ENGINE_PREFERENCES_KEY = "retro-converter.engine-preferences.v1";
const DEFAULT_APP_ENGINE_PREFERENCES: EnginePreferences = {
  attributeOptimizerId: "zx-guide-reference-halo-v1",
  ditherEngineId: "none-discrete-v2",
};

export interface EnginePreferences {
  readonly attributeOptimizerId: AttributeOptimizerId;
  readonly ditherEngineId: DitherEngineId;
}

function supportsTarget(
  descriptor: { readonly platforms: readonly string[]; readonly targetModeIds?: readonly TargetModeId[] },
  platformId: PlatformId,
  modeId: TargetModeId,
): boolean {
  return descriptor.platforms.includes(platformId) &&
    (descriptor.targetModeIds === undefined || descriptor.targetModeIds.includes(modeId));
}

export function isAttributeOptimizerAvailableForTarget(
  platformId: PlatformId,
  modeId: TargetModeId,
  optimizerId: AttributeOptimizerId,
): boolean {
  const optimizer = ATTRIBUTE_OPTIMIZERS.find(({ id }) => id === optimizerId);
  return optimizer !== undefined && supportsTarget(optimizer, platformId, modeId);
}

/** Keep the active optimizer and dither engine legal when hardware mode changes. */
export function resolveEnginePreferencesForTarget(
  target: { readonly platformId: PlatformId; readonly modeId: TargetModeId },
  requested: EnginePreferences,
  method: DitheringMethod,
): EnginePreferences {
  const optimizerSupportsTarget = (optimizerId: AttributeOptimizerId): boolean => {
    // Sinclair QL has no ZX-style attribute optimizer; the field is ignored.
    return target.platformId === "sinclair-ql" ||
      isAttributeOptimizerAvailableForTarget(target.platformId, target.modeId, optimizerId);
  };
  const preferredOptimizerIds: readonly AttributeOptimizerId[] = target.platformId === "zx-spectrum"
    ? target.modeId.includes("vertical-spatial")
      ? ["zx-vertical-spatial-uniform-v1", "zx-adaptive-v1", "zx-guide-reference-halo-v1"]
      : ["zx-guide-reference-halo-v1", "zx-adaptive-v1", "zx-source-cell-v1"]
    : target.platformId === "pmd-85"
      ? target.modeId.includes("vertical-spatial")
        ? ["pmd85-vertical-spatial-uniform-v1", "pmd85-vertical-spatial-detail-v2", "pmd85-cell-v1"]
        : ["pmd85-cell-v1", "pmd85-vertical-spatial-uniform-v1"]
      : [requested.attributeOptimizerId];
  const attributeOptimizerId = optimizerSupportsTarget(requested.attributeOptimizerId)
    ? requested.attributeOptimizerId
    : preferredOptimizerIds.find(optimizerSupportsTarget) ??
      ATTRIBUTE_OPTIMIZERS.find((optimizer) => supportsTarget(optimizer, target.platformId, target.modeId))?.id ??
      requested.attributeOptimizerId;

  const engineAvailable = (ditherEngineId: DitherEngineId): boolean => {
    const engine = DITHER_ENGINES.find(({ id }) => id === ditherEngineId);
    return engine?.method === method &&
      supportsTarget(engine, target.platformId, target.modeId) &&
      (target.platformId === "sinclair-ql" || isCompatibleEnginePair(attributeOptimizerId, ditherEngineId)) &&
      (target.modeId !== "zx48-mixed-256x192" || engine.family === undefined);
  };
  if (engineAvailable(requested.ditherEngineId)) {
    return { attributeOptimizerId, ditherEngineId: requested.ditherEngineId };
  }

  const preferredEngineIds: readonly DitherEngineId[] = target.modeId.includes("vertical-spatial")
    ? [
        method === "none" ? "vertical-spatial-none-v1" :
          method === "ordered" ? "vertical-spatial-ordered-v1" : "vertical-spatial-error-diffusion-v1",
      ]
    : [
        method === "none" ? "none-discrete-v2" :
          method === "ordered" && target.modeId === "zx48-mixed-256x192" ? "ordered-mixed-phase-stable-v8" :
            method === "ordered" ? "ordered-strict-matrix-v6" : "error-diffusion-decorrelated-v3",
      ];
  const fallbackEngine = preferredEngineIds.find(engineAvailable) ??
    DITHER_ENGINES.find((engine) => engine.method === method && engineAvailable(engine.id))?.id;
  if (fallbackEngine === undefined) {
    throw new RangeError(`No ${method} dither engine supports ${target.platformId} mode ${target.modeId}.`);
  }
  return { attributeOptimizerId, ditherEngineId: fallbackEngine };
}

interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function loadEnginePreferences(
  storage: PreferenceStorage,
  target?: {
    readonly platformId: PlatformId;
    readonly modeId: TargetModeId;
  },
): EnginePreferences {
  const fallback = DEFAULT_APP_ENGINE_PREFERENCES;
  try {
    const parsed = JSON.parse(storage.getItem(ENGINE_PREFERENCES_KEY) ?? "null") as {
      attributeOptimizerId?: unknown;
      ditherEngineId?: unknown;
    } | null;
    if (parsed === null) return fallback;
    const attributeOptimizerId = ATTRIBUTE_OPTIMIZERS.some(
      ({ id }) => id === parsed.attributeOptimizerId,
    )
      ? parsed.attributeOptimizerId as AttributeOptimizerId
      : fallback.attributeOptimizerId;
    const ditherEngineId = DITHER_ENGINES.some(
      ({ id }) => id === parsed.ditherEngineId,
    )
      ? parsed.ditherEngineId as DitherEngineId
      : fallback.ditherEngineId;
    const optimizer = ATTRIBUTE_OPTIMIZERS.find(({ id }) => id === attributeOptimizerId);
    const dither = DITHER_ENGINES.find(({ id }) => id === ditherEngineId);
    const supportsTarget = target === undefined || (
      optimizer?.platforms.includes(target.platformId as never) === true &&
      (optimizer.targetModeIds === undefined || optimizer.targetModeIds.includes(target.modeId)) &&
      dither?.platforms.includes(target.platformId as never) === true &&
      (dither.targetModeIds === undefined || dither.targetModeIds.includes(target.modeId))
    );
    return supportsTarget &&
      (target?.platformId === "sinclair-ql" || isCompatibleEnginePair(attributeOptimizerId, ditherEngineId))
      ? { attributeOptimizerId, ditherEngineId }
      : fallback;
  } catch {
    return fallback;
  }
}

export function saveEnginePreferences(
  storage: PreferenceStorage,
  preferences: EnginePreferences,
): void {
  try {
    storage.setItem(ENGINE_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences are optional; conversion remains available without storage.
  }
}
