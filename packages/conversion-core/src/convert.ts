import {
  ZX_ATTRIBUTE_COLUMNS,
  ZX_SCREEN_HEIGHT,
  ZX_SCREEN_WIDTH,
  assertValidScreen,
  serializeSoftwareScr,
  type ZxScreen,
} from "@retro-converter/zx-spectrum";
import { renderArtisticOrdered } from "./artistic-ordered.js";
import { frameRgba } from "./geometry.js";
import { adjustRgba, validateAdjustments } from "./adjustments.js";
import { filterRgba, validateImageFilters } from "./filters.js";
import {
  normalizedOrderedOffset,
  ORDERED_MATRICES,
  orderedThreshold,
} from "./matrices.js";
import { decodeAttribute, zxColor } from "./palette.js";
import {
  outputScreenCount,
  paletteSelection,
  paletteSelectionsMatch,
  zxBrightMode,
} from "./palette-selections.js";
import type {
  AttributeHeight,
  BrightMode,
  ConversionSettings,
  OptimizationLevel,
  RgbColor,
  ZxConversionResult,
} from "./types.js";
import {
  optimizeVerticalSpatialZx,
  validateVerticalSpatialMixSettings,
  withAnalyticPreview,
} from "./vertical-spatial-mix.js";
import { assertCompatibleEngines, ditherMethodForEngine } from "./engines.js";
import {
  applyCheckerPlacement,
  checkerPlacementStrengthV33,
  planCheckerOnlyPlacementV33,
  planCheckerPlacement,
} from "./checker-placement.js";
import { convertStructuredZx } from "./structured-zx.js";
import {
  atkinsonDiffusionKernel,
  checkerPhaseDiffusionKernel,
  checkerPhaseV42DiffusionKernel,
  checkerPhaseV43DiffusionKernel,
  checkerPhaseV5DiffusionKernel,
  decorrelatedDiffusionKernel,
  diffusionNoiseOffset,
  hilbertTraversal,
  phaseBalancedDiffusionKernel,
} from "./diffusion.js";
import {
  buildTemporalCrossPalette,
  mergeTemporalFrames,
  quantizeTemporalVirtual,
  temporalRgbaError,
} from "./ql-convert.js";

const CELL_WIDTH = 8;
const ERROR_SCALE = 1_600;
const COST_SCALE = 400;
const LOCAL_TONE_WEIGHT = 2;
const TONE_BLOCK_SIZE = 2;
const TONE_BLOCK_COLUMNS = CELL_WIDTH / TONE_BLOCK_SIZE;
const PALETTE_SCORE_SCALE = 4_096;
const PAIR_SPAN_PENALTY_NUMERATOR = 1;
const PAIR_SPAN_PENALTY_DENOMINATOR = 2;
const HUE_NORMALIZATION_MIN_CHROMA = 8;

function squaredDistance(r: number, g: number, b: number, color: RgbColor): number {
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

function projectErrorOntoPair(
  errorR: number,
  errorG: number,
  errorB: number,
  ink: RgbColor,
  paper: RgbColor,
): readonly [number, number, number] {
  const dr = ink.r - paper.r;
  const dg = ink.g - paper.g;
  const db = ink.b - paper.b;
  const denominator = dr * dr + dg * dg + db * db;
  if (denominator === 0) return [0, 0, 0];
  const projection = errorR * dr + errorG * dg + errorB * db;
  return [
    signedRoundDiv(projection * dr, denominator),
    signedRoundDiv(projection * dg, denominator),
    signedRoundDiv(projection * db, denominator),
  ];
}

function hueNormalizedSelectionSample(
  r: number,
  g: number,
  b: number,
): readonly [number, number, number] {
  const minimum = Math.min(r, g, b);
  const maximum = Math.max(r, g, b);
  const chroma = maximum - minimum;
  if (chroma < HUE_NORMALIZATION_MIN_CHROMA) return [r, g, b];
  const normalize = (channel: number): number =>
    Math.floor(((channel - minimum) * maximum + Math.floor(chroma / 2)) / chroma);
  return [normalize(r), normalize(g), normalize(b)];
}

function errorDiffusionSelectionSample(
  r: number,
  g: number,
  b: number,
): readonly [number, number, number] {
  const channels = [r, g, b].sort((left, right) => right - left);
  const dominantSeparation = (channels[0] ?? 0) - (channels[1] ?? 0);
  return dominantSeparation >= HUE_NORMALIZATION_MIN_CHROMA
    ? hueNormalizedSelectionSample(r, g, b)
    : [r, g, b];
}

function selectProjected(
  r: number,
  g: number,
  b: number,
  ink: RgbColor,
  paper: RgbColor,
  threshold: number,
  levels: number,
  amount: number,
): number {
  const dr = ink.r - paper.r;
  const dg = ink.g - paper.g;
  const db = ink.b - paper.b;
  const denominator = dr * dr + dg * dg + db * db;
  if (denominator === 0) return 0;
  const projection = (r - paper.r) * dr + (g - paper.g) * dg + (b - paper.b) * db;
  const left = 2 * 100 * levels * projection;
  const right = denominator * (100 * levels + amount * (2 * threshold + 1 - levels));
  return left >= right ? 1 : 0;
}

function projectedLineDistanceScore(
  r: number,
  g: number,
  b: number,
  ink: RgbColor,
  paper: RgbColor,
): number {
  const dr = ink.r - paper.r;
  const dg = ink.g - paper.g;
  const db = ink.b - paper.b;
  const denominator = dr * dr + dg * dg + db * db;
  if (denominator === 0) {
    return squaredDistance(r, g, b, paper) * PALETTE_SCORE_SCALE;
  }
  const projection = (r - paper.r) * dr + (g - paper.g) * dg + (b - paper.b) * db;
  if (projection <= 0) {
    return squaredDistance(r, g, b, paper) * PALETTE_SCORE_SCALE;
  }
  if (projection >= denominator) {
    return squaredDistance(r, g, b, ink) * PALETTE_SCORE_SCALE;
  }
  const paperDistance = squaredDistance(r, g, b, paper);
  const perpendicularNumerator = paperDistance * denominator - projection * projection;
  const spanVarianceNumerator = projection * (denominator - projection);
  const differingChannels =
    (dr === 0 ? 0 : 1) +
    (dg === 0 ? 0 : 1) +
    (db === 0 ? 0 : 1);
  const hasPositiveChannel = dr > 0 || dg > 0 || db > 0;
  const hasNegativeChannel = dr < 0 || dg < 0 || db < 0;
  const spansProblematicDiagonal =
    (hasPositiveChannel && hasNegativeChannel) ||
    differingChannels === 3;
  const combinedNumerator =
    PAIR_SPAN_PENALTY_DENOMINATOR * perpendicularNumerator +
    (spansProblematicDiagonal ? PAIR_SPAN_PENALTY_NUMERATOR * spanVarianceNumerator : 0);
  const combinedDenominator = PAIR_SPAN_PENALTY_DENOMINATOR * denominator;
  return Math.floor(
    (combinedNumerator * PALETTE_SCORE_SCALE + Math.floor(combinedDenominator / 2)) /
      combinedDenominator,
  );
}

function evaluatePaletteCandidate(
  source: Uint8Array,
  cellX: number,
  cellY: number,
  cellHeight: AttributeHeight,
  ink: RgbColor,
  paper: RgbColor,
): number {
  let score = 0;
  for (let localY = 0; localY < cellHeight; localY += 1) {
    for (let localX = 0; localX < CELL_WIDTH; localX += 1) {
      const x = cellX * CELL_WIDTH + localX;
      const y = cellY * cellHeight + localY;
      const sourceOffset = (y * ZX_SCREEN_WIDTH + x) * 4;
      const sourceR = source[sourceOffset] ?? 0;
      const sourceG = source[sourceOffset + 1] ?? 0;
      const sourceB = source[sourceOffset + 2] ?? 0;
      const selectionSample = hueNormalizedSelectionSample(sourceR, sourceG, sourceB);
      score += projectedLineDistanceScore(
        selectionSample[0],
        selectionSample[1],
        selectionSample[2],
        ink,
        paper,
      );
    }
  }
  return score;
}

function attributeAllowed(
  attribute: number,
  settings: ConversionSettings,
  level: OptimizationLevel,
  draftBright: boolean,
  enabledColors: ReadonlySet<number>,
): boolean {
  const inkCode = attribute & 7;
  const paperCode = (attribute >> 3) & 7;
  if (inkCode < paperCode) return false;
  const bright = (attribute & 0x40) !== 0;
  if (zxBrightMode(settings) === "on" && !bright) return false;
  if (zxBrightMode(settings) === "off" && bright) return false;
  if (
    zxBrightMode(settings) === "auto" && level === "draft" &&
    bright !== draftBright
  ) return false;
  return enabledColors.has(inkCode) && enabledColors.has(paperCode);
}

function calculateDraftBrightCells(
  source: Uint8Array,
  cellHeight: AttributeHeight,
): Uint8Array {
  const attributeRows = ZX_SCREEN_HEIGHT / cellHeight;
  const cells = new Uint8Array(ZX_ATTRIBUTE_COLUMNS * attributeRows);
  const cellPixels = CELL_WIDTH * cellHeight;
  for (let cellY = 0; cellY < attributeRows; cellY += 1) {
    for (let cellX = 0; cellX < ZX_ATTRIBUTE_COLUMNS; cellX += 1) {
      let intensitySum = 0;
      for (let localY = 0; localY < cellHeight; localY += 1) {
        for (let localX = 0; localX < CELL_WIDTH; localX += 1) {
          const offset = (
            (cellY * cellHeight + localY) * ZX_SCREEN_WIDTH +
            cellX * CELL_WIDTH + localX
          ) * 4;
          intensitySum += Math.max(
            source[offset] ?? 0,
            source[offset + 1] ?? 0,
            source[offset + 2] ?? 0,
          );
        }
      }
      cells[cellY * ZX_ATTRIBUTE_COLUMNS + cellX] =
        intensitySum >= 224 * cellPixels ? 1 : 0;
      }
    }
  return cells;
}

function selectDiscreteAttributesFromSource(
  source: Uint8Array,
  cellHeight: AttributeHeight,
  settings: ConversionSettings,
  level: OptimizationLevel,
  enabledColors: ReadonlySet<number>,
  draftBrightCells: Uint8Array,
): Uint8Array {
  const attributeRows = ZX_SCREEN_HEIGHT / cellHeight;
  const attributes = new Uint8Array(ZX_ATTRIBUTE_COLUMNS * attributeRows);
  for (let cellY = 0; cellY < attributeRows; cellY += 1) {
    for (let cellX = 0; cellX < ZX_ATTRIBUTE_COLUMNS; cellX += 1) {
      const cellOffset = cellY * ZX_ATTRIBUTE_COLUMNS + cellX;
      const draftBright = (draftBrightCells[cellOffset] ?? 0) === 1;
      let bestScore = Number.POSITIVE_INFINITY;
      let bestAttribute = 0;
      for (let attribute = 0; attribute < 128; attribute += 1) {
        if (!attributeAllowed(attribute, settings, level, draftBright, enabledColors)) continue;
        const bright = (attribute & 0x40) !== 0;
        const ink = zxColor(attribute & 7, bright);
        const paper = zxColor((attribute >> 3) & 7, bright);
        let score = 0;
        for (let localY = 0; localY < cellHeight; localY += 1) {
          for (let localX = 0; localX < CELL_WIDTH; localX += 1) {
            const x = cellX * CELL_WIDTH + localX;
            const y = cellY * cellHeight + localY;
            const offset = (y * ZX_SCREEN_WIDTH + x) * 4;
            score += Math.min(
              squaredDistance(
                source[offset] ?? 0,
                source[offset + 1] ?? 0,
                source[offset + 2] ?? 0,
                ink,
              ),
              squaredDistance(
                source[offset] ?? 0,
                source[offset + 1] ?? 0,
                source[offset + 2] ?? 0,
                paper,
              ),
            );
          }
        }
        if (score < bestScore) {
          bestScore = score;
          bestAttribute = attribute;
        }
      }
      attributes[cellOffset] = bestAttribute;
    }
  }
  return attributes;
}

function selectLocalPalettePairs(
  source: Uint8Array,
  cellHeight: AttributeHeight,
  settings: ConversionSettings,
  level: OptimizationLevel,
  enabledColors: ReadonlySet<number>,
  draftBrightCells: Uint8Array,
): Uint8Array {
  const localAttributes = new Uint8Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT);
  for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
    for (let x = 0; x < ZX_SCREEN_WIDTH; x += 1) {
      const sourceOffset = (y * ZX_SCREEN_WIDTH + x) * 4;
      const sourceR = source[sourceOffset] ?? 0;
      const sourceG = source[sourceOffset + 1] ?? 0;
      const sourceB = source[sourceOffset + 2] ?? 0;
      const sample = settings.dithering === "error-diffusion"
        ? errorDiffusionSelectionSample(sourceR, sourceG, sourceB)
        : [sourceR, sourceG, sourceB] as const;
      const cellOffset =
        Math.floor(y / cellHeight) * ZX_ATTRIBUTE_COLUMNS +
        Math.floor(x / CELL_WIDTH);
      const draftBright = (draftBrightCells[cellOffset] ?? 0) === 1;
      let bestScore = Number.POSITIVE_INFINITY;
      let bestAttribute = 0;
      for (let attribute = 0; attribute < 128; attribute += 1) {
        if (!attributeAllowed(attribute, settings, level, draftBright, enabledColors)) continue;
        const bright = (attribute & 0x40) !== 0;
        const score = projectedLineDistanceScore(
          sample[0],
          sample[1],
          sample[2],
          zxColor(attribute & 7, bright),
          zxColor((attribute >> 3) & 7, bright),
        );
        if (score < bestScore) {
          bestScore = score;
          bestAttribute = attribute;
        }
      }
      localAttributes[y * ZX_SCREEN_WIDTH + x] = bestAttribute;
    }
  }
  return localAttributes;
}

function renderLocalErrorDiffusion(
  source: Uint8Array,
  localAttributes: Uint8Array | null,
  amount: number,
  randomization: number,
  enabledColors: ReadonlySet<number>,
  brightMode: BrightMode,
  engineId: ConversionSettings["ditherEngineId"],
  lineSuppression: number,
): Uint8Array {
  const colorKeys = new Uint8Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT);
  const decorrelated = engineId === "error-diffusion-decorrelated-v3";
  const atkinson = engineId === "error-diffusion-atkinson-v1";
  const riemersma = engineId === "error-diffusion-riemersma-v1";
  const checkerPlacementV31 = engineId === "error-diffusion-phase-balanced-checker-v3-1";
  const checkerPlacementV32 = engineId === "error-diffusion-phase-balanced-checker-v3-2";
  const checkerPlacementV33 = engineId === "error-diffusion-phase-balanced-checker-v3-3";
  const phaseBalanced = engineId === "error-diffusion-phase-balanced-v3" ||
    checkerPlacementV31 || checkerPlacementV32 || checkerPlacementV33;
  const checkerPhase = engineId === "error-diffusion-checker-phase-v4";
  const checkerPhaseV41 = engineId === "error-diffusion-checker-phase-v4-1";
  const checkerPhaseV42 = engineId === "error-diffusion-checker-phase-v4-2";
  const checkerPhaseV43 = engineId === "error-diffusion-checker-phase-v4-3";
  const checkerPhaseV5 = engineId === "error-diffusion-checker-phase-v5";
  const matrixGuided = engineId === "error-diffusion-matrix-guided-v1";
  const unrestrictedBrightValues = brightMode === "on"
    ? [true] as const
    : brightMode === "off" ? [false] as const : [false, true] as const;
  if (riemersma) {
    const errorQueue = Array.from({ length: 16 }, () => [0, 0, 0]);
    const queueWeights = [16, 8, 4, 2, 1] as const;
    for (const [x, y] of hilbertTraversal(ZX_SCREEN_WIDTH, ZX_SCREEN_HEIGHT)) {
      const pixelOffset = y * ZX_SCREEN_WIDTH + x;
      const sourceOffset = pixelOffset * 4;
      const attribute = localAttributes?.[pixelOffset];
      const adjusted = [0, 0, 0];
      for (let channel = 0; channel < 3; channel += 1) {
        let accumulated = 0;
        for (let index = 0; index < queueWeights.length; index += 1) {
          accumulated += (errorQueue[index]?.[channel] ?? 0) *
            (queueWeights[index] ?? 0);
        }
        adjusted[channel] = Math.max(0, Math.min(
          255,
          (source[sourceOffset + channel] ?? 0) +
            Math.trunc(accumulated * amount / (31 * 100)) +
            diffusionNoiseOffset(x, y, channel, randomization, 8),
        ));
      }
      const brightValues = attribute === undefined
        ? unrestrictedBrightValues
        : [(attribute & 0x40) !== 0];
      let outputCode = 0;
      let outputBright = brightValues[0] ?? false;
      let output = zxColor(0, outputBright);
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const bright of brightValues) {
        for (let code = 0; code < 8; code += 1) {
          if (!enabledColors.has(code)) continue;
          const candidate = zxColor(code, bright);
          const distance = squaredDistance(
            adjusted[0] ?? 0, adjusted[1] ?? 0, adjusted[2] ?? 0, candidate,
          );
          if (distance < bestDistance) {
            bestDistance = distance;
            outputCode = code;
            outputBright = bright;
            output = candidate;
          }
        }
      }
      colorKeys[pixelOffset] = outputCode + (outputBright ? 8 : 0);
      errorQueue.pop();
      errorQueue.unshift([
        (adjusted[0] ?? 0) - output.r,
        (adjusted[1] ?? 0) - output.g,
        (adjusted[2] ?? 0) - output.b,
      ]);
    }
    return colorKeys;
  }
  const errors = new Float32Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT * 3);
  const previousRowKeys = new Uint8Array(ZX_SCREEN_WIDTH);
  previousRowKeys.fill(255);
  const verticalRunLengths = new Uint8Array(ZX_SCREEN_WIDTH);
  const recentColumnKeys = new Uint8Array(ZX_SCREEN_WIDTH * 4);
  recentColumnKeys.fill(255);
  const diffusionScale = Math.fround(
    amount / (decorrelated ? 4_200 : atkinson ? 800 : ERROR_SCALE),
  );
  const maximumNoise = decorrelated ? 24 : 8;
  for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
    const direction = y % 2 === 1 ? 1 : -1;
    for (let step = 0; step < ZX_SCREEN_WIDTH; step += 1) {
      const x = direction === 1 ? step : ZX_SCREEN_WIDTH - 1 - step;
      const pixelOffset = y * ZX_SCREEN_WIDTH + x;
      const sourceOffset = pixelOffset * 4;
      const attribute = localAttributes?.[pixelOffset];
      const errorOffset = pixelOffset * 3;
      const adjustedR = Math.max(0, Math.min(
        255,
        (source[sourceOffset] ?? 0) +
          Math.trunc(errors[errorOffset] ?? 0) +
          diffusionNoiseOffset(x, y, 0, randomization, maximumNoise),
      ));
      const adjustedG = Math.max(0, Math.min(
        255,
        (source[sourceOffset + 1] ?? 0) +
          Math.trunc(errors[errorOffset + 1] ?? 0) +
          diffusionNoiseOffset(x, y, 1, randomization, maximumNoise),
      ));
      const adjustedB = Math.max(0, Math.min(
        255,
        (source[sourceOffset + 2] ?? 0) +
          Math.trunc(errors[errorOffset + 2] ?? 0) +
          diffusionNoiseOffset(x, y, 2, randomization, maximumNoise),
      ));
      const brightValues = attribute === undefined
        ? unrestrictedBrightValues
        : [(attribute & 0x40) !== 0];
      let outputCode = 0;
      let outputBright = brightValues[0] ?? false;
      let output = zxColor(0, outputBright);
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const bright of brightValues) {
        for (let code = 0; code < 8; code += 1) {
          if (!enabledColors.has(code)) continue;
          const candidate = zxColor(code, bright);
          const distance = squaredDistance(adjustedR, adjustedG, adjustedB, candidate);
          if (distance < bestDistance) {
            bestDistance = distance;
            outputCode = code;
            outputBright = bright;
            output = candidate;
          }
        }
      }
      const brightKey = outputBright ? 8 : 0;
      colorKeys[pixelOffset] = brightKey + outputCode;
      const outputKey = brightKey + outputCode;
      let columnBias = 0;
      for (let history = 0; history < 4; history += 1) {
        if (recentColumnKeys[x * 4 + history] === outputKey) columnBias += 1;
      }
      for (let history = 3; history > 0; history -= 1) {
        recentColumnKeys[x * 4 + history] = recentColumnKeys[x * 4 + history - 1] ?? 255;
      }
      recentColumnKeys[x * 4] = outputKey;
      verticalRunLengths[x] = previousRowKeys[x] === outputKey
        ? Math.min(255, (verticalRunLengths[x] ?? 0) + 1)
        : 1;
      previousRowKeys[x] = outputKey;
      let smoothSource = true;
      if ((phaseBalanced || checkerPhaseV5 || checkerPhaseV42 || checkerPhaseV43 || matrixGuided) && lineSuppression > 0) {
        for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
          if (nx < 0 || nx >= ZX_SCREEN_WIDTH || ny < 0 || ny >= ZX_SCREEN_HEIGHT) continue;
          const neighborSource = (ny * ZX_SCREEN_WIDTH + nx) * 4;
          for (let channel = 0; channel < 3; channel += 1) {
            if (Math.abs(
              (source[sourceOffset + channel] ?? 0) -
              (source[neighborSource + channel] ?? 0)
            ) > 48) smoothSource = false;
          }
        }
      }
      const channelErrors = [
        Math.fround(diffusionScale * (adjustedR - output.r)),
        Math.fround(diffusionScale * (adjustedG - output.g)),
        Math.fround(diffusionScale * (adjustedB - output.b)),
      ] as const;
      const neighbors = decorrelated
        ? decorrelatedDiffusionKernel(direction).map(
            ([dx, dy, weight]) => [x + dx, y + dy, weight] as const,
          )
        : atkinson
          ? atkinsonDiffusionKernel(direction).map(
              ([dx, dy, weight]) => [x + dx, y + dy, weight] as const,
            )
          : checkerPhaseV5 || matrixGuided
            ? checkerPhaseV5DiffusionKernel(
                direction,
                x,
                y,
                lineSuppression,
                smoothSource ? verticalRunLengths[x] ?? 0 : 0,
                Math.min(x % CELL_WIDTH, CELL_WIDTH - 1 - (x % CELL_WIDTH)),
              ).map(([dx, dy, weight]) => [x + dx, y + dy, weight] as const)
          : checkerPhase || checkerPhaseV41
            ? checkerPhaseDiffusionKernel(
                direction,
                x,
                y,
                lineSuppression,
                smoothSource ? verticalRunLengths[x] ?? 0 : 0,
              ).map(([dx, dy, weight]) => [x + dx, y + dy, weight] as const)
          : checkerPhaseV42
            ? checkerPhaseV42DiffusionKernel(
                direction,
                x,
                y,
                lineSuppression,
                smoothSource ? verticalRunLengths[x] ?? 0 : 0,
                smoothSource ? columnBias : 0,
              ).map(([dx, dy, weight]) => [x + dx, y + dy, weight] as const)
          : checkerPhaseV43
            ? checkerPhaseV43DiffusionKernel(
                direction,
                x,
                y,
                lineSuppression,
                smoothSource ? verticalRunLengths[x] ?? 0 : 0,
              ).map(([dx, dy, weight]) => [x + dx, y + dy, weight] as const)
          : phaseBalanced
          ? phaseBalancedDiffusionKernel(
              direction,
              x,
              y,
              lineSuppression,
              smoothSource ? verticalRunLengths[x] ?? 0 : 0,
            ).map(
              ([dx, dy, weight]) => [x + dx, y + dy, weight] as const,
            )
        : [
            [x + direction, y, 7],
            [x - direction, y + 1, 3],
            [x, y + 1, 5],
            [x + direction, y + 1, 1],
          ] as const;
      for (const [nx, ny, weight] of neighbors) {
        if (nx < 0 || nx >= ZX_SCREEN_WIDTH || ny < 0 || ny >= ZX_SCREEN_HEIGHT) continue;
        const neighborOffset = (ny * ZX_SCREEN_WIDTH + nx) * 3;
        for (let channel = 0; channel < 3; channel += 1) {
          errors[neighborOffset + channel] = Math.fround(
            (errors[neighborOffset + channel] ?? 0) +
            Math.fround((channelErrors[channel] ?? 0) * weight),
          );
        }
      }
    }
  }
  return colorKeys;
}

function renderCheckerPlacementV32(
  source: Uint8Array,
  basePixels: Uint8Array,
  attributes: Uint8Array,
  cellHeight: AttributeHeight,
  amount: number,
  randomization: number,
  lineSuppression: number,
): { readonly pixels: Uint8Array; readonly plan: ReturnType<typeof planCheckerPlacement> | null } {
  if (lineSuppression <= 0) return { pixels: basePixels, plan: null };
  const placement = planCheckerPlacement(
    source,
    basePixels,
    ZX_SCREEN_WIDTH,
    ZX_SCREEN_HEIGHT,
    lineSuppression / 100,
    (x, y) => {
      const attribute = attributes[
        Math.floor(y / cellHeight) * ZX_ATTRIBUTE_COLUMNS + Math.floor(x / CELL_WIDTH)
      ] ?? 0;
      const colors = decodeAttribute(attribute);
      return { paper: colors.paper, ink: colors.ink, key: attribute };
    },
    CELL_WIDTH,
    cellHeight,
  );
  if (placement.changedBlocks === 0) return { pixels: basePixels, plan: placement };

  const pixels = basePixels.slice();
  const errors = new Float32Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT * 3);
  const verticalRunLengths = new Uint8Array(ZX_SCREEN_WIDTH);
  const previousRowKeys = new Uint8Array(ZX_SCREEN_WIDTH);
  previousRowKeys.fill(255);
  const diffusionScale = Math.fround(amount / ERROR_SCALE);
  const isChangedBlock = (x: number, y: number): boolean => {
    const left = x & ~1;
    const top = y & ~1;
    if (left + 1 >= ZX_SCREEN_WIDTH || top + 1 >= ZX_SCREEN_HEIGHT) return false;
    const blockIndex = Math.floor(top / 2) * placement.blockColumns + Math.floor(left / 2);
    const mask = placement.masks[blockIndex];
    if (mask === undefined || mask === 255) return false;
    const baseMask =
      (basePixels[top * ZX_SCREEN_WIDTH + left] ?? 0) |
      ((basePixels[top * ZX_SCREEN_WIDTH + left + 1] ?? 0) << 1) |
      ((basePixels[(top + 1) * ZX_SCREEN_WIDTH + left] ?? 0) << 2) |
      ((basePixels[(top + 1) * ZX_SCREEN_WIDTH + left + 1] ?? 0) << 3);
    return mask !== baseMask;
  };
  const plannedBit = (x: number, y: number): number => {
    const left = x & ~1;
    const top = y & ~1;
    const blockIndex = Math.floor(top / 2) * placement.blockColumns + Math.floor(left / 2);
    const mask = placement.masks[blockIndex] ?? 255;
    return mask === 255 ? basePixels[y * ZX_SCREEN_WIDTH + x] ?? 0 :
      (mask >> ((y - top) * 2 + x - left)) & 1;
  };
  const isSmoothSource = (x: number, y: number): boolean => {
    const center = (y * ZX_SCREEN_WIDTH + x) * 4;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
      if (nx < 0 || nx >= ZX_SCREEN_WIDTH || ny < 0 || ny >= ZX_SCREEN_HEIGHT) continue;
      const neighbor = (ny * ZX_SCREEN_WIDTH + nx) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        if (Math.abs((source[center + channel] ?? 0) - (source[neighbor + channel] ?? 0)) > 48) {
          return false;
        }
      }
    }
    return true;
  };

  for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
    const direction = y % 2 === 1 ? 1 : -1;
    for (let step = 0; step < ZX_SCREEN_WIDTH; step += 1) {
      const x = direction === 1 ? step : ZX_SCREEN_WIDTH - 1 - step;
      const pixel = y * ZX_SCREEN_WIDTH + x;
      const sourceOffset = pixel * 4;
      const errorOffset = pixel * 3;
      const adjustedR = Math.max(0, Math.min(
        255,
        (source[sourceOffset] ?? 0) + Math.trunc(errors[errorOffset] ?? 0) +
          diffusionNoiseOffset(x, y, 0, randomization, 8),
      ));
      const adjustedG = Math.max(0, Math.min(
        255,
        (source[sourceOffset + 1] ?? 0) + Math.trunc(errors[errorOffset + 1] ?? 0) +
          diffusionNoiseOffset(x, y, 1, randomization, 8),
      ));
      const adjustedB = Math.max(0, Math.min(
        255,
        (source[sourceOffset + 2] ?? 0) + Math.trunc(errors[errorOffset + 2] ?? 0) +
          diffusionNoiseOffset(x, y, 2, randomization, 8),
      ));
      const attribute = attributes[
        Math.floor(y / cellHeight) * ZX_ATTRIBUTE_COLUMNS + Math.floor(x / CELL_WIDTH)
      ] ?? 0;
      const { ink, paper } = decodeAttribute(attribute);
      const decision = isChangedBlock(x, y)
        ? plannedBit(x, y)
        : basePixels[pixel] ?? 0;
      pixels[pixel] = decision;
      const output = decision === 1 ? ink : paper;
      const channelErrors = [
        Math.fround(diffusionScale * (adjustedR - output.r)),
        Math.fround(diffusionScale * (adjustedG - output.g)),
        Math.fround(diffusionScale * (adjustedB - output.b)),
      ] as const;
      const outputKey = attribute * 2 + decision;
      verticalRunLengths[x] = previousRowKeys[x] === outputKey
        ? Math.min(255, (verticalRunLengths[x] ?? 0) + 1)
        : 1;
      previousRowKeys[x] = outputKey;
      const neighbors = phaseBalancedDiffusionKernel(
        direction,
        x,
        y,
        lineSuppression,
        isSmoothSource(x, y) ? verticalRunLengths[x] ?? 0 : 0,
      );
      for (const [dx, dy, weight] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= ZX_SCREEN_WIDTH || ny < 0 || ny >= ZX_SCREEN_HEIGHT) continue;
        const neighborOffset = (ny * ZX_SCREEN_WIDTH + nx) * 3;
        for (let channel = 0; channel < 3; channel += 1) {
          errors[neighborOffset + channel] = Math.fround(
            (errors[neighborOffset + channel] ?? 0) +
              Math.fround((channelErrors[channel] ?? 0) * weight),
          );
        }
      }
    }
  }
  return { pixels, plan: placement };
}

function renderCheckerPlacementV33(
  source: Uint8Array,
  basePixels: Uint8Array,
  attributes: Uint8Array,
  cellHeight: AttributeHeight,
  amount: number,
  randomization: number,
  lineSuppression: number,
): { readonly pixels: Uint8Array; readonly plan: ReturnType<typeof planCheckerOnlyPlacementV33> | null } {
  const checkerStrength = checkerPlacementStrengthV33(lineSuppression);
  if (checkerStrength <= 0) return { pixels: basePixels, plan: null };
  const placement = planCheckerOnlyPlacementV33(
    source,
    basePixels,
    ZX_SCREEN_WIDTH,
    ZX_SCREEN_HEIGHT,
    checkerStrength,
    (x, y) => {
      const attribute = attributes[
        Math.floor(y / cellHeight) * ZX_ATTRIBUTE_COLUMNS + Math.floor(x / CELL_WIDTH)
      ] ?? 0;
      const colors = decodeAttribute(attribute);
      return { paper: colors.paper, ink: colors.ink, key: attribute };
    },
    CELL_WIDTH,
    cellHeight,
  );
  if (placement.changedBlocks === 0) return { pixels: basePixels, plan: placement };

  // Re-run the v3 propagation pass with the accepted block decisions so the
  // phase choice participates in subsequent error propagation. Unchanged
  // pixels continue to use the original v3 decision exactly.
  const pixels = basePixels.slice();
  const errors = new Float32Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT * 3);
  const verticalRunLengths = new Uint8Array(ZX_SCREEN_WIDTH);
  const previousRowKeys = new Uint8Array(ZX_SCREEN_WIDTH);
  previousRowKeys.fill(255);
  const diffusionScale = Math.fround(amount / ERROR_SCALE);
  const isChangedBlock = (x: number, y: number): boolean => {
    const left = x & ~1;
    const top = y & ~1;
    if (left + 1 >= ZX_SCREEN_WIDTH || top + 1 >= ZX_SCREEN_HEIGHT) return false;
    const blockIndex = Math.floor(top / 2) * placement.blockColumns + Math.floor(left / 2);
    const mask = placement.masks[blockIndex];
    if (mask === undefined || mask === 255) return false;
    const baseMask =
      (basePixels[top * ZX_SCREEN_WIDTH + left] ?? 0) |
      ((basePixels[top * ZX_SCREEN_WIDTH + left + 1] ?? 0) << 1) |
      ((basePixels[(top + 1) * ZX_SCREEN_WIDTH + left] ?? 0) << 2) |
      ((basePixels[(top + 1) * ZX_SCREEN_WIDTH + left + 1] ?? 0) << 3);
    return mask !== baseMask;
  };
  const plannedBit = (x: number, y: number): number => {
    const left = x & ~1;
    const top = y & ~1;
    const blockIndex = Math.floor(top / 2) * placement.blockColumns + Math.floor(left / 2);
    const mask = placement.masks[blockIndex] ?? 255;
    return mask === 255 ? basePixels[y * ZX_SCREEN_WIDTH + x] ?? 0 :
      (mask >> ((y - top) * 2 + x - left)) & 1;
  };
  const isSmoothSource = (x: number, y: number): boolean => {
    const center = (y * ZX_SCREEN_WIDTH + x) * 4;
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
      if (nx < 0 || nx >= ZX_SCREEN_WIDTH || ny < 0 || ny >= ZX_SCREEN_HEIGHT) continue;
      const neighbor = (ny * ZX_SCREEN_WIDTH + nx) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        if (Math.abs((source[center + channel] ?? 0) - (source[neighbor + channel] ?? 0)) > 48) return false;
      }
    }
    return true;
  };

  for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
    const direction = y % 2 === 1 ? 1 : -1;
    for (let step = 0; step < ZX_SCREEN_WIDTH; step += 1) {
      const x = direction === 1 ? step : ZX_SCREEN_WIDTH - 1 - step;
      const pixel = y * ZX_SCREEN_WIDTH + x;
      const sourceOffset = pixel * 4;
      const errorOffset = pixel * 3;
      const adjustedR = Math.max(0, Math.min(255, (source[sourceOffset] ?? 0) + Math.trunc(errors[errorOffset] ?? 0) + diffusionNoiseOffset(x, y, 0, randomization, 8)));
      const adjustedG = Math.max(0, Math.min(255, (source[sourceOffset + 1] ?? 0) + Math.trunc(errors[errorOffset + 1] ?? 0) + diffusionNoiseOffset(x, y, 1, randomization, 8)));
      const adjustedB = Math.max(0, Math.min(255, (source[sourceOffset + 2] ?? 0) + Math.trunc(errors[errorOffset + 2] ?? 0) + diffusionNoiseOffset(x, y, 2, randomization, 8)));
      const attribute = attributes[Math.floor(y / cellHeight) * ZX_ATTRIBUTE_COLUMNS + Math.floor(x / CELL_WIDTH)] ?? 0;
      const { ink, paper } = decodeAttribute(attribute);
      const decision = isChangedBlock(x, y) ? plannedBit(x, y) : basePixels[pixel] ?? 0;
      pixels[pixel] = decision;
      const output = decision === 1 ? ink : paper;
      const channelErrors = [
        Math.fround(diffusionScale * (adjustedR - output.r)),
        Math.fround(diffusionScale * (adjustedG - output.g)),
        Math.fround(diffusionScale * (adjustedB - output.b)),
      ] as const;
      const outputKey = attribute * 2 + decision;
      verticalRunLengths[x] = previousRowKeys[x] === outputKey ? Math.min(255, (verticalRunLengths[x] ?? 0) + 1) : 1;
      previousRowKeys[x] = outputKey;
      const neighbors = phaseBalancedDiffusionKernel(
        direction,
        x,
        y,
        lineSuppression,
        isSmoothSource(x, y) ? verticalRunLengths[x] ?? 0 : 0,
      );
      for (const [dx, dy, weight] of neighbors) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= ZX_SCREEN_WIDTH || ny < 0 || ny >= ZX_SCREEN_HEIGHT) continue;
        const neighborOffset = (ny * ZX_SCREEN_WIDTH + nx) * 3;
        for (let channel = 0; channel < 3; channel += 1) {
          errors[neighborOffset + channel] = Math.fround(
            (errors[neighborOffset + channel] ?? 0) + Math.fround((channelErrors[channel] ?? 0) * weight),
          );
        }
      }
    }
  }
  return { pixels, plan: placement };
}

function renderLocalOrderedDither(
  source: Uint8Array,
  localAttributes: Uint8Array | null,
  matrix: (typeof ORDERED_MATRICES)[keyof typeof ORDERED_MATRICES],
  amount: number,
  enabledColors: ReadonlySet<number>,
  brightMode: BrightMode,
): Uint8Array {
  const colorKeys = new Uint8Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT);
  const levels = matrix.levels;
  const levelTable = new Int16Array(2 * 8 * (levels + 1) * 3);
  const levelOffset = (
    bright: boolean,
    code: number,
    level: number,
    channel: number,
  ): number => ((((bright ? 1 : 0) * 8 + code) * (levels + 1) + level) * 3 + channel);
  const base = Math.floor((100 - amount) * 64 / 100);
  for (const bright of [false, true]) {
    for (let code = 0; code < 8; code += 1) {
      const color = zxColor(code, bright);
      for (let level = 0; level <= levels; level += 1) {
        for (const [channel, value] of [color.r, color.g, color.b].entries()) {
          levelTable[levelOffset(bright, code, level, channel)] =
            Math.floor(Math.floor(level * value / levels) * amount / 100) + base;
        }
      }
    }
  }
  const candidateSets = [false, true].map((bright) => {
    const red = new Int16Array(8 * 8 * levels);
    const green = new Int16Array(8 * 8 * levels);
    const blue = new Int16Array(8 * 8 * levels);
    const first = new Uint8Array(8 * 8 * levels);
    const second = new Uint8Array(8 * 8 * levels);
    const pattern = new Uint8Array(8 * 8 * levels);
    const seen = new Set<number>();
    let count = 0;
    for (const candidateFirst of enabledColors) {
      for (const candidateSecond of enabledColors) {
        for (let level = 0; level < levels; level += 1) {
          const inverseLevel = levels - level;
          const mixedR =
            (levelTable[levelOffset(bright, candidateFirst, inverseLevel, 0)] ?? 0) +
            (levelTable[levelOffset(bright, candidateSecond, level, 0)] ?? 0);
          const mixedG =
            (levelTable[levelOffset(bright, candidateFirst, inverseLevel, 1)] ?? 0) +
            (levelTable[levelOffset(bright, candidateSecond, level, 1)] ?? 0);
          const mixedB =
            (levelTable[levelOffset(bright, candidateFirst, inverseLevel, 2)] ?? 0) +
            (levelTable[levelOffset(bright, candidateSecond, level, 2)] ?? 0);
          const key = mixedR | (mixedG << 9) | (mixedB << 18);
          if (seen.has(key)) continue;
          seen.add(key);
          red[count] = mixedR;
          green[count] = mixedG;
          blue[count] = mixedB;
          first[count] = candidateFirst;
          second[count] = candidateSecond;
          pattern[count] = level;
          count += 1;
        }
      }
    }
    return { red, green, blue, first, second, pattern, count };
  });
  const unrestrictedBrightValues = brightMode === "on"
    ? [true] as const
    : brightMode === "off" ? [false] as const : [false, true] as const;
  for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
    for (let x = 0; x < ZX_SCREEN_WIDTH; x += 1) {
      const pixelOffset = y * ZX_SCREEN_WIDTH + x;
      const sourceOffset = pixelOffset * 4;
      const attribute = localAttributes?.[pixelOffset];
      const brightValues = attribute === undefined
        ? unrestrictedBrightValues
        : [(attribute & 0x40) !== 0];
      const sourceR = source[sourceOffset] ?? 0;
      const sourceG = source[sourceOffset + 1] ?? 0;
      const sourceB = source[sourceOffset + 2] ?? 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      let bestBright = brightValues[0] ?? false;
      let firstCode = 0;
      let secondCode = 0;
      let patternLevel = 0;
      for (const bright of brightValues) {
        const candidates = candidateSets[bright ? 1 : 0]!;
        for (let candidate = 0; candidate < candidates.count; candidate += 1) {
          const dr = sourceR - (candidates.red[candidate] ?? 0);
          const dg = sourceG - (candidates.green[candidate] ?? 0);
          const db = sourceB - (candidates.blue[candidate] ?? 0);
          const distance = dr * dr + dg * dg + db * db;
          if (distance < bestDistance) {
            bestDistance = distance;
            bestBright = bright;
            firstCode = candidates.first[candidate] ?? 0;
            secondCode = candidates.second[candidate] ?? 0;
            patternLevel = candidates.pattern[candidate] ?? 0;
          }
        }
      }
      const oneBasedPattern = orderedThreshold(matrix, x, y) + 1;
      const outputCode = oneBasedPattern > patternLevel ? firstCode : secondCode;
      colorKeys[pixelOffset] = (bestBright ? 8 : 0) + outputCode;
    }
  }
  return colorKeys;
}

function renderCoverageNormalizedOrderedDither(
  source: Uint8Array,
  matrix: (typeof ORDERED_MATRICES)[keyof typeof ORDERED_MATRICES],
  amount: number,
  enabledColors: ReadonlySet<number>,
  brightMode: BrightMode,
): Uint8Array {
  const colorKeys = new Uint8Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT);
  const brightValues = brightMode === "on"
    ? [true] as const
    : brightMode === "off" ? [false] as const : [false, true] as const;
  const scale = 128 * amount / 100;
  for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
    for (let x = 0; x < ZX_SCREEN_WIDTH; x += 1) {
      const pixel = y * ZX_SCREEN_WIDTH + x;
      const offset = pixel * 4;
      const perturbation = normalizedOrderedOffset(matrix, x, y) * scale;
      const r = Math.max(0, Math.min(255, (source[offset] ?? 0) + perturbation));
      const g = Math.max(0, Math.min(255, (source[offset + 1] ?? 0) + perturbation));
      const b = Math.max(0, Math.min(255, (source[offset + 2] ?? 0) + perturbation));
      let bestKey = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (const bright of brightValues) {
        for (const code of enabledColors) {
          const color = zxColor(code, bright);
          const dr = r - color.r;
          const dg = g - color.g;
          const db = b - color.b;
          const distance = dr * dr + dg * dg + db * db;
          const key = code + (bright ? 8 : 0);
          if (distance < bestDistance || distance === bestDistance && key < bestKey) {
            bestDistance = distance;
            bestKey = key;
          }
        }
      }
      colorKeys[pixel] = bestKey;
    }
  }
  return colorKeys;
}

function colorKeyMatches(key: number, code: number, bright: boolean): boolean {
  if ((key & 7) !== code) return false;
  return code === 0 || (key >= 8) === bright;
}

function renderGuideRgba(keys: Uint8Array): Uint8Array {
  const rgba = new Uint8Array(keys.length * 4);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index] ?? 0;
    const color = zxColor(key & 7, key >= 8);
    const offset = index * 4;
    rgba[offset] = color.r;
    rgba[offset + 1] = color.g;
    rgba[offset + 2] = color.b;
    rgba[offset + 3] = 255;
  }
  return rgba;
}

function nearestGuideKeys(
  source: Uint8Array,
  settings: ConversionSettings,
): Uint8Array {
  const keys = new Uint8Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT);
  const brightValues = zxBrightMode(settings) === "on"
    ? [true]
    : zxBrightMode(settings) === "off" ? [false] : [false, true];
  for (let pixel = 0; pixel < keys.length; pixel += 1) {
    const offset = pixel * 4;
    let bestDistance = Number.POSITIVE_INFINITY;
    let bestKey = 0;
    for (const bright of brightValues) {
      for (const code of paletteSelection(settings, 0).enabledColorIds) {
        const color = zxColor(code, bright);
        const distance = squaredDistance(
          source[offset] ?? 0,
          source[offset + 1] ?? 0,
          source[offset + 2] ?? 0,
          color,
        );
        if (distance < bestDistance) {
          bestDistance = distance;
          bestKey = code + (bright ? 8 : 0);
        }
      }
    }
    keys[pixel] = bestKey;
  }
  return keys;
}

interface WeightedGuideSample {
  readonly key: number;
  readonly weight: number;
  readonly x: number;
  readonly y: number;
}

function harmonicRadiusWeight(distance: number, radius: number): number {
  if (distance === 0 || radius === 0) return 1;
  let normalization = 0;
  for (let step = 1; step <= radius; step += 1) normalization += 1 / step;
  return (1 / distance) / normalization;
}

function attributeHaloSamples(
  source: Uint8Array,
  guideKeys: Uint8Array,
  cellX: number,
  cellY: number,
  cellHeight: AttributeHeight,
  settings: ConversionSettings,
): readonly WeightedGuideSample[] {
  const haloV2 =
    settings.attributeOptimizerId === "zx-guide-reference-halo-v2" ||
    settings.attributeOptimizerId === "zx-guide-reference-rgb-halo-v3" ||
    settings.attributeOptimizerId === "zx-block-dbs-global-v1";
  const influence = haloV2
    ? settings.attributeHaloInfluence
    : settings.attributeSmoothing;
  if (influence === 0) return [];
  const horizontalRadius = settings.attributeHaloHorizontal;
  const verticalRadius = cellHeight >= 4 ? settings.attributeHaloVertical : 0;
  if (horizontalRadius === 0 && verticalRadius === 0) return [];

  const samples: WeightedGuideSample[] = [];
  const cellLeft = cellX * CELL_WIDTH;
  const cellTop = cellY * cellHeight;
  const cellRight = cellLeft + CELL_WIDTH - 1;
  const cellBottom = cellTop + cellHeight - 1;
  const smoothingScale = influence / 100;
  let totalWeight = 0;
  for (let y = cellTop - verticalRadius; y <= cellBottom + verticalRadius; y += 1) {
    for (let x = cellLeft - horizontalRadius; x <= cellRight + horizontalRadius; x += 1) {
      if (
        x < 0 || x >= ZX_SCREEN_WIDTH ||
        y < 0 || y >= ZX_SCREEN_HEIGHT ||
        (x >= cellLeft && x <= cellRight && y >= cellTop && y <= cellBottom)
      ) continue;
      const nearestX = Math.max(cellLeft, Math.min(cellRight, x));
      const nearestY = Math.max(cellTop, Math.min(cellBottom, y));
      const horizontalDistance = Math.abs(x - nearestX);
      const verticalDistance = Math.abs(y - nearestY);
      const haloKey = guideKeys[y * ZX_SCREEN_WIDTH + x] ?? 0;
      const edgeKey = guideKeys[nearestY * ZX_SCREEN_WIDTH + nearestX] ?? 0;
      let similarity: number;
      let edgeProtection = 1;
      if (haloV2) {
        const haloColor = zxColor(haloKey & 7, (haloKey & 8) !== 0);
        const edgeColor = zxColor(edgeKey & 7, (edgeKey & 8) !== 0);
        const paletteDistance = squaredDistance(
          haloColor.r, haloColor.g, haloColor.b, edgeColor,
        );
        similarity = Math.max(0, 1 - paletteDistance / (3 * 255 * 255));
        const haloOffset = (y * ZX_SCREEN_WIDTH + x) * 4;
        const edgeOffset = (nearestY * ZX_SCREEN_WIDTH + nearestX) * 4;
        const sourceDistance =
          ((source[haloOffset] ?? 0) - (source[edgeOffset] ?? 0)) ** 2 +
          ((source[haloOffset + 1] ?? 0) - (source[edgeOffset + 1] ?? 0)) ** 2 +
          ((source[haloOffset + 2] ?? 0) - (source[edgeOffset + 2] ?? 0)) ** 2;
        edgeProtection = Math.max(0, 1 - sourceDistance / (3 * 128 * 128));
      } else {
        const differingChannels =
          (((haloKey ^ edgeKey) & 1) !== 0 ? 1 : 0) +
          (((haloKey ^ edgeKey) & 2) !== 0 ? 1 : 0) +
          (((haloKey ^ edgeKey) & 4) !== 0 ? 1 : 0);
        similarity = (3 - differingChannels) / 3;
      }
      const spatialWeight =
        harmonicRadiusWeight(horizontalDistance, horizontalRadius) *
        harmonicRadiusWeight(verticalDistance, verticalRadius);
      const weight = smoothingScale * similarity * edgeProtection * spatialWeight;
      samples.push({
        key: haloKey,
        weight,
        x,
        y,
      });
      totalWeight += weight;
    }
  }
  if (haloV2) {
    const maximumWeight = CELL_WIDTH * cellHeight * 1.5;
    if (totalWeight > maximumWeight) {
      const scale = maximumWeight / totalWeight;
      return samples.map((sample) => ({
        ...sample,
        weight: sample.weight * scale,
      }));
    }
  }
  return samples;
}

function selectAttributesFromGuide(
  source: Uint8Array,
  guideKeys: Uint8Array,
  cellHeight: AttributeHeight,
  settings: ConversionSettings,
  level: OptimizationLevel,
  enabledColors: ReadonlySet<number>,
  draftBrightCells: Uint8Array,
  preferGuideEndpoints = false,
): Uint8Array {
  const attributeRows = ZX_SCREEN_HEIGHT / cellHeight;
  const attributes = new Uint8Array(ZX_ATTRIBUTE_COLUMNS * attributeRows);
  for (let cellY = 0; cellY < attributeRows; cellY += 1) {
    for (let cellX = 0; cellX < ZX_ATTRIBUTE_COLUMNS; cellX += 1) {
      const cellOffset = cellY * ZX_ATTRIBUTE_COLUMNS + cellX;
      const draftBright = (draftBrightCells[cellOffset] ?? 0) === 1;
      const haloSamples = attributeHaloSamples(
        source, guideKeys, cellX, cellY, cellHeight, settings,
      );
      let bestMismatchScore = Number.POSITIVE_INFINITY;
      let bestPaletteScore = Number.POSITIVE_INFINITY;
      let bestUnusedEndpoints = Number.POSITIVE_INFINITY;
      let bestRemapCost = Number.POSITIVE_INFINITY;
      let bestAttribute = 0;
      for (let attribute = 0; attribute < 128; attribute += 1) {
        if (!attributeAllowed(attribute, settings, level, draftBright, enabledColors)) continue;
        const inkCode = attribute & 7;
        const paperCode = (attribute >> 3) & 7;
        const bright = (attribute & 0x40) !== 0;
        const ink = zxColor(inkCode, bright);
        const paper = zxColor(paperCode, bright);
        const paletteScore = evaluatePaletteCandidate(
          source,
          cellX,
          cellY,
          cellHeight,
          ink,
          paper,
        );
        let mismatchScore = 0;
        let inkUsed = false;
        let paperUsed = false;
        let remapCost = 0;
        for (let localY = 0; localY < cellHeight; localY += 1) {
          for (let localX = 0; localX < CELL_WIDTH; localX += 1) {
            const x = cellX * CELL_WIDTH + localX;
            const y = cellY * cellHeight + localY;
            const pixelOffset = y * ZX_SCREEN_WIDTH + x;
            const key = guideKeys[pixelOffset] ?? 0;
            const matchesInk = colorKeyMatches(key, inkCode, bright);
            const matchesPaper = colorKeyMatches(key, paperCode, bright);
            inkUsed ||= matchesInk;
            paperUsed ||= matchesPaper;
            if (matchesInk || matchesPaper) continue;
            mismatchScore += 1;
            const sourceOffset = pixelOffset * 4;
            remapCost += Math.min(
              squaredDistance(
                source[sourceOffset] ?? 0,
                source[sourceOffset + 1] ?? 0,
                source[sourceOffset + 2] ?? 0,
                ink,
              ),
              squaredDistance(
                source[sourceOffset] ?? 0,
                source[sourceOffset + 1] ?? 0,
                source[sourceOffset + 2] ?? 0,
                paper,
              ),
            );
          }
        }
        for (const sample of haloSamples) {
          if (
            !colorKeyMatches(sample.key, inkCode, bright) &&
            !colorKeyMatches(sample.key, paperCode, bright)
          ) {
            mismatchScore += sample.weight;
          }
        }
        const unusedEndpoints =
          (inkUsed ? 0 : 1) +
          (paperCode === inkCode || paperUsed ? 0 : 1);
        if (
          mismatchScore < bestMismatchScore ||
          (
            mismatchScore === bestMismatchScore &&
            preferGuideEndpoints &&
            unusedEndpoints < bestUnusedEndpoints
          ) ||
          (
            mismatchScore === bestMismatchScore &&
            (!preferGuideEndpoints || unusedEndpoints === bestUnusedEndpoints) &&
            paletteScore < bestPaletteScore
          ) ||
          (
            mismatchScore === bestMismatchScore &&
            (!preferGuideEndpoints || unusedEndpoints === bestUnusedEndpoints) &&
            paletteScore === bestPaletteScore &&
            !preferGuideEndpoints &&
            unusedEndpoints < bestUnusedEndpoints
          ) ||
          (
            mismatchScore === bestMismatchScore &&
            (!preferGuideEndpoints || unusedEndpoints === bestUnusedEndpoints) &&
            paletteScore === bestPaletteScore &&
            unusedEndpoints === bestUnusedEndpoints &&
            remapCost < bestRemapCost
          )
        ) {
          bestMismatchScore = mismatchScore;
          bestPaletteScore = paletteScore;
          bestUnusedEndpoints = unusedEndpoints;
          bestRemapCost = remapCost;
          bestAttribute = attribute;
        }
      }
      attributes[cellOffset] = bestAttribute;
    }
  }
  return attributes;
}

function referencePairForCell(
  source: Uint8Array,
  guideKeys: Uint8Array,
  cellX: number,
  cellY: number,
  cellHeight: AttributeHeight,
  enabledColors: ReadonlySet<number>,
  settings: ConversionSettings,
): readonly [number, number] {
  const counts = new Float64Array(8);
  const cellLeft = cellX * CELL_WIDTH;
  const cellTop = cellY * cellHeight;
  for (let localY = 0; localY < cellHeight; localY += 1) {
    for (let localX = 0; localX < CELL_WIDTH; localX += 1) {
      const x = cellLeft + localX;
      const y = cellTop + localY;
      const code = (guideKeys[y * ZX_SCREEN_WIDTH + x] ?? 0) & 7;
      counts[code] = (counts[code] ?? 0) + 1;
    }
  }
  for (const sample of attributeHaloSamples(
    source, guideKeys, cellX, cellY, cellHeight, settings,
  )) {
    const haloCode = sample.key & 7;
    counts[haloCode] = (counts[haloCode] ?? 0) + sample.weight;
  }
  const usedCodes = Array.from({ length: 8 }, (_, code) => code)
    .filter((code) => enabledColors.has(code) && (counts[code] ?? 0) > 0);
  if (usedCodes.length === 1) {
    const ink = usedCodes[0] ?? 0;
    return [ink, enabledColors.has(0) ? 0 : ink];
  }

  let weightedSum = 0;
  let pixelCount = 0;
  for (const code of usedCodes) {
    weightedSum += code * (counts[code] ?? 0);
    pixelCount += counts[code] ?? 0;
  }
  const meanCode = weightedSum / pixelCount;
  const rankedCodes = [...usedCodes].sort((left, right) =>
    (counts[right] ?? 0) - (counts[left] ?? 0) || left - right
  );
  const first = rankedCodes[0] ?? 0;
  const second = rankedCodes.find((code, index) =>
    index > 0 && (first <= meanCode ? code > meanCode : code < meanCode)
  ) ?? rankedCodes[1] ?? first;
  return [Math.max(first, second), Math.min(first, second)];
}

function rawPairDistanceForCell(
  source: Uint8Array,
  cellX: number,
  cellY: number,
  cellHeight: AttributeHeight,
  inkCode: number,
  paperCode: number,
  bright: boolean,
): number {
  const ink = zxColor(inkCode, bright);
  const paper = zxColor(paperCode, bright);
  let score = 0;
  for (let localY = 0; localY < cellHeight; localY += 1) {
    for (let localX = 0; localX < CELL_WIDTH; localX += 1) {
      const x = cellX * CELL_WIDTH + localX;
      const y = cellY * cellHeight + localY;
      const offset = (y * ZX_SCREEN_WIDTH + x) * 4;
      score += Math.min(
        squaredDistance(
          source[offset] ?? 0,
          source[offset + 1] ?? 0,
          source[offset + 2] ?? 0,
          ink,
        ),
        squaredDistance(
          source[offset] ?? 0,
          source[offset + 1] ?? 0,
          source[offset + 2] ?? 0,
          paper,
        ),
      );
    }
  }
  return score;
}

function selectReferenceAttributesFromGuide(
  source: Uint8Array,
  guideKeys: Uint8Array,
  cellHeight: AttributeHeight,
  settings: ConversionSettings,
  level: OptimizationLevel,
  enabledColors: ReadonlySet<number>,
  draftBrightCells: Uint8Array,
): Uint8Array {
  const attributeRows = ZX_SCREEN_HEIGHT / cellHeight;
  const attributes = new Uint8Array(ZX_ATTRIBUTE_COLUMNS * attributeRows);
  for (let cellY = 0; cellY < attributeRows; cellY += 1) {
    for (let cellX = 0; cellX < ZX_ATTRIBUTE_COLUMNS; cellX += 1) {
      const [inkCode, paperCode] = referencePairForCell(
        source,
        guideKeys,
        cellX,
        cellY,
        cellHeight,
        enabledColors,
        settings,
      );
      const cellOffset = cellY * ZX_ATTRIBUTE_COLUMNS + cellX;
      let bright: boolean;
      if (zxBrightMode(settings) === "on") {
        bright = true;
      } else if (zxBrightMode(settings) === "off") {
        bright = false;
      } else if (level === "draft") {
        bright = (draftBrightCells[cellOffset] ?? 0) === 1;
      } else {
        const normalScore = rawPairDistanceForCell(
          source, cellX, cellY, cellHeight, inkCode, paperCode, false,
        );
        const brightScore = rawPairDistanceForCell(
          source, cellX, cellY, cellHeight, inkCode, paperCode, true,
        );
        bright = brightScore < normalScore;
      }
      attributes[cellOffset] =
        inkCode | (paperCode << 3) | (bright ? 0x40 : 0);
    }
  }
  return attributes;
}

function referenceBitForAttribute(
  guideKey: number,
  attribute: number,
  x: number,
  y: number,
): number {
  const inkCode = attribute & 7;
  const paperCode = (attribute >> 3) & 7;
  const guideCode = guideKey & 7;
  if (guideCode >= inkCode) return 1;
  if (guideCode <= paperCode) return 0;
  const distanceFromInk = inkCode - guideCode;
  const phase = (x & 1) + 2 * (y & 1);
  const paperMask =
    REFERENCE_PAPER_MASK_BY_INK_DISTANCE[distanceFromInk] ?? 0b1111;
  return ((paperMask >> phase) & 1) === 1 ? 0 : 1;
}

function referenceColorForAttribute(
  guideKey: number,
  attribute: number,
  x: number,
  y: number,
): RgbColor {
  const colors = decodeAttribute(attribute);
  return referenceBitForAttribute(guideKey, attribute, x, y) === 1
    ? colors.ink
    : colors.paper;
}

function rgbErrorForReferenceCell(
  source: Uint8Array,
  guideKeys: Uint8Array,
  cellX: number,
  cellY: number,
  cellHeight: AttributeHeight,
  attribute: number,
): number {
  let error = 0;
  for (let localY = 0; localY < cellHeight; localY += 1) {
    for (let localX = 0; localX < CELL_WIDTH; localX += 1) {
      const x = cellX * CELL_WIDTH + localX;
      const y = cellY * cellHeight + localY;
      const pixel = y * ZX_SCREEN_WIDTH + x;
      const offset = pixel * 4;
      error += squaredDistance(
        source[offset] ?? 0,
        source[offset + 1] ?? 0,
        source[offset + 2] ?? 0,
        referenceColorForAttribute(guideKeys[pixel] ?? 0, attribute, x, y),
      );
    }
  }
  return error;
}

function rgbHaloErrorForReferenceCell(
  source: Uint8Array,
  guideKeys: Uint8Array,
  cellX: number,
  cellY: number,
  cellHeight: AttributeHeight,
  attribute: number,
  settings: ConversionSettings,
): number {
  let error = 0;
  for (const sample of attributeHaloSamples(
    source, guideKeys, cellX, cellY, cellHeight, settings,
  )) {
    const offset = (sample.y * ZX_SCREEN_WIDTH + sample.x) * 4;
    error += sample.weight * squaredDistance(
      source[offset] ?? 0,
      source[offset + 1] ?? 0,
      source[offset + 2] ?? 0,
      referenceColorForAttribute(
        sample.key,
        attribute,
        sample.x,
        sample.y,
      ),
    );
  }
  return error;
}

function rgbBoundaryErrorForReferenceCell(
  source: Uint8Array,
  guideKeys: Uint8Array,
  attributes: Uint8Array,
  cellX: number,
  cellY: number,
  cellHeight: AttributeHeight,
  attribute: number,
): number {
  const rows = ZX_SCREEN_HEIGHT / cellHeight;
  let error = 0;
  const compare = (
    x: number,
    y: number,
    neighborX: number,
    neighborY: number,
    neighborAttribute: number,
  ) => {
    const pixel = y * ZX_SCREEN_WIDTH + x;
    const neighborPixel = neighborY * ZX_SCREEN_WIDTH + neighborX;
    const color = referenceColorForAttribute(
      guideKeys[pixel] ?? 0, attribute, x, y,
    );
    const neighborColor = referenceColorForAttribute(
      guideKeys[neighborPixel] ?? 0,
      neighborAttribute,
      neighborX,
      neighborY,
    );
    const offset = pixel * 4;
    const neighborOffset = neighborPixel * 4;
    for (const channel of ["r", "g", "b"] as const) {
      const sourceDelta =
        (source[offset + (channel === "r" ? 0 : channel === "g" ? 1 : 2)] ?? 0) -
        (source[neighborOffset + (channel === "r" ? 0 : channel === "g" ? 1 : 2)] ?? 0);
      const renderedDelta = color[channel] - neighborColor[channel];
      error += (sourceDelta - renderedDelta) ** 2;
    }
  };
  if (cellX > 0) {
    const neighbor = attributes[cellY * ZX_ATTRIBUTE_COLUMNS + cellX - 1] ?? 0;
    for (let localY = 0; localY < cellHeight; localY += 1) {
      compare(
        cellX * CELL_WIDTH,
        cellY * cellHeight + localY,
        cellX * CELL_WIDTH - 1,
        cellY * cellHeight + localY,
        neighbor,
      );
    }
  }
  if (cellX + 1 < ZX_ATTRIBUTE_COLUMNS) {
    const neighbor = attributes[cellY * ZX_ATTRIBUTE_COLUMNS + cellX + 1] ?? 0;
    for (let localY = 0; localY < cellHeight; localY += 1) {
      compare(
        cellX * CELL_WIDTH + CELL_WIDTH - 1,
        cellY * cellHeight + localY,
        cellX * CELL_WIDTH + CELL_WIDTH,
        cellY * cellHeight + localY,
        neighbor,
      );
    }
  }
  if (cellY > 0) {
    const neighbor = attributes[(cellY - 1) * ZX_ATTRIBUTE_COLUMNS + cellX] ?? 0;
    for (let localX = 0; localX < CELL_WIDTH; localX += 1) {
      compare(
        cellX * CELL_WIDTH + localX,
        cellY * cellHeight,
        cellX * CELL_WIDTH + localX,
        cellY * cellHeight - 1,
        neighbor,
      );
    }
  }
  if (cellY + 1 < rows) {
    const neighbor = attributes[(cellY + 1) * ZX_ATTRIBUTE_COLUMNS + cellX] ?? 0;
    for (let localX = 0; localX < CELL_WIDTH; localX += 1) {
      compare(
        cellX * CELL_WIDTH + localX,
        cellY * cellHeight + cellHeight - 1,
        cellX * CELL_WIDTH + localX,
        cellY * cellHeight + cellHeight,
        neighbor,
      );
    }
  }
  return error;
}

function selectRgbGuardedHaloAttributes(
  source: Uint8Array,
  guideKeys: Uint8Array,
  cellHeight: AttributeHeight,
  settings: ConversionSettings,
  level: OptimizationLevel,
  enabledColors: ReadonlySet<number>,
  draftBrightCells: Uint8Array,
): Uint8Array {
  const haloV1Settings: ConversionSettings = {
    ...settings,
    attributeOptimizerId: "zx-guide-reference-halo-v1",
    attributeSmoothing: Math.min(100, settings.attributeHaloInfluence),
  };
  const attributes = selectReferenceAttributesFromGuide(
    source,
    guideKeys,
    cellHeight,
    haloV1Settings,
    level,
    enabledColors,
    draftBrightCells,
  );
  for (let pass = 0; pass < 2; pass += 1) {
    const reverse = pass === 1;
    for (let step = 0; step < attributes.length; step += 1) {
      const cellOffset = reverse ? attributes.length - 1 - step : step;
      const cellX = cellOffset % ZX_ATTRIBUTE_COLUMNS;
      const cellY = Math.floor(cellOffset / ZX_ATTRIBUTE_COLUMNS);
      const draftBright = (draftBrightCells[cellOffset] ?? 0) === 1;
      let bestAttribute = attributes[cellOffset] ?? 0;
      let bestRgb = rgbErrorForReferenceCell(
        source, guideKeys, cellX, cellY, cellHeight, bestAttribute,
      );
      let bestSecondary =
        rgbHaloErrorForReferenceCell(
          source, guideKeys, cellX, cellY, cellHeight, bestAttribute, settings,
        ) +
        rgbBoundaryErrorForReferenceCell(
          source,
          guideKeys,
          attributes,
          cellX,
          cellY,
          cellHeight,
          bestAttribute,
        );
      for (let candidate = 0; candidate < 128; candidate += 1) {
        if (
          !attributeAllowed(
            candidate, settings, level, draftBright, enabledColors,
          )
        ) continue;
        const rgb = rgbErrorForReferenceCell(
          source, guideKeys, cellX, cellY, cellHeight, candidate,
        );
        if (rgb > bestRgb) continue;
        const secondary =
          rgbHaloErrorForReferenceCell(
            source, guideKeys, cellX, cellY, cellHeight, candidate, settings,
          ) +
          rgbBoundaryErrorForReferenceCell(
            source,
            guideKeys,
            attributes,
            cellX,
            cellY,
            cellHeight,
            candidate,
          );
        if (
          rgb < bestRgb ||
          rgb === bestRgb && secondary < bestSecondary ||
          rgb === bestRgb && secondary === bestSecondary &&
            candidate < bestAttribute
        ) {
          bestAttribute = candidate;
          bestRgb = rgb;
          bestSecondary = secondary;
        }
      }
      attributes[cellOffset] = bestAttribute;
    }
  }
  return attributes;
}

const REFERENCE_PAPER_MASK_BY_INK_DISTANCE = [
  0b0000,
  0b0000,
  0b0010,
  0b0110,
  0b0111,
  0b1111,
  0b1111,
  0b1111,
] as const;

function remapReferenceGuide(
  guideKeys: Uint8Array,
  attributes: Uint8Array,
  cellHeight: AttributeHeight,
  matrix: (typeof ORDERED_MATRICES)[keyof typeof ORDERED_MATRICES] | null = null,
): Uint8Array {
  const pixels = new Uint8Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT);
  for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
    for (let x = 0; x < ZX_SCREEN_WIDTH; x += 1) {
      const pixelOffset = y * ZX_SCREEN_WIDTH + x;
      const attribute = attributes[
        Math.floor(y / cellHeight) * ZX_ATTRIBUTE_COLUMNS +
        Math.floor(x / CELL_WIDTH)
      ] ?? 0;
      const inkCode = attribute & 7;
      const paperCode = (attribute >> 3) & 7;
      const guideCode = (guideKeys[pixelOffset] ?? 0) & 7;
      if (guideCode >= inkCode) {
        pixels[pixelOffset] = 1;
      } else if (guideCode <= paperCode) {
        pixels[pixelOffset] = 0;
      } else {
        const distanceFromInk = inkCode - guideCode;
        if (matrix !== null) {
          const paperMask =
            REFERENCE_PAPER_MASK_BY_INK_DISTANCE[distanceFromInk] ?? 0b1111;
          const paperCount = paperMask.toString(2).split("").filter((bit) => bit === "1").length;
          const coverageLevel = Math.round(paperCount * matrix.levels / 4);
          pixels[pixelOffset] = orderedThreshold(matrix, x, y) < coverageLevel ? 0 : 1;
        } else {
          const phase = (x & 1) + 2 * (y & 1);
          const paperMask =
            REFERENCE_PAPER_MASK_BY_INK_DISTANCE[distanceFromInk] ?? 0b1111;
          pixels[pixelOffset] = ((paperMask >> phase) & 1) === 1 ? 0 : 1;
        }
      }
    }
  }
  return pixels;
}

function checkerPhaseArtifactCorrection(
  source: Uint8Array,
  guideKeys: Uint8Array,
  attributes: Uint8Array,
  cellHeight: AttributeHeight,
  provisionalBits: Uint8Array,
): { readonly pixels: Uint8Array; readonly correctedPixelCount: number; readonly totalArtifactScore: number } {
  const pixels = provisionalBits.slice();
  const artifactScore = new Uint8Array(pixels.length);
  const phaseCorrection = new Int8Array(pixels.length);
  const correctedBlocks = new Uint8Array(Math.ceil(ZX_SCREEN_WIDTH / 2) * Math.ceil(ZX_SCREEN_HEIGHT / 2));
  let correctedPixelCount = 0;
  let totalArtifactScore = 0;
  const cellIndex = (x: number, y: number) =>
    Math.floor(y / cellHeight) * ZX_ATTRIBUTE_COLUMNS + Math.floor(x / CELL_WIDTH);
  const sourceDifference = (x1: number, y1: number, x2: number, y2: number) => {
    const a = (y1 * ZX_SCREEN_WIDTH + x1) * 4;
    const b = (y2 * ZX_SCREEN_WIDTH + x2) * 4;
    return Math.max(
      Math.abs((source[a] ?? 0) - (source[b] ?? 0)),
      Math.abs((source[a + 1] ?? 0) - (source[b + 1] ?? 0)),
      Math.abs((source[a + 2] ?? 0) - (source[b + 2] ?? 0)),
    );
  };
  const localCost = (x: number, y: number, candidate: number, colors: ReturnType<typeof decodeAttribute>) => {
    let cost = 0;
    const bitAt = (nx: number, ny: number) =>
      nx === x && ny === y ? candidate : pixels[ny * ZX_SCREEN_WIDTH + nx] ?? 0;
    for (let ny = Math.max(0, y - 1); ny <= Math.min(ZX_SCREEN_HEIGHT - 1, y + 2); ny += 1) {
      for (let nx = Math.max(0, x - 1); nx <= Math.min(ZX_SCREEN_WIDTH - 1, x + 1); nx += 1) {
        const bit = bitAt(nx, ny);
        if (nx + 1 < ZX_SCREEN_WIDTH && bit === bitAt(nx + 1, ny)) cost += 1;
        if (ny + 1 < ZX_SCREEN_HEIGHT && bit === bitAt(nx, ny + 1)) cost += 6;
        if (nx + 1 < ZX_SCREEN_WIDTH && ny + 1 < ZX_SCREEN_HEIGHT && bit === bitAt(nx + 1, ny + 1)) cost += 1;
      }
    }
    if (x % CELL_WIDTH <= 1 || x % CELL_WIDTH >= CELL_WIDTH - 2) cost += 6;
    const sourceOffset = (y * ZX_SCREEN_WIDTH + x) * 4;
    const rendered = candidate === 1 ? colors.ink : colors.paper;
    cost += Math.round(squaredDistance(
      source[sourceOffset] ?? 0,
      source[sourceOffset + 1] ?? 0,
      source[sourceOffset + 2] ?? 0,
      rendered,
    ) / 4096);
    return cost;
  };

  for (let y = 2; y < ZX_SCREEN_HEIGHT - 1; y += 1) {
    for (let x = 1; x < ZX_SCREEN_WIDTH - 1; x += 1) {
      const offset = y * ZX_SCREEN_WIDTH + x;
      const guide = (guideKeys[offset] ?? 0) & 7;
      const above = (y - 1) * ZX_SCREEN_WIDTH + x;
      const twoAbove = (y - 2) * ZX_SCREEN_WIDTH + x;
      if ((pixels[offset] ?? 0) !== (pixels[above] ?? 0) || pixels[offset] !== (pixels[twoAbove] ?? 0)) continue;
      const guideAbove = (guideKeys[above] ?? 0) & 7;
      const guideTwoAbove = (guideKeys[twoAbove] ?? 0) & 7;
      if (Math.max(guide, guideAbove, guideTwoAbove) - Math.min(guide, guideAbove, guideTwoAbove) > 1) continue;
      if (cellIndex(x, y) !== cellIndex(x, y - 2)) continue;
      const localX = x % CELL_WIDTH;
      if (localX <= 1 || localX >= CELL_WIDTH - 2) continue;

      let neighboringDifference = 0;
      for (let ny = y - 2; ny <= y; ny += 1) {
        const sideLeft = ny * ZX_SCREEN_WIDTH + x - 1;
        const sideRight = ny * ZX_SCREEN_WIDTH + x + 1;
        const sideGuidesDiffer =
          ((guideKeys[sideLeft] ?? 0) & 7) !== guide ||
          ((guideKeys[sideRight] ?? 0) & 7) !== guide;
        const sideBitsDiffer =
          (pixels[sideLeft] ?? 0) !== (pixels[offset] ?? 0) ||
          (pixels[sideRight] ?? 0) !== (pixels[offset] ?? 0);
        if (sideGuidesDiffer || sideBitsDiffer) {
          neighboringDifference += 1;
        }
      }
      if (neighboringDifference < 2) continue;
      const horizontalGradient = Math.max(
        sourceDifference(x - 1, y, x + 1, y),
        sourceDifference(x - 1, y - 1, x + 1, y - 1),
      );
      const verticalGradient = Math.max(
        sourceDifference(x, y - 1, x, y + 1),
        sourceDifference(x - 1, y - 1, x - 1, y + 1),
      );
      if (horizontalGradient > verticalGradient * 1.5) continue;
      let smooth = true;
      for (let ny = y - 1; ny <= y + 1 && smooth; ny += 1) {
        for (let nx = x - 1; nx <= x + 1; nx += 1) {
          if (sourceDifference(x, y, nx, ny) > 48) smooth = false;
        }
      }
      if (!smooth) continue;
      const block = Math.floor(y / 2) * Math.ceil(ZX_SCREEN_WIDTH / 2) + Math.floor(x / 2);
      if (correctedBlocks[block] !== 0) continue;
      const colors = decodeAttribute(attributes[cellIndex(x, y)] ?? 0);
      const sourceOffset = offset * 4;
      if (squaredDistance(source[sourceOffset] ?? 0, source[sourceOffset + 1] ?? 0, source[sourceOffset + 2] ?? 0, colors.ink) < 1024 ||
          squaredDistance(source[sourceOffset] ?? 0, source[sourceOffset + 1] ?? 0, source[sourceOffset + 2] ?? 0, colors.paper) < 1024) continue;
      const oldBit = pixels[offset] ?? 0;
      let oldCost = localCost(x, y, oldBit, colors);
      let bestBit = oldBit;
      let bestCost = oldCost;
      for (const candidate of [1 - oldBit]) {
        const candidateCost = localCost(x, y, candidate, colors);
        if (candidateCost < bestCost) {
          bestBit = candidate;
          bestCost = candidateCost;
        }
      }
      const score = Math.min(255, 24 + neighboringDifference * 16 + Math.max(0, verticalGradient - horizontalGradient));
      artifactScore[offset] = score;
      totalArtifactScore += score;
      if (bestBit !== oldBit && bestCost + 3 < oldCost) {
        pixels[offset] = bestBit;
        phaseCorrection[offset] = bestBit === 1 ? 1 : -1;
        correctedBlocks[block] = 1;
        correctedPixelCount += 1;
      }
    }
  }
  return { pixels, correctedPixelCount, totalArtifactScore };
}

function dbsRenderedColor(
  pixels: Uint8Array,
  attributes: Uint8Array,
  cellHeight: AttributeHeight,
  x: number,
  y: number,
): RgbColor {
  const attribute = attributes[
    Math.floor(y / cellHeight) * ZX_ATTRIBUTE_COLUMNS +
    Math.floor(x / CELL_WIDTH)
  ] ?? 0;
  const colors = decodeAttribute(attribute);
  return (pixels[y * ZX_SCREEN_WIDTH + x] ?? 0) === 1
    ? colors.ink
    : colors.paper;
}

const DBS_FILTER = [1, 2, 1] as const;

function dbsFilteredChannel(
  source: Uint8Array,
  pixels: Uint8Array,
  attributes: Uint8Array,
  cellHeight: AttributeHeight,
  x: number,
  y: number,
  channel: 0 | 1 | 2,
  output: boolean,
): number {
  let sum = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    const sampleY = Math.max(0, Math.min(ZX_SCREEN_HEIGHT - 1, y + dy));
    for (let dx = -1; dx <= 1; dx += 1) {
      const sampleX = Math.max(0, Math.min(ZX_SCREEN_WIDTH - 1, x + dx));
      const weight = (DBS_FILTER[dx + 1] ?? 1) * (DBS_FILTER[dy + 1] ?? 1);
      if (output) {
        const color = dbsRenderedColor(
          pixels, attributes, cellHeight, sampleX, sampleY,
        );
        sum += weight * (channel === 0 ? color.r : channel === 1 ? color.g : color.b);
      } else {
        sum += weight * (source[
          (sampleY * ZX_SCREEN_WIDTH + sampleX) * 4 + channel
        ] ?? 0);
      }
    }
  }
  return sum;
}

function dbsLuma(color: RgbColor): number {
  return 77 * color.r + 150 * color.g + 29 * color.b;
}

function dbsSourceLuma(source: Uint8Array, x: number, y: number): number {
  const offset = (y * ZX_SCREEN_WIDTH + x) * 4;
  return 77 * (source[offset] ?? 0) +
    150 * (source[offset + 1] ?? 0) +
    29 * (source[offset + 2] ?? 0);
}

function dbsRegionScore(
  source: Uint8Array,
  pixels: Uint8Array,
  attributes: Uint8Array,
  cellHeight: AttributeHeight,
  left: number,
  top: number,
  right: number,
  bottom: number,
): number {
  const x0 = Math.max(0, left);
  const y0 = Math.max(0, top);
  const x1 = Math.min(ZX_SCREEN_WIDTH - 1, right);
  const y1 = Math.min(ZX_SCREEN_HEIGHT - 1, bottom);
  let reconstruction = 0;
  let edge = 0;
  let cluster = 0;
  let anisotropy = 0;
  let boundary = 0;
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      for (const channel of [0, 1, 2] as const) {
        const difference =
          dbsFilteredChannel(
            source, pixels, attributes, cellHeight, x, y, channel, false,
          ) -
          dbsFilteredChannel(
            source, pixels, attributes, cellHeight, x, y, channel, true,
          );
        reconstruction += difference * difference;
      }
      if (x > 0 && x < ZX_SCREEN_WIDTH - 1) {
        const sourceGradient =
          dbsSourceLuma(source, x + 1, y) - dbsSourceLuma(source, x - 1, y);
        const outputGradient =
          dbsLuma(dbsRenderedColor(pixels, attributes, cellHeight, x + 1, y)) -
          dbsLuma(dbsRenderedColor(pixels, attributes, cellHeight, x - 1, y));
        edge += Math.abs(sourceGradient - outputGradient);
      }
      if (y > 0 && y < ZX_SCREEN_HEIGHT - 1) {
        const sourceGradient =
          dbsSourceLuma(source, x, y + 1) - dbsSourceLuma(source, x, y - 1);
        const outputGradient =
          dbsLuma(dbsRenderedColor(pixels, attributes, cellHeight, x, y + 1)) -
          dbsLuma(dbsRenderedColor(pixels, attributes, cellHeight, x, y - 1));
        edge += Math.abs(sourceGradient - outputGradient);
      }
      const bit = pixels[y * ZX_SCREEN_WIDTH + x] ?? 0;
      let equalNeighbors = 0;
      let horizontalChanges = 0;
      let verticalChanges = 0;
      if (x > 0) {
        const equal = (pixels[y * ZX_SCREEN_WIDTH + x - 1] ?? 0) === bit;
        equalNeighbors += equal ? 1 : 0;
        horizontalChanges += equal ? 0 : 1;
      }
      if (x < ZX_SCREEN_WIDTH - 1) {
        const equal = (pixels[y * ZX_SCREEN_WIDTH + x + 1] ?? 0) === bit;
        equalNeighbors += equal ? 1 : 0;
        horizontalChanges += equal ? 0 : 1;
      }
      if (y > 0) {
        const equal = (pixels[(y - 1) * ZX_SCREEN_WIDTH + x] ?? 0) === bit;
        equalNeighbors += equal ? 1 : 0;
        verticalChanges += equal ? 0 : 1;
      }
      if (y < ZX_SCREEN_HEIGHT - 1) {
        const equal = (pixels[(y + 1) * ZX_SCREEN_WIDTH + x] ?? 0) === bit;
        equalNeighbors += equal ? 1 : 0;
        verticalChanges += equal ? 0 : 1;
      }
      cluster += Math.max(0, equalNeighbors - 2) ** 2;
      anisotropy += Math.abs(horizontalChanges - verticalChanges);
      if (x > 0 && x % CELL_WIDTH === 0) {
        const sourceJump = Math.abs(
          dbsSourceLuma(source, x, y) - dbsSourceLuma(source, x - 1, y),
        );
        const outputJump = Math.abs(
          dbsLuma(dbsRenderedColor(pixels, attributes, cellHeight, x, y)) -
          dbsLuma(dbsRenderedColor(pixels, attributes, cellHeight, x - 1, y)),
        );
        boundary += Math.max(0, outputJump - sourceJump);
      }
      if (y > 0 && y % cellHeight === 0) {
        const sourceJump = Math.abs(
          dbsSourceLuma(source, x, y) - dbsSourceLuma(source, x, y - 1),
        );
        const outputJump = Math.abs(
          dbsLuma(dbsRenderedColor(pixels, attributes, cellHeight, x, y)) -
          dbsLuma(dbsRenderedColor(pixels, attributes, cellHeight, x, y - 1)),
        );
        boundary += Math.max(0, outputJump - sourceJump);
      }
    }
  }
  return reconstruction +
    edge * 48 +
    cluster * 16_384 +
    anisotropy * 8_192 +
    boundary * 64;
}

function dbsCellPixelsForAttribute(
  source: Uint8Array,
  cellX: number,
  cellY: number,
  cellHeight: AttributeHeight,
  attribute: number,
): Uint8Array {
  const result = new Uint8Array(CELL_WIDTH * cellHeight);
  const colors = decodeAttribute(attribute);
  for (let localY = 0; localY < cellHeight; localY += 1) {
    for (let localX = 0; localX < CELL_WIDTH; localX += 1) {
      const x = cellX * CELL_WIDTH + localX;
      const y = cellY * cellHeight + localY;
      const offset = (y * ZX_SCREEN_WIDTH + x) * 4;
      result[localY * CELL_WIDTH + localX] = squaredDistance(
        source[offset] ?? 0,
        source[offset + 1] ?? 0,
        source[offset + 2] ?? 0,
        colors.ink,
      ) < squaredDistance(
        source[offset] ?? 0,
        source[offset + 1] ?? 0,
        source[offset + 2] ?? 0,
        colors.paper,
      ) ? 1 : 0;
    }
  }
  return result;
}

function optimizeLegalMaskDbs(
  source: Uint8Array,
  pixels: Uint8Array,
  attributes: Uint8Array,
  cellHeight: AttributeHeight,
  settings: ConversionSettings,
  level: OptimizationLevel,
  enabledColors: ReadonlySet<number>,
  draftBrightCells: Uint8Array,
): Uint8Array {
  const optimized = Uint8Array.from(pixels);
  const attributeRows = ZX_SCREEN_HEIGHT / cellHeight;
  if (level === "high") {
    for (let cellY = 0; cellY < attributeRows; cellY += 1) {
      for (let cellX = 0; cellX < ZX_ATTRIBUTE_COLUMNS; cellX += 1) {
        const cellOffset = cellY * ZX_ATTRIBUTE_COLUMNS + cellX;
        const originalAttribute = attributes[cellOffset] ?? 0;
        const ranked: { attribute: number; score: number; pixels: Uint8Array }[] = [];
        for (let attribute = 0; attribute < 128; attribute += 1) {
          if (!attributeAllowed(
            attribute,
            settings,
            level,
            (draftBrightCells[cellOffset] ?? 0) === 1,
            enabledColors,
          )) continue;
          const candidatePixels = dbsCellPixelsForAttribute(
            source, cellX, cellY, cellHeight, attribute,
          );
          const colors = decodeAttribute(attribute);
          let score = 0;
          for (let localY = 0; localY < cellHeight; localY += 1) {
            for (let localX = 0; localX < CELL_WIDTH; localX += 1) {
              const x = cellX * CELL_WIDTH + localX;
              const y = cellY * cellHeight + localY;
              const sourceOffset = (y * ZX_SCREEN_WIDTH + x) * 4;
              const color = (candidatePixels[localY * CELL_WIDTH + localX] ?? 0) === 1
                ? colors.ink
                : colors.paper;
              score += squaredDistance(
                source[sourceOffset] ?? 0,
                source[sourceOffset + 1] ?? 0,
                source[sourceOffset + 2] ?? 0,
                color,
              );
            }
          }
          ranked.push({ attribute, score, pixels: candidatePixels });
        }
        ranked.sort((left, right) =>
          left.score - right.score || left.attribute - right.attribute
        );
        const candidates = ranked.slice(0, 2);
        if (!candidates.some(({ attribute }) => attribute === originalAttribute)) {
          candidates.push({
            attribute: originalAttribute,
            score: 0,
            pixels: Uint8Array.from({ length: CELL_WIDTH * cellHeight }, (_, index) => {
              const localX = index % CELL_WIDTH;
              const localY = Math.floor(index / CELL_WIDTH);
              return optimized[
                (cellY * cellHeight + localY) * ZX_SCREEN_WIDTH +
                cellX * CELL_WIDTH + localX
              ] ?? 0;
            }),
          });
        }
        const left = cellX * CELL_WIDTH;
        const top = cellY * cellHeight;
        let bestAttribute = originalAttribute;
        let bestPixels: Uint8Array | null = null;
        let bestScore = dbsRegionScore(
          source, optimized, attributes, cellHeight,
          left - 1, top - 1, left + CELL_WIDTH, top + cellHeight,
        );
        const originalPixels = new Uint8Array(CELL_WIDTH * cellHeight);
        for (let localY = 0; localY < cellHeight; localY += 1) {
          for (let localX = 0; localX < CELL_WIDTH; localX += 1) {
            originalPixels[localY * CELL_WIDTH + localX] = optimized[
              (top + localY) * ZX_SCREEN_WIDTH + left + localX
            ] ?? 0;
          }
        }
        for (const candidate of candidates) {
          attributes[cellOffset] = candidate.attribute;
          for (let localY = 0; localY < cellHeight; localY += 1) {
            optimized.set(
              candidate.pixels.subarray(localY * CELL_WIDTH, (localY + 1) * CELL_WIDTH),
              (top + localY) * ZX_SCREEN_WIDTH + left,
            );
          }
          const candidateScore = dbsRegionScore(
            source, optimized, attributes, cellHeight,
            left - 1, top - 1, left + CELL_WIDTH, top + cellHeight,
          );
          if (
            candidateScore < bestScore ||
            (candidateScore === bestScore && candidate.attribute < bestAttribute)
          ) {
            bestScore = candidateScore;
            bestAttribute = candidate.attribute;
            bestPixels = Uint8Array.from(candidate.pixels);
          }
        }
        attributes[cellOffset] = bestAttribute;
        const selectedPixels = bestPixels ?? originalPixels;
        for (let localY = 0; localY < cellHeight; localY += 1) {
          optimized.set(
            selectedPixels.subarray(localY * CELL_WIDTH, (localY + 1) * CELL_WIDTH),
            (top + localY) * ZX_SCREEN_WIDTH + left,
          );
        }
      }
    }
  }

  const blockHeight = cellHeight === 1 ? 1 : 2;
  const passCount = level === "draft" ? 1 : 2;
  for (let pass = 0; pass < passCount; pass += 1) {
    let changed = false;
    const reverse = pass % 2 === 1;
    for (let cellStep = 0; cellStep < attributeRows; cellStep += 1) {
      const cellY = reverse ? attributeRows - 1 - cellStep : cellStep;
      for (let columnStep = 0; columnStep < ZX_ATTRIBUTE_COLUMNS; columnStep += 1) {
        const cellX = reverse ? ZX_ATTRIBUTE_COLUMNS - 1 - columnStep : columnStep;
        const blockRows = cellHeight / blockHeight;
        const rowMajor = pass % 2 === 0;
        const blockCount = 4 * blockRows;
        for (let blockStep = 0; blockStep < blockCount; blockStep += 1) {
          const major = rowMajor ? blockStep : blockCount - 1 - blockStep;
          const blockX = rowMajor ? major % 4 : Math.floor(major / blockRows);
          const blockY = rowMajor ? Math.floor(major / 4) : major % blockRows;
          const left = cellX * CELL_WIDTH + blockX * 2;
          const top = cellY * cellHeight + blockY * blockHeight;
          let currentMask = 0;
          for (let localY = 0; localY < blockHeight; localY += 1) {
            for (let localX = 0; localX < 2; localX += 1) {
              currentMask |= (optimized[
                (top + localY) * ZX_SCREEN_WIDTH + left + localX
              ] ?? 0) << (localY * 2 + localX);
            }
          }
          let bestMask = currentMask;
          let bestScore = dbsRegionScore(
            source, optimized, attributes, cellHeight,
            left - 1, top - 1, left + 2, top + blockHeight,
          );
          const bitCount = 2 * blockHeight;
          for (let bit = 0; bit < bitCount; bit += 1) {
            const mask = currentMask ^ (1 << bit);
            for (let localY = 0; localY < blockHeight; localY += 1) {
              for (let localX = 0; localX < 2; localX += 1) {
                optimized[(top + localY) * ZX_SCREEN_WIDTH + left + localX] =
                  (mask >> (localY * 2 + localX)) & 1;
              }
            }
            const candidateScore = dbsRegionScore(
              source, optimized, attributes, cellHeight,
              left - 1, top - 1, left + 2, top + blockHeight,
            );
            if (candidateScore < bestScore) {
              bestScore = candidateScore;
              bestMask = mask;
            }
          }
          for (let localY = 0; localY < blockHeight; localY += 1) {
            for (let localX = 0; localX < 2; localX += 1) {
              optimized[(top + localY) * ZX_SCREEN_WIDTH + left + localX] =
                (bestMask >> (localY * 2 + localX)) & 1;
            }
          }
          changed ||= bestMask !== currentMask;
        }
      }
    }
    if (!changed) break;
  }
  return optimized;
}

function remapLocalColors(
  source: Uint8Array,
  colorKeys: Uint8Array,
  attributes: Uint8Array,
  cellHeight: AttributeHeight,
): Uint8Array {
  const pixels = new Uint8Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT);
  for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
    for (let x = 0; x < ZX_SCREEN_WIDTH; x += 1) {
      const pixelOffset = y * ZX_SCREEN_WIDTH + x;
      const attribute = attributes[
        Math.floor(y / cellHeight) * ZX_ATTRIBUTE_COLUMNS +
        Math.floor(x / CELL_WIDTH)
      ] ?? 0;
      const inkCode = attribute & 7;
      const paperCode = (attribute >> 3) & 7;
      const bright = (attribute & 0x40) !== 0;
      const key = colorKeys[pixelOffset] ?? 0;
      if (inkCode === paperCode) {
        pixels[pixelOffset] = 0;
      } else if (colorKeyMatches(key, inkCode, bright)) {
        pixels[pixelOffset] = 1;
      } else if (colorKeyMatches(key, paperCode, bright)) {
        pixels[pixelOffset] = 0;
      } else {
        const sourceOffset = pixelOffset * 4;
        const colors = decodeAttribute(attribute);
        pixels[pixelOffset] = selectProjected(
          source[sourceOffset] ?? 0,
          source[sourceOffset + 1] ?? 0,
          source[sourceOffset + 2] ?? 0,
          colors.ink,
          colors.paper,
          0,
          1,
          0,
        );
      }
    }
  }
  return pixels;
}

function renderPixels(
  source: Uint8Array,
  attributes: Uint8Array,
  cellHeight: AttributeHeight,
  settings: ConversionSettings,
): Uint8Array {
  const pixels = new Uint8Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT);
  const matrix = ORDERED_MATRICES[settings.orderedMatrix];

  if (settings.dithering === "error-diffusion" && settings.ditheringAmount > 0) {
    const errors = new Int32Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT * 3);
    for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
      const direction = y % 2 === 0 ? 1 : -1;
      for (let step = 0; step < ZX_SCREEN_WIDTH; step += 1) {
        const x = direction === 1 ? step : ZX_SCREEN_WIDTH - 1 - step;
        const pixelOffset = y * ZX_SCREEN_WIDTH + x;
        const sourceOffset = pixelOffset * 4;
        const sourceR = source[sourceOffset] ?? 0;
        const sourceG = source[sourceOffset + 1] ?? 0;
        const sourceB = source[sourceOffset + 2] ?? 0;
        const attribute = attributes[
          Math.floor(y / cellHeight) * ZX_ATTRIBUTE_COLUMNS +
          Math.floor(x / CELL_WIDTH)
        ] ?? 0;
        const { ink, paper } = decodeAttribute(attribute);
        const errorOffset = pixelOffset * 3;
        const incomingError = projectErrorOntoPair(
          errors[errorOffset] ?? 0,
          errors[errorOffset + 1] ?? 0,
          errors[errorOffset + 2] ?? 0,
          ink,
          paper,
        );
        const adjustedR = Math.max(0, Math.min(255 * ERROR_SCALE, sourceR * ERROR_SCALE + incomingError[0]));
        const adjustedG = Math.max(0, Math.min(255 * ERROR_SCALE, sourceG * ERROR_SCALE + incomingError[1]));
        const adjustedB = Math.max(0, Math.min(255 * ERROR_SCALE, sourceB * ERROR_SCALE + incomingError[2]));
        const decision = squaredDistance(adjustedR, adjustedG, adjustedB, {
          r: ink.r * ERROR_SCALE,
          g: ink.g * ERROR_SCALE,
          b: ink.b * ERROR_SCALE,
        }) <= squaredDistance(adjustedR, adjustedG, adjustedB, {
          r: paper.r * ERROR_SCALE,
          g: paper.g * ERROR_SCALE,
          b: paper.b * ERROR_SCALE,
        }) ? 1 : 0;
        pixels[pixelOffset] = decision;
        const output = decision === 1 ? ink : paper;
        const channelErrors = projectErrorOntoPair(
          adjustedR - output.r * ERROR_SCALE,
          adjustedG - output.g * ERROR_SCALE,
          adjustedB - output.b * ERROR_SCALE,
          ink,
          paper,
        );
        const neighbors = [
          [x + direction, y, 7],
          [x - direction, y + 1, 3],
          [x, y + 1, 5],
          [x + direction, y + 1, 1],
        ] as const;
        for (const [nx, ny, weight] of neighbors) {
          if (
            nx < 0 || nx >= ZX_SCREEN_WIDTH ||
            ny < 0 || ny >= ZX_SCREEN_HEIGHT
          ) continue;
          const neighborOffset = (ny * ZX_SCREEN_WIDTH + nx) * 3;
          for (let channel = 0; channel < 3; channel += 1) {
            errors[neighborOffset + channel] = (errors[neighborOffset + channel] ?? 0) +
              signedRoundDiv((channelErrors[channel] ?? 0) * settings.ditheringAmount * weight, ERROR_SCALE);
          }
        }
      }
    }
    return pixels;
  }

  for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
    for (let x = 0; x < ZX_SCREEN_WIDTH; x += 1) {
      const pixelOffset = y * ZX_SCREEN_WIDTH + x;
      const sourceOffset = pixelOffset * 4;
      const sourceR = source[sourceOffset] ?? 0;
      const sourceG = source[sourceOffset + 1] ?? 0;
      const sourceB = source[sourceOffset + 2] ?? 0;
      const attribute = attributes[
        Math.floor(y / cellHeight) * ZX_ATTRIBUTE_COLUMNS +
        Math.floor(x / CELL_WIDTH)
      ] ?? 0;
      const { ink, paper } = decodeAttribute(attribute);
      pixels[pixelOffset] = (
        settings.dithering === "ordered" && settings.ditheringAmount > 0
      ) ? selectProjected(
          sourceR, sourceG, sourceB, ink, paper,
          orderedThreshold(matrix, x, y), matrix.levels, settings.ditheringAmount,
        )
      : selectProjected(sourceR, sourceG, sourceB, ink, paper, 0, 1, 0);
    }
  }
  return pixels;
}

function calculateRenderCost(
  source: Uint8Array,
  pixels: Uint8Array,
  attributes: Uint8Array,
  cellHeight: AttributeHeight,
  settings: ConversionSettings,
): number {
  const toneBlockRows = Math.ceil(cellHeight / TONE_BLOCK_SIZE);
  const sourceToneSums = new Int32Array(TONE_BLOCK_COLUMNS * toneBlockRows * 3);
  const outputToneSums = new Int32Array(TONE_BLOCK_COLUMNS * toneBlockRows * 3);
  let totalCost = 0;

  for (let cellY = 0; cellY < ZX_SCREEN_HEIGHT / cellHeight; cellY += 1) {
    for (let cellX = 0; cellX < ZX_ATTRIBUTE_COLUMNS; cellX += 1) {
      sourceToneSums.fill(0);
      outputToneSums.fill(0);
      const colors = decodeAttribute(
        attributes[cellY * ZX_ATTRIBUTE_COLUMNS + cellX] ?? 0,
      );
      let detailScore = 0;
      for (let localY = 0; localY < cellHeight; localY += 1) {
        for (let localX = 0; localX < CELL_WIDTH; localX += 1) {
          const x = cellX * CELL_WIDTH + localX;
          const y = cellY * cellHeight + localY;
          const pixelOffset = y * ZX_SCREEN_WIDTH + x;
          const sourceOffset = pixelOffset * 4;
          const sourceR = source[sourceOffset] ?? 0;
          const sourceG = source[sourceOffset + 1] ?? 0;
          const sourceB = source[sourceOffset + 2] ?? 0;
          const output = pixels[pixelOffset] === 1 ? colors.ink : colors.paper;
          detailScore += squaredDistance(sourceR, sourceG, sourceB, output);
          const toneBlock = (
            Math.floor(localY / TONE_BLOCK_SIZE) * TONE_BLOCK_COLUMNS +
            Math.floor(localX / TONE_BLOCK_SIZE)
          ) * 3;
          sourceToneSums[toneBlock] = (sourceToneSums[toneBlock] ?? 0) + sourceR;
          sourceToneSums[toneBlock + 1] = (sourceToneSums[toneBlock + 1] ?? 0) + sourceG;
          sourceToneSums[toneBlock + 2] = (sourceToneSums[toneBlock + 2] ?? 0) + sourceB;
          outputToneSums[toneBlock] = (outputToneSums[toneBlock] ?? 0) + output.r;
          outputToneSums[toneBlock + 1] = (outputToneSums[toneBlock + 1] ?? 0) + output.g;
          outputToneSums[toneBlock + 2] = (outputToneSums[toneBlock + 2] ?? 0) + output.b;
        }
      }
      if (settings.dithering === "none" || settings.ditheringAmount === 0) {
        totalCost += detailScore * COST_SCALE;
        continue;
      }
      let localToneError = 0;
      for (let index = 0; index < sourceToneSums.length; index += 1) {
        const difference = (sourceToneSums[index] ?? 0) - (outputToneSums[index] ?? 0);
        localToneError += difference * difference;
      }
      totalCost += detailScore * COST_SCALE +
        LOCAL_TONE_WEIGHT * settings.ditheringAmount * localToneError;
    }
  }
  return totalCost;
}

function validateSettings(settings: ConversionSettings): void {
  assertCompatibleEngines(
    settings.platformId,
    settings.attributeOptimizerId,
    settings.ditherEngineId,
  );
  if (ditherMethodForEngine(settings.ditherEngineId) !== settings.dithering) {
    throw new RangeError("Dither engine and dithering method do not match.");
  }
  if (settings.ditherEngineId === "artistic-ordered-hybrid-v1" && settings.modeId !== "zx48-standard-256x192") {
    throw new RangeError("Artistic ordered hybrid supports only single-screen ZX targets.");
  }
  if (settings.artisticPattern !== undefined && !["auto", "checkerboard", "horizontal", "vertical"].includes(settings.artisticPattern)) {
    throw new RangeError("Invalid artistic pattern preference.");
  }
  validateAdjustments(settings);
  validateImageFilters(settings);
  if (!Number.isInteger(settings.borderColor) || settings.borderColor < 0 || settings.borderColor > 7) {
    throw new RangeError("Border color must be a ZX base color code from 0 through 7.");
  }
  if (![1, 2, 4, 8].includes(settings.attributeHeight)) {
    throw new RangeError("Attribute height must be 1, 2, 4, or 8 pixels.");
  }
  if (
    !Number.isInteger(settings.attributeSmoothing) ||
    settings.attributeSmoothing < 0 ||
    settings.attributeSmoothing > 100
  ) {
    throw new RangeError("Attribute smoothing must be an integer from 0 through 100.");
  }
  if (
    !Number.isInteger(settings.attributeHaloInfluence) ||
    settings.attributeHaloInfluence < 0 ||
    settings.attributeHaloInfluence > 400
  ) {
    throw new RangeError("Attribute halo influence must be an integer from 0 through 400.");
  }
  if (
    !Number.isInteger(settings.attributeHaloHorizontal) ||
    settings.attributeHaloHorizontal < 0 ||
    settings.attributeHaloHorizontal > 2 ||
    !Number.isInteger(settings.attributeHaloVertical) ||
    settings.attributeHaloVertical < 0 ||
    settings.attributeHaloVertical > 2
  ) {
    throw new RangeError("Attribute halo radii must be integers from 0 through 2 pixels.");
  }
  if (settings.paletteSelections.length !== outputScreenCount(settings.modeId)) {
    throw new RangeError("ZX mode has an invalid number of palette selections.");
  }
  for (let index = 0; index < settings.paletteSelections.length; index += 1) {
    const selection = paletteSelection(settings, index);
    if (
      !["auto", "on", "off"].includes(String(selection.brightMode)) ||
      selection.enabledColorIds.length === 0 ||
      selection.enabledColorIds.some((color) =>
        !Number.isInteger(color) || color < 0 || color > 7
      ) ||
      new Set(selection.enabledColorIds).size !== selection.enabledColorIds.length
    ) {
      throw new RangeError(
        "ZX palette selections require a BRIGHT mode and unique base color codes from 0 through 7.",
      );
    }
  }
  if (!Number.isInteger(settings.ditheringAmount) || settings.ditheringAmount < 0 || settings.ditheringAmount > 100) {
    throw new RangeError("Dithering amount must be an integer from 0 through 100.");
  }
  if (
    !Number.isInteger(settings.errorDiffusionRandomization) ||
    settings.errorDiffusionRandomization < 0 ||
    settings.errorDiffusionRandomization > 100
  ) {
    throw new RangeError(
      "Error-diffusion randomization must be an integer from 0 through 100.",
    );
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
  if (!(settings.orderedMatrix in ORDERED_MATRICES)) {
    throw new RangeError("Ordered dithering matrix is invalid.");
  }
  if (
    settings.structured.schemaVersion !== 1 ||
    !Number.isInteger(settings.structured.ditherAmountPermille) ||
    settings.structured.ditherAmountPermille < 0 ||
    settings.structured.ditherAmountPermille > 1000
  ) {
    throw new RangeError("Structured conversion settings are invalid.");
  }
  if (
    (
      settings.ditherEngineId === "ordered-cell-pattern-v1" ||
      settings.ditherEngineId === "ordered-cell-pattern-v2" ||
      settings.ditherEngineId === "ordered-cell-pattern-v3" ||
      settings.ditherEngineId === "ordered-cell-pattern-v4"
    ) &&
    settings.structured.ditherAmountPermille !== settings.ditheringAmount * 10
  ) {
    throw new RangeError(
      "Structured dithering percentage and authoritative permille value differ.",
    );
  }
  if (
    (
      settings.ditherEngineId === "ordered-cell-pattern-v1" &&
      (
        settings.structured.ditherResponseCurveId !== "power-065-percent-v1" ||
        settings.structured.colorAnchorModelId !== "none-v1" ||
        settings.structured.structuralModelId !== "none-v1"
      )
    ) ||
    (
      settings.ditherEngineId === "ordered-cell-pattern-v2" &&
      (
        settings.structured.ditherResponseCurveId !== "power-035-percent-v2" ||
        settings.structured.colorAnchorModelId !== "none-v1" ||
        settings.structured.structuralModelId !== "none-v1"
      )
    ) ||
    (
      settings.ditherEngineId === "ordered-cell-pattern-v3" &&
      (
        settings.structured.ditherResponseCurveId !== "power-035-percent-v2" ||
        settings.structured.colorAnchorModelId !== "srgb-squared-v1" ||
        settings.structured.structuralModelId !== "none-v1"
      )
    ) ||
    (
      settings.ditherEngineId === "ordered-cell-pattern-v4" &&
      (
        settings.structured.ditherResponseCurveId !== "power-035-percent-v2" ||
        settings.structured.colorAnchorModelId !== "srgb-squared-v1" ||
        settings.structured.structuralModelId !== "palette-topology-v1"
      )
    )
  ) {
    throw new RangeError(
      "Structured dither engine and response curve versions differ.",
    );
  }
}

export function renderScreenRgba(screen: ZxScreen): Uint8Array {
  assertValidScreen(screen);
  return renderAttributeFrameRgba(screen.pixels, screen.attributes, 8);
}

export function renderAttributeFrameRgba(
  pixels: Uint8Array,
  attributes: Uint8Array,
  attributeHeight: AttributeHeight,
): Uint8Array {
  if (pixels.length !== ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT) {
    throw new RangeError("Converted pixel length is invalid.");
  }
  if (attributes.length !== ZX_ATTRIBUTE_COLUMNS * (ZX_SCREEN_HEIGHT / attributeHeight)) {
    throw new RangeError("Converted attribute length is invalid.");
  }
  const preview = new Uint8Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT * 4);
  for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
    for (let x = 0; x < ZX_SCREEN_WIDTH; x += 1) {
      const attribute = attributes[
        Math.floor(y / attributeHeight) * ZX_ATTRIBUTE_COLUMNS + Math.floor(x / CELL_WIDTH)
      ] ?? 0;
      const colors = decodeAttribute(attribute);
      const color = pixels[y * ZX_SCREEN_WIDTH + x] === 1 ? colors.ink : colors.paper;
      const offset = (y * ZX_SCREEN_WIDTH + x) * 4;
      preview[offset] = color.r;
      preview[offset + 1] = color.g;
      preview[offset + 2] = color.b;
      preview[offset + 3] = 255;
    }
  }
  return preview;
}

export function convertToZx(
  sourceRgba: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  settings: ConversionSettings,
  level: OptimizationLevel = "high",
): ZxConversionResult {
  validateSettings(settings);
  if (
    settings.modeId !== "zx48-standard-256x192" &&
    settings.modeId !== "zx48-mixed-256x192" &&
    settings.modeId !== "zx48-vertical-spatial-256x192"
  ) {
    throw new RangeError("ZX Spectrum mode is invalid.");
  }
  const framed = frameRgba(sourceRgba, sourceWidth, sourceHeight, settings);
  const filtered = filterRgba(
    framed,
    ZX_SCREEN_WIDTH,
    ZX_SCREEN_HEIGHT,
    settings,
  );
  const normalized = adjustRgba(filtered, settings);
  if (
    settings.modeId !== "zx48-vertical-spatial-256x192" &&
    (
      settings.attributeOptimizerId === "zx-vertical-spatial-uniform-v1" ||
      settings.attributeOptimizerId === "zx-vertical-spatial-detail-v1" ||
      settings.ditherEngineId.startsWith("vertical-spatial-") ||
      settings.verticalSpatialMix !== undefined
    )
  ) throw new RangeError("ZX spatial engines require a vertical spatial target.");
  if (settings.modeId === "zx48-vertical-spatial-256x192") {
    validateVerticalSpatialMixSettings(settings.verticalSpatialMix);
    const spatialDitherEngine = settings.dithering === "none"
      ? "vertical-spatial-none-v1"
      : settings.dithering === "ordered"
        ? "vertical-spatial-ordered-v1"
        : "vertical-spatial-error-diffusion-v1";
    if (
      ![
        "zx-vertical-spatial-uniform-v1",
        "zx-vertical-spatial-detail-v1",
      ].includes(settings.attributeOptimizerId) ||
      settings.verticalSpatialMix?.algorithmId !== (
        settings.attributeOptimizerId === "zx-vertical-spatial-detail-v1"
          ? "vertical-spatial-detail-v1"
          : "vertical-spatial-uniform-v1"
      ) ||
      settings.ditherEngineId !== spatialDitherEngine ||
      settings.attributeHeight !== 1
    ) throw new RangeError("ZX vertical spatial mode requires a matching Version 1 8x1 spatial dither engine.");
    const selection = paletteSelection(settings, 0);
    const optimized = optimizeVerticalSpatialZx(
      normalized,
      selection.enabledColorIds,
      zxBrightMode(settings),
      {
        method: settings.dithering,
        amount: settings.ditheringAmount,
        orderedMatrix: settings.orderedMatrix,
        errorRandomization: settings.errorDiffusionRandomization,
      },
      settings.attributeOptimizerId === "zx-vertical-spatial-detail-v1"
        ? "detail-preserving"
        : "uniform-blend",
    );
    const previewRgba = renderAttributeFrameRgba(
      optimized.pixelMasks,
      optimized.attributes,
      1,
    );
    const encoded = serializeSoftwareScr(
      optimized.pixelMasks,
      optimized.attributes,
      1,
    );
    const spatial = withAnalyticPreview(
      optimized.diagnostics,
      previewRgba,
      ZX_SCREEN_WIDTH,
      ZX_SCREEN_HEIGHT,
    );
    return {
      platformId: "zx-spectrum",
      modeId: "zx48-vertical-spatial-256x192",
      width: ZX_SCREEN_WIDTH,
      height: ZX_SCREEN_HEIGHT,
      pixelAspectRatio: 1,
      attributeOptimizerId: settings.attributeOptimizerId,
      ditherEngineId: settings.ditherEngineId,
      paletteSelections: settings.paletteSelections,
      frames: [{
        hardwareModeId: "zx48-software-8x1",
        nativeWidth: ZX_SCREEN_WIDTH,
        nativeHeight: ZX_SCREEN_HEIGHT,
        nativePixelAspectRatio: 1,
        encoded,
        paletteIndices: Uint8Array.from(optimized.pixelMasks),
        previewRgba,
      }],
      preConstraintPreviewRgba: normalized,
      mergedPreviewRgba: previewRgba,
      screen: { pixels: optimized.pixelMasks, attributes: optimized.attributes },
      pixels: optimized.pixelMasks,
      attributes: optimized.attributes,
      attributeHeight: 1,
      sourcePreviewRgba: normalized,
      previewRgba,
      score: spatial.totalCost,
      verticalSpatialDiagnostics: spatial,
    };
  }
  if (settings.modeId === "zx48-mixed-256x192") {
    const coupledOptimizer =
      settings.attributeOptimizerId === "zx-block-dbs-global-v1" ||
      settings.attributeOptimizerId === "zx-structured-global-v1" ||
      settings.attributeOptimizerId === "zx-structured-global-v2" ||
      settings.attributeOptimizerId === "zx-structured-global-v3" ||
      settings.attributeOptimizerId === "zx-structured-global-v4";
    if (coupledOptimizer) {
      throw new RangeError(
        "ZX mixed mode requires an independently selectable attribute optimizer.",
      );
    }
    const firstSelection = paletteSelection(settings, 0);
    const secondSelection = paletteSelection(settings, 1);
    const buildPhysicalPalette = (
      enabledColorIds: readonly number[],
      brightMode: BrightMode,
    ) => {
      const brightValues = brightMode === "on"
        ? [true]
        : brightMode === "off"
        ? [false]
        : [false, true];
      return brightValues.flatMap((bright) =>
        enabledColorIds.map((code) => ({
          ...zxColor(code, bright),
          code,
          bright,
        }))
      );
    };
    const firstPhysicalPalette = buildPhysicalPalette(
      firstSelection.enabledColorIds,
      zxBrightMode(settings, 0),
    );
    const secondPhysicalPalette = buildPhysicalPalette(
      secondSelection.enabledColorIds,
      zxBrightMode(settings, 1),
    );
    const virtualPalette = buildTemporalCrossPalette(
      [...firstPhysicalPalette, ...secondPhysicalPalette],
      firstPhysicalPalette.map((_, index) => index),
      secondPhysicalPalette.map((_, index) => firstPhysicalPalette.length + index),
    );
    const virtualIndices = quantizeTemporalVirtual(
      normalized,
      ZX_SCREEN_WIDTH,
      ZX_SCREEN_HEIGHT,
      virtualPalette,
      settings,
      settings.ditherEngineId === "ordered-local-tone-v3" ||
        settings.ditherEngineId === "ordered-baseline-additive-v5" ||
        settings.ditherEngineId === "ordered-strict-matrix-v6",
    );
    const endpointOne = new Uint8Array(normalized.length);
    const endpointTwo = new Uint8Array(normalized.length);
    const unrestrictedMerged = new Uint8Array(normalized.length);
    const combinedPalette = [...firstPhysicalPalette, ...secondPhysicalPalette];
    for (let pixel = 0; pixel < virtualIndices.length; pixel += 1) {
      const pair = virtualPalette[virtualIndices[pixel] ?? 0]!;
      const x = pixel % ZX_SCREEN_WIDTH;
      const y = Math.floor(pixel / ZX_SCREEN_WIDTH);
      // Unlike QL, ZX cannot alternate temporal endpoints per pixel without
      // fighting the two-color attribute constraint. Keep one orientation for
      // the complete attribute cell and alternate only between whole cells.
      const swap = settings.screenFlickerSuppression &&
        paletteSelectionsMatch(firstSelection, secondSelection) &&
        pair.first !== pair.second &&
        ((Math.floor(x / CELL_WIDTH) +
          Math.floor(y / settings.attributeHeight)) & 1) === 1;
      const first = combinedPalette[swap ? pair.second : pair.first]!;
      const second = combinedPalette[swap ? pair.first : pair.second]!;
      const offset = pixel * 4;
      endpointOne[offset] = first.r;
      endpointOne[offset + 1] = first.g;
      endpointOne[offset + 2] = first.b;
      endpointOne[offset + 3] = 255;
      endpointTwo[offset] = second.r;
      endpointTwo[offset + 1] = second.g;
      endpointTwo[offset + 2] = second.b;
      endpointTwo[offset + 3] = 255;
      unrestrictedMerged[offset] = pair.r;
      unrestrictedMerged[offset + 1] = pair.g;
      unrestrictedMerged[offset + 2] = pair.b;
      unrestrictedMerged[offset + 3] = 255;
    }
    const physicalSettings: ConversionSettings = {
      ...settings,
      modeId: "zx48-standard-256x192",
      framing: "stretch",
      resampling: "nearest",
      rotation: 0,
      mirrorHorizontal: false,
      mirrorVertical: false,
      brightness: 0,
      contrast: 0,
      saturation: 0,
      gamma: 100,
      smoothing: 0,
      sharpening: 0,
      ditherEngineId: "none-discrete-v2",
      dithering: "none",
      ditheringAmount: 0,
      structured: {
        ...settings.structured,
        ditherAmountPermille: 0,
      },
    };
    const first = convertToZx(
      endpointOne,
      ZX_SCREEN_WIDTH,
      ZX_SCREEN_HEIGHT,
      {
        ...physicalSettings,
        paletteSelections: [{ ...firstSelection, screenIndex: 0 }],
      },
      level,
    );
    const second = convertToZx(
      endpointTwo,
      ZX_SCREEN_WIDTH,
      ZX_SCREEN_HEIGHT,
      {
        ...physicalSettings,
        paletteSelections: [{ ...secondSelection, screenIndex: 0 }],
      },
      level,
    );
    const merged = mergeTemporalFrames(
      first.previewRgba,
      second.previewRgba,
    );
    return {
      platformId: "zx-spectrum",
      modeId: "zx48-mixed-256x192",
      width: ZX_SCREEN_WIDTH,
      height: ZX_SCREEN_HEIGHT,
      pixelAspectRatio: 1,
      attributeOptimizerId: settings.attributeOptimizerId,
      ditherEngineId: settings.ditherEngineId,
      paletteSelections: settings.paletteSelections,
      frames: [first.frames[0]!, second.frames[0]!],
      preConstraintPreviewRgba: unrestrictedMerged,
      mergedPreviewRgba: merged,
      screen: first.screen,
      pixels: first.pixels,
      attributes: first.attributes,
      attributeHeight: settings.attributeHeight,
      sourcePreviewRgba: normalized,
      previewRgba: merged,
      score: temporalRgbaError(normalized, merged),
    };
  }
  const cellHeight = settings.attributeHeight;
  if (
    (
      settings.attributeOptimizerId === "zx-structured-global-v1" &&
      settings.ditherEngineId === "ordered-cell-pattern-v1" &&
      settings.structured.ditherResponseCurveId === "power-065-percent-v1" &&
      settings.structured.colorAnchorModelId === "none-v1" &&
      settings.structured.structuralModelId === "none-v1"
    ) ||
    (
      settings.attributeOptimizerId === "zx-structured-global-v2" &&
      settings.ditherEngineId === "ordered-cell-pattern-v2" &&
      settings.structured.ditherResponseCurveId === "power-035-percent-v2" &&
      settings.structured.colorAnchorModelId === "none-v1" &&
      settings.structured.structuralModelId === "none-v1"
    ) ||
    (
      settings.attributeOptimizerId === "zx-structured-global-v3" &&
      settings.ditherEngineId === "ordered-cell-pattern-v3" &&
      settings.structured.ditherResponseCurveId === "power-035-percent-v2" &&
      settings.structured.colorAnchorModelId === "srgb-squared-v1" &&
      settings.structured.structuralModelId === "none-v1"
    ) ||
    (
      settings.attributeOptimizerId === "zx-structured-global-v4" &&
      settings.ditherEngineId === "ordered-cell-pattern-v4" &&
      settings.structured.ditherResponseCurveId === "power-035-percent-v2" &&
      settings.structured.colorAnchorModelId === "srgb-squared-v1" &&
      settings.structured.structuralModelId === "palette-topology-v1"
    )
  ) {
    const structured = convertStructuredZx(
      normalized,
      cellHeight,
      new Set(paletteSelection(settings, 0).enabledColorIds),
      zxBrightMode(settings),
      settings.structured.ditherAmountPermille,
      settings.orderedMatrix,
      settings.structured,
      level,
    );
    const previewRgba = renderAttributeFrameRgba(
      structured.pixels,
      structured.attributes,
      cellHeight,
    );
    const encoded = serializeSoftwareScr(
      structured.pixels,
      structured.attributes,
      cellHeight,
    );
    return {
      platformId: "zx-spectrum",
      modeId: "zx48-standard-256x192",
      width: ZX_SCREEN_WIDTH,
      height: ZX_SCREEN_HEIGHT,
      pixelAspectRatio: 1,
      attributeOptimizerId: settings.attributeOptimizerId,
      ditherEngineId: settings.ditherEngineId,
      paletteSelections: settings.paletteSelections,
      frames: [{
        hardwareModeId: "zx48-standard-256x192",
        nativeWidth: ZX_SCREEN_WIDTH,
        nativeHeight: ZX_SCREEN_HEIGHT,
        nativePixelAspectRatio: 1,
        encoded,
        paletteIndices: Uint8Array.from(structured.pixels),
        previewRgba,
      }],
      preConstraintPreviewRgba: renderGuideRgba(structured.guideKeys),
      mergedPreviewRgba: previewRgba,
      screen: {
        pixels: structured.pixels,
        attributes: structured.attributes,
      },
      pixels: structured.pixels,
      attributes: structured.attributes,
      attributeHeight: cellHeight,
      sourcePreviewRgba: normalized,
      previewRgba,
      score: structured.score,
      structuredDiagnostics: structured.diagnostics,
    };
  }
  const attributeRows = ZX_SCREEN_HEIGHT / cellHeight;
  const attributes = new Uint8Array(ZX_ATTRIBUTE_COLUMNS * attributeRows);
  const cellPixels = CELL_WIDTH * cellHeight;

  const enabledColors = new Set(paletteSelection(settings, 0).enabledColorIds);
  const paletteColorEnabled = (code: number) => enabledColors.has(code);
  const usesTwoPassDither =
    settings.dithering !== "none" && settings.ditheringAmount > 0;
  const matrixGuided = settings.ditherEngineId === "error-diffusion-matrix-guided-v1";
  const checkerPlacementV31 = settings.ditherEngineId === "error-diffusion-phase-balanced-checker-v3-1";
  const checkerPlacementV32 = settings.ditherEngineId === "error-diffusion-phase-balanced-checker-v3-2";
  const checkerPlacementV33 = settings.ditherEngineId === "error-diffusion-phase-balanced-checker-v3-3";
  const checkerPhaseV41 = settings.ditherEngineId === "error-diffusion-checker-phase-v4-1";
  let artifactCorrection: ZxConversionResult["artifactCorrection"];
  let checkerPlacementDiagnostics: ZxConversionResult["checkerPlacementDiagnostics"];
  const usesDiscreteNoDither =
    settings.ditherEngineId === "none-discrete-v2" ||
    (settings.ditherEngineId !== "none-v1" && settings.ditheringAmount === 0);

  if (!usesTwoPassDither && !usesDiscreteNoDither) {
    for (let cellY = 0; cellY < attributeRows; cellY += 1) {
      for (let cellX = 0; cellX < ZX_ATTRIBUTE_COLUMNS; cellX += 1) {
      let draftBright = false;
      if (level === "draft") {
        let intensitySum = 0;
        for (let localY = 0; localY < cellHeight; localY += 1) {
          for (let localX = 0; localX < CELL_WIDTH; localX += 1) {
            const offset = (
              (cellY * cellHeight + localY) * ZX_SCREEN_WIDTH +
              cellX * CELL_WIDTH + localX
            ) * 4;
            intensitySum += Math.max(
              normalized[offset] ?? 0,
              normalized[offset + 1] ?? 0,
              normalized[offset + 2] ?? 0,
            );
          }
        }
        draftBright = intensitySum >= 224 * cellPixels;
      }
      let bestScore = Number.POSITIVE_INFINITY;
      let bestAttribute = 0;
      for (let attribute = 0; attribute < 128; attribute += 1) {
        const inkCode = attribute & 7;
        const paperCode = (attribute >> 3) & 7;
        if (inkCode < paperCode) continue;
        const bright = (attribute & 0x40) !== 0;
        if (zxBrightMode(settings) === "on" && !bright) continue;
        if (zxBrightMode(settings) === "off" && bright) continue;
        if (
          zxBrightMode(settings) === "auto" && level === "draft" &&
          bright !== draftBright
        ) continue;
        if (!paletteColorEnabled(inkCode) || !paletteColorEnabled(paperCode)) continue;
        const ink = zxColor(inkCode, bright);
        const paper = zxColor(paperCode, bright);
        const score = evaluatePaletteCandidate(
          normalized,
          cellX,
          cellY,
          cellHeight,
          ink,
          paper,
        );
        if (score < bestScore) {
          bestScore = score;
          bestAttribute = attribute;
        }
      }
        const cellOffset = cellY * ZX_ATTRIBUTE_COLUMNS + cellX;
        attributes[cellOffset] = bestAttribute;
      }
    }
  }
  let pixels: Uint8Array;
  let guideKeys = nearestGuideKeys(normalized, settings);
  if (usesTwoPassDither) {
    const draftBrightCells = calculateDraftBrightCells(normalized, cellHeight);
    const usesUnrestrictedGuide =
      settings.ditherEngineId === "ordered-unrestricted-v2" ||
      settings.ditherEngineId === "ordered-local-tone-v3" ||
      settings.ditherEngineId === "ordered-palette-pairs-v4" ||
      settings.ditherEngineId === "ordered-baseline-additive-v5" ||
      settings.ditherEngineId === "ordered-strict-matrix-v6" ||
      settings.ditherEngineId === "ordered-coverage-normalized-v7" ||
      settings.ditherEngineId === "ordered-clustered-dot-v1" ||
      settings.ditherEngineId === "ordered-void-cluster-v1" ||
      settings.ditherEngineId === "pattern-legal-mask-dbs-v1" ||
      settings.ditherEngineId === "artistic-ordered-hybrid-v1" ||
      settings.ditherEngineId === "error-diffusion-unrestricted-v2" ||
      settings.ditherEngineId === "error-diffusion-phase-balanced-v3" ||
      settings.ditherEngineId === "error-diffusion-phase-balanced-checker-v3-1" ||
      settings.ditherEngineId === "error-diffusion-phase-balanced-checker-v3-2" ||
      settings.ditherEngineId === "error-diffusion-phase-balanced-checker-v3-3" ||
      settings.ditherEngineId === "error-diffusion-checker-phase-v4" ||
      settings.ditherEngineId === "error-diffusion-checker-phase-v4-1" ||
      settings.ditherEngineId === "error-diffusion-checker-phase-v4-2" ||
      settings.ditherEngineId === "error-diffusion-checker-phase-v4-3" ||
      settings.ditherEngineId === "error-diffusion-checker-phase-v5" ||
      settings.ditherEngineId === "error-diffusion-matrix-guided-v1" ||
      settings.ditherEngineId === "error-diffusion-decorrelated-v3" ||
      settings.ditherEngineId === "error-diffusion-atkinson-v1" ||
      settings.ditherEngineId === "error-diffusion-riemersma-v1";
    const localAttributes = usesUnrestrictedGuide
      ? null
      : selectLocalPalettePairs(
          normalized,
          cellHeight,
          settings,
          level,
          enabledColors,
          draftBrightCells,
        );
    // Artistic v1 owns placement, but deliberately uses the promoted Bayer
    // 4×4 guide for Halo pair selection. That makes its legal pair and BRIGHT
    // decisions comparable with the ordered baseline instead of introducing a
    // second, hidden colour-balance model.
    const matrix = ORDERED_MATRICES[settings.ditherEngineId === "artistic-ordered-hybrid-v1"
      ? "bayer-4x4"
      : settings.orderedMatrix];
    guideKeys = settings.dithering === "error-diffusion"
      ? renderLocalErrorDiffusion(
          normalized,
          localAttributes,
          settings.ditheringAmount,
          settings.errorDiffusionRandomization,
          enabledColors,
          zxBrightMode(settings),
          settings.ditherEngineId,
          settings.errorDiffusionLineSuppression,
        )
      : settings.ditherEngineId === "ordered-coverage-normalized-v7"
      ? renderCoverageNormalizedOrderedDither(
          normalized,
          matrix,
          settings.ditheringAmount,
          enabledColors,
          zxBrightMode(settings),
        )
      : renderLocalOrderedDither(
          normalized,
          localAttributes,
          matrix,
          settings.ditheringAmount,
          enabledColors,
          zxBrightMode(settings),
        );
    const optimizer = settings.attributeOptimizerId;
    if (optimizer === "zx-source-cell-v1") {
      attributes.set(selectAttributesFromGuide(
        normalized,
        nearestGuideKeys(normalized, settings),
        cellHeight,
        settings,
        level,
        enabledColors,
        draftBrightCells,
      ));
      pixels = remapLocalColors(normalized, guideKeys, attributes, cellHeight);
    } else if (
      optimizer === "zx-guide-reference-halo-v1" ||
      optimizer === "zx-guide-reference-halo-v2" ||
      optimizer === "zx-guide-reference-rgb-halo-v3" ||
      optimizer === "zx-block-dbs-global-v1" ||
      (optimizer === "zx-adaptive-v1" && settings.dithering === "error-diffusion")
    ) {
      attributes.set(
        optimizer === "zx-guide-reference-rgb-halo-v3"
          ? selectRgbGuardedHaloAttributes(
              normalized,
              guideKeys,
              cellHeight,
              settings,
              level,
              enabledColors,
              draftBrightCells,
            )
          : selectReferenceAttributesFromGuide(
              normalized,
              guideKeys,
              cellHeight,
              settings,
              level,
              enabledColors,
              draftBrightCells,
            ),
      );
      pixels = remapReferenceGuide(
        guideKeys,
        attributes,
        cellHeight,
        matrixGuided ? matrix : null,
      );
      if (optimizer === "zx-block-dbs-global-v1") {
        pixels = optimizeLegalMaskDbs(
          normalized,
          pixels,
          attributes,
          cellHeight,
          settings,
          level,
          enabledColors,
          draftBrightCells,
        );
      }
    } else {
      attributes.set(selectAttributesFromGuide(
        normalized,
        guideKeys,
        cellHeight,
        settings,
        level,
        enabledColors,
        draftBrightCells,
      ));
      pixels = remapLocalColors(
        normalized,
        guideKeys,
        attributes,
        cellHeight,
      );
    }
    if (checkerPhaseV41) {
      const corrected = checkerPhaseArtifactCorrection(
        normalized,
        guideKeys,
        attributes,
        cellHeight,
        pixels,
      );
      pixels = corrected.pixels;
      artifactCorrection = {
        correctedPixelCount: corrected.correctedPixelCount,
        totalArtifactScore: corrected.totalArtifactScore,
      };
    }
    if (checkerPlacementV31) {
      const placement = applyCheckerPlacement(
        normalized,
        pixels,
        ZX_SCREEN_WIDTH,
        ZX_SCREEN_HEIGHT,
        settings.errorDiffusionLineSuppression / 100,
        (x, y) => {
          const attribute = attributes[
            Math.floor(y / cellHeight) * ZX_ATTRIBUTE_COLUMNS + Math.floor(x / CELL_WIDTH)
          ] ?? 0;
          const colors = decodeAttribute(attribute);
          return { paper: colors.paper, ink: colors.ink, key: attribute };
        },
        CELL_WIDTH,
        cellHeight,
      );
      pixels = placement.pixels;
    }
    if (checkerPlacementV32) {
      const checkerResult = renderCheckerPlacementV32(
        normalized,
        pixels,
        attributes,
        cellHeight,
        settings.ditheringAmount,
        settings.errorDiffusionRandomization,
        settings.errorDiffusionLineSuppression,
      );
      pixels = checkerResult.pixels;
      if (checkerResult.plan !== null) {
        checkerPlacementDiagnostics = {
          changedPixels: checkerResult.plan.changedPixels,
          changedBlocks: checkerResult.plan.changedBlocks,
          fullBlocks: checkerResult.plan.fullBlocks,
          eligibleBlocks: checkerResult.plan.eligibleBlocks,
          intermediateCoverageBlocks: checkerResult.plan.intermediateCoverageBlocks,
          checkerCandidateCount: checkerResult.plan.checkerCandidateCount,
          sourceRejectedCandidates: checkerResult.plan.sourceRejectedCandidates,
          structureRejectedCandidates: checkerResult.plan.structureRejectedCandidates,
          edgeRejectedBlocks: checkerResult.plan.edgeRejectedBlocks,
          acceptedCheckerBlocks: checkerResult.plan.acceptedCheckerBlocks,
        };
      }
    }
    if (checkerPlacementV33) {
      const checkerResult = renderCheckerPlacementV33(
        normalized,
        pixels,
        attributes,
        cellHeight,
        settings.ditheringAmount,
        settings.errorDiffusionRandomization,
        settings.errorDiffusionLineSuppression,
      );
      pixels = checkerResult.pixels;
      if (checkerResult.plan !== null) {
        checkerPlacementDiagnostics = {
          changedPixels: checkerResult.plan.changedPixels,
          changedBlocks: checkerResult.plan.changedBlocks,
          fullBlocks: checkerResult.plan.fullBlocks,
          eligibleBlocks: checkerResult.plan.eligibleBlocks,
          intermediateCoverageBlocks: checkerResult.plan.intermediateCoverageBlocks,
          checkerCandidateCount: checkerResult.plan.checkerCandidateCount,
          sourceRejectedCandidates: checkerResult.plan.sourceRejectedCandidates,
          structureRejectedCandidates: checkerResult.plan.structureRejectedCandidates,
          edgeRejectedBlocks: checkerResult.plan.edgeRejectedBlocks,
          acceptedCheckerBlocks: checkerResult.plan.acceptedCheckerBlocks,
          phaseReorientedBlocks: checkerResult.plan.phaseReorientedBlocks,
        };
      }
    }
  } else if (usesDiscreteNoDither) {
    const draftBrightCells = calculateDraftBrightCells(normalized, cellHeight);
    if (settings.attributeOptimizerId === "zx-source-cell-v1") {
      attributes.set(selectDiscreteAttributesFromSource(
        normalized,
        cellHeight,
        settings,
        level,
        enabledColors,
        draftBrightCells,
      ));
      pixels = remapLocalColors(normalized, guideKeys, attributes, cellHeight);
    } else if (
      settings.attributeOptimizerId === "zx-guide-reference-halo-v1" ||
      settings.attributeOptimizerId === "zx-guide-reference-halo-v2" ||
      settings.attributeOptimizerId === "zx-guide-reference-rgb-halo-v3" ||
      settings.attributeOptimizerId === "zx-block-dbs-global-v1"
    ) {
      attributes.set(
        settings.attributeOptimizerId === "zx-guide-reference-rgb-halo-v3"
          ? selectRgbGuardedHaloAttributes(
              normalized,
              guideKeys,
              cellHeight,
              settings,
              level,
              enabledColors,
              draftBrightCells,
            )
          : selectReferenceAttributesFromGuide(
              normalized,
              guideKeys,
              cellHeight,
              settings,
              level,
              enabledColors,
              draftBrightCells,
            ),
      );
      pixels = remapReferenceGuide(guideKeys, attributes, cellHeight);
    } else {
      attributes.set(selectAttributesFromGuide(
        normalized,
        guideKeys,
        cellHeight,
        settings,
        level,
        enabledColors,
        draftBrightCells,
        true,
      ));
      pixels = remapLocalColors(normalized, guideKeys, attributes, cellHeight);
    }
  } else {
    pixels = renderPixels(normalized, attributes, cellHeight, settings);
  }
  if (settings.ditherEngineId === "artistic-ordered-hybrid-v1" && settings.ditheringAmount > 0) {
    pixels = renderArtisticOrdered(
      normalized, attributes, cellHeight, settings.ditheringAmount,
      settings.artisticPattern, pixels,
    );
  }
  const totalScore = calculateRenderCost(
    normalized,
    pixels,
    attributes,
    cellHeight,
    settings,
  );
  const screen: ZxScreen = { pixels, attributes };
  if (cellHeight === 8) assertValidScreen(screen);
  const previewRgba = renderAttributeFrameRgba(pixels, attributes, cellHeight);
  const encoded = serializeSoftwareScr(pixels, attributes, cellHeight);
  return {
    platformId: "zx-spectrum",
    modeId: "zx48-standard-256x192",
    width: ZX_SCREEN_WIDTH,
    height: ZX_SCREEN_HEIGHT,
    pixelAspectRatio: 1,
    attributeOptimizerId: settings.attributeOptimizerId,
    ditherEngineId: settings.ditherEngineId,
    paletteSelections: settings.paletteSelections,
    frames: [{
      hardwareModeId: "zx48-standard-256x192",
      nativeWidth: ZX_SCREEN_WIDTH,
      nativeHeight: ZX_SCREEN_HEIGHT,
      nativePixelAspectRatio: 1,
      encoded,
      paletteIndices: Uint8Array.from(pixels),
      previewRgba,
    }],
    preConstraintPreviewRgba: renderGuideRgba(guideKeys),
    mergedPreviewRgba: previewRgba,
    screen,
    pixels,
    attributes,
    attributeHeight: cellHeight,
    sourcePreviewRgba: normalized,
    previewRgba,
    score: Math.floor(totalScore / COST_SCALE),
    ...(artifactCorrection === undefined ? {} : { artifactCorrection }),
    ...(checkerPlacementDiagnostics === undefined ? {} : { checkerPlacementDiagnostics }),
  };
}
