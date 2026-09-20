import { artisticThreshold } from "./artistic-ordered.js";
import {
  checkerPhaseDiffusionKernel,
  diffusionNoiseOffset,
  phaseBalancedDiffusionKernel,
} from "./diffusion.js";
import { ORDERED_MATRICES, orderedThreshold } from "./matrices.js";

const LUMA_WEIGHTS = [0.2126, 0.7152, 0.0722] as const;
const STRONG_EDGE = 0.18;
const WEAK_EDGE = 0.08;
const RESIDUAL_EPSILON = 0.025;
const RUN_MIN_COVERAGE = 0.30;
const RUN_MAX_COVERAGE = 0.70;

export type GrayscaleDiffusionReference = "v3" | "v4";
type GrayscaleAdaptiveCarrier = "adaptive-v45" | "adaptive-v45-1";
export type GrayscaleCarrierFamily =
  | "checker-a"
  | "checker-b"
  | "dispersed-4x4"
  | "diagonal";

export interface GrayscaleCheckerPhaseOptions {
  readonly ditheringAmount: number;
  readonly lineSuppression: number;
  readonly randomization: number;
}

export interface GrayscaleCheckerDiagnostics {
  readonly carrierStrength: number;
  readonly candidateCount: number;
  readonly acceptedCount: number;
  readonly sourceRejectedCount: number;
  readonly structureRejectedCount: number;
  readonly edgeRejectedCount: number;
  readonly checkerOccupancy: number;
  readonly checkerPhaseConsistency: number;
  readonly twoByOneArtifacts: number;
  readonly verticalRunScore: number;
  readonly horizontalRunScore: number;
  readonly diagonalRunScore: number;
  readonly maximumVerticalRun: number;
  readonly maximumHorizontalRun: number;
  readonly maximumDiagonalRun: number;
  readonly directionalAnisotropy: number;
  readonly toneDrift: number;
  readonly toneVariance: number;
  readonly carrierFamilyCounts: Readonly<Record<GrayscaleCarrierFamily, number>>;
  readonly carrierRegionCount: number;
  readonly carrierSwitchCount: number;
}

export interface GrayscaleCheckerResult {
  readonly bits: Uint8Array;
  readonly guide: Float32Array;
  readonly diagnostics: GrayscaleCheckerDiagnostics;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Map the existing suppression control directly to checker-carrier strength. */
export function checkerCarrierStrengthV44(
  ditheringAmount: number,
  lineSuppression: number,
): number {
  const amount = clamp01(ditheringAmount / 100);
  const suppression = clamp01(lineSuppression / 100);
  return amount * suppression;
}

function srgbToLinear(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function sourceLuma(source: Uint8Array, width: number, height: number): Float32Array {
  const values = new Float32Array(width * height);
  for (let index = 0; index < values.length; index += 1) {
    const offset = index * 4;
    values[index] = LUMA_WEIGHTS[0] * srgbToLinear(source[offset] ?? 0) +
      LUMA_WEIGHTS[1] * srgbToLinear(source[offset + 1] ?? 0) +
      LUMA_WEIGHTS[2] * srgbToLinear(source[offset + 2] ?? 0);
  }
  return values;
}

function neighborhoodStats(
  luma: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): { readonly strong: boolean; readonly weak: boolean; readonly variance: number; readonly gx: number; readonly gy: number } {
  const center = luma[y * width + x] ?? 0;
  const at = (nx: number, ny: number): number => luma[ny * width + nx] ?? center;
  const left = at(Math.max(0, x - 1), y);
  const right = at(Math.min(width - 1, x + 1), y);
  const above = at(x, Math.max(0, y - 1));
  const below = at(x, Math.min(height - 1, y + 1));
  const gx = Math.abs(right - left) / (x > 0 && x + 1 < width ? 2 : 1);
  const gy = Math.abs(below - above) / (y > 0 && y + 1 < height ? 2 : 1);
  let sum = 0;
  let sumSquares = 0;
  let count = 0;
  for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny += 1) {
    for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx += 1) {
      const value = at(nx, ny);
      sum += value;
      sumSquares += value * value;
      count += 1;
    }
  }
  const mean = sum / Math.max(1, count);
  const variance = Math.max(0, sumSquares / Math.max(1, count) - mean * mean);
  const maximumGradient = Math.max(
    Math.abs(center - left), Math.abs(center - right),
    Math.abs(center - above), Math.abs(center - below),
  );
  return {
    strong: maximumGradient >= STRONG_EDGE,
    weak: maximumGradient >= WEAK_EDGE,
    variance,
    gx,
    gy,
  };
}

type WrittenNeighbor = readonly [dx: number, dy: number, weight: number];
const WRITTEN_NEIGHBORS: readonly WrittenNeighbor[] = [
  [-1, 0, 2], [1, 0, 2],
  [0, -1, 4], [0, 1, 4],
  [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1],
];

function localDirectionalCost(
  bits: Uint8Array,
  luma: Float32Array,
  written: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  bit: number,
): number {
  let cost = 0;
  const centerResidual = bit - (luma[y * width + x] ?? 0);
  const centerSign = Math.abs(centerResidual) < RESIDUAL_EPSILON ? 0 : Math.sign(centerResidual);
  if (centerSign === 0) return 0;
  for (const [dx, dy, weight] of WRITTEN_NEIGHBORS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
    const index = ny * width + nx;
    if (written[index] !== 1) continue;
    const neighborResidual = (bits[index] ?? 0) - (luma[index] ?? 0);
    const neighborSign = Math.abs(neighborResidual) < RESIDUAL_EPSILON ? 0 : Math.sign(neighborResidual);
    if (neighborSign === centerSign) cost += weight;
  }
  return cost;
}

function runScore(
  bits: Uint8Array,
  luma: Float32Array,
  width: number,
  height: number,
  dx: number,
  dy: number,
): { readonly score: number; readonly maximum: number } {
  let score = 0;
  let maximum = 0;
  const starts: Array<readonly [number, number]> = [];
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) starts.push([x, y]);
  for (const [startX, startY] of starts) {
    let previousSign = 0;
    let run = 0;
    for (let x = startX, y = startY; x >= 0 && x < width && y >= 0 && y < height; x += dx, y += dy) {
      const index = y * width + x;
      const coverage = luma[index] ?? 0;
      if (coverage < RUN_MIN_COVERAGE || coverage > RUN_MAX_COVERAGE) {
        previousSign = 0;
        run = 0;
        continue;
      }
      const residual = (bits[index] ?? 0) - (luma[index] ?? 0);
      const sign = Math.abs(residual) < RESIDUAL_EPSILON ? 0 : Math.sign(residual);
      if (sign !== 0 && sign === previousSign) run += 1;
      else run = sign === 0 ? 0 : 1;
      maximum = Math.max(maximum, run);
      if (run >= 4) score += run - 3;
      previousSign = sign;
    }
  }
  return { score, maximum };
}

function checkerMetrics(bits: Uint8Array, width: number, height: number): {
  readonly occupancy: number;
  readonly phaseConsistency: number;
  readonly twoByOne: number;
} {
  let checker = 0;
  let phase = 0;
  let intermediate = 0;
  let twoByOne = 0;
  for (let y = 0; y + 1 < height; y += 1) {
    for (let x = 0; x + 1 < width; x += 1) {
      const a = bits[y * width + x] ?? 0;
      const b = bits[y * width + x + 1] ?? 0;
      const c = bits[(y + 1) * width + x] ?? 0;
      const d = bits[(y + 1) * width + x + 1] ?? 0;
      const coverage = a + b + c + d;
      if (coverage !== 2) continue;
      intermediate += 1;
      if (a === d && b === c && a !== b) {
        checker += 1;
        if (a === (((x + y) & 1) ^ 1)) phase += 1;
      } else if ((a === b && c === d && a !== c) || (a === c && b === d && a !== b)) {
        twoByOne += 1;
      }
    }
  }
  return {
    occupancy: intermediate === 0 ? 0 : checker / intermediate,
    phaseConsistency: checker === 0 ? 0 : phase / checker,
    twoByOne,
  };
}

const CARRIER_FAMILY_ORDER: readonly GrayscaleCarrierFamily[] = [
  "checker-a",
  "checker-b",
  "dispersed-4x4",
  "diagonal",
];

function carrierThreshold(
  family: GrayscaleCarrierFamily,
  x: number,
  y: number,
): number {
  if (family === "checker-a") return artisticThreshold(x, y, "checkerboard");
  if (family === "checker-b") return 1 - artisticThreshold(x, y, "checkerboard");
  if (family === "dispersed-4x4") {
    const matrix = ORDERED_MATRICES["bayer-4x4"];
    return (orderedThreshold(matrix, x, y) + 0.5) / matrix.levels;
  }
  return (((x + y) & 3) + 0.5) / 4;
}

function carrierTrialCost(
  luma: Float32Array,
  width: number,
  height: number,
  left: number,
  top: number,
  family: GrayscaleCarrierFamily,
): number {
  const right = Math.min(width, left + 16);
  const bottom = Math.min(height, top + 16);
  let cost = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      const value = luma[y * width + x] ?? 0;
      if (value < 0.12 || value > 0.88) continue;
      const bit = value > carrierThreshold(family, x, y) ? 1 : 0;
      cost += Math.abs(bit - value) * 8;
      if (x > left) {
        const previous = luma[y * width + x - 1] ?? 0;
        if (previous > 0.12 && previous < 0.88 &&
            (previous > carrierThreshold(family, x - 1, y) ? 1 : 0) === bit) cost += 2;
      }
      if (y > top) {
        const previous = luma[(y - 1) * width + x] ?? 0;
        if (previous > 0.12 && previous < 0.88 &&
            (previous > carrierThreshold(family, x, y - 1) ? 1 : 0) === bit) cost += 4;
      }
      if (x > left && y > top) {
        const previous = luma[(y - 1) * width + x - 1] ?? 0;
        if (previous > 0.12 && previous < 0.88 &&
            (previous > carrierThreshold(family, x - 1, y - 1) ? 1 : 0) === bit) cost += 1;
      }
    }
  }
  return cost;
}

interface CarrierRegionPlan {
  readonly families: Uint8Array;
  readonly columns: number;
  readonly regionSize: number;
  readonly familyCounts: Readonly<Record<GrayscaleCarrierFamily, number>>;
  readonly switchCount: number;
}

function buildCarrierRegionPlan(
  luma: Float32Array,
  width: number,
  height: number,
  forcedFamily?: GrayscaleCarrierFamily,
  regionSize = 16,
  refined = false,
): CarrierRegionPlan {
  const columns = Math.ceil(width / regionSize);
  const rows = Math.ceil(height / regionSize);
  const families = new Uint8Array(columns * rows);
  const familyCounts: Record<GrayscaleCarrierFamily, number> = {
    "checker-a": 0,
    "checker-b": 0,
    "dispersed-4x4": 0,
    diagonal: 0,
  };
  for (let regionY = 0; regionY < rows; regionY += 1) {
    for (let regionX = 0; regionX < columns; regionX += 1) {
      const left = regionX * regionSize;
      const top = regionY * regionSize;
      let selected: GrayscaleCarrierFamily = forcedFamily ?? (refined ? "checker-b" : "checker-a");
      if (forcedFamily === undefined) {
        const checkerA = carrierTrialCost(luma, width, height, left, top, "checker-a");
        const checkerB = carrierTrialCost(luma, width, height, left, top, "checker-b");
        if (refined) {
          // v4.5.1 deliberately prefers the visually stronger complementary
          // checker phase. Switch to phase A only on clear evidence; do not
          // introduce Bayer seams into the refined candidate.
          selected = checkerA + 2 < checkerB * 0.95 ? "checker-a" : "checker-b";
        } else {
          const checker = Math.min(checkerA, checkerB);
          const dispersed = carrierTrialCost(luma, width, height, left, top, "dispersed-4x4");
          if (dispersed <= checker * 0.9 && checker - dispersed >= 2) {
            selected = "dispersed-4x4";
          } else if (checkerB < checkerA) {
            selected = "checker-b";
          }
        }
      }
      families[regionY * columns + regionX] = CARRIER_FAMILY_ORDER.indexOf(selected);
      familyCounts[selected] += 1;
    }
  }
  let switchCount = 0;
  for (let regionY = 0; regionY < rows; regionY += 1) {
    for (let regionX = 0; regionX < columns; regionX += 1) {
      const current = families[regionY * columns + regionX];
      if (regionX > 0 && families[regionY * columns + regionX - 1] !== current) switchCount += 1;
      if (regionY > 0 && families[(regionY - 1) * columns + regionX] !== current) switchCount += 1;
    }
  }
  return { families, columns, regionSize, familyCounts, switchCount };
}

function familyAt(plan: CarrierRegionPlan, x: number, y: number): GrayscaleCarrierFamily {
  return CARRIER_FAMILY_ORDER[
    plan.families[Math.floor(y / plan.regionSize) * plan.columns + Math.floor(x / plan.regionSize)] ?? 0
  ] ?? "checker-a";
}

function diagnostics(
  bits: Uint8Array,
  guide: Float32Array,
  luma: Float32Array,
  width: number,
  height: number,
  carrierStrength: number,
  candidateCount: number,
  acceptedCount: number,
  sourceRejectedCount: number,
  structureRejectedCount: number,
  edgeRejectedCount: number,
  carrierFamilyCounts: Readonly<Record<GrayscaleCarrierFamily, number>> = {
    "checker-a": 1,
    "checker-b": 0,
    "dispersed-4x4": 0,
    diagonal: 0,
  },
  carrierRegionCount = 0,
  carrierSwitchCount = 0,
): GrayscaleCheckerDiagnostics {
  const vertical = runScore(bits, luma, width, height, 0, 1);
  const horizontal = runScore(bits, luma, width, height, 1, 0);
  const diagonal = runScore(bits, luma, width, height, 1, 1);
  const antiDiagonal = runScore(bits, luma, width, height, -1, 1);
  let toneDrift = 0;
  let toneVariance = 0;
  for (let index = 0; index < guide.length; index += 1) {
    const residual = (bits[index] ?? 0) - (luma[index] ?? 0);
    toneDrift += residual;
    toneVariance += residual * residual;
  }
  const count = Math.max(1, guide.length);
  toneDrift /= count;
  toneVariance = Math.max(0, toneVariance / count - toneDrift * toneDrift);
  const checker = checkerMetrics(bits, width, height);
  const horizontalEnergy = horizontal.score;
  const verticalEnergy = vertical.score;
  return {
    carrierStrength,
    candidateCount,
    acceptedCount,
    sourceRejectedCount,
    structureRejectedCount,
    edgeRejectedCount,
    checkerOccupancy: checker.occupancy,
    checkerPhaseConsistency: checker.phaseConsistency,
    twoByOneArtifacts: checker.twoByOne,
    verticalRunScore: vertical.score,
    horizontalRunScore: horizontal.score,
    diagonalRunScore: (diagonal.score + antiDiagonal.score) / 2,
    maximumVerticalRun: vertical.maximum,
    maximumHorizontalRun: horizontal.maximum,
    maximumDiagonalRun: Math.max(diagonal.maximum, antiDiagonal.maximum),
    directionalAnisotropy: Math.abs(horizontalEnergy - verticalEnergy) /
      Math.max(1, horizontalEnergy + verticalEnergy),
    toneDrift,
    toneVariance,
    carrierFamilyCounts,
    carrierRegionCount,
    carrierSwitchCount,
  };
}

function renderGrayscaleDiffusion(
  source: Uint8Array,
  width: number,
  height: number,
  options: GrayscaleCheckerPhaseOptions,
  reference: GrayscaleDiffusionReference,
  carrier: boolean | GrayscaleAdaptiveCarrier | GrayscaleCarrierFamily,
): GrayscaleCheckerResult {
  if (width <= 0 || height <= 0) throw new RangeError("Grayscale dimensions must be positive.");
  if (source.length < width * height * 4) throw new RangeError("Grayscale source buffer is too short.");
  const luma = sourceLuma(source, width, height);
  const length = width * height;
  const bits = new Uint8Array(length);
  const guide = new Float32Array(length);
  const written = new Uint8Array(length);
  const previousRowBits = new Uint8Array(width);
  previousRowBits.fill(2);
  const verticalRuns = new Uint8Array(width);
  let errorRow = new Float32Array(width);
  let nextErrorRow = new Float32Array(width);
  const amount = clamp01(options.ditheringAmount / 100);
  const carrierStrength = carrier
    ? checkerCarrierStrengthV44(options.ditheringAmount, options.lineSuppression)
    : 0;
  const adaptiveCarrier = carrier === "adaptive-v45" || carrier === "adaptive-v45-1" || typeof carrier === "string";
  const refinedAdaptiveCarrier = carrier === "adaptive-v45-1";
  const carrierPlan = adaptiveCarrier
    ? buildCarrierRegionPlan(
        luma,
        width,
        height,
        carrier === "adaptive-v45" || carrier === "adaptive-v45-1" ? undefined : carrier,
        refinedAdaptiveCarrier ? 32 : 16,
        refinedAdaptiveCarrier,
      )
    : undefined;
  let candidateCount = 0;
  let acceptedCount = 0;
  let sourceRejectedCount = 0;
  let structureRejectedCount = 0;
  let edgeRejectedCount = 0;

  for (let y = 0; y < height; y += 1) {
    const direction = y % 2 === 1 ? 1 : -1;
    for (let step = 0; step < width; step += 1) {
      const x = direction === 1 ? step : width - 1 - step;
      const index = y * width + x;
      const noise = diffusionNoiseOffset(x, y, 0, options.randomization, 8) / 255;
      const adjusted = clamp01((luma[index] ?? 0) + (errorRow[x] ?? 0) + noise);
      guide[index] = adjusted;
      const baseBit = adjusted >= 0.5 ? 1 : 0;
      let outputBit = baseBit;

      if (carrier === true && carrierStrength > 0 && adjusted > 0.12 && adjusted < 0.88) {
        const stats = neighborhoodStats(luma, width, height, x, y);
        const directionalGradient = Math.max(stats.gx, stats.gy);
        const dominantGradient = directionalGradient > 0.035 &&
          directionalGradient > Math.min(stats.gx, stats.gy) * 1.5;
        const protectedRegion = stats.strong || stats.weak || stats.variance > 0.012 ||
          directionalGradient > 0.035 || dominantGradient;
        if (protectedRegion) {
          edgeRejectedCount += 1;
        } else {
          const candidateBit = adjusted > artisticThreshold(x, y, "checkerboard") ? 1 : 0;
          if (candidateBit !== baseBit) {
            candidateCount += 1;
            const baseSourceCost = Math.abs((luma[index] ?? 0) - baseBit);
            const candidateSourceCost = Math.abs((luma[index] ?? 0) - candidateBit);
            const sourceBudget = 0.02 + 0.08 * carrierStrength;
            if (candidateSourceCost > baseSourceCost + sourceBudget) {
              sourceRejectedCount += 1;
            } else {
              const baseStructureCost = localDirectionalCost(bits, luma, written, width, height, x, y, baseBit);
              const candidateStructureCost = localDirectionalCost(bits, luma, written, width, height, x, y, candidateBit);
              const baseVerticalRun = previousRowBits[x] === baseBit
                ? (verticalRuns[x] ?? 0) + 1
                : 1;
              const candidateVerticalRun = previousRowBits[x] === candidateBit
                ? (verticalRuns[x] ?? 0) + 1
                : 1;
              if (candidateStructureCost <= baseStructureCost &&
                candidateVerticalRun <= Math.max(2, baseVerticalRun)) {
                outputBit = candidateBit;
                acceptedCount += 1;
              } else {
                structureRejectedCount += 1;
              }
            }
          }
        }
      }

      if (adaptiveCarrier && carrierStrength > 0 && adjusted > 0.12 && adjusted < 0.88) {
        const stats = neighborhoodStats(luma, width, height, x, y);
        const directionalGradient = Math.max(stats.gx, stats.gy);
        const dominantGradient = directionalGradient > 0.035 &&
          directionalGradient > Math.min(stats.gx, stats.gy) * 1.5;
        const protectedRegion = stats.strong || stats.weak || stats.variance > 0.012 ||
          directionalGradient > 0.035 || dominantGradient;
        if (protectedRegion) {
          edgeRejectedCount += 1;
        } else {
          const family = familyAt(carrierPlan!, x, y);
          const candidateBit = adjusted > carrierThreshold(family, x, y) ? 1 : 0;
          if (candidateBit !== baseBit) {
            candidateCount += 1;
            const baseSourceCost = Math.abs((luma[index] ?? 0) - baseBit);
            const candidateSourceCost = Math.abs((luma[index] ?? 0) - candidateBit);
            const sourceBudget = 0.02 + 0.08 * carrierStrength;
            if (candidateSourceCost > baseSourceCost + sourceBudget) {
              sourceRejectedCount += 1;
            } else {
              const baseStructureCost = localDirectionalCost(bits, luma, written, width, height, x, y, baseBit);
              const candidateStructureCost = localDirectionalCost(bits, luma, written, width, height, x, y, candidateBit);
              const baseVerticalRun = previousRowBits[x] === baseBit
                ? (verticalRuns[x] ?? 0) + 1
                : 1;
              const candidateVerticalRun = previousRowBits[x] === candidateBit
                ? (verticalRuns[x] ?? 0) + 1
                : 1;
              const phaseConsistent = family === "checker-a" || family === "checker-b"
                ? candidateBit === ((((x + y) & 1) ^ (family === "checker-a" ? 1 : 0)))
                : false;
              const candidatePenalty = candidateStructureCost +
                (candidateVerticalRun > Math.max(2, baseVerticalRun) ? 8 : 0) +
                (phaseConsistent ? -1 : 0);
              const basePenalty = baseStructureCost;
              if (candidatePenalty <= basePenalty &&
                  candidateVerticalRun <= Math.max(2, baseVerticalRun)) {
                outputBit = candidateBit;
                acceptedCount += 1;
              } else {
                structureRejectedCount += 1;
              }
            }
          }
        }
      }

      bits[index] = outputBit;
      written[index] = 1;
      verticalRuns[x] = previousRowBits[x] === outputBit
        ? Math.min(255, (verticalRuns[x] ?? 0) + 1)
        : 1;
      previousRowBits[x] = outputBit;

      const smooth = !neighborhoodStats(luma, width, height, x, y).strong;
      // v4.4 uses suppression exclusively for the carrier. Its tone stage is
      // the neutral serpentine FS-shaped kernel, so the slider cannot
      // accidentally introduce a second, diffusion-level response curve.
      const diffusionSuppression = carrier ? 0 : options.lineSuppression;
      const kernel = reference === "v4"
        ? checkerPhaseDiffusionKernel(direction, x, y, diffusionSuppression, smooth ? verticalRuns[x] ?? 0 : 0)
        : phaseBalancedDiffusionKernel(direction, x, y, diffusionSuppression, smooth ? verticalRuns[x] ?? 0 : 0);
      const propagated = Math.fround((adjusted - outputBit) * amount / 16);
      for (const [dx, dy, weight] of kernel) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        if (dy === 0) errorRow[nx] = Math.fround((errorRow[nx] ?? 0) + propagated * weight);
        else if (dy === 1) nextErrorRow[nx] = Math.fround((nextErrorRow[nx] ?? 0) + propagated * weight);
      }
    }
    const completedRow = errorRow;
    errorRow = nextErrorRow;
    nextErrorRow = completedRow;
    nextErrorRow.fill(0);
  }

  return {
    bits,
    guide,
    diagnostics: diagnostics(
      bits,
      guide,
      luma,
      width,
      height,
      carrierStrength,
      candidateCount,
      acceptedCount,
      sourceRejectedCount,
      structureRejectedCount,
      edgeRejectedCount,
      carrierPlan?.familyCounts,
      carrierPlan === undefined ? 0 : carrierPlan.families.length,
      carrierPlan?.switchCount ?? 0,
    ),
  };
}

/** Internal grayscale v4.4 prototype: v3-style tone with an artistic checker carrier. */
export function renderGrayscaleCheckerPhaseV44(
  source: Uint8Array,
  width: number,
  height: number,
  options: GrayscaleCheckerPhaseOptions,
): GrayscaleCheckerResult {
  return renderGrayscaleDiffusion(source, width, height, options, "v3", true);
}

/** Grayscale-only v4.5 prototype with a stable adaptive carrier per 16×16 region. */
export function renderGrayscaleCheckerPhaseV45(
  source: Uint8Array,
  width: number,
  height: number,
  options: GrayscaleCheckerPhaseOptions,
): GrayscaleCheckerResult {
  return renderGrayscaleDiffusion(source, width, height, options, "v3", "adaptive-v45");
}

/** Refined grayscale v4.5 candidate using stable checker-B regions only. */
export function renderGrayscaleCheckerPhaseV451(
  source: Uint8Array,
  width: number,
  height: number,
  options: GrayscaleCheckerPhaseOptions,
): GrayscaleCheckerResult {
  return renderGrayscaleDiffusion(source, width, height, options, "v3", "adaptive-v45-1");
}

/** Forced carrier references used by the v4.5 grayscale benchmark. */
export function renderGrayscaleCarrierReference(
  source: Uint8Array,
  width: number,
  height: number,
  options: GrayscaleCheckerPhaseOptions,
  family: GrayscaleCarrierFamily,
): GrayscaleCheckerResult {
  return renderGrayscaleDiffusion(source, width, height, options, "v3", family);
}

/** Grayscale-only v3/v4 references used by the prototype benchmark. */
export function renderGrayscaleDiffusionReference(
  source: Uint8Array,
  width: number,
  height: number,
  options: GrayscaleCheckerPhaseOptions,
  reference: GrayscaleDiffusionReference,
): GrayscaleCheckerResult {
  return renderGrayscaleDiffusion(source, width, height, options, reference, false);
}

/** Stable artistic checker carrier without diffusion, used as a placement reference. */
export function renderGrayscaleArtisticCarrier(
  source: Uint8Array,
  width: number,
  height: number,
): GrayscaleCheckerResult {
  if (width <= 0 || height <= 0) throw new RangeError("Grayscale dimensions must be positive.");
  if (source.length < width * height * 4) throw new RangeError("Grayscale source buffer is too short.");
  const luma = sourceLuma(source, width, height);
  const bits = new Uint8Array(width * height);
  const guide = new Float32Array(luma);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = y * width + x;
    bits[index] = (luma[index] ?? 0) > artisticThreshold(x, y, "checkerboard") ? 1 : 0;
  }
  return {
    bits,
    guide,
    diagnostics: diagnostics(bits, guide, luma, width, height, 1, 0, 0, 0, 0, 0),
  };
}
