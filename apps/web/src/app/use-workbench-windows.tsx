import { type ActiveWorkbenchWindowId, DEFAULT_WORKBENCH_PREFERENCES, moveWorkbenchWindowDock, type WorkbenchDock, type WorkbenchWindowDock, type WorkbenchWindowId, type WorkbenchWindowLayout } from "../workbench-preferences.js";
import { type PreviewSide, type WorkbenchFloatingSection, type WorkbenchTileDrop } from "../app-types.js";
import { type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";
import { BUILT_IN_SPECSCII_CHARSET_NAME, loadSpecsciiFontAssets } from "../specscii-assets.js";
import type { useRuntimeState } from "./use-runtime-state.js";
import type { useSettingsState } from "./use-settings-state.js";
import type { useWorkbenchState } from "./use-workbench-state.js";
import { workbenchDockIcon, workbenchDockLabel, workbenchWindowCanDock } from "./workbench-windows-helpers.js";

export function useWorkbenchWindows(
  { builtInSpecsciiCharset, charsetSource, existingCharset, existingCharsetSelectionRef, resultPreviewContent, resultPreviewZoom, setBuiltInSpecsciiCharset, setBuiltInSpecsciiFontError, setCharsetEncoding, setCharsetSelectionMode, setCharsetTilesView, setEmittedSourceCharsetIndices, setExistingCharset, setExistingCharsetLength, setExistingCharsetLengthEntry, setExistingCharsetName, setExistingCharsetSelection, setExistingCharsetStart, setExistingCharsetStartEntry, setResultPreviewContent, setResultPreviewZoom, setSelectedSourceCharsetTile, setSourcePreviewContent, setSourcePreviewZoom, setWorkbenchAdjustmentsFloating, setWorkbenchAdjustmentsFloatingAutoHeight, setWorkbenchAdjustmentsFloatingHeight, setWorkbenchAdjustmentsFloatingWidth, setWorkbenchBottomHeight, setWorkbenchDitheringFloating, setWorkbenchDitheringFloatingAutoHeight, setWorkbenchDitheringFloatingHeight, setWorkbenchDitheringFloatingWidth, setWorkbenchGeometryFloating, setWorkbenchGeometryFloatingAutoHeight, setWorkbenchGeometryFloatingHeight, setWorkbenchGeometryFloatingWidth, setWorkbenchLayoutMenu, setWorkbenchLayoutMenuPosition, setWorkbenchLeftWidth, setWorkbenchPaletteFloating, setWorkbenchPaletteFloatingAutoHeight, setWorkbenchPaletteFloatingHeight, setWorkbenchPaletteFloatingWidth, setWorkbenchResultFloating, setWorkbenchResultFloatingAutoHeight, setWorkbenchResultFloatingHeight, setWorkbenchResultFloatingWidth, setWorkbenchRightWidth, setWorkbenchSectionsOpen, setWorkbenchSettingsFloatingHeight, setWorkbenchSettingsFloatingWidth, setWorkbenchSourceFloating, setWorkbenchSourceFloatingAutoHeight, setWorkbenchSourceFloatingHeight, setWorkbenchSourceFloatingWidth, setWorkbenchTilemapFloating, setWorkbenchTilemapFloatingAutoHeight, setWorkbenchTilemapFloatingHeight, setWorkbenchTilemapFloatingWidth, setWorkbenchToolsFloatingHeight, setWorkbenchToolsFloatingWidth, setWorkbenchWindowLayouts, setWorkbenchWindowOrder, sourcePreviewContent, sourcePreviewZoom, workbenchAdjustmentsFloating, workbenchAdjustmentsFloatingHeight, workbenchAdjustmentsFloatingWidth, workbenchBottomDockLayer, workbenchBottomHeight, workbenchBottomMinimizedLayer, workbenchDitheringFloating, workbenchDitheringFloatingHeight, workbenchDitheringFloatingWidth, workbenchDragMovedRef, workbenchGeometryFloating, workbenchGeometryFloatingHeight, workbenchGeometryFloatingWidth, workbenchLayoutMenu, workbenchLayoutMenuPosition, workbenchLeftDockLayer, workbenchLeftWidth, workbenchPaletteFloating, workbenchPaletteFloatingHeight, workbenchPaletteFloatingWidth, workbenchPreviewLayer, workbenchPreviewWorkspaceRef, workbenchResizeRef, workbenchResultDockedWidth, workbenchResultFloating, workbenchResultFloatingHeight, workbenchResultFloatingWidth, workbenchRightDockLayer, workbenchRightWidth, workbenchSettingsDock, workbenchSettingsFloatingHeight, workbenchSettingsFloatingWidth, workbenchSourceDockedWidth, workbenchSourceFloating, workbenchSourceFloatingHeight, workbenchSourceFloatingWidth, workbenchTileDrag, workbenchTilemapFloating, workbenchTilemapFloatingHeight, workbenchTilemapFloatingWidth, workbenchToolsFloatingHeight, workbenchToolsFloatingWidth, workbenchWindowLayouts, workbenchWindowOrder, workspaceMode }: Pick<ReturnType<typeof useRuntimeState>, "existingCharsetSelectionRef"> &
    Pick<ReturnType<typeof useSettingsState>, "builtInSpecsciiCharset" | "charsetSource" | "existingCharset" | "setBuiltInSpecsciiCharset" | "setBuiltInSpecsciiFontError" | "setCharsetEncoding" | "setCharsetSelectionMode" | "setCharsetTilesView" | "setEmittedSourceCharsetIndices" | "setExistingCharset" | "setExistingCharsetLength" | "setExistingCharsetLengthEntry" | "setExistingCharsetName" | "setExistingCharsetSelection" | "setExistingCharsetStart" | "setExistingCharsetStartEntry" | "setSelectedSourceCharsetTile" | "workspaceMode"> &
    Pick<ReturnType<typeof useWorkbenchState>, "resultPreviewContent" | "resultPreviewZoom" | "setResultPreviewContent" | "setResultPreviewZoom" | "setSourcePreviewContent" | "setSourcePreviewZoom" | "setWorkbenchAdjustmentsFloating" | "setWorkbenchAdjustmentsFloatingAutoHeight" | "setWorkbenchAdjustmentsFloatingHeight" | "setWorkbenchAdjustmentsFloatingWidth" | "setWorkbenchBottomHeight" | "setWorkbenchDitheringFloating" | "setWorkbenchDitheringFloatingAutoHeight" | "setWorkbenchDitheringFloatingHeight" | "setWorkbenchDitheringFloatingWidth" | "setWorkbenchGeometryFloating" | "setWorkbenchGeometryFloatingAutoHeight" | "setWorkbenchGeometryFloatingHeight" | "setWorkbenchGeometryFloatingWidth" | "setWorkbenchLayoutMenu" | "setWorkbenchLayoutMenuPosition" | "setWorkbenchLeftWidth" | "setWorkbenchPaletteFloating" | "setWorkbenchPaletteFloatingAutoHeight" | "setWorkbenchPaletteFloatingHeight" | "setWorkbenchPaletteFloatingWidth" | "setWorkbenchResultFloating" | "setWorkbenchResultFloatingAutoHeight" | "setWorkbenchResultFloatingHeight" | "setWorkbenchResultFloatingWidth" | "setWorkbenchRightWidth" | "setWorkbenchSectionsOpen" | "setWorkbenchSettingsFloatingHeight" | "setWorkbenchSettingsFloatingWidth" | "setWorkbenchSourceFloating" | "setWorkbenchSourceFloatingAutoHeight" | "setWorkbenchSourceFloatingHeight" | "setWorkbenchSourceFloatingWidth" | "setWorkbenchTilemapFloating" | "setWorkbenchTilemapFloatingAutoHeight" | "setWorkbenchTilemapFloatingHeight" | "setWorkbenchTilemapFloatingWidth" | "setWorkbenchToolsFloatingHeight" | "setWorkbenchToolsFloatingWidth" | "setWorkbenchWindowLayouts" | "setWorkbenchWindowOrder" | "sourcePreviewContent" | "sourcePreviewZoom" | "workbenchAdjustmentsFloating" | "workbenchAdjustmentsFloatingHeight" | "workbenchAdjustmentsFloatingWidth" | "workbenchBottomDockLayer" | "workbenchBottomHeight" | "workbenchBottomMinimizedLayer" | "workbenchDitheringFloating" | "workbenchDitheringFloatingHeight" | "workbenchDitheringFloatingWidth" | "workbenchDragMovedRef" | "workbenchGeometryFloating" | "workbenchGeometryFloatingHeight" | "workbenchGeometryFloatingWidth" | "workbenchLayoutMenu" | "workbenchLayoutMenuPosition" | "workbenchLeftDockLayer" | "workbenchLeftWidth" | "workbenchPaletteFloating" | "workbenchPaletteFloatingHeight" | "workbenchPaletteFloatingWidth" | "workbenchPreviewLayer" | "workbenchPreviewWorkspaceRef" | "workbenchResizeRef" | "workbenchResultDockedWidth" | "workbenchResultFloating" | "workbenchResultFloatingHeight" | "workbenchResultFloatingWidth" | "workbenchRightDockLayer" | "workbenchRightWidth" | "workbenchSettingsDock" | "workbenchSettingsFloatingHeight" | "workbenchSettingsFloatingWidth" | "workbenchSourceDockedWidth" | "workbenchSourceFloating" | "workbenchSourceFloatingHeight" | "workbenchSourceFloatingWidth" | "workbenchTileDrag" | "workbenchTilemapFloating" | "workbenchTilemapFloatingHeight" | "workbenchTilemapFloatingWidth" | "workbenchToolsFloatingHeight" | "workbenchToolsFloatingWidth" | "workbenchWindowLayouts" | "workbenchWindowOrder">,
) {
  function workbenchWindowLayout(window: ActiveWorkbenchWindowId): WorkbenchWindowLayout {
    // Saved workspace profiles can predate newly added windows. Keep rendering
    // safe even when loading an older/incomplete profile from project storage.
    return workbenchWindowLayouts[window] ?? DEFAULT_WORKBENCH_PREFERENCES.windowLayouts[window];
  }

  const workbenchToolsDock = workbenchWindowLayout("tools").dock as WorkbenchDock;
  const workbenchPaintColorsFloating = workbenchWindowLayout("paint-colors").dock === "floating";
  const workbenchToolsOpen = workbenchWindowLayout("tools").open;
  const bitmapEditorActiveSide: PreviewSide | null = sourcePreviewContent === "bitmap-editor"
    ? "source"
    : resultPreviewContent === "bitmap-editor" ? "result" : null;

  function updateWorkbenchWindowLayout(
    window: ActiveWorkbenchWindowId,
    update: (layout: WorkbenchWindowLayout) => WorkbenchWindowLayout,
  ): void {
    setWorkbenchWindowLayouts((current) => ({
      ...current,
      [window]: update(current[window]),
    }));
  }

  useEffect(() => {
    if (bitmapEditorActiveSide === null) return;
    updateWorkbenchWindowLayout("tools", (layout) => ({
      ...layout,
      dock: "left",
      visible: true,
      open: true,
      minimized: false,
    }));
    for (const window of ["source", "result"] as const) {
      updateWorkbenchWindowLayout(window, (layout) => ({
        ...layout,
        dock: "center",
        visible: true,
        open: true,
        minimized: false,
      }));
    }
    for (const window of ["palette", "paint-colors"] as const) {
      updateWorkbenchWindowLayout(window, (layout) => layout.visible
        ? { ...layout, open: true, minimized: false }
        : layout);
    }
    if (bitmapEditorActiveSide === "source") {
      setResultPreviewContent("result-image");
      setResultPreviewZoom("fit");
      if (sourcePreviewZoom === "fit") setSourcePreviewZoom(12);
    } else {
      setSourcePreviewContent("result-image");
      setSourcePreviewZoom("fit");
      if (resultPreviewZoom === "fit") setResultPreviewZoom(12);
    }
  }, [bitmapEditorActiveSide]);

  const workbenchDockWindowOrder = workbenchWindowOrder.filter(
    (window): window is ActiveWorkbenchWindowId => window !== "settings",
  );

  function workbenchDockWindowIsRendered(window: ActiveWorkbenchWindowId): boolean {
    const layout = workbenchWindowLayout(window);
    if (!layout.visible) return false;
    if (window === "tilemap") return workspaceMode === "tilemap";
    if (window === "paint-colors") return bitmapEditorActiveSide !== null;
    if (window === "dithering") return workspaceMode === "palette";
    return true;
  }

  function workbenchDockWindows(dock: "bottom" | "left" | "right"): readonly ActiveWorkbenchWindowId[] {
    return workbenchDockWindowOrder.filter((window) =>
      workbenchDockWindowIsRendered(window) && workbenchWindowLayout(window).dock === dock,
    );
  }

  function workbenchWindowsInDock(dock: WorkbenchWindowDock): readonly ActiveWorkbenchWindowId[] {
    return workbenchDockWindowOrder.filter((window) =>
      workbenchDockWindowIsRendered(window) && workbenchWindowLayout(window).dock === dock,
    );
  }

  function workbenchDockSplitAfter(window: ActiveWorkbenchWindowId): ActiveWorkbenchWindowId | null {
    const layout = workbenchWindowLayout(window);
    if (layout.dock !== "bottom" && layout.dock !== "left" && layout.dock !== "right") return null;
    if (layout.minimized) return null;
    const dockWindows = workbenchDockWindows(layout.dock).filter(
      (candidate) => !workbenchWindowLayout(candidate).minimized,
    );
    const index = dockWindows.indexOf(window);
    const after = index >= 0 ? dockWindows[index + 1] : undefined;
    return after ?? null;
  }

  function workbenchDockWindowStyle(window: ActiveWorkbenchWindowId, extra?: CSSProperties): CSSProperties {
    const layout = workbenchWindowLayout(window);
    const isTiled = layout.dock === "bottom" || layout.dock === "left" || layout.dock === "right";
    const preserveDockRatio = !layout.minimized;
    const order = workbenchDockWindowOrder.indexOf(window);
    return {
      ...extra,
      ...(order >= 0 ? { order } : {}),
      ...(isTiled && preserveDockRatio
        ? { flex: `${Math.max(0.15, layout.dockRatio)} 1 0px` }
        : {}),
    };
  }

  function workbenchTileDropForPointer(
    window: ActiveWorkbenchWindowId,
    clientX: number,
    clientY: number,
  ): WorkbenchTileDrop | null {
    const elements = document.elementsFromPoint(clientX, clientY);
    const targetElement = elements.find((element) => element.matches("[data-workbench-window]")) as HTMLElement | undefined;
    if (targetElement !== undefined) {
      const target = targetElement.dataset.workbenchWindow as ActiveWorkbenchWindowId;
      const dock = targetElement.dataset.dock as WorkbenchWindowDock;
      if (target === window) return null;
      if (target !== window && dock !== "floating" && workbenchWindowCanDock(window, dock)) {
        const bounds = targetElement.getBoundingClientRect();
        const horizontalDock = dock === "bottom" || dock === "center";
        const before = horizontalDock
          ? clientX < bounds.left + bounds.width / 2
          : clientY < bounds.top + bounds.height / 2;
        return {
          dock,
          target,
          position: before ? "before" : "after",
          destination: workbenchWindowLayout(target).minimized ? "minimized" : "expanded",
        };
      }
    }

    const minimizedStack = elements.find((element) =>
      element.matches(".workbench-dock-minimized-stack"),
    );
    if (minimizedStack !== undefined && workbenchWindowCanDock(window, "bottom")) {
      const minimizedWindows = workbenchWindowsInDock("bottom").filter(
        (candidate) => candidate !== window && workbenchWindowLayout(candidate).minimized,
      );
      const target = minimizedWindows.at(-1) ?? null;
      return {
        dock: "bottom",
        target,
        position: target === null ? "append" : "after",
        destination: "minimized",
      };
    }

    const dockRegion = elements.find((element) => element.matches("[data-dock-region]")) as HTMLElement | undefined;
    if (dockRegion !== undefined) {
      const dock = dockRegion.dataset.dockRegion as WorkbenchWindowDock;
      if (dock !== "floating" && workbenchWindowCanDock(window, dock)) {
        const dockWindows = workbenchWindowsInDock(dock).filter((candidate) => candidate !== window);
        const target = dockWindows.at(-1) ?? null;
        return {
          dock,
          target,
          position: target === null ? "append" : "after",
          destination: "expanded",
        };
      }
    }

    const previewWorkspace = workbenchPreviewWorkspaceRef.current;
    if (previewWorkspace !== null && elements.some((element) => previewWorkspace.contains(element)) && workbenchWindowCanDock(window, "center")) {
      const centerWindows = workbenchWindowsInDock("center").filter((candidate) => candidate !== window);
      const target = centerWindows.at(-1) ?? null;
      return {
        dock: "center",
        target,
        position: target === null ? "append" : "after",
        destination: "expanded",
      };
    }
    return null;
  }

  function workbenchWindowDragAttributes(window: ActiveWorkbenchWindowId): Record<string, string | undefined> {
    const drag = workbenchTileDrag;
    return {
      "data-workbench-dragging": drag?.window === window && drag.moved ? "true" : undefined,
      "data-workbench-drop-position": drag?.drop?.target === window ? drag.drop.position : undefined,
    };
  }

  function workbenchDockDropAttributes(dock: WorkbenchWindowDock): Record<string, string | undefined> {
    return {
      "data-workbench-drop-append": workbenchTileDrag?.drop?.dock === dock &&
        workbenchTileDrag.drop.target === null && workbenchTileDrag.drop.destination === "expanded"
        ? "true"
        : undefined,
    };
  }

  function setWorkbenchWindowDock(
    window: ActiveWorkbenchWindowId,
    dock: WorkbenchWindowDock,
    destinationMinimized = workbenchWindowLayout(window).minimized,
  ): void {
    if (!workbenchWindowCanDock(window, dock)) return;
    if (dock === "bottom" && workbenchBottomHeight <= 0) setWorkbenchBottomHeight(240);
    const nextMinimized = window === "paint-colors" ? false : destinationMinimized;
    setWorkbenchWindowLayouts((current) => {
      const next = moveWorkbenchWindowDock(current, window, dock, nextMinimized);
      return {
        ...next,
        [window]: {
          ...next[window],
          open: nextMinimized ? next[window].open : true,
        },
      };
    });
    if (window === "geometry") setWorkbenchGeometryFloating(dock === "floating");
    if (window === "adjustments") setWorkbenchAdjustmentsFloating(dock === "floating");
    if (window === "palette") setWorkbenchPaletteFloating(dock === "floating");
    if (window === "dithering") setWorkbenchDitheringFloating(dock === "floating");
    if (window === "tilemap") setWorkbenchTilemapFloating(dock === "floating");
    if (window === "source") setWorkbenchSourceFloating(dock === "floating");
    if (window === "result") setWorkbenchResultFloating(dock === "floating");
  }

  function setWorkbenchWindowMinimized(window: ActiveWorkbenchWindowId, minimized: boolean): void {
    updateWorkbenchWindowLayout(window, (layout) => ({
      ...layout,
      minimized,
      open: minimized ? layout.open : true,
    }));
  }

  function setWorkbenchWindowOpen(window: ActiveWorkbenchWindowId, open: boolean): void {
    updateWorkbenchWindowLayout(window, (layout) => ({ ...layout, open }));
    if (window === "geometry" || window === "adjustments" || window === "palette" || window === "dithering" || window === "tilemap") {
      setWorkbenchSectionsOpen((current) => ({ ...current, [window]: open }));
    }
  }

  function setWorkbenchWindowVisibility(window: ActiveWorkbenchWindowId, visible: boolean): void {
    updateWorkbenchWindowLayout(window, (layout) => ({ ...layout, visible }));
  }

  function workbenchDockLayerFor(dock: WorkbenchWindowDock): HTMLDivElement | null {
    if (dock === "left") return workbenchLeftDockLayer;
    if (dock === "right") return workbenchRightDockLayer;
    if (dock === "bottom") return workbenchBottomDockLayer;
    if (dock === "floating") return workbenchPreviewLayer;
    return null;
  }

  function workbenchPortal(window: ActiveWorkbenchWindowId, content: ReactNode): ReactNode {
    const layout = workbenchWindowLayout(window);
    const target = layout.dock === "bottom" && layout.minimized
      ? workbenchBottomMinimizedLayer
      : workbenchDockLayerFor(layout.dock);
    return target === null ? null : createPortal(content, target, window);
  }

  function toggleWorkbenchWindowMinimized(window: ActiveWorkbenchWindowId): void {
    setWorkbenchWindowMinimized(window, !workbenchWindowLayout(window).minimized);
  }

  useEffect(() => {
    let mounted = true;
    void loadSpecsciiFontAssets().then(({ charset }) => {
      if (mounted) setBuiltInSpecsciiCharset(charset.slice());
    }).catch((error: unknown) => {
      if (mounted) {
        setBuiltInSpecsciiFontError(
          error instanceof Error ? error.message : "Specscii character font assets are unavailable.",
        );
      }
    });
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (charsetSource !== "existing" || existingCharset !== null || builtInSpecsciiCharset === null) return;
    const charset = builtInSpecsciiCharset.slice();
    const count = charset.length / 8;
    setExistingCharset(charset);
    setExistingCharsetName(BUILT_IN_SPECSCII_CHARSET_NAME);
    setCharsetTilesView("source");
    setCharsetSelectionMode(false);
    setSelectedSourceCharsetTile(null);
    setEmittedSourceCharsetIndices(null);
    setExistingCharsetStart(0);
    setExistingCharsetLength(count);
    setExistingCharsetStartEntry("1");
    setExistingCharsetLengthEntry(String(count));
    existingCharsetSelectionRef.current = null;
    setExistingCharsetSelection(null);
    if (count > 32) setCharsetEncoding("extended");
  }, [builtInSpecsciiCharset, charsetSource, existingCharset]);

  useEffect(() => {
    if (workbenchLayoutMenu === null) return undefined;
    const closeMenu = (event: PointerEvent): void => {
      const target = event.target as HTMLElement | null;
      if (target?.closest(".workbench-window-location-menu, .workbench-window-location-popover") === null) {
        setWorkbenchLayoutMenu(null);
        setWorkbenchLayoutMenuPosition(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setWorkbenchLayoutMenu(null);
        setWorkbenchLayoutMenuPosition(null);
      }
    };
    const closeOnViewportChange = (): void => {
      setWorkbenchLayoutMenu(null);
      setWorkbenchLayoutMenuPosition(null);
    };
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [workbenchLayoutMenu]);

  function toggleWorkbenchLayoutMenu(windowId: WorkbenchWindowId, button: HTMLButtonElement): void {
    if (workbenchLayoutMenu === windowId) {
      setWorkbenchLayoutMenu(null);
      setWorkbenchLayoutMenuPosition(null);
      return;
    }
    const rect = button.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 160;
    setWorkbenchLayoutMenuPosition({
      left: Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8)),
      top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - menuHeight - 8)),
    });
    setWorkbenchLayoutMenu(windowId);
  }

  function preventWorkbenchDragClick(event: ReactMouseEvent<HTMLElement>): void {
    if (!workbenchDragMovedRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    workbenchDragMovedRef.current = false;
  }

  function handleWorkbenchTitlebarClick(
    window: ActiveWorkbenchWindowId,
    event: ReactMouseEvent<HTMLElement>,
  ): void {
    const target = event.target as HTMLElement;
    if (
      target.closest(".workbench-window-actions, .workbench-section-float-action, .preview-content-selector") !== null ||
      target.closest("button, select, input, textarea") !== null
    ) return;
    if (workbenchDragMovedRef.current) {
      preventWorkbenchDragClick(event);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    toggleWorkbenchWindowMinimized(window);
  }

  function workbenchWindowActions(window: ActiveWorkbenchWindowId, includeCenter = false): ReactNode {
    const layout = workbenchWindowLayout(window);
    const destinations: readonly WorkbenchWindowDock[] = includeCenter
      ? ["floating", "left", "right", "center", "bottom"]
      : ["floating", "left", "right", "bottom"];
    const menuOpen = workbenchLayoutMenu === window && workbenchLayoutMenuPosition !== null;
    const locationMenu = menuOpen ? createPortal(
      <span
        className="workbench-window-location-popover"
        role="menu"
        aria-label={`${window} window locations`}
        style={{ left: workbenchLayoutMenuPosition.left, top: workbenchLayoutMenuPosition.top }}
      >
        {destinations.filter((dock) => workbenchWindowCanDock(window, dock)).map((dock) => (
          <button
            key={dock}
            type="button"
            role="menuitemradio"
            aria-checked={layout.dock === dock}
            className={layout.dock === dock ? "active" : undefined}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setWorkbenchWindowDock(window, dock);
              setWorkbenchLayoutMenu(null);
              setWorkbenchLayoutMenuPosition(null);
            }}
          ><span aria-hidden="true">{workbenchDockIcon(dock)}</span>{workbenchDockLabel(dock)}</button>
        ))}
      </span>,
      document.body,
      `workbench-location-menu-${window}`,
    ) : null;
    return (
      <span className="workbench-window-actions" aria-label={`${window} window actions`}>
        <span className="workbench-window-location-menu" onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setWorkbenchLayoutMenu(null);
          }
        }}>
          <button
            className="workbench-window-location-button"
            type="button"
            aria-label={`Change ${window} window location`}
            title={`Change ${window} window location`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              toggleWorkbenchLayoutMenu(window, event.currentTarget);
            }}
          >{workbenchDockIcon(layout.dock)}</button>
        </span>
        {locationMenu}
      </span>
    );
  }

  const workbenchHasFloatingSections =
    (workbenchWindowLayout("geometry").visible && workbenchGeometryFloating) ||
    (workbenchWindowLayout("adjustments").visible && workbenchAdjustmentsFloating) ||
    (workbenchWindowLayout("palette").visible && workbenchPaletteFloating) ||
    (workbenchWindowLayout("paint-colors").visible && bitmapEditorActiveSide !== null && workbenchPaintColorsFloating) ||
    (workbenchWindowLayout("dithering").visible && workspaceMode === "palette" && workbenchDitheringFloating) ||
    (workbenchWindowLayout("tilemap").visible && workspaceMode === "tilemap" && workbenchTilemapFloating);
  const workbenchToolsFloating = workbenchToolsDock === "floating";
  const workbenchHasLeftDock = workbenchDockWindowOrder.some((window) => workbenchDockWindowIsRendered(window) && workbenchWindowLayout(window).dock === "left");
  const workbenchHasRightDock = workbenchDockWindowOrder.some((window) => workbenchDockWindowIsRendered(window) && workbenchWindowLayout(window).dock === "right");
  const workbenchHasBottomDockWindows = workbenchDockWindows("bottom").length > 0;
  const sourcePreviewVisible = workbenchWindowLayout("source").visible;
  const resultPreviewVisible = workbenchWindowLayout("result").visible;
  const previewLayout = workbenchSourceFloating
    ? workbenchResultFloating ? "both-floating" : "source-floating"
    : workbenchResultFloating ? "result-floating" : "both-docked";
  const workbenchHasDockedSettingsSections =
    (workbenchWindowLayout("geometry").visible && !workbenchGeometryFloating) ||
    (workbenchWindowLayout("adjustments").visible && !workbenchAdjustmentsFloating) ||
    (workbenchWindowLayout("palette").visible && !workbenchPaletteFloating) ||
    (workbenchWindowLayout("paint-colors").visible && bitmapEditorActiveSide !== null && !workbenchPaintColorsFloating) ||
    (workbenchWindowLayout("dithering").visible && workspaceMode === "palette" && !workbenchDitheringFloating) ||
    (workbenchWindowLayout("tilemap").visible && workspaceMode === "tilemap" && !workbenchTilemapFloating);
  const workbenchSettingsDockEmpty = workbenchHasFloatingSections && !workbenchHasDockedSettingsSections;
  const workbenchSnapDistance = 16;
  const workbenchGridSize = 8;

  function setWorkbenchToolsFloating(floating: boolean): void {
    setWorkbenchWindowDock("tools", floating ? "floating" : "bottom");
  }

  function snapWorkbenchSize(value: number, minimum: number, maximum: number): number {
    if (minimum === 0 && value <= workbenchSnapDistance) return 0;
    return Math.min(maximum, Math.max(minimum, Math.round(value / workbenchGridSize) * workbenchGridSize));
  }

  function snapWorkbenchPosition(position: number, maximum: number): number {
    if (position - 8 <= workbenchSnapDistance) return 8;
    if (maximum - position <= workbenchSnapDistance) return maximum;
    return Math.min(maximum, Math.max(8, Math.round(position / workbenchGridSize) * workbenchGridSize));
  }

  function workbenchWindowZIndex(window: WorkbenchWindowId): number {
    const floating = window === "settings"
      ? workbenchSettingsDock === "floating"
      : window === "tools"
        ? workbenchToolsFloating
        : window === "geometry"
          ? workbenchGeometryFloating
          : window === "adjustments"
            ? workbenchAdjustmentsFloating
            : window === "palette"
              ? workbenchPaletteFloating
              : window === "paint-colors"
                ? workbenchPaintColorsFloating
              : window === "dithering"
                ? workbenchDitheringFloating
                : window === "tilemap"
                  ? workbenchTilemapFloating
                : window === "source"
                  ? workbenchSourceFloating
                  : workbenchResultFloating;
    const orderIndex = Math.max(0, workbenchWindowOrder.indexOf(window));
    return (floating ? 1000 : 10) + orderIndex;
  }

  function bringWorkbenchWindowToFront(window: WorkbenchWindowId): void {
    setWorkbenchWindowOrder((current) => [
      ...current.filter((candidate) => candidate !== window),
      window,
    ]);
  }

  function setWorkbenchDockSplitRatios(
    before: ActiveWorkbenchWindowId,
    after: ActiveWorkbenchWindowId,
    beforeRatio: number,
    afterRatio: number,
  ): void {
    setWorkbenchWindowLayouts((current) => ({
      ...current,
      [before]: { ...current[before], dockRatio: beforeRatio },
      [after]: { ...current[after], dockRatio: afterRatio },
    }));
  }

  function startWorkbenchDockSplit(
    before: ActiveWorkbenchWindowId,
    event: ReactPointerEvent<HTMLDivElement>,
  ): void {
    if (event.button !== 0) return;
    const after = workbenchDockSplitAfter(before);
    if (after === null) return;
    const dock = workbenchWindowLayout(before).dock;
    if (dock !== "bottom" && dock !== "left" && dock !== "right") return;
    const beforeElement = event.currentTarget.closest<HTMLElement>("[data-workbench-window]");
    if (beforeElement === null) return;
    const nextElement = beforeElement?.nextElementSibling;
    const afterElement = nextElement?.matches("[data-workbench-window]") &&
      nextElement.getAttribute("data-workbench-window") === after
      ? beforeElement.nextElementSibling as HTMLElement
      : beforeElement?.parentElement?.querySelector<HTMLElement>(`[data-workbench-window="${after}"]`);
    if (afterElement === null || afterElement === undefined) return;
    const beforeBounds = beforeElement.getBoundingClientRect();
    const afterBounds = afterElement.getBoundingClientRect();
    const beforeSize = dock === "bottom" ? beforeBounds.width : beforeBounds.height;
    const afterSize = dock === "bottom" ? afterBounds.width : afterBounds.height;
    if (beforeSize <= 0 || afterSize <= 0) return;
    event.preventDefault();
    event.stopPropagation();
    workbenchResizeRef.current = {
      kind: "dock-split",
      dock,
      before,
      after,
      startPointer: dock === "bottom" ? event.clientX : event.clientY,
      startBeforeRatio: workbenchWindowLayout(before).dockRatio,
      startAfterRatio: workbenchWindowLayout(after).dockRatio,
      startBeforeSize: beforeSize,
      startAfterSize: afterSize,
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = dock === "bottom" ? "ew-resize" : "ns-resize";
  }

  function adjustWorkbenchDockSplit(
    before: ActiveWorkbenchWindowId,
    after: ActiveWorkbenchWindowId,
    direction: -1 | 1,
  ): void {
    const beforeRatio = workbenchWindowLayout(before).dockRatio;
    const afterRatio = workbenchWindowLayout(after).dockRatio;
    const step = 0.08 * direction;
    const pairRatio = beforeRatio + afterRatio;
    const nextBeforeRatio = Math.min(pairRatio - 0.15, Math.max(0.15, beforeRatio + step));
    setWorkbenchDockSplitRatios(before, after, nextBeforeRatio, pairRatio - nextBeforeRatio);
  }

  function workbenchDockSplitHandle(before: ActiveWorkbenchWindowId): ReactNode {
    const after = workbenchDockSplitAfter(before);
    if (after === null) return null;
    const dock = workbenchWindowLayout(before).dock;
    if (dock !== "bottom" && dock !== "left" && dock !== "right") return null;
    const sideDock = dock === "left" || dock === "right";
    const beforeRatio = workbenchWindowLayout(before).dockRatio;
    const pairRatio = beforeRatio + workbenchWindowLayout(after).dockRatio;
    return (
      <div
        className={`workbench-dock-split-handle workbench-dock-split-${dock}`}
        role="separator"
        tabIndex={0}
        aria-label={`Resize ${before} and ${after} windows`}
        aria-orientation={sideDock ? "horizontal" : "vertical"}
        aria-valuemin={15}
        aria-valuemax={85}
        aria-valuenow={Math.round((beforeRatio / pairRatio) * 100)}
        onPointerDown={(event) => startWorkbenchDockSplit(before, event)}
        onKeyDown={(event) => {
          const handled = (sideDock && (event.key === "ArrowDown" || event.key === "ArrowUp")) ||
            (!sideDock && (event.key === "ArrowRight" || event.key === "ArrowLeft"));
          if (!handled) return;
          event.preventDefault();
          if (sideDock && event.key === "ArrowDown") adjustWorkbenchDockSplit(before, after, 1);
          if (sideDock && event.key === "ArrowUp") adjustWorkbenchDockSplit(before, after, -1);
          if (!sideDock && event.key === "ArrowRight") adjustWorkbenchDockSplit(before, after, 1);
          if (!sideDock && event.key === "ArrowLeft") adjustWorkbenchDockSplit(before, after, -1);
        }}
      >
        <span className="visually-hidden">Drag to resize tiled windows</span>
      </div>
    );
  }

  function startWorkbenchResize(dock: WorkbenchDock, event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    workbenchResizeRef.current = {
      kind: "dock",
      dock,
      startPointer: dock === "bottom" ? event.clientY : event.clientX,
      startDockWidth: dock === "left" ? workbenchLeftWidth : dock === "right" ? workbenchRightWidth : 0,
      startBottomHeight: dock === "bottom" ? Math.max(0, workbenchBottomHeight) : workbenchBottomHeight,
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = dock === "bottom" ? "ns-resize" : "ew-resize";
  }

  function startWorkbenchFloatingResize(
    window: "tools" | WorkbenchFloatingSection,
    event: ReactPointerEvent<HTMLDivElement>,
  ): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    bringWorkbenchWindowToFront(window);
    if (window === "tools") {
      workbenchResizeRef.current = {
        kind: "floating",
        window,
        startPointerX: event.clientX,
        startPointerY: event.clientY,
        startWidth: workbenchToolsFloatingWidth,
        startHeight: workbenchToolsFloatingHeight,
      };
    } else if (window === "geometry") {
      setWorkbenchGeometryFloatingAutoHeight(false);
      workbenchResizeRef.current = {
        kind: "floating",
        window,
        startPointerX: event.clientX,
        startPointerY: event.clientY,
        startWidth: workbenchGeometryFloatingWidth,
        startHeight: workbenchGeometryFloatingHeight,
      };
    } else if (window === "adjustments") {
      setWorkbenchAdjustmentsFloatingAutoHeight(false);
      workbenchResizeRef.current = {
        kind: "floating",
        window,
        startPointerX: event.clientX,
        startPointerY: event.clientY,
        startWidth: workbenchAdjustmentsFloatingWidth,
        startHeight: workbenchAdjustmentsFloatingHeight,
      };
    } else if (window === "palette") {
      setWorkbenchPaletteFloatingAutoHeight(false);
      workbenchResizeRef.current = {
        kind: "floating",
        window,
        startPointerX: event.clientX,
        startPointerY: event.clientY,
        startWidth: workbenchPaletteFloatingWidth,
        startHeight: workbenchPaletteFloatingHeight,
      };
    } else if (window === "paint-colors") {
      const layout = workbenchWindowLayout(window);
      updateWorkbenchWindowLayout(window, (current) => ({ ...current, autoHeight: false }));
      workbenchResizeRef.current = {
        kind: "floating",
        window,
        startPointerX: event.clientX,
        startPointerY: event.clientY,
        startWidth: layout.width,
        startHeight: layout.height,
      };
    } else if (window === "dithering") {
      setWorkbenchDitheringFloatingAutoHeight(false);
      workbenchResizeRef.current = {
        kind: "floating",
        window,
        startPointerX: event.clientX,
        startPointerY: event.clientY,
        startWidth: workbenchDitheringFloatingWidth,
        startHeight: workbenchDitheringFloatingHeight,
      };
    } else if (window === "tilemap") {
      setWorkbenchTilemapFloatingAutoHeight(false);
      workbenchResizeRef.current = {
        kind: "floating",
        window,
        startPointerX: event.clientX,
        startPointerY: event.clientY,
        startWidth: workbenchTilemapFloatingWidth,
        startHeight: workbenchTilemapFloatingHeight,
      };
    } else {
      const preview = window;
      if (preview === "source") setWorkbenchSourceFloatingAutoHeight(false);
      else setWorkbenchResultFloatingAutoHeight(false);
      workbenchResizeRef.current = {
        kind: "floating",
        window,
        startPointerX: event.clientX,
        startPointerY: event.clientY,
        startWidth: preview === "source" ? workbenchSourceFloatingWidth : workbenchResultFloatingWidth,
        startHeight: preview === "source" ? workbenchSourceFloatingHeight : workbenchResultFloatingHeight,
      };
    }
    document.body.style.userSelect = "none";
    document.body.style.cursor = "nwse-resize";
  }

  function startWorkbenchSettingsFloatingResize(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || workbenchSettingsDock !== "floating") return;
    event.preventDefault();
    event.stopPropagation();
    bringWorkbenchWindowToFront("settings");
    workbenchResizeRef.current = {
      kind: "floating",
      window: "settings",
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startWidth: workbenchSettingsFloatingWidth,
      startHeight: workbenchSettingsFloatingHeight,
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "nwse-resize";
  }

  function adjustWorkbenchFloatingSize(
    window: "tools" | WorkbenchFloatingSection,
    deltaWidth: number,
    deltaHeight: number,
  ): void {
    if (window === "tools") {
      setWorkbenchToolsFloatingWidth((width) => Math.min(760, Math.max(280, width + deltaWidth)));
      setWorkbenchToolsFloatingHeight((height) => Math.min(560, Math.max(160, height + deltaHeight)));
      return;
    }
    if (window === "geometry") {
      setWorkbenchGeometryFloatingAutoHeight(false);
      setWorkbenchGeometryFloatingWidth((width) => Math.min(820, Math.max(360, width + deltaWidth)));
      setWorkbenchGeometryFloatingHeight((height) => Math.min(680, Math.max(220, height + deltaHeight)));
      return;
    }
    if (window === "adjustments") {
      setWorkbenchAdjustmentsFloatingAutoHeight(false);
      setWorkbenchAdjustmentsFloatingWidth((width) => Math.min(820, Math.max(360, width + deltaWidth)));
      setWorkbenchAdjustmentsFloatingHeight((height) => Math.min(680, Math.max(220, height + deltaHeight)));
      return;
    }
    if (window === "palette") {
      setWorkbenchPaletteFloatingAutoHeight(false);
      setWorkbenchPaletteFloatingWidth((width) => Math.min(820, Math.max(320, width + deltaWidth)));
      setWorkbenchPaletteFloatingHeight((height) => Math.min(680, Math.max(220, height + deltaHeight)));
      return;
    }
    if (window === "paint-colors") {
      updateWorkbenchWindowLayout(window, (layout) => ({
        ...layout,
        autoHeight: false,
        width: Math.min(760, Math.max(220, layout.width + deltaWidth)),
        height: Math.min(560, Math.max(140, layout.height + deltaHeight)),
      }));
      return;
    }
    if (window === "dithering") {
      setWorkbenchDitheringFloatingAutoHeight(false);
      setWorkbenchDitheringFloatingWidth((width) => Math.min(760, Math.max(320, width + deltaWidth)));
      setWorkbenchDitheringFloatingHeight((height) => Math.min(680, Math.max(220, height + deltaHeight)));
      return;
    }
    if (window === "tilemap") {
      setWorkbenchTilemapFloatingAutoHeight(false);
      setWorkbenchTilemapFloatingWidth((width) => Math.min(1200, Math.max(320, width + deltaWidth)));
      setWorkbenchTilemapFloatingHeight((height) => Math.min(900, Math.max(220, height + deltaHeight)));
      return;
    }
    if (window === "source") {
      setWorkbenchSourceFloatingAutoHeight(false);
      setWorkbenchSourceFloatingWidth((width) => Math.min(1600, Math.max(320, width + deltaWidth)));
      setWorkbenchSourceFloatingHeight((height) => Math.min(900, Math.max(220, height + deltaHeight)));
      return;
    }
    setWorkbenchResultFloatingAutoHeight(false);
    setWorkbenchResultFloatingWidth((width) => Math.min(1600, Math.max(320, width + deltaWidth)));
    setWorkbenchResultFloatingHeight((height) => Math.min(900, Math.max(220, height + deltaHeight)));
  }

  function startWorkbenchDockedPreviewResize(
    preview: "source" | "result",
    event: ReactPointerEvent<HTMLDivElement>,
  ): void {
    if (event.button !== 0 || (preview === "source" ? workbenchSourceFloating : workbenchResultFloating)) return;
    event.preventDefault();
    event.stopPropagation();
    workbenchResizeRef.current = {
      kind: "preview-docked",
      preview,
      startPointerX: event.clientX,
      startSourceWidth: workbenchSourceDockedWidth,
      startResultWidth: workbenchResultDockedWidth,
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "ew-resize";
  }

  function adjustWorkbenchSettingsFloatingSize(deltaWidth: number, deltaHeight: number): void {
    setWorkbenchSettingsFloatingWidth((width) => Math.min(1000, Math.max(420, width + deltaWidth)));
    setWorkbenchSettingsFloatingHeight((height) => Math.min(760, Math.max(280, height + deltaHeight)));
  }

  function adjustWorkbenchSize(dock: WorkbenchDock, delta: number): void {
    if (dock === "bottom") {
      const minimumHeight = 0;
      setWorkbenchBottomHeight((height) => Math.min(480, Math.max(minimumHeight, height + delta)));
      return;
    }
    if (dock === "left") {
      setWorkbenchLeftWidth((width) => Math.min(560, Math.max(0, width + delta)));
    } else if (dock === "right") {
      setWorkbenchRightWidth((width) => Math.min(560, Math.max(0, width + delta)));
    }
  }

  return {
    adjustWorkbenchFloatingSize,
    adjustWorkbenchSettingsFloatingSize,
    adjustWorkbenchSize,
    bitmapEditorActiveSide,
    bringWorkbenchWindowToFront,
    handleWorkbenchTitlebarClick,
    preventWorkbenchDragClick,
    previewLayout,
    resultPreviewVisible,
    setWorkbenchDockSplitRatios,
    setWorkbenchToolsFloating,
    setWorkbenchWindowDock,
    setWorkbenchWindowMinimized,
    setWorkbenchWindowOpen,
    setWorkbenchWindowVisibility,
    snapWorkbenchPosition,
    snapWorkbenchSize,
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
    workbenchGridSize,
    workbenchHasBottomDockWindows,
    workbenchHasFloatingSections,
    workbenchHasLeftDock,
    workbenchHasRightDock,
    workbenchPaintColorsFloating,
    workbenchPortal,
    workbenchSettingsDockEmpty,
    workbenchTileDropForPointer,
    workbenchToolsDock,
    workbenchToolsFloating,
    workbenchToolsOpen,
    workbenchWindowActions,
    workbenchWindowDragAttributes,
    workbenchWindowLayout,
    workbenchWindowZIndex,
    workbenchWindowsInDock,
  };
}
