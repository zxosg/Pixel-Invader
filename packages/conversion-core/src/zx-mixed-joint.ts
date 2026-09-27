import {
  ZX_ATTRIBUTE_COLUMNS,
  ZX_SCREEN_HEIGHT,
  ZX_SCREEN_WIDTH,
} from "@retro-converter/zx-spectrum";
import { zxColor } from "./palette.js";
import {
  paletteSelection,
  zxBrightMode,
} from "./palette-selections.js";
import {
  quantizeTemporalVirtual,
  type TemporalVirtualColor,
} from "./ql-convert.js";
import type {
  BrightMode,
  ConversionSettings,
  RgbColor,
} from "./types.js";

const CELL_WIDTH = 8;
// Keep enough alternatives for the neighborhood objective to trade a modest
// local color error for a substantially cleaner cell boundary. The reduced
// palette case has very few legal candidates, so a 64-entry shortlist is
// effectively exhaustive there.
const SPATIAL_SHORTLIST_SIZE = 64;
const SPATIAL_EDGE_TOLERANCE = 8;
const SPATIAL_EDGE_WEIGHT = 1.5;
const SPATIAL_BRIGHT_ATTRIBUTE_WEIGHT = 0.15;
const SPATIAL_SWEEPS = 6;
const QUANTIZED_SPATIAL_SHORTLIST_SIZE = 64;

export interface JointMixedPhysicalColor extends RgbColor {
  readonly code: number;
  readonly bright: boolean;
}

export interface JointMixedCandidate {
  readonly firstAttribute: number;
  readonly secondAttribute: number;
  /** Choices are ordered paper/paper, paper/ink, ink/paper, ink/ink. */
  readonly blendPaletteIndices: readonly [number, number, number, number];
}

export interface JointMixedFrames {
  readonly firstPixels: Uint8Array;
  readonly firstAttributes: Uint8Array;
  readonly secondPixels: Uint8Array;
  readonly secondAttributes: Uint8Array;
}

export interface JointMixedQuantizedCellScore {
  readonly score: number;
  /** Mean of the actual quantized merged colors on top, bottom, left, right. */
  readonly borders: Float32Array;
}

interface JointCellOption {
  readonly candidate: JointMixedCandidate;
  readonly dataCost: number;
  /** Mean projected merged RGB for top, bottom, left, and right cell edges. */
  readonly borders: Float32Array;
}

function enabledBrightValues(mode: BrightMode): readonly boolean[] {
  return mode === "on" ? [true] : mode === "off" ? [false] : [false, true];
}

export function buildJointMixedPhysicalPalette(
  settings: ConversionSettings,
  screenIndex: 0 | 1,
): readonly JointMixedPhysicalColor[] {
  const selection = paletteSelection(settings, screenIndex);
  const brightValues = enabledBrightValues(zxBrightMode(settings, screenIndex));
  return brightValues.flatMap((bright) =>
    selection.enabledColorIds.map((code) => ({
      ...zxColor(code, bright),
      code,
      bright,
    }))
  );
}

function attributePairs(
  palette: readonly JointMixedPhysicalColor[],
): readonly {
  attribute: number;
  ink: JointMixedPhysicalColor;
  paper: JointMixedPhysicalColor;
  inkIndex: number;
  paperIndex: number;
}[] {
  const pairs: {
    attribute: number;
    ink: JointMixedPhysicalColor;
    paper: JointMixedPhysicalColor;
    inkIndex: number;
    paperIndex: number;
  }[] = [];
  const brightnessGroups = [...new Set(palette.map((color) => color.bright))];
  for (const bright of brightnessGroups) {
    const colors = palette.flatMap((color, paletteIndex) =>
      color.bright === bright ? [{ color, paletteIndex }] : []
    );
    for (let pairInkIndex = 0; pairInkIndex < colors.length; pairInkIndex += 1) {
      const { color: ink, paletteIndex: inkIndex } = colors[pairInkIndex]!;
      for (let pairPaperIndex = pairInkIndex; pairPaperIndex < colors.length; pairPaperIndex += 1) {
        const { color: paper, paletteIndex: paperIndex } = colors[pairPaperIndex]!;
        pairs.push({
          attribute: ink.code | (paper.code << 3) | (bright ? 0x40 : 0),
          ink,
          paper,
          inkIndex,
          paperIndex,
        });
      }
    }
  }
  return pairs;
}

function colorKey(color: RgbColor): string {
  return `${color.r},${color.g},${color.b}`;
}

function candidateKey(
  blendPaletteIndices: readonly number[],
  virtualPalette: readonly TemporalVirtualColor[],
): string {
  return blendPaletteIndices
    .map((index) => colorKey(virtualPalette[index]!))
    .sort()
    .join("|");
}

/** Builds unique four-blend cell candidates from the selected physical palettes. */
export function buildJointMixedCandidates(
  firstPalette: readonly JointMixedPhysicalColor[],
  secondPalette: readonly JointMixedPhysicalColor[],
  virtualPalette: readonly TemporalVirtualColor[],
): readonly JointMixedCandidate[] {
  const firstPairs = attributePairs(firstPalette);
  const secondPairs = attributePairs(secondPalette);
  const virtualIndexByPair = new Map<string, number>();
  for (let index = 0; index < virtualPalette.length; index += 1) {
    const color = virtualPalette[index]!;
    virtualIndexByPair.set(`${color.first}:${color.second}`, index);
  }

  const candidates: JointMixedCandidate[] = [];
  const seen = new Set<string>();
  for (const first of firstPairs) {
    for (const second of secondPairs) {
      const blendPaletteIndices = [
        virtualIndexByPair.get(`${first.paperIndex}:${firstPalette.length + second.paperIndex}`)!,
        virtualIndexByPair.get(`${first.paperIndex}:${firstPalette.length + second.inkIndex}`)!,
        virtualIndexByPair.get(`${first.inkIndex}:${firstPalette.length + second.paperIndex}`)!,
        virtualIndexByPair.get(`${first.inkIndex}:${firstPalette.length + second.inkIndex}`)!,
      ] as const;
      if (blendPaletteIndices.some((index) => index === undefined)) {
        throw new RangeError("Temporal palette is missing a legal frame-color pair.");
      }
      const key = candidateKey(blendPaletteIndices, virtualPalette);
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({
        firstAttribute: first.attribute,
        secondAttribute: second.attribute,
        blendPaletteIndices,
      });
    }
  }
  return candidates;
}

function squaredRgbDistance(
  source: Uint8Array,
  sourceOffset: number,
  color: TemporalVirtualColor,
): number {
  const dr = (source[sourceOffset] ?? 0) - color.r;
  const dg = (source[sourceOffset + 1] ?? 0) - color.g;
  const db = (source[sourceOffset + 2] ?? 0) - color.b;
  return dr * dr + dg * dg + db * db;
}

function diffuseCellError(
  errors: Float32Array,
  x: number,
  y: number,
  cellHeight: number,
  weight: number,
  scale: number,
  errorR: number,
  errorG: number,
  errorB: number,
): void {
  if (x < 0 || x >= CELL_WIDTH || y < 0 || y >= cellHeight) return;
  const offset = (y * CELL_WIDTH + x) * 3;
  const factor = weight / 16 * scale;
  errors[offset] = errors[offset]! + errorR * factor;
  errors[offset + 1] = errors[offset + 1]! + errorG * factor;
  errors[offset + 2] = errors[offset + 2]! + errorB * factor;
}

/** Exact per-cell search with cached pixel/blend distances and early abandonment. */
export function findBestJointMixedCandidate(
  source: Uint8Array,
  pixelOffsets: readonly number[],
  candidates: readonly JointMixedCandidate[],
  virtualPalette: readonly TemporalVirtualColor[],
): JointMixedCandidate {
  if (candidates.length === 0) throw new RangeError("No legal joint Mixed candidates.");
  const distances = new Float32Array(pixelOffsets.length * virtualPalette.length);
  for (let pixel = 0; pixel < pixelOffsets.length; pixel += 1) {
    const sourceOffset = pixelOffsets[pixel]!;
    const rowOffset = pixel * virtualPalette.length;
    for (let color = 0; color < virtualPalette.length; color += 1) {
      distances[rowOffset + color] = squaredRgbDistance(
        source,
        sourceOffset,
        virtualPalette[color]!,
      );
    }
  }

  let bestCandidate = candidates[0]!;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    let score = 0;
    for (let pixel = 0; pixel < pixelOffsets.length; pixel += 1) {
      const rowOffset = pixel * virtualPalette.length;
      const [a, b, c, d] = candidate.blendPaletteIndices;
      score += Math.min(
        distances[rowOffset + a]!,
        distances[rowOffset + b]!,
        distances[rowOffset + c]!,
        distances[rowOffset + d]!,
      );
      if (score >= bestScore) break;
    }
    if (score < bestScore) {
      bestCandidate = candidate;
      bestScore = score;
    }
  }
  return bestCandidate;
}

function nearestBlendIndex(
  source: Uint8Array,
  sourceOffset: number,
  candidate: JointMixedCandidate,
  virtualPalette: readonly TemporalVirtualColor[],
): number {
  let bestIndex = candidate.blendPaletteIndices[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const index of candidate.blendPaletteIndices) {
    const distance = squaredRgbDistance(source, sourceOffset, virtualPalette[index]!);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function edgeMeans(
  source: Uint8Array,
  cellX: number,
  cellY: number,
  cellHeight: number,
  candidate?: JointMixedCandidate,
  virtualPalette?: readonly TemporalVirtualColor[],
): Float32Array {
  const means = new Float32Array(12);
  const counts = [0, 0, 0, 0];
  for (let y = 0; y < cellHeight; y += 1) {
    for (let x = 0; x < CELL_WIDTH; x += 1) {
      const sourceOffset = ((cellY * cellHeight + y) * ZX_SCREEN_WIDTH + cellX * CELL_WIDTH + x) * 4;
      const color = candidate === undefined || virtualPalette === undefined
        ? {
          r: source[sourceOffset] ?? 0,
          g: source[sourceOffset + 1] ?? 0,
          b: source[sourceOffset + 2] ?? 0,
        }
        : virtualPalette[nearestBlendIndex(source, sourceOffset, candidate, virtualPalette)]!;
      if (y === 0) {
        means[0] = means[0]! + color.r; means[1] = means[1]! + color.g; means[2] = means[2]! + color.b; counts[0] = counts[0]! + 1;
      }
      if (y === cellHeight - 1) {
        means[3] = means[3]! + color.r; means[4] = means[4]! + color.g; means[5] = means[5]! + color.b; counts[1] = counts[1]! + 1;
      }
      if (x === 0) {
        means[6] = means[6]! + color.r; means[7] = means[7]! + color.g; means[8] = means[8]! + color.b; counts[2] = counts[2]! + 1;
      }
      if (x === CELL_WIDTH - 1) {
        means[9] = means[9]! + color.r; means[10] = means[10]! + color.g; means[11] = means[11]! + color.b; counts[3] = counts[3]! + 1;
      }
    }
  }
  for (let side = 0; side < 4; side += 1) {
    const count = counts[side] || 1;
    for (let channel = 0; channel < 3; channel += 1) {
      const index = side * 3 + channel;
      means[index] = (means[index] ?? 0) / count;
    }
  }
  return means;
}

/** Scores one candidate using cell-local serpentine dual-frame Floyd–Steinberg. */
export function scoreJointMixedCandidateWithDualFs(
  source: Uint8Array,
  pixelOffsets: readonly number[],
  candidate: JointMixedCandidate,
  virtualPalette: readonly TemporalVirtualColor[],
  cellHeight: number,
  amount: number,
  scoreLimit = Number.POSITIVE_INFINITY,
): JointMixedQuantizedCellScore | null {
  if (pixelOffsets.length !== CELL_WIDTH * cellHeight) {
    throw new RangeError("Joint Mixed cell offsets must match the 8×attribute-height cell.");
  }
  const errors = new Float32Array(pixelOffsets.length * 3);
  const selectedColors = new Uint8Array(pixelOffsets.length);
  const [a, b, c, d] = candidate.blendPaletteIndices;
  const blendIndices = [a, b, c, d] as const;
  const scale = Math.max(0, Math.min(100, amount)) / 100;
  let score = 0;

  for (let y = 0; y < cellHeight; y += 1) {
    const reverse = (y & 1) === 1;
    for (let step = 0; step < CELL_WIDTH; step += 1) {
      const x = reverse ? CELL_WIDTH - 1 - step : step;
      const pixel = y * CELL_WIDTH + x;
      const sourceOffset = pixelOffsets[pixel]!;
      const errorOffset = pixel * 3;
      const sourceR = source[sourceOffset] ?? 0;
      const sourceG = source[sourceOffset + 1] ?? 0;
      const sourceB = source[sourceOffset + 2] ?? 0;
      const correctedR = Math.max(0, Math.min(255, sourceR + errors[errorOffset]!));
      const correctedG = Math.max(0, Math.min(255, sourceG + errors[errorOffset + 1]!));
      const correctedB = Math.max(0, Math.min(255, sourceB + errors[errorOffset + 2]!));
      let choice = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let option = 0; option < blendIndices.length; option += 1) {
        const color = virtualPalette[blendIndices[option]!]!;
        const dr = correctedR - color.r;
        const dg = correctedG - color.g;
        const db = correctedB - color.b;
        const distance = dr * dr + dg * dg + db * db;
        if (distance < bestDistance) {
          bestDistance = distance;
          choice = option;
        }
      }
      selectedColors[pixel] = choice;
      const color = virtualPalette[blendIndices[choice]!]!;
      score += squaredRgbDistance(source, sourceOffset, color);
      if (score > scoreLimit) return null;
      const direction = reverse ? -1 : 1;
      const errorR = correctedR - color.r;
      const errorG = correctedG - color.g;
      const errorB = correctedB - color.b;
      diffuseCellError(errors, x + direction, y, cellHeight, 7, scale, errorR, errorG, errorB);
      diffuseCellError(errors, x - direction, y + 1, cellHeight, 3, scale, errorR, errorG, errorB);
      diffuseCellError(errors, x, y + 1, cellHeight, 5, scale, errorR, errorG, errorB);
      diffuseCellError(errors, x + direction, y + 1, cellHeight, 1, scale, errorR, errorG, errorB);
    }
  }

  const borders = new Float32Array(12);
  const counts = [0, 0, 0, 0];
  for (let y = 0; y < cellHeight; y += 1) {
    for (let x = 0; x < CELL_WIDTH; x += 1) {
      const color = virtualPalette[blendIndices[selectedColors[y * CELL_WIDTH + x]!]!]!;
      if (y === 0) {
        borders[0] = borders[0]! + color.r; borders[1] = borders[1]! + color.g; borders[2] = borders[2]! + color.b; counts[0] = counts[0]! + 1;
      }
      if (y === cellHeight - 1) {
        borders[3] = borders[3]! + color.r; borders[4] = borders[4]! + color.g; borders[5] = borders[5]! + color.b; counts[1] = counts[1]! + 1;
      }
      if (x === 0) {
        borders[6] = borders[6]! + color.r; borders[7] = borders[7]! + color.g; borders[8] = borders[8]! + color.b; counts[2] = counts[2]! + 1;
      }
      if (x === CELL_WIDTH - 1) {
        borders[9] = borders[9]! + color.r; borders[10] = borders[10]! + color.g; borders[11] = borders[11]! + color.b; counts[3] = counts[3]! + 1;
      }
    }
  }
  for (let side = 0; side < 4; side += 1) {
    for (let channel = 0; channel < 3; channel += 1) {
      const offset = side * 3 + channel;
      borders[offset] = (borders[offset] ?? 0) / (counts[side] || 1);
    }
  }
  return { score, borders };
}

function rankJointCellOptions(
  source: Uint8Array,
  pixelOffsets: readonly number[],
  candidates: readonly JointMixedCandidate[],
  virtualPalette: readonly TemporalVirtualColor[],
  cellX: number,
  cellY: number,
  cellHeight: number,
): readonly JointCellOption[] {
  const distances = new Float32Array(pixelOffsets.length * virtualPalette.length);
  for (let pixel = 0; pixel < pixelOffsets.length; pixel += 1) {
    const sourceOffset = pixelOffsets[pixel]!;
    const rowOffset = pixel * virtualPalette.length;
    for (let color = 0; color < virtualPalette.length; color += 1) {
      distances[rowOffset + color] = squaredRgbDistance(source, sourceOffset, virtualPalette[color]!);
    }
  }

  const ranked: { candidateIndex: number; score: number }[] = [];
  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const candidate = candidates[candidateIndex]!;
    let score = 0;
    for (let pixel = 0; pixel < pixelOffsets.length; pixel += 1) {
      const rowOffset = pixel * virtualPalette.length;
      const [a, b, c, d] = candidate.blendPaletteIndices;
      score += Math.min(
        distances[rowOffset + a]!,
        distances[rowOffset + b]!,
        distances[rowOffset + c]!,
        distances[rowOffset + d]!,
      );
      const worst = ranked.length < SPATIAL_SHORTLIST_SIZE
        ? Number.POSITIVE_INFINITY
        : ranked[ranked.length - 1]!.score;
      if (score > worst) break;
    }
    if (ranked.length === SPATIAL_SHORTLIST_SIZE && score > ranked[ranked.length - 1]!.score) continue;
    let insertion = ranked.findIndex((entry) =>
      score < entry.score || (score === entry.score && candidateIndex < entry.candidateIndex)
    );
    if (insertion < 0) insertion = ranked.length;
    ranked.splice(insertion, 0, { candidateIndex, score });
    if (ranked.length > SPATIAL_SHORTLIST_SIZE) ranked.pop();
  }

  return ranked.map(({ candidateIndex, score }) => {
    const candidate = candidates[candidateIndex]!;
    return {
      candidate,
      dataCost: score,
      borders: edgeMeans(source, cellX, cellY, cellHeight, candidate, virtualPalette),
    };
  });
}

function rankQuantizedJointCellOptions(
  source: Uint8Array,
  pixelOffsets: readonly number[],
  candidates: readonly JointMixedCandidate[],
  virtualPalette: readonly TemporalVirtualColor[],
  cellX: number,
  cellY: number,
  cellHeight: number,
  ditheringAmount: number,
): readonly JointCellOption[] {
  const nearestRanked = rankJointCellOptions(
    source,
    pixelOffsets,
    candidates,
    virtualPalette,
    cellX,
    cellY,
    cellHeight,
  );
  const quantizedRanked: { option: JointCellOption; nearestRank: number }[] = [];
  for (let nearestRank = 0; nearestRank < nearestRanked.length; nearestRank += 1) {
    const nearestOption = nearestRanked[nearestRank]!;
    const scoreLimit = quantizedRanked.length < QUANTIZED_SPATIAL_SHORTLIST_SIZE
      ? Number.POSITIVE_INFINITY
      : quantizedRanked[quantizedRanked.length - 1]!.option.dataCost;
    const quantized = scoreJointMixedCandidateWithDualFs(
      source,
      pixelOffsets,
      nearestOption.candidate,
      virtualPalette,
      cellHeight,
      ditheringAmount,
      scoreLimit,
    );
    if (quantized === null) continue;
    const option: JointCellOption = {
      candidate: nearestOption.candidate,
      dataCost: quantized.score,
      borders: quantized.borders,
    };
    const insertion = quantizedRanked.findIndex((entry) =>
      option.dataCost < entry.option.dataCost ||
      (option.dataCost === entry.option.dataCost && nearestRank < entry.nearestRank)
    );
    quantizedRanked.splice(
      insertion < 0 ? quantizedRanked.length : insertion,
      0,
      { option, nearestRank },
    );
    if (quantizedRanked.length > QUANTIZED_SPATIAL_SHORTLIST_SIZE) quantizedRanked.pop();
  }
  return quantizedRanked.map(({ option }) => option);
}

function spatialEdgePenalty(
  first: Float32Array,
  firstSide: number,
  second: Float32Array,
  secondSide: number,
  sourceFirst: Float32Array,
  sourceFirstSide: number,
  sourceSecond: Float32Array,
  sourceSecondSide: number,
  edgeLength: number,
): number {
  let residualSquared = 0;
  for (let channel = 0; channel < 3; channel += 1) {
    const predictedDelta = second[secondSide * 3 + channel]! - first[firstSide * 3 + channel]!;
    const sourceDelta = sourceSecond[sourceSecondSide * 3 + channel]! - sourceFirst[sourceFirstSide * 3 + channel]!;
    const residual = predictedDelta - sourceDelta;
    residualSquared += residual * residual;
  }
  const residual = Math.sqrt(residualSquared);
  const excess = Math.max(0, residual - SPATIAL_EDGE_TOLERANCE);
  return SPATIAL_EDGE_WEIGHT * edgeLength * excess * excess;
}

function optimizeSpatiallyRegularizedCandidates(
  source: Uint8Array,
  settings: ConversionSettings,
  candidates: readonly JointMixedCandidate[],
  virtualPalette: readonly TemporalVirtualColor[],
  rankOptions: (
    source: Uint8Array,
    pixelOffsets: readonly number[],
    candidates: readonly JointMixedCandidate[],
    virtualPalette: readonly TemporalVirtualColor[],
    cellX: number,
    cellY: number,
    cellHeight: number,
    ditheringAmount: number,
  ) => readonly JointCellOption[] = (
    source,
    pixelOffsets,
    candidates,
    virtualPalette,
    cellX,
    cellY,
    cellHeight,
  ) => rankJointCellOptions(
    source,
    pixelOffsets,
    candidates,
    virtualPalette,
    cellX,
    cellY,
    cellHeight,
  ),
): readonly JointMixedCandidate[] {
  const cellHeight = settings.attributeHeight;
  const columns = ZX_ATTRIBUTE_COLUMNS;
  const rows = ZX_SCREEN_HEIGHT / cellHeight;
  const cellCount = rows * columns;
  const offsets = cellPixelOffsets(0, 0, cellHeight);
  const optionsByCell: JointCellOption[][] = new Array(cellCount);
  const sourceBorders: Float32Array[] = new Array(cellCount);
  const selected = new Uint8Array(cellCount);

  for (let cellY = 0; cellY < rows; cellY += 1) {
    for (let cellX = 0; cellX < columns; cellX += 1) {
      for (let localY = 0; localY < cellHeight; localY += 1) {
        for (let localX = 0; localX < CELL_WIDTH; localX += 1) {
          offsets[localY * CELL_WIDTH + localX] =
            ((cellY * cellHeight + localY) * ZX_SCREEN_WIDTH + cellX * CELL_WIDTH + localX) * 4;
        }
      }
      const cellIndex = cellY * columns + cellX;
      optionsByCell[cellIndex] = [...rankOptions(
        source,
        offsets,
        candidates,
        virtualPalette,
        cellX,
        cellY,
        cellHeight,
        settings.ditheringAmount,
      )];
      sourceBorders[cellIndex] = edgeMeans(source, cellX, cellY, cellHeight);
    }
  }

  const objective = (cellIndex: number, optionIndex: number): number => {
    const cellX = cellIndex % columns;
    const cellY = Math.floor(cellIndex / columns);
    const options = optionsByCell[cellIndex]!;
    const option = options[optionIndex]!;
    let cost = option.dataCost;
    const addNeighbor = (neighborX: number, neighborY: number, optionSide: number, neighborSide: number, length: number): void => {
      if (neighborX < 0 || neighborX >= columns || neighborY < 0 || neighborY >= rows) return;
      const neighborIndex = neighborY * columns + neighborX;
      const neighbor = optionsByCell[neighborIndex]![selected[neighborIndex]!]!;
      const sourceA = sourceBorders[cellIndex]!;
      const sourceB = sourceBorders[neighborIndex]!;
      cost += spatialEdgePenalty(
        option.borders,
        optionSide,
        neighbor.borders,
        neighborSide,
        sourceA,
        optionSide,
        sourceB,
        neighborSide,
        length,
      );
      const sourceDelta = Math.hypot(
        sourceB[neighborSide * 3]! - sourceA[optionSide * 3]!,
        sourceB[neighborSide * 3 + 1]! - sourceA[optionSide * 3 + 1]!,
        sourceB[neighborSide * 3 + 2]! - sourceA[optionSide * 3 + 2]!,
      );
      const flatBoundary = Math.max(0, 1 - sourceDelta / 96);
      const brightChanges =
        Number(((option.candidate.firstAttribute ^ neighbor.candidate.firstAttribute) & 0x40) !== 0) +
        Number(((option.candidate.secondAttribute ^ neighbor.candidate.secondAttribute) & 0x40) !== 0);
      cost += length * 3 * 255 * 255 * SPATIAL_BRIGHT_ATTRIBUTE_WEIGHT *
        flatBoundary * brightChanges / 2;
    };
    addNeighbor(cellX - 1, cellY, 2, 3, cellHeight);
    addNeighbor(cellX + 1, cellY, 3, 2, cellHeight);
    addNeighbor(cellX, cellY - 1, 0, 1, CELL_WIDTH);
    addNeighbor(cellX, cellY + 1, 1, 0, CELL_WIDTH);
    return cost;
  };

  for (let sweep = 0; sweep < SPATIAL_SWEEPS; sweep += 1) {
    let changed = false;
    for (let step = 0; step < cellCount; step += 1) {
      const cellIndex = sweep % 2 === 0 ? step : cellCount - 1 - step;
      const options = optionsByCell[cellIndex]!;
      let bestIndex = selected[cellIndex] ?? 0;
      let bestCost = objective(cellIndex, bestIndex);
      for (let optionIndex = 0; optionIndex < options.length; optionIndex += 1) {
        if (optionIndex === bestIndex) continue;
        const cost = objective(cellIndex, optionIndex);
        if (cost < bestCost) {
          bestIndex = optionIndex;
          bestCost = cost;
        }
      }
      if (bestIndex !== selected[cellIndex]) {
        selected[cellIndex] = bestIndex;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return optionsByCell.map((options, cellIndex) => options[selected[cellIndex] ?? 0]!.candidate);
}

function cellPixelOffsets(cellX: number, cellY: number, cellHeight: number): number[] {
  const offsets: number[] = [];
  for (let localY = 0; localY < cellHeight; localY += 1) {
    for (let localX = 0; localX < CELL_WIDTH; localX += 1) {
      offsets.push(((cellY + localY) * ZX_SCREEN_WIDTH + cellX * CELL_WIDTH + localX) * 4);
    }
  }
  return offsets;
}

function extractCellRgba(
  source: Uint8Array,
  cellX: number,
  cellY: number,
  cellHeight: number,
): Uint8Array {
  const cell = new Uint8Array(CELL_WIDTH * cellHeight * 4);
  let target = 0;
  for (let y = 0; y < cellHeight; y += 1) {
    const sourceOffset = ((cellY + y) * ZX_SCREEN_WIDTH + cellX * CELL_WIDTH) * 4;
    const rowBytes = CELL_WIDTH * 4;
    cell.set(source.subarray(sourceOffset, sourceOffset + rowBytes), target);
    target += rowBytes;
  }
  return cell;
}

function mixedPaletteMismatch(
  first: JointMixedCandidate,
  second: JointMixedCandidate,
  palette: readonly TemporalVirtualColor[],
): number {
  const directionalGap = (
    from: readonly number[],
    to: readonly number[],
  ): number => from.reduce((sum, index) => {
    const color = palette[index]!;
    let nearest = Number.POSITIVE_INFINITY;
    for (const otherIndex of to) {
      const other = palette[otherIndex]!;
      const dr = color.r - other.r;
      const dg = color.g - other.g;
      const db = color.b - other.b;
      nearest = Math.min(nearest, dr * dr + dg * dg + db * db);
    }
    return sum + nearest / from.length;
  }, 0);
  const distanceSquared = (
    directionalGap(first.blendPaletteIndices, second.blendPaletteIndices) +
    directionalGap(second.blendPaletteIndices, first.blendPaletteIndices)
  ) / 2;
  return Math.min(1, Math.sqrt(distanceSquared / (3 * 255 * 255)));
}

function quantizeJointDualFloydSteinberg(
  source: Uint8Array,
  selected: readonly JointMixedCandidate[],
  virtualPalette: readonly TemporalVirtualColor[],
  attributeHeight: number,
  amount: number,
  boundaryAware: boolean,
): Uint8Array {
  const pixelCount = ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT;
  const choices = new Uint8Array(pixelCount);
  const errors = new Float32Array(pixelCount * 3);
  const scale = Math.max(0, Math.min(100, amount)) / 100;
  const cellRows = ZX_SCREEN_HEIGHT / attributeHeight;
  const horizontalPaletteGaps = new Float32Array(cellRows * (ZX_ATTRIBUTE_COLUMNS - 1));
  const verticalPaletteGaps = new Float32Array((cellRows - 1) * ZX_ATTRIBUTE_COLUMNS);
  if (boundaryAware) {
    for (let cellY = 0; cellY < cellRows; cellY += 1) {
      for (let cellX = 0; cellX < ZX_ATTRIBUTE_COLUMNS - 1; cellX += 1) {
        const cell = cellY * ZX_ATTRIBUTE_COLUMNS + cellX;
        horizontalPaletteGaps[cellY * (ZX_ATTRIBUTE_COLUMNS - 1) + cellX] =
          mixedPaletteMismatch(selected[cell]!, selected[cell + 1]!, virtualPalette);
      }
    }
    for (let cellY = 0; cellY < cellRows - 1; cellY += 1) {
      for (let cellX = 0; cellX < ZX_ATTRIBUTE_COLUMNS; cellX += 1) {
        const cell = cellY * ZX_ATTRIBUTE_COLUMNS + cellX;
        verticalPaletteGaps[cellY * ZX_ATTRIBUTE_COLUMNS + cellX] =
          mixedPaletteMismatch(selected[cell]!, selected[cell + ZX_ATTRIBUTE_COLUMNS]!, virtualPalette);
      }
    }
  }
  for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
    const localY = y % attributeHeight;
    const reverse = (boundaryAware ? y : localY) % 2 === 1;
    for (let step = 0; step < ZX_SCREEN_WIDTH; step += 1) {
      const x = reverse ? ZX_SCREEN_WIDTH - 1 - step : step;
      const pixel = y * ZX_SCREEN_WIDTH + x;
      const sourceOffset = pixel * 4;
      const errorOffset = pixel * 3;
      const cell = selected[Math.floor(y / attributeHeight) * ZX_ATTRIBUTE_COLUMNS + Math.floor(x / CELL_WIDTH)]!;
      const [a, b, c, d] = cell.blendPaletteIndices;
      const candidates = [a, b, c, d];
      const correctedR = Math.max(0, Math.min(255, (source[sourceOffset] ?? 0) + errors[errorOffset]!));
      const correctedG = Math.max(0, Math.min(255, (source[sourceOffset + 1] ?? 0) + errors[errorOffset + 1]!));
      const correctedB = Math.max(0, Math.min(255, (source[sourceOffset + 2] ?? 0) + errors[errorOffset + 2]!));
      let choice = 0;
      let bestDistance = Number.POSITIVE_INFINITY;
      for (let index = 0; index < candidates.length; index += 1) {
        const color = virtualPalette[candidates[index]!]!;
        const dr = correctedR - color.r;
        const dg = correctedG - color.g;
        const db = correctedB - color.b;
        const distance = dr * dr + dg * dg + db * db;
        if (distance < bestDistance) {
          bestDistance = distance;
          choice = index;
        }
      }
      choices[pixel] = choice;
      const color = virtualPalette[candidates[choice]!]!;
      const channelErrors = [correctedR - color.r, correctedG - color.g, correctedB - color.b];
      const direction = reverse ? -1 : 1;
      for (const [dx, dy, weight] of [
        [direction, 0, 7],
        [-direction, 1, 3],
        [0, 1, 5],
        [direction, 1, 1],
      ] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= ZX_SCREEN_WIDTH || ny >= ZX_SCREEN_HEIGHT) continue;
        if (
          !boundaryAware &&
          (Math.floor(nx / CELL_WIDTH) !== Math.floor(x / CELL_WIDTH) ||
            Math.floor(ny / attributeHeight) !== Math.floor(y / attributeHeight))
        ) continue;
        const nextOffset = (ny * ZX_SCREEN_WIDTH + nx) * 3;
        let transmission = 1;
        if (boundaryAware) {
          const currentCellX = Math.floor(x / CELL_WIDTH);
          const currentCellY = Math.floor(y / attributeHeight);
          const nextCellX = Math.floor(nx / CELL_WIDTH);
          const nextCellY = Math.floor(ny / attributeHeight);
          if (currentCellX !== nextCellX || currentCellY !== nextCellY) {
            const horizontalGap = currentCellX !== nextCellX
              ? horizontalPaletteGaps[currentCellY * (ZX_ATTRIBUTE_COLUMNS - 1) + Math.min(currentCellX, nextCellX)] ?? 0
              : 0;
            const verticalGap = currentCellY !== nextCellY
              ? verticalPaletteGaps[Math.min(currentCellY, nextCellY) * ZX_ATTRIBUTE_COLUMNS + currentCellX] ?? 0
              : 0;
            const paletteGap = Math.max(horizontalGap, verticalGap);
            const dr = (source[sourceOffset] ?? 0) - (source[ny * ZX_SCREEN_WIDTH * 4 + nx * 4] ?? 0);
            const dg = (source[sourceOffset + 1] ?? 0) - (source[ny * ZX_SCREEN_WIDTH * 4 + nx * 4 + 1] ?? 0);
            const db = (source[sourceOffset + 2] ?? 0) - (source[ny * ZX_SCREEN_WIDTH * 4 + nx * 4 + 2] ?? 0);
            const sourceEdge = Math.sqrt(dr * dr + dg * dg + db * db);
            const sourceEdgeStrength = Math.min(1, sourceEdge / 96);
            transmission = 1 - 0.75 * paletteGap * sourceEdgeStrength;
          }
        }
        for (let channel = 0; channel < 3; channel += 1) {
          errors[nextOffset + channel]! += channelErrors[channel]! * weight / 16 * scale * transmission;
        }
      }
    }
  }
  return choices;
}

export function convertJointMixedCells(
  source: Uint8Array,
  settings: ConversionSettings,
  virtualPalette: readonly TemporalVirtualColor[],
): JointMixedFrames {
  const cellHeight = settings.attributeHeight;
  const firstPalette = buildJointMixedPhysicalPalette(settings, 0);
  const secondPalette = buildJointMixedPhysicalPalette(settings, 1);
  const candidates = buildJointMixedCandidates(firstPalette, secondPalette, virtualPalette);
  const attributeRows = ZX_SCREEN_HEIGHT / cellHeight;
  let selected: readonly JointMixedCandidate[];
  const pixelOffsets = cellPixelOffsets(0, 0, cellHeight);

  if (settings.attributeOptimizerId === "zx-mixed-joint-cell-v2") {
    selected = optimizeSpatiallyRegularizedCandidates(source, settings, candidates, virtualPalette);
  } else if (settings.attributeOptimizerId === "zx-mixed-joint-quantized-v1") {
    selected = optimizeSpatiallyRegularizedCandidates(
      source,
      settings,
      candidates,
      virtualPalette,
      rankQuantizedJointCellOptions,
    );
  } else {
    const independentlySelected: JointMixedCandidate[] = new Array(attributeRows * ZX_ATTRIBUTE_COLUMNS);
    for (let cellY = 0; cellY < attributeRows; cellY += 1) {
      for (let cellX = 0; cellX < ZX_ATTRIBUTE_COLUMNS; cellX += 1) {
        for (let localY = 0; localY < cellHeight; localY += 1) {
          for (let localX = 0; localX < CELL_WIDTH; localX += 1) {
            const index = localY * CELL_WIDTH + localX;
            pixelOffsets[index] = ((cellY * cellHeight + localY) * ZX_SCREEN_WIDTH + cellX * CELL_WIDTH + localX) * 4;
          }
        }
        independentlySelected[cellY * ZX_ATTRIBUTE_COLUMNS + cellX] = findBestJointMixedCandidate(
          source,
          pixelOffsets,
          candidates,
          virtualPalette,
        );
      }
    }
    selected = independentlySelected;
  }

  const firstPixels = new Uint8Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT);
  const secondPixels = new Uint8Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT);
  const firstAttributes = new Uint8Array(attributeRows * ZX_ATTRIBUTE_COLUMNS);
  const secondAttributes = new Uint8Array(attributeRows * ZX_ATTRIBUTE_COLUMNS);
  for (let cellY = 0; cellY < attributeRows; cellY += 1) {
    for (let cellX = 0; cellX < ZX_ATTRIBUTE_COLUMNS; cellX += 1) {
      const candidate = selected[cellY * ZX_ATTRIBUTE_COLUMNS + cellX]!;
      const attributeOffset = cellY * ZX_ATTRIBUTE_COLUMNS + cellX;
      firstAttributes[attributeOffset] = candidate.firstAttribute;
      secondAttributes[attributeOffset] = candidate.secondAttribute;
    }
  }

  if (settings.ditherEngineId === "zx-mixed-dual-fs-v1" || settings.ditherEngineId === "zx-mixed-dual-fs-boundary-v1") {
    const choices = quantizeJointDualFloydSteinberg(
      source,
      selected,
      virtualPalette,
      cellHeight,
      settings.ditheringAmount,
      settings.ditherEngineId === "zx-mixed-dual-fs-boundary-v1",
    );
    for (let pixel = 0; pixel < choices.length; pixel += 1) {
      const choice = choices[pixel] ?? 0;
      firstPixels[pixel] = choice >= 2 ? 1 : 0;
      secondPixels[pixel] = (choice & 1) === 1 ? 1 : 0;
    }
  } else {
    const orderedLocalTone = settings.ditherEngineId === "ordered-local-tone-v3" ||
      settings.ditherEngineId === "ordered-baseline-additive-v5" ||
      settings.ditherEngineId === "ordered-strict-matrix-v6";
    for (let cellY = 0; cellY < attributeRows; cellY += 1) {
      for (let cellX = 0; cellX < ZX_ATTRIBUTE_COLUMNS; cellX += 1) {
        const cellIndex = cellY * ZX_ATTRIBUTE_COLUMNS + cellX;
        const candidate = selected[cellIndex]!;
        const cellPalette = candidate.blendPaletteIndices.map((index) => virtualPalette[index]!);
        const cellChoices = quantizeTemporalVirtual(
          extractCellRgba(source, cellX, cellY * cellHeight, cellHeight),
          CELL_WIDTH,
          cellHeight,
          cellPalette,
          settings,
          orderedLocalTone,
        );
        for (let localY = 0; localY < cellHeight; localY += 1) {
          for (let localX = 0; localX < CELL_WIDTH; localX += 1) {
            const pixel = (cellY * cellHeight + localY) * ZX_SCREEN_WIDTH + cellX * CELL_WIDTH + localX;
            const choice = cellChoices[localY * CELL_WIDTH + localX] ?? 0;
            firstPixels[pixel] = choice >= 2 ? 1 : 0;
            secondPixels[pixel] = (choice & 1) === 1 ? 1 : 0;
          }
        }
      }
    }
  }

  return { firstPixels, firstAttributes, secondPixels, secondAttributes };
}
