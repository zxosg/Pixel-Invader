import type { WorkbenchPreferences } from "./workbench-preferences.js";
import type { WorkspacePreferences } from "./workspace-preferences.js";

export interface SavedWorkbenchLayout {
  readonly id: string;
  readonly name: string;
  readonly workspaceMode: "palette" | "tilemap";
  readonly workspace: WorkspacePreferences;
  readonly workbench: WorkbenchPreferences;
}

export const SAVED_WORKBENCH_LAYOUTS_KEY = "retro-converter.saved-workbench-layouts.v1";
const MAX_SAVED_LAYOUTS = 12;
const MAX_LAYOUT_NAME_LENGTH = 40;

interface LayoutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSavedLayout(value: unknown): value is SavedWorkbenchLayout {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" ||
      value.name.trim().length === 0 || value.name.length > MAX_LAYOUT_NAME_LENGTH ||
      (value.workspaceMode !== "palette" && value.workspaceMode !== "tilemap") ||
      !isRecord(value.workspace) || !isRecord(value.workbench)) {
    return false;
  }
  return true;
}

export function loadSavedWorkbenchLayouts(storage: LayoutStorage): readonly SavedWorkbenchLayout[] {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(SAVED_WORKBENCH_LAYOUTS_KEY) ?? "null");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedLayout).slice(0, MAX_SAVED_LAYOUTS);
  } catch {
    return [];
  }
}

export function saveSavedWorkbenchLayouts(
  storage: LayoutStorage,
  layouts: readonly SavedWorkbenchLayout[],
): void {
  try {
    storage.setItem(
      SAVED_WORKBENCH_LAYOUTS_KEY,
      JSON.stringify(layouts.slice(0, MAX_SAVED_LAYOUTS)),
    );
  } catch {
    // Saved layouts are optional; the current workbench remains usable without storage.
  }
}

export function normalizeSavedLayoutName(value: string): string {
  return value.trim().replace(/\s+/g, " ").slice(0, MAX_LAYOUT_NAME_LENGTH);
}

export function createSavedWorkbenchLayoutId(name: string): string {
  const slug = normalizeSavedLayoutName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "layout";
  return `${slug}-${Date.now().toString(36)}`;
}
