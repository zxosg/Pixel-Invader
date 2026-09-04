export type WorkspaceLayoutId =
  | "conversion"
  | "palette"
  | "tilemap"
  | "editor"
  | "inspection"
  | "custom";

export interface WorkspacePreferences {
  readonly layout: WorkspaceLayoutId;
  readonly sourceContent: "image" | "source-image" | "result-image" | "bitmap-editor" | "pre-attribute" | "screen-1" | "screen-2" | "merged-low" | "merged-high" | "palette-usage" | "tile-usage" | "unified-editor" | "inspector" | "difference";
  readonly resultContent: "image" | "source-image" | "result-image" | "bitmap-editor" | "pre-attribute" | "screen-1" | "screen-2" | "merged-low" | "merged-high" | "palette-usage" | "tile-usage" | "unified-editor" | "inspector" | "difference";
  readonly previewZoom: "fit" | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;
  readonly sourceZoom?: WorkspacePreferences["previewZoom"];
  readonly resultZoom?: WorkspacePreferences["previewZoom"];
  readonly synchronizePan: boolean;
  readonly showPixelGrid: boolean;
  readonly showAttributeGrid: boolean;
  readonly hideAttributes: boolean;
  readonly inspectionDrawerOpen: boolean;
}

export const DEFAULT_WORKSPACE_PREFERENCES: WorkspacePreferences = {
  layout: "conversion",
  sourceContent: "image",
  resultContent: "image",
  previewZoom: "fit",
  synchronizePan: true,
  showPixelGrid: false,
  showAttributeGrid: false,
  hideAttributes: false,
  inspectionDrawerOpen: false,
};

const STORAGE_KEY = "retro-converter.workspace-preferences.v1";
const CONTENTS = new Set(["image", "source-image", "result-image", "pre-attribute", "screen-1", "screen-2", "merged-low", "merged-high", "palette-usage", "tile-usage", "unified-editor", "tile-editor", "bitmap-editor", "inspector", "difference"]);
const ZOOMS = new Set(["fit", 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]);
const LAYOUTS = new Set(["conversion", "palette", "tilemap", "editor", "inspection", "custom"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function loadWorkspacePreferences(
  storage: Storage,
): WorkspacePreferences {
  try {
    const parsed: unknown = JSON.parse(storage.getItem(STORAGE_KEY) ?? "null");
    if (!isRecord(parsed)) return DEFAULT_WORKSPACE_PREFERENCES;
    const layout = parsed.layout;
    const sourceContent = parsed.sourceContent;
    const resultContent = parsed.resultContent;
    const previewZoom = parsed.previewZoom;
    const sourceZoom = parsed.sourceZoom ?? previewZoom;
    const resultZoom = parsed.resultZoom ?? previewZoom;
    if (typeof layout !== "string" || !LAYOUTS.has(layout) ||
        typeof sourceContent !== "string" || !CONTENTS.has(sourceContent) ||
        typeof resultContent !== "string" || !CONTENTS.has(resultContent) ||
        !(previewZoom === "fit" || (typeof previewZoom === "number" && ZOOMS.has(previewZoom))) ||
        !(sourceZoom === "fit" || (typeof sourceZoom === "number" && ZOOMS.has(sourceZoom))) ||
        !(resultZoom === "fit" || (typeof resultZoom === "number" && ZOOMS.has(resultZoom))) ||
        typeof parsed.synchronizePan !== "boolean" ||
        typeof parsed.showPixelGrid !== "boolean" || typeof parsed.showAttributeGrid !== "boolean" ||
        typeof parsed.hideAttributes !== "boolean" || typeof parsed.inspectionDrawerOpen !== "boolean") {
      return DEFAULT_WORKSPACE_PREFERENCES;
    }
    return {
      layout: layout as WorkspaceLayoutId,
      sourceContent: sourceContent === "tile-editor" ? "unified-editor" : sourceContent as WorkspacePreferences["sourceContent"],
      resultContent: resultContent === "tile-editor" ? "unified-editor" : resultContent as WorkspacePreferences["resultContent"],
      previewZoom: previewZoom as WorkspacePreferences["previewZoom"],
      synchronizePan: parsed.synchronizePan,
      showPixelGrid: parsed.showPixelGrid,
      showAttributeGrid: parsed.showAttributeGrid,
      hideAttributes: parsed.hideAttributes,
      inspectionDrawerOpen: parsed.inspectionDrawerOpen,
      ...(parsed.sourceZoom === undefined ? {} : { sourceZoom: sourceZoom as WorkspacePreferences["previewZoom"] }),
      ...(parsed.resultZoom === undefined ? {} : { resultZoom: resultZoom as WorkspacePreferences["previewZoom"] }),
    };
  } catch {
    return DEFAULT_WORKSPACE_PREFERENCES;
  }
}

export function saveWorkspacePreferences(
  storage: Storage,
  preferences: WorkspacePreferences,
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
}
