import {
  ATTRIBUTE_OPTIMIZERS,
  DITHER_ENGINES,
  isCompatibleEnginePair,
  latestDitherEngineForMethod,
  outputScreenCount,
  type AttributeHeight,
  type AttributeOptimizerId,
  type ConversionSettings,
  type DitherEngineId,
  type DitheringMethod,
  type PaletteSelection,
  type TargetModeId,
} from "@retro-converter/conversion-core";
import { resolveApplicationSettings, type ApplicationSettings } from "./application-settings.js";
import type { ConversionProfile } from "./profiles.js";

export interface SettingsSaveInput {
  readonly draft: Readonly<Record<string, unknown>>;
  readonly current: ConversionSettings;
  readonly profiles: readonly ConversionProfile[];
}

export interface CanonicalSettingsSave {
  readonly application: ApplicationSettings;
  readonly conversion: ConversionSettings;
  readonly profile: ConversionProfile;
}

function numberValue(draft: Readonly<Record<string, unknown>>, id: string, fallback: number): number {
  const value = draft[id];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanValue(draft: Readonly<Record<string, unknown>>, id: string, fallback: boolean): boolean {
  return typeof draft[id] === "boolean" ? draft[id] as boolean : fallback;
}

function stringValue(draft: Readonly<Record<string, unknown>>, id: string, fallback: string): string {
  return typeof draft[id] === "string" ? draft[id] as string : fallback;
}

function rgbValue(
  draft: Readonly<Record<string, unknown>>,
  id: string,
  fallback: ConversionSettings["background"],
): ConversionSettings["background"] {
  const value = draft[id];
  if (typeof value !== "object" || value === null) return fallback;
  const color = value as Record<string, unknown>;
  return [color.r, color.g, color.b].every((channel) =>
    typeof channel === "number" && Number.isInteger(channel) && channel >= 0 && channel <= 255,
  )
    ? { r: color.r as number, g: color.g as number, b: color.b as number }
    : fallback;
}

function canonicalPaletteSelections(
  profile: ConversionProfile,
  modeId: TargetModeId,
  requested: unknown,
  fallback: readonly PaletteSelection[],
): readonly PaletteSelection[] {
  const mode = profile.palette.modes[modeId];
  const count = mode?.screen_count ?? outputScreenCount(modeId);
  const requestedSelections = Array.isArray(requested)
    ? requested as readonly PaletteSelection[]
    : fallback;
  return Array.from({ length: count }, (_, screenIndex) => {
    const candidate = requestedSelections[screenIndex] ?? requestedSelections[0] ?? fallback[0]!;
    const selection = Array.isArray(candidate?.enabledColorIds)
      ? candidate
      : fallback[0]!;
    const colors = mode?.screens[screenIndex]?.colors ?? mode?.screens[0]?.colors ?? [];
    const available = new Set(colors.map((color) => color.id));
    const enabledColorIds = selection.enabledColorIds.filter((id) => available.has(id));
    const normalized = {
      screenIndex,
      enabledColorIds: enabledColorIds.length > 0
        ? [...new Set(enabledColorIds)]
        : colors.map((color) => color.id),
    };
    return profile.platform_id === "zx-spectrum"
      ? { ...normalized, brightMode: selection.brightMode ?? "auto" as const }
      : normalized;
  });
}

function canonicalAttributeOptimizer(
  profile: ConversionProfile,
  modeId: TargetModeId,
  requested: unknown,
  preset: ConversionSettings | undefined,
  current: AttributeOptimizerId,
): AttributeOptimizerId {
  const compatible = ATTRIBUTE_OPTIMIZERS.filter((optimizer) =>
    optimizer.platforms.includes(profile.platform_id as never) &&
    (optimizer.targetModeIds === undefined || optimizer.targetModeIds.includes(modeId)),
  );
  const requestedId = typeof requested === "string" ? requested : current;
  return compatible.find((optimizer) => optimizer.id === requestedId)?.id ??
    compatible.find((optimizer) => optimizer.id === preset?.attributeOptimizerId)?.id ??
    compatible[0]?.id ?? current;
}

function canonicalDitherEngine(
  profile: ConversionProfile,
  modeId: TargetModeId,
  method: DitheringMethod,
  requested: unknown,
  optimizer: AttributeOptimizerId,
  current: DitherEngineId,
): DitherEngineId {
  const compatible = DITHER_ENGINES.filter((engine) =>
    engine.method === method &&
    engine.platforms.includes(profile.platform_id as never) &&
    (engine.targetModeIds === undefined || engine.targetModeIds.includes(modeId)) &&
    (modeId !== "zx48-mixed-256x192" || !("family" in engine)) &&
    (profile.platform_id === "sinclair-ql" || isCompatibleEnginePair(optimizer, engine.id)),
  );
  const requestedId = typeof requested === "string" ? requested : current;
  return compatible.find((engine) => engine.id === requestedId)?.id ??
    [...compatible].reverse().find((engine) => engine.lifecycle !== "experimental")?.id ??
    (method === "none" && profile.platform_id === "zx-spectrum" ? "none-discrete-v2" : latestDitherEngineForMethod(method));
}

export function canonicalizeSettingsForSave({ draft, current, profiles }: SettingsSaveInput): CanonicalSettingsSave {
  const profile = profiles.find((candidate) => candidate.id === draft.profileId) ?? profiles[0]!;
  const profileIds = profiles.map((candidate) => ({
    id: candidate.id,
    presets: candidate.presets.map((preset) => ({ id: preset.id })),
  }));
  const application = resolveApplicationSettings({
    profileId: stringValue(draft, "profileId", profile.id),
    presetId: stringValue(draft, "presetId", profile.presets[0]?.id ?? "default"),
    modeId: stringValue(draft, "modeId", profile.presets[0]?.settings.modeId ?? current.modeId) as TargetModeId,
    framing: stringValue(draft, "framing", current.framing) as ApplicationSettings["framing"],
    dithering: stringValue(draft, "dithering", current.dithering) as DitheringMethod,
    ditheringAmount: numberValue(draft, "ditheringAmount", current.ditheringAmount),
    workspaceLayout: stringValue(draft, "workspaceLayout", "conversion") as ApplicationSettings["workspaceLayout"],
    mouseWheelZoom: booleanValue(draft, "mouseWheelZoom", true),
    synchronizePan: booleanValue(draft, "synchronizePan", true),
    synchronizeZoom: booleanValue(draft, "synchronizeZoom", true),
    showCompareEngines: booleanValue(draft, "showCompareEngines", false),
  }, {
    profiles: profileIds,
    compatibleModeIds: Object.keys(profile.palette.modes),
  });
  const selectedProfile = profiles.find((candidate) => candidate.id === application.profileId) ?? profile;
  const preset = selectedProfile.presets.find((candidate) => candidate.id === application.presetId);
  const base = preset?.settings ?? current;
  const modeId = application.modeId;
  const attributeOptimizerId = canonicalAttributeOptimizer(
    selectedProfile,
    modeId,
    draft.attributeOptimizerId,
    preset?.settings,
    base.attributeOptimizerId,
  );
  const dithering = application.dithering;
  const ditherEngineId = canonicalDitherEngine(
    selectedProfile,
    modeId,
    dithering,
    draft.ditherEngineId,
    attributeOptimizerId,
    base.ditherEngineId,
  );
  const ditheringAmount = Math.round(numberValue(draft, "ditheringAmount", base.ditheringAmount));
  const attributeHeight = selectedProfile.platform_id === "pmd-85"
    ? modeId === "pmd85-colorace" ? 2 : 1
    : modeId.includes("vertical-spatial") ? 1 : numberValue(draft, "attributeHeight", base.attributeHeight) as AttributeHeight;
  const modePalette = selectedProfile.palette.modes[modeId];
  const calibrationIds = [modePalette?.base_calibration_id, ...(modePalette?.calibrations ?? []).map((calibration) => calibration.id)]
    .filter((id): id is string => id !== undefined);
  const requestedCalibration = stringValue(draft, "pmd85PaletteCalibrationId", base.pmd85.paletteCalibrationId);
  const paletteCalibrationId = calibrationIds.length === 0 || calibrationIds.includes(requestedCalibration)
    ? requestedCalibration
    : calibrationIds[0]!;
  const conversion: ConversionSettings = {
    ...base,
    profileId: selectedProfile.id,
    platformId: selectedProfile.platform_id,
    modeId,
    attributeOptimizerId,
    ditherEngineId,
    qlMixedOptimizerId: stringValue(draft, "qlMixedOptimizerId", base.qlMixedOptimizerId) as ConversionSettings["qlMixedOptimizerId"],
    paletteSelections: canonicalPaletteSelections(selectedProfile, modeId, draft.paletteSelections, base.paletteSelections),
    framing: application.framing,
    resampling: stringValue(draft, "resampling", base.resampling) as ConversionSettings["resampling"],
    rotation: numberValue(draft, "rotation", base.rotation) as ConversionSettings["rotation"],
    mirrorHorizontal: booleanValue(draft, "mirrorHorizontal", base.mirrorHorizontal),
    mirrorVertical: booleanValue(draft, "mirrorVertical", base.mirrorVertical),
    fillOffsetX: draft.fillOffsetX === null ? null : numberValue(draft, "fillOffsetX", base.fillOffsetX ?? 0),
    fillOffsetY: draft.fillOffsetY === null ? null : numberValue(draft, "fillOffsetY", base.fillOffsetY ?? 0),
    panOffsetX: numberValue(draft, "panOffsetX", base.panOffsetX),
    panOffsetY: numberValue(draft, "panOffsetY", base.panOffsetY),
    panEdgeMode: stringValue(draft, "panEdgeMode", base.panEdgeMode) as ConversionSettings["panEdgeMode"],
    crop: {
      x: numberValue(draft, "cropX", base.crop.x),
      y: numberValue(draft, "cropY", base.crop.y),
      width: numberValue(draft, "cropWidth", base.crop.width),
      height: numberValue(draft, "cropHeight", base.crop.height),
    },
    cropAspectRatio: stringValue(draft, "cropAspectRatio", base.cropAspectRatio) as ConversionSettings["cropAspectRatio"],
    brightness: numberValue(draft, "brightness", base.brightness),
    contrast: numberValue(draft, "contrast", base.contrast),
    saturation: numberValue(draft, "saturation", base.saturation),
    gamma: numberValue(draft, "gamma", base.gamma),
    smoothing: numberValue(draft, "smoothing", base.smoothing),
    sharpening: numberValue(draft, "sharpening", base.sharpening),
    background: rgbValue(draft, "background", base.background),
    borderColor: numberValue(draft, "borderColor", base.borderColor),
    attributeHeight,
    attributeSmoothing: numberValue(draft, "attributeSmoothing", base.attributeSmoothing),
    attributeHaloInfluence: numberValue(draft, "attributeHaloInfluence", base.attributeHaloInfluence),
    attributeHaloHorizontal: numberValue(draft, "attributeHaloHorizontal", base.attributeHaloHorizontal) as ConversionSettings["attributeHaloHorizontal"],
    attributeHaloVertical: numberValue(draft, "attributeHaloVertical", base.attributeHaloVertical) as ConversionSettings["attributeHaloVertical"],
    screenFlickerSuppression: booleanValue(draft, "screenFlickerSuppression", base.screenFlickerSuppression),
    dithering,
    ditheringAmount,
    errorDiffusionRandomization: numberValue(draft, "errorDiffusionRandomization", base.errorDiffusionRandomization),
    errorDiffusionLineSuppression: numberValue(draft, "errorDiffusionLineSuppression", base.errorDiffusionLineSuppression),
    orderedMatrix: stringValue(draft, "orderedMatrix", base.orderedMatrix) as ConversionSettings["orderedMatrix"],
    artisticPattern: stringValue(draft, "artisticPattern", base.artisticPattern ?? "auto") as NonNullable<ConversionSettings["artisticPattern"]>,
    structured: {
      ...base.structured,
      ditherAmountPermille: dithering === "none" ? 0 : ditheringAmount * 10,
    },
    pmd85: {
      ...base.pmd85,
      paletteCalibrationId,
      gapPolicy: stringValue(draft, "pmd85GapPolicy", base.pmd85.gapPolicy) as ConversionSettings["pmd85"]["gapPolicy"],
    },
  };
  return { application, conversion, profile: selectedProfile };
}
