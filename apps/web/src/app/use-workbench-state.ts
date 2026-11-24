import { useRef, useState } from "react";
import { BUILTIN_WORKSPACE_PROFILE_PREFIX, normalizeStartupWorkspaceLayout, type PreviewContent, type PreviewSide, type PreviewZoom, type WorkbenchFocusTarget, type WorkbenchTileDrag } from "../app-types.js";
import { DEFAULT_WORKSPACE_PREFERENCES, type WorkspaceLayoutId } from "../workspace-preferences.js";
import { type BitmapPrimitiveKind } from "../bitmap-editor-primitives.js";
import { type BitmapEditorOperation } from "../bitmap-editor-tools.js";
import { type UiTypographySettings } from "../ui-typography.js";
import { type QlMixedDisplayResolution } from "../ql-mixed-preview.js";
import { type ConversionSettings, DEFAULT_CONVERSION_SETTINGS, destinationGeometryFor } from "@retro-converter/conversion-core";
import { type InspectedAttribute } from "../inspection.js";
import { loadActiveWorkspaceProfileId, loadHiddenBuiltinWorkspaceProfiles, loadSavedWorkbenchLayouts, type SavedWorkbenchLayout } from "../saved-workbench-layouts.js";
import { type ApplicationSettings } from "../application-settings.js";
import { type ActiveWorkbenchWindowId, type WorkbenchDock, type WorkbenchSettingsSection, type WorkbenchWindowId, type WorkbenchWindowLayouts } from "../workbench-preferences.js";
import { type SettingCategory, type SettingPresetId } from "../settings-registry.js";
import { type CropResizeHandle } from "../crop.js";
import { type ConversionBenchmarkRow } from "../preview-metrics.js";
import { type DerivedCharsetStrategy } from "@retro-converter/zx-charset";
import { type WorkerCharsetResult } from "../worker/client.js";
import { BUILT_IN_PROFILE } from "../profiles.js";
import type { useSettingsState } from "./use-settings-state.js";

export function useWorkbenchState(
  { profiles, selectedProfileId, startupApplicationSettings, startupWorkbenchPreferences, targetModeId }: Pick<ReturnType<typeof useSettingsState>, "profiles" | "selectedProfileId" | "startupApplicationSettings" | "startupWorkbenchPreferences" | "targetModeId">,
) {
  const [previewZoom, setPreviewZoom] = useState<PreviewZoom>(DEFAULT_WORKSPACE_PREFERENCES.previewZoom);
  const [sourcePreviewZoom, setSourcePreviewZoom] = useState<PreviewZoom>(DEFAULT_WORKSPACE_PREFERENCES.previewZoom);
  const [resultPreviewZoom, setResultPreviewZoom] = useState<PreviewZoom>(DEFAULT_WORKSPACE_PREFERENCES.previewZoom);
  const [previewViewportSizes, setPreviewViewportSizes] = useState<{
    readonly source: { readonly width: number; readonly height: number };
    readonly result: { readonly width: number; readonly height: number };
  }>({
    source: { width: 0, height: 0 },
    result: { width: 0, height: 0 },
  });
  const [bitmapEditorToolsHost, setBitmapEditorToolsHost] = useState<HTMLDivElement | null>(null);
  const [bitmapEditorToolMode, setBitmapEditorToolMode] = useState<"display" | "selection" | "draw" | "primitives" | "colors">("display");
  const [bitmapEditorPrimitiveKind, setBitmapEditorPrimitiveKind] = useState<BitmapPrimitiveKind>("line");
  const [bitmapEditorPrimitiveStrokeEnabled, setBitmapEditorPrimitiveStrokeEnabled] = useState(true);
  const [bitmapEditorPrimitiveStrokePattern, setBitmapEditorPrimitiveStrokePattern] = useState<"solid" | "empty" | "stipple" | "custom">("solid");
  const [bitmapEditorPrimitiveFillEnabled, setBitmapEditorPrimitiveFillEnabled] = useState(false);
  const [bitmapEditorPrimitiveFillOperation, setBitmapEditorPrimitiveFillOperation] = useState<Exclude<BitmapEditorOperation, "or">>("copy");
  const [bitmapEditorPrimitiveFillPattern, setBitmapEditorPrimitiveFillPattern] = useState<"solid" | "empty" | "stipple" | "custom">("solid");
  const [bitmapEditorPrimitiveCustomPattern, setBitmapEditorPrimitiveCustomPattern] = useState<Uint8Array | null>(null);
  const [bitmapEditorPrimitivePatternPickerActive, setBitmapEditorPrimitivePatternPickerActive] = useState(false);
  const [bitmapEditorPrimitiveDraft, setBitmapEditorPrimitiveDraft] = useState<{
    readonly kind: BitmapPrimitiveKind;
    readonly start: { readonly x: number; readonly y: number };
    readonly current: { readonly x: number; readonly y: number };
  } | null>(null);
  const [bitmapEditorPrimitiveCursor, setBitmapEditorPrimitiveCursor] = useState<{ readonly x: number; readonly y: number } | null>(null);
  const [bitmapEditorNavigatorViewport, setBitmapEditorNavigatorViewport] = useState({
    left: 0,
    top: 0,
    width: 1,
    height: 1,
  });
  const bitmapEditorNavigatorPointerRef = useRef<{ readonly side: PreviewSide; readonly pointerId: number } | null>(null);
  const [synchronizePan, setSynchronizePan] = useState(startupApplicationSettings.synchronizePan);
  const [synchronizeZoom, setSynchronizeZoom] = useState(startupApplicationSettings.synchronizeZoom);
  const [mouseWheelZoom, setMouseWheelZoom] = useState(startupApplicationSettings.mouseWheelZoom);
  const [showPixelGrid, setShowPixelGrid] = useState(DEFAULT_WORKSPACE_PREFERENCES.showPixelGrid);
  const [showAttributeGrid, setShowAttributeGrid] = useState(DEFAULT_WORKSPACE_PREFERENCES.showAttributeGrid);
  const [hideAttributes, setHideAttributes] = useState(DEFAULT_WORKSPACE_PREFERENCES.hideAttributes);
  const [developmentMode, setDevelopmentMode] = useState(startupApplicationSettings.developmentMode);
  const [uiTypography, setUiTypography] = useState<UiTypographySettings>(() => ({
    uiFontFamily: startupApplicationSettings.uiFontFamily,
    windowTitleFontSize: startupApplicationSettings.windowTitleFontSize,
    windowTitleFontWeight: startupApplicationSettings.windowTitleFontWeight,
    uiLabelFontSize: startupApplicationSettings.uiLabelFontSize,
    uiLabelFontWeight: startupApplicationSettings.uiLabelFontWeight,
    uiBodyFontSize: startupApplicationSettings.uiBodyFontSize,
    uiBodyFontWeight: startupApplicationSettings.uiBodyFontWeight,
  }));
  const [scaleQlToDisplayAspect, setScaleQlToDisplayAspect] = useState(true);
  const [qlMixedDisplayResolution, setQlMixedDisplayResolution] =
    useState<QlMixedDisplayResolution>("high");
  const [pmd85PaletteCalibrationId, setPmd85PaletteCalibrationId] = useState(
    DEFAULT_CONVERSION_SETTINGS.pmd85.paletteCalibrationId,
  );
  const [pmd85GapPolicy, setPmd85GapPolicy] = useState<
    ConversionSettings["pmd85"]["gapPolicy"]
  >(DEFAULT_CONVERSION_SETTINGS.pmd85.gapPolicy);
  const [sourcePreviewContent, setSourcePreviewContent] = useState<PreviewContent>("image");
  const [resultPreviewContent, setResultPreviewContent] = useState<PreviewContent>("image");
  const [selectedPaletteColor, setSelectedPaletteColor] = useState<number | null>(null);
  const [paletteUsageFilter, setPaletteUsageFilter] = useState<"used" | "all">("used");
  const [tileUsageFilter, setTileUsageFilter] = useState<"used" | "all">("used");
  const [inspection, setInspection] = useState<InspectedAttribute | null>(null);
  const [draggingSide, setDraggingSide] = useState<PreviewSide | null>(null);
  const [inspectionDrawerOpen, setInspectionDrawerOpen] = useState(DEFAULT_WORKSPACE_PREFERENCES.inspectionDrawerOpen);
  const [workspaceLayout, setWorkspaceLayout] = useState<WorkspaceLayoutId>(startupApplicationSettings.workspaceLayout);
  const [startupWorkspaceLayout, setStartupWorkspaceLayout] = useState<WorkspaceLayoutId>(() =>
    normalizeStartupWorkspaceLayout(startupApplicationSettings.workspaceLayout),
  );
  const [savedWorkbenchLayouts, setSavedWorkbenchLayouts] = useState<readonly SavedWorkbenchLayout[]>(
    () => loadSavedWorkbenchLayouts(localStorage),
  );
  const [hiddenBuiltinWorkspaceProfileIds, setHiddenBuiltinWorkspaceProfileIds] = useState<readonly string[]>(
    () => loadHiddenBuiltinWorkspaceProfiles(localStorage),
  );
  const [activeWorkspaceProfileId, setActiveWorkspaceProfileId] = useState(() =>
    loadActiveWorkspaceProfileId(localStorage) ?? `${BUILTIN_WORKSPACE_PROFILE_PREFIX}${normalizeStartupWorkspaceLayout(startupApplicationSettings.workspaceLayout)}`,
  );
  const [workspaceProfileBaseline, setWorkspaceProfileBaseline] = useState("");
  const [workspaceProfileBaselinePending, setWorkspaceProfileBaselinePending] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectSaveDialogOpen, setProjectSaveDialogOpen] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [zxPaletteEditorOpen, setZxPaletteEditorOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<(ApplicationSettings & Record<string, unknown>) | null>(null);
  const [settingsBaseline, setSettingsBaseline] = useState<Record<string, unknown> | null>(null);
  const startupWorkspaceAppliedRef = useRef(false);
  const pendingNewEmptyImageRef = useRef(false);
  const sourceReplacementRevisionRef = useRef(0);
  const workspaceProfileSelectionMadeRef = useRef(false);
  const [settingsSection, setSettingsSection] = useState<WorkbenchFocusTarget>("all");
  const [workbenchSettingsDock, setWorkbenchSettingsDock] = useState<WorkbenchDock>(
    startupWorkbenchPreferences.dock,
  );
  const [workbenchSettingsMinimized, setWorkbenchSettingsMinimized] = useState(
    startupWorkbenchPreferences.minimized,
  );
  const [workbenchLeftWidth, setWorkbenchLeftWidth] = useState(
    startupWorkbenchPreferences.leftWidth,
  );
  const [workbenchRightWidth, setWorkbenchRightWidth] = useState(
    startupWorkbenchPreferences.rightWidth,
  );
  const workbenchSettingsSideWidth = workbenchSettingsDock === "right"
    ? workbenchRightWidth
    : workbenchLeftWidth;
  const [workbenchBottomHeight, setWorkbenchBottomHeight] = useState(
    startupWorkbenchPreferences.bottomHeight,
  );
  const [workbenchFloatingX, setWorkbenchFloatingX] = useState(
    startupWorkbenchPreferences.floatingX,
  );
  const [workbenchFloatingY, setWorkbenchFloatingY] = useState(
    startupWorkbenchPreferences.floatingY,
  );
  const [workbenchSettingsFloatingWidth, setWorkbenchSettingsFloatingWidth] = useState(
    startupWorkbenchPreferences.settingsFloatingWidth,
  );
  const [workbenchSettingsFloatingHeight, setWorkbenchSettingsFloatingHeight] = useState(
    startupWorkbenchPreferences.settingsFloatingHeight,
  );
  const [workbenchToolsFloatingX, setWorkbenchToolsFloatingX] = useState(
    startupWorkbenchPreferences.toolsFloatingX,
  );
  const [workbenchToolsFloatingY, setWorkbenchToolsFloatingY] = useState(
    startupWorkbenchPreferences.toolsFloatingY,
  );
  const [workbenchToolsFloatingWidth, setWorkbenchToolsFloatingWidth] = useState(
    startupWorkbenchPreferences.toolsFloatingWidth,
  );
  const [workbenchToolsFloatingHeight, setWorkbenchToolsFloatingHeight] = useState(
    startupWorkbenchPreferences.toolsFloatingHeight,
  );
  const [workbenchGeometryFloating, setWorkbenchGeometryFloating] = useState(
    startupWorkbenchPreferences.geometryFloating,
  );
  const [workbenchGeometryFloatingX, setWorkbenchGeometryFloatingX] = useState(
    startupWorkbenchPreferences.geometryFloatingX,
  );
  const [workbenchGeometryFloatingY, setWorkbenchGeometryFloatingY] = useState(
    startupWorkbenchPreferences.geometryFloatingY,
  );
  const [workbenchGeometryFloatingWidth, setWorkbenchGeometryFloatingWidth] = useState(
    startupWorkbenchPreferences.geometryFloatingWidth,
  );
  const [workbenchGeometryFloatingHeight, setWorkbenchGeometryFloatingHeight] = useState(
    startupWorkbenchPreferences.geometryFloatingHeight,
  );
  const [workbenchGeometryFloatingAutoHeight, setWorkbenchGeometryFloatingAutoHeight] = useState(
    startupWorkbenchPreferences.geometryFloatingAutoHeight,
  );
  const [workbenchAdjustmentsFloating, setWorkbenchAdjustmentsFloating] = useState(
    startupWorkbenchPreferences.adjustmentsFloating,
  );
  const [workbenchAdjustmentsFloatingX, setWorkbenchAdjustmentsFloatingX] = useState(
    startupWorkbenchPreferences.adjustmentsFloatingX,
  );
  const [workbenchAdjustmentsFloatingY, setWorkbenchAdjustmentsFloatingY] = useState(
    startupWorkbenchPreferences.adjustmentsFloatingY,
  );
  const [workbenchAdjustmentsFloatingWidth, setWorkbenchAdjustmentsFloatingWidth] = useState(
    startupWorkbenchPreferences.adjustmentsFloatingWidth,
  );
  const [workbenchAdjustmentsFloatingHeight, setWorkbenchAdjustmentsFloatingHeight] = useState(
    startupWorkbenchPreferences.adjustmentsFloatingHeight,
  );
  const [workbenchAdjustmentsFloatingAutoHeight, setWorkbenchAdjustmentsFloatingAutoHeight] = useState(
    startupWorkbenchPreferences.adjustmentsFloatingAutoHeight,
  );
  const [workbenchPaletteFloating, setWorkbenchPaletteFloating] = useState(
    startupWorkbenchPreferences.paletteFloating,
  );
  const [workbenchPaletteFloatingX, setWorkbenchPaletteFloatingX] = useState(
    startupWorkbenchPreferences.paletteFloatingX,
  );
  const [workbenchPaletteFloatingY, setWorkbenchPaletteFloatingY] = useState(
    startupWorkbenchPreferences.paletteFloatingY,
  );
  const [workbenchPaletteFloatingWidth, setWorkbenchPaletteFloatingWidth] = useState(
    startupWorkbenchPreferences.paletteFloatingWidth,
  );
  const [workbenchPaletteFloatingHeight, setWorkbenchPaletteFloatingHeight] = useState(
    startupWorkbenchPreferences.paletteFloatingHeight,
  );
  const [workbenchPaletteFloatingAutoHeight, setWorkbenchPaletteFloatingAutoHeight] = useState(
    startupWorkbenchPreferences.paletteFloatingAutoHeight,
  );
  const [workbenchDitheringFloating, setWorkbenchDitheringFloating] = useState(
    startupWorkbenchPreferences.ditheringFloating,
  );
  const [workbenchDitheringFloatingX, setWorkbenchDitheringFloatingX] = useState(
    startupWorkbenchPreferences.ditheringFloatingX,
  );
  const [workbenchDitheringFloatingY, setWorkbenchDitheringFloatingY] = useState(
    startupWorkbenchPreferences.ditheringFloatingY,
  );
  const [workbenchDitheringFloatingWidth, setWorkbenchDitheringFloatingWidth] = useState(
    startupWorkbenchPreferences.ditheringFloatingWidth,
  );
  const [workbenchDitheringFloatingHeight, setWorkbenchDitheringFloatingHeight] = useState(
    startupWorkbenchPreferences.ditheringFloatingHeight,
  );
  const [workbenchDitheringFloatingAutoHeight, setWorkbenchDitheringFloatingAutoHeight] = useState(
    startupWorkbenchPreferences.ditheringFloatingAutoHeight,
  );
  const [workbenchTilemapFloating, setWorkbenchTilemapFloating] = useState(
    startupWorkbenchPreferences.tilemapFloating,
  );
  const [workbenchTilemapFloatingX, setWorkbenchTilemapFloatingX] = useState(
    startupWorkbenchPreferences.tilemapFloatingX,
  );
  const [workbenchTilemapFloatingY, setWorkbenchTilemapFloatingY] = useState(
    startupWorkbenchPreferences.tilemapFloatingY,
  );
  const [workbenchTilemapFloatingWidth, setWorkbenchTilemapFloatingWidth] = useState(
    startupWorkbenchPreferences.tilemapFloatingWidth,
  );
  const [workbenchTilemapFloatingHeight, setWorkbenchTilemapFloatingHeight] = useState(
    startupWorkbenchPreferences.tilemapFloatingHeight,
  );
  const [workbenchTilemapFloatingAutoHeight, setWorkbenchTilemapFloatingAutoHeight] = useState(
    startupWorkbenchPreferences.tilemapFloatingAutoHeight,
  );
  const [workbenchSourceFloating, setWorkbenchSourceFloating] = useState(startupWorkbenchPreferences.sourceFloating);
  const [workbenchSourceFloatingX, setWorkbenchSourceFloatingX] = useState(startupWorkbenchPreferences.sourceFloatingX);
  const [workbenchSourceFloatingY, setWorkbenchSourceFloatingY] = useState(startupWorkbenchPreferences.sourceFloatingY);
  const [workbenchSourceFloatingWidth, setWorkbenchSourceFloatingWidth] = useState(startupWorkbenchPreferences.sourceFloatingWidth);
  const [workbenchSourceFloatingHeight, setWorkbenchSourceFloatingHeight] = useState(startupWorkbenchPreferences.sourceFloatingHeight);
  const [workbenchSourceFloatingAutoHeight, setWorkbenchSourceFloatingAutoHeight] = useState(startupWorkbenchPreferences.sourceFloatingAutoHeight);
  const [workbenchResultFloating, setWorkbenchResultFloating] = useState(startupWorkbenchPreferences.resultFloating);
  const [workbenchResultFloatingX, setWorkbenchResultFloatingX] = useState(startupWorkbenchPreferences.resultFloatingX);
  const [workbenchResultFloatingY, setWorkbenchResultFloatingY] = useState(startupWorkbenchPreferences.resultFloatingY);
  const [workbenchResultFloatingWidth, setWorkbenchResultFloatingWidth] = useState(startupWorkbenchPreferences.resultFloatingWidth);
  const [workbenchResultFloatingHeight, setWorkbenchResultFloatingHeight] = useState(startupWorkbenchPreferences.resultFloatingHeight);
  const [workbenchResultFloatingAutoHeight, setWorkbenchResultFloatingAutoHeight] = useState(startupWorkbenchPreferences.resultFloatingAutoHeight);
  const [workbenchSourceDockedWidth, setWorkbenchSourceDockedWidth] = useState(startupWorkbenchPreferences.sourceDockedWidth);
  const [workbenchResultDockedWidth, setWorkbenchResultDockedWidth] = useState(startupWorkbenchPreferences.resultDockedWidth);
  const [workbenchWindowOrder, setWorkbenchWindowOrder] = useState<readonly WorkbenchWindowId[]>(
    () => [...startupWorkbenchPreferences.windowOrder],
  );
  const [workbenchSectionsOpen, setWorkbenchSectionsOpen] = useState<Record<WorkbenchSettingsSection, boolean>>(
    () => ({ ...startupWorkbenchPreferences.sectionsOpen }),
  );
  const [workbenchWindowLayouts, setWorkbenchWindowLayouts] = useState<WorkbenchWindowLayouts>(
    () => ({ ...startupWorkbenchPreferences.windowLayouts }),
  );
  const [workbenchLayoutMenu, setWorkbenchLayoutMenu] = useState<WorkbenchWindowId | null>(null);
  const [workbenchLayoutMenuPosition, setWorkbenchLayoutMenuPosition] = useState<{ left: number; top: number } | null>(null);
  const workbenchResizeRef = useRef<
    | {
        kind: "dock";
        dock: WorkbenchDock;
        startPointer: number;
        startDockWidth: number;
        startBottomHeight: number;
      }
    | {
        kind: "floating";
        window: WorkbenchWindowId;
        startPointerX: number;
        startPointerY: number;
        startWidth: number;
        startHeight: number;
      }
    | {
        kind: "preview-docked";
        preview: "source" | "result";
        startPointerX: number;
        startSourceWidth: number;
        startResultWidth: number;
      }
    | {
        kind: "dock-split";
        dock: "bottom" | "left" | "right";
        before: ActiveWorkbenchWindowId;
        after: ActiveWorkbenchWindowId;
        startPointer: number;
        startBeforeRatio: number;
        startAfterRatio: number;
        startBeforeSize: number;
        startAfterSize: number;
      }
    | null
  >(null);
  const workbenchDimensionsRef = useRef({
    settingsWidth: workbenchSettingsDock === "right" ? workbenchRightWidth : workbenchLeftWidth,
    settingsHeight: workbenchBottomHeight,
    toolsWidth: workbenchToolsFloatingWidth,
    toolsHeight: workbenchToolsFloatingHeight,
    geometryWidth: workbenchGeometryFloatingWidth,
    geometryHeight: workbenchGeometryFloatingHeight,
    adjustmentsWidth: workbenchAdjustmentsFloatingWidth,
    adjustmentsHeight: workbenchAdjustmentsFloatingHeight,
    paletteWidth: workbenchPaletteFloatingWidth,
    paletteHeight: workbenchPaletteFloatingHeight,
    ditheringWidth: workbenchDitheringFloatingWidth,
    ditheringHeight: workbenchDitheringFloatingHeight,
    tilemapWidth: workbenchTilemapFloatingWidth,
    tilemapHeight: workbenchTilemapFloatingHeight,
    sourceWidth: workbenchSourceFloatingWidth,
    sourceHeight: workbenchSourceFloatingHeight,
    resultWidth: workbenchResultFloatingWidth,
    resultHeight: workbenchResultFloatingHeight,
  });
  const workbenchRootRef = useRef<HTMLElement | null>(null);
  const workbenchSettingsWindowRef = useRef<HTMLDivElement | null>(null);
  const workbenchPreviewWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const [workbenchPreviewLayer, setWorkbenchPreviewLayer] = useState<HTMLDivElement | null>(null);
  const [workbenchLeftDockLayer, setWorkbenchLeftDockLayer] = useState<HTMLDivElement | null>(null);
  const [workbenchRightDockLayer, setWorkbenchRightDockLayer] = useState<HTMLDivElement | null>(null);
  const [workbenchBottomDockLayer, setWorkbenchBottomDockLayer] = useState<HTMLDivElement | null>(null);
  const [workbenchBottomMinimizedLayer, setWorkbenchBottomMinimizedLayer] = useState<HTMLDivElement | null>(null);
  const [benchmarkPanelHost, setBenchmarkPanelHost] = useState<HTMLDivElement | null>(null);
  const workbenchDragRef = useRef<{
    window: WorkbenchWindowId;
    startPointerX: number;
    startPointerY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const workbenchTileDragRef = useRef<WorkbenchTileDrag | null>(null);
  const [workbenchTileDrag, setWorkbenchTileDrag] = useState<WorkbenchTileDrag | null>(null);
  const workbenchDragMovedRef = useRef(false);
  const [workbenchAnnouncement, setWorkbenchAnnouncement] = useState("");
  const [settingsSearch, setSettingsSearch] = useState("");
  const [settingsCategory, setSettingsCategory] = useState<SettingCategory | "all">("all");
  const [settingsPreset, setSettingsPreset] = useState<SettingPresetId>("all");
  const [cropPointerMode, setCropPointerMode] = useState<"create" | "move" | CropResizeHandle>("create");
  const [cropSelectionActive, setCropSelectionActive] = useState(true);
  const [inputPreviewStage, setInputPreviewStage] =
    useState<"source" | "pre-constraint">("source");
  const [outputPreviewStage, setOutputPreviewStage] =
    useState<"screen-1" | "screen-2" | "merged">("merged");
  const [benchmarkRows, setBenchmarkRows] =
    useState<readonly ConversionBenchmarkRow[]>([]);
  const [benchmarkRunning, setBenchmarkRunning] = useState(false);
  const [benchmarkOpen, setBenchmarkOpen] = useState(false);
  const [includeExperimentalEngines, setIncludeExperimentalEngines] =
    useState(false);
  const [benchmarkCompareDigests, setBenchmarkCompareDigests] =
    useState<readonly string[]>([]);
  const [benchmarkVisualFavorites, setBenchmarkVisualFavorites] =
    useState<ReadonlySet<string>>(() => new Set());
  const [tilemapBenchmarkOpen, setTilemapBenchmarkOpen] = useState(false);
  const [tilemapBenchmarkRunning, setTilemapBenchmarkRunning] = useState(false);
  const tilemapBenchmarkRunRef = useRef(0);
  const [tilemapBenchmarkRows, setTilemapBenchmarkRows] = useState<readonly {
    readonly strategy: DerivedCharsetStrategy;
    readonly score: number;
    readonly elapsedMs: number;
    readonly result: WorkerCharsetResult;
  }[]>([]);

  const selectedProfile = profiles.find((profile) =>
    profile.id === selectedProfileId
  ) ?? BUILT_IN_PROFILE;
  const selectedPlatformId = selectedProfile.platform_id;
  const destinationGeometry = destinationGeometryFor(
    selectedPlatformId,
    targetModeId,
  );
  const isQl = selectedPlatformId === "sinclair-ql";
  const isPmd = selectedPlatformId === "pmd-85";
  const isZx = selectedPlatformId === "zx-spectrum";

  return {
    activeWorkspaceProfileId,
    benchmarkCompareDigests,
    benchmarkOpen,
    benchmarkPanelHost,
    benchmarkRows,
    benchmarkRunning,
    benchmarkVisualFavorites,
    bitmapEditorNavigatorPointerRef,
    bitmapEditorNavigatorViewport,
    bitmapEditorPrimitiveCursor,
    bitmapEditorPrimitiveCustomPattern,
    bitmapEditorPrimitiveDraft,
    bitmapEditorPrimitiveFillEnabled,
    bitmapEditorPrimitiveFillOperation,
    bitmapEditorPrimitiveFillPattern,
    bitmapEditorPrimitiveKind,
    bitmapEditorPrimitivePatternPickerActive,
    bitmapEditorPrimitiveStrokeEnabled,
    bitmapEditorPrimitiveStrokePattern,
    bitmapEditorToolMode,
    bitmapEditorToolsHost,
    cropPointerMode,
    cropSelectionActive,
    destinationGeometry,
    developmentMode,
    draggingSide,
    hiddenBuiltinWorkspaceProfileIds,
    hideAttributes,
    includeExperimentalEngines,
    inputPreviewStage,
    inspection,
    inspectionDrawerOpen,
    isPmd,
    isQl,
    isZx,
    mouseWheelZoom,
    outputPreviewStage,
    paletteUsageFilter,
    pendingNewEmptyImageRef,
    pmd85GapPolicy,
    pmd85PaletteCalibrationId,
    previewViewportSizes,
    previewZoom,
    projectNameDraft,
    projectSaveDialogOpen,
    qlMixedDisplayResolution,
    resultPreviewContent,
    resultPreviewZoom,
    savedWorkbenchLayouts,
    scaleQlToDisplayAspect,
    selectedPaletteColor,
    selectedPlatformId,
    selectedProfile,
    setActiveWorkspaceProfileId,
    setBenchmarkCompareDigests,
    setBenchmarkOpen,
    setBenchmarkPanelHost,
    setBenchmarkRows,
    setBenchmarkRunning,
    setBenchmarkVisualFavorites,
    setBitmapEditorNavigatorViewport,
    setBitmapEditorPrimitiveCursor,
    setBitmapEditorPrimitiveCustomPattern,
    setBitmapEditorPrimitiveDraft,
    setBitmapEditorPrimitiveFillEnabled,
    setBitmapEditorPrimitiveFillOperation,
    setBitmapEditorPrimitiveFillPattern,
    setBitmapEditorPrimitiveKind,
    setBitmapEditorPrimitivePatternPickerActive,
    setBitmapEditorPrimitiveStrokeEnabled,
    setBitmapEditorPrimitiveStrokePattern,
    setBitmapEditorToolMode,
    setBitmapEditorToolsHost,
    setCropPointerMode,
    setCropSelectionActive,
    setDevelopmentMode,
    setDraggingSide,
    setHiddenBuiltinWorkspaceProfileIds,
    setHideAttributes,
    setIncludeExperimentalEngines,
    setInputPreviewStage,
    setInspection,
    setInspectionDrawerOpen,
    setMouseWheelZoom,
    setOutputPreviewStage,
    setPaletteUsageFilter,
    setPmd85GapPolicy,
    setPmd85PaletteCalibrationId,
    setPreviewViewportSizes,
    setPreviewZoom,
    setProjectNameDraft,
    setProjectSaveDialogOpen,
    setQlMixedDisplayResolution,
    setResultPreviewContent,
    setResultPreviewZoom,
    setSavedWorkbenchLayouts,
    setScaleQlToDisplayAspect,
    setSelectedPaletteColor,
    setSettingsBaseline,
    setSettingsCategory,
    setSettingsDraft,
    setSettingsOpen,
    setSettingsPreset,
    setSettingsSearch,
    setSettingsSection,
    setShowAttributeGrid,
    setShowPixelGrid,
    setSourcePreviewContent,
    setSourcePreviewZoom,
    setStartupWorkspaceLayout,
    setSynchronizePan,
    setSynchronizeZoom,
    setTileUsageFilter,
    setTilemapBenchmarkOpen,
    setTilemapBenchmarkRows,
    setTilemapBenchmarkRunning,
    setUiTypography,
    setWorkbenchAdjustmentsFloating,
    setWorkbenchAdjustmentsFloatingAutoHeight,
    setWorkbenchAdjustmentsFloatingHeight,
    setWorkbenchAdjustmentsFloatingWidth,
    setWorkbenchAdjustmentsFloatingX,
    setWorkbenchAdjustmentsFloatingY,
    setWorkbenchAnnouncement,
    setWorkbenchBottomDockLayer,
    setWorkbenchBottomHeight,
    setWorkbenchBottomMinimizedLayer,
    setWorkbenchDitheringFloating,
    setWorkbenchDitheringFloatingAutoHeight,
    setWorkbenchDitheringFloatingHeight,
    setWorkbenchDitheringFloatingWidth,
    setWorkbenchDitheringFloatingX,
    setWorkbenchDitheringFloatingY,
    setWorkbenchFloatingX,
    setWorkbenchFloatingY,
    setWorkbenchGeometryFloating,
    setWorkbenchGeometryFloatingAutoHeight,
    setWorkbenchGeometryFloatingHeight,
    setWorkbenchGeometryFloatingWidth,
    setWorkbenchGeometryFloatingX,
    setWorkbenchGeometryFloatingY,
    setWorkbenchLayoutMenu,
    setWorkbenchLayoutMenuPosition,
    setWorkbenchLeftDockLayer,
    setWorkbenchLeftWidth,
    setWorkbenchPaletteFloating,
    setWorkbenchPaletteFloatingAutoHeight,
    setWorkbenchPaletteFloatingHeight,
    setWorkbenchPaletteFloatingWidth,
    setWorkbenchPaletteFloatingX,
    setWorkbenchPaletteFloatingY,
    setWorkbenchPreviewLayer,
    setWorkbenchResultDockedWidth,
    setWorkbenchResultFloating,
    setWorkbenchResultFloatingAutoHeight,
    setWorkbenchResultFloatingHeight,
    setWorkbenchResultFloatingWidth,
    setWorkbenchResultFloatingX,
    setWorkbenchResultFloatingY,
    setWorkbenchRightDockLayer,
    setWorkbenchRightWidth,
    setWorkbenchSectionsOpen,
    setWorkbenchSettingsDock,
    setWorkbenchSettingsFloatingHeight,
    setWorkbenchSettingsFloatingWidth,
    setWorkbenchSettingsMinimized,
    setWorkbenchSourceDockedWidth,
    setWorkbenchSourceFloating,
    setWorkbenchSourceFloatingAutoHeight,
    setWorkbenchSourceFloatingHeight,
    setWorkbenchSourceFloatingWidth,
    setWorkbenchSourceFloatingX,
    setWorkbenchSourceFloatingY,
    setWorkbenchTileDrag,
    setWorkbenchTilemapFloating,
    setWorkbenchTilemapFloatingAutoHeight,
    setWorkbenchTilemapFloatingHeight,
    setWorkbenchTilemapFloatingWidth,
    setWorkbenchTilemapFloatingX,
    setWorkbenchTilemapFloatingY,
    setWorkbenchToolsFloatingHeight,
    setWorkbenchToolsFloatingWidth,
    setWorkbenchToolsFloatingX,
    setWorkbenchToolsFloatingY,
    setWorkbenchWindowLayouts,
    setWorkbenchWindowOrder,
    setWorkspaceLayout,
    setWorkspaceProfileBaseline,
    setWorkspaceProfileBaselinePending,
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
    sourceReplacementRevisionRef,
    startupWorkspaceAppliedRef,
    startupWorkspaceLayout,
    synchronizePan,
    synchronizeZoom,
    tileUsageFilter,
    tilemapBenchmarkOpen,
    tilemapBenchmarkRows,
    tilemapBenchmarkRunRef,
    tilemapBenchmarkRunning,
    uiTypography,
    workbenchAdjustmentsFloating,
    workbenchAdjustmentsFloatingAutoHeight,
    workbenchAdjustmentsFloatingHeight,
    workbenchAdjustmentsFloatingWidth,
    workbenchAdjustmentsFloatingX,
    workbenchAdjustmentsFloatingY,
    workbenchAnnouncement,
    workbenchBottomDockLayer,
    workbenchBottomHeight,
    workbenchBottomMinimizedLayer,
    workbenchDimensionsRef,
    workbenchDitheringFloating,
    workbenchDitheringFloatingAutoHeight,
    workbenchDitheringFloatingHeight,
    workbenchDitheringFloatingWidth,
    workbenchDitheringFloatingX,
    workbenchDitheringFloatingY,
    workbenchDragMovedRef,
    workbenchDragRef,
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
    workbenchLeftDockLayer,
    workbenchLeftWidth,
    workbenchPaletteFloating,
    workbenchPaletteFloatingAutoHeight,
    workbenchPaletteFloatingHeight,
    workbenchPaletteFloatingWidth,
    workbenchPaletteFloatingX,
    workbenchPaletteFloatingY,
    workbenchPreviewLayer,
    workbenchPreviewWorkspaceRef,
    workbenchResizeRef,
    workbenchResultDockedWidth,
    workbenchResultFloating,
    workbenchResultFloatingAutoHeight,
    workbenchResultFloatingHeight,
    workbenchResultFloatingWidth,
    workbenchResultFloatingX,
    workbenchResultFloatingY,
    workbenchRightDockLayer,
    workbenchRightWidth,
    workbenchRootRef,
    workbenchSectionsOpen,
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
    workbenchTileDragRef,
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
    workbenchWindowOrder,
    workspaceLayout,
    workspaceProfileBaseline,
    workspaceProfileBaselinePending,
    workspaceProfileSelectionMadeRef,
    zxPaletteEditorOpen,
  };
}
