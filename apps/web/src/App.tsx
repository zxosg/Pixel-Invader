import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type CSSProperties,
  type UIEvent as ReactUIEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import { createPortal } from "react-dom";
import { NavLink, SegmentedControl, Tooltip } from "@mantine/core";

const BITMAP_EDITOR_SEGMENTED_CLASSES = {
  control: "bitmap-editor-segment-control",
  label: "bitmap-editor-segment-label",
  indicator: "bitmap-editor-segment-indicator",
} as const;
import {
  assertValidSoftwareScr,
  ZX_BITMAP_BYTES,
  zxBitmapOffset,
  zxSoftwareScrBytes,
} from "@retro-converter/zx-spectrum";
import { encodeRgbaPng, inspectGif, MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS, sniffImageFormat } from "@retro-converter/image-codecs";
import { addGifBorder, encodeAnimatedGif } from "./animated-gif.js";
import { scaleRgbaNearest } from "./export-image.js";
import { assertValidQlScreen, type QlMode } from "@retro-converter/sinclair-ql";
import {
  PMD85_SCREEN_HEIGHT,
  PMD85_SCREEN_WIDTH,
  assertValidPmd85Screen,
  extractPmd85GapBytes,
  type Pmd85ModeId,
  type Pmd85RgbColor,
} from "@retro-converter/pmd-85";
import {
  APPLICATION_BUILD_ID,
  APPLICATION_RELEASE_DATE,
  APPLICATION_VERSION,
  buildConversionMetadata,
  canonicalJsonStringify,
  effectiveScreenFlickerSuppression,
  sanitizeArtifactBaseName,
  sha256Hex,
} from "./artifacts.js";
import {
  createCompletedProject,
  normalizeProjectName,
  validateCompletedProject,
  type WorkspaceConversionMode,
} from "./projects.js";
import {
  BUILT_IN_PROFILE,
  BUILT_IN_PROFILES,
  BUILT_IN_PROFILE_ID,
  QL_PROFILE_ID,
  loadStoredProfiles,
  parseImportedProfile,
  profileModeScreens,
  saveStoredProfiles,
  type ConversionProfile,
} from "./profiles.js";
import {
  ZX_BASE_COLORS,
  buildInspectionReport,
  inspectSoftwareScr,
  mapSynchronizedScroll,
  summarizePaletteUsage,
  type InspectedAttribute,
} from "./inspection.js";
import { retargetHardwareModeSettings } from "./hardware-mode-settings.js";
import { canonicalizeSettingsForSave } from "./settings-save.js";
import { composerMixOptions } from "./dithering-ui.js";
import { decodeZxScrSource } from "./zx-scr-import.js";
import { buildSpecsciiCharset, exportSpecscii, importSpecscii } from "./specscii.js";
import {
  ConversionWorkerClient,
  type WorkerCharsetResult,
  type WorkerConversionResult,
  type WorkerDecodedImage,
  type WorkerPmd85Import,
} from "./worker/client.js";
import type {
  CharsetConversionOptions,
  CharsetDistanceMetric,
  CharsetEncoding,
  CharsetSource,
  DerivedCharsetStrategy,
  TileTransform,
} from "@retro-converter/zx-charset";
import {
  applyTileEdit,
  CHARSET_ARTIFACT_HEADER_BYTES,
  encodeCharsetArtifact,
  encodeLegacyCharsetArtifact,
  charsetViewerType,
  decodeCharsetArtifact,
  renderCharsetPreview,
  replaceTileInCharset,
  appendBlankTile,
  type TileEditOperation,
  transformTile,
} from "@retro-converter/zx-charset";
import {
  tileTransformLabel,
  tileTransformToggleState,
  stampTilemapCells,
  swapTilemapInkPaper,
  toggleTileTransform,
  type TilemapEditorSnapshot,
  type TilemapStamp,
  type TileTransformToggle,
} from "./tilemap-editor.js";
import {
  applyZxAttributeSelection,
  applyZxAttributeCellMaskOperation,
  cloneZxAttributeCell,
  readZxAttributeCell,
  transformZxAttributeCell,
  type ZxAttributeCellSnapshot,
  type ZxAttributeSelection,
} from "./bitmap-attribute-cell-editor.js";
import {
  allCharsetIndices,
  effectiveCharsetSelection,
  invertCharsetSelection as invertSelection,
  mapSourceTileToOutputIndex,
  toggleCharsetSelection,
} from "./charset-selection.js";
import {
  ATTRIBUTE_OPTIMIZERS,
  atkinsonDiffusionKernel,
  buildVerticalSpatialAnalyticPreview,
  checkerPhaseV43DiffusionKernel,
  checkerPhaseV5DiffusionKernel,
  DEFAULT_CONVERSION_SETTINGS,
  decorrelatedDiffusionKernel,
  DITHER_ENGINES,
  defineCustomDiffusionKernel,
  defineCustomOrderedMatrix,
  ORDERED_MATRICES,
  ditherEngineSelectionGroupForTarget,
  ditherMethodForEngine,
  isCompatibleEnginePair,
  isDitherEngineAvailableForSelection,
  latestDitherEngineForMethod,
  fillGeometryForDimensions,
  outputScreenCount,
  destinationGeometryFor,
  orderedPerturbationDiagnostics,
  paletteSelectionsMatch,
  phaseBalancedDiffusionKernel,
  qlHardwareModesForTarget,
  resolveZxPalette,
  renderZxFlashPreview,
  type AttributeOptimizerId,
  type AttributeHaloRadius,
  type AttributeHeight,
  type BrightMode,
  type ConversionSettings,
  type CustomDiffusionKernelDefinition,
  type CustomOrderedMatrixDefinition,
  type CropAspectRatio,
  type DitheringMethod,
  type DitherEngineId,
  type FramingMode,
  type OrderedMatrixId,
  type OrderedMatrix,
  type PaletteSelection,
  type PanEdgeMode,
  type Pmd85TargetModeId,
  type QlMixedOptimizerId,
  type QlTargetModeId,
  type ResamplingMethod,
  type Rotation,
  type RgbColor,
  type StructuredConversionSettings,
  type TargetModeId,
  type ZxPaletteDefinition,
} from "@retro-converter/conversion-core";

import { renderAttributeFrameRgba } from "@retro-converter/conversion-core";

function pmdHardwareModeForTarget(mode: Pmd85TargetModeId): Pmd85ModeId {
  if (mode === "pmd85-2-rgb-vertical-spatial") return "pmd85-2-rgb";
  if (mode === "pmd85-3-rgb-vertical-spatial") return "pmd85-3-rgb";
  if (mode === "pmd85-3-pal-vertical-spatial") return "pmd85-3-pal";
  return mode;
}

function targetProducesMultipleFrames(
  platformId: ConversionSettings["platformId"],
  modeId: TargetModeId,
): boolean {
  return modeId.includes("vertical-spatial") ||
    modeId === "zx48-mixed-256x192" ||
    (platformId === "sinclair-ql" && (
      modeId === "mode8-256x256" ||
      modeId === "mode4-512x256" ||
      modeId === "mode8-mode4-mixed-512x256"
    ));
}

function verticalSpatialDitherEngine(method: DitheringMethod): DitherEngineId {
  return method === "ordered"
    ? "vertical-spatial-ordered-v1"
    : method === "error-diffusion"
      ? "vertical-spatial-error-diffusion-v1"
      : "vertical-spatial-none-v1";
}

function unpackZxBitmap(encoded: Uint8Array): Uint8Array {
  const pixels = new Uint8Array(256 * 192);
  for (let y = 0; y < 192; y += 1) {
    for (let xByte = 0; xByte < 32; xByte += 1) {
      const packed = encoded[zxBitmapOffset(xByte, y)] ?? 0;
      for (let bit = 0; bit < 8; bit += 1) {
        pixels[y * 256 + xByte * 8 + bit] = (packed & (0x80 >> bit)) === 0 ? 0 : 1;
      }
    }
  }
  return pixels;
}
import {
  clampPixelCrop,
  cropResizeHandleAtPoint,
  moveCropFromDrag,
  orientedSourceSize,
  pointIsInsideCrop,
  resizeCropFromDrag,
  resizeCropToAspect,
  selectionFromDrag,
  type CropResizeHandle,
  type PixelPoint,
} from "./crop.js";
import {
  assertExperimentalBenchmarkCoverage,
  benchmarkExportCsv,
  benchmarkExportJson,
  benchmarkCacheKey,
  classifyBenchmarkRows,
  diffusionTextureMetrics,
  qlMixedOptimizersForBenchmark,
  type BenchmarkClassification,
  type BenchmarkExportDocument,
  type TextureBenchmarkMetrics,
} from "./benchmark.js";
import { distinctPreviewColors } from "./palette-display.js";
import { BUILT_IN_WORKSPACE_LAYOUTS, WorkbenchMenuBar } from "./workbench-menu-bar.js";
import { ZxPaletteEditorDialog } from "./zx-palette-editor-dialog.js";
import { AboutDialog } from "./about-dialog.js";
import {
  isAttributeOptimizerAvailableForTarget,
  loadEnginePreferences,
  resolveEnginePreferencesForTarget,
  saveEnginePreferences,
} from "./engine-preferences.js";
import {
  DEFAULT_WORKSPACE_PREFERENCES,
  saveWorkspacePreferences,
  type WorkspaceLayoutId,
} from "./workspace-preferences.js";
import {
  DEFAULT_WORKBENCH_PREFERENCES,
  loadWorkbenchPreferences,
  moveWorkbenchWindowDock,
  saveWorkbenchPreferences,
  reorderWorkbenchWindowOrder,
  type WorkbenchDock,
  type ActiveWorkbenchWindowId,
  type WorkbenchSettingsSection,
  type WorkbenchTileDropPosition,
  type WorkbenchWindowId,
  type WorkbenchWindowDock,
  type WorkbenchWindowLayout,
  type WorkbenchWindowLayouts,
} from "./workbench-preferences.js";
import {
  createSavedWorkbenchLayoutId,
  loadActiveWorkspaceProfileId,
  loadHiddenBuiltinWorkspaceProfiles,
  loadSavedWorkbenchLayouts,
  normalizeSavedLayoutName,
  saveActiveWorkspaceProfileId,
  saveHiddenBuiltinWorkspaceProfiles,
  saveSavedWorkbenchLayouts,
  type SavedWorkbenchLayout,
} from "./saved-workbench-layouts.js";
import {
  DEFAULT_APPLICATION_SETTINGS,
  loadApplicationSettings,
  resolveApplicationSettings,
  saveApplicationSettings,
  type ApplicationSettings,
} from "./application-settings.js";
import {
  uiTypographyCssVariables,
  uiTypographyFromRecord,
  type UiTypographySettings,
} from "./ui-typography.js";
import {
  SETTING_CATEGORIES,
  SETTING_FILTER_PRESETS,
  SETTINGS_REGISTRY,
  resetSettingsCategory,
  createSettingsDraft,
  filterSettings,
  validateSettingsDraft,
  type SettingCategory,
  type SettingDefinition,
  type SettingPresetId,
} from "./settings-registry.js";
import {
  mergeMonochromeRgba,
  mergeTemporalRgba,
  zxBitmapToMonochromeRgba,
} from "./monochrome-preview.js";
import {
  applyBitmapCellEdit,
  type BitmapCell,
  type BitmapCellEditOperation,
} from "./bitmap-editor.js";
import {
  cloneBitmapBuffer,
  paintPixels,
  type BitmapEditorBuffer,
  type BitmapPixelColor,
} from "./full-bitmap-editor.js";
import {
  bitmapEditorBrushPixels,
  bitmapEditorCellModeLabel,
  bitmapEditorOperationDescription,
  bitmapEditorOperationLabel,
  nextBitmapEditorBrushSize,
  nextBitmapEditorCellMode,
  type BitmapEditorBrushSize,
  type BitmapEditorCellMode,
  type BitmapEditorOperation,
  type BitmapEditorScope,
} from "./bitmap-editor-tools.js";
import { fitPreviewToViewport, resolvePreviewAspect, type PreviewFitSize } from "./preview-aspect.js";
import { frameFallbackSourcePreview } from "./source-preview.js";
import {
  renderQlMixedDisplayPreview,
  type QlMixedDisplayResolution,
} from "./ql-mixed-preview.js";
import {
  draftPreviewResult,
  type RetainedDraftState,
} from "./draft-preview-state.js";
import {
  defaultOutputPreviewStage,
  verticalSpatialPreviewForStage,
} from "./vertical-spatial-preview.js";
import {
  applyNativeResultPixels,
  applyNativePaletteIndexOperation,
  cloneNativeResultBitmap,
  composeNativeResultRegion,
  createNativeResultBitmap,
  nativePaletteForResult,
  type NativeResultBitmap,
  type NativeResultFrameInput,
} from "./result-bitmap-editor.js";
import {
  bitmapEditorStippleFootprint,
  bitmapSelectionOutlinePath,
  makeBitmapRegionSelection,
  shiftBitmapRegionPixels,
  transformBitmapRegionData,
  transformBitmapRegionSelection,
  type BitmapSelectionTransform,
  type BitmapRegionSelection,
  type BitmapSelectionKind,
  type BitmapSelectionResolution,
} from "./bitmap-editor-selection.js";
import { BitmapEditorStipplePicker } from "./bitmap-editor-stipple-picker.js";

const BUILTIN_WORKSPACE_PROFILE_PREFIX = "builtin:";
const STARTUP_WORKSPACE_LAYOUTS: readonly WorkspaceLayoutId[] = [
  "conversion", "palette", "dithering", "tilemap", "editor", "inspection",
];

function normalizeStartupWorkspaceLayout(value: WorkspaceLayoutId): WorkspaceLayoutId {
  return STARTUP_WORKSPACE_LAYOUTS.includes(value) ? value : "conversion";
}

type ConversionState =
  | { readonly kind: "idle" }
  | { readonly kind: "running" }
  | { readonly kind: "ready"; readonly result: WorkerConversionResult }
  | { readonly kind: "stale" }
  | { readonly kind: "error"; readonly message: string };

type DraftState = RetainedDraftState<WorkerConversionResult>;

type BitmapEditorTarget = "source" | "result";
type BitmapEditorClipboard = {
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
type BitmapSelectionResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
type BitmapEditorSelectionPointer =
  | { readonly action: "draw"; readonly side: PreviewSide; readonly pointerId: number; readonly kind: BitmapSelectionKind; points: Array<{ readonly x: number; readonly y: number }> }
  | { readonly action: "move"; readonly side: PreviewSide; readonly pointerId: number; readonly selection: BitmapRegionSelection; readonly start: { readonly x: number; readonly y: number }; moved: boolean }
  | { readonly action: "resize"; readonly side: PreviewSide; readonly pointerId: number; readonly selection: BitmapRegionSelection; readonly handle: BitmapSelectionResizeHandle; moved: boolean };

interface BitmapEditorResultHistoryEntry {
  readonly result: WorkerConversionResult;
  readonly bitmap: NativeResultBitmap;
  readonly frameIndex: number;
}

type CharsetState =
  | { readonly kind: "idle" }
  | { readonly kind: "running" }
  | { readonly kind: "ready"; readonly result: WorkerCharsetResult }
  | { readonly kind: "error"; readonly message: string };

type UnifiedTileEditorContext = "map-cell" | "stamp";
type CharsetTilesView = "source" | "output";

interface TileStampDraft {
  readonly characterIndex: number | null;
  readonly transform: TileTransform;
  readonly inverted: boolean;
  readonly attribute: number;
}

interface SourceArtifactInfo {
  readonly sha256: string;
  readonly baseName: string;
  readonly bytes: Uint8Array;
}

type ResultOrigin = "direct-import" | "converted";

type PreviewSide = "source" | "result";
type PreviewZoom = "fit" | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16;
type PreviewContent = "image" | "source-image" | "result-image" | "bitmap-editor" | "pre-attribute" | "screen-1" | "screen-2" | "merged-low" | "merged-high" | "palette-usage" | "tile-usage" | "unified-editor" | "inspector" | "difference";
type SettingsSection = "all" | "geometry" | "adjustments" | "palette" | "dithering" | "tilemap";
type WorkbenchFocusTarget = SettingsSection | "settings" | "tools" | "source" | "result";
type WorkbenchFloatingSection = "tools" | "geometry" | "adjustments" | "palette" | "dithering" | "tilemap" | "source" | "result";
type WorkbenchTileDrop = {
  readonly dock: WorkbenchWindowDock;
  readonly target: ActiveWorkbenchWindowId | null;
  readonly position: WorkbenchTileDropPosition;
  readonly destination: "expanded" | "minimized";
};
type WorkbenchTileDrag = {
  readonly window: ActiveWorkbenchWindowId;
  readonly startPointerX: number;
  readonly startPointerY: number;
  readonly moved: boolean;
  readonly drop: WorkbenchTileDrop | null;
};

function gridPathForDimensions(
  width: number,
  height: number,
  stepX: number,
  stepY: number,
): string {
  const segments: string[] = [];
  for (let x = stepX; x < width; x += stepX) segments.push(`M${x} 0V${height}`);
  for (let y = stepY; y < height; y += stepY) segments.push(`M0 ${y}H${width}`);
  return segments.join(" ");
}

function bitmapEditorLinePoints(
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
): readonly { readonly x: number; readonly y: number }[] {
  const points: Array<{ readonly x: number; readonly y: number }> = [];
  let x = start.x;
  let y = start.y;
  const dx = Math.abs(end.x - start.x);
  const sx = start.x < end.x ? 1 : -1;
  const dy = -Math.abs(end.y - start.y);
  const sy = start.y < end.y ? 1 : -1;
  let error = dx + dy;
  while (x !== end.x || y !== end.y) {
    const doubled = error * 2;
    if (doubled >= dy) { error += dy; x += sx; }
    if (doubled <= dx) { error += dx; y += sy; }
    points.push({ x, y });
  }
  return points;
}
const ORDERED_MATRIX_IDS: readonly OrderedMatrixId[] = [
  "checkerboard-2x1",
  "bayer-2x2",
  "bayer-4x4",
  "bayer-8x8",
  "clustered-dot-4x4",
  "clustered-dot-8x8",
  "void-cluster-8x8",
];

function orderedMatrixLabel(matrixId: OrderedMatrixId): string {
  switch (matrixId) {
    case "checkerboard-2x1": return "2×1 Checkerboard";
    case "bayer-2x2": return "2×2";
    case "bayer-4x4": return "4×4";
    case "bayer-8x8": return "8×8";
    case "clustered-dot-4x4": return "Clustered dot 4×4";
    case "clustered-dot-8x8": return "Clustered dot 8×8";
    case "void-cluster-8x8": return "Void-and-cluster 8×8";
  }
}

const BUILT_IN_COMPOSER_PROPAGATION_IDS = [
  "none",
  "error-diffusion-unrestricted-v2",
  "error-diffusion-phase-balanced-v3",
  "error-diffusion-checker-phase-v4-3",
  "error-diffusion-checker-phase-v5",
  "error-diffusion-decorrelated-v3",
  "error-diffusion-atkinson-v1",
] as const;

function composerPropagationLabel(id: ConversionSettings["composer"]["propagationId"]): string {
  switch (id) {
    case "none": return "Pattern only";
    case "error-diffusion-unrestricted-v2": return "Projected unrestricted v2";
    case "error-diffusion-phase-balanced-v3": return "Phase balanced v3";
    case "error-diffusion-checker-phase-v4-3": return "Checker phase v4.3";
    case "error-diffusion-checker-phase-v5": return "Checker phase v5";
    case "error-diffusion-decorrelated-v3": return "Decorrelated v3";
    case "error-diffusion-atkinson-v1": return "Atkinson v1";
    default: return id;
  }
}

function parseMatrixValues(text: string): number[] {
  return text
    .split(/[^0-9-]+/)
    .filter((token) => token.length > 0)
    .map((token) => Number.parseInt(token, 10));
}

function formatMatrixValues(values: readonly number[]): string {
  return values.join(" ");
}

function parseKernelEntries(text: string): readonly (readonly [number, number, number])[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [dx, dy, weight] = line.split(/[^0-9.-]+/).filter((token) => token.length > 0).map(Number);
      return [dx ?? Number.NaN, dy ?? Number.NaN, weight ?? Number.NaN] as const;
    });
}

function formatKernelEntries(
  entries: readonly (readonly [number, number, number])[],
): string {
  return entries.map(([dx, dy, weight]) => `${dx} ${dy} ${weight}`).join("\n");
}

function hexToRgb(hex: string): Pmd85RgbColor {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function rgbToHex(color: RgbColor): string {
  return `#${[color.r, color.g, color.b]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0"))
    .join("")}`;
}

function commonPreviewError(source: Uint8Array, output: Uint8Array): number {
  let score = 0;
  for (let offset = 0; offset < source.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const difference =
        (source[offset + channel] ?? 0) - (output[offset + channel] ?? 0);
      score += difference * difference;
    }
  }
  return score;
}

function previewBufferDimensions(rgba: Uint8Array): readonly [number, number] {
  const pixelCount = rgba.length / 4;
  const width = pixelCount === 512 * 256
    ? 512
    : pixelCount === 288 * 256
      ? 288
      : 256;
  return [width, pixelCount / width];
}

function lowPass2PreviewError(source: Uint8Array, output: Uint8Array): number {
  let score = 0;
  const [width, height] = previewBufferDimensions(source);
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      for (let channel = 0; channel < 3; channel += 1) {
        let sourceSum = 0;
        let outputSum = 0;
        let samples = 0;
        for (let dy = 0; dy < 2 && y + dy < height; dy += 1) {
          for (let dx = 0; dx < 2 && x + dx < width; dx += 1) {
            const offset = ((y + dy) * width + x + dx) * 4 + channel;
            sourceSum += source[offset] ?? 0;
            outputSum += output[offset] ?? 0;
            samples += 1;
          }
        }
        const difference = sourceSum / samples - outputSum / samples;
        score += difference * difference;
      }
    }
  }
  return score;
}

function edgePreviewError(source: Uint8Array, output: Uint8Array): number {
  let score = 0;
  const [width, height] = previewBufferDimensions(source);
  const compare = (first: number, second: number) => {
    for (let channel = 0; channel < 3; channel += 1) {
      const sourceDelta =
        (source[first + channel] ?? 0) - (source[second + channel] ?? 0);
      const outputDelta =
        (output[first + channel] ?? 0) - (output[second + channel] ?? 0);
      score += (sourceDelta - outputDelta) ** 2;
    }
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (x + 1 < width) compare(offset, offset + 4);
      if (y + 1 < height) compare(offset, offset + width * 4);
    }
  }
  return score;
}

function attributeBoundaryPreviewError(
  source: Uint8Array,
  output: Uint8Array,
  attributeHeight: AttributeHeight,
): number {
  const width = 256;
  const height = source.length / 4 / width;
  let score = 0;
  const compare = (first: number, second: number) => {
    for (let channel = 0; channel < 3; channel += 1) {
      const sourceDelta =
        (source[first + channel] ?? 0) - (source[second + channel] ?? 0);
      const outputDelta =
        (output[first + channel] ?? 0) - (output[second + channel] ?? 0);
      score += (sourceDelta - outputDelta) ** 2;
    }
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 8; x < width; x += 8) {
      compare((y * width + x - 1) * 4, (y * width + x) * 4);
    }
  }
  for (let y = attributeHeight; y < height; y += attributeHeight) {
    for (let x = 0; x < width; x += 1) {
      compare(((y - 1) * width + x) * 4, (y * width + x) * 4);
    }
  }
  return score;
}

async function conversionOutputDigest(
  result: WorkerConversionResult,
): Promise<string> {
  const length = result.frames.reduce(
    (total, frame) => total + frame.encoded.length + frame.previewRgba.length,
    result.mergedPreviewRgba.length,
  ) + (result.verticalSpatialDiagnostics?.analyticPreviewRgba.length ?? 0);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const frame of result.frames) {
    bytes.set(frame.encoded, offset);
    offset += frame.encoded.length;
    bytes.set(frame.previewRgba, offset);
    offset += frame.previewRgba.length;
  }
  bytes.set(result.mergedPreviewRgba, offset);
  offset += result.mergedPreviewRgba.length;
  if (result.verticalSpatialDiagnostics !== undefined) {
    bytes.set(result.verticalSpatialDiagnostics.analyticPreviewRgba, offset);
  }
  return sha256Hex(bytes);
}

function rgbaPngDataUrl(rgba: Uint8Array, width: number, height: number): string {
  const png = encodeRgbaPng(rgba, width, height);
  let binary = "";
  for (let offset = 0; offset < png.length; offset += 0x8000) {
    binary += String.fromCharCode(...png.subarray(offset, offset + 0x8000));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

function resultContainsZxFlash(result: WorkerConversionResult | null): boolean {
  return result?.platformId === "zx-spectrum" && result.attributeHeight !== null &&
    result.frames.some((frame) => zxScreenContainsFlash(frame.encoded));
}

function zxScreenContainsFlash(encoded: Uint8Array): boolean {
  return encoded.subarray(ZX_BITMAP_BYTES).some((attribute) => (attribute & 0x80) !== 0);
}

function previewDifferenceHeatmap(
  first: Uint8Array,
  second: Uint8Array,
): Uint8Array {
  const output = new Uint8Array(first.length);
  for (let offset = 0; offset < output.length; offset += 4) {
    output[offset] = Math.min(255, Math.abs((second[offset] ?? 0) - (first[offset] ?? 0)) * 4);
    output[offset + 1] = Math.min(255, Math.abs((second[offset + 1] ?? 0) - (first[offset + 1] ?? 0)) * 4);
    output[offset + 2] = Math.min(255, Math.abs((second[offset + 2] ?? 0) - (first[offset + 2] ?? 0)) * 4);
    output[offset + 3] = 255;
  }
  return output;
}

function previewPixelChangePercent(first: Uint8Array, second: Uint8Array): number {
  let changed = 0;
  const pixels = Math.min(first.length, second.length) / 4;
  for (let offset = 0; offset < pixels * 4; offset += 4) {
    if (
      first[offset] !== second[offset] ||
      first[offset + 1] !== second[offset + 1] ||
      first[offset + 2] !== second[offset + 2]
    ) changed += 1;
  }
  return pixels === 0 ? 0 : changed / pixels * 100;
}

interface ConversionBenchmarkAlias {
  readonly optimizerId: AttributeOptimizerId;
  readonly qlMixedOptimizerId: QlMixedOptimizerId;
  readonly ditherEngineId: DitherEngineId;
  readonly matrix: OrderedMatrixId;
}

interface ConversionBenchmarkRow extends ConversionBenchmarkAlias {
  readonly matrixEffective: boolean;
  readonly score: number;
  readonly lowPassScore: number;
  readonly edgeScore: number;
  readonly textureMetrics: TextureBenchmarkMetrics;
  readonly platformScore: number;
  readonly attributeBoundaryScore: number | null;
  readonly orderedPerturbationRms: number | null;
  readonly outputPixelChangePercent?: number;
  readonly elapsedMs: number;
  readonly digest: string;
  readonly aliases: readonly ConversionBenchmarkAlias[];
  readonly classification: BenchmarkClassification;
  readonly result: WorkerConversionResult;
}

function glyphDataUrl(
  bytes: Uint8Array,
  characterIndex: number,
  active = true,
  zeroUse = false,
): string {
  const rows = bytes.subarray(characterIndex * 8, characterIndex * 8 + 8);
  const pixels: string[] = [];
  for (let y = 0; y < 8; y += 1) {
    const row = rows[y] ?? 0;
    for (let x = 0; x < 8; x += 1) {
      if ((row & (0x80 >> x)) !== 0) {
        pixels.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
      }
    }
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 8 8">` +
    `<rect width="8" height="8" fill="#000"/><g fill="${zeroUse ? "#7f8998" : active ? "#fff" : "#174a7e"}">${pixels.join("")}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

interface SpecsciiFontAssets {
  readonly romFont: Uint8Array;
  readonly udgFont: Uint8Array;
  readonly charset: Uint8Array;
}

const BUILT_IN_SPECSCII_CHARSET_NAME = "SpecSCII built-in font · 112 glyphs";
let specsciiFontAssetsRequest: Promise<SpecsciiFontAssets> | null = null;

function loadSpecsciiFontAssets(): Promise<SpecsciiFontAssets> {
  if (specsciiFontAssetsRequest !== null) return specsciiFontAssetsRequest;
  const request = (async (): Promise<SpecsciiFontAssets> => {
    const [romResponse, udgResponse] = await Promise.all([
      fetch(`${import.meta.env.BASE_URL}specscii-rom-font.bin`),
      fetch(`${import.meta.env.BASE_URL}specscii-udg-font.bin`),
    ]);
    if (!romResponse.ok || !udgResponse.ok) {
      throw new Error("Specscii character font assets are unavailable.");
    }
    const [romFont, udgFont] = await Promise.all([
      romResponse.arrayBuffer(),
      udgResponse.arrayBuffer(),
    ]).then(([rom, udg]) => [new Uint8Array(rom), new Uint8Array(udg)] as const);
    return { romFont, udgFont, charset: buildSpecsciiCharset(romFont, udgFont) };
  })();
  specsciiFontAssetsRequest = request;
  void request.catch(() => {
    if (specsciiFontAssetsRequest === request) specsciiFontAssetsRequest = null;
  });
  return request;
}

function rebuildCharsetResult(
  result: WorkerCharsetResult,
  charset: Uint8Array,
  assignments = result.assignments,
  encoding = result.encoding,
  attributes = result.attributes,
): WorkerCharsetResult {
  const characterIndices = Uint8Array.from(
    assignments,
    (assignment) => assignment.characterIndex,
  );
  const transforms = Uint8Array.from(
    assignments,
    (assignment) => assignment.transform,
  );
  const artifact = encodeCharsetArtifact({
    encoding,
    characterCount: charset.length / 8,
    transformations: result.transformations,
    characterIndices,
    attributes,
    transforms,
    charset,
  });
  const decoded = decodeCharsetArtifact(artifact.bytes, {
    encoding,
    characterCount: charset.length / 8,
    transformations: result.transformations,
  });
  return {
    ...result,
    encoding,
    characterCount: charset.length / 8,
    artifact: artifact.bytes,
    decodedScr: decoded.scr,
    previewRgba: renderCharsetPreview(decoded.screen),
    charset: artifact.charset,
    attributes: artifact.attributes,
    assignments,
    diagnostics: {
      ...result.diagnostics,
      edited: true,
      usedCharacterCount: new Set(characterIndices).size,
      memory: {
        headerBytes: CHARSET_ARTIFACT_HEADER_BYTES,
        tilemapBytes: artifact.tilemap.length,
        attributeBytes: artifact.attributes.length,
        transformBytes: artifact.transforms.length,
        charsetBytes: artifact.charset.length,
        totalBytes: artifact.bytes.length,
      },
    },
  };
}

function clampCharsetRange(
  availableCount: number,
  startIndex: number,
  length: number,
): { readonly startIndex: number; readonly length: number } {
  if (availableCount < 1) return { startIndex: 0, length: 0 };
  const clampedStart = Math.max(
    0,
    Math.min(Math.trunc(startIndex), availableCount - 1),
  );
  return {
    startIndex: clampedStart,
    length: Math.max(
      1,
      Math.min(Math.trunc(length), availableCount - clampedStart),
    ),
  };
}

function structuredSettingsForOptimizer(
  id: AttributeOptimizerId,
  current: StructuredConversionSettings,
): StructuredConversionSettings {
  const isVersion4 = id === "zx-structured-global-v4";
  const isVersion3 = id === "zx-structured-global-v3";
  const isVersion2 = id === "zx-structured-global-v2";
  if (
    id !== "zx-structured-global-v1" &&
    !isVersion2 &&
    !isVersion3 &&
    !isVersion4
  ) return current;
  return {
    ...current,
    ditherResponseCurveId: isVersion2 || isVersion3 || isVersion4
      ? "power-035-percent-v2"
      : "power-065-percent-v1",
    colorAnchorModelId: isVersion3 || isVersion4
      ? "srgb-squared-v1"
      : "none-v1",
    structuralModelId: isVersion4 ? "palette-topology-v1" : "none-v1",
    objectiveWeights: isVersion4
      ? {
          ...current.objectiveWeights,
          pixel: 192,
          rgbAnchor: 2048,
          patternReference: 1536,
          paletteDistribution: 1024,
          luminanceRank: 512,
          edgePolarity: 768,
          mean: 768,
          sharedEndpoint: 0,
        }
      : isVersion2 || isVersion3
        ? {
            ...current.objectiveWeights,
            pixel: 192,
            rgbAnchor: isVersion3 ? 6144 : 0,
            patternReference: 0,
            paletteDistribution: 0,
            luminanceRank: 0,
            edgePolarity: 0,
            mean: 2048,
          }
        : {
            ...current.objectiveWeights,
            pixel: 1024,
            rgbAnchor: 0,
            patternReference: 0,
            paletteDistribution: 0,
            luminanceRank: 0,
            edgePolarity: 0,
            mean: 256,
          },
    candidateParameters: {
      ...current.candidateParameters,
      localAdmissibilityPermille: isVersion4 ? 100 : 1000,
      boundaryCapPermille: isVersion4 ? 100 : 1000,
    },
  };
}

function drawOrientedCropSource(
  context: CanvasRenderingContext2D,
  image: WorkerDecodedImage,
  rotation: Rotation,
  mirrorHorizontal: boolean,
  mirrorVertical: boolean,
): void {
  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = image.width;
  sourceCanvas.height = image.height;
  const sourceContext = sourceCanvas.getContext("2d");
  if (sourceContext === null) return;
  const pixels = new Uint8ClampedArray(Uint8Array.from(image.rgba).buffer);
  sourceContext.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);

  const oriented = orientedSourceSize(image.width, image.height, rotation);
  const rotatedCanvas = document.createElement("canvas");
  rotatedCanvas.width = oriented.width;
  rotatedCanvas.height = oriented.height;
  const rotatedContext = rotatedCanvas.getContext("2d");
  if (rotatedContext === null) return;
  if (rotation === 90) {
    rotatedContext.translate(oriented.width, 0);
    rotatedContext.rotate(Math.PI / 2);
  } else if (rotation === 180) {
    rotatedContext.translate(oriented.width, oriented.height);
    rotatedContext.rotate(Math.PI);
  } else if (rotation === 270) {
    rotatedContext.translate(0, oriented.height);
    rotatedContext.rotate(-Math.PI / 2);
  }
  rotatedContext.drawImage(sourceCanvas, 0, 0);

  context.save();
  context.translate(
    mirrorHorizontal ? oriented.width : 0,
    mirrorVertical ? oriented.height : 0,
  );
  context.scale(mirrorHorizontal ? -1 : 1, mirrorVertical ? -1 : 1);
  context.drawImage(rotatedCanvas, 0, 0);
  context.restore();
}

interface RangeNumberControlProps {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly unit?: string;
  readonly resetValue?: number;
  readonly disabled?: boolean;
  readonly onChange: (value: number) => void;
  readonly onValidityChange: (id: string, valid: boolean) => void;
}

function RangeNumberControl({
  id,
  label,
  value,
  min,
  max,
  unit = "",
  resetValue,
  disabled = false,
  onChange,
  onValidityChange,
}: RangeNumberControlProps) {
  const [entry, setEntry] = useState(String(value));
  const parsed = Number(entry);
  const valid = /^-?\d+$/.test(entry) && Number.isInteger(parsed) &&
    parsed >= min && parsed <= max;
  useEffect(() => setEntry(String(value)), [value]);
  useEffect(() => {
    onValidityChange(id, valid || disabled);
    return () => onValidityChange(id, true);
  }, [disabled, id, onValidityChange, valid]);
  const commit = () => {
    if (entry.trim() === "" || !Number.isFinite(parsed)) {
      setEntry(String(value));
      onValidityChange(id, true);
      return;
    }
    const next = Math.max(min, Math.min(max, Math.round(parsed)));
    setEntry(String(next));
    onChange(next);
    onValidityChange(id, true);
  };
  const inputs = (
    <>
      <span className="filter-inputs">
        <input
          aria-label={`${label} slider`}
          type="range"
          min={min}
          max={max}
          step="1"
          value={value}
          disabled={disabled}
          onInput={(event) => onChange(Number(event.currentTarget.value))}
        />
        <span className="range-number-entry">
          <input
            aria-label={`${label} value`}
            className={valid ? undefined : "invalid"}
            type="number"
            min={min}
            max={max}
            step="1"
            value={entry}
            disabled={disabled}
            aria-invalid={!valid}
            onChange={(event) => {
              const nextEntry = event.target.value;
              setEntry(nextEntry);
              const next = Number(nextEntry);
              if (
                /^-?\d+$/.test(nextEntry) &&
                Number.isInteger(next) &&
                next >= min &&
                next <= max
              ) onChange(next);
            }}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                commit();
                event.currentTarget.blur();
              }
            }}
          />
          {unit ? <span className="range-unit" aria-hidden="true">{unit}</span> : null}
        </span>
      </span>
      {valid || disabled ? null : (
        <span className="field-error">Invalid value</span>
      )}
    </>
  );
  if (resetValue === undefined) {
    return <label><span>{label}</span>{inputs}</label>;
  }
  return (
    <div className="range-number-control">
      <button
        className="range-number-label"
        type="button"
        disabled={disabled}
        title={`Reset ${label}`}
        aria-label={`Reset ${label} to ${resetValue}${unit}`}
        onClick={() => {
          setEntry(String(resetValue));
          onChange(resetValue);
          onValidityChange(id, true);
        }}
      >{label}</button>
      {inputs}
    </div>
  );
}

export function App() {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [invalidSliderIds, setInvalidSliderIds] =
    useState<ReadonlySet<string>>(() => new Set());
  const setSliderValidity = useCallback((id: string, valid: boolean) => {
    setInvalidSliderIds((current) => {
      const next = new Set(current);
      if (valid) next.delete(id);
      else next.add(id);
      if (next.size === current.size &&
          [...next].every((value) => current.has(value))) return current;
      return next;
    });
  }, []);
  const workerRef = useRef<ConversionWorkerClient | null>(null);
  const draftWorkerRef = useRef<ConversionWorkerClient | null>(null);
  const benchmarkWorkerRef = useRef<ConversionWorkerClient | null>(null);
  const charsetWorkerRef = useRef<ConversionWorkerClient | null>(null);
  const benchmarkRunRef = useRef(0);
  const benchmarkContextKeyRef = useRef("");
  const revisionRef = useRef(0);
  const finalJobRef = useRef(0);
  const finalRunningRef = useRef(false);
  const lastFinalRevisionRef = useRef(-1);
  const pendingOpenedFinalRef = useRef<{
    readonly result: WorkerConversionResult;
    readonly completedAtUtc: string;
  } | null>(null);
  const pendingOpenedResultEditedRef = useRef(false);
  const pendingOpenedResultQualityRef = useRef<"Draft" | "High">("High");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const convertedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceConvertedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bitmapEditorSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bitmapEditorResultCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bitmapEditorMergedFlashCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pendingModeHighRef = useRef<WorkspaceConversionMode | null>(null);
  const workspaceModeRef = useRef<WorkspaceConversionMode>("palette");
  const lastZxSettingsRef = useRef<ConversionSettings>(
    DEFAULT_CONVERSION_SETTINGS,
  );
  const sourceViewportRef = useRef<HTMLDivElement | null>(null);
  const resultViewportRef = useRef<HTMLDivElement | null>(null);
  const activePanSideRef = useRef<PreviewSide | null>(null);
  const panDragRef = useRef<{
    readonly side: PreviewSide;
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly scrollLeft: number;
    readonly scrollTop: number;
  } | null>(null);
  const cropDragRef = useRef<{
    readonly pointerId: number;
    readonly start: PixelPoint;
    readonly mode: "create" | "move" | CropResizeHandle;
    readonly originalCrop: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
  } | null>(null);
  const charsetSelectionDragRef = useRef<{
    readonly pointerId: number;
    readonly selecting: boolean;
    readonly visited: Set<number>;
    readonly characterIndex: number;
  } | null>(null);
  const charsetSelectionClickRef = useRef<Map<number, number>>(new Map());
  const charsetGlyphRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tileEditorPointerRef = useRef<{ pointerId: number; visited: Set<string> } | null>(null);
  const bitmapEditorPointerRef = useRef<{ pointerId: number; visited: Set<string> } | null>(null);
  const bitmapEditorFullBufferRef = useRef<BitmapEditorBuffer | null>(null);
  const bitmapEditorEncodedRef = useRef<Uint8Array | null>(null);
  const skipNextDraftAfterBitmapEditRef = useRef(false);
  const bitmapEditorFullPointerRef = useRef<{
    readonly side: PreviewSide;
    readonly pointerId: number;
    readonly visited: Set<string>;
    readonly pan: boolean;
    readonly nativeCells: boolean;
    readonly button: number;
    moved: boolean;
    historyCaptured: boolean;
    readonly startX: number;
    readonly startY: number;
    readonly scrollLeft: number;
    readonly scrollTop: number;
  } | null>(null);
  const bitmapEditorSelectionPointerRef = useRef<BitmapEditorSelectionPointer | null>(null);
  const bitmapEditorSpaceRef = useRef(false);
  const existingCharsetSelectionRef =
    useRef<readonly number[] | null>(null);
  const [state, setState] = useState<ConversionState>({ kind: "idle" });
  const [draftState, setDraftState] = useState<DraftState>({ kind: "idle" });
  const [lastFinal, setLastFinal] = useState<WorkerConversionResult | null>(null);
  const [charsetState, setCharsetState] = useState<CharsetState>({ kind: "idle" });
  const [tileEditorSelected, setTileEditorSelected] = useState(0);
  const [tileEditorOriginals, setTileEditorOriginals] = useState<readonly (Uint8Array | null)[]>([]);
  const [tileEditorUsageSort, setTileEditorUsageSort] = useState(false);
  const [tileEditorUndo, setTileEditorUndo] = useState<readonly TilemapEditorSnapshot[]>([]);
  const [tileEditorRedo, setTileEditorRedo] = useState<readonly TilemapEditorSnapshot[]>([]);
  const [tileEditorEdited, setTileEditorEdited] = useState(false);
  const [tilemapEditorCell, setTilemapEditorCell] = useState<number | null>(null);
  const [unifiedTileEditorContext, setUnifiedTileEditorContext] = useState<UnifiedTileEditorContext>("map-cell");
  const [tileStampDraft, setTileStampDraft] = useState<TileStampDraft>({
    characterIndex: null,
    transform: 0,
    inverted: false,
    attribute: 0x38,
  });
  const [tileEditorColorPickerActive, setTileEditorColorPickerActive] = useState(false);
  const [tileEditorTilePickerActive, setTileEditorTilePickerActive] = useState(false);
  const [tilemapPutActive, setTilemapPutActive] = useState(false);
  const tilemapPutPointerRef = useRef<{
    readonly pointerId: number;
    readonly stamp: TilemapStamp;
    readonly visited: Set<number>;
    lastX: number;
    lastY: number;
    historyCaptured: boolean;
  } | null>(null);
  const tileEditorTilePickerClickGuardRef = useRef<{ readonly index: number; readonly until: number } | null>(null);
  const [highlightSelectedTileUses, setHighlightSelectedTileUses] = useState(false);
  useEffect(() => {
    if (!tileEditorColorPickerActive && !tileEditorTilePickerActive) return;
    const cancelPickersOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setTileEditorColorPickerActive(false);
      setTileEditorTilePickerActive(false);
      event.preventDefault();
    };
    window.addEventListener("keydown", cancelPickersOnEscape);
    return () => window.removeEventListener("keydown", cancelPickersOnEscape);
  }, [tileEditorColorPickerActive, tileEditorTilePickerActive]);
  useEffect(() => {
    if (!tilemapPutActive) return;
    const cancelPutOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      tilemapPutPointerRef.current = null;
      setTilemapPutActive(false);
      event.preventDefault();
    };
    window.addEventListener("keydown", cancelPutOnEscape);
    return () => window.removeEventListener("keydown", cancelPutOnEscape);
  }, [tilemapPutActive]);
  const [bitmapEditorCell, setBitmapEditorCell] = useState<BitmapCell | null>(null);
  const [bitmapEditorUndo, setBitmapEditorUndo] = useState<readonly BitmapCell[]>([]);
  const [bitmapEditorRedo, setBitmapEditorRedo] = useState<readonly BitmapCell[]>([]);
  const [bitmapEditorSelection, setBitmapEditorSelection] = useState<InspectedAttribute | null>(null);
  const [bitmapEditorOriginalResult, setBitmapEditorOriginalResult] = useState<WorkerConversionResult | null>(null);
  const [bitmapEditorUseColors, setBitmapEditorUseColors] = useState(false);
  const [bitmapEditorBuffer, setBitmapEditorBuffer] = useState<BitmapEditorBuffer | null>(null);
  const [bitmapEditorUndoFull, setBitmapEditorUndoFull] = useState<readonly BitmapEditorBuffer[]>([]);
  const [bitmapEditorRedoFull, setBitmapEditorRedoFull] = useState<readonly BitmapEditorBuffer[]>([]);
  const [bitmapEditorRevertSource, setBitmapEditorRevertSource] = useState<WorkerDecodedImage | null>(null);
  const [bitmapEditorScope, setBitmapEditorScope] = useState<BitmapEditorScope>("pixel");
  const [bitmapEditorOperation, setBitmapEditorOperation] = useState<BitmapEditorOperation>("copy");
  const [bitmapEditorBrushSize, setBitmapEditorBrushSize] = useState<BitmapEditorBrushSize>("1x1");
  const [bitmapEditorSelectionTool, setBitmapEditorSelectionTool] = useState<"none" | BitmapSelectionKind>("rectangle");
  const [bitmapEditorSelectionResolution, setBitmapEditorSelectionResolution] = useState<BitmapSelectionResolution>("pixel");
  const [bitmapEditorColorOperation, setBitmapEditorColorOperation] = useState<"replace" | "increase" | "decrease">("replace");
  const [bitmapEditorColorFrom, setBitmapEditorColorFrom] = useState(0);
  const [bitmapEditorColorTo, setBitmapEditorColorTo] = useState(6);
  const [bitmapEditorColorChannel, setBitmapEditorColorChannel] = useState<"both" | "ink" | "paper">("both");
  const [bitmapEditorColorScope, setBitmapEditorColorScope] = useState<"selection" | "image">("selection");
  const [bitmapEditorGridMode, setBitmapEditorGridMode] = useState<"pixel" | "cell" | "off">("pixel");
  const [bitmapEditorShowPixels, setBitmapEditorShowPixels] = useState(true);
  const [bitmapEditorShowAttributes, setBitmapEditorShowAttributes] = useState(true);
  const [bitmapEditorPastePixels, setBitmapEditorPastePixels] = useState(true);
  const [bitmapEditorPasteAttributes, setBitmapEditorPasteAttributes] = useState(true);
  const [bitmapEditorRegionSelection, setBitmapEditorRegionSelection] = useState<BitmapRegionSelection | null>(null);
  const [bitmapEditorSelectionDraft, setBitmapEditorSelectionDraft] = useState<BitmapRegionSelection | null>(null);
  const [bitmapEditorClipboard, setBitmapEditorClipboard] = useState<BitmapEditorClipboard | null>(null);
  const [bitmapEditorPasteMode, setBitmapEditorPasteMode] = useState<"copy" | "move" | null>(null);
  const [bitmapEditorStippleEnabled, setBitmapEditorStippleEnabled] = useState(false);
  const [bitmapEditorStipplePattern, setBitmapEditorStipplePattern] = useState<string>(DEFAULT_CONVERSION_SETTINGS.orderedMatrix);
  const [bitmapEditorStippleDensity, setBitmapEditorStippleDensity] = useState(50);
  const [bitmapEditorCellMode, setBitmapEditorCellMode] = useState<BitmapEditorCellMode>("filled");
  const [bitmapEditorInkColor, setBitmapEditorInkColor] = useState<number | null>(null);
  const [bitmapEditorPaperColor, setBitmapEditorPaperColor] = useState<number | null>(null);
  const [bitmapEditorBrightPolicy, setBitmapEditorBrightPolicy] = useState<boolean | null>(null);
  const [bitmapEditorFlashPolicy, setBitmapEditorFlashPolicy] = useState<boolean | null>(null);
  const [bitmapEditorFlashPreviewMode, setBitmapEditorFlashPreviewMode] =
    useState<"animate" | "normal" | "inverted" | "off">("normal");
  const [bitmapEditorFlashPreviewPhase, setBitmapEditorFlashPreviewPhase] =
    useState(false);
  const [bitmapEditorColorPickerActive, setBitmapEditorColorPickerActive] = useState(false);
  const [bitmapEditorPatternPickerActive, setBitmapEditorPatternPickerActive] = useState(false);
  const [bitmapEditorPickedCell, setBitmapEditorPickedCell] = useState<ZxAttributeCellSnapshot | null>(null);
  const [bitmapEditorPickedFrameIndex, setBitmapEditorPickedFrameIndex] = useState<number | null>(null);
  const [bitmapEditorTarget] = useState<BitmapEditorTarget>("result");
  const [bitmapEditorResultFrameIndex, setBitmapEditorResultFrameIndex] = useState(0);
  const [bitmapEditorResultBuffer, setBitmapEditorResultBuffer] = useState<NativeResultBitmap | null>(null);
  const bitmapEditorResultBufferRef = useRef<NativeResultBitmap | null>(null);
  const bitmapEditorColorDraftRef = useRef<{
    readonly result: WorkerConversionResult;
    readonly frameIndex: number;
    readonly baseline: NativeResultBitmap;
    steps: number;
  } | null>(null);
  const bitmapEditorResultSourceRef = useRef<WorkerConversionResult | null>(null);
  const bitmapEditorCurrentResultRef = useRef<WorkerConversionResult | null>(null);
  const [bitmapEditorResultUndo, setBitmapEditorResultUndo] = useState<readonly BitmapEditorResultHistoryEntry[]>([]);
  const [bitmapEditorResultRedo, setBitmapEditorResultRedo] = useState<readonly BitmapEditorResultHistoryEntry[]>([]);
  const [bitmapEditorResultOriginal, setBitmapEditorResultOriginal] = useState<NativeResultBitmap | null>(null);
  const [bitmapEditorResultOriginalResult, setBitmapEditorResultOriginalResult] = useState<WorkerConversionResult | null>(null);
  const [bitmapEditorResultEdited, setBitmapEditorResultEdited] = useState(false);
  const [bitmapEditorResultQuality, setBitmapEditorResultQuality] = useState<"Draft" | "High">("High");
  const [bitmapEditorResultPaletteIndex, setBitmapEditorResultPaletteIndex] = useState(1);
  const [bitmapEditorSourceColor, setBitmapEditorSourceColor] = useState<readonly [number, number, number, number] | null>(null);
  const [workspaceMode, setWorkspaceMode] =
    useState<WorkspaceConversionMode>("palette");
  useEffect(() => {
    if (workspaceMode === "tilemap") return;
    tilemapPutPointerRef.current = null;
    setTilemapPutActive(false);
  }, [workspaceMode]);
  const [tilemapStale, setTilemapStale] = useState(false);
  const [specsciiDocumentName, setSpecsciiDocumentName] = useState<string | null>(null);
  const [specsciiBorder, setSpecsciiBorder] = useState(0);
  const [specsciiAuthor, setSpecsciiAuthor] = useState("");
  const [specsciiImageName, setSpecsciiImageName] = useState("");
  const [charsetSource, setCharsetSource] = useState<CharsetSource>("derived");
  const [charsetEncoding, setCharsetEncoding] = useState<CharsetEncoding>("compact");
  const [charsetBudget, setCharsetBudget] = useState(32);
  const [charsetAllowTransforms, setCharsetAllowTransforms] = useState(true);
  const [charsetAllowPolarity, setCharsetAllowPolarity] = useState(true);
  const [charsetStrategy, setCharsetStrategy] =
    useState<DerivedCharsetStrategy>("image-similarity-v2");
  const [charsetDistance, setCharsetDistance] =
    useState<CharsetDistanceMetric>("hybrid");
  const [charsetVisualWeighting, setCharsetVisualWeighting] = useState(false);
  const [existingCharset, setExistingCharset] = useState<Uint8Array | null>(null);
  const [existingCharsetName, setExistingCharsetName] = useState<string | null>(null);
  const [charsetTilesView, setCharsetTilesView] = useState<CharsetTilesView>("output");
  const [charsetSelectionMode, setCharsetSelectionMode] = useState(false);
  const [selectedSourceCharsetTile, setSelectedSourceCharsetTile] = useState<number | null>(null);
  const [emittedSourceCharsetIndices, setEmittedSourceCharsetIndices] = useState<readonly (number | null)[] | null>(null);
  const [builtInSpecsciiCharset, setBuiltInSpecsciiCharset] = useState<Uint8Array | null>(null);
  const [builtInSpecsciiFontError, setBuiltInSpecsciiFontError] = useState<string | null>(null);
  const [existingCharsetStart, setExistingCharsetStart] = useState(0);
  const [existingCharsetLength, setExistingCharsetLength] = useState(0);
  const [existingCharsetStartEntry, setExistingCharsetStartEntry] =
    useState("1");
  const [existingCharsetLengthEntry, setExistingCharsetLengthEntry] =
    useState("0");
  const [existingCharsetSelection, setExistingCharsetSelection] =
    useState<readonly number[] | null>(null);
  const [lastFinalCompletedAt, setLastFinalCompletedAt] = useState<string | null>(null);
  const [resultOrigin, setResultOrigin] = useState<ResultOrigin>("converted");
  const [sourceArtifact, setSourceArtifact] = useState<SourceArtifactInfo | null>(null);
  const [projectName, setProjectName] = useState("Untitled project");
  const [exportError, setExportError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [profiles, setProfiles] = useState<ConversionProfile[]>(() => [
    ...BUILT_IN_PROFILES,
    ...loadStoredProfiles(localStorage),
  ]);
  const [startupWorkbenchPreferences] = useState(() =>
    loadWorkbenchPreferences(localStorage),
  );
  const [startupApplicationSettings] = useState<ApplicationSettings>(() => {
    const availableProfiles = profiles;
    const initialProfile = availableProfiles.find(({ id }) => id === loadApplicationSettings(localStorage).profileId)
      ?? availableProfiles.find(({ id }) => id === DEFAULT_APPLICATION_SETTINGS.profileId)
      ?? BUILT_IN_PROFILE;
    return resolveApplicationSettings(loadApplicationSettings(localStorage), {
      profiles: availableProfiles.map((profile) => ({
        id: profile.id,
        presets: profile.presets.map((preset) => ({ id: preset.id })),
      })),
      compatibleModeIds: Object.keys(initialProfile.palette.modes),
    });
  });
  const [initialEnginePreferences] = useState(() =>
    loadEnginePreferences(localStorage, {
      platformId: DEFAULT_CONVERSION_SETTINGS.platformId,
      modeId: DEFAULT_CONVERSION_SETTINGS.modeId,
    })
  );
  const [selectedProfileId, setSelectedProfileId] = useState(startupApplicationSettings.profileId);
  const [selectedPresetId, setSelectedPresetId] = useState(startupApplicationSettings.presetId);
  const [image, setImage] = useState<WorkerDecodedImage | null>(null);
  const [originalImage, setOriginalImage] = useState<WorkerDecodedImage | null>(null);
  const [sourceFrameIndex, setSourceFrameIndex] = useState(0);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [imageStatus, setImageStatus] = useState("Choose a PNG, JPEG, or GIF image.");
  const [gifFrameSelection, setGifFrameSelection] = useState<{
    readonly file: File;
    readonly bytes: Uint8Array;
    readonly frameCount: number;
    readonly frameEntry: string;
  } | null>(null);
  const [framing, setFraming] = useState<FramingMode>(startupApplicationSettings.framing);
  const [resampling, setResampling] = useState<ResamplingMethod>(DEFAULT_CONVERSION_SETTINGS.resampling);
  const [rotation, setRotation] = useState<Rotation>(DEFAULT_CONVERSION_SETTINGS.rotation);
  const [mirrorHorizontal, setMirrorHorizontal] = useState(DEFAULT_CONVERSION_SETTINGS.mirrorHorizontal);
  const [mirrorVertical, setMirrorVertical] = useState(DEFAULT_CONVERSION_SETTINGS.mirrorVertical);
  const [fillOffsetX, setFillOffsetX] = useState(
    DEFAULT_CONVERSION_SETTINGS.fillOffsetX,
  );
  const [fillOffsetY, setFillOffsetY] = useState(
    DEFAULT_CONVERSION_SETTINGS.fillOffsetY,
  );
  const [panOffsetX, setPanOffsetX] = useState(
    DEFAULT_CONVERSION_SETTINGS.panOffsetX,
  );
  const [panOffsetY, setPanOffsetY] = useState(
    DEFAULT_CONVERSION_SETTINGS.panOffsetY,
  );
  const [panEdgeMode, setPanEdgeMode] = useState<PanEdgeMode>(
    DEFAULT_CONVERSION_SETTINGS.panEdgeMode,
  );
  const [background, setBackground] = useState<RgbColor>(
    profiles.find(({ id }) => id === startupApplicationSettings.profileId)?.platform_id === "pmd-85"
      ? { r: 0, g: 0, b: 0 }
      : DEFAULT_CONVERSION_SETTINGS.background,
  );
  const [exportBorderEnabled, setExportBorderEnabled] = useState(startupApplicationSettings.exportBorderEnabled);
  const [exportBorderWidth, setExportBorderWidth] = useState(startupApplicationSettings.exportBorderWidth);
  const [exportBorderColor, setExportBorderColor] = useState<RgbColor>(startupApplicationSettings.exportBorderColor);
  const [exportZoomFactor, setExportZoomFactor] = useState<ApplicationSettings["exportZoomFactor"]>(startupApplicationSettings.exportZoomFactor);
  const [cropXEntry, setCropXEntry] = useState(String(DEFAULT_CONVERSION_SETTINGS.crop.x));
  const [cropYEntry, setCropYEntry] = useState(String(DEFAULT_CONVERSION_SETTINGS.crop.y));
  const [cropWidthEntry, setCropWidthEntry] = useState(String(DEFAULT_CONVERSION_SETTINGS.crop.width));
  const [cropHeightEntry, setCropHeightEntry] = useState(String(DEFAULT_CONVERSION_SETTINGS.crop.height));
  const [cropAspectRatio, setCropAspectRatio] = useState<CropAspectRatio>(
    DEFAULT_CONVERSION_SETTINGS.cropAspectRatio,
  );
  const [brightness, setBrightness] = useState(DEFAULT_CONVERSION_SETTINGS.brightness);
  const [contrast, setContrast] = useState(DEFAULT_CONVERSION_SETTINGS.contrast);
  const [saturation, setSaturation] = useState(DEFAULT_CONVERSION_SETTINGS.saturation);
  const [hueShift, setHueShift] = useState(DEFAULT_CONVERSION_SETTINGS.hueShift ?? 0);
  const [hslSaturation, setHslSaturation] = useState(DEFAULT_CONVERSION_SETTINGS.hslSaturation ?? 0);
  const [lightness, setLightness] = useState(DEFAULT_CONVERSION_SETTINGS.lightness ?? 0);
  const [colorize, setColorize] = useState(DEFAULT_CONVERSION_SETTINGS.colorize ?? false);
  const [gamma, setGamma] = useState(DEFAULT_CONVERSION_SETTINGS.gamma);
  const [smoothing, setSmoothing] = useState(DEFAULT_CONVERSION_SETTINGS.smoothing);
  const [sharpening, setSharpening] = useState(DEFAULT_CONVERSION_SETTINGS.sharpening);
  const [borderColor, setBorderColor] = useState(DEFAULT_CONVERSION_SETTINGS.borderColor);
  const [attributeHeight, setAttributeHeight] = useState<AttributeHeight>(DEFAULT_CONVERSION_SETTINGS.attributeHeight);
  const [attributeSmoothing, setAttributeSmoothing] = useState(
    DEFAULT_CONVERSION_SETTINGS.attributeSmoothing,
  );
  const [attributeHaloInfluence, setAttributeHaloInfluence] = useState(
    DEFAULT_CONVERSION_SETTINGS.attributeHaloInfluence,
  );
  const [attributeHaloHorizontal, setAttributeHaloHorizontal] =
    useState<AttributeHaloRadius>(DEFAULT_CONVERSION_SETTINGS.attributeHaloHorizontal);
  const [attributeHaloVertical, setAttributeHaloVertical] =
    useState<AttributeHaloRadius>(DEFAULT_CONVERSION_SETTINGS.attributeHaloVertical);
  const [screenFlickerSuppression, setScreenFlickerSuppression] = useState(
    DEFAULT_CONVERSION_SETTINGS.screenFlickerSuppression,
  );
  const [zxMixedAttributesOnly, setZxMixedAttributesOnly] = useState(
    DEFAULT_CONVERSION_SETTINGS.zxMixedAttributesOnly,
  );
  const [qlMixedOptimizerId, setQlMixedOptimizerId] =
    useState<QlMixedOptimizerId>(
      DEFAULT_CONVERSION_SETTINGS.qlMixedOptimizerId,
    );
  const [paletteSelections, setPaletteSelections] = useState<PaletteSelection[]>(
    () => DEFAULT_CONVERSION_SETTINGS.paletteSelections.map((selection) => ({
      ...selection,
      enabledColorIds: [...selection.enabledColorIds],
    })),
  );
  const [zxPaletteDefinition, setZxPaletteDefinition] = useState<ZxPaletteDefinition>(
    DEFAULT_CONVERSION_SETTINGS.zxPalette,
  );
  const resolvedZxPalette = resolveZxPalette(zxPaletteDefinition);
  const zxPaletteOptions = ZX_BASE_COLORS.map((base) => ({
    code: base.code,
    name: base.name,
    normal: rgbToHex(resolvedZxPalette.normal[base.code]!),
    bright: rgbToHex(resolvedZxPalette.bright[base.code]!),
  }));
  const paletteModeCacheRef = useRef(new Map<string, PaletteSelection[]>());
  const [dithering, setDithering] = useState<DitheringMethod>(() =>
    startupApplicationSettings.dithering
  );
  const [attributeOptimizerId, setAttributeOptimizerId] =
    useState<AttributeOptimizerId>(initialEnginePreferences.attributeOptimizerId);
  const [verticalSpatialSwapRows, setVerticalSpatialSwapRows] = useState(false);
  const [ditherEngineId, setDitherEngineId] =
    useState<DitherEngineId>(initialEnginePreferences.ditherEngineId);
  const ditherEngineByMethodRef = useRef<Partial<Record<DitheringMethod, DitherEngineId>>>({
    none: ditherMethodForEngine(initialEnginePreferences.ditherEngineId) === "none"
      ? initialEnginePreferences.ditherEngineId
      : "none-discrete-v2",
    ordered: ditherMethodForEngine(initialEnginePreferences.ditherEngineId) === "ordered"
      ? initialEnginePreferences.ditherEngineId
      : "ordered-strict-matrix-v6",
    "error-diffusion": ditherMethodForEngine(initialEnginePreferences.ditherEngineId) === "error-diffusion"
      ? initialEnginePreferences.ditherEngineId
      : "error-diffusion-decorrelated-v3",
  });
  const [structuredSettings, setStructuredSettings] =
    useState<StructuredConversionSettings>(
      () => structuredSettingsForOptimizer(
        initialEnginePreferences.attributeOptimizerId,
        DEFAULT_CONVERSION_SETTINGS.structured,
      ),
    );
  const [targetModeId, setTargetModeId] =
    useState<TargetModeId>(startupApplicationSettings.modeId);
  const [artisticPattern, setArtisticPattern] = useState<NonNullable<ConversionSettings["artisticPattern"]>>("auto");
  const [orderedMatrix, setOrderedMatrix] = useState<OrderedMatrixId>(DEFAULT_CONVERSION_SETTINGS.orderedMatrix);
  const [customOrderedMatrices, setCustomOrderedMatrices] = useState<readonly CustomOrderedMatrixDefinition[]>(
    DEFAULT_CONVERSION_SETTINGS.customOrderedMatrices,
  );
  const [customDiffusionKernels, setCustomDiffusionKernels] = useState<readonly CustomDiffusionKernelDefinition[]>(
    DEFAULT_CONVERSION_SETTINGS.customDiffusionKernels,
  );
  const [composer, setComposer] = useState<ConversionSettings["composer"]>(DEFAULT_CONVERSION_SETTINGS.composer);
  const [customMatrixWidthEntry, setCustomMatrixWidthEntry] = useState("4");
  const [customMatrixHeightEntry, setCustomMatrixHeightEntry] = useState("4");
  const [customMatrixValuesEntry, setCustomMatrixValuesEntry] = useState("0 8 2 10 12 4 14 6 3 11 1 9 15 7 13 5");
  const [customKernelEntryText, setCustomKernelEntryText] = useState("1 0 7\n-1 1 3\n0 1 5\n1 1 1");
  const [customPatternError, setCustomPatternError] = useState<string | null>(null);
  const [amountEntry, setAmountEntry] = useState(String(startupApplicationSettings.ditheringAmount));
  const [errorDiffusionRandomization, setErrorDiffusionRandomization] = useState(
    DEFAULT_CONVERSION_SETTINGS.errorDiffusionRandomization,
  );
  const [errorDiffusionLineSuppression, setErrorDiffusionLineSuppression] = useState(
    DEFAULT_CONVERSION_SETTINGS.errorDiffusionLineSuppression,
  );
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
  const [bitmapEditorToolMode, setBitmapEditorToolMode] = useState<"display" | "selection" | "draw" | "colors">("display");
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
  function workbenchWindowLayout(window: ActiveWorkbenchWindowId): WorkbenchWindowLayout {
    return workbenchWindowLayouts[window];
  }

  function preserveHiddenWorkbenchWindows(
    currentLayouts: WorkbenchWindowLayouts,
    nextLayouts: WorkbenchWindowLayouts,
  ): WorkbenchWindowLayouts {
    return Object.fromEntries(
      Object.entries(nextLayouts).map(([window, layout]) => {
        const id = window as ActiveWorkbenchWindowId;
        return [id, { ...layout, visible: currentLayouts[id].visible && layout.visible }];
      }),
    ) as WorkbenchWindowLayouts;
  }

  const workbenchToolsDock = workbenchWindowLayout("tools").dock as WorkbenchDock;
  const workbenchToolsOpen = workbenchWindowLayout("tools").open;
  const bitmapEditorActiveSide: PreviewSide | null = sourcePreviewContent === "bitmap-editor"
    ? "source"
    : resultPreviewContent === "bitmap-editor" ? "result" : null;

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

  function workbenchWindowCanDock(window: ActiveWorkbenchWindowId, dock: WorkbenchWindowDock): boolean {
    if (dock === "floating" || dock === "left" || dock === "right" || dock === "bottom") return true;
    return dock === "center" && (window === "source" || window === "result");
  }

  function workbenchDockWindowIsRendered(window: ActiveWorkbenchWindowId): boolean {
    const layout = workbenchWindowLayout(window);
    if (!layout.visible) return false;
    return window === "tilemap"
      ? workspaceMode === "tilemap"
      : window === "palette" || window === "dithering"
        ? workspaceMode === "palette"
        : true;
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

  function updateWorkbenchWindowLayout(
    window: ActiveWorkbenchWindowId,
    update: (layout: WorkbenchWindowLayout) => WorkbenchWindowLayout,
  ): void {
    setWorkbenchWindowLayouts((current) => ({
      ...current,
      [window]: update(current[window]),
    }));
  }

  function setWorkbenchWindowDock(
    window: ActiveWorkbenchWindowId,
    dock: WorkbenchWindowDock,
    destinationMinimized = workbenchWindowLayout(window).minimized,
  ): void {
    if (!workbenchWindowCanDock(window, dock)) return;
    setWorkbenchWindowLayouts((current) => {
      const next = moveWorkbenchWindowDock(current, window, dock, destinationMinimized);
      return {
        ...next,
        [window]: {
          ...next[window],
          open: destinationMinimized ? next[window].open : true,
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

  function workbenchDockIcon(dock: WorkbenchWindowDock): string {
    if (dock === "floating") return "⤢";
    if (dock === "center") return "⊙";
    if (dock === "left") return "◀";
    if (dock === "right") return "▶";
    return "▼";
  }

  function workbenchDockLabel(dock: WorkbenchWindowDock): string {
    if (dock === "floating") return "Floating";
    if (dock === "center") return "Center stage";
    if (dock === "left") return "Left dock";
    if (dock === "right") return "Right dock";
    return "Bottom dock";
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
    (workbenchWindowLayout("palette").visible && workspaceMode === "palette" && workbenchPaletteFloating) ||
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
    (workbenchWindowLayout("palette").visible && workspaceMode === "palette" && !workbenchPaletteFloating) ||
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
      startBottomHeight: workbenchBottomHeight,
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
      setWorkbenchBottomHeight((height) => Math.min(480, Math.max(0, height + delta)));
      return;
    }
    if (dock === "left") {
      setWorkbenchLeftWidth((width) => Math.min(560, Math.max(0, width + delta)));
    } else if (dock === "right") {
      setWorkbenchRightWidth((width) => Math.min(560, Math.max(0, width + delta)));
    }
  }

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

  function preventWorkbenchDragClick(event: ReactMouseEvent<HTMLElement>): void {
    if (!workbenchDragMovedRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    workbenchDragMovedRef.current = false;
  }

  function startWorkbenchSectionDrag(
    section: WorkbenchFloatingSection,
    event: ReactPointerEvent<HTMLElement>,
  ): void {
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

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent): void => {
      const resize = workbenchResizeRef.current;
      if (resize !== null && resize.kind === "dock" && resize.dock === "bottom") {
        const nextSize = snapWorkbenchSize(
          resize.startBottomHeight + resize.startPointer - event.clientY,
          0,
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

  const pmd85ForegroundPalette = useMemo<readonly Pmd85RgbColor[]>(() => {
    if (!isPmd) return [];
    try {
      return profileModeScreens(
        selectedProfile,
        targetModeId,
        pmd85PaletteCalibrationId,
      )[0]?.colors.map((color) => hexToRgb(color.normal)) ?? [];
    } catch {
      return [];
    }
  }, [isPmd, pmd85PaletteCalibrationId, selectedProfile, targetModeId]);

  useEffect(() => {
    workspaceModeRef.current = workspaceMode;
  }, [workspaceMode]);

  useEffect(() => {
    const worker = new ConversionWorkerClient();
    workerRef.current = worker;

    return () => {
      worker.dispose();
      draftWorkerRef.current?.dispose();
      benchmarkWorkerRef.current?.dispose();
      charsetWorkerRef.current?.dispose();
      if (workerRef.current === worker) {
        workerRef.current = null;
      }
      draftWorkerRef.current = null;
      benchmarkWorkerRef.current = null;
      charsetWorkerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const profile = profiles.find(({ id }) => id === startupApplicationSettings.profileId);
    const preset = profile?.presets.find(({ id }) => id === startupApplicationSettings.presetId);
    if (preset !== undefined) applySettings(preset.settings);
    setTargetModeId(startupApplicationSettings.modeId);
    setFraming(startupApplicationSettings.framing);
    // The preset application above also restores its dither engine. Reconcile
    // the persisted public method afterward so first image import cannot send
    // an Ordered/Error-diffusion method with the preset's no-dither engine.
    switchDithering(startupApplicationSettings.dithering);
    setAmountEntry(String(startupApplicationSettings.ditheringAmount));
  }, []);

  useEffect(() => {
    saveEnginePreferences(localStorage, {
      attributeOptimizerId,
      ditherEngineId,
    });
    ditherEngineByMethodRef.current[ditherMethodForEngine(ditherEngineId)] =
      ditherEngineId;
  }, [attributeOptimizerId, ditherEngineId]);

  // The public dithering method and the worker engine are two parts of one
  // setting. Keep them reconciled during startup as well as after UI edits;
  // otherwise the first Draft can be scheduled with a stale preset engine.
  useEffect(() => {
    if (ditherMethodForEngine(ditherEngineId) !== dithering) {
      switchDithering(dithering);
    }
  }, [dithering, ditherEngineId]);

  useEffect(() => {
    saveWorkspacePreferences(localStorage, {
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
    });
  }, [workspaceLayout, sourcePreviewContent, resultPreviewContent,
    previewZoom, sourcePreviewZoom, resultPreviewZoom, synchronizePan, synchronizeZoom, showPixelGrid, showAttributeGrid, hideAttributes,
    inspectionDrawerOpen]);

  useEffect(() => {
    saveWorkbenchPreferences(localStorage, {
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
    });
  }, [workbenchSettingsDock, workbenchSettingsMinimized, workbenchSettingsSideWidth,
    workbenchLeftWidth, workbenchRightWidth,
    workbenchBottomHeight, workbenchFloatingX, workbenchFloatingY,
    workbenchSettingsFloatingWidth, workbenchSettingsFloatingHeight,
    workbenchToolsDock, workbenchToolsFloatingX, workbenchToolsFloatingY,
    workbenchToolsFloatingWidth, workbenchToolsFloatingHeight,
    workbenchGeometryFloating, workbenchGeometryFloatingX, workbenchGeometryFloatingY,
    workbenchGeometryFloatingWidth, workbenchGeometryFloatingHeight,
    workbenchGeometryFloatingAutoHeight, workbenchAdjustmentsFloating,
    workbenchAdjustmentsFloatingX, workbenchAdjustmentsFloatingY,
    workbenchAdjustmentsFloatingWidth, workbenchAdjustmentsFloatingHeight,
    workbenchAdjustmentsFloatingAutoHeight,
    workbenchWindowOrder,
    workbenchPaletteFloating, workbenchPaletteFloatingX, workbenchPaletteFloatingY,
    workbenchPaletteFloatingWidth, workbenchPaletteFloatingHeight,
    workbenchPaletteFloatingAutoHeight,
    workbenchDitheringFloating, workbenchDitheringFloatingX, workbenchDitheringFloatingY,
    workbenchDitheringFloatingWidth, workbenchDitheringFloatingHeight,
    workbenchDitheringFloatingAutoHeight,
    workbenchTilemapFloating, workbenchTilemapFloatingX, workbenchTilemapFloatingY,
    workbenchTilemapFloatingWidth, workbenchTilemapFloatingHeight,
    workbenchTilemapFloatingAutoHeight,
    workbenchSourceFloating, workbenchSourceFloatingX, workbenchSourceFloatingY,
    workbenchSourceFloatingWidth, workbenchSourceFloatingHeight, workbenchSourceFloatingAutoHeight,
    workbenchResultFloating, workbenchResultFloatingX, workbenchResultFloatingY,
    workbenchResultFloatingWidth, workbenchResultFloatingHeight, workbenchResultFloatingAutoHeight,
    workbenchSourceDockedWidth, workbenchResultDockedWidth,
    workbenchToolsOpen, workbenchSectionsOpen, workbenchWindowLayouts]);

  useEffect(() => {
    if (originalImage === null) return;
    const firstSource = !startupWorkspaceAppliedRef.current;
    startupWorkspaceAppliedRef.current = true;
    const startupProfileId = `${BUILTIN_WORKSPACE_PROFILE_PREFIX}${startupWorkspaceLayout}`;
    const keepSelectedProfile = firstSource && (
      workspaceProfileSelectionMadeRef.current ||
      activeWorkspaceProfileId !== startupProfileId ||
      savedWorkbenchLayouts.some((layout) => layout.id === activeWorkspaceProfileId)
    );
    if (firstSource) {
      if (keepSelectedProfile) {
        selectWorkspaceProfile(activeWorkspaceProfileId);
      } else {
        applyWorkspaceLayout(startupWorkspaceLayout);
        restoreWorkbenchPreferences();
      }
    } else {
      setSourcePreviewContent("image");
      setResultPreviewContent("image");
    }
    if (!keepSelectedProfile) {
      setPreviewZoom("fit");
      setSourcePreviewZoom("fit");
      setResultPreviewZoom("fit");
      setShowPixelGrid(false);
      setShowAttributeGrid(false);
    }
    setInspection(null);
    setBitmapEditorSelection(null);
    setBitmapEditorOriginalResult(null);
    bitmapEditorFullBufferRef.current = null;
    bitmapEditorEncodedRef.current = null;
    setBitmapEditorBuffer(null);
    setBitmapEditorUndoFull([]);
    setBitmapEditorRedoFull([]);
    setBitmapEditorRevertSource(null);
    resetResultEditorState();
    setBitmapEditorSourceColor(null);
    setTileEditorUndo([]);
    setTileEditorRedo([]);
    setTilemapEditorCell(null);
    setSelectedPaletteColor(null);
  }, [originalImage]);

  useEffect(() => {
    if (lastFinal === null) return;
    const resultWasEdited = pendingOpenedResultEditedRef.current;
    pendingOpenedResultEditedRef.current = false;
    setBitmapEditorResultQuality(pendingOpenedResultQualityRef.current);
    if (!resultWasEdited) return;
    const bitmap = initializeResultEditor(lastFinal, 0);
    if (bitmap !== null) setBitmapEditorResultEdited(true);
  }, [lastFinal]);

  useEffect(() => {
    if (bitmapEditorSelection === null || workspaceMode !== "palette") {
      setBitmapEditorCell(null);
      setBitmapEditorUndo([]);
      setBitmapEditorRedo([]);
      return;
    }
    const rows = new Uint8Array(8);
    rows.set(bitmapEditorSelection.bitmapBytes.slice(0, 8));
    setBitmapEditorCell({ rows, attribute: bitmapEditorSelection.attribute });
    setBitmapEditorUndo([]);
    setBitmapEditorRedo([]);
  }, [bitmapEditorSelection, workspaceMode]);

  useEffect(() => {
    setSelectedPaletteColor(null);
  }, [targetModeId]);

  useEffect(() => {
    const mixedScreenTarget = targetModeId === "zx48-mixed-256x192" ||
      targetModeId === "mode8-256x256" ||
      targetModeId === "mode4-512x256" ||
      targetModeId === "mode8-mode4-mixed-512x256";
    const mixedResolutionTarget = targetModeId === "mode8-mode4-mixed-512x256";
    const unavailable = new Set<PreviewContent>();
    if (workspaceMode !== "palette") unavailable.add("pre-attribute");
    if (!mixedScreenTarget && !targetModeId.includes("vertical-spatial")) {
      unavailable.add("screen-1");
      unavailable.add("screen-2");
    }
    if (!mixedResolutionTarget) {
      unavailable.add("merged-low");
      unavailable.add("merged-high");
    }
    if (workspaceMode !== "tilemap") {
      unavailable.add("tile-usage");
    }
    if (workspaceMode !== "palette") {
      unavailable.add("bitmap-editor");
    }
    if (unavailable.has(sourcePreviewContent)) setSourcePreviewContent("image");
    if (unavailable.has(resultPreviewContent)) setResultPreviewContent("image");
  }, [workspaceMode, targetModeId, sourcePreviewContent, resultPreviewContent]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Moving a preview between dock portal hosts can replace its canvas node.
  // Repaint after dock/minimized changes rather than waiting for another
  // conversion or preview-content change.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || image === null) return;
    let displayResult = workspaceMode === "tilemap" &&
        charsetState.kind === "ready" && !tilemapStale
      ? lastFinal
      : draftPreviewResult(draftState) ?? lastFinal;
    const pendingColorDraft = bitmapEditorColorDraftRef.current;
    const pendingColorPreview = bitmapEditorResultBuffer;
    if (bitmapEditorTarget === "result" &&
        displayResult !== null &&
        pendingColorDraft?.result === displayResult &&
        pendingColorDraft.frameIndex < displayResult.frames.length &&
        pendingColorPreview !== null) {
      displayResult = resultWithEditedFrame(displayResult, pendingColorDraft.frameIndex, pendingColorPreview);
    }
    const fallbackPreview = displayResult === null && framing !== "crop"
      ? frameFallbackSourcePreview(
          image.rgba,
          image.width,
          image.height,
          selectedPlatformId,
          targetModeId,
          {
            framing,
            resampling,
            rotation,
            mirrorHorizontal,
            mirrorVertical,
            fillOffsetX,
            fillOffsetY,
            panOffsetX,
            panOffsetY,
            panEdgeMode,
            crop: { x: 0, y: 0, width: image.width, height: image.height },
            background,
          },
        )
      : null;
    const cropCanvasSize = framing === "crop"
      ? orientedSourceSize(image.width, image.height, rotation)
      : null;
    canvas.width = cropCanvasSize?.width ??
      (displayResult?.width ?? fallbackPreview?.width ?? destinationGeometry.width);
    canvas.height = cropCanvasSize?.height ??
      (displayResult?.height ?? fallbackPreview?.height ?? destinationGeometry.height);
    const context = canvas.getContext("2d");
    if (context === null) return;
    const showingOriginalSource = sourcePreviewContent === "image" ||
      sourcePreviewContent === "source-image" ||
      resultPreviewContent === "source-image";
    if (showingOriginalSource && framing !== "crop") {
      canvas.width = image.width;
      canvas.height = image.height;
      const pixels = new Uint8ClampedArray(Uint8Array.from(image.rgba).buffer);
      context.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
      return;
    }
    // Crop editing always needs the oriented source bitmap as its backing
    // canvas. A stale/retained tilemap result may still be available while
    // the crop settings are being edited, but painting that result here would
    // put its smaller dimensions into the source-sized canvas and desync the
    // crop overlay from the displayed image.
    if (
      workspaceMode === "tilemap" &&
      framing !== "crop" &&
      displayResult !== null
    ) {
      const frame = displayResult.frames[0];
      const rgba = hideAttributes &&
          displayResult.platformId === "zx-spectrum" &&
          frame !== undefined
        ? zxBitmapToMonochromeRgba(frame.encoded)
        : frame?.previewRgba;
      if (rgba === undefined) return;
      const pixels = new Uint8ClampedArray(Uint8Array.from(rgba).buffer);
      context.putImageData(
        new ImageData(pixels, displayResult.width, displayResult.height),
        0,
        0,
      );
      return;
    }
    if (framing === "crop") {
      drawOrientedCropSource(
        context,
        image,
        rotation,
        mirrorHorizontal,
        mirrorVertical,
      );
      return;
    }
    if (displayResult !== null) {
      const rgba = inputPreviewStage === "pre-constraint"
        ? displayResult.preConstraintPreviewRgba
        : displayResult.sourcePreviewRgba;
      const pixels = new Uint8ClampedArray(Uint8Array.from(rgba).buffer);
      context.putImageData(
        new ImageData(pixels, displayResult.width, displayResult.height),
        0,
        0,
      );
      return;
    }
    if (fallbackPreview !== null) {
      const pixels = new Uint8ClampedArray(
        Uint8Array.from(fallbackPreview.rgba).buffer,
      );
      context.putImageData(
        new ImageData(pixels, fallbackPreview.width, fallbackPreview.height),
        0,
        0,
      );
    }
  }, [
    image, draftState, lastFinal, framing, rotation, mirrorHorizontal,
    mirrorVertical, resampling, fillOffsetX, fillOffsetY, panOffsetX, panOffsetY,
    panEdgeMode,
    inputPreviewStage, workspaceMode, charsetState, sourcePreviewContent, background,
    resultPreviewContent,
    tilemapStale, hideAttributes, selectedPlatformId, targetModeId,
    destinationGeometry.width, destinationGeometry.height,
    isPmd, brightness, contrast, saturation, hueShift, hslSaturation, lightness, colorize, gamma, smoothing, sharpening,
    workbenchSourceFloating, workbenchResultFloating, workbenchPreviewLayer,
    workbenchWindowLayouts.source.dock, workbenchWindowLayouts.source.minimized,
    workbenchWindowLayouts.result.dock, workbenchWindowLayouts.result.minimized,
  ]);

  // Keep the converted canvas in sync for the same docked/floating transition
  // as the source canvas. This covers normal image previews as well as screen
  // and tilemap result stages.
  useLayoutEffect(() => {
    const canvases = [sourceConvertedCanvasRef.current, convertedCanvasRef.current]
      .filter((canvas): canvas is HTMLCanvasElement => canvas !== null);
    let displayResult = workspaceMode === "tilemap" &&
        charsetState.kind === "ready" && !tilemapStale
      ? lastFinal
      : draftPreviewResult(draftState) ?? lastFinal;
    const pendingColorDraft = bitmapEditorColorDraftRef.current;
    const pendingColorPreview = bitmapEditorResultBuffer;
    if (bitmapEditorTarget === "result" &&
        displayResult !== null &&
        pendingColorDraft?.result === displayResult &&
        pendingColorDraft.frameIndex < displayResult.frames.length &&
        pendingColorPreview !== null) {
      displayResult = resultWithEditedFrame(displayResult, pendingColorDraft.frameIndex, pendingColorPreview);
    }
    const showResultPixels = bitmapEditorTarget !== "result" || bitmapEditorShowPixels;
    const showResultAttributes = bitmapEditorTarget !== "result" ||
      (bitmapEditorShowAttributes && !hideAttributes);
    const standaloneTilemap = workspaceMode === "tilemap" &&
      charsetState.kind === "ready" && !tilemapStale && displayResult === null;
    if (canvases.length === 0 || (displayResult === null && !standaloneTilemap)) return;
    if (standaloneTilemap) {
      const screen = charsetState.result.decodedScr;
      const rgba = bitmapEditorTarget === "result" && !showResultPixels && !showResultAttributes
        ? new Uint8Array(256 * 192 * 4)
        : bitmapEditorTarget === "result" && !showResultPixels && showResultAttributes
          ? (() => {
            const attributesOnly = screen.slice();
            attributesOnly.fill(0, 0, ZX_BITMAP_BYTES);
            return renderZxFlashPreview(attributesOnly, 8, false, resolveZxPalette(zxPaletteDefinition));
          })()
          : bitmapEditorTarget === "result" && showResultPixels && !showResultAttributes
            ? zxBitmapToMonochromeRgba(screen)
            : hideAttributes
        ? zxBitmapToMonochromeRgba(screen)
        : bitmapEditorFlashPreviewMode === "inverted" ||
            (bitmapEditorFlashPreviewMode === "animate" && bitmapEditorFlashPreviewPhase)
          ? renderZxFlashPreview(screen, 8, true, resolveZxPalette(zxPaletteDefinition))
          : charsetState.result.previewRgba;
      for (const canvas of canvases) {
        canvas.width = 256;
        canvas.height = 192;
        const context = canvas.getContext("2d");
        if (context === null) continue;
        context.putImageData(new ImageData(new Uint8ClampedArray(Uint8Array.from(rgba).buffer), 256, 192), 0, 0);
      }
      return;
    }
    if (displayResult === null) return;
    let rgba: Uint8Array | undefined;
    let previewWidth = displayResult.width;
    let previewHeight = displayResult.height;
    const flashPhase = (
      bitmapEditorFlashPreviewMode === "inverted" ||
      (bitmapEditorFlashPreviewMode === "animate" && bitmapEditorFlashPreviewPhase)
    );
    const zxFramePreview = (frameIndex: number): Uint8Array | undefined => {
      const frame = displayResult.frames[frameIndex];
      if (frame === undefined) return undefined;
      if (displayResult.platformId === "zx-spectrum" && bitmapEditorTarget === "result") {
        if (!showResultPixels && !showResultAttributes) {
          return new Uint8Array(displayResult.width * displayResult.height * 4);
        }
        if (!showResultPixels && showResultAttributes && displayResult.attributeHeight !== null) {
          const attributesOnly = frame.encoded.slice();
          attributesOnly.fill(0, 0, ZX_BITMAP_BYTES);
          return renderZxFlashPreview(
            attributesOnly,
            displayResult.attributeHeight,
            flashPhase,
            resolveZxPalette(zxPaletteDefinition),
          );
        }
        if (showResultPixels && !showResultAttributes) {
          return zxBitmapToMonochromeRgba(frame.encoded);
        }
      }
      if (displayResult.platformId === "zx-spectrum" &&
          displayResult.attributeHeight !== null && flashPhase) {
        return renderZxFlashPreview(frame.encoded, displayResult.attributeHeight, true, resolveZxPalette(zxPaletteDefinition));
      }
      return frame.previewRgba;
    };
    const physicalSpatialFrame = displayResult.frames[0];
    const spatialPreview = displayResult.verticalSpatialDiagnostics === undefined ||
        physicalSpatialFrame === undefined
      ? undefined
      : verticalSpatialPreviewForStage(
          outputPreviewStage,
          zxFramePreview(0) ?? physicalSpatialFrame.previewRgba,
          displayResult.width,
          displayResult.height,
          displayResult.verticalSpatialDiagnostics,
        );
    if (displayResult.platformId === "zx-spectrum" &&
        bitmapEditorTarget === "result" &&
        !showResultPixels && !showResultAttributes) {
      rgba = new Uint8Array(displayResult.width * displayResult.height * 4);
    } else if (
      displayResult.platformId === "zx-spectrum" &&
      (hideAttributes || !showResultAttributes) &&
      showResultPixels
    ) {
      if (workspaceMode === "tilemap") {
        rgba = charsetState.kind === "ready"
          ? zxBitmapToMonochromeRgba(charsetState.result.decodedScr)
          : undefined;
      } else if (
        displayResult.verticalSpatialDiagnostics !== undefined &&
        (outputPreviewStage === "merged" || outputPreviewStage === "screen-2")
      ) {
        const first = displayResult.frames[0];
        rgba = first === undefined
          ? undefined
          : buildVerticalSpatialAnalyticPreview(
              zxBitmapToMonochromeRgba(first.encoded),
              displayResult.width,
              displayResult.height,
            );
      } else if (outputPreviewStage === "merged") {
        const first = displayResult.frames[0];
        const second = displayResult.frames[1];
        rgba = first === undefined
          ? undefined
          : second === undefined
            ? zxBitmapToMonochromeRgba(first.encoded)
            : mergeMonochromeRgba(
                zxBitmapToMonochromeRgba(first.encoded),
                zxBitmapToMonochromeRgba(second.encoded),
              );
      } else {
        const frame = outputPreviewStage === "screen-2"
          ? displayResult.frames[1] ?? displayResult.frames[0]
          : displayResult.frames[0];
        rgba = frame === undefined
          ? undefined
          : zxBitmapToMonochromeRgba(frame.encoded);
      }
    } else {
      rgba = workspaceMode === "tilemap"
        ? charsetState.kind === "ready"
          ? flashPhase
            ? renderZxFlashPreview(charsetState.result.decodedScr, 8, true, resolveZxPalette(zxPaletteDefinition))
            : charsetState.result.previewRgba
          : undefined
        : outputPreviewStage === "screen-2"
          ? displayResult.verticalSpatialDiagnostics !== undefined
          ? spatialPreview?.rgba
            : zxFramePreview(1) ?? zxFramePreview(0)
          : outputPreviewStage === "merged"
            ? displayResult.platformId === "sinclair-ql" &&
                displayResult.modeId === "mode8-mode4-mixed-512x256" &&
                displayResult.frames[0] !== undefined &&
                displayResult.frames[1] !== undefined
              ? renderQlMixedDisplayPreview(
                  displayResult.frames[0].previewRgba,
                  displayResult.frames[1].previewRgba,
                  displayResult.width,
                  qlMixedDisplayResolution,
                )
              : displayResult.verticalSpatialDiagnostics !== undefined
                ? spatialPreview?.rgba
                : bitmapEditorTarget === "result" && (!showResultPixels || !showResultAttributes)
                  ? displayResult.frames[0] !== undefined && displayResult.frames[1] !== undefined
                    ? mergeTemporalRgba(
                        zxFramePreview(0) ?? displayResult.frames[0].previewRgba,
                        zxFramePreview(1) ?? displayResult.frames[1].previewRgba,
                      )
                    : zxFramePreview(0) ?? displayResult.frames[0]?.previewRgba
                : displayResult.platformId === "zx-spectrum" && flashPhase
                  ? displayResult.frames.length > 1
                    ? mergeTemporalRgba(
                        zxFramePreview(0) ?? displayResult.frames[0]!.previewRgba,
                        zxFramePreview(1) ?? displayResult.frames[1]!.previewRgba,
                      )
                    : zxFramePreview(0) ?? displayResult.mergedPreviewRgba
                  : displayResult.mergedPreviewRgba
            : zxFramePreview(0);
    }
    if (displayResult.verticalSpatialDiagnostics !== undefined) {
      previewWidth = spatialPreview?.width ?? previewWidth;
      previewHeight = spatialPreview?.height ?? previewHeight;
    }
    for (const canvas of canvases) {
      canvas.width = previewWidth;
      canvas.height = previewHeight;
      const context = canvas.getContext("2d");
      if (context === null) continue;
      context.clearRect(0, 0, canvas.width, canvas.height);
      if (rgba === undefined) continue;
      const pixels = new Uint8ClampedArray(Uint8Array.from(rgba).buffer);
      context.putImageData(
        new ImageData(pixels, previewWidth, previewHeight),
        0,
        0,
      );
    }
  }, [
    draftState, lastFinal, outputPreviewStage, workspaceMode, charsetState,
    bitmapEditorFlashPreviewMode, bitmapEditorFlashPreviewPhase,
    bitmapEditorTarget, bitmapEditorResultBuffer, bitmapEditorShowPixels, bitmapEditorShowAttributes, zxPaletteDefinition,
    sourcePreviewContent, resultPreviewContent,
    tilemapStale, hideAttributes, qlMixedDisplayResolution,
    brightness, contrast, saturation, hueShift, hslSaturation, lightness, colorize, gamma, smoothing, sharpening,
    workbenchSourceFloating, workbenchResultFloating, workbenchPreviewLayer,
    workbenchWindowLayouts.source.dock, workbenchWindowLayouts.source.minimized,
    workbenchWindowLayouts.result.dock, workbenchWindowLayouts.result.minimized,
  ]);

  useEffect(() => {
    setInspection(null);
  }, [draftState, lastFinal]);

  useEffect(() => {
    const profile = profiles.find(
      (candidate) => candidate.id === selectedProfileId,
    );
    const producesMultipleFrames = profile !== undefined &&
      targetProducesMultipleFrames(profile.platform_id, targetModeId);
    if (
      !producesMultipleFrames &&
      outputPreviewStage !== "screen-1"
    ) {
      setOutputPreviewStage("screen-1");
    }
  }, [
    outputPreviewStage,
    profiles,
    selectedProfileId,
    targetModeId,
  ]);

  function directPmd85Result(
    imported: WorkerPmd85Import,
    settings: ConversionSettings,
  ): WorkerConversionResult {
    const artifact = Uint8Array.from(imported.originalBytes);
    const rgba = Uint8Array.from(imported.image.rgba);
    return {
      artifact,
      scr: Uint8Array.from(artifact),
      platformId: "pmd-85",
      modeId: imported.mode,
      width: PMD85_SCREEN_WIDTH,
      height: PMD85_SCREEN_HEIGHT,
      pixelAspectRatio: imported.pixelAspectRatio,
      attributeOptimizerId: "pmd85-cell-v1",
      ditherEngineId: settings.ditherEngineId,
      paletteSelections: settings.paletteSelections,
      frames: [{
        hardwareModeId: imported.mode,
        nativeWidth: PMD85_SCREEN_WIDTH,
        nativeHeight: PMD85_SCREEN_HEIGHT,
        nativePixelAspectRatio: imported.pixelAspectRatio,
        encoded: Uint8Array.from(artifact),
        paletteIndices: imported.paletteIndices,
        previewRgba: rgba,
      }],
      sourcePreviewRgba: Uint8Array.from(rgba),
      preConstraintPreviewRgba: Uint8Array.from(rgba),
      mergedPreviewRgba: Uint8Array.from(rgba),
      previewRgba: Uint8Array.from(rgba),
      score: 0,
      attributeHeight: imported.attributeHeight,
    };
  }

  async function importPmd85(file: File | undefined) {
    if (file === undefined || !isPmd) return;
    if (dirty && !window.confirm("Replace the current unsaved work with this PMD binary?")) return;
    const worker = workerRef.current;
    if (worker === null) {
      setImageStatus("Failed: conversion worker is unavailable.");
      return;
    }
    setImageStatus(`Validating and decoding ${file.name} as ${targetModeId}…`);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      assertValidPmd85Screen(bytes);
      const imported = await worker.decodePmd85(
        Uint8Array.from(bytes).buffer,
        targetModeId as Pmd85ModeId,
        pmd85ForegroundPalette,
        pmd85PaletteCalibrationId,
      );
      const directSettings: ConversionSettings = {
        ...conversionSettings,
        pmd85: { ...conversionSettings.pmd85, gapPolicy: "preserve-imported" },
      };
      const directResult = directPmd85Result(imported, directSettings);
      pendingOpenedFinalRef.current = {
        result: directResult,
        completedAtUtc: new Date().toISOString(),
      };
      setPmd85GapPolicy("preserve-imported");
      setResultOrigin("direct-import");
      setSourceFrameIndex(0);
      setSourceFileName(file.name);
      setProjectName(normalizeProjectName(sanitizeArtifactBaseName(file.name)));
      setSourceArtifact({
        sha256: await sha256Hex(bytes),
        baseName: sanitizeArtifactBaseName(file.name),
        bytes: Uint8Array.from(bytes),
      });
      setFillOffsetX(null);
      setFillOffsetY(null);
      setCropEntries({ x: 0, y: 0, width: PMD85_SCREEN_WIDTH, height: PMD85_SCREEN_HEIGHT });
      setCropSelectionActive(true);
      setImage(imported.image);
      setOriginalImage({ ...imported.image, rgba: imported.image.rgba.slice() });
      setLastFinal(directResult);
      setState({ kind: "ready", result: directResult });
      setDraftState({ kind: "idle" });
      setDirty(true);
      setImageStatus(
        `Accepted raw PMD 85 binary · 16,384 bytes · interpreted as ${targetModeId}. Original bytes are ready for exact export.`,
      );
    } catch (error: unknown) {
      setImageStatus(`Invalid PMD 85 binary: ${error instanceof Error ? error.message : "Unknown error."}`);
    }
  }

  async function importImage(file: File | undefined) {
    if (file === undefined) return;
    if (dirty && !window.confirm("Replace the current unsaved work with this image?")) return;
    setImageStatus(`Reading ${file.name}…`);
    try {
      const sourceBytes = new Uint8Array(await file.arrayBuffer());
      if (/\.scr$/i.test(file.name)) {
        const decoded = decodeZxScrSource(sourceBytes, resolvedZxPalette);
        const normalized = encodeRgbaPng(decoded.rgba, decoded.width, decoded.height);
        await finishImageImport(
          file,
          normalized,
          0,
          decoded,
          `Accepted ZX Spectrum SCR · ${sourceBytes.length.toLocaleString()} bytes · decoded as ${decoded.width} × ${decoded.height} source image.`,
        );
        return;
      }
      const format = sniffImageFormat(sourceBytes);
      if (format === "gif") {
        const gif = inspectGif(sourceBytes);
        if (gif.frameCount > 1) {
          setGifFrameSelection({ file, bytes: sourceBytes, frameCount: gif.frameCount, frameEntry: "1" });
          setImageStatus(`Animated GIF · ${gif.frameCount} frames · choose a frame to import.`);
          return;
        }
      }
      await finishImageImport(file, sourceBytes, 0);
    } catch (error: unknown) {
      setImageStatus(`Invalid image: ${error instanceof Error ? error.message : "Unknown error."}`);
    }
  }

  async function finishImageImport(
    file: File,
    sourceBytes: Uint8Array,
    frameIndex: number,
    decodedOverride?: WorkerDecodedImage,
    acceptedDescription?: string,
  ) {
    const worker = workerRef.current;
    if (worker === null && decodedOverride === undefined) {
      setImageStatus("Failed: conversion worker is unavailable.");
      return;
    }
    // A newly loaded source must start fitted to the available preview window,
    // regardless of the zoom used for the previous image or editor view.
    setSourcePreviewZoom("fit");
    setImageStatus(decodedOverride === undefined
      ? `Validating and decoding ${file.name} in worker…`
      : `Preparing ${file.name}…`);
    try {
      const sourceSha256 = await sha256Hex(sourceBytes);
      const decoded = decodedOverride ?? await worker!.decodeImage(sourceBytes.slice().buffer, frameIndex);
      setImage(null);
      setOriginalImage(null);
      bitmapEditorFullBufferRef.current = null;
      bitmapEditorEncodedRef.current = null;
      setBitmapEditorBuffer(null);
      setBitmapEditorUndoFull([]);
      setBitmapEditorRedoFull([]);
      setBitmapEditorRevertSource(null);
      resetResultEditorState();
      setBitmapEditorSourceColor(null);
      setState({ kind: "idle" });
      setDraftState({ kind: "idle" });
      setLastFinal(null);
      setLastFinalCompletedAt(null);
      setSourceArtifact(null);
      setSourceFileName(file.name);
      setExportError(null);
      setBenchmarkRows([]);
      lastFinalRevisionRef.current = -1;
      setFillOffsetX(null);
      setFillOffsetY(null);
      const decodedSize = orientedSourceSize(decoded.width, decoded.height, rotation);
      setCropEntries({
        x: 0,
        y: 0,
        width: decodedSize.width,
        height: decodedSize.height,
      });
      setCropSelectionActive(true);
      setImage(decoded);
      setOriginalImage({ ...decoded, rgba: decoded.rgba.slice() });
      setSourceFrameIndex(frameIndex);
      setResultOrigin("converted");
      setDirty(true);
      setProjectName(normalizeProjectName(sanitizeArtifactBaseName(file.name)));
      setSourceArtifact({
        sha256: sourceSha256,
        baseName: sanitizeArtifactBaseName(file.name),
        bytes: sourceBytes,
      });
      setImageStatus(acceptedDescription ??
        `Accepted ${decoded.format.toUpperCase()}${decoded.format === "gif" ? ` frame ${frameIndex + 1}` : ""} · ${decoded.width} × ${decoded.height} · ${decoded.rgba.length.toLocaleString()} RGBA bytes.`);
    } catch (error: unknown) {
      setImageStatus(`Invalid image: ${error instanceof Error ? error.message : "Unknown error."}`);
    }
  }

  function importSelectedGifFrame(): void {
    if (gifFrameSelection === null) return;
    const frameNumber = Number(gifFrameSelection.frameEntry);
    if (!Number.isInteger(frameNumber) || frameNumber < 1 || frameNumber > gifFrameSelection.frameCount) return;
    const selection = gifFrameSelection;
    setGifFrameSelection(null);
    void finishImageImport(selection.file, selection.bytes, frameNumber - 1);
  }

  function cancelGifFrameSelection(): void {
    setGifFrameSelection(null);
    setImageStatus("GIF import canceled.");
  }

  async function importClipboardImage(): Promise<void> {
    if (navigator.clipboard?.read === undefined) {
      setImageStatus("Clipboard image import is unavailable in this browser. Use a secure connection and a browser that supports clipboard reading.");
      return;
    }

    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const mimeType = ["image/png", "image/jpeg"].find((type) => item.types.includes(type));
        if (mimeType === undefined) continue;

        const blob = await item.getType(mimeType);
        const bitmap = await createImageBitmap(blob);
        try {
          if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width > MAX_IMAGE_DIMENSION || bitmap.height > MAX_IMAGE_DIMENSION || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
            throw new Error("Clipboard image dimensions exceed the supported image limits.");
          }
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext("2d");
          if (context === null) throw new Error("Image conversion is unavailable in this browser.");
          context.drawImage(bitmap, 0, 0);
          const normalized = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((result) => {
              if (result === null) reject(new Error("The clipboard image could not be normalized."));
              else resolve(result);
            }, "image/png");
          });
          await importImage(new File([normalized], "clipboard.png", { type: "image/png" }));
        } finally {
          bitmap.close();
        }
        return;
      }
      setImageStatus("The clipboard does not contain a PNG or JPEG image.");
    } catch (error: unknown) {
      setImageStatus(`Could not read an image from the clipboard: ${error instanceof Error ? error.message : "Clipboard access was denied."}`);
    }
  }

  const amount = Number(amountEntry);
  const amountValid = /^\d+$/.test(amountEntry) && Number.isInteger(amount) && amount >= 0 && amount <= 100;
  const cropX = Number(cropXEntry);
  const cropY = Number(cropYEntry);
  const cropWidth = Number(cropWidthEntry);
  const cropHeight = Number(cropHeightEntry);
  const cropSourceSize = image === null
    ? null
    : orientedSourceSize(image.width, image.height, rotation);
  const cropValid = [cropXEntry, cropYEntry, cropWidthEntry, cropHeightEntry].every((entry) => /^\d+$/.test(entry)) &&
    [cropX, cropY, cropWidth, cropHeight].every(Number.isInteger) &&
    cropX >= 0 && cropY >= 0 && cropWidth >= 1 && cropHeight >= 1 &&
    cropSourceSize !== null &&
    cropX + cropWidth <= cropSourceSize.width &&
    cropY + cropHeight <= cropSourceSize.height;
  const paletteValid =
    paletteSelections.length === outputScreenCount(targetModeId) &&
    paletteSelections.every((selection) => selection.enabledColorIds.length > 0);
  const availableExistingCharsetCount = existingCharset === null
    ? 0
    : existingCharset.length / 8;
  const enteredCharsetStart = Number(existingCharsetStartEntry);
  const enteredCharsetLength = Number(existingCharsetLengthEntry);
  const charsetRangeEntriesValid =
    /^\d+$/.test(existingCharsetStartEntry) &&
    /^\d+$/.test(existingCharsetLengthEntry) &&
    Number.isInteger(enteredCharsetStart) &&
    Number.isInteger(enteredCharsetLength) &&
    enteredCharsetStart >= 1 &&
    enteredCharsetStart <= availableExistingCharsetCount &&
    enteredCharsetLength >= 1 &&
    enteredCharsetLength <=
      availableExistingCharsetCount - (enteredCharsetStart - 1);
  const existingCharsetChoiceValid = existingCharsetSelection === null
    ? charsetRangeEntriesValid
    : existingCharsetSelection.length > 0;
  const tilemapSettingsValid = workspaceMode !== "tilemap" ||
    charsetSource !== "existing" ||
    (existingCharset !== null && existingCharsetChoiceValid);
  const existingActiveCharacterCount = existingCharsetSelection?.length ??
    existingCharsetLength;
  const settingsValid = amountValid && invalidSliderIds.size === 0 && paletteValid &&
    (!isPmd || pmd85ForegroundPalette.length > 0) &&
    (framing !== "crop" || cropValid) && tilemapSettingsValid;
  const fillGeometry = image === null
    ? null
    : fillGeometryForDimensions(
        image.width,
        image.height,
        destinationGeometry.width,
        destinationGeometry.height,
        rotation,
        destinationGeometry.pixelAspect,
        fillOffsetX,
        fillOffsetY,
      );
  const panMaximumX = destinationGeometry.width;
  const panMaximumY = destinationGeometry.height;
  useEffect(() => {
    if (fillGeometry === null) return;
    if (
      fillOffsetX !== null &&
      fillOffsetX > fillGeometry.maximumOffsetX
    ) setFillOffsetX(fillGeometry.maximumOffsetX);
    if (
      fillOffsetY !== null &&
      fillOffsetY > fillGeometry.maximumOffsetY
    ) setFillOffsetY(fillGeometry.maximumOffsetY);
  }, [
    fillGeometry?.maximumOffsetX,
    fillGeometry?.maximumOffsetY,
    fillOffsetX,
    fillOffsetY,
  ]);
  useEffect(() => {
    setPanOffsetX((current) => Math.max(-panMaximumX, Math.min(panMaximumX, current)));
    setPanOffsetY((current) => Math.max(-panMaximumY, Math.min(panMaximumY, current)));
  }, [panMaximumX, panMaximumY]);
  const conversionSettings: ConversionSettings = {
    profileId: selectedProfileId,
    platformId: selectedPlatformId,
    modeId: targetModeId,
    attributeOptimizerId,
    ditherEngineId,
    qlMixedOptimizerId,
    framing,
    resampling,
    rotation,
    mirrorHorizontal,
    mirrorVertical,
    fillOffsetX,
    fillOffsetY,
    panOffsetX,
    panOffsetY,
    panEdgeMode,
    crop: { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
    cropAspectRatio,
    brightness,
    contrast,
    // Preserve imported legacy Color Intensity values without exposing a duplicate control.
    saturation,
    hueShift,
    hslSaturation,
    lightness,
    colorize,
    gamma,
    smoothing,
    sharpening,
    background,
    borderColor,
    attributeHeight,
    attributeSmoothing,
    attributeHaloInfluence,
    attributeHaloHorizontal,
    attributeHaloVertical,
    screenFlickerSuppression,
    zxMixedAttributesOnly,
    paletteSelections,
    zxPalette: zxPaletteDefinition,
    dithering,
    ditheringAmount: dithering === "none" ? 0 : amount,
    errorDiffusionRandomization,
    errorDiffusionLineSuppression,
    orderedMatrix,
    artisticPattern,
    customOrderedMatrices,
    customDiffusionKernels,
    composer,
    structured: {
      ...structuredSettings,
      ditherAmountPermille: dithering === "none" ? 0 : amount * 10,
    },
      pmd85: {
        mode: isPmd
          ? pmdHardwareModeForTarget(targetModeId as Pmd85TargetModeId)
          : DEFAULT_CONVERSION_SETTINGS.pmd85.mode,
        paletteCalibrationId: pmd85PaletteCalibrationId,
        gapPolicy: pmd85GapPolicy,
      },
    ...(targetModeId.includes("vertical-spatial")
      ? {
          verticalSpatialMix: {
            schemaVersion: 1 as const,
            algorithmId: attributeOptimizerId === "zx-vertical-spatial-detail-v1"
              ? "vertical-spatial-detail-v1" as const
              : attributeOptimizerId === "pmd85-vertical-spatial-detail-v2"
                ? "vertical-spatial-pmd-detail-v2" as const
              : "vertical-spatial-uniform-v1" as const,
            calibrationId: "srgb-ideal-v1" as const,
            swapRows: verticalSpatialSwapRows,
          },
        }
      : {}),
  };
  const pmd85WorkerOptions = isPmd
    ? {
        foregroundPalette: pmd85ForegroundPalette,
        ...(image?.format === "pmd85-bin" &&
            sourceArtifact !== null &&
            pmd85GapPolicy === "preserve-imported"
          ? { importedGapBytes: extractPmd85GapBytes(sourceArtifact.bytes) }
          : {}),
      }
    : undefined;
  if (selectedPlatformId === "zx-spectrum") {
    lastZxSettingsRef.current = conversionSettings;
  }
  const currentBenchmarkContextKey = benchmarkCacheKey(
    sourceArtifact?.sha256 ?? null,
    conversionSettings,
    amountEntry,
    selectedProfile.content_sha256,
  );
  benchmarkContextKeyRef.current = currentBenchmarkContextKey;

  useEffect(() => {
    benchmarkRunRef.current += 1;
    benchmarkWorkerRef.current?.dispose();
    benchmarkWorkerRef.current = null;
    setBenchmarkRunning(false);
    setBenchmarkRows([]);
  }, [currentBenchmarkContextKey]);

  useEffect(() => {
    if (developmentMode) return;
    benchmarkRunRef.current += 1;
    benchmarkWorkerRef.current?.dispose();
    benchmarkWorkerRef.current = null;
    tilemapBenchmarkRunRef.current += 1;
    setBenchmarkRunning(false);
    setTilemapBenchmarkRunning(false);
    setBenchmarkOpen(false);
    setTilemapBenchmarkOpen(false);
  }, [developmentMode]);

  useEffect(() => {
    setTilemapBenchmarkRows([]);
  }, [
    lastFinal,
    charsetSource,
    existingCharset,
    existingCharsetStart,
    existingCharsetLength,
    existingCharsetSelection,
    charsetBudget,
    charsetEncoding,
    charsetAllowTransforms,
    charsetAllowPolarity,
    charsetVisualWeighting,
  ]);

  useEffect(() => {
    const revision = revisionRef.current + 1;
    revisionRef.current = revision;
    setBitmapEditorFlashPreviewMode("normal");
    setBitmapEditorFlashPreviewPhase(false);
    setBitmapEditorScope("pixel");
    setBitmapEditorPatternPickerActive(false);
    clearBitmapEditorPickedCell();
    // Any source/settings change starts a new conversion lifecycle. An edited
    // native result belongs to the previous conversion and must not be carried
    // into the new draft/final result.
    if (bitmapEditorResultEdited) resetResultEditorState();
    setExportError(null);
    if (workspaceMode === "tilemap" && charsetState.kind === "ready" &&
        specsciiDocumentName === null) {
      setTilemapStale(true);
    }

    if (finalRunningRef.current) {
      workerRef.current?.dispose();
      workerRef.current = new ConversionWorkerClient();
      charsetWorkerRef.current?.dispose();
      charsetWorkerRef.current = null;
      finalRunningRef.current = false;
      finalJobRef.current += 1;
      setCharsetState((current) =>
        current.kind === "running" ? { kind: "idle" } : current,
      );
      if (workspaceMode === "tilemap" && specsciiDocumentName === null) {
        setTilemapStale(true);
      }
    }
    const openedFinal = pendingOpenedFinalRef.current;
    if (openedFinal !== null) {
      pendingOpenedFinalRef.current = null;
      draftWorkerRef.current?.dispose();
      draftWorkerRef.current = null;
      setDraftState({ kind: "idle" });
      lastFinalRevisionRef.current = revision;
      setLastFinal(openedFinal.result);
      setLastFinalCompletedAt(openedFinal.completedAtUtc);
      setState({ kind: "ready", result: openedFinal.result });
      setDirty(false);
      return;
    }
    if (image !== null) setDirty(true);
    if (skipNextDraftAfterBitmapEditRef.current) {
      skipNextDraftAfterBitmapEditRef.current = false;
      draftWorkerRef.current?.dispose();
      draftWorkerRef.current = null;
      setDraftState({ kind: "idle" });
      if (lastFinal !== null) {
        lastFinalRevisionRef.current = revision;
        setState({ kind: "ready", result: lastFinal });
      }
      return;
    }
    const hasStaleFinal = lastFinalRevisionRef.current >= 0 &&
      lastFinalRevisionRef.current !== revision;
    setState((current) => hasStaleFinal
      ? { kind: "stale" }
      : current.kind === "running" ? { kind: "idle" } : current,
    );

    const priorDraft = draftPreviewResult(draftState);
    const retainedResult = priorDraft !== null &&
        priorDraft.platformId === selectedPlatformId &&
        priorDraft.modeId === targetModeId
      ? priorDraft
      : null;
    if (image === null || !settingsValid) {
      setDraftState({ kind: "idle" });
      return;
    }
    setDraftState({ kind: "scheduled", retainedResult });
    const timer = window.setTimeout(() => {
      if (revisionRef.current !== revision) return;
      draftWorkerRef.current?.dispose();
      const draftWorker = new ConversionWorkerClient();
      draftWorkerRef.current = draftWorker;
      setDraftState({ kind: "running", retainedResult });
      void draftWorker.convertImage(
        image,
        conversionSettings,
        "draft",
        pmd85WorkerOptions,
      ).then((result) => {
        if (revisionRef.current === revision && draftWorkerRef.current === draftWorker) {
          setDraftState({ kind: "ready", result });
        }
      }).catch((error: unknown) => {
        if (revisionRef.current === revision && draftWorkerRef.current === draftWorker) {
          setDraftState({
            kind: "error",
            message: error instanceof Error ? error.message : "Unknown Draft error.",
            retainedResult,
          });
        }
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    image, settingsValid, framing, resampling, rotation, mirrorHorizontal,
    mirrorVertical, fillOffsetX, fillOffsetY, panOffsetX, panOffsetY, panEdgeMode,
    cropX, cropY, cropWidth, cropHeight,
    cropAspectRatio,
    brightness, contrast, saturation, hueShift, hslSaturation, lightness, colorize, gamma, smoothing, sharpening,
    background, borderColor, attributeHeight, attributeSmoothing, attributeHaloInfluence,
    attributeHaloHorizontal, attributeHaloVertical,
    screenFlickerSuppression,
    zxMixedAttributesOnly,
    paletteSelections, zxPaletteDefinition, dithering, amount, errorDiffusionRandomization,
    errorDiffusionLineSuppression,
    orderedMatrix, artisticPattern, selectedProfileId, targetModeId, attributeOptimizerId,
    ditherEngineId, qlMixedOptimizerId, structuredSettings,
    composer, customOrderedMatrices, customDiffusionKernels,
    pmd85PaletteCalibrationId, pmd85GapPolicy,
    workspaceMode, specsciiDocumentName,
  ]);

  useEffect(() => {
    if (pendingModeHighRef.current !== workspaceMode) return;
    if (
      workspaceMode === "tilemap" &&
      (
        selectedProfileId === QL_PROFILE_ID ||
        targetModeId !== "zx48-standard-256x192" ||
        attributeHeight !== 8
      )
    ) return;
    pendingModeHighRef.current = null;
    if (image !== null && settingsValid) void convertImage({ confirmEdited: false });
  }, [
    workspaceMode,
    selectedProfileId,
    targetModeId,
    attributeHeight,
    image,
    settingsValid,
  ]);

  function setCropEntries(crop: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  }) {
    setCropXEntry(String(crop.x));
    setCropYEntry(String(crop.y));
    setCropWidthEntry(String(crop.width));
    setCropHeightEntry(String(crop.height));
  }

  function ensurePixelCrop(nextRotation: Rotation = rotation) {
    if (image === null) return;
    const source = orientedSourceSize(image.width, image.height, nextRotation);
    const parsed = [cropX, cropY, cropWidth, cropHeight].every(Number.isInteger)
      ? { x: cropX, y: cropY, width: cropWidth, height: cropHeight }
      : { x: 0, y: 0, width: 100, height: 100 };
    const pixels = clampPixelCrop(parsed, source);
    setCropEntries(resizeCropToAspect(
      pixels,
      source,
      cropAspectRatio,
      "width",
      destinationGeometry,
    ));
  }

  function updateCropEntry(
    field: "x" | "y" | "width" | "height",
    value: string,
  ) {
    const setters = {
      x: setCropXEntry,
      y: setCropYEntry,
      width: setCropWidthEntry,
      height: setCropHeightEntry,
    };
    setters[field](value);
    setState({ kind: "idle" });
    if (cropSourceSize === null || !/^\d+$/.test(value)) return;
    const next = {
      x: field === "x" ? Number(value) : cropX,
      y: field === "y" ? Number(value) : cropY,
      width: field === "width" ? Number(value) : cropWidth,
      height: field === "height" ? Number(value) : cropHeight,
    };
    if (!Object.values(next).every(Number.isInteger)) return;
    if (field === "width" || field === "height") {
      setCropEntries(resizeCropToAspect(
        next,
        cropSourceSize,
        cropAspectRatio,
        field,
        destinationGeometry,
      ));
    }
  }

  function changeCropAspectRatio(next: CropAspectRatio) {
    setCropAspectRatio(next);
    if (cropSourceSize !== null && cropValid) {
      setCropEntries(resizeCropToAspect(
        { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
        cropSourceSize,
        next,
        "width",
        destinationGeometry,
      ));
    }
    setState({ kind: "idle" });
  }

  function sourcePointFromCropPointer(
    event: ReactPointerEvent<HTMLCanvasElement> | ReactMouseEvent<HTMLCanvasElement>,
  ): PixelPoint | null {
    if (cropSourceSize === null) return null;
    const bounds = event.currentTarget.getBoundingClientRect();
    return {
      x: (event.clientX - bounds.left) / bounds.width * cropSourceSize.width,
      y: (event.clientY - bounds.top) / bounds.height * cropSourceSize.height,
    };
  }

  function cropResizeTolerance(
    event: ReactPointerEvent<HTMLCanvasElement> | ReactMouseEvent<HTMLCanvasElement>,
  ): number {
    if (cropSourceSize === null) return 0;
    const bounds = event.currentTarget.getBoundingClientRect();
    return 12 * Math.max(
      cropSourceSize.width / Math.max(1, bounds.width),
      cropSourceSize.height / Math.max(1, bounds.height),
    );
  }

  function beginCropSelection(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (framing !== "crop" || cropSourceSize === null) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const start = sourcePointFromCropPointer(event);
    if (start === null) return;
    const originalCrop = {
      x: cropX,
      y: cropY,
      width: cropWidth,
      height: cropHeight,
    };
    const resizeHandle = cropSelectionActive && cropValid
      ? cropResizeHandleAtPoint(start, originalCrop, cropResizeTolerance(event))
      : null;
    const insideSelection = cropSelectionActive && cropValid &&
      pointIsInsideCrop(start, originalCrop);
    cropDragRef.current = {
      pointerId: event.pointerId,
      start,
      mode: resizeHandle ?? (insideSelection ? "move" : "create"),
      originalCrop,
    };
    setCropSelectionActive(true);
    setCropPointerMode(resizeHandle ?? (insideSelection ? "move" : "create"));
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
    event.preventDefault();
  }

  function moveCropSelection(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = cropDragRef.current;
    const current = sourcePointFromCropPointer(event);
    if (drag !== null) {
      setCropPointerMode(drag.mode);
    } else if (current !== null && cropSelectionActive && cropValid) {
      const currentCrop = { x: cropX, y: cropY, width: cropWidth, height: cropHeight };
      const resizeHandle = cropResizeHandleAtPoint(
        current,
        currentCrop,
        cropResizeTolerance(event),
      );
      setCropPointerMode(resizeHandle ?? (pointIsInsideCrop(current, currentCrop) ? "move" : "create"));
    }
    if (
      drag === null || drag.pointerId !== event.pointerId ||
      cropSourceSize === null
    ) return;
    if (current === null) return;
    setCropEntries(drag.mode === "move"
      ? moveCropFromDrag(
          drag.originalCrop,
          drag.start,
          current,
          cropSourceSize,
        )
      : drag.mode === "create"
        ? selectionFromDrag(
          drag.start,
          current,
          cropSourceSize,
          cropAspectRatio,
          destinationGeometry,
        )
        : resizeCropFromDrag(
          drag.originalCrop,
          current,
          cropSourceSize,
          cropAspectRatio,
          drag.mode,
          destinationGeometry,
        ));
    event.stopPropagation();
    event.preventDefault();
  }

  function endCropSelection(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = cropDragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    moveCropSelection(event);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    cropDragRef.current = null;
    setCropPointerMode("move");
    setState({ kind: "idle" });
    event.stopPropagation();
  }

  function moveCropWithKeyboard(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    if (
      framing !== "crop" || !cropSelectionActive || !cropValid ||
      cropSourceSize === null
    ) return;
    const deltas: Partial<Record<string, PixelPoint>> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const delta = deltas[event.key];
    if (delta === undefined) return;
    setCropEntries(moveCropFromDrag(
      { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
      { x: 0, y: 0 },
      delta,
      cropSourceSize,
    ));
    setState({ kind: "idle" });
    event.stopPropagation();
    event.preventDefault();
  }

  function clearCropSelection(event: ReactMouseEvent<HTMLCanvasElement>) {
    if (
      framing !== "crop" || !cropSelectionActive || !cropValid ||
      cropSourceSize === null
    ) return;
    const point = sourcePointFromCropPointer(event);
    if (
      point === null ||
      !pointIsInsideCrop(point, {
        x: cropX,
        y: cropY,
        width: cropWidth,
        height: cropHeight,
      })
    ) return;
    cropDragRef.current = null;
    setCropSelectionActive(false);
    setCropPointerMode("create");
    event.stopPropagation();
    event.preventDefault();
  }

  function togglePaletteColor(screenIndex: number, color: number) {
    setPaletteSelections((current) => current.map((selection) => {
      if (selection.screenIndex !== screenIndex) return selection;
      const enabledColorIds = selection.enabledColorIds.includes(color)
        ? selection.enabledColorIds.filter((candidate) => candidate !== color)
        : [...selection.enabledColorIds, color].sort((left, right) => left - right);
      return { ...selection, enabledColorIds };
    }));
    setState({ kind: "idle" });
  }

  function setPaletteBrightMode(screenIndex: number, brightMode: BrightMode) {
    setPaletteSelections((current) => current.map((selection) =>
      selection.screenIndex === screenIndex
        ? { ...selection, brightMode }
        : selection
    ));
    setState({ kind: "idle" });
  }

  function pmdSettingsForMode(
    profile: ConversionProfile,
    style: ConversionSettings,
    mode: Pmd85TargetModeId,
    preferredCalibrationId?: string,
    retainPaletteSelection = false,
  ): ConversionSettings {
    const descriptor = profile.palette.modes[mode];
    if (descriptor === undefined) {
      throw new RangeError(`Profile ${profile.name} does not support ${mode}.`);
    }
    const availableIds = descriptor.screens[0]?.colors.map((color) => color.id) ?? [];
    const availableIdSet = new Set(availableIds);
    const retainedIds = paletteSelections[0]?.enabledColorIds.filter((id) =>
      availableIdSet.has(id)
    ) ?? [];
    const calibrationIds = [
      descriptor.base_calibration_id,
      ...(descriptor.calibrations?.map((calibration) => calibration.id) ?? []),
    ];
    const calibrationId = preferredCalibrationId !== undefined &&
      calibrationIds.includes(preferredCalibrationId)
      ? preferredCalibrationId
      : descriptor.base_calibration_id ?? style.pmd85.paletteCalibrationId;
    const hardwareMode = pmdHardwareModeForTarget(mode);
    const spatial = mode.includes("vertical-spatial");
    const retargeted = retargetHardwareModeSettings(style, {
      profileId: profile.id,
      platformId: "pmd-85",
      modeId: mode,
      attributeOptimizerId: spatial
        ? "pmd85-vertical-spatial-detail-v2"
        : "pmd85-cell-v1",
      background: { r: 0, g: 0, b: 0 },
      attributeHeight: hardwareMode === "pmd85-colorace" ? 2 : 1,
      screenFlickerSuppression: false,
      paletteSelections: [{
        screenIndex: 0,
        enabledColorIds: retainPaletteSelection && retainedIds.length > 0
          ? retainedIds
          : availableIds,
      }],
      pmd85: {
        mode: hardwareMode,
        paletteCalibrationId: calibrationId,
        gapPolicy: pmd85GapPolicy,
      },
    });
    let settings: ConversionSettings;
    if (spatial) {
      settings = {
        ...retargeted,
        ditherEngineId: verticalSpatialDitherEngine(style.dithering),
        dithering: style.dithering,
        ditheringAmount: style.ditheringAmount,
        verticalSpatialMix: {
          schemaVersion: 1,
          algorithmId: "vertical-spatial-pmd-detail-v2",
          calibrationId: "srgb-ideal-v1",
          swapRows: verticalSpatialSwapRows,
        },
      };
    } else {
      const { verticalSpatialMix: _discarded, ...withoutSpatial } = retargeted;
      settings = withoutSpatial;
    }
    const engines = resolveEnginePreferencesForTarget(
      { platformId: "pmd-85", modeId: mode },
      { attributeOptimizerId: settings.attributeOptimizerId, ditherEngineId: settings.ditherEngineId },
      settings.dithering,
    );
    return {
      ...settings,
      ...engines,
      dithering: ditherMethodForEngine(engines.ditherEngineId),
    };
  }

  function applyHardwareModeSettings(next: ConversionSettings): void {
    // A hardware-mode change owns only hardware constraints. In particular it
    // must not route through applySettings(), which also applies preset-owned
    // framing, crop, resampling, and source image adjustments.
    setTargetModeId(next.modeId);
    setOutputPreviewStage(
      defaultOutputPreviewStage(
        next.modeId,
        targetProducesMultipleFrames(next.platformId, next.modeId),
      ),
    );
    setAttributeOptimizerId(next.attributeOptimizerId);
    if (next.verticalSpatialMix !== undefined) {
      setVerticalSpatialSwapRows(next.verticalSpatialMix.swapRows ?? (
        next.attributeOptimizerId === "pmd85-vertical-spatial-detail-v2" ||
        next.attributeOptimizerId === "zx-vertical-spatial-detail-v1"
      ));
    }
    setAttributeHeight(next.attributeHeight);
    setScreenFlickerSuppression(next.screenFlickerSuppression);
    setDitherEngineId(next.ditherEngineId);
    setDithering(next.dithering);
    if (next.modeId.includes("vertical-spatial")) {
      setAmountEntry(String(next.ditheringAmount));
      setOutputPreviewStage("screen-1");
      if (sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2") {
        setSourcePreviewContent("image");
      }
      setResultPreviewContent("screen-1");
    } else if (ditherEngineId.startsWith("vertical-spatial-")) {
      setAmountEntry(String(next.ditheringAmount));
    }
    setPaletteSelections(next.paletteSelections.map((selection) => ({
      ...selection,
      enabledColorIds: [...selection.enabledColorIds],
    })));
    setZxPaletteDefinition(next.zxPalette ?? DEFAULT_CONVERSION_SETTINGS.zxPalette);
    if (next.platformId === "pmd-85") {
      setPmd85PaletteCalibrationId(next.pmd85.paletteCalibrationId);
      setPmd85GapPolicy(next.pmd85.gapPolicy);
    }
    setState({ kind: "idle" });
  }

  async function switchTargetMode(mode: TargetModeId) {
    if (String(mode).startsWith("pmd85-")) {
      const pmdMode = mode as Pmd85TargetModeId;
      const currentProfile = profiles.find((candidate) => candidate.id === selectedProfileId) ?? BUILT_IN_PROFILE;
      const profile = currentProfile.platform_id === "pmd-85" && currentProfile.palette.modes[pmdMode] !== undefined
        ? currentProfile
        : profiles.find((candidate) =>
            candidate.platform_id === "pmd-85" &&
            candidate.palette.modes[pmdMode] !== undefined
          ) ?? BUILT_IN_PROFILE;
      const preset = profile.presets.find((candidate) => candidate.id === selectedPresetId) ?? profile.presets[0];
      if (preset === undefined || profile.platform_id !== "pmd-85") return;
      // Hardware interpretation is independent from the active conversion
      // recipe. Retarget the current settings so framing, resampling, crop,
      // rotation, image adjustments, and dithering survive mode changes.
      const nextSettings = pmdSettingsForMode(
        profile,
        conversionSettings,
        pmdMode,
      );
      setSelectedProfileId(profile.id);
      setSelectedPresetId(preset.id);
      applyHardwareModeSettings(nextSettings);
      setWorkspaceMode("palette");
      const raw = image?.format === "pmd85-bin" ? sourceArtifact?.bytes : undefined;
      if (raw !== undefined && workerRef.current !== null && !pmdMode.includes("vertical-spatial")) {
        try {
          const colors = profileModeScreens(
            profile,
            pmdMode,
            nextSettings.pmd85.paletteCalibrationId,
          )[0]?.colors.map((color) => hexToRgb(color.normal)) ?? [];
          const imported = await workerRef.current.decodePmd85(
            Uint8Array.from(raw).buffer,
            pmdHardwareModeForTarget(pmdMode),
            colors,
            nextSettings.pmd85.paletteCalibrationId,
          );
          const direct = directPmd85Result(imported, {
            ...nextSettings,
            pmd85: { ...nextSettings.pmd85, gapPolicy: "preserve-imported" },
          });
          pendingOpenedFinalRef.current = {
            result: direct,
            completedAtUtc: new Date().toISOString(),
          };
          setPmd85GapPolicy("preserve-imported");
          setImage(imported.image);
          setOriginalImage({ ...imported.image, rgba: imported.image.rgba.slice() });
          setLastFinal(direct);
          setState({ kind: "ready", result: direct });
          setDraftState({ kind: "idle" });
          setResultOrigin("direct-import");
          setImageStatus(
            `Raw PMD 85 source reinterpreted as ${pmdMode}; original 16 KiB remains unchanged.`,
          );
        } catch (error: unknown) {
          setState({
            kind: "error",
            message: error instanceof Error ? error.message : "PMD 85 reinterpretation failed.",
          });
        }
      }
      return;
    }
    const cacheKey = `${selectedProfileId}:${targetModeId}`;
    paletteModeCacheRef.current.set(
      cacheKey,
      paletteSelections.map((selection) => ({
        ...selection,
        enabledColorIds: [...selection.enabledColorIds],
      })),
    );
    const nextKey = `${selectedProfileId}:${mode}`;
    const cached = paletteModeCacheRef.current.get(nextKey);
    const isZxMode = mode.startsWith("zx48-");
    const profile = profiles.find((candidate) => candidate.id === selectedProfileId) ??
      BUILT_IN_PROFILE;
    const modePalette = profile.palette.modes[mode];
    const screenCount = modePalette?.screen_count ?? outputScreenCount(mode);
    const sourceSelection = paletteSelections[0] ??
      DEFAULT_CONVERSION_SETTINGS.paletteSelections[0]!;
    const initial = cached ?? Array.from({ length: screenCount }, (_, screenIndex) => {
      const availableColorIds =
        modePalette?.screens[screenIndex]?.colors.map((color) => color.id) ??
        modePalette?.screens[0]?.colors.map((color) => color.id) ??
        DEFAULT_CONVERSION_SETTINGS.paletteSelections[0]!.enabledColorIds;
      const availableColorSet = new Set(availableColorIds);
      const filtered = sourceSelection.enabledColorIds.filter((color) =>
        availableColorSet.has(color)
      );
      return {
        screenIndex,
        enabledColorIds: filtered.length > 0
          ? filtered
          : [...availableColorIds],
        ...(isZxMode
          ? { brightMode: sourceSelection.brightMode ?? "auto" }
          : {}),
      };
    });
    const nextPaletteSelections = initial.map((selection, screenIndex): PaletteSelection =>
      isZxMode
        ? {
            screenIndex,
            enabledColorIds: [...selection.enabledColorIds],
            brightMode: selection.brightMode ?? "auto",
          }
        : {
            screenIndex,
            enabledColorIds: [...selection.enabledColorIds],
          }
    );
    const spatial = mode.includes("vertical-spatial");
    const retargeted = retargetHardwareModeSettings(
      conversionSettings,
      {
        modeId: mode,
        attributeOptimizerId: spatial
          ? isZxMode
            ? "zx-vertical-spatial-uniform-v1"
            : "ql-vertical-spatial-uniform-v1"
          : conversionSettings.attributeOptimizerId.includes("vertical-spatial")
            ? "zx-adaptive-v1"
            : conversionSettings.attributeOptimizerId,
        attributeHeight: mode === "zx48-vertical-spatial-256x192"
          ? 1
          : conversionSettings.attributeHeight,
        paletteSelections: nextPaletteSelections,
      },
    );
    const engines = resolveEnginePreferencesForTarget(
      { platformId: retargeted.platformId, modeId: mode },
      { attributeOptimizerId: retargeted.attributeOptimizerId, ditherEngineId: retargeted.ditherEngineId },
      retargeted.dithering,
    );
    applyHardwareModeSettings({
      ...retargeted,
      ...engines,
      dithering: ditherMethodForEngine(engines.ditherEngineId),
    });
  }

  function selectHardwareModeFromMenu(mode: TargetModeId): void {
    void switchTargetMode(mode);
    if (
      isZx && mode === "zx48-mixed-256x192" &&
      (attributeOptimizerId === "zx-block-dbs-global-v1" ||
        attributeOptimizerId === "zx-structured-global-v1" ||
        attributeOptimizerId === "zx-structured-global-v2" ||
        attributeOptimizerId === "zx-structured-global-v3" ||
        attributeOptimizerId === "zx-structured-global-v4")
    ) {
      setAttributeOptimizerId("zx-guide-reference-halo-v2");
      setDitherEngineId(dithering === "ordered"
        ? "ordered-mixed-phase-stable-v8"
        : latestDitherEngineForMethod(dithering));
    }
  }

  async function changePmd85Calibration(calibrationId: string): Promise<void> {
    setPmd85PaletteCalibrationId(calibrationId);
    const raw = image?.format === "pmd85-bin" ? sourceArtifact?.bytes : undefined;
    if (!isPmd || raw === undefined || workerRef.current === null) {
      setState({ kind: "idle" });
      return;
    }
    try {
      const colors = profileModeScreens(
        selectedProfile,
        targetModeId,
        calibrationId,
      )[0]?.colors.map((color) => hexToRgb(color.normal)) ?? [];
      const imported = await workerRef.current.decodePmd85(
        Uint8Array.from(raw).buffer,
        targetModeId as Pmd85ModeId,
        colors,
        calibrationId,
      );
      const settings: ConversionSettings = {
        ...conversionSettings,
        pmd85: {
          ...conversionSettings.pmd85,
          paletteCalibrationId: calibrationId,
          gapPolicy: "preserve-imported",
        },
      };
      const direct = directPmd85Result(imported, settings);
      pendingOpenedFinalRef.current = {
        result: direct,
        completedAtUtc: new Date().toISOString(),
      };
      setImage(imported.image);
      setOriginalImage({ ...imported.image, rgba: imported.image.rgba.slice() });
      setLastFinal(direct);
      setState({ kind: "ready", result: direct });
      setDraftState({ kind: "idle" });
      setResultOrigin("direct-import");
    } catch (error: unknown) {
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "PMD 85 calibration failed.",
      });
    }
  }

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

  function workspaceProfileSnapshotKey(layout: SavedWorkbenchLayout): string {
    return JSON.stringify({ workspaceMode: layout.workspaceMode, workspace: layout.workspace, workbench: layout.workbench });
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
      ...(["tilemap", "source", "result"] as const).filter((window) => !savedWindowOrder.includes(window)),
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
      Object.entries(saved.workbench.windowLayouts ?? startupWorkbenchPreferences.windowLayouts)
        .map(([window, layout]) => [window, { ...layout, visible: layout.visible ?? true }]),
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

  function markPanSource(side: PreviewSide) {
    activePanSideRef.current = side;
    setPreviewZoom(side === "source" ? sourcePreviewZoom : resultPreviewZoom);
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

  function tilemapCellAtCanvasPoint(event: ReactPointerEvent<HTMLCanvasElement>): readonly [number, number] {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pixelX = Math.max(0, Math.min(255, Math.floor((event.clientX - bounds.left) / bounds.width * 256)));
    const pixelY = Math.max(0, Math.min(191, Math.floor((event.clientY - bounds.top) / bounds.height * 192)));
    return [Math.floor(pixelX / 8), Math.floor(pixelY / 8)];
  }

  function stampCellsForActiveGesture(cellIndices: readonly number[]): void {
    const gesture = tilemapPutPointerRef.current;
    if (gesture === null || charsetState.kind !== "ready") return;
    const newCells = cellIndices.filter((index) => {
      if (gesture.visited.has(index)) return false;
      gesture.visited.add(index);
      return true;
    });
    if (newCells.length === 0) return;
    const result = charsetState.result;
    const stamped = stampTilemapCells(result.assignments, result.attributes, newCells, gesture.stamp);
    if (!stamped.changed) return;
    if (!gesture.historyCaptured) {
      pushTileEditorHistory(result);
      gesture.historyCaptured = true;
    }
    commitTileEditorResult(
      result,
      result.charset,
      stamped.assignments,
      result.encoding,
      stamped.attributes,
    );
  }

  function handleTilemapPutPointerDown(event: ReactPointerEvent<HTMLCanvasElement>): void {
    if (!tilemapPutActive || workspaceMode !== "tilemap" || unifiedTileEditorContext !== "stamp" || charsetState.kind !== "ready") return;
    if (event.button !== 0 || tileStampDraft.characterIndex === null) return;
    const [cellX, cellY] = tilemapCellAtCanvasPoint(event);
    const stamp: TilemapStamp = {
      characterIndex: tileStampDraft.characterIndex,
      transform: tileStampDraft.transform,
      inverted: tileStampDraft.inverted,
      attribute: tileStampDraft.attribute,
    };
    tilemapPutPointerRef.current = {
      pointerId: event.pointerId,
      stamp,
      visited: new Set(),
      lastX: cellX,
      lastY: cellY,
      historyCaptured: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    stampCellsForActiveGesture([cellY * 32 + cellX]);
    event.preventDefault();
    event.stopPropagation();
  }

  function handleTilemapPutPointerMove(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const gesture = tilemapPutPointerRef.current;
    if (!tilemapPutActive || gesture === null || gesture.pointerId !== event.pointerId) return;
    const [cellX, cellY] = tilemapCellAtCanvasPoint(event);
    let x = gesture.lastX;
    let y = gesture.lastY;
    const dx = Math.abs(cellX - x);
    const sx = x < cellX ? 1 : -1;
    const dy = -Math.abs(cellY - y);
    const sy = y < cellY ? 1 : -1;
    let error = dx + dy;
    const cells: number[] = [];
    while (true) {
      cells.push(y * 32 + x);
      if (x === cellX && y === cellY) break;
      const doubled = 2 * error;
      if (doubled >= dy) { error += dy; x += sx; }
      if (doubled <= dx) { error += dx; y += sy; }
    }
    gesture.lastX = cellX;
    gesture.lastY = cellY;
    stampCellsForActiveGesture(cells);
    event.preventDefault();
    event.stopPropagation();
  }

  function handleTilemapPutPointerEnd(event: ReactPointerEvent<HTMLCanvasElement>): void {
    const gesture = tilemapPutPointerRef.current;
    if (gesture === null || gesture.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    tilemapPutPointerRef.current = null;
    event.preventDefault();
    event.stopPropagation();
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

  function handleInspectorKey(event: ReactKeyboardEvent<HTMLCanvasElement>) {
    const delta = event.shiftKey ? 8 : 1;
    const currentX = inspection?.pixelX ?? 0;
    const currentY = inspection?.pixelY ?? 0;
    const next = {
      ArrowLeft: [currentX - delta, currentY],
      ArrowRight: [currentX + delta, currentY],
      ArrowUp: [currentX, currentY - delta],
      ArrowDown: [currentX, currentY + delta],
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    inspectActivePixel(next[0] ?? currentX, next[1] ?? currentY);
  }

  function syncMatrixEditorFromSelection(
    patternId: ConversionSettings["composer"]["patternId"] | OrderedMatrixId,
  ) {
    if (patternId in ORDERED_MATRICES) {
      const matrix = ORDERED_MATRICES[patternId as OrderedMatrixId];
      setCustomMatrixWidthEntry(String(matrix.width));
      setCustomMatrixHeightEntry(String(matrix.height));
      setCustomMatrixValuesEntry(formatMatrixValues(matrix.values));
      setCustomPatternError(null);
      return;
    }
    const customMatrix = customOrderedMatrices.find((candidate) => candidate.id === patternId);
    if (customMatrix === undefined) return;
    setCustomMatrixWidthEntry(String(customMatrix.width));
    setCustomMatrixHeightEntry(String(customMatrix.height));
    setCustomMatrixValuesEntry(formatMatrixValues(customMatrix.values));
    setCustomPatternError(null);
  }

  function syncKernelEditorFromSelection(
    propagationId: ConversionSettings["composer"]["propagationId"],
  ) {
    if (propagationId === "none") {
      setCustomKernelEntryText("");
      setCustomPatternError(null);
      return;
    }
    if (propagationId.startsWith("custom-diffusion-")) {
      const customKernel = customDiffusionKernels.find((candidate) => candidate.id === propagationId);
      if (customKernel === undefined) return;
      setCustomKernelEntryText(formatKernelEntries(customKernel.entries));
      setCustomPatternError(null);
      return;
    }
    const entries = propagationId === "error-diffusion-unrestricted-v2"
      ? [
          [1, 0, 7],
          [-1, 1, 3],
          [0, 1, 5],
          [1, 1, 1],
        ] as const
      : propagationId === "error-diffusion-decorrelated-v3"
        ? decorrelatedDiffusionKernel(1)
        : propagationId === "error-diffusion-atkinson-v1"
          ? atkinsonDiffusionKernel(1)
          : propagationId === "error-diffusion-checker-phase-v4-3"
            ? checkerPhaseV43DiffusionKernel(1, 0, 0, errorDiffusionLineSuppression, 0)
            : propagationId === "error-diffusion-checker-phase-v5"
              ? checkerPhaseV5DiffusionKernel(1, 0, 0, errorDiffusionLineSuppression, 0, 2)
              : phaseBalancedDiffusionKernel(1, 0, 0, errorDiffusionLineSuppression, 0);
    setCustomKernelEntryText(formatKernelEntries(entries));
    setCustomPatternError(null);
  }

  function switchDithering(method: DitheringMethod) {
    if (targetModeId.includes("vertical-spatial")) {
      setDithering(method);
      setDitherEngineId(
        method === "none"
          ? "vertical-spatial-none-v1"
          : method === "ordered"
            ? "vertical-spatial-ordered-v1"
            : "vertical-spatial-error-diffusion-v1",
      );
      setState({ kind: "idle" });
      return;
    }
    setDithering(method);
    if (
      (
        attributeOptimizerId === "zx-structured-global-v1" ||
        attributeOptimizerId === "zx-structured-global-v2" ||
        attributeOptimizerId === "zx-structured-global-v3" ||
        attributeOptimizerId === "zx-structured-global-v4"
      ) &&
      method === "ordered"
    ) {
      setDitherEngineId(
        attributeOptimizerId === "zx-structured-global-v4"
          ? "ordered-cell-pattern-v4"
          : attributeOptimizerId === "zx-structured-global-v3"
          ? "ordered-cell-pattern-v3"
          : attributeOptimizerId === "zx-structured-global-v2"
            ? "ordered-cell-pattern-v2"
            : "ordered-cell-pattern-v1",
      );
    } else if (
      attributeOptimizerId === "zx-block-dbs-global-v1" &&
      method === "ordered"
    ) {
      setDitherEngineId("pattern-legal-mask-dbs-v1");
    } else {
      if (
        attributeOptimizerId === "zx-structured-global-v1" ||
        attributeOptimizerId === "zx-structured-global-v2" ||
        attributeOptimizerId === "zx-structured-global-v3" ||
        attributeOptimizerId === "zx-structured-global-v4" ||
        attributeOptimizerId === "zx-block-dbs-global-v1"
      ) {
        setAttributeOptimizerId("zx-guide-reference-halo-v1");
      }
      const retained = ditherEngineByMethodRef.current[method];
      const compatible = DITHER_ENGINES.some((engine) =>
        engine.id === retained &&
        engine.method === method &&
        engine.platforms.includes(selectedPlatformId as never) &&
        (engine.targetModeIds === undefined || engine.targetModeIds.includes(targetModeId)) &&
        (targetModeId !== "zx48-mixed-256x192" || !("family" in engine))
      );
      const fallback: Record<DitheringMethod, DitherEngineId> = {
        none: "none-discrete-v2",
        ordered: targetModeId === "zx48-mixed-256x192"
          ? "ordered-mixed-phase-stable-v8"
          : "ordered-strict-matrix-v6",
        "error-diffusion": "error-diffusion-decorrelated-v3",
      };
      setDitherEngineId(compatible && retained !== undefined
        ? retained
        : fallback[method]);
    }
    setState({ kind: "idle" });
  }

  function selectDitherEngine(id: DitherEngineId) {
    setDitherEngineId(id);
    setDithering(ditherMethodForEngine(id));
    const selectedEngine = DITHER_ENGINES.find((engine) => engine.id === id);
    const supportedMatrices = selectedEngine?.orderedMatrixIds ?? ORDERED_MATRIX_IDS.slice(0, 4);
    if (!supportedMatrices.includes(orderedMatrix)) {
      const nextMatrix = supportedMatrices[0] ?? "checkerboard-2x1";
      setOrderedMatrix(nextMatrix);
      syncMatrixEditorFromSelection(nextMatrix);
    }
    if (id === "pattern-legal-mask-dbs-v1") {
      setAttributeOptimizerId("zx-block-dbs-global-v1");
    } else if (
      id === "ordered-cell-pattern-v1" ||
      id === "ordered-cell-pattern-v2" ||
      id === "ordered-cell-pattern-v3" ||
      id === "ordered-cell-pattern-v4"
    ) {
      const isVersion4 = id === "ordered-cell-pattern-v4";
      const isVersion3 = id === "ordered-cell-pattern-v3";
      const isVersion2 = id === "ordered-cell-pattern-v2";
      setAttributeOptimizerId(
        isVersion4
          ? "zx-structured-global-v4"
          : isVersion3
          ? "zx-structured-global-v3"
          : isVersion2
            ? "zx-structured-global-v2"
            : "zx-structured-global-v1",
      );
      setStructuredSettings((current) => ({
        ...current,
        ditherResponseCurveId: isVersion2 || isVersion3 || isVersion4
          ? "power-035-percent-v2"
          : "power-065-percent-v1",
        colorAnchorModelId: isVersion3 || isVersion4
          ? "srgb-squared-v1"
          : "none-v1",
        structuralModelId: isVersion4
          ? "palette-topology-v1"
          : "none-v1",
        objectiveWeights: isVersion4
          ? {
              ...current.objectiveWeights,
              pixel: 192,
              rgbAnchor: 2048,
              patternReference: 1536,
              paletteDistribution: 1024,
              luminanceRank: 512,
              edgePolarity: 768,
              mean: 768,
              sharedEndpoint: 0,
            }
          : isVersion2 || isVersion3
          ? {
              ...current.objectiveWeights,
              pixel: 192,
              rgbAnchor: isVersion3 ? 6144 : 0,
              patternReference: 0,
              paletteDistribution: 0,
              luminanceRank: 0,
              edgePolarity: 0,
              mean: 2048,
            }
          : {
              ...current.objectiveWeights,
              pixel: 1024,
              rgbAnchor: 0,
              patternReference: 0,
              paletteDistribution: 0,
              luminanceRank: 0,
              edgePolarity: 0,
              mean: 256,
            },
        candidateParameters: {
          ...current.candidateParameters,
          localAdmissibilityPermille: isVersion4 ? 100 : 1000,
          boundaryCapPermille: isVersion4 ? 100 : 1000,
        },
      }));
    } else if (
      attributeOptimizerId === "zx-structured-global-v1" ||
      attributeOptimizerId === "zx-structured-global-v2" ||
      attributeOptimizerId === "zx-structured-global-v3" ||
      attributeOptimizerId === "zx-structured-global-v4" ||
      attributeOptimizerId === "zx-block-dbs-global-v1"
    ) {
      setAttributeOptimizerId("zx-guide-reference-halo-v2");
    }
    setState({ kind: "idle" });
  }

  function applySettings(
    next: ConversionSettings,
    sourceImage: WorkerDecodedImage | null = image,
  ) {
    setFraming(next.framing);
    setTargetModeId(next.modeId);
    setOutputPreviewStage(
      defaultOutputPreviewStage(
        next.modeId,
        targetProducesMultipleFrames(next.platformId, next.modeId),
      ),
    );
    setAttributeOptimizerId(next.attributeOptimizerId);
    if (next.verticalSpatialMix !== undefined) {
      setVerticalSpatialSwapRows(next.verticalSpatialMix.swapRows ?? (
        next.attributeOptimizerId === "pmd85-vertical-spatial-detail-v2" ||
        next.attributeOptimizerId === "zx-vertical-spatial-detail-v1"
      ));
    }
    setDitherEngineId(next.ditherEngineId);
    setQlMixedOptimizerId(next.qlMixedOptimizerId);
    setResampling(next.resampling);
    setRotation(next.rotation);
    setMirrorHorizontal(next.mirrorHorizontal);
    setMirrorVertical(next.mirrorVertical);
    setFillOffsetX(next.fillOffsetX);
    setFillOffsetY(next.fillOffsetY);
    setPanOffsetX(next.panOffsetX);
    setPanOffsetY(next.panOffsetY);
    setPanEdgeMode(next.panEdgeMode);
    setBackground(next.background);
    if (sourceImage === null) {
      setCropEntries(next.crop);
    } else {
      const source = orientedSourceSize(
        sourceImage.width,
        sourceImage.height,
        next.rotation,
      );
      setCropEntries(clampPixelCrop(next.crop, source));
    }
    setCropAspectRatio(next.cropAspectRatio);
    setBrightness(next.brightness);
    setContrast(next.contrast);
    setSaturation(next.saturation);
    setHueShift(next.hueShift ?? 0);
    setHslSaturation(next.hslSaturation ?? 0);
    setLightness(next.lightness ?? 0);
    setColorize(next.colorize ?? false);
    setGamma(next.gamma);
    setSmoothing(next.smoothing ?? DEFAULT_CONVERSION_SETTINGS.smoothing);
    setSharpening(next.sharpening ?? DEFAULT_CONVERSION_SETTINGS.sharpening);
    setBorderColor(next.borderColor ?? DEFAULT_CONVERSION_SETTINGS.borderColor);
    const nextAttributeHeight =
      next.attributeHeight ?? DEFAULT_CONVERSION_SETTINGS.attributeHeight;
    setAttributeHeight(nextAttributeHeight);
    setAttributeSmoothing(
      next.attributeSmoothing ?? DEFAULT_CONVERSION_SETTINGS.attributeSmoothing,
    );
    setAttributeHaloInfluence(
      next.attributeHaloInfluence ??
      DEFAULT_CONVERSION_SETTINGS.attributeHaloInfluence,
    );
    setAttributeHaloHorizontal(
      next.attributeHaloHorizontal ??
      DEFAULT_CONVERSION_SETTINGS.attributeHaloHorizontal,
    );
    setAttributeHaloVertical(
      nextAttributeHeight >= 4
        ? next.attributeHaloVertical ?? DEFAULT_CONVERSION_SETTINGS.attributeHaloVertical
        : 0,
    );
    setScreenFlickerSuppression(
      next.screenFlickerSuppression ??
      DEFAULT_CONVERSION_SETTINGS.screenFlickerSuppression,
    );
    setZxMixedAttributesOnly(next.zxMixedAttributesOnly ?? false);
    setPaletteSelections(next.paletteSelections.map((selection) => ({
      ...selection,
      enabledColorIds: [...selection.enabledColorIds],
    })));
    setZxPaletteDefinition(next.zxPalette ?? DEFAULT_CONVERSION_SETTINGS.zxPalette);
    setDithering(next.dithering);
    if (next.dithering !== "none" || next.ditheringAmount > 0) {
      setAmountEntry(String(next.ditheringAmount));
    }
    setErrorDiffusionRandomization(
      next.errorDiffusionRandomization ??
      DEFAULT_CONVERSION_SETTINGS.errorDiffusionRandomization,
    );
    setErrorDiffusionLineSuppression(
      next.errorDiffusionLineSuppression ??
      DEFAULT_CONVERSION_SETTINGS.errorDiffusionLineSuppression,
    );
    setOrderedMatrix(next.orderedMatrix);
    setArtisticPattern(next.artisticPattern ?? "auto");
    setCustomOrderedMatrices(next.customOrderedMatrices ?? DEFAULT_CONVERSION_SETTINGS.customOrderedMatrices);
    setCustomDiffusionKernels(next.customDiffusionKernels ?? DEFAULT_CONVERSION_SETTINGS.customDiffusionKernels);
    setComposer(next.composer ?? DEFAULT_CONVERSION_SETTINGS.composer);
    setStructuredSettings(next.structured);
    setPmd85PaletteCalibrationId(next.pmd85.paletteCalibrationId);
    setPmd85GapPolicy(next.pmd85.gapPolicy);
    if (next.modeId.includes("vertical-spatial")) {
      setOutputPreviewStage("screen-1");
      if (sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2") {
        setSourcePreviewContent("image");
      }
      setResultPreviewContent("screen-1");
      setAmountEntry(String(next.ditheringAmount));
    }
    setState({ kind: "idle" });
  }

  function selectProfile(profileId: string) {
    const profile = profiles.find((candidate) => candidate.id === profileId) ?? BUILT_IN_PROFILE;
    const preset = profile.presets[0];
    setSelectedProfileId(profile.id);
    if (preset !== undefined) {
      setSelectedPresetId(preset.id);
      applySettings(preset.settings);
    }
  }

  function selectPreset(presetId: string) {
    const profile = profiles.find((candidate) => candidate.id === selectedProfileId) ?? BUILT_IN_PROFILE;
    const preset = profile.presets.find((candidate) => candidate.id === presetId);
    if (preset === undefined) return;
    setSelectedPresetId(preset.id);
    applySettings(
      profile.platform_id === "pmd-85" && String(targetModeId).startsWith("pmd85-")
        ? pmdSettingsForMode(
            profile,
            preset.settings,
            targetModeId as Pmd85ModeId,
            pmd85PaletteCalibrationId,
            true,
          )
        : preset.settings,
    );
  }

  function openApplicationSettings(): void {
    const draft = createSettingsDraft({
      ...conversionSettings,
      orderedMatrix,
      customOrderedMatrices,
      customDiffusionKernels,
      composer,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      verticalSpatialSwapRows,
      pmd85PaletteCalibrationId,
      pmd85GapPolicy,
      profileId: selectedProfileId,
      presetId: selectedPresetId,
      modeId: targetModeId,
      framing,
      dithering,
      ditheringAmount: Number(amountEntry) || 0,
      workspaceLayout: startupWorkspaceLayout,
      mouseWheelZoom,
      synchronizePan,
      synchronizeZoom,
      developmentMode,
      exportBorderEnabled,
      exportBorderWidth,
      exportBorderColor,
      exportZoomFactor,
      ...uiTypography,
    });
    setSettingsDraft(draft as ApplicationSettings & Record<string, unknown>);
    setSettingsBaseline(draft);
    setSettingsSearch("");
    setSettingsCategory("all");
    setSettingsPreset("all");
    setSettingsOpen(true);
  }

  function saveApplicationSettingsDraft(): void {
    if (settingsDraft === null) return;
    const validation = validateSettingsDraft(settingsDraft);
    if (Object.keys(validation.errors).length > 0) return;
    const canonical = canonicalizeSettingsForSave({
      draft: validation.values,
      current: conversionSettings,
      profiles,
    });
    setExportBorderEnabled(canonical.application.exportBorderEnabled);
    setExportBorderWidth(canonical.application.exportBorderWidth);
    setExportBorderColor(canonical.application.exportBorderColor);
    setExportZoomFactor(canonical.application.exportZoomFactor);
    const conversionChanged = canonicalJsonStringify(canonical.conversion) !== canonicalJsonStringify(conversionSettings);
    if (conversionChanged) {
      finalJobRef.current += 1;
      finalRunningRef.current = false;
      workerRef.current?.dispose();
      workerRef.current = new ConversionWorkerClient();
      draftWorkerRef.current?.dispose();
      draftWorkerRef.current = null;
      setDraftState({ kind: "idle" });
    }
    setSelectedProfileId(canonical.profile.id);
    setSelectedPresetId(canonical.application.presetId);
    if (conversionChanged) {
      applySettings(canonical.conversion);
      setBackground(canonical.conversion.background);
      setDitherEngineId(canonical.conversion.ditherEngineId);
      setDithering(canonical.conversion.dithering);
      setAmountEntry(String(canonical.conversion.ditheringAmount));
    }
    setMouseWheelZoom(canonical.application.mouseWheelZoom);
    setSynchronizePan(canonical.application.synchronizePan);
    setSynchronizeZoom(canonical.application.synchronizeZoom);
    setDevelopmentMode(canonical.application.developmentMode);
    setUiTypography({
      uiFontFamily: canonical.application.uiFontFamily,
      windowTitleFontSize: canonical.application.windowTitleFontSize,
      windowTitleFontWeight: canonical.application.windowTitleFontWeight,
      uiLabelFontSize: canonical.application.uiLabelFontSize,
      uiLabelFontWeight: canonical.application.uiLabelFontWeight,
      uiBodyFontSize: canonical.application.uiBodyFontSize,
      uiBodyFontWeight: canonical.application.uiBodyFontWeight,
    });
    const nextStartupLayout = normalizeStartupWorkspaceLayout(canonical.application.workspaceLayout);
    setStartupWorkspaceLayout(nextStartupLayout);
    applyWorkspaceLayout(nextStartupLayout);
    setSettingsOpen(false);
    setSettingsDraft(null);
    setSettingsBaseline(null);
    saveApplicationSettings(localStorage, canonical.application);
    return;
  }

  function switchWorkspaceConversionMode(next: WorkspaceConversionMode) {
    if (next === workspaceMode) return;
    finalJobRef.current += 1;
    finalRunningRef.current = false;
    workerRef.current?.dispose();
    workerRef.current = new ConversionWorkerClient();
    charsetWorkerRef.current?.dispose();
    charsetWorkerRef.current = null;
    pendingModeHighRef.current = next;
    setWorkspaceMode(next);
    setOutputPreviewStage(next === "palette"
      ? defaultOutputPreviewStage(
          targetModeId,
          targetProducesMultipleFrames(selectedPlatformId, targetModeId),
        )
      : "merged");
    setInspection(null);
    if (next === "tilemap") {
      // Entering Tilemap mode directly from the conversion-mode selector must
      // reveal the existing Tilemap settings window. The workspace preset
      // already does this, but a direct mode switch otherwise leaves the
      // persisted minimized/closed state showing an empty shell.
      setWorkbenchWindowLayouts((current) => ({
        ...current,
        tilemap: {
          ...current.tilemap,
          minimized: false,
          open: true,
        },
      }));
      setWorkbenchSectionsOpen((current) => ({
        ...current,
        tilemap: true,
      }));
      setWorkbenchSettingsMinimized(false);
      if (selectedPlatformId !== "zx-spectrum") {
        const cached = lastZxSettingsRef.current;
        const cachedProfile = profiles.find((profile) =>
          profile.id === cached.profileId &&
          profile.platform_id === "zx-spectrum");
        setSelectedProfileId(cachedProfile?.id ?? BUILT_IN_PROFILE_ID);
        setSelectedPresetId(
          cachedProfile?.presets[0]?.id ??
          BUILT_IN_PROFILE.presets[0]?.id ??
          "default",
        );
        applySettings({
          ...cached,
          profileId: cachedProfile?.id ?? BUILT_IN_PROFILE_ID,
          platformId: "zx-spectrum",
          modeId: "zx48-standard-256x192",
          attributeHeight: 8,
          paletteSelections: [cached.paletteSelections[0] ??
            DEFAULT_CONVERSION_SETTINGS.paletteSelections[0]!],
        });
      }
      setTargetModeId("zx48-standard-256x192");
      setAttributeHeight(8);
      setTilemapStale(charsetState.kind === "ready");
      setSourcePreviewContent("unified-editor");
      setResultPreviewContent("image");
    }
  }

  async function runEngineBenchmark() {
    if (!developmentMode || image === null || !settingsValid || benchmarkRunning) return;
    const benchmarkContextKeyAtStart = currentBenchmarkContextKey;
    const benchmarkRun = benchmarkRunRef.current + 1;
    benchmarkRunRef.current = benchmarkRun;
    setBenchmarkOpen(true);
    setBenchmarkRunning(true);
    setExportError(null);
    benchmarkWorkerRef.current?.dispose();
    const benchmarkWorker = new ConversionWorkerClient();
    benchmarkWorkerRef.current = benchmarkWorker;
    try {
      const optimizers = selectedPlatformId === "zx-spectrum"
        ? ATTRIBUTE_OPTIMIZERS
          .filter((engine) =>
            (includeExperimentalEngines || engine.lifecycle !== "experimental") &&
            (
              engine.targetModeIds === undefined ||
              engine.targetModeIds.includes(targetModeId)
            ) &&
            (
              targetModeId !== "zx48-mixed-256x192" ||
              !("family" in engine)
            )
          )
          .map(({ id }) => id)
        : [attributeOptimizerId];
      const qlMixedOptimizers = qlMixedOptimizersForBenchmark(
        selectedPlatformId,
        targetModeId,
        qlMixedOptimizerId,
      );
      const ditherEngines = DITHER_ENGINES.filter((candidate) =>
        candidate.platforms.includes(selectedPlatformId as never) &&
        (
          candidate.targetModeIds === undefined ||
          candidate.targetModeIds.includes(targetModeId)
        ) &&
        (includeExperimentalEngines || candidate.lifecycle !== "experimental" ||
          (isPmd && candidate.id === "ordered-void-cluster-v1"))
      );
      if (includeExperimentalEngines) {
        assertExperimentalBenchmarkCoverage(
          selectedPlatformId,
          targetModeId,
          optimizers,
          ditherEngines.map((engine) => engine.id),
        );
      }
      const rows: Omit<ConversionBenchmarkRow, "classification">[] = [];
      for (const optimizerId of optimizers) {
        for (const mixedOptimizerId of qlMixedOptimizers) {
        for (const engine of ditherEngines) {
          if (
            selectedPlatformId === "zx-spectrum" &&
            !isCompatibleEnginePair(optimizerId, engine.id)
          ) continue;
          const matrixEffective =
            engine.method === "ordered" && engine.family === undefined &&
            engine.id !== "artistic-ordered-hybrid-v1" &&
            engine.id !== "artistic-ordered-tone-safe-v2";
          const matrices = matrixEffective
            ? engine.orderedMatrixIds ?? ORDERED_MATRIX_IDS.slice(0, 4)
            : [orderedMatrix];
          for (const matrix of matrices) {
            const started = performance.now();
            const benchmarkAmount = engine.method === "none" ? 0 : amount;
            const benchmarkStructured = structuredSettingsForOptimizer(
              optimizerId,
              conversionSettings.structured,
            );
            const result = await benchmarkWorker.convertImage(image, {
              ...conversionSettings,
              attributeOptimizerId: optimizerId,
              qlMixedOptimizerId: mixedOptimizerId,
              ditherEngineId: engine.id,
              dithering: engine.method,
              ditheringAmount: benchmarkAmount,
              orderedMatrix: matrix,
              structured: {
                ...benchmarkStructured,
                ditherAmountPermille: benchmarkAmount * 10,
              },
            }, "high", pmd85WorkerOptions);
            if (
              benchmarkRunRef.current !== benchmarkRun ||
              benchmarkContextKeyRef.current !== benchmarkContextKeyAtStart
            ) return;
            const digest = await conversionOutputDigest(result);
            rows.push({
              optimizerId,
              qlMixedOptimizerId: mixedOptimizerId,
              ditherEngineId: engine.id,
              matrix,
              matrixEffective,
              score: commonPreviewError(
                result.sourcePreviewRgba,
                result.mergedPreviewRgba,
              ),
              lowPassScore: lowPass2PreviewError(
                result.sourcePreviewRgba,
                result.mergedPreviewRgba,
              ),
              edgeScore: edgePreviewError(
                result.sourcePreviewRgba,
                result.mergedPreviewRgba,
              ),
              textureMetrics: diffusionTextureMetrics(
                result.sourcePreviewRgba,
                result.mergedPreviewRgba,
              ),
              platformScore: result.score,
              attributeBoundaryScore: selectedPlatformId === "zx-spectrum"
                ? attributeBoundaryPreviewError(
                    result.sourcePreviewRgba,
                    result.mergedPreviewRgba,
                    attributeHeight,
                  )
                : null,
              orderedPerturbationRms:
                engine.id === "ordered-coverage-normalized-v7"
                  ? orderedPerturbationDiagnostics(
                      ORDERED_MATRICES[matrix], benchmarkAmount,
                    ).rms
                  : null,
              elapsedMs: performance.now() - started,
              digest,
              aliases: [],
              result,
            });
          }
        }
        }
      }
      const completedRows = rows.map((row) => {
        if (row.ditherEngineId !== "ordered-coverage-normalized-v7") return row;
        const baseline = rows.find((candidate) =>
          ditherMethodForEngine(candidate.ditherEngineId) === "none" &&
          candidate.optimizerId === row.optimizerId &&
          candidate.qlMixedOptimizerId === row.qlMixedOptimizerId
        );
        return baseline === undefined ? row : {
          ...row,
          outputPixelChangePercent: previewPixelChangePercent(
            baseline.result.mergedPreviewRgba,
            row.result.mergedPreviewRgba,
          ),
        };
      });
      completedRows.sort((left, right) =>
        left.score - right.score ||
        left.lowPassScore - right.lowPassScore ||
        left.edgeScore - right.edgeScore ||
        left.elapsedMs - right.elapsedMs
      );
      const groupedRows: Omit<ConversionBenchmarkRow, "classification">[] = [];
      const rowByDigest = new Map<string, number>();
      for (const row of completedRows) {
        const existingIndex = rowByDigest.get(row.digest);
        if (existingIndex === undefined) {
          rowByDigest.set(row.digest, groupedRows.length);
          groupedRows.push(row);
          continue;
        }
        const existing = groupedRows[existingIndex]!;
        groupedRows[existingIndex] = {
          ...existing,
          elapsedMs: Math.min(existing.elapsedMs, row.elapsedMs),
          aliases: [
            ...existing.aliases,
            {
              optimizerId: row.optimizerId,
              qlMixedOptimizerId: row.qlMixedOptimizerId,
              ditherEngineId: row.ditherEngineId,
              matrix: row.matrix,
            },
          ],
        };
      }
      const classifications = classifyBenchmarkRows(groupedRows);
      const classifiedRows: ConversionBenchmarkRow[] = groupedRows.map(
        (row, index) => ({ ...row, classification: classifications[index]! }),
      );
      if (
        benchmarkRunRef.current === benchmarkRun &&
        benchmarkContextKeyRef.current === benchmarkContextKeyAtStart
      ) {
        setBenchmarkRows(classifiedRows);
        setBenchmarkCompareDigests([]);
      }
    } catch (error: unknown) {
      if (benchmarkRunRef.current === benchmarkRun) {
        setExportError(`Benchmark failed: ${error instanceof Error ? error.message : "Unknown error."}`);
      }
    } finally {
      benchmarkWorker.dispose();
      if (benchmarkWorkerRef.current === benchmarkWorker) {
        benchmarkWorkerRef.current = null;
      }
      if (benchmarkRunRef.current === benchmarkRun) {
        setBenchmarkRunning(false);
      }
    }
  }

  function benchmarkDocument(): BenchmarkExportDocument {
    return {
      schemaVersion: "1.0.0",
      createdAt: new Date().toISOString(),
      context: {
        platformId: selectedPlatformId,
        modeId: targetModeId,
        profileId: selectedProfileId,
        profileContentSha256: selectedProfile.content_sha256,
        paletteCalibrationId: isPmd ? pmd85PaletteCalibrationId : null,
        sourceSha256: sourceArtifact?.sha256 ?? null,
        sourceRevision: currentBenchmarkContextKey,
        ditheringAmount: dithering === "none" ? 0 : amount,
        errorDiffusionRandomization,
        errorDiffusionLineSuppression,
        attributeHeight: selectedPlatformId === "zx-spectrum"
          ? attributeHeight
          : null,
        paletteSelections,
        includeExperimentalEngines,
      },
      rows: benchmarkRows.map((row, index) => ({
        rank: index + 1,
        attributeOptimizerId: selectedPlatformId === "zx-spectrum"
          ? row.optimizerId
          : undefined,
        qlMixedOptimizerId: targetModeId === "mode8-mode4-mixed-512x256"
          ? row.qlMixedOptimizerId
          : undefined,
        ditherEngineId: row.ditherEngineId,
        matrix: row.matrixEffective ? row.matrix : undefined,
        score: row.score,
        lowPassScore: row.lowPassScore,
        edgeScore: row.edgeScore,
        platformScore: row.platformScore,
        attributeBoundaryScore: row.attributeBoundaryScore ?? undefined,
        orderedPerturbationRms: row.orderedPerturbationRms ?? undefined,
        outputPixelChangePercent: row.outputPixelChangePercent,
        textureMetrics: row.textureMetrics,
        elapsedMs: row.elapsedMs,
        digest: row.digest,
        aliases: row.aliases.map((alias) =>
          `${alias.optimizerId}:${alias.qlMixedOptimizerId}:${alias.ditherEngineId}:${alias.matrix}`
        ),
        guidance: row.classification.guidance,
        dominated: row.classification.dominated,
        visualFavorite: benchmarkVisualFavorites.has(row.digest),
      })),
    };
  }

  function downloadBenchmark(format: "json" | "csv") {
    const document = benchmarkDocument();
    downloadBytes(
      format === "json" ? benchmarkExportJson(document) : benchmarkExportCsv(document),
      format === "json" ? "application/json" : "text/csv",
      `${projectFileBaseName()}-engine-benchmark.${format}`,
    );
  }

  function toggleBenchmarkComparison(digest: string) {
    setBenchmarkCompareDigests((current) =>
      current.includes(digest)
        ? current.filter((candidate) => candidate !== digest)
        : [...current.slice(-1), digest]
    );
  }

  function toggleBenchmarkVisualFavorite(digest: string) {
    setBenchmarkVisualFavorites((current) => {
      const next = new Set(current);
      if (next.has(digest)) next.delete(digest);
      else next.add(digest);
      return next;
    });
  }

  function selectBenchmarkRow(row: (typeof benchmarkRows)[number]) {
    setBenchmarkOpen(true);
    setAttributeOptimizerId(row.optimizerId);
    setQlMixedOptimizerId(row.qlMixedOptimizerId);
    setDitherEngineId(row.ditherEngineId);
    setDithering(ditherMethodForEngine(row.ditherEngineId));
    setOrderedMatrix(row.matrix);
    syncMatrixEditorFromSelection(row.matrix);
    setStructuredSettings((current) =>
      structuredSettingsForOptimizer(row.optimizerId, current)
    );
    setDraftState({ kind: "ready", result: row.result });
  }

  async function runTilemapBenchmark() {
    if (!developmentMode) return;
    if (
      tilemapBenchmarkRunning ||
      lastFinal === null ||
      lastFinal.platformId !== "zx-spectrum" ||
      lastFinal.modeId !== "zx48-standard-256x192" ||
      lastFinal.attributeHeight !== 8 ||
      lastFinal.frames.length !== 1 ||
      (
        charsetSource === "existing" &&
        (existingCharset === null || !existingCharsetChoiceValid)
      )
    ) return;
    const tilemapBenchmarkRun = tilemapBenchmarkRunRef.current + 1;
    tilemapBenchmarkRunRef.current = tilemapBenchmarkRun;
    setTilemapBenchmarkOpen(true);
    setTilemapBenchmarkRunning(true);
    setExportError(null);
    const source = lastFinal.frames[0]!;
    const strategies: readonly DerivedCharsetStrategy[] = [
      "frequency",
      "best-coverage",
      "image-similarity-v2",
      "image-similarity-v3",
      "image-similarity-v4",
      "image-similarity-v5",
    ];
    const rows: {
      strategy: DerivedCharsetStrategy;
      score: number;
      elapsedMs: number;
      result: WorkerCharsetResult;
    }[] = [];
    try {
      for (const strategy of strategies) {
        if (tilemapBenchmarkRunRef.current !== tilemapBenchmarkRun) return;
        const worker = new ConversionWorkerClient();
        const started = performance.now();
        try {
          const result = await worker.convertCharset(source.encoded, {
            source: charsetSource,
            ...(existingCharset === null ? {} : { existingCharset }),
            ...(charsetSource === "existing"
              ? {
                  existingCharsetRange: {
                    startIndex: existingCharsetStart,
                    length: existingCharsetLength,
                  },
                  ...(existingCharsetSelection === null
                    ? {}
                    : {
                        existingCharsetSelection: {
                          indices: existingCharsetSelection,
                        },
                      }),
                }
              : {}),
            characterBudget: charsetSource === "existing"
              ? existingActiveCharacterCount
              : charsetBudget,
            encoding: charsetEncoding,
            allowTransforms: charsetAllowTransforms,
            allowPolarity: charsetAllowPolarity,
            derivedStrategy: strategy,
            distanceMetric:
                strategy === "image-similarity-v2" ||
                strategy === "image-similarity-v3" ||
                strategy === "image-similarity-v4" ||
                strategy === "image-similarity-v5"
              ? strategy
              : charsetDistance,
            visualWeighting: charsetVisualWeighting,
            swapRefinementPasses:
                strategy === "image-similarity-v2" ||
                strategy === "image-similarity-v3" ||
                strategy === "image-similarity-v4" ||
                strategy === "image-similarity-v5"
              ? 4
              : strategy === "best-coverage" ? 1 : 0,
          });
          if (tilemapBenchmarkRunRef.current !== tilemapBenchmarkRun) return;
          rows.push({
            strategy,
            score: commonPreviewError(source.previewRgba, result.previewRgba),
            elapsedMs: performance.now() - started,
            result,
          });
        } finally {
          worker.dispose();
        }
      }
      rows.sort((left, right) =>
        left.score - right.score ||
        left.strategy.localeCompare(right.strategy)
      );
      if (tilemapBenchmarkRunRef.current === tilemapBenchmarkRun) {
        setTilemapBenchmarkRows(rows);
      }
    } catch (error: unknown) {
      if (tilemapBenchmarkRunRef.current === tilemapBenchmarkRun) {
        setExportError(
          `Tilemap benchmark failed: ${
            error instanceof Error ? error.message : "Unknown error."
          }`,
        );
      }
    } finally {
      if (tilemapBenchmarkRunRef.current === tilemapBenchmarkRun) {
        setTilemapBenchmarkRunning(false);
      }
    }
  }

  function selectTilemapBenchmarkRow(
    row: (typeof tilemapBenchmarkRows)[number],
  ) {
    setTilemapBenchmarkOpen(true);
    setCharsetStrategy(row.strategy);
    setCharsetState({ kind: "ready", result: row.result });
    initializeTileEditor(row.result);
    setTilemapStale(false);
  }

  async function importProfile(file: File | undefined) {
    if (file === undefined) return;
    try {
      const source = await file.text();
      let parsed: unknown;
      try { parsed = JSON.parse(source); } catch { parsed = null; }
      if (typeof parsed === "object" && parsed !== null &&
          "application" in parsed && typeof parsed.application === "string" &&
          parsed.application.trim() === "SpecSCII Online") {
        await importSpecsciiFile(file);
        return;
      }
      const imported = await parseImportedProfile(new TextEncoder().encode(source));
      const importedProfiles = profiles.filter((profile) =>
        !BUILT_IN_PROFILES.some((builtIn) => builtIn.id === profile.id) &&
        profile.id !== imported.id,
      );
      const nextProfiles = [...BUILT_IN_PROFILES, ...importedProfiles, imported];
      saveStoredProfiles(localStorage, nextProfiles.slice(BUILT_IN_PROFILES.length));
      setProfiles(nextProfiles);
      setExportError(null);
      setSelectedProfileId(imported.id);
      const preset = imported.presets[0];
      if (preset !== undefined) {
        setSelectedPresetId(preset.id);
        applySettings(preset.settings);
      }
    } catch (error: unknown) {
      setExportError(`Profile import rejected: ${error instanceof Error ? error.message : "Validation failed."}`);
    }
  }

  async function importSpecsciiFile(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    try {
      const fontAssets = await loadSpecsciiFontAssets();
      const imported = importSpecscii(
        await file.text(),
        fontAssets.romFont,
        fontAssets.udgFont,
      );
      const charset = imported.charset;
      const encoding: CharsetEncoding = "extended";
      const artifact = encodeCharsetArtifact({
        encoding,
        characterCount: charset.length / 8,
        transformations: false,
        characterIndices: Uint8Array.from(imported.assignments, ({ characterIndex }) => characterIndex),
        attributes: imported.attributes,
        transforms: new Uint8Array(768),
        charset,
      });
      const decoded = decodeCharsetArtifact(artifact.bytes, {
        encoding,
        characterCount: charset.length / 8,
        transformations: false,
      });
      const usedCharacterCount = new Set(imported.assignments.map(({ characterIndex }) => characterIndex)).size;
      const result: WorkerCharsetResult = {
        encoding,
        transformations: false,
        characterCount: charset.length / 8,
        artifact: artifact.bytes,
        decodedScr: decoded.scr,
        previewRgba: renderCharsetPreview(decoded.screen),
        charset: artifact.charset,
        attributes: artifact.attributes,
        assignments: imported.assignments,
        diagnostics: {
          uniqueCanonicalTiles: usedCharacterCount,
          usedCharacterCount,
          exactMatches: 768,
          averageStructuralError: 0,
          maximumStructuralError: 0,
          rgbSquaredError: 0,
          rgbRmse: 0,
          rgbSimilarityPercent: 100,
          polaritySwaps: 0,
          transformHistogram: [768, 0, 0, 0, 0, 0, 0, 0],
          memory: {
            headerBytes: 2,
            tilemapBytes: artifact.tilemap.length,
            attributeBytes: artifact.attributes.length,
            transformBytes: artifact.transforms.length,
            charsetBytes: artifact.charset.length,
            totalBytes: artifact.bytes.length,
          },
        },
      };
      setCharsetState({ kind: "ready", result });
      setCharsetEncoding("extended");
      setCharsetSource("existing");
      setExistingCharset(charset.slice());
      setExistingCharsetName(file.name);
      setCharsetTilesView("source");
      setCharsetSelectionMode(false);
      setSelectedSourceCharsetTile(null);
      setEmittedSourceCharsetIndices(Array.from({ length: charset.length / 8 }, (_, index) => index));
      setExistingCharsetStart(0);
      setExistingCharsetLength(charset.length / 8);
      setExistingCharsetStartEntry("1");
      setExistingCharsetLengthEntry(String(charset.length / 8));
      existingCharsetSelectionRef.current = null;
      setExistingCharsetSelection(null);
      setCharsetBudget(charset.length / 8);
      initializeTileEditor(result);
      setCharsetState({ kind: "ready", result });
      setTilemapStale(false);
      setTileEditorEdited(false);
      setSpecsciiDocumentName(file.name);
      setSpecsciiBorder(imported.document.border);
      setSpecsciiAuthor(imported.document.author ?? "");
      setSpecsciiImageName(imported.document.imageName ?? "");
      setProjectName(normalizeProjectName(sanitizeArtifactBaseName(file.name)));
      switchWorkspaceConversionMode("tilemap");
      setSourcePreviewContent("unified-editor");
      setResultPreviewContent("image");
      setTilemapStale(false);
      setImageStatus(`Imported Specscii screen · 32 × 24 cells · ${usedCharacterCount} symbols used.`);
      setExportError(null);
    } catch (error: unknown) {
      setExportError(`Specscii import rejected: ${error instanceof Error ? error.message : "Invalid file."}`);
    }
  }

  function deleteSelectedProfile() {
    if (BUILT_IN_PROFILES.some((profile) => profile.id === selectedProfileId)) return;
    const nextProfiles = profiles.filter((profile) => profile.id !== selectedProfileId);
    saveStoredProfiles(localStorage, nextProfiles.slice(BUILT_IN_PROFILES.length));
    setProfiles(nextProfiles);
    selectProfile(BUILT_IN_PROFILE_ID);
  }

  function deleteAllImportedProfiles() {
    saveStoredProfiles(localStorage, []);
    setProfiles([...BUILT_IN_PROFILES]);
    selectProfile(BUILT_IN_PROFILE_ID);
  }

  function bitmapEditorHasUnsavedEdits(): boolean {
    return bitmapEditorRevertSource !== null ||
      bitmapEditorOriginalResult !== null ||
      bitmapEditorResultEdited ||
      bitmapEditorResultOriginalResult !== null;
  }

  function confirmBitmapEditorAction(action: "convert" | "revert"): boolean {
    if (!bitmapEditorHasUnsavedEdits()) return true;
    return action === "convert"
      ? window.confirm("Reconvert image? This will reprocess the current working source and may replace manual bitmap edits. Continue?")
      : window.confirm("Revert bitmap edits? This will discard all editor changes and restore the original or last converted image. Continue?");
  }

  async function convertImage(options: { readonly confirmEdited?: boolean } = {}) {
    if (options.confirmEdited !== false && !confirmBitmapEditorAction("convert")) return;
    const worker = workerRef.current;
    if (worker === null || image === null || !settingsValid) {
      setState({ kind: "error", message: "Conversion settings are invalid." });
      return;
    }

    const job = finalJobRef.current + 1;
    finalJobRef.current = job;
    const revision = revisionRef.current;
    const conversionMode = workspaceMode;
    finalRunningRef.current = true;
    setBitmapEditorSelection(null);
    setBitmapEditorOriginalResult(null);
    bitmapEditorFullBufferRef.current = null;
    bitmapEditorEncodedRef.current = null;
    setBitmapEditorBuffer(null);
    setBitmapEditorUndoFull([]);
    setBitmapEditorRedoFull([]);
    setBitmapEditorRevertSource(null);
    resetResultEditorState();
    setBitmapEditorSourceColor(null);
    setTileEditorUndo([]);
    setTileEditorRedo([]);
    setState({ kind: "running" });
    try {
      const result = await worker.convertImage(
        image,
        conversionSettings,
        "high",
        pmd85WorkerOptions,
      );
      if (finalJobRef.current !== job) return;
      setLastFinal(result);
      setResultOrigin("converted");
      setLastFinalCompletedAt(new Date().toISOString());
      setExportError(null);
      lastFinalRevisionRef.current = revision;
      setDraftState({ kind: "idle" });
      if (conversionMode === "tilemap") {
        const tilemapResult = await runCharsetConversion(result);
        if (finalJobRef.current !== job) return;
        if (tilemapResult === null) {
          setState(revisionRef.current === revision
            ? { kind: "ready", result }
            : { kind: "stale" });
          return;
        }
        if (
          revisionRef.current !== revision ||
          workspaceModeRef.current !== conversionMode
        ) return;
      }
      setState(revisionRef.current === revision ? { kind: "ready", result } : { kind: "stale" });
    } catch (error: unknown) {
      if (finalJobRef.current !== job) return;
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Unknown error.",
      });
    } finally {
      if (finalJobRef.current === job) finalRunningRef.current = false;
    }
  }

  function cancelHigh() {
    if (!finalRunningRef.current) return;
    workerRef.current?.dispose();
    charsetWorkerRef.current?.dispose();
    charsetWorkerRef.current = null;
    workerRef.current = new ConversionWorkerClient();
    finalRunningRef.current = false;
    finalJobRef.current += 1;
    setCharsetState((current) =>
      current.kind === "running" ? { kind: "idle" } : current,
    );
    if (lastFinal !== null && lastFinalRevisionRef.current === revisionRef.current) {
      setState({ kind: "ready", result: lastFinal });
    } else {
      setState(lastFinal === null ? { kind: "idle" } : { kind: "stale" });
    }
  }

  function invalidateCharset(): void {
    setCharsetState({ kind: "idle" });
  }

  function freezeGeneratedCharset(): void {
    if (charsetSource !== "derived" || charsetState.kind !== "ready") return;
    const charset = charsetState.result.charset.slice();
    const count = charset.length / 8;
    const all = allCharsetIndices(count);
    setExistingCharset(charset);
    setExistingCharsetName("generated-charset.chr");
    setCharsetTilesView("source");
    setCharsetSelectionMode(false);
    setSelectedSourceCharsetTile(null);
    setEmittedSourceCharsetIndices(all);
    setExistingCharsetStart(0);
    setExistingCharsetLength(count);
    setExistingCharsetStartEntry("1");
    setExistingCharsetLengthEntry(String(count));
    existingCharsetSelectionRef.current = all;
    setExistingCharsetSelection(all);
    setCharsetBudget(count);
    if (count > 32) setCharsetEncoding("extended");
    setCharsetSource("existing");
    setTilemapStale(true);
    setDirty(true);
  }

  function initializeTileEditor(result: WorkerCharsetResult): void {
    tilemapPutPointerRef.current = null;
    setTilemapPutActive(false);
    setUnifiedTileEditorContext("map-cell");
    setTileStampDraft({ characterIndex: null, transform: 0, inverted: false, attribute: 0x38 });
    setTileEditorSelected(0);
    setTileEditorOriginals(Array.from({ length: result.characterCount }, () => null));
    setTileEditorUsageSort(false);
    setTileEditorUndo([]);
    setTileEditorRedo([]);
    setTilemapEditorCell(0);
    setTileEditorColorPickerActive(false);
    setTileEditorTilePickerActive(false);
    setTileEditorEdited(false);
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

  function snapshotTileEditor(result: WorkerCharsetResult): TilemapEditorSnapshot {
    return {
      charset: result.charset.slice(),
      assignments: result.assignments.map((assignment) => ({ ...assignment })),
      attributes: result.attributes.slice(),
      encoding: result.encoding,
    };
  }

  function pushTileEditorHistory(result: WorkerCharsetResult): void {
    setTileEditorUndo((history) => [...history, snapshotTileEditor(result)]);
    setTileEditorRedo([]);
  }

  function applyEditorOperation(operation: TileEditOperation, pushHistory = true): void {
    if (charsetState.kind !== "ready") return;
    const result = charsetState.result;
    const tile = result.charset.slice(tileEditorSelected * 8, tileEditorSelected * 8 + 8);
    if (pushHistory) {
      pushTileEditorHistory(result);
      setTileEditorOriginals((originals) => {
        const next = [...originals];
        if (next[tileEditorSelected] === null) next[tileEditorSelected] = tile;
        return next;
      });
    }
    const editedTile = applyTileEdit(tile, operation);
    commitTileEditorResult(
      result,
      replaceTileInCharset(result.charset, tileEditorSelected, editedTile),
    );
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

  function toggleSelectedTilemapTransform(toggle: TileTransformToggle): void {
    if (charsetState.kind !== "ready" || !charsetState.result.transformations) return;
    if (unifiedTileEditorContext === "stamp") {
      setTileStampDraft((stamp) => ({
        ...stamp,
        transform: toggleTileTransform(stamp.transform, toggle),
      }));
      return;
    }
    updateSelectedTilemapCell((assignment) => ({
      assignment: { ...assignment, transform: toggleTileTransform(assignment.transform, toggle) },
    }));
  }

  function updateSelectedTilemapAttribute(update: (attribute: number) => number): void {
    if (unifiedTileEditorContext === "stamp") {
      setTileStampDraft((stamp) => ({ ...stamp, attribute: update(stamp.attribute) & 0xff }));
      return;
    }
    updateSelectedTilemapCell((_assignment, attribute) => ({ attribute: update(attribute) & 0xff }));
  }

  function resetTilemapEditorTransform(): void {
    if (unifiedTileEditorContext === "stamp") {
      setTileStampDraft((stamp) => ({ ...stamp, transform: 0, inverted: false }));
      return;
    }
    updateSelectedTilemapCell((assignment) => ({
      assignment: { ...assignment, transform: 0 },
    }));
  }

  function switchUnifiedTileEditorContext(context: UnifiedTileEditorContext): void {
    tilemapPutPointerRef.current = null;
    setTilemapPutActive(false);
    setTileEditorColorPickerActive(false);
    setTileEditorTilePickerActive(false);
    setUnifiedTileEditorContext(context);
  }

  function swapSelectedTilemapInkPaper(): void {
    updateSelectedTilemapAttribute(swapTilemapInkPaper);
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

  function consumeRecentTilePickerClick(characterIndex: number): boolean {
    const guard = tileEditorTilePickerClickGuardRef.current;
    if (guard === null) return false;
    if (guard.until < Date.now()) {
      tileEditorTilePickerClickGuardRef.current = null;
      return false;
    }
    return guard.index === characterIndex;
  }

  function selectEditorTile(index: number): void {
    if (charsetState.kind !== "ready") return;
    if (index < 0 || index >= charsetState.result.characterCount) return;
    setTileEditorSelected(index);
    const firstCell = charsetState.result.assignments.findIndex((assignment) => assignment.characterIndex === index);
    if (firstCell >= 0) setTilemapEditorCell(firstCell);
  }

  function selectUsedTile(index: number): void {
    if (charsetState.kind !== "ready") return;
    selectEditorTile(index);
    const firstCell = charsetState.result.assignments.findIndex((assignment) => assignment.characterIndex === index);
    if (firstCell >= 0) setTilemapEditorCell(firstCell);
    charsetGlyphRefs.current[index]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function undoTileEditor(): void {
    const snapshot = tileEditorUndo[tileEditorUndo.length - 1];
    if (snapshot === undefined) return;
    if (charsetState.kind !== "ready") return;
    setTileEditorRedo((history) => [...history, snapshotTileEditor(charsetState.result)]);
    setTileEditorUndo((history) => history.slice(0, -1));
    setEmittedSourceCharsetIndices(null);
    setCharsetEncoding(snapshot.encoding);
    setCharsetState({ kind: "ready", result: rebuildCharsetResult(charsetState.result, snapshot.charset, snapshot.assignments, snapshot.encoding, snapshot.attributes) });
    setDirty(true);
    setTileEditorEdited(true);
  }

  function redoTileEditor(): void {
    const snapshot = tileEditorRedo[tileEditorRedo.length - 1];
    if (snapshot === undefined || charsetState.kind !== "ready") return;
    pushTileEditorHistory(charsetState.result);
    setTileEditorRedo((history) => history.slice(0, -1));
    setEmittedSourceCharsetIndices(null);
    setCharsetEncoding(snapshot.encoding);
    setCharsetState({ kind: "ready", result: rebuildCharsetResult(charsetState.result, snapshot.charset, snapshot.assignments, snapshot.encoding, snapshot.attributes) });
    setDirty(true);
    setTileEditorEdited(true);
  }

  function revertSelectedTile(): void {
    if (charsetState.kind !== "ready") return;
    const original = tileEditorOriginals[tileEditorSelected];
    if (original === null || original === undefined) return;
    pushTileEditorHistory(charsetState.result);
    commitTileEditorResult(
      charsetState.result,
      replaceTileInCharset(charsetState.result.charset, tileEditorSelected, original),
    );
  }

  function createEditorTile(): void {
    if (charsetState.kind !== "ready" || charsetState.result.characterCount >= 256) return;
    pushTileEditorHistory(charsetState.result);
    const nextCharset = appendBlankTile(charsetState.result.charset);
    const nextEncoding = nextCharset.length / 8 > 32 ? "extended" : charsetState.result.encoding;
    setCharsetEncoding(nextEncoding);
    commitTileEditorResult(charsetState.result, nextCharset, charsetState.result.assignments, nextEncoding);
    setTileEditorSelected(nextCharset.length / 8 - 1);
    setTileEditorOriginals((originals) => [...originals, new Uint8Array(8)]);
    setEmittedSourceCharsetIndices((indices) => indices === null ? null : [...indices, null]);
  }

  function deleteEditorTile(): void {
    if (charsetState.kind !== "ready" || charsetState.result.characterCount <= 1) return;
    const result = charsetState.result;
    const index = tileEditorSelected;
    const used = result.assignments.filter((assignment) => assignment.characterIndex === index).length;
    if (used > 0 && !window.confirm(`Tile ${index + 1} is used by ${used} cells. Delete it and remap those cells?`)) return;
    pushTileEditorHistory(result);
    const nextCharset = new Uint8Array(result.charset.length - 8);
    nextCharset.set(result.charset.subarray(0, index * 8));
    nextCharset.set(result.charset.subarray(index * 8 + 8), index * 8);
    const replacement = index === 0 ? 0 : index - 1;
    const assignments = result.assignments.map((assignment) => ({
      ...assignment,
      characterIndex: assignment.characterIndex === index
        ? replacement
        : assignment.characterIndex > index
          ? assignment.characterIndex - 1
          : assignment.characterIndex,
    }));
    const nextSelected = Math.min(index, nextCharset.length / 8 - 1);
    const nextEncoding = charsetEncoding;
    commitTileEditorResult(result, nextCharset, assignments, nextEncoding);
    setTileEditorSelected(nextSelected);
    setTileEditorOriginals((originals) => originals.filter((_, tileIndex) => tileIndex !== index));
    setEmittedSourceCharsetIndices((indices) => indices === null ? null : indices.filter((_, outputIndex) => outputIndex !== index));
  }

  function moveEditorTile(delta: -1 | 1): void {
    if (charsetState.kind !== "ready") return;
    const count = charsetState.result.characterCount;
    const target = tileEditorSelected + delta;
    if (target < 0 || target >= count) return;
    setTileEditorSelected(target);
  }

  function toggleEditorTileUsageSort(): void {
    if (charsetState.kind !== "ready" || tilemapStale) return;
    setTileEditorUsageSort((sorted) => !sorted);
  }

  function tileEditorPixelFromEvent(event: ReactPointerEvent<HTMLDivElement>): { readonly x: number; readonly y: number } | null {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / (rect.width / 8));
    const y = Math.floor((event.clientY - rect.top) / (rect.height / 8));
    return x >= 0 && x < 8 && y >= 0 && y < 8 ? { x, y } : null;
  }

  function beginTileEditorPaint(event: ReactPointerEvent<HTMLDivElement>): void {
    if (charsetState.kind !== "ready") return;
    const pixel = tileEditorPixelFromEvent(event);
    if (pixel === null) return;
    event.preventDefault();
    tileEditorPointerRef.current = { pointerId: event.pointerId, visited: new Set() };
    event.currentTarget.setPointerCapture(event.pointerId);
    tileEditorPointerRef.current.visited.add(`${pixel.x},${pixel.y}`);
    applyEditorOperation({ kind: "xor-pixel", ...pixel });
  }

  function moveTileEditorPaint(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = tileEditorPointerRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    const pixel = tileEditorPixelFromEvent(event);
    if (pixel === null || drag.visited.has(`${pixel.x},${pixel.y}`)) return;
    drag.visited.add(`${pixel.x},${pixel.y}`);
    applyEditorOperation({ kind: "xor-pixel", ...pixel }, false);
  }

  function endTileEditorPaint(event: ReactPointerEvent<HTMLDivElement>): void {
    if (tileEditorPointerRef.current?.pointerId === event.pointerId) tileEditorPointerRef.current = null;
  }

  function applyBitmapEditorOperation(operation: BitmapCellEditOperation): void {
    if (bitmapEditorCell === null) return;
    const nextCell = applyBitmapCellEdit(bitmapEditorCell, operation);
    setBitmapEditorUndo((history) => [...history, bitmapEditorCell]);
    setBitmapEditorRedo([]);
    setBitmapEditorCell(nextCell);
    applyBitmapEditorToResult(nextCell);
  }

  function undoBitmapEditor(): void {
    const previous = bitmapEditorUndo[bitmapEditorUndo.length - 1];
    if (previous === undefined) return;
    if (bitmapEditorCell !== null) setBitmapEditorRedo((history) => [...history, bitmapEditorCell]);
    setBitmapEditorCell(previous);
    setBitmapEditorUndo((history) => history.slice(0, -1));
    applyBitmapEditorToResult(previous);
  }

  function redoBitmapEditor(): void {
    const next = bitmapEditorRedo[bitmapEditorRedo.length - 1];
    if (next === undefined) return;
    if (bitmapEditorCell !== null) setBitmapEditorUndo((history) => [...history, bitmapEditorCell]);
    setBitmapEditorCell(next);
    setBitmapEditorRedo((history) => history.slice(0, -1));
    applyBitmapEditorToResult(next);
  }

  function bitmapEditorPixelFromEvent(event: ReactPointerEvent<HTMLDivElement>): { readonly x: number; readonly y: number } | null {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.floor((event.clientX - bounds.left) / (bounds.width / 8));
    const y = Math.floor((event.clientY - bounds.top) / (bounds.height / 8));
    return x >= 0 && x < 8 && y >= 0 && y < 8 ? { x, y } : null;
  }

  function beginBitmapEditorPaint(event: ReactPointerEvent<HTMLDivElement>): void {
    const pixel = bitmapEditorPixelFromEvent(event);
    if (pixel === null || bitmapEditorCell === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    bitmapEditorPointerRef.current = { pointerId: event.pointerId, visited: new Set([`${pixel.x},${pixel.y}`]) };
    applyBitmapEditorOperation({ kind: "toggle-pixel", ...pixel });
  }

  function moveBitmapEditorPaint(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = bitmapEditorPointerRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    const pixel = bitmapEditorPixelFromEvent(event);
    if (pixel === null) return;
    const key = `${pixel.x},${pixel.y}`;
    if (drag.visited.has(key)) return;
    drag.visited.add(key);
    applyBitmapEditorOperation({ kind: "toggle-pixel", ...pixel });
  }

  function endBitmapEditorPaint(event: ReactPointerEvent<HTMLDivElement>): void {
    if (bitmapEditorPointerRef.current?.pointerId === event.pointerId) bitmapEditorPointerRef.current = null;
  }

  function fullBitmapBufferFromSource(): BitmapEditorBuffer | null {
    if (image === null || image.rgba.length !== image.width * image.height * 4) return null;
    return { width: image.width, height: image.height, rgba: image.rgba.slice() };
  }

  function resultFrameInput(
    result: WorkerConversionResult,
    frameIndex: number,
    overrides: {
      readonly encoded?: Uint8Array;
      readonly pmd85Palette?: readonly Pmd85RgbColor[];
      readonly pmd85GapPolicy?: "zero" | "preserve-imported";
      readonly importedGapBytes?: Uint8Array;
    } = {},
  ): NativeResultFrameInput | null {
    const frame = result.frames[frameIndex];
    if (frame === undefined) return null;
    const importedGapBytes = overrides.importedGapBytes ?? (result.platformId === "pmd-85" &&
        (overrides.pmd85GapPolicy ?? pmd85GapPolicy) === "preserve-imported" &&
        sourceArtifact?.bytes.length === 16384
      ? extractPmd85GapBytes(sourceArtifact.bytes)
      : undefined);
    return {
      platformId: result.platformId,
      modeId: result.modeId,
      hardwareModeId: frame.hardwareModeId,
      encoded: overrides.encoded ?? frame.encoded,
      nativeWidth: frame.nativeWidth,
      nativeHeight: frame.nativeHeight,
      attributeHeight: result.attributeHeight,
      ...(result.platformId === "zx-spectrum"
        ? { zxPalette: resolveZxPalette(zxPaletteDefinition) }
        : {}),
      ...(result.platformId === "pmd-85"
        ? {
            pmd85ForegroundPalette: overrides.pmd85Palette ?? pmd85ForegroundPalette,
            pmd85GapPolicy: overrides.pmd85GapPolicy ?? pmd85GapPolicy,
            ...(importedGapBytes === undefined ? {} : { pmd85ImportedGapBytes: importedGapBytes }),
          }
        : {}),
    };
  }

  function setResultEditorBuffer(buffer: NativeResultBitmap | null): void {
    bitmapEditorResultBufferRef.current = buffer === null ? null : cloneNativeResultBitmap(buffer);
    setBitmapEditorResultBuffer(buffer === null ? null : cloneNativeResultBitmap(buffer));
  }

  function resetResultEditorState(): void {
    bitmapEditorColorDraftRef.current = null;
    setBitmapEditorFlashPreviewMode("normal");
    setBitmapEditorFlashPreviewPhase(false);
    clearBitmapEditorPickedCell();
    setBitmapEditorColorPickerActive(false);
    setBitmapEditorPatternPickerActive(false);
    setBitmapEditorRegionSelection(null);
    setBitmapEditorSelectionDraft(null);
    setBitmapEditorSelectionTool("rectangle");
    setBitmapEditorClipboard(null);
    setBitmapEditorPasteMode(null);
    setBitmapEditorScope("pixel");
    bitmapEditorResultSourceRef.current = null;
    bitmapEditorCurrentResultRef.current = null;
    setResultEditorBuffer(null);
    setBitmapEditorResultUndo([]);
    setBitmapEditorResultRedo([]);
    setBitmapEditorResultOriginal(null);
    setBitmapEditorResultOriginalResult(null);
    setBitmapEditorResultEdited(false);
    setBitmapEditorResultFrameIndex(0);
    setBitmapEditorResultPaletteIndex(1);
  }

  function initializeResultEditor(result: WorkerConversionResult, frameIndex = 0): NativeResultBitmap | null {
    bitmapEditorColorDraftRef.current = null;
    const input = resultFrameInput(result, frameIndex);
    if (input === null) return null;
    const bitmap = createNativeResultBitmap(input);
    bitmapEditorResultSourceRef.current = result;
    bitmapEditorCurrentResultRef.current = result;
    setBitmapEditorResultFrameIndex(frameIndex);
    setResultEditorBuffer(bitmap);
    setBitmapEditorResultOriginal(cloneNativeResultBitmap(bitmap));
    setBitmapEditorResultUndo([]);
    setBitmapEditorResultRedo([]);
    return bitmap;
  }

  function bitmapEditorActiveResult(): WorkerConversionResult | null {
    return bitmapEditorCurrentResultRef.current ?? draftPreviewResult(draftState) ?? lastFinal;
  }

  function bitmapEditorActiveNativeBuffer(): NativeResultBitmap | null {
    const result = bitmapEditorActiveResult();
    if (result === null) return null;
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, Math.max(0, result.frames.length - 1));
    return bitmapEditorResultBufferRef.current ?? initializeResultEditor(result, frameIndex);
  }

  function bitmapEditorAttributeGrid(): { readonly width: number | null; readonly height: number | null } {
    const result = bitmapEditorActiveResult();
    if (result?.platformId === "zx-spectrum") {
      return { width: 8, height: result.attributeHeight ?? attributeHeight };
    }
    if (result?.platformId === "pmd-85") {
      return { width: 6, height: targetModeId.replace(/-vertical-spatial$/, "") === "pmd85-colorace" ? 2 : 1 };
    }
    return { width: null, height: null };
  }

  function bitmapEditorOrderedMatrix(patternId = bitmapEditorStipplePattern): OrderedMatrix | null {
    if (patternId in ORDERED_MATRICES) return ORDERED_MATRICES[patternId as OrderedMatrixId];
    const custom = customOrderedMatrices.find((candidate) => candidate.id === patternId);
    if (custom === undefined) return null;
    return { width: custom.width, height: custom.height, values: custom.values, levels: new Set(custom.values).size };
  }

  function copyBitmapEditorSelection(
    selectionOverride: BitmapRegionSelection | null = bitmapEditorRegionSelection,
    announce = true,
  ): BitmapEditorClipboard | null {
    const selection = selectionOverride;
    const result = bitmapEditorActiveResult();
    const bitmap = bitmapEditorActiveNativeBuffer();
    if (selection === null || result === null || bitmap === null) return null;
    const paletteIndices = new Uint8Array(selection.width * selection.height);
    const rgba = new Uint8Array(selection.width * selection.height * 4);
    for (let y = 0; y < selection.height; y += 1) {
      for (let x = 0; x < selection.width; x += 1) {
        const offset = y * selection.width + x;
        if (selection.mask[offset] !== 1) continue;
        const sourceOffset = (selection.y + y) * bitmap.width + selection.x + x;
        paletteIndices[offset] = bitmap.paletteIndices[sourceOffset] ?? 0;
        rgba.set(bitmap.rgba.subarray(sourceOffset * 4, sourceOffset * 4 + 4), offset * 4);
      }
    }
    const grid = bitmapEditorAttributeGrid();
    const attributeWidth = grid.width ?? 1;
    const attributeHeight = grid.height ?? 1;
    let attributes: Uint8Array | null = null;
    let attributeMask: Uint8Array | null = null;
    if (result.platformId === "zx-spectrum" && grid.width !== null && grid.height !== null) {
      const firstCellX = Math.floor(selection.x / grid.width);
      const firstCellY = Math.floor(selection.y / grid.height);
      const columns = Math.ceil((selection.x + selection.width) / grid.width) - firstCellX;
      const rows = Math.ceil((selection.y + selection.height) / grid.height) - firstCellY;
      attributes = new Uint8Array(columns * rows);
      attributeMask = new Uint8Array(columns * rows);
      for (let cellY = 0; cellY < rows; cellY += 1) {
        for (let cellX = 0; cellX < columns; cellX += 1) {
          const cellIndex = cellY * columns + cellX;
          let hasSelectedPixel = false;
          for (let y = 0; y < grid.height; y += 1) {
            for (let x = 0; x < grid.width; x += 1) {
              const selectionX = (firstCellX + cellX) * grid.width + x - selection.x;
              const selectionY = (firstCellY + cellY) * grid.height + y - selection.y;
              if (selectionX < 0 || selectionX >= selection.width || selectionY < 0 || selectionY >= selection.height ||
                  selection.mask[selectionY * selection.width + selectionX] !== 1) {
                continue;
              } else {
                hasSelectedPixel = true;
              }
            }
          }
          if (!hasSelectedPixel) continue;
          attributeMask[cellIndex] = 1;
          const absoluteCellX = firstCellX + cellX;
          const absoluteCellY = firstCellY + cellY;
          attributes[cellIndex] = bitmap.encoded[ZX_BITMAP_BYTES + absoluteCellY * 32 + absoluteCellX] ?? 0;
        }
      }
    }
    const clipboard: BitmapEditorClipboard = {
      width: selection.width,
      height: selection.height,
      paletteIndices,
      rgba,
      mask: selection.mask.slice(),
      sourceX: selection.x,
      sourceY: selection.y,
      sourceAttributeX: grid.width === null ? selection.x : Math.floor(selection.x / grid.width) * grid.width,
      sourceAttributeY: grid.height === null ? selection.y : Math.floor(selection.y / grid.height) * grid.height,
      gridWidth: selection.gridWidth,
      gridHeight: selection.gridHeight,
      resolution: selection.resolution,
      attributes,
      attributeMask,
      attributeWidth,
      attributeHeight,
    };
    setBitmapEditorClipboard(clipboard);
    if (announce) {
      setImageStatus(`Copied ${selection.width}×${selection.height} px to the selection clipboard${attributeMask?.some((value) => value === 1) ? " with source cell attributes" : ""}.`);
    }
    return clipboard;
  }

  function transformBitmapEditorSelection(transform: BitmapSelectionTransform): void {
    const selection = bitmapEditorRegionSelection;
    if (selection === null || bitmapEditorTarget !== "result") return;
    const source = bitmapEditorClipboard !== null &&
      bitmapEditorClipboard.width === selection.width && bitmapEditorClipboard.height === selection.height
      ? bitmapEditorClipboard
      : copyBitmapEditorSelection(selection, false);
    if (source === null) return;
    const transformedSelection = transformBitmapRegionSelection(selection, transform);
    const width = transformedSelection.width;
    const height = transformedSelection.height;
    const transformedPixels = transformBitmapRegionData(source.paletteIndices, source.width, source.height, transform);
    const transformedRgba = transformBitmapRegionData(source.rgba, source.width, source.height, transform, 4);
    const oldAttributeColumns = source.attributes === null ? 0 : Math.ceil((source.sourceX + source.width) / source.attributeWidth) - Math.floor(source.sourceX / source.attributeWidth);
    const oldAttributeRows = source.attributes === null ? 0 : Math.ceil((source.sourceY + source.height) / source.attributeHeight) - Math.floor(source.sourceY / source.attributeHeight);
    const newAttributeColumns = source.attributes === null ? 0 : Math.ceil((selection.x + width) / source.attributeWidth) - Math.floor(selection.x / source.attributeWidth);
    const newAttributeRows = source.attributes === null ? 0 : Math.ceil((selection.y + height) / source.attributeHeight) - Math.floor(selection.y / source.attributeHeight);
    let attributes: Uint8Array | null = null;
    let attributeMask: Uint8Array | null = null;
    if (source.attributes !== null && source.attributeMask !== null && oldAttributeColumns > 0 && oldAttributeRows > 0) {
      const transformedAttributes = transformBitmapRegionData(source.attributes, oldAttributeColumns, oldAttributeRows, transform);
      const transformedMask = transformBitmapRegionData(source.attributeMask, oldAttributeColumns, oldAttributeRows, transform);
      attributes = new Uint8Array(newAttributeColumns * newAttributeRows);
      attributeMask = new Uint8Array(newAttributeColumns * newAttributeRows);
      for (let y = 0; y < Math.min(newAttributeRows, transformedAttributes.height); y += 1) {
        for (let x = 0; x < Math.min(newAttributeColumns, transformedAttributes.width); x += 1) {
          const destination = y * newAttributeColumns + x;
          const index = y * transformedAttributes.width + x;
          attributes[destination] = transformedAttributes.data[index] ?? 0;
          attributeMask[destination] = transformedMask.data[index] ?? 0;
        }
      }
    }
    const finalClipboard: BitmapEditorClipboard = {
      ...source,
      width,
      height,
      paletteIndices: transformedPixels.data,
      rgba: transformedRgba.data,
      mask: transformedSelection.mask,
      attributes,
      attributeMask,
      sourceX: selection.x,
      sourceY: selection.y,
      sourceAttributeX: Math.floor(selection.x / source.attributeWidth) * source.attributeWidth,
      sourceAttributeY: Math.floor(selection.y / source.attributeHeight) * source.attributeHeight,
      ...(bitmapEditorPasteMode === "move" ? { eraseSelection: source.eraseSelection ?? selection } : {}),
    };
    const result = bitmapEditorActiveResult();
    const dimensions = bitmapEditorSelectionDimensions();
    if (result === null || dimensions === null || width > dimensions.width || height > dimensions.height) return;
    const x = Math.min(selection.x, dimensions.width - width);
    const y = Math.min(selection.y, dimensions.height - height);
    const placedClipboard = {
      ...finalClipboard,
      sourceX: x,
      sourceY: y,
      sourceAttributeX: Math.floor(x / source.attributeWidth) * source.attributeWidth,
      sourceAttributeY: Math.floor(y / source.attributeHeight) * source.attributeHeight,
    };
    const nextSelection = { ...transformedSelection, x, y, mask: placedClipboard.mask };
    setBitmapEditorClipboard(placedClipboard);
    setBitmapEditorRegionSelection(nextSelection);
    if (bitmapEditorPasteMode === null) {
      placeBitmapEditorClipboard({ x, y }, "move", placedClipboard, "copy", true, true, true, selection, true, selection);
      setImageStatus(`Selection ${transform === "mirror-x" ? "mirrored horizontally" : transform === "mirror-y" ? "mirrored vertically" : transform === "rotate-cw" ? "rotated 90° clockwise" : "rotated 90° counterclockwise"}.`);
    } else {
      setImageStatus(`${bitmapEditorPasteMode === "move" ? "Move" : "Paste"} clipboard ${transform === "mirror-x" ? "mirrored horizontally" : transform === "mirror-y" ? "mirrored vertically" : transform === "rotate-cw" ? "rotated 90° clockwise" : "rotated 90° counterclockwise"} · click a destination to finish.`);
    }
  }

  function eraseBitmapEditorSelection(): void {
    const selection = bitmapEditorRegionSelection;
    const result = bitmapEditorActiveResult();
    const current = bitmapEditorActiveNativeBuffer();
    if (selection === null || result === null || current === null) return;
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, result.frames.length - 1);
    const input = resultFrameInput(result, frameIndex);
    if (input === null) return;
    const erasePixels = new Uint8Array(selection.width * selection.height).fill(1);
    const next = composeNativeResultRegion(
      current, input, erasePixels, selection.mask, selection.width, selection.height,
      selection.x, selection.y, "and", bitmapEditorResultPaletteIndex,
    );
    commitBitmapEditorResultEdit(result, frameIndex, current, next);
    setImageStatus("Selected pixels erased.");
  }

  function chooseBitmapEditorOperation(operation: BitmapEditorOperation): void {
    setBitmapEditorOperation(operation);
    const selection = bitmapEditorRegionSelection;
    if (bitmapEditorPasteMode !== null || selection === null) return;
    if (operation === "and") {
      eraseBitmapEditorSelection();
      return;
    }
    if (operation === "none") {
      setBitmapEditorRegionSelection(null);
      setBitmapEditorSelectionDraft(null);
      setBitmapEditorPasteMode(null);
      setBitmapEditorSelectionTool("rectangle");
      setImageStatus("Selection cleared · bitmap unchanged.");
      return;
    }
    if (operation === "copy" || operation === "or" || operation === "xor") {
      copyBitmapEditorSelection();
      setBitmapEditorPasteMode("copy");
      setBitmapEditorSelectionTool("none");
      setImageStatus(`Selected region ready to place · ${bitmapEditorOperationLabel(operation)} operation · click destination or Esc to finish.`);
    }
  }

  function makeBitmapEditorColorTransform(
    result: WorkerConversionResult,
    frameIndex: number,
    current: NativeResultBitmap,
    operation: "replace" | "increase" | "decrease",
    from: number,
    to: number,
    channel: "both" | "ink" | "paper",
    scope: "selection" | "image",
  ): NativeResultBitmap | null {
    const input = resultFrameInput(result, frameIndex);
    if (input === null) return null;
    const selection = bitmapEditorRegionSelection;
    if (scope === "selection" && selection === null) {
      setImageStatus("Select an area first, or apply the color operation to the whole image.");
      return null;
    }
    if (result.platformId === "zx-spectrum") {
      if (input.attributeHeight === null) return null;
      const encoded = current.encoded.slice();
      for (let cellY = 0; cellY < 192 / input.attributeHeight; cellY += 1) {
        for (let cellX = 0; cellX < 32; cellX += 1) {
          if (scope === "selection" && selection !== null) {
            let intersects = false;
            const left = cellX * 8;
            const top = cellY * input.attributeHeight;
            for (let y = top; y < top + input.attributeHeight && !intersects; y += 1) {
              for (let x = left; x < left + 8; x += 1) {
                const sx = x - selection.x;
                const sy = y - selection.y;
                if (sx >= 0 && sx < selection.width && sy >= 0 && sy < selection.height && selection.mask[sy * selection.width + sx] === 1) {
                  intersects = true;
                  break;
                }
              }
            }
            if (!intersects) continue;
          }
          const offset = ZX_BITMAP_BYTES + cellY * 32 + cellX;
          const attribute = encoded[offset] ?? 0;
          const adjust = (value: number): number => operation === "replace"
            ? value === from ? to : value
            : Math.max(0, Math.min(7, value + (operation === "increase" ? 1 : -1)));
          const ink = channel === "paper" ? attribute & 7 : adjust(attribute & 7);
          const paper = channel === "ink" ? (attribute >> 3) & 7 : adjust((attribute >> 3) & 7);
          encoded[offset] = (attribute & 0xc0) | ink | (paper << 3);
        }
      }
      return createNativeResultBitmap({ ...input, encoded });
    }
    const mask = new Uint8Array(current.width * current.height);
    if (scope === "image" || selection === null) mask.fill(1);
    else {
      for (let y = 0; y < selection.height; y += 1) {
        for (let x = 0; x < selection.width; x += 1) {
          if (selection.mask[y * selection.width + x] !== 1) continue;
          const absoluteX = selection.x + x;
          const absoluteY = selection.y + y;
          if (absoluteX >= 0 && absoluteX < current.width && absoluteY >= 0 && absoluteY < current.height) {
            mask[absoluteY * current.width + absoluteX] = 1;
          }
        }
      }
    }
    return applyNativePaletteIndexOperation(current, input, mask, operation, from, to);
  }

  function previewBitmapEditorColorTransform(
    operation: "replace" | "increase" | "decrease" = bitmapEditorColorOperation,
    overrides: Partial<{ from: number; to: number; channel: "both" | "ink" | "paper"; scope: "selection" | "image" }> = {},
  ): void {
    const result = bitmapEditorCurrentResultRef.current ?? draftPreviewResult(draftState) ?? lastFinal;
    if (result === null) return;
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, Math.max(0, result.frames.length - 1));
    const current = bitmapEditorResultBufferRef.current ?? initializeResultEditor(result, frameIndex);
    if (current === null) return;
    const existingDraft = bitmapEditorColorDraftRef.current;
    const draftMatchesTarget = existingDraft?.result === result && existingDraft.frameIndex === frameIndex;
    const baseline = draftMatchesTarget ? existingDraft.baseline : cloneNativeResultBitmap(current);
    if (!draftMatchesTarget) bitmapEditorColorDraftRef.current = { result, frameIndex, baseline, steps: 0 };
    try {
      const from = overrides.from ?? bitmapEditorColorFrom;
      const to = overrides.to ?? bitmapEditorColorTo;
      const channel = overrides.channel ?? bitmapEditorColorChannel;
      const scope = overrides.scope ?? bitmapEditorColorScope;
      let next = baseline;
      const iterations = operation === "replace" ? 1 : Math.abs(bitmapEditorColorDraftRef.current?.steps ?? 0);
      for (let step = 0; step < iterations; step += 1) {
        const direction = (bitmapEditorColorDraftRef.current?.steps ?? 0) < 0 ? "decrease" : "increase";
        const transformOperation = operation === "replace" ? "replace" : direction;
        const transformed = makeBitmapEditorColorTransform(result, frameIndex, next, transformOperation, from, to, channel, scope);
        if (transformed === null) break;
        next = transformed;
      }
      if (next !== null) setResultEditorBuffer(next);
    } catch {
      setExportError("Bitmap editor could not preview the color transform.");
    }
  }

  function applyBitmapEditorColorStep(operation: "increase" | "decrease"): void {
    const result = bitmapEditorCurrentResultRef.current ?? draftPreviewResult(draftState) ?? lastFinal;
    if (result === null) return;
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, Math.max(0, result.frames.length - 1));
    const current = bitmapEditorResultBufferRef.current ?? initializeResultEditor(result, frameIndex);
    if (current === null) return;
    let draft = bitmapEditorColorDraftRef.current;
    if (draft?.result !== result || draft.frameIndex !== frameIndex) {
      draft = { result, frameIndex, baseline: cloneNativeResultBitmap(current), steps: 0 };
      bitmapEditorColorDraftRef.current = draft;
    }
    draft.steps = Math.max(-7, Math.min(7, draft.steps + (operation === "increase" ? 1 : -1)));
    setBitmapEditorColorOperation(operation);
    previewBitmapEditorColorTransform(operation);
    const stepDirection = draft.steps > 0 ? "up" : draft.steps < 0 ? "down" : "unchanged";
    setImageStatus(`Color preview adjusted ${stepDirection} (${Math.abs(draft.steps)} step${Math.abs(draft.steps) === 1 ? "" : "s"}). Apply to save; Undo restores the saved colors.`);
  }

  function commitBitmapEditorColorDraft(): void {
    const draft = bitmapEditorColorDraftRef.current;
    if (draft === null) return;
    const preview = bitmapEditorResultBufferRef.current;
    bitmapEditorColorDraftRef.current = null;
    if (preview === null) return;
    const changed = commitBitmapEditorResultEdit(draft.result, draft.frameIndex, draft.baseline, preview);
    setImageStatus(changed ? "Color changes saved to the result. Use Undo to restore the previous colors." : "No color changes to save.");
  }

  function cancelBitmapEditorColorDraft(): void {
    const draft = bitmapEditorColorDraftRef.current;
    if (draft === null) return;
    bitmapEditorColorDraftRef.current = null;
    setResultEditorBuffer(draft.baseline);
    setImageStatus("Palette changes canceled. The image is back to its original colors.");
  }

  function startBitmapEditorPaste(mode: "copy" | "move"): void {
    if (bitmapEditorActiveResult() === null || bitmapEditorActiveNativeBuffer() === null) {
      setImageStatus("Selection paste is available on the converted result.");
      return;
    }
    if (!bitmapEditorPastePixels && !bitmapEditorPasteAttributes) {
      setImageStatus("Turn on PIXELS, ATTRS, or both before pasting.");
      return;
    }
    if (bitmapEditorClipboard === null && bitmapEditorRegionSelection !== null) {
      copyBitmapEditorSelection();
    }
    if (bitmapEditorClipboard === null && bitmapEditorRegionSelection === null) return;
    setBitmapEditorPasteMode(mode);
    setBitmapEditorSelectionTool("none");
    const willPasteAttributes = bitmapEditorPasteAttributes && bitmapEditorActiveResult()?.platformId === "zx-spectrum";
    setImageStatus(mode === "move"
      ? "Move selected content · click a destination. Turn Selection mode Off to stop."
      : `Paste ${bitmapEditorPastePixels ? "pixels" : ""}${bitmapEditorPastePixels && willPasteAttributes ? " and " : ""}${willPasteAttributes ? "attributes" : ""} · click a destination. Turn Selection mode Off to stop.`);
  }

  function shiftBitmapEditorSelection(
    direction: "left" | "right" | "up" | "down",
    resolution: BitmapSelectionResolution = "pixel",
  ): void {
    const selection = bitmapEditorRegionSelection;
    const result = bitmapEditorActiveResult();
    const current = bitmapEditorActiveNativeBuffer();
    if (selection === null || result === null || current === null) return;
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, result.frames.length - 1);
    const input = resultFrameInput(result, frameIndex);
    if (input === null) return;
    const values = new Uint8Array(selection.width * selection.height);
    for (let y = 0; y < selection.height; y += 1) {
      for (let x = 0; x < selection.width; x += 1) {
        const offset = y * selection.width + x;
        if (selection.mask[offset] !== 1) continue;
        values[offset] = current.paletteIndices[(selection.y + y) * current.width + selection.x + x] ?? 0;
      }
    }
    const stepCount = resolution === "attribute"
      ? direction === "left" || direction === "right" ? selection.gridWidth : selection.gridHeight
      : 1;
    let shiftedValues: Uint8Array<ArrayBufferLike> = values;
    for (let step = 0; step < stepCount; step += 1) {
      shiftedValues = shiftBitmapRegionPixels(shiftedValues, selection.mask, selection.width, selection.height, direction);
    }
    let next = composeNativeResultRegion(
      current,
      input,
      shiftedValues,
      selection.mask,
      selection.width,
      selection.height,
      selection.x,
      selection.y,
      "copy",
      bitmapEditorResultPaletteIndex,
    );
    if (resolution === "attribute" && next.platformId === "zx-spectrum" && input.attributeHeight !== null) {
      const cellWidth = selection.gridWidth;
      const cellHeight = selection.gridHeight;
      const columns = Math.floor(selection.width / cellWidth);
      const rows = Math.floor(selection.height / cellHeight);
      const firstCellX = Math.floor(selection.x / cellWidth);
      const firstCellY = Math.floor(selection.y / cellHeight);
      if (columns > 0 && rows > 0 && cellWidth === 8 && cellHeight === input.attributeHeight) {
        const cellMask = new Uint8Array(columns * rows);
        const cellValues = new Uint8Array(columns * rows);
        for (let cellY = 0; cellY < rows; cellY += 1) {
          for (let cellX = 0; cellX < columns; cellX += 1) {
            let fullySelected = true;
            for (let y = 0; y < cellHeight && fullySelected; y += 1) {
              for (let x = 0; x < cellWidth; x += 1) {
                const localX = cellX * cellWidth + x;
                const localY = cellY * cellHeight + y;
                if (selection.mask[localY * selection.width + localX] !== 1) {
                  fullySelected = false;
                  break;
                }
              }
            }
            if (!fullySelected) continue;
            const localCell = cellY * columns + cellX;
            const absoluteCellX = firstCellX + cellX;
            const absoluteCellY = firstCellY + cellY;
            cellMask[localCell] = 1;
            cellValues[localCell] = current.encoded[ZX_BITMAP_BYTES + absoluteCellY * 32 + absoluteCellX] ?? 0;
          }
        }
        const shiftedAttributes = shiftBitmapRegionPixels(cellValues, cellMask, columns, rows, direction);
        const encoded = next.encoded.slice();
        for (let cellY = 0; cellY < rows; cellY += 1) {
          for (let cellX = 0; cellX < columns; cellX += 1) {
            const localCell = cellY * columns + cellX;
            if (cellMask[localCell] !== 1) continue;
            const absoluteCellX = firstCellX + cellX;
            const absoluteCellY = firstCellY + cellY;
            encoded[ZX_BITMAP_BYTES + absoluteCellY * 32 + absoluteCellX] = shiftedAttributes[localCell] ?? 0;
          }
        }
        next = createNativeResultBitmap({ ...input, encoded });
      }
    }
    commitBitmapEditorResultEdit(result, frameIndex, current, next);
    setImageStatus(resolution === "attribute" && result.platformId === "zx-spectrum"
      ? `Selected pixels and attributes rotated ${direction} with wrap.`
      : `Selected pixels rotated ${direction} with wrap.`);
  }

  function placeBitmapEditorClipboard(
    destination: { readonly x: number; readonly y: number },
    mode: "copy" | "move" | null = bitmapEditorPasteMode,
    clipboard = bitmapEditorClipboard,
    operation = bitmapEditorOperation,
    preserveColors = false,
    includePixels = bitmapEditorPastePixels,
    includeAttributes = bitmapEditorPasteAttributes,
    eraseOrigin?: { readonly x: number; readonly y: number },
    forcePixelResolution = false,
    eraseSelection?: BitmapRegionSelection,
  ): void {
    const result = bitmapEditorActiveResult();
    const current = bitmapEditorActiveNativeBuffer();
    if (clipboard === null || result === null || current === null) return;
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, result.frames.length - 1);
    const input = resultFrameInput(result, frameIndex);
    if (input === null) return;
    const pasteAttributes = includeAttributes && clipboard.attributes !== null && clipboard.attributeMask !== null && result.platformId === "zx-spectrum";
    const pastePixels = includePixels;
    if (!pastePixels && !pasteAttributes) {
      setImageStatus("Turn on PIXELS, ATTRS, or both before pasting.");
      return;
    }
    const grid = bitmapEditorAttributeGrid();
    const snapToAttributes = !forcePixelResolution && bitmapEditorSelectionResolution === "attribute" && grid.width !== null && grid.height !== null;
    const stepX = snapToAttributes ? grid.width! : 1;
    const stepY = snapToAttributes ? grid.height! : 1;
    const maxX = Math.max(0, Math.floor((current.width - clipboard.width) / stepX) * stepX);
    const maxY = Math.max(0, Math.floor((current.height - clipboard.height) / stepY) * stepY);
    const pixelX = Math.max(0, Math.min(maxX, Math.round(destination.x / stepX) * stepX));
    const pixelY = Math.max(0, Math.min(maxY, Math.round(destination.y / stepY) * stepY));
    const currentSelection = bitmapEditorRegionSelection;
    const moveSelection = eraseSelection ?? (mode === "move" ? clipboard.eraseSelection : undefined);
    const moveOrigin = eraseOrigin ?? moveSelection ?? currentSelection ?? { x: clipboard.sourceX, y: clipboard.sourceY };
    let base = current;
    if (mode === "move") {
      if (pastePixels) {
        const eraseWidth = moveSelection?.width ?? clipboard.width;
        const eraseHeight = moveSelection?.height ?? clipboard.height;
        const eraseMask = moveSelection?.mask ?? clipboard.mask;
        const sourceOn = new Uint8Array(eraseWidth * eraseHeight).fill(1);
        base = composeNativeResultRegion(
          base, input, sourceOn, eraseMask, eraseWidth, eraseHeight,
          moveOrigin.x, moveOrigin.y, "and", bitmapEditorResultPaletteIndex,
        );
      }
      if (pasteAttributes && base.platformId === "zx-spectrum" && input.attributeHeight !== null && clipboard.attributes !== null && clipboard.attributeMask !== null) {
        const eraseWidth = moveSelection?.width ?? clipboard.width;
        const eraseHeight = moveSelection?.height ?? clipboard.height;
        const eraseMask = moveSelection?.mask ?? clipboard.mask;
        const columns = Math.ceil((moveOrigin.x + eraseWidth) / clipboard.attributeWidth) -
          Math.floor(moveOrigin.x / clipboard.attributeWidth);
        const rows = Math.ceil((moveOrigin.y + eraseHeight) / clipboard.attributeHeight) -
          Math.floor(moveOrigin.y / clipboard.attributeHeight);
        const encoded = base.encoded.slice();
        const firstCellX = Math.floor(moveOrigin.x / clipboard.attributeWidth);
        const firstCellY = Math.floor(moveOrigin.y / clipboard.attributeHeight);
        for (let cellY = 0; cellY < rows; cellY += 1) for (let cellX = 0; cellX < columns; cellX += 1) {
          const sourceCellX = firstCellX + cellX;
          const sourceCellY = firstCellY + cellY;
          let complete = true;
          for (let y = 0; y < clipboard.attributeHeight && complete; y += 1) {
            for (let x = 0; x < clipboard.attributeWidth; x += 1) {
              const localX = sourceCellX * clipboard.attributeWidth + x - moveOrigin.x;
              const localY = sourceCellY * clipboard.attributeHeight + y - moveOrigin.y;
              if (localX < 0 || localX >= eraseWidth || localY < 0 || localY >= eraseHeight ||
                  eraseMask[localY * eraseWidth + localX] !== 1) {
                complete = false;
                break;
              }
            }
          }
          if (complete && sourceCellX >= 0 && sourceCellX < 32 && sourceCellY >= 0 && sourceCellY < 192 / input.attributeHeight) {
            encoded[ZX_BITMAP_BYTES + sourceCellY * 32 + sourceCellX] = 0;
          }
        }
        base = createNativeResultBitmap({ ...input, encoded });
      }
    }
    let next = base;
    if (pastePixels) {
      const recoloredPixels = preserveColors
        ? clipboard.paletteIndices
        : clipboard.paletteIndices.map((index) => index === 0 ? 0 : Math.max(1, bitmapEditorResultPaletteIndex));
      next = composeNativeResultRegion(
        base, input, recoloredPixels, clipboard.mask, clipboard.width, clipboard.height,
        pixelX, pixelY, operation, bitmapEditorResultPaletteIndex,
      );
      if (next.platformId === "zx-spectrum" && input.attributeHeight !== null && operation !== "none") {
        const touchedPixels: Array<{ readonly x: number; readonly y: number }> = [];
        for (let sourceY = 0; sourceY < clipboard.height; sourceY += 1) {
          for (let sourceX = 0; sourceX < clipboard.width; sourceX += 1) {
            if (clipboard.mask[sourceY * clipboard.width + sourceX] !== 1) continue;
            const destinationPixelX = pixelX + sourceX;
            const destinationPixelY = pixelY + sourceY;
            if (destinationPixelX >= 0 && destinationPixelX < next.width && destinationPixelY >= 0 && destinationPixelY < next.height) {
              touchedPixels.push({ x: destinationPixelX, y: destinationPixelY });
            }
          }
        }
        if (touchedPixels.length > 0) {
          const encoded = applyBitmapEditorAttributesToPixels(next.encoded, input.attributeHeight, touchedPixels);
          next = createNativeResultBitmap({ ...input, encoded });
        }
      }
    }
    if (pasteAttributes && next.platformId === "zx-spectrum" &&
        input.attributeHeight !== null && clipboard.attributes !== null && clipboard.attributeMask !== null) {
      const cellWidth = clipboard.attributeWidth;
      const cellHeight = clipboard.attributeHeight;
      const sourceFirstCellX = Math.floor(clipboard.sourceAttributeX / cellWidth);
      const sourceFirstCellY = Math.floor(clipboard.sourceAttributeY / cellHeight);
      const cellColumns = Math.ceil((clipboard.sourceX + clipboard.width) / cellWidth) - sourceFirstCellX;
      const cellRows = Math.ceil((clipboard.sourceY + clipboard.height) / cellHeight) - sourceFirstCellY;
      const destinationFirstCellX = Math.floor(pixelX / cellWidth);
      const destinationFirstCellY = Math.floor(pixelY / cellHeight);
      const destinationLastCellX = Math.ceil((pixelX + clipboard.width) / cellWidth);
      const destinationLastCellY = Math.ceil((pixelY + clipboard.height) / cellHeight);
      const encoded = next.encoded.slice();
      for (let destinationCellY = destinationFirstCellY; destinationCellY < destinationLastCellY; destinationCellY += 1) {
        for (let destinationCellX = destinationFirstCellX; destinationCellX < destinationLastCellX; destinationCellX += 1) {
          if (destinationCellX < 0 || destinationCellX >= 32 ||
              destinationCellY < 0 || destinationCellY >= 192 / cellHeight) continue;
          const overlapLeft = Math.max(pixelX, destinationCellX * cellWidth);
          const overlapTop = Math.max(pixelY, destinationCellY * cellHeight);
          const overlapRight = Math.min(pixelX + clipboard.width, (destinationCellX + 1) * cellWidth, current.width);
          const overlapBottom = Math.min(pixelY + clipboard.height, (destinationCellY + 1) * cellHeight, current.height);
          if (overlapLeft >= overlapRight || overlapTop >= overlapBottom) continue;
          const overlapCenterX = Math.floor((overlapLeft + overlapRight - 1) / 2);
          const overlapCenterY = Math.floor((overlapTop + overlapBottom - 1) / 2);
          const sourcePixelX = clipboard.sourceX + overlapCenterX - pixelX;
          const sourcePixelY = clipboard.sourceY + overlapCenterY - pixelY;
          const sourceCellX = Math.floor(sourcePixelX / cellWidth);
          const sourceCellY = Math.floor(sourcePixelY / cellHeight);
          const localCellX = sourceCellX - sourceFirstCellX;
          const localCellY = sourceCellY - sourceFirstCellY;
          if (localCellX < 0 || localCellX >= cellColumns || localCellY < 0 || localCellY >= cellRows) continue;
          const sourceCell = localCellY * cellColumns + localCellX;
          if (clipboard.attributeMask[sourceCell] !== 1) continue;
          let hasSelectedPixel = false;
          for (let y = overlapTop; y < overlapBottom && !hasSelectedPixel; y += 1) {
            for (let x = overlapLeft; x < overlapRight; x += 1) {
              const sourceX = x - pixelX;
              const sourceY = y - pixelY;
              if (clipboard.mask[sourceY * clipboard.width + sourceX] === 1) {
                hasSelectedPixel = true;
                break;
              }
            }
          }
          if (!hasSelectedPixel) continue;
          encoded[ZX_BITMAP_BYTES + destinationCellY * 32 + destinationCellX] = clipboard.attributes[sourceCell] ?? 0;
        }
      }
      next = createNativeResultBitmap({ ...input, encoded });
    }
    commitBitmapEditorResultEdit(result, frameIndex, current, next);
    if (mode === "move") {
      if (currentSelection !== null && currentSelection.width === clipboard.width && currentSelection.height === clipboard.height) {
        setBitmapEditorRegionSelection({ ...currentSelection, x: pixelX, y: pixelY });
      }
      setImageStatus("Selection moved · Selection paint remains active until you turn it Off.");
    } else {
      setImageStatus(`Pasted selection clipboard · ${pastePixels ? "pixels" : ""}${pastePixels && pasteAttributes ? " and " : ""}${pasteAttributes ? "attributes" : ""} · selection paint remains active until you turn it Off.`);
    }
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

  function expandResultPreviewForFrame(
    bitmap: NativeResultBitmap,
    frame: WorkerConversionResult["frames"][number],
  ): Uint8Array {
    if (bitmap.rgba.length === frame.previewRgba.length) return bitmap.rgba.slice();
    if (bitmap.platformId === "sinclair-ql" && bitmap.width * 2 === frame.nativeWidth * 2 &&
        frame.previewRgba.length === bitmap.rgba.length * 2) {
      const expanded = new Uint8Array(frame.previewRgba.length);
      for (let y = 0; y < bitmap.height; y += 1) {
        for (let x = 0; x < bitmap.width; x += 1) {
          const source = (y * bitmap.width + x) * 4;
          const target = (y * bitmap.width * 2 + x * 2) * 4;
          expanded.set(bitmap.rgba.subarray(source, source + 4), target);
          expanded.set(bitmap.rgba.subarray(source, source + 4), target + 4);
        }
      }
      return expanded;
    }
    return bitmap.rgba.slice();
  }

  function mergedResultPreview(
    result: WorkerConversionResult,
    frames: readonly WorkerConversionResult["frames"][number][],
  ): Uint8Array {
    const first = frames[0];
    if (first === undefined) return result.mergedPreviewRgba.slice();
    if (frames.length === 1) return first.previewRgba.slice();
    const second = frames[1];
    if (second === undefined) return first.previewRgba.slice();
    if (result.platformId === "sinclair-ql" &&
        first.previewRgba.length === result.width * result.height * 4 &&
        second.previewRgba.length === result.width * result.height * 4) {
      return renderQlMixedDisplayPreview(
        first.previewRgba,
        second.previewRgba,
        result.width,
        qlMixedDisplayResolution,
      );
    }
    if (result.platformId === "zx-spectrum" && result.modeId === "zx48-mixed-256x192") {
      return mergeTemporalRgba(first.previewRgba, second.previewRgba);
    }
    if (result.platformId === "zx-spectrum") {
      return mergeMonochromeRgba(first.previewRgba, second.previewRgba);
    }
    return first.previewRgba.slice();
  }

  function resultWithEditedFrame(
    result: WorkerConversionResult,
    frameIndex: number,
    bitmap: NativeResultBitmap,
  ): WorkerConversionResult {
    const frames = result.frames.map((frame, index) => index === frameIndex
      ? {
          ...frame,
          encoded: bitmap.encoded.slice(),
          paletteIndices: bitmap.paletteIndices.slice(),
          previewRgba: expandResultPreviewForFrame(bitmap, frame),
        }
      : frame);
    const mergedPreviewRgba = mergedResultPreview(result, frames);
    const verticalSpatialDiagnostics = result.verticalSpatialDiagnostics === undefined
      ? undefined
      : {
          ...result.verticalSpatialDiagnostics,
          analyticPreviewRgba: buildVerticalSpatialAnalyticPreview(
            mergedPreviewRgba,
            result.width,
            result.height,
          ),
        };
    return {
      ...result,
      artifact: frames[0]?.encoded.slice() ?? result.artifact.slice(),
      scr: frames[0]?.encoded.slice() ?? result.scr.slice(),
      frames,
      previewRgba: mergedPreviewRgba.slice(),
      mergedPreviewRgba,
      ...(verticalSpatialDiagnostics === undefined ? {} : { verticalSpatialDiagnostics }),
      ...(result.platformId === "zx-spectrum" && frames[0] !== undefined
        ? {
            pixels: unpackZxBitmap(frames[0].encoded),
            attributes: frames[0].encoded.slice(6144),
            screen: {
              pixels: unpackZxBitmap(frames[0].encoded),
              attributes: frames[0].encoded.slice(6144),
            },
          }
        : {}),
    };
  }

  const bitmapEditorColorForState: BitmapPixelColor = (x, y, on) => {
    if (bitmapEditorTarget === "source") return bitmapEditorSourceColor;
    const activeResult = draftPreviewResult(draftState) ?? lastFinal;
    if (activeResult?.platformId !== "zx-spectrum") return null;
    const frameIndex = bitmapEditorTarget === "result"
      ? bitmapEditorResultFrameIndex
      : outputPreviewStage === "screen-2" ? 1 : 0;
    const encoded = bitmapEditorTarget === "result"
      ? bitmapEditorResultBufferRef.current?.encoded ?? activeResult.frames[frameIndex]?.encoded
      : activeResult.frames[frameIndex]?.encoded ?? activeResult.frames[0]?.encoded;
    if (encoded === undefined || x >= 256 || y >= 192) return null;
    const activeAttributeHeight = activeResult.attributeHeight ?? attributeHeight;
    if (activeAttributeHeight === null || encoded.length < 6144 + 32 * (192 / activeAttributeHeight)) return null;
    let inspected: InspectedAttribute;
    try {
      inspected = inspectSoftwareScr(encoded, activeAttributeHeight, x, y);
    } catch {
      return null;
    }
    const colorCode = on
      ? (bitmapEditorInkColor ?? inspected.ink)
      : (bitmapEditorPaperColor ?? inspected.paper);
    const paletteColor = ZX_BASE_COLORS[colorCode];
    if (paletteColor === undefined) return null;
    const bright = bitmapEditorBrightPolicy ?? inspected.bright;
    const rgb = hexToRgb(bright ? paletteColor.bright : paletteColor.normal);
    return [rgb.r, rgb.g, rgb.b, 255];
  };

  function captureBitmapEditorSourceColor(x: number, y: number): void {
    const source = bitmapEditorFullBufferRef.current ?? fullBitmapBufferFromSource();
    if (source === null || x >= source.width || y >= source.height) return;
    const offset = (y * source.width + x) * 4;
    setBitmapEditorSourceColor([
      source.rgba[offset] ?? 0,
      source.rgba[offset + 1] ?? 0,
      source.rgba[offset + 2] ?? 0,
      source.rgba[offset + 3] ?? 255,
    ]);
    setBitmapEditorColorPickerActive(false);
  }

  function captureBitmapEditorResultColor(x: number, y: number): void {
    const result = draftPreviewResult(draftState) ?? lastFinal;
    const buffer = bitmapEditorResultBufferRef.current ??
      (result === null ? null : initializeResultEditor(result, bitmapEditorResultFrameIndex));
    if (buffer === null || x >= buffer.width || y >= buffer.height) return;
    const index = buffer.paletteIndices[y * buffer.width + x] ?? 0;
    setBitmapEditorResultPaletteIndex(index === 0 ? 1 : index);
    if (buffer.platformId === "zx-spectrum") captureBitmapEditorAttribute(x, y);
    else setBitmapEditorColorPickerActive(false);
  }

  function captureBitmapEditorAttribute(pixelX: number, pixelY: number): void {
    const activeResult = draftPreviewResult(draftState) ?? lastFinal;
    if (activeResult === null || activeResult.platformId !== "zx-spectrum") return;
    const frameIndex = bitmapEditorTarget === "result"
      ? bitmapEditorResultFrameIndex
      : outputPreviewStage === "screen-2" ? 1 : 0;
    const encoded = bitmapEditorTarget === "result"
      ? bitmapEditorResultBufferRef.current?.encoded ?? activeResult.frames[frameIndex]?.encoded
      : activeResult.frames[frameIndex]?.encoded ?? activeResult.frames[0]?.encoded;
    if (encoded === undefined) return;
    const selected = inspectSoftwareScr(
      encoded,
      activeResult.attributeHeight ?? attributeHeight,
      Math.max(0, Math.min(255, pixelX)),
      Math.max(0, Math.min(191, pixelY)),
    );
    setInspection(selected);
    setBitmapEditorSelection(selected);
    setBitmapEditorCell({
      rows: Uint8Array.from(selected.bitmapBytes.slice(0, 8)),
      attribute: selected.attribute,
    });
    setBitmapEditorInkColor(selected.ink);
    setBitmapEditorPaperColor(selected.paper);
    setBitmapEditorBrightPolicy(selected.bright);
    setBitmapEditorFlashPolicy((selected.attribute & 0x80) !== 0);
    setBitmapEditorColorPickerActive(false);
  }

  function applyBitmapEditorAttributesToPixels(
    encoded: Uint8Array,
    attributeHeight: 1 | 2 | 4 | 8,
    pixels: readonly { readonly x: number; readonly y: number }[],
  ): Uint8Array {
    const next = encoded.slice();
    const cells = new Set<string>();
    for (const pixel of pixels) {
      if (pixel.x < 0 || pixel.x >= 256 || pixel.y < 0 || pixel.y >= 192) continue;
      cells.add(`${Math.floor(pixel.x / 8)},${Math.floor(pixel.y / attributeHeight)}`);
    }
    for (const key of cells) {
      const [cellXText, cellYText] = key.split(",");
      const cellX = Number(cellXText);
      const cellY = Number(cellYText);
      const current = readZxAttributeCell(next, attributeHeight, cellX, cellY);
      const selected = applyZxAttributeSelection(current, bitmapEditorAttributeSelection());
      next[ZX_BITMAP_BYTES + cellY * 32 + cellX] = selected.attribute;
    }
    return next;
  }

  function updateResultPreviewFromBitmap(buffer: BitmapEditorBuffer): void {
    const activeResult = draftPreviewResult(draftState) ?? lastFinal;
    if (activeResult === null) return;
    const frameIndex = outputPreviewStage === "screen-2" ? 1 : 0;
    const frames = activeResult.frames.map((frame, index) =>
      index === frameIndex && frame.previewRgba.length === buffer.rgba.length
        ? { ...frame, previewRgba: buffer.rgba.slice() }
        : frame,
    );
    const nextResult: WorkerConversionResult = {
      ...activeResult,
      frames,
      previewRgba: buffer.rgba.slice(),
      mergedPreviewRgba: buffer.rgba.slice(),
    };
    setDraftState({ kind: "idle" });
    setLastFinal(nextResult);
    setState({ kind: "ready", result: nextResult });
  }

  function promoteBitmapSource(pixel: { readonly x: number; readonly y: number }): void {
    if (bitmapEditorScope !== "pixel") return;
    const base = bitmapEditorFullBufferRef.current ?? fullBitmapBufferFromSource();
    if (base === null || image === null) return;
    if (bitmapEditorFullBufferRef.current === null) {
      setBitmapEditorRevertSource({ ...image, rgba: image.rgba.slice() });
    }
    const pointer = bitmapEditorFullPointerRef.current;
    const pixels = bitmapEditorBrushPixels(pixel.x, pixel.y, bitmapEditorBrushSize, base.width, base.height)
      .filter((point) => pointer === null || !pointer.visited.has(`${point.x},${point.y}`));
    for (const point of pixels) pointer?.visited.add(`${point.x},${point.y}`);
    const sourcePaintMode = bitmapEditorOperation === "xor"
      ? "toggle"
      : bitmapEditorOperation === "and" ? "reset" : bitmapEditorOperation === "none" ? "none" : "set";
    const next = paintPixels(base, pixels, sourcePaintMode, bitmapEditorColorForState);
    let changed = next.rgba.length !== base.rgba.length;
    if (!changed) {
      for (let index = 0; index < next.rgba.length; index += 1) {
        if (next.rgba[index] !== base.rgba[index]) { changed = true; break; }
      }
    }
    if (!changed) return;
    bitmapEditorFullBufferRef.current = next;
    setBitmapEditorBuffer(next);
    if (pointer !== null && !pointer.historyCaptured) {
      setBitmapEditorUndoFull((history) => [...history, cloneBitmapBuffer(base)]);
      pointer.historyCaptured = true;
    }
    setBitmapEditorRedoFull([]);
    setImage({ ...image, width: next.width, height: next.height, rgba: next.rgba.slice() });
    skipNextDraftAfterBitmapEditRef.current = false;
    setImageStatus("Working source · manually edited. Convert will reprocess the edited source with current settings.");
    setDirty(true);
  }

  function promoteBitmapResult(pixel: { readonly x: number; readonly y: number }): void {
    if (bitmapEditorScope !== "pixel") return;
    const result = bitmapEditorCurrentResultRef.current ?? draftPreviewResult(draftState) ?? lastFinal;
    if (result === null) return;
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, Math.max(0, result.frames.length - 1));
    const input = resultFrameInput(result, frameIndex);
    if (input === null) return;
    const current = bitmapEditorResultBufferRef.current ?? initializeResultEditor(result, frameIndex);
    if (current === null) return;
    const pointer = bitmapEditorFullPointerRef.current;
    const pixels = bitmapEditorBrushPixels(pixel.x, pixel.y, bitmapEditorBrushSize, current.width, current.height)
      .filter((point) => pointer === null || !pointer.visited.has(`${point.x},${point.y}`));
    for (const point of pixels) pointer?.visited.add(`${point.x},${point.y}`);
    if (bitmapEditorStippleEnabled && bitmapEditorOperation !== "none") {
      const matrix = bitmapEditorOrderedMatrix();
      if (matrix !== null && pixels.length > 0) {
        const left = Math.min(...pixels.map(({ x }) => x));
        const top = Math.min(...pixels.map(({ y }) => y));
        const right = Math.max(...pixels.map(({ x }) => x));
        const bottom = Math.max(...pixels.map(({ y }) => y));
        const width = right - left + 1;
        const height = bottom - top + 1;
        const mask = new Uint8Array(width * height);
        const paletteIndices = new Uint8Array(width * height);
        for (const point of pixels) mask[(point.y - top) * width + point.x - left] = 1;
        const stipplePixels = bitmapEditorStippleFootprint(
          pixel.x, pixel.y, bitmapEditorBrushSize, current.width, current.height,
          matrix, bitmapEditorStippleDensity, false,
        );
        for (const point of stipplePixels) {
          if (point.x < left || point.x > right || point.y < top || point.y > bottom) continue;
          paletteIndices[(point.y - top) * width + point.x - left] = Math.max(1, bitmapEditorResultPaletteIndex);
        }
        let next = composeNativeResultRegion(
          current, input, paletteIndices, mask, width, height, left, top,
          bitmapEditorOperation, bitmapEditorResultPaletteIndex,
        );
        if (next.platformId === "zx-spectrum" && input.attributeHeight !== null) {
          const encoded = applyBitmapEditorAttributesToPixels(next.encoded, input.attributeHeight, pixels);
          next = createNativeResultBitmap({ ...input, encoded });
        }
        commitBitmapEditorResultEdit(result, frameIndex, current, next);
        return;
      }
    }
    let next = applyNativeResultPixels(
      current,
      input,
      pixels,
      bitmapEditorOperation,
      bitmapEditorResultPaletteIndex,
    );
    if (input.platformId === "zx-spectrum" && input.attributeHeight !== null) {
      const encoded = applyBitmapEditorAttributesToPixels(next.encoded, input.attributeHeight, pixels);
      next = createNativeResultBitmap({ ...input, encoded });
    }
    commitBitmapEditorResultEdit(result, frameIndex, current, next);
  }

  function clearBitmapEditorPickedCell(): void {
    setBitmapEditorPickedCell(null);
    setBitmapEditorPickedFrameIndex(null);
  }

  function selectBitmapEditorScope(scope: BitmapEditorScope): void {
    setBitmapEditorScope(scope);
  }

  function cycleBitmapEditorBrushSize(): void {
    setBitmapEditorBrushSize((size) => nextBitmapEditorBrushSize(size));
  }

  function cycleBitmapEditorCellMode(): void {
    setBitmapEditorCellMode((mode) => nextBitmapEditorCellMode(mode));
  }

  function cycleBitmapEditorOperation(): void {
    const operations: readonly BitmapEditorOperation[] = ["copy", "or", "and", "xor", "none"];
    setBitmapEditorOperation((operation) => operations[(operations.indexOf(operation) + 1) % operations.length]!);
  }

  function toggleBitmapEditorColorPicker(): void {
    setBitmapEditorColorPickerActive((active) => !active);
  }

  function toggleBitmapEditorPatternPicker(): void {
    setBitmapEditorPatternPickerActive((active) => !active);
  }

  function fullBitmapAttributeCellFromEvent(
    event: ReactPointerEvent<HTMLDivElement>,
  ): { readonly cellX: number; readonly cellY: number } | null {
    const pixel = fullBitmapPixelFromEvent(event);
    const activeResult = draftPreviewResult(draftState) ?? lastFinal;
    const activeHeight = activeResult?.platformId === "zx-spectrum"
      ? activeResult.attributeHeight
      : null;
    if (pixel === null || activeHeight === null || activeHeight === undefined) return null;
    return { cellX: Math.floor(pixel.x / 8), cellY: Math.floor(pixel.y / activeHeight) };
  }

  function bitmapEditorNativeSourcePickerActive(): boolean {
    return bitmapEditorTarget === "result" && displayedResult?.platformId === "zx-spectrum" &&
      (bitmapEditorColorPickerActive || bitmapEditorPatternPickerActive);
  }

  function bitmapEditorNativeCellToolActive(): boolean {
    return bitmapEditorTarget === "result" && displayedResult?.platformId === "zx-spectrum" &&
      bitmapEditorScope === "cell";
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

  function bitmapEditorAttributeSelection(): ZxAttributeSelection {
    return {
      ink: bitmapEditorInkColor,
      paper: bitmapEditorPaperColor,
      bright: bitmapEditorBrightPolicy,
      flash: bitmapEditorFlashPolicy,
    };
  }

  function commitBitmapEditorResultEdit(
    result: WorkerConversionResult,
    frameIndex: number,
    current: NativeResultBitmap,
    next: NativeResultBitmap,
  ): boolean {
    let changed = next.encoded.length !== current.encoded.length;
    if (!changed) {
      for (let index = 0; index < next.encoded.length; index += 1) {
        if (next.encoded[index] !== current.encoded[index]) { changed = true; break; }
      }
    }
    if (!changed) return false;
    if (!bitmapEditorFullPointerRef.current?.historyCaptured) {
      setBitmapEditorResultUndo((history) => [...history, {
        result,
        bitmap: cloneNativeResultBitmap(current),
        frameIndex,
      }]);
      if (bitmapEditorFullPointerRef.current !== null) bitmapEditorFullPointerRef.current.historyCaptured = true;
    }
    if (bitmapEditorResultOriginal === null) setBitmapEditorResultOriginal(cloneNativeResultBitmap(current));
    if (bitmapEditorResultOriginalResult === null) setBitmapEditorResultOriginalResult(result);
    if (!bitmapEditorResultEdited) {
      const editedDraft = bitmapEditorResultQuality === "Draft" || draftPreviewResult(draftState) === result;
      setBitmapEditorResultQuality(editedDraft ? "Draft" : "High");
      if (editedDraft) setLastFinalCompletedAt(null);
    }
    const nextResult = resultWithEditedFrame(result, frameIndex, next);
    bitmapEditorEncodedRef.current = next.encoded.slice();
    bitmapEditorCurrentResultRef.current = nextResult;
    setResultEditorBuffer(next);
    setLastFinal(nextResult);
    setState({ kind: "ready", result: nextResult });
    setDraftState({ kind: "idle" });
    setBitmapEditorResultRedo([]);
    setBitmapEditorResultEdited(true);
    draftWorkerRef.current?.dispose();
    draftWorkerRef.current = null;
    setImageStatus("Converted result · manually edited. Native bitmap artifact bytes updated.");
    setDirty(true);
    return true;
  }

  function applyBitmapEditorCellOperation(cellX: number, cellY: number): boolean {
    const result = bitmapEditorCurrentResultRef.current ?? draftPreviewResult(draftState) ?? lastFinal;
    if (result?.platformId !== "zx-spectrum") return false;
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, Math.max(0, result.frames.length - 1));
    const input = resultFrameInput(result, frameIndex);
    const current = bitmapEditorResultBufferRef.current ?? initializeResultEditor(result, frameIndex);
    if (input === null || input.attributeHeight === null || current === null) return false;
    const maskRows = bitmapEditorCellMode === "filled"
      ? new Uint8Array(input.attributeHeight).fill(0xff)
      : bitmapEditorPickedCell !== null && bitmapEditorPickedCell.attributeHeight === input.attributeHeight && bitmapEditorPickedFrameIndex === frameIndex
        ? bitmapEditorPickedCell.rows.slice()
        : new Uint8Array(input.attributeHeight);
    let encoded: Uint8Array;
    try {
      encoded = applyZxAttributeCellMaskOperation(current.encoded, input.attributeHeight, cellX, cellY, maskRows, bitmapEditorOperation);
      const destination = readZxAttributeCell(encoded, input.attributeHeight, cellX, cellY);
      const colored = applyZxAttributeSelection(destination, bitmapEditorAttributeSelection());
      if (colored.attribute !== destination.attribute) {
        encoded[ZX_BITMAP_BYTES + cellY * 32 + cellX] = colored.attribute;
      }
    } catch {
      setExportError("Bitmap editor could not apply the attribute-cell operation.");
      return false;
    }
    try {
      const nextBitmap = createNativeResultBitmap({ ...input, encoded });
      return commitBitmapEditorResultEdit(result, frameIndex, current, nextBitmap);
    } catch {
      setExportError("Bitmap editor could not render the edited attribute cell.");
      return false;
    }
  }

  function fullBitmapPixelFromEvent(
    event: { readonly currentTarget: HTMLElement; readonly clientX: number; readonly clientY: number },
    clampToBitmap = false,
  ): { readonly x: number; readonly y: number } | null {
    const rect = event.currentTarget.getBoundingClientRect();
    const activeBuffer = bitmapEditorTarget === "result"
      ? bitmapEditorResultBuffer
      : bitmapEditorBuffer;
    const frame = displayedResult?.frames[bitmapEditorResultFrameIndex];
    const width = activeBuffer?.width ?? (bitmapEditorTarget === "result" ? frame?.nativeWidth : undefined) ?? displayedWidth;
    const height = activeBuffer?.height ?? (bitmapEditorTarget === "result" ? frame?.nativeHeight : undefined) ?? displayedHeight;
    const rawX = Math.floor((event.clientX - rect.left) / rect.width * width);
    const rawY = Math.floor((event.clientY - rect.top) / rect.height * height);
    const x = clampToBitmap ? Math.max(0, Math.min(width - 1, rawX)) : rawX;
    const y = clampToBitmap ? Math.max(0, Math.min(height - 1, rawY)) : rawY;
    return x >= 0 && x < width && y >= 0 && y < height ? { x, y } : null;
  }

  function bitmapEditorSelectionDimensions(): { readonly width: number; readonly height: number } | null {
    const result = bitmapEditorActiveResult();
    const bitmap = bitmapEditorResultBufferRef.current;
    const frame = result?.frames[Math.min(bitmapEditorResultFrameIndex, Math.max(0, result.frames.length - 1))];
    const width = bitmap?.width ?? frame?.nativeWidth;
    const height = bitmap?.height ?? frame?.nativeHeight;
    return width === undefined || height === undefined ? null : { width, height };
  }

  function makeSelectionDraft(kind: BitmapSelectionKind, points: readonly { readonly x: number; readonly y: number }[]): BitmapRegionSelection | null {
    const dimensions = bitmapEditorSelectionDimensions();
    if (dimensions === null) return null;
    return makeBitmapRegionSelection(
      kind,
      kind === "rectangle" && points.length > 1 ? [points[0]!, points[points.length - 1]!] : points,
      dimensions.width,
      dimensions.height,
      bitmapEditorSelectionResolution,
      bitmapEditorAttributeGrid(),
    );
  }

  function selectionContainsPixel(selection: BitmapRegionSelection, pixel: { readonly x: number; readonly y: number }): boolean {
    const localX = pixel.x - selection.x;
    const localY = pixel.y - selection.y;
    return localX >= 0 && localX < selection.width && localY >= 0 && localY < selection.height &&
      selection.mask[localY * selection.width + localX] === 1;
  }

  function bitmapSelectionResizeHandleAt(
    selection: BitmapRegionSelection,
    event: ReactPointerEvent<HTMLDivElement>,
  ): BitmapSelectionResizeHandle | null {
    if (!selection.mask.every((pixel) => pixel === 1)) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const dimensions = bitmapEditorSelectionDimensions();
    if (dimensions === null || rect.width <= 0 || rect.height <= 0) return null;
    const left = rect.left + selection.x / dimensions.width * rect.width;
    const right = rect.left + (selection.x + selection.width) / dimensions.width * rect.width;
    const top = rect.top + selection.y / dimensions.height * rect.height;
    const bottom = rect.top + (selection.y + selection.height) / dimensions.height * rect.height;
    const edgeThresholdX = Math.max(10, rect.width / dimensions.width * 0.65);
    const edgeThresholdY = Math.max(10, rect.height / dimensions.height * 0.65);
    const edgeX = Math.abs(event.clientX - left) <= edgeThresholdX ? "w" : Math.abs(event.clientX - right) <= edgeThresholdX ? "e" : null;
    const edgeY = Math.abs(event.clientY - top) <= edgeThresholdY ? "n" : Math.abs(event.clientY - bottom) <= edgeThresholdY ? "s" : null;
    if (edgeX !== null && edgeY !== null) return `${edgeY}${edgeX}` as BitmapSelectionResizeHandle;
    if (edgeX !== null && event.clientY >= top && event.clientY <= bottom) return edgeX;
    if (edgeY !== null && event.clientX >= left && event.clientX <= right) return edgeY;
    return null;
  }

  function resizeBitmapEditorSelection(
    selection: BitmapRegionSelection,
    handle: BitmapSelectionResizeHandle,
    pixel: { readonly x: number; readonly y: number },
  ): BitmapRegionSelection {
    const dimensions = bitmapEditorSelectionDimensions();
    if (dimensions === null) return selection;
    const grid = bitmapEditorAttributeGrid();
    const attributeResolution = bitmapEditorSelectionResolution === "attribute" && grid.width !== null && grid.height !== null;
    const stepX = attributeResolution ? grid.width! : 1;
    const stepY = attributeResolution ? grid.height! : 1;
    let left = selection.x;
    let top = selection.y;
    let right = selection.x + selection.width;
    let bottom = selection.y + selection.height;
    if (handle.includes("w")) left = Math.max(0, Math.min(right - stepX, Math.floor(pixel.x / stepX) * stepX));
    if (handle.includes("e")) right = Math.min(dimensions.width, Math.max(left + stepX, Math.ceil((pixel.x + 1) / stepX) * stepX));
    if (handle.includes("n")) top = Math.max(0, Math.min(bottom - stepY, Math.floor(pixel.y / stepY) * stepY));
    if (handle.includes("s")) bottom = Math.min(dimensions.height, Math.max(top + stepY, Math.ceil((pixel.y + 1) / stepY) * stepY));
    return { ...selection, x: left, y: top, width: right - left, height: bottom - top, mask: new Uint8Array((right - left) * (bottom - top)).fill(1) };
  }

  function moveBitmapEditorSelection(
    selection: BitmapRegionSelection,
    start: { readonly x: number; readonly y: number },
    current: { readonly x: number; readonly y: number },
  ): BitmapRegionSelection {
    const dimensions = bitmapEditorSelectionDimensions();
    if (dimensions === null) return selection;
    const grid = bitmapEditorAttributeGrid();
    const attributeResolution = bitmapEditorSelectionResolution === "attribute" && grid.width !== null && grid.height !== null;
    const stepX = attributeResolution ? grid.width! : 1;
    const stepY = attributeResolution ? grid.height! : 1;
    const maxX = Math.max(0, Math.floor((dimensions.width - selection.width) / stepX) * stepX);
    const maxY = Math.max(0, Math.floor((dimensions.height - selection.height) / stepY) * stepY);
    const x = Math.max(0, Math.min(maxX, Math.round((selection.x + current.x - start.x) / stepX) * stepX));
    const y = Math.max(0, Math.min(maxY, Math.round((selection.y + current.y - start.y) / stepY) * stepY));
    return { ...selection, x, y };
  }

  function bitmapEditorSelectionResizeHandles(selection: BitmapRegionSelection): readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[] {
    if (!selection.mask.every((pixel) => pixel === 1)) return [];
    const size = 3;
    const half = size / 2;
    const left = selection.x;
    const right = selection.x + selection.width;
    const top = selection.y;
    const bottom = selection.y + selection.height;
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;
    return [
      [left, top], [centerX, top], [right, top],
      [right, centerY], [right, bottom], [centerX, bottom],
      [left, bottom], [left, centerY],
    ].map(([x, y]) => ({ x: x! - half, y: y! - half, width: size, height: size }));
  }

  function beginFullBitmapPointer(side: PreviewSide, event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 1 && event.button !== 2) return;
    event.preventDefault();
    event.stopPropagation();
    const viewport = side === "source" ? sourceViewportRef.current : resultViewportRef.current;
    if (viewport === null) return;
    const pan = event.button === 1 || event.button === 2 || bitmapEditorSpaceRef.current;
    if (event.button === 2) {
      bitmapEditorFullPointerRef.current = {
        side,
        pointerId: event.pointerId,
        visited: new Set(),
        pan: true,
        nativeCells: false,
        button: event.button,
        moved: false,
        historyCaptured: false,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const pixel = event.button === 0 ? fullBitmapPixelFromEvent(event) : null;
    const currentSelection = bitmapEditorRegionSelection;
    if (event.button === 0 && !pan && bitmapEditorTarget === "result" && bitmapEditorToolMode === "selection" && bitmapEditorPasteMode === null && currentSelection !== null) {
      const handle = bitmapSelectionResizeHandleAt(currentSelection, event);
      if (handle !== null) {
        bitmapEditorSelectionPointerRef.current = { action: "resize", side, pointerId: event.pointerId, selection: currentSelection, handle, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      if (pixel !== null && selectionContainsPixel(currentSelection, pixel)) {
        bitmapEditorSelectionPointerRef.current = { action: "move", side, pointerId: event.pointerId, selection: currentSelection, start: pixel, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
    }
    if (event.button === 0 && bitmapEditorToolMode === "selection" && bitmapEditorSelectionTool !== "none") {
      if (pixel === null) return;
      bitmapEditorSelectionPointerRef.current = {
        action: "draw",
        side,
        pointerId: event.pointerId,
        kind: bitmapEditorSelectionTool,
        points: [pixel],
      };
      setBitmapEditorSelectionDraft(null);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button === 0 && bitmapEditorPasteMode !== null) {
      const pixel = fullBitmapPixelFromEvent(event, true);
      if (pixel !== null) placeBitmapEditorClipboard(pixel);
      return;
    }
    if (bitmapEditorNativeSourcePickerActive()) {
      if (event.button !== 0) return;
      const cell = fullBitmapAttributeCellFromEvent(event);
      if (cell === null) return;
      pickBitmapEditorAttributeCell(cell.cellX, cell.cellY);
      return;
    }
    if (bitmapEditorPatternPickerActive && bitmapEditorTarget !== "result") {
      setImageStatus("Select a pattern source from a Converted result pane.");
      return;
    }
    const nativeCells = bitmapEditorNativeCellToolActive();
    if (nativeCells) {
      if (event.button !== 0) return;
      const cell = fullBitmapAttributeCellFromEvent(event);
      if (cell === null) return;
      bitmapEditorFullPointerRef.current = {
        side,
        pointerId: event.pointerId,
        visited: new Set(),
        pan: false,
        nativeCells: true,
        button: event.button,
        moved: false,
        historyCaptured: false,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      bitmapEditorFullPointerRef.current.visited.add(`${cell.cellX},${cell.cellY}`);
      applyBitmapEditorCellOperation(cell.cellX, cell.cellY);
      return;
    }
    const activePixel = pan ? null : pixel;
    if (activePixel !== null && bitmapEditorColorPickerActive) {
      if (bitmapEditorTarget === "source") captureBitmapEditorSourceColor(activePixel.x, activePixel.y);
      else captureBitmapEditorResultColor(activePixel.x, activePixel.y);
      return;
    }
    bitmapEditorFullPointerRef.current = {
      side,
      pointerId: event.pointerId,
      visited: new Set(),
      pan,
      nativeCells: false,
      button: event.button,
      moved: false,
      historyCaptured: false,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (activePixel !== null) {
      if (bitmapEditorTarget === "source") promoteBitmapSource(activePixel);
      else promoteBitmapResult(activePixel);
    }
  }

  function moveFullBitmapPointer(event: ReactPointerEvent<HTMLDivElement>): void {
    const selectionPointer = bitmapEditorSelectionPointerRef.current;
    if (selectionPointer !== null && selectionPointer.pointerId === event.pointerId) {
      event.preventDefault();
      event.stopPropagation();
      const pixel = fullBitmapPixelFromEvent(event, true);
      if (pixel === null) return;
      if (selectionPointer.action === "draw") {
        const last = selectionPointer.points[selectionPointer.points.length - 1];
        if (last !== undefined && (pixel.x !== last.x || pixel.y !== last.y)) {
          selectionPointer.points.push(...bitmapEditorLinePoints(last, pixel));
          const previewPoints = selectionPointer.kind === "rectangle"
            ? [selectionPointer.points[0]!, selectionPointer.points[selectionPointer.points.length - 1]!]
            : selectionPointer.points;
          setBitmapEditorSelectionDraft(makeSelectionDraft(selectionPointer.kind, previewPoints));
        }
      } else if (selectionPointer.action === "move") {
        const moved = moveBitmapEditorSelection(selectionPointer.selection, selectionPointer.start, pixel);
        selectionPointer.moved ||= moved.x !== selectionPointer.selection.x || moved.y !== selectionPointer.selection.y;
        setBitmapEditorSelectionDraft(moved);
      } else {
        const resized = resizeBitmapEditorSelection(selectionPointer.selection, selectionPointer.handle, pixel);
        selectionPointer.moved ||= resized.x !== selectionPointer.selection.x || resized.y !== selectionPointer.selection.y ||
          resized.width !== selectionPointer.selection.width || resized.height !== selectionPointer.selection.height;
        setBitmapEditorSelectionDraft(resized);
      }
      return;
    }
    const pointer = bitmapEditorFullPointerRef.current;
    if (pointer === null || pointer.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    if (pointer.nativeCells) {
      const cell = fullBitmapAttributeCellFromEvent(event);
      if (cell === null) return;
      const key = `${cell.cellX},${cell.cellY}`;
      if (pointer.visited.has(key)) return;
      pointer.visited.add(key);
      applyBitmapEditorCellOperation(cell.cellX, cell.cellY);
      return;
    }
    const viewport = pointer.side === "source" ? sourceViewportRef.current : resultViewportRef.current;
    if (pointer.pan && viewport !== null) {
      if (Math.abs(event.clientX - pointer.startX) > 2 || Math.abs(event.clientY - pointer.startY) > 2) {
        pointer.moved = true;
      }
      viewport.scrollLeft = pointer.scrollLeft - (event.clientX - pointer.startX);
      viewport.scrollTop = pointer.scrollTop - (event.clientY - pointer.startY);
      return;
    }
    const pixel = fullBitmapPixelFromEvent(event);
    if (pixel === null) return;
    if (bitmapEditorTarget === "source") promoteBitmapSource(pixel);
    else promoteBitmapResult(pixel);
  }

  function endFullBitmapPointer(event: ReactPointerEvent<HTMLDivElement>): void {
    const selectionPointer = bitmapEditorSelectionPointerRef.current;
    if (selectionPointer?.pointerId === event.pointerId) {
      const pixel = fullBitmapPixelFromEvent(event, true);
      if (selectionPointer.action === "draw") {
        const points = selectionPointer.kind === "rectangle"
          ? [selectionPointer.points[0]!, selectionPointer.points[selectionPointer.points.length - 1]!]
          : selectionPointer.points;
        const selection = makeSelectionDraft(selectionPointer.kind, points);
        setBitmapEditorRegionSelection(selection);
        if (selection !== null) copyBitmapEditorSelection(selection, false);
      } else if (pixel !== null && selectionPointer.action === "move") {
        const moved = moveBitmapEditorSelection(selectionPointer.selection, selectionPointer.start, pixel);
        if (selectionPointer.moved && (moved.x !== selectionPointer.selection.x || moved.y !== selectionPointer.selection.y)) {
          const clipboard = bitmapEditorClipboard ?? copyBitmapEditorSelection(selectionPointer.selection, false);
          if (clipboard !== null) {
            placeBitmapEditorClipboard({ x: moved.x, y: moved.y }, "move", clipboard, "copy", true, true, true, selectionPointer.selection);
            setBitmapEditorRegionSelection(moved);
          }
        }
      } else if (pixel !== null && selectionPointer.action === "resize") {
        const resized = resizeBitmapEditorSelection(selectionPointer.selection, selectionPointer.handle, pixel);
        if (selectionPointer.moved) {
          setBitmapEditorRegionSelection(resized);
          copyBitmapEditorSelection(resized, false);
        }
      }
      setBitmapEditorSelectionDraft(null);
      bitmapEditorSelectionPointerRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      event.stopPropagation();
      return;
    }
    const pointer = bitmapEditorFullPointerRef.current;
    if (pointer?.pointerId === event.pointerId && pointer.button === 2 && !pointer.moved) {
      cycleBitmapEditorOperation();
    }
    if (pointer?.pointerId === event.pointerId) {
      bitmapEditorFullPointerRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.stopPropagation();
  }

  function clearBitmapEditorSelectionOnDoubleClick(event: ReactMouseEvent<HTMLElement>): void {
    const selection = bitmapEditorRegionSelection;
    const pixel = fullBitmapPixelFromEvent(event);
    if (bitmapEditorPasteMode !== null || selection === null || pixel === null || !selectionContainsPixel(selection, pixel)) return;
    event.preventDefault();
    event.stopPropagation();
    setBitmapEditorRegionSelection(null);
    setBitmapEditorSelectionDraft(null);
    setBitmapEditorPasteMode(null);
    setBitmapEditorSelectionTool("rectangle");
    setImageStatus("Selection cleared · bitmap unchanged.");
  }

  function moveBitmapEditorSelectionByArrow(direction: "left" | "right" | "up" | "down"): void {
    const selection = bitmapEditorRegionSelection;
    if (selection === null || bitmapEditorPasteMode !== null || bitmapEditorTarget !== "result") return;
    const dimensions = bitmapEditorSelectionDimensions();
    if (dimensions === null) return;
    const grid = bitmapEditorAttributeGrid();
    const attributeResolution = bitmapEditorSelectionResolution === "attribute" && grid.width !== null && grid.height !== null;
    const stepX = attributeResolution ? grid.width! : 1;
    const stepY = attributeResolution ? grid.height! : 1;
    const maxX = Math.max(0, Math.floor((dimensions.width - selection.width) / stepX) * stepX);
    const maxY = Math.max(0, Math.floor((dimensions.height - selection.height) / stepY) * stepY);
    const alignedX = attributeResolution ? Math.round(selection.x / stepX) * stepX : selection.x;
    const alignedY = attributeResolution ? Math.round(selection.y / stepY) * stepY : selection.y;
    const x = Math.max(0, Math.min(maxX, alignedX + (direction === "left" ? -stepX : direction === "right" ? stepX : 0)));
    const y = Math.max(0, Math.min(maxY, alignedY + (direction === "up" ? -stepY : direction === "down" ? stepY : 0)));
    if (x === selection.x && y === selection.y) return;
    const moved = { ...selection, x, y };
    const clipboard = bitmapEditorClipboard !== null &&
      bitmapEditorClipboard.width === selection.width && bitmapEditorClipboard.height === selection.height
      ? bitmapEditorClipboard
      : copyBitmapEditorSelection(selection, false);
    if (clipboard === null) return;
    placeBitmapEditorClipboard({ x, y }, "move", clipboard, "copy", true, true, true, selection);
    setBitmapEditorRegionSelection(moved);
  }

  function undoFullBitmap(): void {
    bitmapEditorFullPointerRef.current = null;
    bitmapEditorPointerRef.current = null;
    panDragRef.current = null;
    const previous = bitmapEditorUndoFull[bitmapEditorUndoFull.length - 1];
    const current = bitmapEditorFullBufferRef.current;
    if (previous === undefined || current === null) return;
    setBitmapEditorRedoFull((history) => [...history, cloneBitmapBuffer(current)]);
    const next = cloneBitmapBuffer(previous);
    bitmapEditorFullBufferRef.current = next;
    setBitmapEditorBuffer(next);
    setBitmapEditorUndoFull((history) => history.slice(0, -1));
    skipNextDraftAfterBitmapEditRef.current = true;
    setImage((currentImage) => currentImage === null ? null : { ...currentImage, width: next.width, height: next.height, rgba: next.rgba.slice() });
    updateResultPreviewFromBitmap(next);
    setDirty(true);
  }

  function redoFullBitmap(): void {
    bitmapEditorFullPointerRef.current = null;
    bitmapEditorPointerRef.current = null;
    panDragRef.current = null;
    const next = bitmapEditorRedoFull[bitmapEditorRedoFull.length - 1];
    const current = bitmapEditorFullBufferRef.current;
    if (next === undefined || current === null) return;
    setBitmapEditorUndoFull((history) => [...history, cloneBitmapBuffer(current)]);
    const restored = cloneBitmapBuffer(next);
    bitmapEditorFullBufferRef.current = restored;
    setBitmapEditorBuffer(restored);
    setBitmapEditorRedoFull((history) => history.slice(0, -1));
    skipNextDraftAfterBitmapEditRef.current = true;
    setImage((currentImage) => currentImage === null ? null : { ...currentImage, width: restored.width, height: restored.height, rgba: restored.rgba.slice() });
    updateResultPreviewFromBitmap(restored);
    setDirty(true);
  }

  function commitFullResultSnapshot(snapshot: BitmapEditorResultHistoryEntry): void {
    draftWorkerRef.current?.dispose();
    draftWorkerRef.current = null;
    setDraftState({ kind: "idle" });
    bitmapEditorCurrentResultRef.current = snapshot.result;
    setBitmapEditorResultFrameIndex(snapshot.frameIndex);
    setResultEditorBuffer(cloneNativeResultBitmap(snapshot.bitmap));
    setLastFinal(snapshot.result);
    setState({ kind: "ready", result: snapshot.result });
    setDirty(true);
  }

  function undoFullResult(): void {
    const previous = bitmapEditorResultUndo[bitmapEditorResultUndo.length - 1];
    const current = bitmapEditorResultBufferRef.current;
    const result = lastFinal;
    if (previous === undefined || current === null || result === null) return;
    setBitmapEditorResultRedo((history) => [...history, {
      result,
      bitmap: cloneNativeResultBitmap(current),
      frameIndex: bitmapEditorResultFrameIndex,
    }]);
    setBitmapEditorResultUndo((history) => history.slice(0, -1));
    commitFullResultSnapshot({
      result: previous.result,
      bitmap: cloneNativeResultBitmap(previous.bitmap),
      frameIndex: previous.frameIndex,
    });
  }

  function redoFullResult(): void {
    const next = bitmapEditorResultRedo[bitmapEditorResultRedo.length - 1];
    const current = bitmapEditorResultBufferRef.current;
    const result = lastFinal;
    if (next === undefined || current === null || result === null) return;
    setBitmapEditorResultUndo((history) => [...history, {
      result,
      bitmap: cloneNativeResultBitmap(current),
      frameIndex: bitmapEditorResultFrameIndex,
    }]);
    setBitmapEditorResultRedo((history) => history.slice(0, -1));
    commitFullResultSnapshot({
      result: next.result,
      bitmap: cloneNativeResultBitmap(next.bitmap),
      frameIndex: next.frameIndex,
    });
  }

  function revertFullResult(): void {
    const originalResult = bitmapEditorResultOriginalResult;
    if (originalResult === null) return;
    if (!confirmBitmapEditorAction("revert")) return;
    draftWorkerRef.current?.dispose();
    draftWorkerRef.current = null;
    setDraftState({ kind: "idle" });
    setLastFinal(originalResult);
    setState({ kind: "ready", result: originalResult });
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, Math.max(0, originalResult.frames.length - 1));
    const bitmap = initializeResultEditor(originalResult, frameIndex);
    if (bitmap !== null) setResultEditorBuffer(bitmap);
    setBitmapEditorResultUndo([]);
    setBitmapEditorResultRedo([]);
    setBitmapEditorResultOriginal(null);
    setBitmapEditorResultOriginalResult(null);
    setBitmapEditorResultEdited(false);
    setBitmapEditorResultQuality("High");
    setBitmapEditorFlashPreviewMode("normal");
    setBitmapEditorFlashPreviewPhase(false);
    setImageStatus("Converted result restored to the last High conversion.");
    setDirty(true);
  }

  function revertFullBitmap(): void {
    bitmapEditorFullPointerRef.current = null;
    bitmapEditorPointerRef.current = null;
    panDragRef.current = null;
    if (bitmapEditorRevertSource === null) return;
    if (!confirmBitmapEditorAction("revert")) return;
    const restored = { ...bitmapEditorRevertSource, rgba: bitmapEditorRevertSource.rgba.slice() };
    setImage(restored);
    bitmapEditorFullBufferRef.current = null;
    bitmapEditorEncodedRef.current = null;
    setBitmapEditorBuffer(null);
    setBitmapEditorUndoFull([]);
    setBitmapEditorRedoFull([]);
    setBitmapEditorRevertSource(null);
    setBitmapEditorOriginalResult(null);
    setImageStatus("Original source restored. Ready to reconvert.");
    setDirty(true);
  }

  function handleBitmapEditorKey(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.key.toLowerCase() === "z" && event.shiftKey) {
      event.preventDefault();
      redoBitmapEditor();
    } else if (event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoBitmapEditor();
    } else if (event.key.toLowerCase() === "y") {
      event.preventDefault();
      redoBitmapEditor();
    }
  }

  function handleUnifiedEditorKey(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.key.toLowerCase() === "z" && event.shiftKey) {
      event.preventDefault();
      redoTileEditor();
    } else if (event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoTileEditor();
    } else if (event.key.toLowerCase() === "y") {
      event.preventDefault();
      redoTileEditor();
    }
  }

  function setBitmapEditorAttribute(mask: number, value: number): void {
    if (bitmapEditorCell === null) return;
    applyBitmapEditorOperation({
      kind: "set-attribute",
      attribute: (bitmapEditorCell.attribute & ~mask) | (value & mask),
    });
  }

  function invertBitmapEditorAttributes(): void {
    if (bitmapEditorCell === null) return;
    const ink = bitmapEditorCell.attribute & 7;
    const paper = (bitmapEditorCell.attribute >> 3) & 7;
    applyBitmapEditorOperation({
      kind: "set-attribute",
      attribute: (bitmapEditorCell.attribute & 0xc0) | paper | (ink << 3),
    });
  }

  function applyBitmapEditorToResult(cell: BitmapCell | null = bitmapEditorCell): void {
    const activeResult = draftPreviewResult(draftState) ?? lastFinal;
    if (cell === null || bitmapEditorSelection === null || activeResult === null ||
        activeResult.platformId !== "zx-spectrum" || activeResult.frames.length !== 1) return;
    const frame = activeResult.frames[0];
    const height = activeResult.attributeHeight ?? attributeHeight;
    if (frame === undefined || height !== 8) return;
    const encoded = Uint8Array.from(frame.encoded);
    for (let row = 0; row < 8; row += 1) {
      encoded[zxBitmapOffset(bitmapEditorSelection.cellX, bitmapEditorSelection.cellY * 8 + row)] =
        cell.rows[row] ?? 0;
    }
    encoded[6144 + bitmapEditorSelection.cellY * 32 + bitmapEditorSelection.cellX] =
      cell.attribute;
    const previewRgba = renderAttributeFrameRgba(
      unpackZxBitmap(encoded),
      encoded.subarray(6144),
      height,
      resolveZxPalette(zxPaletteDefinition),
    );
    const nextFrame = { ...frame, encoded, previewRgba };
    const nextResult: WorkerConversionResult = {
      ...activeResult,
      artifact: encoded,
      scr: encoded,
      frames: [nextFrame],
      mergedPreviewRgba: previewRgba,
      previewRgba,
    };
    if (bitmapEditorOriginalResult === null) setBitmapEditorOriginalResult(activeResult);
    if (bitmapEditorResultOriginalResult === null) setBitmapEditorResultOriginalResult(activeResult);
      setLastFinal(nextResult);
      setDraftState({ kind: "idle" });
      setState({ kind: "ready", result: nextResult });
      setBitmapEditorResultEdited(true);
      setImageStatus("Converted result · manually edited. Native artifact bytes updated.");
    setDirty(true);
  }

  function revertBitmapEditorChanges(): void {
    if (bitmapEditorOriginalResult === null) return;
    if (!confirmBitmapEditorAction("revert")) return;
    draftWorkerRef.current?.dispose();
    draftWorkerRef.current = null;
    setLastFinal(bitmapEditorOriginalResult);
    setDraftState({ kind: "idle" });
    setState({ kind: "ready", result: bitmapEditorOriginalResult });
    setBitmapEditorCell(
      bitmapEditorSelection === null
        ? null
        : {
            rows: Uint8Array.from(bitmapEditorSelection.bitmapBytes.slice(0, 8)),
            attribute: bitmapEditorSelection.attribute,
          },
    );
    setBitmapEditorUndo([]);
    setBitmapEditorRedo([]);
    setBitmapEditorOriginalResult(null);
    setBitmapEditorResultOriginalResult(null);
    setBitmapEditorResultEdited(false);
    setImageStatus("Converted result restored to the last High conversion.");
    setDirty(true);
  }

  function markCharsetSelectionChanged(indices: readonly number[]): void {
    const sorted = [...new Set(indices)].sort((left, right) => left - right);
    existingCharsetSelectionRef.current = sorted;
    setExistingCharsetSelection(sorted);
    setCharsetTilesView("source");
    if (sorted.length > 32) setCharsetEncoding("extended");
    setTilemapStale(true);
  }

  function switchCharsetTilesView(view: CharsetTilesView): void {
    for (const timer of charsetSelectionClickRef.current.values()) {
      window.clearTimeout(timer);
    }
    charsetSelectionClickRef.current.clear();
    charsetSelectionDragRef.current = null;
    tileEditorTilePickerClickGuardRef.current = null;
    if (view === "source") {
      setTileEditorColorPickerActive(false);
    } else {
      setCharsetSelectionMode(false);
    }
    setCharsetTilesView(view);
  }

  function toggleCharsetSelectionMode(): void {
    const next = !charsetSelectionMode;
    for (const timer of charsetSelectionClickRef.current.values()) {
      window.clearTimeout(timer);
    }
    charsetSelectionClickRef.current.clear();
    charsetSelectionDragRef.current = null;
    tileEditorTilePickerClickGuardRef.current = null;
    if (next) {
      setTileEditorColorPickerActive(false);
      setTileEditorTilePickerActive(false);
    }
    setCharsetSelectionMode(next);
  }

  function handleSourceCharsetTileClick(sourceIndex: number): void {
    if (charsetSelectionMode) return;
    if (charsetState.kind !== "ready") {
      setImageStatus("Convert the tilemap before selecting source tiles for editing.");
      return;
    }
    if (tilemapStale) {
      setImageStatus("The tilemap is stale. Convert again before using source tiles in the editor or map.");
      return;
    }
    setSelectedSourceCharsetTile(sourceIndex);
    let outputIndex = mapSourceTileToOutputIndex(sourceIndex, emittedSourceCharsetIndices);
    if (outputIndex < 0 && existingCharset !== null) {
      const sourceTile = existingCharset.subarray(sourceIndex * 8, sourceIndex * 8 + 8);
      outputIndex = Array.from({ length: charsetState.result.characterCount }, (_, index) => index)
        .find((index) => charsetState.result.charset.subarray(index * 8, index * 8 + 8)
          .every((byte, row) => byte === sourceTile[row])) ?? -1;
    }
    if (outputIndex < 0) {
      setImageStatus(`Source tile ${sourceIndex + 1} is not in the converted charset. Enable “Edit conversion set”, include it, then convert again.`);
      return;
    }
    if (tileEditorTilePickerActive) {
      applyPickedTilemapIndex(outputIndex);
      setImageStatus(`Source tile ${sourceIndex + 1} selected for the current ${unifiedTileEditorContext === "stamp" ? "tile stamp" : "map cell"}.`);
    } else {
      selectEditorTile(outputIndex);
      setImageStatus(`Source tile ${sourceIndex + 1} selected as output tile ${outputIndex + 1}.`);
    }
  }

  function toggleCharsetCharacter(characterIndex: number): void {
    if (charsetSource !== "existing" || existingCharset === null) return;
    markCharsetSelectionChanged(toggleCharsetSelection(
      currentCharsetSelectionIndices(existingCharset.length / 8),
      existingCharset.length / 8,
      characterIndex,
    ));
  }

  function currentCharsetSelectionIndices(count: number): number[] {
    const selection = existingCharsetSelectionRef.current;
    if (selection !== null) return effectiveCharsetSelection(selection, count);
    const range = clampCharsetRange(count, existingCharsetStart, existingCharsetLength);
    return Array.from({ length: range.length }, (_, index) => range.startIndex + index);
  }

  function paintCharsetCharacter(
    characterIndex: number,
    selecting: boolean,
  ): void {
    const drag = charsetSelectionDragRef.current;
    if (drag === null || drag.visited.has(characterIndex)) return;
    drag.visited.add(characterIndex);
    const selected = new Set(currentCharsetSelectionIndices((existingCharset?.length ?? 0) / 8));
    if (selecting) selected.add(characterIndex);
    else selected.delete(characterIndex);
    markCharsetSelectionChanged([...selected]);
  }

  function beginCharsetSelection(
    characterIndex: number,
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void {
    if (charsetSource !== "existing" || existingCharset === null || charsetTilesView !== "source" || !charsetSelectionMode) return;
    const selected = new Set(currentCharsetSelectionIndices(existingCharset.length / 8));
    const selecting = !selected.has(characterIndex);
    charsetSelectionDragRef.current = {
      pointerId: event.pointerId,
      selecting,
      visited: new Set<number>(),
      characterIndex,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
  }

  function moveCharsetSelection(
    event: ReactPointerEvent<HTMLDivElement>,
  ): void {
    const drag = charsetSelectionDragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-character-index]");
    const characterIndex = Number(target?.dataset.characterIndex);
    if (Number.isInteger(characterIndex)) {
      paintCharsetCharacter(characterIndex, drag.selecting);
    }
  }

  function endCharsetSelection(event: ReactPointerEvent): void {
    const drag = charsetSelectionDragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    if (drag.visited.size === 0) queueCharsetSelectionClick(drag.characterIndex);
    charsetSelectionDragRef.current = null;
  }

  function clearPendingCharsetClick(characterIndex: number): void {
    const timer = charsetSelectionClickRef.current.get(characterIndex);
    if (timer !== undefined) window.clearTimeout(timer);
    charsetSelectionClickRef.current.delete(characterIndex);
  }

  function queueCharsetSelectionClick(characterIndex: number): void {
    clearPendingCharsetClick(characterIndex);
    const timer = window.setTimeout(() => {
      charsetSelectionClickRef.current.delete(characterIndex);
      toggleCharsetCharacter(characterIndex);
    }, 300);
    charsetSelectionClickRef.current.set(characterIndex, timer);
  }

  function handleCharsetDoubleClick(characterIndex: number): void {
    clearPendingCharsetClick(characterIndex);
    toggleCharsetCharacter(characterIndex);
  }

  function clearCharsetSelection(): void {
    const count = Math.floor((existingCharset?.length ?? 0) / 8);
    // Null means there is no subset filter; conversion uses the full range.
    // Keeping an explicit all-indices array is equivalent for mapping, but it
    // leaves the UI/project in a "selection active" state after choosing All.
    existingCharsetSelectionRef.current = null;
    setExistingCharsetSelection(null);
    setCharsetTilesView("source");
    setExistingCharsetStart(0);
    setExistingCharsetLength(count);
    setExistingCharsetStartEntry("1");
    setExistingCharsetLengthEntry(String(count));
    if (count > 32) setCharsetEncoding("extended");
    invalidateCharset();
    setTilemapStale(true);
  }

  function invertCharsetSelection(): void {
    if (charsetSource !== "existing" || existingCharset === null) return;
    setCharsetTilesView("source");
    const count = Math.floor(existingCharset.length / 8);
    markCharsetSelectionChanged(invertSelection(
      currentCharsetSelectionIndices(count),
      count,
    ));
  }

  function handleCharsetGlyphKey(
    characterIndex: number,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ): void {
    if (event.key === "Delete") {
      event.preventDefault();
      clearCharsetSelection();
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggleCharsetCharacter(characterIndex);
      return;
    }
    const delta = event.key === "ArrowLeft" ? -1
      : event.key === "ArrowRight" ? 1
        : event.key === "ArrowUp" ? -8
          : event.key === "ArrowDown" ? 8
            : 0;
    if (delta === 0) return;
    event.preventDefault();
    const displayIndex = glyphDisplayIndices.indexOf(characterIndex);
    if (displayIndex < 0) return;
    const next = glyphDisplayIndices[Math.max(0, Math.min(glyphDisplayIndices.length - 1, displayIndex + delta))];
    if (next !== undefined) charsetGlyphRefs.current[next]?.focus();
  }

  function commitCharsetStartEntry(): void {
    const requested = Number(existingCharsetStartEntry);
    if (
      !/^\d+$/.test(existingCharsetStartEntry) ||
      !Number.isInteger(requested)
    ) {
      setExistingCharsetStartEntry(String(existingCharsetStart + 1));
      return;
    }
    const range = clampCharsetRange(
      availableExistingCharsetCount,
      requested - 1,
      existingCharsetLength,
    );
    setExistingCharsetStart(range.startIndex);
    setExistingCharsetLength(range.length);
    setExistingCharsetStartEntry(String(range.startIndex + 1));
    setExistingCharsetLengthEntry(String(range.length));
    invalidateCharset();
    setTilemapStale(true);
  }

  function commitCharsetLengthEntry(): void {
    const requested = Number(existingCharsetLengthEntry);
    if (
      !/^\d+$/.test(existingCharsetLengthEntry) ||
      !Number.isInteger(requested)
    ) {
      setExistingCharsetLengthEntry(String(existingCharsetLength));
      return;
    }
    const range = clampCharsetRange(
      availableExistingCharsetCount,
      existingCharsetStart,
      requested,
    );
    setExistingCharsetLength(range.length);
    setExistingCharsetLengthEntry(String(range.length));
    if (range.length > 32) setCharsetEncoding("extended");
    invalidateCharset();
    setTilemapStale(true);
  }

  async function importExistingCharset(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length === 0 || bytes.length % 8 !== 0 || bytes.length > 256 * 8) {
        throw new RangeError("Expected 1–256 characters stored as eight bytes each.");
      }
      setExistingCharset(Uint8Array.from(bytes));
      setExistingCharsetName(file.name);
      setCharsetTilesView("source");
      setCharsetSelectionMode(false);
      setSelectedSourceCharsetTile(null);
      setEmittedSourceCharsetIndices(null);
      const characterCount = bytes.length / 8;
      setExistingCharsetStart(0);
      setExistingCharsetLength(characterCount);
      setExistingCharsetStartEntry("1");
      setExistingCharsetLengthEntry(String(characterCount));
      existingCharsetSelectionRef.current = null;
      setExistingCharsetSelection(null);
      setCharsetBudget(characterCount);
      if (characterCount > 32) setCharsetEncoding("extended");
      setCharsetSource("existing");
      invalidateCharset();
      setTilemapStale(true);
      setExportError(null);
    } catch (error: unknown) {
      setExportError(
        `Charset import rejected: ${error instanceof Error ? error.message : "Invalid charset."}`,
      );
    }
  }

  async function runCharsetConversion(
    paletteResult: WorkerConversionResult | null = lastFinal,
  ): Promise<WorkerCharsetResult | null> {
    if (
      paletteResult === null ||
      paletteResult.platformId !== "zx-spectrum" ||
      paletteResult.modeId !== "zx48-standard-256x192" ||
      paletteResult.attributeHeight !== 8 ||
      paletteResult.frames.length !== 1
    ) {
      setCharsetState({
        kind: "error",
        message: "Charset conversion requires a final standard single-screen ZX result with 8×8 attributes.",
      });
      return null;
    }
    if (
      charsetSource === "existing" &&
      (existingCharset === null || !existingCharsetChoiceValid)
    ) {
      setCharsetState({ kind: "error", message: "Choose an existing raw charset first." });
      return null;
    }
    charsetWorkerRef.current?.dispose();
    const worker = new ConversionWorkerClient();
    charsetWorkerRef.current = worker;
    const options: CharsetConversionOptions = {
      source: charsetSource,
      ...(existingCharset === null ? {} : { existingCharset }),
      ...(charsetSource === "existing"
        ? {
            existingCharsetRange: {
              startIndex: existingCharsetStart,
              length: existingCharsetLength,
            },
            ...(existingCharsetSelection === null
              ? {}
              : {
                  existingCharsetSelection: {
                    indices: existingCharsetSelection,
                  },
                }),
          }
        : {}),
      characterBudget: charsetSource === "existing"
        ? existingActiveCharacterCount
        : charsetBudget,
      encoding: charsetEncoding,
      allowTransforms: charsetAllowTransforms,
      allowPolarity: charsetAllowPolarity,
      derivedStrategy: charsetStrategy,
      distanceMetric: charsetDistance,
      visualWeighting: charsetVisualWeighting,
      swapRefinementPasses:
          charsetStrategy === "image-similarity-v2" ||
          charsetStrategy === "image-similarity-v3" ||
          charsetStrategy === "image-similarity-v4" ||
          charsetStrategy === "image-similarity-v5"
        ? 4
        : charsetStrategy === "best-coverage" ? 1 : 0,
    };
    const outputSourceIndices = charsetSource !== "existing"
      ? null
      : existingCharsetSelection === null
        ? Array.from(
            { length: Math.min(existingCharsetLength, (existingCharset?.length ?? 0) / 8) },
            (_, index) => existingCharsetStart + index,
          )
        : [...existingCharsetSelection];
    setCharsetState({ kind: "running" });
    try {
      const result = await worker.convertCharset(
        paletteResult.frames[0]!.encoded,
        options,
      );
      if (charsetWorkerRef.current !== worker) return null;
      setEmittedSourceCharsetIndices(outputSourceIndices);
      setCharsetState({ kind: "ready", result });
      initializeTileEditor(result);
      setTilemapStale(false);
      setExportError(null);
      return result;
    } catch (error: unknown) {
      if (charsetWorkerRef.current !== worker) return null;
      setCharsetState({
        kind: "error",
        message: error instanceof Error ? error.message : "Charset conversion failed.",
      });
      return null;
    }
  }

  function downloadBytes(bytes: Uint8Array, type: string, fileName: string) {
    const blob = new Blob([Uint8Array.from(bytes).buffer], { type });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function projectFileBaseName(): string {
    return sourceArtifact === null
      ? sanitizeArtifactBaseName(projectName || "retro-converter")
      : sanitizeArtifactBaseName(projectName || sourceArtifact.baseName);
  }

  function exportCharsetArtifact(): void {
    if (charsetState.kind !== "ready") return;
    downloadBytes(
      charsetState.result.artifact,
      "application/octet-stream",
      `${projectFileBaseName()}-tilemap.bin`,
    );
  }

  async function exportSpecsciiFile(): Promise<void> {
    if (charsetState.kind !== "ready" || tilemapStale) return;
    try {
      const fontAssets = await loadSpecsciiFontAssets();
      const exported = exportSpecscii({
        assignments: charsetState.result.assignments,
        attributes: charsetState.result.attributes,
        charset: charsetState.result.charset,
        specsciiCharset: fontAssets.charset,
        border: specsciiBorder,
        author: specsciiAuthor,
        imageName: specsciiImageName,
      });
      downloadBytes(exported.bytes, "application/json", `${projectFileBaseName()}-specscii.json`);
      setExportError(null);
      setImageStatus(exported.approximatedCells === 0
        ? "Exported Specscii screen · all 768 glyphs matched the built-in symbol set."
        : `Exported Specscii screen · ${exported.approximatedCells} cells use the closest built-in Specscii glyph.`);
    } catch (error: unknown) {
      setExportError(`Specscii export blocked: ${error instanceof Error ? error.message : "Unsupported tilemap."}`);
    }
  }

  function exportFinalCharset(): void {
    if (charsetState.kind !== "ready" || tilemapStale) return;
    downloadBytes(
      charsetState.result.charset,
      "application/octet-stream",
      `${projectFileBaseName()}-charset.chr`,
    );
  }

  function exportCharsetPreview(): void {
    if (charsetState.kind !== "ready") return;
    const preview = scaleRgbaNearest(charsetState.result.previewRgba, 256, 192, exportZoomFactor);
    const png = encodeRgbaPng(preview.rgba, preview.width, preview.height);
    downloadBytes(
      png,
      "image/png",
      `${projectFileBaseName()}-charset-preview.png`,
    );
  }

  function exportCharsetDiagnostics(): void {
    if (charsetState.kind !== "ready") return;
    const bytes = new TextEncoder().encode(`${JSON.stringify({
      source: charsetSource,
      encoding: charsetState.result.encoding,
      transformations: charsetState.result.transformations,
      viewer_type: charsetViewerType(
        charsetState.result.encoding,
        charsetState.result.transformations,
      ),
      character_count: charsetState.result.characterCount,
      existing_charset: existingCharsetName,
      existing_charset_range: charsetSource === "existing"
        ? {
            start_index: existingCharsetStart,
            length: existingCharsetLength,
          }
        : null,
      existing_charset_selection: existingCharsetSelection,
      diagnostics: charsetState.result.diagnostics,
    }, null, 2)}\n`);
    downloadBytes(
      bytes,
      "application/json",
      `${projectFileBaseName()}-charset-diagnostics.json`,
    );
  }

  function exportScr() {
    if (state.kind !== "ready" || lastFinal === null || sourceArtifact === null) return;
    try {
      if (lastFinal.platformId === "sinclair-ql") {
        const hardwareModes = qlHardwareModesForTarget(
          lastFinal.modeId as QlTargetModeId,
        );
        for (const [index, frame] of lastFinal.frames.entries()) {
          assertValidQlScreen(
            frame.encoded,
            hardwareModes[index]!,
          );
          downloadBytes(
            frame.encoded,
            "application/octet-stream",
            `${projectFileBaseName()}-screen-${index + 1}${
              lastFinal.modeId === "mode8-mode4-mixed-512x256"
                ? index === 0 ? "-mode8" : "-mode4"
                : ""
            }.scr`,
          );
        }
      } else if (lastFinal.platformId === "pmd-85") {
        assertValidPmd85Screen(lastFinal.artifact);
        downloadBytes(lastFinal.artifact, "application/octet-stream", `${projectFileBaseName()}.bin`);
      } else {
        for (const [index, frame] of lastFinal.frames.entries()) {
          assertValidSoftwareScr(frame.encoded, attributeHeight);
          downloadBytes(
            frame.encoded,
            "application/octet-stream",
            lastFinal.frames.length > 1
              ? `${projectFileBaseName()}-screen-${index + 1}.scr`
              : `${projectFileBaseName()}.scr`,
          );
        }
      }
      setExportError(null);
    } catch (error: unknown) {
      setExportError(`Hardware export blocked: ${error instanceof Error ? error.message : "Validation failed."}`);
    }
  }

  function exportPreviewPng() {
    if (state.kind !== "ready" || lastFinal === null || sourceArtifact === null) return;
    try {
      const spatial = lastFinal.verticalSpatialDiagnostics;
      const physicalFrame = lastFinal.frames[0];
      const preview = spatial !== undefined && physicalFrame !== undefined
        ? {
            rgba: physicalFrame.previewRgba,
            width: lastFinal.width,
            height: lastFinal.height,
          }
        : {
            rgba: lastFinal.mergedPreviewRgba,
            width: lastFinal.width,
            height: lastFinal.height,
          };
      const scaledPreview = scaleRgbaNearest(preview.rgba, preview.width, preview.height, exportZoomFactor);
      const png = encodeRgbaPng(scaledPreview.rgba, scaledPreview.width, scaledPreview.height);
      downloadBytes(
        png,
        "image/png",
        `${projectFileBaseName()}${
          lastFinal.frames.length > 1
            ? "-merged"
            : ""
        }-preview.png`,
      );
      setExportError(null);
    } catch (error: unknown) {
      setExportError(`Preview export blocked: ${error instanceof Error ? error.message : "Encoding failed."}`);
    }
  }

  function exportAnimatedFlashGif(): void {
    const tilemapResult = workspaceMode === "tilemap" && charsetState.kind === "ready" && !tilemapStale
      ? charsetState.result
      : null;
    if (state.kind !== "ready" || sourceArtifact === null ||
        (workspaceMode === "tilemap" ? tilemapResult === null : lastFinal === null)) return;
    try {
      const hasFlash = tilemapResult !== null
        ? zxScreenContainsFlash(tilemapResult.decodedScr)
        : resultContainsZxFlash(lastFinal);
      const previewWidth = tilemapResult === null ? lastFinal!.width : 256;
      const previewHeight = tilemapResult === null ? lastFinal!.height : 192;
      const previewFrames = tilemapResult !== null
        ? hasFlash
          ? [false, true].map((invertedPhase) =>
              renderZxFlashPreview(tilemapResult.decodedScr, 8, invertedPhase, resolveZxPalette(zxPaletteDefinition)))
          : [tilemapResult.previewRgba]
        : hasFlash && lastFinal!.platformId === "zx-spectrum" &&
            lastFinal!.attributeHeight !== null
          ? [false, true].map((invertedPhase) => {
              const framePreviews = lastFinal!.frames.map((frame) =>
                renderZxFlashPreview(frame.encoded, lastFinal!.attributeHeight!, invertedPhase, resolveZxPalette(zxPaletteDefinition)));
              if (lastFinal!.modeId === "zx48-mixed-256x192" && framePreviews.length >= 2) {
                return mergeTemporalRgba(framePreviews[0]!, framePreviews[1]!);
              }
              return framePreviews[0]!;
            })
          : [lastFinal!.mergedPreviewRgba];
      const gifFrames = previewFrames.map((rgba) => {
        const frame = { rgba, width: previewWidth, height: previewHeight };
        const bordered = exportBorderEnabled
          ? addGifBorder(frame, {
              width: exportBorderWidth,
              color: [exportBorderColor.r, exportBorderColor.g, exportBorderColor.b],
            })
          : frame;
        return scaleRgbaNearest(bordered.rgba, bordered.width, bordered.height, exportZoomFactor);
      });
      const gif = encodeAnimatedGif(gifFrames, 50);
      downloadBytes(
        gif,
        "image/gif",
        `${projectFileBaseName()}${hasFlash ? "-flashing" : ""}-preview.gif`,
      );
      setExportError(null);
    } catch (error: unknown) {
      setExportError(`GIF export blocked: ${error instanceof Error ? error.message : "GIF encoding failed."}`);
    }
  }

  async function createCurrentMetadataJson(options: {
    readonly result?: WorkerConversionResult;
    readonly resultQuality?: "Draft" | "High";
    readonly allowDraft?: boolean;
  } = {}): Promise<Uint8Array> {
    const result = options.result ?? lastFinal;
    const resultQuality = options.resultQuality ?? "High";
    const draftResultIsCurrent = draftState.kind === "ready" && result === draftState.result;
    const draftResultAllowed = options.allowDraft === true && resultQuality === "Draft" &&
      (draftResultIsCurrent || (
        bitmapEditorResultEdited &&
        result === lastFinal &&
        state.kind === "ready"
      ));
    if (
      result === null || sourceArtifact === null || image === null ||
      (state.kind !== "ready" && !draftResultAllowed) ||
      (lastFinalCompletedAt === null && !draftResultAllowed)
    ) throw new Error("A current completed High result is required.");
    if (result.platformId === "zx-spectrum") {
      for (const frame of result.frames) {
        assertValidSoftwareScr(frame.encoded, result.attributeHeight ?? attributeHeight);
      }
    } else if (result.platformId === "sinclair-ql") {
      const hardwareModes = qlHardwareModesForTarget(
        result.modeId as QlTargetModeId,
      );
      for (const [index, frame] of result.frames.entries()) {
        assertValidQlScreen(
          frame.encoded,
          hardwareModes[index]!,
        );
      }
    } else {
      assertValidPmd85Screen(result.artifact);
    }
    const metadata = await buildConversionMetadata({
      sourceSha256: sourceArtifact.sha256,
      sourceFormat: (originalImage ?? image).format,
      sourceWidth: (originalImage ?? image).width,
      sourceHeight: (originalImage ?? image).height,
      settings: conversionSettings,
      scr: result.scr,
      previewRgba: result.mergedPreviewRgba,
      frames: result.frames.map((frame) => frame.encoded),
      width: result.width,
      height: result.height,
      score: result.score,
      resultQuality,
      ...(result.structuredDiagnostics === undefined
        ? {}
        : { structuredDiagnostics: result.structuredDiagnostics }),
      ...(result.verticalSpatialDiagnostics === undefined
        ? {}
        : { verticalSpatialDiagnostics: result.verticalSpatialDiagnostics }),
      completedAtUtc: lastFinalCompletedAt ?? new Date().toISOString(),
      profile: selectedProfile,
    });
    return new TextEncoder().encode(`${JSON.stringify(metadata, null, 2)}\n`);
  }

  async function exportMetadata() {
    if (sourceArtifact === null) return;
    try {
      const json = await createCurrentMetadataJson();
      downloadBytes(json, "application/json", `${projectFileBaseName()}-metadata.json`);
      setExportError(null);
    } catch (error: unknown) {
      setExportError(`Metadata export blocked: ${error instanceof Error ? error.message : "Generation failed."}`);
    }
  }

  function exportInspectionReport() {
    if (state.kind !== "ready" || lastFinal === null || sourceArtifact === null) return;
    try {
      const frameIndex = outputPreviewStage === "screen-2" ? 1 : 0;
      const encoded = lastFinal.frames[frameIndex]?.encoded ??
        lastFinal.frames[0]?.encoded;
      if (encoded === undefined) throw new Error("No ZX frame is available.");
      const selection = paletteSelections[frameIndex] ?? paletteSelections[0]!;
      const report = {
        ...buildInspectionReport(
          encoded,
          lastFinal.attributeHeight ?? attributeHeight,
          selection.enabledColorIds,
        ),
        bright_mode: selection.brightMode,
        border_color: borderColor,
      };
      downloadBytes(
        new TextEncoder().encode(`${JSON.stringify(report, null, 2)}\n`),
        "application/json",
        `${projectFileBaseName()}-inspection.json`,
      );
      setExportError(null);
    } catch (error: unknown) {
      setExportError(`Inspection export blocked: ${error instanceof Error ? error.message : "Generation failed."}`);
    }
  }

  function openProjectSaveDialog(): void {
    setProjectNameDraft(projectName || sourceArtifact?.baseName || "Untitled project");
    setProjectSaveDialogOpen(true);
  }

  async function exportProject(requestedProjectName: string): Promise<void> {
    const quickResult = workspaceMode === "palette" && draftState.kind === "ready"
      ? draftState.result
      : null;
    const projectResult = bitmapEditorResultEdited ? lastFinal : quickResult ?? lastFinal;
    const resultQuality = bitmapEditorResultEdited
      // If there is no High completion timestamp, this edited result came
      // from a Draft (or has no provable High provenance). The user's edit
      // explicitly accepts those pixels as the project result, but must not
      // relabel them as a High conversion.
      ? lastFinalCompletedAt === null ? "Draft" : bitmapEditorResultQuality
      : quickResult !== null ? "Draft" : "High";
    if (projectResult === null || sourceArtifact === null || image === null) return;
    try {
      if (bitmapEditorRevertSource !== null && originalImage !== null &&
          (image.width !== originalImage.width || image.height !== originalImage.height)) {
        throw new Error(
          "PROJECT_WORKING_SOURCE_INVALID: result-sized bitmap edits cannot be saved as a working source. Edit the source image or revert the result edit first.",
        );
      }
      const metadataJson = await createCurrentMetadataJson({
        result: projectResult,
        resultQuality,
        allowDraft: true,
      });
      const spatialPreview = projectResult.verticalSpatialDiagnostics;
      const previewPng = encodeRgbaPng(
        spatialPreview?.analyticPreviewRgba ?? projectResult.mergedPreviewRgba,
        spatialPreview?.logicalWidth ?? projectResult.width,
        spatialPreview?.logicalHeight ?? projectResult.height,
      );
      const project = await createCompletedProject({
        sourceBytes: sourceArtifact.bytes,
        sourceFormat: (originalImage ?? image).format,
        sourceFrameIndex,
        resultOrigin,
        settings: conversionSettings,
        scr: projectResult.scr,
        frames: projectResult.frames.map((frame) => frame.encoded),
        previewPng,
        metadataJson,
        profile: selectedProfile,
        projectName: normalizeProjectName(requestedProjectName),
        resultQuality,
        resultEdited: bitmapEditorResultEdited,
        ...(bitmapEditorRevertSource === null || image === null
          ? {}
          : {
              workingSourcePng: encodeRgbaPng(image.rgba, image.width, image.height),
            }),
        workspaceMode,
        ...(workspaceMode === "tilemap" && charsetState.kind === "ready"
          ? {
              tilemap: {
                settings: {
                  source: charsetSource,
                  ...(charsetSource === "existing"
                    ? {
                        existingCharsetRange: {
                          startIndex: existingCharsetStart,
                          length: existingCharsetLength,
                        },
                        ...(existingCharsetSelection === null
                          ? {}
                          : {
                              existingCharsetSelection: {
                                indices: existingCharsetSelection,
                              },
                            }),
                      }
                    : {}),
                  characterBudget: charsetSource === "existing"
                    ? existingActiveCharacterCount
                    : charsetBudget,
                  encoding: charsetEncoding,
                  allowTransforms: charsetAllowTransforms,
                  allowPolarity: charsetAllowPolarity,
                  derivedStrategy: charsetStrategy,
                  distanceMetric:
                      charsetStrategy === "image-similarity-v2" ||
                      charsetStrategy === "image-similarity-v3" ||
                      charsetStrategy === "image-similarity-v4" ||
                      charsetStrategy === "image-similarity-v5"
                    ? charsetStrategy
                    : charsetDistance,
                  visualWeighting: charsetVisualWeighting,
                  swapRefinementPasses:
                    charsetStrategy === "image-similarity-v2" ||
                    charsetStrategy === "image-similarity-v3" ||
                    charsetStrategy === "image-similarity-v4" ||
                    charsetStrategy === "image-similarity-v5"
                      ? 4
                      : charsetStrategy === "best-coverage" ? 1 : 0,
                },
                artifact: charsetState.result.artifact,
                previewPng: encodeRgbaPng(
                  charsetState.result.previewRgba,
                  256,
                  192,
                ),
                diagnostics: charsetState.result.diagnostics,
                assignments: charsetState.result.assignments,
                charset: charsetState.result.charset,
                sourceCharset: charsetSource === "existing" &&
                    existingCharset !== null
                  ? existingCharset
                  : charsetState.result.charset,
              },
            }
          : {}),
      });
      const savedProjectName = normalizeProjectName(requestedProjectName);
      downloadBytes(project, "application/zip", `${sanitizeArtifactBaseName(savedProjectName)}.rccproject`);
      setProjectName(savedProjectName);
      setProjectSaveDialogOpen(false);
      setDirty(false);
      setExportError(null);
    } catch (error: unknown) {
      setExportError(`Project export blocked: ${error instanceof Error ? error.message : "Generation failed."}`);
    }
  }

  function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
  }

  async function openProject(file: File | undefined) {
    if (file === undefined) return;
    if (dirty && !window.confirm("Replace the current unsaved work with this project?")) return;
    setBitmapEditorFlashPreviewMode("normal");
    setBitmapEditorFlashPreviewPhase(false);
    const verifier = new ConversionWorkerClient();
    try {
      const validated = await validateCompletedProject(new Uint8Array(await file.arrayBuffer()));
      const rawProfile = validated.profile as Record<string, unknown>;
      if (
        typeof rawProfile.id !== "string" ||
        typeof rawProfile.version !== "string" ||
        typeof rawProfile.name !== "string"
      ) {
        throw new Error("PROJECT_SCHEMA_INVALID: profile snapshot is incomplete.");
      }
      const archivedProfile = validated.profile as ConversionProfile;
      const projectProfile = BUILT_IN_PROFILES.find(
        (profile) => profile.id === rawProfile.id,
      ) ?? await parseImportedProfile(
        new TextEncoder().encode(JSON.stringify(rawProfile)),
      );
      const sourceBytes = Uint8Array.from(validated.sourceBytes);
      if (validated.resultEdited) {
        for (const [index, frame] of validated.frames.entries()) {
          if (validated.settings.platformId === "zx-spectrum") {
            assertValidSoftwareScr(frame, validated.settings.attributeHeight);
          } else if (validated.settings.platformId === "sinclair-ql") {
            const hardwareMode = (index === 0
              ? qlHardwareModesForTarget(validated.settings.modeId as QlTargetModeId)[0]
              : qlHardwareModesForTarget(validated.settings.modeId as QlTargetModeId)[Math.min(index, 1)]) as QlMode | undefined;
            if (hardwareMode === undefined) throw new Error("PROJECT_SCHEMA_INVALID: edited QL frame mode is missing.");
            assertValidQlScreen(frame, hardwareMode);
          } else {
            assertValidPmd85Screen(frame);
          }
        }
      }
      let decoded: WorkerDecodedImage;
      let workingDecoded: WorkerDecodedImage;
      let recomputed: WorkerConversionResult;
      let recoveredWorkingSource = false;
      const projectPmdPalette = validated.settings.platformId === "pmd-85"
        ? profileModeScreens(
            projectProfile,
            validated.settings.modeId,
            validated.settings.pmd85.paletteCalibrationId,
          )[0]?.colors.map((color) => hexToRgb(color.normal)) ?? []
        : undefined;
      if (validated.sourceFormat === "pmd85-bin") {
        const colors = projectPmdPalette ?? [];
        const imported = await verifier.decodePmd85(
          Uint8Array.from(sourceBytes).buffer,
          validated.settings.modeId as Pmd85ModeId,
          colors,
          validated.settings.pmd85.paletteCalibrationId,
        );
        decoded = imported.image;
        workingDecoded = validated.workingSourcePng === undefined
          ? decoded
          : await verifier.decodeImage(Uint8Array.from(validated.workingSourcePng).buffer);
        recomputed = validated.workingSourcePng === undefined && validated.resultOrigin === "direct-import"
          ? directPmd85Result(imported, validated.settings)
          : await verifier.convertImage(
              workingDecoded,
              validated.settings,
              "high",
              {
                foregroundPalette: colors,
                ...(validated.settings.pmd85.gapPolicy === "preserve-imported"
                  ? { importedGapBytes: extractPmd85GapBytes(sourceBytes) }
                  : {}),
              },
            );
      } else {
        decoded = await verifier.decodeImage(Uint8Array.from(sourceBytes).buffer, validated.sourceFrameIndex);
        workingDecoded = validated.workingSourcePng === undefined
          ? decoded
          : await verifier.decodeImage(Uint8Array.from(validated.workingSourcePng).buffer);
        if (validated.workingSourcePng !== undefined &&
            (workingDecoded.width !== decoded.width || workingDecoded.height !== decoded.height)) {
          const fallback = await verifier.convertImage(
            decoded,
            validated.settings,
            "high",
            projectPmdPalette === undefined
              ? undefined
              : { foregroundPalette: projectPmdPalette },
          );
          const archivedPreview = await verifier.decodeImage(
            Uint8Array.from(validated.previewPng).buffer,
          );
          const outputMatches = fallback.frames.length === validated.frames.length &&
            fallback.frames.every((frame, index) =>
              equalBytes(frame.encoded, validated.frames[index] ?? new Uint8Array())
            ) &&
            archivedPreview.width === fallback.width &&
            archivedPreview.height === fallback.height &&
            equalBytes(archivedPreview.rgba, fallback.mergedPreviewRgba);
          if (!outputMatches) {
            throw new Error(
              "PROJECT_WORKING_SOURCE_INVALID: working source dimensions do not match the original source and the archived result cannot be recovered.",
            );
          }
          workingDecoded = decoded;
          recomputed = fallback;
          recoveredWorkingSource = true;
        } else {
          recomputed = await verifier.convertImage(
            workingDecoded,
            validated.settings,
            "high",
            projectPmdPalette === undefined
              ? undefined
              : { foregroundPalette: projectPmdPalette },
          );
        }
      }
      const archivedFramesDiffer = recomputed.frames.length !== validated.frames.length ||
        recomputed.frames.some((frame, index) =>
          !equalBytes(frame.encoded, validated.frames[index] ?? new Uint8Array())
        );
      // Projects written before result_edited was introduced could already
      // contain a manually edited native screen. Preserve that archived
      // screen instead of rejecting an otherwise valid project when the
      // current converter produces a byte-level difference.
      const legacyArchivedResultEdited = !validated.resultEdited &&
        !validated.resultEditedFieldPresent && archivedFramesDiffer;
      const archivedResultEdited = validated.resultEdited || legacyArchivedResultEdited;
      const archivedResultSnapshot = archivedResultEdited || validated.resultQuality === "Draft";
      const verifyArchivedResult = !archivedResultSnapshot &&
        (validated.workingSourcePng === undefined || recoveredWorkingSource);
      if (verifyArchivedResult && archivedFramesDiffer) {
        throw new Error("PROJECT_REPRODUCTION_FAILED: screen bytes differ.");
      }
      const archivedPreview = await verifier.decodeImage(Uint8Array.from(validated.previewPng).buffer);
      const expectedArchivedPreview = recomputed.verticalSpatialDiagnostics;
      if (verifyArchivedResult && (
        archivedPreview.width !== (expectedArchivedPreview?.logicalWidth ?? recomputed.width) ||
        archivedPreview.height !== (expectedArchivedPreview?.logicalHeight ?? recomputed.height) ||
        !equalBytes(
          archivedPreview.rgba,
          expectedArchivedPreview?.analyticPreviewRgba ?? recomputed.mergedPreviewRgba,
        )
      )) throw new Error("PROJECT_REPRODUCTION_FAILED: decoded preview pixels differ.");
      if (archivedResultSnapshot) {
        const editedFrames = recomputed.frames.map((frame, index) => {
          const encoded = validated.frames[index];
          if (encoded === undefined) throw new Error("PROJECT_SCHEMA_INVALID: edited result frame is missing.");
          const input = resultFrameInput(recomputed, index, {
            encoded,
            pmd85GapPolicy: validated.settings.pmd85.gapPolicy,
            ...(projectPmdPalette === undefined ? {} : { pmd85Palette: projectPmdPalette }),
            ...(validated.sourceFormat === "pmd85-bin" && validated.settings.pmd85.gapPolicy === "preserve-imported"
              ? { importedGapBytes: extractPmd85GapBytes(sourceBytes) }
              : {}),
          });
          if (input === null) throw new Error("PROJECT_SCHEMA_INVALID: edited result frame is invalid.");
          const bitmap = createNativeResultBitmap(input);
          return {
            ...frame,
            encoded: bitmap.encoded,
            paletteIndices: bitmap.paletteIndices,
            previewRgba: expandResultPreviewForFrame(bitmap, frame),
          };
        });
        const editedPreview = archivedPreview.rgba;
        recomputed = {
          ...recomputed,
          artifact: editedFrames[0]?.encoded.slice() ?? recomputed.artifact.slice(),
          scr: editedFrames[0]?.encoded.slice() ?? recomputed.scr.slice(),
          frames: editedFrames,
          previewRgba: editedPreview.slice(),
          mergedPreviewRgba: editedPreview.slice(),
          ...(recomputed.verticalSpatialDiagnostics === undefined
            ? {}
            : {
                verticalSpatialDiagnostics: {
                  ...recomputed.verticalSpatialDiagnostics,
                  analyticPreviewRgba: editedPreview.slice(),
                },
              }),
          ...(recomputed.platformId === "zx-spectrum" && editedFrames[0] !== undefined
            ? {
                pixels: unpackZxBitmap(editedFrames[0].encoded),
                attributes: editedFrames[0].encoded.slice(6144),
                screen: {
                  pixels: unpackZxBitmap(editedFrames[0].encoded),
                  attributes: editedFrames[0].encoded.slice(6144),
                },
              }
            : {}),
        };
      }
      let verifiedTilemap: WorkerCharsetResult | null = null;
      let repairedLegacyCharsetSelection = false;
      if (validated.workspaceMode === "tilemap") {
        if (validated.tilemap === undefined) {
          throw new Error(
            "PROJECT_ENTRY_MISSING: tilemap settings and artifacts are required.",
          );
        }
        verifiedTilemap = await verifier.convertCharset(
          recomputed.frames[0]!.encoded,
          {
            ...validated.tilemap.settings,
            ...(validated.tilemap.settings.source === "existing"
              ? { existingCharset: validated.tilemap.sourceCharset }
              : {}),
          },
        );
        const legacyTilemapArtifact = encodeLegacyCharsetArtifact({
          encoding: verifiedTilemap.encoding,
          characterCount: verifiedTilemap.characterCount,
          transformations: verifiedTilemap.transformations,
          characterIndices: Uint8Array.from(
            verifiedTilemap.assignments,
            (assignment) => assignment.characterIndex,
          ),
          attributes: verifiedTilemap.attributes,
          transforms: Uint8Array.from(
            verifiedTilemap.assignments,
            (assignment) => assignment.transform,
          ),
          charset: verifiedTilemap.charset,
        });
        const artifactMatchesCurrent = equalBytes(
          verifiedTilemap.artifact,
          validated.tilemap.artifact,
        );
        const artifactMatchesLegacy = equalBytes(
          legacyTilemapArtifact,
          validated.tilemap.artifact,
        );
        if (!artifactMatchesCurrent && !artifactMatchesLegacy) {
          const selection =
            validated.tilemap.settings.existingCharsetSelection?.indices;
          const legacyFirstCharacters = selection === undefined
            ? null
            : validated.tilemap.sourceCharset.slice(
                0,
                selection.length * 8,
              );
          if (
            validated.tilemap.settings.source !== "existing" ||
            legacyFirstCharacters === null ||
            !equalBytes(
              validated.tilemap.charset,
              legacyFirstCharacters,
            )
          ) {
            throw new Error(
              "PROJECT_REPRODUCTION_FAILED: tilemap artifact bytes differ.",
            );
          }
          repairedLegacyCharsetSelection = true;
        }
        const archivedTilemapPreview = await verifier.decodeImage(
          Uint8Array.from(validated.tilemap.previewPng).buffer,
        );
        if (
          !repairedLegacyCharsetSelection &&
          (
            archivedTilemapPreview.width !== 256 ||
            archivedTilemapPreview.height !== 192 ||
            !equalBytes(
              archivedTilemapPreview.rgba,
              verifiedTilemap.previewRgba,
            )
          )
        ) {
          throw new Error(
            "PROJECT_REPRODUCTION_FAILED: tilemap preview pixels differ.",
          );
        }
      }

      const archivedMetadata = JSON.parse(new TextDecoder().decode(validated.metadataJson)) as Record<string, unknown>;
      const archivedConversion = archivedMetadata.conversion as Record<string, unknown> | undefined;
      const archivedSettings = archivedConversion?.settings as Record<string, unknown> | undefined;
      if (archivedSettings !== undefined && archivedSettings.borderColor === undefined) {
        archivedSettings.borderColor = validated.settings.borderColor;
      }
      const completedAtUtc = typeof archivedMetadata.completed_at_utc === "string"
        ? archivedMetadata.completed_at_utc : new Date().toISOString();
      const rebuiltMetadata = await buildConversionMetadata({
        sourceSha256: await sha256Hex(sourceBytes),
        sourceFormat: decoded.format,
        sourceWidth: decoded.width,
        sourceHeight: decoded.height,
        settings: validated.settings,
        scr: recomputed.scr,
        frames: recomputed.frames.map((frame) => frame.encoded),
        previewRgba: recomputed.mergedPreviewRgba,
        width: recomputed.width,
        height: recomputed.height,
        score: recomputed.score,
        resultQuality: validated.resultQuality,
        ...(recomputed.verticalSpatialDiagnostics === undefined
          ? {}
          : { verticalSpatialDiagnostics: recomputed.verticalSpatialDiagnostics }),
        completedAtUtc,
        profile: archivedProfile,
      }) as Record<string, unknown>;
      const projection = archivedMetadata.deterministic_projection;
      if (!Array.isArray(projection)) {
        throw new Error("PROJECT_REPRODUCTION_FAILED: deterministic metadata projection is invalid.");
      }
      const differingMetadataKeys = verifyArchivedResult
        ? projection.filter((key) =>
        typeof key !== "string" ||
        canonicalJsonStringify(archivedMetadata[key]) !== canonicalJsonStringify(rebuiltMetadata[key])
      )
        : [];
      if (differingMetadataKeys.length > 0) {
        throw new Error(
          `PROJECT_REPRODUCTION_FAILED: deterministic metadata differs (${differingMetadataKeys.join(", ")}).`,
        );
      }

      const next = validated.settings;
      pendingOpenedFinalRef.current = { result: recomputed, completedAtUtc };
      pendingOpenedResultEditedRef.current = archivedResultEdited;
      pendingOpenedResultQualityRef.current = validated.resultQuality;
      applySettings(next, decoded);
      if (!profiles.some((profile) => profile.id === projectProfile.id)) {
        setProfiles((current) => [...current, projectProfile]);
      }
      setSelectedProfileId(projectProfile.id);
      setSelectedPresetId(projectProfile.presets[0]?.id ?? "default");
      setWorkspaceMode(validated.workspaceMode);
      setResultOrigin(validated.resultOrigin);
      workspaceModeRef.current = validated.workspaceMode;
      if (validated.tilemap !== undefined && verifiedTilemap !== null) {
        const tilemapSettings = validated.tilemap.settings;
        const projectCharset = tilemapSettings.source === "existing"
          ? validated.tilemap.sourceCharset
          : validated.tilemap.charset;
        const projectCharsetCount = projectCharset.length / 8;
        const projectRange = tilemapSettings.source === "existing" &&
            tilemapSettings.existingCharsetRange !== undefined
          ? clampCharsetRange(
              projectCharsetCount,
              tilemapSettings.existingCharsetRange.startIndex,
              tilemapSettings.existingCharsetRange.length,
            )
          : {
              startIndex: 0,
              length: projectCharsetCount,
            };
        setCharsetSource("existing");
        setCharsetTilesView(tilemapSettings.source === "existing" ? "source" : "output");
        setCharsetEncoding(
          projectRange.length > 32 ? "extended" : tilemapSettings.encoding,
        );
        setCharsetBudget(projectRange.length);
        setExistingCharsetStart(projectRange.startIndex);
        setExistingCharsetLength(projectRange.length);
        setExistingCharsetStartEntry(String(projectRange.startIndex + 1));
        setExistingCharsetLengthEntry(String(projectRange.length));
        const projectSelection =
          tilemapSettings.source === "existing" &&
              tilemapSettings.existingCharsetSelection !== undefined
            ? [...tilemapSettings.existingCharsetSelection.indices]
            : null;
        existingCharsetSelectionRef.current = projectSelection;
        setExistingCharsetSelection(projectSelection);
        const projectOutputSourceIndices = tilemapSettings.source === "existing"
          ? projectSelection ?? Array.from(
              { length: projectRange.length },
              (_, index) => projectRange.startIndex + index,
            )
          : Array.from({ length: verifiedTilemap.characterCount }, (_, index) => index);
        setEmittedSourceCharsetIndices(
          projectOutputSourceIndices.length === verifiedTilemap.characterCount
            ? projectOutputSourceIndices
            : null,
        );
        setCharsetSelectionMode(false);
        setSelectedSourceCharsetTile(null);
        setCharsetStrategy(tilemapSettings.derivedStrategy);
        setCharsetDistance(tilemapSettings.distanceMetric);
        setCharsetAllowTransforms(tilemapSettings.allowTransforms);
        setCharsetAllowPolarity(tilemapSettings.allowPolarity);
        setCharsetVisualWeighting(tilemapSettings.visualWeighting);
        setExistingCharset(projectCharset);
        setExistingCharsetName("project-charset.bin");
        setCharsetState({ kind: "ready", result: verifiedTilemap });
        initializeTileEditor(verifiedTilemap);
        setTilemapStale(false);
      } else {
        setCharsetState({ kind: "idle" });
      }
      setImage(workingDecoded);
      setOriginalImage({ ...decoded, rgba: decoded.rgba.slice() });
      setSourceFrameIndex(validated.sourceFrameIndex);
      if (validated.workingSourcePng !== undefined && !recoveredWorkingSource) {
        setBitmapEditorRevertSource({ ...decoded, rgba: decoded.rgba.slice() });
        bitmapEditorFullBufferRef.current = {
          width: workingDecoded.width,
          height: workingDecoded.height,
          rgba: workingDecoded.rgba.slice(),
        };
        setBitmapEditorBuffer(bitmapEditorFullBufferRef.current);
      }
      setSourceFileName(file.name);
      setProjectName(validated.projectName === "Untitled project"
        ? normalizeProjectName(sanitizeArtifactBaseName(file.name))
        : validated.projectName);
      setSourceArtifact({
        sha256: await sha256Hex(sourceBytes),
        baseName: sanitizeArtifactBaseName(file.name),
        bytes: sourceBytes,
      });
      setImageStatus(
        `Opened validated project · ${decoded.width} × ${decoded.height} source · ` +
        (validated.resultQuality === "Draft"
          ? `restored archived Quick result · ${recomputed.scr.length.toLocaleString()} bytes.`
          : `reproduced ${recomputed.scr.length.toLocaleString()}-byte High result.`) +
        (repairedLegacyCharsetSelection
          ? " Corrected legacy charset-selection mapping."
          : "") +
        (recoveredWorkingSource
          ? " Recovered using the original source; the invalid working-source edit was not preserved."
          : ""),
      );
      setExportError(null);
    } catch (error: unknown) {
      pendingOpenedFinalRef.current = null;
      setExportError(`Project open rejected: ${error instanceof Error ? error.message : "Validation failed."}`);
    } finally {
      verifier.dispose();
    }
  }

  const displayedResult = workspaceMode === "tilemap" &&
      charsetState.kind === "ready" && !tilemapStale
    ? lastFinal
    : draftPreviewResult(draftState) ?? lastFinal;
  const standaloneTilemapPreview = workspaceMode === "tilemap" &&
    charsetState.kind === "ready" && !tilemapStale && displayedResult === null;
  const bitmapEditorFlashFrame = displayedResult?.frames[
    Math.min(bitmapEditorResultFrameIndex, Math.max(0, displayedResult.frames.length - 1))
  ];
  const bitmapEditorFlashEncoded = bitmapEditorTarget === "result" &&
      displayedResult?.platformId === "zx-spectrum"
    ? bitmapEditorResultBuffer?.encoded ?? bitmapEditorFlashFrame?.encoded
    : undefined;
  const tilemapFlashScreen = workspaceMode === "tilemap" && charsetState.kind === "ready"
    ? charsetState.result.decodedScr
    : null;
  const flashPreviewAvailable = tilemapFlashScreen !== null
    ? zxScreenContainsFlash(tilemapFlashScreen)
    : workspaceMode === "palette" && displayedResult?.platformId === "zx-spectrum" &&
      displayedResult.frames.some((frame, index) => {
        const encoded = index === bitmapEditorResultFrameIndex && bitmapEditorFlashEncoded !== undefined
          ? bitmapEditorFlashEncoded
          : frame.encoded;
        return zxScreenContainsFlash(encoded);
      });
  useEffect(() => {
    if (bitmapEditorFlashPreviewMode === "inverted") {
      setBitmapEditorFlashPreviewPhase(true);
      return;
    }
    setBitmapEditorFlashPreviewPhase(false);
    if (bitmapEditorFlashPreviewMode !== "animate" || !flashPreviewAvailable) return;
    const timer = window.setInterval(() => {
      setBitmapEditorFlashPreviewPhase((phase) => !phase);
    }, 500);
    return () => window.clearInterval(timer);
  }, [
    bitmapEditorFlashPreviewMode,
    flashPreviewAvailable,
  ]);
  useEffect(() => {
    if (bitmapEditorTarget !== "result" || displayedResult === null || bitmapEditorResultEdited) return;
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, Math.max(0, displayedResult.frames.length - 1));
    const frame = displayedResult.frames[frameIndex];
    const current = bitmapEditorResultBufferRef.current;
    if (frame !== undefined &&
        (current === null || bitmapEditorResultSourceRef.current !== displayedResult || current.hardwareModeId !== frame.hardwareModeId)) {
      initializeResultEditor(displayedResult, frameIndex);
    }
  }, [displayedResult, bitmapEditorTarget, bitmapEditorResultEdited, bitmapEditorResultFrameIndex]);
  const displayedAttributeHeight = displayedResult?.attributeHeight ?? attributeHeight;
  // Paint after the preview subtree has been committed to its current host.
  // This is important when a bitmap editor moves through a portal: a passive
  // effect can leave the newly attached canvas blank until another content
  // selection causes a later render.
  useLayoutEffect(() => {
    const sourceCanvas = bitmapEditorSourceCanvasRef.current;
    const resultCanvas = bitmapEditorResultCanvasRef.current;
    const mergedFlashCanvas = bitmapEditorMergedFlashCanvasRef.current;
    const activeEditorBuffer = bitmapEditorTarget === "result"
      ? bitmapEditorResultBuffer
      : bitmapEditorBuffer;
    const target = activeEditorBuffer ?? (bitmapEditorTarget === "source"
      ? fullBitmapBufferFromSource()
      : (() => {
      if (displayedResult === null) return null;
      const frameIndex = Math.min(bitmapEditorResultFrameIndex, Math.max(0, displayedResult.frames.length - 1));
      const frame = displayedResult.frames[frameIndex];
      const input = resultFrameInput(displayedResult, frameIndex);
      const nativeBitmap = input === null ? null : createNativeResultBitmap(input);
      if (frame === undefined || nativeBitmap === null) return null;
      return {
        width: frame.nativeWidth,
        height: frame.nativeHeight,
        rgba: nativeBitmap.rgba,
        pixels: nativeBitmap.paletteIndices,
      };
    })());
    if (target === null || target === undefined) return;
    const editorFlashPhase = bitmapEditorFlashPreviewMode === "inverted" ||
      (bitmapEditorFlashPreviewMode === "animate" && bitmapEditorFlashPreviewPhase);
    const activeZxResultEncoded = bitmapEditorTarget === "result" &&
        displayedResult?.platformId === "zx-spectrum"
      ? bitmapEditorResultBuffer?.encoded ?? displayedResult.frames[
          Math.min(bitmapEditorResultFrameIndex, Math.max(0, displayedResult.frames.length - 1))
        ]?.encoded
      : undefined;
    let renderedRgba = target.rgba;
    if (bitmapEditorTarget === "result") {
      const isZxWithAttributes = displayedResult?.platformId === "zx-spectrum" &&
        displayedResult.attributeHeight !== null && activeZxResultEncoded !== undefined;
      if (!bitmapEditorShowPixels && !bitmapEditorShowAttributes) {
        renderedRgba = new Uint8Array(target.width * target.height * 4);
      } else if (isZxWithAttributes && activeZxResultEncoded !== undefined) {
        if (!bitmapEditorShowPixels && bitmapEditorShowAttributes) {
          const attributesOnly = activeZxResultEncoded.slice();
          attributesOnly.fill(0, 0, ZX_BITMAP_BYTES);
          renderedRgba = renderZxFlashPreview(
            attributesOnly,
            displayedResult.attributeHeight!,
            editorFlashPhase,
            resolveZxPalette(zxPaletteDefinition),
          );
        } else if (bitmapEditorShowPixels && !bitmapEditorShowAttributes) {
          renderedRgba = zxBitmapToMonochromeRgba(activeZxResultEncoded);
        } else if (editorFlashPhase) {
          renderedRgba = renderZxFlashPreview(
            activeZxResultEncoded,
            displayedResult.attributeHeight!,
            true,
            resolveZxPalette(zxPaletteDefinition),
          );
        }
      } else if (!bitmapEditorShowPixels) {
        renderedRgba = new Uint8Array(target.width * target.height * 4);
      }
    }
    const selectionPointer = bitmapEditorSelectionPointerRef.current;
    const sourceSelection = selectionPointer?.action === "move"
      ? selectionPointer.selection
      : null;
    const destinationSelection = bitmapEditorSelectionDraft;
    if (bitmapEditorTarget === "result" && sourceSelection !== null && destinationSelection !== null) {
      const preview = renderedRgba.slice();
      const selectedPixels = new Uint8ClampedArray(sourceSelection.width * sourceSelection.height * 4);
      const selectionMemory = bitmapEditorClipboard !== null && bitmapEditorClipboard.width === sourceSelection.width && bitmapEditorClipboard.height === sourceSelection.height
        ? bitmapEditorClipboard
        : null;
      for (let y = 0; y < sourceSelection.height; y += 1) {
        for (let x = 0; x < sourceSelection.width; x += 1) {
          const maskIndex = y * sourceSelection.width + x;
          if (sourceSelection.mask[maskIndex] !== 1) continue;
          const sourceX = sourceSelection.x + x;
          const sourceY = sourceSelection.y + y;
          if (sourceX < 0 || sourceX >= target.width || sourceY < 0 || sourceY >= target.height) continue;
          const sourceOffset = (sourceY * target.width + sourceX) * 4;
          const selectionOffset = maskIndex * 4;
          const memoryOffset = maskIndex * 4;
          selectedPixels.set(selectionMemory === null
            ? renderedRgba.subarray(sourceOffset, sourceOffset + 4)
            : selectionMemory.rgba.subarray(memoryOffset, memoryOffset + 4), selectionOffset);
          preview.fill(0, sourceOffset, sourceOffset + 4);
        }
      }
      for (let y = 0; y < sourceSelection.height; y += 1) {
        for (let x = 0; x < sourceSelection.width; x += 1) {
          const maskIndex = y * sourceSelection.width + x;
          if (sourceSelection.mask[maskIndex] !== 1) continue;
          const destinationX = destinationSelection.x + x;
          const destinationY = destinationSelection.y + y;
          if (destinationX < 0 || destinationX >= target.width || destinationY < 0 || destinationY >= target.height) continue;
          const destinationOffset = (destinationY * target.width + destinationX) * 4;
          const selectionOffset = maskIndex * 4;
          preview.set(selectedPixels.subarray(selectionOffset, selectionOffset + 4), destinationOffset);
        }
      }
      renderedRgba = preview;
    }
    const pendingSelection = bitmapEditorRegionSelection;
    const pendingClipboard = bitmapEditorClipboard;
    if (bitmapEditorTarget === "result" && bitmapEditorPasteMode !== null && pendingSelection !== null &&
        pendingClipboard !== null && pendingClipboard.rgba.length === pendingClipboard.width * pendingClipboard.height * 4) {
      const preview = renderedRgba.slice();
      const eraseSelection = bitmapEditorPasteMode === "move" ? pendingClipboard.eraseSelection ?? pendingSelection : null;
      if (eraseSelection !== null) {
        for (let y = 0; y < eraseSelection.height; y += 1) {
          for (let x = 0; x < eraseSelection.width; x += 1) {
            if (eraseSelection.mask[y * eraseSelection.width + x] !== 1) continue;
            const pixelX = eraseSelection.x + x;
            const pixelY = eraseSelection.y + y;
            if (pixelX < 0 || pixelX >= target.width || pixelY < 0 || pixelY >= target.height) continue;
            const offset = (pixelY * target.width + pixelX) * 4;
            preview.fill(0, offset, offset + 4);
          }
        }
      }
      for (let y = 0; y < pendingClipboard.height; y += 1) {
        for (let x = 0; x < pendingClipboard.width; x += 1) {
          if (pendingClipboard.mask[y * pendingClipboard.width + x] !== 1) continue;
          const pixelX = pendingSelection.x + x;
          const pixelY = pendingSelection.y + y;
          if (pixelX < 0 || pixelX >= target.width || pixelY < 0 || pixelY >= target.height) continue;
          const destinationOffset = (pixelY * target.width + pixelX) * 4;
          const sourceOffset = (y * pendingClipboard.width + x) * 4;
          preview.set(pendingClipboard.rgba.subarray(sourceOffset, sourceOffset + 4), destinationOffset);
        }
      }
      renderedRgba = preview;
    }
    const renderedTarget = { ...target, rgba: renderedRgba };
    for (const canvas of [sourceCanvas, resultCanvas]) {
      if (canvas === null) continue;
      canvas.width = renderedTarget.width;
      canvas.height = renderedTarget.height;
      const context = canvas.getContext("2d");
      if (context === null) continue;
      context.putImageData(
        new ImageData(new Uint8ClampedArray(renderedTarget.rgba), renderedTarget.width, renderedTarget.height),
        0,
        0,
      );
    }
    if (mergedFlashCanvas !== null &&
        bitmapEditorTarget === "result" &&
        displayedResult?.platformId === "zx-spectrum" &&
        displayedResult.modeId === "zx48-mixed-256x192" &&
        displayedResult.frames.length === 2 &&
        displayedResult.attributeHeight !== null) {
      const [firstFrame, secondFrame] = displayedResult.frames;
      if (firstFrame !== undefined && secondFrame !== undefined) {
        const firstPhase = renderZxFlashPreview(
          firstFrame.encoded,
          displayedResult.attributeHeight,
          editorFlashPhase,
          resolveZxPalette(zxPaletteDefinition),
        );
        const secondPhase = renderZxFlashPreview(
          secondFrame.encoded,
          displayedResult.attributeHeight,
          editorFlashPhase,
          resolveZxPalette(zxPaletteDefinition),
        );
        const merged = mergeTemporalRgba(firstPhase, secondPhase);
        mergedFlashCanvas.width = displayedResult.width;
        mergedFlashCanvas.height = displayedResult.height;
        const context = mergedFlashCanvas.getContext("2d");
        context?.putImageData(
          new ImageData(new Uint8ClampedArray(merged), displayedResult.width, displayedResult.height),
          0,
          0,
        );
      }
    }
  }, [
    bitmapEditorBuffer,
    bitmapEditorResultBuffer,
    bitmapEditorTarget,
    bitmapEditorFlashPreviewMode,
    bitmapEditorFlashPreviewPhase,
    bitmapEditorShowPixels,
    bitmapEditorShowAttributes,
    bitmapEditorRegionSelection,
    bitmapEditorSelectionDraft,
    bitmapEditorClipboard,
    bitmapEditorPasteMode,
    flashPreviewAvailable,
    displayedResult,
    zxPaletteDefinition,
    outputPreviewStage,
    sourcePreviewContent,
    resultPreviewContent,
    workbenchSourceFloating,
    workbenchResultFloating,
    workbenchPreviewLayer,
  ]);
  const displayedWidth = displayedResult?.verticalSpatialDiagnostics === undefined
    ? displayedResult?.width ?? destinationGeometry.width
    : outputPreviewStage === "merged" || outputPreviewStage === "screen-2"
      ? displayedResult.verticalSpatialDiagnostics.logicalWidth
      : displayedResult.width;
  const displayedHeight = displayedResult?.verticalSpatialDiagnostics !== undefined &&
      (outputPreviewStage === "merged" || outputPreviewStage === "screen-2")
    ? displayedResult.verticalSpatialDiagnostics.logicalHeight
    : displayedResult?.height ?? destinationGeometry.height;
  const benchmarkComparisonPreviews = useMemo(() => {
    if (benchmarkCompareDigests.length !== 2) return null;
    const first = benchmarkRows.find((row) => row.digest === benchmarkCompareDigests[0]);
    const second = benchmarkRows.find((row) => row.digest === benchmarkCompareDigests[1]);
    if (first === undefined || second === undefined ||
        first.result.width !== second.result.width ||
        first.result.height !== second.result.height) return null;
    const width = first.result.width;
    const height = first.result.height;
    return {
      first: rgbaPngDataUrl(first.result.mergedPreviewRgba, width, height),
      second: rgbaPngDataUrl(second.result.mergedPreviewRgba, width, height),
      difference: rgbaPngDataUrl(
        previewDifferenceHeatmap(
          first.result.mergedPreviewRgba,
          second.result.mergedPreviewRgba,
        ),
        width,
        height,
      ),
    };
  }, [benchmarkCompareDigests, benchmarkRows]);
  const inspectedFrameIndex = outputPreviewStage === "screen-2" ? 1 : 0;
  const inspectedScr = displayedResult?.frames[inspectedFrameIndex]?.encoded ??
    displayedResult?.frames[0]?.encoded;
  const paletteUsage = displayedResult === null
    || displayedResult.platformId !== "zx-spectrum"
    || inspectedScr === undefined
    ? null
    : summarizePaletteUsage(
        inspectedScr,
        displayedResult.attributeHeight ?? attributeHeight,
      );
  const paletteUsageSlotTotal = paletteUsage === null
    ? 0
    : (paletteUsage.normalCells + paletteUsage.brightCells) * 2;
  const paletteUsagePercent = (count: number): string =>
    paletteUsageSlotTotal === 0
      ? "0.0%"
      : `${(count / paletteUsageSlotTotal * 100).toFixed(1)}%`;
  const visiblePaletteUsageColors = paletteUsage === null || paletteUsageFilter === "all"
    ? ZX_BASE_COLORS
    : ZX_BASE_COLORS.filter((color) =>
        (paletteUsage.normalColorCounts[color.code] ?? 0) > 0 ||
        (paletteUsage.brightColorCounts[color.code] ?? 0) > 0);
  const cropOverlay = cropSourceSize === null ||
    !cropValid || !cropSelectionActive
    ? null
    : {
        x: cropX,
        y: cropY,
        width: cropWidth,
        height: cropHeight,
      };
  const borderHex = ZX_BASE_COLORS[borderColor]?.normal ?? "#000000";
  const paletteArtifactsReady = state.kind === "ready" && lastFinal !== null &&
    lastFinalCompletedAt !== null && sourceArtifact !== null;
  const editedPaletteProjectReady = workspaceMode === "palette" &&
    state.kind === "ready" && lastFinal !== null && sourceArtifact !== null &&
    bitmapEditorResultEdited;
  const draftProjectReady = workspaceMode === "palette" &&
    draftState.kind === "ready" && image !== null && sourceArtifact !== null;
  const tilemapArtifactsReady = charsetState.kind === "ready" && !tilemapStale &&
    (paletteArtifactsReady || specsciiDocumentName !== null);
  const artifactsReady = workspaceMode === "tilemap"
    ? tilemapArtifactsReady
    : paletteArtifactsReady || editedPaletteProjectReady || draftProjectReady;
  const resultSaveReady = state.kind === "ready" && lastFinal !== null && sourceArtifact !== null;
  const sourceCharsetCount = existingCharset === null ? 0 : Math.floor(existingCharset.length / 8);
  const showingSourceCharset = charsetSource === "existing" && existingCharset !== null && charsetTilesView === "source";
  const glyphCharset = showingSourceCharset
    ? existingCharset
    : charsetState.kind === "ready" ? charsetState.result.charset : null;
  const glyphCount = glyphCharset === null
    ? 0
    : Math.floor(glyphCharset.length / 8);
  const glyphActiveRange = showingSourceCharset
    ? clampCharsetRange(
        sourceCharsetCount,
        existingCharsetStart,
        existingCharsetLength,
      )
    : { startIndex: 0, length: glyphCount };
  const glyphActiveIndices = !showingSourceCharset
    ? Array.from({ length: glyphCount }, (_, index) => index)
    : existingCharsetSelection === null
      ? Array.from(
          { length: glyphActiveRange.length },
          (_, index) => glyphActiveRange.startIndex + index,
        )
      : [...existingCharsetSelection];
  const glyphActiveIndexSet = new Set(glyphActiveIndices);
  const glyphActiveCount = showingSourceCharset
    ? glyphActiveIndices.length
    : glyphCount;
  const inspectedTileIndex = inspection === null
    ? null
    : inspection.cellY * 32 + inspection.cellX;
  const inspectedTileAssignment = inspectedTileIndex === null ||
    charsetState.kind !== "ready"
    ? null
    : charsetState.result.assignments[inspectedTileIndex] ?? null;
  const tileUsage = charsetState.kind !== "ready"
    ? []
    : (() => {
        const counts = charsetState.result.assignments.reduce((result, assignment) => {
          result.set(assignment.characterIndex, (result.get(assignment.characterIndex) ?? 0) + 1);
          return result;
        }, new Map<number, number>());
        return Array.from({ length: charsetState.result.characterCount }, (_, characterIndex) => ({
          characterIndex,
          count: counts.get(characterIndex) ?? 0,
        })).sort((first, second) => second.count - first.count || first.characterIndex - second.characterIndex);
      })();
  const visibleTileUsage = tileUsageFilter === "used"
    ? tileUsage.filter((tile) => tile.count > 0)
    : tileUsage;
  const tileUsageCountByIndex = new Map(
    tileUsage.map(({ characterIndex, count }) => [characterIndex, count]),
  );
  const tileUsageAvailable = charsetState.kind === "ready" && !tilemapStale && !showingSourceCharset;
  const maximumTileUsage = tileUsageAvailable
    ? Math.max(0, ...tileUsage.map(({ count }) => count))
    : 0;
  const glyphDisplayIndices = Array.from({ length: glyphCount }, (_, index) => index);
  if (tileEditorUsageSort && tileUsageAvailable) {
    glyphDisplayIndices.sort((left, right) =>
      (tileUsageCountByIndex.get(right) ?? 0) - (tileUsageCountByIndex.get(left) ?? 0) || left - right);
  }
  const fullBitmapEditorPreview = (side: PreviewSide) => {
    const buffer = bitmapEditorTarget === "result"
      ? bitmapEditorResultBuffer
      : bitmapEditorBuffer;
    const frameForEditor = displayedResult?.frames[bitmapEditorResultFrameIndex];
    const sourceForEditor = bitmapEditorTarget === "source" ? (bitmapEditorFullBufferRef.current ?? fullBitmapBufferFromSource()) : null;
    const width = buffer?.width ?? sourceForEditor?.width ?? (bitmapEditorTarget === "result" ? frameForEditor?.nativeWidth : undefined) ?? displayedWidth;
    const height = buffer?.height ?? sourceForEditor?.height ?? (bitmapEditorTarget === "result" ? frameForEditor?.nativeHeight : undefined) ?? displayedHeight;
    const canvasRefForSide = side === "source" ? bitmapEditorSourceCanvasRef : bitmapEditorResultCanvasRef;
    const compatible = workspaceMode === "palette" && (bitmapEditorTarget === "source" ? image !== null : displayedResult !== null);
    const resultFrame = displayedResult?.frames[Math.min(bitmapEditorResultFrameIndex, Math.max(0, (displayedResult?.frames.length ?? 1) - 1))];
    const resultInput = displayedResult === null || resultFrame === undefined
      ? null
      : resultFrameInput(displayedResult, Math.min(bitmapEditorResultFrameIndex, displayedResult.frames.length - 1));
    const nativePalette = bitmapEditorTarget === "result" && resultInput !== null
      ? nativePaletteForResult(resultInput)
      : [];
    const paletteIndexMinimum = displayedResult?.platformId === "pmd-85" ? 1 : 0;
    const paletteIndexMaximum = displayedResult?.platformId === "zx-spectrum" ? 7 : Math.max(paletteIndexMinimum, ...nativePalette.map((color) => color.index));
    const replacementFromIndex = Math.max(paletteIndexMinimum, Math.min(paletteIndexMaximum, bitmapEditorColorFrom));
    const replacementToIndex = Math.max(paletteIndexMinimum, Math.min(paletteIndexMaximum, bitmapEditorColorTo));
    const replacementSwatches = displayedResult?.platformId === "zx-spectrum"
      ? zxPaletteOptions.map((color) => {
          const normal = resultInput?.zxPalette?.normal[color.code];
          const bright = resultInput?.zxPalette?.bright[color.code];
          const rgb = (value: { readonly r: number; readonly g: number; readonly b: number } | undefined) =>
            value === undefined ? color.normal : `rgb(${value.r} ${value.g} ${value.b})`;
          return {
            index: color.code,
            label: color.name,
            color: `linear-gradient(135deg, ${rgb(normal)} 0 49%, ${rgb(bright)} 51% 100%)`,
          };
        })
      : nativePalette.map((color) => ({ index: color.index, label: `Color ${color.index}`, color: `rgb(${color.r} ${color.g} ${color.b})` }));
    const stippleOptions = [
      ...ORDERED_MATRIX_IDS.map((id) => ({ id, label: orderedMatrixLabel(id), matrix: ORDERED_MATRICES[id] })),
      ...customOrderedMatrices.map((matrix) => ({
        id: matrix.id,
        label: `Custom ${matrix.width}×${matrix.height}`,
        matrix: { width: matrix.width, height: matrix.height, values: matrix.values, levels: new Set(matrix.values).size },
      })),
    ];
    const attributeWidth = bitmapEditorTarget === "result" && displayedResult?.platformId === "pmd-85" ? 6 : bitmapEditorTarget === "result" && displayedResult?.platformId === "zx-spectrum" ? 8 : null;
    const attributeHeight = bitmapEditorTarget === "result" && displayedResult?.platformId === "pmd-85" ? targetModeId === "pmd85-colorace" ? 2 : 1 : bitmapEditorTarget === "result" ? displayedResult?.attributeHeight ?? null : null;
    const pickedPreviewHeight = bitmapEditorPickedCell?.attributeHeight ?? (attributeHeight === 1 || attributeHeight === 2 || attributeHeight === 4 || attributeHeight === 8 ? attributeHeight : 8);
    const pickedPreviewRows = bitmapEditorPickedCell?.rows ?? new Uint8Array(pickedPreviewHeight);
    const pickedPreviewBaseAttribute = bitmapEditorPickedCell?.attribute ?? 0;
    const pickedPreviewAttribute =
      (bitmapEditorInkColor ?? (bitmapEditorPickedCell === null ? 0 : pickedPreviewBaseAttribute & 7)) |
      ((bitmapEditorPaperColor ?? (bitmapEditorPickedCell === null ? 7 : (pickedPreviewBaseAttribute >> 3) & 7)) << 3) |
      ((bitmapEditorBrightPolicy ?? (bitmapEditorPickedCell === null ? false : (pickedPreviewBaseAttribute & 0x40) !== 0)) ? 0x40 : 0) |
      ((bitmapEditorFlashPolicy ?? (bitmapEditorPickedCell === null ? false : (pickedPreviewBaseAttribute & 0x80) !== 0)) ? 0x80 : 0);
    const pickedPreviewBright = (pickedPreviewAttribute & 0x40) !== 0;
    const pickedPreviewInk = ZX_BASE_COLORS[pickedPreviewAttribute & 7];
    const pickedPreviewPaper = ZX_BASE_COLORS[(pickedPreviewAttribute >> 3) & 7];
    const bitmapEditorActions = <div className="bitmap-editor-full-toolbar" data-tool-mode={bitmapEditorToolMode} aria-label="Bitmap editor actions" onPointerDown={(event) => { bitmapEditorFullPointerRef.current = null; bitmapEditorPointerRef.current = null; panDragRef.current = null; event.stopPropagation(); }}>
      <nav className="bitmap-editor-tool-mode-tabs" aria-label="Bitmap editor tools">
        {(["display", "selection", "draw", "colors"] as const).map((mode) => {
          const label = mode === "display" ? "Display" : mode === "selection" ? "Selection" : mode === "draw" ? "Draw" : "Palette";
          const icon = mode === "display"
            ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.2-6 9.5-6 9.5 6 9.5 6-3.2 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.7" /></svg>
            : mode === "selection"
              ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="2.5 2.5" /><path d="M8 8h8v8H8z" /></svg>
              : mode === "draw"
                ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5 4 16.5Z" /><path d="m13.8 6.7 3.5 3.5M4 20.8l4.3-.8" /></svg>
                : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2a8.8 8.8 0 1 0 0 17.6h1.1a2 2 0 0 0 1.5-3.3 1.7 1.7 0 0 1 1.3-2.8h1.2a3.7 3.7 0 0 0 3.7-3.7c0-4.3-4-7.8-8.8-7.8Z" /><circle cx="7.7" cy="10" r=".9" /><circle cx="11" cy="7.2" r=".9" /><circle cx="15.1" cy="8" r=".9" /><circle cx="17.1" cy="11.2" r=".9" /></svg>;
          return <Tooltip key={mode} label={label} position="right" withArrow openDelay={350}>
            <NavLink
              component="button"
              type="button"
              className="bitmap-editor-tool-nav-link"
              active={bitmapEditorToolMode === mode}
              aria-label={label}
              aria-current={bitmapEditorToolMode === mode ? "page" : undefined}
              aria-pressed={bitmapEditorToolMode === mode}
              classNames={{ section: "bitmap-editor-tool-nav-section" }}
              label={<span className="bitmap-editor-visually-hidden">{label}</span>}
              leftSection={<span className="bitmap-editor-tool-icon">{icon}</span>}
              onClick={() => setBitmapEditorToolMode(mode)}
            />
          </Tooltip>;
        })}
      </nav>
      <div className="bitmap-editor-tool-panel" aria-label={`${bitmapEditorToolMode} controls`}>
      {bitmapEditorToolMode !== "colors" && bitmapEditorColorDraftRef.current !== null ? <div className="bitmap-editor-pending-color-draft" role="status">Palette preview not applied. Return to Palette and choose Apply to save it.</div> : null}
      <div className="bitmap-editor-control-grid" aria-label="Bitmap editor controls">
      {bitmapEditorTarget === "result" && displayedResult !== null && displayedResult.frames.length > 1 ? <label className="bitmap-editor-target-control"><span>Frame</span><select value={bitmapEditorResultFrameIndex} onChange={(event) => { const index = Number(event.target.value); selectResultEditorFrame(displayedResult, index); }} aria-label="Result frame">{displayedResult.frames.map((_, index) => <option value={index} key={index}>Screen {index + 1}</option>)}</select></label> : null}
      <SegmentedControl
        className="bitmap-editor-command-segments"
        classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
        fullWidth
        aria-label="Undo, redo, and revert"
        value=""
        data={[
          { value: "undo", label: "Undo", disabled: bitmapEditorTarget === "result" ? bitmapEditorResultUndo.length === 0 : bitmapEditorUndoFull.length === 0 },
          { value: "redo", label: "Redo", disabled: bitmapEditorTarget === "result" ? bitmapEditorResultRedo.length === 0 : bitmapEditorRedoFull.length === 0 },
          { value: "revert", label: "Revert", disabled: bitmapEditorTarget === "result" ? !bitmapEditorResultEdited : bitmapEditorRevertSource === null },
        ]}
        onChange={(action) => {
          if (action === "undo") bitmapEditorTarget === "result" ? undoFullResult() : undoFullBitmap();
          if (action === "redo") bitmapEditorTarget === "result" ? redoFullResult() : redoFullBitmap();
          if (action === "revert") bitmapEditorTarget === "result" ? revertFullResult() : revertFullBitmap();
        }}
      />
      <div className="bitmap-editor-display-tools" data-editor-group="display" aria-label="Bitmap display controls">
        <div className="bitmap-editor-display-row">
          <div className="bitmap-editor-display-control"><span>Grid</span><SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Grid display"
            value={bitmapEditorGridMode}
            data={[{ value: "pixel", label: "1×1" }, { value: "cell", label: attributeWidth !== null && attributeHeight !== null ? `${attributeWidth}×${attributeHeight}` : "Attribute", disabled: attributeWidth === null || attributeHeight === null }, { value: "off", label: "Off" }]}
            onChange={(value) => setBitmapEditorGridMode(value as "pixel" | "cell" | "off")}
          /></div>
          <div className="bitmap-editor-display-control"><span>Zoom</span><SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Bitmap editor zoom"
            value=""
            data={[{ value: "out", label: <span title="Zoom out">−</span> }, { value: "in", label: <span title="Zoom in">+</span> }, { value: "fit", label: "Fit" }]}
            onChange={(action) => {
              if (action === "out" && bitmapEditorActiveSide !== null) stepPreviewZoom(bitmapEditorActiveSide, -1);
              if (action === "in" && bitmapEditorActiveSide !== null) stepPreviewZoom(bitmapEditorActiveSide, 1);
              if (action === "fit") bitmapEditorActiveSide === "source" ? setSourcePreviewZoom("fit") : setResultPreviewZoom("fit");
            }}
          /></div>
          {bitmapEditorTarget === "result" && displayedResult?.platformId === "zx-spectrum" ? <div className="bitmap-editor-display-control bitmap-editor-flash-control" data-toggle-state={bitmapEditorFlashPreviewMode === "off" ? "off" : "on"}><span>FLASH</span><SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="FLASH preview"
            value={bitmapEditorFlashPreviewMode}
            data={[{ value: "normal", label: "1" }, { value: "inverted", label: "2", disabled: !flashPreviewAvailable }, { value: "off", label: "Off" }, { value: "animate", label: "Anim", disabled: !flashPreviewAvailable }]}
            onChange={(value) => setBitmapEditorFlashPreviewMode(value as "normal" | "inverted" | "off" | "animate")}
          /></div> : null}
        </div>
        <div className="bitmap-editor-display-row bitmap-editor-content-visibility" aria-label="Result content visibility">
          <div className="bitmap-editor-display-control" data-toggle-state={bitmapEditorShowPixels ? "on" : "off"}><span>Show pixels</span><SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            color={bitmapEditorShowPixels ? "#7189aa" : "#34435b"}
            fullWidth
            aria-label="Show pixels in result"
            value={bitmapEditorShowPixels ? "on" : "off"}
            data={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]}
            onChange={(value) => setBitmapEditorShowPixels(value === "on")}
          /></div>
          <div className="bitmap-editor-display-control" data-toggle-state={bitmapEditorShowAttributes ? "on" : "off"}><span>Show attributes</span><SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            color={bitmapEditorShowAttributes ? "#7189aa" : "#34435b"}
            fullWidth
            aria-label="Show attributes in result"
            value={bitmapEditorShowAttributes ? "on" : "off"}
            data={[{ value: "on", label: "On" }, { value: "off", label: "Off", disabled: attributeWidth === null || attributeHeight === null }]}
            onChange={(value) => setBitmapEditorShowAttributes(value === "on")}
          /></div>
        </div>
        <label className="bitmap-editor-sync-pan"><input type="checkbox" checked={synchronizePan} onChange={(event) => setSynchronizePan(event.target.checked)} /><span>Synchronize pan</span></label>
      </div>
      <div className="bitmap-editor-action-grid bitmap-editor-tools-grid" data-editor-group="draw" aria-label="Bitmap editing tools">
        <SegmentedControl
          className="bitmap-editor-segmented bitmap-editor-tool-mode-segments"
          classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
          fullWidth
          aria-label="Active paint mode"
          value={bitmapEditorPasteMode !== null ? "selection" : bitmapEditorScope}
          data={[
            { value: "pixel", label: <span className="bitmap-editor-mode-label" aria-label={`Pixel paint, ${bitmapEditorBrushSize} brush`} title={`Pixel paint: ${bitmapEditorBrushSize} brush · select to cycle size`}><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="1" /></svg>{bitmapEditorBrushSize.replace("x", "×")}</span> },
            { value: "cell", label: <span className="bitmap-editor-mode-label" aria-label={`Cell paint: ${bitmapEditorCellModeLabel(bitmapEditorCellMode)}`} title={bitmapEditorTarget === "result" && displayedResult?.platformId === "zx-spectrum" ? `Cell paint: ${bitmapEditorCellModeLabel(bitmapEditorCellMode)} · select to cycle cell mode` : "Cell paint is available for a converted ZX Spectrum result"}><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="1" /><path d="M6 2v12M10 2v12M2 6h12M2 10h12" /></svg>{bitmapEditorCellMode === "filled" ? "FILL" : "TILE"}</span>, disabled: bitmapEditorTarget !== "result" || displayedResult?.platformId !== "zx-spectrum" },
            { value: "selection", label: <span aria-label="Selection paint" title="Paste the selection clipboard. Turn PIXELS and ATTRS on or off in the Selection tab.">SEL</span>, disabled: bitmapEditorClipboard === null && bitmapEditorRegionSelection === null },
          ]}
          onChange={(value) => {
            if (value === "selection") startBitmapEditorPaste("copy");
            else {
              setBitmapEditorPasteMode(null);
              selectBitmapEditorScope(value as "pixel" | "cell");
            }
          }}
          onClick={(event) => {
            const label = (event.target as HTMLElement).closest(".bitmap-editor-segment-label");
            if (label === null) return;
            if (bitmapEditorPasteMode !== null) {
              if (label.textContent?.trim() === "SEL") startBitmapEditorPaste("copy");
              return;
            }
            if (label.textContent?.trim() === bitmapEditorBrushSize.replace("x", "×") && bitmapEditorScope === "pixel") cycleBitmapEditorBrushSize();
            if (label.textContent?.trim() === (bitmapEditorCellMode === "filled" ? "FILL" : "TILE") && bitmapEditorScope === "cell") cycleBitmapEditorCellMode();
          }}
        />
        <SegmentedControl
          className="bitmap-editor-segmented bitmap-editor-tools-segment"
          classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
          fullWidth
          aria-label="Bitmap operation for pixel, graphics, and selection paste"
          value={bitmapEditorOperation}
          data={(["copy", "or", "and", "xor", "none"] as const).map((operation) => ({
            value: operation,
            label: <Tooltip
              label={`${bitmapEditorOperationLabel(operation)}${bitmapEditorOperationDescription(operation, bitmapEditorScope) === bitmapEditorOperationLabel(operation) ? "" : ` · ${bitmapEditorOperationDescription(operation, bitmapEditorScope)}`}${bitmapEditorRegionSelection !== null && bitmapEditorPasteMode === null ? operation === "copy" ? " · copy selection and place" : operation === "and" ? " · remove selected pixels" : operation === "none" ? " · clear selection" : " · copy selection and place" : ""}`}
              position="top"
              withArrow
              openDelay={350}
            >
              <span aria-label={`Operation ${bitmapEditorOperationLabel(operation)}: ${bitmapEditorOperationDescription(operation, bitmapEditorScope)}`}>
                {bitmapEditorOperationLabel(operation)}
              </span>
            </Tooltip>,
          }))}
          onChange={(value) => chooseBitmapEditorOperation(value as typeof bitmapEditorOperation)}
        />
        <div className="bitmap-editor-picker-mode-segments" role="group" aria-label="Color and graphics pickers">
          <Tooltip label="Color picker" position="top" withArrow openDelay={350}><button className={`secondary compact bitmap-editor-full-action bitmap-editor-picker-icon${bitmapEditorColorPickerActive ? " active" : ""}`} type="button" onClick={toggleBitmapEditorColorPicker} disabled={bitmapEditorTarget !== "result" || displayedResult?.platformId !== "zx-spectrum"} aria-label="Color picker: choose INK, PAPER, BRIGHT, and FLASH" aria-pressed={bitmapEditorColorPickerActive}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.2 6.1 3.7 3.7M5.2 18.8l3.3-.8L19.2 7.3a2 2 0 0 0-2.8-2.8L5.7 15.2l-.5 3.6Z" /><path d="M4 21h7" /></svg></button></Tooltip>
          <Tooltip label="Pattern picker" position="top" withArrow openDelay={350}><button className={`secondary compact bitmap-editor-full-action bitmap-editor-picker-icon${bitmapEditorPatternPickerActive ? " active" : ""}`} type="button" onClick={toggleBitmapEditorPatternPicker} disabled={bitmapEditorTarget !== "result" || displayedResult?.platformId !== "zx-spectrum"} aria-label="Pattern picker: choose a source cell for Cell Tile" aria-pressed={bitmapEditorPatternPickerActive}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></svg></button></Tooltip>
        </div>
      </div>
      {bitmapEditorTarget === "result" && displayedResult !== null ? <div className="bitmap-editor-color-operations" data-editor-group="colors" aria-label="Color transformation controls">
        <span className="bitmap-editor-control-heading">Color transform</span>
        <SegmentedControl
          className="bitmap-editor-segmented bitmap-editor-color-operation-control"
          classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
          fullWidth
          aria-label="Color operation"
          value={bitmapEditorColorOperation}
          data={[{ value: "replace", label: "Replace" }, { value: "increase", label: "Increase" }, { value: "decrease", label: "Decrease" }]}
          onChange={(value) => {
            const operation = value as typeof bitmapEditorColorOperation;
            if (operation === "replace") {
              if (bitmapEditorColorDraftRef.current !== null) bitmapEditorColorDraftRef.current.steps = 0;
              setBitmapEditorColorOperation(operation);
              previewBitmapEditorColorTransform(operation);
            } else applyBitmapEditorColorStep(operation);
          }}
          onClick={(event) => {
            const label = (event.target as HTMLElement).closest(".bitmap-editor-segment-label");
            const selectedLabel = bitmapEditorColorOperation === "replace"
              ? "Replace"
              : bitmapEditorColorOperation === "increase"
                ? "Increase"
                : "Decrease";
            if (label?.textContent?.trim() === selectedLabel) {
              if (bitmapEditorColorOperation === "increase" || bitmapEditorColorOperation === "decrease") {
                applyBitmapEditorColorStep(bitmapEditorColorOperation);
              } else {
                if (bitmapEditorColorDraftRef.current !== null) bitmapEditorColorDraftRef.current.steps = 0;
                previewBitmapEditorColorTransform("replace");
              }
            }
          }}
        />
        {displayedResult.platformId === "zx-spectrum" ? <label className="bitmap-editor-tool-select"><span>Fields</span><select aria-label="Color fields" value={bitmapEditorColorChannel} onChange={(event) => { const channel = event.target.value as "both" | "ink" | "paper"; setBitmapEditorColorChannel(channel); previewBitmapEditorColorTransform(bitmapEditorColorOperation, { channel }); }}><option value="both">INK and PAPER</option><option value="ink">INK only</option><option value="paper">PAPER only</option></select></label> : null}
        {bitmapEditorColorOperation === "replace" ? <>
          <div className="bitmap-editor-color-replace-row">
            <div className="bitmap-editor-color-swatches" role="group" aria-label="Replace this color">
              <span>From</span>
              <div>{replacementSwatches.filter((swatch) => swatch.index >= paletteIndexMinimum && swatch.index <= paletteIndexMaximum).map((swatch) => <button key={swatch.index} type="button" title={`From ${swatch.label}`} aria-label={`Replace from ${swatch.label}`} aria-pressed={replacementFromIndex === swatch.index} className={replacementFromIndex === swatch.index ? "selected" : ""} style={{ "--swatch-color": swatch.color } as React.CSSProperties} onClick={() => { setBitmapEditorColorFrom(swatch.index); previewBitmapEditorColorTransform("replace", { from: swatch.index, to: replacementToIndex }); }} />)}</div>
            </div>
            <div className="bitmap-editor-color-swatches" role="group" aria-label="Replace with this color">
              <span>To</span>
              <div>{replacementSwatches.filter((swatch) => swatch.index >= paletteIndexMinimum && swatch.index <= paletteIndexMaximum).map((swatch) => <button key={swatch.index} type="button" title={`To ${swatch.label}`} aria-label={`Replace with ${swatch.label}`} aria-pressed={replacementToIndex === swatch.index} className={replacementToIndex === swatch.index ? "selected" : ""} style={{ "--swatch-color": swatch.color } as React.CSSProperties} onClick={() => { setBitmapEditorColorTo(swatch.index); previewBitmapEditorColorTransform("replace", { from: replacementFromIndex, to: swatch.index }); }} />)}</div>
            </div>
          </div>
        </> : null}
        <SegmentedControl
          className="bitmap-editor-segmented"
          classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
          fullWidth
          aria-label="Color operation scope"
          value={bitmapEditorColorScope}
          data={[{ value: "selection", label: "Selection" }, { value: "image", label: "Whole image" }]}
          onChange={(value) => { const scope = value as typeof bitmapEditorColorScope; setBitmapEditorColorScope(scope); previewBitmapEditorColorTransform(bitmapEditorColorOperation, { scope }); }}
        />
        <SegmentedControl
          className="bitmap-editor-segmented bitmap-editor-color-actions"
          classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
          fullWidth
          aria-label="Apply or cancel color changes"
          value=""
          data={[
            { value: "apply", label: "Apply", disabled: bitmapEditorColorDraftRef.current === null },
            { value: "cancel", label: "Cancel", disabled: bitmapEditorColorDraftRef.current === null },
          ]}
          onChange={(action) => {
            if (action === "apply") commitBitmapEditorColorDraft();
            if (action === "cancel") cancelBitmapEditorColorDraft();
          }}
        />
        {bitmapEditorColorOperation !== "replace" ? <span className="bitmap-editor-color-help">Each click previews from the saved colors. Repeated changes remain reversible until Apply.</span> : null}
      </div> : null}
      {bitmapEditorTarget === "result" && displayedResult?.platformId !== "zx-spectrum" && nativePalette.length > 0 ? <div className="bitmap-editor-native-palette" data-editor-group="draw" aria-label="Native result paint palette">{nativePalette.map((color) => <button className={`bitmap-editor-attribute-color${bitmapEditorResultPaletteIndex === color.index ? " selected" : ""}`} type="button" key={color.index} title={`Use palette color ${color.index}`} aria-label={`Use palette color ${color.index}`} aria-pressed={bitmapEditorResultPaletteIndex === color.index} onClick={() => setBitmapEditorResultPaletteIndex(color.index)}><span style={{ background: `rgb(${color.r} ${color.g} ${color.b})` }} /></button>)}</div> : null}
      {bitmapEditorTarget === "result" && displayedResult?.platformId === "zx-spectrum" ? <div className="bitmap-editor-attribute-policy" data-editor-group="draw" aria-label="Attribute paint policy">
        <div className="bitmap-editor-attribute-color-row" role="group" aria-label="INK color">
          <span className="bitmap-editor-attribute-row-label">INK</span>
          <div className="bitmap-editor-attribute-color-grid" role="group" aria-label="INK palette">
            {zxPaletteOptions.map((color) => <button className={`bitmap-editor-attribute-color${bitmapEditorInkColor === color.code ? " selected" : ""}`} type="button" key={color.code} title={`Set INK to ${color.name}`} aria-label={`Set INK to ${color.name}`} aria-pressed={bitmapEditorInkColor === color.code} onClick={() => setBitmapEditorInkColor(color.code)}><span style={{ background: color.normal }} /></button>)}
            <button className={`bitmap-editor-attribute-icon${bitmapEditorInkColor === null ? " selected" : ""}`} type="button" title="Keep current INK" aria-label="Keep current INK" aria-pressed={bitmapEditorInkColor === null} onClick={() => setBitmapEditorInkColor(null)}><span className="bitmap-editor-transparent-swatch" aria-hidden="true" /></button>
          </div>
        </div>
        <div className="bitmap-editor-attribute-color-row" role="group" aria-label="PAPER color">
          <span className="bitmap-editor-attribute-row-label">PAPER</span>
          <div className="bitmap-editor-attribute-color-grid" role="group" aria-label="PAPER palette">
            {zxPaletteOptions.map((color) => <button className={`bitmap-editor-attribute-color${bitmapEditorPaperColor === color.code ? " selected" : ""}`} type="button" key={color.code} title={`Set PAPER to ${color.name}`} aria-label={`Set PAPER to ${color.name}`} aria-pressed={bitmapEditorPaperColor === color.code} onClick={() => setBitmapEditorPaperColor(color.code)}><span style={{ background: color.normal }} /></button>)}
            <button className={`bitmap-editor-attribute-icon${bitmapEditorPaperColor === null ? " selected" : ""}`} type="button" title="Keep current PAPER" aria-label="Keep current PAPER" aria-pressed={bitmapEditorPaperColor === null} onClick={() => setBitmapEditorPaperColor(null)}><span className="bitmap-editor-transparent-swatch" aria-hidden="true" /></button>
          </div>
        </div>
        <div className="bitmap-editor-attribute-policy-row">
          <span className="bitmap-editor-policy-symbol" aria-hidden="true">☀</span>
          <SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="BRIGHT policy"
            value={bitmapEditorBrightPolicy === true ? "on" : bitmapEditorBrightPolicy === false ? "off" : "preserve"}
            data={[{ value: "on", label: "On" }, { value: "off", label: "Off" }, { value: "preserve", label: "Keep" }]}
            onChange={(value) => setBitmapEditorBrightPolicy(value === "on" ? true : value === "off" ? false : null)}
          />
        </div>
        <div className="bitmap-editor-attribute-policy-row">
          <span className="bitmap-editor-policy-symbol" aria-hidden="true">ϟ</span>
          <SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="FLASH policy"
            value={bitmapEditorFlashPolicy === true ? "on" : bitmapEditorFlashPolicy === false ? "off" : "preserve"}
            data={[{ value: "on", label: "On" }, { value: "off", label: "Off" }, { value: "preserve", label: "Keep" }]}
            onChange={(value) => setBitmapEditorFlashPolicy(value === "on" ? true : value === "off" ? false : null)}
          />
        </div>
      </div> : null}
      <div className="bitmap-editor-region-tools" data-editor-group="selection" aria-label="Region selection tools">
        <div className="bitmap-editor-region-buttons">
          <SegmentedControl
            className="bitmap-editor-command-segments"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Select bitmap area"
            value=""
            data={[
              { value: "all", label: "All" },
              { value: "off", label: "Off" },
              { value: "invert", label: "Invert", disabled: bitmapEditorRegionSelection === null },
            ]}
            onChange={(action) => {
              if (action === "all") {
                setBitmapEditorSelectionTool("none");
                const selection = { x: 0, y: 0, width, height, mask: new Uint8Array(width * height).fill(1), resolution: bitmapEditorSelectionResolution, gridWidth: attributeWidth ?? 1, gridHeight: attributeHeight ?? 1 } satisfies BitmapRegionSelection;
                setBitmapEditorRegionSelection(selection);
                copyBitmapEditorSelection(selection, false);
              }
              if (action === "off") {
                setBitmapEditorRegionSelection(null);
                setBitmapEditorSelectionDraft(null);
                setBitmapEditorSelectionTool("rectangle");
                setBitmapEditorPasteMode(null);
              }
              if (action === "invert") {
                const selected = bitmapEditorRegionSelection;
                if (selected !== null) {
                  const inverted = { ...selected, mask: Uint8Array.from(selected.mask, (pixel) => pixel ? 0 : 1) };
                  setBitmapEditorRegionSelection(inverted);
                  copyBitmapEditorSelection(inverted, false);
                }
              }
            }}
          />
        </div>
        <div className="bitmap-editor-tool-select">
          <span>Selection</span>
          <SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Selection tool"
            value={bitmapEditorSelectionTool}
            data={[{ value: "none", label: "Off" }, { value: "rectangle", label: "Rect" }, { value: "freeform", label: "Free" }]}
            onChange={(value) => setBitmapEditorSelectionTool(value as "none" | BitmapSelectionKind)}
          />
        </div>
        <div className="bitmap-editor-tool-select">
          <span>Resolution</span>
          <SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Selection resolution"
            value={bitmapEditorSelectionResolution}
            data={[{ value: "pixel", label: "Pixels" }, { value: "attribute", label: "Attributes", disabled: attributeWidth === null || attributeHeight === null }]}
            onChange={(value) => {
              const resolution = value as BitmapSelectionResolution;
              setBitmapEditorSelectionResolution(resolution);
            }}
          />
        </div>
        <div className="bitmap-editor-tool-select bitmap-editor-selection-paste-content">
          <span>Paste content</span>
          <div className="bitmap-editor-display-row">
            <div className="bitmap-editor-display-control" data-toggle-state={bitmapEditorPastePixels ? "on" : "off"}><span>PIXELS</span><SegmentedControl
              className="bitmap-editor-segmented"
              classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
              color={bitmapEditorPastePixels ? "#7189aa" : "#34435b"}
              fullWidth
              aria-label="Paste pixels"
              value={bitmapEditorPastePixels ? "on" : "off"}
              data={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]}
              onChange={(value) => setBitmapEditorPastePixels(value === "on")}
            /></div>
            <div className="bitmap-editor-display-control" data-toggle-state={bitmapEditorPasteAttributes ? "on" : "off"}><span>ATTRS</span><SegmentedControl
              className="bitmap-editor-segmented"
              classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
              color={bitmapEditorPasteAttributes ? "#7189aa" : "#34435b"}
              fullWidth
              aria-label="Paste attributes"
              value={bitmapEditorPasteAttributes ? "on" : "off"}
              data={[{ value: "on", label: "On", disabled: attributeWidth === null || attributeHeight === null || displayedResult?.platformId !== "zx-spectrum" }, { value: "off", label: "Off" }]}
              onChange={(value) => setBitmapEditorPasteAttributes(value === "on")}
            /></div>
          </div>
        </div>
        <div className="bitmap-editor-region-buttons">
          <SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Selection CORIN operation"
            value={bitmapEditorOperation}
            data={([
              ["copy", "Copy"], ["or", "OR"], ["and", "AND"], ["xor", "XOR"],
            ] as const).map(([operation, label]) => ({
              value: operation,
              label,
            }))}
            onChange={(value) => chooseBitmapEditorOperation(value as typeof bitmapEditorOperation)}
          />
        </div>
        <div className="bitmap-editor-region-buttons">
          <SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Copy selection to clipboard"
            value=""
            data={[{ value: "copy", label: "Copy", disabled: bitmapEditorRegionSelection === null || bitmapEditorTarget !== "result" }]}
            onChange={() => copyBitmapEditorSelection()}
          />
        </div>
        <div className="bitmap-editor-region-buttons">
          <SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Selection paste mode"
            value={bitmapEditorPasteMode ?? "off"}
            data={[
              { value: "off", label: "Off" },
              { value: "copy", label: "Paste", disabled: bitmapEditorClipboard === null && bitmapEditorRegionSelection === null },
              { value: "move", label: "Move", disabled: bitmapEditorClipboard === null && bitmapEditorRegionSelection === null },
            ]}
            onChange={(value) => value === "off" ? setBitmapEditorPasteMode(null) : startBitmapEditorPaste(value as "copy" | "move")}
          />
        </div>
        <div className="bitmap-editor-region-buttons bitmap-editor-selection-transform-tools">
          <span className="bitmap-editor-selection-tool-label">Transform selection</span>
          <SegmentedControl
            className="bitmap-editor-command-segments bitmap-editor-transform-segments"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Transform selection"
            value=""
            data={([
              ["mirror-x", "Mirror horizontally", <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M4 7h5M4 12h5M4 17h5M15 7h5M15 12h5M15 17h5" /><path d="m6 5-2 2 2 2m12-4 2 2-2 2m-12 6-2 2 2 2m12-4 2 2-2 2" /></svg>],
              ["mirror-y", "Mirror vertically", <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18M7 4v5M12 4v5M17 4v5M7 15v5M12 15v5M17 15v5" /><path d="m5 6 2-2 2 2m4 0 2-2 2 2m-10 12 2 2 2-2m4 0 2 2 2-2" /></svg>],
              ["rotate-cw", "Rotate 90 degrees clockwise", <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0 1 4M20 4v7h-7" /><path d="M8 9h3v7M8 12h3" /></svg>],
              ["rotate-ccw", "Rotate 90 degrees counterclockwise", <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11a8 8 0 1 1-1 4M4 4v7h7" /><path d="M13 9h3v7M13 12h3" /></svg>],
            ] as const).map(([value, label, icon]) => ({
              value,
              label: <Tooltip label={label} position="top" withArrow openDelay={350}><span className="bitmap-editor-transform-icon" aria-label={label}>{icon}</span></Tooltip>,
              disabled: bitmapEditorRegionSelection === null || bitmapEditorTarget !== "result",
            }))}
            onChange={(value) => transformBitmapEditorSelection(value as "mirror-x" | "mirror-y" | "rotate-cw" | "rotate-ccw")}
          />
          <span className="bitmap-editor-selection-tool-label">Move selection</span>
          <SegmentedControl
            className="bitmap-editor-command-segments"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Shift selected pixels"
            value=""
            data={(["left", "right", "up", "down"] as const).map((direction) => ({
              value: direction,
              label: <Tooltip label={`Move selection ${direction}`} position="top" withArrow openDelay={350}><span aria-label={`Move selection ${direction}`}>{direction === "left" ? "←" : direction === "right" ? "→" : direction === "up" ? "↑" : "↓"}</span></Tooltip>,
              disabled: bitmapEditorRegionSelection === null,
            }))}
            onChange={(value) => shiftBitmapEditorSelection(value as "left" | "right" | "up" | "down", bitmapEditorSelectionResolution)}
          />
        </div>
        {bitmapEditorPasteMode !== null ? <span role="status" className="bitmap-editor-selection-status">{bitmapEditorPasteMode === "move" ? "Click destination to move · Off ends selection paint" : `Click destination · ${bitmapEditorOperationLabel(bitmapEditorOperation)} ${bitmapEditorOperationDescription(bitmapEditorOperation, "pixel")} · click again to paste · Off ends selection paint`}</span> : bitmapEditorRegionSelection !== null ? <span className="bitmap-editor-selection-status">Selected {bitmapEditorRegionSelection.width}×{bitmapEditorRegionSelection.height} px{bitmapEditorRegionSelection.resolution === "attribute" ? ` · ${bitmapEditorRegionSelection.gridWidth}×${bitmapEditorRegionSelection.gridHeight} grid` : ""}</span> : null}
      </div>
      <div className="bitmap-editor-stipple-tools" data-editor-group="draw" aria-label="Stipple brush">
        <label className="bitmap-editor-stipple-toggle"><input type="checkbox" checked={bitmapEditorStippleEnabled} onChange={(event) => setBitmapEditorStippleEnabled(event.target.checked)} /><span>Stipple</span></label>
        <BitmapEditorStipplePicker choices={stippleOptions} selectedId={bitmapEditorStipplePattern} density={bitmapEditorStippleDensity} onSelect={setBitmapEditorStipplePattern} onDensityChange={setBitmapEditorStippleDensity} disabled={!bitmapEditorStippleEnabled} />
      </div>
      </div>
      <div className="bitmap-editor-picked-cell-preview" data-editor-group="draw" data-picked={bitmapEditorPickedCell !== null ? "true" : "false"} aria-live="polite" aria-label="Picked attribute cell preview">
        <span className="bitmap-editor-picked-cell-title">Picked cell</span>
        <span className="bitmap-editor-picked-cell-status">Color {bitmapEditorInkColor === null && bitmapEditorPaperColor === null && bitmapEditorBrightPolicy === null && bitmapEditorFlashPolicy === null ? "transparent" : "selected"} · Pattern {bitmapEditorPickedCell === null ? bitmapEditorPatternPickerActive ? "waiting" : "none" : "ready"}</span>
        <div className={`bitmap-editor-picked-cell-color-preview${bitmapEditorPickedCell === null ? " empty" : ""}`} style={{ backgroundColor: pickedPreviewPaper?.[pickedPreviewBright ? "bright" : "normal"] }}>
          <div className="bitmap-editor-picked-cell-grid" style={{ gridTemplateColumns: "repeat(8, 1fr)", gridTemplateRows: `repeat(${pickedPreviewHeight}, 1fr)`, aspectRatio: `8 / ${pickedPreviewHeight}` }} role="img" aria-label={bitmapEditorPickedCell === null ? `Empty cell preview, 8 by ${pickedPreviewHeight}` : `Picked cell ${bitmapEditorPickedCell.cellX}, ${bitmapEditorPickedCell.cellY}`}>
            {Array.from({ length: pickedPreviewHeight * 8 }, (_, index) => {
              const x = index % 8;
              const y = Math.floor(index / 8);
              const on = ((pickedPreviewRows[y] ?? 0) & (0x80 >> x)) !== 0;
              return <span className="bitmap-editor-picked-cell-pixel" key={index} style={{ backgroundColor: on ? pickedPreviewBright ? pickedPreviewInk?.bright : pickedPreviewInk?.normal : pickedPreviewBright ? pickedPreviewPaper?.bright : pickedPreviewPaper?.normal }} />;
            })}
          </div>
        </div>
        {bitmapEditorTarget === "result" && displayedResult !== null &&
          (displayedResult.platformId === "zx-spectrum" || bitmapEditorRegionSelection !== null) ? <div className="bitmap-editor-picked-cell-manipulation" aria-label="Picked cell and selection controls">
          <SegmentedControl
            className="bitmap-editor-command-segments bitmap-editor-picked-cell-actions"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Move, invert, or reset picked tile"
            value=""
            data={([
              ...(["left", "right", "up", "down"] as const).map((direction) => ({
                value: direction,
                label: <Tooltip label={`Move picked cell ${direction}`} position="top" withArrow openDelay={350}><span aria-label={`Move picked cell ${direction}`}>{direction === "left" ? "←" : direction === "right" ? "→" : direction === "up" ? "↑" : "↓"}</span></Tooltip>,
                disabled: bitmapEditorRegionSelection === null && bitmapEditorPickedCell === null,
              })),
              ...(displayedResult.platformId === "zx-spectrum" ? [
                { value: "invert", label: <Tooltip label="Invert picked tile" position="top" withArrow openDelay={350}><span aria-label="Invert picked tile">INV</span></Tooltip>, disabled: bitmapEditorPickedCell === null },
                { value: "reset", label: <Tooltip label="Reset picked tile" position="top" withArrow openDelay={350}><span aria-label="Reset picked tile">RST</span></Tooltip>, disabled: bitmapEditorPickedCell === null },
              ] : []),
            ] as const)}
            onChange={(action) => {
              if (action === "invert" || action === "reset") {
                setBitmapEditorPickedCell((cell) => cell === null ? null : transformZxAttributeCell(cell, action));
                return;
              }
              if (action !== "left" && action !== "right" && action !== "up" && action !== "down") return;
              if (bitmapEditorRegionSelection !== null) shiftBitmapEditorSelection(action);
              else setBitmapEditorPickedCell((cell) => cell === null ? null : transformZxAttributeCell(cell, action));
            }}
          />
        </div> : null}
        {bitmapEditorPickedCell === null ? <span className="bitmap-editor-picked-cell-empty">Empty · 8×{pickedPreviewHeight} · select a result cell with Pattern picker</span> : <span className="bitmap-editor-picked-cell-meta">{bitmapEditorPickedCell.cellX},{bitmapEditorPickedCell.cellY} · 8×{bitmapEditorPickedCell.attributeHeight} · INK {bitmapEditorPickedCell.attribute & 7} / PAPER {(bitmapEditorPickedCell.attribute >> 3) & 7} · BRIGHT {(bitmapEditorPickedCell.attribute & 0x40) !== 0 ? "on" : "off"} · FLASH {(bitmapEditorPickedCell.attribute & 0x80) !== 0 ? "on" : "off"} · 0x{bitmapEditorPickedCell.attribute.toString(16).padStart(2, "0")}</span>}
      </div>
      {displayedResult?.platformId === "zx-spectrum" &&
        displayedResult.modeId === "zx48-mixed-256x192" &&
        workspaceMode === "palette" && flashPreviewAvailable ? (
          <div className="bitmap-editor-flash-merged-preview" data-editor-group="display">
            <span>Mixed result · shared phase</span>
            <canvas ref={bitmapEditorMergedFlashCanvasRef} aria-label="ZX mixed result FLASH phase preview" />
          </div>
        ) : null}
      </div>
    </div>;
    return <>
      {side === bitmapEditorActiveSide && bitmapEditorToolsHost !== null
        ? createPortal(bitmapEditorActions, bitmapEditorToolsHost, "bitmap-editor-actions")
        : null}
      <div className="bitmap-editor-pane-layout">
      <div className={`preview-frame preview-viewport zx-preview bitmap-editor-full-viewport ${draggingSide === side ? "dragging" : ""}`} ref={side === "source" ? sourceViewportRef : resultViewportRef} onScroll={(event) => handlePreviewScroll(side, event)} onPointerDown={(event) => beginPreviewDrag(side, event)} onPointerMove={movePreviewDrag} onPointerUp={endPreviewDrag} onPointerCancel={endPreviewDrag} onWheel={(event) => handlePreviewWheel(side, event)} onFocusCapture={() => markPanSource(side)}>
        {!compatible ? <p className="preview-placeholder">Run a bitmap conversion to edit its result.</p> : <div className="bitmap-editor-full-layout">
          <div className={["preview-stage", "bitmap-editor-full-canvas", (side === "source" ? sourceZoom : resultZoom) === "fit" ? "fit-stage" : "", bitmapEditorGridMode === "pixel" ? "show-pixel-grid" : "", bitmapEditorGridMode === "cell" ? "show-attribute-grid" : ""].filter(Boolean).join(" ")} style={{
            width: (side === "source" ? sourceFitStageSize : resultFitStageSize)?.width !== undefined
              ? String((side === "source" ? sourceFitStageSize : resultFitStageSize)?.width) + "px"
              : (side === "source" ? sourceZoom : resultZoom) === "fit" ? undefined : String(width * Number(side === "source" ? sourceZoom : resultZoom)) + "px",
            height: (side === "source" ? sourceFitStageSize : resultFitStageSize)?.height !== undefined
              ? String((side === "source" ? sourceFitStageSize : resultFitStageSize)?.height) + "px"
              : undefined,
            aspectRatio: String(width) + " / " + String(height),
          }}>
            <canvas ref={canvasRefForSide} aria-label="Full bitmap editor" tabIndex={0} />
            <svg className="pixel-grid-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true"><path d={gridPathForDimensions(width, height, 1, 1)} vectorEffect="non-scaling-stroke" /></svg>
            {attributeWidth !== null && attributeHeight !== null ? <svg className="attribute-grid-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true"><path d={gridPathForDimensions(width, height, attributeWidth, attributeHeight)} vectorEffect="non-scaling-stroke" /></svg> : null}
            {(bitmapEditorSelectionDraft ?? bitmapEditorRegionSelection) !== null ? <svg className="bitmap-editor-selection-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true"><path d={bitmapSelectionOutlinePath((bitmapEditorSelectionDraft ?? bitmapEditorRegionSelection)!)} />{bitmapEditorSelectionResizeHandles(bitmapEditorSelectionDraft ?? bitmapEditorRegionSelection!).map((handle, index) => <rect className="bitmap-editor-selection-handle" key={index} {...handle} />)}</svg> : null}
            <div className={`bitmap-editor-interaction-layer${bitmapEditorToolMode === "selection" ? " selection-mode" : ""}${bitmapEditorToolMode === "selection" && bitmapEditorSelectionTool !== "none" ? " selecting" : ""}${bitmapEditorPasteMode !== null ? " pasting" : ""}${bitmapEditorRegionSelection !== null ? " has-selection" : ""}`} role="grid" tabIndex={0} aria-label={`Bitmap editor ${width} by ${height} pixels`} onContextMenu={(event) => event.preventDefault()} onDoubleClick={clearBitmapEditorSelectionOnDoubleClick} onKeyDown={(event) => { if (event.code === "Escape") { event.preventDefault(); setBitmapEditorColorPickerActive(false); setBitmapEditorPatternPickerActive(false); clearBitmapEditorPickedCell(); bitmapEditorFullPointerRef.current = null; bitmapEditorSelectionPointerRef.current = null; setBitmapEditorSelectionDraft(null); setBitmapEditorSelectionTool("rectangle"); } if (bitmapEditorRegionSelection !== null && bitmapEditorPasteMode === null && event.code.startsWith("Arrow")) { const direction = event.code === "ArrowLeft" ? "left" : event.code === "ArrowRight" ? "right" : event.code === "ArrowUp" ? "up" : "down"; event.preventDefault(); moveBitmapEditorSelectionByArrow(direction); } if (event.code === "Space") { event.preventDefault(); bitmapEditorSpaceRef.current = true; } }} onKeyUp={(event) => { if (event.code === "Space") bitmapEditorSpaceRef.current = false; }} onPointerDown={(event) => beginFullBitmapPointer(side, event)} onPointerMove={moveFullBitmapPointer} onPointerUp={endFullBitmapPointer} onPointerCancel={endFullBitmapPointer} />
          </div>
        </div>}
      </div>
      </div>
    </>;
  };
  const bitmapEditorPreview = bitmapEditorCell === null
    ? <p>Point at a converted cell first, then open the Unified editor.</p>
    : <>
        <p><strong>Cell {bitmapEditorSelection?.cellX ?? 0}, {bitmapEditorSelection?.cellY ?? 0}</strong> · Attribute 0x{bitmapEditorCell.attribute.toString(16).padStart(2, "0")}</p>
        <div className="bitmap-editor-layout">
          <div className="tile-editor-grid tile-editor-grid-main bitmap-editor-grid" role="grid" tabIndex={0} aria-label="Selected cell bitmap, 8 by 8 pixels" onKeyDown={handleBitmapEditorKey} onPointerDown={beginBitmapEditorPaint} onPointerMove={moveBitmapEditorPaint} onPointerUp={endBitmapEditorPaint} onPointerCancel={endBitmapEditorPaint}>
            {Array.from({ length: 64 }, (_, pixelIndex) => {
              const x = pixelIndex % 8;
              const y = Math.floor(pixelIndex / 8);
              const on = ((bitmapEditorCell.rows[y] ?? 0) & (0x80 >> x)) !== 0;
              const bright = (bitmapEditorCell.attribute & 0x40) !== 0;
              const ink = zxPaletteOptions[bitmapEditorCell.attribute & 7];
              const paper = zxPaletteOptions[(bitmapEditorCell.attribute >> 3) & 7];
              return <span className={`tile-editor-pixel${on ? " on" : ""}`} key={pixelIndex} role="gridcell" aria-label={`${x}, ${y}${on ? ": on" : ": off"}`} style={bitmapEditorUseColors ? { backgroundColor: on ? bright ? ink?.bright : ink?.normal : bright ? paper?.bright : paper?.normal } : undefined} />;
            })}
          </div>
          <div className="bitmap-editor-side">
            <div className="bitmap-editor-attributes">
              <label className="check-control"><input type="checkbox" checked={bitmapEditorUseColors} onChange={(event) => setBitmapEditorUseColors(event.target.checked)} /><span>Use INK/PAPER colors</span></label>
              <div className="bitmap-editor-color-group" role="group" aria-label="INK color">
                <span>INK</span>
                <div className="palette-options">
                  {zxPaletteOptions.map((color) => {
                    const selected = (bitmapEditorCell.attribute & 7) === color.code;
                    return <button className={`palette-option${selected ? " selected" : ""}`} type="button" key={color.code} aria-label={`Set INK to ${color.name}`} aria-pressed={selected} title={color.name} onClick={() => setBitmapEditorAttribute(7, color.code)}><span className="palette-swatch" style={{ background: (bitmapEditorCell.attribute & 0x40) !== 0 ? color.bright : color.normal }} aria-hidden="true" /></button>;
                  })}
                </div>
              </div>
              <div className="bitmap-editor-color-group" role="group" aria-label="PAPER color">
                <span>PAPER</span>
                <div className="palette-options">
                  {zxPaletteOptions.map((color) => {
                    const selected = ((bitmapEditorCell.attribute >> 3) & 7) === color.code;
                    return <button className={`palette-option${selected ? " selected" : ""}`} type="button" key={color.code} aria-label={`Set PAPER to ${color.name}`} aria-pressed={selected} title={color.name} onClick={() => setBitmapEditorAttribute(0x38, color.code << 3)}><span className="palette-swatch" style={{ background: (bitmapEditorCell.attribute & 0x40) !== 0 ? color.bright : color.normal }} aria-hidden="true" /></button>;
                  })}
                </div>
              </div>
              <label className="check-control"><input type="checkbox" checked={(bitmapEditorCell.attribute & 0x40) !== 0} onChange={(event) => setBitmapEditorAttribute(0x40, event.target.checked ? 0x40 : 0)} /><span>BRIGHT</span></label>
            </div>
            <div className="bitmap-editor-actions">
          <button className="secondary compact" type="button" onClick={() => applyBitmapEditorOperation({ kind: "invert" })}>Invert</button>
          <button className="secondary compact" type="button" onClick={invertBitmapEditorAttributes}>Invert attributes</button>
          <button className="secondary compact" type="button" onClick={() => applyBitmapEditorOperation({ kind: "shift", dx: -1, dy: 0 })}>←</button>
          <button className="secondary compact" type="button" onClick={() => applyBitmapEditorOperation({ kind: "shift", dx: 1, dy: 0 })}>→</button>
          <button className="secondary compact" type="button" onClick={() => applyBitmapEditorOperation({ kind: "shift", dx: 0, dy: -1 })}>↑</button>
          <button className="secondary compact" type="button" onClick={() => applyBitmapEditorOperation({ kind: "shift", dx: 0, dy: 1 })}>↓</button>
          <button className="secondary compact" type="button" onClick={undoBitmapEditor} disabled={bitmapEditorUndo.length === 0}>Undo</button>
          <button className="secondary compact" type="button" onClick={redoBitmapEditor} disabled={bitmapEditorRedo.length === 0}>Redo</button>
          <button className="secondary compact" type="button" onClick={revertBitmapEditorChanges} disabled={bitmapEditorOriginalResult === null}>Revert applied</button>
            </div>
          </div>
        </div>
      </>;
  const unifiedEditorPreview = workspaceMode === "palette"
    ? bitmapEditorPreview
    : charsetState.kind !== "ready"
      ? <p>Run Tilemap High to open the unified editor.</p>
    : (() => {
        const result = charsetState.result;
        const selectedCellIndex = tilemapEditorCell;
        const selectedAssignment = selectedCellIndex === null ? null : result.assignments[selectedCellIndex] ?? null;
        const mapCellAttribute = selectedCellIndex === null ? 0 : result.attributes[selectedCellIndex] ?? 0;
        const selectedAttribute = unifiedTileEditorContext === "stamp" ? tileStampDraft.attribute : mapCellAttribute;
        const selectedTransform = unifiedTileEditorContext === "stamp"
          ? tileStampDraft.transform
          : selectedAssignment?.transform ?? 0;
        const selectedInverted = unifiedTileEditorContext === "stamp"
          ? tileStampDraft.inverted
          : selectedAssignment?.inverted ?? false;
        const selectedTransformToggles = tileTransformToggleState(selectedTransform);
        const selectedTransformToggleActive = (toggle: TileTransformToggle) =>
          toggle === "rotate-ccw"
            ? selectedTransformToggles["mirror-x"] && selectedTransformToggles["rotate-cw"]
            : selectedTransformToggles[toggle];
        const previewAssignment = unifiedTileEditorContext === "stamp"
          ? tileStampDraft.characterIndex === null
            ? null
            : {
                characterIndex: tileStampDraft.characterIndex,
                transform: tileStampDraft.transform,
                inverted: tileStampDraft.inverted,
              }
          : selectedAssignment;
        const selectedTilePreview = previewAssignment === null
          ? new Uint8Array(8)
          : transformTile(result.charset.subarray(previewAssignment.characterIndex * 8, previewAssignment.characterIndex * 8 + 8), previewAssignment.transform);
        if (previewAssignment?.inverted) {
          for (let row = 0; row < selectedTilePreview.length; row += 1) selectedTilePreview[row] = (selectedTilePreview[row] ?? 0) ^ 0xff;
        }
        const selectedBright = (selectedAttribute & 0x40) !== 0;
        const selectedFlash = (selectedAttribute & 0x80) !== 0;
        const selectedInk = ZX_BASE_COLORS[selectedAttribute & 7];
        const selectedPaper = ZX_BASE_COLORS[(selectedAttribute >> 3) & 7];
        const invertSelectedFlash = selectedFlash && (
          bitmapEditorFlashPreviewMode === "inverted" ||
          (bitmapEditorFlashPreviewMode === "animate" && bitmapEditorFlashPreviewPhase)
        );
        const selectedPreviewInk = invertSelectedFlash ? selectedPaper : selectedInk;
        const selectedPreviewPaper = invertSelectedFlash ? selectedInk : selectedPaper;
        const selectedCellX = selectedCellIndex === null ? null : selectedCellIndex % 32;
        const selectedCellY = selectedCellIndex === null ? null : Math.floor(selectedCellIndex / 32);
        const hasSelectedMapCell = selectedCellIndex !== null && selectedAssignment !== null;
        const canEditSelectedCell = unifiedTileEditorContext === "stamp" || hasSelectedMapCell;
        return <div className="unified-editor" tabIndex={-1} onKeyDown={handleUnifiedEditorKey}>
          <div className="unified-editor-toolbar">
            <button className="secondary compact" type="button" onClick={undoTileEditor} disabled={tileEditorUndo.length === 0}>Undo</button>
            <button className="secondary compact" type="button" onClick={redoTileEditor} disabled={tileEditorRedo.length === 0}>Redo</button>
            <button className="secondary compact" type="button" onClick={revertSelectedTile} disabled={tileEditorOriginals[tileEditorSelected] === null}>Revert</button>
            <div className="unified-editor-context-tabs unified-segmented" role="tablist" aria-label="Tilemap editor context">
              <button className={`secondary compact${unifiedTileEditorContext === "map-cell" ? " active" : ""}`} id="tilemap-context-map-cell" type="button" role="tab" aria-selected={unifiedTileEditorContext === "map-cell"} aria-controls="tilemap-editor-panel" onClick={() => switchUnifiedTileEditorContext("map-cell")}>Map Cell</button>
              <button className={`secondary compact${unifiedTileEditorContext === "stamp" ? " active" : ""}`} id="tilemap-context-stamp" type="button" role="tab" aria-selected={unifiedTileEditorContext === "stamp"} aria-controls="tilemap-editor-panel" onClick={() => switchUnifiedTileEditorContext("stamp")}>Tile Stamp</button>
            </div>
          </div>
          <div className="unified-tile-layout">
            <section className="unified-tile-column" aria-label="Base tile editor">
              <div className="unified-tile-heading">
                <p><strong>Base tile {tileEditorSelected}</strong> · {tileUsage.find((item) => item.characterIndex === tileEditorSelected)?.count ?? 0} map cells use it</p>
              </div>
              <div className="unified-tile-bitmap" role="grid" aria-label={`Base tile ${tileEditorSelected} bitmap`} onPointerDown={beginTileEditorPaint} onPointerMove={moveTileEditorPaint} onPointerUp={endTileEditorPaint} onPointerCancel={endTileEditorPaint}>{Array.from({ length: 64 }, (_, pixelIndex) => { const x = pixelIndex % 8; const y = Math.floor(pixelIndex / 8); const row = result.charset[tileEditorSelected * 8 + y] ?? 0; const on = (row & (0x80 >> x)) !== 0; return <span className={`tile-editor-pixel${on ? " on" : ""}`} key={pixelIndex} role="gridcell" aria-label={`${x}, ${y}${on ? ": on" : ": off"}`} />; })}</div>
              <div className="unified-tile-navigation unified-segmented" role="group" aria-label="Base tile navigation"><button className="secondary compact" type="button" onClick={() => moveEditorTile(-1)} disabled={tileEditorSelected === 0} aria-label="Previous tile">◀ Previous</button><button className="secondary compact" type="button" onClick={() => moveEditorTile(1)} disabled={tileEditorSelected >= result.characterCount - 1} aria-label="Next tile">Next ▶</button></div>
              <div className="unified-base-tile-actions" aria-label="Base tile operations">
                <div className="tile-editor-toolbar unified-segmented" role="group" aria-label="Rotate or shift base tile"><button className="secondary compact" type="button" onClick={() => applyEditorOperation({ kind: "rotate-left" })} aria-label="Rotate base tile left">◀</button><button className="secondary compact" type="button" onClick={() => applyEditorOperation({ kind: "rotate-right" })} aria-label="Rotate base tile right">▶</button><button className="secondary compact" type="button" onClick={() => applyEditorOperation({ kind: "rotate-up" })} aria-label="Rotate base tile up">▲</button><button className="secondary compact" type="button" onClick={() => applyEditorOperation({ kind: "rotate-down" })} aria-label="Rotate base tile down">▼</button></div>
                <div className="unified-base-edit-actions unified-segmented" role="group" aria-label="Clear or invert base tile"><button className="secondary compact" type="button" onClick={() => applyEditorOperation({ kind: "clear" })}>Clear</button><button className="secondary compact" type="button" onClick={() => applyEditorOperation({ kind: "invert" })}>Invert</button></div>
              </div>
            </section>
            <section id="tilemap-editor-panel" className="unified-tile-column unified-cell-column" role="tabpanel" aria-labelledby={unifiedTileEditorContext === "stamp" ? "tilemap-context-stamp" : "tilemap-context-map-cell"} aria-label={unifiedTileEditorContext === "stamp" ? "Tile stamp preparation" : "Selected map cell preview and attributes"}>
              <div className="unified-tile-heading">
                <p><strong>{unifiedTileEditorContext === "stamp"
                  ? tileStampDraft.characterIndex === null ? "Tile stamp · no tile loaded" : `Tile stamp · Base tile ${tileStampDraft.characterIndex}`
                  : hasSelectedMapCell ? `Map cell ${selectedCellX},${selectedCellY}` : "No map cell selected"}</strong>{unifiedTileEditorContext === "stamp"
                    ? tileStampDraft.characterIndex === null ? " · Choose TILE to load a tile" : " · settings are independent of map cells"
                    : hasSelectedMapCell ? ` · Tile ${selectedAssignment.characterIndex}` : " · Select a cell in the tilemap preview"}</p>
              </div>
              <div className="unified-rendered-tile" role="img" aria-label={unifiedTileEditorContext === "stamp"
                ? tileStampDraft.characterIndex === null ? "Empty tile stamp preview" : `Tile stamp preview of base tile ${tileStampDraft.characterIndex}, ${tileTransformLabel(selectedTransform)}, INK ${selectedAttribute & 7}, PAPER ${(selectedAttribute >> 3) & 7}`
                : hasSelectedMapCell ? `Rendered tile at map cell ${selectedCellX},${selectedCellY}, ${tileTransformLabel(selectedTransform)}, INK ${selectedAttribute & 7}, PAPER ${(selectedAttribute >> 3) & 7}` : "No selected tilemap cell"}>
                {Array.from({ length: 64 }, (_, pixelIndex) => {
                  const x = pixelIndex % 8;
                  const y = Math.floor(pixelIndex / 8);
                  const on = ((selectedTilePreview[y] ?? 0) & (0x80 >> x)) !== 0;
                  const color = on ? selectedPreviewInk : selectedPreviewPaper;
                  return <span key={pixelIndex} style={{ backgroundColor: color === undefined ? "#000" : color[selectedBright ? "bright" : "normal"] }} />;
                })}
              </div>
              <div className="unified-transform-controls unified-segmented" role="group" aria-label={unifiedTileEditorContext === "stamp" ? "Prepared tile transformation" : "Selected cell transformation"}>
                {([
                  ["mirror-x", "Mirror X"],
                  ["mirror-y", "Mirror Y"],
                  ["rotate-cw", "R90 CW"],
                  ["rotate-ccw", "R90 CCW"],
                ] as const).map(([toggle, label]) => <button className={`secondary compact${selectedTransformToggleActive(toggle) ? " active" : ""}`} key={toggle} type="button" disabled={!canEditSelectedCell || !result.transformations} aria-pressed={selectedTransformToggleActive(toggle)} title={result.transformations ? `${label} ${unifiedTileEditorContext === "stamp" ? "prepared tile" : "selected map cell"}` : "Enable transformations in tilemap settings to edit transforms"} onClick={() => toggleSelectedTilemapTransform(toggle)}>{label}</button>)}
                <button className="secondary compact" type="button" disabled={!canEditSelectedCell || !result.transformations || (unifiedTileEditorContext === "stamp" ? selectedTransform === 0 && !selectedInverted : selectedTransform === 0)} title={`Reset ${unifiedTileEditorContext === "stamp" ? "prepared tile" : "selected cell"} transform`} onClick={resetTilemapEditorTransform}>Reset</button>
              </div>
              <p className="unified-transform-readout">{tileTransformLabel(selectedTransform)}{selectedInverted ? " · Inverted" : ""}{selectedFlash ? " · FLASH" : ""}</p>
                <div className="unified-cell-colors" aria-label={unifiedTileEditorContext === "stamp" ? "Prepared tile color attributes" : "Selected cell color attributes"}>
                <div className="unified-color-row"><button className="unified-color-swap-label" type="button" disabled={!canEditSelectedCell} title="Swap INK and PAPER colors" aria-label="Swap INK and PAPER colors (INK label)" onClick={swapSelectedTilemapInkPaper}>INK</button><div className="unified-color-swatches">{zxPaletteOptions.map((color) => <button className={`bitmap-editor-attribute-color${(selectedAttribute & 7) === color.code ? " selected" : ""}`} key={`ink-${color.code}`} type="button" disabled={!canEditSelectedCell} aria-label={`Set ${unifiedTileEditorContext === "stamp" ? "prepared tile" : "selected cell"} INK to ${color.name}`} aria-pressed={(selectedAttribute & 7) === color.code} title={`INK ${color.name}`} onClick={() => updateSelectedTilemapAttribute((attribute) => (attribute & ~7) | color.code)}><span style={{ background: selectedBright ? color.bright : color.normal }} /></button>)}</div></div>
                <div className="unified-color-row"><button className="unified-color-swap-label" type="button" disabled={!canEditSelectedCell} title="Swap INK and PAPER colors" aria-label="Swap INK and PAPER colors (PAPER label)" onClick={swapSelectedTilemapInkPaper}>PAPER</button><div className="unified-color-swatches">{zxPaletteOptions.map((color) => <button className={`bitmap-editor-attribute-color${((selectedAttribute >> 3) & 7) === color.code ? " selected" : ""}`} key={`paper-${color.code}`} type="button" disabled={!canEditSelectedCell} aria-label={`Set ${unifiedTileEditorContext === "stamp" ? "prepared tile" : "selected cell"} PAPER to ${color.name}`} aria-pressed={((selectedAttribute >> 3) & 7) === color.code} title={`PAPER ${color.name}`} onClick={() => updateSelectedTilemapAttribute((attribute) => (attribute & ~0x38) | (color.code << 3))}><span style={{ background: selectedBright ? color.bright : color.normal }} /></button>)}</div></div>
                <div className="unified-attribute-flags" aria-label="Selected cell attributes and pickers">
                  <div className="unified-segmented unified-cell-flag-buttons" role="group" aria-label={unifiedTileEditorContext === "stamp" ? "Prepared tile color flags" : "Cell color flags"}>
                    <button className={`secondary compact unified-attribute-toggle${selectedBright ? " active" : ""}`} type="button" disabled={!canEditSelectedCell} aria-pressed={selectedBright} onClick={() => updateSelectedTilemapAttribute((attribute) => attribute ^ 0x40)}>BRIGHT</button>
                    <button className={`secondary compact unified-attribute-toggle${selectedFlash ? " active" : ""}`} type="button" disabled={!canEditSelectedCell} aria-pressed={selectedFlash} onClick={() => updateSelectedTilemapAttribute((attribute) => attribute ^ 0x80)}>FLASH</button>
                    <button className="secondary compact" type="button" disabled={!canEditSelectedCell} title={`Swap INK and PAPER for this ${unifiedTileEditorContext === "stamp" ? "prepared tile" : "map cell"}; BRIGHT and FLASH remain unchanged`} aria-label="Invert INK/PAPER by swapping them" onClick={() => updateSelectedTilemapAttribute((attribute) =>
                      swapTilemapInkPaper(attribute)
                    )}>INV</button>
                  </div>
                  <div className={`unified-segmented unified-cell-pickers${unifiedTileEditorContext === "map-cell" ? " map-cell-pickers" : ""}`} role="group" aria-label={unifiedTileEditorContext === "stamp" ? "Tile stamp pickers and placement" : "Map cell pickers"}>
                    <button className={`secondary compact${tileEditorColorPickerActive ? " active" : ""}`} type="button" disabled={!canEditSelectedCell} aria-pressed={tileEditorColorPickerActive} title={unifiedTileEditorContext === "stamp" ? "Pick INK, PAPER, BRIGHT, and FLASH from a result cell for the prepared tile" : "Pick INK, PAPER, BRIGHT, and FLASH from a map cell, then apply them to the selected cell"} onClick={() => {
                    tilemapPutPointerRef.current = null;
                    setTilemapPutActive(false);
                    setTileEditorTilePickerActive(false);
                    setTileEditorColorPickerActive((active) => !active);
                    }}>COL</button>
                    <button className={`secondary compact${tileEditorTilePickerActive ? " active" : ""}`} type="button" disabled={!canEditSelectedCell} aria-pressed={tileEditorTilePickerActive} title={unifiedTileEditorContext === "stamp" ? "Choose a base tile from the converted screen or Charset tiles for the prepared stamp" : "Choose a tile from the converted screen or Charset tiles; replace the tile index only at the selected map cell"} onClick={() => {
                    tilemapPutPointerRef.current = null;
                    setTilemapPutActive(false);
                    setTileEditorColorPickerActive(false);
                    setTileEditorTilePickerActive((active) => !active);
                    }}>TILE</button>
                    {unifiedTileEditorContext === "stamp" ? <button className={`secondary compact${tilemapPutActive ? " active" : ""}`} type="button" disabled={tileStampDraft.characterIndex === null || tileStampDraft.characterIndex < 0 || tileStampDraft.characterIndex >= result.characterCount} aria-pressed={tilemapPutActive} title="Draw with the prepared tile, transform, polarity, and color settings on the converted result" onClick={() => {
                    tilemapPutPointerRef.current = null;
                    setTileEditorColorPickerActive(false);
                    setTileEditorTilePickerActive(false);
                    setTilemapPutActive((active) => !active);
                    }}>PUT</button> : null}
                  </div>
                </div>
                {tileEditorColorPickerActive ? <span className="control-help" role="status">{unifiedTileEditorContext === "stamp" ? "Click a converted result cell to copy its attributes into the prepared tile." : "Click a map cell to copy its attributes to the selected cell."}</span> : null}
                {tileEditorTilePickerActive ? <span className="control-help" role="status">{unifiedTileEditorContext === "stamp" ? "Choose a base tile from the converted screen or Charset tiles. This prepares the stamp without changing the map." : <>Choose a source tile from the converted screen or Charset tiles. Only map cell {selectedCellX},{selectedCellY} will change; other uses are untouched.</>} Press Escape to cancel.</span> : null}
                {tilemapPutActive && unifiedTileEditorContext === "stamp" ? <span className="control-help" role="status">PUT active: draw on the converted result to place base tile {tileStampDraft.characterIndex}, using the prepared transform and color settings. Drag to place repeatedly; Escape to stop.</span> : null}
              </div>
            </section>
          </div>
        </div>;
      })();
  const qlVerticalPixelScale = isQl && (
      targetModeId === "mode4-512x256" ||
      targetModeId === "mode4-plain-512x256" ||
      targetModeId === "mode8-mode4-mixed-512x256" ||
      targetModeId === "mode4-vertical-spatial-512x256"
    )
    ? 2
    : 1;
  const analyticVerticalScale = targetModeId.includes("vertical-spatial") &&
      (outputPreviewStage === "merged" || outputPreviewStage === "screen-2")
    ? 2
    : 1;
  const inspectionCellHeight = workspaceMode === "tilemap" ? 8 : displayedAttributeHeight;
  const inspectionCellOverlay = inspection === null
    ? null
    : {
        x: inspection.cellX * 8,
        y: inspection.cellY * inspectionCellHeight,
        width: 8,
        height: inspectionCellHeight,
      };
  const bitmapEditorSelectionOverlay = bitmapEditorSelection === null
    ? null
    : {
        x: bitmapEditorSelection.cellX * 8,
        y: bitmapEditorSelection.cellY * inspectionCellHeight,
        width: 8,
      height: inspectionCellHeight,
    };
  const tilemapEditorSelectionOverlay = workspaceMode !== "tilemap" || tilemapEditorCell === null
    ? null
    : {
        x: (tilemapEditorCell % 32) * 8,
        y: Math.floor(tilemapEditorCell / 32) * 8,
        width: 8,
        height: 8,
      };
  const highlightedTileCells = workspaceMode === "tilemap" && highlightSelectedTileUses && charsetState.kind === "ready"
    ? charsetState.result.assignments.flatMap((assignment, cellIndex) =>
        assignment.characterIndex === tileEditorSelected && cellIndex !== tilemapEditorCell
          ? [{ x: (cellIndex % 32) * 8, y: Math.floor(cellIndex / 32) * 8, width: 8, height: 8 }]
          : [],
      )
    : [];
  const previewAspect = resolvePreviewAspect(
    displayedWidth,
    displayedHeight,
    isQl && scaleQlToDisplayAspect,
    qlVerticalPixelScale,
    4 / 3,
    analyticVerticalScale,
  );
  const previewAspectRatio = `${previewAspect.width} / ${previewAspect.height}`;
  const sourceZoom = sourcePreviewZoom;
  const resultZoom = resultPreviewZoom;
  const sourceShowsImage = framing !== "crop" &&
    (sourcePreviewContent === "image" || sourcePreviewContent === "source-image") &&
    image !== null;
  const sourceShowsConvertedResult = sourcePreviewContent === "result-image" ||
    (targetModeId.includes("vertical-spatial") &&
      (sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2"));
  const sourceStageAspect = sourceShowsConvertedResult
    ? previewAspect
    : framing === "crop"
      ? cropSourceSize ?? destinationGeometry
      : sourceShowsImage
        ? { width: image.width, height: image.height }
        : previewAspect;
  const sourceStageAspectRatio = `${sourceStageAspect.width} / ${sourceStageAspect.height}`;
  const sourceStageWidth = sourceZoom !== "fit"
    ? `${sourceStageAspect.width * Number(sourceZoom)}px`
    : undefined;
  const sourceFitStageSize: PreviewFitSize | null = sourceZoom === "fit"
    ? fitPreviewToViewport(
        previewViewportSizes.source.width,
        previewViewportSizes.source.height,
        sourceStageAspect.width,
        sourceStageAspect.height,
      )
    : null;
  const resultStageAspectRatio = resultPreviewContent === "source-image" && image !== null
    ? `${image.width} / ${image.height}`
    : previewAspectRatio;
  const resultStageWidth = resultPreviewContent === "source-image" && image !== null && resultZoom !== "fit"
    ? `${image.width * resultZoom}px`
    : resultZoom === "fit" ? undefined : `${previewAspect.width * Number(resultZoom)}px`;
  const resultStageAspect = resultPreviewContent === "source-image" && image !== null
    ? { width: image.width, height: image.height }
    : previewAspect;
  const resultFitStageSize: PreviewFitSize | null = resultZoom === "fit"
    ? fitPreviewToViewport(
        previewViewportSizes.result.width,
        previewViewportSizes.result.height,
        resultStageAspect.width,
        resultStageAspect.height,
      )
    : null;

  useLayoutEffect(() => {
    const measure = (viewport: HTMLDivElement | null): { readonly width: number; readonly height: number } => {
      if (viewport === null) return { width: 0, height: 0 };
      const bounds = viewport.getBoundingClientRect();
      const styles = window.getComputedStyle(viewport);
      const horizontalInset = [styles.paddingLeft, styles.paddingRight, styles.borderLeftWidth, styles.borderRightWidth]
        .reduce((total, value) => total + (Number.parseFloat(value) || 0), 0);
      const verticalInset = [styles.paddingTop, styles.paddingBottom, styles.borderTopWidth, styles.borderBottomWidth]
        .reduce((total, value) => total + (Number.parseFloat(value) || 0), 0);
      return {
        width: Math.max(0, bounds.width - horizontalInset),
        height: Math.max(0, bounds.height - verticalInset),
      };
    };
    const update = (): void => {
      const next = {
        source: measure(sourceViewportRef.current),
        result: measure(resultViewportRef.current),
      };
      setPreviewViewportSizes((current) => current.source.width === next.source.width &&
          current.source.height === next.source.height &&
          current.result.width === next.result.width &&
          current.result.height === next.result.height
        ? current
        : next);
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(update);
    if (sourceViewportRef.current !== null) observer?.observe(sourceViewportRef.current);
    if (resultViewportRef.current !== null && resultViewportRef.current !== sourceViewportRef.current) {
      observer?.observe(resultViewportRef.current);
    }
    window.addEventListener("resize", update);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [sourcePreviewContent, resultPreviewContent, sourceZoom, resultZoom, sourceStageAspectRatio,
    resultStageAspectRatio, workbenchSourceFloating, workbenchResultFloating, workbenchPreviewLayer,
    workbenchWindowLayouts.source.dock, workbenchWindowLayouts.source.minimized,
    workbenchWindowLayouts.result.dock, workbenchWindowLayouts.result.minimized]);

  useLayoutEffect(() => {
    if (bitmapEditorActiveSide === null) return;
    const frame = window.requestAnimationFrame(updateBitmapEditorNavigatorViewport);
    return () => window.cancelAnimationFrame(frame);
  }, [bitmapEditorActiveSide, sourcePreviewZoom, resultPreviewZoom, previewViewportSizes]);

  const selectedModePalette =
    selectedProfile.palette.modes[targetModeId] ??
    selectedProfile.palette.modes[
      selectedProfile.presets[0]?.settings.modeId ?? ""
    ];
  const selectedPaletteScreens = (() => {
    if (selectedModePalette === undefined || !isPmd) return selectedModePalette?.screens ?? [];
    try {
      return profileModeScreens(selectedProfile, targetModeId, pmd85PaletteCalibrationId);
    } catch {
      return selectedModePalette.screens;
    }
  })();
  const paletteOptionsByScreen = selectedPaletteScreens.map(
    (screen) => screen.colors.map((color) => ({
      code: color.id,
      name: color.name,
      normal: color.normal,
      bright: color.bright ?? color.normal,
    })),
  );
  const effectivePaletteOptionsByScreen = isZx
    ? Array.from({ length: paletteSelections.length }, () => zxPaletteOptions)
    : paletteOptionsByScreen;
  const zxFlashPreviewPhaseActive = workspaceMode === "palette" && (
    bitmapEditorFlashPreviewMode === "inverted" ||
    (bitmapEditorFlashPreviewMode === "animate" && bitmapEditorFlashPreviewPhase)
  );
  const liveFramePreviewRgba = (
    result: WorkerConversionResult,
    frameIndex: number,
  ): Uint8Array | undefined => {
    const frame = result.frames[frameIndex];
    if (frame === undefined) return undefined;
    return result.platformId === "zx-spectrum" &&
        result.attributeHeight !== null && zxFlashPreviewPhaseActive
      ? renderZxFlashPreview(frame.encoded, result.attributeHeight, true, resolvedZxPalette)
      : frame.previewRgba;
  };
  const liveMergedPreviewRgba = (result: WorkerConversionResult): Uint8Array => {
    if (result.platformId !== "zx-spectrum" || !zxFlashPreviewPhaseActive) {
      return result.mergedPreviewRgba;
    }
    const first = liveFramePreviewRgba(result, 0);
    if (first === undefined) return result.mergedPreviewRgba;
    const second = liveFramePreviewRgba(result, 1);
    return second === undefined ? first : mergeTemporalRgba(first, second);
  };
  const spatialAnalyticPreview = targetModeId.includes("vertical-spatial") &&
    (outputPreviewStage === "merged" || outputPreviewStage === "screen-2");
  const outputPaletteColors = (outputPreviewStage === "merged" || spatialAnalyticPreview) &&
      displayedResult !== null
    ? distinctPreviewColors(
        displayedResult.platformId === "sinclair-ql" &&
          displayedResult.modeId === "mode8-mode4-mixed-512x256" &&
          displayedResult.frames[0] !== undefined &&
          displayedResult.frames[1] !== undefined
          ? renderQlMixedDisplayPreview(
              displayedResult.frames[0].previewRgba,
              displayedResult.frames[1].previewRgba,
              displayedResult.width,
              qlMixedDisplayResolution,
            )
          : displayedResult.verticalSpatialDiagnostics !== undefined &&
              displayedResult.platformId === "zx-spectrum" &&
              zxFlashPreviewPhaseActive
            ? buildVerticalSpatialAnalyticPreview(
                liveFramePreviewRgba(displayedResult, 0) ?? displayedResult.frames[0]?.previewRgba ?? displayedResult.verticalSpatialDiagnostics.analyticPreviewRgba,
                displayedResult.width,
                displayedResult.height,
              )
            : displayedResult.verticalSpatialDiagnostics?.analyticPreviewRgba ??
              liveMergedPreviewRgba(displayedResult),
      ).map((color) => ({
        key: color,
        background: color,
        title: color.toUpperCase(),
      }))
    : (() => {
        const screenIndex = outputPreviewStage === "screen-2" ? 1 : 0;
        const resultSelections = displayedResult?.paletteSelections ?? paletteSelections;
        const selection = resultSelections[screenIndex] ?? resultSelections[0];
        if (selection === undefined) return [];
        return selection.enabledColorIds.flatMap((color) => {
          const option = (
            effectivePaletteOptionsByScreen[screenIndex] ??
            effectivePaletteOptionsByScreen[0] ??
            []
          ).find((candidate) => candidate.code === color);
          if (option === undefined) return [];
          const background = isZx && selection.brightMode === "auto"
            ? `linear-gradient(90deg, ${option.normal} 0 50%, ${option.bright} 50% 100%)`
            : isZx && selection.brightMode === "on"
              ? option.bright
              : option.normal;
          return [{
            key: `${screenIndex}-${color}`,
            background,
            title: option.name,
          }];
        });
      })();
  const differencePreviewDataUrl = useMemo(() => {
    const frame = displayedResult?.frames[0];
    if (displayedResult === null || frame === undefined) return null;
    const resultRgba = liveFramePreviewRgba(displayedResult, 0) ?? frame.previewRgba;
    return rgbaPngDataUrl(
      previewDifferenceHeatmap(displayedResult.sourcePreviewRgba, resultRgba),
      displayedResult.width,
      displayedResult.height,
    );
  }, [displayedResult, bitmapEditorFlashPreviewMode, bitmapEditorFlashPreviewPhase]);
  const mixedScreenWindowImages = useMemo(() => {
    if (displayedResult === null) return null;
    const first = displayedResult.frames[0];
    const second = displayedResult.frames[1];
    if (first === undefined) return null;
    const width = displayedResult.width;
    const height = displayedResult.height;
    const encode = (rgba: Uint8Array) => rgbaPngDataUrl(rgba, width, height);
    const framePreview = (frame: typeof first): Uint8Array =>
      liveFramePreviewRgba(displayedResult, displayedResult.frames.indexOf(frame)) ?? frame.previewRgba;
    const previews: Partial<Record<"screen-1" | "screen-2" | "merged-low" | "merged-high", string>> = {};
    if (displayedResult.verticalSpatialDiagnostics !== undefined) {
      const physicalPreview = framePreview(first);
      previews["screen-1"] = encode(physicalPreview);
      const analyticPreview = displayedResult.platformId === "zx-spectrum" && zxFlashPreviewPhaseActive
        ? buildVerticalSpatialAnalyticPreview(physicalPreview, width, height)
        : displayedResult.verticalSpatialDiagnostics.analyticPreviewRgba;
      previews["screen-2"] = rgbaPngDataUrl(analyticPreview, width, height / 2);
      return previews;
    }
    if (second === undefined) return null;
    const firstPreview = framePreview(first);
    const secondPreview = framePreview(second);
    previews["screen-1"] = encode(firstPreview);
    previews["screen-2"] = encode(secondPreview);
    if (displayedResult.platformId === "sinclair-ql" &&
      displayedResult.modeId === "mode8-mode4-mixed-512x256") {
      previews["merged-low"] = encode(renderQlMixedDisplayPreview(first.previewRgba, second.previewRgba, width, "low"));
      previews["merged-high"] = encode(renderQlMixedDisplayPreview(first.previewRgba, second.previewRgba, width, "high"));
    }
    return previews;
  }, [displayedResult, bitmapEditorFlashPreviewMode, bitmapEditorFlashPreviewPhase]);
  const preAttributePreviewDataUrl = displayedResult === null
    ? null
    : rgbaPngDataUrl(
        displayedResult.preConstraintPreviewRgba,
        displayedResult.width,
        displayedResult.height,
      );
  const windowImageFor = (content: PreviewContent) => {
    if (content === "pre-attribute") {
      return preAttributePreviewDataUrl === null
        ? <p>Convert an image to view the pre-attribute dither stage.</p>
        : <img className="preview-difference-image" src={preAttributePreviewDataUrl} alt="Pre-attribute dither preview" />;
    }
    if (mixedScreenWindowImages === null || !(content in mixedScreenWindowImages)) {
      return <p>Convert a mixed two-screen target to view this stage.</p>;
    }
    const image = mixedScreenWindowImages[content as keyof typeof mixedScreenWindowImages];
    return typeof image === "string"
      ? <img className="preview-difference-image" src={image} alt={`${content} preview`} />
      : <p>This preview is not available for the selected target.</p>;
  };
  const retainedDraftVisible = draftPreviewResult(draftState) !== null;
  const bitmapEditorEdited = bitmapEditorOriginalResult !== null || bitmapEditorRevertSource !== null || bitmapEditorResultEdited;
  const platformLabel = isQl ? "Sinclair QL" : isPmd ? "Tesla PMD 85" : "ZX Spectrum";
  const paletteResultLabel = draftState.kind === "ready"
    ? `${platformLabel} result · Draft preview`
    : retainedDraftVisible &&
        (draftState.kind === "scheduled" || draftState.kind === "running")
      ? `${platformLabel} result · Draft updating`
    : state.kind === "stale" ? `${platformLabel} result · stale High`
    : state.kind === "ready" ? `${platformLabel} result · completed High${bitmapEditorEdited ? " · edited" : ""}`
    : `${platformLabel} result`;
  const resultLabel = workspaceMode === "tilemap"
    ? `Tilemap reconstruction${
        tilemapStale ? " · stale" :
        charsetState.kind === "running" ? " · converting" :
        charsetState.kind === "ready" ? tileEditorEdited ? " · edited" : " · current" : ""
      }`
      : paletteResultLabel;
  const comparisonKind = workspaceMode === "tilemap"
    ? "tilemap"
    : workspaceLayout === "dithering"
      ? "dithering"
      : "palette";
  const hasMixedScreenTarget = targetModeId === "zx48-mixed-256x192" ||
    targetModeId === "mode8-256x256" ||
    targetModeId === "mode4-512x256" ||
    targetModeId === "mode8-mode4-mixed-512x256";
  const hasVerticalSpatialTarget = targetModeId.includes("vertical-spatial");
  const hasQlMixedResolutionTarget = targetModeId === "mode8-mode4-mixed-512x256";
  const sharedBitmapDiagnosticsText = (result: WorkerConversionResult): string => {
    const diagnostics = result.sharedBitmapDiagnostics;
    if (diagnostics === undefined) return "";
    const percentChange = (before: number, after: number): string => before === 0
      ? "0.00%"
      : `${((after - before) / before * 100).toFixed(2)}%`;
    if (result.attributeOptimizerId === "zx-mixed-shared-bitmap-v3") {
      const change = (before: number | undefined, after: number | undefined): string =>
        before === undefined || after === undefined || before === 0
          ? "n/a"
          : `${((after - before) / before * 100).toFixed(2)}%`;
      return ` Shared bitmap v3 fixed objective — J ${change(diagnostics.objectiveBaseline, diagnostics.objectiveFinal)}; ` +
        `color ${change(diagnostics.baselineColorError, diagnostics.finalColorError)}; ` +
        `attribute visibility ${change(diagnostics.baselineAttributeVisibilityError, diagnostics.finalAttributeVisibilityError)}; ` +
        `boundary transitions ${change(diagnostics.baselineBoundaryTransitionError, diagnostics.finalBoundaryTransitionError)}; ` +
        `${diagnostics.acceptedPasses}/${diagnostics.evaluatedPasses} passes accepted/evaluated, ${diagnostics.runtimeMs} ms.`;
    }
    if (result.attributeOptimizerId === "zx-mixed-shared-bitmap-v4") {
      const change = (before: number | undefined, after: number | undefined): string =>
        before === undefined || after === undefined || before === 0
          ? "n/a"
          : `${((after - before) / before * 100).toFixed(2)}%`;
      return ` Shared bitmap v4 fixed objective — J ${change(diagnostics.objectiveBaseline, diagnostics.objectiveFinal)}; ` +
        `seeds normal ${diagnostics.normalSeedObjective?.toFixed(4) ?? "n/a"}, halo ${diagnostics.haloSeedObjective?.toFixed(4) ?? "n/a"}; ` +
        `pixel ${change(diagnostics.baselineColorError, diagnostics.finalColorError)}; ` +
        `cell tone ${change(diagnostics.baselineCellError, diagnostics.finalCellError)}; ` +
        `attribute boundaries ${change(diagnostics.baselineBoundaryTransitionError, diagnostics.finalBoundaryTransitionError)}; ` +
        `${diagnostics.acceptedAttributeMoves ?? 0} attribute / ${diagnostics.acceptedBitmapMoves ?? 0} bitmap moves, ` +
        `${diagnostics.candidateCount ?? 0} candidates, ${diagnostics.evaluatedPasses} passes, ${diagnostics.runtimeMs} ms.`;
    }
    const version = result.attributeOptimizerId.startsWith("zx-mixed-shared-bitmap-v2-budget-")
      ? `v2 · +${diagnostics.rgbBudgetPercent}% RGB budget`
      : "v1 legacy objective";
    return ` Shared bitmap ${version} — RGB ${percentChange(diagnostics.baselineRgbError, diagnostics.finalRgbError)}; ` +
      `2×2 ${percentChange(diagnostics.baselineLowPassError, diagnostics.finalLowPassError)}; ` +
      `4×4 ${percentChange(diagnostics.baselineLowPass4Error, diagnostics.finalLowPass4Error)}; ` +
      `attribute seams ${percentChange(diagnostics.baselineBoundaryError, diagnostics.finalBoundaryError)}; ` +
      `source edges ${percentChange(diagnostics.baselineEdgeError, diagnostics.finalEdgeError)}; ` +
      `${diagnostics.acceptedPasses}/${diagnostics.evaluatedPasses} refinement passes accepted/evaluated, ${diagnostics.runtimeMs} ms.`;
  };
  const paletteConversionStatusText = state.kind === "idle" ? image === null
    ? "Import an image to begin."
    : draftState.kind === "scheduled" ? "Draft preview scheduled…"
    : draftState.kind === "running" ? "Running Draft preview…"
    : draftState.kind === "ready" ? `Draft preview current · score ${draftState.result.score.toLocaleString()}.${sharedBitmapDiagnosticsText(draftState.result)}`
    : draftState.kind === "error" ? `Draft failed: ${draftState.message}`
    : "Ready for High conversion."
    : state.kind === "running"
      ? "Running High conversion… The current preview remains visible."
      : state.kind === "ready"
        ? state.result.frames.length > 1
          ? `Completed final · ${state.result.frames.length} × ${state.result.scr.length.toLocaleString()} bytes · ${state.result.width}×${state.result.height} · score ${state.result.score.toLocaleString()}${bitmapEditorResultEdited ? " · metrics pre-edit" : ""}.${sharedBitmapDiagnosticsText(state.result)}`
          : state.result.platformId === "zx-spectrum"
            ? `Completed final · ${state.result.artifact.length.toLocaleString()} / ${zxSoftwareScrBytes(attributeHeight).toLocaleString()} bytes · 8×${attributeHeight} attributes · score ${state.result.score.toLocaleString()}${bitmapEditorResultEdited ? " · metrics pre-edit" : ""}.${sharedBitmapDiagnosticsText(state.result)}`
            : `Completed final · ${state.result.artifact.length.toLocaleString()} bytes · ${state.result.width}×${state.result.height} · score ${state.result.score.toLocaleString()}${bitmapEditorResultEdited ? " · metrics pre-edit" : ""}.`
        : state.kind === "stale"
          ? draftState.kind === "scheduled"
            ? "Draft preview scheduled · prior preview remains visible."
            : draftState.kind === "running"
              ? "Running Draft preview… The prior preview remains visible."
              : draftState.kind === "ready"
                ? "Draft preview current · prior High result is stale and cannot be exported."
                : draftState.kind === "error"
                  ? `Draft failed: ${draftState.message} The prior preview remains visible.`
                  : "Prior High result is stale and cannot be exported."
          : `Failed: ${state.message}`;
  const conversionStatusText = workspaceMode === "tilemap"
    ? state.kind === "running" || charsetState.kind === "running"
      ? "Running Palette High followed by Tilemap High…"
      : charsetState.kind === "error"
        ? `Tilemap failed: ${charsetState.message}`
      : tilemapStale
          ? "Palette source changed · tilemap reconstruction is stale."
          : charsetState.kind === "ready"
            ? specsciiDocumentName !== null && image === null
              ? `Specscii screen loaded · ${charsetState.result.characterCount} characters · ready to edit or export.`
              : `Tilemap High current · ${charsetState.result.characterCount} characters · ${charsetState.result.artifact.length.toLocaleString()} bytes.`
            : image === null
              ? "Import an image to begin."
              : "Ready for Tilemap High conversion."
      : paletteConversionStatusText;

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
  const currentWorkspaceProfileSnapshotKey = workspaceProfileSnapshotKey(currentSavedWorkbenchLayout(""));
  const workspaceProfileDirty = workspaceProfileBaseline !== "" &&
    currentWorkspaceProfileSnapshotKey !== workspaceProfileBaseline;

  useEffect(() => {
    if (workspaceProfileBaseline !== "" && !workspaceProfileBaselinePending) return;
    const storedProfile = workspaceProfileBaselinePending
      ? undefined
      : savedWorkbenchLayouts.find((layout) => layout.id === activeWorkspaceProfileId);
    setWorkspaceProfileBaseline(storedProfile === undefined
      ? currentWorkspaceProfileSnapshotKey
      : workspaceProfileSnapshotKey(storedProfile));
    setWorkspaceProfileBaselinePending(false);
  }, [currentWorkspaceProfileSnapshotKey, workspaceProfileBaseline, workspaceProfileBaselinePending, activeWorkspaceProfileId, savedWorkbenchLayouts]);

  useEffect(() => {
    if (workspaceProfileOptions.some(({ id }) => id === activeWorkspaceProfileId)) return;
    const fallback = workspaceProfileOptions.find(({ kind }) => kind === "builtin") ?? workspaceProfileOptions[0];
    if (fallback?.kind === "builtin" && fallback.layout !== undefined) applyWorkspaceLayout(fallback.layout);
    else if (fallback !== undefined) selectWorkspaceProfile(fallback.id);
  }, [activeWorkspaceProfileId, hiddenBuiltinWorkspaceProfileIds, savedWorkbenchLayouts]);

  const flickerSuppressionEffective = effectiveScreenFlickerSuppression(conversionSettings);
  const flickerSuppressionPolicyMismatch =
    targetModeId !== "mode8-mode4-mixed-512x256" &&
    paletteSelections.length === 2 &&
    !paletteSelectionsMatch(paletteSelections[0]!, paletteSelections[1]!);

  return (
    <>
    <a className="skip-link" href="#workspace-title">Skip to converter</a>
    <main className="shell" id="main-content" style={uiTypographyCssVariables(uiTypography) as CSSProperties}>
      <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{workbenchAnnouncement}</div>
      <WorkbenchMenuBar
        isPmd={isPmd}
        isZx={isZx}
        workspaceMode={workspaceMode}
        onWorkspaceModeChange={switchWorkspaceConversionMode}
        profiles={profiles}
        selectedProfile={selectedProfile}
        selectedProfileId={selectedProfileId}
        selectedPresetId={selectedPresetId}
        targetModeId={targetModeId}
        onProfileChange={selectProfile}
        onPresetChange={selectPreset}
        onTargetModeChange={(mode) => selectHardwareModeFromMenu(mode as TargetModeId)}
        canDeleteSelectedProfile={!BUILT_IN_PROFILES.some((profile) => profile.id === selectedProfile.id)}
        canDeleteImportedProfiles={profiles.length > BUILT_IN_PROFILES.length}
        onDeleteSelectedProfile={deleteSelectedProfile}
        onDeleteImportedProfiles={deleteAllImportedProfiles}
        canConvert={image !== null && settingsValid && state.kind !== "running"}
        conversionRunning={state.kind === "running"}
        onConvert={() => void convertImage()}
        onCancelConvert={cancelHigh}
        canSaveProject={artifactsReady && sourceArtifact !== null && image !== null}
        canExportResult={resultSaveReady}
        canExportMetadata={paletteArtifactsReady && image !== null}
        canExportInspection={resultSaveReady && isZx}
        canExportTilemap={tilemapArtifactsReady}
        onOpenImage={importImage}
        onImportClipboard={() => void importClipboardImage()}
        onOpenPmd={importPmd85}
        onOpenProject={openProject}
        onImportProfile={importProfile}
        onImportSpecscii={importSpecsciiFile}
        onSaveProject={openProjectSaveDialog}
        onExportPreview={exportPreviewPng}
        onExportGif={exportAnimatedFlashGif}
        onExportBinary={exportScr}
        onExportMetadata={() => void exportMetadata()}
        onExportInspection={exportInspectionReport}
        onExportTilemap={exportCharsetArtifact}
        onExportSpecscii={exportSpecsciiFile}
        onExportCharset={exportFinalCharset}
        onExportPaletteSource={exportScr}
        onExportTilemapPreview={exportCharsetPreview}
        onExportTilemapDiagnostics={exportCharsetDiagnostics}
        windowLayouts={workbenchWindowLayouts}
        onWindowVisibilityChange={setWorkbenchWindowVisibility}
        workspaceProfiles={workspaceProfileOptions}
        activeWorkspaceProfileId={activeWorkspaceProfileId}
        workspaceProfileDirty={workspaceProfileDirty}
        onWorkspaceProfileSelect={selectWorkspaceProfile}
        onSaveWorkspaceProfileChanges={saveWorkspaceProfileChanges}
        onSaveWorkspaceProfileAs={saveWorkspaceProfileAs}
        onRenameWorkspaceProfile={renameWorkspaceProfile}
        onDeleteWorkspaceProfile={deleteWorkspaceProfile}
        onRestoreDefaultWorkspaceProfiles={restoreDefaultWorkspaceProfiles}
        onResetArrangement={resetWorkspaceArrangement}
        onOpenSettings={openApplicationSettings}
        onOpenPaletteEditor={() => setZxPaletteEditorOpen(true)}
        onOpenAbout={() => setAboutOpen(true)}
      />

      <AboutDialog
        open={aboutOpen}
        version={APPLICATION_VERSION}
        build={APPLICATION_BUILD_ID}
        releaseDate={APPLICATION_RELEASE_DATE}
        onClose={() => setAboutOpen(false)}
      />

      <section
        ref={workbenchRootRef}
        className={`proof workspace workbench-workspace workbench-settings-${workbenchSettingsDock} workbench-settings-${workbenchSettingsMinimized ? "minimized" : "expanded"}${bitmapEditorActiveSide !== null ? " workbench-bitmap-editor-active" : ""}`}
        data-preview-layout={previewLayout}
        data-left-dock-collapsed={bitmapEditorActiveSide !== null ? "false" : !workbenchHasLeftDock || workbenchLeftWidth <= 0 ? "true" : "false"}
        data-right-dock-collapsed={bitmapEditorActiveSide !== null ? "true" : !workbenchHasRightDock || workbenchRightWidth <= 0 ? "true" : "false"}
        data-bottom-dock-collapsed={bitmapEditorActiveSide !== null ? "true" : !workbenchHasBottomDockWindows || workbenchBottomHeight <= 0 ? "true" : "false"}
        style={{
          "--workbench-side-width": `${workbenchSettingsSideWidth}px`,
          "--workbench-left-dock-width": `${bitmapEditorActiveSide !== null ? Math.max(280, Math.min(360, workbenchLeftWidth || 300)) : workbenchHasLeftDock ? workbenchLeftWidth : 0}px`,
          "--workbench-right-dock-width": `${bitmapEditorActiveSide !== null ? 0 : workbenchHasRightDock ? workbenchRightWidth : 0}px`,
          "--workbench-bottom-height": `${bitmapEditorActiveSide !== null ? 0 : workbenchHasBottomDockWindows ? workbenchBottomHeight : 0}px`,
          "--workbench-floating-x": `${workbenchFloatingX}px`,
          "--workbench-floating-y": `${workbenchFloatingY}px`,
          "--workbench-settings-floating-width": `${workbenchSettingsFloatingWidth}px`,
          "--workbench-settings-floating-height": `${workbenchSettingsFloatingHeight}px`,
          "--workbench-settings-origin-x": "0px",
          "--workbench-settings-origin-y": "0px",
          "--workbench-tools-floating-x": `${workbenchToolsFloatingX}px`,
          "--workbench-tools-floating-y": `${workbenchToolsFloatingY}px`,
          "--workbench-tools-floating-width": `${workbenchToolsFloatingWidth}px`,
          "--workbench-tools-floating-height": `${workbenchToolsFloatingHeight}px`,
          "--workbench-geometry-floating-x": `${workbenchGeometryFloatingX}px`,
          "--workbench-geometry-floating-y": `${workbenchGeometryFloatingY}px`,
          "--workbench-geometry-floating-width": `${workbenchGeometryFloatingWidth}px`,
          "--workbench-geometry-floating-height": `${workbenchGeometryFloatingHeight}px`,
          "--workbench-adjustments-floating-x": `${workbenchAdjustmentsFloatingX}px`,
          "--workbench-adjustments-floating-y": `${workbenchAdjustmentsFloatingY}px`,
          "--workbench-adjustments-floating-width": `${workbenchAdjustmentsFloatingWidth}px`,
          "--workbench-adjustments-floating-height": `${workbenchAdjustmentsFloatingHeight}px`,
          "--workbench-palette-floating-x": `${workbenchPaletteFloatingX}px`,
          "--workbench-palette-floating-y": `${workbenchPaletteFloatingY}px`,
          "--workbench-palette-floating-width": `${workbenchPaletteFloatingWidth}px`,
          "--workbench-palette-floating-height": `${workbenchPaletteFloatingHeight}px`,
          "--workbench-dithering-floating-x": `${workbenchDitheringFloatingX}px`,
          "--workbench-dithering-floating-y": `${workbenchDitheringFloatingY}px`,
          "--workbench-dithering-floating-width": `${workbenchDitheringFloatingWidth}px`,
          "--workbench-dithering-floating-height": `${workbenchDitheringFloatingHeight}px`,
          "--workbench-tilemap-floating-x": `${workbenchTilemapFloatingX}px`,
          "--workbench-tilemap-floating-y": `${workbenchTilemapFloatingY}px`,
          "--workbench-tilemap-floating-width": `${workbenchTilemapFloatingWidth}px`,
          "--workbench-tilemap-floating-height": `${workbenchTilemapFloatingHeight}px`,
          "--workbench-source-floating-x": `${workbenchSourceFloatingX}px`,
          "--workbench-source-floating-y": `${workbenchSourceFloatingY}px`,
          "--workbench-source-floating-width": `${workbenchSourceFloatingWidth}px`,
          "--workbench-source-floating-height": `${workbenchSourceFloatingHeight}px`,
          "--workbench-result-floating-x": `${workbenchResultFloatingX}px`,
          "--workbench-result-floating-y": `${workbenchResultFloatingY}px`,
          "--workbench-result-floating-width": `${workbenchResultFloatingWidth}px`,
          "--workbench-result-floating-height": `${workbenchResultFloatingHeight}px`,
          "--workbench-source-docked-width": `${workbenchSourceDockedWidth}fr`,
          "--workbench-result-docked-width": `${workbenchResultDockedWidth}fr`,
        } as CSSProperties}
        aria-labelledby="workspace-title"
      >
        <div className="workspace-heading">
          <div className="workspace-copy">
            <h2 id="workspace-title">Conversion workspace</h2>
            <p>Choose an image, adjust the compact controls, then convert. Press Enter from a control to run the conversion.</p>
          </div>
          <div
            className="status conversion-status top-conversion-status"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <span className="workspace-input-label">
              {workspaceMode === "tilemap"
                ? "Palette source → Tilemap reconstruction"
                : "Conversion input"}
            </span>
            {sourceFileName === null
              ? null
              : <span className="imported-file-name" title={sourceFileName}>
                  {sourceFileName}
                </span>}
            {sourceArtifact === null ? null : <span className="current-project-name" title={`Project: ${projectName}`}>{projectName}</span>}
            <span>{conversionStatusText}</span>
            <span className="source-format-status">
              {imageStatus}{image === null
                ? ""
                : dirty
                  ? " · Unsaved changes"
                  : " · Completed project saved"}
            </span>
          </div>
          <div className="heading-actions">
            <label className="top-workspace-selector">
              <span>Focus</span>
              <select
                aria-label="Configuration focus"
                value={settingsSection}
                onChange={(event) => focusWorkbenchTarget(event.target.value as WorkbenchFocusTarget)}
              >
                <option value="all">All controls</option>
                <optgroup label="Windows">
                  <option value="tools">Tools</option>
                  <option value="source">Source preview</option>
                  <option value="result">Result preview</option>
                </optgroup>
                <optgroup label="Settings">
                  <option value="geometry">Geometry</option>
                  <option value="adjustments">Image adjustments</option>
                  <option value="palette">Palette controls</option>
                  <option value="dithering">Dithering controls</option>
                  {workspaceMode === "tilemap" ? <option value="tilemap">Tilemap controls</option> : null}
                </optgroup>
              </select>
            </label>
          </div>
        </div>

        <form
          className="conversion-form"
          aria-busy={state.kind === "running" || draftState.kind === "running"}
          onSubmit={(event) => {
            event.preventDefault();
            if (image !== null && settingsValid && state.kind !== "running") {
              void convertImage();
            }
          }}
          onKeyDown={(event) => {
            const target = event.target;
            const editingControl =
              target instanceof HTMLTextAreaElement ||
              target instanceof HTMLInputElement ||
              target instanceof HTMLSelectElement ||
              (target instanceof HTMLElement && target.isContentEditable);
            if (
              event.key === "Enter" &&
              !editingControl &&
              !(target instanceof HTMLButtonElement) &&
              image !== null &&
              settingsValid &&
              state.kind !== "running"
            ) {
              event.preventDefault();
              void convertImage();
            }
          }}
        >
          <div className="controls">

          <div
            className={`workbench-window workbench-settings-window${workbenchSettingsDockEmpty ? " workbench-settings-empty-dock" : ""}`}
            ref={workbenchSettingsWindowRef}
            data-dock={workbenchSettingsDock}
            data-minimized={workbenchSettingsMinimized ? "true" : "false"}
            data-empty={workbenchSettingsDockEmpty ? "true" : "false"}
            style={workbenchSettingsDock === "floating" ? { zIndex: workbenchWindowZIndex("settings") } : undefined}
            onPointerDown={() => bringWorkbenchWindowToFront("settings")}
          >
            <div
              className={`workbench-resize-handle workbench-resize-${workbenchSettingsDock}`}
              role="separator"
              tabIndex={0}
              aria-label={`Resize Conversion settings ${workbenchSettingsDock === "bottom" ? "height" : "width"}`}
              aria-orientation={workbenchSettingsDock === "bottom" ? "horizontal" : "vertical"}
              aria-valuemin={workbenchSettingsDock === "floating" ? 280 : 0}
              aria-valuemax={workbenchSettingsDock === "floating" ? 760 : workbenchSettingsDock === "bottom" ? 480 : 560}
              aria-valuenow={workbenchSettingsDock === "floating" ? workbenchSettingsFloatingHeight : workbenchSettingsDock === "bottom" ? workbenchBottomHeight : workbenchSettingsSideWidth}
              onPointerDown={workbenchSettingsDock === "floating" ? startWorkbenchSettingsFloatingResize : (event) => startWorkbenchResize(workbenchSettingsDock, event)}
              onKeyDown={(event) => {
                if (workbenchSettingsDock === "floating") {
                  const step = event.shiftKey ? 32 : 8;
                  if (event.key === "ArrowLeft") adjustWorkbenchSettingsFloatingSize(-step, 0);
                  if (event.key === "ArrowRight") adjustWorkbenchSettingsFloatingSize(step, 0);
                  if (event.key === "ArrowUp") adjustWorkbenchSettingsFloatingSize(0, -step);
                  if (event.key === "ArrowDown") adjustWorkbenchSettingsFloatingSize(0, step);
                } else if (workbenchSettingsDock === "bottom") {
                  if (event.key === "ArrowUp") adjustWorkbenchSize("bottom", 16);
                  if (event.key === "ArrowDown") adjustWorkbenchSize("bottom", -16);
                } else {
                  if (event.key === "ArrowLeft") adjustWorkbenchSize(workbenchSettingsDock, workbenchSettingsDock === "right" ? 16 : -16);
                  if (event.key === "ArrowRight") adjustWorkbenchSize(workbenchSettingsDock, workbenchSettingsDock === "right" ? -16 : 16);
                }
              }}
            >
              <span className="visually-hidden">Drag to resize</span>
            </div>
            <div
              className="workbench-window-titlebar"
              onPointerDown={(event) => {
                if (workbenchSettingsDock === "floating") startWorkbenchTitlebarDrag("settings", event);
              }}
            >
              <button className="workbench-window-title" type="button" aria-expanded={!workbenchSettingsMinimized} onClick={(event) => {
                if (workbenchSettingsDock === "floating" && workbenchDragMovedRef.current) {
                  preventWorkbenchDragClick(event);
                  return;
                }
                setWorkbenchSettingsMinimized((value) => !value);
              }}>
                <span aria-hidden="true">{workbenchSettingsMinimized ? "▶" : "▼"}</span>
                <span>Conversion settings</span>
              </button>
              {workbenchSettingsDock === "floating" ? (
                <div
                  className="workbench-window-drag-handle"
                  role="button"
                  tabIndex={0}
                  aria-label="Move Conversion settings window"
                  title="Drag to move Conversion settings"
                  onPointerDown={startWorkbenchDrag}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 32 : 8;
                    if (event.key === "ArrowLeft") setWorkbenchFloatingX((x) => Math.max(8, x - step));
                    if (event.key === "ArrowRight") setWorkbenchFloatingX((x) => x + step);
                    if (event.key === "ArrowUp") setWorkbenchFloatingY((y) => Math.max(8, y - step));
                    if (event.key === "ArrowDown") setWorkbenchFloatingY((y) => y + step);
                  }}
                >⠿</div>
              ) : null}
              <div className="workbench-window-actions" aria-label="Conversion settings layout actions">
                <span className="workbench-window-location-menu">
                  <button
                    className="workbench-window-location-button"
                    type="button"
                    aria-label="Change Conversion settings location"
                    title="Change Conversion settings location"
                    aria-haspopup="menu"
                    aria-expanded={workbenchLayoutMenu === "settings"}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleWorkbenchLayoutMenu("settings", event.currentTarget);
                    }}
                  >{workbenchDockIcon(workbenchSettingsDock)}</button>
                  {workbenchLayoutMenu === "settings" ? (
                    workbenchLayoutMenuPosition === null ? null : createPortal(
                      <span
                        className="workbench-window-location-popover"
                        role="menu"
                        aria-label="Conversion settings locations"
                        style={{ left: workbenchLayoutMenuPosition.left, top: workbenchLayoutMenuPosition.top }}
                      >
                        {(["floating", "left", "right", "bottom"] as const).map((dock) => (
                          <button
                            key={dock}
                            type="button"
                            role="menuitemradio"
                            aria-checked={workbenchSettingsDock === dock}
                            className={workbenchSettingsDock === dock ? "active" : undefined}
                            onPointerDown={(event) => event.stopPropagation()}
                            onClick={(event) => {
                              event.preventDefault();
                              event.stopPropagation();
                              setWorkbenchSettingsDock(dock);
                              setWorkbenchLayoutMenu(null);
                              setWorkbenchLayoutMenuPosition(null);
                            }}
                          ><span aria-hidden="true">{workbenchDockIcon(dock)}</span>{workbenchDockLabel(dock)}</button>
                        ))}
                      </span>,
                      document.body,
                      "workbench-location-menu-settings",
                    )
                  ) : null}
                </span>
                <button type="button" aria-label="Reset workbench layout" title="Reset workbench layout" onClick={resetWorkbenchLayout}>↺</button>
              </div>
            </div>
            <div className="workbench-window-content" hidden={workbenchSettingsMinimized && !workbenchHasFloatingSections}>
          {workbenchPortal("geometry", (
          <details
            className={`workbench-settings-section workbench-window${workbenchGeometryFloating ? ` workbench-section-floating workbench-geometry-floating${workbenchGeometryFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : ""}`}
            {...workbenchWindowDragAttributes("geometry")}
            data-workbench-window="geometry"
            hidden={!workbenchWindowLayout("geometry").visible}
            data-dock={workbenchWindowLayout("geometry").dock}
            data-minimized={workbenchWindowLayout("geometry").minimized ? "true" : "false"}
            open={workbenchWindowLayout("geometry").open && !workbenchWindowLayout("geometry").minimized}
            style={workbenchDockWindowStyle("geometry", workbenchGeometryFloating ? { zIndex: workbenchWindowZIndex("geometry") } : undefined)}
            onPointerDown={(event) => {
              if (workbenchGeometryFloating) {
                event.stopPropagation();
                bringWorkbenchWindowToFront("geometry");
              }
            }}
            onFocusCapture={() => {
              if (workbenchGeometryFloating) bringWorkbenchWindowToFront("geometry");
            }}
            onToggle={(event) => setWorkbenchWindowOpen("geometry", event.currentTarget.open)}
          >
            <summary
              onPointerDown={(event) => {
                startWorkbenchTitlebarDrag("geometry", event);
              }}
              onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("geometry", event)}
              onClick={(event) => handleWorkbenchTitlebarClick("geometry", event)}
            >
              <span>Geometry</span>
              {workbenchWindowActions("geometry")}
              {workbenchGeometryFloating ? (
                <span
                  className="workbench-window-drag-handle"
                  role="button"
                  tabIndex={0}
                  aria-label="Move Geometry window"
                  title="Drag to move Geometry"
                  onPointerDown={(event) => startWorkbenchSectionDrag("geometry", event)}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 32 : 8;
                    if (event.key === "ArrowLeft") setWorkbenchGeometryFloatingX((x) => Math.max(8, x - step));
                    if (event.key === "ArrowRight") setWorkbenchGeometryFloatingX((x) => x + step);
                    if (event.key === "ArrowUp") setWorkbenchGeometryFloatingY((y) => Math.max(8, y - step));
                    if (event.key === "ArrowDown") setWorkbenchGeometryFloatingY((y) => y + step);
                  }}
                >⠿</span>
              ) : null}
            </summary>
            {workbenchDockSplitHandle("geometry")}
            {workbenchGeometryFloating ? (
              <div
                className="workbench-floating-resize-handle"
                role="button"
                tabIndex={0}
                aria-label="Resize Geometry window"
                onPointerDown={(event) => startWorkbenchFloatingResize("geometry", event)}
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 32 : 8;
                  if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("geometry", step, 0);
                  if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("geometry", -step, 0);
                  if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("geometry", 0, step);
                  if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("geometry", 0, -step);
                }}
              />
            ) : null}
          <fieldset id="settings-geometry" className={`control-group geometry-group${settingsSection === "geometry" ? " settings-focused" : ""}`}>
            <legend className="visually-hidden">Geometry</legend>
          <div className="geometry-row geometry-primary-row control-row control-row-3">
          <label>
            <span>Framing</span>
            <select aria-label="Framing" value={framing} onChange={(event) => {
              const next = event.target.value as FramingMode;
              if (next === "crop") ensurePixelCrop();
              setFraming(next);
              setState({ kind: "idle" });
            }}>
              <option value="fit">Fit</option>
              <option value="fill">Fill</option>
              <option value="crop">Crop</option>
              <option value="stretch">Stretch</option>
            </select>
          </label>
          <label>
            <span>Resampling</span>
            <select value={resampling} onChange={(event) => { setResampling(event.target.value as ResamplingMethod); setState({ kind: "idle" }); }}>
              <option value="nearest">Nearest-neighbor</option>
              <option value="bilinear">Bilinear</option>
              <option value="lanczos">Lanczos-3</option>
            </select>
          </label>
          <label>
            <span>Rotation</span>
            <select value={rotation} onChange={(event) => {
              const next = Number(event.target.value) as Rotation;
              ensurePixelCrop(next);
              setFillOffsetX(null);
              setFillOffsetY(null);
              setRotation(next);
              setState({ kind: "idle" });
            }}>
              <option value={0}>0°</option>
              <option value={90}>90° clockwise</option>
              <option value={180}>180°</option>
              <option value={270}>270° clockwise</option>
            </select>
          </label>
          </div>
          {framing === "fill" ? (
            <fieldset className="geometry-row framing-detail focal-control control-row control-row-2">
              <legend>Fill crop offset (source pixels)</legend>
              <RangeNumberControl
                id="fill-offset-x"
                label="Horizontal"
                value={fillGeometry?.resolvedOffsetX ?? 0}
                min={0}
                max={fillGeometry?.maximumOffsetX ?? 0}
                unit=" px"
                disabled={fillGeometry?.activeAxis !== "x"}
                onChange={(value) => {
                  setFillOffsetX(value);
                  setState({ kind: "idle" });
                }}
                onValidityChange={setSliderValidity}
              />
              <RangeNumberControl
                id="fill-offset-y"
                label="Vertical"
                value={fillGeometry?.resolvedOffsetY ?? 0}
                min={0}
                max={fillGeometry?.maximumOffsetY ?? 0}
                unit=" px"
                disabled={fillGeometry?.activeAxis !== "y"}
                onChange={(value) => {
                  setFillOffsetY(value);
                  setState({ kind: "idle" });
                }}
                onValidityChange={setSliderValidity}
              />
            </fieldset>
          ) : null}
          {framing === "fit" ? (
            <fieldset className="geometry-row framing-detail fit-position-control control-row control-row-2">
              <legend>Fit position adjustment (output pixels)</legend>
              <RangeNumberControl
                id="fit-position-x"
                label="Horizontal position"
                value={panOffsetX}
                min={-panMaximumX}
                max={panMaximumX}
                unit=" px"
                resetValue={0}
                onChange={(value) => {
                  setPanOffsetX(value);
                  setState({ kind: "idle" });
                }}
                onValidityChange={setSliderValidity}
              />
              <RangeNumberControl
                id="fit-position-y"
                label="Vertical position"
                value={panOffsetY}
                min={-panMaximumY}
                max={panMaximumY}
                unit=" px"
                resetValue={0}
                onChange={(value) => {
                  setPanOffsetY(value);
                  setState({ kind: "idle" });
                }}
                onValidityChange={setSliderValidity}
              />
              <span className="control-help fit-position-help">
                Positive values move the fitted image right or down; negative values move it left or up. Use the arrow pad below for one-pixel steps.
              </span>
            </fieldset>
          ) : null}
          {framing === "crop" ? (
            <fieldset className="geometry-row framing-detail crop-control control-row control-row-5" aria-describedby={cropValid ? "crop-help" : "crop-error"}>
              <legend>Crop rectangle (source pixels)</legend>
              <label className="crop-aspect-control">
                <span>Aspect ratio</span>
                <select
                  aria-label="Crop aspect ratio"
                  value={cropAspectRatio}
                  onChange={(event) => changeCropAspectRatio(event.target.value as CropAspectRatio)}
                  disabled={image === null}
                >
                  <option value="none">No aspect ratio</option>
                  <option value="source">Lock aspect ratio as source image</option>
                  <option value="destination">Lock aspect ratio as destination image</option>
                </select>
              </label>
              <label>
                <span>X</span>
                <input aria-label="Crop X" className={cropValid ? undefined : "invalid"} type="number" min="0" max={Math.max(0, (cropSourceSize?.width ?? 1) - 1)} step="1" value={cropXEntry} aria-invalid={!cropValid} disabled={image === null} onChange={(event) => updateCropEntry("x", event.target.value)} />
              </label>
              <label>
                <span>Y</span>
                <input aria-label="Crop Y" className={cropValid ? undefined : "invalid"} type="number" min="0" max={Math.max(0, (cropSourceSize?.height ?? 1) - 1)} step="1" value={cropYEntry} aria-invalid={!cropValid} disabled={image === null} onChange={(event) => updateCropEntry("y", event.target.value)} />
              </label>
              <label>
                <span>Width</span>
                <input aria-label="Crop width" className={cropValid ? undefined : "invalid"} type="number" min="1" max={cropSourceSize?.width ?? 1} step="1" value={cropWidthEntry} aria-invalid={!cropValid} disabled={image === null} onChange={(event) => updateCropEntry("width", event.target.value)} />
              </label>
              <label>
                <span>Height</span>
                <input aria-label="Crop height" className={cropValid ? undefined : "invalid"} type="number" min="1" max={cropSourceSize?.height ?? 1} step="1" value={cropHeightEntry} aria-invalid={!cropValid} disabled={image === null} onChange={(event) => updateCropEntry("height", event.target.value)} />
              </label>
              <span className="control-help crop-help" id="crop-help">
                Drag on the Source image to select. Drag inside to move; use Arrow keys to move one pixel; double-click inside to clear. Coordinates refer to the oriented source.
              </span>
              <span className="crop-help-icon" title="Drag on the Source image to select. Drag inside to move; use Arrow keys to move one pixel; double-click inside to clear." aria-label="Crop selection help">ⓘ</span>
              {cropValid ? null : <span className="field-error" id="crop-error">Invalid value</span>}
            </fieldset>
          ) : null}
          <div className="geometry-row orientation-actions control-row control-row-4">
            <fieldset className="orientation-control">
              <legend>Mirror</legend>
              <div className="mirror-actions">
                <label className="check-control mirror-toggle" title="Mirror horizontally">
                  <input aria-label="Mirror horizontally" type="checkbox" checked={mirrorHorizontal} onChange={(event) => { setMirrorHorizontal(event.target.checked); setState({ kind: "idle" }); }} />
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <defs>
                      <pattern id="mirror-horizontal-hatch" width="3" height="3" patternTransform="rotate(35)" patternUnits="userSpaceOnUse">
                        <path d="M0 0V3" stroke="currentColor" strokeWidth="1.2" />
                      </pattern>
                    </defs>
                    <path className="mirror-icon-solid" d="M2 20 10.4 4v16Z" />
                    <path className="mirror-icon-hatched" d="M13.6 4 22 20h-8.4Z" />
                    <path className="mirror-icon-axis" d="M12 3v18" />
                  </svg>
                </label>
                <label className="check-control mirror-toggle mirror-toggle-vertical" title="Mirror vertically">
                  <input aria-label="Mirror vertically" type="checkbox" checked={mirrorVertical} onChange={(event) => { setMirrorVertical(event.target.checked); setState({ kind: "idle" }); }} />
                  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <defs>
                      <pattern id="mirror-vertical-hatch" width="3" height="3" patternTransform="rotate(35)" patternUnits="userSpaceOnUse">
                        <path d="M0 0V3" stroke="currentColor" strokeWidth="1.2" />
                      </pattern>
                    </defs>
                    <path className="mirror-icon-solid" d="M3 10.4 12 3l9 7.4Z" />
                    <path className="mirror-icon-hatched" d="m3 13.6 9 7.4 9-7.4Z" />
                    <path className="mirror-icon-axis" d="M2 12h20" />
                  </svg>
                </label>
              </div>
            </fieldset>
            <fieldset className="pan-control">
              <legend>Position</legend>
              <div className="pan-pad" aria-label="Adjust image position by one output pixel">
                <button className="pan-up" type="button" aria-label="Move bitmap up one pixel" title="Move bitmap up one pixel" disabled={panOffsetY <= -panMaximumY} onClick={() => { setPanOffsetY(Math.max(-panMaximumY, panOffsetY - 1)); setState({ kind: "idle" }); }}>▲</button>
                <button className="pan-left" type="button" aria-label="Move bitmap left one pixel" title="Move bitmap left one pixel" disabled={panOffsetX <= -panMaximumX} onClick={() => { setPanOffsetX(Math.max(-panMaximumX, panOffsetX - 1)); setState({ kind: "idle" }); }}>◀</button>
                <button className="pan-center" type="button" aria-label="Center bitmap" title="Center bitmap" disabled={panOffsetX === 0 && panOffsetY === 0} onClick={() => { setPanOffsetX(0); setPanOffsetY(0); setState({ kind: "idle" }); }}>●</button>
                <button className="pan-right" type="button" aria-label="Move bitmap right one pixel" title="Move bitmap right one pixel" disabled={panOffsetX >= panMaximumX} onClick={() => { setPanOffsetX(Math.min(panMaximumX, panOffsetX + 1)); setState({ kind: "idle" }); }}>▶</button>
                <button className="pan-down" type="button" aria-label="Move bitmap down one pixel" title="Move bitmap down one pixel" disabled={panOffsetY >= panMaximumY} onClick={() => { setPanOffsetY(Math.min(panMaximumY, panOffsetY + 1)); setState({ kind: "idle" }); }}>▼</button>
              </div>
            </fieldset>
            <fieldset className="pan-edge-control edge-control">
              <legend>Edges</legend>
              <select aria-label="Pan edge handling" value={panEdgeMode} onChange={(event) => { setPanEdgeMode(event.target.value as PanEdgeMode); setState({ kind: "idle" }); }}>
                <option value="background">Background</option>
                <option value="clamp">Clamp</option>
                <option value="wrap">Wrap</option>
              </select>
            </fieldset>
            <fieldset className="background-control">
              <legend>Background</legend>
              <input className="background-picker" type="color" aria-label="Background color" title="Choose background color; the color dialog supports manual RGB entry" value={rgbToHex(background)} onChange={(event) => { setBackground(hexToRgb(event.target.value)); setState({ kind: "idle" }); }} />
            </fieldset>
          </div>
          </fieldset>
          </details>
          ))}
          {workbenchPortal("adjustments", (
          <details
            className={`workbench-settings-section workbench-window${workbenchAdjustmentsFloating ? ` workbench-section-floating workbench-adjustments-floating${workbenchAdjustmentsFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : ""}`}
            {...workbenchWindowDragAttributes("adjustments")}
            data-workbench-window="adjustments"
            hidden={!workbenchWindowLayout("adjustments").visible}
            data-dock={workbenchWindowLayout("adjustments").dock}
            data-minimized={workbenchWindowLayout("adjustments").minimized ? "true" : "false"}
            open={workbenchWindowLayout("adjustments").open && !workbenchWindowLayout("adjustments").minimized}
            style={workbenchDockWindowStyle("adjustments", workbenchAdjustmentsFloating ? { zIndex: workbenchWindowZIndex("adjustments") } : undefined)}
            onPointerDown={(event) => {
              if (workbenchAdjustmentsFloating) {
                event.stopPropagation();
                bringWorkbenchWindowToFront("adjustments");
              }
            }}
            onFocusCapture={() => {
              if (workbenchAdjustmentsFloating) bringWorkbenchWindowToFront("adjustments");
            }}
            onToggle={(event) => setWorkbenchWindowOpen("adjustments", event.currentTarget.open)}
          >
            <summary
              onPointerDown={(event) => {
                startWorkbenchTitlebarDrag("adjustments", event);
              }}
              onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("adjustments", event)}
              onClick={(event) => handleWorkbenchTitlebarClick("adjustments", event)}
            >
              <span>Image adjustments</span>
              {workbenchWindowActions("adjustments")}
              {workbenchAdjustmentsFloating ? (
                <span
                  className="workbench-window-drag-handle"
                  role="button"
                  tabIndex={0}
                  aria-label="Move Image adjustments window"
                  title="Drag to move Image adjustments"
                  onPointerDown={(event) => startWorkbenchSectionDrag("adjustments", event)}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 32 : 8;
                    if (event.key === "ArrowLeft") setWorkbenchAdjustmentsFloatingX((x) => Math.max(8, x - step));
                    if (event.key === "ArrowRight") setWorkbenchAdjustmentsFloatingX((x) => x + step);
                    if (event.key === "ArrowUp") setWorkbenchAdjustmentsFloatingY((y) => Math.max(8, y - step));
                    if (event.key === "ArrowDown") setWorkbenchAdjustmentsFloatingY((y) => y + step);
                  }}
                >⠿</span>
              ) : null}
            </summary>
            {workbenchDockSplitHandle("adjustments")}
            {workbenchAdjustmentsFloating ? (
              <div
                className="workbench-floating-resize-handle"
                role="button"
                tabIndex={0}
                aria-label="Resize Image adjustments window"
                onPointerDown={(event) => startWorkbenchFloatingResize("adjustments", event)}
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 32 : 8;
                  if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("adjustments", step, 0);
                  if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("adjustments", -step, 0);
                  if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("adjustments", 0, step);
                  if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("adjustments", 0, -step);
                }}
              />
            ) : null}
          <fieldset id="settings-adjustments" className={`adjustment-control control-group${settingsSection === "adjustments" ? " settings-focused" : ""}`}>
            <legend className="visually-hidden">Image adjustments</legend>
            <div className="control-row control-row-2">
            <RangeNumberControl id="brightness" label="Brightness" value={brightness} min={-100} max={100} resetValue={0} onChange={(value) => { setBrightness(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            <RangeNumberControl id="contrast" label="Contrast" value={contrast} min={-100} max={100} resetValue={0} onChange={(value) => { setContrast(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            </div>
            <div className="control-row control-row-2">
            <RangeNumberControl id="gamma" label="Gamma" value={gamma} min={10} max={300} unit="%" resetValue={100} onChange={(value) => { setGamma(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            </div>
            <div className="control-row control-row-2">
            <RangeNumberControl id="hue-shift" label="Hue" value={hueShift} min={-180} max={180} unit="°" resetValue={0} onChange={(value) => { setHueShift(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            <RangeNumberControl id="hsl-saturation" label="Saturation" value={hslSaturation} min={-100} max={100} resetValue={0} onChange={(value) => { setHslSaturation(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            </div>
            <div className="control-row control-row-2">
            <RangeNumberControl id="lightness" label="HSL Lightness" value={lightness} min={-100} max={100} resetValue={0} onChange={(value) => { setLightness(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            <label className="check-control"><input id="colorize" type="checkbox" checked={colorize} onChange={(event) => { setColorize(event.target.checked); setState({ kind: "idle" }); }} /><span>Colorize</span></label>
            </div>
            <div className="control-row control-row-2">
            <RangeNumberControl id="smoothing" label="Smoothing" value={smoothing} min={0} max={100} unit="%" resetValue={0} onChange={(value) => { setSmoothing(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            <RangeNumberControl id="sharpening" label="Sharpening" value={sharpening} min={0} max={100} unit="%" resetValue={0} onChange={(value) => { setSharpening(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            </div>
            <div className="control-row control-row-2">
            </div>
            <button className="secondary compact" type="button" onClick={() => {
              setBrightness(0);
              setContrast(0);
              setSaturation(0);
              setHueShift(0);
              setHslSaturation(0);
              setLightness(0);
              setColorize(false);
              setGamma(100);
              setSmoothing(0);
              setSharpening(0);
              setState({ kind: "idle" });
            }}>Reset adjustments</button>
          </fieldset>
          </details>
          ))}
          {workspaceMode === "palette" ? (
          <>
          {workbenchPortal("palette", (
          <details
            className={`workbench-settings-section workbench-window${workbenchPaletteFloating ? ` workbench-section-floating workbench-palette-floating${workbenchPaletteFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : ""}`}
            {...workbenchWindowDragAttributes("palette")}
            data-workbench-window="palette"
            hidden={!workbenchWindowLayout("palette").visible}
            data-dock={workbenchWindowLayout("palette").dock}
            data-minimized={workbenchWindowLayout("palette").minimized ? "true" : "false"}
            open={workbenchWindowLayout("palette").open && !workbenchWindowLayout("palette").minimized}
            style={workbenchDockWindowStyle("palette", workbenchPaletteFloating ? { zIndex: workbenchWindowZIndex("palette") } : undefined)}
            onPointerDown={(event) => {
              if (workbenchPaletteFloating) {
                event.stopPropagation();
                bringWorkbenchWindowToFront("palette");
              }
            }}
            onFocusCapture={() => {
              if (workbenchPaletteFloating) bringWorkbenchWindowToFront("palette");
            }}
            onToggle={(event) => setWorkbenchWindowOpen("palette", event.currentTarget.open)}
          >
            <summary
              onPointerDown={(event) => startWorkbenchTitlebarDrag("palette", event)}
              onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("palette", event)}
            onClick={(event) => handleWorkbenchTitlebarClick("palette", event)}
            >
              <span>{isQl ? "QL palette" : isPmd ? "PMD 85 palette" : "ZX palette and attributes"}</span>
              {workbenchWindowActions("palette")}
              {workbenchPaletteFloating ? (
                <span
                  className="workbench-window-drag-handle"
                  role="button"
                  tabIndex={0}
                  aria-label="Move Palette window"
                  title="Drag to move Palette"
                  onPointerDown={(event) => startWorkbenchSectionDrag("palette", event)}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 32 : 8;
                    if (event.key === "ArrowLeft") setWorkbenchPaletteFloatingX((x) => Math.max(8, x - step));
                    if (event.key === "ArrowRight") setWorkbenchPaletteFloatingX((x) => x + step);
                    if (event.key === "ArrowUp") setWorkbenchPaletteFloatingY((y) => Math.max(8, y - step));
                    if (event.key === "ArrowDown") setWorkbenchPaletteFloatingY((y) => y + step);
                  }}
                >⠿</span>
              ) : null}
            </summary>
            {workbenchDockSplitHandle("palette")}
            {workbenchPaletteFloating ? (
              <div
                className="workbench-floating-resize-handle"
                role="button"
                tabIndex={0}
                aria-label="Resize Palette window"
                onPointerDown={(event) => startWorkbenchFloatingResize("palette", event)}
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 32 : 8;
                  if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("palette", step, 0);
                  if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("palette", -step, 0);
                  if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("palette", 0, step);
                  if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("palette", 0, -step);
                }}
              />
            ) : null}
          <fieldset id="settings-palette" className={`control-group palette-group${settingsSection === "palette" ? " settings-focused" : ""}`}>
            <legend className="visually-hidden">{isQl ? "QL palette" : isPmd ? "PMD 85 palette" : "ZX palette and attributes"}</legend>
            <div className="palette-attributes-grid">
            <section className="palette-subcard" aria-labelledby="palette-subcard-title">
              <h3 id="palette-subcard-title">Palette</h3>
              <p className="subcard-help">Select the colors available to each output screen.</p>
              <div className="palette-screen-grid">
                {paletteSelections.map((selection) => (
                  <section
                    className="palette-screen"
                    data-color-count={(effectivePaletteOptionsByScreen[selection.screenIndex] ??
                      effectivePaletteOptionsByScreen[0] ?? []).length}
                    key={selection.screenIndex}
                  >
                    <div className="palette-screen-heading">
                      <strong>Screen {selection.screenIndex + 1}</strong>
                      <span>{selection.enabledColorIds.length} selected</span>
                    </div>
                    {isZx ? (
                      <fieldset className="bright-control">
                        <legend>BRIGHT</legend>
                        <div className="segmented-control compact-segmented" role="radiogroup" aria-label={`Screen ${selection.screenIndex + 1} BRIGHT policy`}>
                          {(["auto", "on", "off"] as const).map((mode) => (
                            <label className="segmented-option" key={mode}>
                              <input
                                type="radio"
                                name={`screen-${selection.screenIndex}-bright`}
                                value={mode}
                                checked={(selection.brightMode ?? "auto") === mode}
                                onChange={() => setPaletteBrightMode(selection.screenIndex, mode)}
                              />
                              <span>{mode === "auto" ? "Auto" : mode === "on" ? "On" : "Off"}</span>
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ) : null}
                    <div
                      className="palette-options"
                      role="group"
                      aria-label={`Screen ${selection.screenIndex + 1} available colors`}
                    >
                      {(effectivePaletteOptionsByScreen[selection.screenIndex] ??
                        effectivePaletteOptionsByScreen[0] ??
                        []).map((option) => {
                          const selected = selection.enabledColorIds.includes(option.code);
                          return (
                            <button
                              className={`palette-option${selected ? " selected" : ""}`}
                              type="button"
                              key={option.code}
                              aria-label={`${selected ? "Remove" : "Add"} ${option.name} (${option.code}) from Screen ${selection.screenIndex + 1}`}
                              aria-pressed={selected}
                              title={`${option.name} (${option.code})`}
                              onClick={() => togglePaletteColor(selection.screenIndex, option.code)}
                            >
                              <span
                                className="palette-swatch"
                                style={{
                                  background: isZx && selection.brightMode === "auto"
                                    ? `linear-gradient(90deg, ${option.normal} 0 50%, ${option.bright} 50% 100%)`
                                    : isZx && selection.brightMode === "on"
                                      ? option.bright
                                      : option.normal,
                                }}
                                aria-hidden="true"
                              />
                            </button>
                          );
                        })}
                    </div>
                  </section>
                ))}
              </div>
              {paletteValid ? null : (
                <span className="field-error" id="palette-error">
                  Select at least one color for every screen.
                </span>
              )}
            </section>
            <section className={`attributes-subcard${isPmd ? " pmd-attributes-subcard" : ""}`} aria-labelledby="attributes-subcard-title">
              <h3 id="attributes-subcard-title">Attributes</h3>
            {targetModeId.includes("vertical-spatial") ? (
              <label className="check-control" title="Allow the optimizer to exchange the upper and lower physical rows in each mixed cell.">
                <input
                  type="checkbox"
                  checked={verticalSpatialSwapRows}
                  onChange={(event) => {
                    setVerticalSpatialSwapRows(event.target.checked);
                    setState({ kind: "idle" });
                  }}
                />
                <span>Swap physical row order</span>
              </label>
            ) : null}
          {isZx ? (
          <>
          <fieldset className="attribute-size-control">
            <legend>Size</legend>
            <div className="segmented-control attribute-size-options" role="radiogroup" aria-label="Attribute size">
              {([8, 4, 2, 1] as const).map((height) => (
                <label className="segmented-option" key={height}>
                  <input
                    type="radio"
                    name="attribute-size"
                    value={height}
                    checked={attributeHeight === height}
                    onChange={() => {
                      setAttributeHeight(height as AttributeHeight);
                      if (height < 4) setAttributeHaloVertical(0);
                      setState({ kind: "idle" });
                    }}
                  />
                  <span>8×{height}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <RangeNumberControl
            id="attribute-smoothing"
            label={attributeOptimizerId === "zx-guide-reference-halo-v2" ||
                attributeOptimizerId === "zx-guide-reference-rgb-halo-v3"
              ? "Halo influence"
              : "Attribute smoothing"}
            value={attributeOptimizerId === "zx-guide-reference-halo-v2" ||
                attributeOptimizerId === "zx-guide-reference-rgb-halo-v3"
              ? attributeHaloInfluence
              : attributeSmoothing}
            min={0}
            max={attributeOptimizerId === "zx-guide-reference-halo-v2" ||
                attributeOptimizerId === "zx-guide-reference-rgb-halo-v3"
              ? 400
              : 100}
            unit="%"
            disabled={dithering === "none"}
            onChange={(value) => {
              if (
                attributeOptimizerId === "zx-guide-reference-halo-v2" ||
                attributeOptimizerId === "zx-guide-reference-rgb-halo-v3"
              ) {
                setAttributeHaloInfluence(value);
              } else {
                setAttributeSmoothing(value);
              }
              setState({ kind: "idle" });
            }}
            onValidityChange={setSliderValidity}
          />
          <span className="control-help">
            Edge-aware pair selection for Ordered and Error diffusion.
          </span>
          <fieldset className="halo-controls">
            <legend>Attribute halo</legend>
            <fieldset className="halo-control">
              <legend>Horizontal</legend>
              <div className="segmented-control halo-options" role="radiogroup" aria-label="Horizontal halo">
                {([0, 1, 2] as const).map((radius) => (
                  <label className="segmented-option" key={radius}>
                    <input
                      type="radio"
                      name="horizontal-halo"
                      value={radius}
                      aria-label={`${radius} pixel${radius === 1 ? "" : "s"}`}
                      checked={attributeHaloHorizontal === radius}
                      disabled={dithering === "none"}
                      onChange={() => {
                        setAttributeHaloHorizontal(radius as AttributeHaloRadius);
                        setState({ kind: "idle" });
                      }}
                    />
                    <span>{radius}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="halo-control">
              <legend>Vertical</legend>
              <div className="segmented-control halo-options" role="radiogroup" aria-label="Vertical halo">
                {([0, 1, 2] as const).map((radius) => (
                  <label className="segmented-option" key={radius}>
                    <input
                      type="radio"
                      name="vertical-halo"
                      value={radius}
                      aria-label={`${radius} pixel${radius === 1 ? "" : "s"}`}
                      checked={(attributeHeight >= 4 ? attributeHaloVertical : 0) === radius}
                      disabled={dithering === "none" || attributeHeight < 4}
                      onChange={() => {
                        setAttributeHaloVertical(radius as AttributeHaloRadius);
                        setState({ kind: "idle" });
                      }}
                    />
                    <span>{radius}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </fieldset>
          </>
          ) : isPmd ? (
            <>
              <span className="control-help">
                Black is fixed. Each {targetModeId === "pmd85-colorace" ? "6×2" : "6×1"} hardware cell selects black plus one enabled foreground.
              </span>
              {image?.format === "pmd85-bin" ? (
                <label className="check-control">
                  <input
                    type="checkbox"
                    checked={pmd85GapPolicy === "zero"}
                    onChange={(event) => {
                      setPmd85GapPolicy(event.target.checked ? "zero" : "preserve-imported");
                      setState({ kind: "idle" });
                    }}
                  />
                  <span>Sanitize gaps (zero-fill on reconversion)</span>
                </label>
              ) : null}
            </>
          ) : null}
          {targetModeId === "zx48-mixed-256x192" ||
          targetModeId === "mode8-256x256" ||
          targetModeId === "mode4-512x256" ||
          targetModeId === "mode8-mode4-mixed-512x256" ? (
            <label>
              <span>Screen flicker suppression</span>
              <span>
                <input
                  type="checkbox"
                  checked={flickerSuppressionEffective === true}
                  disabled={paletteSelections.length !== 2 ||
                    (
                      targetModeId !== "mode8-mode4-mixed-512x256" &&
                      !paletteSelectionsMatch(paletteSelections[0]!, paletteSelections[1]!)
                    )}
                  onChange={(event) => {
                    setScreenFlickerSuppression(event.target.checked);
                    setState({ kind: "idle" });
                  }}
                />
                <span className="control-help">
                  {flickerSuppressionPolicyMismatch
                    ? `${screenFlickerSuppression ? "Requested suppression is inactive. " : ""}Different screen palette/BRIGHT policies affect the 50/50 Merged preview and prevent flicker suppression.`
                    : targetModeId === "mode8-mode4-mixed-512x256"
                    ? "Adapt the left/right Mode 4 pair order across stable regions."
                    : paletteSelections.length === 2 &&
                    paletteSelectionsMatch(paletteSelections[0]!, paletteSelections[1]!)
                    ? isQl
                      ? "Swap temporal endpoints at pixel level."
                      : "Swap temporal endpoints only between complete attribute cells."
                    : "Available only when both screen palettes and BRIGHT policies match."}
                </span>
              </span>
            </label>
          ) : null}
          {isZx && targetModeId === "zx48-mixed-256x192" ? (
            <label>
              <span>Mix attributes only</span>
              <span>
                <input
                  type="checkbox"
                  checked={zxMixedAttributesOnly}
                  onChange={(event) => {
                    setZxMixedAttributesOnly(event.target.checked);
                    setState({ kind: "idle" });
                  }}
                />
                <span className="control-help">
                  Shares bitmap pixels while optimizing INK, PAPER, and BRIGHT attributes independently. Merged shows their 50/50 RGB average, which may include colors neither screen displays alone.
                </span>
              </span>
            </label>
          ) : null}
          {isPmd ? (
            <label className="pmd-palette-calibration">
              <span>Palette calibration</span>
              <select
                value={pmd85PaletteCalibrationId}
                onChange={(event) => void changePmd85Calibration(event.target.value)}
              >
                {selectedModePalette?.base_calibration_id === undefined ? null : (
                  <option value={selectedModePalette.base_calibration_id}>
                    {selectedModePalette.base_calibration_id === "pure-rgb"
                      ? "Pure RGB"
                      : selectedModePalette.base_calibration_id === "neutral-white"
                        ? "Neutral white/silver"
                        : "Emulator-soft"}
                  </option>
                )}
                {selectedModePalette?.calibrations?.map((calibration) => (
                  <option key={calibration.id} value={calibration.id}>{calibration.name}</option>
                ))}
              </select>
            </label>
          ) : null}
            </section>
            </div>
          </fieldset>
          </details>
          ))}
          {workbenchPortal("dithering", (
          <details
            className={`workbench-settings-section workbench-window${workbenchDitheringFloating ? ` workbench-section-floating workbench-dithering-floating${workbenchDitheringFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : ""}`}
            {...workbenchWindowDragAttributes("dithering")}
            data-workbench-window="dithering"
            hidden={!workbenchWindowLayout("dithering").visible}
            data-dock={workbenchWindowLayout("dithering").dock}
            data-minimized={workbenchWindowLayout("dithering").minimized ? "true" : "false"}
            open={workbenchWindowLayout("dithering").open && !workbenchWindowLayout("dithering").minimized}
            style={workbenchDockWindowStyle("dithering", workbenchDitheringFloating ? { zIndex: workbenchWindowZIndex("dithering") } : undefined)}
            onPointerDown={(event) => {
              if (workbenchDitheringFloating) {
                event.stopPropagation();
                bringWorkbenchWindowToFront("dithering");
              }
            }}
            onFocusCapture={() => {
              if (workbenchDitheringFloating) bringWorkbenchWindowToFront("dithering");
            }}
            onToggle={(event) => setWorkbenchWindowOpen("dithering", event.currentTarget.open)}
          >
            <summary
            onPointerDown={(event) => {
              startWorkbenchTitlebarDrag("dithering", event);
            }}
            onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("dithering", event)}
            onClick={(event) => handleWorkbenchTitlebarClick("dithering", event)}
            >
              <span>Dithering</span>
              {workbenchWindowActions("dithering")}
              {workbenchDitheringFloating ? (
                <span
                  className="workbench-window-drag-handle"
                  role="button"
                  tabIndex={0}
                  aria-label="Move Dithering window"
                  title="Drag to move Dithering"
                  onPointerDown={(event) => startWorkbenchSectionDrag("dithering", event)}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 32 : 8;
                    if (event.key === "ArrowLeft") setWorkbenchDitheringFloatingX((x) => Math.max(8, x - step));
                    if (event.key === "ArrowRight") setWorkbenchDitheringFloatingX((x) => x + step);
                    if (event.key === "ArrowUp") setWorkbenchDitheringFloatingY((y) => Math.max(8, y - step));
                    if (event.key === "ArrowDown") setWorkbenchDitheringFloatingY((y) => y + step);
                  }}
                >⠿</span>
              ) : null}
            </summary>
            {workbenchDockSplitHandle("dithering")}
            {workbenchDitheringFloating ? (
              <div
                className="workbench-floating-resize-handle"
                role="button"
                tabIndex={0}
                aria-label="Resize Dithering window"
                onPointerDown={(event) => startWorkbenchFloatingResize("dithering", event)}
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 32 : 8;
                  if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("dithering", step, 0);
                  if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("dithering", -step, 0);
                  if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("dithering", 0, step);
                  if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("dithering", 0, -step);
                }}
              />
            ) : null}
          <fieldset id="settings-dithering" className={`control-group dithering-group${settingsSection === "dithering" ? " settings-focused" : ""}`}>
            <legend className="visually-hidden">Dithering</legend>
          <details className="engine-controls dithering-wide">
            <summary>Advanced conversion engines</summary>
            {isZx ? (
              <label>
                <span>Attribute optimizer</span>
                <select
                  value={attributeOptimizerId}
                  onChange={(event) => {
                    const id = event.target.value as AttributeOptimizerId;
                    setAttributeOptimizerId(id);
                    if (id === "zx-block-dbs-global-v1") {
                      setDitherEngineId("pattern-legal-mask-dbs-v1");
                      setDithering("ordered");
                    } else if (
                      id === "zx-structured-global-v1" ||
                      id === "zx-structured-global-v2" ||
                      id === "zx-structured-global-v3" ||
                      id === "zx-structured-global-v4"
                    ) {
                      const isVersion4 = id === "zx-structured-global-v4";
                      const isVersion3 = id === "zx-structured-global-v3";
                      const isVersion2 = id === "zx-structured-global-v2";
                      setDitherEngineId(
                        isVersion4
                          ? "ordered-cell-pattern-v4"
                          : isVersion3
                          ? "ordered-cell-pattern-v3"
                          : isVersion2
                            ? "ordered-cell-pattern-v2"
                            : "ordered-cell-pattern-v1",
                      );
                      setDithering("ordered");
                      setStructuredSettings((current) => ({
                        ...current,
                        ditherResponseCurveId: isVersion2 || isVersion3 || isVersion4
                          ? "power-035-percent-v2"
                          : "power-065-percent-v1",
                        colorAnchorModelId: isVersion3 || isVersion4
                          ? "srgb-squared-v1"
                          : "none-v1",
                        structuralModelId: isVersion4
                          ? "palette-topology-v1"
                          : "none-v1",
                        objectiveWeights: isVersion4
                          ? {
                              ...current.objectiveWeights,
                              pixel: 192,
                              rgbAnchor: 2048,
                              patternReference: 1536,
                              paletteDistribution: 1024,
                              luminanceRank: 512,
                              edgePolarity: 768,
                              mean: 768,
                              sharedEndpoint: 0,
                            }
                          : isVersion2 || isVersion3
                          ? {
                              ...current.objectiveWeights,
                              pixel: 192,
                              rgbAnchor: isVersion3 ? 6144 : 0,
                              patternReference: 0,
                              paletteDistribution: 0,
                              luminanceRank: 0,
                              edgePolarity: 0,
                              mean: 2048,
                            }
                          : {
                              ...current.objectiveWeights,
                              pixel: 1024,
                              rgbAnchor: 0,
                              patternReference: 0,
                              paletteDistribution: 0,
                              luminanceRank: 0,
                              edgePolarity: 0,
                              mean: 256,
                            },
                        candidateParameters: {
                          ...current.candidateParameters,
                          localAdmissibilityPermille: isVersion4 ? 100 : 1000,
                          boundaryCapPermille: isVersion4 ? 100 : 1000,
                        },
                      }));
                    } else if (
                      ditherEngineId === "ordered-cell-pattern-v1" ||
                      ditherEngineId === "ordered-cell-pattern-v2" ||
                      ditherEngineId === "ordered-cell-pattern-v3" ||
                      ditherEngineId === "ordered-cell-pattern-v4" ||
                      ditherEngineId === "pattern-legal-mask-dbs-v1"
                    ) {
                      setDitherEngineId(latestDitherEngineForMethod(dithering));
                    }
                    setState({ kind: "idle" });
                  }}
                >
                  {(() => {
                    const compatible = ATTRIBUTE_OPTIMIZERS.filter((engine) =>
                      isAttributeOptimizerAvailableForTarget("zx-spectrum", targetModeId, engine.id) &&
                      (targetModeId !== "zx48-mixed-256x192" || !("family" in engine)) &&
                      DITHER_ENGINES.some((ditherEngine) =>
                        isDitherEngineAvailableForSelection(
                          "zx-spectrum",
                          targetModeId,
                          engine.id,
                          ditherEngine.id,
                        ),
                      )
                    );
                    const recommended = new Set<AttributeOptimizerId>([
                      "zx-source-cell-v1", "zx-guide-reference-halo-v1",
                    ]);
                    return <>
                      <optgroup label="Recommended">
                        {compatible.filter((engine) => recommended.has(engine.id)).map((engine) =>
                          <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                      </optgroup>
                      <optgroup label="Alternatives and historical engines">
                        {compatible.filter((engine) =>
                          !recommended.has(engine.id) && engine.lifecycle !== "experimental"
                        ).map((engine) =>
                          <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                      </optgroup>
                      <optgroup label="Experimental engines">
                        {compatible.filter((engine) => engine.lifecycle === "experimental").map((engine) =>
                          <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                      </optgroup>
                    </>;
                  })()}
                </select>
              </label>
            ) : null}
          </details>
          {isQl && targetModeId === "mode8-mode4-mixed-512x256" ? (
            <label className="dithering-wide">
              <span>Mixed optimizer</span>
              <select
                value={qlMixedOptimizerId}
                onChange={(event) => {
                  setQlMixedOptimizerId(
                    event.target.value as QlMixedOptimizerId,
                  );
                  setState({ kind: "idle" });
                }}
              >
                <option value="ql-mixed-average-v1">Average v1 · legacy</option>
                <option value="ql-mixed-low-perception-v2">Low perception v2</option>
                <option value="ql-mixed-high-detail-v2">High detail v2</option>
                <option value="ql-mixed-balanced-v2">Balanced v2 · default</option>
              </select>
            </label>
          ) : null}
          <fieldset className="dithering-method-control dithering-wide">
            <legend>Dithering method</legend>
            <div className="segmented-control" role="radiogroup" aria-label="Dithering method">
              {([
                ["none", "No dithering"],
                ["ordered", "Ordered"],
                ["error-diffusion", "Error diffusion"],
              ] as const).map(([value, label]) => (
                <label className="segmented-option" key={value}>
                  <input
                    type="radio"
                    name="dithering-method"
                    value={value}
                    checked={dithering === value}
                    onChange={() => switchDithering(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {dithering === "error-diffusion" ? (
            <label className="dithering-wide">
              <span>Dither algorithm</span>
              <select
                value={ditherEngineId}
                onChange={(event) => selectDitherEngine(event.target.value as DitherEngineId)}
              >
                {(() => {
                  const compatible = DITHER_ENGINES.filter((engine) =>
                    engine.method === "error-diffusion" &&
                    isDitherEngineAvailableForSelection(
                      selectedPlatformId,
                      targetModeId,
                      attributeOptimizerId,
                      engine.id,
                    )
                  );
                  const recommended = new Set<DitherEngineId>([
                    "error-diffusion-decorrelated-v3",
                    "error-diffusion-atkinson-v1",
                    "error-diffusion-checker-artistic-v1",
                  ]);
                  return <>
                    <optgroup label="Recommended">
                      {compatible.filter((engine) => recommended.has(engine.id)).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                    <optgroup label="Alternatives and historical engines">
                      {compatible.filter((engine) =>
                        !recommended.has(engine.id) &&
                        ditherEngineSelectionGroupForTarget(engine.id, targetModeId) !== "to-be-hidden" &&
                        engine.lifecycle !== "experimental"
                      ).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                    <optgroup label="Experimental engines">
                      {compatible.filter((engine) =>
                        !recommended.has(engine.id) &&
                        ditherEngineSelectionGroupForTarget(engine.id, targetModeId) !== "to-be-hidden" &&
                        engine.lifecycle === "experimental"
                      ).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                    <optgroup label="To be hidden">
                      {compatible.filter((engine) =>
                        ditherEngineSelectionGroupForTarget(engine.id, targetModeId) === "to-be-hidden"
                      ).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                  </>;
                })()}
              </select>
            </label>
          ) : null}
          {dithering !== "none" && dithering !== "error-diffusion" ? (
            <label className="dithering-wide">
              <span>Dither engine</span>
              <select
                value={ditherEngineId}
                onChange={(event) => selectDitherEngine(event.target.value as DitherEngineId)}
                title={DITHER_ENGINES.find((engine) => engine.id === ditherEngineId)?.name}
              >
                {(() => {
                  const compatible = DITHER_ENGINES.filter((engine) =>
                    engine.method === "ordered" &&
                    engine.platforms.includes(selectedPlatformId as never) &&
                    (selectedPlatformId === "sinclair-ql" ||
                      isCompatibleEnginePair(attributeOptimizerId, engine.id)) &&
                    (engine.targetModeIds === undefined || engine.targetModeIds.includes(targetModeId)) &&
                    (targetModeId !== "zx48-mixed-256x192" || !("family" in engine))
                  );
                  const recommended = new Set<DitherEngineId>([
                    "ordered-strict-matrix-v6",
                    "ordered-mixed-phase-stable-v8",
                  ]);
                  return <>
                    <optgroup label="Recommended">
                      {compatible.filter((engine) => recommended.has(engine.id)).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                    <optgroup label="Alternatives and historical engines">
                      {compatible.filter((engine) =>
                        !recommended.has(engine.id) &&
                        ditherEngineSelectionGroupForTarget(engine.id, targetModeId) !== "to-be-hidden" &&
                        engine.lifecycle !== "experimental"
                      ).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                    <optgroup label="Experimental engines">
                      {compatible.filter((engine) =>
                        ditherEngineSelectionGroupForTarget(engine.id, targetModeId) !== "to-be-hidden" &&
                        engine.lifecycle === "experimental"
                      ).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                    <optgroup label="To be hidden">
                      {compatible.filter((engine) =>
                        ditherEngineSelectionGroupForTarget(engine.id, targetModeId) === "to-be-hidden"
                      ).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                  </>;
                })()}
              </select>
            </label>
          ) : null}
          {(ditherEngineId === "artistic-ordered-hybrid-v1" ||
            ditherEngineId === "artistic-ordered-tone-safe-v2" ||
            ditherEngineId === "artistic-chessboard-smooth-v1") ? (
            <label>
              <span>Pattern preference</span>
              <select value={artisticPattern} onChange={(event) => { setArtisticPattern(event.target.value as NonNullable<ConversionSettings["artisticPattern"]>); setState({ kind: "idle" }); }}>
                <option value="auto">Auto</option>
                <option value="checkerboard">Checkerboard</option>
                <option value="horizontal">Horizontal</option>
                <option value="vertical">Vertical</option>
              </select>
              {attributeHeight === 1 ? <small>8×1 cells use row-local alternating motifs.</small> : null}
            </label>
          ) : null}
          {dithering === "ordered" &&
            ditherEngineId !== "artistic-ordered-hybrid-v1" &&
            ditherEngineId !== "artistic-ordered-tone-safe-v2" ? (
            <label>
              <span>Ordered matrix</span>
              <select value={orderedMatrix} onChange={(event) => {
                const nextMatrix = event.target.value as OrderedMatrixId;
                setOrderedMatrix(nextMatrix);
                syncMatrixEditorFromSelection(nextMatrix);
                setState({ kind: "idle" });
              }}>
                {(DITHER_ENGINES.find((engine) => engine.id === ditherEngineId)?.orderedMatrixIds ??
                  ORDERED_MATRIX_IDS.slice(0, 4)).map((matrixId) => (
                  <option key={matrixId} value={matrixId}>{orderedMatrixLabel(matrixId)}</option>
                ))}
              </select>
            </label>
          ) : null}
          {ditherEngineId === "dither-composer-v1" ? (
            <div className="dithering-composer-grid" aria-label="Dither composer settings">
              <div className="control-row control-row-2">
              <label>
                <span className="dithering-composer-one-line-label">Dithering · Composer&nbsp;pattern</span>
                <select
                  value={composer.patternId}
                  onChange={(event) => {
                    const nextPatternId = event.target.value as ConversionSettings["composer"]["patternId"];
                    setComposer((current) => ({ ...current, patternId: nextPatternId }));
                    syncMatrixEditorFromSelection(nextPatternId);
                    setState({ kind: "idle" });
                  }}
                >
                  <optgroup label="Built-in matrices">
                    {ORDERED_MATRIX_IDS.map((matrixId) => (
                      <option key={matrixId} value={matrixId}>{orderedMatrixLabel(matrixId)}</option>
                    ))}
                  </optgroup>
                  {customOrderedMatrices.length > 0 ? (
                    <optgroup label="Custom matrices">
                      {customOrderedMatrices.map((matrix) => (
                        <option key={matrix.id} value={matrix.id}>{matrix.id}</option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              <label>
                <span className="dithering-composer-one-line-label">Kernel · Composer&nbsp;propagation</span>
                <select
                  value={composer.propagationId}
                  onChange={(event) => {
                    const nextPropagationId = event.target.value as ConversionSettings["composer"]["propagationId"];
                    setComposer((current) => ({ ...current, propagationId: nextPropagationId }));
                    syncKernelEditorFromSelection(nextPropagationId);
                    setState({ kind: "idle" });
                  }}
                >
                  <optgroup label="Built-in propagation">
                    {BUILT_IN_COMPOSER_PROPAGATION_IDS.map((id) => (
                      <option key={id} value={id}>{composerPropagationLabel(id)}</option>
                    ))}
                  </optgroup>
                  {customDiffusionKernels.length > 0 ? (
                    <optgroup label="Custom kernels">
                      {customDiffusionKernels.map((kernel) => (
                        <option key={kernel.id} value={kernel.id}>{kernel.id}</option>
                      ))}
                    </optgroup>
                  ) : null}
                </select>
              </label>
              </div>
              <div className="control-row control-row-2">
              <label>
                <span>Composer diffusion mix</span>
                <span className="control-cell-body">
                  <select
                    value={String(composer.mixWeight)}
                    onChange={(event) => {
                      setComposer((current) => ({ ...current, mixWeight: Number(event.target.value) }));
                      setState({ kind: "idle" });
                    }}
                  >
                    {composerMixOptions(composer.mixWeight).map((option) => (
                      <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>
                    ))}
                  </select>
                  <small>0% uses the pattern guide only; 100% uses diffusion only.</small>
                </span>
              </label>
              <label>
                <span>Carrier mode</span>
                <select
                  value={composer.carrierMode}
                  onChange={(event) => {
                    setComposer((current) => ({ ...current, carrierMode: event.target.value as ConversionSettings["composer"]["carrierMode"] }));
                    setState({ kind: "idle" });
                  }}
                >
                  <option value="off">Off</option>
                  <option value="protected-checker">Protected checker</option>
                  <option value="adaptive">Adaptive</option>
                </select>
              </label>
              </div>
              <div className="control-row control-row-2">
              <label>
                <span>Custom matrix dimensions (width × height)</span>
                <div className="dithering-pair-fields dithering-composer-dimensions-fields">
                  <input aria-label="Custom matrix width" type="number" min="1" max="8" step="1" value={customMatrixWidthEntry} onChange={(event) => setCustomMatrixWidthEntry(event.target.value)} />
                  <input aria-label="Custom matrix height" type="number" min="1" max="8" step="1" value={customMatrixHeightEntry} onChange={(event) => setCustomMatrixHeightEntry(event.target.value)} />
                </div>
              </label>
              <div className="dithering-composer-spacer" aria-hidden="true" />
              </div>
              <div className="control-row control-row-2">
              <label>
                <span>Custom matrix ranks</span>
                <span className="control-cell-body">
                  <textarea
                    className="dithering-composer-editor"
                    rows={4}
                    value={customMatrixValuesEntry}
                    onChange={(event) => setCustomMatrixValuesEntry(event.target.value)}
                  />
                  <small>Ranks may repeat, but each distinct rank must occur equally often.</small>
                </span>
              </label>
              <label>
                <span>Custom kernel entries</span>
                <span className="control-cell-body">
                  <textarea
                    className="dithering-composer-editor"
                    rows={4}
                    value={customKernelEntryText}
                    onChange={(event) => setCustomKernelEntryText(event.target.value)}
                  />
                  <small>One row per entry: dx dy weight</small>
                </span>
              </label>
              </div>
              <div className="control-row control-row-2 control-row-actions">
              <div className="dithering-composer-save-row" role="group" aria-label="Custom matrix actions">
                <button
                  className="secondary compact"
                  type="button"
                  onClick={() => {
                    try {
                      const width = Number.parseInt(customMatrixWidthEntry, 10);
                      const height = Number.parseInt(customMatrixHeightEntry, 10);
                      const values = parseMatrixValues(customMatrixValuesEntry);
                      const definition = defineCustomOrderedMatrix({ width, height, values });
                      setCustomOrderedMatrices((current) => {
                        const next = current.filter((matrix) => matrix.id !== definition.id);
                        return [...next, definition];
                      });
                      setComposer((current) => ({ ...current, patternId: definition.id }));
                      setCustomPatternError(null);
                      setState({ kind: "idle" });
                    } catch (error: unknown) {
                      setCustomPatternError(error instanceof Error ? error.message : "Invalid custom matrix.");
                    }
                  }}
                >Save matrix</button>
                <button
                  className="secondary compact destructive-action"
                  type="button"
                  disabled={!composer.patternId.startsWith("custom-ordered-")}
                  onClick={() => {
                    const matrixId = composer.patternId;
                    if (!matrixId.startsWith("custom-ordered-")) return;
                    setCustomOrderedMatrices((current) => current.filter((matrix) => matrix.id !== matrixId));
                    setComposer((current) => ({ ...current, patternId: "bayer-4x4" }));
                    syncMatrixEditorFromSelection("bayer-4x4");
                    setCustomPatternError(null);
                    setState({ kind: "idle" });
                  }}
                >Delete matrix</button>
              </div>
              <div className="dithering-composer-save-row" role="group" aria-label="Custom kernel actions">
                <button
                  className="secondary compact"
                  type="button"
                  onClick={() => {
                    try {
                      const entries = parseKernelEntries(customKernelEntryText);
                      const definition = defineCustomDiffusionKernel(entries);
                      setCustomDiffusionKernels((current) => {
                        const next = current.filter((kernel) => kernel.id !== definition.id);
                        return [...next, definition];
                      });
                      setComposer((current) => ({ ...current, propagationId: definition.id }));
                      setCustomPatternError(null);
                      setState({ kind: "idle" });
                    } catch (error: unknown) {
                      setCustomPatternError(error instanceof Error ? error.message : "Invalid custom kernel.");
                    }
                  }}
                >Save kernel</button>
                <button
                  className="secondary compact destructive-action"
                  type="button"
                  disabled={!composer.propagationId.startsWith("custom-diffusion-")}
                  onClick={() => {
                    const kernelId = composer.propagationId;
                    if (!kernelId.startsWith("custom-diffusion-")) return;
                    setCustomDiffusionKernels((current) => current.filter((kernel) => kernel.id !== kernelId));
                    setComposer((current) => ({ ...current, propagationId: "none" }));
                    syncKernelEditorFromSelection("none");
                    setCustomPatternError(null);
                    setState({ kind: "idle" });
                  }}
                >Delete kernel</button>
              </div>
              </div>
              {customPatternError === null ? null : <span className="field-error dithering-composer-error">{customPatternError}</span>}
            </div>
          ) : null}
          {dithering === "error-diffusion" ? (
            <div className="dithering-wide dithering-row dithering-row-paired control-row control-row-2">
              <div className="dithering-parameter">
                <label>
                  <span>Dithering amount</span>
                  <span className="filter-inputs">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="1"
                      value={amountValid ? amount : 0}
                      aria-label="Dithering amount slider"
                      onInput={(event) => { setAmountEntry(event.currentTarget.value); setState({ kind: "idle" }); }}
                    />
                    <span className="range-number-entry">
                      <input
                        className={amountValid ? undefined : "invalid"}
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={amountEntry}
                        aria-label="Dithering amount percentage"
                        aria-invalid={!amountValid}
                        aria-describedby={amountValid ? undefined : "amount-error"}
                        onChange={(event) => { setAmountEntry(event.target.value); setState({ kind: "idle" }); }}
                      />
                      <span className="range-unit" aria-hidden="true">%</span>
                    </span>
                  </span>
                </label>
                {amountValid ? null : <span className="field-error" id="amount-error">Invalid value</span>}
              </div>
              <div
                className="dithering-parameter"
                title="Deterministically breaks repeating Error-diffusion patterns."
              >
                <RangeNumberControl
                  id="error-randomization"
                  label="Error randomization"
                  value={errorDiffusionRandomization}
                  min={0}
                  max={100}
                  unit="%"
                  onChange={(value) => {
                    setErrorDiffusionRandomization(value);
                    setState({ kind: "idle" });
                  }}
                  onValidityChange={setSliderValidity}
                />
                <span className="control-help">
                  Deterministically breaks repeating Error-diffusion patterns.
                </span>
              </div>
            </div>
          ) : dithering !== "none" ? (
            <fieldset className="amount-control dithering-wide">
              <legend>Dithering amount</legend>
              <div className="amount-inputs">
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={amountValid ? amount : 0}
                  aria-label="Dithering amount slider"
                  onInput={(event) => { setAmountEntry(event.currentTarget.value); setState({ kind: "idle" }); }}
                />
                <label className="percentage-entry">
                  <span className="visually-hidden">Dithering amount percentage</span>
                  <input
                    className={amountValid ? undefined : "invalid"}
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    value={amountEntry}
                    aria-invalid={!amountValid}
                    aria-describedby={amountValid ? undefined : "amount-error"}
                    onChange={(event) => { setAmountEntry(event.target.value); setState({ kind: "idle" }); }}
                  />
                  <span aria-hidden="true">%</span>
                </label>
              </div>
              {amountValid ? null : <span className="field-error" id="amount-error">Invalid value</span>}
            </fieldset>
          ) : null}
          {(ditherEngineId === "error-diffusion-phase-balanced-v3" ||
            ditherEngineId === "error-diffusion-phase-balanced-checker-v3-1" ||
            ditherEngineId === "error-diffusion-phase-balanced-checker-v3-2" ||
            ditherEngineId === "error-diffusion-phase-balanced-checker-v3-3" ||
            ditherEngineId === "error-diffusion-checker-phase-v4" ||
            ditherEngineId === "error-diffusion-checker-phase-v4-4" ||
            ditherEngineId === "error-diffusion-checker-artistic-v1" ||
            ditherEngineId === "error-diffusion-checker-phase-v4-5" ||
            ditherEngineId === "error-diffusion-checker-phase-v4-5-1" ||
            ditherEngineId === "error-diffusion-checker-phase-v4-1" ||
            ditherEngineId === "error-diffusion-checker-phase-v4-2" ||
            ditherEngineId === "error-diffusion-checker-phase-v4-3" ||
            ditherEngineId === "error-diffusion-checker-phase-v5" ||
            ditherEngineId === "error-diffusion-matrix-guided-v1") || (
            isQl &&
            targetModeId === "mode8-mode4-mixed-512x256" &&
            ditherEngineId === "artistic-ordered-hybrid-v1"
          ) ? (
            <div className="dithering-row">
              {(ditherEngineId === "error-diffusion-phase-balanced-v3" ||
                ditherEngineId === "error-diffusion-phase-balanced-checker-v3-1" ||
                ditherEngineId === "error-diffusion-phase-balanced-checker-v3-2" ||
                ditherEngineId === "error-diffusion-phase-balanced-checker-v3-3" ||
                ditherEngineId === "error-diffusion-checker-phase-v4" ||
                ditherEngineId === "error-diffusion-checker-phase-v4-4" ||
                ditherEngineId === "error-diffusion-checker-artistic-v1" ||
                ditherEngineId === "error-diffusion-checker-phase-v4-5" ||
                ditherEngineId === "error-diffusion-checker-phase-v4-5-1" ||
                ditherEngineId === "error-diffusion-checker-phase-v4-1" ||
                ditherEngineId === "error-diffusion-checker-phase-v4-2" ||
                ditherEngineId === "error-diffusion-checker-phase-v4-3" ||
                ditherEngineId === "error-diffusion-checker-phase-v5" ||
                ditherEngineId === "error-diffusion-matrix-guided-v1" ||
                (isQl &&
                  targetModeId === "mode8-mode4-mixed-512x256" &&
                  ditherEngineId === "artistic-ordered-hybrid-v1")) ? (
                <div
                  className="dithering-parameter"
                    title="Reduces vertical diffusion runs and favors balanced alternating 2×2 placement; v3.1 adds local placement, v3.2 integrates checker decisions into v3 propagation, v3.3 reorients only true 50% checker blocks, v4.4 adds a checker carrier, v4.5 adaptively selects checker or dispersed 4×4 carriers, and v4.5.1 uses coverage-preserving atomic 2×2 color-pair correction to reduce spikes without isolated pixel flips. At 0%, output matches Projected unrestricted v2."
                >
                  <RangeNumberControl
                    id="error-line-suppression"
                    label="Line suppression"
                    value={errorDiffusionLineSuppression}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={(value) => {
                      setErrorDiffusionLineSuppression(value);
                      setState({ kind: "idle" });
                    }}
                    onValidityChange={setSliderValidity}
                  />
                  <span className="control-help">
                    Reduces vertical diffusion runs while retaining short 2×1 transitions. v3.1 applies local placement after v3; v3.2 integrates coverage-preserving 2×2 checker decisions into v3 propagation; v3.3 only reorients existing 50% checker blocks; v4.4 uses an artistic checker carrier as a conservative v3 tie-breaker; v4.5 adaptively selects stable checker or dispersed 4×4 carrier regions, while v4.5.1 prefers a stable complementary checker phase and applies only atomic, coverage-preserving 2×2 color-pair corrections in smooth regions. In QL Mode 8/4 mixed Artistic checker mode, line suppression scales the mixed-resolution checker carrier from 0% to 100%. For v4.4, v4.5, and v4.5.1, line suppression controls carrier strength from 0% to 100%; it does not change the underlying tone diffusion. At 0%, output matches Projected unrestricted v2.
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
          </fieldset>
          </details>
          ))}
          </>
          ) : (
          <>
          {workbenchPortal("tilemap", (
          <details
            className={`workbench-settings-section workbench-window${workbenchTilemapFloating ? ` workbench-section-floating workbench-tilemap-floating${workbenchTilemapFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : ""}`}
            {...workbenchWindowDragAttributes("tilemap")}
            data-workbench-window="tilemap"
            hidden={!workbenchWindowLayout("tilemap").visible}
            data-dock={workbenchWindowLayout("tilemap").dock}
            data-minimized={workbenchWindowLayout("tilemap").minimized ? "true" : "false"}
            open={workbenchWindowLayout("tilemap").open && !workbenchWindowLayout("tilemap").minimized}
            style={workbenchDockWindowStyle("tilemap", workbenchTilemapFloating ? { zIndex: workbenchWindowZIndex("tilemap") } : undefined)}
            onPointerDown={(event) => {
              if (workbenchTilemapFloating) {
                event.stopPropagation();
                bringWorkbenchWindowToFront("tilemap");
              }
            }}
            onFocusCapture={() => {
              if (workbenchTilemapFloating) bringWorkbenchWindowToFront("tilemap");
            }}
            onToggle={(event) => setWorkbenchWindowOpen("tilemap", event.currentTarget.open)}
          >
            <summary
              onPointerDown={(event) => {
                startWorkbenchTitlebarDrag("tilemap", event);
              }}
              onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("tilemap", event)}
              onClick={(event) => handleWorkbenchTitlebarClick("tilemap", event)}
            >
              <span>Tilemap</span>
              {workbenchWindowActions("tilemap")}
              {workbenchTilemapFloating ? (
                <span
                  className="workbench-window-drag-handle"
                  role="button"
                  tabIndex={0}
                  aria-label="Move Tilemap window"
                  title="Drag to move Tilemap"
                  onPointerDown={(event) => startWorkbenchSectionDrag("tilemap", event)}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 32 : 8;
                    if (event.key === "ArrowLeft") setWorkbenchTilemapFloatingX((x) => Math.max(8, x - step));
                    if (event.key === "ArrowRight") setWorkbenchTilemapFloatingX((x) => x + step);
                    if (event.key === "ArrowUp") setWorkbenchTilemapFloatingY((y) => Math.max(8, y - step));
                    if (event.key === "ArrowDown") setWorkbenchTilemapFloatingY((y) => y + step);
                  }}
                >⠿</span>
              ) : null}
            </summary>
            {workbenchDockSplitHandle("tilemap")}
          <fieldset id="settings-tilemap" className={`control-group tilemap-settings-group${settingsSection === "tilemap" ? " settings-focused" : ""}`}>
            <legend>Tilemap conversion</legend>
            <div className="tilemap-source-inline">
            <div className="tilemap-source-summary control-row control-row-5">
              <div>
                <span>Optimizer</span>
                <strong>
                  {ATTRIBUTE_OPTIMIZERS.find((engine) =>
                    engine.id === attributeOptimizerId)?.name ??
                    attributeOptimizerId}
                </strong>
              </div>
              <div>
                <span>Dither engine</span>
                <strong>
                  {DITHER_ENGINES.find((engine) =>
                    engine.id === ditherEngineId)?.name ?? ditherEngineId}
                </strong>
              </div>
              <div>
                <span>Palette</span>
                <strong>
                  {paletteSelections[0]?.enabledColorIds.length ?? 0} colors ·
                  BRIGHT {paletteSelections[0]?.brightMode ?? "auto"}
                </strong>
              </div>
              <div>
                <span>Character budget</span>
                <strong>{charsetSource === "existing" ? existingActiveCharacterCount : charsetBudget}</strong>
              </div>
              <div><span>Target</span><strong>ZX 256×192 · 8×8</strong></div>
            </div>
            </div>
            <div className={`tilemap-primary-controls control-row control-row-${charsetSource === "derived" ? 5 : 4}`}>
            <label>
              <span>Charset source</span>
              <select
                value={charsetSource}
                disabled={charsetState.kind === "running"}
                onChange={(event) => {
                  const source = event.target.value as CharsetSource;
                  setCharsetSource(source);
                  setCharsetTilesView(source === "existing" ? "source" : "output");
                  setCharsetSelectionMode(false);
                  setSelectedSourceCharsetTile(null);
                  if (
                    source === "existing" &&
                    existingCharset !== null &&
                    existingCharsetLength === 0
                  ) {
                    const count = existingCharset.length / 8;
                    setExistingCharsetStart(0);
                    setExistingCharsetLength(count);
                    setExistingCharsetStartEntry("1");
                    setExistingCharsetLengthEntry(String(count));
                    if (count > 32) setCharsetEncoding("extended");
                  }
                  invalidateCharset();
                  setTilemapStale(true);
                }}
              >
                <option value="derived">Derive from palette source</option>
                <option value="existing">Existing charset</option>
              </select>
            </label>
            <label>
              <span>Output mapping</span>
              <select
                value={charsetEncoding}
                disabled={charsetState.kind === "running"}
                onChange={(event) => {
                  const encoding = event.target.value as CharsetEncoding;
                  setCharsetEncoding(encoding);
                  if (encoding === "compact") {
                    if (charsetSource === "existing") {
                      if (existingCharsetSelection !== null) {
                        markCharsetSelectionChanged(
                          existingCharsetSelection.slice(0, 32),
                        );
                      } else {
                        setExistingCharsetLength((value) => {
                          const next = Math.min(value, 32);
                          setExistingCharsetLengthEntry(String(next));
                          return next;
                        });
                      }
                    } else {
                      setCharsetBudget((value) => Math.min(value, 32));
                    }
                  }
                  invalidateCharset();
                  setTilemapStale(true);
                }}
              >
                <option value="compact">Compact · 1–32 chars</option>
                <option value="extended">Extended · 1–256 chars</option>
              </select>
            </label>
            {charsetSource === "derived" ? <label>
              <span>Character budget</span>
              <input
                type="number"
                min="1"
                max="256"
                value={charsetBudget}
                disabled={charsetState.kind === "running"}
                onChange={(event) => {
                  const next = Number(event.target.value);
                  if (Number.isInteger(next) && next >= 1 && next <= 256) {
                    setCharsetBudget(next);
                    if (next > 32) setCharsetEncoding("extended");
                    invalidateCharset();
                    setTilemapStale(true);
                  }
                }}
              />
            </label> : (
            <>
              <label>
                <span>Start tile</span>
                <input
                  type="text"
                  inputMode={existingCharsetSelection === null
                    ? "numeric"
                    : undefined}
                  value={existingCharsetSelection === null
                    ? existingCharsetStartEntry
                    : "Selection"}
                  readOnly={existingCharsetSelection !== null}
                  aria-invalid={existingCharsetSelection === null &&
                    !charsetRangeEntriesValid}
                  disabled={charsetState.kind === "running" || availableExistingCharsetCount === 0}
                  onChange={(event) => {
                    const entry = event.target.value;
                    setExistingCharsetStartEntry(entry);
                    const requestedStart = Number(entry);
                    if (
                      !/^\d+$/.test(entry) ||
                      !Number.isInteger(requestedStart) ||
                      requestedStart < 1 ||
                      requestedStart > availableExistingCharsetCount
                    ) return;
                    const range = clampCharsetRange(
                      availableExistingCharsetCount,
                      requestedStart - 1,
                      existingCharsetLength,
                    );
                    setExistingCharsetStart(range.startIndex);
                    setExistingCharsetLength(range.length);
                    setExistingCharsetLengthEntry(String(range.length));
                    invalidateCharset();
                    setTilemapStale(true);
                  }}
                  onBlur={commitCharsetStartEntry}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitCharsetStartEntry();
                    }
                  }}
                />
                {existingCharsetSelection === null &&
                    !charsetRangeEntriesValid ? (
                  <span className="field-error">Invalid value</span>
                ) : null}
              </label>
              <label>
                <span>Length</span>
                <input
                  type={existingCharsetSelection === null ? "text" : "number"}
                  inputMode={existingCharsetSelection === null
                    ? "numeric"
                    : undefined}
                  value={existingCharsetSelection === null
                    ? existingCharsetLengthEntry
                    : existingCharsetSelection.length}
                  readOnly={existingCharsetSelection !== null}
                  aria-invalid={existingCharsetSelection === null &&
                    !charsetRangeEntriesValid}
                  disabled={charsetState.kind === "running" || availableExistingCharsetCount === 0}
                  onChange={(event) => {
                    const entry = event.target.value;
                    setExistingCharsetLengthEntry(entry);
                    const requestedLength = Number(entry);
                    const maximum = availableExistingCharsetCount - existingCharsetStart;
                    if (
                      !/^\d+$/.test(entry) ||
                      !Number.isInteger(requestedLength) ||
                      requestedLength < 1 ||
                      requestedLength > maximum
                    ) return;
                    setExistingCharsetLength(requestedLength);
                    if (requestedLength > 32) setCharsetEncoding("extended");
                    invalidateCharset();
                    setTilemapStale(true);
                  }}
                  onBlur={commitCharsetLengthEntry}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      commitCharsetLengthEntry();
                    }
                  }}
                />
                {existingCharsetSelection === null &&
                    !charsetRangeEntriesValid ? (
                  <span className="field-error">Invalid value</span>
                ) : null}
              </label>
            </>
            )}
            {charsetSource === "derived" ? <label>
              <span>Derived strategy</span>
              <select
                value={charsetStrategy}
                disabled={charsetSource !== "derived" ||
                  charsetState.kind === "running"}
                onChange={(event) => {
                  setCharsetStrategy(
                    event.target.value as DerivedCharsetStrategy,
                  );
                  invalidateCharset();
                  setTilemapStale(true);
                }}
              >
                <option value="frequency">Most frequent · fastest</option>
                <option value="best-coverage">Best coverage v1 · baseline</option>
                <option value="image-similarity-v2">
                  Image similarity v2 · experimental
                </option>
                <option value="image-similarity-v3">
                  Image similarity v3 · contextual experimental
                </option>
                <option value="image-similarity-v4">
                  Image similarity v4 · RGB-safe experimental
                </option>
                <option value="image-similarity-v5">
                  Image similarity v5 · bounded contextual experimental
                </option>
              </select>
            </label> : null}
            {charsetSource === "derived" ? <label>
              <span>Matching metric</span>
              <select
                value={
                  charsetStrategy === "image-similarity-v2" ||
                  charsetStrategy === "image-similarity-v3" ||
                  charsetStrategy === "image-similarity-v4" ||
                  charsetStrategy === "image-similarity-v5"
                  ? charsetStrategy
                  : charsetDistance}
                disabled={
                  charsetStrategy === "image-similarity-v2" ||
                  charsetStrategy === "image-similarity-v3" ||
                  charsetStrategy === "image-similarity-v4" ||
                  charsetStrategy === "image-similarity-v5" ||
                  charsetState.kind === "running"}
                onChange={(event) => {
                  setCharsetDistance(
                    event.target.value as CharsetDistanceMetric,
                  );
                  invalidateCharset();
                  setTilemapStale(true);
                }}
              >
                <option value="hamming">Pixel Hamming</option>
                <option value="hybrid">Hybrid structural</option>
                {charsetStrategy === "image-similarity-v2" ||
                    charsetStrategy === "image-similarity-v3" ||
                    charsetStrategy === "image-similarity-v4" ||
                    charsetStrategy === "image-similarity-v5" ? (
                  <option value={charsetStrategy}>
                    Rendered image similarity
                  </option>
                ) : null}
              </select>
            </label> : null}
            </div>
            <div className="tilemap-options-row control-row control-row-3">
            <label className="check-control">
              <input
                type="checkbox"
                checked={charsetAllowTransforms}
                disabled={charsetState.kind === "running"}
                onChange={(event) => {
                  setCharsetAllowTransforms(event.target.checked);
                  invalidateCharset();
                  setTilemapStale(true);
                }}
              />
              <span>Rotations and reflections</span>
            </label>
            <label className="check-control">
              <input
                type="checkbox"
                checked={charsetAllowPolarity}
                disabled={charsetState.kind === "running"}
                onChange={(event) => {
                  setCharsetAllowPolarity(event.target.checked);
                  invalidateCharset();
                  setTilemapStale(true);
                }}
              />
              <span>Polarity through INK/PAPER swap</span>
            </label>
            <label className="check-control">
              <input
                type="checkbox"
                checked={charsetVisualWeighting}
                disabled={charsetSource !== "derived" ||
                  charsetState.kind === "running"}
                onChange={(event) => {
                  setCharsetVisualWeighting(event.target.checked);
                  invalidateCharset();
                  setTilemapStale(true);
                }}
              />
              <span>Visual importance weighting</span>
            </label>
            </div>
            {charsetSource === "existing" ? (
              <label className="file-picker secondary-picker charset-picker">
                <span>
                  {existingCharsetName ?? "Choose raw charset"}
                  {existingCharsetName === null ? "" : " · Replace…"}
                </span>
                <input
                  type="file"
                  accept=".chr,.bin,application/octet-stream"
                  disabled={charsetState.kind === "running"}
                  onChange={(event) => {
                    const input = event.currentTarget;
                    const file = input.files?.[0];
                    // Clear the input so selecting the same file again still
                    // emits a change event and resets any prior tile subset.
                    input.value = "";
                    void importExistingCharset(file);
                  }}
                />
              </label>
            ) : null}
            {charsetSource === "existing" && existingCharset === null ? (
              <p className="control-help" role="status">
                {builtInSpecsciiFontError === null
                  ? "Loading the built-in Specscii font…"
                  : `Built-in Specscii font unavailable: ${builtInSpecsciiFontError}. Import a raw charset to continue.`}
              </p>
            ) : null}
            <p className="control-help tilemap-mapping-help">
              Compact embeds transform bits and supports 1–32 active tiles.
              Extended supports 1–256 tiles and stores transforms in a separate
              288-byte plane.
            </p>
          </fieldset>
          {workbenchTilemapFloating ? (
            <div
              className="workbench-floating-resize-handle"
              role="button"
              tabIndex={0}
              aria-label="Resize Tilemap window"
              onPointerDown={(event) => startWorkbenchFloatingResize("tilemap", event)}
              onKeyDown={(event) => {
                const step = event.shiftKey ? 32 : 8;
                if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("tilemap", step, 0);
                if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("tilemap", -step, 0);
                if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("tilemap", 0, step);
                if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("tilemap", 0, -step);
              }}
            />
          ) : null}
          </details>
          ))}
          </>
          )}
          </div>

          {benchmarkPanelHost === null ? null : createPortal((developmentMode && workspaceMode === "palette" && benchmarkOpen ? (
          <details
            className="benchmark-panel"
            open
            onToggle={(event) => setBenchmarkOpen(event.currentTarget.open)}
          >
            <summary>
              <span>{comparisonKind === "dithering" ? "Dithering comparison" : "Conversion engine comparison"}</span>
              <span className="benchmark-summary">
                {benchmarkRunning
                  ? "Benchmarking…"
                  : benchmarkRows.length > 0
                    ? `${benchmarkRows.length} results`
                    : "Not run"}
              </span>
            </summary>
            <div className="benchmark-content">
              <div className="benchmark-toolbar">
                <label className="benchmark-experimental">
                  <input
                    type="checkbox"
                    checked={includeExperimentalEngines}
                    disabled={benchmarkRunning}
                    onChange={(event) => {
                      setIncludeExperimentalEngines(event.currentTarget.checked);
                      setBenchmarkRows([]);
                    }}
                  />
                  Include experimental methods in benchmark
                </label>
                <button
                  className="secondary compact"
                  type="button"
                  disabled={image === null || !settingsValid || benchmarkRunning}
                  onClick={() => void runEngineBenchmark()}
                >
                  {benchmarkRunning ? "Benchmarking…" : "Run comparison"}
                </button>
                <span>Ranks compatible optimizer and dither combinations for the current image.</span>
                {benchmarkRows.length > 0 ? (
                  <>
                    <button className="secondary compact" type="button" onClick={() => downloadBenchmark("json")}>Export JSON</button>
                    <button className="secondary compact" type="button" onClick={() => downloadBenchmark("csv")}>Export CSV</button>
                  </>
                ) : null}
              </div>
              <p className="benchmark-context">
                Context: {selectedPlatformId} · {targetModeId} ·
                {" "}amount {dithering === "none" ? 0 : amount}% ·
                {" "}randomization {errorDiffusionRandomization}% ·
                {" "}line suppression {errorDiffusionLineSuppression}% ·
                {" "}attribute {attributeHeight === undefined ? "—" : `8×${attributeHeight}`} ·
                {" "}palettes {paletteSelections.map((selection) =>
                  `S${selection.screenIndex + 1}:${selection.enabledColorIds.join(",")}${
                    selection.brightMode === undefined
                      ? ""
                      : `/${selection.brightMode}`
                  }`
                ).join(" | ")} · source {sourceArtifact?.sha256.slice(0, 12) ?? "unsaved"}
              </p>
              {benchmarkRows.length > 0 ? (
                <div className="benchmark-results">
                  <p>
                    Lower decoder-preview RGB error is better. Low-pass and
                    edge scores are secondary; platform score is
                    engine-specific and not comparable. Guidance identifies
                    exact, smooth, fast, and non-dominated balanced tradeoffs.
                  </p>
                  {benchmarkCompareDigests.length === 2 ? (() => {
                    const first = benchmarkRows.find((row) => row.digest === benchmarkCompareDigests[0]);
                    const second = benchmarkRows.find((row) => row.digest === benchmarkCompareDigests[1]);
                    return first !== undefined && second !== undefined ? (
                      <div className="benchmark-comparison" aria-label="Selected engine comparison">
                        <strong>A/B metric difference · B minus A</strong>
                        <span>RGB {(second.score - first.score).toLocaleString()}</span>
                        <span>Low-pass {(second.lowPassScore - first.lowPassScore).toLocaleString()}</span>
                        <span>Edge {(second.edgeScore - first.edgeScore).toLocaleString()}</span>
                        <span>Anisotropy {((second.textureMetrics.directionalAnisotropy - first.textureMetrics.directionalAnisotropy) * 100).toFixed(2)} pp</span>
                        <span>Straight runs {(second.textureMetrics.straightRunPenalty - first.textureMetrics.straightRunPenalty).toLocaleString()}</span>
                        <span>Time {(second.elapsedMs - first.elapsedMs).toFixed(0)} ms</span>
                        {benchmarkComparisonPreviews !== null ? (
                          <div className="benchmark-preview-comparison">
                            <figure><img src={benchmarkComparisonPreviews.first} alt="Benchmark result A" /><figcaption>A</figcaption></figure>
                            <figure><img src={benchmarkComparisonPreviews.second} alt="Benchmark result B" /><figcaption>B</figcaption></figure>
                            <figure><img src={benchmarkComparisonPreviews.difference} alt="Amplified RGB difference heatmap" /><figcaption>Difference ×4</figcaption></figure>
                          </div>
                        ) : null}
                      </div>
                    ) : null;
                  })() : null}
                  <table>
                    <thead>
                      <tr>
                        <th>Rank</th>
                        {selectedPlatformId === "zx-spectrum"
                          ? <th>Attribute optimizer</th>
                          : null}
                        {targetModeId === "mode8-mode4-mixed-512x256"
                          ? <th>QL mixed optimizer</th>
                          : null}
                        <th>Dither</th><th>Matrix</th><th>RGB error</th>
                        <th>Low-pass 2×2</th><th>Edge error</th>
                        <th>Guidance</th><th>Texture diagnostics</th><th>Attribute boundary</th><th>v7 RMS / changed</th><th>Platform score*</th>
                        <th>Time</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {benchmarkRows.map((row, index) => (
                        <tr key={row.digest}>
                          <td>{index + 1}</td>
                          {selectedPlatformId === "zx-spectrum"
                            ? <td>{row.optimizerId}</td>
                            : null}
                          {targetModeId === "mode8-mode4-mixed-512x256"
                            ? <td>{row.qlMixedOptimizerId}</td>
                            : null}
                          <td>
                            <div>{row.ditherEngineId}</div>
                            {row.aliases.length > 0 ? (
                              <details>
                                <summary>
                                  {row.aliases.length + 1} identical outputs
                                </summary>
                                {row.aliases.map((alias) => (
                                  <div key={`${alias.optimizerId}:${alias.qlMixedOptimizerId}:${alias.ditherEngineId}:${alias.matrix}`}>
                                    {selectedPlatformId === "zx-spectrum"
                                      ? `${alias.optimizerId} · `
                                      : targetModeId ===
                                          "mode8-mode4-mixed-512x256"
                                      ? `${alias.qlMixedOptimizerId} · `
                                      : ""}
                                    {alias.ditherEngineId}
                                    {ditherMethodForEngine(alias.ditherEngineId) ===
                                          "ordered"
                                      ? ` · ${alias.matrix}`
                                      : ""}
                                  </div>
                                ))}
                              </details>
                            ) : null}
                          </td>
                          <td>{row.matrixEffective ? row.matrix : "—"}</td>
                          <td>{row.score.toLocaleString()}</td>
                          <td>{row.lowPassScore.toLocaleString()}</td>
                          <td>{row.edgeScore.toLocaleString()}</td>
                          <td title={row.classification.dominated
                            ? "Dominated on RGB, low-pass, and edge metrics."
                            : row.classification.guidance === "exact"
                              ? "Lowest canonical RGB error."
                              : row.classification.guidance === "smooth"
                                ? "Lowest low-pass perceived error."
                                : row.classification.guidance === "fast"
                                  ? "Fastest result within 10% of the best RGB error."
                                  : "Non-dominated quality tradeoff."}
                          >
                            {row.classification.guidance ?? (row.classification.dominated ? "dominated" : "—")}
                          </td>
                          <td>
                            <details>
                              <summary>
                                anisotropy {(row.textureMetrics.directionalAnisotropy * 100).toFixed(1)}%
                              </summary>
                              <div>straight runs {row.textureMetrics.straightRunPenalty.toLocaleString()}</div>
                              <div>low frequency {row.textureMetrics.lowFrequencyNoise.toFixed(2)}</div>
                              <div>clumping {row.textureMetrics.localErrorClumping.toFixed(2)}</div>
                              <div>edge displacement {row.textureMetrics.edgeDisplacement.toLocaleString()}</div>
                            </details>
                          </td>
                          <td>{row.attributeBoundaryScore?.toLocaleString() ?? "—"}</td>
                          <td>{row.orderedPerturbationRms === null
                            ? "—"
                            : `${row.orderedPerturbationRms.toFixed(5)} / ${row.outputPixelChangePercent?.toFixed(2) ?? "—"}%`}</td>
                          <td>{row.platformScore.toLocaleString()}</td>
                          <td>{row.elapsedMs.toFixed(0)} ms</td>
                          <td>
                            <label className="benchmark-compare-toggle">
                              <input
                                type="checkbox"
                                aria-label={`Compare ${row.ditherEngineId}`}
                                checked={benchmarkCompareDigests.includes(row.digest)}
                                onChange={() => toggleBenchmarkComparison(row.digest)}
                              />
                              A/B
                            </label>
                            <button className="secondary compact" type="button" onClick={() => selectBenchmarkRow(row)}>Use</button>
                            <button
                              className="secondary compact"
                              type="button"
                              aria-pressed={benchmarkVisualFavorites.has(row.digest)}
                              onClick={() => toggleBenchmarkVisualFavorite(row.digest)}
                              title="Mark this result as a visual favorite without changing its rank"
                            >
                              {benchmarkVisualFavorites.has(row.digest) ? "★ Favorite" : "☆ Favorite"}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </details>
          ) : developmentMode && workspaceMode === "tilemap" && tilemapBenchmarkOpen ? (
          <details
            className="benchmark-panel"
            open
            onToggle={(event) =>
              setTilemapBenchmarkOpen(event.currentTarget.open)}
          >
            <summary>
              <span>Tilemap method comparison</span>
              <span className="benchmark-summary">
                {tilemapBenchmarkRunning
                  ? "Benchmarking…"
                  : tilemapBenchmarkRows.length > 0
                    ? `${tilemapBenchmarkRows.length} results`
                    : "Not run"}
              </span>
            </summary>
            <div className="benchmark-content">
              <div className="benchmark-toolbar">
                <span>
                  Compares Frequency, Best coverage v1, and experimental Image
                  similarity v2/v3/v4/v5 at the current character budget.
                </span>
              </div>
              {tilemapBenchmarkRows.length > 0 ? (
                <div className="benchmark-results">
                  <p>
                    Lower decoder-preview RGB error is better; runtime is
                    informational.
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Rank</th><th>Method</th><th>RGB error</th>
                        <th>Objective / diagnostics</th><th>vs v2</th>
                        <th>Time</th><th />
                      </tr>
                    </thead>
                    <tbody>
                      {tilemapBenchmarkRows.map((row, index) => (
                        <tr key={row.strategy}>
                          <td>{index + 1}</td>
                          <td>{row.strategy}</td>
                          <td>{row.score.toLocaleString()}</td>
                          <td>
                            {row.strategy === "image-similarity-v4" ||
                                row.strategy === "image-similarity-v5" ? (
                              <details>
                                <summary>
                                  RGB{" "}
                                  {row.result.diagnostics.initialRgbSquaredError?.toLocaleString()}
                                  {" → "}
                                  {row.result.diagnostics.finalRgbSquaredError?.toLocaleString()}
                                </summary>
                                <div>
                                  Multiscale{" "}
                                  {row.result.diagnostics.multiscaleError?.toFixed(2)}
                                  {" · "}edge{" "}
                                  {row.result.diagnostics.edgeError?.toFixed(2)}
                                  {" · "}boundary{" "}
                                  {row.result.diagnostics.rgbBoundaryError?.toFixed(2)}
                                  {" · "}saliency{" "}
                                  {row.result.diagnostics.saliencyError?.toFixed(2)}
                                  {" · "}passes{" "}
                                  {row.result.diagnostics.refinementPasses ?? 0}
                                  {" · "}swaps{" "}
                                  {row.result.diagnostics.medoidSwaps ?? 0}
                                  {" · "}assignments{" "}
                                  {row.result.diagnostics.assignmentChanges ?? 0}
                                  {" · "}candidates{" "}
                                  {row.result.diagnostics.candidatesEvaluated?.toLocaleString() ?? "—"}
                                  {" · "}pruned{" "}
                                  {row.result.diagnostics.equivalentCandidatesPruned?.toLocaleString() ?? "—"}
                                  {" · "}cache hits{" "}
                                  {row.result.diagnostics.candidateCacheHits?.toLocaleString() ?? "—"}
                                </div>
                              </details>
                            ) : (
                              row.result.diagnostics.globalObjective?.toFixed(5) ??
                                "—"
                            )}
                          </td>
                          <td>{(() => {
                            const baseline = tilemapBenchmarkRows.find(
                              (candidate) =>
                                candidate.strategy === "image-similarity-v2",
                            )?.score;
                            return baseline === undefined
                              ? "—"
                              : `${((baseline - row.score) / baseline * 100).toFixed(2)}%`;
                          })()}</td>
                          <td>{row.elapsedMs.toFixed(0)} ms</td>
                          <td>
                            <button
                              className="secondary compact"
                              type="button"
                              onClick={() => selectTilemapBenchmarkRow(row)}
                            >
                              Use
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          </details>
          ) : null), benchmarkPanelHost)}
            </div>
          </div>
          <div ref={setBenchmarkPanelHost} className="workbench-comparison-host" />

          <div className="form-footer">
            <div className="actions">
              <button
                type="submit"
                disabled={image === null || !settingsValid || state.kind === "running"}
              >
                {state.kind === "running" ? "Converting…" : "Convert High"}
              </button>
              {state.kind === "running" ? (
                <button className="secondary" type="button" onClick={cancelHigh}>Cancel High</button>
              ) : null}
              {developmentMode && comparisonKind === "palette" ? (
                <button
                  className="secondary project-action comparison-project-action"
                  type="button"
                  disabled={image === null || !settingsValid || benchmarkRunning}
                  onClick={() => setBenchmarkOpen((open) => !open)}
                >
                  {benchmarkOpen ? "Close comparison" : "Compare engines"}
                </button>
              ) : null}
              {developmentMode && comparisonKind === "dithering" ? (
                <button
                  className="secondary project-action comparison-project-action"
                  type="button"
                  disabled={image === null || !settingsValid || benchmarkRunning}
                  onClick={() => {
                    setBenchmarkOpen(true);
                    if (!benchmarkOpen) void runEngineBenchmark();
                  }}
                >
                  {benchmarkRunning ? "Benchmarking…" : "Compare dithering"}
                </button>
              ) : null}
              {developmentMode && comparisonKind === "tilemap" ? (
                <button
                  className="secondary project-action comparison-project-action"
                  type="button"
                  disabled={lastFinal === null || tilemapBenchmarkRunning ||
                    (charsetSource === "existing" &&
                      (existingCharset === null || !existingCharsetChoiceValid))}
                  onClick={() => {
                    setTilemapBenchmarkOpen(true);
                    void runTilemapBenchmark();
                  }}
                >
                  {tilemapBenchmarkRunning ? "Benchmarking…" : "Compare methods"}
                </button>
              ) : null}

            </div>

          </div>
          {exportError === null ? null : <div className="field-error workbench-export-error" role="alert">{exportError}</div>}
          <div
            className="workbench-dock-region workbench-dock-left"
            {...workbenchDockDropAttributes("left")}
            ref={setWorkbenchLeftDockLayer}
            data-dock-region="left"
            aria-label="Left dock"
          >
            <div className="workbench-dock-resize-handle workbench-dock-resize-left" role="separator" tabIndex={0} aria-label="Resize left dock" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={560} aria-valuenow={workbenchLeftWidth} onPointerDown={(event) => startWorkbenchResize("left", event)} onKeyDown={(event) => { if (event.key === "ArrowLeft") adjustWorkbenchSize("left", -16); if (event.key === "ArrowRight") adjustWorkbenchSize("left", 16); }} />
          </div>
          <div
            className="workbench-dock-region workbench-dock-right"
            {...workbenchDockDropAttributes("right")}
            ref={setWorkbenchRightDockLayer}
            data-dock-region="right"
            aria-label="Right dock"
          >
            <div className="workbench-dock-resize-handle workbench-dock-resize-right" role="separator" tabIndex={0} aria-label="Resize right dock" aria-orientation="vertical" aria-valuemin={0} aria-valuemax={560} aria-valuenow={workbenchRightWidth} onPointerDown={(event) => startWorkbenchResize("right", event)} onKeyDown={(event) => { if (event.key === "ArrowLeft") adjustWorkbenchSize("right", 16); if (event.key === "ArrowRight") adjustWorkbenchSize("right", -16); }} />
          </div>
          <div
            className="workbench-dock-region workbench-dock-bottom"
            {...workbenchDockDropAttributes("bottom")}
            ref={setWorkbenchBottomDockLayer}
            data-dock-region="bottom"
            aria-label="Bottom dock"
          >
            <div className="workbench-dock-resize-handle workbench-dock-resize-bottom" role="separator" tabIndex={0} aria-label="Resize bottom dock" aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={480} aria-valuenow={workbenchBottomHeight} onPointerDown={(event) => startWorkbenchResize("bottom", event)} onKeyDown={(event) => { if (event.key === "ArrowUp") adjustWorkbenchSize("bottom", 16); if (event.key === "ArrowDown") adjustWorkbenchSize("bottom", -16); }} />
            <div
              ref={setWorkbenchBottomMinimizedLayer}
              className="workbench-dock-minimized-stack"
              data-workbench-drop-append={workbenchTileDrag?.drop?.dock === "bottom" &&
                workbenchTileDrag.drop.target === null && workbenchTileDrag.drop.destination === "minimized"
                ? "true"
                : undefined}
              aria-label="Minimized bottom-dock windows"
            />
          </div>
        </form>

        {gifFrameSelection !== null ? (
          <div className="settings-modal-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) cancelGifFrameSelection();
          }}>
            <form className="settings-modal project-save-modal" role="dialog" aria-modal="true" aria-labelledby="gif-frame-title" onSubmit={(event) => {
              event.preventDefault();
              importSelectedGifFrame();
            }} onKeyDown={(event) => {
              if (event.key === "Escape") cancelGifFrameSelection();
            }}>
              <div className="settings-modal-header">
                <div>
                  <h2 id="gif-frame-title">Choose GIF frame</h2>
                  <p>{gifFrameSelection.file.name} contains {gifFrameSelection.frameCount} frames. Choose the frame to import.</p>
                </div>
              </div>
              <div className="project-save-content">
                <label htmlFor="gif-frame-number">Frame number</label>
                <input
                  id="gif-frame-number"
                  autoFocus
                  type="number"
                  min={1}
                  max={gifFrameSelection.frameCount}
                  step={1}
                  value={gifFrameSelection.frameEntry}
                  onChange={(event) => setGifFrameSelection((current) => current === null ? null : { ...current, frameEntry: event.target.value })}
                />
                <p>Choose a frame from 1 to {gifFrameSelection.frameCount}.</p>
              </div>
              <div className="settings-modal-actions">
                <span className="action-spacer" aria-hidden="true" />
                <button className="secondary" type="button" onClick={cancelGifFrameSelection}>Cancel</button>
                <button className="primary" type="submit" disabled={!/^\d+$/.test(gifFrameSelection.frameEntry) || Number(gifFrameSelection.frameEntry) < 1 || Number(gifFrameSelection.frameEntry) > gifFrameSelection.frameCount}>Import Frame</button>
              </div>
            </form>
          </div>
        ) : null}

        {projectSaveDialogOpen ? (
          <div className="settings-modal-backdrop" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) setProjectSaveDialogOpen(false);
          }}>
            <form className="settings-modal project-save-modal" role="dialog" aria-modal="true" aria-labelledby="project-save-title" onSubmit={(event) => {
              event.preventDefault();
              void exportProject(projectNameDraft);
            }} onKeyDown={(event) => {
              if (event.key === "Escape") setProjectSaveDialogOpen(false);
            }}>
              <div className="settings-modal-header">
                <div>
                  <h2 id="project-save-title">Save project</h2>
                  <p>Choose a name for the project file. The project will use this name after saving.</p>
                </div>
                <button className="secondary compact" type="button" aria-label="Close save project dialog" onClick={() => setProjectSaveDialogOpen(false)}>×</button>
              </div>
              <div className="project-save-content">
                <label htmlFor="project-save-name">Project name</label>
                <input
                  id="project-save-name"
                  autoFocus
                  type="text"
                  maxLength={120}
                  value={projectNameDraft}
                  onChange={(event) => setProjectNameDraft(event.target.value)}
                  placeholder="Untitled project"
                />
                <p>The downloaded file will be named <strong>{sanitizeArtifactBaseName(normalizeProjectName(projectNameDraft))}.rccproject</strong>.</p>
              </div>
              <div className="settings-modal-actions">
                <span className="action-spacer" aria-hidden="true" />
                <button className="secondary" type="button" onClick={() => setProjectSaveDialogOpen(false)}>Cancel</button>
                <button className="primary" type="submit" disabled={projectNameDraft.trim().length === 0}>Save Project</button>
              </div>
            </form>
          </div>
        ) : null}

        {zxPaletteEditorOpen && isZx ? (
          <ZxPaletteEditorDialog
            definition={zxPaletteDefinition}
            onChange={(definition) => {
              setZxPaletteDefinition(definition);
              setState({ kind: "idle" });
            }}
            onClose={() => setZxPaletteEditorOpen(false)}
          />
        ) : null}

        {settingsOpen && settingsDraft !== null ? (() => {
          const draftProfile = profiles.find(({ id }) => id === settingsDraft.profileId) ?? BUILT_IN_PROFILE;
          const draftModes = Object.keys(draftProfile.palette.modes) as TargetModeId[];
          const draftTypography = uiTypographyFromRecord(settingsDraft);
          const visibleSettings = filterSettings(SETTINGS_REGISTRY, settingsSearch, settingsCategory, settingsPreset, settingsDraft, settingsBaseline ?? settingsDraft);
          const updateSetting = (definition: SettingDefinition, value: unknown) => {
            const next = { ...settingsDraft, [definition.id]: value };
            if (definition.id === "dithering") {
              next.ditherEngineId = latestDitherEngineForMethod(value as DitheringMethod);
            } else if (definition.id === "ditherEngineId") {
              next.dithering = ditherMethodForEngine(value as DitherEngineId);
            }
            setSettingsDraft(next);
          };
          const renderSettingControl = (definition: SettingDefinition) => {
            const value = settingsDraft[definition.id] ?? definition.defaultValue;
            const context = { workspaceMode, modeId: String(settingsDraft.modeId), dithering: String(settingsDraft.dithering) };
            const available = definition.isAvailable?.(context) ?? true;
            const enabled = available && (definition.isEnabled?.(settingsDraft, context) ?? true);
            const common = { id: `setting-${definition.id}`, "aria-describedby": `setting-help-${definition.id}` };
            if (definition.id === "profileId") return <select {...common} value={String(value)} onChange={(event) => {
              const profile = profiles.find(({ id }) => id === event.target.value) ?? BUILT_IN_PROFILE;
              setSettingsDraft({ ...settingsDraft, profileId: profile.id, presetId: profile.presets[0]?.id ?? "default", modeId: (Object.keys(profile.palette.modes)[0] ?? DEFAULT_APPLICATION_SETTINGS.modeId) as TargetModeId });
            }}>{profiles.map((profile) => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select>;
            if (definition.id === "presetId") return <select {...common} value={String(value)} onChange={(event) => updateSetting(definition, event.target.value)}>{draftProfile.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select>;
            if (definition.id === "modeId") return <select {...common} value={String(value)} onChange={(event) => updateSetting(definition, event.target.value)}>{draftModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}</select>;
            if (definition.id === "pmd85PaletteCalibrationId") {
              const draftModePalette = draftProfile.palette.modes[String(settingsDraft.modeId) as TargetModeId];
              const calibrations = draftModePalette?.calibrations ?? [];
              const baseCalibration = draftModePalette?.base_calibration_id;
              return <select {...common} value={String(value)} disabled={!enabled} onChange={(event) => updateSetting(definition, event.target.value)}>{baseCalibration === undefined ? null : <option value={baseCalibration}>{baseCalibration}</option>}{calibrations.map((calibration) => <option key={calibration.id} value={calibration.id}>{calibration.name}</option>)}</select>;
            }
            if (definition.control.kind === "boolean") return <input {...common} type="checkbox" checked={Boolean(value)} disabled={!enabled} onChange={(event) => updateSetting(definition, event.target.checked)} />;
            if (definition.control.kind === "color") {
              const color = value as RgbColor;
              return <div className="settings-color-control">
                <input {...common} type="color" value={rgbToHex(color)} disabled={!enabled} onChange={(event) => updateSetting(definition, hexToRgb(event.target.value))} />
                <span>{rgbToHex(color).toUpperCase()}</span>
              </div>;
            }
            if (definition.control.kind === "palette") {
              const selections = Array.isArray(value) ? value as Array<{ screenIndex: number; enabledColorIds: readonly number[]; brightMode?: BrightMode }> : [];
              const screens = draftProfile.palette.modes[String(settingsDraft.modeId) as TargetModeId]?.screens ?? [];
              return <div className="settings-palette-selector">{screens.map((screen, screenIndex) => {
                const selection = selections.find((candidate) => candidate.screenIndex === screenIndex) ?? { screenIndex, enabledColorIds: [] };
                return <div key={screenIndex} className="settings-palette-screen"><div className="settings-palette-colors">{screen.colors.map((color) => {
                  const selected = selection.enabledColorIds.includes(color.id);
                  const nextSelections = selections.map((candidate) => candidate.screenIndex === screenIndex ? { ...candidate, enabledColorIds: selected ? candidate.enabledColorIds.filter((id) => id !== color.id) : [...candidate.enabledColorIds, color.id].sort((a, b) => a - b) } : candidate);
                  return <button key={color.id} type="button" className={`palette-option${selected ? " selected" : ""}`} disabled={!enabled} aria-label={`${selected ? "Remove" : "Add"} ${color.name}`} aria-pressed={selected} onClick={() => updateSetting(definition, nextSelections)}><span className="palette-swatch" style={{ background: selection.brightMode === "on" ? color.bright : color.normal }} /></button>;
                })}</div><select aria-label={`Screen ${screenIndex + 1} BRIGHT policy`} disabled={!enabled} value={selection.brightMode ?? "auto"} onChange={(event) => updateSetting(definition, selections.map((candidate) => candidate.screenIndex === screenIndex ? { ...candidate, brightMode: event.target.value as BrightMode } : candidate))}><option value="auto">BRIGHT auto</option><option value="on">BRIGHT on</option><option value="off">BRIGHT off</option></select></div>;
              })}</div>;
            }
            const selectControl = definition.control;
            if (selectControl.kind === "select") return <select {...common} value={String(value)} disabled={!enabled} onChange={(event) => {
              const option = selectControl.options.find((candidate) => String(candidate.value) === event.target.value);
              updateSetting(definition, option?.value ?? event.target.value);
            }}>{selectControl.options.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}</select>;
            if (definition.control.kind === "slider") return <div className="settings-slider"><input {...common} type="range" min={definition.control.min} max={definition.control.max} step={definition.control.step} value={Number(value)} disabled={!enabled} onChange={(event) => updateSetting(definition, Number(event.target.value))} /><output htmlFor={common.id}>{String(value)}{definition.control.unit ?? ""}</output></div>;
            if (definition.control.kind === "number") return <input {...common} type="number" min={definition.control.min} max={definition.control.max} step={definition.control.step} value={Number(value)} disabled={!enabled} onChange={(event) => updateSetting(definition, Number(event.target.value))} />;
            return <input {...common} type="text" value={String(value)} disabled={!enabled} onChange={(event) => updateSetting(definition, event.target.value)} />;
          };
          return (
            <div className="settings-modal-backdrop" role="presentation" onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setSettingsOpen(false);
                setSettingsDraft(null);
                setSettingsBaseline(null);
              }
            }}>
              <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="application-settings-title" onKeyDown={(event) => {
                if (event.key === "Escape") { setSettingsOpen(false); setSettingsDraft(null); setSettingsBaseline(null); }
              }}>
                <div className="settings-modal-header">
                  <div>
                    <h2 id="application-settings-title">Settings</h2>
                    <p>Searchable settings for startup, conversion, workspace, and editing.</p>
                  </div>
                  <button className="secondary compact" type="button" onClick={() => {
                    setSettingsOpen(false);
                    setSettingsDraft(null);
                  }}>×</button>
                </div>
                <div className="settings-toolbar">
                  <input autoFocus type="search" placeholder="Search settings…" aria-label="Search settings" value={settingsSearch} onChange={(event) => setSettingsSearch(event.target.value)} />
                  <select aria-label="Category" value={settingsCategory} onChange={(event) => setSettingsCategory(event.target.value as SettingCategory | "all")}><option value="all">All categories</option>{Object.entries(SETTING_CATEGORIES).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select>
                  <select aria-label="Filter preset" value={settingsPreset} onChange={(event) => setSettingsPreset(event.target.value as SettingPresetId)}>{SETTING_FILTER_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}</select>
                </div>
                <div className="settings-result-count" role="status">{visibleSettings.length} setting{visibleSettings.length === 1 ? "" : "s"}</div>
                <section
                  className="settings-typography-preview"
                  style={uiTypographyCssVariables(draftTypography) as CSSProperties}
                  aria-label="Typography preview"
                >
                  <div className="settings-typography-preview-heading">Typography preview</div>
                  <div className="typography-preview-window-title">Window title · Floating</div>
                  <div className="typography-preview-label"><span>UI label</span><strong>Sample value</strong></div>
                  <p className="typography-preview-body">Palette, Attributes, and Dithering body text uses the selected size and weight.</p>
                  <code className="typography-preview-monospace">Diagnostic 0x7F · 256×192</code>
                </section>
                <div className="settings-modal-content">
                  {visibleSettings.length === 0 ? <p className="settings-empty">No settings match your search or filters.</p> : Object.entries(SETTING_CATEGORIES).map(([category, label]) => {
                    const definitions = visibleSettings.filter((definition) => definition.category === category);
                    if (definitions.length === 0) return null;
                    return <fieldset key={category} id={`settings-${category}`}><legend>{label}</legend>{definitions.map((definition) => {
                      const definitionContext = { workspaceMode, modeId: String(settingsDraft.modeId), dithering: String(settingsDraft.dithering) };
                      const definitionAvailable = definition.isAvailable?.(definitionContext) ?? true;
                      const definitionEnabled = definition.isEnabled?.(settingsDraft, definitionContext) ?? true;
                      return <div className="setting-row" key={definition.id}>
                      <div><label htmlFor={`setting-${definition.id}`}><span>{definition.label}</span>{Object.is(settingsDraft[definition.id], settingsBaseline?.[definition.id]) ? null : <span className="setting-modified" title="Modified">●</span>}</label><p id={`setting-help-${definition.id}`}>{definition.description}{definition.disabledReason && (!definitionAvailable || !definitionEnabled) ? ` ${definition.disabledReason}` : ""}</p></div>
                      <div className="setting-control">{renderSettingControl(definition)}</div>
                    </div>;
                    })}</fieldset>;
                  })}
                </div>
                <div className="settings-modal-actions">
                  <button className="secondary" type="button" onClick={() => {
                    const category = settingsCategory === "all" ? "all" : settingsCategory;
                    const label = category === "all" ? "all settings" : SETTING_CATEGORIES[category];
                    if (window.confirm(`Reset ${label} to defaults?`)) {
                      setSettingsDraft(resetSettingsCategory(settingsDraft, category) as ApplicationSettings & Record<string, unknown>);
                    }
                  }}>{settingsCategory === "all" ? "Reset all" : `Reset ${SETTING_CATEGORIES[settingsCategory]}`}</button>
                  <span className="action-spacer" aria-hidden="true" />
                  <button className="secondary" type="button" onClick={() => { setSettingsOpen(false); setSettingsDraft(null); setSettingsBaseline(null); }}>Cancel</button>
                  <button className="primary" type="button" onClick={saveApplicationSettingsDraft} disabled={Object.keys(validateSettingsDraft(settingsDraft).errors).length > 0}>Save</button>
                </div>
              </section>
            </div>
          );
        })() : null}

        <section
          ref={workbenchPreviewWorkspaceRef}
          className={`inspection-workspace${workbenchSourceFloating ? " preview-source-floating" : ""}${workbenchResultFloating ? " preview-result-floating" : ""}${sourcePreviewVisible ? "" : " preview-source-hidden"}${resultPreviewVisible ? "" : " preview-result-hidden"}`}
          aria-labelledby="inspection-title"
        >
          <div className="inspection-heading">
            <div>
              <h2 id="inspection-title">Preview and inspection</h2>
              <p>Click-drag to pan, inspect encoded cells, and verify palette usage.</p>
            </div>
          </div>

          {workbenchPortal("tools", (
          <details
            className={`workbench-settings-section workbench-window${workbenchToolsFloating ? " workbench-section-floating workbench-tools-floating" : ""}`}
            {...workbenchWindowDragAttributes("tools")}
            data-workbench-window="tools"
            hidden={!workbenchWindowLayout("tools").visible}
            data-dock={workbenchWindowLayout("tools").dock}
            data-minimized={workbenchWindowLayout("tools").minimized ? "true" : "false"}
            open={workbenchWindowLayout("tools").open && !workbenchWindowLayout("tools").minimized}
            style={workbenchDockWindowStyle("tools", workbenchToolsFloating ? { zIndex: workbenchWindowZIndex("tools") } : undefined)}
            onPointerDown={(event) => {
              if (workbenchToolsFloating) {
                event.stopPropagation();
                bringWorkbenchWindowToFront("tools");
              }
            }}
            onFocusCapture={() => {
              if (workbenchToolsFloating) bringWorkbenchWindowToFront("tools");
            }}
            onToggle={(event) => setWorkbenchWindowOpen("tools", event.currentTarget.open)}
          >
            <summary
              aria-label="Tools"
              onPointerDown={(event) => startWorkbenchTitlebarDrag("tools", event)}
              onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("tools", event)}
              onClick={(event) => handleWorkbenchTitlebarClick("tools", event)}
            >
              <span>Tools</span>
              {workbenchWindowActions("tools")}
              {workbenchToolsFloating ? (
                <span
                  className="workbench-window-drag-handle"
                  role="button"
                  tabIndex={0}
                  aria-label="Move Tools window"
                  title="Drag to move Tools"
                  onPointerDown={(event) => startWorkbenchSectionDrag("tools", event)}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                  }}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 32 : 8;
                    if (event.key === "ArrowLeft") setWorkbenchToolsFloatingX((x) => Math.max(8, x - step));
                    if (event.key === "ArrowRight") setWorkbenchToolsFloatingX((x) => x + step);
                    if (event.key === "ArrowUp") setWorkbenchToolsFloatingY((y) => Math.max(8, y - step));
                    if (event.key === "ArrowDown") setWorkbenchToolsFloatingY((y) => y + step);
                  }}
                >⠿</span>
              ) : null}
            </summary>
            {workbenchDockSplitHandle("tools")}
            {workbenchToolsFloating ? (
              <div
                className="workbench-floating-resize-handle"
                role="button"
                tabIndex={0}
                aria-label="Resize Tools window"
                onPointerDown={(event) => startWorkbenchFloatingResize("tools", event)}
                onKeyDown={(event) => {
                  const step = event.shiftKey ? 32 : 8;
                  if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("tools", step, 0);
                  if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("tools", -step, 0);
                  if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("tools", 0, step);
                  if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("tools", 0, -step);
                }}
              />
            ) : null}
            <div className="workbench-window-content workbench-tools-content">
            {bitmapEditorActiveSide !== null ? <section className="bitmap-editor-tools-section" aria-label="Bitmap editor commands">
              <div className="bitmap-editor-tools-section-heading">Bitmap editor</div>
              <div className="bitmap-editor-tools-host" ref={setBitmapEditorToolsHost} />
            </section> : null}
            <div className={`control-row tools-control-row tools-primary-row control-row-${isZx ? 4 + (workspaceMode === "tilemap" ? 1 : 0) : isPmd ? 3 : 2}`}>
              <div className="tools-zoom-controls" aria-label="Preview zoom">
                <span>Zoom</span>
                <div className="pan-pad tools-zoom-pad">
                  <button type="button" aria-label="Zoom out preview" title="Zoom out" onClick={() => stepZoom(-1)} disabled={previewZoom === "fit"}>−</button>
                  <button type="button" aria-label="Zoom in preview" title="Zoom in" onClick={() => stepZoom(1)} disabled={previewZoom === 16}>+</button>
                  <button type="button" aria-label="Fit preview" title="Fit" onClick={() => setZoom("fit")}>%</button>
                </div>
              </div>
              <label className="check-control tools-option-pixel">
                <input type="checkbox" checked={showPixelGrid} onChange={(event) => setShowPixelGrid(event.target.checked)} />
                <span>Pixel grid</span>
              </label>
              {(isZx || isPmd) ? <label className="check-control tools-option-cell">
                <input type="checkbox" checked={showAttributeGrid} onChange={(event) => setShowAttributeGrid(event.target.checked)} />
                <span>Cell grid {isPmd ? `6×${targetModeId === "pmd85-colorace" ? 2 : 1}` : `8×${displayedAttributeHeight}`}</span>
              </label> : null}
              {isZx ? <label className="check-control tools-option-hide">
                <input
                  type="checkbox"
                  checked={hideAttributes}
                  onChange={(event) => setHideAttributes(event.target.checked)}
                />
                <span>Hide attributes</span>
              </label> : null}
              {workspaceMode === "tilemap" && charsetState.kind === "ready" ? <label className="check-control tools-option-highlight">
                <input type="checkbox" checked={highlightSelectedTileUses} onChange={(event) => setHighlightSelectedTileUses(event.target.checked)} />
                <span>Highlight selected tile uses</span>
              </label> : null}
            </div>
            {flashPreviewAvailable ? (
              <div className="tools-flash-preview" role="radiogroup" aria-label="FLASH preview">
                <span>FLASH preview</span>
                {(["animate", "normal", "inverted"] as const).map((mode) => (
                  <label className="tools-flash-radio" key={mode}>
                    <input
                      type="radio"
                      name="zx-flash-preview-mode"
                      value={mode}
                      disabled={mode !== "normal" && !flashPreviewAvailable}
                      checked={bitmapEditorFlashPreviewMode === mode}
                      onChange={() => setBitmapEditorFlashPreviewMode(mode)}
                    />
                    <span>
                      {mode === "animate" ? "Animate" : mode === "normal" ? "Normal" : "Inverted"}
                    </span>
                  </label>
                ))}
                <small>Live result previews · 500 ms</small>
              </div>
            ) : null}
            <div className={`control-row tools-control-row tools-secondary-row control-row-${2 + (isQl && workspaceMode === "palette" ? 1 : 0) + (isQl && workspaceMode === "palette" && targetModeId === "mode8-mode4-mixed-512x256" ? 1 : 0)}`}>
              <label className="check-control tools-option-pan">
                <input type="checkbox" checked={synchronizePan} onChange={(event) => setSynchronizePan(event.target.checked)} />
                <span>Synchronize pan</span>
              </label>
              <label className="check-control tools-option-zoom" title="Keep source and result preview zoom levels aligned. Selecting an editor or inspection layout disables this option.">
                <input
                  type="checkbox"
                  checked={synchronizeZoom}
                  onChange={(event) => {
                    const enabled = event.target.checked;
                    setSynchronizeZoom(enabled);
                    if (enabled) {
                      setSourcePreviewZoom(previewZoom);
                      setResultPreviewZoom(previewZoom);
                    }
                  }}
                />
                <span>Synchronize zoom</span>
              </label>
              {isQl && workspaceMode === "palette" ? <label
                className="check-control"
                title="Display Mode 8 pixels at 4/3 × 1 and Mode 4 pixels at 4/3 × 2, producing the physical 4:3 monitor image. Disable for square-pixel inspection."
              >
                <input
                  type="checkbox"
                  checked={scaleQlToDisplayAspect}
                  onChange={(event) => setScaleQlToDisplayAspect(event.target.checked)}
                />
                <span>4:3 display aspect</span>
              </label> : null}
              {isQl &&
                workspaceMode === "palette" &&
                targetModeId === "mode8-mode4-mixed-512x256" ? (
                  <label title="Choose whether the Merged tab preserves both Mode 4 subpixels or averages each pair into one low-resolution perceived color.">
                    <span>Mixed display</span>
                    <select
                      value={qlMixedDisplayResolution}
                      onChange={(event) =>
                        setQlMixedDisplayResolution(
                          event.target.value as QlMixedDisplayResolution,
                        )}
                    >
                      <option value="high">High resolution</option>
                      <option value="low">Low resolution</option>
                    </select>
                  </label>
                ) : null}
            </div>
            </div>
          </details>
          ))}

          {workspaceMode === "palette" ? (
          <aside className="preview-palette-panel" aria-label="Palette summary">
            <div className="palette-control palette-summary-only">
              <div className="palette-summary-heading">
                <span>Palette selection</span>
                <span className="palette-summary">
                  {paletteSelections.map((selection) => (
                    <span className="palette-summary-screen" key={selection.screenIndex}>
                      <span>Screen {selection.screenIndex + 1} · {selection.enabledColorIds.length}</span>
                      <span className="mini-palette" aria-hidden="true">
                        {selection.enabledColorIds.map((color) => {
                          const option = (
                            effectivePaletteOptionsByScreen[selection.screenIndex] ??
                            effectivePaletteOptionsByScreen[0] ??
                            []
                          ).find((candidate) => candidate.code === color);
                          return option === undefined ? null : (
                            <span
                              key={color}
                              style={{
                                background: isZx && selection.brightMode === "auto"
                                  ? `linear-gradient(90deg, ${option.normal} 0 50%, ${option.bright} 50% 100%)`
                                  : isZx && selection.brightMode === "on"
                                    ? option.bright
                                    : option.normal,
                              }}
                            />
                          );
                        })}
                      </span>
                    </span>
                  ))}
                </span>
              </div>
              <div className="palette-screen-grid">
                {paletteSelections.map((selection) => (
                  <section className="palette-screen" key={selection.screenIndex}>
                    <div className="palette-screen-heading">
                      <strong>Screen {selection.screenIndex + 1}</strong>
                      <span>{selection.enabledColorIds.length} selected</span>
                    </div>
                    {isZx ? (
                      <label>
                        <span>BRIGHT</span>
                        <select
                          value={selection.brightMode ?? "auto"}
                          onChange={(event) =>
                            setPaletteBrightMode(
                              selection.screenIndex,
                              event.target.value as BrightMode,
                            )}
                        >
                          <option value="auto">Auto</option>
                          <option value="on">On</option>
                          <option value="off">Off</option>
                        </select>
                      </label>
                    ) : null}
                    <div
                      className="palette-options"
                      role="group"
                      aria-label={`Screen ${selection.screenIndex + 1} available colors`}
                    >
                      {(effectivePaletteOptionsByScreen[selection.screenIndex] ??
                        effectivePaletteOptionsByScreen[0] ??
                        []).map((option) => {
                        const selected = selection.enabledColorIds.includes(option.code);
                        return (
                          <button
                            className={`palette-option${selected ? " selected" : ""}`}
                            type="button"
                            key={option.code}
                            aria-label={`${selected ? "Remove" : "Add"} ${option.name} from Screen ${selection.screenIndex + 1}`}
                            aria-pressed={selected}
                            title={option.name}
                            onClick={() => togglePaletteColor(selection.screenIndex, option.code)}
                          >
                            <span
                              className="palette-swatch"
                              style={{
                                background: isZx && selection.brightMode === "auto"
                                  ? `linear-gradient(90deg, ${option.normal} 0 50%, ${option.bright} 50% 100%)`
                                  : isZx && selection.brightMode === "on"
                                    ? option.bright
                                    : option.normal,
                              }}
                              aria-hidden="true"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
              {paletteValid ? null : (
                <span className="field-error" id="palette-error">
                  Invalid value: select at least one color for every screen.
                </span>
              )}
            </div>
          </aside>
          ) : (
          <aside className={`tilemap-charset-panel${charsetSource === "existing" && existingCharset !== null ? showingSourceCharset ? " has-source-view" : " has-source-tabs" : ""}`} aria-label="Charset selector">
            <div className="tilemap-charset-heading">
              <strong>{showingSourceCharset ? "Source charset" : "Charset tiles"}</strong>
              <span>{showingSourceCharset
                ? `${sourceCharsetCount} source tiles · ${glyphActiveCount} included`
                : `${glyphCount} output tiles${tileEditorEdited ? " · Edited" : ""}`}</span>
            </div>
            {charsetSource === "existing" && existingCharset !== null ? <div className={`tilemap-charset-control-row unified-segmented${showingSourceCharset ? " has-selection-action" : ""}`} role="group" aria-label="Charset tile controls">
                <button className={`secondary compact${showingSourceCharset ? " active" : ""}`} type="button" aria-label="Show source charset tiles" title="Show source charset tiles" aria-pressed={showingSourceCharset} onClick={() => switchCharsetTilesView("source")}>Source</button>
                <button className={`secondary compact${!showingSourceCharset ? " active" : ""}`} type="button" aria-label="Show converted output tiles" title="Show converted output tiles" aria-pressed={!showingSourceCharset} disabled={charsetState.kind !== "ready"} onClick={() => switchCharsetTilesView("output")}>Output</button>
                {showingSourceCharset ? <button className={`secondary compact${charsetSelectionMode ? " active" : ""}`} type="button" disabled={charsetState.kind === "running"} aria-label={charsetSelectionMode ? "Finish editing conversion set" : "Edit conversion set"} aria-pressed={charsetSelectionMode} onClick={toggleCharsetSelectionMode} title="Enable source-tile clicks to include or exclude tiles for the next conversion">{charsetSelectionMode ? "Done" : "Edit set"}</button> : null}
            </div> : null}
            {showingSourceCharset ? <div className="tilemap-selection-mode">
              <span className="control-help" role="status">{charsetSelectionMode
                ? "Source tiles are toggles for the next conversion; changes make the result stale."
                : "Click a source tile to select it for the editor or TILE operation. Inclusion changes only in Edit conversion set mode."}</span>
            </div> : null}
            <div className="tilemap-charset-legend" aria-label="Charset tile indicators">
              {showingSourceCharset
                ? <span><i className="charset-included-indicator" aria-hidden="true" />Included tiles are used on the next conversion</span>
                : <><span><i className="charset-used-indicator" aria-hidden="true" />Used on map</span><span><i className="charset-editor-indicator" aria-hidden="true" />Current editor tile</span></>}
            </div>
            <div
              className="tilemap-glyph-grid"
              aria-label="Loaded or generated charset glyphs"
              onPointerMove={moveCharsetSelection}
              onPointerUp={endCharsetSelection}
              onPointerCancel={endCharsetSelection}
            >
              {glyphCount === 0 ? (
                <span className="control-help">No charset loaded.</span>
              ) : glyphDisplayIndices.map((characterIndex) => {
                const active = glyphActiveIndexSet.has(characterIndex);
                const editorReady = charsetState.kind === "ready";
                const selectable = editorReady || (charsetSource === "existing" && existingCharset !== null);
                const usageCount = tileUsageAvailable
                  ? tileUsageCountByIndex.get(characterIndex) ?? 0
                  : null;
                const usageScale = usageCount === null || usageCount === 0 || maximumTileUsage === 0
                  ? 0
                  : Math.log1p(usageCount) / Math.log1p(maximumTileUsage);
                const usageColor = usageCount === null || usageCount === 0
                  ? undefined
                  : `hsl(${205 - Math.round(160 * usageScale)} 82% 62%)`;
                const usageDescription = usageCount === null
                  ? "Usage unavailable"
                  : usageCount === 0
                    ? "Unused · 0 map cells"
                    : `Used in ${usageCount} map cells`;
                const inclusionDescription = showingSourceCharset
                  ? active ? "Included in conversion" : "Excluded from conversion"
                  : "Included in converted tile set";
                const editorDescription = !showingSourceCharset && editorReady && characterIndex === tileEditorSelected
                  ? " · Current editor tile"
                  : "";
                const sourcePickedDescription = showingSourceCharset && characterIndex === selectedSourceCharsetTile
                  ? " · Selected for editor or tile operation"
                  : "";
                return (
                  <button
                    type="button"
                    className={`glyph-item ${active ? "active" : "inactive"}${usageCount === 0 ? " zero-use" : usageCount === null ? " usage-unknown" : " map-used"}${!charsetSelectionMode && showingSourceCharset && characterIndex === selectedSourceCharsetTile ? " source-picked" : ""}${!showingSourceCharset && editorReady && characterIndex === tileEditorSelected ? " editor-selected" : ""}`}
                    key={characterIndex}
                    data-character-index={characterIndex}
                    title={`Tile ${characterIndex + 1} (index ${characterIndex}) · ${inclusionDescription}${editorDescription}${sourcePickedDescription} · ${usageDescription}`}
                    aria-label={`Tile ${characterIndex + 1}, ${inclusionDescription}${editorDescription}${sourcePickedDescription}, ${usageDescription}`}
                    aria-pressed={selectable ? showingSourceCharset && !charsetSelectionMode
                      ? characterIndex === selectedSourceCharsetTile
                      : active : undefined}
                    disabled={!selectable || charsetState.kind === "running"}
                    ref={(element) => {
                      charsetGlyphRefs.current[characterIndex] = element;
                    }}
                    onClick={(event) => {
                      if (consumeRecentTilePickerClick(characterIndex)) {
                        event.preventDefault();
                        return;
                      }
                      if (showingSourceCharset) {
                        if (!charsetSelectionMode) handleSourceCharsetTileClick(characterIndex);
                      } else if (tileEditorTilePickerActive) {
                        tileEditorTilePickerClickGuardRef.current = { index: characterIndex, until: Date.now() + 500 };
                        applyPickedTilemapIndex(characterIndex);
                      } else {
                        selectEditorTile(characterIndex);
                      }
                    }}
                    onDoubleClick={(event) => {
                      if (consumeRecentTilePickerClick(characterIndex)) {
                        event.preventDefault();
                        return;
                      }
                      if (showingSourceCharset) {
                        if (charsetSelectionMode) handleCharsetDoubleClick(characterIndex);
                      } else if (tileEditorTilePickerActive) {
                        applyPickedTilemapIndex(characterIndex);
                      } else {
                        selectEditorTile(characterIndex);
                      }
                    }}
                    onPointerDown={(event) => {
                      if (consumeRecentTilePickerClick(characterIndex)) {
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                      }
                      if (!showingSourceCharset && tileEditorTilePickerActive) {
                        event.preventDefault();
                        event.stopPropagation();
                        tileEditorTilePickerClickGuardRef.current = { index: characterIndex, until: Date.now() + 500 };
                        applyPickedTilemapIndex(characterIndex);
                      } else if (showingSourceCharset && charsetSelectionMode) {
                        beginCharsetSelection(characterIndex, event);
                      }
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown") {
                        handleCharsetGlyphKey(characterIndex, event);
                      } else if (event.key === "Delete" && showingSourceCharset && charsetSelectionMode) {
                        event.preventDefault();
                        clearCharsetSelection();
                      } else if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        if (tileEditorTilePickerActive && !showingSourceCharset) applyPickedTilemapIndex(characterIndex);
                        else if (showingSourceCharset && charsetSelectionMode) toggleCharsetCharacter(characterIndex);
                        else if (showingSourceCharset) handleSourceCharsetTileClick(characterIndex);
                        else selectEditorTile(characterIndex);
                      } else if (!editorReady) {
                        handleCharsetGlyphKey(characterIndex, event);
                      }
                    }}
                    onDragStart={(event) => event.preventDefault()}
                  >
                    <img
                      src={glyphDataUrl(glyphCharset!, characterIndex, active, usageCount === 0)}
                      alt=""
                      draggable={false}
                      width="16"
                      height="16"
                    />
                    <span className={`glyph-usage-meter${usageCount === null ? " unavailable" : ""}`} aria-hidden="true">
                      <span style={{ width: `${usageScale * 100}%`, backgroundColor: usageColor }} />
                    </span>
                  </button>
                );
              })}
            </div>
            {charsetSource === "derived" ? (
              <div className="tilemap-charset-freeze">
                <button className="secondary compact" type="button" disabled={charsetState.kind !== "ready" || glyphCount === 0} onClick={freezeGeneratedCharset}>Freeze generated charset</button>
                <span className="control-help">Freeze the current generated tiles to enable conversion selection.</span>
              </div>
            ) : null}
            <div className={`tilemap-charset-actions unified-segmented${showingSourceCharset ? " source-actions" : ""}`} role="group" aria-label={showingSourceCharset ? "Source charset selection actions" : "Output tile actions"}>
              {showingSourceCharset ? <>
                <button className="secondary compact" type="button" disabled={!charsetSelectionMode || charsetSource !== "existing" || existingCharset === null || charsetState.kind === "running" || sourceCharsetCount === 0} onClick={clearCharsetSelection} title="Include all source tiles in the next conversion">Select all</button>
                <button className="secondary compact" type="button" disabled={!charsetSelectionMode || charsetSource !== "existing" || existingCharset === null || charsetState.kind === "running" || sourceCharsetCount === 0} onClick={invertCharsetSelection} title="Invert the source-tile selection">Invert selection</button>
              </> : <>
                <button
                  className="secondary compact"
                  type="button"
                  disabled={!tileUsageAvailable || glyphCount === 0}
                  onClick={toggleEditorTileUsageSort}
                  aria-pressed={tileEditorUsageSort}
                  title={tileEditorUsageSort ? "Show tiles in memory order" : "Sort displayed tiles by usage"}
                >{tileEditorUsageSort ? "Normal" : "Usage"}</button>
                <button className="secondary compact" type="button" disabled={charsetState.kind !== "ready" || glyphCount >= 256} onClick={createEditorTile} title="Add a blank tile">Add</button>
                <button className="secondary compact" type="button" disabled={charsetState.kind !== "ready" || glyphCount <= 1} onClick={deleteEditorTile} title="Delete the selected tile">Del</button>
              </>}
            </div>
          </aside>
          )}

          <div
            className="comparison workbench-preview-dock"
            aria-label="Configurable preview panes"
            data-preview-layout={previewLayout}
            {...workbenchDockDropAttributes("center")}
          >
            {(() => {
            const sourceDock = workbenchWindowLayout("source").dock;
            const sourceDockTarget = workbenchDockLayerFor(sourceDock);
            const sourcePreviewPane = (
            <section
              className={`preview-panel source-panel${workbenchSourceFloating ? ` preview-panel-floating preview-source-window${workbenchSourceFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : " preview-panel-docked"} ${workspaceMode === "tilemap" ? "tilemap-preview-panel" : ""}`}
              {...workbenchWindowDragAttributes("source")}
              data-workbench-window="source"
              hidden={!workbenchWindowLayout("source").visible}
              data-dock={sourceDock}
              data-minimized={workbenchWindowLayout("source").minimized ? "true" : "false"}
              aria-labelledby="source-preview-title"
              style={workbenchDockWindowStyle("source", workbenchSourceFloating ? { zIndex: workbenchWindowZIndex("source") } : undefined)}
              onPointerDown={() => { if (workbenchSourceFloating) bringWorkbenchWindowToFront("source"); }}
              onFocusCapture={() => { if (workbenchSourceFloating) bringWorkbenchWindowToFront("source"); }}
            >
              {!workbenchSourceFloating && sourceDock === "center" ? (
                <div
                  className="preview-docked-resize-handle preview-source-docked-resize"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize Source preview"
                  aria-valuemin={240}
                  aria-valuemax={Math.max(240, (workbenchPreviewWorkspaceRef.current?.clientWidth ?? 1200) - 288)}
                  aria-valuenow={Math.min(Math.max(240, (workbenchPreviewWorkspaceRef.current?.clientWidth ?? 1200) - 288), Math.round(workbenchSourceDockedWidth * Math.max(480, (workbenchPreviewWorkspaceRef.current?.clientWidth ?? 1200) - 80)))}
                  tabIndex={0}
                  onPointerDown={(event) => startWorkbenchDockedPreviewResize("source", event)}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 0.08 : 0.02;
                    if (event.key === "ArrowRight") setWorkbenchSourceDockedWidth((width) => Math.min(10, width + step));
                    if (event.key === "ArrowLeft") setWorkbenchSourceDockedWidth((width) => Math.max(0.25, width - step));
                  }}
                />
              ) : null}
              <div
                className="preview-panel-heading"
                tabIndex={0}
                onPointerDown={(event) => startWorkbenchTitlebarDrag("source", event)}
                onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("source", event)}
                onClick={(event) => handleWorkbenchTitlebarClick("source", event)}
              >
                <h3 className="preview-panel-title" id="source-preview-title">
                  {sourcePreviewContent === "image" || sourcePreviewContent === "source-image"
                    ? workspaceMode === "tilemap" ? "Palette source" : "Conversion input"
                      : sourcePreviewContent === "result-image"
                        ? resultLabel
                    : sourcePreviewContent === "pre-attribute"
                      ? "Pre-attribute dither"
                    : sourcePreviewContent === "screen-1"
                      ? hasVerticalSpatialTarget ? "Full resolution" : "Screen 1"
                    : sourcePreviewContent === "screen-2"
                      ? hasVerticalSpatialTarget ? "Analytic" : "Screen 2"
                    : sourcePreviewContent === "merged-low"
                      ? "Merged · low resolution"
                    : sourcePreviewContent === "merged-high"
                      ? "Merged · high resolution"
                    : sourcePreviewContent === "palette-usage"
                      ? "Palette usage"
                      : sourcePreviewContent === "tile-usage"
                        ? "Used tiles"
                        : sourcePreviewContent === "unified-editor"
                          ? "Unified editor"
                        : sourcePreviewContent === "bitmap-editor"
                          ? "Bitmap editor"
                        : sourcePreviewContent === "difference"
                          ? "Difference heatmap"
                        : "Inspector"}
                </h3>
                {workbenchWindowActions("source", true)}
                <label className="preview-content-selector">
                  <span className="sr-only">Source window content</span>
                  <select
                    value={sourcePreviewContent}
                    disabled={bitmapEditorActiveSide === "result"}
                    onChange={(event) => {
                      selectPreviewContent("source", event.target.value as PreviewContent);
                    }}
                  >
                    <option value="image">Source image</option>
                    <option value="result-image">Result image</option>
                    {workspaceMode === "palette" ? <option value="pre-attribute">Pre-attribute dither</option> : null}
                    {hasMixedScreenTarget ? <>
                      <option value="screen-1">Screen 1</option>
                      <option value="screen-2">Screen 2</option>
                    </> : null}
                    {hasVerticalSpatialTarget ? <>
                      <option value="screen-1">Full resolution</option>
                      <option value="screen-2">Analytic</option>
                    </> : null}
                    {hasQlMixedResolutionTarget ? <>
                      <option value="merged-low">Merged · low resolution</option>
                      <option value="merged-high">Merged · high resolution</option>
                    </> : null}
                    <option value="palette-usage">Palette usage</option>
                    {workspaceMode === "tilemap" ? <option value="tile-usage">Used tiles</option> : null}
                    <option value="unified-editor">Unified editor</option>
                    {workspaceMode === "palette" ? <option value="bitmap-editor">Bitmap editor</option> : null}
                    <option value="difference">Difference heatmap</option>
                    <option value="inspector">Inspector</option>
                  </select>
                </label>
                <div className="preview-zoom-actions" aria-label="Source preview zoom">
                  <button className="secondary compact" type="button" aria-label="Zoom out Source preview" title="Zoom out" onClick={() => stepPreviewZoom("source", -1)} disabled={bitmapEditorActiveSide === "result" || sourcePreviewZoom === "fit"}>−</button>
                  <button className="secondary compact" type="button" aria-label="Zoom in Source preview" title="Zoom in" onClick={() => stepPreviewZoom("source", 1)} disabled={bitmapEditorActiveSide === "result" || sourcePreviewZoom === 16}>+</button>
                  <button className="secondary compact" type="button" aria-label="Fit Source preview" title="Fit" onClick={() => fitPreview("source")}>%</button>
                </div>
                {workbenchSourceFloating ? (
                  <span
                    className="workbench-window-drag-handle"
                    role="button"
                    tabIndex={0}
                    aria-label="Move Source preview window"
                    title="Drag to move Source preview"
                    onPointerDown={(event) => startWorkbenchSectionDrag("source", event)}
                    onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
                    onKeyDown={(event) => {
                      const step = event.shiftKey ? 32 : 8;
                      if (event.key === "ArrowLeft") setWorkbenchSourceFloatingX((x) => Math.max(8, x - step));
                      if (event.key === "ArrowRight") setWorkbenchSourceFloatingX((x) => x + step);
                      if (event.key === "ArrowUp") setWorkbenchSourceFloatingY((y) => Math.max(8, y - step));
                      if (event.key === "ArrowDown") setWorkbenchSourceFloatingY((y) => y + step);
                    }}
                  >⠿</span>
                ) : null}
              </div>
              {workbenchDockSplitHandle("source")}
              {sourcePreviewContent === "bitmap-editor" ? fullBitmapEditorPreview("source") : sourcePreviewContent === "image" || sourcePreviewContent === "source-image" || sourcePreviewContent === "result-image" || (hasVerticalSpatialTarget && (sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2")) ? <div
                className={`preview-frame preview-viewport source-preview-frame ${draggingSide === "source" ? "dragging" : ""}`}
                ref={sourceViewportRef}
                onScroll={(event) => handlePreviewScroll("source", event)}
                onPointerDown={(event) => beginPreviewDrag("source", event)}
                onPointerMove={movePreviewDrag}
                onPointerUp={endPreviewDrag}
                onPointerCancel={endPreviewDrag}
                onWheel={(event) => handlePreviewWheel("source", event)}
                onFocusCapture={() => markPanSource("source")}
              >
                {image === null
                  ? null
                  : (
                    <div
                      className={`preview-stage ${sourceZoom === "fit" ? "fit-stage" : ""}${sourceShowsImage ? " source-image-stage" : ""}`}
                      style={{
                        width: sourceFitStageSize !== null ? `${sourceFitStageSize.width}px` : sourceStageWidth,
                        height: sourceFitStageSize !== null ? `${sourceFitStageSize.height}px` : undefined,
                        aspectRatio: sourceStageAspectRatio,
                      }}
                    >
                      <canvas
                        ref={sourcePreviewContent === "result-image" || (hasVerticalSpatialTarget && (sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2")) ? sourceConvertedCanvasRef : canvasRef}
                        className={framing === "crop"
                          ? `crop-editor-canvas crop-pointer-${cropPointerMode}`
                          : undefined}
                        aria-label={sourcePreviewContent === "result-image" || (hasVerticalSpatialTarget && (sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2"))
                          ? "Converted hardware preview"
                          : framing === "crop"
                          ? "Source image crop editor"
                          : "Decoded source image preview"}
                        tabIndex={sourcePreviewContent === "result-image" || (hasVerticalSpatialTarget && (sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2")) ? 0 : framing === "crop" ? 0 : undefined}
                        onPointerDown={sourcePreviewContent === "result-image" ? selectResultPixel : framing === "crop" ? beginCropSelection : undefined}
                        onPointerMove={sourcePreviewContent === "result-image" ? inspectResultPixel : framing === "crop" ? moveCropSelection : undefined}
                        onPointerUp={sourcePreviewContent === "result-image" ? undefined : framing === "crop" ? endCropSelection : undefined}
                        onPointerCancel={sourcePreviewContent === "result-image" ? undefined : framing === "crop" ? endCropSelection : undefined}
                        onDoubleClick={sourcePreviewContent === "result-image" ? clearBitmapEditorSelectionOnDoubleClick : framing === "crop" ? clearCropSelection : undefined}
                        onKeyDown={sourcePreviewContent === "result-image" ? handleInspectorKey : framing === "crop" ? moveCropWithKeyboard : undefined}
                        onPointerLeave={framing === "crop"
                          ? () => {
                              if (cropDragRef.current === null) {
                                setCropPointerMode("create");
                              }
                            }
                          : undefined}
                      />
                      {sourcePreviewContent !== "result-image" && framing === "crop" && cropOverlay !== null ? (
                        <svg
                          className="crop-selection-overlay"
                          viewBox={`0 0 ${cropSourceSize?.width ?? 1} ${cropSourceSize?.height ?? 1}`}
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          <path
                            className="crop-selection-shade"
                            d={`M0 0H${cropSourceSize?.width ?? 1}V${cropSourceSize?.height ?? 1}H0Z M${cropOverlay.x} ${cropOverlay.y}h${cropOverlay.width}v${cropOverlay.height}h-${cropOverlay.width}Z`}
                            fillRule="evenodd"
                          />
                          <rect
                            className="crop-selection-rect"
                            x={cropOverlay.x}
                            y={cropOverlay.y}
                            width={cropOverlay.width}
                            height={cropOverlay.height}
                          />
                          {(() => {
                            const size = Math.max(
                              8,
                              Math.round(Math.min(cropSourceSize?.width ?? 8, cropSourceSize?.height ?? 8) * 0.02),
                            );
                            const half = size / 2;
                            const points: readonly (readonly [number, number])[] = [
                              [cropOverlay.x, cropOverlay.y],
                              [cropOverlay.x + cropOverlay.width / 2, cropOverlay.y],
                              [cropOverlay.x + cropOverlay.width, cropOverlay.y],
                              [cropOverlay.x + cropOverlay.width, cropOverlay.y + cropOverlay.height / 2],
                              [cropOverlay.x + cropOverlay.width, cropOverlay.y + cropOverlay.height],
                              [cropOverlay.x + cropOverlay.width / 2, cropOverlay.y + cropOverlay.height],
                              [cropOverlay.x, cropOverlay.y + cropOverlay.height],
                              [cropOverlay.x, cropOverlay.y + cropOverlay.height / 2],
                            ];
                            return points.map(([x, y], index) => (
                              <rect
                                className="crop-resize-handle"
                                key={index}
                                x={x - half}
                                y={y - half}
                                width={size}
                                height={size}
                              />
                            ));
                          })()}
                        </svg>
                      ) : null}
                      {sourcePreviewContent === "result-image" && inspectionCellOverlay !== null ? (
                        <svg className="inspection-cell-overlay" viewBox={`0 0 ${displayedWidth} ${displayedHeight}`} preserveAspectRatio="none" aria-hidden="true">
                          <rect {...inspectionCellOverlay} />
                        </svg>
                      ) : null}
                      {sourcePreviewContent === "result-image" && bitmapEditorSelectionOverlay !== null ? (
                        <svg className="bitmap-editor-selection-overlay" viewBox={`0 0 ${displayedWidth} ${displayedHeight}`} preserveAspectRatio="none" aria-hidden="true">
                          <rect {...bitmapEditorSelectionOverlay} />
                        </svg>
                      ) : null}
                      {sourcePreviewContent === "result-image" && tilemapEditorSelectionOverlay !== null ? (
                        <svg className="tilemap-selection-overlay" viewBox={`0 0 ${displayedWidth} ${displayedHeight}`} preserveAspectRatio="none" aria-hidden="true">
                          {highlightedTileCells.map((cellIndexRect) => <rect className="tilemap-matching-cell-outline" key={`${cellIndexRect.x},${cellIndexRect.y}`} {...cellIndexRect} />)}
                          <rect {...tilemapEditorSelectionOverlay} />
                        </svg>
                      ) : null}
                      {bitmapEditorActiveSide === "result" && sourcePreviewContent === "result-image" ? <>
                        <svg className="bitmap-editor-navigator-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" role="application" tabIndex={0} aria-label="Bitmap editor navigator · click or drag to pan" onPointerDown={(event) => beginBitmapEditorNavigatorDrag("source", event)} onPointerMove={moveBitmapEditorNavigatorDrag} onPointerUp={endBitmapEditorNavigatorDrag} onPointerCancel={endBitmapEditorNavigatorDrag}>
                          <rect x={bitmapEditorNavigatorViewport.left * 1000} y={bitmapEditorNavigatorViewport.top * 1000} width={bitmapEditorNavigatorViewport.width * 1000} height={bitmapEditorNavigatorViewport.height * 1000} />
                        </svg>
                        <span className="bitmap-editor-navigator-label">Navigator · drag to pan</span>
                      </> : null}
                    </div>
                  )}
              </div> : (
                <div className="preview-frame preview-content-card" aria-live="polite">
                  {sourcePreviewContent === "palette-usage" ? (
                    paletteUsage === null ? <p>Palette usage appears with the converted preview.</p> : (
                      <>
                        <p><strong>{paletteUsage.normalCells + paletteUsage.brightCells}</strong> attribute cells analyzed</p>
                        <label className="preview-filter-control"><span>Show</span><select value={paletteUsageFilter} onChange={(event) => setPaletteUsageFilter(event.target.value as "used" | "all")}><option value="used">Used colors only</option><option value="all">All colors</option></select></label>
                        <div className="usage-palette">
                          {visiblePaletteUsageColors.map((color) => {
                            const normalUsed = paletteUsage.normalColorCodes.includes(color.code);
                            const brightUsed = paletteUsage.brightColorCodes.includes(color.code);
                            return <button type="button" className={`usage-color usage-color-button ${normalUsed || brightUsed ? "used" : ""}${selectedPaletteColor === color.code ? " selected" : ""}`} key={color.code} aria-pressed={selectedPaletteColor === color.code} onClick={() => setSelectedPaletteColor(selectedPaletteColor === color.code ? null : color.code)}>
                              <span className="usage-swatches" aria-hidden="true"><span style={{ backgroundColor: color.normal }} /><span style={{ backgroundColor: color.bright }} /></span>
                              <span>{color.name}</span><small>N {paletteUsage.normalColorCounts[color.code]} ({paletteUsagePercent(paletteUsage.normalColorCounts[color.code] ?? 0)}) · B {paletteUsage.brightColorCounts[color.code]} ({paletteUsagePercent(paletteUsage.brightColorCounts[color.code] ?? 0)})</small>
                            </button>;
                          })}
                        </div>
                      </>
                    )
                  ) : sourcePreviewContent === "tile-usage" ? (
                    tileUsage.length === 0 ? <p>Run Tilemap High to inspect tile usage.</p> : <>
                      <label className="preview-filter-control"><span>Show</span><select value={tileUsageFilter} onChange={(event) => setTileUsageFilter(event.target.value as "used" | "all")}><option value="used">Used tiles only</option><option value="all">All tiles</option></select></label>
                      <div className="preview-usage-list">
                        {visibleTileUsage.map(({ characterIndex, count }) => <button type="button" className={`preview-usage-row${tileEditorSelected === characterIndex ? " selected" : ""}`} key={characterIndex} aria-pressed={tileEditorSelected === characterIndex} onClick={() => { selectUsedTile(characterIndex); }}><span>Tile {characterIndex} · {charsetSource === "existing" ? "Loaded" : "Calculated"}</span><strong>{count} cells</strong></button>)}
                      </div>
                    </>
                  ) : sourcePreviewContent === "unified-editor" ? (
                    unifiedEditorPreview
                  ) : sourcePreviewContent === "pre-attribute" || sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2" || sourcePreviewContent === "merged-low" || sourcePreviewContent === "merged-high" ? (
                    windowImageFor(sourcePreviewContent)
                  ) : sourcePreviewContent === "difference" ? (
                    differencePreviewDataUrl === null ? <p>Convert an image to inspect the difference heatmap.</p> : <img className="preview-difference-image" src={differencePreviewDataUrl} alt="Difference heatmap between adjusted source and output" />
                  ) : inspection === null ? <p>Point at the converted preview, or focus it and use arrow keys, to inspect a cell.</p> : (
                    <dl className="attribute-readout">
                      <div><dt>Pixel</dt><dd>{inspection.pixelX}, {inspection.pixelY}</dd></div>
                      <div><dt>Cell</dt><dd>{inspection.cellX}, {inspection.cellY}</dd></div>
                      <div><dt>Attribute</dt><dd>{inspection.attributeHex} · offset {inspection.attributeOffset}</dd></div>
                      <div><dt>INK / PAPER</dt><dd>{inspection.ink} / {inspection.paper}</dd></div>
                      <div><dt>BRIGHT</dt><dd>{inspection.bright ? "On" : "Off"}</dd></div>
                    </dl>
                  )}
                </div>
              )}
              {isPmd && targetModeId === "pmd85-2-tv" ? (
                <p className="pmd-tv-note">
                  Blink animation is unsupported. Bit 7 is accepted and displayed as static intensity: 10 Bright, 11 Dim.
                </p>
              ) : null}
              {workbenchSourceFloating ? (
                <div
                  className="workbench-floating-resize-handle"
                  role="button"
                  tabIndex={0}
                  aria-label="Resize Source preview window"
                  onPointerDown={(event) => startWorkbenchFloatingResize("source", event)}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 32 : 8;
                    if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("source", step, 0);
                    if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("source", -step, 0);
                    if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("source", 0, step);
                    if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("source", 0, -step);
                  }}
                />
              ) : null}
            </section>
            );
            return sourceDock !== "center" && sourceDockTarget !== null
              ? createPortal(sourcePreviewPane, sourceDockTarget, "source-preview")
              : sourcePreviewPane;
            })()}
            {(() => {
            const resultDock = workbenchWindowLayout("result").dock;
            const resultDockTarget = workbenchDockLayerFor(resultDock);
            const resultPreviewPane = (
            <section
              className={`preview-panel result-panel${workbenchResultFloating ? ` preview-panel-floating preview-result-window${workbenchResultFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : " preview-panel-docked"} ${workspaceMode === "tilemap" ? "tilemap-preview-panel" : ""}`}
              {...workbenchWindowDragAttributes("result")}
              data-workbench-window="result"
              hidden={!workbenchWindowLayout("result").visible}
              data-dock={resultDock}
              data-minimized={workbenchWindowLayout("result").minimized ? "true" : "false"}
              aria-labelledby="result-preview-title"
              style={workbenchDockWindowStyle("result", workbenchResultFloating ? { zIndex: workbenchWindowZIndex("result") } : undefined)}
              onPointerDown={() => { if (workbenchResultFloating) bringWorkbenchWindowToFront("result"); }}
              onFocusCapture={() => { if (workbenchResultFloating) bringWorkbenchWindowToFront("result"); }}
            >
              {!workbenchResultFloating && resultDock === "center" ? (
                <div
                  className="preview-docked-resize-handle preview-result-docked-resize"
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize Result preview"
                  aria-valuemin={240}
                  aria-valuemax={Math.max(240, (workbenchPreviewWorkspaceRef.current?.clientWidth ?? 1200) - 288)}
                  aria-valuenow={Math.min(Math.max(240, (workbenchPreviewWorkspaceRef.current?.clientWidth ?? 1200) - 288), Math.round(workbenchResultDockedWidth * Math.max(480, (workbenchPreviewWorkspaceRef.current?.clientWidth ?? 1200) - 80)))}
                  tabIndex={0}
                  onPointerDown={(event) => startWorkbenchDockedPreviewResize("result", event)}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 0.08 : 0.02;
                    if (event.key === "ArrowRight") setWorkbenchResultDockedWidth((width) => Math.min(10, width + step));
                    if (event.key === "ArrowLeft") setWorkbenchResultDockedWidth((width) => Math.max(0.25, width - step));
                  }}
                />
              ) : null}
              <div
                className="preview-panel-heading"
                tabIndex={0}
                onPointerDown={(event) => startWorkbenchTitlebarDrag("result", event)}
                onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("result", event)}
                onClick={(event) => handleWorkbenchTitlebarClick("result", event)}
              >
                <h3 className="preview-panel-title" id="result-preview-title">{resultPreviewContent === "image" || resultPreviewContent === "result-image" ? resultLabel : resultPreviewContent === "source-image" ? "Conversion input" : resultPreviewContent === "bitmap-editor" ? "Bitmap editor" : resultPreviewContent === "pre-attribute" ? "Pre-attribute dither" : resultPreviewContent === "screen-1" ? hasVerticalSpatialTarget ? "Full resolution" : "Screen 1" : resultPreviewContent === "screen-2" ? hasVerticalSpatialTarget ? "Analytic" : "Screen 2" : resultPreviewContent === "merged-low" ? "Merged · low resolution" : resultPreviewContent === "merged-high" ? "Merged · high resolution" : resultPreviewContent === "palette-usage" ? "Palette usage" : resultPreviewContent === "tile-usage" ? "Used tiles" : resultPreviewContent === "unified-editor" ? "Unified editor" : resultPreviewContent === "difference" ? "Difference heatmap" : "Inspector"}</h3>
                {workbenchWindowActions("result", true)}
                <label className="preview-content-selector">
                  <span className="sr-only">Result window content</span>
                  <select
                    value={resultPreviewContent}
                    disabled={bitmapEditorActiveSide === "source"}
                    onChange={(event) => {
                      selectPreviewContent("result", event.target.value as PreviewContent);
                    }}
                  >
                    <option value="image">Result image</option>
                    <option value="source-image">Source image</option>
                    {workspaceMode === "palette" ? <option value="pre-attribute">Pre-attribute dither</option> : null}
                    {hasMixedScreenTarget ? <>
                      <option value="screen-1">Screen 1</option>
                      <option value="screen-2">Screen 2</option>
                    </> : null}
                    {hasVerticalSpatialTarget ? <>
                      <option value="screen-1">Full resolution</option>
                      <option value="screen-2">Analytic</option>
                    </> : null}
                    {hasQlMixedResolutionTarget ? <>
                      <option value="merged-low">Merged · low resolution</option>
                      <option value="merged-high">Merged · high resolution</option>
                    </> : null}
                    <option value="palette-usage">Palette usage</option>
                    {workspaceMode === "tilemap" ? <option value="tile-usage">Used tiles</option> : null}
                    <option value="unified-editor">Unified editor</option>
                    {workspaceMode === "palette" ? <option value="bitmap-editor">Bitmap editor</option> : null}
                    <option value="difference">Difference heatmap</option>
                    <option value="inspector">Inspector</option>
                  </select>
                </label>
                <div className="preview-zoom-actions" aria-label="Result preview zoom">
                  <button className="secondary compact" type="button" aria-label="Zoom out Result preview" title="Zoom out" onClick={() => stepPreviewZoom("result", -1)} disabled={bitmapEditorActiveSide === "source" || resultPreviewZoom === "fit"}>−</button>
                  <button className="secondary compact" type="button" aria-label="Zoom in Result preview" title="Zoom in" onClick={() => stepPreviewZoom("result", 1)} disabled={bitmapEditorActiveSide === "source" || resultPreviewZoom === 16}>+</button>
                  <button className="secondary compact" type="button" aria-label="Fit Result preview" title="Fit" onClick={() => fitPreview("result")}>%</button>
                </div>
                {workbenchResultFloating ? (
                  <span
                    className="workbench-window-drag-handle"
                    role="button"
                    tabIndex={0}
                    aria-label="Move Result preview window"
                    title="Drag to move Result preview"
                    onPointerDown={(event) => startWorkbenchSectionDrag("result", event)}
                    onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
                    onKeyDown={(event) => {
                      const step = event.shiftKey ? 32 : 8;
                      if (event.key === "ArrowLeft") setWorkbenchResultFloatingX((x) => Math.max(8, x - step));
                      if (event.key === "ArrowRight") setWorkbenchResultFloatingX((x) => x + step);
                      if (event.key === "ArrowUp") setWorkbenchResultFloatingY((y) => Math.max(8, y - step));
                      if (event.key === "ArrowDown") setWorkbenchResultFloatingY((y) => y + step);
                    }}
                  >⠿</span>
                ) : null}
              </div>
              {workbenchDockSplitHandle("result")}
              {resultPreviewContent === "bitmap-editor" ? fullBitmapEditorPreview("result") : resultPreviewContent === "image" || resultPreviewContent === "result-image" || resultPreviewContent === "source-image" || (hasVerticalSpatialTarget && (resultPreviewContent === "screen-1" || resultPreviewContent === "screen-2")) ? <div
                className={`preview-frame preview-viewport zx-preview ${draggingSide === "result" ? "dragging" : ""}`}
                ref={resultViewportRef}
                onScroll={(event) => handlePreviewScroll("result", event)}
                onPointerDown={(event) => beginPreviewDrag("result", event)}
                onPointerMove={movePreviewDrag}
                onPointerUp={endPreviewDrag}
                onPointerCancel={endPreviewDrag}
                onWheel={(event) => handlePreviewWheel("result", event)}
                onFocusCapture={() => markPanSource("result")}
                style={{ backgroundColor: borderHex, borderColor: borderHex }}
              >
                {((resultPreviewContent === "source-image" && image !== null) ||
                  (standaloneTilemapPreview && (resultPreviewContent === "image" || resultPreviewContent === "result-image")) ||
                  (displayedResult !== null &&
                    (workspaceMode === "palette" || charsetState.kind === "ready")))
                  ? (
                    <div
                      className={[
                        "preview-stage",
                        resultZoom === "fit" ? "fit-stage" : "",
                        resultPreviewContent === "source-image" ? "source-image-stage" : "",
                        showPixelGrid && resultZoom !== "fit" && resultZoom >= 4 ? "show-pixel-grid" : "",
                        showAttributeGrid ? "show-attribute-grid" : "",
                      ].filter(Boolean).join(" ")}
                      style={{
                        width: resultFitStageSize !== null ? `${resultFitStageSize.width}px` : resultStageWidth,
                        height: resultFitStageSize !== null ? `${resultFitStageSize.height}px` : undefined,
                        aspectRatio: resultStageAspectRatio,
                      }}
                    >
                      <canvas
                        ref={resultPreviewContent === "source-image" ? canvasRef : convertedCanvasRef}
                        className={tilemapPutActive && unifiedTileEditorContext === "stamp" && workspaceMode === "tilemap" && resultPreviewContent !== "source-image" ? "tilemap-put-cursor" : undefined}
                        aria-label={resultPreviewContent === "source-image" ? "Decoded source image preview" : "Converted hardware preview"}
                        aria-describedby="inspection-help"
                        tabIndex={resultPreviewContent === "source-image" ? undefined : 0}
                        onPointerMove={resultPreviewContent === "source-image" ? undefined : tilemapPutActive && unifiedTileEditorContext === "stamp" && workspaceMode === "tilemap" ? handleTilemapPutPointerMove : inspectResultPixel}
                        onPointerDown={resultPreviewContent === "source-image" ? undefined : tilemapPutActive && unifiedTileEditorContext === "stamp" && workspaceMode === "tilemap" ? handleTilemapPutPointerDown : selectResultPixel}
                        onPointerUp={resultPreviewContent === "source-image" ? undefined : handleTilemapPutPointerEnd}
                        onPointerCancel={resultPreviewContent === "source-image" ? undefined : handleTilemapPutPointerEnd}
                        onDoubleClick={resultPreviewContent === "source-image" ? undefined : clearBitmapEditorSelectionOnDoubleClick}
                        onKeyDown={resultPreviewContent === "source-image" ? undefined : handleInspectorKey}
                      />
                      <svg
                        className="pixel-grid-overlay"
                        viewBox={`0 0 ${displayedWidth} ${displayedHeight}`}
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <path d={gridPathForDimensions(displayedWidth, displayedHeight, 1, 1)} vectorEffect="non-scaling-stroke" />
                      </svg>
                      {(isZx || isPmd) && bitmapEditorActiveSide !== "source" ? <svg
                        className="attribute-grid-overlay"
                        viewBox={`0 0 ${displayedWidth} ${displayedHeight}`}
                        preserveAspectRatio="none"
                        aria-hidden="true"
                      >
                        <path d={gridPathForDimensions(displayedWidth, displayedHeight, isPmd ? 6 : 8, isPmd ? (targetModeId === "pmd85-colorace" ? 2 : 1) : displayedAttributeHeight)} vectorEffect="non-scaling-stroke" />
                      </svg> : null}
                      {resultPreviewContent !== "source-image" && inspectionCellOverlay !== null ? (
                        <svg className="inspection-cell-overlay" viewBox={`0 0 ${displayedWidth} ${displayedHeight}`} preserveAspectRatio="none" aria-hidden="true">
                          <rect {...inspectionCellOverlay} />
                        </svg>
                      ) : null}
                      {resultPreviewContent !== "source-image" && bitmapEditorSelectionOverlay !== null ? (
                        <svg className="bitmap-editor-selection-overlay" viewBox={`0 0 ${displayedWidth} ${displayedHeight}`} preserveAspectRatio="none" aria-hidden="true">
                          <rect {...bitmapEditorSelectionOverlay} />
                        </svg>
                      ) : null}
                      {resultPreviewContent !== "source-image" && tilemapEditorSelectionOverlay !== null ? (
                        <svg className="tilemap-selection-overlay" viewBox={`0 0 ${displayedWidth} ${displayedHeight}`} preserveAspectRatio="none" aria-hidden="true">
                          {highlightedTileCells.map((cellIndexRect) => <rect className="tilemap-matching-cell-outline" key={`${cellIndexRect.x},${cellIndexRect.y}`} {...cellIndexRect} />)}
                          <rect {...tilemapEditorSelectionOverlay} />
                        </svg>
                      ) : null}
                      {bitmapEditorActiveSide === "source" && (resultPreviewContent === "image" || resultPreviewContent === "result-image") ? <>
                        <svg className="bitmap-editor-navigator-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" role="application" tabIndex={0} aria-label="Bitmap editor navigator · click or drag to pan" onPointerDown={(event) => beginBitmapEditorNavigatorDrag("result", event)} onPointerMove={moveBitmapEditorNavigatorDrag} onPointerUp={endBitmapEditorNavigatorDrag} onPointerCancel={endBitmapEditorNavigatorDrag}>
                          <rect x={bitmapEditorNavigatorViewport.left * 1000} y={bitmapEditorNavigatorViewport.top * 1000} width={bitmapEditorNavigatorViewport.width * 1000} height={bitmapEditorNavigatorViewport.height * 1000} />
                        </svg>
                        <span className="bitmap-editor-navigator-label">Navigator · drag to pan</span>
                      </> : null}
                      {workspaceMode === "tilemap" && tilemapStale ? (
                        <span className="stale-preview-badge">
                          Stale · press Convert High
                        </span>
                      ) : null}
                      </div>
                  )
                  : <p className="preview-placeholder">
                      {workspaceMode === "tilemap"
                        ? charsetState.kind === "running"
                          ? "Building decoder reconstruction…"
                          : "Run Tilemap High to generate the reconstruction."
                        : "A Draft preview will appear automatically."}
                    </p>}
              </div> : (
                <div className="preview-frame preview-content-card" aria-live="polite">
                  {resultPreviewContent === "palette-usage" ? (
                    paletteUsage === null ? <p>Palette usage appears with the converted preview.</p> : (
                      <>
                        <p><strong>{paletteUsage.normalCells + paletteUsage.brightCells}</strong> attribute cells analyzed · <strong>{paletteUsage.normalColorCodes.length + paletteUsage.brightColorCodes.length}</strong> colors used</p>
                        <label className="preview-filter-control"><span>Show</span><select value={paletteUsageFilter} onChange={(event) => setPaletteUsageFilter(event.target.value as "used" | "all")}><option value="used">Used colors only</option><option value="all">All colors</option></select></label>
                        <div className="usage-palette">
                          {visiblePaletteUsageColors.map((color) => {
                            const normalUsed = paletteUsage.normalColorCodes.includes(color.code);
                            const brightUsed = paletteUsage.brightColorCodes.includes(color.code);
                            return <button type="button" className={`usage-color usage-color-button ${normalUsed || brightUsed ? "used" : ""}${selectedPaletteColor === color.code ? " selected" : ""}`} key={color.code} aria-pressed={selectedPaletteColor === color.code} onClick={() => setSelectedPaletteColor(selectedPaletteColor === color.code ? null : color.code)}>
                              <span className="usage-swatches" aria-hidden="true"><span style={{ backgroundColor: color.normal }} /><span style={{ backgroundColor: color.bright }} /></span>
                              <span>{color.name}</span><small>N {paletteUsage.normalColorCounts[color.code]} ({paletteUsagePercent(paletteUsage.normalColorCounts[color.code] ?? 0)}) · B {paletteUsage.brightColorCounts[color.code]} ({paletteUsagePercent(paletteUsage.brightColorCounts[color.code] ?? 0)})</small>
                            </button>;
                          })}
                        </div>
                      </>
                    )
                  ) : resultPreviewContent === "tile-usage" ? (
                    tileUsage.length === 0 ? <p>Run Tilemap High to inspect tile usage.</p> : <>
                      <label className="preview-filter-control"><span>Show</span><select value={tileUsageFilter} onChange={(event) => setTileUsageFilter(event.target.value as "used" | "all")}><option value="used">Used tiles only</option><option value="all">All tiles</option></select></label>
                      <div className="preview-usage-list">{visibleTileUsage.map(({ characterIndex, count }) => <button type="button" className={`preview-usage-row${tileEditorSelected === characterIndex ? " selected" : ""}`} key={characterIndex} aria-pressed={tileEditorSelected === characterIndex} onClick={() => { selectUsedTile(characterIndex); }}><span>Tile {characterIndex} · {charsetSource === "existing" ? "Loaded" : "Calculated"}</span><strong>{count} cells</strong></button>)}</div>
                    </>
                  ) : resultPreviewContent === "unified-editor" ? (
                    unifiedEditorPreview
                  ) : resultPreviewContent === "pre-attribute" || resultPreviewContent === "screen-1" || resultPreviewContent === "screen-2" || resultPreviewContent === "merged-low" || resultPreviewContent === "merged-high" ? (
                    windowImageFor(resultPreviewContent)
                  ) : resultPreviewContent === "difference" ? (
                    differencePreviewDataUrl === null ? <p>Convert an image to inspect the difference heatmap.</p> : <img className="preview-difference-image" src={differencePreviewDataUrl} alt="Difference heatmap between adjusted source and output" />
                  ) : inspection === null ? <p>Point at the converted preview, or focus it and use arrow keys, to inspect a cell.</p> : <dl className="attribute-readout"><div><dt>Pixel</dt><dd>{inspection.pixelX}, {inspection.pixelY}</dd></div><div><dt>Cell</dt><dd>{inspection.cellX}, {inspection.cellY}</dd></div><div><dt>Attribute</dt><dd>{inspection.attributeHex} · offset {inspection.attributeOffset}</dd></div><div><dt>INK / PAPER</dt><dd>{inspection.ink} / {inspection.paper}</dd></div><div><dt>BRIGHT</dt><dd>{inspection.bright ? "On" : "Off"}</dd></div></dl>}
                </div>
              )}
              {workspaceMode === "palette" ? (
              <div
                className="output-palette-bar"
                aria-label={`${outputPreviewStage === "merged"
                  ? targetModeId.includes("vertical-spatial")
                    ? "Analytic mixed used"
                    : "Merged used"
                  : outputPreviewStage === "screen-2"
                    ? targetModeId.includes("vertical-spatial")
                      ? "Analytic mixed used"
                      : "Screen 2 selected"
                    : "Screen 1 selected"} palette`}
              >
                {outputPaletteColors.map((color) => (
                  <span
                    key={color.key}
                    title={color.title}
                    style={{ background: color.background }}
                  />
                ))}
              </div>
              ) : null}
              {workbenchResultFloating ? (
                <div
                  className="workbench-floating-resize-handle"
                  role="button"
                  tabIndex={0}
                  aria-label="Resize Result preview window"
                  onPointerDown={(event) => startWorkbenchFloatingResize("result", event)}
                  onKeyDown={(event) => {
                    const step = event.shiftKey ? 32 : 8;
                    if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("result", step, 0);
                    if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("result", -step, 0);
                    if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("result", 0, step);
                    if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("result", 0, -step);
                  }}
                />
              ) : null}
            </section>
            );
            return resultDock !== "center" && resultDockTarget !== null
              ? createPortal(resultPreviewPane, resultDockTarget, "result-preview")
              : resultPreviewPane;
            })()}
          </div>

          {showPixelGrid && (previewZoom === "fit" || previewZoom < 4) ? (
            <p className="control-help" role="status">Pixel grid becomes visible at 4:1 zoom.</p>
          ) : null}

          <details
            className="inspection-drawer"
            open={inspectionDrawerOpen}
            onToggle={(event) => setInspectionDrawerOpen(event.currentTarget.open)}
          >
            <summary>Inspection details and palette usage</summary>
            <div className="inspection-details">
              <section aria-labelledby="cell-inspector-title">
              <h3 id="cell-inspector-title">
                {workspaceMode === "tilemap"
                  ? "Tilemap inspector"
                  : "Attribute inspector"}
              </h3>
              <p id="inspection-help">Point at the converted preview, or focus it and use arrow keys. Hold Shift to move eight pixels.</p>
              {inspection === null ? null : (
                workspaceMode === "tilemap" && inspectedTileIndex !== null &&
                charsetState.kind === "ready" &&
                inspectedTileAssignment !== null ? (
                <dl className="attribute-readout" aria-live="polite">
                  <div><dt>Cell</dt><dd>{inspection.cellX}, {inspection.cellY} · index {inspectedTileIndex}</dd></div>
                  <div><dt>Character</dt><dd>{inspectedTileAssignment.characterIndex}</dd></div>
                  <div><dt>Transform</dt><dd>{inspectedTileAssignment.transform}</dd></div>
                  <div><dt>Polarity</dt><dd>{inspectedTileAssignment.inverted ? "INK/PAPER swapped" : "Normal"}</dd></div>
                  <div><dt>Cell error</dt><dd>{inspectedTileAssignment.distance.toFixed(6)}</dd></div>
                  <div>
                    <dt>Attributes</dt>
                    <dd>
                      original 0x{(lastFinal?.frames[0]?.encoded[
                        6144 + inspectedTileIndex
                      ] ?? 0).toString(16).padStart(2, "0")} · decoded 0x{
                        (charsetState.result.attributes[inspectedTileIndex] ?? 0)
                          .toString(16).padStart(2, "0")
                      }
                    </dd>
                  </div>
                  <div>
                    <dt>Mapping</dt>
                    <dd>
                      0x{(charsetState.result.artifact[
                        inspectedTileIndex + CHARSET_ARTIFACT_HEADER_BYTES
                      ] ?? 0)
                        .toString(16).padStart(2, "0")}
                    </dd>
                  </div>
                  <div>
                    <dt>Charset</dt>
                    <dd>
                      {Array.from(charsetState.result.charset.subarray(
                        inspectedTileAssignment.characterIndex * 8,
                        inspectedTileAssignment.characterIndex * 8 + 8,
                      )).map((value) =>
                        value.toString(16).padStart(2, "0")).join(" ")}
                    </dd>
                  </div>
                </dl>
                ) : (
                <dl className="attribute-readout" aria-live="polite">
                  <div><dt>Pixel</dt><dd>{inspection.pixelX}, {inspection.pixelY} · bit {inspection.pixel}</dd></div>
                  <div><dt>Cell</dt><dd>{inspection.cellX}, {inspection.cellY} · 8×{displayedAttributeHeight}</dd></div>
                  <div><dt>Attribute</dt><dd>{inspection.attributeHex} · offset {inspection.attributeOffset}</dd></div>
                  <div><dt>INK</dt><dd>{inspection.ink} · {ZX_BASE_COLORS[inspection.ink]?.name}</dd></div>
                  <div><dt>PAPER</dt><dd>{inspection.paper} · {ZX_BASE_COLORS[inspection.paper]?.name}</dd></div>
                  <div><dt>BRIGHT</dt><dd>{inspection.bright ? "On" : "Off"} · shared</dd></div>
                  <div><dt>Bitmap</dt><dd>{inspection.bitmapBytes.map((value) => value.toString(16).padStart(2, "0")).join(" ")}</dd></div>
                </dl>
                )
              )}
              </section>
              {workspaceMode === "tilemap" && charsetState.kind === "ready" ? (
              <section aria-labelledby="tilemap-diagnostics-title">
                <h3 id="tilemap-diagnostics-title">Tilemap diagnostics</h3>
                <p
                  className={`diagnostics-state ${tilemapStale ? "stale" : "current"}`}
                  role="status"
                >
                  {tilemapStale
                    ? "Stale · values describe the previous Tilemap High result."
                    : "Current · values match the displayed reconstruction."}
                </p>
                <dl className="attribute-readout">
                  <div><dt>Available</dt><dd>{glyphCount}</dd></div>
                  <div><dt>Active</dt><dd>{glyphActiveCount}</dd></div>
                  <div><dt>Emitted</dt><dd>{charsetState.result.characterCount}</dd></div>
                  <div><dt>Used</dt><dd>{charsetState.result.diagnostics.usedCharacterCount}</dd></div>
                  <div><dt>Source patterns</dt><dd>{charsetState.result.diagnostics.uniqueCanonicalTiles}</dd></div>
                  <div><dt>Exact cells</dt><dd>{charsetState.result.diagnostics.exactMatches} / 768</dd></div>
                  <div><dt>RGB similarity</dt><dd>{charsetState.result.diagnostics.rgbSimilarityPercent.toFixed(2)}%</dd></div>
                  <div><dt>RGB RMSE</dt><dd>{charsetState.result.diagnostics.rgbRmse.toFixed(2)}</dd></div>
                  <div><dt>Mean cell error</dt><dd>{charsetState.result.diagnostics.averageStructuralError.toFixed(5)}</dd></div>
                  <div><dt>Maximum cell error</dt><dd>{charsetState.result.diagnostics.maximumStructuralError.toFixed(5)}</dd></div>
                  <div><dt>Global objective</dt><dd>{charsetState.result.diagnostics.globalObjective?.toFixed(5) ?? "—"}</dd></div>
                  <div><dt>Refinement passes</dt><dd>{charsetState.result.diagnostics.refinementPasses ?? "—"}</dd></div>
                  <div><dt>Initial RGB error</dt><dd>{charsetState.result.diagnostics.initialRgbSquaredError?.toLocaleString() ?? "—"}</dd></div>
                  <div><dt>Final RGB error</dt><dd>{charsetState.result.diagnostics.finalRgbSquaredError?.toLocaleString() ?? "—"}</dd></div>
                  <div><dt>Multiscale error</dt><dd>{charsetState.result.diagnostics.multiscaleError?.toFixed(2) ?? "—"}</dd></div>
                  <div><dt>Edge error</dt><dd>{charsetState.result.diagnostics.edgeError?.toFixed(2) ?? "—"}</dd></div>
                  <div><dt>RGB boundary error</dt><dd>{charsetState.result.diagnostics.rgbBoundaryError?.toFixed(2) ?? "—"}</dd></div>
                  <div><dt>Saliency error</dt><dd>{charsetState.result.diagnostics.saliencyError?.toFixed(2) ?? "—"}</dd></div>
                  <div><dt>Medoid swaps</dt><dd>{charsetState.result.diagnostics.medoidSwaps ?? "—"}</dd></div>
                  <div><dt>Assignment changes</dt><dd>{charsetState.result.diagnostics.assignmentChanges ?? "—"}</dd></div>
                  <div><dt>V4 candidates</dt><dd>{charsetState.result.diagnostics.candidatesEvaluated?.toLocaleString() ?? "—"}</dd></div>
                  <div><dt>Equivalent candidates pruned</dt><dd>{charsetState.result.diagnostics.equivalentCandidatesPruned?.toLocaleString() ?? "—"}</dd></div>
                  <div><dt>Cells recomputed</dt><dd>{charsetState.result.diagnostics.cellsRecomputed?.toLocaleString() ?? "—"}</dd></div>
                  <div><dt>RGB boundary terms</dt><dd>{charsetState.result.diagnostics.boundaryTermsRecomputed?.toLocaleString() ?? "—"}</dd></div>
                  <div><dt>Candidate cache hits</dt><dd>{charsetState.result.diagnostics.candidateCacheHits?.toLocaleString() ?? "—"}</dd></div>
                  <div>
                    <dt>Transformed cells</dt>
                    <dd>
                      {charsetState.result.diagnostics.transformHistogram
                        .slice(1)
                        .reduce((sum, count) => sum + count, 0)}
                    </dd>
                  </div>
                  <div><dt>Polarity swaps</dt><dd>{charsetState.result.diagnostics.polaritySwaps}</dd></div>
                  <div>
                    <dt>Memory total</dt>
                    <dd>{charsetState.result.diagnostics.memory.totalBytes.toLocaleString()} B</dd>
                  </div>
                  <div>
                    <dt>Map</dt>
                    <dd>{charsetState.result.diagnostics.memory.tilemapBytes.toLocaleString()} B</dd>
                  </div>
                  <div>
                    <dt>Header</dt>
                    <dd>{(charsetState.result.diagnostics.memory.headerBytes ?? 0).toLocaleString()} B</dd>
                  </div>
                  <div>
                    <dt>Attributes</dt>
                    <dd>{charsetState.result.diagnostics.memory.attributeBytes.toLocaleString()} B</dd>
                  </div>
                  <div>
                    <dt>Transforms</dt>
                    <dd>{charsetState.result.diagnostics.memory.transformBytes.toLocaleString()} B</dd>
                  </div>
                  <div>
                    <dt>Charset</dt>
                    <dd>{charsetState.result.diagnostics.memory.charsetBytes.toLocaleString()} B</dd>
                  </div>
                </dl>
              </section>
              ) : null}
            </div>
          </details>
        </section>
        <div
          className="workbench-preview-layer"
          ref={setWorkbenchPreviewLayer}
          aria-label="Floating preview windows"
        />
      </section>
    </main>
    </>
  );
}
