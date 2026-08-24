import {
  parseScr,
  type ZxScreen,
} from "@retro-converter/zx-spectrum";
import { deriveCharset, validateCharsetBytes } from "./charset.js";
import { bestTileDistance, hammingBits } from "./distance.js";
import { decodeCharsetArtifact, encodeCharsetArtifact } from "./encoding.js";
import {
  canonicalTile,
  extractScreenTiles,
  invertTile,
  swapInkPaper,
  tileKey,
  transformTile,
  uniqueVariants,
} from "./tiles.js";
import type {
  CharsetAssignment,
  CharsetConversionOptions,
  CharsetConversionResult,
  TileTransform,
} from "./types.js";

function renderedAssignmentTile(
  charset: Uint8Array,
  assignment: CharsetAssignment,
): Uint8Array {
  const base = charset.slice(
    assignment.characterIndex * 8,
    assignment.characterIndex * 8 + 8,
  );
  const transformed = transformTile(base, assignment.transform);
  return assignment.inverted ? invertTile(transformed) : transformed;
}

function bit(tile: Uint8Array, x: number, y: number): number {
  return ((tile[y] ?? 0) >> (7 - x)) & 1;
}

function tileSaliency(tile: Uint8Array): number {
  let edges = 0;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const value = bit(tile, x, y);
      if (x < 7 && value !== bit(tile, x + 1, y)) edges += 1;
      if (y < 7 && value !== bit(tile, x, y + 1)) edges += 1;
    }
  }
  return Math.min(1, edges / 64);
}

function neighborBoundaryError(
  source: readonly Uint8Array[],
  rendered: readonly Uint8Array[],
  cellIndex: number,
): number {
  const cellX = cellIndex % 32;
  const cellY = Math.floor(cellIndex / 32);
  let mismatches = 0;
  let samples = 0;
  const compare = (
    neighborIndex: number,
    sourceEdge: (tile: Uint8Array, position: number) => number,
    neighborEdge: (tile: Uint8Array, position: number) => number,
  ) => {
    for (let position = 0; position < 8; position += 1) {
      const sourceTransition =
        sourceEdge(source[cellIndex]!, position) ^
        neighborEdge(source[neighborIndex]!, position);
      const renderedTransition =
        sourceEdge(rendered[cellIndex]!, position) ^
        neighborEdge(rendered[neighborIndex]!, position);
      if (sourceTransition !== renderedTransition) mismatches += 1;
      samples += 1;
    }
  };
  if (cellX > 0) {
    compare(
      cellIndex - 1,
      (tile, position) => bit(tile, 0, position),
      (tile, position) => bit(tile, 7, position),
    );
  }
  if (cellX < 31) {
    compare(
      cellIndex + 1,
      (tile, position) => bit(tile, 7, position),
      (tile, position) => bit(tile, 0, position),
    );
  }
  if (cellY > 0) {
    compare(
      cellIndex - 32,
      (tile, position) => bit(tile, position, 0),
      (tile, position) => bit(tile, position, 7),
    );
  }
  if (cellY < 23) {
    compare(
      cellIndex + 32,
      (tile, position) => bit(tile, position, 7),
      (tile, position) => bit(tile, position, 0),
    );
  }
  return samples === 0 ? 0 : mismatches / samples;
}

function refineImageSimilarityV3(
  tiles: readonly Uint8Array[],
  screen: ZxScreen,
  charset: Uint8Array,
  initial: readonly CharsetAssignment[],
  options: CharsetConversionOptions,
): {
  readonly assignments: readonly CharsetAssignment[];
  readonly objective: number;
  readonly passes: number;
} {
  const characterCount = charset.length / 8;
  let assignments = [...initial];
  const rendered = assignments.map((assignment) =>
    renderedAssignmentTile(charset, assignment)
  );
  const objective = (): number => assignments.reduce((total, assignment, index) => {
    const saliency = tileSaliency(tiles[index]!);
    return total +
      assignment.distance +
      0.1 * neighborBoundaryError(tiles, rendered, index) +
      0.05 * saliency * assignment.distance / 0.85;
  }, 0);
  let bestObjective = objective();
  let completedPasses = 0;
  for (let pass = 0; pass < 4; pass += 1) {
    const previousAssignments = [...assignments];
    const previousRendered = rendered.map((tile) => tile.slice());
    const reverse = (pass & 1) === 1;
    for (let step = 0; step < tiles.length; step += 1) {
      const tileIndex = reverse ? tiles.length - 1 - step : step;
      let best = assignments[tileIndex]!;
      let bestTile = rendered[tileIndex]!;
      let bestCost = Number.POSITIVE_INFINITY;
      for (let characterIndex = 0; characterIndex < characterCount; characterIndex += 1) {
        const base = charset.slice(characterIndex * 8, characterIndex * 8 + 8);
        const measured = bestTileDistance(
          tiles[tileIndex]!,
          base,
          options.allowTransforms,
          options.allowPolarity,
          "image-similarity-v3",
          screen.attributes[tileIndex] ?? 0,
        );
        const candidate: CharsetAssignment = { characterIndex, ...measured };
        const candidateTile = renderedAssignmentTile(charset, candidate);
        rendered[tileIndex] = candidateTile;
        const saliency = tileSaliency(tiles[tileIndex]!);
        const cost =
          candidate.distance +
          0.1 * neighborBoundaryError(tiles, rendered, tileIndex) +
          0.05 * saliency * candidate.distance / 0.85;
        if (
          cost < bestCost ||
          (cost === bestCost && candidate.hamming < best.hamming) ||
          (cost === bestCost && candidate.hamming === best.hamming &&
            Number(candidate.inverted) < Number(best.inverted)) ||
          (cost === bestCost && candidate.hamming === best.hamming &&
            candidate.inverted === best.inverted &&
            candidate.transform < best.transform) ||
          (cost === bestCost && candidate.hamming === best.hamming &&
            candidate.inverted === best.inverted &&
            candidate.transform === best.transform &&
            candidate.characterIndex < best.characterIndex)
        ) {
          best = candidate;
          bestTile = candidateTile;
          bestCost = cost;
        }
      }
      assignments[tileIndex] = best;
      rendered[tileIndex] = bestTile;
    }
    const nextObjective = objective();
    if (nextObjective >= bestObjective) {
      assignments = previousAssignments;
      for (let index = 0; index < rendered.length; index += 1) {
        rendered[index] = previousRendered[index]!;
      }
      break;
    }
    bestObjective = nextObjective;
    completedPasses += 1;
  }
  return { assignments, objective: bestObjective, passes: completedPasses };
}

interface V4Metrics {
  readonly rgb: number;
  readonly multiscale: number;
  readonly edge: number;
  readonly boundary: number;
  readonly saliency: number;
}

function zxChannel(code: number, bitMask: number, level: number): number {
  return (code & bitMask) !== 0 ? level : 0;
}

function zxTileColor(attribute: number, value: number): readonly [number, number, number] {
  const code = value === 1 ? attribute & 7 : (attribute >> 3) & 7;
  const level = (attribute & 0x40) !== 0 ? 255 : 205;
  return [
    zxChannel(code, 2, level),
    zxChannel(code, 4, level),
    zxChannel(code, 1, level),
  ];
}

function tileV4Metrics(
  source: Uint8Array,
  rendered: Uint8Array,
  attribute: number,
): Omit<V4Metrics, "boundary"> {
  let rgb = 0;
  let multiscale = 0;
  let edge = 0;
  const color = (tile: Uint8Array, x: number, y: number) =>
    zxTileColor(attribute, bit(tile, x, y));
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const expected = color(source, x, y);
      const actual = color(rendered, x, y);
      for (let channel = 0; channel < 3; channel += 1) {
        rgb += ((expected[channel] ?? 0) - (actual[channel] ?? 0)) ** 2;
      }
      if (x < 7) {
        const expectedNext = color(source, x + 1, y);
        const actualNext = color(rendered, x + 1, y);
        for (let channel = 0; channel < 3; channel += 1) {
          const sourceDelta =
            (expected[channel] ?? 0) - (expectedNext[channel] ?? 0);
          const renderedDelta =
            (actual[channel] ?? 0) - (actualNext[channel] ?? 0);
          edge += (sourceDelta - renderedDelta) ** 2;
        }
      }
      if (y < 7) {
        const expectedNext = color(source, x, y + 1);
        const actualNext = color(rendered, x, y + 1);
        for (let channel = 0; channel < 3; channel += 1) {
          const sourceDelta =
            (expected[channel] ?? 0) - (expectedNext[channel] ?? 0);
          const renderedDelta =
            (actual[channel] ?? 0) - (actualNext[channel] ?? 0);
          edge += (sourceDelta - renderedDelta) ** 2;
        }
      }
    }
  }
  for (const size of [2, 4] as const) {
    for (let blockY = 0; blockY < 8; blockY += size) {
      for (let blockX = 0; blockX < 8; blockX += size) {
        const sourceSums = [0, 0, 0];
        const renderedSums = [0, 0, 0];
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            const expected = color(source, blockX + x, blockY + y);
            const actual = color(rendered, blockX + x, blockY + y);
            for (let channel = 0; channel < 3; channel += 1) {
              sourceSums[channel] =
                (sourceSums[channel] ?? 0) + (expected[channel] ?? 0);
              renderedSums[channel] =
                (renderedSums[channel] ?? 0) + (actual[channel] ?? 0);
            }
          }
        }
        const area = size * size;
        for (let channel = 0; channel < 3; channel += 1) {
          multiscale += (
            ((sourceSums[channel] ?? 0) - (renderedSums[channel] ?? 0)) /
            area
          ) ** 2;
        }
      }
    }
  }
  return {
    rgb,
    multiscale,
    edge,
    saliency: rgb * tileSaliency(source),
  };
}

function rgbBoundaryErrorV4(
  source: readonly Uint8Array[],
  rendered: readonly Uint8Array[],
  attributes: Uint8Array,
): number {
  let error = 0;
  const compare = (
    firstIndex: number,
    secondIndex: number,
    firstX: (position: number) => number,
    firstY: (position: number) => number,
    secondX: (position: number) => number,
    secondY: (position: number) => number,
  ) => {
    for (let position = 0; position < 8; position += 1) {
      const sourceFirst = zxTileColor(
        attributes[firstIndex] ?? 0,
        bit(source[firstIndex]!, firstX(position), firstY(position)),
      );
      const sourceSecond = zxTileColor(
        attributes[secondIndex] ?? 0,
        bit(source[secondIndex]!, secondX(position), secondY(position)),
      );
      const renderedFirst = zxTileColor(
        attributes[firstIndex] ?? 0,
        bit(rendered[firstIndex]!, firstX(position), firstY(position)),
      );
      const renderedSecond = zxTileColor(
        attributes[secondIndex] ?? 0,
        bit(rendered[secondIndex]!, secondX(position), secondY(position)),
      );
      for (let channel = 0; channel < 3; channel += 1) {
        const sourceDelta =
          (sourceFirst[channel] ?? 0) - (sourceSecond[channel] ?? 0);
        const renderedDelta =
          (renderedFirst[channel] ?? 0) - (renderedSecond[channel] ?? 0);
        error += (sourceDelta - renderedDelta) ** 2;
      }
    }
  };
  for (let y = 0; y < 24; y += 1) {
    for (let x = 0; x < 32; x += 1) {
      const index = y * 32 + x;
      if (x < 31) {
        compare(index, index + 1, () => 7, (p) => p, () => 0, (p) => p);
      }
      if (y < 23) {
        compare(index, index + 32, (p) => p, () => 7, (p) => p, () => 0);
      }
    }
  }
  return error;
}

function rgbBoundaryErrorForCellV4(
  source: readonly Uint8Array[],
  rendered: readonly Uint8Array[],
  attributes: Uint8Array,
  cellIndex: number,
  candidate: Uint8Array,
): number {
  const cellX = cellIndex % 32;
  const cellY = Math.floor(cellIndex / 32);
  let error = 0;
  const compare = (
    neighborIndex: number,
    candidateX: (position: number) => number,
    candidateY: (position: number) => number,
    neighborX: (position: number) => number,
    neighborY: (position: number) => number,
  ) => {
    for (let position = 0; position < 8; position += 1) {
      const sourceFirst = zxTileColor(
        attributes[cellIndex] ?? 0,
        bit(source[cellIndex]!, candidateX(position), candidateY(position)),
      );
      const sourceSecond = zxTileColor(
        attributes[neighborIndex] ?? 0,
        bit(source[neighborIndex]!, neighborX(position), neighborY(position)),
      );
      const renderedFirst = zxTileColor(
        attributes[cellIndex] ?? 0,
        bit(candidate, candidateX(position), candidateY(position)),
      );
      const renderedSecond = zxTileColor(
        attributes[neighborIndex] ?? 0,
        bit(rendered[neighborIndex]!, neighborX(position), neighborY(position)),
      );
      for (let channel = 0; channel < 3; channel += 1) {
        const sourceDelta =
          (sourceFirst[channel] ?? 0) - (sourceSecond[channel] ?? 0);
        const renderedDelta =
          (renderedFirst[channel] ?? 0) - (renderedSecond[channel] ?? 0);
        error += (sourceDelta - renderedDelta) ** 2;
      }
    }
  };
  if (cellX > 0) {
    compare(cellIndex - 1, () => 0, (p) => p, () => 7, (p) => p);
  }
  if (cellX < 31) {
    compare(cellIndex + 1, () => 7, (p) => p, () => 0, (p) => p);
  }
  if (cellY > 0) {
    compare(cellIndex - 32, (p) => p, () => 0, (p) => p, () => 7);
  }
  if (cellY < 23) {
    compare(cellIndex + 32, (p) => p, () => 7, (p) => p, () => 0);
  }
  return error;
}

function compareV4Metrics(left: V4Metrics, right: V4Metrics): number {
  for (const key of [
    "rgb", "multiscale", "edge", "boundary", "saliency",
  ] as const) {
    const difference = left[key] - right[key];
    if (difference !== 0) return difference;
  }
  return 0;
}

function globalV4Metrics(
  source: readonly Uint8Array[],
  rendered: readonly Uint8Array[],
  attributes: Uint8Array,
): V4Metrics {
  let rgb = 0;
  let multiscale = 0;
  let edge = 0;
  let saliency = 0;
  for (let index = 0; index < source.length; index += 1) {
    const local = tileV4Metrics(
      source[index]!, rendered[index]!, attributes[index] ?? 0,
    );
    rgb += local.rgb;
    multiscale += local.multiscale;
    edge += local.edge;
    saliency += local.saliency;
  }
  return {
    rgb,
    multiscale,
    edge,
    boundary: rgbBoundaryErrorV4(source, rendered, attributes),
    saliency,
  };
}

interface V4Candidate {
  readonly characterIndex: number;
  readonly transform: TileTransform;
  readonly inverted: boolean;
  readonly tile: Uint8Array;
}

interface V4PerformanceCounters {
  candidatesEvaluated: number;
  equivalentCandidatesPruned: number;
  cellsRecomputed: number;
  boundaryTermsRecomputed: number;
  candidateCacheHits: number;
  candidateSetsPrepared: number;
  readonly candidateCache: Map<Uint8Array, readonly V4Candidate[]>;
}

function v4Candidates(
  charset: Uint8Array,
  options: CharsetConversionOptions,
  counters: V4PerformanceCounters,
): readonly V4Candidate[] {
  const cached = counters.candidateCache.get(charset);
  if (cached !== undefined) {
    counters.candidateCacheHits += 1;
    return cached;
  }
  const candidates: V4Candidate[] = [];
  const count = charset.length / 8;
  for (let characterIndex = 0; characterIndex < count; characterIndex += 1) {
    const base = charset.subarray(characterIndex * 8, characterIndex * 8 + 8);
    const variants = uniqueVariants(base, options.allowTransforms);
    const theoreticalVariants = options.allowTransforms ? 8 : 1;
    counters.equivalentCandidatesPruned +=
      (theoreticalVariants - variants.length) * (options.allowPolarity ? 2 : 1);
    for (const variant of variants) {
      for (const inverted of options.allowPolarity ? [false, true] : [false]) {
        candidates.push({
          characterIndex,
          transform: variant.transform,
          inverted,
          tile: inverted ? invertTile(variant.tile) : variant.tile,
        });
      }
    }
  }
  counters.candidateSetsPrepared += 1;
  counters.candidateCache.set(charset, candidates);
  return candidates;
}

function bestV4Assignment(
  source: Uint8Array,
  attribute: number,
  charset: Uint8Array,
  options: CharsetConversionOptions,
  counters: V4PerformanceCounters,
  context?: {
    readonly tiles: readonly Uint8Array[];
    readonly rendered: readonly Uint8Array[];
    readonly attributes: Uint8Array;
    readonly tileIndex: number;
  },
): CharsetAssignment {
  let best: CharsetAssignment | null = null;
  let bestMetrics: V4Metrics | null = null;
  counters.cellsRecomputed += 1;
  for (const prepared of v4Candidates(charset, options, counters)) {
        counters.candidatesEvaluated += 1;
        const tile = prepared.tile;
        const local = tileV4Metrics(source, tile, attribute);
        if (context !== undefined) counters.boundaryTermsRecomputed += 1;
        const metrics: V4Metrics = {
          ...local,
          boundary: context === undefined
            ? 0
            : rgbBoundaryErrorForCellV4(
                context.tiles,
                context.rendered,
                context.attributes,
                context.tileIndex,
                tile,
              ),
        };
        const candidate: CharsetAssignment = {
          characterIndex: prepared.characterIndex,
          transform: prepared.transform,
          inverted: prepared.inverted,
          distance: metrics.rgb / (64 * 3 * 255 * 255),
          hamming: hammingBits(source, tile),
        };
        const comparison = bestMetrics === null
          ? -1
          : compareV4Metrics(metrics, bestMetrics);
        if (
          best === null ||
          comparison < 0 ||
          comparison === 0 && candidate.hamming < best.hamming ||
          comparison === 0 && candidate.hamming === best.hamming &&
            Number(candidate.inverted) < Number(best.inverted) ||
          comparison === 0 && candidate.hamming === best.hamming &&
            candidate.inverted === best.inverted &&
            candidate.transform < best.transform ||
          comparison === 0 && candidate.hamming === best.hamming &&
            candidate.inverted === best.inverted &&
            candidate.transform === best.transform &&
            candidate.characterIndex < best.characterIndex
        ) {
          best = candidate;
          bestMetrics = metrics;
        }
  }
  if (best === null) throw new Error("Image similarity v4 has no legal assignment.");
  return best;
}

function refineImageSimilarityV4(
  tiles: readonly Uint8Array[],
  screen: ZxScreen,
  initialCharset: Uint8Array,
  initial: readonly CharsetAssignment[],
  options: CharsetConversionOptions,
): {
  readonly charset: Uint8Array;
  readonly assignments: readonly CharsetAssignment[];
  readonly metrics: V4Metrics;
  readonly initialRgb: number;
  readonly passes: number;
  readonly medoidSwaps: number;
  readonly assignmentChanges: number;
  readonly performance: Omit<V4PerformanceCounters, "candidateCache">;
} {
  const counters: V4PerformanceCounters = {
    candidatesEvaluated: 0,
    equivalentCandidatesPruned: 0,
    cellsRecomputed: 0,
    boundaryTermsRecomputed: 0,
    candidateCacheHits: 0,
    candidateSetsPrepared: 0,
    candidateCache: new Map(),
  };
  let charset: Uint8Array = initialCharset.slice();
  const initialRendered = initial.map((assignment) =>
    renderedAssignmentTile(charset, assignment)
  );
  const initialMetrics = globalV4Metrics(
    tiles, initialRendered, screen.attributes,
  );
  let assignments = initial.map((_, index) =>
    bestV4Assignment(
      tiles[index]!, screen.attributes[index] ?? 0, charset, options, counters,
    )
  );
  let rendered = assignments.map((assignment) =>
    renderedAssignmentTile(charset, assignment)
  );
  let metrics = globalV4Metrics(tiles, rendered, screen.attributes);
  const initialRgb = initialMetrics.rgb;
  let acceptedPasses = 0;
  let medoidSwaps = 0;
  let assignmentChanges = 0;

  for (let pass = 0; pass < 4; pass += 1) {
    const beforeAssignments = assignments;
    const beforeRendered = rendered;
    const beforeMetrics = metrics;
    const reverse = (pass & 1) === 1;
    const swept = [...assignments];
    const workingRendered: Uint8Array[] =
      rendered.map((tile) => tile.slice());
    for (let step = 0; step < tiles.length; step += 1) {
      const index = reverse ? tiles.length - 1 - step : step;
      swept[index] = bestV4Assignment(
        tiles[index]!,
        screen.attributes[index] ?? 0,
        charset,
        options,
        counters,
        {
          tiles,
          rendered: workingRendered,
          attributes: screen.attributes,
          tileIndex: index,
        },
      );
      workingRendered[index] = renderedAssignmentTile(charset, swept[index]!);
    }
    const candidateRendered = workingRendered;
    let candidateMetrics = globalV4Metrics(
      tiles, candidateRendered, screen.attributes,
    );
    if (compareV4Metrics(candidateMetrics, metrics) < 0) {
      assignments = swept;
      rendered = candidateRendered;
      metrics = candidateMetrics;
    }

    const localErrors = rendered.map((tile, index) =>
      tileV4Metrics(
        tiles[index]!, tile, screen.attributes[index] ?? 0,
      ).rgb
    );
    const worst = localErrors
      .map((error, index) => ({ error, index }))
      .sort((left, right) => right.error - left.error || left.index - right.index)
      .slice(0, Math.max(1, Math.ceil(tiles.length / 10)));
    const replacement = canonicalTile(
      tiles[worst[pass % worst.length]!.index]!,
      options.allowTransforms,
      options.allowPolarity,
    );
    const usage = new Uint16Array(charset.length / 8);
    for (const assignment of assignments) {
      usage[assignment.characterIndex] =
        (usage[assignment.characterIndex] ?? 0) + 1;
    }
    const slots = Array.from(usage, (count, index) => ({ count, index }))
      .sort((left, right) => left.count - right.count || left.index - right.index)
      .slice(0, Math.min(4, usage.length));
    let bestSwap:
      | {
          charset: Uint8Array;
          assignments: CharsetAssignment[];
          rendered: Uint8Array[];
          metrics: V4Metrics;
        }
      | null = null;
    for (const slot of slots) {
      const trialCharset = charset.slice();
      trialCharset.set(replacement, slot.index * 8);
      const trialAssignments = assignments.map((_, index) =>
        bestV4Assignment(
          tiles[index]!,
          screen.attributes[index] ?? 0,
          trialCharset,
          options,
          counters,
        )
      );
      const trialRendered = trialAssignments.map((assignment) =>
        renderedAssignmentTile(trialCharset, assignment)
      );
      const trialMetrics = globalV4Metrics(
        tiles, trialRendered, screen.attributes,
      );
      if (
        compareV4Metrics(trialMetrics, metrics) < 0 &&
        (bestSwap === null ||
          compareV4Metrics(trialMetrics, bestSwap.metrics) < 0)
      ) {
        bestSwap = {
          charset: trialCharset,
          assignments: trialAssignments,
          rendered: trialRendered,
          metrics: trialMetrics,
        };
      }
    }
    if (bestSwap !== null) {
      charset = bestSwap.charset;
      assignments = bestSwap.assignments;
      rendered = bestSwap.rendered;
      metrics = bestSwap.metrics;
      medoidSwaps += 1;
    }
    if (compareV4Metrics(metrics, beforeMetrics) >= 0) {
      assignments = beforeAssignments;
      rendered = beforeRendered;
      metrics = beforeMetrics;
      break;
    }
    acceptedPasses += 1;
  }
  const finalWorst = rendered
    .map((tile, index) => ({
      index,
      error: tileV4Metrics(
        tiles[index]!, tile, screen.attributes[index] ?? 0,
      ).rgb,
    }))
    .sort((left, right) => right.error - left.error || left.index - right.index)
    .slice(0, Math.max(1, Math.ceil(tiles.length / 10)));
  const finalAssignments = [...assignments];
  const finalRendered: Uint8Array[] = rendered.map((tile) => tile.slice());
  for (const { index } of finalWorst) {
    finalAssignments[index] = bestV4Assignment(
      tiles[index]!,
      screen.attributes[index] ?? 0,
      charset,
      options,
      counters,
      {
        tiles,
        rendered: finalRendered,
        attributes: screen.attributes,
        tileIndex: index,
      },
    );
    finalRendered[index] = renderedAssignmentTile(
      charset, finalAssignments[index]!,
    );
  }
  const finalMetrics = globalV4Metrics(
    tiles, finalRendered, screen.attributes,
  );
  if (compareV4Metrics(finalMetrics, metrics) < 0) {
    assignments = finalAssignments;
    rendered = finalRendered;
    metrics = finalMetrics;
  }
  for (let index = 0; index < assignments.length; index += 1) {
    if (
      assignments[index]!.characterIndex !== initial[index]!.characterIndex ||
      assignments[index]!.transform !== initial[index]!.transform ||
      assignments[index]!.inverted !== initial[index]!.inverted
    ) assignmentChanges += 1;
  }
  return {
    charset,
    assignments,
    metrics,
    initialRgb,
    passes: acceptedPasses,
    medoidSwaps,
    assignmentChanges,
    performance: {
      candidatesEvaluated: counters.candidatesEvaluated,
      equivalentCandidatesPruned: counters.equivalentCandidatesPruned,
      cellsRecomputed: counters.cellsRecomputed,
      boundaryTermsRecomputed: counters.boundaryTermsRecomputed,
      candidateCacheHits: counters.candidateCacheHits,
      candidateSetsPrepared: counters.candidateSetsPrepared,
    },
  };
}

/**
 * Bounded contextual refinement for interactive use. It starts from the full
 * v2 result, performs one deterministic RGB-aware assignment sweep, and only
 * accepts the sweep when canonical RGB error improves by at least 0.1%.
 */
function refineImageSimilarityV5(
  tiles: readonly Uint8Array[],
  screen: ZxScreen,
  initialCharset: Uint8Array,
  initial: readonly CharsetAssignment[],
  options: CharsetConversionOptions,
): ReturnType<typeof refineImageSimilarityV4> {
  const counters: V4PerformanceCounters = {
    candidatesEvaluated: 0,
    equivalentCandidatesPruned: 0,
    cellsRecomputed: 0,
    boundaryTermsRecomputed: 0,
    candidateCacheHits: 0,
    candidateSetsPrepared: 0,
    candidateCache: new Map(),
  };
  const charset = initialCharset.slice();
  const initialAssignments = initial.map((assignment) => ({ ...assignment }));
  const initialRendered = initialAssignments.map((assignment) =>
    renderedAssignmentTile(charset, assignment)
  );
  const initialMetrics = globalV4Metrics(
    tiles, initialRendered, screen.attributes,
  );
  const candidateAssignments = [...initialAssignments];
  const candidateRendered: Uint8Array<ArrayBufferLike>[] =
    initialRendered.map((tile) => tile.slice());
  const probeIndices = initialRendered
    .map((tile, index) => ({
      index,
      error: tileV4Metrics(
        tiles[index]!, tile, screen.attributes[index] ?? 0,
      ).rgb,
    }))
    .sort((left, right) => right.error - left.error || left.index - right.index)
    .slice(0, Math.max(1, Math.ceil(tiles.length / 10)))
    .map(({ index }) => index)
    .sort((left, right) => left - right);
  for (const index of probeIndices) {
    candidateAssignments[index] = bestV4Assignment(
      tiles[index]!,
      screen.attributes[index] ?? 0,
      charset,
      options,
      counters,
      {
        tiles,
        rendered: candidateRendered,
        attributes: screen.attributes,
        tileIndex: index,
      },
    );
    candidateRendered[index] = renderedAssignmentTile(
      charset, candidateAssignments[index]!,
    );
  }
  const candidateMetrics = globalV4Metrics(
    tiles, candidateRendered, screen.attributes,
  );
  const minimumGain = initialMetrics.rgb * 0.001;
  const accepted = initialMetrics.rgb - candidateMetrics.rgb >= minimumGain;
  const assignments = accepted ? candidateAssignments : initialAssignments;
  const metrics = accepted ? candidateMetrics : initialMetrics;
  let assignmentChanges = 0;
  for (let index = 0; index < assignments.length; index += 1) {
    if (
      assignments[index]!.characterIndex !== initialAssignments[index]!.characterIndex ||
      assignments[index]!.transform !== initialAssignments[index]!.transform ||
      assignments[index]!.inverted !== initialAssignments[index]!.inverted
    ) assignmentChanges += 1;
  }
  return {
    charset,
    assignments,
    metrics,
    initialRgb: initialMetrics.rgb,
    passes: accepted ? 1 : 0,
    medoidSwaps: 0,
    assignmentChanges,
    performance: {
      candidatesEvaluated: counters.candidatesEvaluated,
      equivalentCandidatesPruned: counters.equivalentCandidatesPruned,
      cellsRecomputed: counters.cellsRecomputed,
      boundaryTermsRecomputed: counters.boundaryTermsRecomputed,
      candidateCacheHits: counters.candidateCacheHits,
      candidateSetsPrepared: counters.candidateSetsPrepared,
    },
  };
}

function validateOptions(options: CharsetConversionOptions): void {
  if (!Number.isInteger(options.characterBudget) ||
      options.characterBudget < 1 || options.characterBudget > 256) {
    throw new RangeError("Character budget must be an integer from 1 through 256.");
  }
  if (options.encoding === "compact" && options.characterBudget > 32) {
    throw new RangeError("Compact mapping supports character budgets from 1 through 32.");
  }
  if (options.source === "existing" && options.existingCharset === undefined) {
    throw new RangeError("Existing charset mode requires charset bytes.");
  }
  if (options.existingCharsetRange !== undefined) {
    const { startIndex, length } = options.existingCharsetRange;
    if (
      options.source !== "existing" ||
      !Number.isInteger(startIndex) ||
      !Number.isInteger(length) ||
      startIndex < 0 ||
      length < 1
    ) {
      throw new RangeError("Existing charset range is invalid.");
    }
  }
  if (options.existingCharsetSelection !== undefined) {
    const { indices } = options.existingCharsetSelection;
    if (
      options.source !== "existing" ||
      indices.length < 1 ||
      indices.some((index, position) =>
        !Number.isInteger(index) ||
        index < 0 ||
        (position > 0 && index <= (indices[position - 1] ?? -1))
      )
    ) {
      throw new RangeError(
        "Existing charset selection must contain sorted, unique indices.",
      );
    }
  }
}

function zxColor(attribute: number, ink: boolean): readonly [number, number, number] {
  const code = ink ? attribute & 0x07 : (attribute >> 3) & 0x07;
  const channel = (attribute & 0x40) !== 0 ? 255 : 205;
  return [
    (code & 0x02) !== 0 ? channel : 0,
    (code & 0x04) !== 0 ? channel : 0,
    (code & 0x01) !== 0 ? channel : 0,
  ];
}

export function renderCharsetPreview(screen: ZxScreen): Uint8Array {
  const rgba = new Uint8Array(256 * 192 * 4);
  for (let y = 0; y < 192; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const attribute = screen.attributes[Math.floor(y / 8) * 32 + Math.floor(x / 8)] ?? 0;
      const color = zxColor(attribute, (screen.pixels[y * 256 + x] ?? 0) !== 0);
      const offset = (y * 256 + x) * 4;
      rgba[offset] = color[0];
      rgba[offset + 1] = color[1];
      rgba[offset + 2] = color[2];
      rgba[offset + 3] = 255;
    }
  }
  return rgba;
}

export function convertScrToCharset(
  scr: Uint8Array,
  options: CharsetConversionOptions,
): CharsetConversionResult {
  validateOptions(options);
  const screen = parseScr(scr);
  const tiles = extractScreenTiles(screen);
  let uniqueCanonicalTiles = new Set(
    tiles.map((tile) =>
      tileKey(canonicalTile(
        tile,
        options.allowTransforms,
        options.allowPolarity,
      ))
    ),
  ).size;
  let charset: Uint8Array;
  if (options.source === "existing") {
    const source = options.existingCharset!;
    const existingCount = validateCharsetBytes(
      source,
      256,
    );
    const selectedIndices = options.existingCharsetSelection?.indices;
    if (
      selectedIndices !== undefined &&
      selectedIndices.some((index) => index >= existingCount)
    ) {
      throw new RangeError(
        "Existing charset selection contains an unavailable character.",
      );
    }
    const activeCount = selectedIndices?.length;
    if (options.encoding === "compact" && activeCount !== undefined &&
        activeCount > 32) {
      throw new RangeError("Compact mapping supports at most 32 active characters.");
    }
    if (selectedIndices !== undefined) {
      charset = new Uint8Array(selectedIndices.length * 8);
      for (const [outputIndex, sourceIndex] of selectedIndices.entries()) {
        charset.set(
          source.subarray(sourceIndex * 8, sourceIndex * 8 + 8),
          outputIndex * 8,
        );
      }
    } else {
      const startIndex = options.existingCharsetRange?.startIndex ?? 0;
      const requestedLength = options.existingCharsetRange?.length ??
        Math.min(existingCount, options.characterBudget);
      if (startIndex >= existingCount) {
        throw new RangeError("Existing charset range starts beyond the available characters.");
      }
      const length = Math.min(requestedLength, existingCount - startIndex);
      if (options.encoding === "compact" && length > 32) {
        throw new RangeError("Compact mapping supports at most 32 active characters.");
      }
      charset = source.slice(startIndex * 8, (startIndex + length) * 8);
    }
  } else {
    const derived = deriveCharset(screen, tiles, options);
    charset = derived.charset;
    uniqueCanonicalTiles = derived.uniqueCanonicalTiles;
  }
  const characterCount = validateCharsetBytes(
    charset,
    options.encoding === "compact" ? 32 : 256,
  );
  const characterIndices = new Uint8Array(768);
  const transforms = new Uint8Array(768);
  const attributes = screen.attributes.slice();
  const assignments: CharsetAssignment[] = [];
  const effectiveMetric = options.derivedStrategy === "image-similarity-v4" ||
      options.derivedStrategy === "image-similarity-v5"
    ? "image-similarity-v2"
    : options.derivedStrategy === "image-similarity-v2" ||
        options.derivedStrategy === "image-similarity-v3"
    ? options.derivedStrategy
    : options.distanceMetric;
  let totalDistance = 0;
  let maximumDistance = 0;
  let exactMatches = 0;
  let polaritySwaps = 0;
  const transformHistogram = new Array<number>(8).fill(0);
  for (let tileIndex = 0; tileIndex < tiles.length; tileIndex += 1) {
    let best:
      | (CharsetAssignment & { readonly characterIndex: number })
      | null = null;
    for (let characterIndex = 0; characterIndex < characterCount; characterIndex += 1) {
      const base = charset.slice(characterIndex * 8, characterIndex * 8 + 8);
      const measured = bestTileDistance(
        tiles[tileIndex]!,
        base,
        options.allowTransforms,
        options.allowPolarity,
        effectiveMetric,
        screen.attributes[tileIndex] ?? 0,
      );
      const candidate: CharsetAssignment = { characterIndex, ...measured };
      if (
        best === null ||
        candidate.distance < best.distance ||
        (candidate.distance === best.distance && candidate.hamming < best.hamming) ||
        (candidate.distance === best.distance && candidate.hamming === best.hamming &&
          Number(candidate.inverted) < Number(best.inverted)) ||
        (candidate.distance === best.distance && candidate.hamming === best.hamming &&
          candidate.inverted === best.inverted && candidate.transform < best.transform) ||
        (candidate.distance === best.distance && candidate.hamming === best.hamming &&
          candidate.inverted === best.inverted && candidate.transform === best.transform &&
          candidate.characterIndex < best.characterIndex)
      ) best = candidate;
    }
    if (best === null) throw new Error("The charset did not contain a match candidate.");
    assignments.push(best);
    characterIndices[tileIndex] = best.characterIndex;
    transforms[tileIndex] = best.transform;
    if (best.inverted) {
      attributes[tileIndex] = swapInkPaper(attributes[tileIndex] ?? 0);
      polaritySwaps += 1;
    }
    totalDistance += best.distance;
    maximumDistance = Math.max(maximumDistance, best.distance);
    if (best.hamming === 0) exactMatches += 1;
    transformHistogram[best.transform] = (transformHistogram[best.transform] ?? 0) + 1;
  }
  let globalObjective: number | undefined;
  let refinementPasses: number | undefined;
  let v4Diagnostics: {
    initialRgbSquaredError: number;
    finalRgbSquaredError: number;
    multiscaleError: number;
    edgeError: number;
    rgbBoundaryError: number;
    saliencyError: number;
    medoidSwaps: number;
    assignmentChanges: number;
    candidatesEvaluated: number;
    equivalentCandidatesPruned: number;
    cellsRecomputed: number;
    boundaryTermsRecomputed: number;
    candidateCacheHits: number;
    candidateSetsPrepared: number;
  } | undefined;
  if (options.derivedStrategy === "image-similarity-v3") {
    const refined = refineImageSimilarityV3(
      tiles,
      screen,
      charset,
      assignments,
      options,
    );
    assignments.splice(0, assignments.length, ...refined.assignments);
    globalObjective = refined.objective;
    refinementPasses = refined.passes;
    characterIndices.fill(0);
    transforms.fill(0);
    attributes.set(screen.attributes);
    totalDistance = 0;
    maximumDistance = 0;
    exactMatches = 0;
    polaritySwaps = 0;
    transformHistogram.fill(0);
    assignments.forEach((assignment, tileIndex) => {
      characterIndices[tileIndex] = assignment.characterIndex;
      transforms[tileIndex] = assignment.transform;
      if (assignment.inverted) {
        attributes[tileIndex] = swapInkPaper(attributes[tileIndex] ?? 0);
        polaritySwaps += 1;
      }
      totalDistance += assignment.distance;
      maximumDistance = Math.max(maximumDistance, assignment.distance);
      if (assignment.hamming === 0) exactMatches += 1;
      transformHistogram[assignment.transform] =
        (transformHistogram[assignment.transform] ?? 0) + 1;
    });
  } else if (options.derivedStrategy === "image-similarity-v4" ||
      options.derivedStrategy === "image-similarity-v5") {
    const refined = options.derivedStrategy === "image-similarity-v5"
      ? refineImageSimilarityV5(
          tiles, screen, charset, assignments, options,
        )
      : refineImageSimilarityV4(
      tiles,
      screen,
      charset,
      assignments,
      options,
        );
    charset = refined.charset;
    assignments.splice(0, assignments.length, ...refined.assignments);
    refinementPasses = refined.passes;
    v4Diagnostics = {
      initialRgbSquaredError: refined.initialRgb,
      finalRgbSquaredError: refined.metrics.rgb,
      multiscaleError: refined.metrics.multiscale,
      edgeError: refined.metrics.edge,
      rgbBoundaryError: refined.metrics.boundary,
      saliencyError: refined.metrics.saliency,
      medoidSwaps: refined.medoidSwaps,
      assignmentChanges: refined.assignmentChanges,
      candidatesEvaluated: refined.performance.candidatesEvaluated,
      equivalentCandidatesPruned: refined.performance.equivalentCandidatesPruned,
      cellsRecomputed: refined.performance.cellsRecomputed,
      boundaryTermsRecomputed: refined.performance.boundaryTermsRecomputed,
      candidateCacheHits: refined.performance.candidateCacheHits,
      candidateSetsPrepared: refined.performance.candidateSetsPrepared,
    };
    characterIndices.fill(0);
    transforms.fill(0);
    attributes.set(screen.attributes);
    totalDistance = 0;
    maximumDistance = 0;
    exactMatches = 0;
    polaritySwaps = 0;
    transformHistogram.fill(0);
    assignments.forEach((assignment, tileIndex) => {
      characterIndices[tileIndex] = assignment.characterIndex;
      transforms[tileIndex] = assignment.transform;
      if (assignment.inverted) {
        attributes[tileIndex] = swapInkPaper(attributes[tileIndex] ?? 0);
        polaritySwaps += 1;
      }
      totalDistance += assignment.distance;
      maximumDistance = Math.max(maximumDistance, assignment.distance);
      if (assignment.hamming === 0) exactMatches += 1;
      transformHistogram[assignment.transform] =
        (transformHistogram[assignment.transform] ?? 0) + 1;
    });
  }
  const artifact = encodeCharsetArtifact({
    encoding: options.encoding,
    characterCount,
    transformations: options.allowTransforms,
    characterIndices,
    attributes,
    transforms,
    charset,
  });
  const decoded = decodeCharsetArtifact(artifact.bytes, {
    encoding: artifact.encoding,
    characterCount,
    transformations: artifact.transformations,
  });
  const sourcePreview = renderCharsetPreview(screen);
  const previewRgba = renderCharsetPreview(decoded.screen);
  let rgbSquaredError = 0;
  for (let offset = 0; offset < sourcePreview.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const difference =
        (sourcePreview[offset + channel] ?? 0) -
        (previewRgba[offset + channel] ?? 0);
      rgbSquaredError += difference * difference;
    }
  }
  const rgbSamples = 256 * 192 * 3;
  const rgbRmse = Math.sqrt(rgbSquaredError / rgbSamples);
  const usedCharacterCount = new Set(characterIndices).size;
  return {
    artifact,
    assignments,
    decodedScreen: decoded.screen,
    decodedScr: decoded.scr,
    previewRgba,
    diagnostics: {
      uniqueCanonicalTiles,
      usedCharacterCount,
      exactMatches,
      averageStructuralError: totalDistance / 768,
      maximumStructuralError: maximumDistance,
      rgbSquaredError,
      rgbRmse,
      rgbSimilarityPercent: Math.max(0, 1 - rgbRmse / 255) * 100,
      polaritySwaps,
      transformHistogram,
      ...(globalObjective === undefined ? {} : { globalObjective }),
      ...(refinementPasses === undefined ? {} : { refinementPasses }),
      ...(v4Diagnostics ?? {}),
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
