import { AppStateContext, type AppState } from "./app/app-state.js";
import { uiTypographyCssVariables } from "./ui-typography.js";
import { lazy, Suspense, useEffect, useState, type CSSProperties } from "react";
import { WorkbenchMenuBar } from "./workbench-menu-bar.js";
import { type TargetModeId } from "@retro-converter/conversion-core";
import { BUILT_IN_PROFILES } from "./profiles.js";
import { APPLICATION_BUILD_ID, APPLICATION_RELEASE_DATE, APPLICATION_VERSION, sanitizeArtifactBaseName } from "./artifacts.js";
import { type WorkbenchFocusTarget } from "./app-types.js";
import { normalizeProjectName } from "./project-name.js";
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
import { WorkbenchWindowTitlebar } from "./app/sections/workbench-window-titlebar.js";
import { GeometrySettingsWindow } from "./app/sections/geometry-settings-window.js";
import { AdjustmentsSettingsWindow } from "./app/sections/adjustments-settings-window.js";
import { PaletteSettingsWindow } from "./app/sections/palette-settings-window.js";
import { PaintColorsSettingsWindow } from "./app/sections/paint-colors-settings-window.js";
import { CompareModeBar, type CompareMode } from "./app/sections/compare-mode-bar.js";
import { StatusBar } from "./app/sections/status-bar.js";
import { DitheringControls } from "./app/sections/dithering-controls.js";
import { SettingsSidebar } from "./app/sections/settings-sidebar.js";
import { ToolsSettingsWindow } from "./app/sections/tools-settings-window.js";
import { PreviewPalettePanel } from "./app/sections/preview-palette-panel.js";
import { SourceComparisonDock } from "./app/sections/source-comparison-dock.js";
import { ResultComparisonDock } from "./app/sections/result-comparison-dock.js";
import { InspectionDrawer } from "./app/sections/inspection-drawer.js";

const AboutDialog = lazy(() => import("./about-dialog.js").then((m) => ({ default: m.AboutDialog })));
const ZxPaletteEditorDialog = lazy(() => import("./zx-palette-editor-dialog.js").then((m) => ({ default: m.ZxPaletteEditorDialog })));
const TilemapSettingsWindows = lazy(() => import("./app/sections/tilemap-settings-windows.js").then((m) => ({ default: m.TilemapSettingsWindows })));
const BenchmarkPanel = lazy(() => import("./app/sections/benchmark-panel.js").then((m) => ({ default: m.BenchmarkPanel })));
const SettingsDialog = lazy(() => import("./app/sections/settings-dialog.js").then((m) => ({ default: m.SettingsDialog })));

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
  const s: AppState = { ...s0, ...s1, ...s2, ...s3, ...s4, ...s5, ...s6, ...s7, ...s8, ...s9, ...s10, ...s11, ...s12, ...s13, ...s14, ...s15, ...s16 };
  const {
    aboutOpen,
    draftState,
    lastFinal,
    setAboutOpen,
    setState,
    state,
  } = s0;
  const {
    charsetSource,
    dirty,
    existingCharset,
    exportError,
    gifFrameSelection,
    image,
    imageStatus,
    profiles,
    projectName,
    selectedPresetId,
    selectedProfileId,
    setGifFrameSelection,
    setZxPaletteDefinition,
    sourceArtifact,
    sourceFileName,
    targetModeId,
    workspaceMode,
    zxPaletteDefinition,
    uiLayout,
    setUiLayout,
  } = s1;
  const {
    activeWorkspaceProfileId,
    benchmarkOpen,
    benchmarkRunning,
    developmentMode,
    isPmd,
    isZx,
    previewZoom,
    projectNameDraft,
    projectSaveDialogOpen,
    selectedProfile,
    setBenchmarkOpen,
    setBenchmarkPanelHost,
    setProjectNameDraft,
    setProjectSaveDialogOpen,
    setTilemapBenchmarkOpen,
    setWorkbenchBottomDockLayer,
    setWorkbenchBottomMinimizedLayer,
    setWorkbenchDitheringFloatingX,
    setWorkbenchDitheringFloatingY,
    setWorkbenchLeftDockLayer,
    setWorkbenchPreviewLayer,
    setWorkbenchRightDockLayer,
    setZxPaletteEditorOpen,
    settingsSection,
    showPixelGrid,
    tilemapBenchmarkRunning,
    uiTypography,
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
    workbenchFloatingX,
    workbenchFloatingY,
    workbenchGeometryFloatingHeight,
    workbenchGeometryFloatingWidth,
    workbenchGeometryFloatingX,
    workbenchGeometryFloatingY,
    workbenchLeftWidth,
    workbenchPaletteFloatingHeight,
    workbenchPaletteFloatingWidth,
    workbenchPaletteFloatingX,
    workbenchPaletteFloatingY,
    workbenchPreviewWorkspaceRef,
    workbenchResultDockedWidth,
    workbenchResultFloating,
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
    workbenchSourceFloatingHeight,
    workbenchSourceFloatingWidth,
    workbenchSourceFloatingX,
    workbenchSourceFloatingY,
    workbenchTileDrag,
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
    previewLayout,
    resultPreviewVisible,
    setWorkbenchWindowOpen,
    setWorkbenchWindowVisibility,
    sourcePreviewVisible,
    startWorkbenchFloatingResize,
    startWorkbenchResize,
    startWorkbenchSettingsFloatingResize,
    workbenchDockDropAttributes,
    workbenchDockSplitHandle,
    workbenchDockWindowStyle,
    workbenchHasBottomDockWindows,
    workbenchHasFloatingSections,
    workbenchHasLeftDock,
    workbenchHasRightDock,
    workbenchPortal,
    workbenchSettingsDockEmpty,
    workbenchWindowActions,
    workbenchWindowDragAttributes,
    workbenchWindowLayout,
    workbenchWindowZIndex,
  } = s3;
  const {
    handleWorkbenchTitlebarKeyDown,
    resetWorkspaceArrangement,
    selectWorkspaceProfile,
    startWorkbenchSectionDrag,
    startWorkbenchTitlebarDrag,
    workspaceProfileOptions,
  } = s4;
  const {
  } = s5;
  const {
    cancelGifFrameSelection,
    existingCharsetChoiceValid,
    importClipboardImage,
    importImage,
    importPmd85,
    importSelectedGifFrame,
    settingsValid,
  } = s6;
  const {
    convertImage,
    selectHardwareModeFromMenu,
  } = s7;
  const {
    deleteWorkspaceProfile,
    focusWorkbenchTarget,
    renameWorkspaceProfile,
    restoreDefaultWorkspaceProfiles,
    saveWorkspaceProfileAs,
    saveWorkspaceProfileChanges,
    workspaceProfileDirty,
  } = s8;
  const {
    openApplicationSettings,
    runEngineBenchmark,
    runTilemapBenchmark,
    selectPreset,
    selectProfile,
    switchWorkspaceConversionMode,
  } = s9;
  const {
    cancelHigh,
    deleteAllImportedProfiles,
    deleteSelectedProfile,
    importProfile,
    importSpecsciiFile,
  } = s10;
  const {
    createEmptyImage,
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
    openProjectSaveDialog,
  } = s13;
  const {
    artifactsReady,
    openProject,
    paletteArtifactsReady,
    resultSaveReady,
    tilemapArtifactsReady,
  } = s14;
  const {
    comparisonKind,
    conversionStatusText,
  } = s16;



  const [conversionCancelled, setConversionCancelled] = useState(false);
  const [tabletTab, setTabletTab] = useState<"both" | "source" | "result" | "settings">("both");
  const [compareMode, setCompareMode] = useState<CompareMode>("side-by-side");
  const [swipePosition, setSwipePosition] = useState(50);
  useEffect(() => { if (state.kind === "running") setConversionCancelled(false); }, [state.kind]);
  const cancelConversion = () => { setConversionCancelled(true); cancelHigh(); };

  return (
    <AppStateContext.Provider value={s}>
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
        uiLayout={uiLayout}
        onUiLayoutChange={setUiLayout}
        onProfileChange={selectProfile}
        onPresetChange={selectPreset}
        onTargetModeChange={(mode) => selectHardwareModeFromMenu(mode as TargetModeId)}
        canDeleteSelectedProfile={!BUILT_IN_PROFILES.some((profile) => profile.id === selectedProfile.id)}
        canDeleteImportedProfiles={profiles.length > BUILT_IN_PROFILES.length}
        onDeleteSelectedProfile={deleteSelectedProfile}
        onDeleteImportedProfiles={deleteAllImportedProfiles}
        hasImage={image !== null}
        imageName={sourceFileName}
        canConvert={image !== null && settingsValid && state.kind !== "running"}
        conversionRunning={state.kind === "running"}
        onConvert={() => void convertImage()}
        onCancelConvert={cancelConversion}
        resultStale={state.kind === "stale" || (workspaceMode === "tilemap" && s.tilemapStale)}
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

      {aboutOpen ? (
        <Suspense fallback={null}>
          <AboutDialog
            open={aboutOpen}
            version={APPLICATION_VERSION}
            build={APPLICATION_BUILD_ID}
            releaseDate={APPLICATION_RELEASE_DATE}
            onClose={() => setAboutOpen(false)}
          />
        </Suspense>
      ) : null}

      {uiLayout === "guided" ? (
        <div className="tablet-tabs" role="tablist" aria-label="Workspace panel">
          {(["both", "source", "result", "settings"] as const).map((tab) => (
            <button key={tab} type="button" role="tab" aria-selected={tabletTab === tab} className={tabletTab === tab ? "active" : ""} onClick={() => setTabletTab(tab)}>
              {tab === "both" ? "Compare" : tab === "source" ? "Source" : tab === "result" ? "Result" : "Settings"}
            </button>
          ))}
        </div>
      ) : null}
      <div className={uiLayout === "guided" ? "guided-body" : "pro-body"} data-ui-layout={uiLayout} data-tablet-tab={tabletTab}>
      <section
        ref={workbenchRootRef}
        data-ui-layout={uiLayout}
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
            <WorkbenchWindowTitlebar />
            <div className="workbench-window-content" hidden={workbenchSettingsMinimized && !workbenchHasFloatingSections}>
          <GeometrySettingsWindow />
          <AdjustmentsSettingsWindow />
          {workspaceMode === "palette" ? (
          <>
          <PaletteSettingsWindow />
          <PaintColorsSettingsWindow />
          {uiLayout === "guided" ? null : workbenchPortal("dithering", (
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
          <DitheringControls level="expert" />
          </details>
          ))}
          </>
          ) : (
          <Suspense fallback={null}><TilemapSettingsWindows /></Suspense>
          )}
          </div>

          {benchmarkOpen || s.tilemapBenchmarkOpen ? <Suspense fallback={null}><BenchmarkPanel /></Suspense> : null}
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
          <Suspense fallback={null}>
            <ZxPaletteEditorDialog
              definition={zxPaletteDefinition}
              onChange={(definition) => {
                setZxPaletteDefinition(definition);
                setState({ kind: "idle" });
              }}
              onClose={() => setZxPaletteEditorOpen(false)}
            />
          </Suspense>
        ) : null}

        {s.settingsOpen ? <Suspense fallback={null}><SettingsDialog /></Suspense> : null}

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
            {uiLayout === "guided" ? (
              <CompareModeBar mode={compareMode} onModeChange={setCompareMode} swipe={swipePosition} onSwipeChange={setSwipePosition} />
            ) : null}
          </div>

          <ToolsSettingsWindow />

          <PreviewPalettePanel />

          <div
            className="comparison workbench-preview-dock"
            aria-label="Configurable preview panes"
            data-preview-layout={previewLayout}
            data-compare-mode={uiLayout === "guided" ? compareMode : undefined}
            style={uiLayout === "guided" && compareMode === "swipe" ? ({ "--swipe": `${swipePosition}%` } as CSSProperties) : undefined}
            {...workbenchDockDropAttributes("center")}
          >
            <SourceComparisonDock />
            <ResultComparisonDock />
            {uiLayout === "guided" && compareMode === "swipe" ? (
              <div
                className="swipe-handle"
                role="slider"
                tabIndex={0}
                aria-label="Swipe divider"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={swipePosition}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft") setSwipePosition((v) => Math.max(0, v - 2));
                  if (event.key === "ArrowRight") setSwipePosition((v) => Math.min(100, v + 2));
                }}
                onPointerDown={(event) => {
                  const host = event.currentTarget.parentElement;
                  if (host === null) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  const move = (e: PointerEvent) => {
                    const box = host.getBoundingClientRect();
                    setSwipePosition(Math.round(Math.min(100, Math.max(0, ((e.clientX - box.left) / box.width) * 100))));
                  };
                  const up = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
                  window.addEventListener("pointermove", move);
                  window.addEventListener("pointerup", up);
                }}
              />
            ) : null}
          </div>

          {showPixelGrid && (previewZoom === "fit" || previewZoom < 4) ? (
            <p className="control-help" role="status">Pixel grid becomes visible at 4:1 zoom.</p>
          ) : null}

          <InspectionDrawer />
        </section>
        <div
          className="workbench-preview-layer"
          ref={setWorkbenchPreviewLayer}
          aria-label="Floating preview windows"
        />
      </section>
      {uiLayout === "guided" ? <SettingsSidebar /> : null}
      </div>
      <StatusBar cancelled={conversionCancelled} onCancel={cancelConversion} />
    </main>
    </AppStateContext.Provider>
  );
}
