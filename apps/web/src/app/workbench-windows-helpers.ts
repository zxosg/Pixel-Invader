import { type ActiveWorkbenchWindowId, DEFAULT_WORKBENCH_PREFERENCES, type WorkbenchWindowDock, type WorkbenchWindowLayouts } from "../workbench-preferences.js";

export function preserveHiddenWorkbenchWindows(
  currentLayouts: WorkbenchWindowLayouts,
  nextLayouts: WorkbenchWindowLayouts,
): WorkbenchWindowLayouts {
  return Object.fromEntries(
    Object.entries(DEFAULT_WORKBENCH_PREFERENCES.windowLayouts).map(([window, defaults]) => {
      const id = window as ActiveWorkbenchWindowId;
      const current = currentLayouts[id] ?? defaults;
      const next = nextLayouts[id] ?? defaults;
      return [id, { ...defaults, ...next, visible: current.visible && next.visible }];
    }),
  ) as WorkbenchWindowLayouts;
}

export function workbenchWindowCanDock(window: ActiveWorkbenchWindowId, dock: WorkbenchWindowDock): boolean {
  if (dock === "floating" || dock === "left" || dock === "right" || dock === "bottom") return true;
  return dock === "center" && (window === "source" || window === "result");
}

export function workbenchDockIcon(dock: WorkbenchWindowDock): string {
  if (dock === "floating") return "⤢";
  if (dock === "center") return "⊙";
  if (dock === "left") return "◀";
  if (dock === "right") return "▶";
  return "▼";
}

export function workbenchDockLabel(dock: WorkbenchWindowDock): string {
  if (dock === "floating") return "Floating";
  if (dock === "center") return "Center stage";
  if (dock === "left") return "Left dock";
  if (dock === "right") return "Right dock";
  return "Bottom dock";
}
