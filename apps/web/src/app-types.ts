import { type WorkerCharsetResult, type WorkerConversionResult } from "./worker/client.js";
import type { TileTransform } from "@retro-converter/zx-charset";
import { type WorkspaceLayoutId } from "./workspace-preferences.js";
import { type ActiveWorkbenchWindowId, type WorkbenchTileDropPosition, type WorkbenchWindowDock } from "./workbench-preferences.js";
import { type RetainedDraftState } from "./draft-preview-state.js";
import { type NativeResultBitmap } from "./result-bitmap-editor.js";
import { type BitmapRegionSelection, type BitmapSelectionKind, type BitmapSelectionResolution } from "./bitmap-editor-selection.js";

export const BUILTIN_WORKSPACE_PROFILE_PREFIX = "builtin:";
export const STARTUP_WORKSPACE_LAYOUTS: readonly WorkspaceLayoutId[] = [
  "conversion", "palette", "dithering", "tilemap", "editor", "inspection",
];

export function normalizeStartupWorkspaceLayout(value: WorkspaceLayoutId): WorkspaceLayoutId {
  return STARTUP_WORKSPACE_LAYOUTS.includes(value) ? value : "conversion";
}

export type ConversionState =
  | { readonly kind: "idle" }
  | { readonly kind: "running" }
  | { readonly kind: "ready"; readonly result: WorkerConversionResult }
  | { readonly kind: "stale" }
  | { readonly kind: "error"; readonly message: string };

export type DraftState = RetainedDraftState<WorkerConversionResult>;

export type BitmapEditorTarget = "source" | "result";
export type BitmapEditorClipboard = {
  readonly width: number;
  readonly height: number;
  readonly paletteIndices: Uint8Array;
  readonly rgba: Uint8Array;
  readonly mask: Uint8Array;
  readonly sourceX: number;
  readonly sourceY: number;
  readonly sourceAttributeX: number;
  readonly sourceAttributeY: number;
  readonly gridWidth: number;
  readonly gridHeight: number;
  readonly resolution: BitmapSelectionResolution;
  readonly attributes: Uint8Array | null;
  readonly attributeMask: Uint8Array | null;
  readonly attributeWidth: number;
  readonly attributeHeight: number;
  readonly eraseSelection?: BitmapRegionSelection;
};
export type BitmapSelectionResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
export type BitmapEditorSelectionPointer =
  | { readonly action: "draw"; readonly side: PreviewSide; readonly pointerId: number; readonly kind: BitmapSelectionKind; points: Array<{ readonly x: number; readonly y: number }> }
  | { readonly action: "move"; readonly side: PreviewSide; readonly pointerId: number; readonly selection: BitmapRegionSelection; readonly start: { readonly x: number; readonly y: number }; moved: boolean }
  | { readonly action: "resize"; readonly side: PreviewSide; readonly pointerId: number; readonly selection: BitmapRegionSelection; readonly handle: BitmapSelectionResizeHandle; moved: boolean };

export interface BitmapEditorResultHistoryEntry {
  readonly result: WorkerConversionResult;
  readonly bitmap: NativeResultBitmap;
  readonly frameIndex: number;
}

export type CharsetState =
  | { readonly kind: "idle" }
  | { readonly kind: "running" }
  | { readonly kind: "ready"; readonly result: WorkerCharsetResult }
  | { readonly kind: "error"; readonly message: string };

export type UnifiedTileEditorContext = "map-cell" | "stamp";
export type CharsetTilesView = "source" | "output";

export interface TileStampDraft {
  readonly characterIndex: number | null;
  readonly transform: TileTransform;
  readonly inverted: boolean;
  readonly attribute: number;
}

export interface SourceArtifactInfo {
  readonly sha256: string;
  readonly baseName: string;
  readonly bytes: Uint8Array;
}

export type ResultOrigin = "direct-import" | "converted";

export type PreviewSide = "source" | "result";
export type PreviewZoom = "fit" | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;
export type PreviewContent = "image" | "source-image" | "result-image" | "bitmap-editor" | "pre-attribute" | "screen-1" | "screen-2" | "merged-low" | "merged-high" | "palette-usage" | "tile-usage" | "unified-editor" | "inspector" | "difference";
export type SettingsSection = "all" | "geometry" | "adjustments" | "palette" | "dithering" | "tilemap";
export type WorkbenchFocusTarget = SettingsSection | "settings" | "tools" | "source" | "result";
export type WorkbenchFloatingSection = "tools" | "geometry" | "adjustments" | "palette" | "paint-colors" | "dithering" | "tilemap" | "source" | "result";
export type WorkbenchTileDrop = {
  readonly dock: WorkbenchWindowDock;
  readonly target: ActiveWorkbenchWindowId | null;
  readonly position: WorkbenchTileDropPosition;
  readonly destination: "expanded" | "minimized";
};
export type WorkbenchTileDrag = {
  readonly window: ActiveWorkbenchWindowId;
  readonly startPointerX: number;
  readonly startPointerY: number;
  readonly moved: boolean;
  readonly drop: WorkbenchTileDrop | null;
};
