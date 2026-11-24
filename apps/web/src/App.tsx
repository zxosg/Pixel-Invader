import { uiTypographyCssVariables, uiTypographyFromRecord } from "./ui-typography.js";
import { type CSSProperties } from "react";
import { WorkbenchMenuBar } from "./workbench-menu-bar.js";
import { ATTRIBUTE_OPTIMIZERS, type AttributeHaloRadius, type AttributeHeight, type AttributeOptimizerId, type BrightMode, type ConversionSettings, type CropAspectRatio, defineCustomDiffusionKernel, defineCustomOrderedMatrix, DITHER_ENGINES, type DitherEngineId, ditherEngineSelectionGroupForTarget, type DitheringMethod, ditherMethodForEngine, type FramingMode, isCompatibleEnginePair, isDitherEngineAvailableForSelection, latestDitherEngineForMethod, type OrderedMatrixId, paletteSelectionsMatch, type PanEdgeMode, type QlMixedOptimizerId, type ResamplingMethod, type RgbColor, type Rotation, type TargetModeId } from "@retro-converter/conversion-core";
import { BUILT_IN_PROFILE, BUILT_IN_PROFILES } from "./profiles.js";
import { AboutDialog } from "./about-dialog.js";
import { APPLICATION_BUILD_ID, APPLICATION_RELEASE_DATE, APPLICATION_VERSION, sanitizeArtifactBaseName } from "./artifacts.js";
import { type PreviewContent, type WorkbenchFocusTarget } from "./app-types.js";
import { createPortal } from "react-dom";
import { RangeNumberControl } from "./app-controls.js";
import { BUILT_IN_COMPOSER_PROPAGATION_IDS, composerPropagationLabel, hexToRgb, ORDERED_MATRIX_IDS, orderedMatrixLabel, parseKernelEntries, parseMatrixValues, rgbToHex } from "./dithering-labels.js";
import { nativePaletteForResult } from "./result-bitmap-editor.js";
import { ZX_BASE_COLORS } from "./inspection.js";
import { isAttributeOptimizerAvailableForTarget } from "./engine-preferences.js";
import { composerMixOptions } from "./dithering-ui.js";
import { CHARSET_ARTIFACT_HEADER_BYTES, type CharsetDistanceMetric, type CharsetEncoding, type CharsetSource, type DerivedCharsetStrategy } from "@retro-converter/zx-charset";
import { clampCharsetRange, glyphDataUrl } from "./specscii-assets.js";
import { normalizeProjectName } from "./projects.js";
import { ZxPaletteEditorDialog } from "./zx-palette-editor-dialog.js";
import { filterSettings, resetSettingsCategory, SETTING_CATEGORIES, SETTING_FILTER_PRESETS, type SettingCategory, type SettingDefinition, type SettingPresetId, SETTINGS_REGISTRY, validateSettingsDraft } from "./settings-registry.js";
import { type ApplicationSettings, DEFAULT_APPLICATION_SETTINGS } from "./application-settings.js";
import { type QlMixedDisplayResolution } from "./ql-mixed-preview.js";
import { gridPathForDimensions } from "./bitmap-editor-geometry.js";
import { useRuntimeState } from "./app/use-runtime-state.js";
import { useSettingsState } from "./app/use-settings-state.js";
import { useWorkbenchState } from "./app/use-workbench-state.js";
import { useWorkbenchWindows } from "./app/use-workbench-windows.js";
import { useWorkbenchLayout } from "./app/use-workbench-layout.js";
import { useResultEditing } from "./app/use-result-editing.js";
import { useConversionSettings } from "./app/use-conversion-settings.js";
import { useConversionActions } from "./app/use-conversion-actions.js";
import { usePreviewInspection } from "./app/use-preview-inspection.js";
import { useEngineSettingsBenchmarks } from "./app/use-engine-settings-benchmarks.js";
import { useEditorOperations } from "./app/use-editor-operations.js";
import { useBitmapEditorTools } from "./app/use-bitmap-editor-tools.js";
import { useBitmapEditorPointer } from "./app/use-bitmap-editor-pointer.js";
import { useCharsetAndExport } from "./app/use-charset-and-export.js";
import { useProjectAndArtifacts } from "./app/use-project-and-artifacts.js";
import { usePreviewSizing } from "./app/use-preview-sizing.js";
import { usePreviewLabels } from "./app/use-preview-labels.js";
import { workbenchDockIcon, workbenchDockLabel } from "./app/workbench-windows-helpers.js";

export function App() {
  const s0 = useRuntimeState();
  const s1 = useSettingsState(s0);
  const s2 = useWorkbenchState(s1);
  const s3 = useWorkbenchWindows({ ...s0, ...s1, ...s2 });
  const s4 = useWorkbenchLayout({ ...s1, ...s2, ...s3 });
  const s5 = useResultEditing({ ...s0, ...s1, ...s2, ...s3, ...s4 });
  const s6 = useConversionSettings({ ...s0, ...s1, ...s2, ...s5 });
  const s7 = useConversionActions({ ...s0, ...s1, ...s2, ...s5, ...s6 });
  const s8 = usePreviewInspection({ ...s0, ...s1, ...s2, ...s3, ...s4, ...s5 });
  const s9 = useEngineSettingsBenchmarks({ ...s0, ...s1, ...s2, ...s4, ...s5, ...s6, ...s7, ...s8 });
  const s10 = useEditorOperations({ ...s0, ...s1, ...s2, ...s5, ...s7, ...s8, ...s9 });
  const s11 = useBitmapEditorTools({ ...s0, ...s1, ...s2, ...s5, ...s8, ...s10 });
  const s12 = useBitmapEditorPointer({ ...s0, ...s1, ...s2, ...s5, ...s7, ...s8, ...s10, ...s11 });
  const s13 = useCharsetAndExport({ ...s0, ...s1, ...s2, ...s5, ...s6, ...s7, ...s9, ...s10, ...s12 });
  const s14 = useProjectAndArtifacts({ ...s0, ...s1, ...s2, ...s5, ...s6, ...s7, ...s8, ...s10 });
  const s15 = usePreviewSizing({ ...s0, ...s1, ...s2, ...s3, ...s5, ...s6, ...s8, ...s10, ...s11, ...s12, ...s13, ...s14 });
  const s16 = usePreviewLabels({ ...s0, ...s1, ...s2, ...s3, ...s4, ...s6, ...s8, ...s15 });
  const {
    aboutOpen,
    bitmapEditorBrightPolicy,
    bitmapEditorColorPickerActive,
    bitmapEditorFlashPolicy,
    bitmapEditorFlashPreviewMode,
    bitmapEditorInkColor,
    bitmapEditorPaperColor,
    bitmapEditorPickedCell,
    bitmapEditorResultFrameIndex,
    bitmapEditorResultPaletteIndex,
    bitmapEditorTarget,
    canvasRef,
    charsetGlyphRefs,
    charsetState,
    convertedCanvasRef,
    cropDragRef,
    draftState,
    highlightSelectedTileUses,
    lastFinal,
    resultViewportRef,
    setAboutOpen,
    setBitmapEditorBrightPolicy,
    setBitmapEditorFlashPolicy,
    setBitmapEditorFlashPreviewMode,
    setBitmapEditorInkColor,
    setBitmapEditorPaperColor,
    setBitmapEditorResultPaletteIndex,
    setHighlightSelectedTileUses,
    setSliderValidity,
    setState,
    sourceConvertedCanvasRef,
    sourceViewportRef,
    state,
    tileEditorEdited,
    tileEditorSelected,
    tileEditorTilePickerActive,
    tileEditorTilePickerClickGuardRef,
    tileEditorUsageSort,
    tilemapPutActive,
    unifiedTileEditorContext,
  } = s0;
  const {
    amountEntry,
    artisticPattern,
    attributeHaloHorizontal,
    attributeHaloInfluence,
    attributeHaloVertical,
    attributeHeight,
    attributeOptimizerId,
    attributeSmoothing,
    background,
    brightness,
    builtInSpecsciiFontError,
    charsetAllowPolarity,
    charsetAllowTransforms,
    charsetBudget,
    charsetDistance,
    charsetEncoding,
    charsetSelectionMode,
    charsetSource,
    charsetStrategy,
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
    ditherEngineId,
    dithering,
    errorDiffusionLineSuppression,
    errorDiffusionRandomization,
    existingCharset,
    existingCharsetLength,
    existingCharsetLengthEntry,
    existingCharsetName,
    existingCharsetSelection,
    existingCharsetStart,
    existingCharsetStartEntry,
    exportError,
    framing,
    gamma,
    gifFrameSelection,
    hslSaturation,
    hueShift,
    image,
    imageStatus,
    lightness,
    mirrorHorizontal,
    mirrorVertical,
    orderedMatrix,
    paletteSelections,
    panEdgeMode,
    panOffsetX,
    panOffsetY,
    profiles,
    projectName,
    qlMixedOptimizerId,
    resampling,
    rotation,
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
    setBrightness,
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
    setCustomDiffusionKernels,
    setCustomKernelEntryText,
    setCustomMatrixHeightEntry,
    setCustomMatrixValuesEntry,
    setCustomMatrixWidthEntry,
    setCustomOrderedMatrices,
    setCustomPatternError,
    setDitherEngineId,
    setDithering,
    setErrorDiffusionLineSuppression,
    setErrorDiffusionRandomization,
    setExistingCharsetLength,
    setExistingCharsetLengthEntry,
    setExistingCharsetStart,
    setExistingCharsetStartEntry,
    setFillOffsetX,
    setFillOffsetY,
    setFraming,
    setGamma,
    setGifFrameSelection,
    setHslSaturation,
    setHueShift,
    setLightness,
    setMirrorHorizontal,
    setMirrorVertical,
    setOrderedMatrix,
    setPanEdgeMode,
    setPanOffsetX,
    setPanOffsetY,
    setQlMixedOptimizerId,
    setResampling,
    setRotation,
    setSaturation,
    setScreenFlickerSuppression,
    setSelectedSourceCharsetTile,
    setSharpening,
    setSmoothing,
    setStructuredSettings,
    setTilemapStale,
    setVerticalSpatialSwapRows,
    setZxMixedAttributesOnly,
    setZxPaletteDefinition,
    sharpening,
    smoothing,
    sourceArtifact,
    sourceFileName,
    targetModeId,
    tilemapStale,
    verticalSpatialSwapRows,
    workspaceMode,
    zxMixedAttributesOnly,
    zxPaletteDefinition,
  } = s1;
  const {
    activeWorkspaceProfileId,
    benchmarkCompareDigests,
    benchmarkOpen,
    benchmarkPanelHost,
    benchmarkRows,
    benchmarkRunning,
    benchmarkVisualFavorites,
    bitmapEditorNavigatorViewport,
    cropPointerMode,
    developmentMode,
    draggingSide,
    hideAttributes,
    includeExperimentalEngines,
    inspection,
    inspectionDrawerOpen,
    isPmd,
    isQl,
    isZx,
    outputPreviewStage,
    paletteUsageFilter,
    pmd85GapPolicy,
    pmd85PaletteCalibrationId,
    previewZoom,
    projectNameDraft,
    projectSaveDialogOpen,
    qlMixedDisplayResolution,
    resultPreviewContent,
    resultPreviewZoom,
    scaleQlToDisplayAspect,
    selectedPaletteColor,
    selectedPlatformId,
    selectedProfile,
    setBenchmarkOpen,
    setBenchmarkPanelHost,
    setBenchmarkRows,
    setBitmapEditorToolsHost,
    setCropPointerMode,
    setHideAttributes,
    setIncludeExperimentalEngines,
    setInspectionDrawerOpen,
    setPaletteUsageFilter,
    setPmd85GapPolicy,
    setProjectNameDraft,
    setProjectSaveDialogOpen,
    setQlMixedDisplayResolution,
    setResultPreviewZoom,
    setScaleQlToDisplayAspect,
    setSelectedPaletteColor,
    setSettingsBaseline,
    setSettingsCategory,
    setSettingsDraft,
    setSettingsOpen,
    setSettingsPreset,
    setSettingsSearch,
    setShowAttributeGrid,
    setShowPixelGrid,
    setSourcePreviewZoom,
    setSynchronizePan,
    setSynchronizeZoom,
    setTileUsageFilter,
    setTilemapBenchmarkOpen,
    setWorkbenchAdjustmentsFloatingX,
    setWorkbenchAdjustmentsFloatingY,
    setWorkbenchBottomDockLayer,
    setWorkbenchBottomMinimizedLayer,
    setWorkbenchDitheringFloatingX,
    setWorkbenchDitheringFloatingY,
    setWorkbenchFloatingX,
    setWorkbenchFloatingY,
    setWorkbenchGeometryFloatingX,
    setWorkbenchGeometryFloatingY,
    setWorkbenchLayoutMenu,
    setWorkbenchLayoutMenuPosition,
    setWorkbenchLeftDockLayer,
    setWorkbenchPaletteFloatingX,
    setWorkbenchPaletteFloatingY,
    setWorkbenchPreviewLayer,
    setWorkbenchResultDockedWidth,
    setWorkbenchResultFloatingX,
    setWorkbenchResultFloatingY,
    setWorkbenchRightDockLayer,
    setWorkbenchSettingsDock,
    setWorkbenchSettingsMinimized,
    setWorkbenchSourceDockedWidth,
    setWorkbenchSourceFloatingX,
    setWorkbenchSourceFloatingY,
    setWorkbenchTilemapFloatingX,
    setWorkbenchTilemapFloatingY,
    setWorkbenchToolsFloatingX,
    setWorkbenchToolsFloatingY,
    setZxPaletteEditorOpen,
    settingsBaseline,
    settingsCategory,
    settingsDraft,
    settingsOpen,
    settingsPreset,
    settingsSearch,
    settingsSection,
    showAttributeGrid,
    showPixelGrid,
    sourcePreviewContent,
    sourcePreviewZoom,
    synchronizePan,
    synchronizeZoom,
    tileUsageFilter,
    tilemapBenchmarkOpen,
    tilemapBenchmarkRows,
    tilemapBenchmarkRunning,
    uiTypography,
    workbenchAdjustmentsFloating,
    workbenchAdjustmentsFloatingAutoHeight,
    workbenchAdjustmentsFloatingHeight,
    workbenchAdjustmentsFloatingWidth,
    workbenchAdjustmentsFloatingX,
    workbenchAdjustmentsFloatingY,
    workbenchAnnouncement,
    workbenchBottomHeight,
    workbenchDitheringFloating,
    workbenchDitheringFloatingAutoHeight,
    workbenchDitheringFloatingHeight,
    workbenchDitheringFloatingWidth,
    workbenchDitheringFloatingX,
    workbenchDitheringFloatingY,
    workbenchDragMovedRef,
    workbenchFloatingX,
    workbenchFloatingY,
    workbenchGeometryFloating,
    workbenchGeometryFloatingAutoHeight,
    workbenchGeometryFloatingHeight,
    workbenchGeometryFloatingWidth,
    workbenchGeometryFloatingX,
    workbenchGeometryFloatingY,
    workbenchLayoutMenu,
    workbenchLayoutMenuPosition,
    workbenchLeftWidth,
    workbenchPaletteFloating,
    workbenchPaletteFloatingAutoHeight,
    workbenchPaletteFloatingHeight,
    workbenchPaletteFloatingWidth,
    workbenchPaletteFloatingX,
    workbenchPaletteFloatingY,
    workbenchPreviewWorkspaceRef,
    workbenchResultDockedWidth,
    workbenchResultFloating,
    workbenchResultFloatingAutoHeight,
    workbenchResultFloatingHeight,
    workbenchResultFloatingWidth,
    workbenchResultFloatingX,
    workbenchResultFloatingY,
    workbenchRightWidth,
    workbenchRootRef,
    workbenchSettingsDock,
    workbenchSettingsFloatingHeight,
    workbenchSettingsFloatingWidth,
    workbenchSettingsMinimized,
    workbenchSettingsSideWidth,
    workbenchSettingsWindowRef,
    workbenchSourceDockedWidth,
    workbenchSourceFloating,
    workbenchSourceFloatingAutoHeight,
    workbenchSourceFloatingHeight,
    workbenchSourceFloatingWidth,
    workbenchSourceFloatingX,
    workbenchSourceFloatingY,
    workbenchTileDrag,
    workbenchTilemapFloating,
    workbenchTilemapFloatingAutoHeight,
    workbenchTilemapFloatingHeight,
    workbenchTilemapFloatingWidth,
    workbenchTilemapFloatingX,
    workbenchTilemapFloatingY,
    workbenchToolsFloatingHeight,
    workbenchToolsFloatingWidth,
    workbenchToolsFloatingX,
    workbenchToolsFloatingY,
    workbenchWindowLayouts,
    zxPaletteEditorOpen,
  } = s2;
  const {
    adjustWorkbenchFloatingSize,
    adjustWorkbenchSettingsFloatingSize,
    adjustWorkbenchSize,
    bitmapEditorActiveSide,
    bringWorkbenchWindowToFront,
    handleWorkbenchTitlebarClick,
    preventWorkbenchDragClick,
    previewLayout,
    resultPreviewVisible,
    setWorkbenchWindowOpen,
    setWorkbenchWindowVisibility,
    sourcePreviewVisible,
    startWorkbenchDockedPreviewResize,
    startWorkbenchFloatingResize,
    startWorkbenchResize,
    startWorkbenchSettingsFloatingResize,
    toggleWorkbenchLayoutMenu,
    updateWorkbenchWindowLayout,
    workbenchDockDropAttributes,
    workbenchDockLayerFor,
    workbenchDockSplitHandle,
    workbenchDockWindowStyle,
    workbenchHasBottomDockWindows,
    workbenchHasFloatingSections,
    workbenchHasLeftDock,
    workbenchHasRightDock,
    workbenchPaintColorsFloating,
    workbenchPortal,
    workbenchSettingsDockEmpty,
    workbenchToolsFloating,
    workbenchWindowActions,
    workbenchWindowDragAttributes,
    workbenchWindowLayout,
    workbenchWindowZIndex,
  } = s3;
  const {
    handleWorkbenchTitlebarKeyDown,
    resetWorkbenchLayout,
    resetWorkspaceArrangement,
    selectWorkspaceProfile,
    startWorkbenchDrag,
    startWorkbenchSectionDrag,
    startWorkbenchTitlebarDrag,
    workspaceProfileOptions,
  } = s4;
  const {
    resultFrameInput,
    switchDithering,
  } = s5;
  const {
    amount,
    amountValid,
    availableExistingCharsetCount,
    cancelGifFrameSelection,
    charsetRangeEntriesValid,
    cropSourceSize,
    cropValid,
    existingActiveCharacterCount,
    existingCharsetChoiceValid,
    fillGeometry,
    importClipboardImage,
    importImage,
    importPmd85,
    importSelectedGifFrame,
    paletteValid,
    panMaximumX,
    panMaximumY,
    settingsValid,
  } = s6;
  const {
    beginCropSelection,
    changeCropAspectRatio,
    changePmd85Calibration,
    clearCropSelection,
    convertImage,
    endCropSelection,
    ensurePixelCrop,
    moveCropSelection,
    moveCropWithKeyboard,
    selectHardwareModeFromMenu,
    setPaletteBrightMode,
    togglePaletteColor,
    updateCropEntry,
  } = s7;
  const {
    applyPickedTilemapIndex,
    beginBitmapEditorNavigatorDrag,
    beginPreviewDrag,
    deleteWorkspaceProfile,
    displayedHeight,
    displayedResult,
    displayedWidth,
    endBitmapEditorNavigatorDrag,
    endPreviewDrag,
    fitPreview,
    focusWorkbenchTarget,
    handlePreviewScroll,
    handlePreviewWheel,
    inspectResultPixel,
    markPanSource,
    moveBitmapEditorNavigatorDrag,
    movePreviewDrag,
    renameWorkspaceProfile,
    restoreDefaultWorkspaceProfiles,
    saveWorkspaceProfileAs,
    saveWorkspaceProfileChanges,
    selectPreviewContent,
    selectResultPixel,
    setZoom,
    stepPreviewZoom,
    stepZoom,
    workspaceProfileDirty,
  } = s8;
  const {
    downloadBenchmark,
    handleInspectorKey,
    handleTilemapPutPointerDown,
    handleTilemapPutPointerEnd,
    handleTilemapPutPointerMove,
    openApplicationSettings,
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
  } = s9;
  const {
    cancelHigh,
    consumeRecentTilePickerClick,
    createEditorTile,
    deleteAllImportedProfiles,
    deleteEditorTile,
    deleteSelectedProfile,
    freezeGeneratedCharset,
    importProfile,
    importSpecsciiFile,
    invalidateCharset,
    selectEditorTile,
    selectUsedTile,
    toggleEditorTileUsageSort,
  } = s10;
  const {
    toggleBitmapEditorColorPicker,
  } = s11;
  const {
    clearBitmapEditorSelectionOnDoubleClick,
    handleSourceCharsetTileClick,
    markCharsetSelectionChanged,
    switchCharsetTilesView,
    toggleCharsetSelectionMode,
  } = s12;
  const {
    beginCharsetSelection,
    clearCharsetSelection,
    commitCharsetLengthEntry,
    commitCharsetStartEntry,
    createEmptyImage,
    endCharsetSelection,
    exportAnimatedFlashGif,
    exportCharsetArtifact,
    exportCharsetDiagnostics,
    exportCharsetPreview,
    exportFinalCharset,
    exportInspectionReport,
    exportMetadata,
    exportPreviewPng,
    exportProject,
    exportScr,
    exportSpecsciiFile,
    glyphCharset,
    glyphCount,
    glyphDisplayIndices,
    handleCharsetDoubleClick,
    handleCharsetGlyphKey,
    importExistingCharset,
    invertCharsetSelection,
    moveCharsetSelection,
    openProjectSaveDialog,
    showingSourceCharset,
    tileUsage,
    tileUsageAvailable,
    tileUsageCountByIndex,
    toggleCharsetCharacter,
  } = s13;
  const {
    artifactsReady,
    benchmarkComparisonPreviews,
    borderHex,
    cropOverlay,
    displayedAttributeHeight,
    flashPreviewAvailable,
    openProject,
    paletteArtifactsReady,
    paletteUsage,
    paletteUsagePercent,
    resultSaveReady,
    sourceCharsetCount,
    standaloneTilemapPreview,
    tilemapArtifactsReady,
    visiblePaletteUsageColors,
  } = s14;
  const {
    bitmapEditorSelectionOverlay,
    fullBitmapEditorPreview,
    glyphActiveCount,
    glyphActiveIndexSet,
    highlightedTileCells,
    inspectedTileAssignment,
    inspectedTileIndex,
    inspectionCellOverlay,
    maximumTileUsage,
    resultFitStageSize,
    resultZoom,
    sourceFitStageSize,
    sourceShowsImage,
    sourceZoom,
    tilemapEditorSelectionOverlay,
    unifiedEditorPreview,
    visibleTileUsage,
  } = s15;
  const {
    comparisonKind,
    conversionStatusText,
    differencePreviewDataUrl,
    effectivePaletteOptionsByScreen,
    flickerSuppressionEffective,
    flickerSuppressionPolicyMismatch,
    hasMixedScreenTarget,
    hasQlMixedResolutionTarget,
    hasVerticalSpatialTarget,
    outputPaletteColors,
    resultLabel,
    resultStageAspectRatio,
    resultStageWidth,
    selectedModePalette,
    sourceStageAspectRatio,
    sourceStageWidth,
    windowImageFor,
  } = s16;


  return (
    <>
    <a className="skip-link" href="#workspace-title">Skip to converter</a>
    <main className="shell" id="main-content" style={uiTypographyCssVariables(uiTypography) as CSSProperties}>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{workbenchAnnouncement}</div>
      <WorkbenchMenuBar
        isPmd={isPmd}
        isZx={isZx}
        workspaceMode={workspaceMode}
        onWorkspaceModeChange={switchWorkspaceConversionMode}
        profiles={profiles}
        selectedProfile={selectedProfile}
        selectedProfileId={selectedProfileId}
        selectedPresetId={selectedPresetId}
        targetModeId={targetModeId}
        onProfileChange={selectProfile}
        onPresetChange={selectPreset}
        onTargetModeChange={(mode) => selectHardwareModeFromMenu(mode as TargetModeId)}
        canDeleteSelectedProfile={!BUILT_IN_PROFILES.some((profile) => profile.id === selectedProfile.id)}
        canDeleteImportedProfiles={profiles.length > BUILT_IN_PROFILES.length}
        onDeleteSelectedProfile={deleteSelectedProfile}
        onDeleteImportedProfiles={deleteAllImportedProfiles}
        canConvert={image !== null && settingsValid && state.kind !== "running"}
        conversionRunning={state.kind === "running"}
        onConvert={() => void convertImage()}
        onCancelConvert={cancelHigh}
        canSaveProject={artifactsReady && sourceArtifact !== null && image !== null}
        canExportResult={resultSaveReady}
        canExportMetadata={paletteArtifactsReady && image !== null}
        canExportInspection={resultSaveReady && isZx}
        canExportTilemap={tilemapArtifactsReady}
        onOpenImage={importImage}
        onCreateEmptyImage={(options) => { void createEmptyImage(options); }}
        onImportClipboard={() => void importClipboardImage()}
        onOpenPmd={importPmd85}
        onOpenProject={openProject}
        onImportProfile={importProfile}
        onImportSpecscii={importSpecsciiFile}
        onSaveProject={openProjectSaveDialog}
        onExportPreview={exportPreviewPng}
        onExportGif={exportAnimatedFlashGif}
        onExportBinary={exportScr}
        onExportMetadata={() => void exportMetadata()}
        onExportInspection={exportInspectionReport}
        onExportTilemap={exportCharsetArtifact}
        onExportSpecscii={exportSpecsciiFile}
        onExportCharset={exportFinalCharset}
        onExportPaletteSource={exportScr}
        onExportTilemapPreview={exportCharsetPreview}
        onExportTilemapDiagnostics={exportCharsetDiagnostics}
        windowLayouts={workbenchWindowLayouts}
        onWindowVisibilityChange={setWorkbenchWindowVisibility}
        workspaceProfiles={workspaceProfileOptions}
        activeWorkspaceProfileId={activeWorkspaceProfileId}
        workspaceProfileDirty={workspaceProfileDirty}
        onWorkspaceProfileSelect={selectWorkspaceProfile}
        onSaveWorkspaceProfileChanges={saveWorkspaceProfileChanges}
        onSaveWorkspaceProfileAs={saveWorkspaceProfileAs}
        onRenameWorkspaceProfile={renameWorkspaceProfile}
        onDeleteWorkspaceProfile={deleteWorkspaceProfile}
        onRestoreDefaultWorkspaceProfiles={restoreDefaultWorkspaceProfiles}
        onResetArrangement={resetWorkspaceArrangement}
        onOpenSettings={openApplicationSettings}
        onOpenPaletteEditor={() => setZxPaletteEditorOpen(true)}
        onOpenAbout={() => setAboutOpen(true)}
      />

      <AboutDialog
        open={aboutOpen}
        version={APPLICATION_VERSION}
        build={APPLICATION_BUILD_ID}
        releaseDate={APPLICATION_RELEASE_DATE}
        onClose={() => setAboutOpen(false)}
      />

      <section
        ref={workbenchRootRef}
        className={`proof workspace workbench-workspace workbench-settings-${workbenchSettingsDock} workbench-settings-${workbenchSettingsMinimized ? "minimized" : "expanded"}${bitmapEditorActiveSide !== null ? " workbench-bitmap-editor-active" : ""}${bitmapEditorActiveSide !== null && workbenchHasBottomDockWindows ? " workbench-bitmap-editor-bottom-dock" : ""}`}
        data-preview-layout={previewLayout}
        data-left-dock-collapsed={bitmapEditorActiveSide !== null ? "false" : !workbenchHasLeftDock || workbenchLeftWidth <= 0 ? "true" : "false"}
        data-right-dock-collapsed={!workbenchHasRightDock || workbenchRightWidth <= 0 ? "true" : "false"}
        data-bottom-dock-collapsed={!workbenchHasBottomDockWindows || workbenchBottomHeight <= 0 ? "true" : "false"}
        style={{
          "--workbench-side-width": `${workbenchSettingsSideWidth}px`,
          "--workbench-left-dock-width": `${bitmapEditorActiveSide !== null ? Math.max(280, Math.min(360, workbenchLeftWidth || 300)) : workbenchHasLeftDock ? workbenchLeftWidth : 0}px`,
          "--workbench-right-dock-width": `${workbenchHasRightDock ? workbenchRightWidth : 0}px`,
          "--workbench-bottom-height": `${workbenchHasBottomDockWindows ? workbenchBottomHeight : 0}px`,
          "--workbench-floating-x": `${workbenchFloatingX}px`,
          "--workbench-floating-y": `${workbenchFloatingY}px`,
          "--workbench-settings-floating-width": `${workbenchSettingsFloatingWidth}px`,
          "--workbench-settings-floating-height": `${workbenchSettingsFloatingHeight}px`,
          "--workbench-settings-origin-x": "0px",
          "--workbench-settings-origin-y": "0px",
          "--workbench-tools-floating-x": `${workbenchToolsFloatingX}px`,
          "--workbench-tools-floating-y": `${workbenchToolsFloatingY}px`,
          "--workbench-tools-floating-width": `${workbenchToolsFloatingWidth}px`,
          "--workbench-tools-floating-height": `${workbenchToolsFloatingHeight}px`,
          "--workbench-geometry-floating-x": `${workbenchGeometryFloatingX}px`,
          "--workbench-geometry-floating-y": `${workbenchGeometryFloatingY}px`,
          "--workbench-geometry-floating-width": `${workbenchGeometryFloatingWidth}px`,
          "--workbench-geometry-floating-height": `${workbenchGeometryFloatingHeight}px`,
          "--workbench-adjustments-floating-x": `${workbenchAdjustmentsFloatingX}px`,
          "--workbench-adjustments-floating-y": `${workbenchAdjustmentsFloatingY}px`,
          "--workbench-adjustments-floating-width": `${workbenchAdjustmentsFloatingWidth}px`,
          "--workbench-adjustments-floating-height": `${workbenchAdjustmentsFloatingHeight}px`,
          "--workbench-palette-floating-x": `${workbenchPaletteFloatingX}px`,
          "--workbench-palette-floating-y": `${workbenchPaletteFloatingY}px`,
          "--workbench-palette-floating-width": `${workbenchPaletteFloatingWidth}px`,
          "--workbench-palette-floating-height": `${workbenchPaletteFloatingHeight}px`,
          "--workbench-dithering-floating-x": `${workbenchDitheringFloatingX}px`,
          "--workbench-dithering-floating-y": `${workbenchDitheringFloatingY}px`,
          "--workbench-dithering-floating-width": `${workbenchDitheringFloatingWidth}px`,
          "--workbench-dithering-floating-height": `${workbenchDitheringFloatingHeight}px`,
          "--workbench-tilemap-floating-x": `${workbenchTilemapFloatingX}px`,
          "--workbench-tilemap-floating-y": `${workbenchTilemapFloatingY}px`,
          "--workbench-tilemap-floating-width": `${workbenchTilemapFloatingWidth}px`,
          "--workbench-tilemap-floating-height": `${workbenchTilemapFloatingHeight}px`,
          "--workbench-source-floating-x": `${workbenchSourceFloatingX}px`,
          "--workbench-source-floating-y": `${workbenchSourceFloatingY}px`,
          "--workbench-source-floating-width": `${workbenchSourceFloatingWidth}px`,
          "--workbench-source-floating-height": `${workbenchSourceFloatingHeight}px`,
          "--workbench-result-floating-x": `${workbenchResultFloatingX}px`,
          "--workbench-result-floating-y": `${workbenchResultFloatingY}px`,
          "--workbench-result-floating-width": `${workbenchResultFloatingWidth}px`,
          "--workbench-result-floating-height": `${workbenchResultFloatingHeight}px`,
          "--workbench-source-docked-width": `${workbenchSourceDockedWidth}fr`,
          "--workbench-result-docked-width": `${workbenchResultDockedWidth}fr`,
        } as CSSProperties}
        aria-labelledby="workspace-title"
      >
        <div className="workspace-heading">
          <div className="workspace-copy">
            <h2 id="workspace-title">Conversion workspace</h2>
            <p>Choose an image, adjust the compact controls, then convert. Press Enter from a control to run the conversion.</p>
          </div>
          <div
            className="status conversion-status top-conversion-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="workspace-input-label">
              {workspaceMode === "tilemap"
                ? "Palette source → Tilemap reconstruction"
                : "Conversion input"}
            </span>
            {sourceFileName === null
              ? null
              : <span className="imported-file-name" title={sourceFileName}>
                  {sourceFileName}
                </span>}
            {sourceArtifact === null ? null : <span className="current-project-name" title={`Project: ${projectName}`}>{projectName}</span>}
            <span>{conversionStatusText}</span>
            <span className="source-format-status">
              {imageStatus}{image === null
                ? ""
                : dirty
                  ? " · Unsaved changes"
                  : " · Completed project saved"}
            </span>
          </div>
          <div className="heading-actions">
            <label className="top-workspace-selector">
              <span>Focus</span>
              <select
                aria-label="Configuration focus"
                value={settingsSection}
                onChange={(event) => focusWorkbenchTarget(event.target.value as WorkbenchFocusTarget)}
              >
                <option value="all">All controls</option>
                <optgroup label="Windows">
                  <option value="tools">Tools</option>
                  <option value="source">Source preview</option>
                  <option value="result">Result preview</option>
                </optgroup>
                <optgroup label="Settings">
                  <option value="geometry">Geometry</option>
                  <option value="adjustments">Image adjustments</option>
                  <option value="palette">Palette controls</option>
                  <option value="dithering">Dithering controls</option>
                  {workspaceMode === "tilemap" ? <option value="tilemap">Tilemap controls</option> : null}
                </optgroup>
              </select>
            </label>
          </div>
        </div>

        <form
          className="conversion-form"
          aria-busy={state.kind === "running" || draftState.kind === "running"}
          onSubmit={(event) => {
            event.preventDefault();
            if (image !== null && settingsValid && state.kind !== "running") {
              void convertImage();
            }
          }}
          onKeyDown={(event) => {
            const target = event.target;
            const editingControl =
              target instanceof HTMLTextAreaElement ||
              target instanceof HTMLInputElement ||
              target instanceof HTMLSelectElement ||
              (target instanceof HTMLElement && target.isContentEditable);
            if (
              event.key === "Enter" &&
              !editingControl &&
              !(target instanceof HTMLButtonElement) &&
              image !== null &&
              settingsValid &&
              state.kind !== "running"
            ) {
              event.preventDefault();
              void convertImage();
            }
          }}
        >
          <div className="controls">

          <div
            className={`workbench-window workbench-settings-window${workbenchSettingsDockEmpty ? " workbench-settings-empty-dock" : ""}`}
            ref={workbenchSettingsWindowRef}
            data-dock={workbenchSettingsDock}
            data-minimized={workbenchSettingsMinimized ? "true" : "false"}
            data-empty={workbenchSettingsDockEmpty ? "true" : "false"}
            style={workbenchSettingsDock === "floating" ? { zIndex: workbenchWindowZIndex("settings") } : undefined}
            onPointerDown={() => bringWorkbenchWindowToFront("settings")}
          >
            <div
              className={`workbench-resize-handle workbench-resize-${workbenchSettingsDock}`}
              role="separator"
              tabIndex={0}
              aria-label={`Resize Conversion settings ${workbenchSettingsDock === "bottom" ? "height" : "width"}`}
              aria-orientation={workbenchSettingsDock === "bottom" ? "horizontal" : "vertical"}
              aria-valuemin={workbenchSettingsDock === "floating" ? 280 : 0}
              aria-valuemax={workbenchSettingsDock === "floating" ? 760 : workbenchSettingsDock === "bottom" ? 480 : 560}
              aria-valuenow={workbenchSettingsDock === "floating" ? workbenchSettingsFloatingHeight : workbenchSettingsDock === "bottom" ? workbenchBottomHeight : workbenchSettingsSideWidth}
              onPointerDown={workbenchSettingsDock === "floating" ? startWorkbenchSettingsFloatingResize : (event) => startWorkbenchResize(workbenchSettingsDock, event)}
              onKeyDown={(event) => {
                if (workbenchSettingsDock === "floating") {
                  const step = event.shiftKey ? 32 : 8;
                  if (event.key === "ArrowLeft") adjustWorkbenchSettingsFloatingSize(-step, 0);
                  if (event.key === "ArrowRight") adjustWorkbenchSettingsFloatingSize(step, 0);
                  if (event.key === "ArrowUp") adjustWorkbenchSettingsFloatingSize(0, -step);
                  if (event.key === "ArrowDown") adjustWorkbenchSettingsFloatingSize(0, step);
                } else if (workbenchSettingsDock === "bottom") {
                  if (event.key === "ArrowUp") adjustWorkbenchSize("bottom", 16);
                  if (event.key === "ArrowDown") adjustWorkbenchSize("bottom", -16);
                } else {
                  if (event.key === "ArrowLeft") adjustWorkbenchSize(workbenchSettingsDock, workbenchSettingsDock === "right" ? 16 : -16);
                  if (event.key === "ArrowRight") adjustWorkbenchSize(workbenchSettingsDock, workbenchSettingsDock === "right" ? -16 : 16);
                }
              }}
            >
              <span className="visually-hidden">Drag to resize</span>
            </div>
            <div
              className="workbench-window-titlebar"
              onPointerDown={(event) => {
                if (workbenchSettingsDock === "floating") startWorkbenchTitlebarDrag("settings", event);
              }}
            >
              <button className="workbench-window-title" type="button" aria-expanded={!workbenchSettingsMinimized} onClick={(event) => {
                if (workbenchSettingsDock === "floating" && workbenchDragMovedRef.current) {
                  preventWorkbenchDragClick(event);
                  return;
                }
                setWorkbenchSettingsMinimized((value) => !value);
              }}>
                <span aria-hidden="true">{workbenchSettingsMinimized ? "▶" : "▼"}</span>
                <span>Conversion settings</span>
              </button>
              {workbenchSettingsDock === "floating" ? (
                <div
                  className="workbench-window-drag-handle"
                  role="button"
                  tabIndex={0}
                  aria-label="Move Conversion settings window"
                  title="Drag to move Conversion settings"
                  onPointerDown={startWorkbenchDrag}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 32 : 8;
                    if (event.key === "ArrowLeft") setWorkbenchFloatingX((x) => Math.max(8, x - step));
                    if (event.key === "ArrowRight") setWorkbenchFloatingX((x) => x + step);
                    if (event.key === "ArrowUp") setWorkbenchFloatingY((y) => Math.max(8, y - step));
                    if (event.key === "ArrowDown") setWorkbenchFloatingY((y) => y + step);
                  }}
                >⠿</div>
              ) : null}
              <div className="workbench-window-actions" aria-label="Conversion settings layout actions">
                <span className="workbench-window-location-menu">
                  <button
                    className="workbench-window-location-button"
                    type="button"
                    aria-label="Change Conversion settings location"
                    title="Change Conversion settings location"
                    aria-haspopup="menu"
                    aria-expanded={workbenchLayoutMenu === "settings"}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleWorkbenchLayoutMenu("settings", event.currentTarget);
                    }}
                  >{workbenchDockIcon(workbenchSettingsDock)}</button>
                  {workbenchLayoutMenu === "settings" ? (
                    workbenchLayoutMenuPosition === null ? null : createPortal(
                      <span
                        className="workbench-window-location-popover"
                        role="menu"
                        aria-label="Conversion settings locations"
                        style={{ left: workbenchLayoutMenuPosition.left, top: workbenchLayoutMenuPosition.top }}
                      >
                        {(["floating", "left", "right", "bottom"] as const).map((dock) => (
                          <button
                            key={dock}
                            type="button"
                            role="menuitemradio"
                            aria-checked={workbenchSettingsDock === dock}
                            className={workbenchSettingsDock === dock ? "active" : undefined}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setWorkbenchSettingsDock(dock);
                              setWorkbenchLayoutMenu(null);
                              setWorkbenchLayoutMenuPosition(null);
                            }}
                          ><span aria-hidden="true">{workbenchDockIcon(dock)}</span>{workbenchDockLabel(dock)}</button>
                        ))}
                      </span>,
                      document.body,
                      "workbench-location-menu-settings",
                    )
                  ) : null}
                </span>
                <button type="button" aria-label="Reset workbench layout" title="Reset workbench layout" onClick={resetWorkbenchLayout}>↺</button>
              </div>
            </div>
            <div className="workbench-window-content" hidden={workbenchSettingsMinimized && !workbenchHasFloatingSections}>
          {workbenchPortal("geometry", (
          <details
            className={`workbench-settings-section workbench-window${workbenchGeometryFloating ? ` workbench-section-floating workbench-geometry-floating${workbenchGeometryFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : ""}`}
            {...workbenchWindowDragAttributes("geometry")}
            data-workbench-window="geometry"
            hidden={!workbenchWindowLayout("geometry").visible}
            data-dock={workbenchWindowLayout("geometry").dock}
            data-minimized={workbenchWindowLayout("geometry").minimized ? "true" : "false"}
            open={workbenchWindowLayout("geometry").open && !workbenchWindowLayout("geometry").minimized}
            style={workbenchDockWindowStyle("geometry", workbenchGeometryFloating ? { zIndex: workbenchWindowZIndex("geometry") } : undefined)}
            onPointerDown={(event) => {
              if (workbenchGeometryFloating) {
                event.stopPropagation();
                bringWorkbenchWindowToFront("geometry");
              }
            }}
            onFocusCapture={() => {
              if (workbenchGeometryFloating) bringWorkbenchWindowToFront("geometry");
            }}
            onToggle={(event) => setWorkbenchWindowOpen("geometry", event.currentTarget.open)}
          >
            <summary
              onPointerDown={(event) => {
                startWorkbenchTitlebarDrag("geometry", event);
              }}
              onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("geometry", event)}
              onClick={(event) => handleWorkbenchTitlebarClick("geometry", event)}
            >
              <span>Geometry</span>
              {workbenchWindowActions("geometry")}
              {workbenchGeometryFloating ? (
                <span
                  className="workbench-window-drag-handle"
                  role="button"
                  tabIndex={0}
                  aria-label="Move Geometry window"
                  title="Drag to move Geometry"
                  onPointerDown={(event) => startWorkbenchSectionDrag("geometry", event)}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 32 : 8;
                    if (event.key === "ArrowLeft") setWorkbenchGeometryFloatingX((x) => Math.max(8, x - step));
                    if (event.key === "ArrowRight") setWorkbenchGeometryFloatingX((x) => x + step);
                    if (event.key === "ArrowUp") setWorkbenchGeometryFloatingY((y) => Math.max(8, y - step));
                    if (event.key === "ArrowDown") setWorkbenchGeometryFloatingY((y) => y + step);
                  }}
                >⠿</span>
              ) : null}
            </summary>
            {workbenchDockSplitHandle("geometry")}
            {workbenchGeometryFloating ? (
              <div
                className="workbench-floating-resize-handle"
                role="button"
                tabIndex={0}
                aria-label="Resize Geometry window"
                onPointerDown={(event) => startWorkbenchFloatingResize("geometry", event)}
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 32 : 8;
                  if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("geometry", step, 0);
                  if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("geometry", -step, 0);
                  if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("geometry", 0, step);
                  if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("geometry", 0, -step);
                }}
              />
            ) : null}
          <fieldset id="settings-geometry" className={`control-group geometry-group${settingsSection === "geometry" ? " settings-focused" : ""}`}>
            <legend className="visually-hidden">Geometry</legend>
          <div className="geometry-row geometry-primary-row control-row control-row-3">
          <label>
            <span>Framing</span>
            <select aria-label="Framing" value={framing} onChange={(event) => {
              const next = event.target.value as FramingMode;
              if (next === "crop") ensurePixelCrop();
              setFraming(next);
              setState({ kind: "idle" });
            }}>
              <option value="fit">Fit</option>
              <option value="fill">Fill</option>
              <option value="crop">Crop</option>
              <option value="stretch">Stretch</option>
            </select>
          </label>
          <label>
            <span>Resampling</span>
            <select value={resampling} onChange={(event) => { setResampling(event.target.value as ResamplingMethod); setState({ kind: "idle" }); }}>
              <option value="nearest">Nearest-neighbor</option>
              <option value="bilinear">Bilinear</option>
              <option value="lanczos">Lanczos-3</option>
            </select>
          </label>
          <label>
            <span>Rotation</span>
            <select value={rotation} onChange={(event) => {
              const next = Number(event.target.value) as Rotation;
              ensurePixelCrop(next);
              setFillOffsetX(null);
              setFillOffsetY(null);
              setRotation(next);
              setState({ kind: "idle" });
            }}>
              <option value={0}>0°</option>
              <option value={90}>90° clockwise</option>
              <option value={180}>180°</option>
              <option value={270}>270° clockwise</option>
            </select>
          </label>
          </div>
          {framing === "fill" ? (
            <fieldset className="geometry-row framing-detail focal-control control-row control-row-2">
              <legend>Fill crop offset (source pixels)</legend>
              <RangeNumberControl
                id="fill-offset-x"
                label="Horizontal"
                value={fillGeometry?.resolvedOffsetX ?? 0}
                min={0}
                max={fillGeometry?.maximumOffsetX ?? 0}
                unit=" px"
                disabled={fillGeometry?.activeAxis !== "x"}
                onChange={(value) => {
                  setFillOffsetX(value);
                  setState({ kind: "idle" });
                }}
                onValidityChange={setSliderValidity}
              />
              <RangeNumberControl
                id="fill-offset-y"
                label="Vertical"
                value={fillGeometry?.resolvedOffsetY ?? 0}
                min={0}
                max={fillGeometry?.maximumOffsetY ?? 0}
                unit=" px"
                disabled={fillGeometry?.activeAxis !== "y"}
                onChange={(value) => {
                  setFillOffsetY(value);
                  setState({ kind: "idle" });
                }}
                onValidityChange={setSliderValidity}
              />
            </fieldset>
          ) : null}
          {framing === "fit" ? (
            <fieldset className="geometry-row framing-detail fit-position-control control-row control-row-2">
              <legend>Fit position adjustment (output pixels)</legend>
              <RangeNumberControl
                id="fit-position-x"
                label="Horizontal position"
                value={panOffsetX}
                min={-panMaximumX}
                max={panMaximumX}
                unit=" px"
                resetValue={0}
                onChange={(value) => {
                  setPanOffsetX(value);
                  setState({ kind: "idle" });
                }}
                onValidityChange={setSliderValidity}
              />
              <RangeNumberControl
                id="fit-position-y"
                label="Vertical position"
                value={panOffsetY}
                min={-panMaximumY}
                max={panMaximumY}
                unit=" px"
                resetValue={0}
                onChange={(value) => {
                  setPanOffsetY(value);
                  setState({ kind: "idle" });
                }}
                onValidityChange={setSliderValidity}
              />
              <span className="control-help fit-position-help">
                Positive values move the fitted image right or down; negative values move it left or up. Use the arrow pad below for one-pixel steps.
              </span>
            </fieldset>
          ) : null}
          {framing === "crop" ? (
            <fieldset className="geometry-row framing-detail crop-control control-row control-row-5" aria-describedby={cropValid ? "crop-help" : "crop-error"}>
              <legend>Crop rectangle (source pixels)</legend>
              <label className="crop-aspect-control">
                <span>Aspect ratio</span>
                <select
                  aria-label="Crop aspect ratio"
                  value={cropAspectRatio}
                  onChange={(event) => changeCropAspectRatio(event.target.value as CropAspectRatio)}
                  disabled={image === null}
                >
                  <option value="none">No aspect ratio</option>
                  <option value="source">Lock aspect ratio as source image</option>
                  <option value="destination">Lock aspect ratio as destination image</option>
                </select>
              </label>
              <label>
                <span>X</span>
                <input aria-label="Crop X" className={cropValid ? undefined : "invalid"} type="number" min="0" max={Math.max(0, (cropSourceSize?.width ?? 1) - 1)} step="1" value={cropXEntry} aria-invalid={!cropValid} disabled={image === null} onChange={(event) => updateCropEntry("x", event.target.value)} />
              </label>
              <label>
                <span>Y</span>
                <input aria-label="Crop Y" className={cropValid ? undefined : "invalid"} type="number" min="0" max={Math.max(0, (cropSourceSize?.height ?? 1) - 1)} step="1" value={cropYEntry} aria-invalid={!cropValid} disabled={image === null} onChange={(event) => updateCropEntry("y", event.target.value)} />
              </label>
              <label>
                <span>Width</span>
                <input aria-label="Crop width" className={cropValid ? undefined : "invalid"} type="number" min="1" max={cropSourceSize?.width ?? 1} step="1" value={cropWidthEntry} aria-invalid={!cropValid} disabled={image === null} onChange={(event) => updateCropEntry("width", event.target.value)} />
              </label>
              <label>
                <span>Height</span>
                <input aria-label="Crop height" className={cropValid ? undefined : "invalid"} type="number" min="1" max={cropSourceSize?.height ?? 1} step="1" value={cropHeightEntry} aria-invalid={!cropValid} disabled={image === null} onChange={(event) => updateCropEntry("height", event.target.value)} />
              </label>
              <span className="control-help crop-help" id="crop-help">
                Drag on the Source image to select. Drag inside to move; use Arrow keys to move one pixel; double-click inside to clear. Coordinates refer to the oriented source.
              </span>
              <span className="crop-help-icon" title="Drag on the Source image to select. Drag inside to move; use Arrow keys to move one pixel; double-click inside to clear." aria-label="Crop selection help">ⓘ</span>
              {cropValid ? null : <span className="field-error" id="crop-error">Invalid value</span>}
            </fieldset>
          ) : null}
          <div className="geometry-row orientation-actions control-row control-row-4">
            <fieldset className="orientation-control">
              <legend>Mirror</legend>
              <div className="mirror-actions">
                <button
                  className="mirror-toggle"
                  type="button"
                  aria-label="Mirror horizontally"
                  aria-pressed={mirrorHorizontal}
                  title="Mirror horizontally (left to right)"
                  onClick={() => { setMirrorHorizontal((current) => !current); setState({ kind: "idle" }); }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <defs>
                      <pattern id="mirror-horizontal-hatch" width="3" height="3" patternTransform="rotate(35)" patternUnits="userSpaceOnUse">
                        <path d="M0 0V3" stroke="currentColor" strokeWidth="1.2" />
                      </pattern>
                    </defs>
                    <path className="mirror-icon-solid" d="M2 20 10.4 4v16Z" />
                    <path className="mirror-icon-hatched" d="M13.6 4 22 20h-8.4Z" />
                    <path className="mirror-icon-axis" d="M12 3v18" />
                  </svg>
                </button>
                <button
                  className="mirror-toggle mirror-toggle-vertical"
                  type="button"
                  aria-label="Mirror vertically"
                  aria-pressed={mirrorVertical}
                  title="Mirror vertically (top to bottom)"
                  onClick={() => { setMirrorVertical((current) => !current); setState({ kind: "idle" }); }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <defs>
                      <pattern id="mirror-vertical-hatch" width="3" height="3" patternTransform="rotate(35)" patternUnits="userSpaceOnUse">
                        <path d="M0 0V3" stroke="currentColor" strokeWidth="1.2" />
                      </pattern>
                    </defs>
                    <path className="mirror-icon-solid" d="M3 10.4 12 3l9 7.4Z" />
                    <path className="mirror-icon-hatched" d="m3 13.6 9 7.4 9-7.4Z" />
                    <path className="mirror-icon-axis" d="M2 12h20" />
                  </svg>
                </button>
              </div>
            </fieldset>
            <fieldset className="pan-control">
              <legend>Position</legend>
              <div className="pan-pad" aria-label="Adjust image position by one output pixel">
                <button className="pan-up" type="button" aria-label="Move bitmap up one pixel" title="Move bitmap up one pixel" disabled={panOffsetY <= -panMaximumY} onClick={() => { setPanOffsetY((current) => Math.max(-panMaximumY, current - 1)); setState({ kind: "idle" }); }}>▲</button>
                <button className="pan-left" type="button" aria-label="Move bitmap left one pixel" title="Move bitmap left one pixel" disabled={panOffsetX <= -panMaximumX} onClick={() => { setPanOffsetX((current) => Math.max(-panMaximumX, current - 1)); setState({ kind: "idle" }); }}>◀</button>
                <button className="pan-center" type="button" aria-label="Center bitmap" title="Center bitmap" disabled={panOffsetX === 0 && panOffsetY === 0} onClick={() => { setPanOffsetX(0); setPanOffsetY(0); setState({ kind: "idle" }); }}>●</button>
                <button className="pan-right" type="button" aria-label="Move bitmap right one pixel" title="Move bitmap right one pixel" disabled={panOffsetX >= panMaximumX} onClick={() => { setPanOffsetX((current) => Math.min(panMaximumX, current + 1)); setState({ kind: "idle" }); }}>▶</button>
                <button className="pan-down" type="button" aria-label="Move bitmap down one pixel" title="Move bitmap down one pixel" disabled={panOffsetY >= panMaximumY} onClick={() => { setPanOffsetY((current) => Math.min(panMaximumY, current + 1)); setState({ kind: "idle" }); }}>▼</button>
              </div>
            </fieldset>
            <fieldset className="pan-edge-control edge-control">
              <legend>Edges</legend>
              <select aria-label="Pan edge handling" value={panEdgeMode} onChange={(event) => { setPanEdgeMode(event.target.value as PanEdgeMode); setState({ kind: "idle" }); }}>
                <option value="background">Background</option>
                <option value="clamp">Clamp</option>
                <option value="wrap">Wrap</option>
              </select>
            </fieldset>
            <fieldset className="background-control">
              <legend>Background</legend>
              <input className="background-picker" type="color" aria-label="Background color" title="Choose background color; the color dialog supports manual RGB entry" value={rgbToHex(background)} onChange={(event) => { setBackground(hexToRgb(event.target.value)); setState({ kind: "idle" }); }} />
            </fieldset>
          </div>
          </fieldset>
          </details>
          ))}
          {workbenchPortal("adjustments", (
          <details
            className={`workbench-settings-section workbench-window${workbenchAdjustmentsFloating ? ` workbench-section-floating workbench-adjustments-floating${workbenchAdjustmentsFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : ""}`}
            {...workbenchWindowDragAttributes("adjustments")}
            data-workbench-window="adjustments"
            hidden={!workbenchWindowLayout("adjustments").visible}
            data-dock={workbenchWindowLayout("adjustments").dock}
            data-minimized={workbenchWindowLayout("adjustments").minimized ? "true" : "false"}
            open={workbenchWindowLayout("adjustments").open && !workbenchWindowLayout("adjustments").minimized}
            style={workbenchDockWindowStyle("adjustments", workbenchAdjustmentsFloating ? { zIndex: workbenchWindowZIndex("adjustments") } : undefined)}
            onPointerDown={(event) => {
              if (workbenchAdjustmentsFloating) {
                event.stopPropagation();
                bringWorkbenchWindowToFront("adjustments");
              }
            }}
            onFocusCapture={() => {
              if (workbenchAdjustmentsFloating) bringWorkbenchWindowToFront("adjustments");
            }}
            onToggle={(event) => setWorkbenchWindowOpen("adjustments", event.currentTarget.open)}
          >
            <summary
              onPointerDown={(event) => {
                startWorkbenchTitlebarDrag("adjustments", event);
              }}
              onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("adjustments", event)}
              onClick={(event) => handleWorkbenchTitlebarClick("adjustments", event)}
            >
              <span>Image adjustments</span>
              {workbenchWindowActions("adjustments")}
              {workbenchAdjustmentsFloating ? (
                <span
                  className="workbench-window-drag-handle"
                  role="button"
                  tabIndex={0}
                  aria-label="Move Image adjustments window"
                  title="Drag to move Image adjustments"
                  onPointerDown={(event) => startWorkbenchSectionDrag("adjustments", event)}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 32 : 8;
                    if (event.key === "ArrowLeft") setWorkbenchAdjustmentsFloatingX((x) => Math.max(8, x - step));
                    if (event.key === "ArrowRight") setWorkbenchAdjustmentsFloatingX((x) => x + step);
                    if (event.key === "ArrowUp") setWorkbenchAdjustmentsFloatingY((y) => Math.max(8, y - step));
                    if (event.key === "ArrowDown") setWorkbenchAdjustmentsFloatingY((y) => y + step);
                  }}
                >⠿</span>
              ) : null}
            </summary>
            {workbenchDockSplitHandle("adjustments")}
            {workbenchAdjustmentsFloating ? (
              <div
                className="workbench-floating-resize-handle"
                role="button"
                tabIndex={0}
                aria-label="Resize Image adjustments window"
                onPointerDown={(event) => startWorkbenchFloatingResize("adjustments", event)}
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 32 : 8;
                  if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("adjustments", step, 0);
                  if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("adjustments", -step, 0);
                  if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("adjustments", 0, step);
                  if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("adjustments", 0, -step);
                }}
              />
            ) : null}
          <fieldset id="settings-adjustments" className={`adjustment-control control-group${settingsSection === "adjustments" ? " settings-focused" : ""}`}>
            <legend className="visually-hidden">Image adjustments</legend>
            <div className="control-row control-row-2">
            <RangeNumberControl id="brightness" label="Brightness" value={brightness} min={-100} max={100} resetValue={0} onChange={(value) => { setBrightness(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            <RangeNumberControl id="contrast" label="Contrast" value={contrast} min={-100} max={100} resetValue={0} onChange={(value) => { setContrast(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            </div>
            <div className="control-row control-row-2">
            <RangeNumberControl id="gamma" label="Gamma" value={gamma} min={10} max={300} unit="%" resetValue={100} onChange={(value) => { setGamma(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            </div>
            <div className="control-row control-row-2">
            <RangeNumberControl id="hue-shift" label="Hue" value={hueShift} min={-180} max={180} unit="°" resetValue={0} onChange={(value) => { setHueShift(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            <RangeNumberControl id="hsl-saturation" label="Saturation" value={hslSaturation} min={-100} max={100} resetValue={0} onChange={(value) => { setHslSaturation(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            </div>
            <div className="control-row control-row-2">
            <RangeNumberControl id="lightness" label="HSL Lightness" value={lightness} min={-100} max={100} resetValue={0} onChange={(value) => { setLightness(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            <label className="check-control"><input id="colorize" type="checkbox" checked={colorize} onChange={(event) => { setColorize(event.target.checked); setState({ kind: "idle" }); }} /><span>Colorize</span></label>
            </div>
            <div className="control-row control-row-2">
            <RangeNumberControl id="smoothing" label="Smoothing" value={smoothing} min={0} max={100} unit="%" resetValue={0} onChange={(value) => { setSmoothing(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            <RangeNumberControl id="sharpening" label="Sharpening" value={sharpening} min={0} max={100} unit="%" resetValue={0} onChange={(value) => { setSharpening(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            </div>
            <div className="control-row control-row-2">
            </div>
            <button className="secondary compact" type="button" onClick={() => {
              setBrightness(0);
              setContrast(0);
              setSaturation(0);
              setHueShift(0);
              setHslSaturation(0);
              setLightness(0);
              setColorize(false);
              setGamma(100);
              setSmoothing(0);
              setSharpening(0);
              setState({ kind: "idle" });
            }}>Reset adjustments</button>
          </fieldset>
          </details>
          ))}
          {workspaceMode === "palette" ? (
          <>
          {workbenchPortal("palette", (
          <details
            className={`workbench-settings-section workbench-window${workbenchPaletteFloating ? ` workbench-section-floating workbench-palette-floating${workbenchPaletteFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : ""}`}
            {...workbenchWindowDragAttributes("palette")}
            data-workbench-window="palette"
            hidden={!workbenchWindowLayout("palette").visible}
            data-dock={workbenchWindowLayout("palette").dock}
            data-minimized={workbenchWindowLayout("palette").minimized ? "true" : "false"}
            open={workbenchWindowLayout("palette").open && !workbenchWindowLayout("palette").minimized}
            style={workbenchDockWindowStyle("palette", workbenchPaletteFloating ? { zIndex: workbenchWindowZIndex("palette") } : undefined)}
            onPointerDown={(event) => {
              if (workbenchPaletteFloating) {
                event.stopPropagation();
                bringWorkbenchWindowToFront("palette");
              }
            }}
            onFocusCapture={() => {
              if (workbenchPaletteFloating) bringWorkbenchWindowToFront("palette");
            }}
            onToggle={(event) => setWorkbenchWindowOpen("palette", event.currentTarget.open)}
          >
            <summary
              onPointerDown={(event) => startWorkbenchTitlebarDrag("palette", event)}
              onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("palette", event)}
            onClick={(event) => handleWorkbenchTitlebarClick("palette", event)}
            >
              <span>{isQl ? "QL palette" : isPmd ? "PMD 85 palette" : "ZX palette and attributes"}</span>
              {workbenchWindowActions("palette")}
              {workbenchPaletteFloating ? (
                <span
                  className="workbench-window-drag-handle"
                  role="button"
                  tabIndex={0}
                  aria-label="Move Palette window"
                  title="Drag to move Palette"
                  onPointerDown={(event) => startWorkbenchSectionDrag("palette", event)}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 32 : 8;
                    if (event.key === "ArrowLeft") setWorkbenchPaletteFloatingX((x) => Math.max(8, x - step));
                    if (event.key === "ArrowRight") setWorkbenchPaletteFloatingX((x) => x + step);
                    if (event.key === "ArrowUp") setWorkbenchPaletteFloatingY((y) => Math.max(8, y - step));
                    if (event.key === "ArrowDown") setWorkbenchPaletteFloatingY((y) => y + step);
                  }}
                >⠿</span>
              ) : null}
            </summary>
            {workbenchDockSplitHandle("palette")}
            {workbenchPaletteFloating ? (
              <div
                className="workbench-floating-resize-handle"
                role="button"
                tabIndex={0}
                aria-label="Resize Palette window"
                onPointerDown={(event) => startWorkbenchFloatingResize("palette", event)}
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 32 : 8;
                  if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("palette", step, 0);
                  if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("palette", -step, 0);
                  if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("palette", 0, step);
                  if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("palette", 0, -step);
                }}
              />
            ) : null}
          <fieldset id="settings-palette" className={`control-group palette-group${settingsSection === "palette" ? " settings-focused" : ""}`}>
            <legend className="visually-hidden">{isQl ? "QL palette" : isPmd ? "PMD 85 palette" : "ZX palette and attributes"}</legend>
            <div className="palette-attributes-grid">
            <section className="palette-subcard" aria-labelledby="palette-subcard-title">
              <h3 id="palette-subcard-title">Palette</h3>
              <p className="subcard-help">Select the colors available to each output screen.</p>
              <div className="palette-screen-grid">
                {paletteSelections.map((selection) => (
                  <section
                    className="palette-screen"
                    data-color-count={(effectivePaletteOptionsByScreen[selection.screenIndex] ??
                      effectivePaletteOptionsByScreen[0] ?? []).length}
                    key={selection.screenIndex}
                  >
                    <div className="palette-screen-heading">
                      <strong>Screen {selection.screenIndex + 1}</strong>
                      <span>{selection.enabledColorIds.length} selected</span>
                    </div>
                    {isZx ? (
                      <fieldset className="bright-control">
                        <legend>BRIGHT</legend>
                        <div className="segmented-control compact-segmented" role="radiogroup" aria-label={`Screen ${selection.screenIndex + 1} BRIGHT policy`}>
                          {(["auto", "on", "off"] as const).map((mode) => (
                            <label className="segmented-option" key={mode}>
                              <input
                                type="radio"
                                name={`screen-${selection.screenIndex}-bright`}
                                value={mode}
                                checked={(selection.brightMode ?? "auto") === mode}
                                onChange={() => setPaletteBrightMode(selection.screenIndex, mode)}
                              />
                              <span>{mode === "auto" ? "Auto" : mode === "on" ? "On" : "Off"}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ) : null}
                    <div
                      className="palette-options"
                      role="group"
                      aria-label={`Screen ${selection.screenIndex + 1} available colors`}
                    >
                      {(effectivePaletteOptionsByScreen[selection.screenIndex] ??
                        effectivePaletteOptionsByScreen[0] ??
                        []).map((option) => {
                          const selected = selection.enabledColorIds.includes(option.code);
                          return (
                            <button
                              className={`palette-option${selected ? " selected" : ""}`}
                              type="button"
                              key={option.code}
                              aria-label={`${selected ? "Remove" : "Add"} ${option.name} (${option.code}) from Screen ${selection.screenIndex + 1}`}
                              aria-pressed={selected}
                              title={`${option.name} (${option.code})`}
                              onClick={() => togglePaletteColor(selection.screenIndex, option.code)}
                            >
                              <span
                                className="palette-swatch"
                                style={{
                                  background: isZx && selection.brightMode === "auto"
                                    ? `linear-gradient(90deg, ${option.normal} 0 50%, ${option.bright} 50% 100%)`
                                    : isZx && selection.brightMode === "on"
                                      ? option.bright
                                      : option.normal,
                                }}
                                aria-hidden="true"
                              />
                            </button>
                          );
                        })}
                    </div>
                  </section>
                ))}
              </div>
              {paletteValid ? null : (
                <span className="field-error" id="palette-error">
                  Select at least one color for every screen.
                </span>
              )}
            </section>
            <section className={`attributes-subcard${isPmd ? " pmd-attributes-subcard" : ""}`} aria-labelledby="attributes-subcard-title">
              <h3 id="attributes-subcard-title">Attributes</h3>
            {targetModeId.includes("vertical-spatial") ? (
              <label className="check-control" title="Allow the optimizer to exchange the upper and lower physical rows in each mixed cell.">
                <input
                  type="checkbox"
                  checked={verticalSpatialSwapRows}
                  onChange={(event) => {
                    setVerticalSpatialSwapRows(event.target.checked);
                    setState({ kind: "idle" });
                  }}
                />
                <span>Swap physical row order</span>
              </label>
            ) : null}
          {isZx ? (
          <>
          <fieldset className="attribute-size-control">
            <legend>Size</legend>
            <div className="segmented-control attribute-size-options" role="radiogroup" aria-label="Attribute size">
              {([8, 4, 2, 1] as const).map((height) => (
                <label className="segmented-option" key={height}>
                  <input
                    type="radio"
                    name="attribute-size"
                    value={height}
                    checked={attributeHeight === height}
                    onChange={() => {
                      setAttributeHeight(height as AttributeHeight);
                      if (height < 4) setAttributeHaloVertical(0);
                      setState({ kind: "idle" });
                    }}
                  />
                  <span>8×{height}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <RangeNumberControl
            id="attribute-smoothing"
            label={attributeOptimizerId === "zx-guide-reference-halo-v2" ||
                attributeOptimizerId === "zx-guide-reference-rgb-halo-v3"
              ? "Halo influence"
              : "Attribute smoothing"}
            value={attributeOptimizerId === "zx-guide-reference-halo-v2" ||
                attributeOptimizerId === "zx-guide-reference-rgb-halo-v3"
              ? attributeHaloInfluence
              : attributeSmoothing}
            min={0}
            max={attributeOptimizerId === "zx-guide-reference-halo-v2" ||
                attributeOptimizerId === "zx-guide-reference-rgb-halo-v3"
              ? 400
              : 100}
            unit="%"
            disabled={dithering === "none"}
            onChange={(value) => {
              if (
                attributeOptimizerId === "zx-guide-reference-halo-v2" ||
                attributeOptimizerId === "zx-guide-reference-rgb-halo-v3"
              ) {
                setAttributeHaloInfluence(value);
              } else {
                setAttributeSmoothing(value);
              }
              setState({ kind: "idle" });
            }}
            onValidityChange={setSliderValidity}
          />
          <span className="control-help">
            Edge-aware pair selection for Ordered and Error diffusion.
          </span>
          <fieldset className="halo-controls">
            <legend>Attribute halo</legend>
            <fieldset className="halo-control">
              <legend>Horizontal</legend>
              <div className="segmented-control halo-options" role="radiogroup" aria-label="Horizontal halo">
                {([0, 1, 2] as const).map((radius) => (
                  <label className="segmented-option" key={radius}>
                    <input
                      type="radio"
                      name="horizontal-halo"
                      value={radius}
                      aria-label={`${radius} pixel${radius === 1 ? "" : "s"}`}
                      checked={attributeHaloHorizontal === radius}
                      disabled={dithering === "none"}
                      onChange={() => {
                        setAttributeHaloHorizontal(radius as AttributeHaloRadius);
                        setState({ kind: "idle" });
                      }}
                    />
                    <span>{radius}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="halo-control">
              <legend>Vertical</legend>
              <div className="segmented-control halo-options" role="radiogroup" aria-label="Vertical halo">
                {([0, 1, 2] as const).map((radius) => (
                  <label className="segmented-option" key={radius}>
                    <input
                      type="radio"
                      name="vertical-halo"
                      value={radius}
                      aria-label={`${radius} pixel${radius === 1 ? "" : "s"}`}
                      checked={(attributeHeight >= 4 ? attributeHaloVertical : 0) === radius}
                      disabled={dithering === "none" || attributeHeight < 4}
                      onChange={() => {
                        setAttributeHaloVertical(radius as AttributeHaloRadius);
                        setState({ kind: "idle" });
                      }}
                    />
                    <span>{radius}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </fieldset>
          </>
          ) : isPmd ? (
            <>
              <span className="control-help">
                Black is fixed. Each {targetModeId === "pmd85-colorace" ? "6×2" : "6×1"} hardware cell selects black plus one enabled foreground.
              </span>
              {image?.format === "pmd85-bin" ? (
                <label className="check-control">
                  <input
                    type="checkbox"
                    checked={pmd85GapPolicy === "zero"}
                    onChange={(event) => {
                      setPmd85GapPolicy(event.target.checked ? "zero" : "preserve-imported");
                      setState({ kind: "idle" });
                    }}
                  />
                  <span>Sanitize gaps (zero-fill on reconversion)</span>
                </label>
              ) : null}
            </>
          ) : null}
          {targetModeId === "zx48-mixed-256x192" ||
          targetModeId === "mode8-256x256" ||
          targetModeId === "mode4-512x256" ||
          targetModeId === "mode8-mode4-mixed-512x256" ? (
            <label>
              <span>Screen flicker suppression</span>
              <span>
                <input
                  type="checkbox"
                  checked={flickerSuppressionEffective === true}
                  disabled={paletteSelections.length !== 2 ||
                    (
                      targetModeId !== "mode8-mode4-mixed-512x256" &&
                      !paletteSelectionsMatch(paletteSelections[0]!, paletteSelections[1]!)
                    )}
                  onChange={(event) => {
                    setScreenFlickerSuppression(event.target.checked);
                    setState({ kind: "idle" });
                  }}
                />
                <span className="control-help">
                  {flickerSuppressionPolicyMismatch
                    ? `${screenFlickerSuppression ? "Requested suppression is inactive. " : ""}Different screen palette/BRIGHT policies affect the 50/50 Merged preview and prevent flicker suppression.`
                    : targetModeId === "mode8-mode4-mixed-512x256"
                    ? "Adapt the left/right Mode 4 pair order across stable regions."
                    : paletteSelections.length === 2 &&
                    paletteSelectionsMatch(paletteSelections[0]!, paletteSelections[1]!)
                    ? isQl
                      ? "Swap temporal endpoints at pixel level."
                      : "Swap temporal endpoints only between complete attribute cells."
                    : "Available only when both screen palettes and BRIGHT policies match."}
                </span>
              </span>
            </label>
          ) : null}
          {isZx && targetModeId === "zx48-mixed-256x192" ? (
            <label>
              <span>Mix attributes only</span>
              <span>
                <input
                  type="checkbox"
                  checked={zxMixedAttributesOnly}
                  onChange={(event) => {
                    setZxMixedAttributesOnly(event.target.checked);
                    setState({ kind: "idle" });
                  }}
                />
                <span className="control-help">
                  Shares bitmap pixels while optimizing INK, PAPER, and BRIGHT attributes independently. Merged shows their 50/50 RGB average, which may include colors neither screen displays alone.
                </span>
              </span>
            </label>
          ) : null}
          {isPmd ? (
            <label className="pmd-palette-calibration">
              <span>Palette calibration</span>
              <select
                value={pmd85PaletteCalibrationId}
                onChange={(event) => void changePmd85Calibration(event.target.value)}
              >
                {selectedModePalette?.base_calibration_id === undefined ? null : (
                  <option value={selectedModePalette.base_calibration_id}>
                    {selectedModePalette.base_calibration_id === "pure-rgb"
                      ? "Pure RGB"
                      : selectedModePalette.base_calibration_id === "neutral-white"
                        ? "Neutral white/silver"
                        : "Emulator-soft"}
                  </option>
                )}
                {selectedModePalette?.calibrations?.map((calibration) => (
                  <option key={calibration.id} value={calibration.id}>{calibration.name}</option>
                ))}
              </select>
            </label>
          ) : null}
            </section>
            </div>
          </fieldset>
          </details>
          ))}
          {workbenchPortal("paint-colors", (() => {
            const paintLayout = workbenchWindowLayout("paint-colors");
            const paintOrientation = paintLayout.contentOrientation ?? "rows";
            const paintFrame = displayedResult?.frames[Math.min(bitmapEditorResultFrameIndex, Math.max(0, (displayedResult?.frames.length ?? 1) - 1))];
            const paintInput = displayedResult === null || paintFrame === undefined
              ? null
              : resultFrameInput(displayedResult, Math.min(bitmapEditorResultFrameIndex, displayedResult.frames.length - 1));
            const paintNativePalette = displayedResult?.platformId === "zx-spectrum" || paintInput === null
              ? []
              : nativePaletteForResult(paintInput);
            const pickedAttribute = bitmapEditorPickedCell?.attribute ?? 0;
            const selectedBright = bitmapEditorBrightPolicy ?? ((pickedAttribute & 0x40) !== 0);
            const paintColor = (index: number): string => {
              if (displayedResult?.platformId === "zx-spectrum") {
                const color = ZX_BASE_COLORS[index];
                return color?.[selectedBright ? "bright" : "normal"] ?? "#000000";
              }
              const color = paintNativePalette.find((candidate) => candidate.index === index);
              return color === undefined ? "#000000" : `rgb(${color.r} ${color.g} ${color.b})`;
            };
            const policyButton = (label: string, value: boolean | null, selected: boolean | null, update: (next: boolean | null) => void) => (
              <button className={`paint-colors-policy${selected === value ? " selected" : ""}${value === null ? " transparent" : ""}`} type="button" aria-label={`${label}: ${value === null ? "keep current" : value ? "set" : "reset"}`} title={`${label}: ${value === null ? "keep current" : value ? "set" : "reset"}`} aria-pressed={selected === value} onClick={() => update(value)}>
                {value === null ? <span className="bitmap-editor-transparent-swatch" aria-hidden="true" /> : value ? "●" : "○"}
              </button>
            );
            return (
              <details
                className={`workbench-settings-section workbench-window paint-colors-window${workbenchPaintColorsFloating ? " workbench-section-floating" : ""}`}
                {...workbenchWindowDragAttributes("paint-colors")}
                data-workbench-window="paint-colors"
                data-dock={paintLayout.dock}
                data-minimized={paintLayout.minimized ? "true" : "false"}
                data-orientation={paintOrientation}
                hidden={!paintLayout.visible || bitmapEditorActiveSide === null}
                open={paintLayout.open && !paintLayout.minimized}
                style={workbenchDockWindowStyle("paint-colors", workbenchPaintColorsFloating ? {
                  position: "absolute",
                  top: paintLayout.y,
                  left: paintLayout.x,
                  width: paintLayout.width,
                  height: paintLayout.height,
                  zIndex: workbenchWindowZIndex("paint-colors"),
                } : undefined)}
                onPointerDown={(event) => { if (workbenchPaintColorsFloating) { event.stopPropagation(); bringWorkbenchWindowToFront("paint-colors"); } }}
                onFocusCapture={() => { if (workbenchPaintColorsFloating) bringWorkbenchWindowToFront("paint-colors"); }}
                onToggle={(event) => setWorkbenchWindowOpen("paint-colors", event.currentTarget.open)}
              >
                <summary onPointerDown={(event) => startWorkbenchTitlebarDrag("paint-colors", event)} onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("paint-colors", event)} onClick={(event) => handleWorkbenchTitlebarClick("paint-colors", event)}>
                  <span>Paint colors</span>
                  {displayedResult?.platformId === "zx-spectrum" ? (
                    <button
                      className="paint-colors-orientation-control"
                      type="button"
                      role="switch"
                      aria-label="Paint colors orientation"
                      aria-checked={paintOrientation === "columns"}
                      title={`Color layout: ${paintOrientation === "columns" ? "Vertical" : "Horizontal"}`}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        updateWorkbenchWindowLayout("paint-colors", (layout) => ({
                          ...layout,
                          contentOrientation: layout.contentOrientation === "columns" ? "rows" : "columns",
                        }));
                      }}
                    >
                      <span className="paint-colors-orientation-switch" aria-hidden="true">
                        <span className="paint-colors-orientation-knob" aria-hidden="true" />
                      </span>
                      <span className="paint-colors-orientation-label">{paintOrientation === "columns" ? "Vertical" : "Horizontal"}</span>
                    </button>
                  ) : null}
                  {workbenchWindowActions("paint-colors")}
                  {workbenchPaintColorsFloating ? <span className="workbench-window-drag-handle" role="button" tabIndex={0} aria-label="Move Paint colors window" title="Drag to move Paint colors" onPointerDown={(event) => startWorkbenchSectionDrag("paint-colors", event)} onClick={(event) => { event.preventDefault(); event.stopPropagation(); }} onKeyDown={(event) => {
                    const step = event.shiftKey ? 32 : 8;
                    if (event.key.startsWith("Arrow")) event.preventDefault();
                    updateWorkbenchWindowLayout("paint-colors", (layout) => ({ ...layout, x: Math.max(8, layout.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0)), y: Math.max(8, layout.y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0)) }));
                  }}>⠿</span> : null}
                </summary>
                {workbenchDockSplitHandle("paint-colors")}
                {workbenchPaintColorsFloating ? <div className="workbench-floating-resize-handle" role="button" tabIndex={0} aria-label="Resize Paint colors window" onPointerDown={(event) => startWorkbenchFloatingResize("paint-colors", event)} onKeyDown={(event) => {
                  const step = event.shiftKey ? 32 : 8;
                  if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("paint-colors", step, 0);
                  if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("paint-colors", -step, 0);
                  if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("paint-colors", 0, step);
                  if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("paint-colors", 0, -step);
                }} /> : null}
                <div className={`paint-colors-content paint-colors-content-${paintOrientation}`}>
                  {displayedResult?.platformId === "zx-spectrum" ? <>
                    {(["ink", "paper"] as const).map((kind) => {
                      const active = kind === "ink" ? bitmapEditorInkColor : bitmapEditorPaperColor;
                      const update = kind === "ink" ? setBitmapEditorInkColor : setBitmapEditorPaperColor;
                      return <div className="paint-colors-role-row" data-color-role={kind} key={kind}>
                        <strong aria-hidden="true">{kind === "ink" ? "I" : "P"}</strong>
                        <div className="paint-colors-swatches" role="group" aria-label={`${kind.toUpperCase()} paint color`}>
                          <button className={`bitmap-editor-attribute-icon${active === null ? " selected" : ""}`} type="button" title={`Keep current ${kind.toUpperCase()}`} aria-label={`Keep current ${kind.toUpperCase()}`} aria-pressed={active === null} onClick={() => update(null)}><span className="bitmap-editor-transparent-swatch" aria-hidden="true" /></button>
                          {ZX_BASE_COLORS.map((color) => <button className={`bitmap-editor-attribute-color${active === color.code ? " selected" : ""}`} type="button" key={color.code} title={`Set ${kind.toUpperCase()} to ${color.name}`} aria-label={`Set ${kind.toUpperCase()} to ${color.name}`} aria-pressed={active === color.code} onClick={() => update(color.code)}><span style={{ background: paintColor(color.code) }} /></button>)}
                        </div>
                        <div className="paint-colors-flag" aria-label={kind === "ink" ? "BRIGHT" : "FLASH"}>
                          <strong aria-hidden="true">{kind === "ink" ? "☀" : "ϟ"}</strong>
                          {kind === "ink"
                            ? <>{policyButton("BRIGHT", null, bitmapEditorBrightPolicy, setBitmapEditorBrightPolicy)}{policyButton("BRIGHT", true, bitmapEditorBrightPolicy, setBitmapEditorBrightPolicy)}{policyButton("BRIGHT", false, bitmapEditorBrightPolicy, setBitmapEditorBrightPolicy)}</>
                            : <>{policyButton("FLASH", null, bitmapEditorFlashPolicy, setBitmapEditorFlashPolicy)}{policyButton("FLASH", true, bitmapEditorFlashPolicy, setBitmapEditorFlashPolicy)}{policyButton("FLASH", false, bitmapEditorFlashPolicy, setBitmapEditorFlashPolicy)}</>}
                        </div>
                      </div>;
                    })}
                  </> : <div className="paint-colors-row" data-color-role="palette">
                    <strong aria-hidden="true">C</strong>
                    <div className="paint-colors-swatches" role="group" aria-label="Native paint colors">
                      {paintNativePalette.map((color) => <button className={`bitmap-editor-attribute-color${bitmapEditorResultPaletteIndex === color.index ? " selected" : ""}`} type="button" key={color.index} title={`Use palette color ${color.index}`} aria-label={`Use palette color ${color.index}`} aria-pressed={bitmapEditorResultPaletteIndex === color.index} onClick={() => setBitmapEditorResultPaletteIndex(color.index)}><span style={{ background: `rgb(${color.r} ${color.g} ${color.b})` }} /></button>)}
                    </div>
                  </div>}
                  <button className={`paint-colors-picker${bitmapEditorColorPickerActive ? " active" : ""}`} type="button" disabled={bitmapEditorTarget !== "result" || displayedResult?.platformId !== "zx-spectrum"} aria-label="Pick INK, PAPER, BRIGHT, and FLASH from the result" title="Pick attributes from the result" aria-pressed={bitmapEditorColorPickerActive} onClick={toggleBitmapEditorColorPicker}>⌖</button>
                </div>
              </details>
            );
          })())}
          {workbenchPortal("dithering", (
          <details
            className={`workbench-settings-section workbench-window${workbenchDitheringFloating ? ` workbench-section-floating workbench-dithering-floating${workbenchDitheringFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : ""}`}
            {...workbenchWindowDragAttributes("dithering")}
            data-workbench-window="dithering"
            hidden={!workbenchWindowLayout("dithering").visible}
            data-dock={workbenchWindowLayout("dithering").dock}
            data-minimized={workbenchWindowLayout("dithering").minimized ? "true" : "false"}
            open={workbenchWindowLayout("dithering").open && !workbenchWindowLayout("dithering").minimized}
            style={workbenchDockWindowStyle("dithering", workbenchDitheringFloating ? { zIndex: workbenchWindowZIndex("dithering") } : undefined)}
            onPointerDown={(event) => {
              if (workbenchDitheringFloating) {
                event.stopPropagation();
                bringWorkbenchWindowToFront("dithering");
              }
            }}
            onFocusCapture={() => {
              if (workbenchDitheringFloating) bringWorkbenchWindowToFront("dithering");
            }}
            onToggle={(event) => setWorkbenchWindowOpen("dithering", event.currentTarget.open)}
          >
            <summary
            onPointerDown={(event) => {
              startWorkbenchTitlebarDrag("dithering", event);
            }}
            onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("dithering", event)}
            onClick={(event) => handleWorkbenchTitlebarClick("dithering", event)}
            >
              <span>Dithering</span>
              {workbenchWindowActions("dithering")}
              {workbenchDitheringFloating ? (
                <span
                  className="workbench-window-drag-handle"
                  role="button"
                  tabIndex={0}
                  aria-label="Move Dithering window"
                  title="Drag to move Dithering"
                  onPointerDown={(event) => startWorkbenchSectionDrag("dithering", event)}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 32 : 8;
                    if (event.key === "ArrowLeft") setWorkbenchDitheringFloatingX((x) => Math.max(8, x - step));
                    if (event.key === "ArrowRight") setWorkbenchDitheringFloatingX((x) => x + step);
                    if (event.key === "ArrowUp") setWorkbenchDitheringFloatingY((y) => Math.max(8, y - step));
                    if (event.key === "ArrowDown") setWorkbenchDitheringFloatingY((y) => y + step);
                  }}
                >⠿</span>
              ) : null}
            </summary>
            {workbenchDockSplitHandle("dithering")}
            {workbenchDitheringFloating ? (
              <div
                className="workbench-floating-resize-handle"
                role="button"
                tabIndex={0}
                aria-label="Resize Dithering window"
                onPointerDown={(event) => startWorkbenchFloatingResize("dithering", event)}
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 32 : 8;
                  if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("dithering", step, 0);
                  if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("dithering", -step, 0);
                  if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("dithering", 0, step);
                  if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("dithering", 0, -step);
                }}
              />
            ) : null}
          <fieldset id="settings-dithering" className={`control-group dithering-group${settingsSection === "dithering" ? " settings-focused" : ""}`}>
            <legend className="visually-hidden">Dithering</legend>
          <details className="engine-controls dithering-wide">
            <summary>Advanced conversion engines</summary>
            {isZx ? (
              <label>
                <span>Attribute optimizer</span>
                <select
                  value={attributeOptimizerId}
                  onChange={(event) => {
                    const id = event.target.value as AttributeOptimizerId;
                    setAttributeOptimizerId(id);
                    if (id === "zx-block-dbs-global-v1") {
                      setDitherEngineId("pattern-legal-mask-dbs-v1");
                      setDithering("ordered");
                    } else if (
                      id === "zx-structured-global-v1" ||
                      id === "zx-structured-global-v2" ||
                      id === "zx-structured-global-v3" ||
                      id === "zx-structured-global-v4"
                    ) {
                      const isVersion4 = id === "zx-structured-global-v4";
                      const isVersion3 = id === "zx-structured-global-v3";
                      const isVersion2 = id === "zx-structured-global-v2";
                      setDitherEngineId(
                        isVersion4
                          ? "ordered-cell-pattern-v4"
                          : isVersion3
                          ? "ordered-cell-pattern-v3"
                          : isVersion2
                            ? "ordered-cell-pattern-v2"
                            : "ordered-cell-pattern-v1",
                      );
                      setDithering("ordered");
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
                      ditherEngineId === "ordered-cell-pattern-v1" ||
                      ditherEngineId === "ordered-cell-pattern-v2" ||
                      ditherEngineId === "ordered-cell-pattern-v3" ||
                      ditherEngineId === "ordered-cell-pattern-v4" ||
                      ditherEngineId === "pattern-legal-mask-dbs-v1"
                    ) {
                      setDitherEngineId(latestDitherEngineForMethod(dithering));
                    }
                    setState({ kind: "idle" });
                  }}
                >
                  {(() => {
                    const compatible = ATTRIBUTE_OPTIMIZERS.filter((engine) =>
                      isAttributeOptimizerAvailableForTarget("zx-spectrum", targetModeId, engine.id) &&
                      (targetModeId !== "zx48-mixed-256x192" || !("family" in engine)) &&
                      DITHER_ENGINES.some((ditherEngine) =>
                        isDitherEngineAvailableForSelection(
                          "zx-spectrum",
                          targetModeId,
                          engine.id,
                          ditherEngine.id,
                        ),
                      )
                    );
                    const recommended = new Set<AttributeOptimizerId>([
                      "zx-source-cell-v1", "zx-guide-reference-halo-v1",
                    ]);
                    return <>
                      <optgroup label="Recommended">
                        {compatible.filter((engine) => recommended.has(engine.id)).map((engine) =>
                          <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                      </optgroup>
                      <optgroup label="Alternatives and historical engines">
                        {compatible.filter((engine) =>
                          !recommended.has(engine.id) && engine.lifecycle !== "experimental"
                        ).map((engine) =>
                          <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                      </optgroup>
                      <optgroup label="Experimental engines">
                        {compatible.filter((engine) => engine.lifecycle === "experimental").map((engine) =>
                          <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                      </optgroup>
                    </>;
                  })()}
                </select>
              </label>
            ) : null}
          </details>
          {isQl && targetModeId === "mode8-mode4-mixed-512x256" ? (
            <label className="dithering-wide">
              <span>Mixed optimizer</span>
              <select
                value={qlMixedOptimizerId}
                onChange={(event) => {
                  setQlMixedOptimizerId(
                    event.target.value as QlMixedOptimizerId,
                  );
                  setState({ kind: "idle" });
                }}
              >
                <option value="ql-mixed-average-v1">Average v1 · legacy</option>
                <option value="ql-mixed-low-perception-v2">Low perception v2</option>
                <option value="ql-mixed-high-detail-v2">High detail v2</option>
                <option value="ql-mixed-balanced-v2">Balanced v2 · default</option>
              </select>
            </label>
          ) : null}
          <fieldset className="dithering-method-control dithering-wide">
            <legend>Dithering method</legend>
            <div className="segmented-control" role="radiogroup" aria-label="Dithering method">
              {([
                ["none", "No dithering"],
                ["ordered", "Ordered"],
                ["error-diffusion", "Error diffusion"],
              ] as const).map(([value, label]) => (
                <label className="segmented-option" key={value}>
                  <input
                    type="radio"
                    name="dithering-method"
                    value={value}
                    checked={dithering === value}
                    onChange={() => switchDithering(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {dithering === "error-diffusion" ? (
            <label className="dithering-wide">
              <span>Dither algorithm</span>
              <select
                value={ditherEngineId}
                onChange={(event) => selectDitherEngine(event.target.value as DitherEngineId)}
              >
                {(() => {
                  const compatible = DITHER_ENGINES.filter((engine) =>
                    engine.method === "error-diffusion" &&
                    isDitherEngineAvailableForSelection(
                      selectedPlatformId,
                      targetModeId,
                      attributeOptimizerId,
                      engine.id,
                    )
                  );
                  const recommended = new Set<DitherEngineId>([
                    "error-diffusion-decorrelated-v3",
                    "error-diffusion-atkinson-v1",
                    "error-diffusion-checker-artistic-v1",
                  ]);
                  return <>
                    <optgroup label="Recommended">
                      {compatible.filter((engine) => recommended.has(engine.id)).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                    <optgroup label="Alternatives and historical engines">
                      {compatible.filter((engine) =>
                        !recommended.has(engine.id) &&
                        ditherEngineSelectionGroupForTarget(engine.id, targetModeId) !== "to-be-hidden" &&
                        engine.lifecycle !== "experimental"
                      ).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                    <optgroup label="Experimental engines">
                      {compatible.filter((engine) =>
                        !recommended.has(engine.id) &&
                        ditherEngineSelectionGroupForTarget(engine.id, targetModeId) !== "to-be-hidden" &&
                        engine.lifecycle === "experimental"
                      ).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                    <optgroup label="To be hidden">
                      {compatible.filter((engine) =>
                        ditherEngineSelectionGroupForTarget(engine.id, targetModeId) === "to-be-hidden"
                      ).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                  </>;
                })()}
              </select>
            </label>
          ) : null}
          {dithering !== "none" && dithering !== "error-diffusion" ? (
            <label className="dithering-wide">
              <span>Dither engine</span>
              <select
                value={ditherEngineId}
                onChange={(event) => selectDitherEngine(event.target.value as DitherEngineId)}
                title={DITHER_ENGINES.find((engine) => engine.id === ditherEngineId)?.name}
              >
                {(() => {
                  const compatible = DITHER_ENGINES.filter((engine) =>
                    engine.method === "ordered" &&
                    engine.platforms.includes(selectedPlatformId as never) &&
                    (selectedPlatformId === "sinclair-ql" ||
                      isCompatibleEnginePair(attributeOptimizerId, engine.id)) &&
                    (engine.targetModeIds === undefined || engine.targetModeIds.includes(targetModeId)) &&
                    (targetModeId !== "zx48-mixed-256x192" || !("family" in engine))
                  );
                  const recommended = new Set<DitherEngineId>([
                    "ordered-strict-matrix-v6",
                    "ordered-mixed-phase-stable-v8",
                  ]);
                  return <>
                    <optgroup label="Recommended">
                      {compatible.filter((engine) => recommended.has(engine.id)).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                    <optgroup label="Alternatives and historical engines">
                      {compatible.filter((engine) =>
                        !recommended.has(engine.id) &&
                        ditherEngineSelectionGroupForTarget(engine.id, targetModeId) !== "to-be-hidden" &&
                        engine.lifecycle !== "experimental"
                      ).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                    <optgroup label="Experimental engines">
                      {compatible.filter((engine) =>
                        ditherEngineSelectionGroupForTarget(engine.id, targetModeId) !== "to-be-hidden" &&
                        engine.lifecycle === "experimental"
                      ).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                    <optgroup label="To be hidden">
                      {compatible.filter((engine) =>
                        ditherEngineSelectionGroupForTarget(engine.id, targetModeId) === "to-be-hidden"
                      ).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                  </>;
                })()}
              </select>
            </label>
          ) : null}
          {(ditherEngineId === "artistic-ordered-hybrid-v1" ||
            ditherEngineId === "artistic-ordered-tone-safe-v2" ||
            ditherEngineId === "artistic-chessboard-smooth-v1") ? (
            <label>
              <span>Pattern preference</span>
              <select value={artisticPattern} onChange={(event) => { setArtisticPattern(event.target.value as NonNullable<ConversionSettings["artisticPattern"]>); setState({ kind: "idle" }); }}>
                <option value="auto">Auto</option>
                <option value="checkerboard">Checkerboard</option>
                <option value="horizontal">Horizontal</option>
                <option value="vertical">Vertical</option>
              </select>
              {attributeHeight === 1 ? <small>8×1 cells use row-local alternating motifs.</small> : null}
            </label>
          ) : null}
          {dithering === "ordered" &&
            ditherEngineId !== "artistic-ordered-hybrid-v1" &&
            ditherEngineId !== "artistic-ordered-tone-safe-v2" ? (
            <label>
              <span>Ordered matrix</span>
              <select value={orderedMatrix} onChange={(event) => {
                const nextMatrix = event.target.value as OrderedMatrixId;
                setOrderedMatrix(nextMatrix);
                syncMatrixEditorFromSelection(nextMatrix);
                setState({ kind: "idle" });
              }}>
                {(DITHER_ENGINES.find((engine) => engine.id === ditherEngineId)?.orderedMatrixIds ??
                  ORDERED_MATRIX_IDS.slice(0, 4)).map((matrixId) => (
                  <option key={matrixId} value={matrixId}>{orderedMatrixLabel(matrixId)}</option>
                ))}
              </select>
            </label>
          ) : null}
          {ditherEngineId === "dither-composer-v1" ? (
            <div className="dithering-composer-grid" aria-label="Dither composer settings">
              <div className="control-row control-row-2">
              <label>
                <span className="dithering-composer-one-line-label">Dithering · Composer&nbsp;pattern</span>
                <select
                  value={composer.patternId}
                  onChange={(event) => {
                    const nextPatternId = event.target.value as ConversionSettings["composer"]["patternId"];
                    setComposer((current) => ({ ...current, patternId: nextPatternId }));
                    syncMatrixEditorFromSelection(nextPatternId);
                    setState({ kind: "idle" });
                  }}
                >
                  <optgroup label="Built-in matrices">
                    {ORDERED_MATRIX_IDS.map((matrixId) => (
                      <option key={matrixId} value={matrixId}>{orderedMatrixLabel(matrixId)}</option>
                    ))}
                  </optgroup>
                  {customOrderedMatrices.length > 0 ? (
                    <optgroup label="Custom matrices">
                      {customOrderedMatrices.map((matrix) => (
                        <option key={matrix.id} value={matrix.id}>{matrix.id}</option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              <label>
                <span className="dithering-composer-one-line-label">Kernel · Composer&nbsp;propagation</span>
                <select
                  value={composer.propagationId}
                  onChange={(event) => {
                    const nextPropagationId = event.target.value as ConversionSettings["composer"]["propagationId"];
                    setComposer((current) => ({ ...current, propagationId: nextPropagationId }));
                    syncKernelEditorFromSelection(nextPropagationId);
                    setState({ kind: "idle" });
                  }}
                >
                  <optgroup label="Built-in propagation">
                    {BUILT_IN_COMPOSER_PROPAGATION_IDS.map((id) => (
                      <option key={id} value={id}>{composerPropagationLabel(id)}</option>
                    ))}
                  </optgroup>
                  {customDiffusionKernels.length > 0 ? (
                    <optgroup label="Custom kernels">
                      {customDiffusionKernels.map((kernel) => (
                        <option key={kernel.id} value={kernel.id}>{kernel.id}</option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              </div>
              <div className="control-row control-row-2">
              <label>
                <span>Composer diffusion mix</span>
                <span className="control-cell-body">
                  <select
                    value={String(composer.mixWeight)}
                    onChange={(event) => {
                      setComposer((current) => ({ ...current, mixWeight: Number(event.target.value) }));
                      setState({ kind: "idle" });
                    }}
                  >
                    {composerMixOptions(composer.mixWeight).map((option) => (
                      <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>
                    ))}
                  </select>
                  <small>0% uses the pattern guide only; 100% uses diffusion only.</small>
                </span>
              </label>
              <label>
                <span>Carrier mode</span>
                <select
                  value={composer.carrierMode}
                  onChange={(event) => {
                    setComposer((current) => ({ ...current, carrierMode: event.target.value as ConversionSettings["composer"]["carrierMode"] }));
                    setState({ kind: "idle" });
                  }}
                >
                  <option value="off">Off</option>
                  <option value="protected-checker">Protected checker</option>
                  <option value="adaptive">Adaptive</option>
                </select>
              </label>
              </div>
              <div className="control-row control-row-2">
              <label>
                <span>Custom matrix dimensions (width × height)</span>
                <div className="dithering-pair-fields dithering-composer-dimensions-fields">
                  <input aria-label="Custom matrix width" type="number" min="1" max="8" step="1" value={customMatrixWidthEntry} onChange={(event) => setCustomMatrixWidthEntry(event.target.value)} />
                  <input aria-label="Custom matrix height" type="number" min="1" max="8" step="1" value={customMatrixHeightEntry} onChange={(event) => setCustomMatrixHeightEntry(event.target.value)} />
                </div>
              </label>
              <div className="dithering-composer-spacer" aria-hidden="true" />
              </div>
              <div className="control-row control-row-2">
              <label>
                <span>Custom matrix ranks</span>
                <span className="control-cell-body">
                  <textarea
                    className="dithering-composer-editor"
                    rows={4}
                    value={customMatrixValuesEntry}
                    onChange={(event) => setCustomMatrixValuesEntry(event.target.value)}
                  />
                  <small>Ranks may repeat, but each distinct rank must occur equally often.</small>
                </span>
              </label>
              <label>
                <span>Custom kernel entries</span>
                <span className="control-cell-body">
                  <textarea
                    className="dithering-composer-editor"
                    rows={4}
                    value={customKernelEntryText}
                    onChange={(event) => setCustomKernelEntryText(event.target.value)}
                  />
                  <small>One row per entry: dx dy weight</small>
                </span>
              </label>
              </div>
              <div className="control-row control-row-2 control-row-actions">
              <div className="dithering-composer-save-row" role="group" aria-label="Custom matrix actions">
                <button
                  className="secondary compact"
                  type="button"
                  onClick={() => {
                    try {
                      const width = Number.parseInt(customMatrixWidthEntry, 10);
                      const height = Number.parseInt(customMatrixHeightEntry, 10);
                      const values = parseMatrixValues(customMatrixValuesEntry);
                      const definition = defineCustomOrderedMatrix({ width, height, values });
                      setCustomOrderedMatrices((current) => {
                        const next = current.filter((matrix) => matrix.id !== definition.id);
                        return [...next, definition];
                      });
                      setComposer((current) => ({ ...current, patternId: definition.id }));
                      setCustomPatternError(null);
                      setState({ kind: "idle" });
                    } catch (error: unknown) {
                      setCustomPatternError(error instanceof Error ? error.message : "Invalid custom matrix.");
                    }
                  }}
                >Save matrix</button>
                <button
                  className="secondary compact destructive-action"
                  type="button"
                  disabled={!composer.patternId.startsWith("custom-ordered-")}
                  onClick={() => {
                    const matrixId = composer.patternId;
                    if (!matrixId.startsWith("custom-ordered-")) return;
                    setCustomOrderedMatrices((current) => current.filter((matrix) => matrix.id !== matrixId));
                    setComposer((current) => ({ ...current, patternId: "bayer-4x4" }));
                    syncMatrixEditorFromSelection("bayer-4x4");
                    setCustomPatternError(null);
                    setState({ kind: "idle" });
                  }}
                >Delete matrix</button>
              </div>
              <div className="dithering-composer-save-row" role="group" aria-label="Custom kernel actions">
                <button
                  className="secondary compact"
                  type="button"
                  onClick={() => {
                    try {
                      const entries = parseKernelEntries(customKernelEntryText);
                      const definition = defineCustomDiffusionKernel(entries);
                      setCustomDiffusionKernels((current) => {
                        const next = current.filter((kernel) => kernel.id !== definition.id);
                        return [...next, definition];
                      });
                      setComposer((current) => ({ ...current, propagationId: definition.id }));
                      setCustomPatternError(null);
                      setState({ kind: "idle" });
                    } catch (error: unknown) {
                      setCustomPatternError(error instanceof Error ? error.message : "Invalid custom kernel.");
                    }
                  }}
                >Save kernel</button>
                <button
                  className="secondary compact destructive-action"
                  type="button"
                  disabled={!composer.propagationId.startsWith("custom-diffusion-")}
                  onClick={() => {
                    const kernelId = composer.propagationId;
                    if (!kernelId.startsWith("custom-diffusion-")) return;
                    setCustomDiffusionKernels((current) => current.filter((kernel) => kernel.id !== kernelId));
                    setComposer((current) => ({ ...current, propagationId: "none" }));
                    syncKernelEditorFromSelection("none");
                    setCustomPatternError(null);
                    setState({ kind: "idle" });
                  }}
                >Delete kernel</button>
              </div>
              </div>
              {customPatternError === null ? null : <span className="field-error dithering-composer-error">{customPatternError}</span>}
            </div>
          ) : null}
          {dithering === "error-diffusion" ? (
            <div className="dithering-wide dithering-row dithering-row-paired control-row control-row-2">
              <div className="dithering-parameter">
                <label>
                  <span>Dithering amount</span>
                  <span className="filter-inputs">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={amountValid ? amount : 0}
                      aria-label="Dithering amount slider"
                      onInput={(event) => { setAmountEntry(event.currentTarget.value); setState({ kind: "idle" }); }}
                    />
                    <span className="range-number-entry">
                      <input
                        className={amountValid ? undefined : "invalid"}
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={amountEntry}
                        aria-label="Dithering amount percentage"
                        aria-invalid={!amountValid}
                        aria-describedby={amountValid ? undefined : "amount-error"}
                        onChange={(event) => { setAmountEntry(event.target.value); setState({ kind: "idle" }); }}
                      />
                      <span className="range-unit" aria-hidden="true">%</span>
                    </span>
                  </span>
                </label>
                {amountValid ? null : <span className="field-error" id="amount-error">Invalid value</span>}
              </div>
              <div
                className="dithering-parameter"
                title="Deterministically breaks repeating Error-diffusion patterns."
              >
                <RangeNumberControl
                  id="error-randomization"
                  label="Error randomization"
                  value={errorDiffusionRandomization}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(value) => {
                    setErrorDiffusionRandomization(value);
                    setState({ kind: "idle" });
                  }}
                  onValidityChange={setSliderValidity}
                />
                <span className="control-help">
                  Deterministically breaks repeating Error-diffusion patterns.
                </span>
              </div>
            </div>
          ) : dithering !== "none" ? (
            <fieldset className="amount-control dithering-wide">
              <legend>Dithering amount</legend>
              <div className="amount-inputs">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={amountValid ? amount : 0}
                  aria-label="Dithering amount slider"
                  onInput={(event) => { setAmountEntry(event.currentTarget.value); setState({ kind: "idle" }); }}
                />
                <label className="percentage-entry">
                  <span className="visually-hidden">Dithering amount percentage</span>
                  <input
                    className={amountValid ? undefined : "invalid"}
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={amountEntry}
                    aria-invalid={!amountValid}
                    aria-describedby={amountValid ? undefined : "amount-error"}
                    onChange={(event) => { setAmountEntry(event.target.value); setState({ kind: "idle" }); }}
                  />
                  <span aria-hidden="true">%</span>
                </label>
              </div>
              {amountValid ? null : <span className="field-error" id="amount-error">Invalid value</span>}
            </fieldset>
          ) : null}
          {(ditherEngineId === "error-diffusion-phase-balanced-v3" ||
            ditherEngineId === "error-diffusion-phase-balanced-checker-v3-1" ||
            ditherEngineId === "error-diffusion-phase-balanced-checker-v3-2" ||
            ditherEngineId === "error-diffusion-phase-balanced-checker-v3-3" ||
            ditherEngineId === "error-diffusion-checker-phase-v4" ||
            ditherEngineId === "error-diffusion-checker-phase-v4-4" ||
            ditherEngineId === "error-diffusion-checker-artistic-v1" ||
            ditherEngineId === "error-diffusion-checker-phase-v4-5" ||
            ditherEngineId === "error-diffusion-checker-phase-v4-5-1" ||
            ditherEngineId === "error-diffusion-checker-phase-v4-1" ||
            ditherEngineId === "error-diffusion-checker-phase-v4-2" ||
            ditherEngineId === "error-diffusion-checker-phase-v4-3" ||
            ditherEngineId === "error-diffusion-checker-phase-v5" ||
            ditherEngineId === "error-diffusion-matrix-guided-v1") || (
            isQl &&
            targetModeId === "mode8-mode4-mixed-512x256" &&
            ditherEngineId === "artistic-ordered-hybrid-v1"
          ) ? (
            <div className="dithering-row">
              {(ditherEngineId === "error-diffusion-phase-balanced-v3" ||
                ditherEngineId === "error-diffusion-phase-balanced-checker-v3-1" ||
                ditherEngineId === "error-diffusion-phase-balanced-checker-v3-2" ||
                ditherEngineId === "error-diffusion-phase-balanced-checker-v3-3" ||
                ditherEngineId === "error-diffusion-checker-phase-v4" ||
                ditherEngineId === "error-diffusion-checker-phase-v4-4" ||
                ditherEngineId === "error-diffusion-checker-artistic-v1" ||
                ditherEngineId === "error-diffusion-checker-phase-v4-5" ||
                ditherEngineId === "error-diffusion-checker-phase-v4-5-1" ||
                ditherEngineId === "error-diffusion-checker-phase-v4-1" ||
                ditherEngineId === "error-diffusion-checker-phase-v4-2" ||
                ditherEngineId === "error-diffusion-checker-phase-v4-3" ||
                ditherEngineId === "error-diffusion-checker-phase-v5" ||
                ditherEngineId === "error-diffusion-matrix-guided-v1" ||
                (isQl &&
                  targetModeId === "mode8-mode4-mixed-512x256" &&
                  ditherEngineId === "artistic-ordered-hybrid-v1")) ? (
                <div
                  className="dithering-parameter"
                    title="Reduces vertical diffusion runs and favors balanced alternating 2×2 placement; v3.1 adds local placement, v3.2 integrates checker decisions into v3 propagation, v3.3 reorients only true 50% checker blocks, v4.4 adds a checker carrier, v4.5 adaptively selects checker or dispersed 4×4 carriers, and v4.5.1 uses coverage-preserving atomic 2×2 color-pair correction to reduce spikes without isolated pixel flips. At 0%, output matches Projected unrestricted v2."
                >
                  <RangeNumberControl
                    id="error-line-suppression"
                    label="Line suppression"
                    value={errorDiffusionLineSuppression}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={(value) => {
                      setErrorDiffusionLineSuppression(value);
                      setState({ kind: "idle" });
                    }}
                    onValidityChange={setSliderValidity}
                  />
                  <span className="control-help">
                    Reduces vertical diffusion runs while retaining short 2×1 transitions. v3.1 applies local placement after v3; v3.2 integrates coverage-preserving 2×2 checker decisions into v3 propagation; v3.3 only reorients existing 50% checker blocks; v4.4 uses an artistic checker carrier as a conservative v3 tie-breaker; v4.5 adaptively selects stable checker or dispersed 4×4 carrier regions, while v4.5.1 prefers a stable complementary checker phase and applies only atomic, coverage-preserving 2×2 color-pair corrections in smooth regions. In QL Mode 8/4 mixed Artistic checker mode, line suppression scales the mixed-resolution checker carrier from 0% to 100%. For v4.4, v4.5, and v4.5.1, line suppression controls carrier strength from 0% to 100%; it does not change the underlying tone diffusion. At 0%, output matches Projected unrestricted v2.
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
          </fieldset>
          </details>
          ))}
          </>
          ) : (
          <>
          {workbenchPortal("tilemap", (
          <details
            className={`workbench-settings-section workbench-window${workbenchTilemapFloating ? ` workbench-section-floating workbench-tilemap-floating${workbenchTilemapFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : ""}`}
            {...workbenchWindowDragAttributes("tilemap")}
            data-workbench-window="tilemap"
            hidden={!workbenchWindowLayout("tilemap").visible}
            data-dock={workbenchWindowLayout("tilemap").dock}
            data-minimized={workbenchWindowLayout("tilemap").minimized ? "true" : "false"}
            open={workbenchWindowLayout("tilemap").open && !workbenchWindowLayout("tilemap").minimized}
            style={workbenchDockWindowStyle("tilemap", workbenchTilemapFloating ? { zIndex: workbenchWindowZIndex("tilemap") } : undefined)}
            onPointerDown={(event) => {
              if (workbenchTilemapFloating) {
                event.stopPropagation();
                bringWorkbenchWindowToFront("tilemap");
              }
            }}
            onFocusCapture={() => {
              if (workbenchTilemapFloating) bringWorkbenchWindowToFront("tilemap");
            }}
            onToggle={(event) => setWorkbenchWindowOpen("tilemap", event.currentTarget.open)}
          >
            <summary
              onPointerDown={(event) => {
                startWorkbenchTitlebarDrag("tilemap", event);
              }}
              onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("tilemap", event)}
              onClick={(event) => handleWorkbenchTitlebarClick("tilemap", event)}
            >
              <span>Tilemap</span>
              {workbenchWindowActions("tilemap")}
              {workbenchTilemapFloating ? (
                <span
                  className="workbench-window-drag-handle"
                  role="button"
                  tabIndex={0}
                  aria-label="Move Tilemap window"
                  title="Drag to move Tilemap"
                  onPointerDown={(event) => startWorkbenchSectionDrag("tilemap", event)}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 32 : 8;
                    if (event.key === "ArrowLeft") setWorkbenchTilemapFloatingX((x) => Math.max(8, x - step));
                    if (event.key === "ArrowRight") setWorkbenchTilemapFloatingX((x) => x + step);
                    if (event.key === "ArrowUp") setWorkbenchTilemapFloatingY((y) => Math.max(8, y - step));
                    if (event.key === "ArrowDown") setWorkbenchTilemapFloatingY((y) => y + step);
                  }}
                >⠿</span>
              ) : null}
            </summary>
            {workbenchDockSplitHandle("tilemap")}
          <fieldset id="settings-tilemap" className={`control-group tilemap-settings-group${settingsSection === "tilemap" ? " settings-focused" : ""}`}>
            <legend>Tilemap conversion</legend>
            <div className="tilemap-source-inline">
            <div className="tilemap-source-summary control-row control-row-5">
              <div>
                <span>Optimizer</span>
                <strong>
                  {ATTRIBUTE_OPTIMIZERS.find((engine) =>
                    engine.id === attributeOptimizerId)?.name ??
                    attributeOptimizerId}
                </strong>
              </div>
              <div>
                <span>Dither engine</span>
                <strong>
                  {DITHER_ENGINES.find((engine) =>
                    engine.id === ditherEngineId)?.name ?? ditherEngineId}
                </strong>
              </div>
              <div>
                <span>Palette</span>
                <strong>
                  {paletteSelections[0]?.enabledColorIds.length ?? 0} colors ·
                  BRIGHT {paletteSelections[0]?.brightMode ?? "auto"}
                </strong>
              </div>
              <div>
                <span>Character budget</span>
                <strong>{charsetSource === "existing" ? existingActiveCharacterCount : charsetBudget}</strong>
              </div>
              <div><span>Target</span><strong>ZX 256×192 · 8×8</strong></div>
            </div>
            </div>
            <div className={`tilemap-primary-controls control-row control-row-${charsetSource === "derived" ? 5 : 4}`}>
            <label>
              <span>Charset source</span>
              <select
                value={charsetSource}
                disabled={charsetState.kind === "running"}
                onChange={(event) => {
                  const source = event.target.value as CharsetSource;
                  setCharsetSource(source);
                  setCharsetTilesView(source === "existing" ? "source" : "output");
                  setCharsetSelectionMode(false);
                  setSelectedSourceCharsetTile(null);
                  if (
                    source === "existing" &&
                    existingCharset !== null &&
                    existingCharsetLength === 0
                  ) {
                    const count = existingCharset.length / 8;
                    setExistingCharsetStart(0);
                    setExistingCharsetLength(count);
                    setExistingCharsetStartEntry("1");
                    setExistingCharsetLengthEntry(String(count));
                    if (count > 32) setCharsetEncoding("extended");
                  }
                  invalidateCharset();
                  setTilemapStale(true);
                }}
              >
                <option value="derived">Derive from palette source</option>
                <option value="existing">Existing charset</option>
              </select>
            </label>
            <label>
              <span>Output mapping</span>
              <select
                value={charsetEncoding}
                disabled={charsetState.kind === "running"}
                onChange={(event) => {
                  const encoding = event.target.value as CharsetEncoding;
                  setCharsetEncoding(encoding);
                  if (encoding === "compact") {
                    if (charsetSource === "existing") {
                      if (existingCharsetSelection !== null) {
                        markCharsetSelectionChanged(
                          existingCharsetSelection.slice(0, 32),
                        );
                      } else {
                        setExistingCharsetLength((value) => {
                          const next = Math.min(value, 32);
                          setExistingCharsetLengthEntry(String(next));
                          return next;
                        });
                      }
                    } else {
                      setCharsetBudget((value) => Math.min(value, 32));
                    }
                  }
                  invalidateCharset();
                  setTilemapStale(true);
                }}
              >
                <option value="compact">Compact · 1–32 chars</option>
                <option value="extended">Extended · 1–256 chars</option>
              </select>
            </label>
            {charsetSource === "derived" ? <label>
              <span>Character budget</span>
              <input
                type="number"
                min="1"
                max="256"
                value={charsetBudget}
                disabled={charsetState.kind === "running"}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isInteger(next) && next >= 1 && next <= 256) {
                    setCharsetBudget(next);
                    if (next > 32) setCharsetEncoding("extended");
                    invalidateCharset();
                    setTilemapStale(true);
                  }
                }}
              />
            </label> : (
            <>
              <label>
                <span>Start tile</span>
                <input
                  type="text"
                  inputMode={existingCharsetSelection === null
                    ? "numeric"
                    : undefined}
                  value={existingCharsetSelection === null
                    ? existingCharsetStartEntry
                    : "Selection"}
                  readOnly={existingCharsetSelection !== null}
                  aria-invalid={existingCharsetSelection === null &&
                    !charsetRangeEntriesValid}
                  disabled={charsetState.kind === "running" || availableExistingCharsetCount === 0}
                  onChange={(event) => {
                    const entry = event.target.value;
                    setExistingCharsetStartEntry(entry);
                    const requestedStart = Number(entry);
                    if (
                      !/^\d+$/.test(entry) ||
                      !Number.isInteger(requestedStart) ||
                      requestedStart < 1 ||
                      requestedStart > availableExistingCharsetCount
                    ) return;
                    const range = clampCharsetRange(
                      availableExistingCharsetCount,
                      requestedStart - 1,
                      existingCharsetLength,
                    );
                    setExistingCharsetStart(range.startIndex);
                    setExistingCharsetLength(range.length);
                    setExistingCharsetLengthEntry(String(range.length));
                    invalidateCharset();
                    setTilemapStale(true);
                  }}
                  onBlur={commitCharsetStartEntry}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitCharsetStartEntry();
                    }
                  }}
                />
                {existingCharsetSelection === null &&
                    !charsetRangeEntriesValid ? (
                  <span className="field-error">Invalid value</span>
                ) : null}
              </label>
              <label>
                <span>Length</span>
                <input
                  type={existingCharsetSelection === null ? "text" : "number"}
                  inputMode={existingCharsetSelection === null
                    ? "numeric"
                    : undefined}
                  value={existingCharsetSelection === null
                    ? existingCharsetLengthEntry
                    : existingCharsetSelection.length}
                  readOnly={existingCharsetSelection !== null}
                  aria-invalid={existingCharsetSelection === null &&
                    !charsetRangeEntriesValid}
                  disabled={charsetState.kind === "running" || availableExistingCharsetCount === 0}
                  onChange={(event) => {
                    const entry = event.target.value;
                    setExistingCharsetLengthEntry(entry);
                    const requestedLength = Number(entry);
                    const maximum = availableExistingCharsetCount - existingCharsetStart;
                    if (
                      !/^\d+$/.test(entry) ||
                      !Number.isInteger(requestedLength) ||
                      requestedLength < 1 ||
                      requestedLength > maximum
                    ) return;
                    setExistingCharsetLength(requestedLength);
                    if (requestedLength > 32) setCharsetEncoding("extended");
                    invalidateCharset();
                    setTilemapStale(true);
                  }}
                  onBlur={commitCharsetLengthEntry}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitCharsetLengthEntry();
                    }
                  }}
                />
                {existingCharsetSelection === null &&
                    !charsetRangeEntriesValid ? (
                  <span className="field-error">Invalid value</span>
                ) : null}
              </label>
            </>
            )}
            {charsetSource === "derived" ? <label>
              <span>Derived strategy</span>
              <select
                value={charsetStrategy}
                disabled={charsetSource !== "derived" ||
                  charsetState.kind === "running"}
                onChange={(event) => {
                  setCharsetStrategy(
                    event.target.value as DerivedCharsetStrategy,
                  );
                  invalidateCharset();
                  setTilemapStale(true);
                }}
              >
                <option value="frequency">Most frequent · fastest</option>
                <option value="best-coverage">Best coverage v1 · baseline</option>
                <option value="image-similarity-v2">
                  Image similarity v2 · experimental
                </option>
                <option value="image-similarity-v3">
                  Image similarity v3 · contextual experimental
                </option>
                <option value="image-similarity-v4">
                  Image similarity v4 · RGB-safe experimental
                </option>
                <option value="image-similarity-v5">
                  Image similarity v5 · bounded contextual experimental
                </option>
              </select>
            </label> : null}
            {charsetSource === "derived" ? <label>
              <span>Matching metric</span>
              <select
                value={
                  charsetStrategy === "image-similarity-v2" ||
                  charsetStrategy === "image-similarity-v3" ||
                  charsetStrategy === "image-similarity-v4" ||
                  charsetStrategy === "image-similarity-v5"
                  ? charsetStrategy
                  : charsetDistance}
                disabled={
                  charsetStrategy === "image-similarity-v2" ||
                  charsetStrategy === "image-similarity-v3" ||
                  charsetStrategy === "image-similarity-v4" ||
                  charsetStrategy === "image-similarity-v5" ||
                  charsetState.kind === "running"}
                onChange={(event) => {
                  setCharsetDistance(
                    event.target.value as CharsetDistanceMetric,
                  );
                  invalidateCharset();
                  setTilemapStale(true);
                }}
              >
                <option value="hamming">Pixel Hamming</option>
                <option value="hybrid">Hybrid structural</option>
                {charsetStrategy === "image-similarity-v2" ||
                    charsetStrategy === "image-similarity-v3" ||
                    charsetStrategy === "image-similarity-v4" ||
                    charsetStrategy === "image-similarity-v5" ? (
                  <option value={charsetStrategy}>
                    Rendered image similarity
                  </option>
                ) : null}
              </select>
            </label> : null}
            </div>
            <div className="tilemap-options-row control-row control-row-3">
            <label className="check-control">
              <input
                type="checkbox"
                checked={charsetAllowTransforms}
                disabled={charsetState.kind === "running"}
                onChange={(event) => {
                  setCharsetAllowTransforms(event.target.checked);
                  invalidateCharset();
                  setTilemapStale(true);
                }}
              />
              <span>Rotations and reflections</span>
            </label>
            <label className="check-control">
              <input
                type="checkbox"
                checked={charsetAllowPolarity}
                disabled={charsetState.kind === "running"}
                onChange={(event) => {
                  setCharsetAllowPolarity(event.target.checked);
                  invalidateCharset();
                  setTilemapStale(true);
                }}
              />
              <span>Polarity through INK/PAPER swap</span>
            </label>
            <label className="check-control">
              <input
                type="checkbox"
                checked={charsetVisualWeighting}
                disabled={charsetSource !== "derived" ||
                  charsetState.kind === "running"}
                onChange={(event) => {
                  setCharsetVisualWeighting(event.target.checked);
                  invalidateCharset();
                  setTilemapStale(true);
                }}
              />
              <span>Visual importance weighting</span>
            </label>
            </div>
            {charsetSource === "existing" ? (
              <label className="file-picker secondary-picker charset-picker">
                <span>
                  {existingCharsetName ?? "Choose raw charset"}
                  {existingCharsetName === null ? "" : " · Replace…"}
                </span>
                <input
                  type="file"
                  accept=".chr,.bin,application/octet-stream"
                  disabled={charsetState.kind === "running"}
                  onChange={(event) => {
                    const input = event.currentTarget;
                    const file = input.files?.[0];
                    // Clear the input so selecting the same file again still
                    // emits a change event and resets any prior tile subset.
                    input.value = "";
                    void importExistingCharset(file);
                  }}
                />
              </label>
            ) : null}
            {charsetSource === "existing" && existingCharset === null ? (
              <p className="control-help" role="status">
                {builtInSpecsciiFontError === null
                  ? "Loading the built-in Specscii font…"
                  : `Built-in Specscii font unavailable: ${builtInSpecsciiFontError}. Import a raw charset to continue.`}
              </p>
            ) : null}
            <p className="control-help tilemap-mapping-help">
              Compact embeds transform bits and supports 1–32 active tiles.
              Extended supports 1–256 tiles and stores transforms in a separate
              288-byte plane.
            </p>
          </fieldset>
          {workbenchTilemapFloating ? (
            <div
              className="workbench-floating-resize-handle"
              role="button"
              tabIndex={0}
              aria-label="Resize Tilemap window"
              onPointerDown={(event) => startWorkbenchFloatingResize("tilemap", event)}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 32 : 8;
                if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("tilemap", step, 0);
                if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("tilemap", -step, 0);
                if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("tilemap", 0, step);
                if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("tilemap", 0, -step);
              }}
            />
          ) : null}
          </details>
          ))}
          </>
          )}
          </div>

          {benchmarkPanelHost === null ? null : createPortal((developmentMode && workspaceMode === "palette" && benchmarkOpen ? (
          <details
            className="benchmark-panel"
            open
            onToggle={(event) => setBenchmarkOpen(event.currentTarget.open)}
          >
            <summary>
              <span>{comparisonKind === "dithering" ? "Dithering comparison" : "Conversion engine comparison"}</span>
              <span className="benchmark-summary">
                {benchmarkRunning
                  ? "Benchmarking…"
                  : benchmarkRows.length > 0
                    ? `${benchmarkRows.length} results`
                    : "Not run"}
              </span>
            </summary>
            <div className="benchmark-content">
              <div className="benchmark-toolbar">
                <label className="benchmark-experimental">
                  <input
                    type="checkbox"
                    checked={includeExperimentalEngines}
                    disabled={benchmarkRunning}
                    onChange={(event) => {
                      setIncludeExperimentalEngines(event.currentTarget.checked);
                      setBenchmarkRows([]);
                    }}
                  />
                  Include experimental methods in benchmark
                </label>
                <button
                  className="secondary compact"
                  type="button"
                  disabled={image === null || !settingsValid || benchmarkRunning}
                  onClick={() => void runEngineBenchmark()}
                >
                  {benchmarkRunning ? "Benchmarking…" : "Run comparison"}
                </button>
                <span>Ranks compatible optimizer and dither combinations for the current image.</span>
                {benchmarkRows.length > 0 ? (
                  <>
                    <button className="secondary compact" type="button" onClick={() => downloadBenchmark("json")}>Export JSON</button>
                    <button className="secondary compact" type="button" onClick={() => downloadBenchmark("csv")}>Export CSV</button>
                  </>
                ) : null}
              </div>
              <p className="benchmark-context">
                Context: {selectedPlatformId} · {targetModeId} ·
                {" "}amount {dithering === "none" ? 0 : amount}% ·
                {" "}randomization {errorDiffusionRandomization}% ·
                {" "}line suppression {errorDiffusionLineSuppression}% ·
                {" "}attribute {attributeHeight === undefined ? "—" : `8×${attributeHeight}`} ·
                {" "}palettes {paletteSelections.map((selection) =>
                  `S${selection.screenIndex + 1}:${selection.enabledColorIds.join(",")}${
                    selection.brightMode === undefined
                      ? ""
                      : `/${selection.brightMode}`
                  }`
                ).join(" | ")} · source {sourceArtifact?.sha256.slice(0, 12) ?? "unsaved"}
              </p>
              {benchmarkRows.length > 0 ? (
                <div className="benchmark-results">
                  <p>
                    Lower decoder-preview RGB error is better. Low-pass and
                    edge scores are secondary; platform score is
                    engine-specific and not comparable. Guidance identifies
                    exact, smooth, fast, and non-dominated balanced tradeoffs.
                  </p>
                  {benchmarkCompareDigests.length === 2 ? (() => {
                    const first = benchmarkRows.find((row) => row.digest === benchmarkCompareDigests[0]);
                    const second = benchmarkRows.find((row) => row.digest === benchmarkCompareDigests[1]);
                    return first !== undefined && second !== undefined ? (
                      <div className="benchmark-comparison" aria-label="Selected engine comparison">
                        <strong>A/B metric difference · B minus A</strong>
                        <span>RGB {(second.score - first.score).toLocaleString()}</span>
                        <span>Low-pass {(second.lowPassScore - first.lowPassScore).toLocaleString()}</span>
                        <span>Edge {(second.edgeScore - first.edgeScore).toLocaleString()}</span>
                        <span>Anisotropy {((second.textureMetrics.directionalAnisotropy - first.textureMetrics.directionalAnisotropy) * 100).toFixed(2)} pp</span>
                        <span>Straight runs {(second.textureMetrics.straightRunPenalty - first.textureMetrics.straightRunPenalty).toLocaleString()}</span>
                        <span>Time {(second.elapsedMs - first.elapsedMs).toFixed(0)} ms</span>
                        {benchmarkComparisonPreviews !== null ? (
                          <div className="benchmark-preview-comparison">
                            <figure><img src={benchmarkComparisonPreviews.first} alt="Benchmark result A" /><figcaption>A</figcaption></figure>
                            <figure><img src={benchmarkComparisonPreviews.second} alt="Benchmark result B" /><figcaption>B</figcaption></figure>
                            <figure><img src={benchmarkComparisonPreviews.difference} alt="Amplified RGB difference heatmap" /><figcaption>Difference ×4</figcaption></figure>
                          </div>
                        ) : null}
                      </div>
                    ) : null;
                  })() : null}
                  <table>
                    <thead>
                      <tr>
                        <th>Rank</th>
                        {selectedPlatformId === "zx-spectrum"
                          ? <th>Attribute optimizer</th>
                          : null}
                        {targetModeId === "mode8-mode4-mixed-512x256"
                          ? <th>QL mixed optimizer</th>
                          : null}
                        <th>Dither</th><th>Matrix</th><th>RGB error</th>
                        <th>Low-pass 2×2</th><th>Edge error</th>
                        <th>Guidance</th><th>Texture diagnostics</th><th>Attribute boundary</th><th>v7 RMS / changed</th><th>Platform score*</th>
                        <th>Time</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {benchmarkRows.map((row, index) => (
                        <tr key={row.digest}>
                          <td>{index + 1}</td>
                          {selectedPlatformId === "zx-spectrum"
                            ? <td>{row.optimizerId}</td>
                            : null}
                          {targetModeId === "mode8-mode4-mixed-512x256"
                            ? <td>{row.qlMixedOptimizerId}</td>
                            : null}
                          <td>
                            <div>{row.ditherEngineId}</div>
                            {row.aliases.length > 0 ? (
                              <details>
                                <summary>
                                  {row.aliases.length + 1} identical outputs
                                </summary>
                                {row.aliases.map((alias) => (
                                  <div key={`${alias.optimizerId}:${alias.qlMixedOptimizerId}:${alias.ditherEngineId}:${alias.matrix}`}>
                                    {selectedPlatformId === "zx-spectrum"
                                      ? `${alias.optimizerId} · `
                                      : targetModeId ===
                                          "mode8-mode4-mixed-512x256"
                                      ? `${alias.qlMixedOptimizerId} · `
                                      : ""}
                                    {alias.ditherEngineId}
                                    {ditherMethodForEngine(alias.ditherEngineId) ===
                                          "ordered"
                                      ? ` · ${alias.matrix}`
                                      : ""}
                                  </div>
                                ))}
                              </details>
                            ) : null}
                          </td>
                          <td>{row.matrixEffective ? row.matrix : "—"}</td>
                          <td>{row.score.toLocaleString()}</td>
                          <td>{row.lowPassScore.toLocaleString()}</td>
                          <td>{row.edgeScore.toLocaleString()}</td>
                          <td title={row.classification.dominated
                            ? "Dominated on RGB, low-pass, and edge metrics."
                            : row.classification.guidance === "exact"
                              ? "Lowest canonical RGB error."
                              : row.classification.guidance === "smooth"
                                ? "Lowest low-pass perceived error."
                                : row.classification.guidance === "fast"
                                  ? "Fastest result within 10% of the best RGB error."
                                  : "Non-dominated quality tradeoff."}
                          >
                            {row.classification.guidance ?? (row.classification.dominated ? "dominated" : "—")}
                          </td>
                          <td>
                            <details>
                              <summary>
                                anisotropy {(row.textureMetrics.directionalAnisotropy * 100).toFixed(1)}%
                              </summary>
                              <div>straight runs {row.textureMetrics.straightRunPenalty.toLocaleString()}</div>
                              <div>low frequency {row.textureMetrics.lowFrequencyNoise.toFixed(2)}</div>
                              <div>clumping {row.textureMetrics.localErrorClumping.toFixed(2)}</div>
                              <div>edge displacement {row.textureMetrics.edgeDisplacement.toLocaleString()}</div>
                            </details>
                          </td>
                          <td>{row.attributeBoundaryScore?.toLocaleString() ?? "—"}</td>
                          <td>{row.orderedPerturbationRms === null
                            ? "—"
                            : `${row.orderedPerturbationRms.toFixed(5)} / ${row.outputPixelChangePercent?.toFixed(2) ?? "—"}%`}</td>
                          <td>{row.platformScore.toLocaleString()}</td>
                          <td>{row.elapsedMs.toFixed(0)} ms</td>
                          <td>
                            <label className="benchmark-compare-toggle">
                              <input
                                type="checkbox"
                                aria-label={`Compare ${row.ditherEngineId}`}
                                checked={benchmarkCompareDigests.includes(row.digest)}
                                onChange={() => toggleBenchmarkComparison(row.digest)}
                              />
                              A/B
                            </label>
                            <button className="secondary compact" type="button" onClick={() => selectBenchmarkRow(row)}>Use</button>
                            <button
                              className="secondary compact"
                              type="button"
                              aria-pressed={benchmarkVisualFavorites.has(row.digest)}
                              onClick={() => toggleBenchmarkVisualFavorite(row.digest)}
                              title="Mark this result as a visual favorite without changing its rank"
                            >
                              {benchmarkVisualFavorites.has(row.digest) ? "★ Favorite" : "☆ Favorite"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </details>
          ) : developmentMode && workspaceMode === "tilemap" && tilemapBenchmarkOpen ? (
          <details
            className="benchmark-panel"
            open
            onToggle={(event) =>
              setTilemapBenchmarkOpen(event.currentTarget.open)}
          >
            <summary>
              <span>Tilemap method comparison</span>
              <span className="benchmark-summary">
                {tilemapBenchmarkRunning
                  ? "Benchmarking…"
                  : tilemapBenchmarkRows.length > 0
                    ? `${tilemapBenchmarkRows.length} results`
                    : "Not run"}
              </span>
            </summary>
            <div className="benchmark-content">
              <div className="benchmark-toolbar">
                <span>
                  Compares Frequency, Best coverage v1, and experimental Image
                  similarity v2/v3/v4/v5 at the current character budget.
                </span>
              </div>
              {tilemapBenchmarkRows.length > 0 ? (
                <div className="benchmark-results">
                  <p>
                    Lower decoder-preview RGB error is better; runtime is
                    informational.
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Rank</th><th>Method</th><th>RGB error</th>
                        <th>Objective / diagnostics</th><th>vs v2</th>
                        <th>Time</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {tilemapBenchmarkRows.map((row, index) => (
                        <tr key={row.strategy}>
                          <td>{index + 1}</td>
                          <td>{row.strategy}</td>
                          <td>{row.score.toLocaleString()}</td>
                          <td>
                            {row.strategy === "image-similarity-v4" ||
                                row.strategy === "image-similarity-v5" ? (
                              <details>
                                <summary>
                                  RGB{" "}
                                  {row.result.diagnostics.initialRgbSquaredError?.toLocaleString()}
                                  {" → "}
                                  {row.result.diagnostics.finalRgbSquaredError?.toLocaleString()}
                                </summary>
                                <div>
                                  Multiscale{" "}
                                  {row.result.diagnostics.multiscaleError?.toFixed(2)}
                                  {" · "}edge{" "}
                                  {row.result.diagnostics.edgeError?.toFixed(2)}
                                  {" · "}boundary{" "}
                                  {row.result.diagnostics.rgbBoundaryError?.toFixed(2)}
                                  {" · "}saliency{" "}
                                  {row.result.diagnostics.saliencyError?.toFixed(2)}
                                  {" · "}passes{" "}
                                  {row.result.diagnostics.refinementPasses ?? 0}
                                  {" · "}swaps{" "}
                                  {row.result.diagnostics.medoidSwaps ?? 0}
                                  {" · "}assignments{" "}
                                  {row.result.diagnostics.assignmentChanges ?? 0}
                                  {" · "}candidates{" "}
                                  {row.result.diagnostics.candidatesEvaluated?.toLocaleString() ?? "—"}
                                  {" · "}pruned{" "}
                                  {row.result.diagnostics.equivalentCandidatesPruned?.toLocaleString() ?? "—"}
                                  {" · "}cache hits{" "}
                                  {row.result.diagnostics.candidateCacheHits?.toLocaleString() ?? "—"}
                                </div>
                              </details>
                            ) : (
                              row.result.diagnostics.globalObjective?.toFixed(5) ??
                                "—"
                            )}
                          </td>
                          <td>{(() => {
                            const baseline = tilemapBenchmarkRows.find(
                              (candidate) =>
                                candidate.strategy === "image-similarity-v2",
                            )?.score;
                            return baseline === undefined
                              ? "—"
                              : `${((baseline - row.score) / baseline * 100).toFixed(2)}%`;
                          })()}</td>
                          <td>{row.elapsedMs.toFixed(0)} ms</td>
                          <td>
                            <button
                              className="secondary compact"
                              type="button"
                              onClick={() => selectTilemapBenchmarkRow(row)}
                            >
                              Use
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </details>
          ) : null), benchmarkPanelHost)}
            </div>
          </div>
          <div ref={setBenchmarkPanelHost} className="workbench-comparison-host" />

          <div className="form-footer">
            <div className="actions">
              <button
                type="submit"
                disabled={image === null || !settingsValid || state.kind === "running"}
              >
                {state.kind === "running" ? "Converting…" : "Convert High"}
              </button>
              {state.kind === "running" ? (
                <button className="secondary" type="button" onClick={cancelHigh}>Cancel High</button>
              ) : null}
              {developmentMode && comparisonKind === "palette" ? (
                <button
                  className="secondary project-action comparison-project-action"
                  type="button"
                  disabled={image === null || !settingsValid || benchmarkRunning}
                  onClick={() => setBenchmarkOpen((open) => !open)}
                >
                  {benchmarkOpen ? "Close comparison" : "Compare engines"}
                </button>
              ) : null}
              {developmentMode && comparisonKind === "dithering" ? (
                <button
                  className="secondary project-action comparison-project-action"
                  type="button"
                  disabled={image === null || !settingsValid || benchmarkRunning}
                  onClick={() => {
                    setBenchmarkOpen(true);
                    if (!benchmarkOpen) void runEngineBenchmark();
                  }}
                >
                  {benchmarkRunning ? "Benchmarking…" : "Compare dithering"}
                </button>
              ) : null}
              {developmentMode && comparisonKind === "tilemap" ? (
                <button
                  className="secondary project-action comparison-project-action"
                  type="button"
                  disabled={lastFinal === null || tilemapBenchmarkRunning ||
                    (charsetSource === "existing" &&
                      (existingCharset === null || !existingCharsetChoiceValid))}
                  onClick={() => {
                    setTilemapBenchmarkOpen(true);
                    void runTilemapBenchmark();
                  }}
                >
                  {tilemapBenchmarkRunning ? "Benchmarking…" : "Compare methods"}
                </button>
              ) : null}

            </div>

          </div>
          {exportError === null ? null : <div className="field-error workbench-export-error" role="alert">{exportError}</div>}
          <div
            className="workbench-dock-region workbench-dock-left"
            {...workbenchDockDropAttributes("left")}
            ref={setWorkbenchLeftDockLayer}
            data-dock-region="left"
            aria-label="Left dock"
          >
            <div className="workbench-dock-resize-handle workbench-dock-resize-left" role="separator" tabIndex={0} aria-label="Resize left dock" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={560} aria-valuenow={workbenchLeftWidth} onPointerDown={(event) => startWorkbenchResize("left", event)} onKeyDown={(event) => { if (event.key === "ArrowLeft") adjustWorkbenchSize("left", -16); if (event.key === "ArrowRight") adjustWorkbenchSize("left", 16); }} />
          </div>
          <div
            className="workbench-dock-region workbench-dock-right"
            {...workbenchDockDropAttributes("right")}
            ref={setWorkbenchRightDockLayer}
            data-dock-region="right"
            aria-label="Right dock"
          >
            <div className="workbench-dock-resize-handle workbench-dock-resize-right" role="separator" tabIndex={0} aria-label="Resize right dock" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={560} aria-valuenow={workbenchRightWidth} onPointerDown={(event) => startWorkbenchResize("right", event)} onKeyDown={(event) => { if (event.key === "ArrowLeft") adjustWorkbenchSize("right", 16); if (event.key === "ArrowRight") adjustWorkbenchSize("right", -16); }} />
          </div>
          <div
            className="workbench-dock-region workbench-dock-bottom"
            {...workbenchDockDropAttributes("bottom")}
            ref={setWorkbenchBottomDockLayer}
            data-dock-region="bottom"
            aria-label="Bottom dock"
          >
            <div className="workbench-dock-resize-handle workbench-dock-resize-bottom" role="separator" tabIndex={0} aria-label="Resize bottom dock" aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={480} aria-valuenow={workbenchBottomHeight} onPointerDown={(event) => startWorkbenchResize("bottom", event)} onKeyDown={(event) => { if (event.key === "ArrowUp") adjustWorkbenchSize("bottom", 16); if (event.key === "ArrowDown") adjustWorkbenchSize("bottom", -16); }} />
            <div
              ref={setWorkbenchBottomMinimizedLayer}
              className="workbench-dock-minimized-stack"
              data-workbench-drop-append={workbenchTileDrag?.drop?.dock === "bottom" &&
                workbenchTileDrag.drop.target === null && workbenchTileDrag.drop.destination === "minimized"
                ? "true"
                : undefined}
              aria-label="Minimized bottom-dock windows"
            />
          </div>
        </form>

        {gifFrameSelection !== null ? (
          <div className="settings-modal-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) cancelGifFrameSelection();
          }}>
            <form className="settings-modal project-save-modal" role="dialog" aria-modal="true" aria-labelledby="gif-frame-title" onSubmit={(event) => {
              event.preventDefault();
              importSelectedGifFrame();
            }} onKeyDown={(event) => {
              if (event.key === "Escape") cancelGifFrameSelection();
            }}>
              <div className="settings-modal-header">
                <div>
                  <h2 id="gif-frame-title">Choose GIF frame</h2>
                  <p>{gifFrameSelection.file.name} contains {gifFrameSelection.frameCount} frames. Choose the frame to import.</p>
                </div>
              </div>
              <div className="project-save-content">
                <label htmlFor="gif-frame-number">Frame number</label>
                <input
                  id="gif-frame-number"
                  autoFocus
                  type="number"
                  min={1}
                  max={gifFrameSelection.frameCount}
                  step={1}
                  value={gifFrameSelection.frameEntry}
                  onChange={(event) => setGifFrameSelection((current) => current === null ? null : { ...current, frameEntry: event.target.value })}
                />
                <p>Choose a frame from 1 to {gifFrameSelection.frameCount}.</p>
              </div>
              <div className="settings-modal-actions">
                <span className="action-spacer" aria-hidden="true" />
                <button className="secondary" type="button" onClick={cancelGifFrameSelection}>Cancel</button>
                <button className="primary" type="submit" disabled={!/^\d+$/.test(gifFrameSelection.frameEntry) || Number(gifFrameSelection.frameEntry) < 1 || Number(gifFrameSelection.frameEntry) > gifFrameSelection.frameCount}>Import Frame</button>
              </div>
            </form>
          </div>
        ) : null}

        {projectSaveDialogOpen ? (
          <div className="settings-modal-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setProjectSaveDialogOpen(false);
          }}>
            <form className="settings-modal project-save-modal" role="dialog" aria-modal="true" aria-labelledby="project-save-title" onSubmit={(event) => {
              event.preventDefault();
              void exportProject(projectNameDraft);
            }} onKeyDown={(event) => {
              if (event.key === "Escape") setProjectSaveDialogOpen(false);
            }}>
              <div className="settings-modal-header">
                <div>
                  <h2 id="project-save-title">Save project</h2>
                  <p>Choose a name for the project file. The project will use this name after saving.</p>
                </div>
                <button className="secondary compact" type="button" aria-label="Close save project dialog" onClick={() => setProjectSaveDialogOpen(false)}>×</button>
              </div>
              <div className="project-save-content">
                <label htmlFor="project-save-name">Project name</label>
                <input
                  id="project-save-name"
                  autoFocus
                  type="text"
                  maxLength={120}
                  value={projectNameDraft}
                  onChange={(event) => setProjectNameDraft(event.target.value)}
                  placeholder="Untitled project"
                />
                <p>The downloaded file will be named <strong>{sanitizeArtifactBaseName(normalizeProjectName(projectNameDraft))}.rccproject</strong>.</p>
              </div>
              <div className="settings-modal-actions">
                <span className="action-spacer" aria-hidden="true" />
                <button className="secondary" type="button" onClick={() => setProjectSaveDialogOpen(false)}>Cancel</button>
                <button className="primary" type="submit" disabled={projectNameDraft.trim().length === 0}>Save Project</button>
              </div>
            </form>
          </div>
        ) : null}

        {zxPaletteEditorOpen && isZx ? (
          <ZxPaletteEditorDialog
            definition={zxPaletteDefinition}
            onChange={(definition) => {
              setZxPaletteDefinition(definition);
              setState({ kind: "idle" });
            }}
            onClose={() => setZxPaletteEditorOpen(false)}
          />
        ) : null}

        {settingsOpen && settingsDraft !== null ? (() => {
          const draftProfile = profiles.find(({ id }) => id === settingsDraft.profileId) ?? BUILT_IN_PROFILE;
          const draftModes = Object.keys(draftProfile.palette.modes) as TargetModeId[];
          const draftTypography = uiTypographyFromRecord(settingsDraft);
          const visibleSettings = filterSettings(SETTINGS_REGISTRY, settingsSearch, settingsCategory, settingsPreset, settingsDraft, settingsBaseline ?? settingsDraft);
          const updateSetting = (definition: SettingDefinition, value: unknown) => {
            const next = { ...settingsDraft, [definition.id]: value };
            if (definition.id === "dithering") {
              next.ditherEngineId = latestDitherEngineForMethod(value as DitheringMethod);
            } else if (definition.id === "ditherEngineId") {
              next.dithering = ditherMethodForEngine(value as DitherEngineId);
            }
            setSettingsDraft(next);
          };
          const renderSettingControl = (definition: SettingDefinition) => {
            const value = settingsDraft[definition.id] ?? definition.defaultValue;
            const context = { workspaceMode, modeId: String(settingsDraft.modeId), dithering: String(settingsDraft.dithering) };
            const available = definition.isAvailable?.(context) ?? true;
            const enabled = available && (definition.isEnabled?.(settingsDraft, context) ?? true);
            const common = { id: `setting-${definition.id}`, "aria-describedby": `setting-help-${definition.id}` };
            if (definition.id === "profileId") return <select {...common} value={String(value)} onChange={(event) => {
              const profile = profiles.find(({ id }) => id === event.target.value) ?? BUILT_IN_PROFILE;
              setSettingsDraft({ ...settingsDraft, profileId: profile.id, presetId: profile.presets[0]?.id ?? "default", modeId: (Object.keys(profile.palette.modes)[0] ?? DEFAULT_APPLICATION_SETTINGS.modeId) as TargetModeId });
            }}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select>;
            if (definition.id === "presetId") return <select {...common} value={String(value)} onChange={(event) => updateSetting(definition, event.target.value)}>{draftProfile.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select>;
            if (definition.id === "modeId") return <select {...common} value={String(value)} onChange={(event) => updateSetting(definition, event.target.value)}>{draftModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select>;
            if (definition.id === "pmd85PaletteCalibrationId") {
              const draftModePalette = draftProfile.palette.modes[String(settingsDraft.modeId) as TargetModeId];
              const calibrations = draftModePalette?.calibrations ?? [];
              const baseCalibration = draftModePalette?.base_calibration_id;
              return <select {...common} value={String(value)} disabled={!enabled} onChange={(event) => updateSetting(definition, event.target.value)}>{baseCalibration === undefined ? null : <option value={baseCalibration}>{baseCalibration}</option>}{calibrations.map((calibration) => <option key={calibration.id} value={calibration.id}>{calibration.name}</option>)}</select>;
            }
            if (definition.control.kind === "boolean") return <input {...common} type="checkbox" checked={Boolean(value)} disabled={!enabled} onChange={(event) => updateSetting(definition, event.target.checked)} />;
            if (definition.control.kind === "color") {
              const color = value as RgbColor;
              return <div className="settings-color-control">
                <input {...common} type="color" value={rgbToHex(color)} disabled={!enabled} onChange={(event) => updateSetting(definition, hexToRgb(event.target.value))} />
                <span>{rgbToHex(color).toUpperCase()}</span>
              </div>;
            }
            if (definition.control.kind === "palette") {
              const selections = Array.isArray(value) ? value as Array<{ screenIndex: number; enabledColorIds: readonly number[]; brightMode?: BrightMode }> : [];
              const screens = draftProfile.palette.modes[String(settingsDraft.modeId) as TargetModeId]?.screens ?? [];
              return <div className="settings-palette-selector">{screens.map((screen, screenIndex) => {
                const selection = selections.find((candidate) => candidate.screenIndex === screenIndex) ?? { screenIndex, enabledColorIds: [] };
                return <div key={screenIndex} className="settings-palette-screen"><div className="settings-palette-colors">{screen.colors.map((color) => {
                  const selected = selection.enabledColorIds.includes(color.id);
                  const nextSelections = selections.map((candidate) => candidate.screenIndex === screenIndex ? { ...candidate, enabledColorIds: selected ? candidate.enabledColorIds.filter((id) => id !== color.id) : [...candidate.enabledColorIds, color.id].sort((a, b) => a - b) } : candidate);
                  return <button key={color.id} type="button" className={`palette-option${selected ? " selected" : ""}`} disabled={!enabled} aria-label={`${selected ? "Remove" : "Add"} ${color.name}`} aria-pressed={selected} onClick={() => updateSetting(definition, nextSelections)}><span className="palette-swatch" style={{ background: selection.brightMode === "on" ? color.bright : color.normal }} /></button>;
                })}</div><select aria-label={`Screen ${screenIndex + 1} BRIGHT policy`} disabled={!enabled} value={selection.brightMode ?? "auto"} onChange={(event) => updateSetting(definition, selections.map((candidate) => candidate.screenIndex === screenIndex ? { ...candidate, brightMode: event.target.value as BrightMode } : candidate))}><option value="auto">BRIGHT auto</option><option value="on">BRIGHT on</option><option value="off">BRIGHT off</option></select></div>;
              })}</div>;
            }
            const selectControl = definition.control;
            if (selectControl.kind === "select") return <select {...common} value={String(value)} disabled={!enabled} onChange={(event) => {
              const option = selectControl.options.find((candidate) => String(candidate.value) === event.target.value);
              updateSetting(definition, option?.value ?? event.target.value);
            }}>{selectControl.options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select>;
            if (definition.control.kind === "slider") return <div className="settings-slider"><input {...common} type="range" min={definition.control.min} max={definition.control.max} step={definition.control.step} value={Number(value)} disabled={!enabled} onChange={(event) => updateSetting(definition, Number(event.target.value))} /><output htmlFor={common.id}>{String(value)}{definition.control.unit ?? ""}</output></div>;
            if (definition.control.kind === "number") return <input {...common} type="number" min={definition.control.min} max={definition.control.max} step={definition.control.step} value={Number(value)} disabled={!enabled} onChange={(event) => updateSetting(definition, Number(event.target.value))} />;
            return <input {...common} type="text" value={String(value)} disabled={!enabled} onChange={(event) => updateSetting(definition, event.target.value)} />;
          };
          return (
            <div className="settings-modal-backdrop" role="presentation" onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setSettingsOpen(false);
                setSettingsDraft(null);
                setSettingsBaseline(null);
              }
            }}>
              <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="application-settings-title" onKeyDown={(event) => {
                if (event.key === "Escape") { setSettingsOpen(false); setSettingsDraft(null); setSettingsBaseline(null); }
              }}>
                <div className="settings-modal-header">
                  <div>
                    <h2 id="application-settings-title">Settings</h2>
                    <p>Searchable settings for startup, conversion, workspace, and editing.</p>
                  </div>
                  <button className="secondary compact" type="button" onClick={() => {
                    setSettingsOpen(false);
                    setSettingsDraft(null);
                  }}>×</button>
                </div>
                <div className="settings-toolbar">
                  <input autoFocus type="search" placeholder="Search settings…" aria-label="Search settings" value={settingsSearch} onChange={(event) => setSettingsSearch(event.target.value)} />
                  <select aria-label="Category" value={settingsCategory} onChange={(event) => setSettingsCategory(event.target.value as SettingCategory | "all")}><option value="all">All categories</option>{Object.entries(SETTING_CATEGORIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
                  <select aria-label="Filter preset" value={settingsPreset} onChange={(event) => setSettingsPreset(event.target.value as SettingPresetId)}>{SETTING_FILTER_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select>
                </div>
                <div className="settings-result-count" role="status">{visibleSettings.length} setting{visibleSettings.length === 1 ? "" : "s"}</div>
                <section
                  className="settings-typography-preview"
                  style={uiTypographyCssVariables(draftTypography) as CSSProperties}
                  aria-label="Typography preview"
                >
                  <div className="settings-typography-preview-heading">Typography preview</div>
                  <div className="typography-preview-window-title">Window title · Floating</div>
                  <div className="typography-preview-label"><span>UI label</span><strong>Sample value</strong></div>
                  <p className="typography-preview-body">Palette, Attributes, and Dithering body text uses the selected size and weight.</p>
                  <code className="typography-preview-monospace">Diagnostic 0x7F · 256×192</code>
                </section>
                <div className="settings-modal-content">
                  {visibleSettings.length === 0 ? <p className="settings-empty">No settings match your search or filters.</p> : Object.entries(SETTING_CATEGORIES).map(([category, label]) => {
                    const definitions = visibleSettings.filter((definition) => definition.category === category);
                    if (definitions.length === 0) return null;
                    return <fieldset key={category} id={`settings-${category}`}><legend>{label}</legend>{definitions.map((definition) => {
                      const definitionContext = { workspaceMode, modeId: String(settingsDraft.modeId), dithering: String(settingsDraft.dithering) };
                      const definitionAvailable = definition.isAvailable?.(definitionContext) ?? true;
                      const definitionEnabled = definition.isEnabled?.(settingsDraft, definitionContext) ?? true;
                      return <div className="setting-row" key={definition.id}>
                      <div><label htmlFor={`setting-${definition.id}`}><span>{definition.label}</span>{Object.is(settingsDraft[definition.id], settingsBaseline?.[definition.id]) ? null : <span className="setting-modified" title="Modified">●</span>}</label><p id={`setting-help-${definition.id}`}>{definition.description}{definition.disabledReason && (!definitionAvailable || !definitionEnabled) ? ` ${definition.disabledReason}` : ""}</p></div>
                      <div className="setting-control">{renderSettingControl(definition)}</div>
                    </div>;
                    })}</fieldset>;
                  })}
                </div>
                <div className="settings-modal-actions">
                  <button className="secondary" type="button" onClick={() => {
                    const category = settingsCategory === "all" ? "all" : settingsCategory;
                    const label = category === "all" ? "all settings" : SETTING_CATEGORIES[category];
                    if (window.confirm(`Reset ${label} to defaults?`)) {
                      setSettingsDraft(resetSettingsCategory(settingsDraft, category) as ApplicationSettings & Record<string, unknown>);
                    }
                  }}>{settingsCategory === "all" ? "Reset all" : `Reset ${SETTING_CATEGORIES[settingsCategory]}`}</button>
                  <span className="action-spacer" aria-hidden="true" />
                  <button className="secondary" type="button" onClick={() => { setSettingsOpen(false); setSettingsDraft(null); setSettingsBaseline(null); }}>Cancel</button>
                  <button className="primary" type="button" onClick={saveApplicationSettingsDraft} disabled={Object.keys(validateSettingsDraft(settingsDraft).errors).length > 0}>Save</button>
                </div>
              </section>
            </div>
          );
        })() : null}

        <section
          ref={workbenchPreviewWorkspaceRef}
          className={`inspection-workspace${workbenchSourceFloating ? " preview-source-floating" : ""}${workbenchResultFloating ? " preview-result-floating" : ""}${sourcePreviewVisible ? "" : " preview-source-hidden"}${resultPreviewVisible ? "" : " preview-result-hidden"}`}
          aria-labelledby="inspection-title"
        >
          <div className="inspection-heading">
            <div>
              <h2 id="inspection-title">Preview and inspection</h2>
              <p>Click-drag to pan, inspect encoded cells, and verify palette usage.</p>
            </div>
          </div>

          {workbenchPortal("tools", (
          <details
            className={`workbench-settings-section workbench-window${workbenchToolsFloating ? " workbench-section-floating workbench-tools-floating" : ""}`}
            {...workbenchWindowDragAttributes("tools")}
            data-workbench-window="tools"
            hidden={!workbenchWindowLayout("tools").visible}
            data-dock={workbenchWindowLayout("tools").dock}
            data-minimized={workbenchWindowLayout("tools").minimized ? "true" : "false"}
            open={workbenchWindowLayout("tools").open && !workbenchWindowLayout("tools").minimized}
            style={workbenchDockWindowStyle("tools", workbenchToolsFloating ? { zIndex: workbenchWindowZIndex("tools") } : undefined)}
            onPointerDown={(event) => {
              if (workbenchToolsFloating) {
                event.stopPropagation();
                bringWorkbenchWindowToFront("tools");
              }
            }}
            onFocusCapture={() => {
              if (workbenchToolsFloating) bringWorkbenchWindowToFront("tools");
            }}
            onToggle={(event) => setWorkbenchWindowOpen("tools", event.currentTarget.open)}
          >
            <summary
              aria-label="Tools"
              onPointerDown={(event) => startWorkbenchTitlebarDrag("tools", event)}
              onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("tools", event)}
              onClick={(event) => handleWorkbenchTitlebarClick("tools", event)}
            >
              <span>Tools</span>
              {workbenchWindowActions("tools")}
              {workbenchToolsFloating ? (
                <span
                  className="workbench-window-drag-handle"
                  role="button"
                  tabIndex={0}
                  aria-label="Move Tools window"
                  title="Drag to move Tools"
                  onPointerDown={(event) => startWorkbenchSectionDrag("tools", event)}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 32 : 8;
                    if (event.key === "ArrowLeft") setWorkbenchToolsFloatingX((x) => Math.max(8, x - step));
                    if (event.key === "ArrowRight") setWorkbenchToolsFloatingX((x) => x + step);
                    if (event.key === "ArrowUp") setWorkbenchToolsFloatingY((y) => Math.max(8, y - step));
                    if (event.key === "ArrowDown") setWorkbenchToolsFloatingY((y) => y + step);
                  }}
                >⠿</span>
              ) : null}
            </summary>
            {workbenchDockSplitHandle("tools")}
            {workbenchToolsFloating ? (
              <div
                className="workbench-floating-resize-handle"
                role="button"
                tabIndex={0}
                aria-label="Resize Tools window"
                onPointerDown={(event) => startWorkbenchFloatingResize("tools", event)}
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 32 : 8;
                  if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("tools", step, 0);
                  if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("tools", -step, 0);
                  if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("tools", 0, step);
                  if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("tools", 0, -step);
                }}
              />
            ) : null}
            <div className="workbench-window-content workbench-tools-content">
            {bitmapEditorActiveSide !== null ? <section className="bitmap-editor-tools-section" aria-label="Bitmap editor commands">
              <div className="bitmap-editor-tools-section-heading">Bitmap editor</div>
              <div className="bitmap-editor-tools-host" ref={setBitmapEditorToolsHost} />
            </section> : null}
            <div className={`control-row tools-control-row tools-primary-row control-row-${isZx ? 4 + (workspaceMode === "tilemap" ? 1 : 0) : isPmd ? 3 : 2}`}>
              <div className="tools-zoom-controls" aria-label="Preview zoom">
                <span>Zoom</span>
                <div className="pan-pad tools-zoom-pad">
                  <button type="button" aria-label="Zoom out preview" title="Zoom out" onClick={() => stepZoom(-1)} disabled={previewZoom === "fit"}>−</button>
                  <button type="button" aria-label="Zoom in preview" title="Zoom in" onClick={() => stepZoom(1)} disabled={previewZoom === 16}>+</button>
                  <button type="button" aria-label="Fit preview" title="Fit" onClick={() => setZoom("fit")}>%</button>
                </div>
              </div>
              <label className="check-control tools-option-pixel">
                <input type="checkbox" checked={showPixelGrid} onChange={(event) => setShowPixelGrid(event.target.checked)} />
                <span>Pixel grid</span>
              </label>
              {(isZx || isPmd) ? <label className="check-control tools-option-cell">
                <input type="checkbox" checked={showAttributeGrid} onChange={(event) => setShowAttributeGrid(event.target.checked)} />
                <span>Cell grid {isPmd ? `6×${targetModeId === "pmd85-colorace" ? 2 : 1}` : `8×${displayedAttributeHeight}`}</span>
              </label> : null}
              {isZx ? <label className="check-control tools-option-hide">
                <input
                  type="checkbox"
                  checked={hideAttributes}
                  onChange={(event) => setHideAttributes(event.target.checked)}
                />
                <span>Hide attributes</span>
              </label> : null}
              {workspaceMode === "tilemap" && charsetState.kind === "ready" ? <label className="check-control tools-option-highlight">
                <input type="checkbox" checked={highlightSelectedTileUses} onChange={(event) => setHighlightSelectedTileUses(event.target.checked)} />
                <span>Highlight selected tile uses</span>
              </label> : null}
            </div>
            {flashPreviewAvailable ? (
              <div className="tools-flash-preview" role="radiogroup" aria-label="FLASH preview">
                <span>FLASH preview</span>
                {(["animate", "normal", "inverted"] as const).map((mode) => (
                  <label className="tools-flash-radio" key={mode}>
                    <input
                      type="radio"
                      name="zx-flash-preview-mode"
                      value={mode}
                      disabled={mode !== "normal" && !flashPreviewAvailable}
                      checked={bitmapEditorFlashPreviewMode === mode}
                      onChange={() => setBitmapEditorFlashPreviewMode(mode)}
                    />
                    <span>
                      {mode === "animate" ? "Animate" : mode === "normal" ? "Normal" : "Inverted"}
                    </span>
                  </label>
                ))}
                <small>Live result previews · 500 ms</small>
              </div>
            ) : null}
            <div className={`control-row tools-control-row tools-secondary-row control-row-${2 + (isQl && workspaceMode === "palette" ? 1 : 0) + (isQl && workspaceMode === "palette" && targetModeId === "mode8-mode4-mixed-512x256" ? 1 : 0)}`}>
              <label className="check-control tools-option-pan">
                <input type="checkbox" checked={synchronizePan} onChange={(event) => setSynchronizePan(event.target.checked)} />
                <span>Synchronize pan</span>
              </label>
              <label className="check-control tools-option-zoom" title="Keep source and result preview zoom levels aligned. Selecting an editor or inspection layout disables this option.">
                <input
                  type="checkbox"
                  checked={synchronizeZoom}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setSynchronizeZoom(enabled);
                    if (enabled) {
                      setSourcePreviewZoom(previewZoom);
                      setResultPreviewZoom(previewZoom);
                    }
                  }}
                />
                <span>Synchronize zoom</span>
              </label>
              {isQl && workspaceMode === "palette" ? <label
                className="check-control"
                title="Display Mode 8 pixels at 4/3 × 1 and Mode 4 pixels at 4/3 × 2, producing the physical 4:3 monitor image. Disable for square-pixel inspection."
              >
                <input
                  type="checkbox"
                  checked={scaleQlToDisplayAspect}
                  onChange={(event) => setScaleQlToDisplayAspect(event.target.checked)}
                />
                <span>4:3 display aspect</span>
              </label> : null}
              {isQl &&
                workspaceMode === "palette" &&
                targetModeId === "mode8-mode4-mixed-512x256" ? (
                  <label title="Choose whether the Merged tab preserves both Mode 4 subpixels or averages each pair into one low-resolution perceived color.">
                    <span>Mixed display</span>
                    <select
                      value={qlMixedDisplayResolution}
                      onChange={(event) =>
                        setQlMixedDisplayResolution(
                          event.target.value as QlMixedDisplayResolution,
                        )}
                    >
                      <option value="high">High resolution</option>
                      <option value="low">Low resolution</option>
                    </select>
                  </label>
                ) : null}
            </div>
            </div>
          </details>
          ))}

          {workspaceMode === "palette" ? (
          <aside className="preview-palette-panel" aria-label="Palette summary">
            <div className="palette-control palette-summary-only">
              <div className="palette-summary-heading">
                <span>Palette selection</span>
                <span className="palette-summary">
                  {paletteSelections.map((selection) => (
                    <span className="palette-summary-screen" key={selection.screenIndex}>
                      <span>Screen {selection.screenIndex + 1} · {selection.enabledColorIds.length}</span>
                      <span className="mini-palette" aria-hidden="true">
                        {selection.enabledColorIds.map((color) => {
                          const option = (
                            effectivePaletteOptionsByScreen[selection.screenIndex] ??
                            effectivePaletteOptionsByScreen[0] ??
                            []
                          ).find((candidate) => candidate.code === color);
                          return option === undefined ? null : (
                            <span
                              key={color}
                              style={{
                                background: isZx && selection.brightMode === "auto"
                                  ? `linear-gradient(90deg, ${option.normal} 0 50%, ${option.bright} 50% 100%)`
                                  : isZx && selection.brightMode === "on"
                                    ? option.bright
                                    : option.normal,
                              }}
                            />
                          );
                        })}
                      </span>
                    </span>
                  ))}
                </span>
              </div>
              <div className="palette-screen-grid">
                {paletteSelections.map((selection) => (
                  <section className="palette-screen" key={selection.screenIndex}>
                    <div className="palette-screen-heading">
                      <strong>Screen {selection.screenIndex + 1}</strong>
                      <span>{selection.enabledColorIds.length} selected</span>
                    </div>
                    {isZx ? (
                      <label>
                        <span>BRIGHT</span>
                        <select
                          value={selection.brightMode ?? "auto"}
                          onChange={(event) =>
                            setPaletteBrightMode(
                              selection.screenIndex,
                              event.target.value as BrightMode,
                            )}
                        >
                          <option value="auto">Auto</option>
                          <option value="on">On</option>
                          <option value="off">Off</option>
                        </select>
                      </label>
                    ) : null}
                    <div
                      className="palette-options"
                      role="group"
                      aria-label={`Screen ${selection.screenIndex + 1} available colors`}
                    >
                      {(effectivePaletteOptionsByScreen[selection.screenIndex] ??
                        effectivePaletteOptionsByScreen[0] ??
                        []).map((option) => {
                        const selected = selection.enabledColorIds.includes(option.code);
                        return (
                          <button
                            className={`palette-option${selected ? " selected" : ""}`}
                            type="button"
                            key={option.code}
                            aria-label={`${selected ? "Remove" : "Add"} ${option.name} from Screen ${selection.screenIndex + 1}`}
                            aria-pressed={selected}
                            title={option.name}
                            onClick={() => togglePaletteColor(selection.screenIndex, option.code)}
                          >
                            <span
                              className="palette-swatch"
                              style={{
                                background: isZx && selection.brightMode === "auto"
                                  ? `linear-gradient(90deg, ${option.normal} 0 50%, ${option.bright} 50% 100%)`
                                  : isZx && selection.brightMode === "on"
                                    ? option.bright
                                    : option.normal,
                              }}
                              aria-hidden="true"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
              {paletteValid ? null : (
                <span className="field-error" id="palette-error">
                  Invalid value: select at least one color for every screen.
                </span>
              )}
            </div>
          </aside>
          ) : (
          <aside className={`tilemap-charset-panel${charsetSource === "existing" && existingCharset !== null ? showingSourceCharset ? " has-source-view" : " has-source-tabs" : ""}`} aria-label="Charset selector">
            <div className="tilemap-charset-heading">
              <strong>{showingSourceCharset ? "Source charset" : "Charset tiles"}</strong>
              <span>{showingSourceCharset
                ? `${sourceCharsetCount} source tiles · ${glyphActiveCount} included`
                : `${glyphCount} output tiles${tileEditorEdited ? " · Edited" : ""}`}</span>
            </div>
            {charsetSource === "existing" && existingCharset !== null ? <div className={`tilemap-charset-control-row unified-segmented${showingSourceCharset ? " has-selection-action" : ""}`} role="group" aria-label="Charset tile controls">
                <button className={`secondary compact${showingSourceCharset ? " active" : ""}`} type="button" aria-label="Show source charset tiles" title="Show source charset tiles" aria-pressed={showingSourceCharset} onClick={() => switchCharsetTilesView("source")}>Source</button>
                <button className={`secondary compact${!showingSourceCharset ? " active" : ""}`} type="button" aria-label="Show converted output tiles" title="Show converted output tiles" aria-pressed={!showingSourceCharset} disabled={charsetState.kind !== "ready"} onClick={() => switchCharsetTilesView("output")}>Output</button>
                {showingSourceCharset ? <button className={`secondary compact${charsetSelectionMode ? " active" : ""}`} type="button" disabled={charsetState.kind === "running"} aria-label={charsetSelectionMode ? "Finish editing conversion set" : "Edit conversion set"} aria-pressed={charsetSelectionMode} onClick={toggleCharsetSelectionMode} title="Enable source-tile clicks to include or exclude tiles for the next conversion">{charsetSelectionMode ? "Done" : "Edit set"}</button> : null}
            </div> : null}
            {showingSourceCharset ? <div className="tilemap-selection-mode">
              <span className="control-help" role="status">{charsetSelectionMode
                ? "Source tiles are toggles for the next conversion; changes make the result stale."
                : "Click a source tile to select it for the editor or TILE operation. Inclusion changes only in Edit conversion set mode."}</span>
            </div> : null}
            <div className="tilemap-charset-legend" aria-label="Charset tile indicators">
              {showingSourceCharset
                ? <span><i className="charset-included-indicator" aria-hidden="true" />Included tiles are used on the next conversion</span>
                : <><span><i className="charset-used-indicator" aria-hidden="true" />Used on map</span><span><i className="charset-editor-indicator" aria-hidden="true" />Current editor tile</span></>}
            </div>
            <div
              className="tilemap-glyph-grid"
              aria-label="Loaded or generated charset glyphs"
              onPointerMove={moveCharsetSelection}
              onPointerUp={endCharsetSelection}
              onPointerCancel={endCharsetSelection}
            >
              {glyphCount === 0 ? (
                <span className="control-help">No charset loaded.</span>
              ) : glyphDisplayIndices.map((characterIndex) => {
                const active = glyphActiveIndexSet.has(characterIndex);
                const editorReady = charsetState.kind === "ready";
                const selectable = editorReady || (charsetSource === "existing" && existingCharset !== null);
                const usageCount = tileUsageAvailable
                  ? tileUsageCountByIndex.get(characterIndex) ?? 0
                  : null;
                const usageScale = usageCount === null || usageCount === 0 || maximumTileUsage === 0
                  ? 0
                  : Math.log1p(usageCount) / Math.log1p(maximumTileUsage);
                const usageColor = usageCount === null || usageCount === 0
                  ? undefined
                  : `hsl(${205 - Math.round(160 * usageScale)} 82% 62%)`;
                const usageDescription = usageCount === null
                  ? "Usage unavailable"
                  : usageCount === 0
                    ? "Unused · 0 map cells"
                    : `Used in ${usageCount} map cells`;
                const inclusionDescription = showingSourceCharset
                  ? active ? "Included in conversion" : "Excluded from conversion"
                  : "Included in converted tile set";
                const editorDescription = !showingSourceCharset && editorReady && characterIndex === tileEditorSelected
                  ? " · Current editor tile"
                  : "";
                const sourcePickedDescription = showingSourceCharset && characterIndex === selectedSourceCharsetTile
                  ? " · Selected for editor or tile operation"
                  : "";
                return (
                  <button
                    type="button"
                    className={`glyph-item ${active ? "active" : "inactive"}${usageCount === 0 ? " zero-use" : usageCount === null ? " usage-unknown" : " map-used"}${!charsetSelectionMode && showingSourceCharset && characterIndex === selectedSourceCharsetTile ? " source-picked" : ""}${!showingSourceCharset && editorReady && characterIndex === tileEditorSelected ? " editor-selected" : ""}`}
                    key={characterIndex}
                    data-character-index={characterIndex}
                    title={`Tile ${characterIndex + 1} (index ${characterIndex}) · ${inclusionDescription}${editorDescription}${sourcePickedDescription} · ${usageDescription}`}
                    aria-label={`Tile ${characterIndex + 1}, ${inclusionDescription}${editorDescription}${sourcePickedDescription}, ${usageDescription}`}
                    aria-pressed={selectable ? showingSourceCharset && !charsetSelectionMode
                      ? characterIndex === selectedSourceCharsetTile
                      : active : undefined}
                    disabled={!selectable || charsetState.kind === "running"}
                    ref={(element) => {
                      charsetGlyphRefs.current[characterIndex] = element;
                    }}
                    onClick={(event) => {
                      if (consumeRecentTilePickerClick(characterIndex)) {
                        event.preventDefault();
                        return;
                      }
                      if (showingSourceCharset) {
                        if (!charsetSelectionMode) handleSourceCharsetTileClick(characterIndex);
                      } else if (tileEditorTilePickerActive) {
                        tileEditorTilePickerClickGuardRef.current = { index: characterIndex, until: Date.now() + 500 };
                        applyPickedTilemapIndex(characterIndex);
                      } else {
                        selectEditorTile(characterIndex);
                      }
                    }}
                    onDoubleClick={(event) => {
                      if (consumeRecentTilePickerClick(characterIndex)) {
                        event.preventDefault();
                        return;
                      }
                      if (showingSourceCharset) {
                        if (charsetSelectionMode) handleCharsetDoubleClick(characterIndex);
                      } else if (tileEditorTilePickerActive) {
                        applyPickedTilemapIndex(characterIndex);
                      } else {
                        selectEditorTile(characterIndex);
                      }
                    }}
                    onPointerDown={(event) => {
                      if (consumeRecentTilePickerClick(characterIndex)) {
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                      }
                      if (!showingSourceCharset && tileEditorTilePickerActive) {
                        event.preventDefault();
                        event.stopPropagation();
                        tileEditorTilePickerClickGuardRef.current = { index: characterIndex, until: Date.now() + 500 };
                        applyPickedTilemapIndex(characterIndex);
                      } else if (showingSourceCharset && charsetSelectionMode) {
                        beginCharsetSelection(characterIndex, event);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
                        handleCharsetGlyphKey(characterIndex, event);
                      } else if (event.key === "Delete" && showingSourceCharset && charsetSelectionMode) {
                        event.preventDefault();
                        clearCharsetSelection();
                      } else if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        if (tileEditorTilePickerActive && !showingSourceCharset) applyPickedTilemapIndex(characterIndex);
                        else if (showingSourceCharset && charsetSelectionMode) toggleCharsetCharacter(characterIndex);
                        else if (showingSourceCharset) handleSourceCharsetTileClick(characterIndex);
                        else selectEditorTile(characterIndex);
                      } else if (!editorReady) {
                        handleCharsetGlyphKey(characterIndex, event);
                      }
                    }}
                    onDragStart={(event) => event.preventDefault()}
                  >
                    <img
                      src={glyphDataUrl(glyphCharset!, characterIndex, active, usageCount === 0)}
                      alt=""
                      draggable={false}
                      width="16"
                      height="16"
                    />
                    <span className={`glyph-usage-meter${usageCount === null ? " unavailable" : ""}`} aria-hidden="true">
                      <span style={{ width: `${usageScale * 100}%`, backgroundColor: usageColor }} />
                    </span>
                  </button>
                );
              })}
            </div>
            {charsetSource === "derived" ? (
              <div className="tilemap-charset-freeze">
                <button className="secondary compact" type="button" disabled={charsetState.kind !== "ready" || glyphCount === 0} onClick={freezeGeneratedCharset}>Freeze generated charset</button>
                <span className="control-help">Freeze the current generated tiles to enable conversion selection.</span>
              </div>
            ) : null}
            <div className={`tilemap-charset-actions unified-segmented${showingSourceCharset ? " source-actions" : ""}`} role="group" aria-label={showingSourceCharset ? "Source charset selection actions" : "Output tile actions"}>
              {showingSourceCharset ? <>
                <button className="secondary compact" type="button" disabled={!charsetSelectionMode || charsetSource !== "existing" || existingCharset === null || charsetState.kind === "running" || sourceCharsetCount === 0} onClick={clearCharsetSelection} title="Include all source tiles in the next conversion">Select all</button>
                <button className="secondary compact" type="button" disabled={!charsetSelectionMode || charsetSource !== "existing" || existingCharset === null || charsetState.kind === "running" || sourceCharsetCount === 0} onClick={invertCharsetSelection} title="Invert the source-tile selection">Invert selection</button>
              </> : <>
                <button
                  className="secondary compact"
                  type="button"
                  disabled={!tileUsageAvailable || glyphCount === 0}
                  onClick={toggleEditorTileUsageSort}
                  aria-pressed={tileEditorUsageSort}
                  title={tileEditorUsageSort ? "Show tiles in memory order" : "Sort displayed tiles by usage"}
                >{tileEditorUsageSort ? "Normal" : "Usage"}</button>
                <button className="secondary compact" type="button" disabled={charsetState.kind !== "ready" || glyphCount >= 256} onClick={createEditorTile} title="Add a blank tile">Add</button>
                <button className="secondary compact" type="button" disabled={charsetState.kind !== "ready" || glyphCount <= 1} onClick={deleteEditorTile} title="Delete the selected tile">Del</button>
              </>}
            </div>
          </aside>
          )}

          <div
            className="comparison workbench-preview-dock"
            aria-label="Configurable preview panes"
            data-preview-layout={previewLayout}
            {...workbenchDockDropAttributes("center")}
          >
            {(() => {
            const sourceDock = workbenchWindowLayout("source").dock;
            const sourceDockTarget = workbenchDockLayerFor(sourceDock);
            const sourcePreviewPane = (
            <section
              className={`preview-panel source-panel${workbenchSourceFloating ? ` preview-panel-floating preview-source-window${workbenchSourceFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : " preview-panel-docked"} ${workspaceMode === "tilemap" ? "tilemap-preview-panel" : ""}`}
              {...workbenchWindowDragAttributes("source")}
              data-workbench-window="source"
              hidden={!workbenchWindowLayout("source").visible}
              data-dock={sourceDock}
              data-minimized={workbenchWindowLayout("source").minimized ? "true" : "false"}
              aria-labelledby="source-preview-title"
              style={workbenchDockWindowStyle("source", workbenchSourceFloating ? { zIndex: workbenchWindowZIndex("source") } : undefined)}
              onPointerDown={() => { if (workbenchSourceFloating) bringWorkbenchWindowToFront("source"); }}
              onFocusCapture={() => { if (workbenchSourceFloating) bringWorkbenchWindowToFront("source"); }}
            >
              {!workbenchSourceFloating && sourceDock === "center" ? (
                <div
                  className="preview-docked-resize-handle preview-source-docked-resize"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize Source preview"
                  aria-valuemin={240}
                  aria-valuemax={Math.max(240, (workbenchPreviewWorkspaceRef.current?.clientWidth ?? 1200) - 288)}
                  aria-valuenow={Math.min(Math.max(240, (workbenchPreviewWorkspaceRef.current?.clientWidth ?? 1200) - 288), Math.round(workbenchSourceDockedWidth * Math.max(480, (workbenchPreviewWorkspaceRef.current?.clientWidth ?? 1200) - 80)))}
                  tabIndex={0}
                  onPointerDown={(event) => startWorkbenchDockedPreviewResize("source", event)}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 0.08 : 0.02;
                    if (event.key === "ArrowRight") setWorkbenchSourceDockedWidth((width) => Math.min(10, width + step));
                    if (event.key === "ArrowLeft") setWorkbenchSourceDockedWidth((width) => Math.max(0.25, width - step));
                  }}
                />
              ) : null}
              <div
                className="preview-panel-heading"
                tabIndex={0}
                onPointerDown={(event) => startWorkbenchTitlebarDrag("source", event)}
                onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("source", event)}
                onClick={(event) => handleWorkbenchTitlebarClick("source", event)}
              >
                <h3 className="preview-panel-title" id="source-preview-title">
                  {sourcePreviewContent === "image" || sourcePreviewContent === "source-image"
                    ? workspaceMode === "tilemap" ? "Palette source" : "Conversion input"
                      : sourcePreviewContent === "result-image"
                        ? resultLabel
                    : sourcePreviewContent === "pre-attribute"
                      ? "Pre-attribute dither"
                    : sourcePreviewContent === "screen-1"
                      ? hasVerticalSpatialTarget ? "Full resolution" : "Screen 1"
                    : sourcePreviewContent === "screen-2"
                      ? hasVerticalSpatialTarget ? "Analytic" : "Screen 2"
                    : sourcePreviewContent === "merged-low"
                      ? "Merged · low resolution"
                    : sourcePreviewContent === "merged-high"
                      ? "Merged · high resolution"
                    : sourcePreviewContent === "palette-usage"
                      ? "Palette usage"
                      : sourcePreviewContent === "tile-usage"
                        ? "Used tiles"
                        : sourcePreviewContent === "unified-editor"
                          ? "Unified editor"
                        : sourcePreviewContent === "bitmap-editor"
                          ? "Bitmap editor"
                        : sourcePreviewContent === "difference"
                          ? "Difference heatmap"
                        : "Inspector"}
                </h3>
                {workbenchWindowActions("source", true)}
                <label className="preview-content-selector">
                  <span className="sr-only">Source window content</span>
                  <select
                    value={sourcePreviewContent}
                    disabled={bitmapEditorActiveSide === "result"}
                    onChange={(event) => {
                      selectPreviewContent("source", event.target.value as PreviewContent);
                    }}
                  >
                    <option value="image">Source image</option>
                    <option value="result-image">Result image</option>
                    {workspaceMode === "palette" ? <option value="pre-attribute">Pre-attribute dither</option> : null}
                    {hasMixedScreenTarget ? <>
                      <option value="screen-1">Screen 1</option>
                      <option value="screen-2">Screen 2</option>
                    </> : null}
                    {hasVerticalSpatialTarget ? <>
                      <option value="screen-1">Full resolution</option>
                      <option value="screen-2">Analytic</option>
                    </> : null}
                    {hasQlMixedResolutionTarget ? <>
                      <option value="merged-low">Merged · low resolution</option>
                      <option value="merged-high">Merged · high resolution</option>
                    </> : null}
                    <option value="palette-usage">Palette usage</option>
                    {workspaceMode === "tilemap" ? <option value="tile-usage">Used tiles</option> : null}
                    <option value="unified-editor">Unified editor</option>
                    {workspaceMode === "palette" ? <option value="bitmap-editor">Bitmap editor</option> : null}
                    <option value="difference">Difference heatmap</option>
                    <option value="inspector">Inspector</option>
                  </select>
                </label>
                <div className="preview-zoom-actions" aria-label="Source preview zoom">
                  <button className="secondary compact" type="button" aria-label="Zoom out Source preview" title="Zoom out" onClick={() => stepPreviewZoom("source", -1)} disabled={bitmapEditorActiveSide === "result" || sourcePreviewZoom === "fit"}>−</button>
                  <button className="secondary compact" type="button" aria-label="Zoom in Source preview" title="Zoom in" onClick={() => stepPreviewZoom("source", 1)} disabled={bitmapEditorActiveSide === "result" || sourcePreviewZoom === 16}>+</button>
                  <button className="secondary compact" type="button" aria-label="Fit Source preview" title="Fit" onClick={() => fitPreview("source")}>%</button>
                </div>
                {workbenchSourceFloating ? (
                  <span
                    className="workbench-window-drag-handle"
                    role="button"
                    tabIndex={0}
                    aria-label="Move Source preview window"
                    title="Drag to move Source preview"
                    onPointerDown={(event) => startWorkbenchSectionDrag("source", event)}
                    onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
                    onKeyDown={(event) => {
                      const step = event.shiftKey ? 32 : 8;
                      if (event.key === "ArrowLeft") setWorkbenchSourceFloatingX((x) => Math.max(8, x - step));
                      if (event.key === "ArrowRight") setWorkbenchSourceFloatingX((x) => x + step);
                      if (event.key === "ArrowUp") setWorkbenchSourceFloatingY((y) => Math.max(8, y - step));
                      if (event.key === "ArrowDown") setWorkbenchSourceFloatingY((y) => y + step);
                    }}
                  >⠿</span>
                ) : null}
              </div>
              {workbenchDockSplitHandle("source")}
              {sourcePreviewContent === "bitmap-editor" ? fullBitmapEditorPreview("source") : sourcePreviewContent === "image" || sourcePreviewContent === "source-image" || sourcePreviewContent === "result-image" || (hasVerticalSpatialTarget && (sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2")) ? <div
                className={`preview-frame preview-viewport source-preview-frame ${draggingSide === "source" ? "dragging" : ""}`}
                ref={sourceViewportRef}
                onScroll={(event) => handlePreviewScroll("source", event)}
                onPointerDown={(event) => beginPreviewDrag("source", event)}
                onPointerMove={movePreviewDrag}
                onPointerUp={endPreviewDrag}
                onPointerCancel={endPreviewDrag}
                onWheel={(event) => handlePreviewWheel("source", event)}
                onFocusCapture={() => markPanSource("source")}
              >
                {image === null
                  ? null
                  : (
                    <div
                      className={`preview-stage ${sourceZoom === "fit" ? "fit-stage" : ""}${sourceShowsImage ? " source-image-stage" : ""}`}
                      style={{
                        width: sourceFitStageSize !== null ? `${sourceFitStageSize.width}px` : sourceStageWidth,
                        height: sourceFitStageSize !== null ? `${sourceFitStageSize.height}px` : undefined,
                        aspectRatio: sourceStageAspectRatio,
                      }}
                    >
                      <canvas
                        ref={sourcePreviewContent === "result-image" || (hasVerticalSpatialTarget && (sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2")) ? sourceConvertedCanvasRef : canvasRef}
                        className={framing === "crop"
                          ? `crop-editor-canvas crop-pointer-${cropPointerMode}`
                          : undefined}
                        aria-label={sourcePreviewContent === "result-image" || (hasVerticalSpatialTarget && (sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2"))
                          ? "Converted hardware preview"
                          : framing === "crop"
                          ? "Source image crop editor"
                          : "Decoded source image preview"}
                        tabIndex={sourcePreviewContent === "result-image" || (hasVerticalSpatialTarget && (sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2")) ? 0 : framing === "crop" ? 0 : undefined}
                        onPointerDown={sourcePreviewContent === "result-image" ? selectResultPixel : framing === "crop" ? beginCropSelection : undefined}
                        onPointerMove={sourcePreviewContent === "result-image" ? inspectResultPixel : framing === "crop" ? moveCropSelection : undefined}
                        onPointerUp={sourcePreviewContent === "result-image" ? undefined : framing === "crop" ? endCropSelection : undefined}
                        onPointerCancel={sourcePreviewContent === "result-image" ? undefined : framing === "crop" ? endCropSelection : undefined}
                        onDoubleClick={sourcePreviewContent === "result-image" ? clearBitmapEditorSelectionOnDoubleClick : framing === "crop" ? clearCropSelection : undefined}
                        onKeyDown={sourcePreviewContent === "result-image" ? handleInspectorKey : framing === "crop" ? moveCropWithKeyboard : undefined}
                        onPointerLeave={framing === "crop"
                          ? () => {
                              if (cropDragRef.current === null) {
                                setCropPointerMode("create");
                              }
                            }
                          : undefined}
                      />
                      {sourcePreviewContent !== "result-image" && framing === "crop" && cropOverlay !== null ? (
                        <svg
                          className="crop-selection-overlay"
                          viewBox={`0 0 ${cropSourceSize?.width ?? 1} ${cropSourceSize?.height ?? 1}`}
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          <path
                            className="crop-selection-shade"
                            d={`M0 0H${cropSourceSize?.width ?? 1}V${cropSourceSize?.height ?? 1}H0Z M${cropOverlay.x} ${cropOverlay.y}h${cropOverlay.width}v${cropOverlay.height}h-${cropOverlay.width}Z`}
                            fillRule="evenodd"
                          />
                          <rect
                            className="crop-selection-rect"
                            x={cropOverlay.x}
                            y={cropOverlay.y}
                            width={cropOverlay.width}
                            height={cropOverlay.height}
                          />
                          {(() => {
                            const size = Math.max(
                              8,
                              Math.round(Math.min(cropSourceSize?.width ?? 8, cropSourceSize?.height ?? 8) * 0.02),
                            );
                            const half = size / 2;
                            const points: readonly (readonly [number, number])[] = [
                              [cropOverlay.x, cropOverlay.y],
                              [cropOverlay.x + cropOverlay.width / 2, cropOverlay.y],
                              [cropOverlay.x + cropOverlay.width, cropOverlay.y],
                              [cropOverlay.x + cropOverlay.width, cropOverlay.y + cropOverlay.height / 2],
                              [cropOverlay.x + cropOverlay.width, cropOverlay.y + cropOverlay.height],
                              [cropOverlay.x + cropOverlay.width / 2, cropOverlay.y + cropOverlay.height],
                              [cropOverlay.x, cropOverlay.y + cropOverlay.height],
                              [cropOverlay.x, cropOverlay.y + cropOverlay.height / 2],
                            ];
                            return points.map(([x, y], index) => (
                              <rect
                                className="crop-resize-handle"
                                key={index}
                                x={x - half}
                                y={y - half}
                                width={size}
                                height={size}
                              />
                            ));
                          })()}
                        </svg>
                      ) : null}
                      {sourcePreviewContent === "result-image" && inspectionCellOverlay !== null ? (
                        <svg className="inspection-cell-overlay" viewBox={`0 0 ${displayedWidth} ${displayedHeight}`} preserveAspectRatio="none" aria-hidden="true">
                          <rect {...inspectionCellOverlay} />
                        </svg>
                      ) : null}
                      {sourcePreviewContent === "result-image" && bitmapEditorSelectionOverlay !== null ? (
                        <svg className="bitmap-editor-selection-overlay" viewBox={`0 0 ${displayedWidth} ${displayedHeight}`} preserveAspectRatio="none" aria-hidden="true">
                          <rect {...bitmapEditorSelectionOverlay} />
                        </svg>
                      ) : null}
                      {sourcePreviewContent === "result-image" && tilemapEditorSelectionOverlay !== null ? (
                        <svg className="tilemap-selection-overlay" viewBox={`0 0 ${displayedWidth} ${displayedHeight}`} preserveAspectRatio="none" aria-hidden="true">
                          {highlightedTileCells.map((cellIndexRect) => <rect className="tilemap-matching-cell-outline" key={`${cellIndexRect.x},${cellIndexRect.y}`} {...cellIndexRect} />)}
                          <rect {...tilemapEditorSelectionOverlay} />
                        </svg>
                      ) : null}
                      {bitmapEditorActiveSide === "result" && sourcePreviewContent === "result-image" ? <>
                        <svg className="bitmap-editor-navigator-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" role="application" tabIndex={0} aria-label="Bitmap editor navigator · click or drag to pan" onPointerDown={(event) => beginBitmapEditorNavigatorDrag("source", event)} onPointerMove={moveBitmapEditorNavigatorDrag} onPointerUp={endBitmapEditorNavigatorDrag} onPointerCancel={endBitmapEditorNavigatorDrag}>
                          <rect x={bitmapEditorNavigatorViewport.left * 1000} y={bitmapEditorNavigatorViewport.top * 1000} width={bitmapEditorNavigatorViewport.width * 1000} height={bitmapEditorNavigatorViewport.height * 1000} />
                        </svg>
                        <span className="bitmap-editor-navigator-label">Navigator · drag to pan</span>
                      </> : null}
                    </div>
                  )}
              </div> : (
                <div className="preview-frame preview-content-card" aria-live="polite">
                  {sourcePreviewContent === "palette-usage" ? (
                    paletteUsage === null ? <p>Palette usage appears with the converted preview.</p> : (
                      <>
                        <p><strong>{paletteUsage.normalCells + paletteUsage.brightCells}</strong> attribute cells analyzed</p>
                        <label className="preview-filter-control"><span>Show</span><select value={paletteUsageFilter} onChange={(event) => setPaletteUsageFilter(event.target.value as "used" | "all")}><option value="used">Used colors only</option><option value="all">All colors</option></select></label>
                        <div className="usage-palette">
                          {visiblePaletteUsageColors.map((color) => {
                            const normalUsed = paletteUsage.normalColorCodes.includes(color.code);
                            const brightUsed = paletteUsage.brightColorCodes.includes(color.code);
                            return <button type="button" className={`usage-color usage-color-button ${normalUsed || brightUsed ? "used" : ""}${selectedPaletteColor === color.code ? " selected" : ""}`} key={color.code} aria-pressed={selectedPaletteColor === color.code} onClick={() => setSelectedPaletteColor(selectedPaletteColor === color.code ? null : color.code)}>
                              <span className="usage-swatches" aria-hidden="true"><span style={{ backgroundColor: color.normal }} /><span style={{ backgroundColor: color.bright }} /></span>
                              <span>{color.name}</span><small>N {paletteUsage.normalColorCounts[color.code]} ({paletteUsagePercent(paletteUsage.normalColorCounts[color.code] ?? 0)}) · B {paletteUsage.brightColorCounts[color.code]} ({paletteUsagePercent(paletteUsage.brightColorCounts[color.code] ?? 0)})</small>
                            </button>;
                          })}
                        </div>
                      </>
                    )
                  ) : sourcePreviewContent === "tile-usage" ? (
                    tileUsage.length === 0 ? <p>Run Tilemap High to inspect tile usage.</p> : <>
                      <label className="preview-filter-control"><span>Show</span><select value={tileUsageFilter} onChange={(event) => setTileUsageFilter(event.target.value as "used" | "all")}><option value="used">Used tiles only</option><option value="all">All tiles</option></select></label>
                      <div className="preview-usage-list">
                        {visibleTileUsage.map(({ characterIndex, count }) => <button type="button" className={`preview-usage-row${tileEditorSelected === characterIndex ? " selected" : ""}`} key={characterIndex} aria-pressed={tileEditorSelected === characterIndex} onClick={() => { selectUsedTile(characterIndex); }}><span>Tile {characterIndex} · {charsetSource === "existing" ? "Loaded" : "Calculated"}</span><strong>{count} cells</strong></button>)}
                      </div>
                    </>
                  ) : sourcePreviewContent === "unified-editor" ? (
                    unifiedEditorPreview
                  ) : sourcePreviewContent === "pre-attribute" || sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2" || sourcePreviewContent === "merged-low" || sourcePreviewContent === "merged-high" ? (
                    windowImageFor(sourcePreviewContent)
                  ) : sourcePreviewContent === "difference" ? (
                    differencePreviewDataUrl === null ? <p>Convert an image to inspect the difference heatmap.</p> : <img className="preview-difference-image" src={differencePreviewDataUrl} alt="Difference heatmap between adjusted source and output" />
                  ) : inspection === null ? <p>Point at the converted preview, or focus it and use arrow keys, to inspect a cell.</p> : (
                    <dl className="attribute-readout">
                      <div><dt>Pixel</dt><dd>{inspection.pixelX}, {inspection.pixelY}</dd></div>
                      <div><dt>Cell</dt><dd>{inspection.cellX}, {inspection.cellY}</dd></div>
                      <div><dt>Attribute</dt><dd>{inspection.attributeHex} · offset {inspection.attributeOffset}</dd></div>
                      <div><dt>INK / PAPER</dt><dd>{inspection.ink} / {inspection.paper}</dd></div>
                      <div><dt>BRIGHT</dt><dd>{inspection.bright ? "On" : "Off"}</dd></div>
                    </dl>
                  )}
                </div>
              )}
              {isPmd && targetModeId === "pmd85-2-tv" ? (
                <p className="pmd-tv-note">
                  Blink animation is unsupported. Bit 7 is accepted and displayed as static intensity: 10 Bright, 11 Dim.
                </p>
              ) : null}
              {workbenchSourceFloating ? (
                <div
                  className="workbench-floating-resize-handle"
                  role="button"
                  tabIndex={0}
                  aria-label="Resize Source preview window"
                  onPointerDown={(event) => startWorkbenchFloatingResize("source", event)}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 32 : 8;
                    if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("source", step, 0);
                    if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("source", -step, 0);
                    if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("source", 0, step);
                    if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("source", 0, -step);
                  }}
                />
              ) : null}
            </section>
            );
            return sourceDock !== "center" && sourceDockTarget !== null
              ? createPortal(sourcePreviewPane, sourceDockTarget, "source-preview")
              : sourcePreviewPane;
            })()}
            {(() => {
            const resultDock = workbenchWindowLayout("result").dock;
            const resultDockTarget = workbenchDockLayerFor(resultDock);
            const resultPreviewPane = (
            <section
              className={`preview-panel result-panel${workbenchResultFloating ? ` preview-panel-floating preview-result-window${workbenchResultFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : " preview-panel-docked"} ${workspaceMode === "tilemap" ? "tilemap-preview-panel" : ""}`}
              {...workbenchWindowDragAttributes("result")}
              data-workbench-window="result"
              hidden={!workbenchWindowLayout("result").visible}
              data-dock={resultDock}
              data-minimized={workbenchWindowLayout("result").minimized ? "true" : "false"}
              aria-labelledby="result-preview-title"
              style={workbenchDockWindowStyle("result", workbenchResultFloating ? { zIndex: workbenchWindowZIndex("result") } : undefined)}
              onPointerDown={() => { if (workbenchResultFloating) bringWorkbenchWindowToFront("result"); }}
              onFocusCapture={() => { if (workbenchResultFloating) bringWorkbenchWindowToFront("result"); }}
            >
              {!workbenchResultFloating && resultDock === "center" ? (
                <div
                  className="preview-docked-resize-handle preview-result-docked-resize"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize Result preview"
                  aria-valuemin={240}
                  aria-valuemax={Math.max(240, (workbenchPreviewWorkspaceRef.current?.clientWidth ?? 1200) - 288)}
                  aria-valuenow={Math.min(Math.max(240, (workbenchPreviewWorkspaceRef.current?.clientWidth ?? 1200) - 288), Math.round(workbenchResultDockedWidth * Math.max(480, (workbenchPreviewWorkspaceRef.current?.clientWidth ?? 1200) - 80)))}
                  tabIndex={0}
                  onPointerDown={(event) => startWorkbenchDockedPreviewResize("result", event)}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 0.08 : 0.02;
                    if (event.key === "ArrowRight") setWorkbenchResultDockedWidth((width) => Math.min(10, width + step));
                    if (event.key === "ArrowLeft") setWorkbenchResultDockedWidth((width) => Math.max(0.25, width - step));
                  }}
                />
              ) : null}
              <div
                className="preview-panel-heading"
                tabIndex={0}
                onPointerDown={(event) => startWorkbenchTitlebarDrag("result", event)}
                onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("result", event)}
                onClick={(event) => handleWorkbenchTitlebarClick("result", event)}
              >
                <h3 className="preview-panel-title" id="result-preview-title">{resultPreviewContent === "image" || resultPreviewContent === "result-image" ? resultLabel : resultPreviewContent === "source-image" ? "Conversion input" : resultPreviewContent === "bitmap-editor" ? "Bitmap editor" : resultPreviewContent === "pre-attribute" ? "Pre-attribute dither" : resultPreviewContent === "screen-1" ? hasVerticalSpatialTarget ? "Full resolution" : "Screen 1" : resultPreviewContent === "screen-2" ? hasVerticalSpatialTarget ? "Analytic" : "Screen 2" : resultPreviewContent === "merged-low" ? "Merged · low resolution" : resultPreviewContent === "merged-high" ? "Merged · high resolution" : resultPreviewContent === "palette-usage" ? "Palette usage" : resultPreviewContent === "tile-usage" ? "Used tiles" : resultPreviewContent === "unified-editor" ? "Unified editor" : resultPreviewContent === "difference" ? "Difference heatmap" : "Inspector"}</h3>
                {workbenchWindowActions("result", true)}
                <label className="preview-content-selector">
                  <span className="sr-only">Result window content</span>
                  <select
                    value={resultPreviewContent}
                    disabled={bitmapEditorActiveSide === "source"}
                    onChange={(event) => {
                      selectPreviewContent("result", event.target.value as PreviewContent);
                    }}
                  >
                    <option value="image">Result image</option>
                    <option value="source-image">Source image</option>
                    {workspaceMode === "palette" ? <option value="pre-attribute">Pre-attribute dither</option> : null}
                    {hasMixedScreenTarget ? <>
                      <option value="screen-1">Screen 1</option>
                      <option value="screen-2">Screen 2</option>
                    </> : null}
                    {hasVerticalSpatialTarget ? <>
                      <option value="screen-1">Full resolution</option>
                      <option value="screen-2">Analytic</option>
                    </> : null}
                    {hasQlMixedResolutionTarget ? <>
                      <option value="merged-low">Merged · low resolution</option>
                      <option value="merged-high">Merged · high resolution</option>
                    </> : null}
                    <option value="palette-usage">Palette usage</option>
                    {workspaceMode === "tilemap" ? <option value="tile-usage">Used tiles</option> : null}
                    <option value="unified-editor">Unified editor</option>
                    {workspaceMode === "palette" ? <option value="bitmap-editor">Bitmap editor</option> : null}
                    <option value="difference">Difference heatmap</option>
                    <option value="inspector">Inspector</option>
                  </select>
                </label>
                <div className="preview-zoom-actions" aria-label="Result preview zoom">
                  <button className="secondary compact" type="button" aria-label="Zoom out Result preview" title="Zoom out" onClick={() => stepPreviewZoom("result", -1)} disabled={bitmapEditorActiveSide === "source" || resultPreviewZoom === "fit"}>−</button>
                  <button className="secondary compact" type="button" aria-label="Zoom in Result preview" title="Zoom in" onClick={() => stepPreviewZoom("result", 1)} disabled={bitmapEditorActiveSide === "source" || resultPreviewZoom === 16}>+</button>
                  <button className="secondary compact" type="button" aria-label="Fit Result preview" title="Fit" onClick={() => fitPreview("result")}>%</button>
                </div>
                {workbenchResultFloating ? (
                  <span
                    className="workbench-window-drag-handle"
                    role="button"
                    tabIndex={0}
                    aria-label="Move Result preview window"
                    title="Drag to move Result preview"
                    onPointerDown={(event) => startWorkbenchSectionDrag("result", event)}
                    onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
                    onKeyDown={(event) => {
                      const step = event.shiftKey ? 32 : 8;
                      if (event.key === "ArrowLeft") setWorkbenchResultFloatingX((x) => Math.max(8, x - step));
                      if (event.key === "ArrowRight") setWorkbenchResultFloatingX((x) => x + step);
                      if (event.key === "ArrowUp") setWorkbenchResultFloatingY((y) => Math.max(8, y - step));
                      if (event.key === "ArrowDown") setWorkbenchResultFloatingY((y) => y + step);
                    }}
                  >⠿</span>
                ) : null}
              </div>
              {workbenchDockSplitHandle("result")}
              {resultPreviewContent === "bitmap-editor" ? fullBitmapEditorPreview("result") : resultPreviewContent === "image" || resultPreviewContent === "result-image" || resultPreviewContent === "source-image" || (hasVerticalSpatialTarget && (resultPreviewContent === "screen-1" || resultPreviewContent === "screen-2")) ? <div
                className={`preview-frame preview-viewport zx-preview ${draggingSide === "result" ? "dragging" : ""}`}
                ref={resultViewportRef}
                onScroll={(event) => handlePreviewScroll("result", event)}
                onPointerDown={(event) => beginPreviewDrag("result", event)}
                onPointerMove={movePreviewDrag}
                onPointerUp={endPreviewDrag}
                onPointerCancel={endPreviewDrag}
                onWheel={(event) => handlePreviewWheel("result", event)}
                onFocusCapture={() => markPanSource("result")}
                style={{ backgroundColor: borderHex, borderColor: borderHex }}
              >
                {((resultPreviewContent === "source-image" && image !== null) ||
                  (standaloneTilemapPreview && (resultPreviewContent === "image" || resultPreviewContent === "result-image")) ||
                  (displayedResult !== null &&
                    (workspaceMode === "palette" || charsetState.kind === "ready")))
                  ? (
                    <div
                      className={[
                        "preview-stage",
                        resultZoom === "fit" ? "fit-stage" : "",
                        resultPreviewContent === "source-image" ? "source-image-stage" : "",
                        showPixelGrid && resultZoom !== "fit" && resultZoom >= 4 ? "show-pixel-grid" : "",
                        showAttributeGrid ? "show-attribute-grid" : "",
                      ].filter(Boolean).join(" ")}
                      style={{
                        width: resultFitStageSize !== null ? `${resultFitStageSize.width}px` : resultStageWidth,
                        height: resultFitStageSize !== null ? `${resultFitStageSize.height}px` : undefined,
                        aspectRatio: resultStageAspectRatio,
                      }}
                    >
                      <canvas
                        ref={resultPreviewContent === "source-image" ? canvasRef : convertedCanvasRef}
                        className={tilemapPutActive && unifiedTileEditorContext === "stamp" && workspaceMode === "tilemap" && resultPreviewContent !== "source-image" ? "tilemap-put-cursor" : undefined}
                        aria-label={resultPreviewContent === "source-image" ? "Decoded source image preview" : "Converted hardware preview"}
                        aria-describedby="inspection-help"
                        tabIndex={resultPreviewContent === "source-image" ? undefined : 0}
                        onPointerMove={resultPreviewContent === "source-image" ? undefined : tilemapPutActive && unifiedTileEditorContext === "stamp" && workspaceMode === "tilemap" ? handleTilemapPutPointerMove : inspectResultPixel}
                        onPointerDown={resultPreviewContent === "source-image" ? undefined : tilemapPutActive && unifiedTileEditorContext === "stamp" && workspaceMode === "tilemap" ? handleTilemapPutPointerDown : selectResultPixel}
                        onPointerUp={resultPreviewContent === "source-image" ? undefined : handleTilemapPutPointerEnd}
                        onPointerCancel={resultPreviewContent === "source-image" ? undefined : handleTilemapPutPointerEnd}
                        onDoubleClick={resultPreviewContent === "source-image" ? undefined : clearBitmapEditorSelectionOnDoubleClick}
                        onKeyDown={resultPreviewContent === "source-image" ? undefined : handleInspectorKey}
                      />
                      <svg
                        className="pixel-grid-overlay"
                        viewBox={`0 0 ${displayedWidth} ${displayedHeight}`}
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <path d={gridPathForDimensions(displayedWidth, displayedHeight, 1, 1)} vectorEffect="non-scaling-stroke" />
                      </svg>
                      {(isZx || isPmd) && bitmapEditorActiveSide !== "source" ? <svg
                        className="attribute-grid-overlay"
                        viewBox={`0 0 ${displayedWidth} ${displayedHeight}`}
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <path d={gridPathForDimensions(displayedWidth, displayedHeight, isPmd ? 6 : 8, isPmd ? (targetModeId === "pmd85-colorace" ? 2 : 1) : displayedAttributeHeight)} vectorEffect="non-scaling-stroke" />
                      </svg> : null}
                      {resultPreviewContent !== "source-image" && inspectionCellOverlay !== null ? (
                        <svg className="inspection-cell-overlay" viewBox={`0 0 ${displayedWidth} ${displayedHeight}`} preserveAspectRatio="none" aria-hidden="true">
                          <rect {...inspectionCellOverlay} />
                        </svg>
                      ) : null}
                      {resultPreviewContent !== "source-image" && bitmapEditorSelectionOverlay !== null ? (
                        <svg className="bitmap-editor-selection-overlay" viewBox={`0 0 ${displayedWidth} ${displayedHeight}`} preserveAspectRatio="none" aria-hidden="true">
                          <rect {...bitmapEditorSelectionOverlay} />
                        </svg>
                      ) : null}
                      {resultPreviewContent !== "source-image" && tilemapEditorSelectionOverlay !== null ? (
                        <svg className="tilemap-selection-overlay" viewBox={`0 0 ${displayedWidth} ${displayedHeight}`} preserveAspectRatio="none" aria-hidden="true">
                          {highlightedTileCells.map((cellIndexRect) => <rect className="tilemap-matching-cell-outline" key={`${cellIndexRect.x},${cellIndexRect.y}`} {...cellIndexRect} />)}
                          <rect {...tilemapEditorSelectionOverlay} />
                        </svg>
                      ) : null}
                      {bitmapEditorActiveSide === "source" && (resultPreviewContent === "image" || resultPreviewContent === "result-image") ? <>
                        <svg className="bitmap-editor-navigator-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" role="application" tabIndex={0} aria-label="Bitmap editor navigator · click or drag to pan" onPointerDown={(event) => beginBitmapEditorNavigatorDrag("result", event)} onPointerMove={moveBitmapEditorNavigatorDrag} onPointerUp={endBitmapEditorNavigatorDrag} onPointerCancel={endBitmapEditorNavigatorDrag}>
                          <rect x={bitmapEditorNavigatorViewport.left * 1000} y={bitmapEditorNavigatorViewport.top * 1000} width={bitmapEditorNavigatorViewport.width * 1000} height={bitmapEditorNavigatorViewport.height * 1000} />
                        </svg>
                        <span className="bitmap-editor-navigator-label">Navigator · drag to pan</span>
                      </> : null}
                      {workspaceMode === "tilemap" && tilemapStale ? (
                        <span className="stale-preview-badge">
                          Stale · press Convert High
                        </span>
                      ) : null}
                      </div>
                  )
                  : <p className="preview-placeholder">
                      {workspaceMode === "tilemap"
                        ? charsetState.kind === "running"
                          ? "Building decoder reconstruction…"
                          : "Run Tilemap High to generate the reconstruction."
                        : "A Draft preview will appear automatically."}
                    </p>}
              </div> : (
                <div className="preview-frame preview-content-card" aria-live="polite">
                  {resultPreviewContent === "palette-usage" ? (
                    paletteUsage === null ? <p>Palette usage appears with the converted preview.</p> : (
                      <>
                        <p><strong>{paletteUsage.normalCells + paletteUsage.brightCells}</strong> attribute cells analyzed · <strong>{paletteUsage.normalColorCodes.length + paletteUsage.brightColorCodes.length}</strong> colors used</p>
                        <label className="preview-filter-control"><span>Show</span><select value={paletteUsageFilter} onChange={(event) => setPaletteUsageFilter(event.target.value as "used" | "all")}><option value="used">Used colors only</option><option value="all">All colors</option></select></label>
                        <div className="usage-palette">
                          {visiblePaletteUsageColors.map((color) => {
                            const normalUsed = paletteUsage.normalColorCodes.includes(color.code);
                            const brightUsed = paletteUsage.brightColorCodes.includes(color.code);
                            return <button type="button" className={`usage-color usage-color-button ${normalUsed || brightUsed ? "used" : ""}${selectedPaletteColor === color.code ? " selected" : ""}`} key={color.code} aria-pressed={selectedPaletteColor === color.code} onClick={() => setSelectedPaletteColor(selectedPaletteColor === color.code ? null : color.code)}>
                              <span className="usage-swatches" aria-hidden="true"><span style={{ backgroundColor: color.normal }} /><span style={{ backgroundColor: color.bright }} /></span>
                              <span>{color.name}</span><small>N {paletteUsage.normalColorCounts[color.code]} ({paletteUsagePercent(paletteUsage.normalColorCounts[color.code] ?? 0)}) · B {paletteUsage.brightColorCounts[color.code]} ({paletteUsagePercent(paletteUsage.brightColorCounts[color.code] ?? 0)})</small>
                            </button>;
                          })}
                        </div>
                      </>
                    )
                  ) : resultPreviewContent === "tile-usage" ? (
                    tileUsage.length === 0 ? <p>Run Tilemap High to inspect tile usage.</p> : <>
                      <label className="preview-filter-control"><span>Show</span><select value={tileUsageFilter} onChange={(event) => setTileUsageFilter(event.target.value as "used" | "all")}><option value="used">Used tiles only</option><option value="all">All tiles</option></select></label>
                      <div className="preview-usage-list">{visibleTileUsage.map(({ characterIndex, count }) => <button type="button" className={`preview-usage-row${tileEditorSelected === characterIndex ? " selected" : ""}`} key={characterIndex} aria-pressed={tileEditorSelected === characterIndex} onClick={() => { selectUsedTile(characterIndex); }}><span>Tile {characterIndex} · {charsetSource === "existing" ? "Loaded" : "Calculated"}</span><strong>{count} cells</strong></button>)}</div>
                    </>
                  ) : resultPreviewContent === "unified-editor" ? (
                    unifiedEditorPreview
                  ) : resultPreviewContent === "pre-attribute" || resultPreviewContent === "screen-1" || resultPreviewContent === "screen-2" || resultPreviewContent === "merged-low" || resultPreviewContent === "merged-high" ? (
                    windowImageFor(resultPreviewContent)
                  ) : resultPreviewContent === "difference" ? (
                    differencePreviewDataUrl === null ? <p>Convert an image to inspect the difference heatmap.</p> : <img className="preview-difference-image" src={differencePreviewDataUrl} alt="Difference heatmap between adjusted source and output" />
                  ) : inspection === null ? <p>Point at the converted preview, or focus it and use arrow keys, to inspect a cell.</p> : <dl className="attribute-readout"><div><dt>Pixel</dt><dd>{inspection.pixelX}, {inspection.pixelY}</dd></div><div><dt>Cell</dt><dd>{inspection.cellX}, {inspection.cellY}</dd></div><div><dt>Attribute</dt><dd>{inspection.attributeHex} · offset {inspection.attributeOffset}</dd></div><div><dt>INK / PAPER</dt><dd>{inspection.ink} / {inspection.paper}</dd></div><div><dt>BRIGHT</dt><dd>{inspection.bright ? "On" : "Off"}</dd></div></dl>}
                </div>
              )}
              {workspaceMode === "palette" ? (
              <div
                className="output-palette-bar"
                aria-label={`${outputPreviewStage === "merged"
                  ? targetModeId.includes("vertical-spatial")
                    ? "Analytic mixed used"
                    : "Merged used"
                  : outputPreviewStage === "screen-2"
                    ? targetModeId.includes("vertical-spatial")
                      ? "Analytic mixed used"
                      : "Screen 2 selected"
                    : "Screen 1 selected"} palette`}
              >
                {outputPaletteColors.map((color) => (
                  <span
                    key={color.key}
                    title={color.title}
                    style={{ background: color.background }}
                  />
                ))}
              </div>
              ) : null}
              {workbenchResultFloating ? (
                <div
                  className="workbench-floating-resize-handle"
                  role="button"
                  tabIndex={0}
                  aria-label="Resize Result preview window"
                  onPointerDown={(event) => startWorkbenchFloatingResize("result", event)}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 32 : 8;
                    if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("result", step, 0);
                    if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("result", -step, 0);
                    if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("result", 0, step);
                    if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("result", 0, -step);
                  }}
                />
              ) : null}
            </section>
            );
            return resultDock !== "center" && resultDockTarget !== null
              ? createPortal(resultPreviewPane, resultDockTarget, "result-preview")
              : resultPreviewPane;
            })()}
          </div>

          {showPixelGrid && (previewZoom === "fit" || previewZoom < 4) ? (
            <p className="control-help" role="status">Pixel grid becomes visible at 4:1 zoom.</p>
          ) : null}

          <details
            className="inspection-drawer"
            open={inspectionDrawerOpen}
            onToggle={(event) => setInspectionDrawerOpen(event.currentTarget.open)}
          >
            <summary>Inspection details and palette usage</summary>
            <div className="inspection-details">
              <section aria-labelledby="cell-inspector-title">
              <h3 id="cell-inspector-title">
                {workspaceMode === "tilemap"
                  ? "Tilemap inspector"
                  : "Attribute inspector"}
              </h3>
              <p id="inspection-help">Point at the converted preview, or focus it and use arrow keys. Hold Shift to move eight pixels.</p>
              {inspection === null ? null : (
                workspaceMode === "tilemap" && inspectedTileIndex !== null &&
                charsetState.kind === "ready" &&
                inspectedTileAssignment !== null ? (
                <dl className="attribute-readout" aria-live="polite">
                  <div><dt>Cell</dt><dd>{inspection.cellX}, {inspection.cellY} · index {inspectedTileIndex}</dd></div>
                  <div><dt>Character</dt><dd>{inspectedTileAssignment.characterIndex}</dd></div>
                  <div><dt>Transform</dt><dd>{inspectedTileAssignment.transform}</dd></div>
                  <div><dt>Polarity</dt><dd>{inspectedTileAssignment.inverted ? "INK/PAPER swapped" : "Normal"}</dd></div>
                  <div><dt>Cell error</dt><dd>{inspectedTileAssignment.distance.toFixed(6)}</dd></div>
                  <div>
                    <dt>Attributes</dt>
                    <dd>
                      original 0x{(lastFinal?.frames[0]?.encoded[
                        6144 + inspectedTileIndex
                      ] ?? 0).toString(16).padStart(2, "0")} · decoded 0x{
                        (charsetState.result.attributes[inspectedTileIndex] ?? 0)
                          .toString(16).padStart(2, "0")
                      }
                    </dd>
                  </div>
                  <div>
                    <dt>Mapping</dt>
                    <dd>
                      0x{(charsetState.result.artifact[
                        inspectedTileIndex + CHARSET_ARTIFACT_HEADER_BYTES
                      ] ?? 0)
                        .toString(16).padStart(2, "0")}
                    </dd>
                  </div>
                  <div>
                    <dt>Charset</dt>
                    <dd>
                      {Array.from(charsetState.result.charset.subarray(
                        inspectedTileAssignment.characterIndex * 8,
                        inspectedTileAssignment.characterIndex * 8 + 8,
                      )).map((value) =>
                        value.toString(16).padStart(2, "0")).join(" ")}
                    </dd>
                  </div>
                </dl>
                ) : (
                <dl className="attribute-readout" aria-live="polite">
                  <div><dt>Pixel</dt><dd>{inspection.pixelX}, {inspection.pixelY} · bit {inspection.pixel}</dd></div>
                  <div><dt>Cell</dt><dd>{inspection.cellX}, {inspection.cellY} · 8×{displayedAttributeHeight}</dd></div>
                  <div><dt>Attribute</dt><dd>{inspection.attributeHex} · offset {inspection.attributeOffset}</dd></div>
                  <div><dt>INK</dt><dd>{inspection.ink} · {ZX_BASE_COLORS[inspection.ink]?.name}</dd></div>
                  <div><dt>PAPER</dt><dd>{inspection.paper} · {ZX_BASE_COLORS[inspection.paper]?.name}</dd></div>
                  <div><dt>BRIGHT</dt><dd>{inspection.bright ? "On" : "Off"} · shared</dd></div>
                  <div><dt>Bitmap</dt><dd>{inspection.bitmapBytes.map((value) => value.toString(16).padStart(2, "0")).join(" ")}</dd></div>
                </dl>
                )
              )}
              </section>
              {workspaceMode === "tilemap" && charsetState.kind === "ready" ? (
              <section aria-labelledby="tilemap-diagnostics-title">
                <h3 id="tilemap-diagnostics-title">Tilemap diagnostics</h3>
                <p
                  className={`diagnostics-state ${tilemapStale ? "stale" : "current"}`}
                  role="status"
                >
                  {tilemapStale
                    ? "Stale · values describe the previous Tilemap High result."
                    : "Current · values match the displayed reconstruction."}
                </p>
                <dl className="attribute-readout">
                  <div><dt>Available</dt><dd>{glyphCount}</dd></div>
                  <div><dt>Active</dt><dd>{glyphActiveCount}</dd></div>
                  <div><dt>Emitted</dt><dd>{charsetState.result.characterCount}</dd></div>
                  <div><dt>Used</dt><dd>{charsetState.result.diagnostics.usedCharacterCount}</dd></div>
                  <div><dt>Source patterns</dt><dd>{charsetState.result.diagnostics.uniqueCanonicalTiles}</dd></div>
                  <div><dt>Exact cells</dt><dd>{charsetState.result.diagnostics.exactMatches} / 768</dd></div>
                  <div><dt>RGB similarity</dt><dd>{charsetState.result.diagnostics.rgbSimilarityPercent.toFixed(2)}%</dd></div>
                  <div><dt>RGB RMSE</dt><dd>{charsetState.result.diagnostics.rgbRmse.toFixed(2)}</dd></div>
                  <div><dt>Mean cell error</dt><dd>{charsetState.result.diagnostics.averageStructuralError.toFixed(5)}</dd></div>
                  <div><dt>Maximum cell error</dt><dd>{charsetState.result.diagnostics.maximumStructuralError.toFixed(5)}</dd></div>
                  <div><dt>Global objective</dt><dd>{charsetState.result.diagnostics.globalObjective?.toFixed(5) ?? "—"}</dd></div>
                  <div><dt>Refinement passes</dt><dd>{charsetState.result.diagnostics.refinementPasses ?? "—"}</dd></div>
                  <div><dt>Initial RGB error</dt><dd>{charsetState.result.diagnostics.initialRgbSquaredError?.toLocaleString() ?? "—"}</dd></div>
                  <div><dt>Final RGB error</dt><dd>{charsetState.result.diagnostics.finalRgbSquaredError?.toLocaleString() ?? "—"}</dd></div>
                  <div><dt>Multiscale error</dt><dd>{charsetState.result.diagnostics.multiscaleError?.toFixed(2) ?? "—"}</dd></div>
                  <div><dt>Edge error</dt><dd>{charsetState.result.diagnostics.edgeError?.toFixed(2) ?? "—"}</dd></div>
                  <div><dt>RGB boundary error</dt><dd>{charsetState.result.diagnostics.rgbBoundaryError?.toFixed(2) ?? "—"}</dd></div>
                  <div><dt>Saliency error</dt><dd>{charsetState.result.diagnostics.saliencyError?.toFixed(2) ?? "—"}</dd></div>
                  <div><dt>Medoid swaps</dt><dd>{charsetState.result.diagnostics.medoidSwaps ?? "—"}</dd></div>
                  <div><dt>Assignment changes</dt><dd>{charsetState.result.diagnostics.assignmentChanges ?? "—"}</dd></div>
                  <div><dt>V4 candidates</dt><dd>{charsetState.result.diagnostics.candidatesEvaluated?.toLocaleString() ?? "—"}</dd></div>
                  <div><dt>Equivalent candidates pruned</dt><dd>{charsetState.result.diagnostics.equivalentCandidatesPruned?.toLocaleString() ?? "—"}</dd></div>
                  <div><dt>Cells recomputed</dt><dd>{charsetState.result.diagnostics.cellsRecomputed?.toLocaleString() ?? "—"}</dd></div>
                  <div><dt>RGB boundary terms</dt><dd>{charsetState.result.diagnostics.boundaryTermsRecomputed?.toLocaleString() ?? "—"}</dd></div>
                  <div><dt>Candidate cache hits</dt><dd>{charsetState.result.diagnostics.candidateCacheHits?.toLocaleString() ?? "—"}</dd></div>
                  <div>
                    <dt>Transformed cells</dt>
                    <dd>
                      {charsetState.result.diagnostics.transformHistogram
                        .slice(1)
                        .reduce((sum, count) => sum + count, 0)}
                    </dd>
                  </div>
                  <div><dt>Polarity swaps</dt><dd>{charsetState.result.diagnostics.polaritySwaps}</dd></div>
                  <div>
                    <dt>Memory total</dt>
                    <dd>{charsetState.result.diagnostics.memory.totalBytes.toLocaleString()} B</dd>
                  </div>
                  <div>
                    <dt>Map</dt>
                    <dd>{charsetState.result.diagnostics.memory.tilemapBytes.toLocaleString()} B</dd>
                  </div>
                  <div>
                    <dt>Header</dt>
                    <dd>{(charsetState.result.diagnostics.memory.headerBytes ?? 0).toLocaleString()} B</dd>
                  </div>
                  <div>
                    <dt>Attributes</dt>
                    <dd>{charsetState.result.diagnostics.memory.attributeBytes.toLocaleString()} B</dd>
                  </div>
                  <div>
                    <dt>Transforms</dt>
                    <dd>{charsetState.result.diagnostics.memory.transformBytes.toLocaleString()} B</dd>
                  </div>
                  <div>
                    <dt>Charset</dt>
                    <dd>{charsetState.result.diagnostics.memory.charsetBytes.toLocaleString()} B</dd>
                  </div>
                </dl>
              </section>
              ) : null}
            </div>
          </details>
        </section>
        <div
          className="workbench-preview-layer"
          ref={setWorkbenchPreviewLayer}
          aria-label="Floating preview windows"
        />
      </section>
    </main>
    </>
  );
}
