import { ConversionWorkerClient, type WorkerCharsetResult, type WorkerConversionResult } from "../worker/client.js";
import { type CharsetConversionOptions } from "@retro-converter/zx-charset";
import { type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, useEffect } from "react";
import { BUILT_IN_PROFILE, type ConversionProfile, profileModeScreens, QL_PROFILE_ID } from "../profiles.js";
import { type BrightMode, type ConversionSettings, type CropAspectRatio, DEFAULT_CONVERSION_SETTINGS, ditherMethodForEngine, latestDitherEngineForMethod, outputScreenCount, type PaletteSelection, type Pmd85TargetModeId, type Rotation, type TargetModeId } from "@retro-converter/conversion-core";
import { clampPixelCrop, cropResizeHandleAtPoint, moveCropFromDrag, orientedSourceSize, type PixelPoint, pointIsInsideCrop, resizeCropFromDrag, resizeCropToAspect, selectionFromDrag } from "../crop.js";
import { pmdHardwareModeForTarget, targetProducesMultipleFrames, verticalSpatialDitherEngine } from "../conversion-targets.js";
import { retargetHardwareModeSettings } from "../hardware-mode-settings.js";
import { resolveEnginePreferencesForTarget } from "../engine-preferences.js";
import { defaultOutputPreviewStage } from "../vertical-spatial-preview.js";
import { hexToRgb } from "../dithering-labels.js";
import { type Pmd85ModeId } from "@retro-converter/pmd-85";
import type { useRuntimeState } from "./use-runtime-state.js";
import type { useSettingsState } from "./use-settings-state.js";
import type { useWorkbenchState } from "./use-workbench-state.js";
import type { useResultEditing } from "./use-result-editing.js";
import type { useConversionSettings } from "./use-conversion-settings.js";
import { directPmd85Result } from "./result-editing-helpers.js";

export function useConversionActions(
  { attributeHeight, attributeOptimizerId, bitmapEditorEncodedRef, bitmapEditorFullBufferRef, bitmapEditorOriginalResult, bitmapEditorResultEdited, bitmapEditorResultOriginalResult, bitmapEditorRevertSource, charsetAllowPolarity, charsetAllowTransforms, charsetBudget, charsetDistance, charsetEncoding, charsetSource, charsetStrategy, charsetVisualWeighting, charsetWorkerRef, conversionSettings, cropAspectRatio, cropDragRef, cropHeight, cropSelectionActive, cropSourceSize, cropValid, cropWidth, cropX, cropY, destinationGeometry, ditherEngineId, dithering, existingActiveCharacterCount, existingCharset, existingCharsetChoiceValid, existingCharsetLength, existingCharsetSelection, existingCharsetStart, finalJobRef, finalRunningRef, framing, image, isPmd, isZx, lastFinal, lastFinalRevisionRef, paletteModeCacheRef, paletteSelections, pendingModeHighRef, pendingOpenedFinalRef, pmd85GapPolicy, pmd85WorkerOptions, profiles, resetResultEditorState, revisionRef, rotation, selectedPresetId, selectedProfile, selectedProfileId, setAmountEntry, setAttributeHeight, setAttributeOptimizerId, setBitmapEditorBuffer, setBitmapEditorOriginalResult, setBitmapEditorRedoFull, setBitmapEditorRevertSource, setBitmapEditorSelection, setBitmapEditorSourceColor, setBitmapEditorUndoFull, setCharsetState, setCropAspectRatio, setCropEntries, setCropHeightEntry, setCropPointerMode, setCropSelectionActive, setCropWidthEntry, setCropXEntry, setCropYEntry, setDitherEngineId, setDithering, setDraftState, setEmittedSourceCharsetIndices, setExportError, setImage, setImageStatus, setLastFinal, setLastFinalCompletedAt, setOriginalImage, setOutputPreviewStage, setPaletteSelections, setPmd85GapPolicy, setPmd85PaletteCalibrationId, setResultOrigin, setResultPreviewContent, setScreenFlickerSuppression, setSelectedPresetId, setSelectedProfileId, setSourcePreviewContent, setState, setTargetModeId, setTileEditorColorPickerActive, setTileEditorEdited, setTileEditorOriginals, setTileEditorRedo, setTileEditorSelected, setTileEditorTilePickerActive, setTileEditorUndo, setTileEditorUsageSort, setTileStampDraft, setTilemapEditorCell, setTilemapPutActive, setTilemapStale, setUnifiedTileEditorContext, setVerticalSpatialSwapRows, setWorkspaceMode, setZxPaletteDefinition, settingsValid, sourceArtifact, sourcePreviewContent, targetModeId, tilemapPutPointerRef, verticalSpatialSwapRows, workerRef, workspaceMode, workspaceModeRef }: Pick<ReturnType<typeof useRuntimeState>, "bitmapEditorEncodedRef" | "bitmapEditorFullBufferRef" | "bitmapEditorOriginalResult" | "bitmapEditorResultEdited" | "bitmapEditorResultOriginalResult" | "bitmapEditorRevertSource" | "charsetWorkerRef" | "cropDragRef" | "finalJobRef" | "finalRunningRef" | "lastFinal" | "lastFinalRevisionRef" | "pendingModeHighRef" | "pendingOpenedFinalRef" | "revisionRef" | "setBitmapEditorBuffer" | "setBitmapEditorOriginalResult" | "setBitmapEditorRedoFull" | "setBitmapEditorRevertSource" | "setBitmapEditorSelection" | "setBitmapEditorSourceColor" | "setBitmapEditorUndoFull" | "setCharsetState" | "setDraftState" | "setLastFinal" | "setState" | "setTileEditorColorPickerActive" | "setTileEditorEdited" | "setTileEditorOriginals" | "setTileEditorRedo" | "setTileEditorSelected" | "setTileEditorTilePickerActive" | "setTileEditorUndo" | "setTileEditorUsageSort" | "setTileStampDraft" | "setTilemapEditorCell" | "setTilemapPutActive" | "setUnifiedTileEditorContext" | "tilemapPutPointerRef" | "workerRef" | "workspaceModeRef"> &
    Pick<ReturnType<typeof useSettingsState>, "attributeHeight" | "attributeOptimizerId" | "charsetAllowPolarity" | "charsetAllowTransforms" | "charsetBudget" | "charsetDistance" | "charsetEncoding" | "charsetSource" | "charsetStrategy" | "charsetVisualWeighting" | "cropAspectRatio" | "ditherEngineId" | "dithering" | "existingCharset" | "existingCharsetLength" | "existingCharsetSelection" | "existingCharsetStart" | "framing" | "image" | "paletteModeCacheRef" | "paletteSelections" | "profiles" | "rotation" | "selectedPresetId" | "selectedProfileId" | "setAmountEntry" | "setAttributeHeight" | "setAttributeOptimizerId" | "setCropAspectRatio" | "setCropHeightEntry" | "setCropWidthEntry" | "setCropXEntry" | "setCropYEntry" | "setDitherEngineId" | "setDithering" | "setEmittedSourceCharsetIndices" | "setExportError" | "setImage" | "setImageStatus" | "setLastFinalCompletedAt" | "setOriginalImage" | "setPaletteSelections" | "setResultOrigin" | "setScreenFlickerSuppression" | "setSelectedPresetId" | "setSelectedProfileId" | "setTargetModeId" | "setTilemapStale" | "setVerticalSpatialSwapRows" | "setWorkspaceMode" | "setZxPaletteDefinition" | "sourceArtifact" | "targetModeId" | "verticalSpatialSwapRows" | "workspaceMode"> &
    Pick<ReturnType<typeof useWorkbenchState>, "cropSelectionActive" | "destinationGeometry" | "isPmd" | "isZx" | "pmd85GapPolicy" | "selectedProfile" | "setCropPointerMode" | "setCropSelectionActive" | "setOutputPreviewStage" | "setPmd85GapPolicy" | "setPmd85PaletteCalibrationId" | "setResultPreviewContent" | "setSourcePreviewContent" | "sourcePreviewContent"> &
    Pick<ReturnType<typeof useResultEditing>, "resetResultEditorState" | "setCropEntries"> &
    Pick<ReturnType<typeof useConversionSettings>, "conversionSettings" | "cropHeight" | "cropSourceSize" | "cropValid" | "cropWidth" | "cropX" | "cropY" | "existingActiveCharacterCount" | "existingCharsetChoiceValid" | "pmd85WorkerOptions" | "settingsValid">,
) {
  function bitmapEditorHasUnsavedEdits(): boolean {
    return bitmapEditorRevertSource !== null ||
      bitmapEditorOriginalResult !== null ||
      bitmapEditorResultEdited ||
      bitmapEditorResultOriginalResult !== null;
  }

  function confirmBitmapEditorAction(action: "convert" | "revert"): boolean {
    if (!bitmapEditorHasUnsavedEdits()) return true;
    return action === "convert"
      ? window.confirm("Reconvert image? This will reprocess the current working source and may replace manual bitmap edits. Continue?")
      : window.confirm("Revert bitmap edits? This will discard all editor changes and restore the original or last converted image. Continue?");
  }

  function initializeTileEditor(result: WorkerCharsetResult): void {
    tilemapPutPointerRef.current = null;
    setTilemapPutActive(false);
    setUnifiedTileEditorContext("map-cell");
    setTileStampDraft({ characterIndex: null, transform: 0, inverted: false, attribute: 0x38 });
    setTileEditorSelected(0);
    setTileEditorOriginals(Array.from({ length: result.characterCount }, () => null));
    setTileEditorUsageSort(false);
    setTileEditorUndo([]);
    setTileEditorRedo([]);
    setTilemapEditorCell(0);
    setTileEditorColorPickerActive(false);
    setTileEditorTilePickerActive(false);
    setTileEditorEdited(false);
  }

  async function runCharsetConversion(
    paletteResult: WorkerConversionResult | null = lastFinal,
  ): Promise<WorkerCharsetResult | null> {
    if (
      paletteResult === null ||
      paletteResult.platformId !== "zx-spectrum" ||
      paletteResult.modeId !== "zx48-standard-256x192" ||
      paletteResult.attributeHeight !== 8 ||
      paletteResult.frames.length !== 1
    ) {
      setCharsetState({
        kind: "error",
        message: "Charset conversion requires a final standard single-screen ZX result with 8×8 attributes.",
      });
      return null;
    }
    if (
      charsetSource === "existing" &&
      (existingCharset === null || !existingCharsetChoiceValid)
    ) {
      setCharsetState({ kind: "error", message: "Choose an existing raw charset first." });
      return null;
    }
    charsetWorkerRef.current?.dispose();
    const worker = new ConversionWorkerClient();
    charsetWorkerRef.current = worker;
    const options: CharsetConversionOptions = {
      source: charsetSource,
      ...(existingCharset === null ? {} : { existingCharset }),
      ...(charsetSource === "existing"
        ? {
            existingCharsetRange: {
              startIndex: existingCharsetStart,
              length: existingCharsetLength,
            },
            ...(existingCharsetSelection === null
              ? {}
              : {
                  existingCharsetSelection: {
                    indices: existingCharsetSelection,
                  },
                }),
          }
        : {}),
      characterBudget: charsetSource === "existing"
        ? existingActiveCharacterCount
        : charsetBudget,
      encoding: charsetEncoding,
      allowTransforms: charsetAllowTransforms,
      allowPolarity: charsetAllowPolarity,
      derivedStrategy: charsetStrategy,
      distanceMetric: charsetDistance,
      visualWeighting: charsetVisualWeighting,
      swapRefinementPasses:
          charsetStrategy === "image-similarity-v2" ||
          charsetStrategy === "image-similarity-v3" ||
          charsetStrategy === "image-similarity-v4" ||
          charsetStrategy === "image-similarity-v5"
        ? 4
        : charsetStrategy === "best-coverage" ? 1 : 0,
    };
    const outputSourceIndices = charsetSource !== "existing"
      ? null
      : existingCharsetSelection === null
        ? Array.from(
            { length: Math.min(existingCharsetLength, (existingCharset?.length ?? 0) / 8) },
            (_, index) => existingCharsetStart + index,
          )
        : [...existingCharsetSelection];
    setCharsetState({ kind: "running" });
    try {
      const result = await worker.convertCharset(
        paletteResult.frames[0]!.encoded,
        options,
      );
      if (charsetWorkerRef.current !== worker) return null;
      setEmittedSourceCharsetIndices(outputSourceIndices);
      setCharsetState({ kind: "ready", result });
      initializeTileEditor(result);
      setTilemapStale(false);
      setExportError(null);
      return result;
    } catch (error: unknown) {
      if (charsetWorkerRef.current !== worker) return null;
      setCharsetState({
        kind: "error",
        message: error instanceof Error ? error.message : "Charset conversion failed.",
      });
      return null;
    }
  }

  async function convertImage(options: { readonly confirmEdited?: boolean } = {}) {
    if (options.confirmEdited !== false && !confirmBitmapEditorAction("convert")) return;
    const worker = workerRef.current;
    if (worker === null || image === null || !settingsValid) {
      setState({ kind: "error", message: "Conversion settings are invalid." });
      return;
    }

    const job = finalJobRef.current + 1;
    finalJobRef.current = job;
    const revision = revisionRef.current;
    const conversionMode = workspaceMode;
    finalRunningRef.current = true;
    setBitmapEditorSelection(null);
    setBitmapEditorOriginalResult(null);
    bitmapEditorFullBufferRef.current = null;
    bitmapEditorEncodedRef.current = null;
    setBitmapEditorBuffer(null);
    setBitmapEditorUndoFull([]);
    setBitmapEditorRedoFull([]);
    setBitmapEditorRevertSource(null);
    resetResultEditorState();
    setBitmapEditorSourceColor(null);
    setTileEditorUndo([]);
    setTileEditorRedo([]);
    setState({ kind: "running" });
    try {
      const result = await worker.convertImage(
        image,
        conversionSettings,
        "high",
        pmd85WorkerOptions,
      );
      if (finalJobRef.current !== job) return;
      setLastFinal(result);
      setResultOrigin("converted");
      setLastFinalCompletedAt(new Date().toISOString());
      setExportError(null);
      lastFinalRevisionRef.current = revision;
      setDraftState({ kind: "idle" });
      if (conversionMode === "tilemap") {
        const tilemapResult = await runCharsetConversion(result);
        if (finalJobRef.current !== job) return;
        if (tilemapResult === null) {
          setState(revisionRef.current === revision
            ? { kind: "ready", result }
            : { kind: "stale" });
          return;
        }
        if (
          revisionRef.current !== revision ||
          workspaceModeRef.current !== conversionMode
        ) return;
      }
      setState(revisionRef.current === revision ? { kind: "ready", result } : { kind: "stale" });
    } catch (error: unknown) {
      if (finalJobRef.current !== job) return;
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Unknown error.",
      });
    } finally {
      if (finalJobRef.current === job) finalRunningRef.current = false;
    }
  }

  useEffect(() => {
    if (pendingModeHighRef.current !== workspaceMode) return;
    if (
      workspaceMode === "tilemap" &&
      (
        selectedProfileId === QL_PROFILE_ID ||
        targetModeId !== "zx48-standard-256x192" ||
        attributeHeight !== 8
      )
    ) return;
    pendingModeHighRef.current = null;
    if (image !== null && settingsValid) void convertImage({ confirmEdited: false });
  }, [
    workspaceMode,
    selectedProfileId,
    targetModeId,
    attributeHeight,
    image,
    settingsValid,
  ]);

  function ensurePixelCrop(nextRotation: Rotation = rotation) {
    if (image === null) return;
    const source = orientedSourceSize(image.width, image.height, nextRotation);
    const parsed = [cropX, cropY, cropWidth, cropHeight].every(Number.isInteger)
      ? { x: cropX, y: cropY, width: cropWidth, height: cropHeight }
      : { x: 0, y: 0, width: 100, height: 100 };
    const pixels = clampPixelCrop(parsed, source);
    setCropEntries(resizeCropToAspect(
      pixels,
      source,
      cropAspectRatio,
      "width",
      destinationGeometry,
    ));
  }

  function updateCropEntry(
    field: "x" | "y" | "width" | "height",
    value: string,
  ) {
    const setters = {
      x: setCropXEntry,
      y: setCropYEntry,
      width: setCropWidthEntry,
      height: setCropHeightEntry,
    };
    setters[field](value);
    setState({ kind: "idle" });
    if (cropSourceSize === null || !/^\d+$/.test(value)) return;
    const next = {
      x: field === "x" ? Number(value) : cropX,
      y: field === "y" ? Number(value) : cropY,
      width: field === "width" ? Number(value) : cropWidth,
      height: field === "height" ? Number(value) : cropHeight,
    };
    if (!Object.values(next).every(Number.isInteger)) return;
    if (field === "width" || field === "height") {
      setCropEntries(resizeCropToAspect(
        next,
        cropSourceSize,
        cropAspectRatio,
        field,
        destinationGeometry,
      ));
    }
  }

  function changeCropAspectRatio(next: CropAspectRatio) {
    setCropAspectRatio(next);
    if (cropSourceSize !== null && cropValid) {
      setCropEntries(resizeCropToAspect(
        { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
        cropSourceSize,
        next,
        "width",
        destinationGeometry,
      ));
    }
    setState({ kind: "idle" });
  }

  function sourcePointFromCropPointer(
    event: ReactPointerEvent<HTMLCanvasElement> | ReactMouseEvent<HTMLCanvasElement>,
  ): PixelPoint | null {
    if (cropSourceSize === null) return null;
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / bounds.width * cropSourceSize.width,
      y: (event.clientY - bounds.top) / bounds.height * cropSourceSize.height,
    };
  }

  function cropResizeTolerance(
    event: ReactPointerEvent<HTMLCanvasElement> | ReactMouseEvent<HTMLCanvasElement>,
  ): number {
    if (cropSourceSize === null) return 0;
    const bounds = event.currentTarget.getBoundingClientRect();
    return 12 * Math.max(
      cropSourceSize.width / Math.max(1, bounds.width),
      cropSourceSize.height / Math.max(1, bounds.height),
    );
  }

  function beginCropSelection(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (framing !== "crop" || cropSourceSize === null) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const start = sourcePointFromCropPointer(event);
    if (start === null) return;
    const originalCrop = {
      x: cropX,
      y: cropY,
      width: cropWidth,
      height: cropHeight,
    };
    const resizeHandle = cropSelectionActive && cropValid
      ? cropResizeHandleAtPoint(start, originalCrop, cropResizeTolerance(event))
      : null;
    const insideSelection = cropSelectionActive && cropValid &&
      pointIsInsideCrop(start, originalCrop);
    cropDragRef.current = {
      pointerId: event.pointerId,
      start,
      mode: resizeHandle ?? (insideSelection ? "move" : "create"),
      originalCrop,
    };
    setCropSelectionActive(true);
    setCropPointerMode(resizeHandle ?? (insideSelection ? "move" : "create"));
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
    event.preventDefault();
  }

  function moveCropSelection(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = cropDragRef.current;
    const current = sourcePointFromCropPointer(event);
    if (drag !== null) {
      setCropPointerMode(drag.mode);
    } else if (current !== null && cropSelectionActive && cropValid) {
      const currentCrop = { x: cropX, y: cropY, width: cropWidth, height: cropHeight };
      const resizeHandle = cropResizeHandleAtPoint(
        current,
        currentCrop,
        cropResizeTolerance(event),
      );
      setCropPointerMode(resizeHandle ?? (pointIsInsideCrop(current, currentCrop) ? "move" : "create"));
    }
    if (
      drag === null || drag.pointerId !== event.pointerId ||
      cropSourceSize === null
    ) return;
    if (current === null) return;
    setCropEntries(drag.mode === "move"
      ? moveCropFromDrag(
          drag.originalCrop,
          drag.start,
          current,
          cropSourceSize,
        )
      : drag.mode === "create"
        ? selectionFromDrag(
          drag.start,
          current,
          cropSourceSize,
          cropAspectRatio,
          destinationGeometry,
        )
        : resizeCropFromDrag(
          drag.originalCrop,
          current,
          cropSourceSize,
          cropAspectRatio,
          drag.mode,
          destinationGeometry,
        ));
    event.stopPropagation();
    event.preventDefault();
  }

  function endCropSelection(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = cropDragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    moveCropSelection(event);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    cropDragRef.current = null;
    setCropPointerMode("move");
    setState({ kind: "idle" });
    event.stopPropagation();
  }

  function moveCropWithKeyboard(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    if (
      framing !== "crop" || !cropSelectionActive || !cropValid ||
      cropSourceSize === null
    ) return;
    const deltas: Partial<Record<string, PixelPoint>> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const delta = deltas[event.key];
    if (delta === undefined) return;
    setCropEntries(moveCropFromDrag(
      { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
      { x: 0, y: 0 },
      delta,
      cropSourceSize,
    ));
    setState({ kind: "idle" });
    event.stopPropagation();
    event.preventDefault();
  }

  function clearCropSelection(event: ReactMouseEvent<HTMLCanvasElement>) {
    if (
      framing !== "crop" || !cropSelectionActive || !cropValid ||
      cropSourceSize === null
    ) return;
    const point = sourcePointFromCropPointer(event);
    if (
      point === null ||
      !pointIsInsideCrop(point, {
        x: cropX,
        y: cropY,
        width: cropWidth,
        height: cropHeight,
      })
    ) return;
    cropDragRef.current = null;
    setCropSelectionActive(false);
    setCropPointerMode("create");
    event.stopPropagation();
    event.preventDefault();
  }

  function togglePaletteColor(screenIndex: number, color: number) {
    setPaletteSelections((current) => current.map((selection) => {
      if (selection.screenIndex !== screenIndex) return selection;
      const enabledColorIds = selection.enabledColorIds.includes(color)
        ? selection.enabledColorIds.filter((candidate) => candidate !== color)
        : [...selection.enabledColorIds, color].sort((left, right) => left - right);
      return { ...selection, enabledColorIds };
    }));
    setState({ kind: "idle" });
  }

  function setPaletteBrightMode(screenIndex: number, brightMode: BrightMode) {
    setPaletteSelections((current) => current.map((selection) =>
      selection.screenIndex === screenIndex
        ? { ...selection, brightMode }
        : selection
    ));
    setState({ kind: "idle" });
  }

  function pmdSettingsForMode(
    profile: ConversionProfile,
    style: ConversionSettings,
    mode: Pmd85TargetModeId,
    preferredCalibrationId?: string,
    retainPaletteSelection = false,
  ): ConversionSettings {
    const descriptor = profile.palette.modes[mode];
    if (descriptor === undefined) {
      throw new RangeError(`Profile ${profile.name} does not support ${mode}.`);
    }
    const availableIds = descriptor.screens[0]?.colors.map((color) => color.id) ?? [];
    const availableIdSet = new Set(availableIds);
    const retainedIds = paletteSelections[0]?.enabledColorIds.filter((id) =>
      availableIdSet.has(id)
    ) ?? [];
    const calibrationIds = [
      descriptor.base_calibration_id,
      ...(descriptor.calibrations?.map((calibration) => calibration.id) ?? []),
    ];
    const calibrationId = preferredCalibrationId !== undefined &&
      calibrationIds.includes(preferredCalibrationId)
      ? preferredCalibrationId
      : descriptor.base_calibration_id ?? style.pmd85.paletteCalibrationId;
    const hardwareMode = pmdHardwareModeForTarget(mode);
    const spatial = mode.includes("vertical-spatial");
    const retargeted = retargetHardwareModeSettings(style, {
      profileId: profile.id,
      platformId: "pmd-85",
      modeId: mode,
      attributeOptimizerId: spatial
        ? "pmd85-vertical-spatial-detail-v2"
        : "pmd85-cell-v1",
      background: { r: 0, g: 0, b: 0 },
      attributeHeight: hardwareMode === "pmd85-colorace" ? 2 : 1,
      screenFlickerSuppression: false,
      paletteSelections: [{
        screenIndex: 0,
        enabledColorIds: retainPaletteSelection && retainedIds.length > 0
          ? retainedIds
          : availableIds,
      }],
      pmd85: {
        mode: hardwareMode,
        paletteCalibrationId: calibrationId,
        gapPolicy: pmd85GapPolicy,
      },
    });
    let settings: ConversionSettings;
    if (spatial) {
      settings = {
        ...retargeted,
        ditherEngineId: verticalSpatialDitherEngine(style.dithering),
        dithering: style.dithering,
        ditheringAmount: style.ditheringAmount,
        verticalSpatialMix: {
          schemaVersion: 1,
          algorithmId: "vertical-spatial-pmd-detail-v2",
          calibrationId: "srgb-ideal-v1",
          swapRows: verticalSpatialSwapRows,
        },
      };
    } else {
      const { verticalSpatialMix: _discarded, ...withoutSpatial } = retargeted;
      settings = withoutSpatial;
    }
    const engines = resolveEnginePreferencesForTarget(
      { platformId: "pmd-85", modeId: mode },
      { attributeOptimizerId: settings.attributeOptimizerId, ditherEngineId: settings.ditherEngineId },
      settings.dithering,
    );
    return {
      ...settings,
      ...engines,
      dithering: ditherMethodForEngine(engines.ditherEngineId),
    };
  }

  function applyHardwareModeSettings(next: ConversionSettings): void {
    // A hardware-mode change owns only hardware constraints. In particular it
    // must not route through applySettings(), which also applies preset-owned
    // framing, crop, resampling, and source image adjustments.
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
    setAttributeHeight(next.attributeHeight);
    setScreenFlickerSuppression(next.screenFlickerSuppression);
    setDitherEngineId(next.ditherEngineId);
    setDithering(next.dithering);
    if (next.modeId.includes("vertical-spatial")) {
      setAmountEntry(String(next.ditheringAmount));
      setOutputPreviewStage("screen-1");
      if (sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2") {
        setSourcePreviewContent("image");
      }
      setResultPreviewContent("screen-1");
    } else if (ditherEngineId.startsWith("vertical-spatial-")) {
      setAmountEntry(String(next.ditheringAmount));
    }
    setPaletteSelections(next.paletteSelections.map((selection) => ({
      ...selection,
      enabledColorIds: [...selection.enabledColorIds],
    })));
    setZxPaletteDefinition(next.zxPalette ?? DEFAULT_CONVERSION_SETTINGS.zxPalette);
    if (next.platformId === "pmd-85") {
      setPmd85PaletteCalibrationId(next.pmd85.paletteCalibrationId);
      setPmd85GapPolicy(next.pmd85.gapPolicy);
    }
    setState({ kind: "idle" });
  }

  async function switchTargetMode(mode: TargetModeId) {
    if (String(mode).startsWith("pmd85-")) {
      const pmdMode = mode as Pmd85TargetModeId;
      const currentProfile = profiles.find((candidate) => candidate.id === selectedProfileId) ?? BUILT_IN_PROFILE;
      const profile = currentProfile.platform_id === "pmd-85" && currentProfile.palette.modes[pmdMode] !== undefined
        ? currentProfile
        : profiles.find((candidate) =>
            candidate.platform_id === "pmd-85" &&
            candidate.palette.modes[pmdMode] !== undefined
          ) ?? BUILT_IN_PROFILE;
      const preset = profile.presets.find((candidate) => candidate.id === selectedPresetId) ?? profile.presets[0];
      if (preset === undefined || profile.platform_id !== "pmd-85") return;
      // Hardware interpretation is independent from the active conversion
      // recipe. Retarget the current settings so framing, resampling, crop,
      // rotation, image adjustments, and dithering survive mode changes.
      const nextSettings = pmdSettingsForMode(
        profile,
        conversionSettings,
        pmdMode,
      );
      setSelectedProfileId(profile.id);
      setSelectedPresetId(preset.id);
      applyHardwareModeSettings(nextSettings);
      setWorkspaceMode("palette");
      const raw = image?.format === "pmd85-bin" ? sourceArtifact?.bytes : undefined;
      if (raw !== undefined && workerRef.current !== null && !pmdMode.includes("vertical-spatial")) {
        try {
          const colors = profileModeScreens(
            profile,
            pmdMode,
            nextSettings.pmd85.paletteCalibrationId,
          )[0]?.colors.map((color) => hexToRgb(color.normal)) ?? [];
          const imported = await workerRef.current.decodePmd85(
            Uint8Array.from(raw).buffer,
            pmdHardwareModeForTarget(pmdMode),
            colors,
            nextSettings.pmd85.paletteCalibrationId,
          );
          const direct = directPmd85Result(imported, {
            ...nextSettings,
            pmd85: { ...nextSettings.pmd85, gapPolicy: "preserve-imported" },
          });
          pendingOpenedFinalRef.current = {
            result: direct,
            completedAtUtc: new Date().toISOString(),
          };
          setPmd85GapPolicy("preserve-imported");
          setImage(imported.image);
          setOriginalImage({ ...imported.image, rgba: imported.image.rgba.slice() });
          setLastFinal(direct);
          setState({ kind: "ready", result: direct });
          setDraftState({ kind: "idle" });
          setResultOrigin("direct-import");
          setImageStatus(
            `Raw PMD 85 source reinterpreted as ${pmdMode}; original 16 KiB remains unchanged.`,
          );
        } catch (error: unknown) {
          setState({
            kind: "error",
            message: error instanceof Error ? error.message : "PMD 85 reinterpretation failed.",
          });
        }
      }
      return;
    }
    const cacheKey = `${selectedProfileId}:${targetModeId}`;
    paletteModeCacheRef.current.set(
      cacheKey,
      paletteSelections.map((selection) => ({
        ...selection,
        enabledColorIds: [...selection.enabledColorIds],
      })),
    );
    const nextKey = `${selectedProfileId}:${mode}`;
    const cached = paletteModeCacheRef.current.get(nextKey);
    const isZxMode = mode.startsWith("zx48-");
    const profile = profiles.find((candidate) => candidate.id === selectedProfileId) ??
      BUILT_IN_PROFILE;
    const modePalette = profile.palette.modes[mode];
    const screenCount = modePalette?.screen_count ?? outputScreenCount(mode);
    const sourceSelection = paletteSelections[0] ??
      DEFAULT_CONVERSION_SETTINGS.paletteSelections[0]!;
    const initial = cached ?? Array.from({ length: screenCount }, (_, screenIndex) => {
      const availableColorIds =
        modePalette?.screens[screenIndex]?.colors.map((color) => color.id) ??
        modePalette?.screens[0]?.colors.map((color) => color.id) ??
        DEFAULT_CONVERSION_SETTINGS.paletteSelections[0]!.enabledColorIds;
      const availableColorSet = new Set(availableColorIds);
      const filtered = sourceSelection.enabledColorIds.filter((color) =>
        availableColorSet.has(color)
      );
      return {
        screenIndex,
        enabledColorIds: filtered.length > 0
          ? filtered
          : [...availableColorIds],
        ...(isZxMode
          ? { brightMode: sourceSelection.brightMode ?? "auto" }
          : {}),
      };
    });
    const nextPaletteSelections = initial.map((selection, screenIndex): PaletteSelection =>
      isZxMode
        ? {
            screenIndex,
            enabledColorIds: [...selection.enabledColorIds],
            brightMode: selection.brightMode ?? "auto",
          }
        : {
            screenIndex,
            enabledColorIds: [...selection.enabledColorIds],
          }
    );
    const spatial = mode.includes("vertical-spatial");
    const retargeted = retargetHardwareModeSettings(
      conversionSettings,
      {
        modeId: mode,
        attributeOptimizerId: spatial
          ? isZxMode
            ? "zx-vertical-spatial-uniform-v1"
            : "ql-vertical-spatial-uniform-v1"
          : conversionSettings.attributeOptimizerId.includes("vertical-spatial")
            ? "zx-adaptive-v1"
            : conversionSettings.attributeOptimizerId,
        attributeHeight: mode === "zx48-vertical-spatial-256x192"
          ? 1
          : conversionSettings.attributeHeight,
        paletteSelections: nextPaletteSelections,
      },
    );
    const engines = resolveEnginePreferencesForTarget(
      { platformId: retargeted.platformId, modeId: mode },
      { attributeOptimizerId: retargeted.attributeOptimizerId, ditherEngineId: retargeted.ditherEngineId },
      retargeted.dithering,
    );
    applyHardwareModeSettings({
      ...retargeted,
      ...engines,
      dithering: ditherMethodForEngine(engines.ditherEngineId),
    });
  }

  function selectHardwareModeFromMenu(mode: TargetModeId): void {
    void switchTargetMode(mode);
    if (
      isZx && mode === "zx48-mixed-256x192" &&
      (attributeOptimizerId === "zx-block-dbs-global-v1" ||
        attributeOptimizerId === "zx-structured-global-v1" ||
        attributeOptimizerId === "zx-structured-global-v2" ||
        attributeOptimizerId === "zx-structured-global-v3" ||
        attributeOptimizerId === "zx-structured-global-v4")
    ) {
      setAttributeOptimizerId("zx-guide-reference-halo-v2");
      setDitherEngineId(dithering === "ordered"
        ? "ordered-mixed-phase-stable-v8"
        : latestDitherEngineForMethod(dithering));
    }
  }

  async function changePmd85Calibration(calibrationId: string): Promise<void> {
    setPmd85PaletteCalibrationId(calibrationId);
    const raw = image?.format === "pmd85-bin" ? sourceArtifact?.bytes : undefined;
    if (!isPmd || raw === undefined || workerRef.current === null) {
      setState({ kind: "idle" });
      return;
    }
    try {
      const colors = profileModeScreens(
        selectedProfile,
        targetModeId,
        calibrationId,
      )[0]?.colors.map((color) => hexToRgb(color.normal)) ?? [];
      const imported = await workerRef.current.decodePmd85(
        Uint8Array.from(raw).buffer,
        targetModeId as Pmd85ModeId,
        colors,
        calibrationId,
      );
      const settings: ConversionSettings = {
        ...conversionSettings,
        pmd85: {
          ...conversionSettings.pmd85,
          paletteCalibrationId: calibrationId,
          gapPolicy: "preserve-imported",
        },
      };
      const direct = directPmd85Result(imported, settings);
      pendingOpenedFinalRef.current = {
        result: direct,
        completedAtUtc: new Date().toISOString(),
      };
      setImage(imported.image);
      setOriginalImage({ ...imported.image, rgba: imported.image.rgba.slice() });
      setLastFinal(direct);
      setState({ kind: "ready", result: direct });
      setDraftState({ kind: "idle" });
      setResultOrigin("direct-import");
    } catch (error: unknown) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "PMD 85 calibration failed.",
      });
    }
  }

  return {
    beginCropSelection,
    changeCropAspectRatio,
    changePmd85Calibration,
    clearCropSelection,
    confirmBitmapEditorAction,
    convertImage,
    endCropSelection,
    ensurePixelCrop,
    initializeTileEditor,
    moveCropSelection,
    moveCropWithKeyboard,
    pmdSettingsForMode,
    selectHardwareModeFromMenu,
    setPaletteBrightMode,
    togglePaletteColor,
    updateCropEntry,
  };
}
