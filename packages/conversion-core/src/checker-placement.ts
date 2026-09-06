import type { RgbColor } from "./types.js";

export interface CheckerPlacementEndpointPair {
  readonly paper: RgbColor;
  readonly ink: RgbColor;
  readonly key?: number;
}

export interface CheckerPlacementResult {
  readonly pixels: Uint8Array;
  readonly changedPixels: number;
  readonly changedBlocks: number;
  readonly coverageDrift: number;
}

export interface CheckerPlacementPlan {
  readonly masks: Uint8Array;
  readonly blockColumns: number;
  readonly changedPixels: number;
  readonly changedBlocks: number;
  readonly fullBlocks: number;
  readonly eligibleBlocks: number;
  readonly intermediateCoverageBlocks: number;
  readonly checkerCandidateCount: number;
  readonly sourceRejectedCandidates: number;
  readonly structureRejectedCandidates: number;
  readonly edgeRejectedBlocks: number;
  readonly acceptedCheckerBlocks: number;
}

export interface CheckerOnlyPlacementPlanV33 {
  readonly masks: Uint8Array;
  readonly blockColumns: number;
  readonly changedPixels: number;
  readonly changedBlocks: number;
  readonly fullBlocks: number;
  readonly eligibleBlocks: number;
  readonly intermediateCoverageBlocks: number;
  readonly checkerCandidateCount: number;
  readonly sourceRejectedCandidates: number;
  readonly structureRejectedCandidates: number;
  readonly edgeRejectedBlocks: number;
  readonly acceptedCheckerBlocks: number;
  readonly phaseReorientedBlocks: number;
}

function popcount(value: number): number {
  let count = 0;
  for (let bit = value; bit !== 0; bit >>>= 1) count += bit & 1;
  return count;
}

function colorDistance(source: Uint8Array, width: number, x: number, y: number, color: RgbColor): number {
  const offset = (y * width + x) * 4;
  const dr = (source[offset] ?? 0) - color.r;
  const dg = (source[offset + 1] ?? 0) - color.g;
  const db = (source[offset + 2] ?? 0) - color.b;
  return (dr * dr + dg * dg + db * db) / 4096;
}

function colorSpan(first: RgbColor, second: RgbColor): number {
  const dr = first.r - second.r;
  const dg = first.g - second.g;
  const db = first.b - second.b;
  return (dr * dr + dg * dg + db * db) / 4096;
}

function isChecker(mask: number): boolean {
  return mask === 0b1001 || mask === 0b0110;
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function checkerPlacementStrengthV33(lineSuppression: number): number {
  const suppression = Math.max(0, Math.min(100, lineSuppression)) / 100;
  return suppression <= 0.35 ? 0 : smoothstep(0.35, 1, suppression);
}

function blockBit(
  pixels: Uint8Array,
  masks: Uint8Array,
  width: number,
  x: number,
  y: number,
  mask: number | null,
  left: number,
  top: number,
  blockColumns: number,
): number {
  if (mask !== null && x >= left && x < left + 2 && y >= top && y < top + 2) {
    return (mask >> ((y - top) * 2 + x - left)) & 1;
  }
  const blockX = Math.floor(x / 2);
  const blockY = Math.floor(y / 2);
  const planned = masks[blockY * blockColumns + blockX];
  if (planned !== undefined && planned !== 255) {
    return (planned >> ((y & 1) * 2 + (x & 1))) & 1;
  }
  return pixels[y * width + x] ?? 0;
}

function sourceHasStrongEdge(
  source: Uint8Array,
  width: number,
  height: number,
  left: number,
  top: number,
): boolean {
  const center = (top * width + left) * 4;
  for (let y = Math.max(0, top - 1); y <= Math.min(height - 1, top + 2); y += 1) {
    for (let x = Math.max(0, left - 1); x <= Math.min(width - 1, left + 2); x += 1) {
      const offset = (y * width + x) * 4;
      if (Math.max(
        Math.abs((source[center] ?? 0) - (source[offset] ?? 0)),
        Math.abs((source[center + 1] ?? 0) - (source[offset + 1] ?? 0)),
        Math.abs((source[center + 2] ?? 0) - (source[offset + 2] ?? 0)),
      ) > 48) return true;
    }
  }
  return false;
}

function localStructureCost(
  pixels: Uint8Array,
  masks: Uint8Array,
  width: number,
  height: number,
  left: number,
  top: number,
  candidateMask: number,
  blockColumns: number,
): number {
  let cost = 0;
  const directions = [[1, 0], [0, 1], [1, 1], [-1, 1]] as const;
  for (let dy = 0; dy < 2; dy += 1) {
    for (let dx = 0; dx < 2; dx += 1) {
      const x = left + dx;
      const y = top + dy;
      const bit = blockBit(
        pixels, masks, width, x, y, candidateMask, left, top, blockColumns,
      );
      for (const [stepX, stepY] of directions) {
        let run = 1;
        for (const sign of [-1, 1] as const) {
          for (let distance = 1; distance <= 3; distance += 1) {
            const nx = x + stepX * distance * sign;
            const ny = y + stepY * distance * sign;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) break;
            if (blockBit(
              pixels, masks, width, nx, ny, candidateMask, left, top, blockColumns,
            ) !== bit) break;
            run += 1;
          }
        }
        if (run >= 3) cost += (run - 2) * (run - 2);
      }
    }
  }
  // Explicitly penalize the two most common replacement artifacts: a 2×1
  // horizontal bar and a 1×2 vertical bar.
  if ((candidateMask & 0b0011) === 0b0011 || (candidateMask & 0b0011) === 0) cost += 3;
  if ((candidateMask & 0b1100) === 0b1100 || (candidateMask & 0b1100) === 0) cost += 3;
  if ((candidateMask & 0b0101) === 0b0101 || (candidateMask & 0b0101) === 0) cost += 3;
  if ((candidateMask & 0b1010) === 0b1010 || (candidateMask & 0b1010) === 0) cost += 3;
  return cost;
}

/**
 * Plans integrated checker decisions for a later v3 diffusion pass. Unlike
 * applyCheckerPlacement(), this helper does not edit an emitted bitmap. It
 * chooses one legal mask per 2×2 block; the caller must use those decisions
 * while propagating the actual quantization error.
 */
export function planCheckerPlacement(
  source: Uint8Array,
  pixels: Uint8Array,
  width: number,
  height: number,
  strength: number,
  endpointAt: (x: number, y: number) => CheckerPlacementEndpointPair | null,
  cellWidth = 0,
  cellHeight = 0,
): CheckerPlacementPlan {
  const blockColumns = Math.ceil(width / 2);
  const blockRows = Math.ceil(height / 2);
  const masks = new Uint8Array(blockColumns * blockRows);
  masks.fill(255);
  const clampedStrength = Math.max(0, Math.min(1, strength));
  let changedPixels = 0;
  let changedBlocks = 0;
  let fullBlocks = 0;
  let eligibleBlocks = 0;
  let intermediateCoverageBlocks = 0;
  let checkerCandidateCount = 0;
  let sourceRejectedCandidates = 0;
  let structureRejectedCandidates = 0;
  let edgeRejectedBlocks = 0;
  let acceptedCheckerBlocks = 0;
  if (clampedStrength === 0) {
    return {
      masks, blockColumns, changedPixels, changedBlocks, fullBlocks,
      eligibleBlocks, intermediateCoverageBlocks, checkerCandidateCount,
      sourceRejectedCandidates, structureRejectedCandidates, edgeRejectedBlocks,
      acceptedCheckerBlocks,
    };
  }

  const blockSourceCost = (
    mask: number,
    left: number,
    top: number,
    pair: CheckerPlacementEndpointPair,
  ): number => {
    let cost = 0;
    for (let dy = 0; dy < 2; dy += 1) {
      for (let dx = 0; dx < 2; dx += 1) {
        const x = left + dx;
        const y = top + dy;
        const bit = (mask >> (dy * 2 + dx)) & 1;
        cost += colorDistance(source, width, x, y, bit === 1 ? pair.ink : pair.paper);
      }
    }
    return cost;
  };

  for (let top = 0; top + 1 < height; top += 2) {
    for (let left = 0; left + 1 < width; left += 2) {
      fullBlocks += 1;
      if (
        cellWidth > 0 && Math.floor(left / cellWidth) !== Math.floor((left + 1) / cellWidth) ||
        cellHeight > 0 && Math.floor(top / cellHeight) !== Math.floor((top + 1) / cellHeight)
      ) continue;
      if (sourceHasStrongEdge(source, width, height, left, top)) {
        edgeRejectedBlocks += 1;
        continue;
      }
      const endpoints = [
        endpointAt(left, top), endpointAt(left + 1, top),
        endpointAt(left, top + 1), endpointAt(left + 1, top + 1),
      ];
      if (endpoints.some((candidate) => candidate === null)) continue;
      const pair = endpoints[0]!;
      if (endpoints.some((candidate) =>
        candidate!.key !== pair.key ||
        candidate!.paper.r !== pair.paper.r || candidate!.paper.g !== pair.paper.g ||
        candidate!.paper.b !== pair.paper.b || candidate!.ink.r !== pair.ink.r ||
        candidate!.ink.g !== pair.ink.g || candidate!.ink.b !== pair.ink.b
      )) continue;
      eligibleBlocks += 1;
      const blockIndex = Math.floor(top / 2) * blockColumns + Math.floor(left / 2);
      const oldMask =
        (pixels[top * width + left] ?? 0) |
        ((pixels[top * width + left + 1] ?? 0) << 1) |
        ((pixels[(top + 1) * width + left] ?? 0) << 2) |
        ((pixels[(top + 1) * width + left + 1] ?? 0) << 3);
      const targetCoverage = popcount(oldMask);
      if (targetCoverage === 0 || targetCoverage === 4) continue;
      intermediateCoverageBlocks += 1;
      const oldSourceCost = blockSourceCost(oldMask, left, top, pair);
      const oldStructureCost = localStructureCost(
        pixels, masks, width, height, left, top, oldMask, blockColumns,
      );
      let bestMask = oldMask;
      let bestCost = oldSourceCost + oldStructureCost * clampedStrength;
      for (let mask = 0; mask < 16; mask += 1) {
        if (mask === oldMask || popcount(mask) !== targetCoverage) continue;
        const sourceCost = blockSourceCost(mask, left, top, pair);
        const endpointSpan = Math.max(1, colorSpan(pair.paper, pair.ink));
        // Permit a modest, endpoint-span-normalized source mismatch so flat
        // intermediate fields can form a visible checker pattern without
        // making low-contrast or edge-adjacent pairs unstable.
        const sourceBudget = endpointSpan * (0.005 + clampedStrength * 0.02);
        if (sourceCost > oldSourceCost + Math.max(2, sourceBudget)) {
          sourceRejectedCandidates += 1;
          continue;
        }
        const structureCost = localStructureCost(
          pixels, masks, width, height, left, top, mask, blockColumns,
        );
        const checkerCandidate = targetCoverage === 2 && isChecker(mask);
        const allowedStructureIncrease = checkerCandidate ? 6 : 1;
        if (structureCost > oldStructureCost + allowedStructureIncrease) {
          structureRejectedCandidates += 1;
          continue;
        }
        if (checkerCandidate) checkerCandidateCount += 1;
        // A small negative bonus makes checker masks win near-ties instead of
        // requiring them to improve the already-produced v3 structure. The
        // source budget and directional guard still bound the intervention.
        const checkerPenalty = checkerCandidate ? -8 : 12;
        const phasePenalty = checkerCandidate
          ? (((mask & 1) !== (((left + top) & 1) ^ 1)) ? 1 : 0)
          : 0;
        const cost = sourceCost + clampedStrength * (
          structureCost + checkerPenalty + phasePenalty
        );
        // Fixed mask order is the final tie-breaker, making the global phase
        // origin stable across repeated conversions and scan directions.
        if (cost + 0.25 < bestCost) {
          bestCost = cost;
          bestMask = mask;
        }
      }
      masks[blockIndex] = bestMask;
      if (bestMask !== oldMask) {
        changedBlocks += 1;
        changedPixels += popcount(bestMask ^ oldMask);
        if (targetCoverage === 2 && isChecker(bestMask)) acceptedCheckerBlocks += 1;
      }
    }
  }
  return {
    masks, blockColumns, changedPixels, changedBlocks, fullBlocks,
    eligibleBlocks, intermediateCoverageBlocks, checkerCandidateCount,
    sourceRejectedCandidates, structureRejectedCandidates, edgeRejectedBlocks,
    acceptedCheckerBlocks,
  };
}

/**
 * Plans v3.3's deliberately narrow intervention. It only reorients existing
 * two-and-two blocks to one of the two checker masks. The v3.2 planner above
 * intentionally remains separate so its historical behavior is unchanged.
 */
export function planCheckerOnlyPlacementV33(
  source: Uint8Array,
  pixels: Uint8Array,
  width: number,
  height: number,
  strength: number,
  endpointAt: (x: number, y: number) => CheckerPlacementEndpointPair | null,
  cellWidth = 0,
  cellHeight = 0,
): CheckerOnlyPlacementPlanV33 {
  const blockColumns = Math.ceil(width / 2);
  const blockRows = Math.ceil(height / 2);
  const masks = new Uint8Array(blockColumns * blockRows);
  masks.fill(255);
  const checkerStrength = Math.max(0, Math.min(1, strength));
  let changedPixels = 0;
  let changedBlocks = 0;
  let fullBlocks = 0;
  let eligibleBlocks = 0;
  let intermediateCoverageBlocks = 0;
  let checkerCandidateCount = 0;
  let sourceRejectedCandidates = 0;
  let structureRejectedCandidates = 0;
  let edgeRejectedBlocks = 0;
  let acceptedCheckerBlocks = 0;
  let phaseReorientedBlocks = 0;
  if (checkerStrength === 0) {
    return {
      masks, blockColumns, changedPixels, changedBlocks, fullBlocks,
      eligibleBlocks, intermediateCoverageBlocks, checkerCandidateCount,
      sourceRejectedCandidates, structureRejectedCandidates, edgeRejectedBlocks,
      acceptedCheckerBlocks, phaseReorientedBlocks,
    };
  }

  const blockSourceCost = (
    mask: number,
    left: number,
    top: number,
    pair: CheckerPlacementEndpointPair,
  ): number => {
    let cost = 0;
    for (let dy = 0; dy < 2; dy += 1) {
      for (let dx = 0; dx < 2; dx += 1) {
        const bit = (mask >> (dy * 2 + dx)) & 1;
        cost += colorDistance(source, width, left + dx, top + dy, bit === 1 ? pair.ink : pair.paper);
      }
    }
    return cost;
  };
  const samePair = (
    first: CheckerPlacementEndpointPair,
    second: CheckerPlacementEndpointPair,
  ): boolean => first.key === second.key &&
    first.paper.r === second.paper.r && first.paper.g === second.paper.g && first.paper.b === second.paper.b &&
    first.ink.r === second.ink.r && first.ink.g === second.ink.g && first.ink.b === second.ink.b;
  const continuityPenalty = (blockIndex: number, candidateMask: number): number => {
    const leftNeighbor = blockIndex - 1;
    const upperNeighbor = blockIndex - blockColumns;
    let penalty = 0;
    for (const neighbor of [leftNeighbor, upperNeighbor]) {
      const neighborMask = masks[neighbor];
      if (neighborMask !== undefined && isChecker(neighborMask) &&
        (neighborMask & 1) !== (candidateMask & 1)) penalty += 2;
    }
    return penalty;
  };
  const phasePenalty = (left: number, top: number, mask: number): number =>
    ((mask & 1) === (((left + top) & 1) ^ 1)) ? 0 : 1;

  for (let top = 0; top + 1 < height; top += 2) {
    for (let left = 0; left + 1 < width; left += 2) {
      fullBlocks += 1;
      if (
        cellWidth > 0 && Math.floor(left / cellWidth) !== Math.floor((left + 1) / cellWidth) ||
        cellHeight > 0 && Math.floor(top / cellHeight) !== Math.floor((top + 1) / cellHeight)
      ) continue;
      const blockIndex = Math.floor(top / 2) * blockColumns + Math.floor(left / 2);
      if (sourceHasStrongEdge(source, width, height, left, top)) {
        edgeRejectedBlocks += 1;
        continue;
      }
      const endpoints = [
        endpointAt(left, top), endpointAt(left + 1, top),
        endpointAt(left, top + 1), endpointAt(left + 1, top + 1),
      ];
      if (endpoints.some((candidate) => candidate === null)) continue;
      const pair = endpoints[0]!;
      if (endpoints.some((candidate) => !samePair(pair, candidate!))) continue;
      eligibleBlocks += 1;
      const oldMask =
        (pixels[top * width + left] ?? 0) |
        ((pixels[top * width + left + 1] ?? 0) << 1) |
        ((pixels[(top + 1) * width + left] ?? 0) << 2) |
        ((pixels[(top + 1) * width + left + 1] ?? 0) << 3);
      if (popcount(oldMask) !== 2) continue;
      intermediateCoverageBlocks += 1;
      // Store the original decision before looking at the next block. This
      // makes continuity deterministic and does not let rejected candidates
      // affect later blocks.
      masks[blockIndex] = oldMask;
      const oldSourceCost = blockSourceCost(oldMask, left, top, pair);
      const oldStructureCost = localStructureCost(
        pixels, masks, width, height, left, top, oldMask, blockColumns,
      );
      const endpointSpan = Math.max(1, colorSpan(pair.paper, pair.ink));
      const sourceBudget = endpointSpan * (0.005 + checkerStrength * 0.020);
      const preferredBit = ((left + top) & 1) ^ 1;
      const preferredMask = preferredBit === 1 ? 0b1001 : 0b0110;
      const candidateMasks = [preferredMask, preferredMask === 0b1001 ? 0b0110 : 0b1001];
      const oldCost = oldSourceCost + checkerStrength * (
        oldStructureCost + (isChecker(oldMask) ? -8 + phasePenalty(left, top, oldMask) + continuityPenalty(blockIndex, oldMask) : 0)
      );
      let bestMask = oldMask;
      let bestCost = oldCost;
      for (const mask of candidateMasks) {
        if (mask === oldMask) continue;
        const sourceCost = blockSourceCost(mask, left, top, pair);
        if (sourceCost > oldSourceCost + sourceBudget) {
          sourceRejectedCandidates += 1;
          continue;
        }
        const structureCost = localStructureCost(
          pixels, masks, width, height, left, top, mask, blockColumns,
        );
        if (structureCost > oldStructureCost + 6) {
          structureRejectedCandidates += 1;
          continue;
        }
        checkerCandidateCount += 1;
        const cost = sourceCost + checkerStrength * (
          structureCost - 8 + phasePenalty(left, top, mask) + continuityPenalty(blockIndex, mask)
        );
        // Candidate order is preferred phase first; the margin keeps nearly
        // indistinguishable flips from creating pepper noise.
        if (cost + 0.25 < bestCost) {
          bestMask = mask;
          bestCost = cost;
        }
      }
      masks[blockIndex] = bestMask;
      if (bestMask !== oldMask) {
        changedBlocks += 1;
        changedPixels += popcount(bestMask ^ oldMask);
        acceptedCheckerBlocks += 1;
        if (isChecker(oldMask)) phaseReorientedBlocks += 1;
      }
    }
  }
  return {
    masks, blockColumns, changedPixels, changedBlocks, fullBlocks,
    eligibleBlocks, intermediateCoverageBlocks, checkerCandidateCount,
    sourceRejectedCandidates, structureRejectedCandidates, edgeRejectedBlocks,
    acceptedCheckerBlocks, phaseReorientedBlocks,
  };
}

export function applyCheckerPlacement(
  source: Uint8Array,
  pixels: Uint8Array,
  width: number,
  height: number,
  strength: number,
  endpointAt: (x: number, y: number) => CheckerPlacementEndpointPair | null,
  cellWidth = 0,
  cellHeight = 0,
): CheckerPlacementResult {
  const placement = pixels.slice();
  const coverageBuffer = new Uint8Array(Math.ceil(width / 2) * Math.ceil(height / 2));
  const placementBuffer = new Uint8Array(placement.length);
  placementBuffer.set(placement);
  let changedPixels = 0;
  let changedBlocks = 0;
  let coverageDrift = 0;
  const clampedStrength = Math.max(0, Math.min(1, strength));
  if (clampedStrength === 0) return { pixels: placement, changedPixels, changedBlocks, coverageDrift };
  const blockColumns = Math.ceil(width / 2);
  const bitAt = (x: number, y: number, mask: number, left: number, top: number) =>
    x >= left && x < left + 2 && y >= top && y < top + 2
      ? (mask >> ((y - top) * 2 + x - left)) & 1
      : placementBuffer[y * width + x] ?? 0;
  const patternCost = (mask: number, left: number, top: number, pair: CheckerPlacementEndpointPair): number => {
    let cost = 0;
    for (let dy = 0; dy < 2; dy += 1) {
      for (let dx = 0; dx < 2; dx += 1) {
        const x = left + dx;
        const y = top + dy;
        const bit = (mask >> (dy * 2 + dx)) & 1;
        cost += colorDistance(source, width, x, y, bit === 1 ? pair.ink : pair.paper);
        if (x > 0 && x + 1 < width && bitAt(x - 1, y, mask, left, top) === bit && bitAt(x + 1, y, mask, left, top) === bit) cost += clampedStrength * 2;
        if (y > 0 && y + 1 < height && bitAt(x, y - 1, mask, left, top) === bit && bitAt(x, y + 1, mask, left, top) === bit) cost += clampedStrength * 3;
        if (x > 0 && y > 0 && x + 1 < width && y + 1 < height && bitAt(x - 1, y - 1, mask, left, top) === bit && bitAt(x + 1, y + 1, mask, left, top) === bit) cost += clampedStrength * 2;
      }
    }
    if (popcount(mask) === 2 && !isChecker(mask)) cost += clampedStrength * 8;
    return cost;
  };
  for (let top = 0; top + 1 < height; top += 2) {
    for (let left = 0; left + 1 < width; left += 2) {
      if (cellWidth > 0 && Math.floor(left / cellWidth) !== Math.floor((left + 1) / cellWidth)) continue;
      if (cellHeight > 0 && Math.floor(top / cellHeight) !== Math.floor((top + 1) / cellHeight)) continue;
      const endpoints = [
        endpointAt(left, top), endpointAt(left + 1, top),
        endpointAt(left, top + 1), endpointAt(left + 1, top + 1),
      ];
      if (endpoints.some((candidate) => candidate === null)) continue;
      const pair = endpoints[0]!;
      if (endpoints.some((candidate) => candidate!.key !== pair.key || candidate!.paper.r !== pair.paper.r || candidate!.paper.g !== pair.paper.g || candidate!.paper.b !== pair.paper.b || candidate!.ink.r !== pair.ink.r || candidate!.ink.g !== pair.ink.g || candidate!.ink.b !== pair.ink.b)) continue;
      let edge = false;
      for (let y = Math.max(0, top - 1); y <= Math.min(height - 1, top + 2) && !edge; y += 1) {
        for (let x = Math.max(0, left - 1); x <= Math.min(width - 1, left + 2); x += 1) {
          const center = (top * width + left) * 4;
          const offset = (y * width + x) * 4;
          if (Math.max(
            Math.abs((source[center] ?? 0) - (source[offset] ?? 0)),
            Math.abs((source[center + 1] ?? 0) - (source[offset + 1] ?? 0)),
            Math.abs((source[center + 2] ?? 0) - (source[offset + 2] ?? 0)),
          ) > 48) edge = true;
        }
      }
      if (edge) continue;
      const blockIndex = Math.floor(top / 2) * blockColumns + Math.floor(left / 2);
      const oldMask = (placementBuffer[top * width + left] ?? 0) |
        ((placementBuffer[top * width + left + 1] ?? 0) << 1) |
        ((placementBuffer[(top + 1) * width + left] ?? 0) << 2) |
        ((placementBuffer[(top + 1) * width + left + 1] ?? 0) << 3);
      const targetCoverage = popcount(oldMask);
      coverageBuffer[blockIndex] = targetCoverage;
      if (targetCoverage === 0 || targetCoverage === 4) continue;
      let bestMask = oldMask;
      let bestCost = patternCost(oldMask, left, top, pair);
      for (let mask = 0; mask < 16; mask += 1) {
        if (mask === oldMask || popcount(mask) !== targetCoverage) continue;
        const cost = patternCost(mask, left, top, pair);
        if (cost < bestCost) {
          bestCost = cost;
          bestMask = mask;
        }
      }
      if (bestMask === oldMask || bestCost + 1 >= patternCost(oldMask, left, top, pair)) continue;
      changedBlocks += 1;
      for (let dy = 0; dy < 2; dy += 1) {
        for (let dx = 0; dx < 2; dx += 1) {
          const index = (top + dy) * width + left + dx;
          const next = (bestMask >> (dy * 2 + dx)) & 1;
          if ((placementBuffer[index] ?? 0) !== next) changedPixels += 1;
          placementBuffer[index] = next;
          placement[index] = next;
        }
      }
      coverageDrift += Math.abs(popcount(bestMask) - targetCoverage);
    }
  }
  return { pixels: placement, changedPixels, changedBlocks, coverageDrift };
}
