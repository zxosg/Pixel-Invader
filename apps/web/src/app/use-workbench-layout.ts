import { type ActiveWorkbenchWindowId, DEFAULT_WORKBENCH_PREFERENCES, reorderWorkbenchWindowOrder, type WorkbenchSettingsSection, type WorkbenchWindowId, type WorkbenchWindowLayouts } from "../workbench-preferences.js";
import { saveActiveWorkspaceProfileId } from "../saved-workbench-layouts.js";
import { type WorkspaceLayoutId } from "../workspace-preferences.js";
import { BUILTIN_WORKSPACE_PROFILE_PREFIX, type WorkbenchFloatingSection, type WorkbenchTileDrag } from "../app-types.js";
import { BUILT_IN_WORKSPACE_LAYOUTS } from "../workbench-menu-bar.js";
import { type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, useEffect, useLayoutEffect } from "react";
import type { useSettingsState } from "./use-settings-state.js";
import type { useWorkbenchState } from "./use-workbench-state.js";
import type { useWorkbenchWindows } from "./use-workbench-windows.js";
import { preserveHiddenWorkbenchWindows, workbenchWindowCanDock } from "./workbench-windows-helpers.js";

export function useWorkbenchLayout(
  { bringWorkbenchWindowToFront, hiddenBuiltinWorkspaceProfileIds, savedWorkbenchLayouts, setActiveWorkspaceProfileId, setHideAttributes, setInspectionDrawerOpen, setPreviewZoom, setResultPreviewContent, setResultPreviewZoom, setShowAttributeGrid, setShowPixelGrid, setSourcePreviewContent, setSourcePreviewZoom, setSynchronizePan, setSynchronizeZoom, setWorkbenchAdjustmentsFloating, setWorkbenchAdjustmentsFloatingAutoHeight, setWorkbenchAdjustmentsFloatingHeight, setWorkbenchAdjustmentsFloatingWidth, setWorkbenchAdjustmentsFloatingX, setWorkbenchAdjustmentsFloatingY, setWorkbenchAnnouncement, setWorkbenchBottomHeight, setWorkbenchDitheringFloating, setWorkbenchDitheringFloatingAutoHeight, setWorkbenchDitheringFloatingHeight, setWorkbenchDitheringFloatingWidth, setWorkbenchDitheringFloatingX, setWorkbenchDitheringFloatingY, setWorkbenchDockSplitRatios, setWorkbenchFloatingX, setWorkbenchFloatingY, setWorkbenchGeometryFloating, setWorkbenchGeometryFloatingAutoHeight, setWorkbenchGeometryFloatingHeight, setWorkbenchGeometryFloatingWidth, setWorkbenchGeometryFloatingX, setWorkbenchGeometryFloatingY, setWorkbenchLeftWidth, setWorkbenchPaletteFloating, setWorkbenchPaletteFloatingAutoHeight, setWorkbenchPaletteFloatingHeight, setWorkbenchPaletteFloatingWidth, setWorkbenchPaletteFloatingX, setWorkbenchPaletteFloatingY, setWorkbenchResultDockedWidth, setWorkbenchResultFloating, setWorkbenchResultFloatingAutoHeight, setWorkbenchResultFloatingHeight, setWorkbenchResultFloatingWidth, setWorkbenchResultFloatingX, setWorkbenchResultFloatingY, setWorkbenchRightWidth, setWorkbenchSectionsOpen, setWorkbenchSettingsDock, setWorkbenchSettingsFloatingHeight, setWorkbenchSettingsFloatingWidth, setWorkbenchSettingsMinimized, setWorkbenchSourceDockedWidth, setWorkbenchSourceFloating, setWorkbenchSourceFloatingAutoHeight, setWorkbenchSourceFloatingHeight, setWorkbenchSourceFloatingWidth, setWorkbenchSourceFloatingX, setWorkbenchSourceFloatingY, setWorkbenchTileDrag, setWorkbenchTilemapFloating, setWorkbenchTilemapFloatingAutoHeight, setWorkbenchTilemapFloatingHeight, setWorkbenchTilemapFloatingWidth, setWorkbenchTilemapFloatingX, setWorkbenchTilemapFloatingY, setWorkbenchToolsFloating, setWorkbenchToolsFloatingHeight, setWorkbenchToolsFloatingWidth, setWorkbenchToolsFloatingX, setWorkbenchToolsFloatingY, setWorkbenchWindowDock, setWorkbenchWindowLayouts, setWorkbenchWindowOpen, setWorkbenchWindowOrder, setWorkspaceLayout, setWorkspaceMode, setWorkspaceProfileBaselinePending, snapWorkbenchPosition, snapWorkbenchSize, startupWorkbenchPreferences, startupWorkspaceLayout, updateWorkbenchWindowLayout, workbenchAdjustmentsFloating, workbenchAdjustmentsFloatingHeight, workbenchAdjustmentsFloatingWidth, workbenchAdjustmentsFloatingX, workbenchAdjustmentsFloatingY, workbenchBottomHeight, workbenchDimensionsRef, workbenchDitheringFloating, workbenchDitheringFloatingHeight, workbenchDitheringFloatingWidth, workbenchDitheringFloatingX, workbenchDitheringFloatingY, workbenchDragMovedRef, workbenchDragRef, workbenchFloatingX, workbenchFloatingY, workbenchGeometryFloating, workbenchGeometryFloatingHeight, workbenchGeometryFloatingWidth, workbenchGeometryFloatingX, workbenchGeometryFloatingY, workbenchGridSize, workbenchLeftWidth, workbenchPaintColorsFloating, workbenchPaletteFloating, workbenchPaletteFloatingHeight, workbenchPaletteFloatingWidth, workbenchPaletteFloatingX, workbenchPaletteFloatingY, workbenchPreviewWorkspaceRef, workbenchResizeRef, workbenchResultFloating, workbenchResultFloatingHeight, workbenchResultFloatingWidth, workbenchResultFloatingX, workbenchResultFloatingY, workbenchRightWidth, workbenchRootRef, workbenchSettingsDock, workbenchSettingsDockEmpty, workbenchSettingsFloatingHeight, workbenchSettingsFloatingWidth, workbenchSettingsSideWidth, workbenchSettingsWindowRef, workbenchSourceFloating, workbenchSourceFloatingHeight, workbenchSourceFloatingWidth, workbenchSourceFloatingX, workbenchSourceFloatingY, workbenchTileDragRef, workbenchTileDropForPointer, workbenchTilemapFloating, workbenchTilemapFloatingHeight, workbenchTilemapFloatingWidth, workbenchTilemapFloatingX, workbenchTilemapFloatingY, workbenchToolsFloating, workbenchToolsFloatingHeight, workbenchToolsFloatingWidth, workbenchToolsFloatingX, workbenchToolsFloatingY, workbenchWindowLayout, workbenchWindowsInDock, workspaceMode, workspaceProfileSelectionMadeRef }: Pick<ReturnType<typeof useSettingsState>, "setWorkspaceMode" | "startupWorkbenchPreferences" | "workspaceMode"> &
    Pick<ReturnType<typeof useWorkbenchState>, "hiddenBuiltinWorkspaceProfileIds" | "savedWorkbenchLayouts" | "setActiveWorkspaceProfileId" | "setHideAttributes" | "setInspectionDrawerOpen" | "setPreviewZoom" | "setResultPreviewContent" | "setResultPreviewZoom" | "setShowAttributeGrid" | "setShowPixelGrid" | "setSourcePreviewContent" | "setSourcePreviewZoom" | "setSynchronizePan" | "setSynchronizeZoom" | "setWorkbenchAdjustmentsFloating" | "setWorkbenchAdjustmentsFloatingAutoHeight" | "setWorkbenchAdjustmentsFloatingHeight" | "setWorkbenchAdjustmentsFloatingWidth" | "setWorkbenchAdjustmentsFloatingX" | "setWorkbenchAdjustmentsFloatingY" | "setWorkbenchAnnouncement" | "setWorkbenchBottomHeight" | "setWorkbenchDitheringFloating" | "setWorkbenchDitheringFloatingAutoHeight" | "setWorkbenchDitheringFloatingHeight" | "setWorkbenchDitheringFloatingWidth" | "setWorkbenchDitheringFloatingX" | "setWorkbenchDitheringFloatingY" | "setWorkbenchFloatingX" | "setWorkbenchFloatingY" | "setWorkbenchGeometryFloating" | "setWorkbenchGeometryFloatingAutoHeight" | "setWorkbenchGeometryFloatingHeight" | "setWorkbenchGeometryFloatingWidth" | "setWorkbenchGeometryFloatingX" | "setWorkbenchGeometryFloatingY" | "setWorkbenchLeftWidth" | "setWorkbenchPaletteFloating" | "setWorkbenchPaletteFloatingAutoHeight" | "setWorkbenchPaletteFloatingHeight" | "setWorkbenchPaletteFloatingWidth" | "setWorkbenchPaletteFloatingX" | "setWorkbenchPaletteFloatingY" | "setWorkbenchResultDockedWidth" | "setWorkbenchResultFloating" | "setWorkbenchResultFloatingAutoHeight" | "setWorkbenchResultFloatingHeight" | "setWorkbenchResultFloatingWidth" | "setWorkbenchResultFloatingX" | "setWorkbenchResultFloatingY" | "setWorkbenchRightWidth" | "setWorkbenchSectionsOpen" | "setWorkbenchSettingsDock" | "setWorkbenchSettingsFloatingHeight" | "setWorkbenchSettingsFloatingWidth" | "setWorkbenchSettingsMinimized" | "setWorkbenchSourceDockedWidth" | "setWorkbenchSourceFloating" | "setWorkbenchSourceFloatingAutoHeight" | "setWorkbenchSourceFloatingHeight" | "setWorkbenchSourceFloatingWidth" | "setWorkbenchSourceFloatingX" | "setWorkbenchSourceFloatingY" | "setWorkbenchTileDrag" | "setWorkbenchTilemapFloating" | "setWorkbenchTilemapFloatingAutoHeight" | "setWorkbenchTilemapFloatingHeight" | "setWorkbenchTilemapFloatingWidth" | "setWorkbenchTilemapFloatingX" | "setWorkbenchTilemapFloatingY" | "setWorkbenchToolsFloatingHeight" | "setWorkbenchToolsFloatingWidth" | "setWorkbenchToolsFloatingX" | "setWorkbenchToolsFloatingY" | "setWorkbenchWindowLayouts" | "setWorkbenchWindowOrder" | "setWorkspaceLayout" | "setWorkspaceProfileBaselinePending" | "startupWorkspaceLayout" | "workbenchAdjustmentsFloating" | "workbenchAdjustmentsFloatingHeight" | "workbenchAdjustmentsFloatingWidth" | "workbenchAdjustmentsFloatingX" | "workbenchAdjustmentsFloatingY" | "workbenchBottomHeight" | "workbenchDimensionsRef" | "workbenchDitheringFloating" | "workbenchDitheringFloatingHeight" | "workbenchDitheringFloatingWidth" | "workbenchDitheringFloatingX" | "workbenchDitheringFloatingY" | "workbenchDragMovedRef" | "workbenchDragRef" | "workbenchFloatingX" | "workbenchFloatingY" | "workbenchGeometryFloating" | "workbenchGeometryFloatingHeight" | "workbenchGeometryFloatingWidth" | "workbenchGeometryFloatingX" | "workbenchGeometryFloatingY" | "workbenchLeftWidth" | "workbenchPaletteFloating" | "workbenchPaletteFloatingHeight" | "workbenchPaletteFloatingWidth" | "workbenchPaletteFloatingX" | "workbenchPaletteFloatingY" | "workbenchPreviewWorkspaceRef" | "workbenchResizeRef" | "workbenchResultFloating" | "workbenchResultFloatingHeight" | "workbenchResultFloatingWidth" | "workbenchResultFloatingX" | "workbenchResultFloatingY" | "workbenchRightWidth" | "workbenchRootRef" | "workbenchSettingsDock" | "workbenchSettingsFloatingHeight" | "workbenchSettingsFloatingWidth" | "workbenchSettingsSideWidth" | "workbenchSettingsWindowRef" | "workbenchSourceFloating" | "workbenchSourceFloatingHeight" | "workbenchSourceFloatingWidth" | "workbenchSourceFloatingX" | "workbenchSourceFloatingY" | "workbenchTileDragRef" | "workbenchTilemapFloating" | "workbenchTilemapFloatingHeight" | "workbenchTilemapFloatingWidth" | "workbenchTilemapFloatingX" | "workbenchTilemapFloatingY" | "workbenchToolsFloatingHeight" | "workbenchToolsFloatingWidth" | "workbenchToolsFloatingX" | "workbenchToolsFloatingY" | "workspaceProfileSelectionMadeRef"> &
    Pick<ReturnType<typeof useWorkbenchWindows>, "bringWorkbenchWindowToFront" | "setWorkbenchDockSplitRatios" | "setWorkbenchToolsFloating" | "setWorkbenchWindowDock" | "setWorkbenchWindowOpen" | "snapWorkbenchPosition" | "snapWorkbenchSize" | "updateWorkbenchWindowLayout" | "workbenchGridSize" | "workbenchPaintColorsFloating" | "workbenchSettingsDockEmpty" | "workbenchTileDropForPointer" | "workbenchToolsFloating" | "workbenchWindowLayout" | "workbenchWindowsInDock">,
) {
  function resetWorkbenchLayout(): void {
    setWorkbenchSettingsDock(DEFAULT_WORKBENCH_PREFERENCES.dock);
    setWorkbenchSettingsMinimized(DEFAULT_WORKBENCH_PREFERENCES.minimized);
    setWorkbenchLeftWidth(DEFAULT_WORKBENCH_PREFERENCES.leftWidth);
    setWorkbenchRightWidth(DEFAULT_WORKBENCH_PREFERENCES.rightWidth);
    setWorkbenchBottomHeight(DEFAULT_WORKBENCH_PREFERENCES.bottomHeight);
    setWorkbenchFloatingX(DEFAULT_WORKBENCH_PREFERENCES.floatingX);
    setWorkbenchFloatingY(DEFAULT_WORKBENCH_PREFERENCES.floatingY);
    setWorkbenchSettingsFloatingWidth(DEFAULT_WORKBENCH_PREFERENCES.settingsFloatingWidth);
    setWorkbenchSettingsFloatingHeight(DEFAULT_WORKBENCH_PREFERENCES.settingsFloatingHeight);
    setWorkbenchToolsFloatingX(DEFAULT_WORKBENCH_PREFERENCES.toolsFloatingX);
    setWorkbenchToolsFloatingY(DEFAULT_WORKBENCH_PREFERENCES.toolsFloatingY);
    setWorkbenchToolsFloatingWidth(DEFAULT_WORKBENCH_PREFERENCES.toolsFloatingWidth);
    setWorkbenchToolsFloatingHeight(DEFAULT_WORKBENCH_PREFERENCES.toolsFloatingHeight);
    setWorkbenchGeometryFloating(DEFAULT_WORKBENCH_PREFERENCES.geometryFloating);
    setWorkbenchGeometryFloatingX(DEFAULT_WORKBENCH_PREFERENCES.geometryFloatingX);
    setWorkbenchGeometryFloatingY(DEFAULT_WORKBENCH_PREFERENCES.geometryFloatingY);
    setWorkbenchGeometryFloatingWidth(DEFAULT_WORKBENCH_PREFERENCES.geometryFloatingWidth);
    setWorkbenchGeometryFloatingHeight(DEFAULT_WORKBENCH_PREFERENCES.geometryFloatingHeight);
    setWorkbenchGeometryFloatingAutoHeight(DEFAULT_WORKBENCH_PREFERENCES.geometryFloatingAutoHeight);
    setWorkbenchAdjustmentsFloating(DEFAULT_WORKBENCH_PREFERENCES.adjustmentsFloating);
    setWorkbenchAdjustmentsFloatingX(DEFAULT_WORKBENCH_PREFERENCES.adjustmentsFloatingX);
    setWorkbenchAdjustmentsFloatingY(DEFAULT_WORKBENCH_PREFERENCES.adjustmentsFloatingY);
    setWorkbenchAdjustmentsFloatingWidth(DEFAULT_WORKBENCH_PREFERENCES.adjustmentsFloatingWidth);
    setWorkbenchAdjustmentsFloatingHeight(DEFAULT_WORKBENCH_PREFERENCES.adjustmentsFloatingHeight);
    setWorkbenchAdjustmentsFloatingAutoHeight(DEFAULT_WORKBENCH_PREFERENCES.adjustmentsFloatingAutoHeight);
    setWorkbenchPaletteFloating(DEFAULT_WORKBENCH_PREFERENCES.paletteFloating);
    setWorkbenchPaletteFloatingX(DEFAULT_WORKBENCH_PREFERENCES.paletteFloatingX);
    setWorkbenchPaletteFloatingY(DEFAULT_WORKBENCH_PREFERENCES.paletteFloatingY);
    setWorkbenchPaletteFloatingWidth(DEFAULT_WORKBENCH_PREFERENCES.paletteFloatingWidth);
    setWorkbenchPaletteFloatingHeight(DEFAULT_WORKBENCH_PREFERENCES.paletteFloatingHeight);
    setWorkbenchPaletteFloatingAutoHeight(DEFAULT_WORKBENCH_PREFERENCES.paletteFloatingAutoHeight);
    setWorkbenchDitheringFloating(DEFAULT_WORKBENCH_PREFERENCES.ditheringFloating);
    setWorkbenchDitheringFloatingX(DEFAULT_WORKBENCH_PREFERENCES.ditheringFloatingX);
    setWorkbenchDitheringFloatingY(DEFAULT_WORKBENCH_PREFERENCES.ditheringFloatingY);
    setWorkbenchDitheringFloatingWidth(DEFAULT_WORKBENCH_PREFERENCES.ditheringFloatingWidth);
    setWorkbenchDitheringFloatingHeight(DEFAULT_WORKBENCH_PREFERENCES.ditheringFloatingHeight);
    setWorkbenchDitheringFloatingAutoHeight(DEFAULT_WORKBENCH_PREFERENCES.ditheringFloatingAutoHeight);
    setWorkbenchTilemapFloating(DEFAULT_WORKBENCH_PREFERENCES.tilemapFloating);
    setWorkbenchTilemapFloatingX(DEFAULT_WORKBENCH_PREFERENCES.tilemapFloatingX);
    setWorkbenchTilemapFloatingY(DEFAULT_WORKBENCH_PREFERENCES.tilemapFloatingY);
    setWorkbenchTilemapFloatingWidth(DEFAULT_WORKBENCH_PREFERENCES.tilemapFloatingWidth);
    setWorkbenchTilemapFloatingHeight(DEFAULT_WORKBENCH_PREFERENCES.tilemapFloatingHeight);
    setWorkbenchTilemapFloatingAutoHeight(DEFAULT_WORKBENCH_PREFERENCES.tilemapFloatingAutoHeight);
    setWorkbenchSourceFloating(DEFAULT_WORKBENCH_PREFERENCES.sourceFloating);
    setWorkbenchSourceFloatingX(DEFAULT_WORKBENCH_PREFERENCES.sourceFloatingX);
    setWorkbenchSourceFloatingY(DEFAULT_WORKBENCH_PREFERENCES.sourceFloatingY);
    setWorkbenchSourceFloatingWidth(DEFAULT_WORKBENCH_PREFERENCES.sourceFloatingWidth);
    setWorkbenchSourceFloatingHeight(DEFAULT_WORKBENCH_PREFERENCES.sourceFloatingHeight);
    setWorkbenchSourceFloatingAutoHeight(DEFAULT_WORKBENCH_PREFERENCES.sourceFloatingAutoHeight);
    setWorkbenchResultFloating(DEFAULT_WORKBENCH_PREFERENCES.resultFloating);
    setWorkbenchResultFloatingX(DEFAULT_WORKBENCH_PREFERENCES.resultFloatingX);
    setWorkbenchResultFloatingY(DEFAULT_WORKBENCH_PREFERENCES.resultFloatingY);
    setWorkbenchResultFloatingWidth(DEFAULT_WORKBENCH_PREFERENCES.resultFloatingWidth);
    setWorkbenchResultFloatingHeight(DEFAULT_WORKBENCH_PREFERENCES.resultFloatingHeight);
    setWorkbenchResultFloatingAutoHeight(DEFAULT_WORKBENCH_PREFERENCES.resultFloatingAutoHeight);
    setWorkbenchSourceDockedWidth(DEFAULT_WORKBENCH_PREFERENCES.sourceDockedWidth);
    setWorkbenchResultDockedWidth(DEFAULT_WORKBENCH_PREFERENCES.resultDockedWidth);
    setWorkbenchWindowOrder([...DEFAULT_WORKBENCH_PREFERENCES.windowOrder]);
    setWorkbenchSectionsOpen({ ...DEFAULT_WORKBENCH_PREFERENCES.sectionsOpen });
    setWorkbenchWindowLayouts((current) => preserveHiddenWorkbenchWindows(current, DEFAULT_WORKBENCH_PREFERENCES.windowLayouts));
  }

  function loadSavedWorkbenchLayout(id: string): void {
    const saved = savedWorkbenchLayouts.find((layout) => layout.id === id);
    if (saved === undefined) return;
    setWorkspaceMode(saved.workspaceMode);
    setWorkspaceLayout(saved.workspace.layout);
    setSourcePreviewContent(saved.workspace.sourceContent);
    setResultPreviewContent(saved.workspace.resultContent);
    setPreviewZoom(saved.workspace.previewZoom);
    setSourcePreviewZoom(saved.workspace.sourceZoom ?? saved.workspace.previewZoom);
    setResultPreviewZoom(saved.workspace.resultZoom ?? saved.workspace.previewZoom);
    setSynchronizePan(saved.workspace.synchronizePan);
    setSynchronizeZoom(saved.workspace.synchronizeZoom ?? true);
    setShowPixelGrid(saved.workspace.showPixelGrid);
    setShowAttributeGrid(saved.workspace.showAttributeGrid);
    setHideAttributes(saved.workspace.hideAttributes);
    setInspectionDrawerOpen(saved.workspace.inspectionDrawerOpen);
    setWorkbenchSettingsDock(saved.workbench.dock);
    setWorkbenchSettingsMinimized(saved.workbench.minimized);
    setWorkbenchLeftWidth(saved.workbench.leftWidth ?? saved.workbench.sideWidth);
    setWorkbenchRightWidth(saved.workbench.rightWidth ?? saved.workbench.sideWidth);
    setWorkbenchBottomHeight(saved.workbench.bottomHeight);
    setWorkbenchFloatingX(saved.workbench.floatingX);
    setWorkbenchFloatingY(saved.workbench.floatingY);
    setWorkbenchSettingsFloatingWidth(saved.workbench.settingsFloatingWidth ?? 640);
    setWorkbenchSettingsFloatingHeight(saved.workbench.settingsFloatingHeight ?? 420);
    setWorkbenchToolsFloatingX(saved.workbench.toolsFloatingX);
    setWorkbenchToolsFloatingY(saved.workbench.toolsFloatingY);
    setWorkbenchToolsFloatingWidth(saved.workbench.toolsFloatingWidth ?? 360);
    setWorkbenchToolsFloatingHeight(saved.workbench.toolsFloatingHeight ?? 220);
    setWorkbenchGeometryFloating(saved.workbench.geometryFloating ?? false);
    setWorkbenchGeometryFloatingX(saved.workbench.geometryFloatingX ?? 360);
    setWorkbenchGeometryFloatingY(saved.workbench.geometryFloatingY ?? 96);
    setWorkbenchGeometryFloatingWidth(saved.workbench.geometryFloatingWidth ?? 520);
    setWorkbenchGeometryFloatingHeight(saved.workbench.geometryFloatingHeight ?? 360);
    setWorkbenchGeometryFloatingAutoHeight(saved.workbench.geometryFloatingAutoHeight ?? true);
    setWorkbenchAdjustmentsFloating(saved.workbench.adjustmentsFloating ?? false);
    setWorkbenchAdjustmentsFloatingX(saved.workbench.adjustmentsFloatingX ?? 520);
    setWorkbenchAdjustmentsFloatingY(saved.workbench.adjustmentsFloatingY ?? 128);
    setWorkbenchAdjustmentsFloatingWidth(saved.workbench.adjustmentsFloatingWidth ?? 520);
    setWorkbenchAdjustmentsFloatingHeight(saved.workbench.adjustmentsFloatingHeight ?? 300);
    setWorkbenchAdjustmentsFloatingAutoHeight(saved.workbench.adjustmentsFloatingAutoHeight ?? true);
    const savedWindowOrder = Array.isArray(saved.workbench.windowOrder)
      ? saved.workbench.windowOrder
      : DEFAULT_WORKBENCH_PREFERENCES.windowOrder;
    setWorkbenchWindowOrder([
      ...savedWindowOrder,
      ...DEFAULT_WORKBENCH_PREFERENCES.windowOrder.filter((window) => !savedWindowOrder.includes(window)),
    ]);
    setWorkbenchPaletteFloating(saved.workbench.paletteFloating);
    setWorkbenchPaletteFloatingX(saved.workbench.paletteFloatingX);
    setWorkbenchPaletteFloatingY(saved.workbench.paletteFloatingY);
    setWorkbenchPaletteFloatingWidth(saved.workbench.paletteFloatingWidth);
    setWorkbenchPaletteFloatingHeight(saved.workbench.paletteFloatingHeight);
    setWorkbenchPaletteFloatingAutoHeight(saved.workbench.paletteFloatingAutoHeight ?? true);
    setWorkbenchDitheringFloating(saved.workbench.ditheringFloating);
    setWorkbenchDitheringFloatingX(saved.workbench.ditheringFloatingX);
    setWorkbenchDitheringFloatingY(saved.workbench.ditheringFloatingY);
    setWorkbenchDitheringFloatingWidth(saved.workbench.ditheringFloatingWidth);
    setWorkbenchDitheringFloatingHeight(saved.workbench.ditheringFloatingHeight);
    setWorkbenchDitheringFloatingAutoHeight(saved.workbench.ditheringFloatingAutoHeight ?? true);
    setWorkbenchTilemapFloating(saved.workbench.tilemapFloating ?? false);
    setWorkbenchTilemapFloatingX(saved.workbench.tilemapFloatingX ?? 520);
    setWorkbenchTilemapFloatingY(saved.workbench.tilemapFloatingY ?? 96);
    setWorkbenchTilemapFloatingWidth(saved.workbench.tilemapFloatingWidth ?? 720);
    setWorkbenchTilemapFloatingHeight(saved.workbench.tilemapFloatingHeight ?? 420);
    setWorkbenchTilemapFloatingAutoHeight(saved.workbench.tilemapFloatingAutoHeight ?? true);
    setWorkbenchSourceFloating(saved.workbench.sourceFloating ?? false);
    setWorkbenchSourceFloatingX(saved.workbench.sourceFloatingX ?? 64);
    setWorkbenchSourceFloatingY(saved.workbench.sourceFloatingY ?? 64);
    setWorkbenchSourceFloatingWidth(saved.workbench.sourceFloatingWidth ?? 640);
    setWorkbenchSourceFloatingHeight(saved.workbench.sourceFloatingHeight ?? 420);
    setWorkbenchSourceFloatingAutoHeight(saved.workbench.sourceFloatingAutoHeight ?? true);
    setWorkbenchResultFloating(saved.workbench.resultFloating ?? false);
    setWorkbenchResultFloatingX(saved.workbench.resultFloatingX ?? 760);
    setWorkbenchResultFloatingY(saved.workbench.resultFloatingY ?? 64);
    setWorkbenchResultFloatingWidth(saved.workbench.resultFloatingWidth ?? 760);
    setWorkbenchResultFloatingHeight(saved.workbench.resultFloatingHeight ?? 420);
    setWorkbenchResultFloatingAutoHeight(saved.workbench.resultFloatingAutoHeight ?? true);
    setWorkbenchSourceDockedWidth(saved.workbench.sourceDockedWidth ?? 1);
    setWorkbenchResultDockedWidth(saved.workbench.resultDockedWidth ?? 1);
    setWorkbenchSectionsOpen({ ...saved.workbench.sectionsOpen });
    let savedWindowLayouts = Object.fromEntries(
      Object.entries({
        ...startupWorkbenchPreferences.windowLayouts,
        ...saved.workbench.windowLayouts,
      }).map(([window, layout]) => [window, { ...layout, visible: layout.visible ?? true }]),
    ) as WorkbenchWindowLayouts;
    if (saved.workbench.windowLayouts === undefined) {
      savedWindowLayouts = {
        ...savedWindowLayouts,
        tools: {
          ...savedWindowLayouts.tools,
          open: saved.workbench.toolsOpen,
        },
      };
    }
    setWorkbenchWindowLayouts((current) => preserveHiddenWorkbenchWindows(current, savedWindowLayouts));
    setActiveWorkspaceProfileId(saved.id);
    saveActiveWorkspaceProfileId(localStorage, saved.id);
    setWorkspaceProfileBaselinePending(true);
  }

  function applyWorkbenchLayoutPreset(layout: WorkspaceLayoutId): void {
    if (layout === "custom") return;

    setWorkbenchWindowLayouts((current) => {
      const next = { ...current };
      const settingWindows = ["geometry", "adjustments", "palette", "dithering", "tilemap"] as const;
      for (const window of settingWindows) {
        next[window] = { ...next[window], dock: "bottom", minimized: true, open: false };
      }
      next.tools = { ...next.tools, dock: "bottom", minimized: true, open: false };
      next.source = { ...next.source, dock: "center", minimized: false, open: true };
      next.result = { ...next.result, dock: "center", minimized: false, open: true };
      if (layout === "conversion") {
        for (const window of ["geometry", "adjustments", "palette", "dithering"] as const) {
          next[window] = { ...next[window], minimized: false, open: true };
        }
      } else if (layout === "palette") {
        next.palette = { ...next.palette, dock: "floating", minimized: false, open: true };
      } else if (layout === "dithering") {
        next.dithering = { ...next.dithering, dock: "floating", minimized: false, open: true };
      } else if (layout === "inspection" || layout === "editor") {
        next.tools = { ...next.tools, dock: "floating", minimized: false, open: true };
      } else if (layout === "tilemap") {
        next.tilemap = { ...next.tilemap, minimized: false, open: true };
      }
      return next;
    });

    const baseSections = {
      geometry: false,
      adjustments: false,
      palette: false,
      dithering: false,
      tilemap: false,
    } satisfies Record<WorkbenchSettingsSection, boolean>;
    setWorkbenchGeometryFloating(false);
    setWorkbenchAdjustmentsFloating(false);
    setWorkbenchSourceFloating(false);
    setWorkbenchResultFloating(false);

    if (layout === "conversion") {
      setWorkbenchSettingsDock("bottom");
      setWorkbenchSettingsMinimized(false);
      setWorkbenchToolsFloating(false);
      setWorkbenchPaletteFloating(false);
      setWorkbenchDitheringFloating(false);
      setWorkbenchTilemapFloating(false);
      setWorkbenchSectionsOpen({
        ...baseSections,
        geometry: true,
        adjustments: true,
        palette: true,
        dithering: true,
      });
      return;
    }

    if (layout === "palette") {
      setWorkbenchSettingsDock("bottom");
      setWorkbenchSettingsMinimized(true);
      setWorkbenchToolsFloating(false);
      setWorkbenchPaletteFloating(true);
      setWorkbenchDitheringFloating(false);
      setWorkbenchTilemapFloating(false);
      setWorkbenchSectionsOpen({ ...baseSections, palette: true });
      return;
    }

    if (layout === "dithering") {
      setWorkbenchSettingsDock("bottom");
      setWorkbenchSettingsMinimized(true);
      setWorkbenchToolsFloating(false);
      setWorkbenchPaletteFloating(false);
      setWorkbenchDitheringFloating(true);
      setWorkbenchTilemapFloating(false);
      setWorkbenchSectionsOpen({ ...baseSections, dithering: true });
      return;
    }

    if (layout === "inspection") {
      setWorkbenchSettingsDock("bottom");
      setWorkbenchSettingsMinimized(true);
      setWorkbenchToolsFloating(true);
      setWorkbenchPaletteFloating(false);
      setWorkbenchDitheringFloating(false);
      setWorkbenchTilemapFloating(false);
      setWorkbenchSectionsOpen(baseSections);
      return;
    }

    if (layout === "editor") {
      setWorkbenchSettingsDock("bottom");
      setWorkbenchSettingsMinimized(true);
      setWorkbenchToolsFloating(true);
      setWorkbenchPaletteFloating(false);
      setWorkbenchDitheringFloating(false);
      setWorkbenchTilemapFloating(false);
      setWorkbenchSectionsOpen(baseSections);
      return;
    }

    if (layout === "tilemap") {
      setWorkbenchSettingsDock("bottom");
      setWorkbenchSettingsMinimized(false);
      setWorkbenchToolsFloating(false);
      setWorkbenchPaletteFloating(false);
      setWorkbenchDitheringFloating(false);
      setWorkbenchTilemapFloating(false);
      setWorkbenchSectionsOpen({ ...baseSections, tilemap: true });
    }
  }

  function applyWorkspaceLayout(layout: WorkspaceLayoutId): void {
    if (layout === "custom") return;
    const tilemapViews = workspaceMode === "tilemap";
    setWorkspaceLayout(layout);
    const profileId = `${BUILTIN_WORKSPACE_PROFILE_PREFIX}${layout}`;
    setActiveWorkspaceProfileId(profileId);
    saveActiveWorkspaceProfileId(localStorage, profileId);
    setWorkspaceProfileBaselinePending(true);
    applyWorkbenchLayoutPreset(layout);
    setSynchronizeZoom(layout !== "editor" && layout !== "inspection" && layout !== "tilemap");
    if (layout === "palette") {
      setSourcePreviewContent("image");
      setResultPreviewContent("palette-usage");
      setInspectionDrawerOpen(true);
      return;
    }
    if (layout === "dithering") {
      setSourcePreviewContent("pre-attribute");
      setResultPreviewContent("image");
      setPreviewZoom("fit");
      setShowPixelGrid(false);
      setShowAttributeGrid(false);
      setSynchronizePan(true);
      setInspectionDrawerOpen(false);
      return;
    }
    if (layout === "tilemap") {
      setSourcePreviewContent(tilemapViews ? "tile-usage" : "unified-editor");
      setResultPreviewContent("image");
      setInspectionDrawerOpen(true);
      return;
    }
    if (layout === "editor") {
      setSourcePreviewContent("result-image");
      setResultPreviewContent("bitmap-editor");
      setSourcePreviewZoom("fit");
      setResultPreviewZoom(12);
      setPreviewZoom(12);
      setShowPixelGrid(true);
      setShowAttributeGrid(true);
      setSynchronizePan(false);
      setInspectionDrawerOpen(false);
      return;
    }
    if (layout === "inspection") {
      setSourcePreviewContent("inspector");
      setResultPreviewContent("image");
      setPreviewZoom(8);
      setShowPixelGrid(true);
      setShowAttributeGrid(true);
      setInspectionDrawerOpen(true);
      return;
    }
    setSourcePreviewContent("image");
    setResultPreviewContent("image");
    setPreviewZoom("fit");
    setShowPixelGrid(false);
    setShowAttributeGrid(false);
    setInspectionDrawerOpen(false);
  }

  function selectWorkspaceProfile(id: string): void {
    if (hiddenBuiltinWorkspaceProfileIds.some((hiddenId) => `${BUILTIN_WORKSPACE_PROFILE_PREFIX}${hiddenId}` === id)) return;
    workspaceProfileSelectionMadeRef.current = true;
    if (savedWorkbenchLayouts.some((layout) => layout.id === id)) {
      loadSavedWorkbenchLayout(id);
      return;
    }
    const builtIn = BUILT_IN_WORKSPACE_LAYOUTS.find((profile) => `${BUILTIN_WORKSPACE_PROFILE_PREFIX}${profile.id}` === id);
    if (builtIn !== undefined) applyWorkspaceLayout(builtIn.id);
  }

  const builtinWorkspaceOverrides = new Map(
    savedWorkbenchLayouts
      .filter((layout) => layout.id.startsWith(BUILTIN_WORKSPACE_PROFILE_PREFIX))
      .map((layout) => [layout.id, layout]),
  );
  const workspaceProfileOptions = [
    ...BUILT_IN_WORKSPACE_LAYOUTS
      .filter(({ id }) => !hiddenBuiltinWorkspaceProfileIds.includes(id))
      .map(({ id, label }) => ({
        id: `${BUILTIN_WORKSPACE_PROFILE_PREFIX}${id}`,
        name: builtinWorkspaceOverrides.get(`${BUILTIN_WORKSPACE_PROFILE_PREFIX}${id}`)?.name ?? label,
        kind: "builtin" as const,
        layout: id,
      })),
    ...savedWorkbenchLayouts
      .filter((layout) => !layout.id.startsWith(BUILTIN_WORKSPACE_PROFILE_PREFIX))
      .map((layout) => ({ id: layout.id, name: layout.name, kind: "saved" as const })),
  ];

  function resetWorkspaceArrangement(): void {
    resetWorkbenchLayout();
    const profileId = `${BUILTIN_WORKSPACE_PROFILE_PREFIX}${startupWorkspaceLayout}`;
    selectWorkspaceProfile(workspaceProfileOptions.some(({ id }) => id === profileId)
      ? profileId
      : `${BUILTIN_WORKSPACE_PROFILE_PREFIX}conversion`);
  }

  function restoreWorkbenchPreferences(): void {
    setWorkbenchSettingsDock(startupWorkbenchPreferences.dock);
    setWorkbenchSettingsMinimized(startupWorkbenchPreferences.minimized);
    setWorkbenchLeftWidth(startupWorkbenchPreferences.leftWidth);
    setWorkbenchRightWidth(startupWorkbenchPreferences.rightWidth);
    setWorkbenchBottomHeight(startupWorkbenchPreferences.bottomHeight);
    setWorkbenchFloatingX(startupWorkbenchPreferences.floatingX);
    setWorkbenchFloatingY(startupWorkbenchPreferences.floatingY);
    setWorkbenchSettingsFloatingWidth(startupWorkbenchPreferences.settingsFloatingWidth);
    setWorkbenchSettingsFloatingHeight(startupWorkbenchPreferences.settingsFloatingHeight);
    setWorkbenchToolsFloatingX(startupWorkbenchPreferences.toolsFloatingX);
    setWorkbenchToolsFloatingY(startupWorkbenchPreferences.toolsFloatingY);
    setWorkbenchToolsFloatingWidth(startupWorkbenchPreferences.toolsFloatingWidth);
    setWorkbenchToolsFloatingHeight(startupWorkbenchPreferences.toolsFloatingHeight);
    setWorkbenchGeometryFloating(startupWorkbenchPreferences.geometryFloating);
    setWorkbenchGeometryFloatingX(startupWorkbenchPreferences.geometryFloatingX);
    setWorkbenchGeometryFloatingY(startupWorkbenchPreferences.geometryFloatingY);
    setWorkbenchGeometryFloatingWidth(startupWorkbenchPreferences.geometryFloatingWidth);
    setWorkbenchGeometryFloatingHeight(startupWorkbenchPreferences.geometryFloatingHeight);
    setWorkbenchGeometryFloatingAutoHeight(startupWorkbenchPreferences.geometryFloatingAutoHeight);
    setWorkbenchAdjustmentsFloating(startupWorkbenchPreferences.adjustmentsFloating);
    setWorkbenchAdjustmentsFloatingX(startupWorkbenchPreferences.adjustmentsFloatingX);
    setWorkbenchAdjustmentsFloatingY(startupWorkbenchPreferences.adjustmentsFloatingY);
    setWorkbenchAdjustmentsFloatingWidth(startupWorkbenchPreferences.adjustmentsFloatingWidth);
    setWorkbenchAdjustmentsFloatingHeight(startupWorkbenchPreferences.adjustmentsFloatingHeight);
    setWorkbenchAdjustmentsFloatingAutoHeight(startupWorkbenchPreferences.adjustmentsFloatingAutoHeight);
    setWorkbenchPaletteFloating(startupWorkbenchPreferences.paletteFloating);
    setWorkbenchPaletteFloatingX(startupWorkbenchPreferences.paletteFloatingX);
    setWorkbenchPaletteFloatingY(startupWorkbenchPreferences.paletteFloatingY);
    setWorkbenchPaletteFloatingWidth(startupWorkbenchPreferences.paletteFloatingWidth);
    setWorkbenchPaletteFloatingHeight(startupWorkbenchPreferences.paletteFloatingHeight);
    setWorkbenchPaletteFloatingAutoHeight(startupWorkbenchPreferences.paletteFloatingAutoHeight);
    setWorkbenchDitheringFloating(startupWorkbenchPreferences.ditheringFloating);
    setWorkbenchDitheringFloatingX(startupWorkbenchPreferences.ditheringFloatingX);
    setWorkbenchDitheringFloatingY(startupWorkbenchPreferences.ditheringFloatingY);
    setWorkbenchDitheringFloatingWidth(startupWorkbenchPreferences.ditheringFloatingWidth);
    setWorkbenchDitheringFloatingHeight(startupWorkbenchPreferences.ditheringFloatingHeight);
    setWorkbenchDitheringFloatingAutoHeight(startupWorkbenchPreferences.ditheringFloatingAutoHeight);
    setWorkbenchTilemapFloating(startupWorkbenchPreferences.tilemapFloating);
    setWorkbenchTilemapFloatingX(startupWorkbenchPreferences.tilemapFloatingX);
    setWorkbenchTilemapFloatingY(startupWorkbenchPreferences.tilemapFloatingY);
    setWorkbenchTilemapFloatingWidth(startupWorkbenchPreferences.tilemapFloatingWidth);
    setWorkbenchTilemapFloatingHeight(startupWorkbenchPreferences.tilemapFloatingHeight);
    setWorkbenchTilemapFloatingAutoHeight(startupWorkbenchPreferences.tilemapFloatingAutoHeight);
    setWorkbenchSourceFloating(startupWorkbenchPreferences.sourceFloating);
    setWorkbenchSourceFloatingX(startupWorkbenchPreferences.sourceFloatingX);
    setWorkbenchSourceFloatingY(startupWorkbenchPreferences.sourceFloatingY);
    setWorkbenchSourceFloatingWidth(startupWorkbenchPreferences.sourceFloatingWidth);
    setWorkbenchSourceFloatingHeight(startupWorkbenchPreferences.sourceFloatingHeight);
    setWorkbenchSourceFloatingAutoHeight(startupWorkbenchPreferences.sourceFloatingAutoHeight);
    setWorkbenchResultFloating(startupWorkbenchPreferences.resultFloating);
    setWorkbenchResultFloatingX(startupWorkbenchPreferences.resultFloatingX);
    setWorkbenchResultFloatingY(startupWorkbenchPreferences.resultFloatingY);
    setWorkbenchResultFloatingWidth(startupWorkbenchPreferences.resultFloatingWidth);
    setWorkbenchResultFloatingHeight(startupWorkbenchPreferences.resultFloatingHeight);
    setWorkbenchResultFloatingAutoHeight(startupWorkbenchPreferences.resultFloatingAutoHeight);
    setWorkbenchSourceDockedWidth(startupWorkbenchPreferences.sourceDockedWidth);
    setWorkbenchResultDockedWidth(startupWorkbenchPreferences.resultDockedWidth);
    setWorkbenchWindowOrder([...startupWorkbenchPreferences.windowOrder]);
    setWorkbenchSectionsOpen({ ...startupWorkbenchPreferences.sectionsOpen });
    setWorkbenchWindowLayouts((current) => preserveHiddenWorkbenchWindows(current, startupWorkbenchPreferences.windowLayouts));
  }

  function setWorkbenchSectionOpen(section: WorkbenchSettingsSection, open: boolean): void {
    setWorkbenchWindowOpen(section, open);
  }

  function startWorkbenchDrag(event: ReactPointerEvent<HTMLElement>): void {
    if (workbenchSettingsDock !== "floating" || event.button !== 0) return;
    event.preventDefault();
    workbenchDragMovedRef.current = false;
    bringWorkbenchWindowToFront("settings");
    workbenchDragRef.current = {
      window: "settings",
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX: workbenchFloatingX,
      startY: workbenchFloatingY,
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "move";
  }

  function startWorkbenchTileDrag(
    window: ActiveWorkbenchWindowId,
    event: ReactPointerEvent<HTMLElement>,
  ): void {
    const dock = workbenchWindowLayout(window).dock;
    if (event.button !== 0 || !workbenchWindowCanDock(window, dock)) return;
    // A tiled workbench window is a <details> element. Prevent its native
    // summary toggle from competing with the pointer gesture; a click with no
    // movement is still handled by handleWorkbenchTitlebarClick.
    event.preventDefault();
    event.stopPropagation();
    const drag: WorkbenchTileDrag = {
      window,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      moved: false,
      drop: null,
    };
    workbenchTileDragRef.current = drag;
    setWorkbenchTileDrag(drag);
  }

  function startWorkbenchSectionDrag(
    section: WorkbenchFloatingSection,
    event: ReactPointerEvent<HTMLElement>,
  ): void {
    if (section === "paint-colors") {
      if (!workbenchPaintColorsFloating || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      workbenchDragMovedRef.current = false;
      bringWorkbenchWindowToFront(section);
      const layout = workbenchWindowLayout(section);
      workbenchDragRef.current = {
        window: section,
        startPointerX: event.clientX,
        startPointerY: event.clientY,
        startX: layout.x,
        startY: layout.y,
      };
      document.body.style.userSelect = "none";
      document.body.style.cursor = "move";
      return;
    }
    if (section === "tools" || section === "source" || section === "result") {
      const floating = section === "tools"
        ? workbenchToolsFloating
        : section === "source" ? workbenchSourceFloating : workbenchResultFloating;
      if (!floating || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      workbenchDragMovedRef.current = false;
      bringWorkbenchWindowToFront(section);
      workbenchDragRef.current = {
        window: section,
        startPointerX: event.clientX,
        startPointerY: event.clientY,
        startX: section === "tools"
          ? workbenchToolsFloatingX
          : section === "source" ? workbenchSourceFloatingX : workbenchResultFloatingX,
        startY: section === "tools"
          ? workbenchToolsFloatingY
          : section === "source" ? workbenchSourceFloatingY : workbenchResultFloatingY,
      };
      document.body.style.userSelect = "none";
      document.body.style.cursor = "move";
      return;
    }
    const floating = section === "geometry"
      ? workbenchGeometryFloating
      : section === "adjustments"
        ? workbenchAdjustmentsFloating
        : section === "palette"
          ? workbenchPaletteFloating
          : section === "dithering"
            ? workbenchDitheringFloating
            : workbenchTilemapFloating;
    const startX = section === "geometry"
      ? workbenchGeometryFloatingX
      : section === "adjustments"
        ? workbenchAdjustmentsFloatingX
        : section === "palette"
          ? workbenchPaletteFloatingX
          : section === "dithering"
            ? workbenchDitheringFloatingX
            : workbenchTilemapFloatingX;
    const startY = section === "geometry"
      ? workbenchGeometryFloatingY
      : section === "adjustments"
        ? workbenchAdjustmentsFloatingY
        : section === "palette"
          ? workbenchPaletteFloatingY
          : section === "dithering"
            ? workbenchDitheringFloatingY
            : workbenchTilemapFloatingY;
    if (!floating || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    workbenchDragMovedRef.current = false;
    bringWorkbenchWindowToFront(section);
    workbenchDragRef.current = {
      window: section,
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX,
      startY,
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "move";
  }

  function startWorkbenchTitlebarDrag(
    window: WorkbenchWindowId,
    event: ReactPointerEvent<HTMLElement>,
  ): void {
    const target = event.target as HTMLElement;
    if (
      target.closest(".workbench-window-actions, .workbench-section-float-action, .workbench-floating-resize-handle") !== null ||
      target.closest("select, input, textarea") !== null ||
      (target.closest("button") !== null && target.closest(".workbench-window-title") === null)
    ) return;
    if (window !== "settings") {
      const layout = workbenchWindowLayout(window);
      if (layout.dock !== "floating") {
        startWorkbenchTileDrag(window, event);
        return;
      }
    }
    if (window === "settings") {
      startWorkbenchDrag(event);
    } else {
      startWorkbenchSectionDrag(window, event);
    }
  }

  function commitWorkbenchTileDrop(drag: WorkbenchTileDrag): void {
    const drop = drag.drop;
    if (!drag.moved || drop === null) return;
    setWorkbenchWindowDock(drag.window, drop.dock, drop.destination === "minimized");
    setWorkbenchWindowOrder((current) => reorderWorkbenchWindowOrder(
      current,
      drag.window,
      drop.target,
      drop.position,
    ));
    const targetLabel = drop.target === null ? `${drop.dock} dock` : `${drop.target} window`;
    setWorkbenchAnnouncement(`${drag.window} moved to ${targetLabel}.`);
  }

  function moveWorkbenchTileByKeyboard(
    window: ActiveWorkbenchWindowId,
    direction: -1 | 1,
  ): void {
    const dock = workbenchWindowLayout(window).dock;
    if (!workbenchWindowCanDock(window, dock) || dock === "floating") return;
    const dockWindows = workbenchWindowsInDock(dock);
    const currentIndex = dockWindows.indexOf(window);
    const target = dockWindows[currentIndex + direction];
    if (target === undefined) return;
    setWorkbenchWindowOrder((current) => reorderWorkbenchWindowOrder(
      current,
      window,
      target,
      direction < 0 ? "before" : "after",
    ));
    setWorkbenchAnnouncement(`${window} moved ${direction < 0 ? "before" : "after"} ${target}.`);
  }

  function handleWorkbenchTitlebarKeyDown(
    window: ActiveWorkbenchWindowId,
    event: ReactKeyboardEvent<HTMLElement>,
  ): void {
    if (!event.altKey) return;
    const dock = workbenchWindowLayout(window).dock;
    const direction = dock === "bottom" || dock === "center"
      ? event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0
      : event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (direction === 0) return;
    event.preventDefault();
    event.stopPropagation();
    moveWorkbenchTileByKeyboard(window, direction as -1 | 1);
  }

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent): void => {
      const resize = workbenchResizeRef.current;
      if (resize !== null && resize.kind === "dock" && resize.dock === "bottom") {
        const minimumHeight = 0;
        const nextSize = snapWorkbenchSize(
          resize.startBottomHeight + resize.startPointer - event.clientY,
          minimumHeight,
          480,
        );
        setWorkbenchBottomHeight(nextSize);
        setWorkbenchWindowLayouts((current) => Object.fromEntries(
          Object.entries(current).map(([window, layout]) => [
            window,
            layout.dock === "bottom" ? { ...layout, dockSize: nextSize } : layout,
          ]),
        ) as WorkbenchWindowLayouts);
        return;
      }
      if (resize !== null && resize.kind === "dock") {
        const delta = resize.dock === "left"
          ? event.clientX - resize.startPointer
          : resize.startPointer - event.clientX;
        const nextSize = snapWorkbenchSize(resize.startDockWidth + delta, 0, 560);
        if (resize.dock === "left") setWorkbenchLeftWidth(nextSize);
        if (resize.dock === "right") setWorkbenchRightWidth(nextSize);
        setWorkbenchWindowLayouts((current) => Object.fromEntries(
          Object.entries(current).map(([window, layout]) => [
            window,
            layout.dock === resize.dock ? { ...layout, dockSize: nextSize } : layout,
          ]),
        ) as WorkbenchWindowLayouts);
        return;
      }
      if (resize !== null && resize.kind === "dock-split") {
        const startPairSize = resize.startBeforeSize + resize.startAfterSize;
        const delta = resize.dock === "bottom"
          ? event.clientX - resize.startPointer
          : event.clientY - resize.startPointer;
        const minimumSize = 96;
        const nextBeforeSize = Math.min(
          startPairSize - minimumSize,
          Math.max(minimumSize, resize.startBeforeSize + delta),
        );
        const pairRatio = resize.startBeforeRatio + resize.startAfterRatio;
        const nextBeforeRatio = pairRatio * nextBeforeSize / startPairSize;
        setWorkbenchDockSplitRatios(
          resize.before,
          resize.after,
          Math.max(0.15, nextBeforeRatio),
          Math.max(0.15, pairRatio - nextBeforeRatio),
        );
        return;
      }
      if (resize !== null && resize.kind === "preview-docked") {
        const workspace = workbenchPreviewWorkspaceRef.current;
        const available = Math.max(480, (workspace?.clientWidth ?? 1200) - 48 - 32);
        const delta = Math.round((event.clientX - resize.startPointerX) / workbenchGridSize) * workbenchGridSize;
        const minimumShare = 0.25;
        if (resize.preview === "source") {
          const next = resize.startSourceWidth + delta / available;
          setWorkbenchSourceDockedWidth(Math.min(10, Math.max(minimumShare, next)));
        } else {
          const next = resize.startResultWidth + delta / available;
          setWorkbenchResultDockedWidth(Math.min(10, Math.max(minimumShare, next)));
        }
        return;
      }
      if (resize !== null) {
        const nextWidth = resize.startWidth + event.clientX - resize.startPointerX;
        const nextHeight = resize.startHeight + event.clientY - resize.startPointerY;
        if (resize.window === "settings") {
          setWorkbenchSettingsFloatingWidth(snapWorkbenchSize(nextWidth, 420, 1000));
          setWorkbenchSettingsFloatingHeight(snapWorkbenchSize(nextHeight, 280, 760));
        } else if (resize.window === "tools") {
          setWorkbenchToolsFloatingWidth(snapWorkbenchSize(nextWidth, 280, 760));
          setWorkbenchToolsFloatingHeight(snapWorkbenchSize(nextHeight, 160, 560));
        } else if (resize.window === "geometry") {
          setWorkbenchGeometryFloatingWidth(snapWorkbenchSize(nextWidth, 360, 820));
          setWorkbenchGeometryFloatingHeight(snapWorkbenchSize(nextHeight, 220, 680));
        } else if (resize.window === "adjustments") {
          setWorkbenchAdjustmentsFloatingWidth(snapWorkbenchSize(nextWidth, 360, 820));
          setWorkbenchAdjustmentsFloatingHeight(snapWorkbenchSize(nextHeight, 220, 680));
        } else if (resize.window === "palette") {
          setWorkbenchPaletteFloatingWidth(snapWorkbenchSize(nextWidth, 320, 820));
          setWorkbenchPaletteFloatingHeight(snapWorkbenchSize(nextHeight, 220, 680));
        } else if (resize.window === "paint-colors") {
          updateWorkbenchWindowLayout("paint-colors", (layout) => ({
            ...layout,
            autoHeight: false,
            width: snapWorkbenchSize(nextWidth, 220, 760),
            height: snapWorkbenchSize(nextHeight, 140, 560),
          }));
        } else if (resize.window === "dithering") {
          setWorkbenchDitheringFloatingWidth(snapWorkbenchSize(nextWidth, 320, 760));
          setWorkbenchDitheringFloatingHeight(snapWorkbenchSize(nextHeight, 220, 680));
        } else if (resize.window === "tilemap") {
          setWorkbenchTilemapFloatingWidth(snapWorkbenchSize(nextWidth, 320, 1200));
          setWorkbenchTilemapFloatingHeight(snapWorkbenchSize(nextHeight, 220, 900));
        } else if (resize.window === "source") {
          setWorkbenchSourceFloatingWidth(snapWorkbenchSize(nextWidth, 320, 1600));
          setWorkbenchSourceFloatingHeight(snapWorkbenchSize(nextHeight, 220, 900));
        } else {
          setWorkbenchResultFloatingWidth(snapWorkbenchSize(nextWidth, 320, 1600));
          setWorkbenchResultFloatingHeight(snapWorkbenchSize(nextHeight, 220, 900));
        }
        return;
      }
      const tileDrag = workbenchTileDragRef.current;
      if (tileDrag !== null) {
        const moved = tileDrag.moved ||
          Math.abs(event.clientX - tileDrag.startPointerX) > 3 ||
          Math.abs(event.clientY - tileDrag.startPointerY) > 3;
        if (!moved) return;
        const next: WorkbenchTileDrag = {
          ...tileDrag,
          moved: true,
          drop: workbenchTileDropForPointer(tileDrag.window, event.clientX, event.clientY),
        };
        workbenchTileDragRef.current = next;
        setWorkbenchTileDrag(next);
        workbenchDragMovedRef.current = true;
        document.body.style.userSelect = "none";
        document.body.style.cursor = next.drop === null ? "no-drop" : "grabbing";
        return;
      }
      const drag = workbenchDragRef.current;
      const root = workbenchRootRef.current;
      if (drag === null || root === null) return;
      const bounds = root.getBoundingClientRect();
      const dimensions = workbenchDimensionsRef.current;
      const windowWidth = drag.window === "settings"
        ? dimensions.settingsWidth
        : drag.window === "tools"
          ? dimensions.toolsWidth
          : drag.window === "geometry"
            ? dimensions.geometryWidth
            : drag.window === "adjustments"
              ? dimensions.adjustmentsWidth
              : drag.window === "palette"
                ? dimensions.paletteWidth
              : drag.window === "paint-colors"
                ? workbenchWindowLayout("paint-colors").width
              : drag.window === "dithering"
                ? dimensions.ditheringWidth
                : drag.window === "tilemap"
                  ? dimensions.tilemapWidth
                : drag.window === "source"
                    ? dimensions.sourceWidth
                    : dimensions.resultWidth;
      const windowHeight = drag.window === "settings"
        ? workbenchSettingsDock === "floating" ? workbenchSettingsFloatingHeight : dimensions.settingsHeight
        : drag.window === "tools"
          ? dimensions.toolsHeight
        : drag.window === "geometry"
          ? dimensions.geometryHeight
          : drag.window === "adjustments"
            ? dimensions.adjustmentsHeight
            : drag.window === "palette"
              ? dimensions.paletteHeight
              : drag.window === "paint-colors"
                ? workbenchWindowLayout("paint-colors").height
              : drag.window === "dithering"
                ? dimensions.ditheringHeight
                : drag.window === "tilemap"
                  ? dimensions.tilemapHeight
                : drag.window === "source"
                  ? dimensions.sourceHeight
                  : dimensions.resultHeight;
      const maxX = Math.max(8, bounds.width - windowWidth - 8);
      const maxY = Math.max(8, bounds.height - windowHeight - 8);
      const proposedX = Math.min(maxX, Math.max(8, drag.startX + event.clientX - drag.startPointerX));
      const proposedY = Math.min(maxY, Math.max(8, drag.startY + event.clientY - drag.startPointerY));
      if (
        Math.abs(event.clientX - drag.startPointerX) > 3 ||
        Math.abs(event.clientY - drag.startPointerY) > 3
      ) workbenchDragMovedRef.current = true;
      const nextX = snapWorkbenchPosition(proposedX, maxX);
      const nextY = snapWorkbenchPosition(proposedY, maxY);
      if (drag.window === "settings") {
        setWorkbenchFloatingX(nextX);
        setWorkbenchFloatingY(nextY);
      } else if (drag.window === "tools") {
        setWorkbenchToolsFloatingX(nextX);
        setWorkbenchToolsFloatingY(nextY);
      } else if (drag.window === "geometry") {
        setWorkbenchGeometryFloatingX(nextX);
        setWorkbenchGeometryFloatingY(nextY);
      } else if (drag.window === "adjustments") {
        setWorkbenchAdjustmentsFloatingX(nextX);
        setWorkbenchAdjustmentsFloatingY(nextY);
      } else if (drag.window === "palette") {
        setWorkbenchPaletteFloatingX(nextX);
        setWorkbenchPaletteFloatingY(nextY);
      } else if (drag.window === "paint-colors") {
        updateWorkbenchWindowLayout("paint-colors", (layout) => ({ ...layout, x: nextX, y: nextY }));
      } else if (drag.window === "dithering") {
        setWorkbenchDitheringFloatingX(nextX);
        setWorkbenchDitheringFloatingY(nextY);
      } else if (drag.window === "tilemap") {
        setWorkbenchTilemapFloatingX(nextX);
        setWorkbenchTilemapFloatingY(nextY);
      } else if (drag.window === "source") {
        setWorkbenchSourceFloatingX(nextX);
        setWorkbenchSourceFloatingY(nextY);
      } else {
        setWorkbenchResultFloatingX(nextX);
        setWorkbenchResultFloatingY(nextY);
      }
    };
    const stopResize = (): void => {
      const tileDrag = workbenchTileDragRef.current;
      if (tileDrag !== null) commitWorkbenchTileDrop(tileDrag);
      workbenchTileDragRef.current = null;
      setWorkbenchTileDrag(null);
      workbenchResizeRef.current = null;
      workbenchDragRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      stopResize();
    };
  }, []);

  useLayoutEffect(() => {
    const root = workbenchRootRef.current;
    const settingsWindow = workbenchSettingsWindowRef.current;
    if (root === null || settingsWindow === null) return undefined;
    const updateOrigin = (): void => {
      if (workbenchSettingsDockEmpty) {
        root.style.setProperty("--workbench-settings-origin-x", "0px");
        root.style.setProperty("--workbench-settings-origin-y", "0px");
        return;
      }
      const rootBounds = root.getBoundingClientRect();
      const settingsBounds = settingsWindow.getBoundingClientRect();
      root.style.setProperty("--workbench-settings-origin-x", `${settingsBounds.left - rootBounds.left}px`);
      root.style.setProperty("--workbench-settings-origin-y", `${settingsBounds.top - rootBounds.top}px`);
    };
    updateOrigin();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateOrigin);
    observer?.observe(root);
    if (!workbenchSettingsDockEmpty) observer?.observe(settingsWindow);
    window.addEventListener("resize", updateOrigin);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateOrigin);
    };
  }, [workbenchSettingsDock, workbenchSettingsFloatingWidth, workbenchSettingsFloatingHeight,
    workbenchLeftWidth, workbenchRightWidth, workbenchBottomHeight, workbenchSettingsDockEmpty]);

  useEffect(() => {
    workbenchDimensionsRef.current = {
      settingsWidth: workbenchSettingsDock === "floating" ? workbenchSettingsFloatingWidth : workbenchSettingsSideWidth,
      settingsHeight: workbenchSettingsDock === "floating" ? workbenchSettingsFloatingHeight : workbenchBottomHeight,
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
    };
  }, [workbenchSettingsDock, workbenchSettingsFloatingWidth, workbenchSettingsFloatingHeight,
    workbenchSettingsSideWidth, workbenchBottomHeight, workbenchToolsFloatingWidth,
    workbenchToolsFloatingHeight, workbenchPaletteFloatingWidth,
    workbenchGeometryFloatingWidth, workbenchGeometryFloatingHeight,
    workbenchAdjustmentsFloatingWidth, workbenchAdjustmentsFloatingHeight,
    workbenchPaletteFloatingHeight, workbenchDitheringFloatingWidth,
    workbenchDitheringFloatingHeight, workbenchSourceFloatingWidth,
    workbenchTilemapFloatingWidth, workbenchTilemapFloatingHeight,
    workbenchSourceFloatingHeight, workbenchResultFloatingWidth,
    workbenchResultFloatingHeight]);

  return {
    applyWorkspaceLayout,
    handleWorkbenchTitlebarKeyDown,
    resetWorkbenchLayout,
    resetWorkspaceArrangement,
    restoreWorkbenchPreferences,
    selectWorkspaceProfile,
    setWorkbenchSectionOpen,
    startWorkbenchDrag,
    startWorkbenchSectionDrag,
    startWorkbenchTitlebarDrag,
    workspaceProfileOptions,
  };
}
