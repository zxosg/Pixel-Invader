import { stampTilemapCells, type TilemapStamp } from "../tilemap-editor.js";
import { type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { atkinsonDiffusionKernel, ATTRIBUTE_OPTIMIZERS, checkerPhaseV43DiffusionKernel, checkerPhaseV5DiffusionKernel, type ConversionSettings, decorrelatedDiffusionKernel, DEFAULT_CONVERSION_SETTINGS, DITHER_ENGINES, type DitherEngineId, ditherMethodForEngine, isCompatibleEnginePair, ORDERED_MATRICES, type OrderedMatrixId, orderedPerturbationDiagnostics, phaseBalancedDiffusionKernel } from "@retro-converter/conversion-core";
import { formatKernelEntries, formatMatrixValues, ORDERED_MATRIX_IDS } from "../dithering-labels.js";
import { BUILT_IN_PROFILE, BUILT_IN_PROFILE_ID } from "../profiles.js";
import { type Pmd85ModeId } from "@retro-converter/pmd-85";
import { createSettingsDraft, validateSettingsDraft } from "../settings-registry.js";
import { type ApplicationSettings, saveApplicationSettings } from "../application-settings.js";
import { canonicalizeSettingsForSave } from "../settings-save.js";
import { canonicalJsonStringify, sanitizeArtifactBaseName } from "../artifacts.js";
import { ConversionWorkerClient, type WorkerCharsetResult } from "../worker/client.js";
import { normalizeStartupWorkspaceLayout } from "../app-types.js";
import { type WorkspaceConversionMode } from "../projects.js";
import { defaultOutputPreviewStage } from "../vertical-spatial-preview.js";
import { targetProducesMultipleFrames } from "../conversion-targets.js";
import { assertExperimentalBenchmarkCoverage, benchmarkExportCsv, type BenchmarkExportDocument, benchmarkExportJson, classifyBenchmarkRows, diffusionTextureMetrics, qlMixedOptimizersForBenchmark } from "../benchmark.js";
import { attributeBoundaryPreviewError, commonPreviewError, type ConversionBenchmarkRow, conversionOutputDigest, edgePreviewError, lowPass2PreviewError, previewPixelChangePercent } from "../preview-metrics.js";
import { structuredSettingsForOptimizer } from "../optimizer-settings.js";
import { type DerivedCharsetStrategy } from "@retro-converter/zx-charset";
import type { useRuntimeState } from "./use-runtime-state.js";
import type { useSettingsState } from "./use-settings-state.js";
import type { useWorkbenchState } from "./use-workbench-state.js";
import type { useWorkbenchLayout } from "./use-workbench-layout.js";
import type { useResultEditing } from "./use-result-editing.js";
import type { useConversionSettings } from "./use-conversion-settings.js";
import type { useConversionActions } from "./use-conversion-actions.js";
import type { usePreviewInspection } from "./use-preview-inspection.js";
import { tilemapCellAtCanvasPoint } from "./preview-inspection-helpers.js";
import { downloadBytes } from "./engine-settings-benchmarks-helpers.js";

export function useEngineSettingsBenchmarks(
  { settingsLevel, setSettingsLevelState, amount, amountEntry, applySettings, applyWorkspaceLayout, attributeHeight, attributeOptimizerId, benchmarkContextKeyRef, benchmarkRows, benchmarkRunRef, benchmarkRunning, benchmarkVisualFavorites, benchmarkWorkerRef, charsetAllowPolarity, charsetAllowTransforms, charsetBudget, charsetDistance, charsetEncoding, charsetSource, charsetState, charsetVisualWeighting, charsetWorkerRef, commitTileEditorResult, composer, conversionSettings, cropHeight, cropWidth, cropX, cropY, currentBenchmarkContextKey, customDiffusionKernels, customOrderedMatrices, developmentMode, dithering, draftWorkerRef, errorDiffusionLineSuppression, errorDiffusionRandomization, existingActiveCharacterCount, existingCharset, existingCharsetChoiceValid, existingCharsetLength, existingCharsetSelection, existingCharsetStart, exportBorderColor, exportBorderEnabled, exportBorderWidth, exportZoomFactor, finalJobRef, finalRunningRef, framing, image, includeExperimentalEngines, initializeTileEditor, inspectActivePixel, inspection, isPmd, lastFinal, lastZxSettingsRef, mouseWheelZoom, orderedMatrix, paletteSelections, pendingModeHighRef, pmd85GapPolicy, pmd85PaletteCalibrationId, pmd85WorkerOptions, pmdSettingsForMode, profiles, projectName, pushTileEditorHistory, qlMixedOptimizerId, selectedPlatformId, selectedPresetId, selectedProfile, selectedProfileId, setAmountEntry, setAttributeHeight, setAttributeOptimizerId, setBackground, setBenchmarkCompareDigests, setBenchmarkOpen, setBenchmarkRows, setBenchmarkRunning, setBenchmarkVisualFavorites, setCharsetState, setCharsetStrategy, setCustomKernelEntryText, setCustomMatrixHeightEntry, setCustomMatrixValuesEntry, setCustomMatrixWidthEntry, setCustomPatternError, setDevelopmentMode, setDitherEngineId, setDithering, setDraftState, setExportBorderColor, setExportBorderEnabled, setExportBorderWidth, setExportError, setExportZoomFactor, setInspection, setMouseWheelZoom, setOrderedMatrix, setOutputPreviewStage, setQlMixedOptimizerId, setResultPreviewContent, setSelectedPresetId, setSelectedProfileId, setSettingsBaseline, setSettingsCategory, setSettingsDraft, setSettingsOpen, setSettingsPreset, setSettingsSearch, setSourcePreviewContent, setStartupWorkspaceLayout, setState, setStructuredSettings, setSynchronizePan, setSynchronizeZoom, setTargetModeId, setTilemapBenchmarkOpen, setTilemapBenchmarkRows, setTilemapBenchmarkRunning, setTilemapStale, setUiTypography, setWorkbenchSectionsOpen, setWorkbenchSettingsMinimized, setWorkbenchWindowLayouts, setWorkspaceMode, settingsDraft, settingsValid, sourceArtifact, startupWorkspaceLayout, synchronizePan, synchronizeZoom, targetModeId, tileStampDraft, tilemapBenchmarkRows, tilemapBenchmarkRunRef, tilemapBenchmarkRunning, tilemapPutActive, tilemapPutPointerRef, uiTypography, unifiedTileEditorContext, verticalSpatialSwapRows, workerRef, workspaceMode }: Pick<ReturnType<typeof useRuntimeState>, "benchmarkContextKeyRef" | "benchmarkRunRef" | "benchmarkWorkerRef" | "charsetState" | "charsetWorkerRef" | "draftWorkerRef" | "finalJobRef" | "finalRunningRef" | "lastFinal" | "lastZxSettingsRef" | "pendingModeHighRef" | "setCharsetState" | "setDraftState" | "setState" | "tileStampDraft" | "tilemapPutActive" | "tilemapPutPointerRef" | "unifiedTileEditorContext" | "workerRef"> &
    Pick<ReturnType<typeof useSettingsState>, "settingsLevel" | "setSettingsLevelState" | "amountEntry" | "attributeHeight" | "attributeOptimizerId" | "charsetAllowPolarity" | "charsetAllowTransforms" | "charsetBudget" | "charsetDistance" | "charsetEncoding" | "charsetSource" | "charsetVisualWeighting" | "composer" | "customDiffusionKernels" | "customOrderedMatrices" | "dithering" | "errorDiffusionLineSuppression" | "errorDiffusionRandomization" | "existingCharset" | "existingCharsetLength" | "existingCharsetSelection" | "existingCharsetStart" | "exportBorderColor" | "exportBorderEnabled" | "exportBorderWidth" | "exportZoomFactor" | "framing" | "image" | "orderedMatrix" | "paletteSelections" | "profiles" | "projectName" | "qlMixedOptimizerId" | "selectedPresetId" | "selectedProfileId" | "setAmountEntry" | "setAttributeHeight" | "setAttributeOptimizerId" | "setBackground" | "setCharsetStrategy" | "setCustomKernelEntryText" | "setCustomMatrixHeightEntry" | "setCustomMatrixValuesEntry" | "setCustomMatrixWidthEntry" | "setCustomPatternError" | "setDitherEngineId" | "setDithering" | "setExportBorderColor" | "setExportBorderEnabled" | "setExportBorderWidth" | "setExportError" | "setExportZoomFactor" | "setOrderedMatrix" | "setQlMixedOptimizerId" | "setSelectedPresetId" | "setSelectedProfileId" | "setStructuredSettings" | "setTargetModeId" | "setTilemapStale" | "setWorkspaceMode" | "sourceArtifact" | "targetModeId" | "verticalSpatialSwapRows" | "workspaceMode"> &
    Pick<ReturnType<typeof useWorkbenchState>, "benchmarkRows" | "benchmarkRunning" | "benchmarkVisualFavorites" | "developmentMode" | "includeExperimentalEngines" | "inspection" | "isPmd" | "mouseWheelZoom" | "pmd85GapPolicy" | "pmd85PaletteCalibrationId" | "selectedPlatformId" | "selectedProfile" | "setBenchmarkCompareDigests" | "setBenchmarkOpen" | "setBenchmarkRows" | "setBenchmarkRunning" | "setBenchmarkVisualFavorites" | "setDevelopmentMode" | "setInspection" | "setMouseWheelZoom" | "setOutputPreviewStage" | "setResultPreviewContent" | "setSettingsBaseline" | "setSettingsCategory" | "setSettingsDraft" | "setSettingsOpen" | "setSettingsPreset" | "setSettingsSearch" | "setSourcePreviewContent" | "setStartupWorkspaceLayout" | "setSynchronizePan" | "setSynchronizeZoom" | "setTilemapBenchmarkOpen" | "setTilemapBenchmarkRows" | "setTilemapBenchmarkRunning" | "setUiTypography" | "setWorkbenchSectionsOpen" | "setWorkbenchSettingsMinimized" | "setWorkbenchWindowLayouts" | "settingsDraft" | "startupWorkspaceLayout" | "synchronizePan" | "synchronizeZoom" | "tilemapBenchmarkRows" | "tilemapBenchmarkRunRef" | "tilemapBenchmarkRunning" | "uiTypography"> &
    Pick<ReturnType<typeof useWorkbenchLayout>, "applyWorkspaceLayout"> &
    Pick<ReturnType<typeof useResultEditing>, "applySettings"> &
    Pick<ReturnType<typeof useConversionSettings>, "amount" | "conversionSettings" | "cropHeight" | "cropWidth" | "cropX" | "cropY" | "currentBenchmarkContextKey" | "existingActiveCharacterCount" | "existingCharsetChoiceValid" | "pmd85WorkerOptions" | "settingsValid"> &
    Pick<ReturnType<typeof useConversionActions>, "initializeTileEditor" | "pmdSettingsForMode"> &
    Pick<ReturnType<typeof usePreviewInspection>, "commitTileEditorResult" | "inspectActivePixel" | "pushTileEditorHistory">,
) {
  function stampCellsForActiveGesture(cellIndices: readonly number[]): void {
    const gesture = tilemapPutPointerRef.current;
    if (gesture === null || charsetState.kind !== "ready") return;
    const newCells = cellIndices.filter((index) => {
      if (gesture.visited.has(index)) return false;
      gesture.visited.add(index);
      return true;
    });
    if (newCells.length === 0) return;
    const result = charsetState.result;
    const stamped = stampTilemapCells(result.assignments, result.attributes, newCells, gesture.stamp);
    if (!stamped.changed) return;
    if (!gesture.historyCaptured) {
      pushTileEditorHistory(result);
      gesture.historyCaptured = true;
    }
    commitTileEditorResult(
      result,
      result.charset,
      stamped.assignments,
      result.encoding,
      stamped.attributes,
    );
  }

  function handleTilemapPutPointerDown(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (!tilemapPutActive || workspaceMode !== "tilemap" || unifiedTileEditorContext !== "stamp" || charsetState.kind !== "ready") return;
    if (event.button !== 0 || tileStampDraft.characterIndex === null) return;
    const [cellX, cellY] = tilemapCellAtCanvasPoint(event);
    const stamp: TilemapStamp = {
      characterIndex: tileStampDraft.characterIndex,
      transform: tileStampDraft.transform,
      inverted: tileStampDraft.inverted,
      attribute: tileStampDraft.attribute,
    };
    tilemapPutPointerRef.current = {
      pointerId: event.pointerId,
      stamp,
      visited: new Set(),
      lastX: cellX,
      lastY: cellY,
      historyCaptured: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    stampCellsForActiveGesture([cellY * 32 + cellX]);
    event.preventDefault();
    event.stopPropagation();
  }

  function handleTilemapPutPointerMove(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const gesture = tilemapPutPointerRef.current;
    if (!tilemapPutActive || gesture === null || gesture.pointerId !== event.pointerId) return;
    const [cellX, cellY] = tilemapCellAtCanvasPoint(event);
    let x = gesture.lastX;
    let y = gesture.lastY;
    const dx = Math.abs(cellX - x);
    const sx = x < cellX ? 1 : -1;
    const dy = -Math.abs(cellY - y);
    const sy = y < cellY ? 1 : -1;
    let error = dx + dy;
    const cells: number[] = [];
    while (true) {
      cells.push(y * 32 + x);
      if (x === cellX && y === cellY) break;
      const doubled = 2 * error;
      if (doubled >= dy) { error += dy; x += sx; }
      if (doubled <= dx) { error += dx; y += sy; }
    }
    gesture.lastX = cellX;
    gesture.lastY = cellY;
    stampCellsForActiveGesture(cells);
    event.preventDefault();
    event.stopPropagation();
  }

  function handleTilemapPutPointerEnd(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const gesture = tilemapPutPointerRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    tilemapPutPointerRef.current = null;
    event.preventDefault();
    event.stopPropagation();
  }

  function handleInspectorKey(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    const delta = event.shiftKey ? 8 : 1;
    const currentX = inspection?.pixelX ?? 0;
    const currentY = inspection?.pixelY ?? 0;
    const next = {
      ArrowLeft: [currentX - delta, currentY],
      ArrowRight: [currentX + delta, currentY],
      ArrowUp: [currentX, currentY - delta],
      ArrowDown: [currentX, currentY + delta],
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    inspectActivePixel(next[0] ?? currentX, next[1] ?? currentY);
  }

  function syncMatrixEditorFromSelection(
    patternId: ConversionSettings["composer"]["patternId"] | OrderedMatrixId,
  ) {
    if (patternId in ORDERED_MATRICES) {
      const matrix = ORDERED_MATRICES[patternId as OrderedMatrixId];
      setCustomMatrixWidthEntry(String(matrix.width));
      setCustomMatrixHeightEntry(String(matrix.height));
      setCustomMatrixValuesEntry(formatMatrixValues(matrix.values));
      setCustomPatternError(null);
      return;
    }
    const customMatrix = customOrderedMatrices.find((candidate) => candidate.id === patternId);
    if (customMatrix === undefined) return;
    setCustomMatrixWidthEntry(String(customMatrix.width));
    setCustomMatrixHeightEntry(String(customMatrix.height));
    setCustomMatrixValuesEntry(formatMatrixValues(customMatrix.values));
    setCustomPatternError(null);
  }

  function syncKernelEditorFromSelection(
    propagationId: ConversionSettings["composer"]["propagationId"],
  ) {
    if (propagationId === "none") {
      setCustomKernelEntryText("");
      setCustomPatternError(null);
      return;
    }
    if (propagationId.startsWith("custom-diffusion-")) {
      const customKernel = customDiffusionKernels.find((candidate) => candidate.id === propagationId);
      if (customKernel === undefined) return;
      setCustomKernelEntryText(formatKernelEntries(customKernel.entries));
      setCustomPatternError(null);
      return;
    }
    const entries = propagationId === "error-diffusion-unrestricted-v2"
      ? [
          [1, 0, 7],
          [-1, 1, 3],
          [0, 1, 5],
          [1, 1, 1],
        ] as const
      : propagationId === "error-diffusion-decorrelated-v3"
        ? decorrelatedDiffusionKernel(1)
        : propagationId === "error-diffusion-atkinson-v1"
          ? atkinsonDiffusionKernel(1)
          : propagationId === "error-diffusion-checker-phase-v4-3"
            ? checkerPhaseV43DiffusionKernel(1, 0, 0, errorDiffusionLineSuppression, 0)
            : propagationId === "error-diffusion-checker-phase-v5"
              ? checkerPhaseV5DiffusionKernel(1, 0, 0, errorDiffusionLineSuppression, 0, 2)
              : phaseBalancedDiffusionKernel(1, 0, 0, errorDiffusionLineSuppression, 0);
    setCustomKernelEntryText(formatKernelEntries(entries));
    setCustomPatternError(null);
  }

  function selectDitherEngine(id: DitherEngineId) {
    setDitherEngineId(id);
    setDithering(ditherMethodForEngine(id));
    const selectedEngine = DITHER_ENGINES.find((engine) => engine.id === id);
    const supportedMatrices = selectedEngine?.orderedMatrixIds ?? ORDERED_MATRIX_IDS.slice(0, 4);
    if (!supportedMatrices.includes(orderedMatrix)) {
      const nextMatrix = supportedMatrices[0] ?? "checkerboard-2x1";
      setOrderedMatrix(nextMatrix);
      syncMatrixEditorFromSelection(nextMatrix);
    }
    if (id === "pattern-legal-mask-dbs-v1") {
      setAttributeOptimizerId("zx-block-dbs-global-v1");
    } else if (
      id === "ordered-cell-pattern-v1" ||
      id === "ordered-cell-pattern-v2" ||
      id === "ordered-cell-pattern-v3" ||
      id === "ordered-cell-pattern-v4"
    ) {
      const isVersion4 = id === "ordered-cell-pattern-v4";
      const isVersion3 = id === "ordered-cell-pattern-v3";
      const isVersion2 = id === "ordered-cell-pattern-v2";
      setAttributeOptimizerId(
        isVersion4
          ? "zx-structured-global-v4"
          : isVersion3
          ? "zx-structured-global-v3"
          : isVersion2
            ? "zx-structured-global-v2"
            : "zx-structured-global-v1",
      );
      setStructuredSettings((current) => ({
        ...current,
        ditherResponseCurveId: isVersion2 || isVersion3 || isVersion4
          ? "power-035-percent-v2"
          : "power-065-percent-v1",
        colorAnchorModelId: isVersion3 || isVersion4
          ? "srgb-squared-v1"
          : "none-v1",
        structuralModelId: isVersion4
          ? "palette-topology-v1"
          : "none-v1",
        objectiveWeights: isVersion4
          ? {
              ...current.objectiveWeights,
              pixel: 192,
              rgbAnchor: 2048,
              patternReference: 1536,
              paletteDistribution: 1024,
              luminanceRank: 512,
              edgePolarity: 768,
              mean: 768,
              sharedEndpoint: 0,
            }
          : isVersion2 || isVersion3
          ? {
              ...current.objectiveWeights,
              pixel: 192,
              rgbAnchor: isVersion3 ? 6144 : 0,
              patternReference: 0,
              paletteDistribution: 0,
              luminanceRank: 0,
              edgePolarity: 0,
              mean: 2048,
            }
          : {
              ...current.objectiveWeights,
              pixel: 1024,
              rgbAnchor: 0,
              patternReference: 0,
              paletteDistribution: 0,
              luminanceRank: 0,
              edgePolarity: 0,
              mean: 256,
            },
        candidateParameters: {
          ...current.candidateParameters,
          localAdmissibilityPermille: isVersion4 ? 100 : 1000,
          boundaryCapPermille: isVersion4 ? 100 : 1000,
        },
      }));
    } else if (
      attributeOptimizerId === "zx-structured-global-v1" ||
      attributeOptimizerId === "zx-structured-global-v2" ||
      attributeOptimizerId === "zx-structured-global-v3" ||
      attributeOptimizerId === "zx-structured-global-v4" ||
      attributeOptimizerId === "zx-block-dbs-global-v1"
    ) {
      setAttributeOptimizerId("zx-guide-reference-halo-v2");
    }
    setState({ kind: "idle" });
  }

  function selectProfile(profileId: string) {
    const profile = profiles.find((candidate) => candidate.id === profileId) ?? BUILT_IN_PROFILE;
    const preset = profile.presets[0];
    setSelectedProfileId(profile.id);
    if (preset !== undefined) {
      setSelectedPresetId(preset.id);
      applySettings(preset.settings);
    }
  }

  function selectPreset(presetId: string) {
    const profile = profiles.find((candidate) => candidate.id === selectedProfileId) ?? BUILT_IN_PROFILE;
    const preset = profile.presets.find((candidate) => candidate.id === presetId);
    if (preset === undefined) return;
    setSelectedPresetId(preset.id);
    applySettings(
      profile.platform_id === "pmd-85" && String(targetModeId).startsWith("pmd85-")
        ? pmdSettingsForMode(
            profile,
            preset.settings,
            targetModeId as Pmd85ModeId,
            pmd85PaletteCalibrationId,
            true,
          )
        : preset.settings,
    );
  }

  function openApplicationSettings(): void {
    const draft = createSettingsDraft({
      ...conversionSettings,
      orderedMatrix,
      customOrderedMatrices,
      customDiffusionKernels,
      composer,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      verticalSpatialSwapRows,
      pmd85PaletteCalibrationId,
      pmd85GapPolicy,
      profileId: selectedProfileId,
      presetId: selectedPresetId,
      modeId: targetModeId,
      framing,
      dithering,
      ditheringAmount: Number(amountEntry) || 0,
      workspaceLayout: startupWorkspaceLayout,
      mouseWheelZoom,
      synchronizePan,
      synchronizeZoom,
      developmentMode,
      exportBorderEnabled,
      exportBorderWidth,
      exportBorderColor,
      exportZoomFactor,
      settingsLevel,
      ...uiTypography,
    });
    setSettingsDraft(draft as ApplicationSettings & Record<string, unknown>);
    setSettingsBaseline(draft);
    setSettingsSearch("");
    setSettingsCategory("all");
    setSettingsPreset("all");
    setSettingsOpen(true);
  }

  function saveApplicationSettingsDraft(): void {
    if (settingsDraft === null) return;
    const validation = validateSettingsDraft(settingsDraft);
    if (Object.keys(validation.errors).length > 0) return;
    const canonical = canonicalizeSettingsForSave({
      draft: validation.values,
      current: conversionSettings,
      profiles,
    });
    setExportBorderEnabled(canonical.application.exportBorderEnabled);
    setExportBorderWidth(canonical.application.exportBorderWidth);
    setExportBorderColor(canonical.application.exportBorderColor);
    setExportZoomFactor(canonical.application.exportZoomFactor);
    const conversionChanged = canonicalJsonStringify(canonical.conversion) !== canonicalJsonStringify(conversionSettings);
    if (conversionChanged) {
      finalJobRef.current += 1;
      finalRunningRef.current = false;
      workerRef.current?.dispose();
      workerRef.current = new ConversionWorkerClient();
      draftWorkerRef.current?.dispose();
      draftWorkerRef.current = null;
      setDraftState({ kind: "idle" });
    }
    setSelectedProfileId(canonical.profile.id);
    setSelectedPresetId(canonical.application.presetId);
    if (conversionChanged) {
      applySettings(canonical.conversion);
      setBackground(canonical.conversion.background);
      setDitherEngineId(canonical.conversion.ditherEngineId);
      setDithering(canonical.conversion.dithering);
      setAmountEntry(String(canonical.conversion.ditheringAmount));
    }
    setSettingsLevelState(canonical.application.settingsLevel);
    setMouseWheelZoom(canonical.application.mouseWheelZoom);
    setSynchronizePan(canonical.application.synchronizePan);
    setSynchronizeZoom(canonical.application.synchronizeZoom);
    setDevelopmentMode(canonical.application.developmentMode);
    setUiTypography({
      uiFontFamily: canonical.application.uiFontFamily,
      windowTitleFontSize: canonical.application.windowTitleFontSize,
      windowTitleFontWeight: canonical.application.windowTitleFontWeight,
      uiLabelFontSize: canonical.application.uiLabelFontSize,
      uiLabelFontWeight: canonical.application.uiLabelFontWeight,
      uiBodyFontSize: canonical.application.uiBodyFontSize,
      uiBodyFontWeight: canonical.application.uiBodyFontWeight,
    });
    const nextStartupLayout = normalizeStartupWorkspaceLayout(canonical.application.workspaceLayout);
    setStartupWorkspaceLayout(nextStartupLayout);
    applyWorkspaceLayout(nextStartupLayout);
    setSettingsOpen(false);
    setSettingsDraft(null);
    setSettingsBaseline(null);
    saveApplicationSettings(localStorage, canonical.application);
    return;
  }

  function switchWorkspaceConversionMode(next: WorkspaceConversionMode) {
    if (next === workspaceMode) return;
    finalJobRef.current += 1;
    finalRunningRef.current = false;
    workerRef.current?.dispose();
    workerRef.current = new ConversionWorkerClient();
    charsetWorkerRef.current?.dispose();
    charsetWorkerRef.current = null;
    pendingModeHighRef.current = next;
    setWorkspaceMode(next);
    setOutputPreviewStage(next === "palette"
      ? defaultOutputPreviewStage(
          targetModeId,
          targetProducesMultipleFrames(selectedPlatformId, targetModeId),
        )
      : "merged");
    setInspection(null);
    if (next === "tilemap") {
      // Entering Tilemap mode directly from the conversion-mode selector must
      // reveal the existing Tilemap settings window. The workspace preset
      // already does this, but a direct mode switch otherwise leaves the
      // persisted minimized/closed state showing an empty shell.
      setWorkbenchWindowLayouts((current) => ({
        ...current,
        tilemap: {
          ...current.tilemap,
          minimized: false,
          open: true,
        },
      }));
      setWorkbenchSectionsOpen((current) => ({
        ...current,
        tilemap: true,
      }));
      setWorkbenchSettingsMinimized(false);
      if (selectedPlatformId !== "zx-spectrum") {
        const cached = lastZxSettingsRef.current;
        const cachedProfile = profiles.find((profile) =>
          profile.id === cached.profileId &&
          profile.platform_id === "zx-spectrum");
        setSelectedProfileId(cachedProfile?.id ?? BUILT_IN_PROFILE_ID);
        setSelectedPresetId(
          cachedProfile?.presets[0]?.id ??
          BUILT_IN_PROFILE.presets[0]?.id ??
          "default",
        );
        applySettings({
          ...cached,
          profileId: cachedProfile?.id ?? BUILT_IN_PROFILE_ID,
          platformId: "zx-spectrum",
          modeId: "zx48-standard-256x192",
          attributeHeight: 8,
          paletteSelections: [cached.paletteSelections[0] ??
            DEFAULT_CONVERSION_SETTINGS.paletteSelections[0]!],
        });
      }
      setTargetModeId("zx48-standard-256x192");
      setAttributeHeight(8);
      setTilemapStale(charsetState.kind === "ready");
      setSourcePreviewContent("unified-editor");
      setResultPreviewContent("image");
    }
  }

  async function runEngineBenchmark() {
    if (!developmentMode || image === null || !settingsValid || benchmarkRunning) return;
    const benchmarkContextKeyAtStart = currentBenchmarkContextKey;
    const benchmarkRun = benchmarkRunRef.current + 1;
    benchmarkRunRef.current = benchmarkRun;
    setBenchmarkOpen(true);
    setBenchmarkRunning(true);
    setExportError(null);
    benchmarkWorkerRef.current?.dispose();
    const benchmarkWorker = new ConversionWorkerClient();
    benchmarkWorkerRef.current = benchmarkWorker;
    try {
      const optimizers = selectedPlatformId === "zx-spectrum"
        ? ATTRIBUTE_OPTIMIZERS
          .filter((engine) =>
            (includeExperimentalEngines || engine.lifecycle !== "experimental") &&
            (
              engine.targetModeIds === undefined ||
              engine.targetModeIds.includes(targetModeId)
            ) &&
            (
              targetModeId !== "zx48-mixed-256x192" ||
              !("family" in engine)
            )
          )
          .map(({ id }) => id)
        : [attributeOptimizerId];
      const qlMixedOptimizers = qlMixedOptimizersForBenchmark(
        selectedPlatformId,
        targetModeId,
        qlMixedOptimizerId,
      );
      const ditherEngines = DITHER_ENGINES.filter((candidate) =>
        candidate.platforms.includes(selectedPlatformId as never) &&
        (
          candidate.targetModeIds === undefined ||
          candidate.targetModeIds.includes(targetModeId)
        ) &&
        (includeExperimentalEngines || candidate.lifecycle !== "experimental" ||
          (isPmd && candidate.id === "ordered-void-cluster-v1"))
      );
      if (includeExperimentalEngines) {
        assertExperimentalBenchmarkCoverage(
          selectedPlatformId,
          targetModeId,
          optimizers,
          ditherEngines.map((engine) => engine.id),
        );
      }
      const rows: Omit<ConversionBenchmarkRow, "classification">[] = [];
      for (const optimizerId of optimizers) {
        for (const mixedOptimizerId of qlMixedOptimizers) {
        for (const engine of ditherEngines) {
          if (
            selectedPlatformId === "zx-spectrum" &&
            !isCompatibleEnginePair(optimizerId, engine.id)
          ) continue;
          const matrixEffective =
            engine.method === "ordered" && engine.family === undefined &&
            engine.id !== "artistic-ordered-hybrid-v1" &&
            engine.id !== "artistic-ordered-tone-safe-v2";
          const matrices = matrixEffective
            ? engine.orderedMatrixIds ?? ORDERED_MATRIX_IDS.slice(0, 4)
            : [orderedMatrix];
          for (const matrix of matrices) {
            const started = performance.now();
            const benchmarkAmount = engine.method === "none" ? 0 : amount;
            const benchmarkStructured = structuredSettingsForOptimizer(
              optimizerId,
              conversionSettings.structured,
            );
            const result = await benchmarkWorker.convertImage(image, {
              ...conversionSettings,
              attributeOptimizerId: optimizerId,
              qlMixedOptimizerId: mixedOptimizerId,
              ditherEngineId: engine.id,
              dithering: engine.method,
              ditheringAmount: benchmarkAmount,
              orderedMatrix: matrix,
              structured: {
                ...benchmarkStructured,
                ditherAmountPermille: benchmarkAmount * 10,
              },
            }, "high", pmd85WorkerOptions);
            if (
              benchmarkRunRef.current !== benchmarkRun ||
              benchmarkContextKeyRef.current !== benchmarkContextKeyAtStart
            ) return;
            const digest = await conversionOutputDigest(result);
            rows.push({
              optimizerId,
              qlMixedOptimizerId: mixedOptimizerId,
              ditherEngineId: engine.id,
              matrix,
              matrixEffective,
              score: commonPreviewError(
                result.sourcePreviewRgba,
                result.mergedPreviewRgba,
              ),
              lowPassScore: lowPass2PreviewError(
                result.sourcePreviewRgba,
                result.mergedPreviewRgba,
              ),
              edgeScore: edgePreviewError(
                result.sourcePreviewRgba,
                result.mergedPreviewRgba,
              ),
              textureMetrics: diffusionTextureMetrics(
                result.sourcePreviewRgba,
                result.mergedPreviewRgba,
              ),
              platformScore: result.score,
              attributeBoundaryScore: selectedPlatformId === "zx-spectrum"
                ? attributeBoundaryPreviewError(
                    result.sourcePreviewRgba,
                    result.mergedPreviewRgba,
                    attributeHeight,
                  )
                : null,
              orderedPerturbationRms:
                engine.id === "ordered-coverage-normalized-v7"
                  ? orderedPerturbationDiagnostics(
                      ORDERED_MATRICES[matrix], benchmarkAmount,
                    ).rms
                  : null,
              elapsedMs: performance.now() - started,
              digest,
              aliases: [],
              result,
            });
          }
        }
        }
      }
      const completedRows = rows.map((row) => {
        if (row.ditherEngineId !== "ordered-coverage-normalized-v7") return row;
        const baseline = rows.find((candidate) =>
          ditherMethodForEngine(candidate.ditherEngineId) === "none" &&
          candidate.optimizerId === row.optimizerId &&
          candidate.qlMixedOptimizerId === row.qlMixedOptimizerId
        );
        return baseline === undefined ? row : {
          ...row,
          outputPixelChangePercent: previewPixelChangePercent(
            baseline.result.mergedPreviewRgba,
            row.result.mergedPreviewRgba,
          ),
        };
      });
      completedRows.sort((left, right) =>
        left.score - right.score ||
        left.lowPassScore - right.lowPassScore ||
        left.edgeScore - right.edgeScore ||
        left.elapsedMs - right.elapsedMs
      );
      const groupedRows: Omit<ConversionBenchmarkRow, "classification">[] = [];
      const rowByDigest = new Map<string, number>();
      for (const row of completedRows) {
        const existingIndex = rowByDigest.get(row.digest);
        if (existingIndex === undefined) {
          rowByDigest.set(row.digest, groupedRows.length);
          groupedRows.push(row);
          continue;
        }
        const existing = groupedRows[existingIndex]!;
        groupedRows[existingIndex] = {
          ...existing,
          elapsedMs: Math.min(existing.elapsedMs, row.elapsedMs),
          aliases: [
            ...existing.aliases,
            {
              optimizerId: row.optimizerId,
              qlMixedOptimizerId: row.qlMixedOptimizerId,
              ditherEngineId: row.ditherEngineId,
              matrix: row.matrix,
            },
          ],
        };
      }
      const classifications = classifyBenchmarkRows(groupedRows);
      const classifiedRows: ConversionBenchmarkRow[] = groupedRows.map(
        (row, index) => ({ ...row, classification: classifications[index]! }),
      );
      if (
        benchmarkRunRef.current === benchmarkRun &&
        benchmarkContextKeyRef.current === benchmarkContextKeyAtStart
      ) {
        setBenchmarkRows(classifiedRows);
        setBenchmarkCompareDigests([]);
      }
    } catch (error: unknown) {
      if (benchmarkRunRef.current === benchmarkRun) {
        setExportError(`Benchmark failed: ${error instanceof Error ? error.message : "Unknown error."}`);
      }
    } finally {
      benchmarkWorker.dispose();
      if (benchmarkWorkerRef.current === benchmarkWorker) {
        benchmarkWorkerRef.current = null;
      }
      if (benchmarkRunRef.current === benchmarkRun) {
        setBenchmarkRunning(false);
      }
    }
  }

  function benchmarkDocument(): BenchmarkExportDocument {
    return {
      schemaVersion: "1.0.0",
      createdAt: new Date().toISOString(),
      context: {
        platformId: selectedPlatformId,
        modeId: targetModeId,
        profileId: selectedProfileId,
        profileContentSha256: selectedProfile.content_sha256,
        paletteCalibrationId: isPmd ? pmd85PaletteCalibrationId : null,
        sourceSha256: sourceArtifact?.sha256 ?? null,
        sourceRevision: currentBenchmarkContextKey,
        ditheringAmount: dithering === "none" ? 0 : amount,
        errorDiffusionRandomization,
        errorDiffusionLineSuppression,
        attributeHeight: selectedPlatformId === "zx-spectrum"
          ? attributeHeight
          : null,
        paletteSelections,
        includeExperimentalEngines,
      },
      rows: benchmarkRows.map((row, index) => ({
        rank: index + 1,
        attributeOptimizerId: selectedPlatformId === "zx-spectrum"
          ? row.optimizerId
          : undefined,
        qlMixedOptimizerId: targetModeId === "mode8-mode4-mixed-512x256"
          ? row.qlMixedOptimizerId
          : undefined,
        ditherEngineId: row.ditherEngineId,
        matrix: row.matrixEffective ? row.matrix : undefined,
        score: row.score,
        lowPassScore: row.lowPassScore,
        edgeScore: row.edgeScore,
        platformScore: row.platformScore,
        attributeBoundaryScore: row.attributeBoundaryScore ?? undefined,
        orderedPerturbationRms: row.orderedPerturbationRms ?? undefined,
        outputPixelChangePercent: row.outputPixelChangePercent,
        textureMetrics: row.textureMetrics,
        elapsedMs: row.elapsedMs,
        digest: row.digest,
        aliases: row.aliases.map((alias) =>
          `${alias.optimizerId}:${alias.qlMixedOptimizerId}:${alias.ditherEngineId}:${alias.matrix}`
        ),
        guidance: row.classification.guidance,
        dominated: row.classification.dominated,
        visualFavorite: benchmarkVisualFavorites.has(row.digest),
      })),
    };
  }

  function projectFileBaseName(): string {
    return sourceArtifact === null
      ? sanitizeArtifactBaseName(projectName || "retro-converter")
      : sanitizeArtifactBaseName(projectName || sourceArtifact.baseName);
  }

  function downloadBenchmark(format: "json" | "csv") {
    const document = benchmarkDocument();
    downloadBytes(
      format === "json" ? benchmarkExportJson(document) : benchmarkExportCsv(document),
      format === "json" ? "application/json" : "text/csv",
      `${projectFileBaseName()}-engine-benchmark.${format}`,
    );
  }

  function toggleBenchmarkComparison(digest: string) {
    setBenchmarkCompareDigests((current) =>
      current.includes(digest)
        ? current.filter((candidate) => candidate !== digest)
        : [...current.slice(-1), digest]
    );
  }

  function toggleBenchmarkVisualFavorite(digest: string) {
    setBenchmarkVisualFavorites((current) => {
      const next = new Set(current);
      if (next.has(digest)) next.delete(digest);
      else next.add(digest);
      return next;
    });
  }

  function selectBenchmarkRow(row: (typeof benchmarkRows)[number]) {
    setBenchmarkOpen(true);
    setAttributeOptimizerId(row.optimizerId);
    setQlMixedOptimizerId(row.qlMixedOptimizerId);
    setDitherEngineId(row.ditherEngineId);
    setDithering(ditherMethodForEngine(row.ditherEngineId));
    setOrderedMatrix(row.matrix);
    syncMatrixEditorFromSelection(row.matrix);
    setStructuredSettings((current) =>
      structuredSettingsForOptimizer(row.optimizerId, current)
    );
    setDraftState({ kind: "ready", result: row.result });
  }

  async function runTilemapBenchmark() {
    if (!developmentMode) return;
    if (
      tilemapBenchmarkRunning ||
      lastFinal === null ||
      lastFinal.platformId !== "zx-spectrum" ||
      lastFinal.modeId !== "zx48-standard-256x192" ||
      lastFinal.attributeHeight !== 8 ||
      lastFinal.frames.length !== 1 ||
      (
        charsetSource === "existing" &&
        (existingCharset === null || !existingCharsetChoiceValid)
      )
    ) return;
    const tilemapBenchmarkRun = tilemapBenchmarkRunRef.current + 1;
    tilemapBenchmarkRunRef.current = tilemapBenchmarkRun;
    setTilemapBenchmarkOpen(true);
    setTilemapBenchmarkRunning(true);
    setExportError(null);
    const source = lastFinal.frames[0]!;
    const strategies: readonly DerivedCharsetStrategy[] = [
      "frequency",
      "best-coverage",
      "image-similarity-v2",
      "image-similarity-v3",
      "image-similarity-v4",
      "image-similarity-v5",
    ];
    const rows: {
      strategy: DerivedCharsetStrategy;
      score: number;
      elapsedMs: number;
      result: WorkerCharsetResult;
    }[] = [];
    try {
      for (const strategy of strategies) {
        if (tilemapBenchmarkRunRef.current !== tilemapBenchmarkRun) return;
        const worker = new ConversionWorkerClient();
        const started = performance.now();
        try {
          const result = await worker.convertCharset(source.encoded, {
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
            derivedStrategy: strategy,
            distanceMetric:
                strategy === "image-similarity-v2" ||
                strategy === "image-similarity-v3" ||
                strategy === "image-similarity-v4" ||
                strategy === "image-similarity-v5"
              ? strategy
              : charsetDistance,
            visualWeighting: charsetVisualWeighting,
            swapRefinementPasses:
                strategy === "image-similarity-v2" ||
                strategy === "image-similarity-v3" ||
                strategy === "image-similarity-v4" ||
                strategy === "image-similarity-v5"
              ? 4
              : strategy === "best-coverage" ? 1 : 0,
          });
          if (tilemapBenchmarkRunRef.current !== tilemapBenchmarkRun) return;
          rows.push({
            strategy,
            score: commonPreviewError(source.previewRgba, result.previewRgba),
            elapsedMs: performance.now() - started,
            result,
          });
        } finally {
          worker.dispose();
        }
      }
      rows.sort((left, right) =>
        left.score - right.score ||
        left.strategy.localeCompare(right.strategy)
      );
      if (tilemapBenchmarkRunRef.current === tilemapBenchmarkRun) {
        setTilemapBenchmarkRows(rows);
      }
    } catch (error: unknown) {
      if (tilemapBenchmarkRunRef.current === tilemapBenchmarkRun) {
        setExportError(
          `Tilemap benchmark failed: ${
            error instanceof Error ? error.message : "Unknown error."
          }`,
        );
      }
    } finally {
      if (tilemapBenchmarkRunRef.current === tilemapBenchmarkRun) {
        setTilemapBenchmarkRunning(false);
      }
    }
  }

  function selectTilemapBenchmarkRow(
    row: (typeof tilemapBenchmarkRows)[number],
  ) {
    setTilemapBenchmarkOpen(true);
    setCharsetStrategy(row.strategy);
    setCharsetState({ kind: "ready", result: row.result });
    initializeTileEditor(row.result);
    setTilemapStale(false);
  }

  return {
    downloadBenchmark,
    handleInspectorKey,
    handleTilemapPutPointerDown,
    handleTilemapPutPointerEnd,
    handleTilemapPutPointerMove,
    openApplicationSettings,
    projectFileBaseName,
    runEngineBenchmark,
    runTilemapBenchmark,
    saveApplicationSettingsDraft,
    selectBenchmarkRow,
    selectDitherEngine,
    selectPreset,
    selectProfile,
    selectTilemapBenchmarkRow,
    switchWorkspaceConversionMode,
    syncKernelEditorFromSelection,
    syncMatrixEditorFromSelection,
    toggleBenchmarkComparison,
    toggleBenchmarkVisualFavorite,
  };
}
