export type WorkbenchDock = "bottom" | "left" | "right" | "floating";
export type WorkbenchWindowDock = WorkbenchDock | "center";
export type WorkbenchToolsDock = WorkbenchDock;
export type WorkbenchWindowId = "settings" | "tools" | "geometry" | "adjustments" | "palette" | "dithering" | "tilemap" | "source" | "result";
export type ActiveWorkbenchWindowId = Exclude<WorkbenchWindowId, "settings">;
export type WorkbenchTileDropPosition = "before" | "after" | "append";

export type WorkbenchSettingsSection =
  | "geometry"
  | "adjustments"
  | "palette"
  | "dithering"
  | "tilemap";

export interface WorkbenchWindowLayout {
  readonly dock: WorkbenchWindowDock;
  readonly minimized: boolean;
  readonly open: boolean;
  readonly dockSize: number;
  /** Relative share used when this window is tiled with siblings in a dock. */
  readonly dockRatio: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly autoHeight: boolean;
}

export type WorkbenchWindowLayouts = Readonly<Record<ActiveWorkbenchWindowId, WorkbenchWindowLayout>>;

export function reorderWorkbenchWindowOrder(
  order: readonly WorkbenchWindowId[],
  window: WorkbenchWindowId,
  target: WorkbenchWindowId | null,
  position: WorkbenchTileDropPosition,
): readonly WorkbenchWindowId[] {
  if (!order.includes(window)) return order;
  const withoutWindow = order.filter((candidate) => candidate !== window);
  if (target === null || position === "append") {
    return [...withoutWindow, window];
  }
  const targetIndex = withoutWindow.indexOf(target);
  if (targetIndex < 0) return order;
  const insertionIndex = position === "before" ? targetIndex : targetIndex + 1;
  return [
    ...withoutWindow.slice(0, insertionIndex),
    window,
    ...withoutWindow.slice(insertionIndex),
  ];
}

export interface WorkbenchPreferences {
  readonly dock: WorkbenchDock;
  readonly minimized: boolean;
  readonly sideWidth: number;
  readonly leftWidth: number;
  readonly rightWidth: number;
  readonly bottomHeight: number;
  readonly floatingX: number;
  readonly floatingY: number;
  readonly settingsFloatingWidth: number;
  readonly settingsFloatingHeight: number;
  readonly toolsDock: WorkbenchToolsDock;
  /** Legacy persisted field. New writes use toolsDock. */
  readonly toolsFloating?: boolean;
  readonly toolsFloatingX: number;
  readonly toolsFloatingY: number;
  readonly toolsFloatingWidth: number;
  readonly toolsFloatingHeight: number;
  readonly geometryFloating: boolean;
  readonly geometryFloatingX: number;
  readonly geometryFloatingY: number;
  readonly geometryFloatingWidth: number;
  readonly geometryFloatingHeight: number;
  readonly geometryFloatingAutoHeight: boolean;
  readonly adjustmentsFloating: boolean;
  readonly adjustmentsFloatingX: number;
  readonly adjustmentsFloatingY: number;
  readonly adjustmentsFloatingWidth: number;
  readonly adjustmentsFloatingHeight: number;
  readonly adjustmentsFloatingAutoHeight: boolean;
  readonly windowOrder: readonly WorkbenchWindowId[];
  readonly paletteFloating: boolean;
  readonly paletteFloatingX: number;
  readonly paletteFloatingY: number;
  readonly paletteFloatingWidth: number;
  readonly paletteFloatingHeight: number;
  readonly paletteFloatingAutoHeight: boolean;
  readonly ditheringFloating: boolean;
  readonly ditheringFloatingX: number;
  readonly ditheringFloatingY: number;
  readonly ditheringFloatingWidth: number;
  readonly ditheringFloatingHeight: number;
  readonly ditheringFloatingAutoHeight: boolean;
  readonly tilemapFloating: boolean;
  readonly tilemapFloatingX: number;
  readonly tilemapFloatingY: number;
  readonly tilemapFloatingWidth: number;
  readonly tilemapFloatingHeight: number;
  readonly tilemapFloatingAutoHeight: boolean;
  readonly sourceFloating: boolean;
  readonly sourceFloatingX: number;
  readonly sourceFloatingY: number;
  readonly sourceFloatingWidth: number;
  readonly sourceFloatingHeight: number;
  readonly sourceFloatingAutoHeight: boolean;
  readonly resultFloating: boolean;
  readonly resultFloatingX: number;
  readonly resultFloatingY: number;
  readonly resultFloatingWidth: number;
  readonly resultFloatingHeight: number;
  readonly resultFloatingAutoHeight: boolean;
  readonly sourceDockedWidth: number;
  readonly resultDockedWidth: number;
  readonly toolsOpen: boolean;
  readonly sectionsOpen: Readonly<Record<WorkbenchSettingsSection, boolean>>;
  /** Normalized per-window layout. Older fields remain accepted for migration. */
  readonly windowLayouts: WorkbenchWindowLayouts;
}

export const WORKBENCH_PREFERENCES_KEY = "retro-converter.workbench-preferences.v1";

export const DEFAULT_WORKBENCH_PREFERENCES: WorkbenchPreferences = {
  dock: "bottom",
  minimized: true,
  sideWidth: 360,
  leftWidth: 360,
  rightWidth: 360,
  bottomHeight: 260,
  floatingX: 420,
  floatingY: 96,
  settingsFloatingWidth: 640,
  settingsFloatingHeight: 420,
  toolsDock: "bottom",
  toolsFloatingX: 780,
  toolsFloatingY: 96,
  toolsFloatingWidth: 360,
  toolsFloatingHeight: 220,
  geometryFloating: false,
  geometryFloatingX: 360,
  geometryFloatingY: 96,
  geometryFloatingWidth: 520,
  geometryFloatingHeight: 360,
  geometryFloatingAutoHeight: true,
  adjustmentsFloating: false,
  adjustmentsFloatingX: 520,
  adjustmentsFloatingY: 128,
  adjustmentsFloatingWidth: 520,
  adjustmentsFloatingHeight: 300,
  adjustmentsFloatingAutoHeight: true,
  windowOrder: ["settings", "tools", "geometry", "adjustments", "palette", "dithering", "tilemap", "source", "result"],
  paletteFloating: false,
  paletteFloatingX: 360,
  paletteFloatingY: 96,
  paletteFloatingWidth: 560,
  paletteFloatingHeight: 360,
  paletteFloatingAutoHeight: true,
  ditheringFloating: false,
  ditheringFloatingX: 720,
  ditheringFloatingY: 96,
  ditheringFloatingWidth: 520,
  ditheringFloatingHeight: 360,
  ditheringFloatingAutoHeight: true,
  tilemapFloating: false,
  tilemapFloatingX: 520,
  tilemapFloatingY: 96,
  tilemapFloatingWidth: 720,
  tilemapFloatingHeight: 420,
  tilemapFloatingAutoHeight: true,
  sourceFloating: false,
  sourceFloatingX: 64,
  sourceFloatingY: 64,
  sourceFloatingWidth: 640,
  sourceFloatingHeight: 420,
  sourceFloatingAutoHeight: true,
  resultFloating: false,
  resultFloatingX: 760,
  resultFloatingY: 64,
  resultFloatingWidth: 760,
  resultFloatingHeight: 420,
  resultFloatingAutoHeight: true,
  sourceDockedWidth: 1,
  resultDockedWidth: 1,
  toolsOpen: false,
  sectionsOpen: {
    geometry: true,
    adjustments: true,
    palette: true,
    dithering: true,
    tilemap: true,
  },
  windowLayouts: {
    tools: {
      dock: "bottom",
      minimized: true,
      open: false,
      dockSize: 260,
      dockRatio: 1,
      x: 780,
      y: 96,
      width: 360,
      height: 220,
      autoHeight: false,
    },
    geometry: {
      dock: "bottom",
      minimized: true,
      open: true,
      dockSize: 260,
      dockRatio: 1,
      x: 360,
      y: 96,
      width: 520,
      height: 360,
      autoHeight: true,
    },
    adjustments: {
      dock: "bottom",
      minimized: true,
      open: true,
      dockSize: 260,
      dockRatio: 1,
      x: 520,
      y: 128,
      width: 520,
      height: 300,
      autoHeight: true,
    },
    palette: {
      dock: "bottom",
      minimized: true,
      open: true,
      dockSize: 260,
      dockRatio: 1,
      x: 360,
      y: 96,
      width: 560,
      height: 360,
      autoHeight: true,
    },
    dithering: {
      dock: "bottom",
      minimized: true,
      open: true,
      dockSize: 260,
      dockRatio: 1,
      x: 720,
      y: 96,
      width: 520,
      height: 360,
      autoHeight: true,
    },
    tilemap: {
      dock: "bottom",
      minimized: true,
      open: true,
      dockSize: 260,
      dockRatio: 1,
      x: 520,
      y: 96,
      width: 720,
      height: 420,
      autoHeight: true,
    },
    source: {
      dock: "center",
      minimized: false,
      open: true,
      dockSize: 260,
      dockRatio: 1,
      x: 64,
      y: 64,
      width: 640,
      height: 420,
      autoHeight: true,
    },
    result: {
      dock: "center",
      minimized: false,
      open: true,
      dockSize: 260,
      dockRatio: 1,
      x: 760,
      y: 64,
      width: 760,
      height: 420,
      autoHeight: true,
    },
  },
};

const DOCKS = new Set<WorkbenchDock>(["bottom", "left", "right", "floating"]);
const WINDOWS: readonly WorkbenchWindowId[] = ["settings", "tools", "geometry", "adjustments", "palette", "dithering", "tilemap", "source", "result"];
const CURRENT_WINDOWS: readonly WorkbenchWindowId[] = ["settings", "tools", "geometry", "adjustments", "palette", "dithering"];
const PREVIEW_WINDOWS: readonly WorkbenchWindowId[] = [...CURRENT_WINDOWS, "source", "result"];
const LEGACY_WINDOWS: readonly WorkbenchWindowId[] = ["settings", "tools", "palette", "dithering"];
const SECTIONS: readonly WorkbenchSettingsSection[] = [
  "geometry",
  "adjustments",
  "palette",
  "dithering",
  "tilemap",
];
const ACTIVE_WINDOWS: readonly ActiveWorkbenchWindowId[] = ["tools", "geometry", "adjustments", "palette", "dithering", "tilemap", "source", "result"];
const WINDOW_DOCKS = new Set<WorkbenchWindowDock>(["bottom", "left", "right", "floating", "center"]);

interface PreferenceStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isFiniteNumberInRange(value: unknown, min: number, max: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function loadSections(value: unknown): Readonly<Record<WorkbenchSettingsSection, boolean>> | null {
  if (!isRecord(value)) return null;
  const sections = {} as Record<WorkbenchSettingsSection, boolean>;
  for (const section of SECTIONS) {
    if (typeof value[section] !== "boolean") return null;
    sections[section] = value[section];
  }
  return sections;
}

function loadWindowLayouts(value: unknown, legacy: Record<string, unknown> | null = null): WorkbenchWindowLayouts | null {
  if (value === undefined) {
    if (legacy === null) return DEFAULT_WORKBENCH_PREFERENCES.windowLayouts;
    const numberOr = (candidate: unknown, fallback: number): number =>
      typeof candidate === "number" && Number.isFinite(candidate) ? candidate : fallback;
    const boolOr = (candidate: unknown, fallback: boolean): boolean =>
      typeof candidate === "boolean" ? candidate : fallback;
    const legacyDock = legacy.dock === "left" || legacy.dock === "right" || legacy.dock === "bottom" || legacy.dock === "floating"
      ? legacy.dock as WorkbenchDock
      : "bottom";
    const legacySideWidth = numberOr(legacy.sideWidth, DEFAULT_WORKBENCH_PREFERENCES.sideWidth);
    const legacyBottomHeight = numberOr(legacy.bottomHeight, DEFAULT_WORKBENCH_PREFERENCES.bottomHeight);
    const promotedDock = legacyDock === "floating" ? "bottom" : legacyDock;
    const sectionLayout = (
      section: WorkbenchSettingsSection,
      floating: unknown,
      x: unknown,
      y: unknown,
      width: unknown,
      height: unknown,
      autoHeight: unknown,
    ): WorkbenchWindowLayout => ({
      dock: boolOr(floating, false) ? "floating" : promotedDock,
      minimized: boolOr(legacy.minimized, DEFAULT_WORKBENCH_PREFERENCES.minimized),
      open: boolOr((legacy.sectionsOpen as Record<string, unknown> | undefined)?.[section], true),
      dockSize: promotedDock === "bottom" ? legacyBottomHeight : legacySideWidth,
      dockRatio: 1,
      x: numberOr(x, DEFAULT_WORKBENCH_PREFERENCES.windowLayouts[section].x),
      y: numberOr(y, DEFAULT_WORKBENCH_PREFERENCES.windowLayouts[section].y),
      width: numberOr(width, DEFAULT_WORKBENCH_PREFERENCES.windowLayouts[section].width),
      height: numberOr(height, DEFAULT_WORKBENCH_PREFERENCES.windowLayouts[section].height),
      autoHeight: boolOr(autoHeight, DEFAULT_WORKBENCH_PREFERENCES.windowLayouts[section].autoHeight),
    });
    return {
      tools: {
        dock: legacy.toolsDock === "left" || legacy.toolsDock === "right" || legacy.toolsDock === "bottom" || legacy.toolsDock === "floating"
          ? legacy.toolsDock as WorkbenchDock
          : boolOr(legacy.toolsFloating, false) ? "floating" : "bottom",
        minimized: !boolOr(legacy.toolsOpen, false),
        open: boolOr(legacy.toolsOpen, false),
        dockSize: legacyBottomHeight,
        dockRatio: 1,
        x: numberOr(legacy.toolsFloatingX, DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.tools.x),
        y: numberOr(legacy.toolsFloatingY, DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.tools.y),
        width: numberOr(legacy.toolsFloatingWidth, DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.tools.width),
        height: numberOr(legacy.toolsFloatingHeight, DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.tools.height),
        autoHeight: false,
      },
      geometry: sectionLayout("geometry", legacy.geometryFloating, legacy.geometryFloatingX, legacy.geometryFloatingY, legacy.geometryFloatingWidth, legacy.geometryFloatingHeight, legacy.geometryFloatingAutoHeight),
      adjustments: sectionLayout("adjustments", legacy.adjustmentsFloating, legacy.adjustmentsFloatingX, legacy.adjustmentsFloatingY, legacy.adjustmentsFloatingWidth, legacy.adjustmentsFloatingHeight, legacy.adjustmentsFloatingAutoHeight),
      palette: sectionLayout("palette", legacy.paletteFloating, legacy.paletteFloatingX, legacy.paletteFloatingY, legacy.paletteFloatingWidth, legacy.paletteFloatingHeight, legacy.paletteFloatingAutoHeight),
      dithering: sectionLayout("dithering", legacy.ditheringFloating, legacy.ditheringFloatingX, legacy.ditheringFloatingY, legacy.ditheringFloatingWidth, legacy.ditheringFloatingHeight, legacy.ditheringFloatingAutoHeight),
      tilemap: sectionLayout("tilemap", legacy.tilemapFloating, legacy.tilemapFloatingX, legacy.tilemapFloatingY, legacy.tilemapFloatingWidth, legacy.tilemapFloatingHeight, legacy.tilemapFloatingAutoHeight),
      source: {
        dock: boolOr(legacy.sourceFloating, false) ? "floating" : "center",
        minimized: false,
        open: true,
        dockSize: legacyBottomHeight,
        dockRatio: 1,
        x: numberOr(legacy.sourceFloatingX, DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.source.x),
        y: numberOr(legacy.sourceFloatingY, DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.source.y),
        width: numberOr(legacy.sourceFloatingWidth, DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.source.width),
        height: numberOr(legacy.sourceFloatingHeight, DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.source.height),
        autoHeight: boolOr(legacy.sourceFloatingAutoHeight, true),
      },
      result: {
        dock: boolOr(legacy.resultFloating, false) ? "floating" : "center",
        minimized: false,
        open: true,
        dockSize: legacyBottomHeight,
        dockRatio: 1,
        x: numberOr(legacy.resultFloatingX, DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.result.x),
        y: numberOr(legacy.resultFloatingY, DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.result.y),
        width: numberOr(legacy.resultFloatingWidth, DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.result.width),
        height: numberOr(legacy.resultFloatingHeight, DEFAULT_WORKBENCH_PREFERENCES.windowLayouts.result.height),
        autoHeight: boolOr(legacy.resultFloatingAutoHeight, true),
      },
    };
  }
  if (!isRecord(value)) return null;
  const layouts = {} as Record<ActiveWorkbenchWindowId, WorkbenchWindowLayout>;
  for (const window of ACTIVE_WINDOWS) {
    const candidate = value[window];
    if (!isRecord(candidate) ||
        typeof candidate.dock !== "string" || !WINDOW_DOCKS.has(candidate.dock as WorkbenchWindowDock) ||
        typeof candidate.minimized !== "boolean" ||
        typeof candidate.open !== "boolean" ||
        !isFiniteNumberInRange(candidate.dockSize, 0, 1200) ||
        (candidate.dockRatio !== undefined && !isFiniteNumberInRange(candidate.dockRatio, 0.15, 20)) ||
        !isFiniteNumberInRange(candidate.x, 0, 10000) ||
        !isFiniteNumberInRange(candidate.y, 0, 10000) ||
        !isFiniteNumberInRange(candidate.width, 240, 1600) ||
        !isFiniteNumberInRange(candidate.height, 160, 900) ||
        typeof candidate.autoHeight !== "boolean") {
      return null;
    }
    if ((window === "source" || window === "result")
        ? candidate.dock === "center" || candidate.dock === "bottom" || candidate.dock === "left" || candidate.dock === "right" || candidate.dock === "floating"
        : candidate.dock !== "center") {
      layouts[window] = {
        dock: candidate.dock as WorkbenchWindowDock,
        minimized: candidate.minimized,
        open: candidate.open,
        dockSize: candidate.dockSize,
        dockRatio: candidate.dockRatio ?? 1,
        x: candidate.x,
        y: candidate.y,
        width: candidate.width,
        height: candidate.height,
        autoHeight: candidate.autoHeight,
      };
    } else {
      return null;
    }
  }
  return layouts;
}

function loadWindowOrder(value: unknown): readonly WorkbenchWindowId[] | null {
  if (value === undefined) return DEFAULT_WORKBENCH_PREFERENCES.windowOrder;
  if (!Array.isArray(value)) return null;
  if (value.length === LEGACY_WINDOWS.length) {
    const legacyOrder = value.filter((candidate): candidate is WorkbenchWindowId =>
      typeof candidate === "string" && LEGACY_WINDOWS.includes(candidate as WorkbenchWindowId),
    );
    if (legacyOrder.length === LEGACY_WINDOWS.length && new Set(legacyOrder).size === LEGACY_WINDOWS.length) {
      return ["settings", "tools", "geometry", "adjustments", ...legacyOrder.filter((window) => window === "palette" || window === "dithering"), "tilemap", "source", "result"];
    }
  }
  if (value.length === CURRENT_WINDOWS.length) {
    const currentOrder = value.filter((candidate): candidate is WorkbenchWindowId =>
      typeof candidate === "string" && CURRENT_WINDOWS.includes(candidate as WorkbenchWindowId),
    );
    if (currentOrder.length === CURRENT_WINDOWS.length && new Set(currentOrder).size === CURRENT_WINDOWS.length) {
      return [...currentOrder, "tilemap", "source", "result"];
    }
  }
  if (value.length === PREVIEW_WINDOWS.length) {
    const previewOrder = value.filter((candidate): candidate is WorkbenchWindowId =>
      typeof candidate === "string" && PREVIEW_WINDOWS.includes(candidate as WorkbenchWindowId),
    );
    if (previewOrder.length === PREVIEW_WINDOWS.length && new Set(previewOrder).size === PREVIEW_WINDOWS.length) {
      return [...previewOrder.slice(0, -2), "tilemap", ...previewOrder.slice(-2)];
    }
  }
  if (value.length !== WINDOWS.length) return null;
  const order = value.filter((candidate): candidate is WorkbenchWindowId =>
    typeof candidate === "string" && WINDOWS.includes(candidate as WorkbenchWindowId),
  );
  return order.length === WINDOWS.length && new Set(order).size === WINDOWS.length ? order : null;
}

export function loadWorkbenchPreferences(
  storage: PreferenceStorage,
): WorkbenchPreferences {
  try {
    const parsed: unknown = JSON.parse(
      storage.getItem(WORKBENCH_PREFERENCES_KEY) ?? "null",
    );
    if (!isRecord(parsed)) return DEFAULT_WORKBENCH_PREFERENCES;
    const sectionsOpen = loadSections(parsed.sectionsOpen);
    const windowLayouts = loadWindowLayouts(parsed.windowLayouts, parsed);
    const windowOrder = loadWindowOrder(parsed.windowOrder);
    if (
      typeof parsed.dock !== "string" || !DOCKS.has(parsed.dock as WorkbenchDock) ||
      typeof parsed.minimized !== "boolean" ||
      !isFiniteNumberInRange(parsed.sideWidth, 0, 560) ||
      (parsed.leftWidth !== undefined && !isFiniteNumberInRange(parsed.leftWidth, 0, 560)) ||
      (parsed.rightWidth !== undefined && !isFiniteNumberInRange(parsed.rightWidth, 0, 560)) ||
      !isFiniteNumberInRange(parsed.bottomHeight, 0, 480) ||
      !isFiniteNumberInRange(parsed.floatingX, 0, 10000) ||
      !isFiniteNumberInRange(parsed.floatingY, 0, 10000) ||
      (parsed.settingsFloatingWidth !== undefined && !isFiniteNumberInRange(parsed.settingsFloatingWidth, 420, 1000)) ||
      (parsed.settingsFloatingHeight !== undefined && !isFiniteNumberInRange(parsed.settingsFloatingHeight, 280, 760)) ||
      (parsed.toolsDock !== undefined
        ? (typeof parsed.toolsDock !== "string" || !DOCKS.has(parsed.toolsDock as WorkbenchDock))
        : (parsed.toolsFloating !== undefined && typeof parsed.toolsFloating !== "boolean")) ||
      !isFiniteNumberInRange(parsed.toolsFloatingX, 0, 10000) ||
      !isFiniteNumberInRange(parsed.toolsFloatingY, 0, 10000) ||
      (parsed.toolsFloatingWidth !== undefined && !isFiniteNumberInRange(parsed.toolsFloatingWidth, 280, 760)) ||
      (parsed.toolsFloatingHeight !== undefined && !isFiniteNumberInRange(parsed.toolsFloatingHeight, 160, 560)) ||
      (parsed.geometryFloating !== undefined && typeof parsed.geometryFloating !== "boolean") ||
      (parsed.geometryFloatingX !== undefined && !isFiniteNumberInRange(parsed.geometryFloatingX, 0, 10000)) ||
      (parsed.geometryFloatingY !== undefined && !isFiniteNumberInRange(parsed.geometryFloatingY, 0, 10000)) ||
      (parsed.geometryFloatingWidth !== undefined && !isFiniteNumberInRange(parsed.geometryFloatingWidth, 360, 820)) ||
      (parsed.geometryFloatingHeight !== undefined && !isFiniteNumberInRange(parsed.geometryFloatingHeight, 220, 680)) ||
      (parsed.geometryFloatingAutoHeight !== undefined && typeof parsed.geometryFloatingAutoHeight !== "boolean") ||
      (parsed.adjustmentsFloating !== undefined && typeof parsed.adjustmentsFloating !== "boolean") ||
      (parsed.adjustmentsFloatingX !== undefined && !isFiniteNumberInRange(parsed.adjustmentsFloatingX, 0, 10000)) ||
      (parsed.adjustmentsFloatingY !== undefined && !isFiniteNumberInRange(parsed.adjustmentsFloatingY, 0, 10000)) ||
      (parsed.adjustmentsFloatingWidth !== undefined && !isFiniteNumberInRange(parsed.adjustmentsFloatingWidth, 360, 820)) ||
      (parsed.adjustmentsFloatingHeight !== undefined && !isFiniteNumberInRange(parsed.adjustmentsFloatingHeight, 220, 680)) ||
      (parsed.adjustmentsFloatingAutoHeight !== undefined && typeof parsed.adjustmentsFloatingAutoHeight !== "boolean") ||
      windowOrder === null ||
      typeof parsed.paletteFloating !== "boolean" ||
      !isFiniteNumberInRange(parsed.paletteFloatingX, 0, 10000) ||
      !isFiniteNumberInRange(parsed.paletteFloatingY, 0, 10000) ||
      !isFiniteNumberInRange(parsed.paletteFloatingWidth, 320, 820) ||
      !isFiniteNumberInRange(parsed.paletteFloatingHeight, 220, 680) ||
      (parsed.paletteFloatingAutoHeight !== undefined && typeof parsed.paletteFloatingAutoHeight !== "boolean") ||
      typeof parsed.ditheringFloating !== "boolean" ||
      !isFiniteNumberInRange(parsed.ditheringFloatingX, 0, 10000) ||
      !isFiniteNumberInRange(parsed.ditheringFloatingY, 0, 10000) ||
      !isFiniteNumberInRange(parsed.ditheringFloatingWidth, 320, 760) ||
      !isFiniteNumberInRange(parsed.ditheringFloatingHeight, 220, 680) ||
      (parsed.ditheringFloatingAutoHeight !== undefined && typeof parsed.ditheringFloatingAutoHeight !== "boolean") ||
      (parsed.tilemapFloating !== undefined && typeof parsed.tilemapFloating !== "boolean") ||
      (parsed.tilemapFloatingX !== undefined && !isFiniteNumberInRange(parsed.tilemapFloatingX, 0, 10000)) ||
      (parsed.tilemapFloatingY !== undefined && !isFiniteNumberInRange(parsed.tilemapFloatingY, 0, 10000)) ||
      (parsed.tilemapFloatingWidth !== undefined && !isFiniteNumberInRange(parsed.tilemapFloatingWidth, 320, 1200)) ||
      (parsed.tilemapFloatingHeight !== undefined && !isFiniteNumberInRange(parsed.tilemapFloatingHeight, 220, 900)) ||
      (parsed.tilemapFloatingAutoHeight !== undefined && typeof parsed.tilemapFloatingAutoHeight !== "boolean") ||
      (parsed.sourceFloating !== undefined && typeof parsed.sourceFloating !== "boolean") ||
      (parsed.sourceFloatingX !== undefined && !isFiniteNumberInRange(parsed.sourceFloatingX, 0, 10000)) ||
      (parsed.sourceFloatingY !== undefined && !isFiniteNumberInRange(parsed.sourceFloatingY, 0, 10000)) ||
      (parsed.sourceFloatingWidth !== undefined && !isFiniteNumberInRange(parsed.sourceFloatingWidth, 320, 1600)) ||
      (parsed.sourceFloatingHeight !== undefined && !isFiniteNumberInRange(parsed.sourceFloatingHeight, 220, 900)) ||
      (parsed.sourceFloatingAutoHeight !== undefined && typeof parsed.sourceFloatingAutoHeight !== "boolean") ||
      (parsed.resultFloating !== undefined && typeof parsed.resultFloating !== "boolean") ||
      (parsed.resultFloatingX !== undefined && !isFiniteNumberInRange(parsed.resultFloatingX, 0, 10000)) ||
      (parsed.resultFloatingY !== undefined && !isFiniteNumberInRange(parsed.resultFloatingY, 0, 10000)) ||
      (parsed.resultFloatingWidth !== undefined && !isFiniteNumberInRange(parsed.resultFloatingWidth, 320, 1600)) ||
      (parsed.resultFloatingHeight !== undefined && !isFiniteNumberInRange(parsed.resultFloatingHeight, 220, 900)) ||
      (parsed.resultFloatingAutoHeight !== undefined && typeof parsed.resultFloatingAutoHeight !== "boolean") ||
      (parsed.sourceDockedWidth !== undefined && !isFiniteNumberInRange(parsed.sourceDockedWidth, 0.25, 10)) ||
      (parsed.resultDockedWidth !== undefined && !isFiniteNumberInRange(parsed.resultDockedWidth, 0.25, 10)) ||
      typeof parsed.toolsOpen !== "boolean" ||
      sectionsOpen === null ||
      windowLayouts === null
    ) {
      return DEFAULT_WORKBENCH_PREFERENCES;
    }
    return {
      dock: parsed.dock as WorkbenchDock,
      minimized: parsed.minimized,
      sideWidth: parsed.sideWidth,
      leftWidth: parsed.leftWidth ?? parsed.sideWidth,
      rightWidth: parsed.rightWidth ?? parsed.sideWidth,
      bottomHeight: parsed.bottomHeight,
      floatingX: parsed.floatingX,
      floatingY: parsed.floatingY,
      settingsFloatingWidth: parsed.settingsFloatingWidth ?? 640,
      settingsFloatingHeight: parsed.settingsFloatingHeight ?? 420,
      toolsDock: parsed.toolsDock === undefined
        ? parsed.toolsFloating === true ? "floating" : "bottom"
        : parsed.toolsDock as WorkbenchToolsDock,
      toolsFloatingX: parsed.toolsFloatingX,
      toolsFloatingY: parsed.toolsFloatingY,
      toolsFloatingWidth: parsed.toolsFloatingWidth ?? 360,
      toolsFloatingHeight: parsed.toolsFloatingHeight ?? 220,
      geometryFloating: parsed.geometryFloating ?? false,
      geometryFloatingX: parsed.geometryFloatingX ?? 360,
      geometryFloatingY: parsed.geometryFloatingY ?? 96,
      geometryFloatingWidth: parsed.geometryFloatingWidth ?? 520,
      geometryFloatingHeight: parsed.geometryFloatingHeight ?? 360,
      geometryFloatingAutoHeight: parsed.geometryFloatingAutoHeight ?? true,
      adjustmentsFloating: parsed.adjustmentsFloating ?? false,
      adjustmentsFloatingX: parsed.adjustmentsFloatingX ?? 520,
      adjustmentsFloatingY: parsed.adjustmentsFloatingY ?? 128,
      adjustmentsFloatingWidth: parsed.adjustmentsFloatingWidth ?? 520,
      adjustmentsFloatingHeight: parsed.adjustmentsFloatingHeight ?? 300,
      adjustmentsFloatingAutoHeight: parsed.adjustmentsFloatingAutoHeight ?? true,
      windowOrder,
      paletteFloating: parsed.paletteFloating,
      paletteFloatingX: parsed.paletteFloatingX,
      paletteFloatingY: parsed.paletteFloatingY,
      paletteFloatingWidth: parsed.paletteFloatingWidth,
      paletteFloatingHeight: parsed.paletteFloatingHeight,
      paletteFloatingAutoHeight: parsed.paletteFloatingAutoHeight ?? true,
      ditheringFloating: parsed.ditheringFloating,
      ditheringFloatingX: parsed.ditheringFloatingX,
      ditheringFloatingY: parsed.ditheringFloatingY,
      ditheringFloatingWidth: parsed.ditheringFloatingWidth,
      ditheringFloatingHeight: parsed.ditheringFloatingHeight,
      ditheringFloatingAutoHeight: parsed.ditheringFloatingAutoHeight ?? true,
      tilemapFloating: parsed.tilemapFloating ?? false,
      tilemapFloatingX: parsed.tilemapFloatingX ?? 520,
      tilemapFloatingY: parsed.tilemapFloatingY ?? 96,
      tilemapFloatingWidth: parsed.tilemapFloatingWidth ?? 720,
      tilemapFloatingHeight: parsed.tilemapFloatingHeight ?? 420,
      tilemapFloatingAutoHeight: parsed.tilemapFloatingAutoHeight ?? true,
      sourceFloating: parsed.sourceFloating ?? false,
      sourceFloatingX: parsed.sourceFloatingX ?? 64,
      sourceFloatingY: parsed.sourceFloatingY ?? 64,
      sourceFloatingWidth: parsed.sourceFloatingWidth ?? 640,
      sourceFloatingHeight: parsed.sourceFloatingHeight ?? 420,
      sourceFloatingAutoHeight: parsed.sourceFloatingAutoHeight ?? true,
      resultFloating: parsed.resultFloating ?? false,
      resultFloatingX: parsed.resultFloatingX ?? 760,
      resultFloatingY: parsed.resultFloatingY ?? 64,
      resultFloatingWidth: parsed.resultFloatingWidth ?? 760,
      resultFloatingHeight: parsed.resultFloatingHeight ?? 420,
      resultFloatingAutoHeight: parsed.resultFloatingAutoHeight ?? true,
      sourceDockedWidth: parsed.sourceDockedWidth ?? 1,
      resultDockedWidth: parsed.resultDockedWidth ?? 1,
      toolsOpen: parsed.toolsOpen,
      sectionsOpen,
      windowLayouts,
    };
  } catch {
    return DEFAULT_WORKBENCH_PREFERENCES;
  }
}

export function saveWorkbenchPreferences(
  storage: PreferenceStorage,
  preferences: WorkbenchPreferences,
): void {
  try {
    storage.setItem(WORKBENCH_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    // Preferences are optional; the workbench remains usable without storage.
  }
}
