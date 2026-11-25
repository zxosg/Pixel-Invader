import { useEffect, useRef, useState } from "react";
import { type WorkspaceConversionMode } from "../projects.js";
import { type CharsetDistanceMetric, type CharsetEncoding, type CharsetSource, type DerivedCharsetStrategy } from "@retro-converter/zx-charset";
import { type CharsetTilesView, type ResultOrigin, type SourceArtifactInfo } from "../app-types.js";
import { BUILT_IN_PROFILE, BUILT_IN_PROFILES, type ConversionProfile, loadStoredProfiles } from "../profiles.js";
import { loadWorkbenchPreferences } from "../workbench-preferences.js";
import { type ApplicationSettings, DEFAULT_APPLICATION_SETTINGS, loadApplicationSettings, resolveApplicationSettings, saveApplicationSettings } from "../application-settings.js";
import { loadUiLayout, saveUiLayout, type UiLayout } from "../ui-layout.js";
import { loadEnginePreferences } from "../engine-preferences.js";
import { type AttributeHaloRadius, type AttributeHeight, type AttributeOptimizerId, type ConversionSettings, type CropAspectRatio, type CustomDiffusionKernelDefinition, type CustomOrderedMatrixDefinition, DEFAULT_CONVERSION_SETTINGS, type DitherEngineId, type DitheringMethod, ditherMethodForEngine, type FramingMode, type OrderedMatrixId, type PaletteSelection, type PanEdgeMode, type QlMixedOptimizerId, type ResamplingMethod, resolveZxPalette, type RgbColor, type Rotation, type StructuredConversionSettings, type TargetModeId, type ZxPaletteDefinition } from "@retro-converter/conversion-core";
import { type WorkerDecodedImage } from "../worker/client.js";
import { ZX_BASE_COLORS } from "../inspection.js";
import { rgbToHex } from "../dithering-labels.js";
import { structuredSettingsForOptimizer } from "../optimizer-settings.js";
import type { useRuntimeState } from "./use-runtime-state.js";

export function useSettingsState(
  { setTilemapPutActive, tilemapPutPointerRef }: Pick<ReturnType<typeof useRuntimeState>, "setTilemapPutActive" | "tilemapPutPointerRef">,
) {
  const [workspaceMode, setWorkspaceMode] =
    useState<WorkspaceConversionMode>("palette");
  useEffect(() => {
    if (workspaceMode === "tilemap") return;
    tilemapPutPointerRef.current = null;
    setTilemapPutActive(false);
  }, [workspaceMode]);
  const [tilemapStale, setTilemapStale] = useState(false);
  const [specsciiDocumentName, setSpecsciiDocumentName] = useState<string | null>(null);
  const [specsciiBorder, setSpecsciiBorder] = useState(0);
  const [specsciiAuthor, setSpecsciiAuthor] = useState("");
  const [specsciiImageName, setSpecsciiImageName] = useState("");
  const [charsetSource, setCharsetSource] = useState<CharsetSource>("derived");
  const [charsetEncoding, setCharsetEncoding] = useState<CharsetEncoding>("compact");
  const [charsetBudget, setCharsetBudget] = useState(32);
  const [charsetAllowTransforms, setCharsetAllowTransforms] = useState(true);
  const [charsetAllowPolarity, setCharsetAllowPolarity] = useState(true);
  const [charsetStrategy, setCharsetStrategy] =
    useState<DerivedCharsetStrategy>("image-similarity-v2");
  const [charsetDistance, setCharsetDistance] =
    useState<CharsetDistanceMetric>("hybrid");
  const [charsetVisualWeighting, setCharsetVisualWeighting] = useState(false);
  const [existingCharset, setExistingCharset] = useState<Uint8Array | null>(null);
  const [existingCharsetName, setExistingCharsetName] = useState<string | null>(null);
  const [charsetTilesView, setCharsetTilesView] = useState<CharsetTilesView>("output");
  const [charsetSelectionMode, setCharsetSelectionMode] = useState(false);
  const [selectedSourceCharsetTile, setSelectedSourceCharsetTile] = useState<number | null>(null);
  const [emittedSourceCharsetIndices, setEmittedSourceCharsetIndices] = useState<readonly (number | null)[] | null>(null);
  const [builtInSpecsciiCharset, setBuiltInSpecsciiCharset] = useState<Uint8Array | null>(null);
  const [builtInSpecsciiFontError, setBuiltInSpecsciiFontError] = useState<string | null>(null);
  const [existingCharsetStart, setExistingCharsetStart] = useState(0);
  const [existingCharsetLength, setExistingCharsetLength] = useState(0);
  const [existingCharsetStartEntry, setExistingCharsetStartEntry] =
    useState("1");
  const [existingCharsetLengthEntry, setExistingCharsetLengthEntry] =
    useState("0");
  const [existingCharsetSelection, setExistingCharsetSelection] =
    useState<readonly number[] | null>(null);
  const [lastFinalCompletedAt, setLastFinalCompletedAt] = useState<string | null>(null);
  const [resultOrigin, setResultOrigin] = useState<ResultOrigin>("converted");
  const [sourceArtifact, setSourceArtifact] = useState<SourceArtifactInfo | null>(null);
  const [projectName, setProjectName] = useState("Untitled project");
  const [exportError, setExportError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [profiles, setProfiles] = useState<ConversionProfile[]>(() => [
    ...BUILT_IN_PROFILES,
    ...loadStoredProfiles(localStorage),
  ]);
  const [startupWorkbenchPreferences] = useState(() =>
    loadWorkbenchPreferences(localStorage),
  );
  const [startupApplicationSettings] = useState<ApplicationSettings>(() => {
    const availableProfiles = profiles;
    const initialProfile = availableProfiles.find(({ id }) => id === loadApplicationSettings(localStorage).profileId)
      ?? availableProfiles.find(({ id }) => id === DEFAULT_APPLICATION_SETTINGS.profileId)
      ?? BUILT_IN_PROFILE;
    return resolveApplicationSettings(loadApplicationSettings(localStorage), {
      profiles: availableProfiles.map((profile) => ({
        id: profile.id,
        presets: profile.presets.map((preset) => ({ id: preset.id })),
      })),
      compatibleModeIds: Object.keys(initialProfile.palette.modes),
    });
  });
  const [initialEnginePreferences] = useState(() =>
    loadEnginePreferences(localStorage, {
      platformId: DEFAULT_CONVERSION_SETTINGS.platformId,
      modeId: DEFAULT_CONVERSION_SETTINGS.modeId,
    })
  );
  const [selectedProfileId, setSelectedProfileId] = useState(startupApplicationSettings.profileId);
  const [selectedPresetId, setSelectedPresetId] = useState(startupApplicationSettings.presetId);
  const [image, setImage] = useState<WorkerDecodedImage | null>(null);
  const [originalImage, setOriginalImage] = useState<WorkerDecodedImage | null>(null);
  const [sourceFrameIndex, setSourceFrameIndex] = useState(0);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [imageStatus, setImageStatus] = useState("Choose a PNG, JPEG, or GIF image.");
  const [gifFrameSelection, setGifFrameSelection] = useState<{
    readonly file: File;
    readonly bytes: Uint8Array;
    readonly frameCount: number;
    readonly frameEntry: string;
  } | null>(null);
  const [framing, setFraming] = useState<FramingMode>(startupApplicationSettings.framing);
  const [resampling, setResampling] = useState<ResamplingMethod>(DEFAULT_CONVERSION_SETTINGS.resampling);
  const [rotation, setRotation] = useState<Rotation>(DEFAULT_CONVERSION_SETTINGS.rotation);
  const [mirrorHorizontal, setMirrorHorizontal] = useState(DEFAULT_CONVERSION_SETTINGS.mirrorHorizontal);
  const [mirrorVertical, setMirrorVertical] = useState(DEFAULT_CONVERSION_SETTINGS.mirrorVertical);
  const [fillOffsetX, setFillOffsetX] = useState(
    DEFAULT_CONVERSION_SETTINGS.fillOffsetX,
  );
  const [fillOffsetY, setFillOffsetY] = useState(
    DEFAULT_CONVERSION_SETTINGS.fillOffsetY,
  );
  const [panOffsetX, setPanOffsetX] = useState(
    DEFAULT_CONVERSION_SETTINGS.panOffsetX,
  );
  const [panOffsetY, setPanOffsetY] = useState(
    DEFAULT_CONVERSION_SETTINGS.panOffsetY,
  );
  const [panEdgeMode, setPanEdgeMode] = useState<PanEdgeMode>(
    DEFAULT_CONVERSION_SETTINGS.panEdgeMode,
  );
  const [background, setBackground] = useState<RgbColor>(
    profiles.find(({ id }) => id === startupApplicationSettings.profileId)?.platform_id === "pmd-85"
      ? { r: 0, g: 0, b: 0 }
      : DEFAULT_CONVERSION_SETTINGS.background,
  );
  const [exportBorderEnabled, setExportBorderEnabled] = useState(startupApplicationSettings.exportBorderEnabled);
  const [exportBorderWidth, setExportBorderWidth] = useState(startupApplicationSettings.exportBorderWidth);
  const [exportBorderColor, setExportBorderColor] = useState<RgbColor>(startupApplicationSettings.exportBorderColor);
  const [exportZoomFactor, setExportZoomFactor] = useState<ApplicationSettings["exportZoomFactor"]>(startupApplicationSettings.exportZoomFactor);
  const [settingsLevel, setSettingsLevelState] = useState<ApplicationSettings["settingsLevel"]>(startupApplicationSettings.settingsLevel);
  const setSettingsLevel = (level: ApplicationSettings["settingsLevel"]) => {
    setSettingsLevelState(level);
    saveApplicationSettings(localStorage, { ...loadApplicationSettings(localStorage), settingsLevel: level });
  };
  const [uiLayout, setUiLayoutState] = useState<UiLayout>(() => loadUiLayout(localStorage));
  const setUiLayout = (layout: UiLayout) => {
    setUiLayoutState(layout);
    saveUiLayout(localStorage, layout);
  };
  const [cropXEntry, setCropXEntry] = useState(String(DEFAULT_CONVERSION_SETTINGS.crop.x));
  const [cropYEntry, setCropYEntry] = useState(String(DEFAULT_CONVERSION_SETTINGS.crop.y));
  const [cropWidthEntry, setCropWidthEntry] = useState(String(DEFAULT_CONVERSION_SETTINGS.crop.width));
  const [cropHeightEntry, setCropHeightEntry] = useState(String(DEFAULT_CONVERSION_SETTINGS.crop.height));
  const [cropAspectRatio, setCropAspectRatio] = useState<CropAspectRatio>(
    DEFAULT_CONVERSION_SETTINGS.cropAspectRatio,
  );
  const [brightness, setBrightness] = useState(DEFAULT_CONVERSION_SETTINGS.brightness);
  const [contrast, setContrast] = useState(DEFAULT_CONVERSION_SETTINGS.contrast);
  const [saturation, setSaturation] = useState(DEFAULT_CONVERSION_SETTINGS.saturation);
  const [hueShift, setHueShift] = useState(DEFAULT_CONVERSION_SETTINGS.hueShift ?? 0);
  const [hslSaturation, setHslSaturation] = useState(DEFAULT_CONVERSION_SETTINGS.hslSaturation ?? 0);
  const [lightness, setLightness] = useState(DEFAULT_CONVERSION_SETTINGS.lightness ?? 0);
  const [colorize, setColorize] = useState(DEFAULT_CONVERSION_SETTINGS.colorize ?? false);
  const [gamma, setGamma] = useState(DEFAULT_CONVERSION_SETTINGS.gamma);
  const [smoothing, setSmoothing] = useState(DEFAULT_CONVERSION_SETTINGS.smoothing);
  const [sharpening, setSharpening] = useState(DEFAULT_CONVERSION_SETTINGS.sharpening);
  const [borderColor, setBorderColor] = useState(DEFAULT_CONVERSION_SETTINGS.borderColor);
  const [attributeHeight, setAttributeHeight] = useState<AttributeHeight>(DEFAULT_CONVERSION_SETTINGS.attributeHeight);
  const [attributeSmoothing, setAttributeSmoothing] = useState(
    DEFAULT_CONVERSION_SETTINGS.attributeSmoothing,
  );
  const [attributeHaloInfluence, setAttributeHaloInfluence] = useState(
    DEFAULT_CONVERSION_SETTINGS.attributeHaloInfluence,
  );
  const [attributeHaloHorizontal, setAttributeHaloHorizontal] =
    useState<AttributeHaloRadius>(DEFAULT_CONVERSION_SETTINGS.attributeHaloHorizontal);
  const [attributeHaloVertical, setAttributeHaloVertical] =
    useState<AttributeHaloRadius>(DEFAULT_CONVERSION_SETTINGS.attributeHaloVertical);
  const [screenFlickerSuppression, setScreenFlickerSuppression] = useState(
    DEFAULT_CONVERSION_SETTINGS.screenFlickerSuppression,
  );
  const [zxMixedAttributesOnly, setZxMixedAttributesOnly] = useState(
    DEFAULT_CONVERSION_SETTINGS.zxMixedAttributesOnly,
  );
  const [qlMixedOptimizerId, setQlMixedOptimizerId] =
    useState<QlMixedOptimizerId>(
      DEFAULT_CONVERSION_SETTINGS.qlMixedOptimizerId,
    );
  const [paletteSelections, setPaletteSelections] = useState<PaletteSelection[]>(
    () => DEFAULT_CONVERSION_SETTINGS.paletteSelections.map((selection) => ({
      ...selection,
      enabledColorIds: [...selection.enabledColorIds],
    })),
  );
  const [zxPaletteDefinition, setZxPaletteDefinition] = useState<ZxPaletteDefinition>(
    DEFAULT_CONVERSION_SETTINGS.zxPalette,
  );
  const resolvedZxPalette = resolveZxPalette(zxPaletteDefinition);
  const zxPaletteOptions = ZX_BASE_COLORS.map((base) => ({
    code: base.code,
    name: base.name,
    normal: rgbToHex(resolvedZxPalette.normal[base.code]!),
    bright: rgbToHex(resolvedZxPalette.bright[base.code]!),
  }));
  const paletteModeCacheRef = useRef(new Map<string, PaletteSelection[]>());
  const [dithering, setDithering] = useState<DitheringMethod>(() =>
    startupApplicationSettings.dithering
  );
  const [attributeOptimizerId, setAttributeOptimizerId] =
    useState<AttributeOptimizerId>(initialEnginePreferences.attributeOptimizerId);
  const [verticalSpatialSwapRows, setVerticalSpatialSwapRows] = useState(false);
  const [ditherEngineId, setDitherEngineId] =
    useState<DitherEngineId>(initialEnginePreferences.ditherEngineId);
  const ditherEngineByMethodRef = useRef<Partial<Record<DitheringMethod, DitherEngineId>>>({
    none: ditherMethodForEngine(initialEnginePreferences.ditherEngineId) === "none"
      ? initialEnginePreferences.ditherEngineId
      : "none-discrete-v2",
    ordered: ditherMethodForEngine(initialEnginePreferences.ditherEngineId) === "ordered"
      ? initialEnginePreferences.ditherEngineId
      : "ordered-strict-matrix-v6",
    "error-diffusion": ditherMethodForEngine(initialEnginePreferences.ditherEngineId) === "error-diffusion"
      ? initialEnginePreferences.ditherEngineId
      : "error-diffusion-decorrelated-v3",
  });
  const [structuredSettings, setStructuredSettings] =
    useState<StructuredConversionSettings>(
      () => structuredSettingsForOptimizer(
        initialEnginePreferences.attributeOptimizerId,
        DEFAULT_CONVERSION_SETTINGS.structured,
      ),
    );
  const [targetModeId, setTargetModeId] =
    useState<TargetModeId>(startupApplicationSettings.modeId);
  const [artisticPattern, setArtisticPattern] = useState<NonNullable<ConversionSettings["artisticPattern"]>>("auto");
  const [orderedMatrix, setOrderedMatrix] = useState<OrderedMatrixId>(DEFAULT_CONVERSION_SETTINGS.orderedMatrix);
  const [customOrderedMatrices, setCustomOrderedMatrices] = useState<readonly CustomOrderedMatrixDefinition[]>(
    DEFAULT_CONVERSION_SETTINGS.customOrderedMatrices,
  );
  const [customDiffusionKernels, setCustomDiffusionKernels] = useState<readonly CustomDiffusionKernelDefinition[]>(
    DEFAULT_CONVERSION_SETTINGS.customDiffusionKernels,
  );
  const [composer, setComposer] = useState<ConversionSettings["composer"]>(DEFAULT_CONVERSION_SETTINGS.composer);
  const [customMatrixWidthEntry, setCustomMatrixWidthEntry] = useState("4");
  const [customMatrixHeightEntry, setCustomMatrixHeightEntry] = useState("4");
  const [customMatrixValuesEntry, setCustomMatrixValuesEntry] = useState("0 8 2 10 12 4 14 6 3 11 1 9 15 7 13 5");
  const [customKernelEntryText, setCustomKernelEntryText] = useState("1 0 7\n-1 1 3\n0 1 5\n1 1 1");
  const [customPatternError, setCustomPatternError] = useState<string | null>(null);
  const [amountEntry, setAmountEntry] = useState(String(startupApplicationSettings.ditheringAmount));
  const [errorDiffusionRandomization, setErrorDiffusionRandomization] = useState(
    DEFAULT_CONVERSION_SETTINGS.errorDiffusionRandomization,
  );
  const [errorDiffusionLineSuppression, setErrorDiffusionLineSuppression] = useState(
    DEFAULT_CONVERSION_SETTINGS.errorDiffusionLineSuppression,
  );

  return {
    amountEntry,
    artisticPattern,
    attributeHaloHorizontal,
    attributeHaloInfluence,
    attributeHaloVertical,
    attributeHeight,
    attributeOptimizerId,
    attributeSmoothing,
    background,
    borderColor,
    brightness,
    builtInSpecsciiCharset,
    builtInSpecsciiFontError,
    charsetAllowPolarity,
    charsetAllowTransforms,
    charsetBudget,
    charsetDistance,
    charsetEncoding,
    charsetSelectionMode,
    charsetSource,
    charsetStrategy,
    charsetTilesView,
    charsetVisualWeighting,
    colorize,
    composer,
    contrast,
    cropAspectRatio,
    cropHeightEntry,
    cropWidthEntry,
    cropXEntry,
    cropYEntry,
    customDiffusionKernels,
    customKernelEntryText,
    customMatrixHeightEntry,
    customMatrixValuesEntry,
    customMatrixWidthEntry,
    customOrderedMatrices,
    customPatternError,
    dirty,
    ditherEngineByMethodRef,
    ditherEngineId,
    dithering,
    emittedSourceCharsetIndices,
    errorDiffusionLineSuppression,
    errorDiffusionRandomization,
    existingCharset,
    existingCharsetLength,
    existingCharsetLengthEntry,
    existingCharsetName,
    existingCharsetSelection,
    existingCharsetStart,
    existingCharsetStartEntry,
    exportBorderColor,
    exportBorderEnabled,
    exportBorderWidth,
    exportError,
    exportZoomFactor,
    settingsLevel,
    uiLayout,
    fillOffsetX,
    fillOffsetY,
    framing,
    gamma,
    gifFrameSelection,
    hslSaturation,
    hueShift,
    image,
    imageStatus,
    lastFinalCompletedAt,
    lightness,
    mirrorHorizontal,
    mirrorVertical,
    orderedMatrix,
    originalImage,
    paletteModeCacheRef,
    paletteSelections,
    panEdgeMode,
    panOffsetX,
    panOffsetY,
    profiles,
    projectName,
    qlMixedOptimizerId,
    resampling,
    resolvedZxPalette,
    resultOrigin,
    rotation,
    saturation,
    screenFlickerSuppression,
    selectedPresetId,
    selectedProfileId,
    selectedSourceCharsetTile,
    setAmountEntry,
    setArtisticPattern,
    setAttributeHaloHorizontal,
    setAttributeHaloInfluence,
    setAttributeHaloVertical,
    setAttributeHeight,
    setAttributeOptimizerId,
    setAttributeSmoothing,
    setBackground,
    setBorderColor,
    setBrightness,
    setBuiltInSpecsciiCharset,
    setBuiltInSpecsciiFontError,
    setCharsetAllowPolarity,
    setCharsetAllowTransforms,
    setCharsetBudget,
    setCharsetDistance,
    setCharsetEncoding,
    setCharsetSelectionMode,
    setCharsetSource,
    setCharsetStrategy,
    setCharsetTilesView,
    setCharsetVisualWeighting,
    setColorize,
    setComposer,
    setContrast,
    setCropAspectRatio,
    setCropHeightEntry,
    setCropWidthEntry,
    setCropXEntry,
    setCropYEntry,
    setCustomDiffusionKernels,
    setCustomKernelEntryText,
    setCustomMatrixHeightEntry,
    setCustomMatrixValuesEntry,
    setCustomMatrixWidthEntry,
    setCustomOrderedMatrices,
    setCustomPatternError,
    setDirty,
    setDitherEngineId,
    setDithering,
    setEmittedSourceCharsetIndices,
    setErrorDiffusionLineSuppression,
    setErrorDiffusionRandomization,
    setExistingCharset,
    setExistingCharsetLength,
    setExistingCharsetLengthEntry,
    setExistingCharsetName,
    setExistingCharsetSelection,
    setExistingCharsetStart,
    setExistingCharsetStartEntry,
    setExportBorderColor,
    setExportBorderEnabled,
    setExportBorderWidth,
    setExportError,
    setExportZoomFactor,
    setSettingsLevel,
    setSettingsLevelState,
    setUiLayout,
    setFillOffsetX,
    setFillOffsetY,
    setFraming,
    setGamma,
    setGifFrameSelection,
    setHslSaturation,
    setHueShift,
    setImage,
    setImageStatus,
    setLastFinalCompletedAt,
    setLightness,
    setMirrorHorizontal,
    setMirrorVertical,
    setOrderedMatrix,
    setOriginalImage,
    setPaletteSelections,
    setPanEdgeMode,
    setPanOffsetX,
    setPanOffsetY,
    setProfiles,
    setProjectName,
    setQlMixedOptimizerId,
    setResampling,
    setResultOrigin,
    setRotation,
    setSaturation,
    setScreenFlickerSuppression,
    setSelectedPresetId,
    setSelectedProfileId,
    setSelectedSourceCharsetTile,
    setSharpening,
    setSmoothing,
    setSourceArtifact,
    setSourceFileName,
    setSourceFrameIndex,
    setSpecsciiAuthor,
    setSpecsciiBorder,
    setSpecsciiDocumentName,
    setSpecsciiImageName,
    setStructuredSettings,
    setTargetModeId,
    setTilemapStale,
    setVerticalSpatialSwapRows,
    setWorkspaceMode,
    setZxMixedAttributesOnly,
    setZxPaletteDefinition,
    sharpening,
    smoothing,
    sourceArtifact,
    sourceFileName,
    sourceFrameIndex,
    specsciiAuthor,
    specsciiBorder,
    specsciiDocumentName,
    specsciiImageName,
    startupApplicationSettings,
    startupWorkbenchPreferences,
    structuredSettings,
    targetModeId,
    tilemapStale,
    verticalSpatialSwapRows,
    workspaceMode,
    zxMixedAttributesOnly,
    zxPaletteDefinition,
    zxPaletteOptions,
  };
}
