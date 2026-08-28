import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type UIEvent as ReactUIEvent,
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
import {
  ConversionWorkerClient,
  type WorkerCharsetResult,
  type WorkerConversionResult,
  type WorkerDecodedImage,
  type WorkerPmd85Import,
} from "./worker/client.js";
import type {
  CharsetConversionOptions,
  CharsetAssignment,
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
import {
  ATTRIBUTE_OPTIMIZERS,
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
  type Pmd85TargetModeId,
  type QlMixedOptimizerId,
  type QlTargetModeId,
  type ResamplingMethod,
  type Rotation,
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

function spatialSplitPreview(
  physical: Uint8Array,
  analytic: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const output = new Uint8Array(width * 2 * height * 4);
  for (let y = 0; y < height; y += 1) {
    const physicalRow = y * width * 4;
    const outputRow = y * width * 2 * 4;
    output.set(physical.subarray(physicalRow, physicalRow + width * 4), outputRow);
    const analyticRow = Math.floor(y / 2) * width * 4;
    output.set(
      analytic.subarray(analyticRow, analyticRow + width * 4),
      outputRow + width * 4,
    );
  }
  return output;
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
  loadWorkspacePreferences,
  saveWorkspacePreferences,
  type WorkspaceLayoutId,
  type WorkspacePreferences,
} from "./workspace-preferences.js";
import {
  mergeMonochromeRgba,
  zxBitmapToMonochromeRgba,
} from "./monochrome-preview.js";
import {
  applyBitmapCellEdit,
  type BitmapCell,
  type BitmapCellEditOperation,
} from "./bitmap-editor.js";
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

interface TileEditorSnapshot {
  readonly charset: Uint8Array;
  readonly assignments: readonly CharsetAssignment[];
  readonly encoding: CharsetEncoding;
}

interface SourceArtifactInfo {
  readonly sha256: string;
  readonly baseName: string;
  readonly bytes: Uint8Array;
}

type ResultOrigin = "direct-import" | "converted";

type PreviewSide = "source" | "result";
type PreviewZoom = "fit" | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type PreviewContent = "image" | "source-image" | "result-image" | "pre-attribute" | "screen-1" | "screen-2" | "merged-low" | "merged-high" | "palette-usage" | "tile-usage" | "tile-editor" | "bitmap-editor" | "inspector" | "difference";
type SettingsSection = "all" | "geometry" | "adjustments" | "palette" | "dithering" | "tilemap";

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
    attributes: result.attributes,
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
      <span>{label} {value}{unit}</span>
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
  } | null>(null);
  const charsetGlyphRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tileEditorPointerRef = useRef<{ pointerId: number; visited: Set<string> } | null>(null);
  const bitmapEditorPointerRef = useRef<{ pointerId: number; visited: Set<string> } | null>(null);
  const existingCharsetSelectionRef =
    useRef<readonly number[] | null>(null);
  const [state, setState] = useState<ConversionState>({ kind: "idle" });
  const [storedWorkspacePreferences] = useState<WorkspacePreferences>(() =>
    loadWorkspacePreferences(localStorage),
  );
  const [draftState, setDraftState] = useState<DraftState>({ kind: "idle" });
  const [lastFinal, setLastFinal] = useState<WorkerConversionResult | null>(null);
  const [charsetState, setCharsetState] = useState<CharsetState>({ kind: "idle" });
  const [tileEditorSelected, setTileEditorSelected] = useState(0);
  const [tileEditorActive, setTileEditorActive] = useState(true);
  const [tileEditorOriginals, setTileEditorOriginals] = useState<readonly (Uint8Array | null)[]>([]);
  const [tileEditorUndo, setTileEditorUndo] = useState<readonly TileEditorSnapshot[]>([]);
  const [tileEditorEdited, setTileEditorEdited] = useState(false);
  const [bitmapEditorCell, setBitmapEditorCell] = useState<BitmapCell | null>(null);
  const [bitmapEditorUndo, setBitmapEditorUndo] = useState<readonly BitmapCell[]>([]);
  const [bitmapEditorSelection, setBitmapEditorSelection] = useState<InspectedAttribute | null>(null);
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
  const [initialEnginePreferences] = useState(() =>
    loadEnginePreferences(localStorage, {
      platformId: DEFAULT_CONVERSION_SETTINGS.platformId,
      modeId: DEFAULT_CONVERSION_SETTINGS.modeId,
    })
  );
  const [selectedProfileId, setSelectedProfileId] = useState(BUILT_IN_PROFILE_ID);
  const [selectedPresetId, setSelectedPresetId] = useState("default");
  const [image, setImage] = useState<WorkerDecodedImage | null>(null);
  const [sourceFileName, setSourceFileName] = useState<string | null>(null);
  const [imageStatus, setImageStatus] = useState("Choose a PNG or JPEG image.");
  const [framing, setFraming] = useState<FramingMode>(DEFAULT_CONVERSION_SETTINGS.framing);
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
    ditherMethodForEngine(initialEnginePreferences.ditherEngineId)
  );
  const [attributeOptimizerId, setAttributeOptimizerId] =
    useState<AttributeOptimizerId>(initialEnginePreferences.attributeOptimizerId);
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
    useState<TargetModeId>(DEFAULT_CONVERSION_SETTINGS.modeId);
  const [orderedMatrix, setOrderedMatrix] = useState<OrderedMatrixId>(DEFAULT_CONVERSION_SETTINGS.orderedMatrix);
  const [amountEntry, setAmountEntry] = useState("100");
  const [errorDiffusionRandomization, setErrorDiffusionRandomization] = useState(
    DEFAULT_CONVERSION_SETTINGS.errorDiffusionRandomization,
  );
  const [errorDiffusionLineSuppression, setErrorDiffusionLineSuppression] = useState(
    DEFAULT_CONVERSION_SETTINGS.errorDiffusionLineSuppression,
  );
  const [previewZoom, setPreviewZoom] = useState<PreviewZoom>(storedWorkspacePreferences.previewZoom);
  const [synchronizePan, setSynchronizePan] = useState(storedWorkspacePreferences.synchronizePan);
  const [showPixelGrid, setShowPixelGrid] = useState(storedWorkspacePreferences.showPixelGrid);
  const [showAttributeGrid, setShowAttributeGrid] = useState(storedWorkspacePreferences.showAttributeGrid);
  const [hideAttributes, setHideAttributes] = useState(storedWorkspacePreferences.hideAttributes);
  const [scaleQlToDisplayAspect, setScaleQlToDisplayAspect] = useState(true);
  const [qlMixedDisplayResolution, setQlMixedDisplayResolution] =
    useState<QlMixedDisplayResolution>("high");
  const [pmd85PaletteCalibrationId, setPmd85PaletteCalibrationId] = useState(
    DEFAULT_CONVERSION_SETTINGS.pmd85.paletteCalibrationId,
  );
  const [pmd85CrtAspect, setPmd85CrtAspect] = useState<
    ConversionSettings["pmd85"]["crtAspect"]
  >(DEFAULT_CONVERSION_SETTINGS.pmd85.crtAspect);
  const [pmd85GapPolicy, setPmd85GapPolicy] = useState<
    ConversionSettings["pmd85"]["gapPolicy"]
  >(DEFAULT_CONVERSION_SETTINGS.pmd85.gapPolicy);
  const [sourcePreviewContent, setSourcePreviewContent] = useState<PreviewContent>(storedWorkspacePreferences.sourceContent);
  const [resultPreviewContent, setResultPreviewContent] = useState<PreviewContent>(storedWorkspacePreferences.resultContent);
  const [selectedPaletteColor, setSelectedPaletteColor] = useState<number | null>(null);
  const [paletteUsageFilter, setPaletteUsageFilter] = useState<"used" | "all">("used");
  const [tileUsageFilter, setTileUsageFilter] = useState<"used" | "all">("used");
  const [inspection, setInspection] = useState<InspectedAttribute | null>(null);
  const [draggingSide, setDraggingSide] = useState<PreviewSide | null>(null);
  const [inspectionDrawerOpen, setInspectionDrawerOpen] = useState(storedWorkspacePreferences.inspectionDrawerOpen);
  const [workspaceLayout, setWorkspaceLayout] = useState<WorkspaceLayoutId>(storedWorkspacePreferences.layout);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("all");
  const [cropPointerMode, setCropPointerMode] = useState<"create" | "move">("create");
  const [cropSelectionActive, setCropSelectionActive] = useState(true);
  const [inputPreviewStage, setInputPreviewStage] =
    useState<"source" | "pre-constraint">("source");
  const [outputPreviewStage, setOutputPreviewStage] =
    useState<"screen-1" | "screen-2" | "merged">("screen-1");
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
    saveEnginePreferences(localStorage, {
      attributeOptimizerId,
      ditherEngineId,
    });
    ditherEngineByMethodRef.current[ditherMethodForEngine(ditherEngineId)] =
      ditherEngineId;
  }, [attributeOptimizerId, ditherEngineId]);

  useEffect(() => {
    saveWorkspacePreferences(localStorage, {
      layout: workspaceLayout,
      sourceContent: sourcePreviewContent,
      resultContent: resultPreviewContent,
      previewZoom,
      synchronizePan,
      showPixelGrid,
      showAttributeGrid,
      hideAttributes,
      inspectionDrawerOpen,
    });
  }, [workspaceLayout, sourcePreviewContent, resultPreviewContent,
    previewZoom, synchronizePan, showPixelGrid, showAttributeGrid, hideAttributes,
    inspectionDrawerOpen]);

  useEffect(() => {
    if (image === null) return;
    setSourcePreviewContent("image");
    setResultPreviewContent("image");
    setWorkspaceLayout("conversion");
    setInspection(null);
    setBitmapEditorSelection(null);
    setSelectedPaletteColor(null);
  }, [image]);

  useEffect(() => {
    if (bitmapEditorSelection === null || workspaceMode !== "palette") {
      setBitmapEditorCell(null);
      setBitmapEditorUndo([]);
      return;
    }
    const rows = new Uint8Array(8);
    rows.set(bitmapEditorSelection.bitmapBytes.slice(0, 8));
    setBitmapEditorCell({ rows, attribute: bitmapEditorSelection.attribute });
    setBitmapEditorUndo([]);
  }, [bitmapEditorSelection, workspaceMode]);

  useEffect(() => {
    setSelectedPaletteColor(null);
  }, [targetModeId]);

  useEffect(() => {
    const mixedTarget = targetModeId === "zx48-mixed-256x192" ||
      targetModeId === "mode8-mode4-mixed-512x256";
    const unavailable = new Set<PreviewContent>();
    if (workspaceMode !== "palette") unavailable.add("pre-attribute");
    if (!mixedTarget) {
      unavailable.add("screen-1");
      unavailable.add("screen-2");
      unavailable.add("merged-low");
      unavailable.add("merged-high");
    }
    if (workspaceMode !== "tilemap") {
      unavailable.add("tile-usage");
      unavailable.add("tile-editor");
    }
    if (workspaceMode !== "palette") unavailable.add("bitmap-editor");
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
          pmd85CrtAspect,
          {
            framing,
            resampling,
            rotation,
            mirrorHorizontal,
            mirrorVertical,
            fillOffsetX,
            fillOffsetY,
            crop: { x: 0, y: 0, width: image.width, height: image.height },
            background: isPmd ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 },
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
    mirrorVertical, resampling, fillOffsetX, fillOffsetY,
    inputPreviewStage, workspaceMode, charsetState, sourcePreviewContent,
    resultPreviewContent,
    tilemapStale, hideAttributes, selectedPlatformId, targetModeId,
    pmd85CrtAspect, isPmd,
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
    if (
      hideAttributes &&
      displayResult.platformId === "zx-spectrum"
    ) {
      if (workspaceMode === "tilemap") {
        rgba = charsetState.kind === "ready"
          ? zxBitmapToMonochromeRgba(charsetState.result.decodedScr)
          : undefined;
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
            ? spatialSplitPreview(
                displayResult.frames[0]!.previewRgba,
                displayResult.verticalSpatialDiagnostics.analyticPreviewRgba,
                displayResult.width,
                displayResult.height,
              )
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
                ? displayResult.verticalSpatialDiagnostics.analyticPreviewRgba
                : displayResult.mergedPreviewRgba
            : displayResult.frames[0]?.previewRgba;
    }
    if (displayResult.verticalSpatialDiagnostics !== undefined) {
      if (outputPreviewStage === "merged") {
        previewWidth = displayResult.verticalSpatialDiagnostics.logicalWidth;
        previewHeight = displayResult.verticalSpatialDiagnostics.logicalHeight;
      } else if (outputPreviewStage === "screen-2") {
        previewWidth = displayResult.width * 2;
      }
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
  ]);

  useEffect(() => {
    setInspection(null);
  }, [draftState, lastFinal]);

  useEffect(() => {
    const profile = profiles.find(
      (candidate) => candidate.id === selectedProfileId,
    );
    const targetProducesMultipleFrames = targetModeId.includes("vertical-spatial") ||
      targetModeId === "zx48-mixed-256x192" ||
      (
        profile?.platform_id === "sinclair-ql" &&
        (
          targetModeId === "mode8-256x256" ||
          targetModeId === "mode4-512x256" ||
          targetModeId === "mode8-mode4-mixed-512x256"
        )
      );
    if (
      !targetProducesMultipleFrames &&
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
        pmd85CrtAspect === "approximate-4:3" ? 32 / 27 : 1,
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
    crop: { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
    cropAspectRatio,
    brightness,
    contrast,
    saturation,
    gamma,
    smoothing,
    sharpening,
    background: isPmd ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 },
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
    structured: {
      ...structuredSettings,
      ditherAmountPermille: dithering === "none" ? 0 : amount * 10,
    },
    pmd85: {
      mode: isPmd
        ? pmdHardwareModeForTarget(targetModeId as Pmd85TargetModeId)
        : DEFAULT_CONVERSION_SETTINGS.pmd85.mode,
      paletteCalibrationId: pmd85PaletteCalibrationId,
      crtAspect: pmd85CrtAspect,
      gapPolicy: pmd85GapPolicy,
    },
    ...(targetModeId.includes("vertical-spatial")
      ? {
          verticalSpatialMix: {
            schemaVersion: 1 as const,
            algorithmId: attributeOptimizerId === "zx-vertical-spatial-detail-v1"
              ? "vertical-spatial-detail-v1" as const
              : "vertical-spatial-uniform-v1" as const,
            calibrationId: "srgb-ideal-v1" as const,
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
    mirrorVertical, fillOffsetX, fillOffsetY, cropX, cropY, cropWidth, cropHeight,
    cropAspectRatio,
    brightness, contrast, saturation, gamma, smoothing, sharpening,
    borderColor, attributeHeight, attributeSmoothing, attributeHaloInfluence,
    attributeHaloHorizontal, attributeHaloVertical,
    screenFlickerSuppression,
    paletteSelections, dithering, amount, errorDiffusionRandomization,
    errorDiffusionLineSuppression,
    orderedMatrix, selectedProfileId, targetModeId, attributeOptimizerId,
    ditherEngineId, qlMixedOptimizerId, structuredSettings,
    pmd85PaletteCalibrationId, pmd85CrtAspect, pmd85GapPolicy,
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
        ? "pmd85-vertical-spatial-uniform-v1"
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
        crtAspect: pmd85CrtAspect,
        gapPolicy: pmd85GapPolicy,
      },
    });
    if (spatial) {
      return {
        ...retargeted,
        ditherEngineId: "vertical-spatial-none-v1",
        dithering: "none",
        ditheringAmount: 0,
        verticalSpatialMix: {
          schemaVersion: 1,
          algorithmId: "vertical-spatial-uniform-v1",
          calibrationId: "srgb-ideal-v1",
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
    setAttributeOptimizerId(next.attributeOptimizerId);
    setAttributeHeight(next.attributeHeight);
    setScreenFlickerSuppression(next.screenFlickerSuppression);
    if (next.modeId.includes("vertical-spatial")) {
      setDitherEngineId("vertical-spatial-none-v1");
      setDithering("none");
      setAmountEntry("0");
      setOutputPreviewStage("merged");
    } else if (ditherEngineId.startsWith("vertical-spatial-")) {
      setDitherEngineId("none-discrete-v2");
      setDithering("none");
      setAmountEntry("0");
    }
    setPaletteSelections(next.paletteSelections.map((selection) => ({
      ...selection,
      enabledColorIds: [...selection.enabledColorIds],
    })));
    if (next.platformId === "pmd-85") {
      setPmd85PaletteCalibrationId(next.pmd85.paletteCalibrationId);
      setPmd85CrtAspect(next.pmd85.crtAspect);
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
            nextSettings.pmd85.crtAspect === "approximate-4:3" ? 32 / 27 : 1,
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
        pmd85CrtAspect === "approximate-4:3" ? 32 / 27 : 1,
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
    setPreviewZoom(next);
  }

  function applyWorkspaceLayout(layout: WorkspaceLayoutId): void {
    const tilemapViews = workspaceMode === "tilemap";
    setWorkspaceLayout(layout);
    if (layout === "palette") {
      setSourcePreviewContent("image");
      setResultPreviewContent("palette-usage");
      setInspectionDrawerOpen(true);
      return;
    }
    if (layout === "tilemap") {
      setSourcePreviewContent(tilemapViews ? "tile-usage" : "image");
      setResultPreviewContent("image");
      setInspectionDrawerOpen(true);
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
    if (side === "source") setSourcePreviewContent(content);
    else setResultPreviewContent(content);
    setWorkspaceLayout("custom");
    if (content === "pre-attribute") setInputPreviewStage("pre-constraint");
    if (content === "image" || content === "source-image") setInputPreviewStage("source");
    if (content === "screen-1") setOutputPreviewStage("screen-1");
    if (content === "screen-2") setOutputPreviewStage("screen-2");
    if (content === "merged-low" || content === "merged-high") {
      setOutputPreviewStage("merged");
      setQlMixedDisplayResolution(content === "merged-low" ? "low" : "high");
    }
  }

  function focusSettingsSection(section: SettingsSection): void {
    setSettingsSection(section);
    if (section === "all") return;
    document.getElementById(`settings-${section}`)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }

  function stepZoom(delta: -1 | 1) {
    const current = previewZoom === "fit" ? 0 : previewZoom;
    const next = Math.max(0, Math.min(8, current + delta));
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
    const selected = inspectActivePixel(pixelX, pixelY);
    if (selected !== null) setBitmapEditorSelection(selected);
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

  function applySettings(
    next: ConversionSettings,
    sourceImage: WorkerDecodedImage | null = image,
  ) {
    setFraming(next.framing);
    setTargetModeId(next.modeId);
    setAttributeOptimizerId(next.attributeOptimizerId);
    setDitherEngineId(next.ditherEngineId);
    setQlMixedOptimizerId(next.qlMixedOptimizerId);
    setResampling(next.resampling);
    setRotation(next.rotation);
    setMirrorHorizontal(next.mirrorHorizontal);
    setMirrorVertical(next.mirrorVertical);
    setFillOffsetX(next.fillOffsetX);
    setFillOffsetY(next.fillOffsetY);
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
    setStructuredSettings(next.structured);
    setPmd85PaletteCalibrationId(next.pmd85.paletteCalibrationId);
    setPmd85CrtAspect(next.pmd85.crtAspect);
    setPmd85GapPolicy(next.pmd85.gapPolicy);
    if (next.modeId.includes("vertical-spatial")) {
      setOutputPreviewStage("merged");
      setAmountEntry("0");
    }
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
    setOutputPreviewStage("screen-1");
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
            engine.method === "ordered" && engine.family === undefined;
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

  function initializeTileEditor(result: WorkerCharsetResult): void {
    setTileEditorSelected(0);
    setTileEditorActive(true);
    setTileEditorOriginals(Array.from({ length: result.characterCount }, () => null));
    setTileEditorUndo([]);
    setTileEditorEdited(false);
  }

  function commitTileEditorResult(
    result: WorkerCharsetResult,
    charset: Uint8Array,
    assignments = result.assignments,
    encoding = result.encoding,
  ): void {
    const next = rebuildCharsetResult(result, charset, assignments, encoding);
    setCharsetState({ kind: "ready", result: next });
    setTilemapStale(false);
    setDirty(true);
    setTileEditorEdited(true);
  }

  function snapshotTileEditor(result: WorkerCharsetResult): TileEditorSnapshot {
    return {
      charset: result.charset.slice(),
      assignments: result.assignments.map((assignment) => ({ ...assignment })),
      encoding: result.encoding,
    };
  }

  function applyEditorOperation(operation: TileEditOperation, pushHistory = true): void {
    if (charsetState.kind !== "ready") return;
    const result = charsetState.result;
    const tile = result.charset.slice(tileEditorSelected * 8, tileEditorSelected * 8 + 8);
    if (pushHistory) {
      setTileEditorUndo((history) => [...history, snapshotTileEditor(result)]);
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
    setTileEditorActive(true);
    charsetGlyphRefs.current[index]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function exitTileEditor(): void {
    if (charsetState.kind !== "ready") return;
    const charset = charsetState.result.charset.slice();
    const count = charset.length / 8;
    setExistingCharset(charset);
    setExistingCharsetName("generated-charset.chr");
    setExistingCharsetStart(0);
    setExistingCharsetLength(count);
    setExistingCharsetStartEntry("1");
    setExistingCharsetLengthEntry(String(count));
    existingCharsetSelectionRef.current = null;
    setExistingCharsetSelection(null);
    setCharsetBudget(count);
    if (count > 32) setCharsetEncoding("extended");
    setCharsetSource("existing");
    setTileEditorActive(false);
    setTilemapStale(true);
    setDirty(true);
  }

  function undoTileEditor(): void {
    const snapshot = tileEditorUndo[tileEditorUndo.length - 1];
    if (snapshot === undefined) return;
    setTileEditorUndo((history) => history.slice(0, -1));
    setCharsetEncoding(snapshot.encoding);
    setCharsetState((current) => current.kind === "ready"
      ? { kind: "ready", result: rebuildCharsetResult(current.result, snapshot.charset, snapshot.assignments, snapshot.encoding) }
      : current);
    setDirty(true);
    setTileEditorEdited(true);
  }

  function revertSelectedTile(): void {
    if (charsetState.kind !== "ready") return;
    const original = tileEditorOriginals[tileEditorSelected];
    if (original === null || original === undefined) return;
    setTileEditorUndo((history) => [...history, snapshotTileEditor(charsetState.result)]);
    commitTileEditorResult(
      charsetState.result,
      replaceTileInCharset(charsetState.result.charset, tileEditorSelected, original),
    );
  }

  function createEditorTile(): void {
    if (charsetState.kind !== "ready" || charsetState.result.characterCount >= 256) return;
    setTileEditorUndo((history) => [...history, snapshotTileEditor(charsetState.result)]);
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
    setTileEditorUndo((history) => [...history, snapshotTileEditor(result)]);
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
  }

  function moveEditorTile(delta: -1 | 1): void {
    if (charsetState.kind !== "ready") return;
    const count = charsetState.result.characterCount;
    const target = tileEditorSelected + delta;
    if (target < 0 || target >= count) return;
    setTileEditorUndo((history) => [...history, snapshotTileEditor(charsetState.result)]);
    const order = Array.from({ length: count }, (_, index) => index);
    [order[tileEditorSelected], order[target]] = [order[target]!, order[tileEditorSelected]!];
    const reordered = reorderCharsetTiles(charsetState.result.charset, charsetState.result.assignments, order);
    commitTileEditorResult(charsetState.result, reordered.charset, reordered.assignments);
    setTileEditorSelected(target);
    setTileEditorOriginals((originals) => {
      const next = [...originals];
      [next[tileEditorSelected], next[target]] = [next[target] ?? null, next[tileEditorSelected] ?? null];
      return next;
    });
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
    setBitmapEditorUndo((history) => [...history, bitmapEditorCell]);
    setBitmapEditorCell(applyBitmapCellEdit(bitmapEditorCell, operation));
  }

  function undoBitmapEditor(): void {
    const previous = bitmapEditorUndo[bitmapEditorUndo.length - 1];
    if (previous === undefined) return;
    setBitmapEditorCell(previous);
    setBitmapEditorUndo((history) => history.slice(0, -1));
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

  function setBitmapEditorAttribute(mask: number, value: number): void {
    if (bitmapEditorCell === null) return;
    applyBitmapEditorOperation({
      kind: "set-attribute",
      attribute: (bitmapEditorCell.attribute & ~mask) | (value & mask),
    });
  }

  function applyBitmapEditorToResult(): void {
    const activeResult = draftPreviewResult(draftState) ?? lastFinal;
    if (bitmapEditorCell === null || bitmapEditorSelection === null || activeResult === null ||
        activeResult.platformId !== "zx-spectrum" || activeResult.frames.length !== 1) return;
    const frame = activeResult.frames[0];
    const height = activeResult.attributeHeight ?? attributeHeight;
    if (frame === undefined || height !== 8) return;
    const encoded = Uint8Array.from(frame.encoded);
    for (let row = 0; row < 8; row += 1) {
      encoded[zxBitmapOffset(bitmapEditorSelection.cellX, bitmapEditorSelection.cellY * 8 + row)] =
        bitmapEditorCell.rows[row] ?? 0;
    }
    encoded[6144 + bitmapEditorSelection.cellY * 32 + bitmapEditorSelection.cellX] =
      bitmapEditorCell.attribute;
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
    setLastFinal(nextResult);
    setDraftState({ kind: "idle" });
    setState({ kind: "ready", result: nextResult });
    setDirty(true);
    setBitmapEditorUndo([]);
  }

  function markCharsetSelectionChanged(indices: readonly number[]): void {
    const sorted = [...new Set(indices)].sort((left, right) => left - right);
    existingCharsetSelectionRef.current = sorted;
    setExistingCharsetSelection(sorted);
    if (sorted.length > 32) setCharsetEncoding("extended");
    invalidateCharset();
    setTilemapStale(true);
  }

  function activeRangeIndices(): number[] {
    return Array.from(
      { length: existingCharsetLength },
      (_, index) => existingCharsetStart + index,
    );
  }

  function toggleCharsetCharacter(characterIndex: number): void {
    if (charsetSource !== "existing" || existingCharset === null) return;
    const selected = new Set(
      existingCharsetSelectionRef.current ?? activeRangeIndices(),
    );
    if (selected.has(characterIndex)) selected.delete(characterIndex);
    else selected.add(characterIndex);
    markCharsetSelectionChanged([...selected]);
  }

  function paintCharsetCharacter(
    characterIndex: number,
    selecting: boolean,
  ): void {
    const drag = charsetSelectionDragRef.current;
    if (drag === null || drag.visited.has(characterIndex)) return;
    drag.visited.add(characterIndex);
    const selected = new Set(
      existingCharsetSelectionRef.current ?? activeRangeIndices(),
    );
    if (selecting) selected.add(characterIndex);
    else selected.delete(characterIndex);
    markCharsetSelectionChanged([...selected]);
  }

  function beginCharsetSelection(
    characterIndex: number,
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void {
    if (charsetSource !== "existing" || existingCharset === null) return;
    event.preventDefault();
    const selected = new Set(
      existingCharsetSelectionRef.current ?? activeRangeIndices(),
    );
    const selecting = !selected.has(characterIndex);
    charsetSelectionDragRef.current = {
      pointerId: event.pointerId,
      selecting,
      visited: new Set<number>(),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    paintCharsetCharacter(characterIndex, selecting);
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
    charsetSelectionDragRef.current = null;
  }

  function clearCharsetSelection(): void {
    const count = Math.floor((existingCharset?.length ?? 0) / 8);
    existingCharsetSelectionRef.current = null;
    setExistingCharsetSelection(null);
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
    const count = Math.floor(existingCharset.length / 8);
    const selected = new Set(
      existingCharsetSelectionRef.current ?? activeRangeIndices(),
    );
    markCharsetSelectionChanged(
      Array.from(
        { length: count },
        (_, characterIndex) => characterIndex,
      ).filter((characterIndex) => !selected.has(characterIndex)),
    );
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
      const png = encodeRgbaPng(
        spatial?.analyticPreviewRgba ?? lastFinal.mergedPreviewRgba,
        spatial?.logicalWidth ?? lastFinal.width,
        spatial?.logicalHeight ?? lastFinal.height,
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
      sourceFormat: image.format,
      sourceWidth: image.width,
      sourceHeight: image.height,
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
        sourceFormat: image.format,
        resultOrigin,
        settings: conversionSettings,
        scr: lastFinal.scr,
        frames: lastFinal.frames.map((frame) => frame.encoded),
        previewPng,
        metadataJson,
        profile: selectedProfile,
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
          validated.settings.pmd85.crtAspect === "approximate-4:3" ? 32 / 27 : 1,
        );
        decoded = imported.image;
        recomputed = validated.resultOrigin === "direct-import"
          ? directPmd85Result(imported, validated.settings)
          : await verifier.convertImage(
              decoded,
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
        recomputed = await verifier.convertImage(
          decoded,
          validated.settings,
          "high",
          projectPmdPalette === undefined
            ? undefined
            : { foregroundPalette: projectPmdPalette },
        );
      }
      if (
        recomputed.frames.length !== validated.frames.length ||
        recomputed.frames.some((frame, index) =>
          !equalBytes(frame.encoded, validated.frames[index] ?? new Uint8Array())
        )
      ) {
        throw new Error("PROJECT_REPRODUCTION_FAILED: screen bytes differ.");
      }
      const archivedPreview = await verifier.decodeImage(Uint8Array.from(validated.previewPng).buffer);
      const expectedArchivedPreview = recomputed.verticalSpatialDiagnostics;
      if (
        archivedPreview.width !== (expectedArchivedPreview?.logicalWidth ?? recomputed.width) ||
        archivedPreview.height !== (expectedArchivedPreview?.logicalHeight ?? recomputed.height) ||
        !equalBytes(
          archivedPreview.rgba,
          expectedArchivedPreview?.analyticPreviewRgba ?? recomputed.mergedPreviewRgba,
        )
      ) throw new Error("PROJECT_REPRODUCTION_FAILED: decoded preview pixels differ.");
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
      const differingMetadataKeys = projection.filter((key) =>
        typeof key !== "string" ||
        JSON.stringify(archivedMetadata[key]) !== JSON.stringify(rebuiltMetadata[key])
      );
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
      setImage(decoded);
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
  const bitmapEditorResult = draftPreviewResult(draftState) ?? lastFinal;
  const bitmapEditorCanApply = bitmapEditorResult !== null &&
    bitmapEditorResult.platformId === "zx-spectrum" &&
    bitmapEditorResult.frames.length === 1 &&
    (bitmapEditorResult.attributeHeight ?? attributeHeight) === 8;
  const displayedAttributeHeight = displayedResult?.attributeHeight ?? attributeHeight;
  const displayedWidth = displayedResult?.verticalSpatialDiagnostics === undefined
    ? displayedResult?.width ?? 256
    : outputPreviewStage === "merged"
      ? displayedResult.verticalSpatialDiagnostics.logicalWidth
      : outputPreviewStage === "screen-2"
        ? displayedResult.width * 2
        : displayedResult.width;
  const displayedHeight = displayedResult?.verticalSpatialDiagnostics !== undefined &&
      outputPreviewStage === "merged"
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
  const tileEditorPreview = charsetState.kind !== "ready"
    ? <p>Run Tilemap High to open the tile editor.</p>
    : <>
        <p><strong>Tile {tileEditorSelected + 1}</strong> · {charsetState.result.assignments.filter((assignment) => assignment.characterIndex === tileEditorSelected).length} cells use this tile</p>
        <div className="tile-editor-grid tile-editor-grid-main" role="grid" aria-label={`Tile ${tileEditorSelected + 1} bitmap, 8 by 8 pixels`} onPointerDown={beginTileEditorPaint} onPointerMove={moveTileEditorPaint} onPointerUp={endTileEditorPaint} onPointerCancel={endTileEditorPaint}>
          {Array.from({ length: 64 }, (_, pixelIndex) => {
            const x = pixelIndex % 8;
            const y = Math.floor(pixelIndex / 8);
            const row = charsetState.result.charset[tileEditorSelected * 8 + y] ?? 0;
            const on = (row & (0x80 >> x)) !== 0;
            return <span className={`tile-editor-pixel${on ? " on" : ""}`} key={pixelIndex} role="gridcell" aria-label={`${x}, ${y}${on ? ": on" : ": off"}`} />;
          })}
        </div>
        <p className="control-help">Click or drag pixels to toggle them. The existing tile editor controls remain available in the side panel.</p>
      </>;
  const bitmapEditorPreview = bitmapEditorCell === null
    ? <p>Point at a converted cell first, then open the Bitmap editor.</p>
    : <>
        <p><strong>Cell {bitmapEditorSelection?.cellX ?? 0}, {bitmapEditorSelection?.cellY ?? 0}</strong> · Attribute 0x{bitmapEditorCell.attribute.toString(16).padStart(2, "0")}</p>
        <div className="bitmap-editor-layout">
          <div className="tile-editor-grid tile-editor-grid-main bitmap-editor-grid" role="grid" aria-label="Selected cell bitmap, 8 by 8 pixels" onPointerDown={beginBitmapEditorPaint} onPointerMove={moveBitmapEditorPaint} onPointerUp={endBitmapEditorPaint} onPointerCancel={endBitmapEditorPaint}>
            {Array.from({ length: 64 }, (_, pixelIndex) => {
              const x = pixelIndex % 8;
              const y = Math.floor(pixelIndex / 8);
              const on = ((bitmapEditorCell.rows[y] ?? 0) & (0x80 >> x)) !== 0;
              return <span className={`tile-editor-pixel${on ? " on" : ""}`} key={pixelIndex} role="gridcell" aria-label={`${x}, ${y}${on ? ": on" : ": off"}`} />;
            })}
          </div>
          <div className="bitmap-editor-side">
            <div className="bitmap-editor-attributes">
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
          <button className="secondary compact" type="button" onClick={() => applyBitmapEditorOperation({ kind: "shift", dx: -1, dy: 0 })}>←</button>
          <button className="secondary compact" type="button" onClick={() => applyBitmapEditorOperation({ kind: "shift", dx: 1, dy: 0 })}>→</button>
          <button className="secondary compact" type="button" onClick={() => applyBitmapEditorOperation({ kind: "shift", dx: 0, dy: -1 })}>↑</button>
          <button className="secondary compact" type="button" onClick={() => applyBitmapEditorOperation({ kind: "shift", dx: 0, dy: 1 })}>↓</button>
          <button className="secondary compact" type="button" onClick={undoBitmapEditor} disabled={bitmapEditorUndo.length === 0}>Undo</button>
          <button className="primary compact" type="button" onClick={applyBitmapEditorToResult} disabled={bitmapEditorCell === null || bitmapEditorSelection === null || !bitmapEditorCanApply}>Apply to result</button>
            </div>
          </div>
        </div>
      </>;
  const qlVerticalPixelScale = isQl && (
      targetModeId === "mode4-512x256" ||
      targetModeId === "mode4-plain-512x256" ||
      targetModeId === "mode8-mode4-mixed-512x256" ||
      targetModeId === "mode4-vertical-spatial-512x256"
    )
    ? 2
    : 1;
  const analyticVerticalScale = targetModeId.includes("vertical-spatial") &&
      outputPreviewStage === "merged"
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
  const previewAspect = resolvePreviewAspect(
    displayedWidth,
    displayedHeight,
    isPmd
      ? pmd85CrtAspect === "approximate-4:3"
      : isQl && scaleQlToDisplayAspect,
    qlVerticalPixelScale,
    isPmd ? 32 / 27 : 4 / 3,
    analyticVerticalScale,
  );
  const previewAspectRatio = `${previewAspect.width} / ${previewAspect.height}`;
  const previewStageWidth = previewZoom === "fit"
    ? undefined
    : `${previewAspect.width * previewZoom}px`;
  const sourceStageAspectRatio = sourcePreviewContent === "source-image" && image !== null
    ? `${image.width} / ${image.height}`
    : previewAspectRatio;
  const sourceStageWidth = sourcePreviewContent === "source-image" && image !== null && previewZoom !== "fit"
    ? `${image.width * previewZoom}px`
    : previewStageWidth;
  const resultStageAspectRatio = resultPreviewContent === "source-image" && image !== null
    ? `${image.width} / ${image.height}`
    : previewAspectRatio;
  const resultStageWidth = resultPreviewContent === "source-image" && image !== null && previewZoom !== "fit"
    ? `${image.width * previewZoom}px`
    : previewStageWidth;
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
  const outputPaletteColors = outputPreviewStage === "merged" &&
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
    if (first === undefined || second === undefined) return null;
    const width = displayedResult.width;
    const height = displayedResult.height;
    const encode = (rgba: Uint8Array) => rgbaPngDataUrl(rgba, width, height);
    const mergedLow = displayedResult.platformId === "sinclair-ql" &&
      displayedResult.modeId === "mode8-mode4-mixed-512x256"
      ? renderQlMixedDisplayPreview(first.previewRgba, second.previewRgba, width, "low")
      : displayedResult.mergedPreviewRgba;
    const mergedHigh = displayedResult.platformId === "sinclair-ql" &&
      displayedResult.modeId === "mode8-mode4-mixed-512x256"
      ? renderQlMixedDisplayPreview(first.previewRgba, second.previewRgba, width, "high")
      : displayedResult.mergedPreviewRgba;
    return {
      "screen-1": encode(first.previewRgba),
      "screen-2": encode(second.previewRgba),
      "merged-low": encode(mergedLow),
      "merged-high": encode(mergedHigh),
    };
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
    return <img className="preview-difference-image" src={mixedScreenWindowImages[content as keyof typeof mixedScreenWindowImages]} alt={`${content} preview`} />;
  };
  const retainedDraftVisible = draftPreviewResult(draftState) !== null;
  const platformLabel = isQl ? "Sinclair QL" : isPmd ? "Tesla PMD 85" : "ZX Spectrum";
  const paletteResultLabel = draftState.kind === "ready"
    ? `${platformLabel} result · Draft preview`
    : retainedDraftVisible &&
        (draftState.kind === "scheduled" || draftState.kind === "running")
      ? `${platformLabel} result · Draft updating`
    : state.kind === "stale" ? `${platformLabel} result · stale High`
    : state.kind === "ready" ? `${platformLabel} result · completed High`
    : `${platformLabel} result`;
  const resultLabel = workspaceMode === "tilemap"
    ? `Tilemap reconstruction${
        tilemapStale ? " · stale" :
        charsetState.kind === "running" ? " · converting" :
        charsetState.kind === "ready" ? tileEditorEdited ? " · edited" : " · current" : ""
      }`
      : paletteResultLabel;
  const hasMixedScreenTarget = targetModeId === "zx48-mixed-256x192" ||
    targetModeId === "mode8-mode4-mixed-512x256";
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

      <section className="proof workspace" aria-labelledby="workspace-title">
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
          <fieldset id="settings-geometry" className="control-group geometry-group">
            <legend>Geometry</legend>
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
          {framing === "fill" ? (
            <fieldset className="framing-detail focal-control">
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
            <fieldset className="framing-detail crop-control" aria-describedby={cropValid ? "crop-help" : "crop-error"}>
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
                Drag on the Source image to select. Drag inside to move; use Arrow
                keys to move one pixel; double-click inside to clear. Coordinates
                refer to the oriented source.
              </span>
              {cropValid ? null : <span className="field-error" id="crop-error">Invalid value</span>}
            </fieldset>
          ) : null}
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
          <fieldset className="orientation-control">
            <legend>Mirror</legend>
            <label className="check-control">
              <input type="checkbox" checked={mirrorHorizontal} onChange={(event) => { setMirrorHorizontal(event.target.checked); setState({ kind: "idle" }); }} />
              <span>Horizontal</span>
            </label>
            <label className="check-control">
              <input type="checkbox" checked={mirrorVertical} onChange={(event) => { setMirrorVertical(event.target.checked); setState({ kind: "idle" }); }} />
              <span>Vertical</span>
            </label>
          </fieldset>
          </fieldset>
          <fieldset id="settings-adjustments" className="adjustment-control control-group">
            <legend>Image adjustments</legend>
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
          {workspaceMode === "palette" ? (
          <>
          <fieldset id="settings-palette" className="control-group palette-group">
            <legend>{isQl ? "QL palette" : isPmd ? "PMD 85 legal foregrounds" : "ZX palette and attributes"}</legend>
          {isZx ? (
          <>
          <label>
            <span>Attribute size</span>
            <select
              value={attributeHeight}
              onChange={(event) => {
                const nextHeight = Number(event.target.value) as AttributeHeight;
                setAttributeHeight(nextHeight);
                if (nextHeight < 4) setAttributeHaloVertical(0);
                setState({ kind: "idle" });
              }}
            >
              <option value={8}>8×8</option>
              <option value={4}>8×4</option>
              <option value={2}>8×2</option>
              <option value={1}>8×1</option>
            </select>
          </label>
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
          <label>
            <span>Horizontal halo</span>
            <select
              value={attributeHaloHorizontal}
              disabled={dithering === "none"}
              onChange={(event) => {
                setAttributeHaloHorizontal(
                  Number(event.target.value) as AttributeHaloRadius,
                );
                setState({ kind: "idle" });
              }}
            >
              <option value={0}>0 px</option>
              <option value={1}>1 px</option>
              <option value={2}>2 px</option>
            </select>
          </label>
          <label>
            <span>Vertical halo</span>
            <select
              value={attributeHeight >= 4 ? attributeHaloVertical : 0}
              disabled={dithering === "none" || attributeHeight < 4}
              onChange={(event) => {
                setAttributeHaloVertical(
                  Number(event.target.value) as AttributeHaloRadius,
                );
                setState({ kind: "idle" });
              }}
            >
              <option value={0}>0 px</option>
              <option value={1}>1 px</option>
              <option value={2}>2 px</option>
            </select>
            {attributeHeight < 4
              ? <span className="control-help">Disabled for 8×1 and 8×2 attributes.</span>
              : null}
          </label>
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
          </fieldset>
          <fieldset id="settings-dithering" className="control-group dithering-group">
            <legend>Dithering</legend>
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
            <label>
              <span>Dither engine</span>
              <select
                value={ditherEngineId}
                onChange={(event) => {
                  const id = event.target.value as DitherEngineId;
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
                }}
              >
                {(() => {
                  const compatible = DITHER_ENGINES.filter((engine) =>
                    engine.platforms.includes(selectedPlatformId as never) &&
                    isCompatibleEnginePair(attributeOptimizerId, engine.id) &&
                    (engine.targetModeIds === undefined || engine.targetModeIds.includes(targetModeId)) &&
                    (targetModeId !== "zx48-mixed-256x192" || !("family" in engine))
                  );
                  const recommended = new Set<DitherEngineId>([
                    "none-discrete-v2", "ordered-strict-matrix-v6",
                    "ordered-mixed-phase-stable-v8",
                    "error-diffusion-decorrelated-v3",
                  ]);
                  return <>
                    <optgroup label="Recommended">
                      {compatible.filter((engine) => recommended.has(engine.id)).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}{engine.equivalenceGroupByTarget?.[targetModeId] ? " · equivalent in this mode" : ""}</option>)}
                    </optgroup>
                    <optgroup label="Alternatives and historical engines">
                      {compatible.filter((engine) =>
                        !recommended.has(engine.id) && engine.lifecycle !== "experimental"
                        ).map((engine) =>
                          <option key={engine.id} value={engine.id}>{engine.name}{engine.equivalenceGroupByTarget?.[targetModeId] ? " · equivalent in this mode" : ""}</option>)}
                    </optgroup>
                    <optgroup label="Experimental engines">
                        {compatible.filter((engine) => engine.lifecycle === "experimental").map((engine) =>
                          <option key={engine.id} value={engine.id}>{engine.name}{engine.equivalenceGroupByTarget?.[targetModeId] ? " · equivalent in this mode" : ""}</option>)}
                    </optgroup>
                  </>;
                })()}
              </select>
            </label>
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
          <label>
            <span>Dithering method</span>
            <select
              value={dithering}
              onChange={(event) => switchDithering(event.target.value as DitheringMethod)}
            >
              <option value="none">No dithering</option>
              <option value="ordered">Ordered</option>
              <option value="error-diffusion">Error diffusion</option>
            </select>
          </label>
          {dithering === "ordered" ? (
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
            <label>
              <span>Error diffusion method</span>
              <select
                value={ditherEngineId}
                onChange={(event) => {
                  setDitherEngineId(event.target.value as DitherEngineId);
                  setState({ kind: "idle" });
                }}
              >
                {(() => {
                  const compatible = DITHER_ENGINES.filter((engine) =>
                    engine.method === "error-diffusion" &&
                    engine.platforms.includes(selectedPlatformId as never) &&
                    isCompatibleEnginePair(attributeOptimizerId, engine.id) &&
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
          {dithering === "error-diffusion" ? (
            <>
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
              {ditherEngineId === "error-diffusion-phase-balanced-v3" ? (
                <div
                  className="dithering-parameter"
                  title="Reduces vertical diffusion runs while retaining short 2×1 transitions. At 0%, output matches Projected unrestricted v2."
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
                    Reduces vertical diffusion runs while retaining short 2×1 transitions. At 0%, output matches Projected unrestricted v2.
                  </span>
                </div>
              ) : null}
            </>
          ) : null}
          </fieldset>
          </>
          ) : (
          <>
          <fieldset id="settings-tilemap" className="control-group tilemap-settings-group">
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
          {exportError === null ? null : <div className="field-error" role="alert">{exportError}</div>}
        </form>

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
                  max="8"
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
                disabled={previewZoom === 8}
              >+</button>
              <button className="secondary compact zoom-reset" type="button" onClick={() => setZoom("fit")}>Fit</button>
            </div>
          </div>

          <div className="inspection-controls">
            <h3>Tools</h3>
            <label>
              <span>Configuration focus</span>
              <select
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
            <label>
              <span>Workspace layout</span>
              <select
                value={workspaceLayout}
                onChange={(event) => applyWorkspaceLayout(event.target.value as WorkspaceLayoutId)}
              >
                <option value="conversion">Conversion</option>
                <option value="palette">Palette tuning</option>
                <option value="tilemap" disabled={workspaceMode !== "tilemap"}>Tilemap cleanup</option>
                <option value="inspection">Pixel inspection</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            {isZx ? <label>
              <span>Border color</span>
              <select
                value={borderColor}
                onChange={(event) => {
                  setBorderColor(Number(event.target.value));
                  if (image !== null) setDirty(true);
                }}
              >
                {ZX_BASE_COLORS.map((color) => (
                  <option key={color.code} value={color.code}>{color.name}</option>
                ))}
              </select>
            </label> : null}
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
            <label className="check-control">
              <input type="checkbox" checked={synchronizePan} onChange={(event) => setSynchronizePan(event.target.checked)} />
              <span>Synchronize pan</span>
            </label>
            <label className="check-control">
              <input type="checkbox" checked={showPixelGrid} onChange={(event) => setShowPixelGrid(event.target.checked)} />
              <span>Pixel grid</span>
            </label>
            {(isQl || isPmd) && workspaceMode === "palette" ? <label
              className="check-control"
              title={isPmd
                ? "Display the 288×256 logical PMD image at an approximate physical 4:3 aspect. Disable for square-pixel 9:8 inspection."
                : "Display Mode 8 pixels at 4/3 × 1 and Mode 4 pixels at 4/3 × 2, producing the physical 4:3 monitor image. Disable for square-pixel inspection."}
            >
              <input
                type="checkbox"
                checked={isPmd
                  ? pmd85CrtAspect === "approximate-4:3"
                  : scaleQlToDisplayAspect}
                onChange={(event) => {
                  if (isPmd) {
                    setPmd85CrtAspect(event.target.checked
                      ? "approximate-4:3"
                      : "square-pixel");
                    setState({ kind: "idle" });
                  } else {
                    setScaleQlToDisplayAspect(event.target.checked);
                  }
                }}
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
            {workspaceMode === "palette" ? (
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

          {workspaceMode === "palette" ? (
          <aside className="preview-palette-panel" aria-label="Palette selector">
            <details className="palette-control">
              <summary>
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
              </summary>
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
            </details>
          </aside>
          ) : (
          <aside className="tilemap-charset-panel" aria-label="Charset selector">
            <div className="tilemap-charset-heading">
              <strong>{tileEditorActive ? "Tile editor" : "Tile selection"}</strong>
              <span>{glyphCount} available · {glyphActiveCount} active{tileEditorEdited ? " · Edited" : ""}</span>
              {tileEditorActive && charsetState.kind === "ready" ? (
                <button className="secondary compact tile-editor-exit" type="button" onClick={exitTileEditor}>Exit editor</button>
              ) : null}
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
                const editorReady = charsetState.kind === "ready" && tileEditorActive;
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
                    onClick={() => editorReady
                      ? selectEditorTile(characterIndex)
                      : undefined}
                    onPointerDown={(event) => editorReady
                      ? undefined
                      : beginCharsetSelection(characterIndex, event)}
                    onKeyDown={(event) => editorReady
                      ? (event.key === "ArrowLeft" || event.key === "ArrowRight" || event.key === "ArrowUp" || event.key === "ArrowDown"
                        ? handleCharsetGlyphKey(characterIndex, event)
                        : event.key === "Enter" || event.key === " "
                          ? (event.preventDefault(), selectEditorTile(characterIndex))
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
            {charsetState.kind === "ready" && tileEditorActive ? (
              <section className="tile-editor" aria-label="Tile editor">
                <div className="tile-editor-heading">
                  <strong>Tile {tileEditorSelected + 1}</strong>
                  <span>{charsetState.result.assignments.filter((assignment) => assignment.characterIndex === tileEditorSelected).length} cells use this tile</span>
                </div>
                <div className="tile-editor-order-actions">
                  <button className="secondary compact" type="button" aria-label="Move tile left" title="Move tile left" disabled={tileEditorSelected === 0} onClick={() => moveEditorTile(-1)}>←</button>
                  <button className="secondary compact" type="button" aria-label="Move tile right" title="Move tile right" disabled={tileEditorSelected >= charsetState.result.characterCount - 1} onClick={() => moveEditorTile(1)}>→</button>
                  <button className="secondary compact tile-editor-sort-button" type="button" aria-label="Sort tiles by usage count" title="Sort tiles by usage count" onClick={sortEditorTilesByUsage}>⇵ Usage</button>
                </div>
                <div
                  className="tile-editor-grid"
                  role="grid"
                  aria-label={`Tile ${tileEditorSelected + 1} bitmap, 8 by 8 pixels`}
                  onPointerDown={beginTileEditorPaint}
                  onPointerMove={moveTileEditorPaint}
                  onPointerUp={endTileEditorPaint}
                  onPointerCancel={endTileEditorPaint}
                >
                  {Array.from({ length: 64 }, (_, pixelIndex) => {
                    const x = pixelIndex % 8;
                    const y = Math.floor(pixelIndex / 8);
                    const row = charsetState.result.charset[tileEditorSelected * 8 + y] ?? 0;
                    const on = (row & (0x80 >> x)) !== 0;
                    return <span className={`tile-editor-pixel${on ? " on" : ""}`} key={pixelIndex} role="gridcell" aria-label={`${x}, ${y}${on ? ": on" : ": off"}`} />;
                  })}
                </div>
                <div className="tile-editor-toolbar">
                  <button className="secondary compact tile-editor-icon-button" type="button" aria-label="Rotate tile left" title="Rotate left" onClick={() => applyEditorOperation({ kind: "rotate-left" })}>←</button>
                  <button className="secondary compact tile-editor-icon-button" type="button" aria-label="Rotate tile right" title="Rotate right" onClick={() => applyEditorOperation({ kind: "rotate-right" })}>→</button>
                  <button className="secondary compact tile-editor-icon-button" type="button" aria-label="Rotate tile up" title="Rotate up" onClick={() => applyEditorOperation({ kind: "rotate-up" })}>↑</button>
                  <button className="secondary compact tile-editor-icon-button" type="button" aria-label="Rotate tile down" title="Rotate down" onClick={() => applyEditorOperation({ kind: "rotate-down" })}>↓</button>
                  <button className="secondary compact tile-editor-icon-button" type="button" aria-label="Clear tile" title="Clear tile" onClick={() => applyEditorOperation({ kind: "clear" })}>×</button>
                  <button className="secondary compact tile-editor-icon-button" type="button" aria-label="Invert tile" title="Invert tile" onClick={() => applyEditorOperation({ kind: "invert" })}>◐</button>
                  <button className="secondary compact tile-editor-icon-button" type="button" aria-label="Undo last tile edit" title="Undo" disabled={tileEditorUndo.length === 0} onClick={undoTileEditor}>↶</button>
                  <button className="secondary compact tile-editor-icon-button" type="button" aria-label="Revert selected tile" title="Revert selected tile" disabled={tileEditorOriginals[tileEditorSelected] === null} onClick={revertSelectedTile}>↺</button>
                </div>
                <div className="tile-editor-structure-actions">
                  <button className="secondary compact" type="button" aria-label="Create blank tile" title="Create blank tile" disabled={charsetState.result.characterCount >= 256} onClick={createEditorTile}>＋ Tile</button>
                  <button className="secondary compact destructive-profile" type="button" aria-label="Delete tile" title="Delete tile" disabled={charsetState.result.characterCount <= 1} onClick={deleteEditorTile}>⌫ Tile</button>
                </div>
              </section>
            ) : null}
            {charsetSource === "existing" && existingCharset !== null ? (
              <div className="tilemap-charset-actions">
                <button
                  className="secondary compact"
                  type="button"
                  disabled={charsetState.kind === "running" || glyphCount === 0}
                  onClick={clearCharsetSelection}
                >
                  Clear selection
                </button>
                <button
                  className="secondary compact"
                  type="button"
                  disabled={charsetState.kind === "running" || glyphCount === 0}
                  onClick={invertCharsetSelection}
                >
                  Invert selection
                </button>
              </div>
            ) : null}
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
                      ? "Screen 1"
                    : sourcePreviewContent === "screen-2"
                      ? "Screen 2"
                    : sourcePreviewContent === "merged-low"
                      ? "Merged · low resolution"
                    : sourcePreviewContent === "merged-high"
                      ? "Merged · high resolution"
                    : sourcePreviewContent === "palette-usage"
                      ? "Palette usage"
                      : sourcePreviewContent === "tile-usage"
                        ? "Used tiles"
                        : sourcePreviewContent === "tile-editor"
                          ? "Tile editor"
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
                    <option value="pre-attribute" disabled={workspaceMode !== "palette"}>Pre-attribute dither</option>
                    <option value="screen-1" disabled={!hasMixedScreenTarget}>Screen 1</option>
                    <option value="screen-2" disabled={!hasMixedScreenTarget}>Screen 2</option>
                    <option value="merged-low" disabled={!hasMixedScreenTarget}>Merged · low resolution</option>
                    <option value="merged-high" disabled={!hasMixedScreenTarget}>Merged · high resolution</option>
                    <option value="palette-usage">Palette usage</option>
                    <option value="tile-usage" disabled={workspaceMode !== "tilemap"}>Used tiles</option>
                    <option value="tile-editor" disabled={workspaceMode !== "tilemap"}>Tile editor</option>
                    <option value="bitmap-editor" disabled={workspaceMode !== "palette"}>Bitmap editor</option>
                    <option value="difference">Difference heatmap</option>
                    <option value="inspector">Inspector</option>
                  </select>
                </label>
              </div>
              {sourcePreviewContent === "image" || sourcePreviewContent === "source-image" || sourcePreviewContent === "result-image" ? <div
                className={`preview-frame preview-viewport ${draggingSide === "source" ? "dragging" : ""}`}
                ref={sourceViewportRef}
                onScroll={(event) => handlePreviewScroll("source", event)}
                onPointerDown={(event) => beginPreviewDrag("source", event)}
                onPointerMove={movePreviewDrag}
                onPointerUp={endPreviewDrag}
                onPointerCancel={endPreviewDrag}
                onWheel={() => markPanSource("source")}
                onFocusCapture={() => markPanSource("source")}
              >
                {image === null
                  ? null
                  : (
                    <div
                      className={`preview-stage ${previewZoom === "fit" ? "fit-stage" : ""}`}
                      style={{
                        width: sourceStageWidth,
                        aspectRatio: sourceStageAspectRatio,
                      }}
                    >
                      <canvas
                        ref={sourcePreviewContent === "result-image" ? convertedCanvasRef : canvasRef}
                        className={framing === "crop"
                          ? `crop-editor-canvas crop-pointer-${cropPointerMode}`
                          : undefined}
                        aria-label={sourcePreviewContent === "result-image"
                          ? "Converted hardware preview"
                          : framing === "crop"
                          ? "Source image crop editor"
                          : "Decoded source image preview"}
                        tabIndex={sourcePreviewContent === "result-image" ? 0 : framing === "crop" ? 0 : undefined}
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
                        {visibleTileUsage.slice(0, 64).map(({ characterIndex, count }) => <button type="button" className={`preview-usage-row${tileEditorSelected === characterIndex ? " selected" : ""}`} key={characterIndex} aria-pressed={tileEditorSelected === characterIndex} onClick={() => selectUsedTile(characterIndex)}><span>Tile {characterIndex}</span><strong>{count} cells</strong></button>)}
                      </div>
                    </>
                  ) : sourcePreviewContent === "tile-editor" ? (
                    tileEditorPreview
                  ) : sourcePreviewContent === "bitmap-editor" ? (
                    bitmapEditorPreview
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
                <h3 id="result-preview-title">{resultPreviewContent === "image" || resultPreviewContent === "result-image" ? resultLabel : resultPreviewContent === "source-image" ? "Conversion input" : resultPreviewContent === "pre-attribute" ? "Pre-attribute dither" : resultPreviewContent === "screen-1" ? "Screen 1" : resultPreviewContent === "screen-2" ? "Screen 2" : resultPreviewContent === "merged-low" ? "Merged · low resolution" : resultPreviewContent === "merged-high" ? "Merged · high resolution" : resultPreviewContent === "palette-usage" ? "Palette usage" : resultPreviewContent === "tile-usage" ? "Used tiles" : resultPreviewContent === "tile-editor" ? "Tile editor" : resultPreviewContent === "bitmap-editor" ? "Bitmap editor" : resultPreviewContent === "difference" ? "Difference heatmap" : "Inspector"}</h3>
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
                    <option value="pre-attribute" disabled={workspaceMode !== "palette"}>Pre-attribute dither</option>
                    <option value="screen-1" disabled={!hasMixedScreenTarget}>Screen 1</option>
                    <option value="screen-2" disabled={!hasMixedScreenTarget}>Screen 2</option>
                    <option value="merged-low" disabled={!hasMixedScreenTarget}>Merged · low resolution</option>
                    <option value="merged-high" disabled={!hasMixedScreenTarget}>Merged · high resolution</option>
                    <option value="palette-usage">Palette usage</option>
                    <option value="tile-usage" disabled={workspaceMode !== "tilemap"}>Used tiles</option>
                    <option value="tile-editor" disabled={workspaceMode !== "tilemap"}>Tile editor</option>
                    <option value="bitmap-editor" disabled={workspaceMode !== "palette"}>Bitmap editor</option>
                    <option value="difference">Difference heatmap</option>
                    <option value="inspector">Inspector</option>
                  </select>
                </label>
              </div>
              {resultPreviewContent === "image" || resultPreviewContent === "result-image" || resultPreviewContent === "source-image" ? <div
                className={`preview-frame preview-viewport zx-preview ${draggingSide === "result" ? "dragging" : ""}`}
                ref={resultViewportRef}
                onScroll={(event) => handlePreviewScroll("result", event)}
                onPointerDown={(event) => beginPreviewDrag("result", event)}
                onPointerMove={movePreviewDrag}
                onPointerUp={endPreviewDrag}
                onPointerCancel={endPreviewDrag}
                onWheel={() => markPanSource("result")}
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
                        previewZoom === "fit" ? "fit-stage" : "",
                        showPixelGrid && previewZoom !== "fit" && previewZoom >= 4 ? "show-pixel-grid" : "",
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
                      <div className="preview-usage-list">{visibleTileUsage.slice(0, 64).map(({ characterIndex, count }) => <button type="button" className={`preview-usage-row${tileEditorSelected === characterIndex ? " selected" : ""}`} key={characterIndex} aria-pressed={tileEditorSelected === characterIndex} onClick={() => selectUsedTile(characterIndex)}><span>Tile {characterIndex}</span><strong>{count} cells</strong></button>)}</div>
                    </>
                  ) : resultPreviewContent === "tile-editor" ? (
                    tileEditorPreview
                  ) : resultPreviewContent === "bitmap-editor" ? (
                    bitmapEditorPreview
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
                    ? "Screen 2 selected"
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
