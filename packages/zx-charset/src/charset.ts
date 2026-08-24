import type { ZxScreen } from "@retro-converter/zx-spectrum";
import { bestTileDistance } from "./distance.js";
import {
  canonicalTile,
  tileKey,
  type Tile,
} from "./tiles.js";
import type {
  CharsetConversionOptions,
  CharsetDistanceMetric,
} from "./types.js";

interface TileGroup {
  readonly tile: Tile;
  readonly attributeCounts: Map<number, number>;
  count: number;
  weight: number;
}

function attributeContrastWeight(attribute: number, tile: Uint8Array): number {
  const ink = attribute & 0x07;
  const paper = (attribute >> 3) & 0x07;
  const colorDifference = (
    Number((ink & 1) !== (paper & 1)) +
    Number((ink & 2) !== (paper & 2)) +
    Number((ink & 4) !== (paper & 4))
  ) / 3;
  let edges = 0;
  for (let y = 0; y < 8; y += 1) {
    const row = tile[y] ?? 0;
    edges += ((row ^ (row << 1)) & 0xfe).toString(2).replaceAll("0", "").length;
    if (y > 0) {
      edges += ((row ^ (tile[y - 1] ?? 0))).toString(2).replaceAll("0", "").length;
    }
  }
  return 1 + colorDifference + Math.min(1, edges / 56);
}

export function groupCanonicalTiles(
  tiles: readonly Uint8Array[],
  attributes: Uint8Array,
  options: Pick<
    CharsetConversionOptions,
    "allowTransforms" | "allowPolarity" | "visualWeighting"
  >,
): readonly TileGroup[] {
  const groups = new Map<string, TileGroup>();
  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index]!;
    const canonical = canonicalTile(
      tile,
      options.allowTransforms,
      options.allowPolarity,
    );
    const key = tileKey(canonical);
    const existing = groups.get(key);
    const weight = options.visualWeighting
      ? attributeContrastWeight(attributes[index] ?? 0, tile)
      : 1;
    if (existing === undefined) {
      groups.set(key, {
        tile: canonical,
        attributeCounts: new Map([[attributes[index] ?? 0, 1]]),
        count: 1,
        weight,
      });
    } else {
      existing.count += 1;
      existing.weight += weight;
      const attribute = attributes[index] ?? 0;
      existing.attributeCounts.set(
        attribute,
        (existing.attributeCounts.get(attribute) ?? 0) + 1,
      );
    }
  }
  return [...groups.values()].sort((left, right) =>
    right.count - left.count || tileKey(left.tile).localeCompare(tileKey(right.tile))
  );
}

function distanceMatrix(
  groups: readonly TileGroup[],
  allowTransforms: boolean,
  allowPolarity: boolean,
  metric: CharsetDistanceMetric,
): readonly Float64Array[] {
  return groups.map((source) => Float64Array.from(
    groups,
    (candidate) => {
      if (
        metric !== "image-similarity-v2" &&
        metric !== "image-similarity-v3" &&
        metric !== "image-similarity-v4" &&
        metric !== "image-similarity-v5"
      ) {
        return bestTileDistance(
          source.tile,
          candidate.tile,
          allowTransforms,
          allowPolarity,
          metric,
        ).distance;
      }
      let weightedDistance = 0;
      for (const [attribute, count] of source.attributeCounts) {
        weightedDistance += bestTileDistance(
          source.tile,
          candidate.tile,
          allowTransforms,
          allowPolarity,
          metric,
          attribute,
        ).distance * count;
      }
      return weightedDistance / source.count;
    },
  ));
}

function greedyCoverage(
  groups: readonly TileGroup[],
  count: number,
  matrix: readonly Float64Array[],
): number[] {
  const selected: number[] = [];
  const selectedSet = new Set<number>();
  const nearest = new Float64Array(groups.length);
  nearest.fill(Number.POSITIVE_INFINITY);
  while (selected.length < count) {
    let bestCandidate = -1;
    let bestError = Number.POSITIVE_INFINITY;
    for (let candidate = 0; candidate < groups.length; candidate += 1) {
      if (selectedSet.has(candidate)) continue;
      let error = 0;
      for (let source = 0; source < groups.length; source += 1) {
        error += Math.min(
          nearest[source] ?? Number.POSITIVE_INFINITY,
          matrix[source]?.[candidate] ?? Number.POSITIVE_INFINITY,
        ) * (groups[source]?.weight ?? 1);
      }
      if (error < bestError || (error === bestError && candidate < bestCandidate)) {
        bestError = error;
        bestCandidate = candidate;
      }
    }
    if (bestCandidate < 0) break;
    selected.push(bestCandidate);
    selectedSet.add(bestCandidate);
    for (let source = 0; source < groups.length; source += 1) {
      nearest[source] = Math.min(
        nearest[source] ?? Number.POSITIVE_INFINITY,
        matrix[source]?.[bestCandidate] ?? Number.POSITIVE_INFINITY,
      );
    }
  }
  return selected;
}

function refineSwaps(
  groups: readonly TileGroup[],
  selected: number[],
  matrix: readonly Float64Array[],
  passes: number,
): number[] {
  let result = [...selected];
  for (let pass = 0; pass < passes; pass += 1) {
    const selectedSet = new Set(result);
    const nearest = new Float64Array(groups.length);
    const secondNearest = new Float64Array(groups.length);
    const nearestSlot = new Int16Array(groups.length);
    nearest.fill(Number.POSITIVE_INFINITY);
    secondNearest.fill(Number.POSITIVE_INFINITY);
    nearestSlot.fill(-1);
    let baseline = 0;
    for (let source = 0; source < groups.length; source += 1) {
      for (let slot = 0; slot < result.length; slot += 1) {
        const distance = matrix[source]?.[result[slot]!] ??
          Number.POSITIVE_INFINITY;
        if (distance < nearest[source]!) {
          secondNearest[source] = nearest[source]!;
          nearest[source] = distance;
          nearestSlot[source] = slot;
        } else if (distance < secondNearest[source]!) {
          secondNearest[source] = distance;
        }
      }
      baseline += nearest[source]! * (groups[source]?.weight ?? 1);
    }
    let bestError = baseline;
    let bestSlot = -1;
    let bestCandidate = -1;
    for (let slot = 0; slot < result.length; slot += 1) {
      const removed = result[slot]!;
      selectedSet.delete(removed);
      for (let candidate = 0; candidate < groups.length; candidate += 1) {
        if (selectedSet.has(candidate)) continue;
        let error = 0;
        for (let source = 0; source < groups.length; source += 1) {
          const retainedDistance = nearestSlot[source] === slot
            ? secondNearest[source]!
            : nearest[source]!;
          const replacementDistance = matrix[source]?.[candidate] ??
            Number.POSITIVE_INFINITY;
          error += Math.min(retainedDistance, replacementDistance) *
            (groups[source]?.weight ?? 1);
        }
        if (
          error < bestError ||
          (error === bestError && error < baseline &&
            (slot < bestSlot || (slot === bestSlot && candidate < bestCandidate)))
        ) {
          bestError = error;
          bestSlot = slot;
          bestCandidate = candidate;
        }
      }
      selectedSet.add(removed);
    }
    if (bestSlot < 0) break;
    result[bestSlot] = bestCandidate;
  }
  return result;
}

export function deriveCharset(
  screen: ZxScreen,
  tiles: readonly Uint8Array[],
  options: CharsetConversionOptions,
): {
  readonly charset: Uint8Array;
  readonly uniqueCanonicalTiles: number;
} {
  const groups = groupCanonicalTiles(tiles, screen.attributes, options);
  const count = Math.min(options.characterBudget, groups.length);
  let selected: readonly TileGroup[];
  if (groups.length <= count || options.derivedStrategy === "frequency") {
    selected = groups.slice(0, count);
  } else {
    const metric = options.derivedStrategy === "image-similarity-v2" ||
        options.derivedStrategy === "image-similarity-v3" ||
        options.derivedStrategy === "image-similarity-v4" ||
        options.derivedStrategy === "image-similarity-v5"
      ? "image-similarity-v2"
      : options.distanceMetric;
    const matrix = distanceMatrix(
      groups,
      options.allowTransforms,
      options.allowPolarity,
      metric,
    );
    const greedy = greedyCoverage(groups, count, matrix);
    const refined = refineSwaps(
      groups,
      greedy,
      matrix,
      Math.max(
        0,
        Math.min(
          4,
          options.swapRefinementPasses ??
            (
              options.derivedStrategy === "image-similarity-v2" ||
              options.derivedStrategy === "image-similarity-v3" ||
              options.derivedStrategy === "image-similarity-v4" ||
              options.derivedStrategy === "image-similarity-v5"
                ? 4
                : 1
            ),
        ),
      ),
    );
    selected = refined.map((index) => groups[index]!);
  }
  const charset = new Uint8Array(selected.length * 8);
  selected.forEach((group, index) => charset.set(group.tile, index * 8));
  return { charset, uniqueCanonicalTiles: groups.length };
}

export function validateCharsetBytes(
  charset: Uint8Array,
  maximumCharacters = 256,
): number {
  if (charset.length === 0 || charset.length % 8 !== 0) {
    throw new RangeError("A charset must contain a non-zero multiple of eight bytes.");
  }
  const count = charset.length / 8;
  if (count > maximumCharacters) {
    throw new RangeError(`A charset may contain at most ${maximumCharacters} characters.`);
  }
  return count;
}
