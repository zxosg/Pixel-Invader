export type WorkbenchDock = "bottom" | "left" | "right" | "floating";
export type WorkbenchWindowId = "settings" | "tools" | "geometry" | "adjustments" | "palette" | "dithering";

export type WorkbenchSettingsSection =
  | "geometry"
  | "adjustments"
  | "palette"
  | "dithering"
  | "tilemap";

export interface WorkbenchPreferences {
  readonly dock: WorkbenchDock;
  readonly minimized: boolean;
  readonly sideWidth: number;
  readonly bottomHeight: number;
  readonly floatingX: number;
  readonly floatingY: number;
  readonly settingsFloatingWidth: number;
  readonly settingsFloatingHeight: number;
  readonly toolsFloating: boolean;
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
  readonly toolsOpen: boolean;
  readonly sectionsOpen: Readonly<Record<WorkbenchSettingsSection, boolean>>;
}

export const WORKBENCH_PREFERENCES_KEY = "retro-converter.workbench-preferences.v1";

export const DEFAULT_WORKBENCH_PREFERENCES: WorkbenchPreferences = {
  dock: "bottom",
  minimized: true,
  sideWidth: 360,
  bottomHeight: 260,
  floatingX: 420,
  floatingY: 96,
  settingsFloatingWidth: 640,
  settingsFloatingHeight: 420,
  toolsFloating: false,
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
  windowOrder: ["settings", "tools", "geometry", "adjustments", "palette", "dithering"],
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
  toolsOpen: false,
  sectionsOpen: {
    geometry: true,
    adjustments: true,
    palette: true,
    dithering: true,
    tilemap: true,
  },
};

const DOCKS = new Set<WorkbenchDock>(["bottom", "left", "right", "floating"]);
const WINDOWS: readonly WorkbenchWindowId[] = ["settings", "tools", "geometry", "adjustments", "palette", "dithering"];
const LEGACY_WINDOWS: readonly WorkbenchWindowId[] = ["settings", "tools", "palette", "dithering"];
const SECTIONS: readonly WorkbenchSettingsSection[] = [
  "geometry",
  "adjustments",
  "palette",
  "dithering",
  "tilemap",
];

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

function loadWindowOrder(value: unknown): readonly WorkbenchWindowId[] | null {
  if (value === undefined) return DEFAULT_WORKBENCH_PREFERENCES.windowOrder;
  if (!Array.isArray(value)) return null;
  if (value.length === LEGACY_WINDOWS.length) {
    const legacyOrder = value.filter((candidate): candidate is WorkbenchWindowId =>
      typeof candidate === "string" && LEGACY_WINDOWS.includes(candidate as WorkbenchWindowId),
    );
    if (legacyOrder.length === LEGACY_WINDOWS.length && new Set(legacyOrder).size === LEGACY_WINDOWS.length) {
      return ["settings", "tools", "geometry", "adjustments", ...legacyOrder.filter((window) => window === "palette" || window === "dithering")];
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
    const windowOrder = loadWindowOrder(parsed.windowOrder);
    if (
      typeof parsed.dock !== "string" || !DOCKS.has(parsed.dock as WorkbenchDock) ||
      typeof parsed.minimized !== "boolean" ||
      !isFiniteNumberInRange(parsed.sideWidth, 280, 560) ||
      !isFiniteNumberInRange(parsed.bottomHeight, 160, 480) ||
      !isFiniteNumberInRange(parsed.floatingX, 0, 10000) ||
      !isFiniteNumberInRange(parsed.floatingY, 0, 10000) ||
      (parsed.settingsFloatingWidth !== undefined && !isFiniteNumberInRange(parsed.settingsFloatingWidth, 420, 1000)) ||
      (parsed.settingsFloatingHeight !== undefined && !isFiniteNumberInRange(parsed.settingsFloatingHeight, 280, 760)) ||
      typeof parsed.toolsFloating !== "boolean" ||
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
      typeof parsed.toolsOpen !== "boolean" ||
      sectionsOpen === null
    ) {
      return DEFAULT_WORKBENCH_PREFERENCES;
    }
    return {
      dock: parsed.dock as WorkbenchDock,
      minimized: parsed.minimized,
      sideWidth: parsed.sideWidth,
      bottomHeight: parsed.bottomHeight,
      floatingX: parsed.floatingX,
      floatingY: parsed.floatingY,
      settingsFloatingWidth: parsed.settingsFloatingWidth ?? 640,
      settingsFloatingHeight: parsed.settingsFloatingHeight ?? 420,
      toolsFloating: parsed.toolsFloating,
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
      toolsOpen: parsed.toolsOpen,
      sectionsOpen,
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
