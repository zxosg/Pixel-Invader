import {
  QL_SCREEN_HEIGHT,
  encodeQlScreen,
  qlModePalette,
  qlModeWidth,
  renderQlRgba,
  type QlMode,
  type QlRgbColor,
} from "@retro-converter/sinclair-ql";
import { adjustRgba } from "./adjustments.js";
import { assertCompatibleEngines, ditherMethodForEngine } from "./engines.js";
import { filterRgba } from "./filters.js";
import { frameRgbaToDimensions } from "./geometry.js";
import {
  normalizedOrderedOffset,
  ORDERED_MATRICES,
  orderedThreshold,
} from "./matrices.js";
import {
  outputScreenCount,
  paletteSelection,
  paletteSelectionsMatch,
} from "./palette-selections.js";
import {
  atkinsonDiffusionKernel,
  decorrelatedDiffusionKernel,
  diffusionNoiseOffset,
  phaseBalancedDiffusionKernel,
} from "./diffusion.js";
import type {
  ConversionSettings,
  OptimizationLevel,
  QlConversionResult,
  QlMixedOptimizerId,
  QlTargetModeId,
} from "./types.js";
import {
  optimizeVerticalSpatialPixels,
  validateVerticalSpatialMixSettings,
  withAnalyticPreview,
} from "./vertical-spatial-mix.js";

export interface TemporalVirtualColor {
  readonly first: number;
  readonly second: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface MixedResolutionVirtualColor extends TemporalVirtualColor {
  readonly low: number;
  readonly highLeft: number;
  readonly highRight: number;
}

interface OrderedPaletteCandidate {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly first: number;
  readonly second: number;
  readonly pattern: number;
  readonly order: number;
}

interface OrderedPaletteNode {
  readonly candidate: OrderedPaletteCandidate;
  readonly axis: 0 | 1 | 2;
  readonly lower: OrderedPaletteNode | null;
  readonly upper: OrderedPaletteNode | null;
}

const LOCAL_TONE_VARIANCE_WEIGHT = 0.2;
const ORDERED_SUBLEVEL_MATRIX = ORDERED_MATRICES["bayer-8x8"];

function sourcePixelIsSmooth(
  source: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  const offset = (y * width + x) * 4;
  for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
    const neighbor = (ny * width + nx) * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      if (Math.abs(
        (source[offset + channel] ?? 0) - (source[neighbor + channel] ?? 0)
      ) > 48) return false;
    }
  }
  return true;
}

function distance(r: number, g: number, b: number, color: TemporalVirtualColor): number {
  const dr = r - color.r;
  const dg = g - color.g;
  const db = b - color.b;
  return dr * dr + dg * dg + db * db;
}

export function buildTemporalVirtualPalette(
  palette: readonly QlRgbColor[],
  enabled: readonly number[],
): readonly TemporalVirtualColor[] {
  const colors: TemporalVirtualColor[] = [];
  for (let firstIndex = 0; firstIndex < enabled.length; firstIndex += 1) {
    for (let secondIndex = firstIndex; secondIndex < enabled.length; secondIndex += 1) {
      const first = enabled[firstIndex] ?? 0;
      const second = enabled[secondIndex] ?? first;
      const a = palette[first]!;
      const b = palette[second]!;
      colors.push({
        first,
        second,
        r: (a.r + b.r) >> 1,
        g: (a.g + b.g) >> 1,
        b: (a.b + b.b) >> 1,
      });
    }
  }
  return colors;
}

export function buildTemporalCrossPalette(
  palette: readonly QlRgbColor[],
  firstEnabled: readonly number[],
  secondEnabled: readonly number[],
): readonly TemporalVirtualColor[] {
  const colors: TemporalVirtualColor[] = [];
  const firstColors = [...firstEnabled].sort((left, right) => left - right);
  const secondColors = [...secondEnabled].sort((left, right) => left - right);
  for (const first of firstColors) {
    for (const second of secondColors) {
      const a = palette[first]!;
      const b = palette[second]!;
      colors.push({
        first,
        second,
        r: (a.r + b.r) >> 1,
        g: (a.g + b.g) >> 1,
        b: (a.b + b.b) >> 1,
      });
    }
  }
  return colors;
}

export function buildMixedResolutionPalette(
  lowPalette: readonly QlRgbColor[],
  lowEnabled: readonly number[],
  highPalette: readonly QlRgbColor[],
  highEnabled: readonly number[],
): readonly MixedResolutionVirtualColor[] {
  const colors: MixedResolutionVirtualColor[] = [];
  const lowColors = [...lowEnabled].sort((left, right) => left - right);
  const highColors = [...highEnabled].sort((left, right) => left - right);
  for (const low of lowColors) {
    for (const highLeft of highColors) {
      for (const highRight of highColors) {
        const lowColor = lowPalette[low]!;
        const leftColor = highPalette[highLeft]!;
        const rightColor = highPalette[highRight]!;
        colors.push({
          first: low,
          second: highLeft,
          low,
          highLeft,
          highRight,
          r: (2 * lowColor.r + leftColor.r + rightColor.r) >> 2,
          g: (2 * lowColor.g + leftColor.g + rightColor.g) >> 2,
          b: (2 * lowColor.b + leftColor.b + rightColor.b) >> 2,
        });
      }
    }
  }
  return colors;
}

function buildPlainPalette(
  palette: readonly QlRgbColor[],
  enabled: readonly number[],
): readonly TemporalVirtualColor[] {
  return enabled.map((index) => {
    const color = palette[index]!;
    return {
      first: index,
      second: index,
      r: color.r,
      g: color.g,
      b: color.b,
    };
  });
}

export function qlHardwareModesForTarget(
  mode: QlTargetModeId,
): readonly QlMode[] {
  if (mode === "mode8-mode4-mixed-512x256") {
    return ["mode8-256x256", "mode4-512x256"];
  }
  if (mode === "mode8-256x256") {
    return ["mode8-256x256", "mode8-256x256"];
  }
  if (mode === "mode4-512x256") {
    return ["mode4-512x256", "mode4-512x256"];
  }
  if (mode === "mode8-vertical-spatial-256x256") {
    return ["mode8-256x256"];
  }
  if (mode === "mode4-vertical-spatial-512x256") {
    return ["mode4-512x256"];
  }
  return mode === "mode8-plain-256x256"
    ? ["mode8-256x256"]
    : ["mode4-512x256"];
}

export function qlHardwareModeForTarget(mode: QlTargetModeId): QlMode {
  const modes = qlHardwareModesForTarget(mode);
  if (modes.some((candidate) => candidate !== modes[0])) {
    throw new RangeError("QL target uses heterogeneous hardware modes.");
  }
  return modes[0]!;
}

export function qlTargetUsesMixing(mode: QlTargetModeId): boolean {
  return mode === "mode8-256x256" ||
    mode === "mode4-512x256" ||
    mode === "mode8-mode4-mixed-512x256";
}

export function qlTargetUsesVerticalSpatialMix(mode: QlTargetModeId): boolean {
  return mode === "mode8-vertical-spatial-256x256" ||
    mode === "mode4-vertical-spatial-512x256";
}

function expandRgbaHorizontally2x(
  source: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const output = new Uint8Array(width * 2 * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (y * width + x) * 4;
      const left = (y * width * 2 + x * 2) * 4;
      output.set(source.subarray(sourceOffset, sourceOffset + 4), left);
      output.set(source.subarray(sourceOffset, sourceOffset + 4), left + 4);
    }
  }
  return output;
}

function renderVirtualPaletteRgba(
  indices: Uint8Array,
  palette: readonly TemporalVirtualColor[],
): Uint8Array {
  const output = new Uint8Array(indices.length * 4);
  for (let pixel = 0; pixel < indices.length; pixel += 1) {
    const color = palette[indices[pixel] ?? 0]!;
    const offset = pixel * 4;
    output[offset] = color.r;
    output[offset + 1] = color.g;
    output[offset + 2] = color.b;
    output[offset + 3] = 255;
  }
  return output;
}

function renderMixedPredictionRgba(
  indices: Uint8Array,
  palette: readonly MixedResolutionVirtualColor[],
  lowPalette: readonly QlRgbColor[],
  highPalette: readonly QlRgbColor[],
): Uint8Array {
  const output = new Uint8Array(indices.length * 2 * 4);
  for (let pixel = 0; pixel < indices.length; pixel += 1) {
    const prediction = mixedPrediction(
      palette[indices[pixel] ?? 0]!,
      lowPalette,
      highPalette,
    );
    const offset = pixel * 8;
    output.set([...prediction.left, 255], offset);
    output.set([...prediction.right, 255], offset + 4);
  }
  return output;
}

function nearestVirtualIndex(
  r: number,
  g: number,
  b: number,
  palette: readonly TemporalVirtualColor[],
): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < palette.length; index += 1) {
    const candidateDistance = distance(r, g, b, palette[index]!);
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      best = index;
    }
  }
  return best;
}

function orderedVirtualIndex(
  r: number,
  g: number,
  b: number,
  x: number,
  y: number,
  palette: readonly TemporalVirtualColor[],
  matrix: (typeof ORDERED_MATRICES)[keyof typeof ORDERED_MATRICES],
  amount: number,
): number {
  const firstIndex = nearestVirtualIndex(r, g, b, palette);
  const first = palette[firstIndex]!;
  let secondIndex = firstIndex;
  let bestMixDistance = distance(r, g, b, first);
  let bestCoverage = 0;

  for (let candidateIndex = 0; candidateIndex < palette.length; candidateIndex += 1) {
    if (candidateIndex === firstIndex) continue;
    const second = palette[candidateIndex]!;
    const dr = second.r - first.r;
    const dg = second.g - first.g;
    const db = second.b - first.b;
    const denominator = dr * dr + dg * dg + db * db;
    if (denominator === 0) continue;
    const numerator =
      (r - first.r) * dr +
      (g - first.g) * dg +
      (b - first.b) * db;
    const coverage = Math.max(0, Math.min(1, numerator / denominator));
    const mixedR = first.r + dr * coverage;
    const mixedG = first.g + dg * coverage;
    const mixedB = first.b + db * coverage;
    const mixDistance =
      (r - mixedR) ** 2 +
      (g - mixedG) ** 2 +
      (b - mixedB) ** 2;
    if (mixDistance < bestMixDistance) {
      bestMixDistance = mixDistance;
      secondIndex = candidateIndex;
      bestCoverage = coverage;
    }
  }

  const coverageLevel = Math.max(0, Math.min(
    matrix.levels,
    Math.round(bestCoverage * matrix.levels * amount / 100),
  ));
  return orderedThreshold(matrix, x, y) < coverageLevel
    ? secondIndex
    : firstIndex;
}

function orderedLocalToneVirtualIndex(
  r: number,
  g: number,
  b: number,
  x: number,
  y: number,
  palette: readonly TemporalVirtualColor[],
  matrix: (typeof ORDERED_MATRICES)[keyof typeof ORDERED_MATRICES],
  amount: number,
  useHierarchicalCoverage: boolean,
): number {
  const firstIndex = nearestVirtualIndex(r, g, b, palette);
  const first = palette[firstIndex]!;
  let secondIndex = firstIndex;
  let bestScore = distance(r, g, b, first);
  let bestEffectiveCoverage = 0;
  const amountScale = amount / 100;

  for (let candidateIndex = 0; candidateIndex < palette.length; candidateIndex += 1) {
    if (candidateIndex === firstIndex) continue;
    const second = palette[candidateIndex]!;
    const dr = second.r - first.r;
    const dg = second.g - first.g;
    const db = second.b - first.b;
    const denominator = dr * dr + dg * dg + db * db;
    if (denominator === 0) continue;
    const numerator =
      (r - first.r) * dr +
      (g - first.g) * dg +
      (b - first.b) * db;
    const coverage = Math.max(0, Math.min(1, numerator / denominator));
    const effectiveCoverage = coverage * amountScale;
    const mixedR = first.r + dr * effectiveCoverage;
    const mixedG = first.g + dg * effectiveCoverage;
    const mixedB = first.b + db * effectiveCoverage;
    const meanError =
      (r - mixedR) ** 2 +
      (g - mixedG) ** 2 +
      (b - mixedB) ** 2;
    const localVariance =
      effectiveCoverage * (1 - effectiveCoverage) * denominator;
    const score =
      meanError + LOCAL_TONE_VARIANCE_WEIGHT * localVariance;
    if (score < bestScore) {
      bestScore = score;
      secondIndex = candidateIndex;
      bestEffectiveCoverage = effectiveCoverage;
    }
  }

  if (useHierarchicalCoverage) {
    const sublevels = ORDERED_SUBLEVEL_MATRIX.levels;
    const coverageLevel = Math.max(0, Math.min(
      matrix.levels * sublevels,
      Math.round(bestEffectiveCoverage * matrix.levels * sublevels),
    ));
    const matrixLevel = orderedThreshold(matrix, x, y);
    const tileX = Math.floor(x / matrix.width);
    const tileY = Math.floor(y / matrix.height);
    const sublevel = orderedThreshold(
      ORDERED_SUBLEVEL_MATRIX,
      tileX,
      tileY,
    );
    return matrixLevel * sublevels + sublevel < coverageLevel
      ? secondIndex
      : firstIndex;
  }
  const coverageLevel = Math.max(0, Math.min(
    matrix.levels,
    Math.round(bestEffectiveCoverage * matrix.levels),
  ));
  return orderedThreshold(matrix, x, y) < coverageLevel
    ? secondIndex
    : firstIndex;
}

/**
 * Ordered local-tone quantization for temporal mixed screens with a stable
 * spatial phase. The historical local-tone engines express coverage relative
 * to the nearest endpoint. When that endpoint changes at a Voronoi boundary,
 * the meaning of the matrix threshold is inverted even though the represented
 * color changes continuously. Canonicalizing the pair before applying the
 * threshold keeps one matrix phase attached to the same color endpoint.
 */
function orderedPhaseStableVirtualIndex(
  r: number,
  g: number,
  b: number,
  x: number,
  y: number,
  palette: readonly TemporalVirtualColor[],
  matrix: (typeof ORDERED_MATRICES)[keyof typeof ORDERED_MATRICES],
  amount: number,
): number {
  const anchorIndex = nearestVirtualIndex(r, g, b, palette);
  const anchor = palette[anchorIndex]!;
  let secondIndex = anchorIndex;
  let bestScore = distance(r, g, b, anchor);
  let bestCoverageFromAnchor = 0;
  const amountScale = amount / 100;

  for (let candidateIndex = 0; candidateIndex < palette.length; candidateIndex += 1) {
    if (candidateIndex === anchorIndex) continue;
    const second = palette[candidateIndex]!;
    const dr = second.r - anchor.r;
    const dg = second.g - anchor.g;
    const db = second.b - anchor.b;
    const denominator = dr * dr + dg * dg + db * db;
    if (denominator === 0) continue;
    const numerator =
      (r - anchor.r) * dr +
      (g - anchor.g) * dg +
      (b - anchor.b) * db;
    const coverage = Math.max(0, Math.min(1, numerator / denominator));
    const effectiveCoverage = coverage * amountScale;
    const mixedR = anchor.r + dr * effectiveCoverage;
    const mixedG = anchor.g + dg * effectiveCoverage;
    const mixedB = anchor.b + db * effectiveCoverage;
    const meanError =
      (r - mixedR) ** 2 +
      (g - mixedG) ** 2 +
      (b - mixedB) ** 2;
    const localVariance =
      effectiveCoverage * (1 - effectiveCoverage) * denominator;
    const score = meanError + LOCAL_TONE_VARIANCE_WEIGHT * localVariance;
    if (
      score < bestScore ||
      (score === bestScore && candidateIndex < secondIndex)
    ) {
      bestScore = score;
      secondIndex = candidateIndex;
      bestCoverageFromAnchor = coverage;
    }
  }

  if (secondIndex === anchorIndex) return anchorIndex;
  const compareEndpoints = (firstIndex: number, otherIndex: number): number => {
    const first = palette[firstIndex]!;
    const other = palette[otherIndex]!;
    const firstLuma = 299 * first.r + 587 * first.g + 114 * first.b;
    const otherLuma = 299 * other.r + 587 * other.g + 114 * other.b;
    return firstLuma - otherLuma ||
      first.r - other.r ||
      first.g - other.g ||
      first.b - other.b ||
      firstIndex - otherIndex;
  };
  const anchorIsLow = compareEndpoints(anchorIndex, secondIndex) <= 0;
  const lowIndex = anchorIsLow ? anchorIndex : secondIndex;
  const highIndex = anchorIsLow ? secondIndex : anchorIndex;
  const targetHighCoverage = anchorIsLow
    ? bestCoverageFromAnchor
    : 1 - bestCoverageFromAnchor;
  // Amount blends from the nearest-color baseline towards the requested
  // coverage without changing which matrix phase represents the high endpoint.
  const effectiveHighCoverage = anchorIsLow
    ? targetHighCoverage * amountScale
    : 1 - (1 - targetHighCoverage) * amountScale;
  const coverageLevel = Math.max(0, Math.min(
    matrix.levels,
    Math.round(effectiveHighCoverage * matrix.levels),
  ));
  return orderedThreshold(matrix, x, y) < coverageLevel
    ? highIndex
    : lowIndex;
}

function buildOrderedPaletteCandidates(
  palette: readonly TemporalVirtualColor[],
  matrix: (typeof ORDERED_MATRICES)[keyof typeof ORDERED_MATRICES],
  amount: number,
): readonly OrderedPaletteCandidate[] {
  const candidates: OrderedPaletteCandidate[] = [];
  const seen = new Set<string>();
  const base = Math.floor((100 - amount) * 64 / 100);
  const contribution = (value: number, level: number) =>
    Math.floor(Math.floor(level * value / matrix.levels) * amount / 100) + base;

  for (let first = 0; first < palette.length; first += 1) {
    for (let second = 0; second < palette.length; second += 1) {
      const firstColor = palette[first]!;
      const secondColor = palette[second]!;
      for (let level = 0; level < matrix.levels; level += 1) {
        const inverseLevel = matrix.levels - level;
        const r =
          contribution(firstColor.r, inverseLevel) +
          contribution(secondColor.r, level);
        const g =
          contribution(firstColor.g, inverseLevel) +
          contribution(secondColor.g, level);
        const b =
          contribution(firstColor.b, inverseLevel) +
          contribution(secondColor.b, level);
        const key = `${r},${g},${b}`;
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push({
          r,
          g,
          b,
          first,
          second,
          pattern: level,
          order: candidates.length,
        });
      }
    }
  }
  return candidates;
}

function orderedCandidateChannel(
  candidate: OrderedPaletteCandidate,
  axis: 0 | 1 | 2,
): number {
  return axis === 0 ? candidate.r : axis === 1 ? candidate.g : candidate.b;
}

function buildOrderedPaletteTree(
  candidates: readonly OrderedPaletteCandidate[],
  depth = 0,
): OrderedPaletteNode | null {
  if (candidates.length === 0) return null;
  const axis = (depth % 3) as 0 | 1 | 2;
  const sorted = [...candidates].sort((left, right) =>
    orderedCandidateChannel(left, axis) -
      orderedCandidateChannel(right, axis) ||
    left.order - right.order
  );
  const middle = Math.floor(sorted.length / 2);
  return {
    candidate: sorted[middle]!,
    axis,
    lower: buildOrderedPaletteTree(sorted.slice(0, middle), depth + 1),
    upper: buildOrderedPaletteTree(sorted.slice(middle + 1), depth + 1),
  };
}

function nearestOrderedPaletteCandidate(
  r: number,
  g: number,
  b: number,
  tree: OrderedPaletteNode,
): OrderedPaletteCandidate {
  let best = tree.candidate;
  let bestDistance = distance(r, g, b, best);
  const visit = (node: OrderedPaletteNode | null): void => {
    if (node === null) return;
    const candidateDistance = distance(r, g, b, node.candidate);
    if (
      candidateDistance < bestDistance ||
      (candidateDistance === bestDistance && node.candidate.order < best.order)
    ) {
      best = node.candidate;
      bestDistance = candidateDistance;
    }
    const sourceChannel = node.axis === 0 ? r : node.axis === 1 ? g : b;
    const delta = sourceChannel - orderedCandidateChannel(
      node.candidate,
      node.axis,
    );
    const near = delta < 0 ? node.lower : node.upper;
    const far = delta < 0 ? node.upper : node.lower;
    visit(near);
    if (delta * delta <= bestDistance) visit(far);
  };
  visit(tree);
  return best;
}

function quantizeOrderedPalettePairs(
  source: Uint8Array,
  width: number,
  height: number,
  palette: readonly TemporalVirtualColor[],
  matrix: (typeof ORDERED_MATRICES)[keyof typeof ORDERED_MATRICES],
  amount: number,
): Uint8Array {
  const candidates = buildOrderedPaletteCandidates(palette, matrix, amount);
  const tree = buildOrderedPaletteTree(candidates);
  if (tree === null) throw new RangeError("Ordered palette is empty.");
  const output = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      const candidate = nearestOrderedPaletteCandidate(
        source[offset] ?? 0,
        source[offset + 1] ?? 0,
        source[offset + 2] ?? 0,
        tree,
      );
      const oneBasedPattern = orderedThreshold(matrix, x, y) + 1;
      output[pixel] = oneBasedPattern > candidate.pattern
        ? candidate.first
        : candidate.second;
    }
  }
  return output;
}

export function quantizeTemporalVirtual(
  source: Uint8Array,
  width: number,
  height: number,
  palette: readonly TemporalVirtualColor[],
  settings: ConversionSettings,
  orderedLocalTone: boolean,
): Uint8Array {
  const output = new Uint8Array(width * height);
  if (settings.dithering === "error-diffusion" && settings.ditheringAmount > 0) {
    const errors = new Float32Array(width * height * 3);
    const scale = settings.ditheringAmount / 100;
    const decorrelated =
      settings.ditherEngineId === "error-diffusion-decorrelated-v3";
    const atkinson =
      settings.ditherEngineId === "error-diffusion-atkinson-v1";
    const phaseBalanced =
      settings.ditherEngineId === "error-diffusion-phase-balanced-v3";
    const previousRowIndices = new Uint16Array(width);
    previousRowIndices.fill(0xffff);
    const verticalRunLengths = new Uint8Array(width);
    for (let y = 0; y < height; y += 1) {
      const reverse = (y & 1) === 1;
      for (let step = 0; step < width; step += 1) {
        const x = reverse ? width - 1 - step : step;
        const pixel = y * width + x;
        const sourceOffset = pixel * 4;
        const errorOffset = pixel * 3;
        const r = Math.max(0, Math.min(
          255,
          (source[sourceOffset] ?? 0) +
            (errors[errorOffset] ?? 0) +
            (decorrelated || (phaseBalanced && settings.errorDiffusionLineSuppression > 0)
              ? diffusionNoiseOffset(
                  x,
                  y,
                  0,
                  settings.errorDiffusionRandomization,
                  decorrelated ? 24 : 8,
                )
              : 0),
        ));
        const g = Math.max(0, Math.min(
          255,
          (source[sourceOffset + 1] ?? 0) +
            (errors[errorOffset + 1] ?? 0) +
            (decorrelated || (phaseBalanced && settings.errorDiffusionLineSuppression > 0)
              ? diffusionNoiseOffset(
                  x,
                  y,
                  1,
                  settings.errorDiffusionRandomization,
                  decorrelated ? 24 : 8,
                )
              : 0),
        ));
        const b = Math.max(0, Math.min(
          255,
          (source[sourceOffset + 2] ?? 0) +
            (errors[errorOffset + 2] ?? 0) +
            (decorrelated || (phaseBalanced && settings.errorDiffusionLineSuppression > 0)
              ? diffusionNoiseOffset(
                  x,
                  y,
                  2,
                  settings.errorDiffusionRandomization,
                  decorrelated ? 24 : 8,
                )
              : 0),
        ));
        const selected = nearestVirtualIndex(r, g, b, palette);
        output[pixel] = selected;
        verticalRunLengths[x] = previousRowIndices[x] === selected
          ? Math.min(255, (verticalRunLengths[x] ?? 0) + 1)
          : 1;
        previousRowIndices[x] = selected;
        const color = palette[selected]!;
        const channelErrors = [r - color.r, g - color.g, b - color.b];
        const direction = reverse ? -1 : 1;
        const neighbors = decorrelated
          ? decorrelatedDiffusionKernel(direction)
          : atkinson
            ? atkinsonDiffusionKernel(direction)
          : phaseBalanced
            ? phaseBalancedDiffusionKernel(
                direction,
                x,
                y,
                settings.errorDiffusionLineSuppression,
                sourcePixelIsSmooth(source, width, height, x, y)
                  ? verticalRunLengths[x] ?? 0
                  : 0,
              )
          : reverse
            ? [[-1, 0, 7], [1, 1, 3], [0, 1, 5], [-1, 1, 1]]
            : [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]];
        const denominator = decorrelated ? 42 : atkinson ? 8 : 16;
        for (const [dx, dy, weight] of neighbors) {
          const nx = x + (dx ?? 0);
          const ny = y + (dy ?? 0);
          if (nx < 0 || nx >= width || ny >= height) continue;
          const neighbor = (ny * width + nx) * 3;
          for (let channel = 0; channel < 3; channel += 1) {
            errors[neighbor + channel] =
              (errors[neighbor + channel] ?? 0) +
              (channelErrors[channel] ?? 0) *
                (weight ?? 0) /
                denominator *
                scale;
          }
        }
      }
    }
    return output;
  }

  const matrix = ORDERED_MATRICES[settings.orderedMatrix];
  if (
    settings.dithering === "ordered" &&
    settings.ditheringAmount > 0 &&
    (
      settings.ditherEngineId === "ordered-palette-pairs-v4" ||
      (
        (
          settings.ditherEngineId === "ordered-baseline-additive-v5" ||
          settings.ditherEngineId === "ordered-strict-matrix-v6" ||
          settings.ditherEngineId === "ordered-clustered-dot-v1" ||
          settings.ditherEngineId === "ordered-void-cluster-v1"
        ) &&
        !orderedLocalTone
      )
    )
  ) {
    return quantizeOrderedPalettePairs(
      source,
      width,
      height,
      palette,
      matrix,
      settings.ditheringAmount,
    );
  }
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixel = y * width + x;
      const offset = pixel * 4;
      const r = source[offset] ?? 0;
      const g = source[offset + 1] ?? 0;
      const b = source[offset + 2] ?? 0;
      if (settings.dithering === "ordered" && settings.ditheringAmount > 0) {
        if (settings.ditherEngineId === "ordered-mixed-phase-stable-v8") {
          output[pixel] = orderedPhaseStableVirtualIndex(
            r,
            g,
            b,
            x,
            y,
            palette,
            matrix,
            settings.ditheringAmount,
          );
        } else if (settings.ditherEngineId === "ordered-coverage-normalized-v7") {
          const perturbation = normalizedOrderedOffset(matrix, x, y) *
            128 * settings.ditheringAmount / 100;
          output[pixel] = nearestVirtualIndex(
            Math.max(0, Math.min(255, r + perturbation)),
            Math.max(0, Math.min(255, g + perturbation)),
            Math.max(0, Math.min(255, b + perturbation)),
            palette,
          );
        } else {
          output[pixel] = orderedLocalTone
          ? orderedLocalToneVirtualIndex(
              r,
              g,
              b,
              x,
              y,
              palette,
              matrix,
              settings.ditheringAmount,
              settings.ditherEngineId === "ordered-baseline-additive-v5",
            )
          : orderedVirtualIndex(
          r,
          g,
          b,
          x,
          y,
          palette,
          matrix,
          settings.ditheringAmount,
          );
        }
      } else {
        output[pixel] = nearestVirtualIndex(r, g, b, palette);
      }
    }
  }
  return output;
}

interface MixedPrediction {
  readonly left: readonly [number, number, number];
  readonly right: readonly [number, number, number];
  readonly low: readonly [number, number, number];
}

function mixedPrediction(
  candidate: MixedResolutionVirtualColor,
  lowPalette: readonly QlRgbColor[],
  highPalette: readonly QlRgbColor[],
): MixedPrediction {
  const low = lowPalette[candidate.low]!;
  const highLeft = highPalette[candidate.highLeft]!;
  const highRight = highPalette[candidate.highRight]!;
  const highAverage = [
    (highLeft.r + highRight.r) >> 1,
    (highLeft.g + highRight.g) >> 1,
    (highLeft.b + highRight.b) >> 1,
  ] as const;
  return {
    left: [
      (low.r + highLeft.r) >> 1,
      (low.g + highLeft.g) >> 1,
      (low.b + highLeft.b) >> 1,
    ],
    right: [
      (low.r + highRight.r) >> 1,
      (low.g + highRight.g) >> 1,
      (low.b + highRight.b) >> 1,
    ],
    low: [
      (low.r + highAverage[0]) >> 1,
      (low.g + highAverage[1]) >> 1,
      (low.b + highAverage[2]) >> 1,
    ],
  };
}

function mixedCandidateCost(
  source: readonly number[],
  prediction: MixedPrediction,
  optimizerId: QlMixedOptimizerId,
): number {
  let lowError = 0;
  let highError = 0;
  let detailError = 0;
  for (let channel = 0; channel < 3; channel += 1) {
    const sourceLeft = source[channel] ?? 0;
    const sourceRight = source[channel + 3] ?? 0;
    const sourceLow = (sourceLeft + sourceRight) >> 1;
    const lowDifference = sourceLow - (prediction.low[channel] ?? 0);
    const leftDifference = sourceLeft - (prediction.left[channel] ?? 0);
    const rightDifference = sourceRight - (prediction.right[channel] ?? 0);
    const detailDifference =
      (sourceRight - sourceLeft) -
      ((prediction.right[channel] ?? 0) - (prediction.left[channel] ?? 0));
    lowError += lowDifference * lowDifference;
    highError += (leftDifference * leftDifference +
      rightDifference * rightDifference) / 2;
    detailError += detailDifference * detailDifference / 4;
  }
  if (optimizerId === "ql-mixed-low-perception-v2") return lowError;
  if (optimizerId === "ql-mixed-high-detail-v2") {
    return 0.9 * highError + 0.1 * detailError;
  }
  return 0.45 * lowError + 0.45 * highError + 0.1 * detailError;
}

function nearestMixedCandidate(
  source: readonly number[],
  predictions: readonly MixedPrediction[],
  optimizerId: QlMixedOptimizerId,
): number {
  let bestIndex = 0;
  let bestCost = Number.POSITIVE_INFINITY;
  for (let index = 0; index < predictions.length; index += 1) {
    const cost = mixedCandidateCost(source, predictions[index]!, optimizerId);
    if (cost < bestCost) {
      bestCost = cost;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function quantizeMixedResolutionV2(
  source: Uint8Array,
  width: number,
  height: number,
  palette: readonly MixedResolutionVirtualColor[],
  lowPalette: readonly QlRgbColor[],
  highPalette: readonly QlRgbColor[],
  settings: ConversionSettings,
): Uint8Array {
  const output = new Uint8Array(width * height);
  const predictions = palette.map((candidate) =>
    mixedPrediction(candidate, lowPalette, highPalette)
  );
  const errors = settings.dithering === "error-diffusion" &&
      settings.ditheringAmount > 0
    ? new Float32Array(width * height * 6)
    : null;
  const matrix = ORDERED_MATRICES[settings.orderedMatrix];
  const scale = settings.ditheringAmount / 100;
  const decorrelated =
    settings.ditherEngineId === "error-diffusion-decorrelated-v3";
  const atkinson = settings.ditherEngineId === "error-diffusion-atkinson-v1";
  const phaseBalanced =
    settings.ditherEngineId === "error-diffusion-phase-balanced-v3";
  const previousRowIndices = new Uint16Array(width);
  previousRowIndices.fill(0xffff);
  const verticalRunLengths = new Uint8Array(width);
  for (let y = 0; y < height; y += 1) {
    const reverse = errors !== null && (y & 1) === 1;
    for (let step = 0; step < width; step += 1) {
      const x = reverse ? width - 1 - step : step;
      const pairOffset = (y * width * 2 + x * 2) * 4;
      const sourceChannels = new Array<number>(6);
      const threshold = settings.dithering === "ordered" &&
          settings.ditheringAmount > 0
        ? settings.ditherEngineId === "ordered-coverage-normalized-v7"
          ? normalizedOrderedOffset(matrix, x, y) * 128 * scale
          : (
            (orderedThreshold(matrix, x, y) + 0.5) / matrix.levels - 0.5
          ) * 128 * scale
        : 0;
      const errorOffset = (y * width + x) * 6;
      for (let channel = 0; channel < 3; channel += 1) {
        sourceChannels[channel] = Math.max(0, Math.min(
          255,
          (source[pairOffset + channel] ?? 0) + threshold +
            (errors?.[errorOffset + channel] ?? 0) +
            (decorrelated || (phaseBalanced && settings.errorDiffusionLineSuppression > 0)
              ? diffusionNoiseOffset(
                  x,
                  y,
                  channel,
                  settings.errorDiffusionRandomization,
                  decorrelated ? 24 : 8,
                )
              : 0),
        ));
        sourceChannels[channel + 3] = Math.max(0, Math.min(
          255,
          (source[pairOffset + 4 + channel] ?? 0) + threshold +
            (errors?.[errorOffset + channel + 3] ?? 0) +
            (decorrelated || (phaseBalanced && settings.errorDiffusionLineSuppression > 0)
              ? diffusionNoiseOffset(
                  x,
                  y,
                  channel + 3,
                  settings.errorDiffusionRandomization,
                  decorrelated ? 24 : 8,
                )
              : 0),
        ));
      }
      const selected = nearestMixedCandidate(
        sourceChannels,
        predictions,
        settings.qlMixedOptimizerId,
      );
      output[y * width + x] = selected;
      verticalRunLengths[x] = previousRowIndices[x] === selected
        ? Math.min(255, (verticalRunLengths[x] ?? 0) + 1)
        : 1;
      previousRowIndices[x] = selected;
      if (errors === null) continue;
      const prediction = predictions[selected]!;
      const channelErrors = [
        ...prediction.left.map((value, channel) =>
          (sourceChannels[channel] ?? 0) - value
        ),
        ...prediction.right.map((value, channel) =>
          (sourceChannels[channel + 3] ?? 0) - value
        ),
      ];
      const direction = reverse ? -1 : 1;
      const neighbors = decorrelated
        ? decorrelatedDiffusionKernel(direction)
        : atkinson
          ? atkinsonDiffusionKernel(direction)
          : phaseBalanced
            ? phaseBalancedDiffusionKernel(
                direction,
                x,
                y,
                settings.errorDiffusionLineSuppression,
                sourcePixelIsSmooth(source, width * 2, height, x * 2, y)
                  ? verticalRunLengths[x] ?? 0
                  : 0,
              )
          : reverse
            ? [[-1, 0, 7], [1, 1, 3], [0, 1, 5], [-1, 1, 1]] as const
            : [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] as const;
      const denominator = decorrelated ? 42 : atkinson ? 8 : 16;
      for (const [dx, dy, weight] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const neighborOffset = (ny * width + nx) * 6;
        for (let channel = 0; channel < 6; channel += 1) {
          errors[neighborOffset + channel] =
            (errors[neighborOffset + channel] ?? 0) +
            (channelErrors[channel] ?? 0) * weight / denominator * scale;
        }
      }
    }
  }
  return output;
}

export function mergeTemporalFrames(first: Uint8Array, second: Uint8Array): Uint8Array {
  const merged = new Uint8Array(first.length);
  for (let offset = 0; offset < first.length; offset += 4) {
    merged[offset] = ((first[offset] ?? 0) + (second[offset] ?? 0)) >> 1;
    merged[offset + 1] = ((first[offset + 1] ?? 0) + (second[offset + 1] ?? 0)) >> 1;
    merged[offset + 2] = ((first[offset + 2] ?? 0) + (second[offset + 2] ?? 0)) >> 1;
    merged[offset + 3] = 255;
  }
  return merged;
}

export function temporalRgbaError(source: Uint8Array, output: Uint8Array): number {
  let score = 0;
  for (let offset = 0; offset < source.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const difference = (source[offset + channel] ?? 0) - (output[offset + channel] ?? 0);
      score += difference * difference;
    }
  }
  return score;
}

export function convertToQl(
  sourceRgba: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  settings: ConversionSettings,
  _level: OptimizationLevel = "high",
): QlConversionResult {
  assertCompatibleEngines(
    "sinclair-ql",
    settings.attributeOptimizerId,
    settings.ditherEngineId,
  );
  if (ditherMethodForEngine(settings.ditherEngineId) !== settings.dithering) {
    throw new RangeError("Dither engine and dithering method do not match.");
  }
  if (
    !Number.isInteger(settings.errorDiffusionLineSuppression) ||
    settings.errorDiffusionLineSuppression < 0 ||
    settings.errorDiffusionLineSuppression > 100
  ) {
    throw new RangeError(
      "Error-diffusion line suppression must be an integer from 0 through 100.",
    );
  }
  if (
    ![
      "ql-mixed-average-v1",
      "ql-mixed-low-perception-v2",
      "ql-mixed-high-detail-v2",
      "ql-mixed-balanced-v2",
    ].includes(settings.qlMixedOptimizerId)
  ) {
    throw new RangeError("Sinclair QL mixed optimizer is invalid.");
  }
  const targetMode = settings.modeId;
  if (
    targetMode !== "mode8-256x256" &&
    targetMode !== "mode4-512x256" &&
    targetMode !== "mode8-mode4-mixed-512x256" &&
    targetMode !== "mode8-plain-256x256" &&
    targetMode !== "mode4-plain-512x256" &&
    targetMode !== "mode8-vertical-spatial-256x256" &&
    targetMode !== "mode4-vertical-spatial-512x256"
  ) {
    throw new RangeError("Sinclair QL mode is invalid.");
  }
  if (
    !qlTargetUsesVerticalSpatialMix(targetMode) &&
    (
      settings.attributeOptimizerId === "ql-vertical-spatial-uniform-v1" ||
      settings.ditherEngineId.startsWith("vertical-spatial-") ||
      settings.verticalSpatialMix !== undefined
    )
  ) throw new RangeError("Sinclair QL spatial engines require a vertical spatial target.");
  const hardwareModes = qlHardwareModesForTarget(targetMode);
  const expectedScreens = outputScreenCount(targetMode);
  if (
    hardwareModes.length !== expectedScreens ||
    settings.paletteSelections.length !== expectedScreens
  ) {
    throw new RangeError(`QL mode requires ${expectedScreens} palette selection(s).`);
  }
  const selections = settings.paletteSelections.map((_, index) =>
    paletteSelection(settings, index)
  );
  const palettes = hardwareModes.map((hardwareMode) =>
    qlModePalette(hardwareMode)
  );
  for (let screen = 0; screen < selections.length; screen += 1) {
    const selection = selections[screen]!;
    const palette = palettes[screen]!;
    if (
      selection.brightMode !== undefined ||
      selection.enabledColorIds.length === 0 ||
      selection.enabledColorIds.some((index) =>
        !Number.isInteger(index) || index < 0 || index >= palette.length
      ) ||
      new Set(selection.enabledColorIds).size !== selection.enabledColorIds.length
    ) {
      throw new RangeError("Enabled QL palette colors are invalid.");
    }
  }

  if (qlTargetUsesVerticalSpatialMix(targetMode)) {
    validateVerticalSpatialMixSettings(settings.verticalSpatialMix);
    const spatialDitherEngine = settings.dithering === "none"
      ? "vertical-spatial-none-v1"
      : settings.dithering === "ordered"
        ? "vertical-spatial-ordered-v1"
        : "vertical-spatial-error-diffusion-v1";
    if (
      settings.attributeOptimizerId !== "ql-vertical-spatial-uniform-v1" ||
      settings.verticalSpatialMix.algorithmId !== "vertical-spatial-uniform-v1" ||
      settings.ditherEngineId !== spatialDitherEngine
    ) throw new RangeError("Sinclair QL vertical spatial mode requires a matching Version 1 spatial dither engine.");
    const hardwareMode = hardwareModes[0]!;
    const width = qlModeWidth(hardwareMode);
    const framed = frameRgbaToDimensions(
      sourceRgba,
      sourceWidth,
      sourceHeight,
      width,
      QL_SCREEN_HEIGHT,
      settings,
      hardwareMode === "mode8-256x256"
        ? { width: 4, height: 3 }
        : { width: 2, height: 3 },
    );
    const filtered = filterRgba(framed, width, QL_SCREEN_HEIGHT, settings);
    const normalized = adjustRgba(filtered, settings);
    const optimized = optimizeVerticalSpatialPixels(
      normalized,
      width,
      QL_SCREEN_HEIGHT,
      palettes[0]!,
      selections[0]!.enabledColorIds,
      {
        method: settings.dithering,
        amount: settings.ditheringAmount,
        orderedMatrix: settings.orderedMatrix,
        errorRandomization: settings.errorDiffusionRandomization,
      },
    );
    const encoded = encodeQlScreen(optimized.upperIndices, hardwareMode);
    const preview = renderQlRgba(optimized.upperIndices, hardwareMode);
    const spatial = withAnalyticPreview(
      optimized.diagnostics,
      preview,
      width,
      QL_SCREEN_HEIGHT,
    );
    return {
      platformId: "sinclair-ql",
      modeId: targetMode,
      width,
      height: QL_SCREEN_HEIGHT,
      pixelAspectRatio: hardwareMode === "mode8-256x256" ? 4 / 3 : 2 / 3,
      attributeOptimizerId: settings.attributeOptimizerId,
      ditherEngineId: settings.ditherEngineId,
      paletteSelections: settings.paletteSelections,
      frames: [{
        hardwareModeId: hardwareMode,
        nativeWidth: width,
        nativeHeight: QL_SCREEN_HEIGHT,
        nativePixelAspectRatio: hardwareMode === "mode8-256x256" ? 4 / 3 : 2 / 3,
        encoded,
        paletteIndices: optimized.upperIndices,
        previewRgba: preview,
      }],
      preConstraintPreviewRgba: normalized,
      mergedPreviewRgba: preview,
      sourcePreviewRgba: normalized,
      previewRgba: preview,
      score: spatial.totalCost,
      verticalSpatialDiagnostics: spatial,
    };
  }

  if (targetMode === "mode8-mode4-mixed-512x256") {
    const lowMode = hardwareModes[0]!;
    const highMode = hardwareModes[1]!;
    const lowWidth = qlModeWidth(lowMode);
    const highWidth = qlModeWidth(highMode);
    const useLegacyAverage =
      settings.qlMixedOptimizerId === "ql-mixed-average-v1";
    const framed = frameRgbaToDimensions(
      sourceRgba,
      sourceWidth,
      sourceHeight,
      useLegacyAverage ? lowWidth : highWidth,
      QL_SCREEN_HEIGHT,
      settings,
      useLegacyAverage
        ? { width: 4, height: 3 }
        : { width: 2, height: 3 },
    );
    const filtered = filterRgba(
      framed,
      useLegacyAverage ? lowWidth : highWidth,
      QL_SCREEN_HEIGHT,
      settings,
    );
    const normalizedSource = adjustRgba(filtered, settings);
    const virtualPalette = buildMixedResolutionPalette(
      palettes[0]!,
      selections[0]!.enabledColorIds,
      palettes[1]!,
      selections[1]!.enabledColorIds,
    );
    const virtualIndices = useLegacyAverage
      ? quantizeTemporalVirtual(
          normalizedSource,
          lowWidth,
          QL_SCREEN_HEIGHT,
          virtualPalette,
          settings,
          settings.ditherEngineId === "ordered-local-tone-v3" ||
            settings.ditherEngineId === "ordered-baseline-additive-v5" ||
            settings.ditherEngineId === "ordered-strict-matrix-v6",
        )
      : quantizeMixedResolutionV2(
          normalizedSource,
          lowWidth,
          QL_SCREEN_HEIGHT,
          virtualPalette,
          palettes[0]!,
          palettes[1]!,
          settings,
        );
    const lowIndices = new Uint8Array(lowWidth * QL_SCREEN_HEIGHT);
    const highIndices = new Uint8Array(highWidth * QL_SCREEN_HEIGHT);
    for (let y = 0; y < QL_SCREEN_HEIGHT; y += 1) {
      for (let x = 0; x < lowWidth; x += 1) {
        const pixel = y * lowWidth + x;
        const virtualIndex = virtualIndices[pixel] ?? 0;
        const candidate = virtualPalette[virtualIndex]!;
        lowIndices[pixel] = candidate.low;
        const stableNeighbor = x + 1 < lowWidth &&
          virtualIndices[pixel + 1] === virtualIndex;
        const swapHighPair = settings.screenFlickerSuppression &&
          stableNeighbor &&
          (y & 1) === 0;
        const highOffset = y * highWidth + x * 2;
        highIndices[highOffset] = swapHighPair
          ? candidate.highRight
          : candidate.highLeft;
        highIndices[highOffset + 1] = swapHighPair
          ? candidate.highLeft
          : candidate.highRight;
      }
    }
    const lowNativePreview = renderQlRgba(lowIndices, lowMode);
    const lowPreview = expandRgbaHorizontally2x(
      lowNativePreview,
      lowWidth,
      QL_SCREEN_HEIGHT,
    );
    const highPreview = renderQlRgba(highIndices, highMode);
    const merged = mergeTemporalFrames(lowPreview, highPreview);
    const normalized = useLegacyAverage
      ? expandRgbaHorizontally2x(
          normalizedSource,
          lowWidth,
          QL_SCREEN_HEIGHT,
        )
      : normalizedSource;
    const preConstraintPreview = useLegacyAverage
      ? expandRgbaHorizontally2x(
          renderVirtualPaletteRgba(virtualIndices, virtualPalette),
          lowWidth,
          QL_SCREEN_HEIGHT,
        )
      : renderMixedPredictionRgba(
          virtualIndices,
          virtualPalette,
          palettes[0]!,
          palettes[1]!,
        );
    return {
      platformId: "sinclair-ql",
      modeId: targetMode,
      width: highWidth,
      height: QL_SCREEN_HEIGHT,
      pixelAspectRatio: 2 / 3,
      attributeOptimizerId: settings.attributeOptimizerId,
      ditherEngineId: settings.ditherEngineId,
      paletteSelections: settings.paletteSelections,
      frames: [
        {
          hardwareModeId: lowMode,
          nativeWidth: lowWidth,
          nativeHeight: QL_SCREEN_HEIGHT,
          nativePixelAspectRatio: 4 / 3,
          encoded: encodeQlScreen(lowIndices, lowMode),
          paletteIndices: lowIndices,
          previewRgba: lowPreview,
        },
        {
          hardwareModeId: highMode,
          nativeWidth: highWidth,
          nativeHeight: QL_SCREEN_HEIGHT,
          nativePixelAspectRatio: 2 / 3,
          encoded: encodeQlScreen(highIndices, highMode),
          paletteIndices: highIndices,
          previewRgba: highPreview,
        },
      ],
      preConstraintPreviewRgba: preConstraintPreview,
      mergedPreviewRgba: merged,
      sourcePreviewRgba: normalized,
      previewRgba: merged,
      score: temporalRgbaError(normalized, merged),
    };
  }

  const mode = qlHardwareModeForTarget(targetMode);
  const usesMixing = qlTargetUsesMixing(targetMode);
  const width = qlModeWidth(mode);
  const palette = qlModePalette(mode);
  const framed = frameRgbaToDimensions(
    sourceRgba,
    sourceWidth,
    sourceHeight,
    width,
    QL_SCREEN_HEIGHT,
    settings,
    width === 256
      ? { width: 4, height: 3 }
      : { width: 2, height: 3 },
  );
  const filtered = filterRgba(framed, width, QL_SCREEN_HEIGHT, settings);
  const normalized = adjustRgba(filtered, settings);
  const virtualPalette = usesMixing
    ? buildTemporalCrossPalette(
        palette,
        selections[0]!.enabledColorIds,
        selections[1]!.enabledColorIds,
      )
    : buildPlainPalette(palette, selections[0]!.enabledColorIds);
  const virtualIndices = quantizeTemporalVirtual(
    normalized,
    width,
    QL_SCREEN_HEIGHT,
    virtualPalette,
    settings,
    usesMixing && (
      settings.ditherEngineId === "ordered-local-tone-v3" ||
      settings.ditherEngineId === "ordered-baseline-additive-v5" ||
      settings.ditherEngineId === "ordered-strict-matrix-v6"
    ),
  );
  const firstIndices = new Uint8Array(virtualIndices.length);
  const secondIndices = new Uint8Array(virtualIndices.length);
  for (let pixel = 0; pixel < virtualIndices.length; pixel += 1) {
    const virtualIndex = virtualIndices[pixel] ?? 0;
    const pair = virtualPalette[virtualIndex]!;
    const x = pixel % width;
    const y = Math.floor(pixel / width);
    const swap = usesMixing &&
      settings.screenFlickerSuppression &&
      paletteSelectionsMatch(selections[0]!, selections[1]!) &&
      pair.first !== pair.second &&
      ((x + y) & 1) === 1;
    firstIndices[pixel] = swap ? pair.second : pair.first;
    secondIndices[pixel] = swap ? pair.first : pair.second;
  }
  const firstPreview = renderQlRgba(firstIndices, mode);
  if (!usesMixing) {
    return {
      platformId: "sinclair-ql",
      modeId: targetMode,
      width,
      height: QL_SCREEN_HEIGHT,
      pixelAspectRatio: width === 256 ? 4 / 3 : 2 / 3,
      attributeOptimizerId: settings.attributeOptimizerId,
      ditherEngineId: settings.ditherEngineId,
      paletteSelections: settings.paletteSelections,
      frames: [{
        hardwareModeId: mode,
        nativeWidth: width,
        nativeHeight: QL_SCREEN_HEIGHT,
        nativePixelAspectRatio: width === 256 ? 4 / 3 : 2 / 3,
        encoded: encodeQlScreen(firstIndices, mode),
        paletteIndices: firstIndices,
        previewRgba: firstPreview,
      }],
      preConstraintPreviewRgba: firstPreview,
      mergedPreviewRgba: firstPreview,
      sourcePreviewRgba: normalized,
      previewRgba: firstPreview,
      score: temporalRgbaError(normalized, firstPreview),
    };
  }
  const secondPreview = renderQlRgba(secondIndices, mode);
  const merged = mergeTemporalFrames(firstPreview, secondPreview);
  return {
    platformId: "sinclair-ql",
    modeId: targetMode,
    width,
    height: QL_SCREEN_HEIGHT,
    pixelAspectRatio: width === 256 ? 4 / 3 : 2 / 3,
    attributeOptimizerId: settings.attributeOptimizerId,
    ditherEngineId: settings.ditherEngineId,
    paletteSelections: settings.paletteSelections,
    frames: [
      {
        hardwareModeId: mode,
        nativeWidth: width,
        nativeHeight: QL_SCREEN_HEIGHT,
        nativePixelAspectRatio: width === 256 ? 4 / 3 : 2 / 3,
        encoded: encodeQlScreen(firstIndices, mode),
        paletteIndices: firstIndices,
        previewRgba: firstPreview,
      },
      {
        hardwareModeId: mode,
        nativeWidth: width,
        nativeHeight: QL_SCREEN_HEIGHT,
        nativePixelAspectRatio: width === 256 ? 4 / 3 : 2 / 3,
        encoded: encodeQlScreen(secondIndices, mode),
        paletteIndices: secondIndices,
        previewRgba: secondPreview,
      },
    ],
    preConstraintPreviewRgba: merged,
    mergedPreviewRgba: merged,
    sourcePreviewRgba: normalized,
    previewRgba: merged,
    score: temporalRgbaError(normalized, merged),
  };
}
