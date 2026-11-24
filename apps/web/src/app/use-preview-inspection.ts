import { BUILTIN_WORKSPACE_PROFILE_PREFIX, type PreviewContent, type PreviewSide, type PreviewZoom, type SettingsSection, type WorkbenchFocusTarget } from "../app-types.js";
import { draftPreviewResult } from "../draft-preview-state.js";
import { type PointerEvent as ReactPointerEvent, type UIEvent as ReactUIEvent, type WheelEvent as ReactWheelEvent } from "react";
import { createSavedWorkbenchLayoutId, normalizeSavedLayoutName, saveActiveWorkspaceProfileId, type SavedWorkbenchLayout, saveHiddenBuiltinWorkspaceProfiles, saveSavedWorkbenchLayouts } from "../saved-workbench-layouts.js";
import { BUILT_IN_WORKSPACE_LAYOUTS } from "../workbench-menu-bar.js";
import { type InspectedAttribute, inspectSoftwareScr, mapSynchronizedScroll } from "../inspection.js";
import { type WorkerCharsetResult, type WorkerConversionResult } from "../worker/client.js";
import { cloneNativeResultBitmap, createNativeResultBitmap } from "../result-bitmap-editor.js";
import { cloneZxAttributeCell, readZxAttributeCell } from "../bitmap-attribute-cell-editor.js";
import { rebuildCharsetResult } from "../specscii-assets.js";
import type { useRuntimeState } from "./use-runtime-state.js";
import type { useSettingsState } from "./use-settings-state.js";
import type { useWorkbenchState } from "./use-workbench-state.js";
import type { useWorkbenchWindows } from "./use-workbench-windows.js";
import type { useWorkbenchLayout } from "./use-workbench-layout.js";
import type { useResultEditing } from "./use-result-editing.js";
import { snapshotTileEditor, workspaceProfileSnapshotKey } from "./preview-inspection-helpers.js";

export function usePreviewInspection(
  { activePanSideRef, activeWorkspaceProfileId, applyWorkspaceLayout, attributeHeight, bitmapEditorActiveSide, bitmapEditorColorPickerActive, bitmapEditorCurrentResultRef, bitmapEditorNavigatorPointerRef, bitmapEditorPatternPickerActive, bitmapEditorResultBufferRef, bitmapEditorResultCanvasRef, bitmapEditorResultEdited, bitmapEditorResultFrameIndex, bitmapEditorSourceCanvasRef, bitmapEditorTarget, bringWorkbenchWindowToFront, charsetState, clearBitmapEditorPickedCell, destinationGeometry, draftState, hiddenBuiltinWorkspaceProfileIds, hideAttributes, inspectionDrawerOpen, lastFinal, mouseWheelZoom, outputPreviewStage, panDragRef, previewZoom, resultFrameInput, resultPreviewContent, resultPreviewZoom, resultViewportRef, savedWorkbenchLayouts, setActiveWorkspaceProfileId, setBitmapEditorBrightPolicy, setBitmapEditorCell, setBitmapEditorCellMode, setBitmapEditorColorPickerActive, setBitmapEditorFlashPolicy, setBitmapEditorInkColor, setBitmapEditorNavigatorViewport, setBitmapEditorPaperColor, setBitmapEditorPasteMode, setBitmapEditorPatternPickerActive, setBitmapEditorPickedCell, setBitmapEditorPickedFrameIndex, setBitmapEditorRegionSelection, setBitmapEditorResultFrameIndex, setBitmapEditorResultOriginal, setBitmapEditorResultRedo, setBitmapEditorResultUndo, setBitmapEditorScope, setBitmapEditorSelection, setBitmapEditorSelectionDraft, setCharsetState, setDirty, setDraggingSide, setExportError, setHiddenBuiltinWorkspaceProfileIds, setInputPreviewStage, setInspection, setOutputPreviewStage, setPreviewZoom, setQlMixedDisplayResolution, setResultEditorBuffer, setResultPreviewContent, setResultPreviewZoom, setSavedWorkbenchLayouts, setSettingsSection, setShowAttributeGrid, setShowPixelGrid, setSourcePreviewContent, setSourcePreviewZoom, setSynchronizeZoom, setTileEditorColorPickerActive, setTileEditorEdited, setTileEditorRedo, setTileEditorSelected, setTileEditorTilePickerActive, setTileEditorUndo, setTileStampDraft, setTilemapEditorCell, setTilemapStale, setWorkbenchSectionOpen, setWorkbenchSettingsMinimized, setWorkbenchWindowMinimized, setWorkbenchWindowOpen, setWorkspaceLayout, setWorkspaceProfileBaseline, setWorkspaceProfileBaselinePending, showAttributeGrid, showPixelGrid, sourcePreviewContent, sourcePreviewZoom, sourceViewportRef, synchronizePan, synchronizeZoom, targetModeId, tileEditorColorPickerActive, tileEditorTilePickerActive, tilemapEditorCell, tilemapStale, unifiedTileEditorContext, workbenchAdjustmentsFloating, workbenchAdjustmentsFloatingAutoHeight, workbenchAdjustmentsFloatingHeight, workbenchAdjustmentsFloatingWidth, workbenchAdjustmentsFloatingX, workbenchAdjustmentsFloatingY, workbenchBottomHeight, workbenchDitheringFloating, workbenchDitheringFloatingAutoHeight, workbenchDitheringFloatingHeight, workbenchDitheringFloatingWidth, workbenchDitheringFloatingX, workbenchDitheringFloatingY, workbenchFloatingX, workbenchFloatingY, workbenchGeometryFloating, workbenchGeometryFloatingAutoHeight, workbenchGeometryFloatingHeight, workbenchGeometryFloatingWidth, workbenchGeometryFloatingX, workbenchGeometryFloatingY, workbenchLeftWidth, workbenchPaletteFloating, workbenchPaletteFloatingAutoHeight, workbenchPaletteFloatingHeight, workbenchPaletteFloatingWidth, workbenchPaletteFloatingX, workbenchPaletteFloatingY, workbenchResultDockedWidth, workbenchResultFloating, workbenchResultFloatingAutoHeight, workbenchResultFloatingHeight, workbenchResultFloatingWidth, workbenchResultFloatingX, workbenchResultFloatingY, workbenchRightWidth, workbenchSectionsOpen, workbenchSettingsDock, workbenchSettingsFloatingHeight, workbenchSettingsFloatingWidth, workbenchSettingsMinimized, workbenchSettingsSideWidth, workbenchSourceDockedWidth, workbenchSourceFloating, workbenchSourceFloatingAutoHeight, workbenchSourceFloatingHeight, workbenchSourceFloatingWidth, workbenchSourceFloatingX, workbenchSourceFloatingY, workbenchTilemapFloating, workbenchTilemapFloatingAutoHeight, workbenchTilemapFloatingHeight, workbenchTilemapFloatingWidth, workbenchTilemapFloatingX, workbenchTilemapFloatingY, workbenchToolsDock, workbenchToolsFloatingHeight, workbenchToolsFloatingWidth, workbenchToolsFloatingX, workbenchToolsFloatingY, workbenchToolsOpen, workbenchWindowLayouts, workbenchWindowOrder, workspaceLayout, workspaceMode, workspaceProfileBaseline, workspaceProfileOptions }: Pick<ReturnType<typeof useRuntimeState>, "activePanSideRef" | "bitmapEditorColorPickerActive" | "bitmapEditorCurrentResultRef" | "bitmapEditorPatternPickerActive" | "bitmapEditorResultBufferRef" | "bitmapEditorResultCanvasRef" | "bitmapEditorResultEdited" | "bitmapEditorResultFrameIndex" | "bitmapEditorSourceCanvasRef" | "bitmapEditorTarget" | "charsetState" | "draftState" | "lastFinal" | "panDragRef" | "resultViewportRef" | "setBitmapEditorBrightPolicy" | "setBitmapEditorCell" | "setBitmapEditorCellMode" | "setBitmapEditorColorPickerActive" | "setBitmapEditorFlashPolicy" | "setBitmapEditorInkColor" | "setBitmapEditorPaperColor" | "setBitmapEditorPasteMode" | "setBitmapEditorPatternPickerActive" | "setBitmapEditorPickedCell" | "setBitmapEditorPickedFrameIndex" | "setBitmapEditorRegionSelection" | "setBitmapEditorResultFrameIndex" | "setBitmapEditorResultOriginal" | "setBitmapEditorResultRedo" | "setBitmapEditorResultUndo" | "setBitmapEditorScope" | "setBitmapEditorSelection" | "setBitmapEditorSelectionDraft" | "setCharsetState" | "setTileEditorColorPickerActive" | "setTileEditorEdited" | "setTileEditorRedo" | "setTileEditorSelected" | "setTileEditorTilePickerActive" | "setTileEditorUndo" | "setTileStampDraft" | "setTilemapEditorCell" | "sourceViewportRef" | "tileEditorColorPickerActive" | "tileEditorTilePickerActive" | "tilemapEditorCell" | "unifiedTileEditorContext"> &
    Pick<ReturnType<typeof useSettingsState>, "attributeHeight" | "setDirty" | "setExportError" | "setTilemapStale" | "targetModeId" | "tilemapStale" | "workspaceMode"> &
    Pick<ReturnType<typeof useWorkbenchState>, "activeWorkspaceProfileId" | "bitmapEditorNavigatorPointerRef" | "destinationGeometry" | "hiddenBuiltinWorkspaceProfileIds" | "hideAttributes" | "inspectionDrawerOpen" | "mouseWheelZoom" | "outputPreviewStage" | "previewZoom" | "resultPreviewContent" | "resultPreviewZoom" | "savedWorkbenchLayouts" | "setActiveWorkspaceProfileId" | "setBitmapEditorNavigatorViewport" | "setDraggingSide" | "setHiddenBuiltinWorkspaceProfileIds" | "setInputPreviewStage" | "setInspection" | "setOutputPreviewStage" | "setPreviewZoom" | "setQlMixedDisplayResolution" | "setResultPreviewContent" | "setResultPreviewZoom" | "setSavedWorkbenchLayouts" | "setSettingsSection" | "setShowAttributeGrid" | "setShowPixelGrid" | "setSourcePreviewContent" | "setSourcePreviewZoom" | "setSynchronizeZoom" | "setWorkbenchSettingsMinimized" | "setWorkspaceLayout" | "setWorkspaceProfileBaseline" | "setWorkspaceProfileBaselinePending" | "showAttributeGrid" | "showPixelGrid" | "sourcePreviewContent" | "sourcePreviewZoom" | "synchronizePan" | "synchronizeZoom" | "workbenchAdjustmentsFloating" | "workbenchAdjustmentsFloatingAutoHeight" | "workbenchAdjustmentsFloatingHeight" | "workbenchAdjustmentsFloatingWidth" | "workbenchAdjustmentsFloatingX" | "workbenchAdjustmentsFloatingY" | "workbenchBottomHeight" | "workbenchDitheringFloating" | "workbenchDitheringFloatingAutoHeight" | "workbenchDitheringFloatingHeight" | "workbenchDitheringFloatingWidth" | "workbenchDitheringFloatingX" | "workbenchDitheringFloatingY" | "workbenchFloatingX" | "workbenchFloatingY" | "workbenchGeometryFloating" | "workbenchGeometryFloatingAutoHeight" | "workbenchGeometryFloatingHeight" | "workbenchGeometryFloatingWidth" | "workbenchGeometryFloatingX" | "workbenchGeometryFloatingY" | "workbenchLeftWidth" | "workbenchPaletteFloating" | "workbenchPaletteFloatingAutoHeight" | "workbenchPaletteFloatingHeight" | "workbenchPaletteFloatingWidth" | "workbenchPaletteFloatingX" | "workbenchPaletteFloatingY" | "workbenchResultDockedWidth" | "workbenchResultFloating" | "workbenchResultFloatingAutoHeight" | "workbenchResultFloatingHeight" | "workbenchResultFloatingWidth" | "workbenchResultFloatingX" | "workbenchResultFloatingY" | "workbenchRightWidth" | "workbenchSectionsOpen" | "workbenchSettingsDock" | "workbenchSettingsFloatingHeight" | "workbenchSettingsFloatingWidth" | "workbenchSettingsMinimized" | "workbenchSettingsSideWidth" | "workbenchSourceDockedWidth" | "workbenchSourceFloating" | "workbenchSourceFloatingAutoHeight" | "workbenchSourceFloatingHeight" | "workbenchSourceFloatingWidth" | "workbenchSourceFloatingX" | "workbenchSourceFloatingY" | "workbenchTilemapFloating" | "workbenchTilemapFloatingAutoHeight" | "workbenchTilemapFloatingHeight" | "workbenchTilemapFloatingWidth" | "workbenchTilemapFloatingX" | "workbenchTilemapFloatingY" | "workbenchToolsFloatingHeight" | "workbenchToolsFloatingWidth" | "workbenchToolsFloatingX" | "workbenchToolsFloatingY" | "workbenchWindowLayouts" | "workbenchWindowOrder" | "workspaceLayout" | "workspaceProfileBaseline"> &
    Pick<ReturnType<typeof useWorkbenchWindows>, "bitmapEditorActiveSide" | "bringWorkbenchWindowToFront" | "setWorkbenchWindowMinimized" | "setWorkbenchWindowOpen" | "workbenchToolsDock" | "workbenchToolsOpen"> &
    Pick<ReturnType<typeof useWorkbenchLayout>, "applyWorkspaceLayout" | "setWorkbenchSectionOpen" | "workspaceProfileOptions"> &
    Pick<ReturnType<typeof useResultEditing>, "clearBitmapEditorPickedCell" | "resultFrameInput" | "setResultEditorBuffer">,
) {
  function setZoom(next: PreviewZoom) {
    if (synchronizeZoom) {
      setSourcePreviewZoom(next);
      setResultPreviewZoom(next);
    } else if (activePanSideRef.current === "source") {
      setSourcePreviewZoom(next);
    } else {
      setResultPreviewZoom(next);
    }
    setPreviewZoom(next);
  }

  function markPanSource(side: PreviewSide) {
    activePanSideRef.current = side;
    setPreviewZoom(side === "source" ? sourcePreviewZoom : resultPreviewZoom);
  }

  const displayedResult = workspaceMode === "tilemap" &&
      charsetState.kind === "ready" && !tilemapStale
    ? lastFinal
    : draftPreviewResult(draftState) ?? lastFinal;
  const displayedWidth = displayedResult?.verticalSpatialDiagnostics === undefined
    ? displayedResult?.width ?? destinationGeometry.width
    : outputPreviewStage === "merged" || outputPreviewStage === "screen-2"
      ? displayedResult.verticalSpatialDiagnostics.logicalWidth
      : displayedResult.width;
  const displayedHeight = displayedResult?.verticalSpatialDiagnostics !== undefined &&
      (outputPreviewStage === "merged" || outputPreviewStage === "screen-2")
    ? displayedResult.verticalSpatialDiagnostics.logicalHeight
    : displayedResult?.height ?? destinationGeometry.height;

  function handlePreviewWheel(side: PreviewSide, event: ReactWheelEvent<HTMLDivElement>): void {
    if (bitmapEditorActiveSide !== null && side !== bitmapEditorActiveSide) {
      event.preventDefault();
      return;
    }
    markPanSource(side);
    if (!mouseWheelZoom) return;
    if (event.deltaY === 0) return;
    event.preventDefault();
    const currentZoom = side === "source" ? sourcePreviewZoom : resultPreviewZoom;
    const current = currentZoom === "fit" ? 0 : currentZoom;
    const nextValue = Math.max(0, Math.min(16, current + (event.deltaY < 0 ? 1 : -1)));
    if (nextValue === current) return;
    const nextZoom = nextValue === 0 ? "fit" : nextValue as PreviewZoom;
    const viewport = side === "source" ? sourceViewportRef.current : resultViewportRef.current;
    if (viewport !== null) {
      const bounds = viewport.getBoundingClientRect();
      const stage = viewport.querySelector<HTMLElement>(".preview-stage");
      const canvas = stage?.querySelector<HTMLCanvasElement>("canvas");
      const logicalWidth = canvas?.width ?? displayedWidth;
      const logicalHeight = canvas?.height ?? displayedHeight;
      const stageBounds = stage?.getBoundingClientRect();
      const oldScaleX = stageBounds === undefined || logicalWidth === 0
        ? 1
        : stageBounds.width / logicalWidth;
      const oldScaleY = stageBounds === undefined || logicalHeight === 0
        ? 1
        : stageBounds.height / logicalHeight;
      const imageX = (event.clientX - bounds.left + viewport.scrollLeft) / oldScaleX;
      const imageY = (event.clientY - bounds.top + viewport.scrollTop) / oldScaleY;
      setZoom(nextZoom);
      window.requestAnimationFrame(() => {
        const nextStage = viewport.querySelector<HTMLElement>(".preview-stage");
        if (nextStage === null) return;
        const nextBounds = nextStage.getBoundingClientRect();
        const nextScaleX = nextBounds.width / logicalWidth;
        const nextScaleY = nextBounds.height / logicalHeight;
        viewport.scrollLeft = Math.max(0, imageX * nextScaleX - (event.clientX - bounds.left));
        viewport.scrollTop = Math.max(0, imageY * nextScaleY - (event.clientY - bounds.top));
      });
      return;
    }
    setZoom(nextZoom);
  }

  function currentSavedWorkbenchLayout(name: string): SavedWorkbenchLayout {
    return {
      id: createSavedWorkbenchLayoutId(name),
      name,
      workspaceMode,
      workspace: {
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
      },
      workbench: {
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
      },
    };
  }

  function updateSavedWorkbenchLayouts(nextLayouts: readonly SavedWorkbenchLayout[]): void {
    setSavedWorkbenchLayouts(nextLayouts);
    saveSavedWorkbenchLayouts(localStorage, nextLayouts);
  }

  function saveWorkspaceProfileChanges(): void {
    const activeProfile = workspaceProfileOptions.find(({ id }) => id === activeWorkspaceProfileId);
    if (activeProfile === undefined) return;
    const current = currentSavedWorkbenchLayout(activeProfile.name);
    const nextLayout = { ...current, id: activeProfile.id, name: activeProfile.name };
    const nextLayouts = savedWorkbenchLayouts.some(({ id }) => id === nextLayout.id)
      ? savedWorkbenchLayouts.map((layout) => layout.id === nextLayout.id ? nextLayout : layout)
      : [nextLayout, ...savedWorkbenchLayouts];
    updateSavedWorkbenchLayouts(nextLayouts);
    setWorkspaceProfileBaseline(workspaceProfileSnapshotKey(nextLayout));
    setWorkspaceProfileBaselinePending(false);
  }

  function saveWorkspaceProfileAs(requestedName: string): boolean {
    const name = normalizeSavedLayoutName(requestedName);
    if (name.length === 0) return false;
    const customProfileCount = savedWorkbenchLayouts.filter((layout) => !layout.id.startsWith(BUILTIN_WORKSPACE_PROFILE_PREFIX)).length;
    if (customProfileCount >= 12) {
      window.alert("You can save up to 12 custom workspace profiles. Delete one before saving another.");
      return false;
    }
    const duplicate = workspaceProfileOptions.some(({ name: profileName }) => profileName.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (duplicate) {
      window.alert(`A workspace profile named “${name}” already exists. Choose a different name.`);
      return false;
    }
    const nextLayout = { ...currentSavedWorkbenchLayout(name), id: createSavedWorkbenchLayoutId(name) };
    updateSavedWorkbenchLayouts([nextLayout, ...savedWorkbenchLayouts]);
    setActiveWorkspaceProfileId(nextLayout.id);
    saveActiveWorkspaceProfileId(localStorage, nextLayout.id);
    setWorkspaceProfileBaseline(workspaceProfileSnapshotKey(nextLayout));
    setWorkspaceProfileBaselinePending(false);
    return true;
  }
  const currentWorkspaceProfileSnapshotKey = workspaceProfileSnapshotKey(currentSavedWorkbenchLayout(""));
  const workspaceProfileDirty = workspaceProfileBaseline !== "" &&
    currentWorkspaceProfileSnapshotKey !== workspaceProfileBaseline;

  function renameWorkspaceProfile(id: string, requestedName: string): boolean {
    const name = normalizeSavedLayoutName(requestedName);
    if (name.length === 0) return false;
    const duplicate = workspaceProfileOptions.some((profile) => profile.id !== id && profile.name.toLocaleLowerCase() === name.toLocaleLowerCase());
    if (duplicate) {
      window.alert(`A workspace profile named “${name}” already exists. Choose a different name.`);
      return false;
    }
    const existing = savedWorkbenchLayouts.find((layout) => layout.id === id);
    if (existing === undefined && workspaceProfileDirty) {
      window.alert("Save the layout changes before renaming this default profile.");
      return false;
    }
    const renamed = existing === undefined
      ? { ...currentSavedWorkbenchLayout(name), id, name }
      : { ...existing, name };
    const nextLayouts = existing === undefined
      ? [renamed, ...savedWorkbenchLayouts]
      : savedWorkbenchLayouts.map((layout) => layout.id === id ? renamed : layout);
    updateSavedWorkbenchLayouts(nextLayouts);
    return true;
  }

  function deleteWorkspaceProfile(id: string): void {
    const profile = workspaceProfileOptions.find(({ id: profileId }) => profileId === id);
    if (profile === undefined) return;
    const isBuiltIn = id.startsWith(BUILTIN_WORKSPACE_PROFILE_PREFIX);
    if (isBuiltIn && workspaceProfileOptions.filter(({ kind }) => kind === "builtin").length <= 1) {
      window.alert("At least one default workspace profile must remain available.");
      return;
    }
    if (!window.confirm(`Delete the “${profile.name}” workspace profile? You can restore the default profiles later.`)) return;
    const nextLayouts = savedWorkbenchLayouts.filter((layout) => layout.id !== id);
    updateSavedWorkbenchLayouts(nextLayouts);
    if (isBuiltIn) {
      const builtInId = id.slice(BUILTIN_WORKSPACE_PROFILE_PREFIX.length);
      const nextHidden = [...hiddenBuiltinWorkspaceProfileIds, builtInId];
      setHiddenBuiltinWorkspaceProfileIds(nextHidden);
      saveHiddenBuiltinWorkspaceProfiles(localStorage, nextHidden);
    }
    if (activeWorkspaceProfileId === id) {
      const nextBuiltIn = BUILT_IN_WORKSPACE_LAYOUTS.find(({ id: builtInId }) =>
        builtInId !== (isBuiltIn ? id.slice(BUILTIN_WORKSPACE_PROFILE_PREFIX.length) : "") &&
        !hiddenBuiltinWorkspaceProfileIds.includes(builtInId),
      ) ?? BUILT_IN_WORKSPACE_LAYOUTS[0];
      if (nextBuiltIn !== undefined) applyWorkspaceLayout(nextBuiltIn.id);
    }
  }

  function restoreDefaultWorkspaceProfiles(): void {
    const hasOverrides = savedWorkbenchLayouts.some((layout) => layout.id.startsWith(BUILTIN_WORKSPACE_PROFILE_PREFIX));
    if ((hiddenBuiltinWorkspaceProfileIds.length > 0 || hasOverrides) &&
        !window.confirm("Restore the original default workspace profiles? This removes edits to defaults and brings back deleted defaults.")) return;
    const nextLayouts = savedWorkbenchLayouts.filter((layout) => !layout.id.startsWith(BUILTIN_WORKSPACE_PROFILE_PREFIX));
    updateSavedWorkbenchLayouts(nextLayouts);
    setHiddenBuiltinWorkspaceProfileIds([]);
    saveHiddenBuiltinWorkspaceProfiles(localStorage, []);
    if (activeWorkspaceProfileId.startsWith(BUILTIN_WORKSPACE_PROFILE_PREFIX)) {
      const activeLayoutId = activeWorkspaceProfileId.slice(BUILTIN_WORKSPACE_PROFILE_PREFIX.length);
      const activeLayout = BUILT_IN_WORKSPACE_LAYOUTS.find(({ id }) => id === activeLayoutId);
      applyWorkspaceLayout(activeLayout?.id ?? "conversion");
    } else {
      setWorkspaceProfileBaseline(currentWorkspaceProfileSnapshotKey);
      setWorkspaceProfileBaselinePending(false);
    }
  }

  function selectPreviewContent(side: PreviewSide, content: PreviewContent): void {
    markPanSource(side);
    if (side === "source") setSourcePreviewContent(content);
    else setResultPreviewContent(content);
    setWorkspaceLayout("custom");
    if (content === "image" || content === "source-image") {
      if (synchronizeZoom) {
        setSourcePreviewZoom("fit");
        setResultPreviewZoom("fit");
        setPreviewZoom("fit");
      } else if (side === "source") {
        setSourcePreviewZoom("fit");
      } else {
        setResultPreviewZoom("fit");
      }
    }
    if (content === "bitmap-editor") {
      setSynchronizeZoom(false);
      if (side === "source") {
        setResultPreviewContent("result-image");
        setResultPreviewZoom("fit");
        if (sourcePreviewZoom === "fit") setSourcePreviewZoom(12);
      } else {
        setSourcePreviewContent("result-image");
        setSourcePreviewZoom("fit");
        if (resultPreviewZoom === "fit") setResultPreviewZoom(12);
      }
      setShowPixelGrid(true);
      setShowAttributeGrid(true);
    }
    if (content === "inspector") setSynchronizeZoom(false);
    if (content === "pre-attribute") setInputPreviewStage("pre-constraint");
    if (content === "image" || content === "source-image") setInputPreviewStage("source");
    if (content === "screen-1") setOutputPreviewStage("screen-1");
    if (content === "screen-2") setOutputPreviewStage("screen-2");
    if ((side === "result" && content === "image") || content === "result-image") {
      setOutputPreviewStage(
        targetModeId.includes("vertical-spatial") ? "screen-1" : "merged",
      );
    }
    if (content === "merged-low" || content === "merged-high") {
      setOutputPreviewStage("merged");
      setQlMixedDisplayResolution(content === "merged-low" ? "low" : "high");
    }
  }

  function focusSettingsSection(section: Exclude<SettingsSection, "all">): void {
    setSettingsSection(section);
    setWorkbenchSettingsMinimized(section !== "tilemap" || !workbenchTilemapFloating);
    bringWorkbenchWindowToFront(section === "tilemap" ? "tilemap" : section);
    setWorkbenchSectionOpen(section, true);
    window.requestAnimationFrame(() => {
      const element = document.getElementById(`settings-${section}`);
      if (element === null) return;
      element.scrollIntoView({ behavior: "smooth", block: "nearest" });
      element.querySelector<HTMLElement>("select, input, button, textarea")?.focus({
        preventScroll: true,
      });
    });
  }

  function focusWorkbenchTarget(target: WorkbenchFocusTarget): void {
    if (target === "all") {
      setSettingsSection("all");
      return;
    }
    if (target === "settings") {
      setSettingsSection("all");
      setWorkbenchSettingsMinimized(false);
      bringWorkbenchWindowToFront("settings");
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(".workbench-settings-window .workbench-window-title")?.focus({ preventScroll: true });
      });
      return;
    }
    if (target === "tools") {
      setSettingsSection("all");
      setWorkbenchWindowOpen("tools", true);
      setWorkbenchWindowMinimized("tools", false);
      bringWorkbenchWindowToFront("tools");
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('[data-workbench-window="tools"] > summary')?.focus({ preventScroll: true });
      });
      return;
    }
    if (target === "source" || target === "result") {
      setSettingsSection("all");
      bringWorkbenchWindowToFront(target);
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(`.${target}-panel select, .${target}-panel canvas, .${target}-panel button`)?.focus({ preventScroll: true });
      });
      return;
    }
    if (target === "tilemap") {
      setSettingsSection("tilemap");
      setWorkbenchSectionOpen("tilemap", true);
      if (workbenchTilemapFloating) {
        bringWorkbenchWindowToFront("tilemap");
      } else {
        setWorkbenchSettingsMinimized(false);
        bringWorkbenchWindowToFront("settings");
      }
      window.requestAnimationFrame(() => {
        document.getElementById("settings-tilemap")?.querySelector<HTMLElement>("select, input, button, textarea")?.focus({ preventScroll: true });
      });
      return;
    }
    focusSettingsSection(target);
  }

  function stepZoom(delta: -1 | 1) {
    const current = previewZoom === "fit" ? 0 : previewZoom;
    const next = Math.max(0, Math.min(16, current + delta));
    setZoom(next === 0 ? "fit" : next as PreviewZoom);
  }

  function stepPreviewZoom(side: PreviewSide, delta: -1 | 1): void {
    markPanSource(side);
    const currentZoom = side === "source" ? sourcePreviewZoom : resultPreviewZoom;
    const current = currentZoom === "fit" ? 0 : currentZoom;
    const next = Math.max(0, Math.min(16, current + delta));
    setZoom(next === 0 ? "fit" : next as PreviewZoom);
  }

  function fitPreview(side: PreviewSide): void {
    markPanSource(side);
    setZoom("fit");
  }

  function synchronizePreviewScroll(
    source: HTMLDivElement,
    target: HTMLDivElement | null,
  ) {
    if (!synchronizePan || target === null) return;
    const mapped = mapSynchronizedScroll(
      { left: source.scrollLeft, top: source.scrollTop },
      {
        width: source.scrollWidth - source.clientWidth,
        height: source.scrollHeight - source.clientHeight,
      },
      {
        width: target.scrollWidth - target.clientWidth,
        height: target.scrollHeight - target.clientHeight,
      },
    );
    target.scrollLeft = mapped.left;
    target.scrollTop = mapped.top;
  }

  function updateBitmapEditorNavigatorViewport(): void {
    const editorSide = bitmapEditorActiveSide;
    if (editorSide === null) return;
    const viewport = editorSide === "source" ? sourceViewportRef.current : resultViewportRef.current;
    if (viewport === null) return;
    const scrollWidth = Math.max(1, viewport.scrollWidth);
    const scrollHeight = Math.max(1, viewport.scrollHeight);
    const next = {
      left: viewport.scrollLeft / scrollWidth,
      top: viewport.scrollTop / scrollHeight,
      width: Math.min(1, viewport.clientWidth / scrollWidth),
      height: Math.min(1, viewport.clientHeight / scrollHeight),
    };
    setBitmapEditorNavigatorViewport((current) =>
      Math.abs(current.left - next.left) < 0.001 &&
      Math.abs(current.top - next.top) < 0.001 &&
      Math.abs(current.width - next.width) < 0.001 &&
      Math.abs(current.height - next.height) < 0.001
        ? current
        : next);
  }

  function handlePreviewScroll(
    side: "source" | "result",
    event: ReactUIEvent<HTMLDivElement>,
  ) {
    if (side === bitmapEditorActiveSide) updateBitmapEditorNavigatorViewport();
    if (activePanSideRef.current !== side) return;
    synchronizePreviewScroll(
      event.currentTarget,
      side === "source" ? resultViewportRef.current : sourceViewportRef.current,
    );
  }

  function panBitmapEditorFromNavigator(
    side: PreviewSide,
    event: ReactPointerEvent<SVGSVGElement>,
  ): void {
    const editorSide = bitmapEditorActiveSide;
    if (editorSide === null || side === editorSide) return;
    const editorViewport = editorSide === "source" ? sourceViewportRef.current : resultViewportRef.current;
    if (editorViewport === null) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) return;
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    activePanSideRef.current = editorSide;
    editorViewport.scrollLeft = Math.max(0, x * editorViewport.scrollWidth - editorViewport.clientWidth / 2);
    editorViewport.scrollTop = Math.max(0, y * editorViewport.scrollHeight - editorViewport.clientHeight / 2);
    updateBitmapEditorNavigatorViewport();
    event.preventDefault();
    event.stopPropagation();
  }

  function beginBitmapEditorNavigatorDrag(
    side: PreviewSide,
    event: ReactPointerEvent<SVGSVGElement>,
  ): void {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    bitmapEditorNavigatorPointerRef.current = { side, pointerId: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    panBitmapEditorFromNavigator(side, event);
  }

  function moveBitmapEditorNavigatorDrag(event: ReactPointerEvent<SVGSVGElement>): void {
    const active = bitmapEditorNavigatorPointerRef.current;
    if (active === null || active.pointerId !== event.pointerId) return;
    panBitmapEditorFromNavigator(active.side, event);
  }

  function endBitmapEditorNavigatorDrag(event: ReactPointerEvent<SVGSVGElement>): void {
    const active = bitmapEditorNavigatorPointerRef.current;
    if (active === null || active.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    bitmapEditorNavigatorPointerRef.current = null;
  }

  function beginPreviewDrag(
    side: PreviewSide,
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (event.target instanceof HTMLCanvasElement) event.target.focus();
    markPanSource(side);
    panDragRef.current = {
      side,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: event.currentTarget.scrollLeft,
      scrollTop: event.currentTarget.scrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingSide(side);
    event.preventDefault();
  }

  function movePreviewDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = panDragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    event.currentTarget.scrollLeft = drag.scrollLeft - (event.clientX - drag.startX);
    event.currentTarget.scrollTop = drag.scrollTop - (event.clientY - drag.startY);
    event.preventDefault();
  }

  function endPreviewDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = panDragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panDragRef.current = null;
    setDraggingSide(null);
  }

  function inspectActivePixel(pixelX: number, pixelY: number): InspectedAttribute | null {
    const activeResult = draftPreviewResult(draftState) ?? lastFinal;
    if (activeResult === null || activeResult.platformId !== "zx-spectrum") return null;
    const frameIndex = outputPreviewStage === "screen-2" ? 1 : 0;
    const encoded = activeResult.frames[frameIndex]?.encoded ??
      activeResult.frames[0]?.encoded;
    if (encoded === undefined) return null;
    const nextInspection = inspectSoftwareScr(
      encoded,
      activeResult.attributeHeight ?? attributeHeight,
      Math.max(0, Math.min(255, pixelX)),
      Math.max(0, Math.min(191, pixelY)),
    );
    setInspection(nextInspection);
    return nextInspection;
  }

  function inspectResultPixel(event: ReactPointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pixelX = Math.max(0, Math.min(255, Math.floor(
      (event.clientX - bounds.left) / bounds.width * 256,
    )));
    const pixelY = Math.max(0, Math.min(191, Math.floor(
      (event.clientY - bounds.top) / bounds.height * 192,
    )));
    inspectActivePixel(pixelX, pixelY);
  }

  function selectResultEditorFrame(
    result: WorkerConversionResult,
    frameIndex: number,
    preservePickerState = false,
  ): void {
    if (!preservePickerState) {
      clearBitmapEditorPickedCell();
      setBitmapEditorColorPickerActive(false);
      setBitmapEditorPatternPickerActive(false);
      setBitmapEditorRegionSelection(null);
      setBitmapEditorSelectionDraft(null);
      setBitmapEditorPasteMode(null);
    }
    const safeFrameIndex = Math.min(frameIndex, Math.max(0, result.frames.length - 1));
    const input = resultFrameInput(result, safeFrameIndex);
    if (input === null) return;
    const bitmap = createNativeResultBitmap(input);
    bitmapEditorCurrentResultRef.current = result;
    setBitmapEditorResultFrameIndex(safeFrameIndex);
    setResultEditorBuffer(bitmap);
    if (!bitmapEditorResultEdited) {
      setBitmapEditorResultOriginal(cloneNativeResultBitmap(bitmap));
      setBitmapEditorResultUndo([]);
      setBitmapEditorResultRedo([]);
    }
  }

  function pickBitmapEditorAttributeCell(
    cellX: number,
    cellY: number,
    frameIndex = bitmapEditorResultFrameIndex,
    sourceResult = bitmapEditorCurrentResultRef.current ?? draftPreviewResult(draftState) ?? lastFinal,
    sourceEncoded?: Uint8Array,
  ): void {
    const result = sourceResult;
    if (result?.platformId !== "zx-spectrum") return;
    const safeFrameIndex = Math.min(frameIndex, Math.max(0, result.frames.length - 1));
    const input = resultFrameInput(result, safeFrameIndex);
    const encoded = sourceEncoded ?? bitmapEditorResultBufferRef.current?.encoded ?? input?.encoded;
    if (input === null || encoded === undefined || input.attributeHeight === null) return;
    try {
      setBitmapEditorPickedCell(cloneZxAttributeCell(readZxAttributeCell(encoded, input.attributeHeight, cellX, cellY)));
      setBitmapEditorPickedFrameIndex(safeFrameIndex);
      if (bitmapEditorColorPickerActive) {
        const picked = readZxAttributeCell(encoded, input.attributeHeight, cellX, cellY);
        setBitmapEditorInkColor(picked.attribute & 7);
        setBitmapEditorPaperColor((picked.attribute >> 3) & 7);
        setBitmapEditorBrightPolicy((picked.attribute & 0x40) !== 0);
        setBitmapEditorFlashPolicy((picked.attribute & 0x80) !== 0);
        setBitmapEditorColorPickerActive(false);
      }
      if (bitmapEditorPatternPickerActive) {
        setBitmapEditorScope("cell");
        setBitmapEditorCellMode("picked");
        setBitmapEditorPatternPickerActive(false);
      }
    } catch {
      setExportError("Bitmap editor could not inspect the selected attribute cell.");
    }
  }

  function pickBitmapEditorSourceFromResultWindow(pixelX: number, pixelY: number): boolean {
    if (!bitmapEditorColorPickerActive && !bitmapEditorPatternPickerActive) return false;
    const result = bitmapEditorCurrentResultRef.current ?? draftPreviewResult(draftState) ?? lastFinal;
    if (result?.platformId !== "zx-spectrum") return false;
    const frameIndex = Math.min(
      outputPreviewStage === "screen-2" ? 1 : 0,
      Math.max(0, result.frames.length - 1),
    );
    if (bitmapEditorTarget === "result" && bitmapEditorResultFrameIndex !== frameIndex) {
      selectResultEditorFrame(result, frameIndex, true);
    }
    const input = resultFrameInput(result, frameIndex);
    if (input === null || input.attributeHeight === null) return false;
    if (pixelX < 0 || pixelX >= 256 || pixelY < 0 || pixelY >= 192) return false;
    pickBitmapEditorAttributeCell(
      Math.floor(pixelX / 8),
      Math.floor(pixelY / input.attributeHeight),
      frameIndex,
      result,
      result.frames[frameIndex]?.encoded,
    );
    return true;
  }

  function focusBitmapEditorAt(pixelX: number, pixelY: number): void {
    const editorSide = sourcePreviewContent === "bitmap-editor"
      ? "source"
      : resultPreviewContent === "bitmap-editor" ? "result" : null;
    if (editorSide === null) return;
    window.requestAnimationFrame(() => {
      const viewport = editorSide === "source" ? sourceViewportRef.current : resultViewportRef.current;
      const canvas = editorSide === "source" ? bitmapEditorSourceCanvasRef.current : bitmapEditorResultCanvasRef.current;
      if (viewport === null || canvas === null || canvas.width === 0 || canvas.height === 0) return;
      const bounds = canvas.getBoundingClientRect();
      const scaleX = bounds.width / canvas.width;
      const scaleY = bounds.height / canvas.height;
      const targetX = pixelX * scaleX;
      const targetY = pixelY * scaleY;
      viewport.scrollLeft = Math.max(0, targetX - viewport.clientWidth / 2);
      viewport.scrollTop = Math.max(0, targetY - viewport.clientHeight / 2);
    });
  }

  function commitTileEditorResult(
    result: WorkerCharsetResult,
    charset: Uint8Array,
    assignments = result.assignments,
    encoding = result.encoding,
    attributes = result.attributes,
  ): void {
    const next = rebuildCharsetResult(result, charset, assignments, encoding, attributes);
    setCharsetState({ kind: "ready", result: next });
    setTilemapStale(false);
    setDirty(true);
    setTileEditorEdited(true);
  }

  function pushTileEditorHistory(result: WorkerCharsetResult): void {
    setTileEditorUndo((history) => [...history, snapshotTileEditor(result)]);
    setTileEditorRedo([]);
  }

  function updateSelectedTilemapCell(
    update: (assignment: WorkerCharsetResult["assignments"][number], attribute: number) => {
      readonly assignment?: WorkerCharsetResult["assignments"][number];
      readonly attribute?: number;
    },
  ): void {
    if (charsetState.kind !== "ready" || tilemapEditorCell === null) return;
    const result = charsetState.result;
    const cellIndex = tilemapEditorCell;
    const currentAssignment = result.assignments[cellIndex];
    if (currentAssignment === undefined) return;
    const currentAttribute = result.attributes[cellIndex] ?? 0;
    const updateResult = update(currentAssignment, currentAttribute);
    const nextAssignment = updateResult.assignment ?? currentAssignment;
    const nextAttribute = updateResult.attribute ?? currentAttribute;
    if (nextAssignment.characterIndex === currentAssignment.characterIndex &&
        nextAssignment.transform === currentAssignment.transform &&
        nextAssignment.inverted === currentAssignment.inverted &&
        nextAttribute === currentAttribute) return;
    const assignments = result.assignments.slice();
    assignments[cellIndex] = nextAssignment;
    const attributes = result.attributes.slice();
    attributes[cellIndex] = nextAttribute & 0xff;
    pushTileEditorHistory(result);
    commitTileEditorResult(result, result.charset, assignments, result.encoding, attributes);
  }

  function updateSelectedTilemapAttribute(update: (attribute: number) => number): void {
    if (unifiedTileEditorContext === "stamp") {
      setTileStampDraft((stamp) => ({ ...stamp, attribute: update(stamp.attribute) & 0xff }));
      return;
    }
    updateSelectedTilemapCell((_assignment, attribute) => ({ attribute: update(attribute) & 0xff }));
  }

  function applyPickedTilemapAttribute(attribute: number): void {
    updateSelectedTilemapAttribute(() => attribute & 0xff);
    setTileEditorColorPickerActive(false);
  }

  function applyPickedTilemapIndex(characterIndex: number): void {
    if (charsetState.kind !== "ready") return;
    if (!Number.isInteger(characterIndex) || characterIndex < 0 || characterIndex >= charsetState.result.characterCount) return;
    if (unifiedTileEditorContext === "stamp") {
      setTileStampDraft((stamp) => ({ ...stamp, characterIndex }));
      setTileEditorSelected(characterIndex);
      setTileEditorTilePickerActive(false);
      return;
    }
    if (tilemapEditorCell === null) return;
    updateSelectedTilemapCell((assignment) => ({
      assignment: { ...assignment, characterIndex },
    }));
    setTileEditorTilePickerActive(false);
  }

  function selectResultPixel(event: ReactPointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pixelX = Math.max(0, Math.min(255, Math.floor(
      (event.clientX - bounds.left) / bounds.width * 256,
    )));
    const pixelY = Math.max(0, Math.min(191, Math.floor(
      (event.clientY - bounds.top) / bounds.height * 192,
    )));
    if (workspaceMode === "tilemap" && tileEditorTilePickerActive && charsetState.kind === "ready") {
      const sourceCell = Math.floor(pixelY / 8) * 32 + Math.floor(pixelX / 8);
      const sourceAssignment = charsetState.result.assignments[sourceCell];
      if (sourceAssignment !== undefined) {
        applyPickedTilemapIndex(sourceAssignment.characterIndex);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (workspaceMode === "tilemap" && tileEditorColorPickerActive && charsetState.kind === "ready") {
      const sourceCell = Math.floor(pixelY / 8) * 32 + Math.floor(pixelX / 8);
      const sourceAttribute = charsetState.result.attributes[sourceCell];
      if (sourceAttribute !== undefined) {
        applyPickedTilemapAttribute(sourceAttribute);
        event.preventDefault();
        event.stopPropagation();
        return;
      }
    }
    if (pickBitmapEditorSourceFromResultWindow(pixelX, pixelY)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const selected = inspectActivePixel(pixelX, pixelY);
    if (selected !== null && workspaceMode === "tilemap" && charsetState.kind === "ready") {
      const cellIndex = selected.cellY * 32 + selected.cellX;
      setTilemapEditorCell(cellIndex);
      setTileEditorSelected(charsetState.result.assignments[cellIndex]?.characterIndex ?? 0);
    } else if (selected !== null) {
      setBitmapEditorSelection(selected);
      setBitmapEditorCell({
        rows: Uint8Array.from(selected.bitmapBytes.slice(0, 8)),
        attribute: selected.attribute,
      });
      focusBitmapEditorAt(pixelX, pixelY);
    }
  }

  return {
    applyPickedTilemapIndex,
    beginBitmapEditorNavigatorDrag,
    beginPreviewDrag,
    commitTileEditorResult,
    currentWorkspaceProfileSnapshotKey,
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
    inspectActivePixel,
    inspectResultPixel,
    markPanSource,
    moveBitmapEditorNavigatorDrag,
    movePreviewDrag,
    pickBitmapEditorAttributeCell,
    pushTileEditorHistory,
    renameWorkspaceProfile,
    restoreDefaultWorkspaceProfiles,
    saveWorkspaceProfileAs,
    saveWorkspaceProfileChanges,
    selectPreviewContent,
    selectResultEditorFrame,
    selectResultPixel,
    setZoom,
    stepPreviewZoom,
    stepZoom,
    updateBitmapEditorNavigatorViewport,
    updateSelectedTilemapAttribute,
    updateSelectedTilemapCell,
    workspaceProfileDirty,
  };
}
