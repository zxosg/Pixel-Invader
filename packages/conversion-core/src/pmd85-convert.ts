import {
  PMD85_COLORACE_CANONICAL_PAIRS,
  PMD85_GAP_BYTES,
  PMD85_SCREEN_HEIGHT,
  PMD85_SCREEN_WIDTH,
  PMD85_VISIBLE_BYTES,
  PMD85_VISIBLE_BYTES_PER_LINE,
  decodePmd85Screen,
  encodePmd85Screen,
  pmd85AttributeCellHeight,
  pmd85ForegroundCount,
  renderPmd85Rgba,
  type Pmd85ModeId,
  type Pmd85RgbColor,
} from "@retro-converter/pmd-85";
import { adjustRgba } from "./adjustments.js";
import { assertCompatibleEngines, ditherMethodForEngine } from "./engines.js";
import { adaptiveDitherPrefilter, filterRgba } from "./filters.js";
import { decorrelatedDiffusionKernel } from "./diffusion.js";
import { artisticCoverage, renderArtisticPairField } from "./artistic-ordered.js";
import { checkerCarrierStrengthV44 } from "./grayscale-checker-v44.js";
import { frameRgbaToDimensions } from "./geometry.js";
import { ORDERED_MATRICES, orderedThreshold } from "./matrices.js";
import type {
  ConversionSettings,
  OptimizationLevel,
  Pmd85ConversionResult,
} from "./types.js";
import {
  optimizeVerticalSpatialPmd,
  optimizeVerticalSpatialPmdDetail,
  validateVerticalSpatialMixSettings,
  withAnalyticPreview,
} from "./vertical-spatial-mix.js";

function pmd85HardwareModeForTarget(mode: string): Pmd85ModeId {
  if (mode === "pmd85-2-rgb-vertical-spatial") return "pmd85-2-rgb";
  if (mode === "pmd85-3-rgb-vertical-spatial") return "pmd85-3-rgb";
  if (mode === "pmd85-3-pal-vertical-spatial") return "pmd85-3-pal";
  validateMode(mode);
  return mode;
}

const LINEAR_SCALE = 65_535;
const GUIDE_BLACK = 0xff;
const PALETTE_SCORE_SCALE = 4_096;

interface LinearColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function srgbToLinearFixed(value: number): number {
  const encoded = value / 255;
  const linear = encoded <= 0.04045
    ? encoded / 12.92
    : ((encoded + 0.055) / 1.055) ** 2.4;
  return Math.round(linear * LINEAR_SCALE);
}

function linearFixedToSrgb(value: number): number {
  const linear = Math.max(0, Math.min(LINEAR_SCALE, value)) / LINEAR_SCALE;
  const encoded = linear <= 0.0031308
    ? linear * 12.92
    : 1.055 * linear ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(encoded * 255)));
}

function colorDistance(r: number, g: number, b: number, color: Pmd85RgbColor): number {
  const dr = r - color.r;
  const dg = g - color.g;
  const db = b - color.b;
  return dr * dr + dg * dg + db * db;
}

function signedRoundDiv(numerator: number, denominator: number): number {
  return numerator < 0
    ? -Math.floor((-numerator + Math.floor(denominator / 2)) / denominator)
    : Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

/** Squared RGB distance to the representable black-to-INK mixture line. */
function projectedLineDistanceScore(
  r: number,
  g: number,
  b: number,
  ink: Pmd85RgbColor,
): number {
  const denominator = ink.r * ink.r + ink.g * ink.g + ink.b * ink.b;
  if (denominator === 0) return r * r + g * g + b * b;
  const projection = r * ink.r + g * ink.g + b * ink.b;
  if (projection <= 0) return (r * r + g * g + b * b) * PALETTE_SCORE_SCALE;
  if (projection >= denominator) {
    return colorDistance(r, g, b, ink) * PALETTE_SCORE_SCALE;
  }
  const blackDistance = r * r + g * g + b * b;
  const perpendicularNumerator = blackDistance * denominator - projection * projection;
  return Math.floor(
    (perpendicularNumerator * PALETTE_SCORE_SCALE + Math.floor(denominator / 2)) /
      denominator,
  );
}

function selectProjected(
  r: number,
  g: number,
  b: number,
  ink: Pmd85RgbColor,
  threshold: number,
  levels: number,
  amount: number,
): boolean {
  const denominator = ink.r * ink.r + ink.g * ink.g + ink.b * ink.b;
  if (denominator === 0) return false;
  const projection = r * ink.r + g * ink.g + b * ink.b;
  const left = 2 * 100 * levels * projection;
  const right = denominator * (100 * levels + amount * (2 * threshold + 1 - levels));
  return left >= right;
}

function projectErrorOntoInk(
  errorR: number,
  errorG: number,
  errorB: number,
  ink: LinearColor,
): readonly [number, number, number] {
  const denominator = ink.r * ink.r + ink.g * ink.g + ink.b * ink.b;
  if (denominator === 0) return [0, 0, 0];
  const projection = errorR * ink.r + errorG * ink.g + errorB * ink.b;
  return [
    signedRoundDiv(projection * ink.r, denominator),
    signedRoundDiv(projection * ink.g, denominator),
    signedRoundDiv(projection * ink.b, denominator),
  ];
}

function validateMode(mode: string): asserts mode is Pmd85ModeId {
  if (![
    "pmd85-2-tv",
    "pmd85-2-rgb",
    "pmd85-3-tv",
    "pmd85-3-pal",
    "pmd85-3-rgb",
    "pmd85-colorace",
  ].includes(mode)) throw new RangeError("PMD 85 hardware interpretation is invalid.");
}

function validatePalette(
  mode: Pmd85ModeId,
  palette: readonly Pmd85RgbColor[],
  enabled: readonly number[],
): void {
  const count = pmd85ForegroundCount(mode);
  if (palette.length !== count) {
    throw new RangeError(`PMD 85 ${mode} requires exactly ${count} calibrated foreground colors.`);
  }
  if (
    enabled.length === 0 ||
    new Set(enabled).size !== enabled.length ||
    enabled.some((id) => !Number.isInteger(id) || id < 0 || id >= count)
  ) throw new RangeError("Enabled PMD 85 foreground colors are invalid.");
}

function sourceLinearBuffer(source: Uint8Array): Int32Array {
  const output = new Int32Array(PMD85_SCREEN_WIDTH * PMD85_SCREEN_HEIGHT * 3);
  for (let pixel = 0; pixel < PMD85_SCREEN_WIDTH * PMD85_SCREEN_HEIGHT; pixel += 1) {
    const rgba = pixel * 4;
    const linear = pixel * 3;
    output[linear] = srgbToLinearFixed(source[rgba] ?? 0);
    output[linear + 1] = srgbToLinearFixed(source[rgba + 1] ?? 0);
    output[linear + 2] = srgbToLinearFixed(source[rgba + 2] ?? 0);
  }
  return output;
}

/** Runs the existing deterministic geometry sampler over gamma-decoded channels. */
function framePmd85LinearLight(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  settings: ConversionSettings,
): Uint8Array {
  const outputPixelAspect = { width: 1, height: 1 };
  if (settings.resampling === "nearest") {
    return frameRgbaToDimensions(
      source,
      sourceWidth,
      sourceHeight,
      PMD85_SCREEN_WIDTH,
      PMD85_SCREEN_HEIGHT,
      settings,
      outputPixelAspect,
    );
  }
  const linearSource = new Uint8Array(source.length);
  for (let offset = 0; offset < source.length; offset += 4) {
    linearSource[offset] = Math.round(srgbToLinearFixed(source[offset] ?? 0) * 255 / LINEAR_SCALE);
    linearSource[offset + 1] = Math.round(srgbToLinearFixed(source[offset + 1] ?? 0) * 255 / LINEAR_SCALE);
    linearSource[offset + 2] = Math.round(srgbToLinearFixed(source[offset + 2] ?? 0) * 255 / LINEAR_SCALE);
    linearSource[offset + 3] = source[offset + 3] ?? 255;
  }
  const framedLinear = frameRgbaToDimensions(
    linearSource,
    sourceWidth,
    sourceHeight,
    PMD85_SCREEN_WIDTH,
    PMD85_SCREEN_HEIGHT,
    {
      ...settings,
      background: {
        r: Math.round(srgbToLinearFixed(settings.background.r) * 255 / LINEAR_SCALE),
        g: Math.round(srgbToLinearFixed(settings.background.g) * 255 / LINEAR_SCALE),
        b: Math.round(srgbToLinearFixed(settings.background.b) * 255 / LINEAR_SCALE),
      },
    },
    outputPixelAspect,
  );
  for (let offset = 0; offset < framedLinear.length; offset += 4) {
    framedLinear[offset] = linearFixedToSrgb((framedLinear[offset] ?? 0) * LINEAR_SCALE / 255);
    framedLinear[offset + 1] = linearFixedToSrgb((framedLinear[offset + 1] ?? 0) * LINEAR_SCALE / 255);
    framedLinear[offset + 2] = linearFixedToSrgb((framedLinear[offset + 2] ?? 0) * LINEAR_SCALE / 255);
  }
  return framedLinear;
}

function paletteLinear(palette: readonly Pmd85RgbColor[]): readonly LinearColor[] {
  return palette.map((color) => ({
    r: srgbToLinearFixed(color.r),
    g: srgbToLinearFixed(color.g),
    b: srgbToLinearFixed(color.b),
  }));
}

function workChannel(
  base: Int32Array,
  errors: Int32Array | null,
  pixel: number,
  channel: number,
  orderedOffset: number,
): number {
  const index = pixel * 3 + channel;
  return Math.max(0, Math.min(
    LINEAR_SCALE,
    (base[index] ?? 0) + (errors?.[index] ?? 0) + orderedOffset,
  ));
}

function addDiffusionError(
  errors: Int32Array,
  x: number,
  y: number,
  channelErrors: readonly number[],
  weight: number,
): void {
  if (x < 0 || x >= PMD85_SCREEN_WIDTH || y < 0 || y >= PMD85_SCREEN_HEIGHT) return;
  const offset = (y * PMD85_SCREEN_WIDTH + x) * 3;
  for (let channel = 0; channel < 3; channel += 1) {
    errors[offset + channel] = (errors[offset + channel] ?? 0) +
      Math.round((channelErrors[channel] ?? 0) * weight / 42);
  }
}

function nearestGuideColor(
  r: number,
  g: number,
  b: number,
  palette: readonly Pmd85RgbColor[],
  enabled: readonly number[],
): number {
  let best = GUIDE_BLACK;
  let bestCost = r * r + g * g + b * b;
  for (const ink of enabled) {
    const cost = colorDistance(r, g, b, palette[ink]!);
    if (cost < bestCost) {
      best = ink;
      bestCost = cost;
    }
  }
  return best;
}

/**
 * Produces the unrestricted palette guide used to decide which foregrounds
 * have real dither support before PMD's fixed-PAPER cell constraint is
 * applied. This mirrors the ZX two-pass architecture while retaining PMD's
 * squared-RGB decisions and linear-light error buffer.
 */
function buildDitherGuide(
  baseLinear: Int32Array,
  palette: readonly Pmd85RgbColor[],
  paletteInLinear: readonly LinearColor[],
  enabled: readonly number[],
  settings: ConversionSettings,
): Uint8Array {
  const guide = new Uint8Array(PMD85_SCREEN_WIDTH * PMD85_SCREEN_HEIGHT);
  guide.fill(GUIDE_BLACK);
  const usesDiffusion =
    (settings.ditherEngineId === "error-diffusion-decorrelated-v3" ||
      settings.ditherEngineId === "error-diffusion-checker-phase-v4-4") &&
    settings.ditheringAmount > 0;
  const usesOrdered = (
    settings.ditherEngineId === "ordered-strict-matrix-v6" ||
    settings.ditherEngineId === "ordered-void-cluster-v1"
  ) && settings.ditheringAmount > 0;
  const errors = usesDiffusion ? new Int32Array(baseLinear.length) : null;
  const matrix = settings.ditherEngineId === "ordered-void-cluster-v1"
    ? ORDERED_MATRICES["void-cluster-8x8"]
    : ORDERED_MATRICES[settings.orderedMatrix];

  for (let y = 0; y < PMD85_SCREEN_HEIGHT; y += 1) {
    const reverse = usesDiffusion && (y & 1) === 1;
    for (let step = 0; step < PMD85_SCREEN_WIDTH; step += 1) {
      const x = reverse ? PMD85_SCREEN_WIDTH - 1 - step : step;
      const pixel = y * PMD85_SCREEN_WIDTH + x;
      const perturb = usesOrdered
        ? Math.round(
            (
              (orderedThreshold(matrix, x, y) + 0.5) / matrix.levels - 0.5
            ) * LINEAR_SCALE * 0.4 * settings.ditheringAmount / 100,
          )
        : 0;
      const r = linearFixedToSrgb(workChannel(baseLinear, errors, pixel, 0, perturb));
      const g = linearFixedToSrgb(workChannel(baseLinear, errors, pixel, 1, perturb));
      const b = linearFixedToSrgb(workChannel(baseLinear, errors, pixel, 2, perturb));
      const selected = nearestGuideColor(r, g, b, palette, enabled);
      guide[pixel] = selected;

      if (errors !== null) {
        const output = selected === GUIDE_BLACK
          ? { r: 0, g: 0, b: 0 }
          : paletteInLinear[selected]!;
        const scale = settings.ditheringAmount / 100;
        const channelErrors = [
          Math.round((workChannel(baseLinear, errors, pixel, 0, 0) - output.r) * scale),
          Math.round((workChannel(baseLinear, errors, pixel, 1, 0) - output.g) * scale),
          Math.round((workChannel(baseLinear, errors, pixel, 2, 0) - output.b) * scale),
        ];
        const direction = reverse ? -1 : 1;
        for (const [dx, dy, weight] of decorrelatedDiffusionKernel(direction)) {
          addDiffusionError(errors, x + dx, y + dy, channelErrors, weight);
        }
      }
    }
  }
  return guide;
}

function resolveNeutralCellInks(
  cellInks: Uint8Array,
  supported: Uint8Array,
  columns: number,
  rows: number,
  fallbackInk: number,
): void {
  const queue = new Int32Array(cellInks.length);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < supported.length; index += 1) {
    if (supported[index] !== 0) queue[tail++] = index;
  }
  if (tail === 0) {
    cellInks.fill(fallbackInk);
    return;
  }

  // Raster-ordered multi-source propagation makes equal-distance resolution
  // deterministic without assigning semantic priority to a palette number.
  while (head < tail) {
    const index = queue[head++]!;
    const x = index % columns;
    const y = Math.floor(index / columns);
    const neighbors = [
      x > 0 ? index - 1 : -1,
      x + 1 < columns ? index + 1 : -1,
      y > 0 ? index - columns : -1,
      y + 1 < rows ? index + columns : -1,
    ];
    for (const neighbor of neighbors) {
      if (neighbor < 0 || supported[neighbor] !== 0) continue;
      supported[neighbor] = 2;
      cellInks[neighbor] = cellInks[index]!;
      queue[tail++] = neighbor;
    }
  }
}

function rgbaError(source: Uint8Array, output: Uint8Array): number {
  let score = 0;
  for (let offset = 0; offset < source.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const difference = (source[offset + channel] ?? 0) - (output[offset + channel] ?? 0);
      score += difference * difference;
    }
  }
  return score;
}

export function convertToPmd85(
  sourceRgba: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  settings: ConversionSettings,
  foregroundPalette: readonly Pmd85RgbColor[],
  importedGapBytes?: Uint8Array,
  _level: OptimizationLevel = "high",
): Pmd85ConversionResult {
  if (settings.platformId !== "pmd-85") throw new RangeError("PMD 85 conversion requires the pmd-85 platform.");
  const hardwareMode = pmd85HardwareModeForTarget(settings.modeId);
  const spatial = settings.modeId.includes("vertical-spatial");
  if (!spatial && (
    settings.ditherEngineId.startsWith("vertical-spatial-") ||
    settings.verticalSpatialMix !== undefined
  )) throw new RangeError("PMD 85 spatial engines require a vertical spatial target.");
  if (
    (!spatial && settings.attributeOptimizerId !== "pmd85-cell-v1") ||
    (spatial && ![
      "pmd85-vertical-spatial-uniform-v1",
      "pmd85-vertical-spatial-detail-v2",
    ].includes(settings.attributeOptimizerId))
  ) {
    throw new RangeError("PMD 85 conversion uses an incompatible optimizer.");
  }
  if (settings.pmd85.mode !== hardwareMode) {
    throw new RangeError("PMD 85 settings and target hardware interpretation do not match.");
  }
  assertCompatibleEngines("pmd-85", settings.attributeOptimizerId, settings.ditherEngineId);
  if (ditherMethodForEngine(settings.ditherEngineId) !== settings.dithering) {
    throw new RangeError("Dither engine and dithering method do not match.");
  }
  if (!Number.isInteger(settings.ditheringAmount) || settings.ditheringAmount < 0 || settings.ditheringAmount > 100) {
    throw new RangeError("PMD 85 dithering amount must be an integer from 0 through 100.");
  }
  if (settings.paletteSelections.length !== 1 || settings.paletteSelections[0]?.brightMode !== undefined) {
    throw new RangeError("PMD 85 requires one foreground selection without ZX BRIGHT settings.");
  }
  const enabled = settings.paletteSelections[0]?.enabledColorIds ?? [];
  validatePalette(hardwareMode, foregroundPalette, enabled);
  if (settings.pmd85.gapPolicy === "preserve-imported" && importedGapBytes?.length !== PMD85_GAP_BYTES) {
    throw new RangeError("Preserve-imported gap policy requires the original 4 KiB PMD 85 gap plane.");
  }

  const framed = framePmd85LinearLight(
    sourceRgba,
    sourceWidth,
    sourceHeight,
    settings,
  );
  const orderedSource = !spatial && settings.dithering === "ordered" && settings.ditheringAmount > 0
    ? adaptiveDitherPrefilter(framed, PMD85_SCREEN_WIDTH, PMD85_SCREEN_HEIGHT, 8)
    : framed;
  const normalized = adjustRgba(
    filterRgba(orderedSource, PMD85_SCREEN_WIDTH, PMD85_SCREEN_HEIGHT, settings),
    settings,
  );
  if (spatial) {
    validateVerticalSpatialMixSettings(settings.verticalSpatialMix);
    const spatialDitherEngine = settings.dithering === "none"
      ? "vertical-spatial-none-v1"
      : settings.dithering === "ordered"
        ? "vertical-spatial-ordered-v1"
        : "vertical-spatial-error-diffusion-v1";
    const detailV2 = settings.attributeOptimizerId === "pmd85-vertical-spatial-detail-v2";
    if (
      settings.verticalSpatialMix.algorithmId !== (detailV2
        ? "vertical-spatial-pmd-detail-v2"
        : "vertical-spatial-uniform-v1") ||
      settings.ditherEngineId !== spatialDitherEngine
    ) {
      throw new RangeError("PMD 85 vertical spatial mode requires a matching Version 1 spatial dither engine.");
    }
    const optimized = (detailV2
      ? optimizeVerticalSpatialPmdDetail
      : optimizeVerticalSpatialPmd)(
      normalized,
      PMD85_SCREEN_WIDTH,
      PMD85_SCREEN_HEIGHT,
      foregroundPalette,
      enabled,
      {
        method: settings.dithering,
        amount: settings.ditheringAmount,
        orderedMatrix: settings.orderedMatrix,
        errorRandomization: settings.errorDiffusionRandomization,
        swapRows: settings.verticalSpatialMix?.swapRows ?? detailV2,
      },
    );
    const encoded = encodePmd85Screen(
      optimized.pixelMasks,
      optimized.attributes,
      settings.pmd85.gapPolicy,
      importedGapBytes,
    );
    const decoded = decodePmd85Screen(encoded, hardwareMode);
    const preview = renderPmd85Rgba(decoded, foregroundPalette);
    const spatialDiagnostics = withAnalyticPreview(
      optimized.diagnostics,
      preview,
      PMD85_SCREEN_WIDTH,
      PMD85_SCREEN_HEIGHT,
    );
    const pixelAspectRatio = 1;
    return {
      platformId: "pmd-85",
      modeId: settings.modeId as Pmd85ConversionResult["modeId"],
      width: PMD85_SCREEN_WIDTH,
      height: PMD85_SCREEN_HEIGHT,
      pixelAspectRatio,
      attributeOptimizerId: settings.attributeOptimizerId,
      ditherEngineId: settings.ditherEngineId,
      paletteSelections: settings.paletteSelections,
      frames: [{
        hardwareModeId: hardwareMode,
        nativeWidth: PMD85_SCREEN_WIDTH,
        nativeHeight: PMD85_SCREEN_HEIGHT,
        nativePixelAspectRatio: pixelAspectRatio,
        encoded,
        paletteIndices: decoded.paletteIndices,
        previewRgba: preview,
      }],
      pixelMasks: optimized.pixelMasks,
      attributes: optimized.attributes,
      gapPolicy: settings.pmd85.gapPolicy,
      paletteCalibrationId: settings.pmd85.paletteCalibrationId,
      preConstraintPreviewRgba: normalized,
      mergedPreviewRgba: preview,
      sourcePreviewRgba: normalized,
      previewRgba: preview,
      score: spatialDiagnostics.totalCost,
      verticalSpatialDiagnostics: spatialDiagnostics,
    };
  }
  const baseLinear = sourceLinearBuffer(normalized);
  const foregroundLinear = paletteLinear(foregroundPalette);
  const black: Pmd85RgbColor = { r: 0, g: 0, b: 0 };
  const blackLinear: LinearColor = { r: 0, g: 0, b: 0 };
  const guide = buildDitherGuide(
    baseLinear,
    foregroundPalette,
    foregroundLinear,
    enabled,
    settings,
  );
  const pixelMasks = new Uint8Array(PMD85_VISIBLE_BYTES);
  const attributes = new Uint8Array(PMD85_VISIBLE_BYTES);
  const cellHeight = pmd85AttributeCellHeight(hardwareMode);
  const cellRows = PMD85_SCREEN_HEIGHT / cellHeight;
  const cellInks = new Uint8Array(PMD85_VISIBLE_BYTES_PER_LINE * cellRows);
  const supportedCells = new Uint8Array(cellInks.length);
  const usesDiffusion = (
    settings.ditherEngineId === "error-diffusion-decorrelated-v3" ||
    settings.ditherEngineId === "error-diffusion-checker-phase-v4-4"
  ) && settings.ditheringAmount > 0;
  const errors = usesDiffusion ? new Int32Array(baseLinear.length) : null;
  const orderedMatrix = settings.ditherEngineId === "ordered-void-cluster-v1"
    ? ORDERED_MATRICES["void-cluster-8x8"]
    : ORDERED_MATRICES[settings.orderedMatrix];
  const usesOrdered = (
    settings.ditherEngineId === "ordered-strict-matrix-v6" ||
    settings.ditherEngineId === "ordered-void-cluster-v1"
  ) && settings.ditheringAmount > 0;

  // PMD attributes are ZX-style fixed pairs: PAPER is always black and each
  // 6x1 (native) or 6x2 (ColorAce) cell chooses exactly one enabled INK. The
  // unrestricted dither guide establishes positive palette support first;
  // candidate scoring then measures squared-RGB distance to each legal
  // black-to-INK mixture line.
  for (let cellY = 0; cellY < PMD85_SCREEN_HEIGHT; cellY += cellHeight) {
    for (let byteX = 0; byteX < PMD85_VISIBLE_BYTES_PER_LINE; byteX += 1) {
      const cellIndex = (cellY / cellHeight) * PMD85_VISIBLE_BYTES_PER_LINE + byteX;
      let bestInk = enabled[0] ?? 0;
      let bestCost = Number.POSITIVE_INFINITY;
      let bestGuideSupport = -1;
      let bestSourceSupport = -1;

      for (const ink of enabled) {
        const color = foregroundPalette[ink]!;
        let cost = 0;
        let guideSupport = 0;
        let sourceSupport = 0;
        for (let row = 0; row < cellHeight; row += 1) {
          const y = cellY + row;
          for (let pixelInByte = 0; pixelInByte < 6; pixelInByte += 1) {
            const x = byteX * 6 + pixelInByte;
            const offset = (y * PMD85_SCREEN_WIDTH + x) * 4;
            const r = normalized[offset] ?? 0;
            const g = normalized[offset + 1] ?? 0;
            const b = normalized[offset + 2] ?? 0;
            cost += projectedLineDistanceScore(r, g, b, color);
            if (guide[y * PMD85_SCREEN_WIDTH + x] === ink) guideSupport += 1;
            const projection = r * color.r + g * color.g + b * color.b;
            if (projection > 0) sourceSupport += projection;
          }
        }

        // Both the adjusted source and the selected dither path must support
        // an INK. This rejects palette colors introduced only by propagated
        // chromatic guide error in otherwise black cells.
        if (guideSupport === 0 || sourceSupport === 0) continue;
        if (
          cost < bestCost ||
          (cost === bestCost && guideSupport > bestGuideSupport) ||
          (
            cost === bestCost && guideSupport === bestGuideSupport &&
            sourceSupport > bestSourceSupport
          )
        ) {
          bestCost = cost;
          bestInk = ink;
          bestGuideSupport = guideSupport;
          bestSourceSupport = sourceSupport;
        }
      }

      cellInks[cellIndex] = bestInk;
      if (bestCost !== Number.POSITIVE_INFINITY) supportedCells[cellIndex] = 1;
    }
  }

  resolveNeutralCellInks(
    cellInks,
    supportedCells,
    PMD85_VISIBLE_BYTES_PER_LINE,
    cellRows,
    enabled[0] ?? 0,
  );

  for (let cellY = 0; cellY < PMD85_SCREEN_HEIGHT; cellY += cellHeight) {
    for (let byteX = 0; byteX < PMD85_VISIBLE_BYTES_PER_LINE; byteX += 1) {
      const cellIndex = (cellY / cellHeight) * PMD85_VISIBLE_BYTES_PER_LINE + byteX;
      const bestInk = cellInks[cellIndex] ?? 0;
      if (hardwareMode === "pmd85-colorace") {
        const pair = PMD85_COLORACE_CANONICAL_PAIRS[bestInk]!;
        for (let row = 0; row < 2; row += 1) {
          const index = (cellY + row) * PMD85_VISIBLE_BYTES_PER_LINE + byteX;
          attributes[index] = pair[row] ?? 0;
        }
      } else {
        const index = cellY * PMD85_VISIBLE_BYTES_PER_LINE + byteX;
        // PMD 85-2 TV/CV has two legal static levels (00 Bright / 01 Dim);
        // PMD 85-3 TV/CV uses all four attributes as native gray levels.
        attributes[index] = bestInk;
      }
    }
  }

  // Quantize in display-pixel order, exactly as a forced-PAPER ZX cell model.
  // Neutral cells retain a neighboring attribute for stable encoding but
  // deliberately emit no pixels.
  for (let y = 0; y < PMD85_SCREEN_HEIGHT; y += 1) {
    const reverse = usesDiffusion && (y & 1) === 1;
    for (let step = 0; step < PMD85_SCREEN_WIDTH; step += 1) {
      const x = reverse ? PMD85_SCREEN_WIDTH - 1 - step : step;
      const pixel = y * PMD85_SCREEN_WIDTH + x;
      const byteX = Math.floor(x / 6);
      const pixelInByte = x % 6;
      const visibleIndex = y * PMD85_VISIBLE_BYTES_PER_LINE + byteX;
      const cellIndex = Math.floor(y / cellHeight) * PMD85_VISIBLE_BYTES_PER_LINE + byteX;
      const ink = cellInks[cellIndex] ?? 0;
      const inkColor = foregroundPalette[ink]!;
      const inkInLinear = foregroundLinear[ink]!;
      const errorOffset = pixel * 3;
      const incomingError = errors === null
        ? [0, 0, 0] as const
        : projectErrorOntoInk(
            errors[errorOffset] ?? 0,
            errors[errorOffset + 1] ?? 0,
            errors[errorOffset + 2] ?? 0,
            inkInLinear,
          );
      const r = linearFixedToSrgb(Math.max(0, Math.min(
        LINEAR_SCALE,
        (baseLinear[errorOffset] ?? 0) + incomingError[0],
      )));
      const g = linearFixedToSrgb(Math.max(0, Math.min(
        LINEAR_SCALE,
        (baseLinear[errorOffset + 1] ?? 0) + incomingError[1],
      )));
      const b = linearFixedToSrgb(Math.max(0, Math.min(
        LINEAR_SCALE,
        (baseLinear[errorOffset + 2] ?? 0) + incomingError[2],
      )));
      const useInk = supportedCells[cellIndex] === 1 && (
        usesOrdered
          ? selectProjected(
              r,
              g,
              b,
              inkColor,
              orderedThreshold(orderedMatrix, x, y),
              orderedMatrix.levels,
              settings.ditheringAmount,
            )
          : colorDistance(r, g, b, inkColor) < colorDistance(r, g, b, black)
      );
      if (useInk) pixelMasks[visibleIndex] = (pixelMasks[visibleIndex] ?? 0) | (1 << pixelInByte);

      if (errors !== null) {
        const output = useInk ? inkInLinear : blackLinear;
        const scale = settings.ditheringAmount / 100;
        const channelErrors = projectErrorOntoInk(
          Math.round(((baseLinear[errorOffset] ?? 0) + incomingError[0] - output.r) * scale),
          Math.round(((baseLinear[errorOffset + 1] ?? 0) + incomingError[1] - output.g) * scale),
          Math.round(((baseLinear[errorOffset + 2] ?? 0) + incomingError[2] - output.b) * scale),
          inkInLinear,
        );
        const direction = reverse ? -1 : 1;
        for (const [dx, dy, weight] of decorrelatedDiffusionKernel(direction)) {
          addDiffusionError(errors, x + dx, y + dy, channelErrors, weight);
        }
      }
    }
  }

  const checkerCarrier = settings.ditherEngineId === "error-diffusion-checker-phase-v4-4" &&
    settings.ditheringAmount > 0 && settings.errorDiffusionLineSuppression > 0;
  if (
    (settings.ditherEngineId === "artistic-ordered-hybrid-v1" || checkerCarrier) &&
    settings.ditheringAmount > 0
  ) {
    const carrierAmount = checkerCarrier
      ? settings.ditheringAmount * checkerCarrierStrengthV44(
          100,
          settings.errorDiffusionLineSuppression,
        )
      : settings.ditheringAmount;
    const reference = new Uint8Array(PMD85_SCREEN_WIDTH * PMD85_SCREEN_HEIGHT);
    for (let y = 0; y < PMD85_SCREEN_HEIGHT; y += 1) for (let x = 0; x < PMD85_SCREEN_WIDTH; x += 1) {
      const byte = pixelMasks[y * PMD85_VISIBLE_BYTES_PER_LINE + Math.floor(x / 6)] ?? 0;
      reference[y * PMD85_SCREEN_WIDTH + x] = (byte >> (x % 6)) & 1;
    }
    const artisticPixels = renderArtisticPairField(
      normalized, PMD85_SCREEN_WIDTH, PMD85_SCREEN_HEIGHT,
      carrierAmount, checkerCarrier ? "checkerboard" : settings.artisticPattern ?? "checkerboard",
      (x, y) => {
        const cell = Math.floor(y / cellHeight) * PMD85_VISIBLE_BYTES_PER_LINE + Math.floor(x / 6);
        const ink = foregroundPalette[cellInks[cell] ?? 0]!;
        const offset = (y * PMD85_SCREEN_WIDTH + x) * 4;
        const projected = artisticCoverage(normalized[offset]!, normalized[offset + 1]!, normalized[offset + 2]!, black, ink);
        const scale = carrierAmount / 100;
        return { first: black, second: ink, firstValue: 0, secondValue: 1,
          coverage: Math.max(0, Math.min(1, 0.5 + (projected - 0.5) / scale)) };
      }, false, reference, settings.orderedMatrix === "bayer-2x2" ? 2 : 4,
    );
    pixelMasks.fill(0);
    for (let y = 0; y < PMD85_SCREEN_HEIGHT; y += 1) for (let x = 0; x < PMD85_SCREEN_WIDTH; x += 1) {
      if (artisticPixels[y * PMD85_SCREEN_WIDTH + x] !== 0) {
        const index = y * PMD85_VISIBLE_BYTES_PER_LINE + Math.floor(x / 6);
        pixelMasks[index] = (pixelMasks[index] ?? 0) | (1 << (x % 6));
      }
    }
  }

  const encoded = encodePmd85Screen(
    pixelMasks,
    attributes,
    settings.pmd85.gapPolicy,
    importedGapBytes,
  );
  const decoded = decodePmd85Screen(encoded, hardwareMode);
  const preview = renderPmd85Rgba(decoded, foregroundPalette);
  const pixelAspectRatio = 1;
  return {
    platformId: "pmd-85",
    modeId: settings.modeId as Pmd85ConversionResult["modeId"],
    width: PMD85_SCREEN_WIDTH,
    height: PMD85_SCREEN_HEIGHT,
    pixelAspectRatio,
    attributeOptimizerId: settings.attributeOptimizerId,
    ditherEngineId: settings.ditherEngineId,
    paletteSelections: settings.paletteSelections,
    frames: [{
      hardwareModeId: hardwareMode,
      nativeWidth: PMD85_SCREEN_WIDTH,
      nativeHeight: PMD85_SCREEN_HEIGHT,
      nativePixelAspectRatio: pixelAspectRatio,
      encoded,
      paletteIndices: decoded.paletteIndices,
      previewRgba: preview,
    }],
    pixelMasks,
    attributes,
    gapPolicy: settings.pmd85.gapPolicy,
    paletteCalibrationId: settings.pmd85.paletteCalibrationId,
    preConstraintPreviewRgba: normalized,
    mergedPreviewRgba: preview,
    sourcePreviewRgba: normalized,
    previewRgba: preview,
    score: rgbaError(normalized, preview),
  };
}
