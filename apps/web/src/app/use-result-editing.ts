import { useEffect, useLayoutEffect, useMemo } from "react";
import { extractPmd85GapBytes, type Pmd85RgbColor } from "@retro-converter/pmd-85";
import { profileModeScreens } from "../profiles.js";
import { hexToRgb } from "../dithering-labels.js";
import { pmd85PaletteForResult } from "../result-palette.js";
import { ConversionWorkerClient, type WorkerConversionResult, type WorkerDecodedImage } from "../worker/client.js";
import { buildVerticalSpatialAnalyticPreview, type ConversionSettings, DEFAULT_CONVERSION_SETTINGS, DITHER_ENGINES, type DitherEngineId, type DitheringMethod, ditherMethodForEngine, renderZxFlashPreview, resolveZxPalette } from "@retro-converter/conversion-core";
import { defaultOutputPreviewStage, verticalSpatialPreviewForStage } from "../vertical-spatial-preview.js";
import { targetProducesMultipleFrames, unpackZxBitmap } from "../conversion-targets.js";
import { clampPixelCrop, orientedSourceSize } from "../crop.js";
import { saveEnginePreferences } from "../engine-preferences.js";
import { saveWorkspacePreferences } from "../workspace-preferences.js";
import { saveWorkbenchPreferences } from "../workbench-preferences.js";
import { cloneNativeResultBitmap, createNativeResultBitmap, type NativeResultBitmap, type NativeResultFrameInput } from "../result-bitmap-editor.js";
import { BUILTIN_WORKSPACE_PROFILE_PREFIX, type PreviewContent } from "../app-types.js";
import { renderQlMixedDisplayPreview } from "../ql-mixed-preview.js";
import { mergeMonochromeRgba, mergeTemporalRgba, zxBitmapToMonochromeRgba } from "../monochrome-preview.js";
import { draftPreviewResult } from "../draft-preview-state.js";
import { frameFallbackSourcePreview } from "../source-preview.js";
import { drawOrientedCropSource } from "../crop-render.js";
import { ZX_BITMAP_BYTES } from "@retro-converter/zx-spectrum";
import type { useRuntimeState } from "./use-runtime-state.js";
import type { useSettingsState } from "./use-settings-state.js";
import type { useWorkbenchState } from "./use-workbench-state.js";
import type { useWorkbenchWindows } from "./use-workbench-windows.js";
import type { useWorkbenchLayout } from "./use-workbench-layout.js";
import { expandResultPreviewForFrame } from "./result-editing-helpers.js";

export function useResultEditing(
  { activeWorkspaceProfileId, applyWorkspaceLayout, attributeOptimizerId, background, benchmarkWorkerRef, bitmapEditorColorDraftRef, bitmapEditorCurrentResultRef, bitmapEditorEncodedRef, bitmapEditorFlashPreviewMode, bitmapEditorFlashPreviewPhase, bitmapEditorFullBufferRef, bitmapEditorResultBuffer, bitmapEditorResultBufferRef, bitmapEditorResultSourceRef, bitmapEditorSelection, bitmapEditorShowAttributes, bitmapEditorShowPixels, bitmapEditorTarget, brightness, canvasRef, charsetState, charsetWorkerRef, colorize, contrast, convertedCanvasRef, destinationGeometry, dirty, ditherEngineByMethodRef, ditherEngineId, dithering, draftState, draftWorkerRef, fillOffsetX, fillOffsetY, framing, gamma, hideAttributes, hslSaturation, hueShift, image, inputPreviewStage, inspectionDrawerOpen, isPmd, lastFinal, lightness, mirrorHorizontal, mirrorVertical, originalImage, outputPreviewStage, panEdgeMode, panOffsetX, panOffsetY, pendingNewEmptyImageRef, pendingOpenedResultEditedRef, pendingOpenedResultQualityRef, pmd85GapPolicy, pmd85PaletteCalibrationId, previewZoom, profiles, qlMixedDisplayResolution, resampling, restoreWorkbenchPreferences, resultPreviewContent, resultPreviewZoom, rotation, saturation, savedWorkbenchLayouts, selectWorkspaceProfile, selectedPlatformId, selectedProfile, selectedProfileId, setAmountEntry, setArtisticPattern, setAttributeHaloHorizontal, setAttributeHaloInfluence, setAttributeHaloVertical, setAttributeHeight, setAttributeOptimizerId, setAttributeSmoothing, setBackground, setBitmapEditorBuffer, setBitmapEditorCell, setBitmapEditorClipboard, setBitmapEditorColorPickerActive, setBitmapEditorFlashPreviewMode, setBitmapEditorFlashPreviewPhase, setBitmapEditorOriginalResult, setBitmapEditorPasteMode, setBitmapEditorPatternPickerActive, setBitmapEditorPickedCell, setBitmapEditorPickedFrameIndex, setBitmapEditorPrimitiveCursor, setBitmapEditorPrimitiveCustomPattern, setBitmapEditorPrimitiveDraft, setBitmapEditorPrimitivePatternPickerActive, setBitmapEditorRedo, setBitmapEditorRedoFull, setBitmapEditorRegionSelection, setBitmapEditorResultBuffer, setBitmapEditorResultEdited, setBitmapEditorResultFrameIndex, setBitmapEditorResultOriginal, setBitmapEditorResultOriginalResult, setBitmapEditorResultPaletteIndex, setBitmapEditorResultQuality, setBitmapEditorResultRedo, setBitmapEditorResultUndo, setBitmapEditorRevertSource, setBitmapEditorScope, setBitmapEditorSelection, setBitmapEditorSelectionDraft, setBitmapEditorSelectionTool, setBitmapEditorSourceColor, setBitmapEditorUndo, setBitmapEditorUndoFull, setBorderColor, setBrightness, setColorize, setComposer, setContrast, setCropAspectRatio, setCropHeightEntry, setCropWidthEntry, setCropXEntry, setCropYEntry, setCustomDiffusionKernels, setCustomOrderedMatrices, setDitherEngineId, setDithering, setErrorDiffusionLineSuppression, setErrorDiffusionRandomization, setFillOffsetX, setFillOffsetY, setFraming, setGamma, setHslSaturation, setHueShift, setInspection, setLightness, setMirrorHorizontal, setMirrorVertical, setOrderedMatrix, setOutputPreviewStage, setPaletteSelections, setPanEdgeMode, setPanOffsetX, setPanOffsetY, setPmd85GapPolicy, setPmd85PaletteCalibrationId, setPreviewZoom, setQlMixedOptimizerId, setResampling, setResultPreviewContent, setResultPreviewZoom, setRotation, setSaturation, setScreenFlickerSuppression, setSelectedPaletteColor, setSharpening, setShowAttributeGrid, setShowPixelGrid, setSmoothing, setSourcePreviewContent, setSourcePreviewZoom, setState, setStructuredSettings, setTargetModeId, setTileEditorRedo, setTileEditorUndo, setTilemapEditorCell, setVerticalSpatialSwapRows, setZxMixedAttributesOnly, setZxPaletteDefinition, sharpening, showAttributeGrid, showPixelGrid, smoothing, sourceArtifact, sourceConvertedCanvasRef, sourcePreviewContent, sourcePreviewZoom, startupApplicationSettings, startupWorkspaceAppliedRef, startupWorkspaceLayout, synchronizePan, synchronizeZoom, targetModeId, tilemapStale, workbenchAdjustmentsFloating, workbenchAdjustmentsFloatingAutoHeight, workbenchAdjustmentsFloatingHeight, workbenchAdjustmentsFloatingWidth, workbenchAdjustmentsFloatingX, workbenchAdjustmentsFloatingY, workbenchBottomHeight, workbenchDitheringFloating, workbenchDitheringFloatingAutoHeight, workbenchDitheringFloatingHeight, workbenchDitheringFloatingWidth, workbenchDitheringFloatingX, workbenchDitheringFloatingY, workbenchFloatingX, workbenchFloatingY, workbenchGeometryFloating, workbenchGeometryFloatingAutoHeight, workbenchGeometryFloatingHeight, workbenchGeometryFloatingWidth, workbenchGeometryFloatingX, workbenchGeometryFloatingY, workbenchLeftWidth, workbenchPaletteFloating, workbenchPaletteFloatingAutoHeight, workbenchPaletteFloatingHeight, workbenchPaletteFloatingWidth, workbenchPaletteFloatingX, workbenchPaletteFloatingY, workbenchPreviewLayer, workbenchResultDockedWidth, workbenchResultFloating, workbenchResultFloatingAutoHeight, workbenchResultFloatingHeight, workbenchResultFloatingWidth, workbenchResultFloatingX, workbenchResultFloatingY, workbenchRightWidth, workbenchSectionsOpen, workbenchSettingsDock, workbenchSettingsFloatingHeight, workbenchSettingsFloatingWidth, workbenchSettingsMinimized, workbenchSettingsSideWidth, workbenchSourceDockedWidth, workbenchSourceFloating, workbenchSourceFloatingAutoHeight, workbenchSourceFloatingHeight, workbenchSourceFloatingWidth, workbenchSourceFloatingX, workbenchSourceFloatingY, workbenchTilemapFloating, workbenchTilemapFloatingAutoHeight, workbenchTilemapFloatingHeight, workbenchTilemapFloatingWidth, workbenchTilemapFloatingX, workbenchTilemapFloatingY, workbenchToolsDock, workbenchToolsFloatingHeight, workbenchToolsFloatingWidth, workbenchToolsFloatingX, workbenchToolsFloatingY, workbenchToolsOpen, workbenchWindowLayouts, workbenchWindowOrder, workerRef, workspaceLayout, workspaceMode, workspaceModeRef, workspaceProfileSelectionMadeRef, zxPaletteDefinition }: Pick<ReturnType<typeof useRuntimeState>, "benchmarkWorkerRef" | "bitmapEditorColorDraftRef" | "bitmapEditorCurrentResultRef" | "bitmapEditorEncodedRef" | "bitmapEditorFlashPreviewMode" | "bitmapEditorFlashPreviewPhase" | "bitmapEditorFullBufferRef" | "bitmapEditorResultBuffer" | "bitmapEditorResultBufferRef" | "bitmapEditorResultSourceRef" | "bitmapEditorSelection" | "bitmapEditorShowAttributes" | "bitmapEditorShowPixels" | "bitmapEditorTarget" | "canvasRef" | "charsetState" | "charsetWorkerRef" | "convertedCanvasRef" | "draftState" | "draftWorkerRef" | "lastFinal" | "pendingOpenedResultEditedRef" | "pendingOpenedResultQualityRef" | "setBitmapEditorBuffer" | "setBitmapEditorCell" | "setBitmapEditorClipboard" | "setBitmapEditorColorPickerActive" | "setBitmapEditorFlashPreviewMode" | "setBitmapEditorFlashPreviewPhase" | "setBitmapEditorOriginalResult" | "setBitmapEditorPasteMode" | "setBitmapEditorPatternPickerActive" | "setBitmapEditorPickedCell" | "setBitmapEditorPickedFrameIndex" | "setBitmapEditorRedo" | "setBitmapEditorRedoFull" | "setBitmapEditorRegionSelection" | "setBitmapEditorResultBuffer" | "setBitmapEditorResultEdited" | "setBitmapEditorResultFrameIndex" | "setBitmapEditorResultOriginal" | "setBitmapEditorResultOriginalResult" | "setBitmapEditorResultPaletteIndex" | "setBitmapEditorResultQuality" | "setBitmapEditorResultRedo" | "setBitmapEditorResultUndo" | "setBitmapEditorRevertSource" | "setBitmapEditorScope" | "setBitmapEditorSelection" | "setBitmapEditorSelectionDraft" | "setBitmapEditorSelectionTool" | "setBitmapEditorSourceColor" | "setBitmapEditorUndo" | "setBitmapEditorUndoFull" | "setState" | "setTileEditorRedo" | "setTileEditorUndo" | "setTilemapEditorCell" | "sourceConvertedCanvasRef" | "workerRef" | "workspaceModeRef"> &
    Pick<ReturnType<typeof useSettingsState>, "attributeOptimizerId" | "background" | "brightness" | "colorize" | "contrast" | "dirty" | "ditherEngineByMethodRef" | "ditherEngineId" | "dithering" | "fillOffsetX" | "fillOffsetY" | "framing" | "gamma" | "hslSaturation" | "hueShift" | "image" | "lightness" | "mirrorHorizontal" | "mirrorVertical" | "originalImage" | "panEdgeMode" | "panOffsetX" | "panOffsetY" | "profiles" | "resampling" | "rotation" | "saturation" | "selectedProfileId" | "setAmountEntry" | "setArtisticPattern" | "setAttributeHaloHorizontal" | "setAttributeHaloInfluence" | "setAttributeHaloVertical" | "setAttributeHeight" | "setAttributeOptimizerId" | "setAttributeSmoothing" | "setBackground" | "setBorderColor" | "setBrightness" | "setColorize" | "setComposer" | "setContrast" | "setCropAspectRatio" | "setCropHeightEntry" | "setCropWidthEntry" | "setCropXEntry" | "setCropYEntry" | "setCustomDiffusionKernels" | "setCustomOrderedMatrices" | "setDitherEngineId" | "setDithering" | "setErrorDiffusionLineSuppression" | "setErrorDiffusionRandomization" | "setFillOffsetX" | "setFillOffsetY" | "setFraming" | "setGamma" | "setHslSaturation" | "setHueShift" | "setLightness" | "setMirrorHorizontal" | "setMirrorVertical" | "setOrderedMatrix" | "setPaletteSelections" | "setPanEdgeMode" | "setPanOffsetX" | "setPanOffsetY" | "setQlMixedOptimizerId" | "setResampling" | "setRotation" | "setSaturation" | "setScreenFlickerSuppression" | "setSharpening" | "setSmoothing" | "setStructuredSettings" | "setTargetModeId" | "setVerticalSpatialSwapRows" | "setZxMixedAttributesOnly" | "setZxPaletteDefinition" | "sharpening" | "smoothing" | "sourceArtifact" | "startupApplicationSettings" | "targetModeId" | "tilemapStale" | "workspaceMode" | "zxPaletteDefinition"> &
    Pick<ReturnType<typeof useWorkbenchState>, "activeWorkspaceProfileId" | "destinationGeometry" | "hideAttributes" | "inputPreviewStage" | "inspectionDrawerOpen" | "isPmd" | "outputPreviewStage" | "pendingNewEmptyImageRef" | "pmd85GapPolicy" | "pmd85PaletteCalibrationId" | "previewZoom" | "qlMixedDisplayResolution" | "resultPreviewContent" | "resultPreviewZoom" | "savedWorkbenchLayouts" | "selectedPlatformId" | "selectedProfile" | "setBitmapEditorPrimitiveCursor" | "setBitmapEditorPrimitiveCustomPattern" | "setBitmapEditorPrimitiveDraft" | "setBitmapEditorPrimitivePatternPickerActive" | "setInspection" | "setOutputPreviewStage" | "setPmd85GapPolicy" | "setPmd85PaletteCalibrationId" | "setPreviewZoom" | "setResultPreviewContent" | "setResultPreviewZoom" | "setSelectedPaletteColor" | "setShowAttributeGrid" | "setShowPixelGrid" | "setSourcePreviewContent" | "setSourcePreviewZoom" | "showAttributeGrid" | "showPixelGrid" | "sourcePreviewContent" | "sourcePreviewZoom" | "startupWorkspaceAppliedRef" | "startupWorkspaceLayout" | "synchronizePan" | "synchronizeZoom" | "workbenchAdjustmentsFloating" | "workbenchAdjustmentsFloatingAutoHeight" | "workbenchAdjustmentsFloatingHeight" | "workbenchAdjustmentsFloatingWidth" | "workbenchAdjustmentsFloatingX" | "workbenchAdjustmentsFloatingY" | "workbenchBottomHeight" | "workbenchDitheringFloating" | "workbenchDitheringFloatingAutoHeight" | "workbenchDitheringFloatingHeight" | "workbenchDitheringFloatingWidth" | "workbenchDitheringFloatingX" | "workbenchDitheringFloatingY" | "workbenchFloatingX" | "workbenchFloatingY" | "workbenchGeometryFloating" | "workbenchGeometryFloatingAutoHeight" | "workbenchGeometryFloatingHeight" | "workbenchGeometryFloatingWidth" | "workbenchGeometryFloatingX" | "workbenchGeometryFloatingY" | "workbenchLeftWidth" | "workbenchPaletteFloating" | "workbenchPaletteFloatingAutoHeight" | "workbenchPaletteFloatingHeight" | "workbenchPaletteFloatingWidth" | "workbenchPaletteFloatingX" | "workbenchPaletteFloatingY" | "workbenchPreviewLayer" | "workbenchResultDockedWidth" | "workbenchResultFloating" | "workbenchResultFloatingAutoHeight" | "workbenchResultFloatingHeight" | "workbenchResultFloatingWidth" | "workbenchResultFloatingX" | "workbenchResultFloatingY" | "workbenchRightWidth" | "workbenchSectionsOpen" | "workbenchSettingsDock" | "workbenchSettingsFloatingHeight" | "workbenchSettingsFloatingWidth" | "workbenchSettingsMinimized" | "workbenchSettingsSideWidth" | "workbenchSourceDockedWidth" | "workbenchSourceFloating" | "workbenchSourceFloatingAutoHeight" | "workbenchSourceFloatingHeight" | "workbenchSourceFloatingWidth" | "workbenchSourceFloatingX" | "workbenchSourceFloatingY" | "workbenchTilemapFloating" | "workbenchTilemapFloatingAutoHeight" | "workbenchTilemapFloatingHeight" | "workbenchTilemapFloatingWidth" | "workbenchTilemapFloatingX" | "workbenchTilemapFloatingY" | "workbenchToolsFloatingHeight" | "workbenchToolsFloatingWidth" | "workbenchToolsFloatingX" | "workbenchToolsFloatingY" | "workbenchWindowLayouts" | "workbenchWindowOrder" | "workspaceLayout" | "workspaceProfileSelectionMadeRef"> &
    Pick<ReturnType<typeof useWorkbenchWindows>, "workbenchToolsDock" | "workbenchToolsOpen"> &
    Pick<ReturnType<typeof useWorkbenchLayout>, "applyWorkspaceLayout" | "restoreWorkbenchPreferences" | "selectWorkspaceProfile">,
) {
  const pmd85ForegroundPalette = useMemo<readonly Pmd85RgbColor[]>(() => {
    if (!isPmd) return [];
    try {
      return profileModeScreens(
        selectedProfile,
        targetModeId,
        pmd85PaletteCalibrationId,
      )[0]?.colors.map((color) => hexToRgb(color.normal)) ?? [];
    } catch {
      return [];
    }
  }, [isPmd, pmd85PaletteCalibrationId, selectedProfile, targetModeId]);

  useEffect(() => {
    workspaceModeRef.current = workspaceMode;
  }, [workspaceMode]);

  useEffect(() => {
    const worker = new ConversionWorkerClient();
    workerRef.current = worker;

    return () => {
      worker.dispose();
      draftWorkerRef.current?.dispose();
      benchmarkWorkerRef.current?.dispose();
      charsetWorkerRef.current?.dispose();
      if (workerRef.current === worker) {
        workerRef.current = null;
      }
      draftWorkerRef.current = null;
      benchmarkWorkerRef.current = null;
      charsetWorkerRef.current = null;
    };
  }, []);

  function switchDithering(method: DitheringMethod) {
    if (targetModeId.includes("vertical-spatial")) {
      setDithering(method);
      setDitherEngineId(
        method === "none"
          ? "vertical-spatial-none-v1"
          : method === "ordered"
            ? "vertical-spatial-ordered-v1"
            : "vertical-spatial-error-diffusion-v1",
      );
      setState({ kind: "idle" });
      return;
    }
    setDithering(method);
    if (
      (
        attributeOptimizerId === "zx-structured-global-v1" ||
        attributeOptimizerId === "zx-structured-global-v2" ||
        attributeOptimizerId === "zx-structured-global-v3" ||
        attributeOptimizerId === "zx-structured-global-v4"
      ) &&
      method === "ordered"
    ) {
      setDitherEngineId(
        attributeOptimizerId === "zx-structured-global-v4"
          ? "ordered-cell-pattern-v4"
          : attributeOptimizerId === "zx-structured-global-v3"
          ? "ordered-cell-pattern-v3"
          : attributeOptimizerId === "zx-structured-global-v2"
            ? "ordered-cell-pattern-v2"
            : "ordered-cell-pattern-v1",
      );
    } else if (
      attributeOptimizerId === "zx-block-dbs-global-v1" &&
      method === "ordered"
    ) {
      setDitherEngineId("pattern-legal-mask-dbs-v1");
    } else {
      if (
        attributeOptimizerId === "zx-structured-global-v1" ||
        attributeOptimizerId === "zx-structured-global-v2" ||
        attributeOptimizerId === "zx-structured-global-v3" ||
        attributeOptimizerId === "zx-structured-global-v4" ||
        attributeOptimizerId === "zx-block-dbs-global-v1"
      ) {
        setAttributeOptimizerId("zx-guide-reference-halo-v1");
      }
      const retained = ditherEngineByMethodRef.current[method];
      const compatible = DITHER_ENGINES.some((engine) =>
        engine.id === retained &&
        engine.method === method &&
        engine.platforms.includes(selectedPlatformId as never) &&
        (engine.targetModeIds === undefined || engine.targetModeIds.includes(targetModeId)) &&
        (targetModeId !== "zx48-mixed-256x192" || !("family" in engine))
      );
      const fallback: Record<DitheringMethod, DitherEngineId> = {
        none: "none-discrete-v2",
        ordered: targetModeId === "zx48-mixed-256x192"
          ? "ordered-mixed-phase-stable-v8"
          : "ordered-strict-matrix-v6",
        "error-diffusion": "error-diffusion-decorrelated-v3",
      };
      setDitherEngineId(compatible && retained !== undefined
        ? retained
        : fallback[method]);
    }
    setState({ kind: "idle" });
  }

  function setCropEntries(crop: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }) {
    setCropXEntry(String(crop.x));
    setCropYEntry(String(crop.y));
    setCropWidthEntry(String(crop.width));
    setCropHeightEntry(String(crop.height));
  }

  function applySettings(
    next: ConversionSettings,
    sourceImage: WorkerDecodedImage | null = image,
  ) {
    setFraming(next.framing);
    setTargetModeId(next.modeId);
    setOutputPreviewStage(
      defaultOutputPreviewStage(
        next.modeId,
        targetProducesMultipleFrames(next.platformId, next.modeId),
      ),
    );
    setAttributeOptimizerId(next.attributeOptimizerId);
    if (next.verticalSpatialMix !== undefined) {
      setVerticalSpatialSwapRows(next.verticalSpatialMix.swapRows ?? (
        next.attributeOptimizerId === "pmd85-vertical-spatial-detail-v2" ||
        next.attributeOptimizerId === "zx-vertical-spatial-detail-v1"
      ));
    }
    setDitherEngineId(next.ditherEngineId);
    setQlMixedOptimizerId(next.qlMixedOptimizerId);
    setResampling(next.resampling);
    setRotation(next.rotation);
    setMirrorHorizontal(next.mirrorHorizontal);
    setMirrorVertical(next.mirrorVertical);
    setFillOffsetX(next.fillOffsetX);
    setFillOffsetY(next.fillOffsetY);
    setPanOffsetX(next.panOffsetX);
    setPanOffsetY(next.panOffsetY);
    setPanEdgeMode(next.panEdgeMode);
    setBackground(next.background);
    if (sourceImage === null) {
      setCropEntries(next.crop);
    } else {
      const source = orientedSourceSize(
        sourceImage.width,
        sourceImage.height,
        next.rotation,
      );
      setCropEntries(clampPixelCrop(next.crop, source));
    }
    setCropAspectRatio(next.cropAspectRatio);
    setBrightness(next.brightness);
    setContrast(next.contrast);
    setSaturation(next.saturation);
    setHueShift(next.hueShift ?? 0);
    setHslSaturation(next.hslSaturation ?? 0);
    setLightness(next.lightness ?? 0);
    setColorize(next.colorize ?? false);
    setGamma(next.gamma);
    setSmoothing(next.smoothing ?? DEFAULT_CONVERSION_SETTINGS.smoothing);
    setSharpening(next.sharpening ?? DEFAULT_CONVERSION_SETTINGS.sharpening);
    setBorderColor(next.borderColor ?? DEFAULT_CONVERSION_SETTINGS.borderColor);
    const nextAttributeHeight =
      next.attributeHeight ?? DEFAULT_CONVERSION_SETTINGS.attributeHeight;
    setAttributeHeight(nextAttributeHeight);
    setAttributeSmoothing(
      next.attributeSmoothing ?? DEFAULT_CONVERSION_SETTINGS.attributeSmoothing,
    );
    setAttributeHaloInfluence(
      next.attributeHaloInfluence ??
      DEFAULT_CONVERSION_SETTINGS.attributeHaloInfluence,
    );
    setAttributeHaloHorizontal(
      next.attributeHaloHorizontal ??
      DEFAULT_CONVERSION_SETTINGS.attributeHaloHorizontal,
    );
    setAttributeHaloVertical(
      nextAttributeHeight >= 4
        ? next.attributeHaloVertical ?? DEFAULT_CONVERSION_SETTINGS.attributeHaloVertical
        : 0,
    );
    setScreenFlickerSuppression(
      next.screenFlickerSuppression ??
      DEFAULT_CONVERSION_SETTINGS.screenFlickerSuppression,
    );
    setZxMixedAttributesOnly(next.zxMixedAttributesOnly ?? false);
    setPaletteSelections(next.paletteSelections.map((selection) => ({
      ...selection,
      enabledColorIds: [...selection.enabledColorIds],
    })));
    setZxPaletteDefinition(next.zxPalette ?? DEFAULT_CONVERSION_SETTINGS.zxPalette);
    setDithering(next.dithering);
    if (next.dithering !== "none" || next.ditheringAmount > 0) {
      setAmountEntry(String(next.ditheringAmount));
    }
    setErrorDiffusionRandomization(
      next.errorDiffusionRandomization ??
      DEFAULT_CONVERSION_SETTINGS.errorDiffusionRandomization,
    );
    setErrorDiffusionLineSuppression(
      next.errorDiffusionLineSuppression ??
      DEFAULT_CONVERSION_SETTINGS.errorDiffusionLineSuppression,
    );
    setOrderedMatrix(next.orderedMatrix);
    setArtisticPattern(next.artisticPattern ?? "auto");
    setCustomOrderedMatrices(next.customOrderedMatrices ?? DEFAULT_CONVERSION_SETTINGS.customOrderedMatrices);
    setCustomDiffusionKernels(next.customDiffusionKernels ?? DEFAULT_CONVERSION_SETTINGS.customDiffusionKernels);
    setComposer(next.composer ?? DEFAULT_CONVERSION_SETTINGS.composer);
    setStructuredSettings(next.structured);
    setPmd85PaletteCalibrationId(next.pmd85.paletteCalibrationId);
    setPmd85GapPolicy(next.pmd85.gapPolicy);
    if (next.modeId.includes("vertical-spatial")) {
      setOutputPreviewStage("screen-1");
      if (sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2") {
        setSourcePreviewContent("image");
      }
      setResultPreviewContent("screen-1");
      setAmountEntry(String(next.ditheringAmount));
    }
    setState({ kind: "idle" });
  }

  useEffect(() => {
    const profile = profiles.find(({ id }) => id === startupApplicationSettings.profileId);
    const preset = profile?.presets.find(({ id }) => id === startupApplicationSettings.presetId);
    if (preset !== undefined) applySettings(preset.settings);
    setTargetModeId(startupApplicationSettings.modeId);
    setFraming(startupApplicationSettings.framing);
    // The preset application above also restores its dither engine. Reconcile
    // the persisted public method afterward so first image import cannot send
    // an Ordered/Error-diffusion method with the preset's no-dither engine.
    switchDithering(startupApplicationSettings.dithering);
    setAmountEntry(String(startupApplicationSettings.ditheringAmount));
  }, []);

  useEffect(() => {
    saveEnginePreferences(localStorage, {
      attributeOptimizerId,
      ditherEngineId,
    });
    ditherEngineByMethodRef.current[ditherMethodForEngine(ditherEngineId)] =
      ditherEngineId;
  }, [attributeOptimizerId, ditherEngineId]);

  // The public dithering method and the worker engine are two parts of one
  // setting. Keep them reconciled during startup as well as after UI edits;
  // otherwise the first Draft can be scheduled with a stale preset engine.
  useEffect(() => {
    if (ditherMethodForEngine(ditherEngineId) !== dithering) {
      switchDithering(dithering);
    }
  }, [dithering, ditherEngineId]);

  useEffect(() => {
    saveWorkspacePreferences(localStorage, {
      layout: workspaceLayout,
      sourceContent: sourcePreviewContent,
      resultContent: resultPreviewContent,
      previewZoom,
      sourceZoom: sourcePreviewZoom,
      resultZoom: resultPreviewZoom,
      synchronizePan,
      synchronizeZoom,
      showPixelGrid,
      showAttributeGrid,
      hideAttributes,
      inspectionDrawerOpen,
    });
  }, [workspaceLayout, sourcePreviewContent, resultPreviewContent,
    previewZoom, sourcePreviewZoom, resultPreviewZoom, synchronizePan, synchronizeZoom, showPixelGrid, showAttributeGrid, hideAttributes,
    inspectionDrawerOpen]);

  useEffect(() => {
    saveWorkbenchPreferences(localStorage, {
      dock: workbenchSettingsDock,
      minimized: workbenchSettingsMinimized,
      sideWidth: workbenchSettingsSideWidth,
      leftWidth: workbenchLeftWidth,
      rightWidth: workbenchRightWidth,
      bottomHeight: workbenchBottomHeight,
      floatingX: workbenchFloatingX,
      floatingY: workbenchFloatingY,
      settingsFloatingWidth: workbenchSettingsFloatingWidth,
      settingsFloatingHeight: workbenchSettingsFloatingHeight,
      toolsDock: workbenchToolsDock,
      toolsFloatingX: workbenchToolsFloatingX,
      toolsFloatingY: workbenchToolsFloatingY,
      toolsFloatingWidth: workbenchToolsFloatingWidth,
      toolsFloatingHeight: workbenchToolsFloatingHeight,
      geometryFloating: workbenchGeometryFloating,
      geometryFloatingX: workbenchGeometryFloatingX,
      geometryFloatingY: workbenchGeometryFloatingY,
      geometryFloatingWidth: workbenchGeometryFloatingWidth,
      geometryFloatingHeight: workbenchGeometryFloatingHeight,
      geometryFloatingAutoHeight: workbenchGeometryFloatingAutoHeight,
      adjustmentsFloating: workbenchAdjustmentsFloating,
      adjustmentsFloatingX: workbenchAdjustmentsFloatingX,
      adjustmentsFloatingY: workbenchAdjustmentsFloatingY,
      adjustmentsFloatingWidth: workbenchAdjustmentsFloatingWidth,
      adjustmentsFloatingHeight: workbenchAdjustmentsFloatingHeight,
      adjustmentsFloatingAutoHeight: workbenchAdjustmentsFloatingAutoHeight,
      windowOrder: workbenchWindowOrder,
      paletteFloating: workbenchPaletteFloating,
      paletteFloatingX: workbenchPaletteFloatingX,
      paletteFloatingY: workbenchPaletteFloatingY,
      paletteFloatingWidth: workbenchPaletteFloatingWidth,
      paletteFloatingHeight: workbenchPaletteFloatingHeight,
      paletteFloatingAutoHeight: workbenchPaletteFloatingAutoHeight,
      ditheringFloating: workbenchDitheringFloating,
      ditheringFloatingX: workbenchDitheringFloatingX,
      ditheringFloatingY: workbenchDitheringFloatingY,
      ditheringFloatingWidth: workbenchDitheringFloatingWidth,
      ditheringFloatingHeight: workbenchDitheringFloatingHeight,
      ditheringFloatingAutoHeight: workbenchDitheringFloatingAutoHeight,
      tilemapFloating: workbenchTilemapFloating,
      tilemapFloatingX: workbenchTilemapFloatingX,
      tilemapFloatingY: workbenchTilemapFloatingY,
      tilemapFloatingWidth: workbenchTilemapFloatingWidth,
      tilemapFloatingHeight: workbenchTilemapFloatingHeight,
      tilemapFloatingAutoHeight: workbenchTilemapFloatingAutoHeight,
      sourceFloating: workbenchSourceFloating,
      sourceFloatingX: workbenchSourceFloatingX,
      sourceFloatingY: workbenchSourceFloatingY,
      sourceFloatingWidth: workbenchSourceFloatingWidth,
      sourceFloatingHeight: workbenchSourceFloatingHeight,
      sourceFloatingAutoHeight: workbenchSourceFloatingAutoHeight,
      resultFloating: workbenchResultFloating,
      resultFloatingX: workbenchResultFloatingX,
      resultFloatingY: workbenchResultFloatingY,
      resultFloatingWidth: workbenchResultFloatingWidth,
      resultFloatingHeight: workbenchResultFloatingHeight,
      resultFloatingAutoHeight: workbenchResultFloatingAutoHeight,
      sourceDockedWidth: workbenchSourceDockedWidth,
      resultDockedWidth: workbenchResultDockedWidth,
      toolsOpen: workbenchToolsOpen,
      sectionsOpen: workbenchSectionsOpen,
      windowLayouts: workbenchWindowLayouts,
    });
  }, [workbenchSettingsDock, workbenchSettingsMinimized, workbenchSettingsSideWidth,
    workbenchLeftWidth, workbenchRightWidth,
    workbenchBottomHeight, workbenchFloatingX, workbenchFloatingY,
    workbenchSettingsFloatingWidth, workbenchSettingsFloatingHeight,
    workbenchToolsDock, workbenchToolsFloatingX, workbenchToolsFloatingY,
    workbenchToolsFloatingWidth, workbenchToolsFloatingHeight,
    workbenchGeometryFloating, workbenchGeometryFloatingX, workbenchGeometryFloatingY,
    workbenchGeometryFloatingWidth, workbenchGeometryFloatingHeight,
    workbenchGeometryFloatingAutoHeight, workbenchAdjustmentsFloating,
    workbenchAdjustmentsFloatingX, workbenchAdjustmentsFloatingY,
    workbenchAdjustmentsFloatingWidth, workbenchAdjustmentsFloatingHeight,
    workbenchAdjustmentsFloatingAutoHeight,
    workbenchWindowOrder,
    workbenchPaletteFloating, workbenchPaletteFloatingX, workbenchPaletteFloatingY,
    workbenchPaletteFloatingWidth, workbenchPaletteFloatingHeight,
    workbenchPaletteFloatingAutoHeight,
    workbenchDitheringFloating, workbenchDitheringFloatingX, workbenchDitheringFloatingY,
    workbenchDitheringFloatingWidth, workbenchDitheringFloatingHeight,
    workbenchDitheringFloatingAutoHeight,
    workbenchTilemapFloating, workbenchTilemapFloatingX, workbenchTilemapFloatingY,
    workbenchTilemapFloatingWidth, workbenchTilemapFloatingHeight,
    workbenchTilemapFloatingAutoHeight,
    workbenchSourceFloating, workbenchSourceFloatingX, workbenchSourceFloatingY,
    workbenchSourceFloatingWidth, workbenchSourceFloatingHeight, workbenchSourceFloatingAutoHeight,
    workbenchResultFloating, workbenchResultFloatingX, workbenchResultFloatingY,
    workbenchResultFloatingWidth, workbenchResultFloatingHeight, workbenchResultFloatingAutoHeight,
    workbenchSourceDockedWidth, workbenchResultDockedWidth,
    workbenchToolsOpen, workbenchSectionsOpen, workbenchWindowLayouts]);

  function setResultEditorBuffer(buffer: NativeResultBitmap | null): void {
    bitmapEditorResultBufferRef.current = buffer === null ? null : cloneNativeResultBitmap(buffer);
    setBitmapEditorResultBuffer(buffer === null ? null : cloneNativeResultBitmap(buffer));
  }

  function clearBitmapEditorPickedCell(): void {
    setBitmapEditorPickedCell(null);
    setBitmapEditorPickedFrameIndex(null);
  }

  function resetResultEditorState(): void {
    bitmapEditorColorDraftRef.current = null;
    setBitmapEditorFlashPreviewMode("normal");
    setBitmapEditorFlashPreviewPhase(false);
    clearBitmapEditorPickedCell();
    setBitmapEditorColorPickerActive(false);
    setBitmapEditorPatternPickerActive(false);
    setBitmapEditorRegionSelection(null);
    setBitmapEditorSelectionDraft(null);
    setBitmapEditorSelectionTool("rectangle");
    setBitmapEditorClipboard(null);
    setBitmapEditorPasteMode(null);
    setBitmapEditorScope("pixel");
    setBitmapEditorPrimitiveDraft(null);
    setBitmapEditorPrimitiveCursor(null);
    setBitmapEditorPrimitivePatternPickerActive(false);
    setBitmapEditorPrimitiveCustomPattern(null);
    bitmapEditorResultSourceRef.current = null;
    bitmapEditorCurrentResultRef.current = null;
    setResultEditorBuffer(null);
    setBitmapEditorResultUndo([]);
    setBitmapEditorResultRedo([]);
    setBitmapEditorResultOriginal(null);
    setBitmapEditorResultOriginalResult(null);
    setBitmapEditorResultEdited(false);
    setBitmapEditorResultFrameIndex(0);
    setBitmapEditorResultPaletteIndex(1);
  }

  useEffect(() => {
    if (originalImage === null) return;
    const isNewEmptyImage = pendingNewEmptyImageRef.current;
    pendingNewEmptyImageRef.current = false;
    const firstSource = !startupWorkspaceAppliedRef.current;
    startupWorkspaceAppliedRef.current = true;
    const startupProfileId = `${BUILTIN_WORKSPACE_PROFILE_PREFIX}${startupWorkspaceLayout}`;
    const keepSelectedProfile = firstSource && (
      workspaceProfileSelectionMadeRef.current ||
      activeWorkspaceProfileId !== startupProfileId ||
      savedWorkbenchLayouts.some((layout) => layout.id === activeWorkspaceProfileId)
    );
    if (firstSource) {
      if (keepSelectedProfile) {
        selectWorkspaceProfile(activeWorkspaceProfileId);
      } else {
        applyWorkspaceLayout(startupWorkspaceLayout);
        restoreWorkbenchPreferences();
      }
    } else if (!isNewEmptyImage) {
      setSourcePreviewContent("image");
      setResultPreviewContent("image");
    }
    if (isNewEmptyImage) setResultPreviewContent("bitmap-editor");
    if (!keepSelectedProfile) {
      setPreviewZoom("fit");
      setSourcePreviewZoom("fit");
      setResultPreviewZoom("fit");
      setShowPixelGrid(false);
      setShowAttributeGrid(false);
    }
    setInspection(null);
    setBitmapEditorSelection(null);
    setBitmapEditorOriginalResult(null);
    bitmapEditorFullBufferRef.current = null;
    bitmapEditorEncodedRef.current = null;
    setBitmapEditorBuffer(null);
    setBitmapEditorUndoFull([]);
    setBitmapEditorRedoFull([]);
    setBitmapEditorRevertSource(null);
    if (!isNewEmptyImage) resetResultEditorState();
    setBitmapEditorSourceColor(null);
    setTileEditorUndo([]);
    setTileEditorRedo([]);
    setTilemapEditorCell(null);
    setSelectedPaletteColor(null);
  }, [originalImage]);

  function resultFrameInput(
    result: WorkerConversionResult,
    frameIndex: number,
    overrides: {
      readonly encoded?: Uint8Array;
      readonly pmd85Palette?: readonly Pmd85RgbColor[];
      readonly pmd85GapPolicy?: "zero" | "preserve-imported";
      readonly importedGapBytes?: Uint8Array;
    } = {},
  ): NativeResultFrameInput | null {
    const frame = result.frames[frameIndex];
    if (frame === undefined) return null;
    const importedGapBytes = overrides.importedGapBytes ?? (result.platformId === "pmd-85" &&
        (overrides.pmd85GapPolicy ?? pmd85GapPolicy) === "preserve-imported" &&
        sourceArtifact?.bytes.length === 16384
      ? extractPmd85GapBytes(sourceArtifact.bytes)
      : undefined);
    return {
      platformId: result.platformId,
      modeId: result.modeId,
      hardwareModeId: frame.hardwareModeId,
      encoded: overrides.encoded ?? frame.encoded,
      nativeWidth: frame.nativeWidth,
      nativeHeight: frame.nativeHeight,
      attributeHeight: result.attributeHeight,
      ...(result.platformId === "zx-spectrum"
        ? { zxPalette: resolveZxPalette(zxPaletteDefinition) }
        : {}),
      ...(result.platformId === "pmd-85"
        ? {
            pmd85ForegroundPalette: overrides.pmd85Palette ?? pmd85PaletteForResult(profiles, selectedProfile, result.modeId, pmd85PaletteCalibrationId),
            pmd85GapPolicy: overrides.pmd85GapPolicy ?? pmd85GapPolicy,
            ...(importedGapBytes === undefined ? {} : { pmd85ImportedGapBytes: importedGapBytes }),
          }
        : {}),
    };
  }

  function initializeResultEditor(result: WorkerConversionResult, frameIndex = 0): NativeResultBitmap | null {
    bitmapEditorColorDraftRef.current = null;
    const input = resultFrameInput(result, frameIndex);
    if (input === null) return null;
    const bitmap = createNativeResultBitmap(input);
    bitmapEditorResultSourceRef.current = result;
    bitmapEditorCurrentResultRef.current = result;
    setBitmapEditorResultFrameIndex(frameIndex);
    setResultEditorBuffer(bitmap);
    setBitmapEditorResultOriginal(cloneNativeResultBitmap(bitmap));
    setBitmapEditorResultUndo([]);
    setBitmapEditorResultRedo([]);
    return bitmap;
  }

  useEffect(() => {
    if (lastFinal === null) return;
    const resultWasEdited = pendingOpenedResultEditedRef.current;
    pendingOpenedResultEditedRef.current = false;
    setBitmapEditorResultQuality(pendingOpenedResultQualityRef.current);
    if (!resultWasEdited) return;
    const bitmap = initializeResultEditor(lastFinal, 0);
    if (bitmap !== null) setBitmapEditorResultEdited(true);
  }, [lastFinal]);

  useEffect(() => {
    if (bitmapEditorSelection === null || workspaceMode !== "palette") {
      setBitmapEditorCell(null);
      setBitmapEditorUndo([]);
      setBitmapEditorRedo([]);
      return;
    }
    const rows = new Uint8Array(8);
    rows.set(bitmapEditorSelection.bitmapBytes.slice(0, 8));
    setBitmapEditorCell({ rows, attribute: bitmapEditorSelection.attribute });
    setBitmapEditorUndo([]);
    setBitmapEditorRedo([]);
  }, [bitmapEditorSelection, workspaceMode]);

  useEffect(() => {
    setSelectedPaletteColor(null);
  }, [targetModeId]);

  useEffect(() => {
    const mixedScreenTarget = targetModeId === "zx48-mixed-256x192" ||
      targetModeId === "mode8-256x256" ||
      targetModeId === "mode4-512x256" ||
      targetModeId === "mode8-mode4-mixed-512x256";
    const mixedResolutionTarget = targetModeId === "mode8-mode4-mixed-512x256";
    const unavailable = new Set<PreviewContent>();
    if (workspaceMode !== "palette") unavailable.add("pre-attribute");
    if (!mixedScreenTarget && !targetModeId.includes("vertical-spatial")) {
      unavailable.add("screen-1");
      unavailable.add("screen-2");
    }
    if (!mixedResolutionTarget) {
      unavailable.add("merged-low");
      unavailable.add("merged-high");
    }
    if (workspaceMode !== "tilemap") {
      unavailable.add("tile-usage");
    }
    if (workspaceMode !== "palette") {
      unavailable.add("bitmap-editor");
    }
    if (unavailable.has(sourcePreviewContent)) setSourcePreviewContent("image");
    if (unavailable.has(resultPreviewContent)) setResultPreviewContent("image");
  }, [workspaceMode, targetModeId, sourcePreviewContent, resultPreviewContent]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function mergedResultPreview(
    result: WorkerConversionResult,
    frames: readonly WorkerConversionResult["frames"][number][],
  ): Uint8Array {
    const first = frames[0];
    if (first === undefined) return result.mergedPreviewRgba.slice();
    if (frames.length === 1) return first.previewRgba.slice();
    const second = frames[1];
    if (second === undefined) return first.previewRgba.slice();
    if (result.platformId === "sinclair-ql" &&
        first.previewRgba.length === result.width * result.height * 4 &&
        second.previewRgba.length === result.width * result.height * 4) {
      return renderQlMixedDisplayPreview(
        first.previewRgba,
        second.previewRgba,
        result.width,
        qlMixedDisplayResolution,
      );
    }
    if (result.platformId === "zx-spectrum" && result.modeId === "zx48-mixed-256x192") {
      return mergeTemporalRgba(first.previewRgba, second.previewRgba);
    }
    if (result.platformId === "zx-spectrum") {
      return mergeMonochromeRgba(first.previewRgba, second.previewRgba);
    }
    return first.previewRgba.slice();
  }

  function resultWithEditedFrame(
    result: WorkerConversionResult,
    frameIndex: number,
    bitmap: NativeResultBitmap,
  ): WorkerConversionResult {
    const frames = result.frames.map((frame, index) => index === frameIndex
      ? {
          ...frame,
          encoded: bitmap.encoded.slice(),
          paletteIndices: bitmap.paletteIndices.slice(),
          previewRgba: expandResultPreviewForFrame(bitmap, frame),
        }
      : frame);
    const mergedPreviewRgba = mergedResultPreview(result, frames);
    const verticalSpatialDiagnostics = result.verticalSpatialDiagnostics === undefined
      ? undefined
      : {
          ...result.verticalSpatialDiagnostics,
          analyticPreviewRgba: buildVerticalSpatialAnalyticPreview(
            mergedPreviewRgba,
            result.width,
            result.height,
          ),
        };
    return {
      ...result,
      artifact: frames[0]?.encoded.slice() ?? result.artifact.slice(),
      scr: frames[0]?.encoded.slice() ?? result.scr.slice(),
      frames,
      previewRgba: mergedPreviewRgba.slice(),
      mergedPreviewRgba,
      ...(verticalSpatialDiagnostics === undefined ? {} : { verticalSpatialDiagnostics }),
      ...(result.platformId === "zx-spectrum" && frames[0] !== undefined
        ? {
            pixels: unpackZxBitmap(frames[0].encoded),
            attributes: frames[0].encoded.slice(6144),
            screen: {
              pixels: unpackZxBitmap(frames[0].encoded),
              attributes: frames[0].encoded.slice(6144),
            },
          }
        : {}),
    };
  }

  // Moving a preview between dock portal hosts can replace its canvas node.
  // Repaint after dock/minimized changes rather than waiting for another
  // conversion or preview-content change.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || image === null) return;
    let displayResult = workspaceMode === "tilemap" &&
        charsetState.kind === "ready" && !tilemapStale
      ? lastFinal
      : draftPreviewResult(draftState) ?? lastFinal;
    const pendingColorDraft = bitmapEditorColorDraftRef.current;
    const pendingColorPreview = bitmapEditorResultBuffer;
    if (bitmapEditorTarget === "result" &&
        displayResult !== null &&
        pendingColorDraft?.result === displayResult &&
        pendingColorDraft.frameIndex < displayResult.frames.length &&
        pendingColorPreview !== null) {
      displayResult = resultWithEditedFrame(displayResult, pendingColorDraft.frameIndex, pendingColorPreview);
    }
    const fallbackPreview = displayResult === null && framing !== "crop"
      ? frameFallbackSourcePreview(
          image.rgba,
          image.width,
          image.height,
          selectedPlatformId,
          targetModeId,
          {
            framing,
            resampling,
            rotation,
            mirrorHorizontal,
            mirrorVertical,
            fillOffsetX,
            fillOffsetY,
            panOffsetX,
            panOffsetY,
            panEdgeMode,
            crop: { x: 0, y: 0, width: image.width, height: image.height },
            background,
          },
        )
      : null;
    const cropCanvasSize = framing === "crop"
      ? orientedSourceSize(image.width, image.height, rotation)
      : null;
    canvas.width = cropCanvasSize?.width ??
      (displayResult?.width ?? fallbackPreview?.width ?? destinationGeometry.width);
    canvas.height = cropCanvasSize?.height ??
      (displayResult?.height ?? fallbackPreview?.height ?? destinationGeometry.height);
    const context = canvas.getContext("2d");
    if (context === null) return;
    const showingOriginalSource = sourcePreviewContent === "image" ||
      sourcePreviewContent === "source-image" ||
      resultPreviewContent === "source-image";
    if (showingOriginalSource && framing !== "crop") {
      canvas.width = image.width;
      canvas.height = image.height;
      const pixels = new Uint8ClampedArray(Uint8Array.from(image.rgba).buffer);
      context.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
      return;
    }
    // Crop editing always needs the oriented source bitmap as its backing
    // canvas. A stale/retained tilemap result may still be available while
    // the crop settings are being edited, but painting that result here would
    // put its smaller dimensions into the source-sized canvas and desync the
    // crop overlay from the displayed image.
    if (
      workspaceMode === "tilemap" &&
      framing !== "crop" &&
      displayResult !== null
    ) {
      const frame = displayResult.frames[0];
      const rgba = hideAttributes &&
          displayResult.platformId === "zx-spectrum" &&
          frame !== undefined
        ? zxBitmapToMonochromeRgba(frame.encoded)
        : frame?.previewRgba;
      if (rgba === undefined) return;
      const pixels = new Uint8ClampedArray(Uint8Array.from(rgba).buffer);
      context.putImageData(
        new ImageData(pixels, displayResult.width, displayResult.height),
        0,
        0,
      );
      return;
    }
    if (framing === "crop") {
      drawOrientedCropSource(
        context,
        image,
        rotation,
        mirrorHorizontal,
        mirrorVertical,
      );
      return;
    }
    if (displayResult !== null) {
      const rgba = inputPreviewStage === "pre-constraint"
        ? displayResult.preConstraintPreviewRgba
        : displayResult.sourcePreviewRgba;
      const pixels = new Uint8ClampedArray(Uint8Array.from(rgba).buffer);
      context.putImageData(
        new ImageData(pixels, displayResult.width, displayResult.height),
        0,
        0,
      );
      return;
    }
    if (fallbackPreview !== null) {
      const pixels = new Uint8ClampedArray(
        Uint8Array.from(fallbackPreview.rgba).buffer,
      );
      context.putImageData(
        new ImageData(pixels, fallbackPreview.width, fallbackPreview.height),
        0,
        0,
      );
    }
  }, [
    image, draftState, lastFinal, framing, rotation, mirrorHorizontal,
    mirrorVertical, resampling, fillOffsetX, fillOffsetY, panOffsetX, panOffsetY,
    panEdgeMode,
    inputPreviewStage, workspaceMode, charsetState, sourcePreviewContent, background,
    resultPreviewContent,
    tilemapStale, hideAttributes, selectedPlatformId, targetModeId,
    destinationGeometry.width, destinationGeometry.height,
    isPmd, brightness, contrast, saturation, hueShift, hslSaturation, lightness, colorize, gamma, smoothing, sharpening,
    workbenchSourceFloating, workbenchResultFloating, workbenchPreviewLayer,
    workbenchWindowLayouts.source.dock, workbenchWindowLayouts.source.minimized,
    workbenchWindowLayouts.result.dock, workbenchWindowLayouts.result.minimized,
  ]);

  // Keep the converted canvas in sync for the same docked/floating transition
  // as the source canvas. This covers normal image previews as well as screen
  // and tilemap result stages.
  useLayoutEffect(() => {
    const canvases = [sourceConvertedCanvasRef.current, convertedCanvasRef.current]
      .filter((canvas): canvas is HTMLCanvasElement => canvas !== null);
    let displayResult = workspaceMode === "tilemap" &&
        charsetState.kind === "ready" && !tilemapStale
      ? lastFinal
      : draftPreviewResult(draftState) ?? lastFinal;
    const pendingColorDraft = bitmapEditorColorDraftRef.current;
    const pendingColorPreview = bitmapEditorResultBuffer;
    if (bitmapEditorTarget === "result" &&
        displayResult !== null &&
        pendingColorDraft?.result === displayResult &&
        pendingColorDraft.frameIndex < displayResult.frames.length &&
        pendingColorPreview !== null) {
      displayResult = resultWithEditedFrame(displayResult, pendingColorDraft.frameIndex, pendingColorPreview);
    }
    const showResultPixels = bitmapEditorTarget !== "result" || bitmapEditorShowPixels;
    const showResultAttributes = bitmapEditorTarget !== "result" ||
      (bitmapEditorShowAttributes && !hideAttributes);
    const standaloneTilemap = workspaceMode === "tilemap" &&
      charsetState.kind === "ready" && !tilemapStale && displayResult === null;
    if (canvases.length === 0 || (displayResult === null && !standaloneTilemap)) return;
    if (standaloneTilemap) {
      const screen = charsetState.result.decodedScr;
      const rgba = bitmapEditorTarget === "result" && !showResultPixels && !showResultAttributes
        ? new Uint8Array(256 * 192 * 4)
        : bitmapEditorTarget === "result" && !showResultPixels && showResultAttributes
          ? (() => {
            const attributesOnly = screen.slice();
            attributesOnly.fill(0, 0, ZX_BITMAP_BYTES);
            return renderZxFlashPreview(attributesOnly, 8, false, resolveZxPalette(zxPaletteDefinition));
          })()
          : bitmapEditorTarget === "result" && showResultPixels && !showResultAttributes
            ? zxBitmapToMonochromeRgba(screen)
            : hideAttributes
        ? zxBitmapToMonochromeRgba(screen)
        : bitmapEditorFlashPreviewMode === "inverted" ||
            (bitmapEditorFlashPreviewMode === "animate" && bitmapEditorFlashPreviewPhase)
          ? renderZxFlashPreview(screen, 8, true, resolveZxPalette(zxPaletteDefinition))
          : charsetState.result.previewRgba;
      for (const canvas of canvases) {
        canvas.width = 256;
        canvas.height = 192;
        const context = canvas.getContext("2d");
        if (context === null) continue;
        context.putImageData(new ImageData(new Uint8ClampedArray(Uint8Array.from(rgba).buffer), 256, 192), 0, 0);
      }
      return;
    }
    if (displayResult === null) return;
    let rgba: Uint8Array | undefined;
    let previewWidth = displayResult.width;
    let previewHeight = displayResult.height;
    const flashPhase = (
      bitmapEditorFlashPreviewMode === "inverted" ||
      (bitmapEditorFlashPreviewMode === "animate" && bitmapEditorFlashPreviewPhase)
    );
    const zxFramePreview = (frameIndex: number): Uint8Array | undefined => {
      const frame = displayResult.frames[frameIndex];
      if (frame === undefined) return undefined;
      if (displayResult.platformId === "zx-spectrum" && bitmapEditorTarget === "result") {
        if (!showResultPixels && !showResultAttributes) {
          return new Uint8Array(displayResult.width * displayResult.height * 4);
        }
        if (!showResultPixels && showResultAttributes && displayResult.attributeHeight !== null) {
          const attributesOnly = frame.encoded.slice();
          attributesOnly.fill(0, 0, ZX_BITMAP_BYTES);
          return renderZxFlashPreview(
            attributesOnly,
            displayResult.attributeHeight,
            flashPhase,
            resolveZxPalette(zxPaletteDefinition),
          );
        }
        if (showResultPixels && !showResultAttributes) {
          return zxBitmapToMonochromeRgba(frame.encoded);
        }
      }
      if (displayResult.platformId === "zx-spectrum" &&
          displayResult.attributeHeight !== null && flashPhase) {
        return renderZxFlashPreview(frame.encoded, displayResult.attributeHeight, true, resolveZxPalette(zxPaletteDefinition));
      }
      return frame.previewRgba;
    };
    const physicalSpatialFrame = displayResult.frames[0];
    const spatialPreview = displayResult.verticalSpatialDiagnostics === undefined ||
        physicalSpatialFrame === undefined
      ? undefined
      : verticalSpatialPreviewForStage(
          outputPreviewStage,
          zxFramePreview(0) ?? physicalSpatialFrame.previewRgba,
          displayResult.width,
          displayResult.height,
          displayResult.verticalSpatialDiagnostics,
        );
    if (displayResult.platformId === "zx-spectrum" &&
        bitmapEditorTarget === "result" &&
        !showResultPixels && !showResultAttributes) {
      rgba = new Uint8Array(displayResult.width * displayResult.height * 4);
    } else if (
      displayResult.platformId === "zx-spectrum" &&
      (hideAttributes || !showResultAttributes) &&
      showResultPixels
    ) {
      if (workspaceMode === "tilemap") {
        rgba = charsetState.kind === "ready"
          ? zxBitmapToMonochromeRgba(charsetState.result.decodedScr)
          : undefined;
      } else if (
        displayResult.verticalSpatialDiagnostics !== undefined &&
        (outputPreviewStage === "merged" || outputPreviewStage === "screen-2")
      ) {
        const first = displayResult.frames[0];
        rgba = first === undefined
          ? undefined
          : buildVerticalSpatialAnalyticPreview(
              zxBitmapToMonochromeRgba(first.encoded),
              displayResult.width,
              displayResult.height,
            );
      } else if (outputPreviewStage === "merged") {
        const first = displayResult.frames[0];
        const second = displayResult.frames[1];
        rgba = first === undefined
          ? undefined
          : second === undefined
            ? zxBitmapToMonochromeRgba(first.encoded)
            : mergeMonochromeRgba(
                zxBitmapToMonochromeRgba(first.encoded),
                zxBitmapToMonochromeRgba(second.encoded),
              );
      } else {
        const frame = outputPreviewStage === "screen-2"
          ? displayResult.frames[1] ?? displayResult.frames[0]
          : displayResult.frames[0];
        rgba = frame === undefined
          ? undefined
          : zxBitmapToMonochromeRgba(frame.encoded);
      }
    } else {
      rgba = workspaceMode === "tilemap"
        ? charsetState.kind === "ready"
          ? flashPhase
            ? renderZxFlashPreview(charsetState.result.decodedScr, 8, true, resolveZxPalette(zxPaletteDefinition))
            : charsetState.result.previewRgba
          : undefined
        : outputPreviewStage === "screen-2"
          ? displayResult.verticalSpatialDiagnostics !== undefined
          ? spatialPreview?.rgba
            : zxFramePreview(1) ?? zxFramePreview(0)
          : outputPreviewStage === "merged"
            ? displayResult.platformId === "sinclair-ql" &&
                displayResult.modeId === "mode8-mode4-mixed-512x256" &&
                displayResult.frames[0] !== undefined &&
                displayResult.frames[1] !== undefined
              ? renderQlMixedDisplayPreview(
                  displayResult.frames[0].previewRgba,
                  displayResult.frames[1].previewRgba,
                  displayResult.width,
                  qlMixedDisplayResolution,
                )
              : displayResult.verticalSpatialDiagnostics !== undefined
                ? spatialPreview?.rgba
                : bitmapEditorTarget === "result" && (!showResultPixels || !showResultAttributes)
                  ? displayResult.frames[0] !== undefined && displayResult.frames[1] !== undefined
                    ? mergeTemporalRgba(
                        zxFramePreview(0) ?? displayResult.frames[0].previewRgba,
                        zxFramePreview(1) ?? displayResult.frames[1].previewRgba,
                      )
                    : zxFramePreview(0) ?? displayResult.frames[0]?.previewRgba
                : displayResult.platformId === "zx-spectrum" && flashPhase
                  ? displayResult.frames.length > 1
                    ? mergeTemporalRgba(
                        zxFramePreview(0) ?? displayResult.frames[0]!.previewRgba,
                        zxFramePreview(1) ?? displayResult.frames[1]!.previewRgba,
                      )
                    : zxFramePreview(0) ?? displayResult.mergedPreviewRgba
                  : displayResult.mergedPreviewRgba
            : zxFramePreview(0);
    }
    if (displayResult.verticalSpatialDiagnostics !== undefined) {
      previewWidth = spatialPreview?.width ?? previewWidth;
      previewHeight = spatialPreview?.height ?? previewHeight;
    }
    for (const canvas of canvases) {
      canvas.width = previewWidth;
      canvas.height = previewHeight;
      const context = canvas.getContext("2d");
      if (context === null) continue;
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (rgba === undefined) continue;
      const pixels = new Uint8ClampedArray(Uint8Array.from(rgba).buffer);
      context.putImageData(
        new ImageData(pixels, previewWidth, previewHeight),
        0,
        0,
      );
    }
  }, [
    draftState, lastFinal, outputPreviewStage, workspaceMode, charsetState,
    bitmapEditorFlashPreviewMode, bitmapEditorFlashPreviewPhase,
    bitmapEditorTarget, bitmapEditorResultBuffer, bitmapEditorShowPixels, bitmapEditorShowAttributes, zxPaletteDefinition,
    sourcePreviewContent, resultPreviewContent,
    tilemapStale, hideAttributes, qlMixedDisplayResolution,
    brightness, contrast, saturation, hueShift, hslSaturation, lightness, colorize, gamma, smoothing, sharpening,
    workbenchSourceFloating, workbenchResultFloating, workbenchPreviewLayer,
    workbenchWindowLayouts.source.dock, workbenchWindowLayouts.source.minimized,
    workbenchWindowLayouts.result.dock, workbenchWindowLayouts.result.minimized,
  ]);

  useEffect(() => {
    setInspection(null);
  }, [draftState, lastFinal]);

  useEffect(() => {
    const profile = profiles.find(
      (candidate) => candidate.id === selectedProfileId,
    );
    const producesMultipleFrames = profile !== undefined &&
      targetProducesMultipleFrames(profile.platform_id, targetModeId);
    if (
      !producesMultipleFrames &&
      outputPreviewStage !== "screen-1"
    ) {
      setOutputPreviewStage("screen-1");
    }
  }, [
    outputPreviewStage,
    profiles,
    selectedProfileId,
    targetModeId,
  ]);

  return {
    applySettings,
    clearBitmapEditorPickedCell,
    initializeResultEditor,
    pmd85ForegroundPalette,
    resetResultEditorState,
    resultFrameInput,
    resultWithEditedFrame,
    setCropEntries,
    setResultEditorBuffer,
    switchDithering,
  };
}
