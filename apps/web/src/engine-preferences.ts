import {
  ATTRIBUTE_OPTIMIZERS,
  DITHER_ENGINES,
  isCompatibleEnginePair,
  type AttributeOptimizerId,
  type DitherEngineId,
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
    return supportsTarget && isCompatibleEnginePair(attributeOptimizerId, ditherEngineId)
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
