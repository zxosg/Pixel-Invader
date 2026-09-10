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
  type CSSProperties,
  type UIEvent as ReactUIEvent,
  type WheelEvent as ReactWheelEvent,
} from "react";
import {
  assertValidSoftwareScr,
  zxBitmapOffset,
  zxSoftwareScrBytes,
} from "@retro-converter/zx-spectrum";
import { encodeRgbaPng } from "@retro-converter/image-codecs";
import { assertValidQlScreen } from "@retro-converter/sinclair-ql";
import {
  PMD85_SCREEN_HEIGHT,
  PMD85_SCREEN_WIDTH,
  assertValidPmd85Screen,
  extractPmd85GapBytes,
  type Pmd85ModeId,
  type Pmd85RgbColor,
} from "@retro-converter/pmd-85";
import {
  APPLICATION_DISPLAY_VERSION,
  buildConversionMetadata,
  sanitizeArtifactBaseName,
  sha256Hex,
} from "./artifacts.js";
import {
  createCompletedProject,
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
} from "@retro-converter/zx-charset";
import {
  applyTileEdit,
  encodeCharsetArtifact,
  decodeCharsetArtifact,
  renderCharsetPreview,
  replaceTileInCharset,
  appendBlankTile,
  reorderCharsetTiles,
  type TileEditOperation,
} from "@retro-converter/zx-charset";
import type { TilemapEditorSnapshot } from "./tilemap-editor.js";
import {
  allCharsetIndices,
  effectiveCharsetSelection,
  invertCharsetSelection as invertSelection,
  remapCharsetSelection,
  toggleCharsetSelection,
} from "./charset-selection.js";
import {
  ATTRIBUTE_OPTIMIZERS,
  buildVerticalSpatialAnalyticPreview,
  DEFAULT_CONVERSION_SETTINGS,
  DITHER_ENGINES,
  ORDERED_MATRICES,
  ditherMethodForEngine,
  isCompatibleEnginePair,
  latestDitherEngineForMethod,
  fillGeometryForDimensions,
  outputScreenCount,
  orderedPerturbationDiagnostics,
  paletteSelectionsMatch,
  qlHardwareModesForTarget,
  type AttributeOptimizerId,
  type AttributeHaloRadius,
  type AttributeHeight,
  type BrightMode,
  type ConversionSettings,
  type CropAspectRatio,
  type DitheringMethod,
  type DitherEngineId,
  type FramingMode,
  type OrderedMatrixId,
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
  fitCropPreviewFrame,
  moveCropFromDrag,
  orientedSourceSize,
  pointIsInsideCrop,
  previewPointToSource,
  resizeCropToAspect,
  selectionFromDrag,
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
import {
  loadEnginePreferences,
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
  saveWorkbenchPreferences,
  type WorkbenchDock,
  type WorkbenchSettingsSection,
  type WorkbenchWindowId,
} from "./workbench-preferences.js";
import {
  createSavedWorkbenchLayoutId,
  loadSavedWorkbenchLayouts,
  normalizeSavedLayoutName,
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
  SETTING_CATEGORIES,
  SETTING_FILTER_PRESETS,
  SETTINGS_REGISTRY,
  createSettingsDraft,
  filterSettings,
  validateSettingsDraft,
  type SettingCategory,
  type SettingDefinition,
  type SettingPresetId,
} from "./settings-registry.js";
import {
  mergeMonochromeRgba,
  zxBitmapToMonochromeRgba,
} from "./monochrome-preview.js";
import {
  applyBitmapCellEdit,
  type BitmapCell,
  type BitmapCellEditOperation,
} from "./bitmap-editor.js";
import {
  cloneBitmapBuffer,
  paintPixel,
  type BitmapEditorBuffer,
  type BitmapPixelColor,
  type BitmapPaintMode,
} from "./full-bitmap-editor.js";
import { resolvePreviewAspect } from "./preview-aspect.js";
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

const NEW_WORKSPACE_VALUE = "__new_workspace__";
const NEW_WORKSPACE_LABEL = "<new name>";

type ConversionState =
  | { readonly kind: "idle" }
  | { readonly kind: "running" }
  | { readonly kind: "ready"; readonly result: WorkerConversionResult }
  | { readonly kind: "stale" }
  | { readonly kind: "error"; readonly message: string };

type DraftState = RetainedDraftState<WorkerConversionResult>;

type CharsetState =
  | { readonly kind: "idle" }
  | { readonly kind: "running" }
  | { readonly kind: "ready"; readonly result: WorkerCharsetResult }
  | { readonly kind: "error"; readonly message: string };

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
type WorkbenchFloatingSection = "geometry" | "adjustments" | "palette" | "dithering";

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
const ORDERED_MATRIX_IDS: readonly OrderedMatrixId[] = [
  "checkerboard-2x1",
  "bayer-2x2",
  "bayer-4x4",
  "bayer-8x8",
  "clustered-dot-4x4",
  "clustered-dot-8x8",
  "void-cluster-8x8",
];

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
    `<rect width="8" height="8" fill="#000"/><g fill="${active ? "#fff" : "#174a7e"}">${pixels.join("")}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
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

  const frame = fitCropPreviewFrame(oriented);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 256, 192);
  context.save();
  context.translate(
    frame.x + (mirrorHorizontal ? frame.width : 0),
    frame.y + (mirrorVertical ? frame.height : 0),
  );
  context.scale(mirrorHorizontal ? -1 : 1, mirrorVertical ? -1 : 1);
  context.drawImage(rotatedCanvas, 0, 0, frame.width, frame.height);
  context.restore();
}

interface RangeNumberControlProps {
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly unit?: string;
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
  return (
    <label>
      <span>{label}</span>
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
    </label>
  );
}

export function App() {
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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const convertedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bitmapEditorSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bitmapEditorResultCanvasRef = useRef<HTMLCanvasElement | null>(null);
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
    readonly mode: "create" | "move";
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
    readonly startX: number;
    readonly startY: number;
    readonly scrollLeft: number;
    readonly scrollTop: number;
  } | null>(null);
  const bitmapEditorSpaceRef = useRef(false);
  const existingCharsetSelectionRef =
    useRef<readonly number[] | null>(null);
  const [state, setState] = useState<ConversionState>({ kind: "idle" });
  const [draftState, setDraftState] = useState<DraftState>({ kind: "idle" });
  const [lastFinal, setLastFinal] = useState<WorkerConversionResult | null>(null);
  const [charsetState, setCharsetState] = useState<CharsetState>({ kind: "idle" });
  const [tileEditorSelected, setTileEditorSelected] = useState(0);
  const [tileEditorOriginals, setTileEditorOriginals] = useState<readonly (Uint8Array | null)[]>([]);
  const [tileEditorUndo, setTileEditorUndo] = useState<readonly TilemapEditorSnapshot[]>([]);
  const [tileEditorRedo, setTileEditorRedo] = useState<readonly TilemapEditorSnapshot[]>([]);
  const [tileEditorEdited, setTileEditorEdited] = useState(false);
  const [tilemapEditorCell, setTilemapEditorCell] = useState<number | null>(null);
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
  const [bitmapEditorPaintMode, setBitmapEditorPaintMode] = useState<BitmapPaintMode>("toggle");
  const [bitmapEditorInkColor, setBitmapEditorInkColor] = useState<number | null>(null);
  const [bitmapEditorPaperColor, setBitmapEditorPaperColor] = useState<number | null>(null);
  const [bitmapEditorBrightPolicy, setBitmapEditorBrightPolicy] = useState<boolean | null>(null);
  const [bitmapEditorFlashPolicy, setBitmapEditorFlashPolicy] = useState<boolean | null>(null);
  const [bitmapEditorColorPickerActive, setBitmapEditorColorPickerActive] = useState(false);
  const [workspaceMode, setWorkspaceMode] =
    useState<WorkspaceConversionMode>("palette");
  const [tilemapStale, setTilemapStale] = useState(false);
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
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [imageStatus, setImageStatus] = useState("Choose a PNG or JPEG image.");
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
  const [synchronizePan, setSynchronizePan] = useState(startupApplicationSettings.synchronizePan);
  const [synchronizeZoom, setSynchronizeZoom] = useState(startupApplicationSettings.synchronizeZoom);
  const [mouseWheelZoom, setMouseWheelZoom] = useState(startupApplicationSettings.mouseWheelZoom);
  const [showPixelGrid, setShowPixelGrid] = useState(DEFAULT_WORKSPACE_PREFERENCES.showPixelGrid);
  const [showAttributeGrid, setShowAttributeGrid] = useState(DEFAULT_WORKSPACE_PREFERENCES.showAttributeGrid);
  const [hideAttributes, setHideAttributes] = useState(DEFAULT_WORKSPACE_PREFERENCES.hideAttributes);
  const [showCompareEngines, setShowCompareEngines] = useState(startupApplicationSettings.showCompareEngines);
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
  const [savedWorkbenchLayouts, setSavedWorkbenchLayouts] = useState<readonly SavedWorkbenchLayout[]>(
    () => loadSavedWorkbenchLayouts(localStorage),
  );
  const [selectedSavedWorkbenchLayoutId, setSelectedSavedWorkbenchLayoutId] = useState("");
  const [layoutNameEntry, setLayoutNameEntry] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsDraft, setSettingsDraft] = useState<(ApplicationSettings & Record<string, unknown>) | null>(null);
  const startupWorkspaceAppliedRef = useRef(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("all");
  const [workbenchSettingsDock, setWorkbenchSettingsDock] = useState<WorkbenchDock>(
    startupWorkbenchPreferences.dock,
  );
  const [workbenchSettingsMinimized, setWorkbenchSettingsMinimized] = useState(
    startupWorkbenchPreferences.minimized,
  );
  const [workbenchSideWidth, setWorkbenchSideWidth] = useState(
    startupWorkbenchPreferences.sideWidth,
  );
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
  const [workbenchToolsFloating, setWorkbenchToolsFloating] = useState(
    startupWorkbenchPreferences.toolsFloating,
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
  const [workbenchWindowOrder, setWorkbenchWindowOrder] = useState<readonly WorkbenchWindowId[]>(
    () => [...startupWorkbenchPreferences.windowOrder],
  );
  const [workbenchToolsOpen, setWorkbenchToolsOpen] = useState(
    startupWorkbenchPreferences.toolsOpen,
  );
  const [workbenchSectionsOpen, setWorkbenchSectionsOpen] = useState<Record<WorkbenchSettingsSection, boolean>>(
    () => ({ ...startupWorkbenchPreferences.sectionsOpen }),
  );
  const workbenchResizeRef = useRef<
    | {
        kind: "dock";
        dock: WorkbenchDock;
        startPointer: number;
        startSideWidth: number;
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
    | null
  >(null);
  const workbenchDimensionsRef = useRef({
    settingsWidth: workbenchSideWidth,
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
  });
  const workbenchRootRef = useRef<HTMLElement | null>(null);
  const workbenchSettingsWindowRef = useRef<HTMLDivElement | null>(null);
  const workbenchDragRef = useRef<{
    window: WorkbenchWindowId;
    startPointerX: number;
    startPointerY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const workbenchDragMovedRef = useRef(false);
  const [settingsSearch, setSettingsSearch] = useState("");
  const [settingsCategory, setSettingsCategory] = useState<SettingCategory | "all">("all");
  const [settingsPreset, setSettingsPreset] = useState<SettingPresetId>("all");
  const [cropPointerMode, setCropPointerMode] = useState<"create" | "move">("create");
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
  const isQl = selectedPlatformId === "sinclair-ql";
  const isPmd = selectedPlatformId === "pmd-85";
  const isZx = selectedPlatformId === "zx-spectrum";
  const workbenchHasFloatingSections = workbenchGeometryFloating || workbenchAdjustmentsFloating || workbenchPaletteFloating || workbenchDitheringFloating;
  const workbenchSnapDistance = 16;
  const workbenchGridSize = 8;

  function snapWorkbenchSize(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, Math.round(value / workbenchGridSize) * workbenchGridSize));
  }

  function snapWorkbenchPosition(position: number, maximum: number): number {
    if (position - 8 <= workbenchSnapDistance) return 8;
    if (maximum - position <= workbenchSnapDistance) return maximum;
    return Math.min(maximum, Math.max(8, Math.round(position / workbenchGridSize) * workbenchGridSize));
  }

  function workbenchWindowZIndex(window: WorkbenchWindowId): number {
    return 10 + workbenchWindowOrder.indexOf(window);
  }

  function bringWorkbenchWindowToFront(window: WorkbenchWindowId): void {
    setWorkbenchWindowOrder((current) => [
      ...current.filter((candidate) => candidate !== window),
      window,
    ]);
  }

  function startWorkbenchResize(dock: WorkbenchDock, event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    workbenchResizeRef.current = {
      kind: "dock",
      dock,
      startPointer: dock === "bottom" ? event.clientY : event.clientX,
      startSideWidth: workbenchSideWidth,
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
    } else {
      setWorkbenchDitheringFloatingAutoHeight(false);
      workbenchResizeRef.current = {
        kind: "floating",
        window,
        startPointerX: event.clientX,
        startPointerY: event.clientY,
        startWidth: workbenchDitheringFloatingWidth,
        startHeight: workbenchDitheringFloatingHeight,
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
    setWorkbenchDitheringFloatingAutoHeight(false);
    setWorkbenchDitheringFloatingWidth((width) => Math.min(760, Math.max(320, width + deltaWidth)));
    setWorkbenchDitheringFloatingHeight((height) => Math.min(680, Math.max(220, height + deltaHeight)));
  }

  function adjustWorkbenchSettingsFloatingSize(deltaWidth: number, deltaHeight: number): void {
    setWorkbenchSettingsFloatingWidth((width) => Math.min(1000, Math.max(420, width + deltaWidth)));
    setWorkbenchSettingsFloatingHeight((height) => Math.min(760, Math.max(280, height + deltaHeight)));
  }

  function adjustWorkbenchSize(dock: WorkbenchDock, delta: number): void {
    if (dock === "bottom") {
      setWorkbenchBottomHeight((height) => Math.min(480, Math.max(160, height + delta)));
      return;
    }
    setWorkbenchSideWidth((width) => Math.min(560, Math.max(280, width + delta)));
  }

  function resetWorkbenchLayout(): void {
    setWorkbenchSettingsDock(DEFAULT_WORKBENCH_PREFERENCES.dock);
    setWorkbenchSettingsMinimized(DEFAULT_WORKBENCH_PREFERENCES.minimized);
    setWorkbenchSideWidth(DEFAULT_WORKBENCH_PREFERENCES.sideWidth);
    setWorkbenchBottomHeight(DEFAULT_WORKBENCH_PREFERENCES.bottomHeight);
    setWorkbenchFloatingX(DEFAULT_WORKBENCH_PREFERENCES.floatingX);
    setWorkbenchFloatingY(DEFAULT_WORKBENCH_PREFERENCES.floatingY);
    setWorkbenchSettingsFloatingWidth(DEFAULT_WORKBENCH_PREFERENCES.settingsFloatingWidth);
    setWorkbenchSettingsFloatingHeight(DEFAULT_WORKBENCH_PREFERENCES.settingsFloatingHeight);
    setWorkbenchToolsFloating(DEFAULT_WORKBENCH_PREFERENCES.toolsFloating);
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
    setWorkbenchWindowOrder([...DEFAULT_WORKBENCH_PREFERENCES.windowOrder]);
    setWorkbenchToolsOpen(DEFAULT_WORKBENCH_PREFERENCES.toolsOpen);
    setWorkbenchSectionsOpen({ ...DEFAULT_WORKBENCH_PREFERENCES.sectionsOpen });
  }

  function restoreWorkbenchPreferences(): void {
    setWorkbenchSettingsDock(startupWorkbenchPreferences.dock);
    setWorkbenchSettingsMinimized(startupWorkbenchPreferences.minimized);
    setWorkbenchSideWidth(startupWorkbenchPreferences.sideWidth);
    setWorkbenchBottomHeight(startupWorkbenchPreferences.bottomHeight);
    setWorkbenchFloatingX(startupWorkbenchPreferences.floatingX);
    setWorkbenchFloatingY(startupWorkbenchPreferences.floatingY);
    setWorkbenchSettingsFloatingWidth(startupWorkbenchPreferences.settingsFloatingWidth);
    setWorkbenchSettingsFloatingHeight(startupWorkbenchPreferences.settingsFloatingHeight);
    setWorkbenchToolsFloating(startupWorkbenchPreferences.toolsFloating);
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
    setWorkbenchWindowOrder([...startupWorkbenchPreferences.windowOrder]);
    setWorkbenchToolsOpen(startupWorkbenchPreferences.toolsOpen);
    setWorkbenchSectionsOpen({ ...startupWorkbenchPreferences.sectionsOpen });
  }

  function setWorkbenchSectionOpen(section: WorkbenchSettingsSection, open: boolean): void {
    setWorkbenchSectionsOpen((current) => ({ ...current, [section]: open }));
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
      target.closest(".workbench-window-actions, .workbench-section-float-action, .workbench-tools-float-action, .workbench-floating-resize-handle") !== null ||
      (target.closest("button") !== null && target.closest(".workbench-window-title") === null)
    ) return;
    if (window === "settings") {
      startWorkbenchDrag(event);
    } else if (window === "tools") {
      startWorkbenchToolsDrag(event);
    } else {
      startWorkbenchSectionDrag(window, event);
    }
  }

  function preventWorkbenchDragClick(event: ReactMouseEvent<HTMLElement>): void {
    if (!workbenchDragMovedRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    workbenchDragMovedRef.current = false;
  }

  function startWorkbenchToolsDrag(event: ReactPointerEvent<HTMLElement>): void {
    if (!workbenchToolsFloating || event.button !== 0) return;
    event.preventDefault();
    workbenchDragMovedRef.current = false;
    bringWorkbenchWindowToFront("tools");
    workbenchDragRef.current = {
      window: "tools",
      startPointerX: event.clientX,
      startPointerY: event.clientY,
      startX: workbenchToolsFloatingX,
      startY: workbenchToolsFloatingY,
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "move";
  }

  function startWorkbenchSectionDrag(
    section: WorkbenchFloatingSection,
    event: ReactPointerEvent<HTMLElement>,
  ): void {
    const floating = section === "geometry"
      ? workbenchGeometryFloating
      : section === "adjustments"
        ? workbenchAdjustmentsFloating
        : section === "palette"
          ? workbenchPaletteFloating
          : workbenchDitheringFloating;
    const startX = section === "geometry"
      ? workbenchGeometryFloatingX
      : section === "adjustments"
        ? workbenchAdjustmentsFloatingX
        : section === "palette"
          ? workbenchPaletteFloatingX
          : workbenchDitheringFloatingX;
    const startY = section === "geometry"
      ? workbenchGeometryFloatingY
      : section === "adjustments"
        ? workbenchAdjustmentsFloatingY
        : section === "palette"
          ? workbenchPaletteFloatingY
          : workbenchDitheringFloatingY;
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

  function toggleWorkbenchToolsFloating(): void {
    setWorkbenchToolsFloating((floating) => {
      if (!floating) setWorkbenchToolsOpen(true);
      return !floating;
    });
  }

  function toggleWorkbenchSectionFloating(section: WorkbenchFloatingSection): void {
    if (section === "geometry") {
      setWorkbenchGeometryFloating((floating) => {
        if (!floating) setWorkbenchSectionOpen("geometry", true);
        return !floating;
      });
      return;
    }
    if (section === "adjustments") {
      setWorkbenchAdjustmentsFloating((floating) => {
        if (!floating) setWorkbenchSectionOpen("adjustments", true);
        return !floating;
      });
      return;
    }
    if (section === "palette") {
      setWorkbenchPaletteFloating((floating) => {
        if (!floating) setWorkbenchSectionOpen("palette", true);
        return !floating;
      });
      return;
    }
    setWorkbenchDitheringFloating((floating) => {
      if (!floating) setWorkbenchSectionOpen("dithering", true);
      return !floating;
    });
  }

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent): void => {
      const resize = workbenchResizeRef.current;
      if (resize !== null && resize.kind === "dock" && resize.dock === "bottom") {
        setWorkbenchBottomHeight(snapWorkbenchSize(
          resize.startBottomHeight + resize.startPointer - event.clientY,
          160,
          480,
        ));
        return;
      }
      if (resize !== null && resize.kind === "dock") {
        const delta = resize.dock === "left"
          ? event.clientX - resize.startPointer
          : resize.startPointer - event.clientX;
        setWorkbenchSideWidth(snapWorkbenchSize(resize.startSideWidth + delta, 280, 560));
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
        } else {
          setWorkbenchDitheringFloatingWidth(snapWorkbenchSize(nextWidth, 320, 760));
          setWorkbenchDitheringFloatingHeight(snapWorkbenchSize(nextHeight, 220, 680));
        }
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
                : dimensions.ditheringWidth;
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
              : dimensions.ditheringHeight;
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
      } else {
        setWorkbenchDitheringFloatingX(nextX);
        setWorkbenchDitheringFloatingY(nextY);
      }
    };
    const stopResize = (): void => {
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
      const rootBounds = root.getBoundingClientRect();
      const settingsBounds = settingsWindow.getBoundingClientRect();
      root.style.setProperty("--workbench-settings-origin-x", `${settingsBounds.left - rootBounds.left}px`);
      root.style.setProperty("--workbench-settings-origin-y", `${settingsBounds.top - rootBounds.top}px`);
    };
    updateOrigin();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateOrigin);
    observer?.observe(root);
    observer?.observe(settingsWindow);
    window.addEventListener("resize", updateOrigin);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateOrigin);
    };
  }, [workbenchSettingsDock, workbenchSettingsFloatingWidth, workbenchSettingsFloatingHeight,
    workbenchSideWidth, workbenchBottomHeight]);

  useEffect(() => {
    workbenchDimensionsRef.current = {
      settingsWidth: workbenchSettingsDock === "floating" ? workbenchSettingsFloatingWidth : workbenchSideWidth,
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
    };
  }, [workbenchSettingsDock, workbenchSettingsFloatingWidth, workbenchSettingsFloatingHeight,
    workbenchSideWidth, workbenchBottomHeight, workbenchToolsFloatingWidth,
    workbenchToolsFloatingHeight, workbenchPaletteFloatingWidth,
    workbenchGeometryFloatingWidth, workbenchGeometryFloatingHeight,
    workbenchAdjustmentsFloatingWidth, workbenchAdjustmentsFloatingHeight,
    workbenchPaletteFloatingHeight, workbenchDitheringFloatingWidth,
    workbenchDitheringFloatingHeight]);

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
      sideWidth: workbenchSideWidth,
      bottomHeight: workbenchBottomHeight,
      floatingX: workbenchFloatingX,
      floatingY: workbenchFloatingY,
      settingsFloatingWidth: workbenchSettingsFloatingWidth,
      settingsFloatingHeight: workbenchSettingsFloatingHeight,
      toolsFloating: workbenchToolsFloating,
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
      toolsOpen: workbenchToolsOpen,
      sectionsOpen: workbenchSectionsOpen,
    });
  }, [workbenchSettingsDock, workbenchSettingsMinimized, workbenchSideWidth,
    workbenchBottomHeight, workbenchFloatingX, workbenchFloatingY,
    workbenchSettingsFloatingWidth, workbenchSettingsFloatingHeight,
    workbenchToolsFloating, workbenchToolsFloatingX, workbenchToolsFloatingY,
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
    workbenchToolsOpen, workbenchSectionsOpen]);

  useEffect(() => {
    if (originalImage === null) return;
    const firstSource = !startupWorkspaceAppliedRef.current;
    startupWorkspaceAppliedRef.current = true;
    if (firstSource) {
      applyWorkspaceLayout(startupApplicationSettings.workspaceLayout);
      restoreWorkbenchPreferences();
    } else {
      setSourcePreviewContent("image");
      setResultPreviewContent("image");
      setWorkspaceLayout("conversion");
    }
    setPreviewZoom("fit");
    setSourcePreviewZoom("fit");
    setResultPreviewZoom("fit");
    setShowPixelGrid(false);
    setShowAttributeGrid(false);
    setInspection(null);
    setBitmapEditorSelection(null);
    setBitmapEditorOriginalResult(null);
    bitmapEditorFullBufferRef.current = null;
    bitmapEditorEncodedRef.current = null;
    setBitmapEditorBuffer(null);
    setBitmapEditorUndoFull([]);
    setBitmapEditorRedoFull([]);
    setBitmapEditorRevertSource(null);
    setTileEditorUndo([]);
    setTileEditorRedo([]);
    setTilemapEditorCell(null);
    setSelectedPaletteColor(null);
  }, [originalImage]);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null || image === null) return;
    const displayResult = workspaceMode === "tilemap" &&
        charsetState.kind === "ready" && !tilemapStale
      ? lastFinal
      : draftPreviewResult(draftState) ?? lastFinal;
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
    canvas.width = framing === "crop"
      ? 256
      : displayResult?.width ?? fallbackPreview?.width ?? 256;
    canvas.height = framing === "crop"
      ? 192
      : displayResult?.height ?? fallbackPreview?.height ?? 192;
    const context = canvas.getContext("2d");
    if (context === null) return;
    const showingOriginalSource = sourcePreviewContent === "source-image" ||
      resultPreviewContent === "source-image";
    if (showingOriginalSource && framing !== "crop") {
      canvas.width = image.width;
      canvas.height = image.height;
      const pixels = new Uint8ClampedArray(Uint8Array.from(image.rgba).buffer);
      context.putImageData(new ImageData(pixels, image.width, image.height), 0, 0);
      return;
    }
    if (workspaceMode === "tilemap" && displayResult !== null) {
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
    isPmd, brightness, contrast, saturation, gamma, smoothing, sharpening,
  ]);

  useEffect(() => {
    const canvas = convertedCanvasRef.current;
    const displayResult = workspaceMode === "tilemap" &&
        charsetState.kind === "ready" && !tilemapStale
      ? lastFinal
      : draftPreviewResult(draftState) ?? lastFinal;
    if (canvas === null || displayResult === null) return;
    const context = canvas.getContext("2d");
    if (context === null) return;
    let rgba: Uint8Array | undefined;
    let previewWidth = displayResult.width;
    let previewHeight = displayResult.height;
    const physicalSpatialFrame = displayResult.frames[0];
    const spatialPreview = displayResult.verticalSpatialDiagnostics === undefined ||
        physicalSpatialFrame === undefined
      ? undefined
      : verticalSpatialPreviewForStage(
          outputPreviewStage,
          physicalSpatialFrame.previewRgba,
          displayResult.width,
          displayResult.height,
          displayResult.verticalSpatialDiagnostics,
        );
    if (
      hideAttributes &&
      displayResult.platformId === "zx-spectrum"
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
          ? charsetState.result.previewRgba
          : undefined
        : outputPreviewStage === "screen-2"
          ? displayResult.verticalSpatialDiagnostics !== undefined
            ? spatialPreview?.rgba
            : displayResult.frames[1]?.previewRgba ??
              displayResult.frames[0]?.previewRgba
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
                : displayResult.mergedPreviewRgba
            : displayResult.frames[0]?.previewRgba;
    }
    if (displayResult.verticalSpatialDiagnostics !== undefined) {
      previewWidth = spatialPreview?.width ?? previewWidth;
      previewHeight = spatialPreview?.height ?? previewHeight;
    }
    canvas.width = previewWidth;
    canvas.height = previewHeight;
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (rgba === undefined) return;
    const pixels = new Uint8ClampedArray(Uint8Array.from(rgba).buffer);
    context.putImageData(
      new ImageData(pixels, previewWidth, previewHeight),
      0,
      0,
    );
  }, [
    draftState, lastFinal, outputPreviewStage, workspaceMode, charsetState,
    sourcePreviewContent, resultPreviewContent,
    tilemapStale, hideAttributes, qlMixedDisplayResolution,
    brightness, contrast, saturation, gamma, smoothing, sharpening,
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
      setSourceFileName(file.name);
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
    const worker = workerRef.current;
    if (worker === null) {
      setImageStatus("Failed: conversion worker is unavailable.");
      return;
    }
    setImage(null);
    setOriginalImage(null);
    bitmapEditorFullBufferRef.current = null;
    bitmapEditorEncodedRef.current = null;
    setBitmapEditorBuffer(null);
    setBitmapEditorUndoFull([]);
    setBitmapEditorRedoFull([]);
    setBitmapEditorRevertSource(null);
    setState({ kind: "idle" });
    setDraftState({ kind: "idle" });
    setLastFinal(null);
    setLastFinalCompletedAt(null);
    setSourceArtifact(null);
    setSourceFileName(file.name);
    setExportError(null);
    setBenchmarkRows([]);
    lastFinalRevisionRef.current = -1;
    setImageStatus(`Validating and decoding ${file.name} in worker…`);
    try {
      const bytes = await file.arrayBuffer();
      const sourceBytes = Uint8Array.from(new Uint8Array(bytes));
      const sourceSha256 = await sha256Hex(sourceBytes);
      const decoded = await worker.decodeImage(bytes);
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
      setResultOrigin("converted");
      setDirty(true);
      setSourceArtifact({
        sha256: sourceSha256,
        baseName: sanitizeArtifactBaseName(file.name),
        bytes: sourceBytes,
      });
      setImageStatus(
        `Accepted ${decoded.format.toUpperCase()} · ${decoded.width} × ${decoded.height} · ${decoded.rgba.length.toLocaleString()} RGBA bytes.`,
      );
    } catch (error: unknown) {
      setImageStatus(`Invalid image: ${error instanceof Error ? error.message : "Unknown error."}`);
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
        isPmd ? PMD85_SCREEN_WIDTH : 256,
        isPmd || isQl ? 256 : 192,
        rotation,
        isQl
          ? { width: 4, height: 3 }
          : { width: 1, height: 1 },
        fillOffsetX,
        fillOffsetY,
      );
  const panMaximumX = isPmd
    ? PMD85_SCREEN_WIDTH
    : isQl && ["mode4-512x256", "mode4-plain-512x256", "mode4-vertical-spatial-512x256", "mode8-mode4-mixed-512x256"].includes(targetModeId)
      ? 512
      : 256;
  const panMaximumY = isPmd || isQl ? 256 : 192;
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
    saturation,
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
    paletteSelections,
    dithering,
    ditheringAmount: dithering === "none" ? 0 : amount,
    errorDiffusionRandomization,
    errorDiffusionLineSuppression,
    orderedMatrix,
    artisticPattern,
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
    setExportError(null);
    if (workspaceMode === "tilemap" && charsetState.kind === "ready") {
      setTilemapStale(true);
    }

    if (finalRunningRef.current) {
      workerRef.current?.dispose();
      workerRef.current = new ConversionWorkerClient();
      finalRunningRef.current = false;
      finalJobRef.current += 1;
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
    brightness, contrast, saturation, gamma, smoothing, sharpening,
    background, borderColor, attributeHeight, attributeSmoothing, attributeHaloInfluence,
    attributeHaloHorizontal, attributeHaloVertical,
    screenFlickerSuppression,
    paletteSelections, dithering, amount, errorDiffusionRandomization,
    errorDiffusionLineSuppression,
    orderedMatrix, artisticPattern, selectedProfileId, targetModeId, attributeOptimizerId,
    ditherEngineId, qlMixedOptimizerId, structuredSettings,
    pmd85PaletteCalibrationId, pmd85GapPolicy,
    workspaceMode,
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
    if (image !== null && settingsValid) void convertImage();
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
      ));
    }
    setState({ kind: "idle" });
  }

  function sourcePointFromCropPointer(
    event: ReactPointerEvent<HTMLCanvasElement> | ReactMouseEvent<HTMLCanvasElement>,
  ): PixelPoint | null {
    if (cropSourceSize === null) return null;
    const bounds = event.currentTarget.getBoundingClientRect();
    const previewPoint = {
      x: (event.clientX - bounds.left) / bounds.width * 256,
      y: (event.clientY - bounds.top) / bounds.height * 192,
    };
    return previewPointToSource(
      previewPoint,
      fitCropPreviewFrame(cropSourceSize),
      cropSourceSize,
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
    const insideSelection = cropSelectionActive && cropValid &&
      pointIsInsideCrop(start, originalCrop);
    cropDragRef.current = {
      pointerId: event.pointerId,
      start,
      mode: insideSelection ? "move" : "create",
      originalCrop,
    };
    setCropSelectionActive(true);
    setCropPointerMode(insideSelection ? "move" : "create");
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
      setCropPointerMode(
        pointIsInsideCrop(current, {
          x: cropX,
          y: cropY,
          width: cropWidth,
          height: cropHeight,
        })
          ? "move"
          : "create",
      );
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
      : selectionFromDrag(
          drag.start,
          current,
          cropSourceSize,
          cropAspectRatio,
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
    if (spatial) {
      return {
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
    }
    const { verticalSpatialMix: _discarded, ...withoutSpatial } = retargeted;
    return withoutSpatial;
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
    if (next.modeId.includes("vertical-spatial")) {
      setDitherEngineId(verticalSpatialDitherEngine(next.dithering));
      setDithering(next.dithering);
      setAmountEntry(String(next.ditheringAmount));
      setOutputPreviewStage("screen-1");
      if (sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2") {
        setSourcePreviewContent("image");
      }
      setResultPreviewContent("screen-1");
    } else if (ditherEngineId.startsWith("vertical-spatial-")) {
      setDitherEngineId(next.dithering === "ordered"
        ? "ordered-strict-matrix-v6"
        : next.dithering === "error-diffusion"
          ? "error-diffusion-decorrelated-v3"
          : "none-discrete-v2");
      setDithering(next.dithering);
      setAmountEntry(String(next.ditheringAmount));
    }
    setPaletteSelections(next.paletteSelections.map((selection) => ({
      ...selection,
      enabledColorIds: [...selection.enabledColorIds],
    })));
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
    applyHardwareModeSettings(retargetHardwareModeSettings(
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
    ));
    if (
      dithering === "ordered" &&
      mode === "zx48-mixed-256x192" &&
      ditherEngineId === "ordered-strict-matrix-v6"
    ) {
      setDitherEngineId("ordered-mixed-phase-stable-v8");
    } else if (
      mode !== "zx48-mixed-256x192" &&
      ditherEngineId === "ordered-mixed-phase-stable-v8"
    ) {
      setDitherEngineId("ordered-strict-matrix-v6");
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

    const baseSections = {
      geometry: false,
      adjustments: false,
      palette: false,
      dithering: false,
      tilemap: false,
    } satisfies Record<WorkbenchSettingsSection, boolean>;
    setWorkbenchGeometryFloating(false);
    setWorkbenchAdjustmentsFloating(false);

    if (layout === "conversion") {
      setWorkbenchSettingsDock("bottom");
      setWorkbenchSettingsMinimized(false);
      setWorkbenchToolsFloating(false);
      setWorkbenchToolsOpen(false);
      setWorkbenchPaletteFloating(false);
      setWorkbenchDitheringFloating(false);
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
      setWorkbenchToolsOpen(false);
      setWorkbenchPaletteFloating(true);
      setWorkbenchDitheringFloating(false);
      setWorkbenchSectionsOpen({ ...baseSections, palette: true });
      return;
    }

    if (layout === "dithering") {
      setWorkbenchSettingsDock("bottom");
      setWorkbenchSettingsMinimized(true);
      setWorkbenchToolsFloating(false);
      setWorkbenchToolsOpen(false);
      setWorkbenchPaletteFloating(false);
      setWorkbenchDitheringFloating(true);
      setWorkbenchSectionsOpen({ ...baseSections, dithering: true });
      return;
    }

    if (layout === "inspection") {
      setWorkbenchSettingsDock("bottom");
      setWorkbenchSettingsMinimized(true);
      setWorkbenchToolsFloating(true);
      setWorkbenchToolsOpen(true);
      setWorkbenchPaletteFloating(false);
      setWorkbenchDitheringFloating(false);
      setWorkbenchSectionsOpen(baseSections);
      return;
    }

    if (layout === "editor") {
      setWorkbenchSettingsDock("bottom");
      setWorkbenchSettingsMinimized(true);
      setWorkbenchToolsFloating(true);
      setWorkbenchToolsOpen(true);
      setWorkbenchPaletteFloating(false);
      setWorkbenchDitheringFloating(false);
      setWorkbenchSectionsOpen(baseSections);
      return;
    }

    if (layout === "tilemap") {
      setWorkbenchSettingsDock("bottom");
      setWorkbenchSettingsMinimized(false);
      setWorkbenchToolsFloating(false);
      setWorkbenchToolsOpen(false);
      setWorkbenchPaletteFloating(false);
      setWorkbenchDitheringFloating(false);
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
        sideWidth: workbenchSideWidth,
        bottomHeight: workbenchBottomHeight,
        floatingX: workbenchFloatingX,
        floatingY: workbenchFloatingY,
        settingsFloatingWidth: workbenchSettingsFloatingWidth,
        settingsFloatingHeight: workbenchSettingsFloatingHeight,
        toolsFloating: workbenchToolsFloating,
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
        toolsOpen: workbenchToolsOpen,
        sectionsOpen: workbenchSectionsOpen,
      },
    };
  }

  function saveCurrentWorkbenchLayout(): void {
    const selected = savedWorkbenchLayouts.find((layout) => layout.id === selectedSavedWorkbenchLayoutId);
    const name = normalizeSavedLayoutName(selected?.name ?? layoutNameEntry);
    if (name.length === 0) return;
    const existing = savedWorkbenchLayouts.find((layout) =>
      layout.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    const nextLayout = { ...currentSavedWorkbenchLayout(name), id: existing?.id ?? createSavedWorkbenchLayoutId(name) };
    const nextLayouts = existing === undefined
      ? [nextLayout, ...savedWorkbenchLayouts]
      : savedWorkbenchLayouts.map((layout) => layout.id === existing.id ? nextLayout : layout);
    setSavedWorkbenchLayouts(nextLayouts);
    saveSavedWorkbenchLayouts(localStorage, nextLayouts);
    setSelectedSavedWorkbenchLayoutId(nextLayout.id);
    setLayoutNameEntry(name);
  }

  function selectSavedWorkbenchLayout(value: string): void {
    if (value === NEW_WORKSPACE_VALUE) {
      setSelectedSavedWorkbenchLayoutId(NEW_WORKSPACE_VALUE);
      setLayoutNameEntry("");
      return;
    }
    if (value.length === 0) {
      setSelectedSavedWorkbenchLayoutId("");
      setLayoutNameEntry("");
      return;
    }
    loadSavedWorkbenchLayout(value);
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
    setWorkbenchSideWidth(saved.workbench.sideWidth);
    setWorkbenchBottomHeight(saved.workbench.bottomHeight);
    setWorkbenchFloatingX(saved.workbench.floatingX);
    setWorkbenchFloatingY(saved.workbench.floatingY);
    setWorkbenchSettingsFloatingWidth(saved.workbench.settingsFloatingWidth ?? 640);
    setWorkbenchSettingsFloatingHeight(saved.workbench.settingsFloatingHeight ?? 420);
    setWorkbenchToolsFloating(saved.workbench.toolsFloating);
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
    setWorkbenchWindowOrder([...(saved.workbench.windowOrder ?? DEFAULT_WORKBENCH_PREFERENCES.windowOrder)]);
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
    setWorkbenchToolsOpen(saved.workbench.toolsOpen);
    setWorkbenchSectionsOpen({ ...saved.workbench.sectionsOpen });
    setSelectedSavedWorkbenchLayoutId(saved.id);
    setLayoutNameEntry(saved.name);
  }

  function deleteSavedWorkbenchLayout(id: string): void {
    const nextLayouts = savedWorkbenchLayouts.filter((layout) => layout.id !== id);
    setSavedWorkbenchLayouts(nextLayouts);
    saveSavedWorkbenchLayouts(localStorage, nextLayouts);
    if (selectedSavedWorkbenchLayoutId === id) {
      setSelectedSavedWorkbenchLayoutId("");
      setLayoutNameEntry("");
    }
  }

  function applyWorkspaceLayout(layout: WorkspaceLayoutId): void {
    const tilemapViews = workspaceMode === "tilemap";
    setWorkspaceLayout(layout);
    applyWorkbenchLayoutPreset(layout);
    if (layout !== "custom") {
      setSynchronizeZoom(layout !== "editor" && layout !== "inspection" && layout !== "tilemap");
    }
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
      setSourcePreviewZoom(12);
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
    if (content === "bitmap-editor") {
      setSynchronizeZoom(false);
      if (side === "source" && sourcePreviewZoom === "fit") setSourcePreviewZoom(12);
      if (side === "result" && resultPreviewZoom === "fit") setResultPreviewZoom(12);
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

  function focusSettingsSection(section: SettingsSection): void {
    setSettingsSection(section);
    setWorkbenchSettingsMinimized(false);
    if (section === "all") return;
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

  function stepZoom(delta: -1 | 1) {
    const current = previewZoom === "fit" ? 0 : previewZoom;
    const next = Math.max(0, Math.min(16, current + delta));
    setZoom(next === 0 ? "fit" : next as PreviewZoom);
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
    if (activePanSideRef.current !== side) return;
    synchronizePreviewScroll(
      event.currentTarget,
      side === "source" ? resultViewportRef.current : sourceViewportRef.current,
    );
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

  function selectResultPixel(event: ReactPointerEvent<HTMLCanvasElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pixelX = Math.max(0, Math.min(255, Math.floor(
      (event.clientX - bounds.left) / bounds.width * 256,
    )));
    const pixelY = Math.max(0, Math.min(191, Math.floor(
      (event.clientY - bounds.top) / bounds.height * 192,
    )));
    if (bitmapEditorColorPickerActive) {
      event.preventDefault();
      event.stopPropagation();
      captureBitmapEditorAttribute(pixelX, pixelY);
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
    setPaletteSelections(next.paletteSelections.map((selection) => ({
      ...selection,
      enabledColorIds: [...selection.enabledColorIds],
    })));
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
    setSettingsDraft(createSettingsDraft({
      ...conversionSettings,
      orderedMatrix,
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
      workspaceLayout,
      mouseWheelZoom,
      synchronizePan,
      synchronizeZoom,
      showCompareEngines,
    }) as ApplicationSettings & Record<string, unknown>);
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
    finalJobRef.current += 1;
    finalRunningRef.current = false;
    workerRef.current?.dispose();
    workerRef.current = new ConversionWorkerClient();
    draftWorkerRef.current?.dispose();
    draftWorkerRef.current = null;
    setDraftState({ kind: "idle" });
    setSelectedProfileId(canonical.profile.id);
    setSelectedPresetId(canonical.application.presetId);
    applySettings(canonical.conversion);
    setBackground(canonical.conversion.background);
    setDitherEngineId(canonical.conversion.ditherEngineId);
    setDithering(canonical.conversion.dithering);
    setAmountEntry(String(canonical.conversion.ditheringAmount));
    setMouseWheelZoom(canonical.application.mouseWheelZoom);
    setSynchronizePan(canonical.application.synchronizePan);
    setSynchronizeZoom(canonical.application.synchronizeZoom);
    setShowCompareEngines(canonical.application.showCompareEngines);
    applyWorkspaceLayout(canonical.application.workspaceLayout);
    setSettingsOpen(false);
    setSettingsDraft(null);
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
    if (image === null || !settingsValid || benchmarkRunning) return;
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
            engine.id !== "artistic-ordered-hybrid-v1";
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
      `${sourceArtifact?.baseName ?? "benchmark"}-engine-benchmark.${format}`,
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
    setStructuredSettings((current) =>
      structuredSettingsForOptimizer(row.optimizerId, current)
    );
    setDraftState({ kind: "ready", result: row.result });
  }

  async function runTilemapBenchmark() {
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
      setTilemapBenchmarkRows(rows);
    } catch (error: unknown) {
      setExportError(
        `Tilemap benchmark failed: ${
          error instanceof Error ? error.message : "Unknown error."
        }`,
      );
    } finally {
      setTilemapBenchmarkRunning(false);
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
      const imported = await parseImportedProfile(new Uint8Array(await file.arrayBuffer()));
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

  async function convertImage() {
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
      finalRunningRef.current = false;
      setLastFinal(result);
      setResultOrigin("converted");
      setLastFinalCompletedAt(new Date().toISOString());
      setExportError(null);
      lastFinalRevisionRef.current = revision;
      setDraftState({ kind: "idle" });
      if (conversionMode === "tilemap") {
        const tilemapResult = await runCharsetConversion(result);
        if (
          tilemapResult === null ||
          finalJobRef.current !== job ||
          revisionRef.current !== revision ||
          workspaceModeRef.current !== conversionMode
        ) return;
      }
      setState(revisionRef.current === revision ? { kind: "ready", result } : { kind: "stale" });
    } catch (error: unknown) {
      if (finalJobRef.current !== job) return;
      finalRunningRef.current = false;
      setState({
        kind: "error",
        message: error instanceof Error ? error.message : "Unknown error.",
      });
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
    setTileEditorSelected(0);
    setTileEditorOriginals(Array.from({ length: result.characterCount }, () => null));
    setTileEditorUndo([]);
    setTileEditorRedo([]);
    setTilemapEditorCell(0);
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
    if (charsetSource === "existing") setExistingCharset(charset.slice());
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

  function selectEditorTile(index: number): void {
    if (charsetState.kind !== "ready") return;
    if (index < 0 || index >= charsetState.result.characterCount) return;
    setTileEditorSelected(index);
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
    if (existingCharsetSelection !== null) {
      const remap = Array.from({ length: result.characterCount }, (_, characterIndex) =>
        characterIndex === index ? -1 : characterIndex > index ? characterIndex - 1 : characterIndex,
      );
      const selection = remapCharsetSelection(existingCharsetSelection, remap) ?? [];
      existingCharsetSelectionRef.current = selection;
      setExistingCharsetSelection(selection);
    }
  }

  function moveEditorTile(delta: -1 | 1): void {
    if (charsetState.kind !== "ready") return;
    const count = charsetState.result.characterCount;
    const target = tileEditorSelected + delta;
    if (target < 0 || target >= count) return;
    setTileEditorSelected(target);
  }

  function sortEditorTilesByUsage(): void {
    if (charsetState.kind !== "ready") return;
    const count = charsetState.result.characterCount;
    const usage = new Array<number>(count).fill(0);
    for (const assignment of charsetState.result.assignments) usage[assignment.characterIndex] = (usage[assignment.characterIndex] ?? 0) + 1;
    const order = Array.from({ length: count }, (_, index) => index)
      .sort((left, right) => (usage[right] ?? 0) - (usage[left] ?? 0) || left - right);
    if (order.every((index, position) => index === position)) return;
    setTileEditorUndo((history) => [...history, snapshotTileEditor(charsetState.result)]);
    const reordered = reorderCharsetTiles(charsetState.result.charset, charsetState.result.assignments, order);
    commitTileEditorResult(charsetState.result, reordered.charset, reordered.assignments);
    setTileEditorSelected(order.indexOf(tileEditorSelected));
    setTileEditorOriginals((originals) => order.map((oldIndex) => originals[oldIndex] ?? null));
    if (existingCharsetSelection !== null) {
      const remap = new Array<number>(count);
      order.forEach((oldIndex, newIndex) => { remap[oldIndex] = newIndex; });
      const remappedSelection = remapCharsetSelection(existingCharsetSelection, remap) ?? [];
      existingCharsetSelectionRef.current = remappedSelection;
      setExistingCharsetSelection(remappedSelection);
    }
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

  function fullBitmapBufferFromResult(): BitmapEditorBuffer | null {
    const activeResult = draftPreviewResult(draftState) ?? lastFinal;
    if (activeResult === null) return null;
    const frameIndex = outputPreviewStage === "screen-2" ? 1 : 0;
    const frame = activeResult.frames[frameIndex] ?? activeResult.frames[0];
    const rgba = frame?.previewRgba ?? activeResult.mergedPreviewRgba;
    if (rgba.length !== activeResult.width * activeResult.height * 4) return null;
    const pixels = new Uint8Array(activeResult.width * activeResult.height);
    if (activeResult.platformId === "zx-spectrum" && frame?.encoded !== undefined) {
      for (let y = 0; y < activeResult.height; y += 1) {
        for (let x = 0; x < activeResult.width; x += 1) {
          const byte = frame.encoded[zxBitmapOffset(Math.floor(x / 8), y)] ?? 0;
          pixels[y * activeResult.width + x] = (byte >> (7 - (x & 7))) & 1;
        }
      }
    } else {
      for (let offset = 0; offset < pixels.length; offset += 1) {
        const red = rgba[offset * 4] ?? 0;
        const green = rgba[offset * 4 + 1] ?? 0;
        const blue = rgba[offset * 4 + 2] ?? 0;
        pixels[offset] = red + green + blue >= 384 ? 1 : 0;
      }
    }
    bitmapEditorEncodedRef.current = frame?.encoded?.slice() ?? null;
    return { width: activeResult.width, height: activeResult.height, rgba: rgba.slice(), pixels };
  }

  const bitmapEditorColorForState: BitmapPixelColor = (x, y, on) => {
    const activeResult = draftPreviewResult(draftState) ?? lastFinal;
    if (activeResult?.platformId !== "zx-spectrum") return null;
    const frameIndex = outputPreviewStage === "screen-2" ? 1 : 0;
    const encoded = activeResult.frames[frameIndex]?.encoded ?? activeResult.frames[0]?.encoded;
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

  function captureBitmapEditorAttribute(pixelX: number, pixelY: number): void {
    const selected = inspectActivePixel(pixelX, pixelY);
    if (selected === null) return;
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

  function applyBitmapEditorAttributePolicy(pixel: { readonly x: number; readonly y: number }): void {
    if (bitmapEditorInkColor === null && bitmapEditorPaperColor === null &&
        bitmapEditorBrightPolicy === null && bitmapEditorFlashPolicy === null) return;
    const activeResult = draftPreviewResult(draftState) ?? lastFinal;
    if (activeResult?.platformId !== "zx-spectrum") return;
    const frameIndex = outputPreviewStage === "screen-2" ? 1 : 0;
    const frame = activeResult.frames[frameIndex] ?? activeResult.frames[0];
    if (frame === undefined || pixel.x >= 256 || pixel.y >= 192) return;
    const sourceEncoded = bitmapEditorEncodedRef.current ?? frame.encoded;
    const activeAttributeHeight = activeResult.attributeHeight ?? attributeHeight;
    if (activeAttributeHeight === null || sourceEncoded.length < 6144 + 32 * (192 / activeAttributeHeight)) return;
    let inspected: InspectedAttribute;
    try {
      inspected = inspectSoftwareScr(sourceEncoded, activeAttributeHeight, pixel.x, pixel.y);
    } catch {
      setExportError("Bitmap editor could not inspect the selected attribute cell.");
      return;
    }
    let nextAttribute = inspected.attribute;
    if (bitmapEditorInkColor !== null) nextAttribute = (nextAttribute & ~7) | bitmapEditorInkColor;
    if (bitmapEditorPaperColor !== null) nextAttribute = (nextAttribute & ~0x38) | (bitmapEditorPaperColor << 3);
    if (bitmapEditorBrightPolicy !== null) nextAttribute = bitmapEditorBrightPolicy ? nextAttribute | 0x40 : nextAttribute & ~0x40;
    if (bitmapEditorFlashPolicy !== null) nextAttribute = bitmapEditorFlashPolicy ? nextAttribute | 0x80 : nextAttribute & ~0x80;
    if (nextAttribute === inspected.attribute) return;
    const encoded = sourceEncoded.slice();
    const currentBuffer = bitmapEditorFullBufferRef.current;
    if (currentBuffer?.pixels !== undefined && currentBuffer.width === 256 && currentBuffer.height === 192) {
      for (let y = 0; y < 192; y += 1) {
        for (let xByte = 0; xByte < 32; xByte += 1) {
          let packed = 0;
          for (let bit = 0; bit < 8; bit += 1) {
            packed |= (currentBuffer.pixels[y * 256 + xByte * 8 + bit] ?? 0) << (7 - bit);
          }
          encoded[zxBitmapOffset(xByte, y)] = packed;
        }
      }
    }
    encoded[6144 + inspected.attributeOffset] = nextAttribute;
    let previewRgba: Uint8Array;
    try {
      previewRgba = renderAttributeFrameRgba(
        unpackZxBitmap(encoded),
        encoded.subarray(6144),
        activeAttributeHeight,
      );
    } catch {
      setExportError("Bitmap editor could not render the edited attribute cell.");
      return;
    }
    const frames = activeResult.frames.map((candidate, index) =>
      index === frameIndex ? { ...candidate, encoded, previewRgba } : candidate,
    );
    const nextResult: WorkerConversionResult = {
      ...activeResult,
      artifact: encoded,
      scr: encoded,
      frames,
      previewRgba,
      mergedPreviewRgba: previewRgba,
    };
    bitmapEditorEncodedRef.current = encoded.slice();
    setLastFinal(nextResult);
    setDraftState({ kind: "idle" });
    setState({ kind: "ready", result: nextResult });
    if (currentBuffer !== null && currentBuffer.rgba.length === previewRgba.length) {
      const nextBuffer = { ...currentBuffer, rgba: previewRgba.slice() };
      bitmapEditorFullBufferRef.current = nextBuffer;
      setBitmapEditorBuffer(nextBuffer);
    }
    setDirty(true);
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

  function promoteBitmapResult(pixel: { readonly x: number; readonly y: number }): void {
    if (bitmapEditorPaintMode === "none") return;
    const base = bitmapEditorFullBufferRef.current ?? fullBitmapBufferFromResult();
    if (base === null || image === null) return;
    if (bitmapEditorFullBufferRef.current === null) {
      setBitmapEditorRevertSource({ ...image, rgba: image.rgba.slice() });
    }
    const next = paintPixel(base, pixel.x, pixel.y, bitmapEditorPaintMode, bitmapEditorColorForState);
    bitmapEditorFullBufferRef.current = next;
    setBitmapEditorBuffer(next);
    setBitmapEditorUndoFull((history) => [...history, cloneBitmapBuffer(base)]);
    setBitmapEditorRedoFull([]);
    setImage({ ...image, width: next.width, height: next.height, rgba: next.rgba.slice() });
    skipNextDraftAfterBitmapEditRef.current = true;
    updateResultPreviewFromBitmap(next);
    setImageStatus("Working source · manually edited. Convert will reprocess the edited source with current settings.");
    setDirty(true);
  }

  function fullBitmapPixelFromEvent(event: ReactPointerEvent<HTMLDivElement>): { readonly x: number; readonly y: number } | null {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = bitmapEditorBuffer?.width ?? displayedWidth;
    const height = bitmapEditorBuffer?.height ?? displayedHeight;
    const x = Math.floor((event.clientX - rect.left) / rect.width * width);
    const y = Math.floor((event.clientY - rect.top) / rect.height * height);
    return x >= 0 && x < width && y >= 0 && y < height ? { x, y } : null;
  }

  function beginFullBitmapPointer(side: PreviewSide, event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 1 && event.button !== 2) return;
    event.preventDefault();
    event.stopPropagation();
    const viewport = side === "source" ? sourceViewportRef.current : resultViewportRef.current;
    if (viewport === null) return;
    const pan = event.button === 1 || event.button === 2 || bitmapEditorSpaceRef.current;
    const pixel = pan ? null : fullBitmapPixelFromEvent(event);
    if (pixel !== null && bitmapEditorColorPickerActive) {
      captureBitmapEditorAttribute(pixel.x, pixel.y);
      return;
    }
    bitmapEditorFullPointerRef.current = {
      side,
      pointerId: event.pointerId,
      visited: new Set(),
      pan,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (pixel !== null) {
      bitmapEditorFullPointerRef.current.visited.add(`${pixel.x},${pixel.y}`);
      promoteBitmapResult(pixel);
      applyBitmapEditorAttributePolicy(pixel);
    }
  }

  function moveFullBitmapPointer(event: ReactPointerEvent<HTMLDivElement>): void {
    const pointer = bitmapEditorFullPointerRef.current;
    if (pointer === null || pointer.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const viewport = pointer.side === "source" ? sourceViewportRef.current : resultViewportRef.current;
    if (pointer.pan && viewport !== null) {
      viewport.scrollLeft = pointer.scrollLeft - (event.clientX - pointer.startX);
      viewport.scrollTop = pointer.scrollTop - (event.clientY - pointer.startY);
      return;
    }
    const pixel = fullBitmapPixelFromEvent(event);
    if (pixel === null) return;
    const key = `${pixel.x},${pixel.y}`;
    if (pointer.visited.has(key)) return;
    pointer.visited.add(key);
    promoteBitmapResult(pixel);
    applyBitmapEditorAttributePolicy(pixel);
  }

  function endFullBitmapPointer(event: ReactPointerEvent<HTMLDivElement>): void {
    if (bitmapEditorFullPointerRef.current?.pointerId === event.pointerId) {
      bitmapEditorFullPointerRef.current = null;
    }
    event.stopPropagation();
  }

  function undoFullBitmap(): void {
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

  function revertFullBitmap(): void {
    if (bitmapEditorRevertSource === null) return;
    if (!window.confirm("Revert source edits? This will discard all manual bitmap changes and restore the original imported source.")) return;
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
    setLastFinal(nextResult);
    setDraftState({ kind: "idle" });
    setState({ kind: "ready", result: nextResult });
    setDirty(true);
  }

  function revertBitmapEditorChanges(): void {
    if (bitmapEditorOriginalResult === null) return;
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
  }

  function markCharsetSelectionChanged(indices: readonly number[]): void {
    const sorted = [...new Set(indices)].sort((left, right) => left - right);
    existingCharsetSelectionRef.current = sorted;
    setExistingCharsetSelection(sorted);
    if (sorted.length > 32) setCharsetEncoding("extended");
    setTilemapStale(true);
  }

  function toggleCharsetCharacter(characterIndex: number): void {
    if (charsetSource !== "existing" || existingCharset === null) return;
    markCharsetSelectionChanged(toggleCharsetSelection(
      existingCharsetSelectionRef.current,
      existingCharset.length / 8,
      characterIndex,
    ));
  }

  function paintCharsetCharacter(
    characterIndex: number,
    selecting: boolean,
  ): void {
    const drag = charsetSelectionDragRef.current;
    if (drag === null || drag.visited.has(characterIndex)) return;
    drag.visited.add(characterIndex);
    const selected = new Set(effectiveCharsetSelection(
      existingCharsetSelectionRef.current,
      (existingCharset?.length ?? 0) / 8,
    ));
    if (selecting) selected.add(characterIndex);
    else selected.delete(characterIndex);
    markCharsetSelectionChanged([...selected]);
  }

  function beginCharsetSelection(
    characterIndex: number,
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void {
    if (charsetSource !== "existing" || existingCharset === null) return;
    const selected = new Set(effectiveCharsetSelection(
      existingCharsetSelectionRef.current,
      existingCharset.length / 8,
    ));
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
      selectEditorTile(characterIndex);
      toggleCharsetCharacter(characterIndex);
    }, 300);
    charsetSelectionClickRef.current.set(characterIndex, timer);
  }

  function handleCharsetDoubleClick(characterIndex: number): void {
    clearPendingCharsetClick(characterIndex);
    selectEditorTile(characterIndex);
    toggleCharsetCharacter(characterIndex);
  }

  function clearCharsetSelection(): void {
    const count = Math.floor((existingCharset?.length ?? 0) / 8);
    markCharsetSelectionChanged(allCharsetIndices(count));
    setExistingCharsetStart(0);
    setExistingCharsetLength(count);
    setExistingCharsetStartEntry("1");
    setExistingCharsetLengthEntry(String(count));
    if (count > 32) setCharsetEncoding("extended");
  }

  function invertCharsetSelection(): void {
    if (charsetSource !== "existing" || existingCharset === null) return;
    const count = Math.floor(existingCharset.length / 8);
    markCharsetSelectionChanged(invertSelection(
      existingCharsetSelectionRef.current,
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
    const next = Math.max(0, Math.min(glyphCount - 1, characterIndex + delta));
    charsetGlyphRefs.current[next]?.focus();
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
    setCharsetState({ kind: "running" });
    try {
      const result = await worker.convertCharset(
        paletteResult.frames[0]!.encoded,
        options,
      );
      if (charsetWorkerRef.current !== worker) return null;
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

  function exportCharsetArtifact(): void {
    if (charsetState.kind !== "ready" || sourceArtifact === null) return;
    downloadBytes(
      charsetState.result.artifact,
      "application/octet-stream",
      `${sourceArtifact.baseName}-tilemap.bin`,
    );
  }

  function exportFinalCharset(): void {
    if (
      charsetState.kind !== "ready" ||
      tilemapStale ||
      sourceArtifact === null
    ) return;
    downloadBytes(
      charsetState.result.charset,
      "application/octet-stream",
      `${sourceArtifact.baseName}-charset.chr`,
    );
  }

  function exportCharsetPreview(): void {
    if (charsetState.kind !== "ready" || sourceArtifact === null) return;
    const png = encodeRgbaPng(charsetState.result.previewRgba, 256, 192);
    downloadBytes(
      png,
      "image/png",
      `${sourceArtifact.baseName}-charset-preview.png`,
    );
  }

  function exportCharsetDiagnostics(): void {
    if (charsetState.kind !== "ready" || sourceArtifact === null) return;
    const bytes = new TextEncoder().encode(`${JSON.stringify({
      source: charsetSource,
      encoding: charsetState.result.encoding,
      transformations: charsetState.result.transformations,
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
      `${sourceArtifact.baseName}-charset-diagnostics.json`,
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
            `${sourceArtifact.baseName}-screen-${index + 1}${
              lastFinal.modeId === "mode8-mode4-mixed-512x256"
                ? index === 0 ? "-mode8" : "-mode4"
                : ""
            }.scr`,
          );
        }
      } else if (lastFinal.platformId === "pmd-85") {
        assertValidPmd85Screen(lastFinal.artifact);
        downloadBytes(lastFinal.artifact, "application/octet-stream", "screen.bin");
      } else {
        for (const [index, frame] of lastFinal.frames.entries()) {
          assertValidSoftwareScr(frame.encoded, attributeHeight);
          downloadBytes(
            frame.encoded,
            "application/octet-stream",
            lastFinal.frames.length > 1
              ? `${sourceArtifact.baseName}-screen-${index + 1}.scr`
              : `${sourceArtifact.baseName}.scr`,
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
      const png = encodeRgbaPng(
        preview.rgba,
        preview.width,
        preview.height,
      );
      downloadBytes(
        png,
        "image/png",
        `${sourceArtifact.baseName}${
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

  async function createCurrentMetadataJson(): Promise<Uint8Array> {
    if (
      state.kind !== "ready" || lastFinal === null || sourceArtifact === null ||
      image === null || lastFinalCompletedAt === null
    ) throw new Error("A current completed High result is required.");
    if (lastFinal.platformId === "zx-spectrum") {
      for (const frame of lastFinal.frames) {
        assertValidSoftwareScr(frame.encoded, attributeHeight);
      }
    } else if (lastFinal.platformId === "sinclair-ql") {
      const hardwareModes = qlHardwareModesForTarget(
        lastFinal.modeId as QlTargetModeId,
      );
      for (const [index, frame] of lastFinal.frames.entries()) {
        assertValidQlScreen(
          frame.encoded,
          hardwareModes[index]!,
        );
      }
    } else {
      assertValidPmd85Screen(lastFinal.artifact);
    }
    const metadata = await buildConversionMetadata({
      sourceSha256: sourceArtifact.sha256,
      sourceFormat: (originalImage ?? image).format,
      sourceWidth: (originalImage ?? image).width,
      sourceHeight: (originalImage ?? image).height,
      settings: conversionSettings,
      scr: lastFinal.scr,
      previewRgba: lastFinal.mergedPreviewRgba,
      frames: lastFinal.frames.map((frame) => frame.encoded),
      width: lastFinal.width,
      height: lastFinal.height,
      score: lastFinal.score,
      ...(lastFinal.structuredDiagnostics === undefined
        ? {}
        : { structuredDiagnostics: lastFinal.structuredDiagnostics }),
      ...(lastFinal.verticalSpatialDiagnostics === undefined
        ? {}
        : { verticalSpatialDiagnostics: lastFinal.verticalSpatialDiagnostics }),
      completedAtUtc: lastFinalCompletedAt,
      profile: selectedProfile,
    });
    return new TextEncoder().encode(`${JSON.stringify(metadata, null, 2)}\n`);
  }

  async function exportMetadata() {
    if (sourceArtifact === null) return;
    try {
      const json = await createCurrentMetadataJson();
      downloadBytes(json, "application/json", `${sourceArtifact.baseName}-metadata.json`);
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
        `${sourceArtifact.baseName}-inspection.json`,
      );
      setExportError(null);
    } catch (error: unknown) {
      setExportError(`Inspection export blocked: ${error instanceof Error ? error.message : "Generation failed."}`);
    }
  }

  async function exportProject() {
    if (lastFinal === null || sourceArtifact === null || image === null) return;
    try {
      const metadataJson = await createCurrentMetadataJson();
      const spatialPreview = lastFinal.verticalSpatialDiagnostics;
      const previewPng = encodeRgbaPng(
        spatialPreview?.analyticPreviewRgba ?? lastFinal.mergedPreviewRgba,
        spatialPreview?.logicalWidth ?? lastFinal.width,
        spatialPreview?.logicalHeight ?? lastFinal.height,
      );
      const project = await createCompletedProject({
        sourceBytes: sourceArtifact.bytes,
        sourceFormat: (originalImage ?? image).format,
        resultOrigin,
        settings: conversionSettings,
        scr: lastFinal.scr,
        frames: lastFinal.frames.map((frame) => frame.encoded),
        previewPng,
        metadataJson,
        profile: selectedProfile,
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
      downloadBytes(project, "application/zip", `${sourceArtifact.baseName}.rccproject`);
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
      let decoded: WorkerDecodedImage;
      let workingDecoded: WorkerDecodedImage;
      let recomputed: WorkerConversionResult;
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
        decoded = await verifier.decodeImage(Uint8Array.from(sourceBytes).buffer);
        workingDecoded = validated.workingSourcePng === undefined
          ? decoded
          : await verifier.decodeImage(Uint8Array.from(validated.workingSourcePng).buffer);
        recomputed = await verifier.convertImage(
          workingDecoded,
          validated.settings,
          "high",
          projectPmdPalette === undefined
            ? undefined
            : { foregroundPalette: projectPmdPalette },
        );
      }
      if (validated.workingSourcePng === undefined && (
        recomputed.frames.length !== validated.frames.length ||
        recomputed.frames.some((frame, index) =>
          !equalBytes(frame.encoded, validated.frames[index] ?? new Uint8Array())
        )
      )) {
        throw new Error("PROJECT_REPRODUCTION_FAILED: screen bytes differ.");
      }
      const archivedPreview = await verifier.decodeImage(Uint8Array.from(validated.previewPng).buffer);
      const expectedArchivedPreview = recomputed.verticalSpatialDiagnostics;
      if (validated.workingSourcePng === undefined && (
        archivedPreview.width !== (expectedArchivedPreview?.logicalWidth ?? recomputed.width) ||
        archivedPreview.height !== (expectedArchivedPreview?.logicalHeight ?? recomputed.height) ||
        !equalBytes(
          archivedPreview.rgba,
          expectedArchivedPreview?.analyticPreviewRgba ?? recomputed.mergedPreviewRgba,
        )
      )) throw new Error("PROJECT_REPRODUCTION_FAILED: decoded preview pixels differ.");
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
        if (!equalBytes(
          verifiedTilemap.artifact,
          validated.tilemap.artifact,
        )) {
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
      const differingMetadataKeys = validated.workingSourcePng === undefined
        ? projection.filter((key) =>
        typeof key !== "string" ||
        JSON.stringify(archivedMetadata[key]) !== JSON.stringify(rebuiltMetadata[key])
      )
        : [];
      if (differingMetadataKeys.length > 0) {
        throw new Error(
          `PROJECT_REPRODUCTION_FAILED: deterministic metadata differs (${differingMetadataKeys.join(", ")}).`,
        );
      }

      const next = validated.settings;
      pendingOpenedFinalRef.current = { result: recomputed, completedAtUtc };
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
      if (validated.workingSourcePng !== undefined) {
        setBitmapEditorRevertSource({ ...decoded, rgba: decoded.rgba.slice() });
        bitmapEditorFullBufferRef.current = {
          width: workingDecoded.width,
          height: workingDecoded.height,
          rgba: workingDecoded.rgba.slice(),
        };
        setBitmapEditorBuffer(bitmapEditorFullBufferRef.current);
      }
      setSourceFileName(file.name);
      setSourceArtifact({
        sha256: await sha256Hex(sourceBytes),
        baseName: sanitizeArtifactBaseName(file.name),
        bytes: sourceBytes,
      });
      setImageStatus(
        `Opened validated project · ${decoded.width} × ${decoded.height} source · ` +
        `reproduced ${recomputed.scr.length.toLocaleString()}-byte High result.` +
        (repairedLegacyCharsetSelection
          ? " Corrected legacy charset-selection mapping."
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
  const displayedAttributeHeight = displayedResult?.attributeHeight ?? attributeHeight;
  useEffect(() => {
    const sourceCanvas = bitmapEditorSourceCanvasRef.current;
    const resultCanvas = bitmapEditorResultCanvasRef.current;
    const target = bitmapEditorBuffer ?? (() => {
      const frameIndex = outputPreviewStage === "screen-2" ? 1 : 0;
      const frame = displayedResult?.frames[frameIndex] ?? displayedResult?.frames[0];
      const rgba = frame?.previewRgba ?? displayedResult?.mergedPreviewRgba;
      if (rgba === undefined || displayedResult === null) return null;
      return { width: displayedResult.width, height: displayedResult.height, rgba };
    })();
    if (target === null || target === undefined) return;
    for (const canvas of [sourceCanvas, resultCanvas]) {
      if (canvas === null) continue;
      canvas.width = target.width;
      canvas.height = target.height;
      const context = canvas.getContext("2d");
      if (context === null) continue;
      context.putImageData(
        new ImageData(new Uint8ClampedArray(target.rgba), target.width, target.height),
        0,
        0,
      );
    }
  }, [bitmapEditorBuffer, displayedResult, outputPreviewStage, sourcePreviewContent, resultPreviewContent]);
  const displayedWidth = displayedResult?.verticalSpatialDiagnostics === undefined
    ? displayedResult?.width ?? 256
    : outputPreviewStage === "merged" || outputPreviewStage === "screen-2"
      ? displayedResult.verticalSpatialDiagnostics.logicalWidth
      : displayedResult.width;
  const displayedHeight = displayedResult?.verticalSpatialDiagnostics !== undefined &&
      (outputPreviewStage === "merged" || outputPreviewStage === "screen-2")
    ? displayedResult.verticalSpatialDiagnostics.logicalHeight
    : displayedResult?.height ?? 192;
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
  const cropEditorFrame = cropSourceSize === null
    ? null
    : fitCropPreviewFrame(cropSourceSize);
  const cropOverlay = cropEditorFrame === null || cropSourceSize === null ||
    !cropValid || !cropSelectionActive
    ? null
    : {
        x: cropEditorFrame.x + cropX / cropSourceSize.width * cropEditorFrame.width,
        y: cropEditorFrame.y + cropY / cropSourceSize.height * cropEditorFrame.height,
        width: cropWidth / cropSourceSize.width * cropEditorFrame.width,
        height: cropHeight / cropSourceSize.height * cropEditorFrame.height,
      };
  const borderHex = ZX_BASE_COLORS[borderColor]?.normal ?? "#000000";
  const paletteArtifactsReady = state.kind === "ready" && lastFinal !== null &&
    lastFinalCompletedAt !== null && sourceArtifact !== null;
  const tilemapArtifactsReady = paletteArtifactsReady &&
    charsetState.kind === "ready" && !tilemapStale;
  const artifactsReady = workspaceMode === "tilemap"
    ? tilemapArtifactsReady
    : paletteArtifactsReady;
  const resultSaveReady = state.kind === "ready" && lastFinal !== null && sourceArtifact !== null;
  const glyphCharset = charsetState.kind === "ready"
    ? charsetState.result.charset
    : charsetSource === "existing" && existingCharset !== null
      ? existingCharset
      : null;
  const glyphCount = glyphCharset === null
    ? 0
    : Math.floor(glyphCharset.length / 8);
  const glyphActiveRange = charsetSource === "existing"
    ? clampCharsetRange(
        glyphCount,
        existingCharsetStart,
        existingCharsetLength,
      )
    : { startIndex: 0, length: glyphCount };
  const glyphActiveIndices = charsetSource !== "existing"
    ? Array.from({ length: glyphCount }, (_, index) => index)
    : existingCharsetSelection === null
      ? Array.from(
          { length: glyphActiveRange.length },
          (_, index) => glyphActiveRange.startIndex + index,
        )
      : [...existingCharsetSelection];
  const glyphActiveIndexSet = new Set(glyphActiveIndices);
  const glyphActiveCount = charsetSource === "existing"
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
  const fullBitmapEditorPreview = (side: PreviewSide) => {
    const buffer = bitmapEditorBuffer;
    const width = buffer?.width ?? displayedWidth;
    const height = buffer?.height ?? displayedHeight;
    const canvasRefForSide = side === "source" ? bitmapEditorSourceCanvasRef : bitmapEditorResultCanvasRef;
    const compatible = workspaceMode === "palette" && displayedResult !== null;
    const attributeWidth = displayedResult?.platformId === "pmd-85" ? 6 : displayedResult?.platformId === "zx-spectrum" ? 8 : null;
    const attributeHeight = displayedResult?.platformId === "pmd-85" ? targetModeId === "pmd85-colorace" ? 2 : 1 : displayedResult?.attributeHeight ?? null;
    const bitmapEditorActions = <div className="bitmap-editor-full-toolbar" aria-label="Bitmap editor actions" onPointerDown={(event) => event.stopPropagation()}>
      <button className="secondary compact bitmap-editor-full-action bitmap-editor-mode-button" type="button" onClick={() => setBitmapEditorPaintMode((mode) => mode === "set" ? "reset" : mode === "reset" ? "toggle" : mode === "toggle" ? "none" : "set")} title="Pixel mode" aria-label={`Pixel mode: ${bitmapEditorPaintMode}`}>
        {bitmapEditorPaintMode === "set" ? "＋" : bitmapEditorPaintMode === "reset" ? "−" : bitmapEditorPaintMode === "toggle" ? "↔" : "·"}
      </button>
      <button className="secondary compact bitmap-editor-full-action" type="button" onClick={undoFullBitmap} disabled={bitmapEditorUndoFull.length === 0}>Undo</button>
      <button className="secondary compact bitmap-editor-full-action" type="button" onClick={redoFullBitmap} disabled={bitmapEditorRedoFull.length === 0}>Redo</button>
      <button className="secondary compact bitmap-editor-full-action" type="button" onClick={revertFullBitmap} disabled={bitmapEditorRevertSource === null}>Revert</button>
      <button className={`secondary compact bitmap-editor-full-action${bitmapEditorColorPickerActive ? " active" : ""}`} type="button" onClick={() => setBitmapEditorColorPickerActive((active) => !active)} title="Pick attribute colors from result or editor" aria-label="Pick attribute colors from result or editor" aria-pressed={bitmapEditorColorPickerActive}>⌕</button>
      {displayedResult?.platformId === "zx-spectrum" ? <div className="bitmap-editor-attribute-policy" aria-label="Attribute paint policy">
        <div className="bitmap-editor-attribute-header"><span aria-hidden="true">I</span><span aria-hidden="true">P</span></div>
        <div className="bitmap-editor-attribute-transparent">
          <button className={`bitmap-editor-attribute-icon${bitmapEditorInkColor === null ? " selected" : ""}`} type="button" title="Preserve INK" aria-label="Preserve INK" aria-pressed={bitmapEditorInkColor === null} onClick={() => setBitmapEditorInkColor(null)}><span className="bitmap-editor-transparent-swatch" aria-hidden="true" /></button>
          <button className={`bitmap-editor-attribute-icon${bitmapEditorPaperColor === null ? " selected" : ""}`} type="button" title="Preserve PAPER" aria-label="Preserve PAPER" aria-pressed={bitmapEditorPaperColor === null} onClick={() => setBitmapEditorPaperColor(null)}><span className="bitmap-editor-transparent-swatch" aria-hidden="true" /></button>
        </div>
        {ZX_BASE_COLORS.map((color) => <div className="bitmap-editor-attribute-color-row" key={color.code}>
          <button className={`bitmap-editor-attribute-color${bitmapEditorInkColor === color.code ? " selected" : ""}`} type="button" title={`Set INK to ${color.name}`} aria-label={`Set INK to ${color.name}`} aria-pressed={bitmapEditorInkColor === color.code} onClick={() => setBitmapEditorInkColor(color.code)}><span style={{ background: color.normal }} /></button>
          <button className={`bitmap-editor-attribute-color${bitmapEditorPaperColor === color.code ? " selected" : ""}`} type="button" title={`Set PAPER to ${color.name}`} aria-label={`Set PAPER to ${color.name}`} aria-pressed={bitmapEditorPaperColor === color.code} onClick={() => setBitmapEditorPaperColor(color.code)}><span style={{ background: color.normal }} /></button>
        </div>)}
        <div className="bitmap-editor-attribute-policy-row"><span className="bitmap-editor-policy-symbol" aria-hidden="true">☀</span>{([true, false, null] as const).map((value) => <button className={`bitmap-editor-attribute-icon${bitmapEditorBrightPolicy === value ? " selected" : ""}`} type="button" key={String(value)} title={value === null ? "Preserve BRIGHT" : value ? "Set BRIGHT" : "Reset BRIGHT"} aria-label={value === null ? "Preserve BRIGHT" : value ? "Set BRIGHT" : "Reset BRIGHT"} aria-pressed={bitmapEditorBrightPolicy === value} onClick={() => setBitmapEditorBrightPolicy(value)}>{value === true ? "●" : value === false ? "○" : <span className="bitmap-editor-transparent-swatch" aria-hidden="true" />}</button>)}</div>
        <div className="bitmap-editor-attribute-policy-row"><span className="bitmap-editor-policy-symbol" aria-hidden="true">ϟ</span>{([true, false, null] as const).map((value) => <button className={`bitmap-editor-attribute-icon${bitmapEditorFlashPolicy === value ? " selected" : ""}`} type="button" key={String(value)} title={value === null ? "Preserve FLASH" : value ? "Set FLASH" : "Reset FLASH"} aria-label={value === null ? "Preserve FLASH" : value ? "Set FLASH" : "Reset FLASH"} aria-pressed={bitmapEditorFlashPolicy === value} onClick={() => setBitmapEditorFlashPolicy(value)}>{value === true ? "●" : value === false ? "○" : <span className="bitmap-editor-transparent-swatch" aria-hidden="true" />}</button>)}</div>
      </div> : null}
    </div>;
    return <div className="bitmap-editor-pane-layout">
      {bitmapEditorActions}
      <div className={`preview-frame preview-viewport zx-preview bitmap-editor-full-viewport ${draggingSide === side ? "dragging" : ""}`} ref={side === "source" ? sourceViewportRef : resultViewportRef} onScroll={(event) => handlePreviewScroll(side, event)} onPointerDown={(event) => beginPreviewDrag(side, event)} onPointerMove={movePreviewDrag} onPointerUp={endPreviewDrag} onPointerCancel={endPreviewDrag} onWheel={(event) => handlePreviewWheel(side, event)} onFocusCapture={() => markPanSource(side)}>
        {!compatible ? <p className="preview-placeholder">Run a bitmap conversion to edit its result.</p> : <div className="bitmap-editor-full-layout">
          <div className={["preview-stage", "bitmap-editor-full-canvas", (side === "source" ? sourceZoom : resultZoom) === "fit" ? "fit-stage" : "", "show-pixel-grid", "show-attribute-grid"].filter(Boolean).join(" ")} style={{ width: (side === "source" ? sourceZoom : resultZoom) === "fit" ? undefined : `${width * Number(side === "source" ? sourceZoom : resultZoom)}px`, aspectRatio: `${width} / ${height}` }}>
            <canvas ref={canvasRefForSide} aria-label="Full bitmap editor" tabIndex={0} />
            <svg className="pixel-grid-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true"><path d={gridPathForDimensions(width, height, 1, 1)} vectorEffect="non-scaling-stroke" /></svg>
            {attributeWidth !== null && attributeHeight !== null ? <svg className="attribute-grid-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true"><path d={gridPathForDimensions(width, height, attributeWidth, attributeHeight)} vectorEffect="non-scaling-stroke" /></svg> : null}
            <div className="bitmap-editor-interaction-layer" role="grid" tabIndex={0} aria-label={`Bitmap editor ${width} by ${height} pixels`} onContextMenu={(event) => event.preventDefault()} onKeyDown={(event) => { if (event.code === "Space") { event.preventDefault(); bitmapEditorSpaceRef.current = true; } }} onKeyUp={(event) => { if (event.code === "Space") bitmapEditorSpaceRef.current = false; }} onPointerDown={(event) => beginFullBitmapPointer(side, event)} onPointerMove={moveFullBitmapPointer} onPointerUp={endFullBitmapPointer} onPointerCancel={endFullBitmapPointer} />
          </div>
        </div>}
      </div>
    </div>;
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
              const ink = ZX_BASE_COLORS[bitmapEditorCell.attribute & 7];
              const paper = ZX_BASE_COLORS[(bitmapEditorCell.attribute >> 3) & 7];
              return <span className={`tile-editor-pixel${on ? " on" : ""}`} key={pixelIndex} role="gridcell" aria-label={`${x}, ${y}${on ? ": on" : ": off"}`} style={bitmapEditorUseColors ? { backgroundColor: on ? bright ? ink?.bright : ink?.normal : bright ? paper?.bright : paper?.normal } : undefined} />;
            })}
          </div>
          <div className="bitmap-editor-side">
            <div className="bitmap-editor-attributes">
              <label className="check-control"><input type="checkbox" checked={bitmapEditorUseColors} onChange={(event) => setBitmapEditorUseColors(event.target.checked)} /><span>Use INK/PAPER colors</span></label>
              <div className="bitmap-editor-color-group" role="group" aria-label="INK color">
                <span>INK</span>
                <div className="palette-options">
                  {ZX_BASE_COLORS.map((color) => {
                    const selected = (bitmapEditorCell.attribute & 7) === color.code;
                    return <button className={`palette-option${selected ? " selected" : ""}`} type="button" key={color.code} aria-label={`Set INK to ${color.name}`} aria-pressed={selected} title={color.name} onClick={() => setBitmapEditorAttribute(7, color.code)}><span className="palette-swatch" style={{ background: (bitmapEditorCell.attribute & 0x40) !== 0 ? color.bright : color.normal }} aria-hidden="true" /></button>;
                  })}
                </div>
              </div>
              <div className="bitmap-editor-color-group" role="group" aria-label="PAPER color">
                <span>PAPER</span>
                <div className="palette-options">
                  {ZX_BASE_COLORS.map((color) => {
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
        return <div className="unified-editor" tabIndex={-1} onKeyDown={handleUnifiedEditorKey}>
          <div className="unified-editor-toolbar">
            <button className="secondary compact" type="button" onClick={undoTileEditor} disabled={tileEditorUndo.length === 0}>Undo</button>
            <button className="secondary compact" type="button" onClick={redoTileEditor} disabled={tileEditorRedo.length === 0}>Redo</button>
            <button className="secondary compact" type="button" onClick={revertSelectedTile} disabled={tileEditorOriginals[tileEditorSelected] === null}>Revert</button>
          </div>
          <>
            <div className="unified-tile-layout">
              <div className="unified-tile-bitmap" role="grid" aria-label={`Tile ${tileEditorSelected} bitmap`} onPointerDown={beginTileEditorPaint} onPointerMove={moveTileEditorPaint} onPointerUp={endTileEditorPaint} onPointerCancel={endTileEditorPaint}>{Array.from({ length: 64 }, (_, pixelIndex) => { const x = pixelIndex % 8; const y = Math.floor(pixelIndex / 8); const row = result.charset[tileEditorSelected * 8 + y] ?? 0; const on = (row & (0x80 >> x)) !== 0; return <span className={`tile-editor-pixel${on ? " on" : ""}`} key={pixelIndex} role="gridcell" aria-label={`${x}, ${y}${on ? ": on" : ": off"}`} />; })}</div>
              <div className="unified-tile-side">
                <div className="unified-tile-heading">
                  <p><strong>Tile {tileEditorSelected}</strong> · {tileUsage.find((item) => item.characterIndex === tileEditorSelected)?.count ?? 0} cells use this tile</p>
                  <div className="unified-tile-navigation"><button className="secondary compact" type="button" onClick={() => moveEditorTile(-1)} disabled={tileEditorSelected === 0} aria-label="Previous tile">← Previous</button><button className="secondary compact" type="button" onClick={() => moveEditorTile(1)} disabled={tileEditorSelected >= result.characterCount - 1} aria-label="Next tile">Next →</button></div>
                </div>
                <div className="tile-editor-toolbar"><button className="secondary compact" type="button" onClick={() => applyEditorOperation({ kind: "rotate-left" })}>↶</button><button className="secondary compact" type="button" onClick={() => applyEditorOperation({ kind: "rotate-right" })}>↷</button><button className="secondary compact" type="button" onClick={() => applyEditorOperation({ kind: "rotate-up" })}>↑</button><button className="secondary compact" type="button" onClick={() => applyEditorOperation({ kind: "rotate-down" })}>↓</button><button className="secondary compact" type="button" onClick={() => applyEditorOperation({ kind: "clear" })}>Clear</button><button className="secondary compact" type="button" onClick={() => applyEditorOperation({ kind: "invert" })}>Invert</button></div>
              </div>
            </div>
          </>
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
  const sourceStageAspectRatio = sourcePreviewContent === "source-image" && image !== null
    ? `${image.width} / ${image.height}`
    : previewAspectRatio;
  const sourceStageWidth = sourcePreviewContent === "source-image" && image !== null && sourceZoom !== "fit"
    ? `${image.width * sourceZoom}px`
    : sourceZoom === "fit" ? undefined : `${previewAspect.width * Number(sourceZoom)}px`;
  const resultStageAspectRatio = resultPreviewContent === "source-image" && image !== null
    ? `${image.width} / ${image.height}`
    : previewAspectRatio;
  const resultStageWidth = resultPreviewContent === "source-image" && image !== null && resultZoom !== "fit"
    ? `${image.width * resultZoom}px`
    : resultZoom === "fit" ? undefined : `${previewAspect.width * Number(resultZoom)}px`;
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
          : displayedResult.verticalSpatialDiagnostics?.analyticPreviewRgba ??
            displayedResult.mergedPreviewRgba,
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
            paletteOptionsByScreen[screenIndex] ??
            paletteOptionsByScreen[0] ??
            []
          ).find((candidate) => candidate.code === color);
          if (option === undefined) return [];
          const background = isZx && selection.brightMode === "auto"
            ? `linear-gradient(90deg, ${option.normal} 0 50%, ${ZX_BASE_COLORS[color]?.bright ?? option.normal} 50% 100%)`
            : isZx && selection.brightMode === "on"
              ? ZX_BASE_COLORS[color]?.bright ?? option.normal
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
    return rgbaPngDataUrl(
      previewDifferenceHeatmap(displayedResult.sourcePreviewRgba, frame.previewRgba),
      displayedResult.width,
      displayedResult.height,
    );
  }, [displayedResult]);
  const mixedScreenWindowImages = useMemo(() => {
    if (displayedResult === null) return null;
    const first = displayedResult.frames[0];
    const second = displayedResult.frames[1];
    if (first === undefined) return null;
    const width = displayedResult.width;
    const height = displayedResult.height;
    const encode = (rgba: Uint8Array) => rgbaPngDataUrl(rgba, width, height);
    const previews: Partial<Record<"screen-1" | "screen-2" | "merged-low" | "merged-high", string>> = {};
    if (displayedResult.verticalSpatialDiagnostics !== undefined) {
      previews["screen-1"] = encode(first.previewRgba);
      previews["screen-2"] = rgbaPngDataUrl(
        displayedResult.verticalSpatialDiagnostics.analyticPreviewRgba,
        displayedResult.verticalSpatialDiagnostics.logicalWidth,
        displayedResult.verticalSpatialDiagnostics.logicalHeight,
      );
      return previews;
    }
    if (second === undefined) return null;
    previews["screen-1"] = encode(first.previewRgba);
    previews["screen-2"] = encode(second.previewRgba);
    if (displayedResult.platformId === "sinclair-ql" &&
      displayedResult.modeId === "mode8-mode4-mixed-512x256") {
      previews["merged-low"] = encode(renderQlMixedDisplayPreview(first.previewRgba, second.previewRgba, width, "low"));
      previews["merged-high"] = encode(renderQlMixedDisplayPreview(first.previewRgba, second.previewRgba, width, "high"));
    }
    return previews;
  }, [displayedResult]);
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
  const bitmapEditorEdited = bitmapEditorOriginalResult !== null || bitmapEditorRevertSource !== null;
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
  const hasMixedScreenTarget = targetModeId === "zx48-mixed-256x192" ||
    targetModeId === "mode8-256x256" ||
    targetModeId === "mode4-512x256" ||
    targetModeId === "mode8-mode4-mixed-512x256";
  const hasVerticalSpatialTarget = targetModeId.includes("vertical-spatial");
  const hasQlMixedResolutionTarget = targetModeId === "mode8-mode4-mixed-512x256";
  const paletteConversionStatusText = state.kind === "idle" ? image === null
    ? "Import an image to begin."
    : draftState.kind === "scheduled" ? "Draft preview scheduled…"
    : draftState.kind === "running" ? "Running Draft preview…"
    : draftState.kind === "ready" ? `Draft preview current · score ${draftState.result.score.toLocaleString()}.`
    : draftState.kind === "error" ? `Draft failed: ${draftState.message}`
    : "Ready for High conversion."
    : state.kind === "running"
      ? "Running High conversion… The current preview remains visible."
      : state.kind === "ready"
        ? state.result.frames.length > 1
          ? `Completed final · ${state.result.frames.length} × ${state.result.scr.length.toLocaleString()} bytes · ${state.result.width}×${state.result.height} · score ${state.result.score.toLocaleString()}.`
          : state.result.platformId === "zx-spectrum"
            ? `Completed final · ${state.result.artifact.length.toLocaleString()} / ${zxSoftwareScrBytes(attributeHeight).toLocaleString()} bytes · 8×${attributeHeight} attributes · score ${state.result.score.toLocaleString()}.`
            : `Completed final · ${state.result.artifact.length.toLocaleString()} bytes · ${state.result.width}×${state.result.height} · score ${state.result.score.toLocaleString()}.`
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
            ? `Tilemap High current · ${charsetState.result.characterCount} characters · ${charsetState.result.artifact.length.toLocaleString()} bytes.`
            : image === null
              ? "Import an image to begin."
              : "Ready for Tilemap High conversion."
    : paletteConversionStatusText;

  return (
    <>
    <a className="skip-link" href="#workspace-title">Skip to converter</a>
    <main className="shell" id="main-content">
      <header className="hero">
        <p className="eyebrow">{platformLabel} · conversion laboratory</p>
        <h1>Pixel Invader</h1>
        <p>
          Image Convertor · powered by Void Engine · Version {APPLICATION_DISPLAY_VERSION} · OSG^Invaders
        </p>
      </header>

      <section
        ref={workbenchRootRef}
        className={`proof workspace workbench-workspace workbench-settings-${workbenchSettingsDock} workbench-settings-${workbenchSettingsMinimized ? "minimized" : "expanded"}`}
        style={{
          "--workbench-side-width": `${workbenchSideWidth}px`,
          "--workbench-bottom-height": `${workbenchBottomHeight}px`,
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
                onChange={(event) => focusSettingsSection(event.target.value as SettingsSection)}
              >
                <option value="all">All controls</option>
                <option value="geometry">Geometry</option>
                <option value="adjustments">Image adjustments</option>
                <option value="palette">Palette controls</option>
                <option value="dithering">Dithering controls</option>
                {workspaceMode === "tilemap" ? <option value="tilemap">Tilemap controls</option> : null}
              </select>
            </label>
            <label className="top-workspace-selector">
              <span>Layout</span>
              <select
                aria-label="Workspace layout"
                value={workspaceLayout}
                onChange={(event) => applyWorkspaceLayout(event.target.value as WorkspaceLayoutId)}
              >
                <option value="conversion">Conversion</option>
                <option value="palette">Palette tuning</option>
                <option value="dithering">Dithering review</option>
                <option value="tilemap" disabled={workspaceMode !== "tilemap"}>Tilemap cleanup</option>
                <option value="editor" disabled={workspaceMode !== "palette"}>Editor</option>
                <option value="inspection">Pixel inspection</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <div className="saved-workspace-top-controls" aria-label="Saved workspaces">
              {selectedSavedWorkbenchLayoutId === NEW_WORKSPACE_VALUE ? (
                <input
                  type="text"
                  aria-label="New workspace name"
                  placeholder={NEW_WORKSPACE_LABEL}
                  maxLength={40}
                  autoFocus
                  value={layoutNameEntry}
                  onChange={(event) => setLayoutNameEntry(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setSelectedSavedWorkbenchLayoutId("");
                      setLayoutNameEntry("");
                    } else if (event.key === "Enter") {
                      event.preventDefault();
                      saveCurrentWorkbenchLayout();
                    }
                  }}
                />
              ) : (
                <select
                  aria-label="Saved workspaces"
                  value={selectedSavedWorkbenchLayoutId}
                  onChange={(event) => selectSavedWorkbenchLayout(event.target.value)}
                >
                  <option value="">Workspace</option>
                  {savedWorkbenchLayouts.map((layout) => (
                    <option key={layout.id} value={layout.id}>{layout.name}</option>
                  ))}
                  <option value={NEW_WORKSPACE_VALUE}>{NEW_WORKSPACE_LABEL}</option>
                </select>
              )}
              <button
                className="secondary compact saved-workspace-icon-button"
                type="button"
                aria-label="Save workspace"
                title="Save workspace"
                disabled={selectedSavedWorkbenchLayoutId === NEW_WORKSPACE_VALUE
                  ? normalizeSavedLayoutName(layoutNameEntry).length === 0
                  : selectedSavedWorkbenchLayoutId === ""}
                onClick={saveCurrentWorkbenchLayout}
              ><span aria-hidden="true">💾</span></button>
              <button
                className="secondary compact saved-workspace-icon-button"
                type="button"
                aria-label="Delete selected saved workspace"
                title="Delete selected saved workspace"
                disabled={selectedSavedWorkbenchLayoutId === "" || selectedSavedWorkbenchLayoutId === NEW_WORKSPACE_VALUE}
                onClick={() => deleteSavedWorkbenchLayout(selectedSavedWorkbenchLayoutId)}
              ><span aria-hidden="true">🗑</span></button>
            </div>
            <button className="secondary" type="button" onClick={openApplicationSettings}>Settings</button>
            {isPmd ? (
              <label className="file-picker">
                <span>Open PMD binary</span>
                <input
                  type="file"
                  accept="application/octet-stream,.bin"
                  onChange={(event) => void importPmd85(event.currentTarget.files?.[0])}
                />
              </label>
            ) : null}
            <label className="file-picker">
              <span>Open Image</span>
              <input
                type="file"
                accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                onChange={(event) => void importImage(event.currentTarget.files?.[0])}
              />
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
            if (
              event.key === "Enter" &&
              !(event.target instanceof HTMLButtonElement) &&
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
          <fieldset className={`profile-control ${isQl ? "ql-profile-control" : isPmd ? "pmd-profile-control" : ""}`}>
            <legend>Profile and preset</legend>
            <label>
              <span>Conversion mode</span>
              <select
                id="workspace-conversion-mode"
                data-testid="workspace-conversion-mode"
                value={workspaceMode}
                onChange={(event) =>
                  switchWorkspaceConversionMode(
                    event.target.value as WorkspaceConversionMode,
                  )}
              >
                <option value="palette">Palette conversion</option>
                <option value="tilemap" disabled={!isZx}>Tilemap conversion · ZX only</option>
              </select>
            </label>
            <label>
              <span>Profile</span>
              <select value={selectedProfile.id} onChange={(event) => selectProfile(event.target.value)}>
                {profiles
                  .filter((profile) =>
                    workspaceMode === "palette" ||
                    profile.platform_id === "zx-spectrum")
                  .map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name} · {profile.version}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <span>Preset</span>
              <select value={selectedPresetId} onChange={(event) => selectPreset(event.target.value)}>
                {selectedProfile.presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
              </select>
            </label>
            {workspaceMode === "tilemap" ? (
              <label>
                <span>Hardware target</span>
                <select value="zx48-standard-256x192" disabled>
                  <option value="zx48-standard-256x192">
                    ZX standard · single screen · 8×8
                  </option>
                </select>
              </label>
            ) : isPmd ? (
              <label>
                <span>Hardware mode</span>
                <select
                  value={targetModeId}
                  onChange={(event) => void switchTargetMode(event.target.value as TargetModeId)}
                >
                  <option value="pmd85-2-tv">PMD 85-2 / 2A TV/CV</option>
                  <option value="pmd85-2-rgb">PMD 85-2 / 2A RGB modification/monitor</option>
                  <option value="pmd85-3-tv">PMD 85-3 TV/CV · grayscale</option>
                  <option value="pmd85-3-pal">PMD 85-3 PAL/video</option>
                  <option value="pmd85-3-rgb">PMD 85-3 RGB</option>
                  <option value="pmd85-colorace">PMD 85 ColorAce</option>
                  <optgroup label="Vertical spatial mixing">
                    <option value="pmd85-2-rgb-vertical-spatial">PMD 85-2 RGB · vertical spatial</option>
                    <option value="pmd85-3-rgb-vertical-spatial">PMD 85-3 RGB · vertical spatial</option>
                    <option value="pmd85-3-pal-vertical-spatial">PMD 85-3 PAL · vertical spatial</option>
                  </optgroup>
                </select>
              </label>
            ) : isQl ? (
              <label>
                <span>Hardware mode</span>
                <select
                  value={targetModeId}
                  onChange={(event) => {
                    const mode = event.target.value as TargetModeId;
                    switchTargetMode(mode);
                  }}
                >
                  <optgroup label="Two-screen color mixing">
                    <option value="mode8-256x256">Low / Mode 8 · mixed 256×256</option>
                    <option value="mode4-512x256">High / Mode 4 · mixed 512×256</option>
                    <option value="mode8-mode4-mixed-512x256">
                      Mixed Low + High · two screens
                    </option>
                  </optgroup>
                  <optgroup label="Basic single screen">
                    <option value="mode8-plain-256x256">Low / Mode 8 · plain 256×256</option>
                    <option value="mode4-plain-512x256">High / Mode 4 · plain 512×256</option>
                  </optgroup>
                  <optgroup label="Vertical spatial mixing">
                    <option value="mode8-vertical-spatial-256x256">Mode 8 · vertical spatial 256×128 perceived</option>
                    <option value="mode4-vertical-spatial-512x256">Mode 4 · vertical spatial 512×128 perceived</option>
                  </optgroup>
                </select>
              </label>
            ) : (
              <label>
                <span>Hardware mode</span>
                <select
                  value={targetModeId}
                  onChange={(event) => {
                    const mode = event.target.value as TargetModeId;
                    switchTargetMode(mode);
                    if (
                      mode === "zx48-mixed-256x192" &&
                      (
                        attributeOptimizerId === "zx-block-dbs-global-v1" ||
                        attributeOptimizerId === "zx-structured-global-v1" ||
                        attributeOptimizerId === "zx-structured-global-v2" ||
                        attributeOptimizerId === "zx-structured-global-v3" ||
                        attributeOptimizerId === "zx-structured-global-v4"
                      )
                    ) {
                      setAttributeOptimizerId("zx-guide-reference-halo-v2");
                      setDitherEngineId(dithering === "ordered"
                        ? "ordered-mixed-phase-stable-v8"
                        : latestDitherEngineForMethod(dithering));
                    }
                  }}
                >
                  <option value="zx48-standard-256x192">Standard · single screen</option>
                  <option value="zx48-mixed-256x192">Mixed · two screens 50/50</option>
                  <option value="zx48-vertical-spatial-256x192">
                    Vertical spatial · 8×1 · 256×96 perceived
                  </option>
                </select>
              </label>
            )}
            <label className="file-picker secondary-picker compact-picker">
              <span>Import Profile</span>
              <input type="file" accept="application/json,.json" onChange={(event) => void importProfile(event.currentTarget.files?.[0])} />
            </label>
            <button className="secondary compact destructive-profile" type="button" disabled={BUILT_IN_PROFILES.some((profile) => profile.id === selectedProfile.id)} onClick={deleteSelectedProfile}>Delete Profile</button>
            <button className="secondary compact delete-retained" type="button" disabled={profiles.length === BUILT_IN_PROFILES.length} onClick={deleteAllImportedProfiles}>Delete retained profiles ({profiles.length - BUILT_IN_PROFILES.length})</button>
          </fieldset>
          <div
            className="workbench-window workbench-settings-window"
            ref={workbenchSettingsWindowRef}
            data-dock={workbenchSettingsDock}
            data-minimized={workbenchSettingsMinimized ? "true" : "false"}
            style={{ zIndex: workbenchWindowZIndex("settings") }}
            onPointerDown={() => bringWorkbenchWindowToFront("settings")}
          >
            <div
              className={`workbench-resize-handle workbench-resize-${workbenchSettingsDock}`}
              role="separator"
              tabIndex={0}
              aria-label={`Resize Conversion settings ${workbenchSettingsDock === "bottom" ? "height" : "width"}`}
              aria-orientation={workbenchSettingsDock === "bottom" ? "horizontal" : "vertical"}
              aria-valuemin={workbenchSettingsDock === "floating" ? 280 : workbenchSettingsDock === "bottom" ? 160 : 280}
              aria-valuemax={workbenchSettingsDock === "floating" ? 760 : workbenchSettingsDock === "bottom" ? 480 : 560}
              aria-valuenow={workbenchSettingsDock === "floating" ? workbenchSettingsFloatingHeight : workbenchSettingsDock === "bottom" ? workbenchBottomHeight : workbenchSideWidth}
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
                <button className={workbenchSettingsDock === "left" ? "active" : ""} type="button" aria-label="Dock Conversion settings left" title="Dock Conversion settings left" aria-pressed={workbenchSettingsDock === "left"} onClick={() => setWorkbenchSettingsDock("left")}>◀</button>
                <button className={workbenchSettingsDock === "bottom" ? "active" : ""} type="button" aria-label="Dock Conversion settings below preview" title="Dock Conversion settings below preview" aria-pressed={workbenchSettingsDock === "bottom"} onClick={() => setWorkbenchSettingsDock("bottom")}>▼</button>
                <button className={workbenchSettingsDock === "right" ? "active" : ""} type="button" aria-label="Dock Conversion settings right" title="Dock Conversion settings right" aria-pressed={workbenchSettingsDock === "right"} onClick={() => setWorkbenchSettingsDock("right")}>▶</button>
                <button className={workbenchSettingsDock === "floating" ? "active" : ""} type="button" aria-label="Float Conversion settings" title="Float Conversion settings" aria-pressed={workbenchSettingsDock === "floating"} onClick={() => setWorkbenchSettingsDock("floating")}>⤢</button>
                <button type="button" aria-label="Reset workbench layout" title="Reset workbench layout" onClick={resetWorkbenchLayout}>↺</button>
                <button type="button" aria-label={`${workbenchSettingsMinimized ? "Restore" : "Minimize"} Conversion settings`} title={`${workbenchSettingsMinimized ? "Restore" : "Minimize"} Conversion settings`} onClick={() => setWorkbenchSettingsMinimized((value) => !value)}>{workbenchSettingsMinimized ? "□" : "—"}</button>
              </div>
            </div>
            <div className="workbench-window-content" hidden={workbenchSettingsMinimized && !workbenchHasFloatingSections}>
          <details
            className={`workbench-settings-section${workbenchGeometryFloating ? ` workbench-section-floating workbench-geometry-floating${workbenchGeometryFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : ""}`}
            hidden={workbenchSettingsMinimized && !workbenchGeometryFloating}
            open={workbenchSectionsOpen.geometry}
            style={workbenchGeometryFloating ? { zIndex: workbenchWindowZIndex("geometry") } : undefined}
            onPointerDown={(event) => {
              if (workbenchGeometryFloating) {
                event.stopPropagation();
                bringWorkbenchWindowToFront("geometry");
              }
            }}
            onFocusCapture={() => {
              if (workbenchGeometryFloating) bringWorkbenchWindowToFront("geometry");
            }}
            onToggle={(event) => setWorkbenchSectionOpen("geometry", event.currentTarget.open)}
          >
            <summary
              onPointerDown={(event) => {
                if (workbenchGeometryFloating) startWorkbenchTitlebarDrag("geometry", event);
              }}
              onClick={preventWorkbenchDragClick}
            >
              <span>Geometry</span>
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
              <button
                className="workbench-section-float-action"
                type="button"
                aria-label={workbenchGeometryFloating ? "Dock Geometry into Conversion settings" : "Float Geometry"}
                title={workbenchGeometryFloating ? "Dock Geometry into Conversion settings" : "Float Geometry"}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  toggleWorkbenchSectionFloating("geometry");
                }}
              >{workbenchGeometryFloating ? "▼" : "⤢"}</button>
            </summary>
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
          <div className="geometry-row geometry-primary-row">
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
            <fieldset className="geometry-row framing-detail focal-control">
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
          {framing === "crop" ? (
            <fieldset className="geometry-row framing-detail crop-control" aria-describedby={cropValid ? "crop-help" : "crop-error"}>
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
          <div className="geometry-row orientation-actions">
            <fieldset className="orientation-control">
              <legend>Mirror</legend>
              <div className="mirror-actions">
                <label className="check-control mirror-toggle" title="Mirror horizontally">
                  <input aria-label="Mirror horizontally" type="checkbox" checked={mirrorHorizontal} onChange={(event) => { setMirrorHorizontal(event.target.checked); setState({ kind: "idle" }); }} />
                  <span aria-hidden="true">↔</span>
                </label>
                <label className="check-control mirror-toggle" title="Mirror vertically">
                  <input aria-label="Mirror vertically" type="checkbox" checked={mirrorVertical} onChange={(event) => { setMirrorVertical(event.target.checked); setState({ kind: "idle" }); }} />
                  <span aria-hidden="true">↕</span>
                </label>
              </div>
            </fieldset>
            <fieldset className="pan-control">
              <legend>Pixel pan</legend>
              <div className="pan-pad" aria-label="Move rescaled source bitmap by one pixel">
                <button className="pan-up" type="button" aria-label="Move bitmap up one pixel" title="Move bitmap up one pixel" disabled={panOffsetY <= -panMaximumY} onClick={() => { setPanOffsetY(Math.max(-panMaximumY, panOffsetY - 1)); setState({ kind: "idle" }); }}>↑</button>
                <button className="pan-left" type="button" aria-label="Move bitmap left one pixel" title="Move bitmap left one pixel" disabled={panOffsetX <= -panMaximumX} onClick={() => { setPanOffsetX(Math.max(-panMaximumX, panOffsetX - 1)); setState({ kind: "idle" }); }}>←</button>
                <button className="pan-center" type="button" aria-label="Center bitmap" title="Center bitmap" disabled={panOffsetX === 0 && panOffsetY === 0} onClick={() => { setPanOffsetX(0); setPanOffsetY(0); setState({ kind: "idle" }); }}>●</button>
                <button className="pan-right" type="button" aria-label="Move bitmap right one pixel" title="Move bitmap right one pixel" disabled={panOffsetX >= panMaximumX} onClick={() => { setPanOffsetX(Math.min(panMaximumX, panOffsetX + 1)); setState({ kind: "idle" }); }}>→</button>
                <button className="pan-down" type="button" aria-label="Move bitmap down one pixel" title="Move bitmap down one pixel" disabled={panOffsetY >= panMaximumY} onClick={() => { setPanOffsetY(Math.min(panMaximumY, panOffsetY + 1)); setState({ kind: "idle" }); }}>↓</button>
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
          <details
            className={`workbench-settings-section${workbenchAdjustmentsFloating ? ` workbench-section-floating workbench-adjustments-floating${workbenchAdjustmentsFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : ""}`}
            hidden={workbenchSettingsMinimized && !workbenchAdjustmentsFloating}
            open={workbenchSectionsOpen.adjustments}
            style={workbenchAdjustmentsFloating ? { zIndex: workbenchWindowZIndex("adjustments") } : undefined}
            onPointerDown={(event) => {
              if (workbenchAdjustmentsFloating) {
                event.stopPropagation();
                bringWorkbenchWindowToFront("adjustments");
              }
            }}
            onFocusCapture={() => {
              if (workbenchAdjustmentsFloating) bringWorkbenchWindowToFront("adjustments");
            }}
            onToggle={(event) => setWorkbenchSectionOpen("adjustments", event.currentTarget.open)}
          >
            <summary
              onPointerDown={(event) => {
                if (workbenchAdjustmentsFloating) startWorkbenchTitlebarDrag("adjustments", event);
              }}
              onClick={preventWorkbenchDragClick}
            >
              <span>Image adjustments</span>
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
              <button
                className="workbench-section-float-action"
                type="button"
                aria-label={workbenchAdjustmentsFloating ? "Dock Image adjustments into Conversion settings" : "Float Image adjustments"}
                title={workbenchAdjustmentsFloating ? "Dock Image adjustments into Conversion settings" : "Float Image adjustments"}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  toggleWorkbenchSectionFloating("adjustments");
                }}
              >{workbenchAdjustmentsFloating ? "▼" : "⤢"}</button>
            </summary>
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
            <RangeNumberControl id="brightness" label="Brightness" value={brightness} min={-100} max={100} onChange={(value) => { setBrightness(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            <RangeNumberControl id="contrast" label="Contrast" value={contrast} min={-100} max={100} onChange={(value) => { setContrast(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            <RangeNumberControl id="saturation" label="Saturation" value={saturation} min={-100} max={100} onChange={(value) => { setSaturation(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            <RangeNumberControl id="gamma" label="Gamma" value={gamma} min={33} max={300} unit="%" onChange={(value) => { setGamma(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            <RangeNumberControl id="smoothing" label="Smoothing" value={smoothing} min={0} max={100} unit="%" onChange={(value) => { setSmoothing(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            <RangeNumberControl id="sharpening" label="Sharpening" value={sharpening} min={0} max={100} unit="%" onChange={(value) => { setSharpening(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
            <button className="secondary compact" type="button" onClick={() => {
              setBrightness(0);
              setContrast(0);
              setSaturation(0);
              setGamma(100);
              setSmoothing(0);
              setSharpening(0);
              setState({ kind: "idle" });
            }}>Reset adjustments</button>
          </fieldset>
          </details>
          {workspaceMode === "palette" ? (
          <>
          <details
            className={`workbench-settings-section${workbenchPaletteFloating ? ` workbench-section-floating workbench-palette-floating${workbenchPaletteFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : ""}`}
            hidden={workbenchSettingsMinimized && !workbenchPaletteFloating}
            open={workbenchSectionsOpen.palette}
            style={workbenchPaletteFloating ? { zIndex: workbenchWindowZIndex("palette") } : undefined}
            onPointerDown={(event) => {
              if (workbenchPaletteFloating) {
                event.stopPropagation();
                bringWorkbenchWindowToFront("palette");
              }
            }}
            onFocusCapture={() => {
              if (workbenchPaletteFloating) bringWorkbenchWindowToFront("palette");
            }}
            onToggle={(event) => setWorkbenchSectionOpen("palette", event.currentTarget.open)}
          >
            <summary
            onPointerDown={(event) => {
              if (workbenchPaletteFloating) startWorkbenchTitlebarDrag("palette", event);
            }}
            onClick={preventWorkbenchDragClick}
            >
              <span>{isQl ? "QL palette" : isPmd ? "PMD 85 palette" : "ZX palette and attributes"}</span>
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
              <button
                className="workbench-section-float-action"
                type="button"
                aria-label={workbenchPaletteFloating ? "Dock Palette into Conversion settings" : "Float Palette"}
                title={workbenchPaletteFloating ? "Dock Palette into Conversion settings" : "Float Palette"}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  toggleWorkbenchSectionFloating("palette");
                }}
              >{workbenchPaletteFloating ? "▼" : "⤢"}</button>
            </summary>
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
                  <section className="palette-screen" key={selection.screenIndex}>
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
                      {(paletteOptionsByScreen[selection.screenIndex] ??
                        paletteOptionsByScreen[0] ??
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
                                    ? `linear-gradient(90deg, ${option.normal} 0 50%, ${ZX_BASE_COLORS[option.code]?.bright ?? option.normal} 50% 100%)`
                                    : isZx && selection.brightMode === "on"
                                      ? ZX_BASE_COLORS[option.code]?.bright ?? option.normal
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
            <section className="attributes-subcard" aria-labelledby="attributes-subcard-title">
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
                  checked={screenFlickerSuppression && (
                    targetModeId === "mode8-mode4-mixed-512x256" ||
                    paletteSelections.length === 2 &&
                    paletteSelectionsMatch(paletteSelections[0]!, paletteSelections[1]!)
                  )}
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
                  {targetModeId === "mode8-mode4-mixed-512x256"
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
            </section>
            </div>
          </fieldset>
          </details>
          <details
            className={`workbench-settings-section${workbenchDitheringFloating ? ` workbench-section-floating workbench-dithering-floating${workbenchDitheringFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : ""}`}
            hidden={workbenchSettingsMinimized && !workbenchDitheringFloating}
            open={workbenchSectionsOpen.dithering}
            style={workbenchDitheringFloating ? { zIndex: workbenchWindowZIndex("dithering") } : undefined}
            onPointerDown={(event) => {
              if (workbenchDitheringFloating) {
                event.stopPropagation();
                bringWorkbenchWindowToFront("dithering");
              }
            }}
            onFocusCapture={() => {
              if (workbenchDitheringFloating) bringWorkbenchWindowToFront("dithering");
            }}
            onToggle={(event) => setWorkbenchSectionOpen("dithering", event.currentTarget.open)}
          >
            <summary
            onPointerDown={(event) => {
              if (workbenchDitheringFloating) startWorkbenchTitlebarDrag("dithering", event);
            }}
            onClick={preventWorkbenchDragClick}
            >
              <span>Dithering</span>
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
              <button
                className="workbench-section-float-action"
                type="button"
                aria-label={workbenchDitheringFloating ? "Dock Dithering into Conversion settings" : "Float Dithering"}
                title={workbenchDitheringFloating ? "Dock Dithering into Conversion settings" : "Float Dithering"}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  toggleWorkbenchSectionFloating("dithering");
                }}
              >{workbenchDitheringFloating ? "▼" : "⤢"}</button>
            </summary>
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
                      engine.platforms.includes("zx-spectrum") &&
                      (targetModeId !== "zx48-mixed-256x192" || !("family" in engine))
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
          {ditherEngineId === "artistic-ordered-hybrid-v1" ? (
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
          {dithering === "ordered" && ditherEngineId !== "artistic-ordered-hybrid-v1" ? (
            <label>
              <span>Ordered matrix</span>
              <select value={orderedMatrix} onChange={(event) => { setOrderedMatrix(event.target.value as OrderedMatrixId); setState({ kind: "idle" }); }}>
                <option value="checkerboard-2x1">2×1 Checkerboard</option>
                <option value="bayer-2x2">2×2</option>
                <option value="bayer-4x4">4×4</option>
                <option value="bayer-8x8">8×8</option>
                {ditherEngineId === "ordered-clustered-dot-v1" ? (
                  <>
                    <option value="clustered-dot-4x4">Clustered dot 4×4</option>
                    <option value="clustered-dot-8x8">Clustered dot 8×8</option>
                  </>
                ) : null}
                {ditherEngineId === "ordered-void-cluster-v1" ? (
                  <option value="void-cluster-8x8">Void-and-cluster 8×8</option>
                ) : null}
              </select>
            </label>
          ) : null}
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
                    engine.platforms.includes(selectedPlatformId as never) &&
                    (selectedPlatformId === "sinclair-ql" ||
                      isCompatibleEnginePair(attributeOptimizerId, engine.id)) &&
                    (engine.targetModeIds === undefined || engine.targetModeIds.includes(targetModeId))
                  );
                  const recommended = new Set<DitherEngineId>([
                    "error-diffusion-decorrelated-v3",
                    "error-diffusion-atkinson-v1",
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
                      {compatible.filter((engine) =>
                        !recommended.has(engine.id) && engine.lifecycle === "experimental"
                      ).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                  </>;
                })()}
              </select>
            </label>
          ) : null}
          {dithering !== "none" ? (
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
          {dithering === "error-diffusion" || (
            isQl &&
            targetModeId === "mode8-mode4-mixed-512x256" &&
            ditherEngineId === "artistic-ordered-hybrid-v1"
          ) ? (
            <>
              {dithering === "error-diffusion" ? <div
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
                </div> : null}
              {ditherEngineId === "error-diffusion-phase-balanced-v3" ||
              ditherEngineId === "error-diffusion-phase-balanced-checker-v3-1" ||
              ditherEngineId === "error-diffusion-phase-balanced-checker-v3-2" ||
              ditherEngineId === "error-diffusion-phase-balanced-checker-v3-3" ||
              ditherEngineId === "error-diffusion-checker-phase-v4" ||
              ditherEngineId === "error-diffusion-checker-phase-v4-4" ||
              ditherEngineId === "error-diffusion-checker-phase-v4-1" ||
              ditherEngineId === "error-diffusion-checker-phase-v4-2" ||
              ditherEngineId === "error-diffusion-checker-phase-v4-3" ||
              ditherEngineId === "error-diffusion-checker-phase-v5" ||
              ditherEngineId === "error-diffusion-matrix-guided-v1" ||
              (isQl &&
                targetModeId === "mode8-mode4-mixed-512x256" &&
                ditherEngineId === "artistic-ordered-hybrid-v1") ? (
                <div
                  className="dithering-parameter"
                    title="Reduces vertical diffusion runs and favors balanced alternating 2×2 placement; v3.1 adds local placement, v3.2 integrates checker decisions into v3 propagation, v3.3 reorients only true 50% checker blocks, and v4.4 adds a checker carrier whose strength follows line suppression from 0% to 100%. At 0%, output matches Projected unrestricted v2."
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
                    Reduces vertical diffusion runs while retaining short 2×1 transitions. v3.1 applies local placement after v3; v3.2 integrates coverage-preserving 2×2 checker decisions into v3 propagation; v3.3 only reorients existing 50% checker blocks; v4.4 uses an artistic checker carrier as a conservative v3 tie-breaker. In QL Mode 8/4 mixed Artistic checker mode, line suppression scales the mixed-resolution checker carrier from 0% to 100%. For v4.4, line suppression directly controls carrier strength from 0% to 100%; it does not change the underlying tone diffusion. At 0%, output matches Projected unrestricted v2.
                  </span>
                </div>
              ) : null}
            </>
          ) : null}
          </fieldset>
          </details>
          </>
          ) : (
          <>
          <details className="workbench-settings-section" hidden={workbenchSettingsMinimized} open={workbenchSectionsOpen.tilemap} onToggle={(event) => setWorkbenchSectionOpen("tilemap", event.currentTarget.open)}>
            <summary>Tilemap</summary>
          <fieldset id="settings-tilemap" className={`control-group tilemap-settings-group${settingsSection === "tilemap" ? " settings-focused" : ""}`}>
            <legend>Tilemap conversion</legend>
            <div className="tilemap-source-inline">
            <div className="tilemap-source-summary">
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
            <button
              className="secondary compact"
              type="button"
              onClick={() => switchWorkspaceConversionMode("palette")}
            >
              Edit palette conversion
            </button>
            </div>
            <div className="tilemap-primary-controls">
            <label>
              <span>Charset source</span>
              <select
                value={charsetSource}
                disabled={charsetState.kind === "running"}
                onChange={(event) => {
                  const source = event.target.value as CharsetSource;
                  setCharsetSource(source);
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
                  disabled={charsetState.kind === "running" || glyphCount === 0}
                  onChange={(event) => {
                    const entry = event.target.value;
                    setExistingCharsetStartEntry(entry);
                    const requestedStart = Number(entry);
                    if (
                      !/^\d+$/.test(entry) ||
                      !Number.isInteger(requestedStart) ||
                      requestedStart < 1 ||
                      requestedStart > glyphCount
                    ) return;
                    const range = clampCharsetRange(
                      glyphCount,
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
                  disabled={charsetState.kind === "running" || glyphCount === 0}
                  onChange={(event) => {
                    const entry = event.target.value;
                    setExistingCharsetLengthEntry(entry);
                    const requestedLength = Number(entry);
                    const maximum = glyphCount - existingCharsetStart;
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
            <div className="tilemap-options-row">
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
                <span>{existingCharsetName ?? "Choose raw charset"}</span>
                <input
                  type="file"
                  accept=".chr,.bin,application/octet-stream"
                  disabled={charsetState.kind === "running"}
                  onChange={(event) =>
                    void importExistingCharset(event.currentTarget.files?.[0])}
                />
              </label>
            ) : null}
            <p className="control-help tilemap-mapping-help">
              Compact embeds transform bits and supports 1–32 active tiles.
              Extended supports 1–256 tiles and stores transforms in a separate
              288-byte plane.
            </p>
          </fieldset>
          </details>
          </>
          )}
          </div>

          {workspaceMode === "palette" && benchmarkOpen ? (
          <details
            className="benchmark-panel"
            open
            onToggle={(event) => setBenchmarkOpen(event.currentTarget.open)}
          >
            <summary>
              <span>Conversion engine comparison</span>
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
          ) : workspaceMode === "tilemap" && tilemapBenchmarkOpen ? (
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
          ) : null}
            </div>
          </div>

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
              {artifactsReady && workspaceMode === "tilemap" ? (
                <>
                  <span className="action-label">Download</span>
                  <button className="secondary" type="button" onClick={exportCharsetArtifact}>Raw tilemap</button>
                  <button className="secondary" type="button" onClick={exportFinalCharset}>Final charset</button>
                  <button className="secondary" type="button" onClick={exportScr}>Palette source .scr</button>
                  <button className="secondary" type="button" onClick={exportCharsetPreview}>Decoder preview PNG</button>
                  <button className="secondary" type="button" onClick={exportCharsetDiagnostics}>Diagnostics JSON</button>
                </>
              ) : resultSaveReady ? (
                <>
                  <span className="action-label">Save</span>
                  <button className="secondary" type="button" onClick={exportPreviewPng}>PNG</button>
                  <button className="secondary" type="button" onClick={exportScr}>
                    {isPmd
                      ? "PMD binary"
                      : isQl
                      ? lastFinal?.frames.length === 1
                        ? "Screen binary"
                        : "Two screen binaries"
                      : "Binary .scr"}
                  </button>
                  {artifactsReady ? <>
                    <button className="secondary" type="button" onClick={() => void exportMetadata()}>Metadata JSON</button>
                    {isZx ? <button className="secondary" type="button" onClick={exportInspectionReport}>Inspection JSON</button> : null}
                  </> : null}
                </>
              ) : null}
              <span className="action-spacer" aria-hidden="true" />
              <label className="file-picker secondary-picker project-action">
                <span>Open Project</span>
                <input
                  type="file"
                  accept=".rccproject,application/zip"
                  onChange={(event) => void openProject(event.currentTarget.files?.[0])}
                />
              </label>
              {artifactsReady ? (
                <button className="secondary project-action" type="button" onClick={() => void exportProject()}>Save Project</button>
              ) : null}
            </div>

          </div>
          {exportError === null ? null : <div className="field-error workbench-export-error" role="alert">{exportError}</div>}
        </form>

        {settingsOpen && settingsDraft !== null ? (() => {
          const draftProfile = profiles.find(({ id }) => id === settingsDraft.profileId) ?? BUILT_IN_PROFILE;
          const draftModes = Object.keys(draftProfile.palette.modes) as TargetModeId[];
          const visibleSettings = filterSettings(SETTINGS_REGISTRY, settingsSearch, settingsCategory, settingsPreset, settingsDraft);
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
              }
            }}>
              <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="application-settings-title" onKeyDown={(event) => {
                if (event.key === "Escape") { setSettingsOpen(false); setSettingsDraft(null); }
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
                <div className="settings-modal-content">
                  {visibleSettings.length === 0 ? <p className="settings-empty">No settings match your search or filters.</p> : Object.entries(SETTING_CATEGORIES).map(([category, label]) => {
                    const definitions = visibleSettings.filter((definition) => definition.category === category);
                    if (definitions.length === 0) return null;
                    return <fieldset key={category} id={`settings-${category}`}><legend>{label}</legend>{definitions.map((definition) => {
                      const definitionContext = { workspaceMode, modeId: String(settingsDraft.modeId), dithering: String(settingsDraft.dithering) };
                      const definitionAvailable = definition.isAvailable?.(definitionContext) ?? true;
                      const definitionEnabled = definition.isEnabled?.(settingsDraft, definitionContext) ?? true;
                      return <div className="setting-row" key={definition.id}>
                      <div><label htmlFor={`setting-${definition.id}`}><span>{definition.label}</span>{Object.is(settingsDraft[definition.id], definition.defaultValue) ? null : <span className="setting-modified" title="Modified">●</span>}</label><p id={`setting-help-${definition.id}`}>{definition.description}{definition.disabledReason && (!definitionAvailable || !definitionEnabled) ? ` ${definition.disabledReason}` : ""}</p></div>
                      <div className="setting-control">{renderSettingControl(definition)}</div>
                    </div>;
                    })}</fieldset>;
                  })}
                </div>
                <div className="settings-modal-actions">
                  <button className="secondary" type="button" onClick={() => {
                    if (window.confirm("Reset application settings to defaults?")) {
                      setSettingsDraft(createSettingsDraft(DEFAULT_APPLICATION_SETTINGS) as ApplicationSettings & Record<string, unknown>);
                    }
                  }}>Reset to defaults</button>
                  <span className="action-spacer" aria-hidden="true" />
                  <button className="secondary" type="button" onClick={() => { setSettingsOpen(false); setSettingsDraft(null); }}>Cancel</button>
                  <button className="primary" type="button" onClick={saveApplicationSettingsDraft} disabled={Object.keys(validateSettingsDraft(settingsDraft).errors).length > 0}>Save</button>
                </div>
              </section>
            </div>
          );
        })() : null}

        <section className="inspection-workspace" aria-labelledby="inspection-title">
          <div className="inspection-heading">
            <div>
              <h2 id="inspection-title">Preview and inspection</h2>
              <p>Zoom, click-drag to pan, inspect encoded cells, and verify palette usage.</p>
            </div>
            <div className="inspection-actions">
              <span className="zoom-title">Zoom</span>
              <button
                className="secondary compact zoom-step"
                type="button"
                aria-label="Zoom out"
                onClick={() => stepZoom(-1)}
                disabled={previewZoom === "fit"}
              >−</button>
              <label className="zoom-slider">
                <span>{previewZoom === "fit" ? "Fit" : `${previewZoom}:1`}</span>
                <input
                  type="range"
                  min="0"
                  max="16"
                  step="1"
                  aria-label="Preview scale"
                  value={previewZoom === "fit" ? 0 : previewZoom}
                  onInput={(event) => {
                    const value = Number(event.currentTarget.value);
                    setZoom(value === 0 ? "fit" : value as PreviewZoom);
                  }}
                />
              </label>
              <button
                className="secondary compact zoom-step"
                type="button"
                aria-label="Zoom in"
                onClick={() => stepZoom(1)}
                disabled={previewZoom === 16}
              >+</button>
              <button className="secondary compact zoom-reset" type="button" onClick={() => setZoom("fit")}>Fit</button>
            </div>
          </div>

          <details
            className={`inspection-controls workbench-tools-window${workbenchToolsFloating ? " workbench-tools-floating" : ""}`}
            open={workbenchToolsOpen}
            style={workbenchToolsFloating ? { zIndex: workbenchWindowZIndex("tools") } : undefined}
            onPointerDown={() => {
              if (workbenchToolsFloating) bringWorkbenchWindowToFront("tools");
            }}
            onFocusCapture={() => {
              if (workbenchToolsFloating) bringWorkbenchWindowToFront("tools");
            }}
            onToggle={(event) => setWorkbenchToolsOpen(event.currentTarget.open)}
          >
            <summary
              aria-label="Tools"
              onPointerDown={(event) => {
                if (workbenchToolsFloating) startWorkbenchTitlebarDrag("tools", event);
              }}
              onClick={preventWorkbenchDragClick}
            >
              <span>Tools</span>
              <span className="workbench-tools-summary">Preview and workspace options</span>
              {workbenchToolsFloating ? (
                <span
                  className="workbench-window-drag-handle"
                  role="button"
                  tabIndex={0}
                  aria-label="Move Tools window"
                  title="Drag to move Tools"
                  onPointerDown={startWorkbenchToolsDrag}
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
              <button
                className="workbench-tools-float-action"
                type="button"
                aria-label={workbenchToolsFloating ? "Dock Tools below preview" : "Float Tools"}
                title={workbenchToolsFloating ? "Dock Tools below preview" : "Float Tools"}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  toggleWorkbenchToolsFloating();
                }}
              >{workbenchToolsFloating ? "▼" : "⤢"}</button>
            </summary>
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
            <div className="workbench-tools-content">
            <label className="check-control">
              <input type="checkbox" checked={showPixelGrid} onChange={(event) => setShowPixelGrid(event.target.checked)} />
              <span>Pixel grid</span>
            </label>
            {(isZx || isPmd) ? <label className="check-control">
              <input type="checkbox" checked={showAttributeGrid} onChange={(event) => setShowAttributeGrid(event.target.checked)} />
              <span>Cell grid {isPmd ? `6×${targetModeId === "pmd85-colorace" ? 2 : 1}` : `8×${displayedAttributeHeight}`}</span>
            </label> : null}
            {isZx ? <label className="check-control">
              <input
                type="checkbox"
                checked={hideAttributes}
                onChange={(event) => setHideAttributes(event.target.checked)}
              />
              <span>Hide attributes</span>
            </label> : null}
            <label className="check-control">
              <input type="checkbox" checked={synchronizePan} onChange={(event) => setSynchronizePan(event.target.checked)} />
              <span>Synchronize pan</span>
            </label>
            <label className="check-control" title="Keep source and result preview zoom levels aligned. Selecting an editor or inspection layout disables this option.">
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
            {isPmd ? <label>
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
            </label> : null}
            {showCompareEngines && workspaceMode === "palette" ? (
              <button
                className="secondary compact inspector-toggle"
                type="button"
                disabled={image === null || !settingsValid || benchmarkRunning}
                onClick={() => {
                  setBenchmarkOpen((open) => !open);
                }}
              >
                {benchmarkOpen ? "Close comparison" : "Compare engines"}
              </button>
            ) : null}
            {workspaceMode === "tilemap" ? (
              <button
                className="secondary compact inspector-toggle"
                type="button"
                disabled={lastFinal === null || tilemapBenchmarkRunning ||
                  (
                    charsetSource === "existing" &&
                    (existingCharset === null || !existingCharsetChoiceValid)
                  )}
                onClick={() => {
                  setTilemapBenchmarkOpen(true);
                  void runTilemapBenchmark();
                }}
              >
                {tilemapBenchmarkRunning ? "Benchmarking…" : "Compare methods"}
              </button>
            ) : null}
            </div>
          </details>

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
                            paletteOptionsByScreen[selection.screenIndex] ??
                            paletteOptionsByScreen[0] ??
                            []
                          ).find((candidate) => candidate.code === color);
                          return option === undefined ? null : (
                            <span
                              key={color}
                              style={{
                                background: isZx && selection.brightMode === "auto"
                                  ? `linear-gradient(90deg, ${option.normal} 0 50%, ${ZX_BASE_COLORS[color]?.bright ?? option.normal} 50% 100%)`
                                  : isZx && selection.brightMode === "on"
                                    ? ZX_BASE_COLORS[color]?.bright ?? option.normal
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
                      {(paletteOptionsByScreen[selection.screenIndex] ??
                        paletteOptionsByScreen[0] ??
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
                                  ? `linear-gradient(90deg, ${option.normal} 0 50%, ${ZX_BASE_COLORS[option.code]?.bright ?? option.normal} 50% 100%)`
                                  : isZx && selection.brightMode === "on"
                                    ? ZX_BASE_COLORS[option.code]?.bright ?? option.normal
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
          <aside className="tilemap-charset-panel" aria-label="Charset selector">
            <div className="tilemap-charset-heading">
              <strong>Charset tiles</strong>
              <span>{glyphCount} available · {glyphActiveCount} active{tileEditorEdited ? " · Edited" : ""}</span>
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
              ) : Array.from({ length: glyphCount }, (_, characterIndex) => {
                const active = glyphActiveIndexSet.has(characterIndex);
                const editorReady = charsetState.kind === "ready";
                const selectable = editorReady || (charsetSource === "existing" && existingCharset !== null);
                return (
                  <button
                    type="button"
                    className={`glyph-item ${active ? "active" : "inactive"}${editorReady && characterIndex === tileEditorSelected ? " editor-selected" : ""}`}
                    key={characterIndex}
                    data-character-index={characterIndex}
                    title={`Tile ${characterIndex + 1} (index ${characterIndex}) · ${active ? "Active" : "Unused"}`}
                    aria-label={`Tile ${characterIndex + 1}, ${active ? "selected" : "not selected"}`}
                    aria-pressed={selectable ? active : undefined}
                    disabled={!selectable}
                    ref={(element) => {
                      charsetGlyphRefs.current[characterIndex] = element;
                    }}
                    onClick={() => {
                      if (charsetSource !== "existing") selectEditorTile(characterIndex);
                    }}
                    onDoubleClick={() => charsetSource === "existing"
                      ? handleCharsetDoubleClick(characterIndex)
                      : selectEditorTile(characterIndex)}
                    onPointerDown={(event) => charsetSource === "existing"
                      ? beginCharsetSelection(characterIndex, event)
                      : undefined}
                    onKeyDown={(event) => editorReady
                      ? (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown"
                        ? handleCharsetGlyphKey(characterIndex, event)
                        : event.key === "Enter" || event.key === " "
                          ? (event.preventDefault(), selectEditorTile(characterIndex), charsetSource === "existing" ? toggleCharsetCharacter(characterIndex) : undefined)
                          : undefined)
                      : handleCharsetGlyphKey(characterIndex, event)}
                    onDragStart={(event) => event.preventDefault()}
                  >
                    <img
                      src={glyphDataUrl(glyphCharset!, characterIndex, active)}
                      alt=""
                      draggable={false}
                      width="16"
                      height="16"
                    />
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
            <div className="tilemap-charset-actions">
              <button className="secondary compact" type="button" disabled={charsetState.kind !== "ready" || glyphCount === 0} onClick={sortEditorTilesByUsage}>Usage</button>
              <button className="secondary compact" type="button" disabled={charsetState.kind !== "ready" || glyphCount >= 256} onClick={createEditorTile}>Add</button>
              <button className="secondary compact" type="button" disabled={charsetState.kind !== "ready" || glyphCount <= 1} onClick={deleteEditorTile}>Del</button>
              <button className="secondary compact" type="button" disabled={charsetSource !== "existing" || existingCharset === null || charsetState.kind === "running" || glyphCount === 0} onClick={clearCharsetSelection}>All</button>
              <button className="secondary compact" type="button" disabled={charsetSource !== "existing" || existingCharset === null || charsetState.kind === "running" || glyphCount === 0} onClick={invertCharsetSelection}>Invert</button>
            </div>
          </aside>
          )}

          <div className="comparison" aria-label="Configurable preview panes">
            <section className={`preview-panel source-panel ${workspaceMode === "tilemap" ? "tilemap-preview-panel" : ""}`} aria-labelledby="source-preview-title">
              <div className="preview-panel-heading">
                <h3 id="source-preview-title">
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
                <label className="preview-content-selector">
                  <span className="sr-only">Source window content</span>
                  <select
                    value={sourcePreviewContent}
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
              </div>
              {sourcePreviewContent === "bitmap-editor" ? fullBitmapEditorPreview("source") : sourcePreviewContent === "image" || sourcePreviewContent === "source-image" || sourcePreviewContent === "result-image" || (hasVerticalSpatialTarget && (sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2")) ? <div
                className={`preview-frame preview-viewport ${draggingSide === "source" ? "dragging" : ""}`}
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
                      className={`preview-stage ${sourceZoom === "fit" ? "fit-stage" : ""}`}
                      style={{
                        width: sourceStageWidth,
                        aspectRatio: sourceStageAspectRatio,
                      }}
                    >
                      <canvas
                        ref={sourcePreviewContent === "result-image" || (hasVerticalSpatialTarget && (sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2")) ? convertedCanvasRef : canvasRef}
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
                        onDoubleClick={sourcePreviewContent === "result-image" ? undefined : framing === "crop" ? clearCropSelection : undefined}
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
                          viewBox="0 0 256 192"
                          preserveAspectRatio="none"
                          aria-hidden="true"
                        >
                          <path
                            className="crop-selection-shade"
                            d={`M0 0H256V192H0Z M${cropOverlay.x} ${cropOverlay.y}h${cropOverlay.width}v${cropOverlay.height}h-${cropOverlay.width}Z`}
                            fillRule="evenodd"
                          />
                          <rect
                            className="crop-selection-rect"
                            x={cropOverlay.x}
                            y={cropOverlay.y}
                            width={cropOverlay.width}
                            height={cropOverlay.height}
                          />
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
                        <svg className="bitmap-editor-selection-overlay" viewBox={`0 0 ${displayedWidth} ${displayedHeight}`} preserveAspectRatio="none" aria-hidden="true">
                          <rect {...tilemapEditorSelectionOverlay} />
                        </svg>
                      ) : null}
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
            </section>
            <section className={`preview-panel result-panel ${workspaceMode === "tilemap" ? "tilemap-preview-panel" : ""}`} aria-labelledby="result-preview-title">
              <div className="preview-panel-heading">
                <h3 id="result-preview-title">{resultPreviewContent === "image" || resultPreviewContent === "result-image" ? resultLabel : resultPreviewContent === "source-image" ? "Conversion input" : resultPreviewContent === "bitmap-editor" ? "Bitmap editor" : resultPreviewContent === "pre-attribute" ? "Pre-attribute dither" : resultPreviewContent === "screen-1" ? hasVerticalSpatialTarget ? "Full resolution" : "Screen 1" : resultPreviewContent === "screen-2" ? hasVerticalSpatialTarget ? "Analytic" : "Screen 2" : resultPreviewContent === "merged-low" ? "Merged · low resolution" : resultPreviewContent === "merged-high" ? "Merged · high resolution" : resultPreviewContent === "palette-usage" ? "Palette usage" : resultPreviewContent === "tile-usage" ? "Used tiles" : resultPreviewContent === "unified-editor" ? "Unified editor" : resultPreviewContent === "difference" ? "Difference heatmap" : "Inspector"}</h3>
                <label className="preview-content-selector">
                  <span className="sr-only">Result window content</span>
                  <select
                    value={resultPreviewContent}
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
              </div>
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
                  (displayedResult !== null &&
                    (workspaceMode === "palette" || charsetState.kind === "ready")))
                  ? (
                    <div
                      className={[
                        "preview-stage",
                        resultZoom === "fit" ? "fit-stage" : "",
                        showPixelGrid && resultZoom !== "fit" && resultZoom >= 4 ? "show-pixel-grid" : "",
                        showAttributeGrid ? "show-attribute-grid" : "",
                      ].filter(Boolean).join(" ")}
                      style={{
                        width: resultStageWidth,
                        aspectRatio: resultStageAspectRatio,
                      }}
                    >
                      <canvas
                        ref={resultPreviewContent === "source-image" ? canvasRef : convertedCanvasRef}
                        aria-label={resultPreviewContent === "source-image" ? "Decoded source image preview" : "Converted hardware preview"}
                        aria-describedby="inspection-help"
                        tabIndex={resultPreviewContent === "source-image" ? undefined : 0}
                        onPointerMove={resultPreviewContent === "source-image" ? undefined : inspectResultPixel}
                        onPointerDown={resultPreviewContent === "source-image" ? undefined : selectResultPixel}
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
                      {(isZx || isPmd) ? <svg
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
                        <svg className="bitmap-editor-selection-overlay" viewBox={`0 0 ${displayedWidth} ${displayedHeight}`} preserveAspectRatio="none" aria-hidden="true">
                          <rect {...tilemapEditorSelectionOverlay} />
                        </svg>
                      ) : null}
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
            </section>
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
                      0x{(charsetState.result.artifact[inspectedTileIndex] ?? 0)
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
      </section>
    </main>
    </>
  );
}
