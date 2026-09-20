import { decodeAttribute } from "./palette.js";
import { ARTISTIC_ROW_RANKS, ARTISTIC_SQUARE_RANKS } from "./artistic-ranks.js";
import type {
  ArtisticToneSafetyDiagnostics,
  AttributeHeight,
  ArtisticPatternPreference,
  ColorCarrierDiagnostics,
  RgbColor,
} from "./types.js";

export const ARTISTIC_SEED = 1729;
type Family = Exclude<ArtisticPatternPreference, "auto">;
const phases: Record<Family, readonly number[]> = {
  checkerboard: [0, 2, 3, 1],
  horizontal: [0, 1, 3, 2],
  vertical: [0, 3, 1, 2],
};
const linear = Array.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});
const weights = [0.2126, 0.7152, 0.0722] as const;
const BAYER_4X4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

export function createColorCarrierDiagnostics(): ColorCarrierDiagnostics {
  return {
    eligibleBlocks: 0,
    intermediateCoverageBlocks: 0,
    checkerCandidateCount: 0,
    corrected2x2Blocks: 0,
    correctedPixels: 0,
    rejectedDiagonalIncrease: 0,
    rejectedHorizontal2x1: 0,
    sourceRejectedCandidates: 0,
    structureRejectedCandidates: 0,
    coveragePreservationFailures: 0,
    pairBoundaryRejections: 0,
    edgeRejectedBlocks: 0,
    verticalArtifactScoreBefore: 0,
    verticalArtifactScoreAfter: 0,
    diagonalArtifactScoreBefore: 0,
    diagonalArtifactScoreAfter: 0,
    horizontalArtifactScoreBefore: 0,
    horizontalArtifactScoreAfter: 0,
  };
}

/** Each quarter has its own translated rank permutation on its actual eligible
 * lattice. The half-coverage motif never moves. Thresholds cover all 4096 bins
 * exactly once per period, rather than blending unrelated threshold values. */
export function artisticThreshold(x: number, y: number, family: Family, rowOnly = false): number {
  const phase = rowOnly ? [0, 2, 1, 3][x & 3]! : phases[family][(y & 1) * 2 + (x & 1)]!;
  const mx = Math.floor(x / (rowOnly ? 4 : 2));
  const my = rowOnly ? y : Math.floor(y / 2);
  const ranks = rowOnly ? ARTISTIC_ROW_RANKS : ARTISTIC_SQUARE_RANKS;
  const rank = ranks[((my + phase * 11) & 31) * 32 + ((mx + phase * 7) & 31)]!;
  return (phase + (rank + 0.5) / 1024) / 4;
}

/** Weighted least-squares projection onto a pair in linear light. */
export function artisticCoverage(r: number, g: number, b: number, first: RgbColor, second: RgbColor): number {
  const source = [r, g, b];
  const a = [first.r, first.g, first.b];
  const z = [second.r, second.g, second.b];
  let numerator = 0;
  let denominator = 0;
  for (let c = 0; c < 3; c++) {
    const delta = linear[z[c]!]! - linear[a[c]!]!;
    numerator += weights[c]! * (linear[source[c]!]! - linear[a[c]!]!) * delta;
    denominator += weights[c]! * delta * delta;
  }
  return denominator === 0 ? 0 : Math.max(0, Math.min(1, numerator / denominator));
}

function orderedPairCoverage(r: number, g: number, b: number, first: RgbColor, second: RgbColor): number {
  const dr = second.r - first.r;
  const dg = second.g - first.g;
  const db = second.b - first.b;
  const denominator = dr * dr + dg * dg + db * db;
  if (denominator === 0) return 0;
  return Math.max(0, Math.min(1,
    ((r - first.r) * dr + (g - first.g) * dg + (b - first.b) * db) / denominator,
  ));
}

/** Structure tensor from unmodified target-resolution input, pooled over
 * overlapping 32x32 neighborhoods. */
function families(source: Uint8Array, width: number, height: number): Family[] {
  const columns = Math.ceil(width / 16);
  const result: Family[] = [];
  const luma = (x: number, y: number) => {
    const o = (y * width + x) * 4;
    return (source[o]! * 77 + source[o + 1]! * 150 + source[o + 2]! * 29) / 65280;
  };
  for (let by = 0; by < height; by += 16) for (let bx = 0; bx < width; bx += 16) {
    let xx = 0, yy = 0, xy = 0, count = 0;
    for (let y = Math.max(1, by - 8); y < Math.min(height - 1, by + 24); y++) {
      for (let x = Math.max(1, bx - 8); x < Math.min(width - 1, bx + 24); x++) {
        const dx = luma(x + 1, y) - luma(x - 1, y);
        const dy = luma(x, y + 1) - luma(x, y - 1);
        xx += dx * dx; yy += dy * dy; xy += dx * dy; count++;
      }
    }
    const index = result.length;
    const left = bx > 0 ? result[index - 1] : undefined;
    const above = result[index - columns];
    const candidate: Family = xx > yy ? "vertical" : "horizontal";
    const switchPenalty = (left && left !== candidate ? 1 : 0) + (above && above !== candidate ? 1 : 0);
    const directional = Math.max(xx, yy) > (4 + switchPenalty) * (Math.min(xx, yy) + Math.abs(xy)) &&
      (xx + yy) / Math.max(1, count) > 0.002;
    result.push(directional ? candidate : "checkerboard");
  }
  return result;
}

export interface ArtisticPairSample {
  readonly first: RgbColor;
  readonly second: RgbColor;
  readonly firstValue: number;
  readonly secondValue: number;
  /** Full-strength coverage of second over first. */
  readonly coverage: number;
}

export interface ToneSafeCandidate {
  readonly color: RgbColor;
  readonly value: number;
}

/**
 * V2 Artistic placement.  The nearest visible colour is always one endpoint,
 * so amount zero is an exact solid/no-dither field.  Alternatives are judged
 * in the same linear-light space as the final visible colour rather than in a
 * hardware plane which may later be averaged with another plane.
 */
export function renderToneSafeCandidateField(
  source: Uint8Array,
  width: number,
  height: number,
  amount: number,
  preference: ArtisticPatternPreference,
  candidatesAt: (x: number, y: number) => readonly ToneSafeCandidate[],
  diagnostics?: ArtisticToneSafetyDiagnostics,
  groupWidth = 2,
  groupHeight = 2,
): Uint8Array {
  const alpha = Math.max(0, Math.min(100, amount)) / 100;
  const length = width * height;
  const baselineValues = new Uint8Array(length);
  const alternateValues = new Uint8Array(length);
  const baselineColors = new Uint8Array(length * 3);
  const alternateColors = new Uint8Array(length * 3);
  const proposal = renderArtisticPairField(
    source,
    width,
    height,
    amount,
    preference,
    (x, y) => {
      const candidates = candidatesAt(x, y);
      if (candidates.length === 0) throw new RangeError("Tone-safe Artistic rendering requires a legal candidate.");
      const offset = (y * width + x) * 4;
      const sr = source[offset] ?? 0;
      const sg = source[offset + 1] ?? 0;
      const sb = source[offset + 2] ?? 0;
      let baseline = candidates[0]!;
      let baselineError = linearDistance(sr, sg, sb, baseline.color);
      for (let index = 1; index < candidates.length; index += 1) {
        const candidate = candidates[index]!;
        const error = linearDistance(sr, sg, sb, candidate.color);
        if (error < baselineError || (error === baselineError && candidate.value < baseline.value)) {
          baseline = candidate;
          baselineError = error;
        }
      }
      let alternate = baseline;
      let bestProjectionError = baselineError;
      let bestExcursion = Number.POSITIVE_INFINITY;
      let bestCoverage = 0;
      const sourceLinear = [linear[sr]!, linear[sg]!, linear[sb]!] as const;
      const baselineLinear = [
        linear[baseline.color.r]!, linear[baseline.color.g]!, linear[baseline.color.b]!,
      ] as const;
      if (diagnostics) diagnostics.candidateCount += candidates.length;
      for (const candidate of candidates) {
        if (candidate.value === baseline.value) continue;
        if (diagnostics) diagnostics.alternateCount += 1;
        const candidateLinear = [
          linear[candidate.color.r]!, linear[candidate.color.g]!, linear[candidate.color.b]!,
        ] as const;
        let numerator = 0;
        let denominator = 0;
        for (let channel = 0; channel < 3; channel += 1) {
          const delta = candidateLinear[channel]! - baselineLinear[channel]!;
          numerator += weights[channel]! * (sourceLinear[channel]! - baselineLinear[channel]!) * delta;
          denominator += weights[channel]! * delta * delta;
        }
        if (denominator <= 0 || numerator <= 0) continue;
        const coverage = Math.max(0, Math.min(1, numerator / denominator));
        if (coverage <= 0) continue;
        let projectionError = 0;
        for (let channel = 0; channel < 3; channel += 1) {
          const projected = baselineLinear[channel]! +
            coverage * (candidateLinear[channel]! - baselineLinear[channel]!);
          const difference = sourceLinear[channel]! - projected;
          projectionError += weights[channel]! * difference * difference;
        }
        if (projectionError >= baselineError) continue;
        const excursion = coverage * linearDistance(sr, sg, sb, candidate.color);
        if (
          projectionError < bestProjectionError ||
          (projectionError === bestProjectionError && excursion < bestExcursion) ||
          (projectionError === bestProjectionError && excursion === bestExcursion && candidate.value < alternate.value)
        ) {
          alternate = candidate;
          bestProjectionError = projectionError;
          bestExcursion = excursion;
          bestCoverage = coverage;
        }
      }
      const pixel = y * width + x;
      baselineValues[pixel] = baseline.value;
      alternateValues[pixel] = alternate.value;
      baselineColors.set([baseline.color.r, baseline.color.g, baseline.color.b], pixel * 3);
      alternateColors.set([alternate.color.r, alternate.color.g, alternate.color.b], pixel * 3);
      return {
        first: baseline.color,
        second: alternate.color,
        firstValue: baseline.value,
        secondValue: alternate.value,
        coverage: alpha * bestCoverage,
      };
    },
  );
  if (!diagnostics) return proposal;

  const colorChannel = (pixel: number, value: number, channel: number): number =>
    value === alternateValues[pixel]
      ? alternateColors[pixel * 3 + channel] ?? 0
      : baselineColors[pixel * 3 + channel] ?? 0;
  const exactError = (left: number, top: number, right: number, bottom: number, values: Uint8Array): number => {
    let error = 0;
    for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
      const pixel = y * width + x;
      const sourceOffset = pixel * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const difference = (source[sourceOffset + channel] ?? 0) - colorChannel(pixel, values[pixel] ?? 0, channel);
        error += difference * difference;
      }
    }
    return error;
  };
  const lowPassError = (left: number, top: number, right: number, bottom: number, values: Uint8Array): number => {
    let error = 0;
    for (let y = top; y < bottom; y += 2) for (let x = left; x < right; x += 2) {
      const blockRight = Math.min(right, x + 2);
      const blockBottom = Math.min(bottom, y + 2);
      const count = (blockRight - x) * (blockBottom - y);
      for (let channel = 0; channel < 3; channel += 1) {
        let sourceSum = 0;
        let outputSum = 0;
        for (let by = y; by < blockBottom; by += 1) for (let bx = x; bx < blockRight; bx += 1) {
          const pixel = by * width + bx;
          sourceSum += source[pixel * 4 + channel] ?? 0;
          outputSum += colorChannel(pixel, values[pixel] ?? 0, channel);
        }
        const difference = sourceSum / count - outputSum / count;
        error += difference * difference;
      }
    }
    return error;
  };

  const output = proposal.slice();
  for (let top = 0; top < height; top += Math.max(1, groupHeight)) {
    for (let left = 0; left < width; left += Math.max(1, groupWidth)) {
      const right = Math.min(width, left + Math.max(1, groupWidth));
      const bottom = Math.min(height, top + Math.max(1, groupHeight));
      const baselineExact = exactError(left, top, right, bottom, baselineValues);
      const proposalExact = exactError(left, top, right, bottom, proposal);
      const baselineLowPass = lowPassError(left, top, right, bottom, baselineValues);
      const proposalLowPass = lowPassError(left, top, right, bottom, proposal);
      diagnostics.baselineExactRgbError += baselineExact;
      diagnostics.proposalExactRgbError += proposalExact;
      diagnostics.baselineLowPassRgbError += baselineLowPass;
      diagnostics.proposalLowPassRgbError += proposalLowPass;
      const accept = proposalLowPass < baselineLowPass ||
        (proposalLowPass === baselineLowPass && proposalExact < baselineExact);
      if (accept) {
        diagnostics.acceptedGroups += 1;
        diagnostics.finalExactRgbError += proposalExact;
        diagnostics.finalLowPassRgbError += proposalLowPass;
      } else {
        diagnostics.rejectedGroups += 1;
        diagnostics.finalExactRgbError += baselineExact;
        diagnostics.finalLowPassRgbError += baselineLowPass;
        for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) {
          const pixel = y * width + x;
          output[pixel] = baselineValues[pixel] ?? 0;
        }
      }
    }
  }
  for (let pixel = 0; pixel < length; pixel += 1) {
    const residual = [0, 1, 2].map((channel) =>
      colorChannel(pixel, output[pixel] ?? 0, channel) - (source[pixel * 4 + channel] ?? 0));
    const mean = (residual[0]! + residual[1]! + residual[2]!) / 3;
    diagnostics.unexpectedChromaEnergy += residual.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  }
  return output;
}

export function createArtisticToneSafetyDiagnostics(): ArtisticToneSafetyDiagnostics {
  return {
    candidateCount: 0,
    alternateCount: 0,
    acceptedGroups: 0,
    rejectedGroups: 0,
    baselineExactRgbError: 0,
    proposalExactRgbError: 0,
    finalExactRgbError: 0,
    baselineLowPassRgbError: 0,
    proposalLowPassRgbError: 0,
    finalLowPassRgbError: 0,
    unexpectedChromaEnergy: 0,
  };
}

interface CanonicalSample {
  readonly low: RgbColor;
  readonly high: RgbColor;
  readonly lowValue: number;
  readonly highValue: number;
  readonly coverage: number;
  readonly key: number;
}

function linearLuma(color: RgbColor): number {
  return weights[0] * linear[color.r]! + weights[1] * linear[color.g]! + weights[2] * linear[color.b]!;
}

function compareEndpoints(left: RgbColor, leftValue: number, right: RgbColor, rightValue: number): number {
  return linearLuma(left) - linearLuma(right) ||
    left.r - right.r || left.g - right.g || left.b - right.b || leftValue - rightValue;
}

function canonicalize(sample: ArtisticPairSample): CanonicalSample {
  const ordered = compareEndpoints(sample.first, sample.firstValue, sample.second, sample.secondValue) <= 0;
  const lowValue = ordered ? sample.firstValue : sample.secondValue;
  const highValue = ordered ? sample.secondValue : sample.firstValue;
  return {
    low: ordered ? sample.first : sample.second,
    high: ordered ? sample.second : sample.first,
    lowValue,
    highValue,
    coverage: ordered ? sample.coverage : 1 - sample.coverage,
    key: lowValue * 256 + highValue,
  };
}

function linearDistance(r: number, g: number, b: number, color: RgbColor): number {
  const channels = [r, g, b];
  const target = [color.r, color.g, color.b];
  let result = 0;
  for (let c = 0; c < 3; c++) {
    const difference = linear[channels[c]!]! - linear[target[c]!]!;
    result += weights[c]! * difference * difference;
  }
  return result;
}

/**
 * Attribute-free Artistic placement. Pair choice and coverage are supplied by
 * the target adapter. No Bayer residual, density quota, or post-threshold move
 * can feed a cell boundary back into the threshold field.
 */
export function renderArtisticPairField(
  source: Uint8Array,
  width: number,
  height: number,
  _amount: number,
  preference: ArtisticPatternPreference,
  pairAt: (x: number, y: number) => ArtisticPairSample,
  rowOnly = false,
  referenceValues?: Uint8Array,
  guidePeriod = 4,
  checkerPhase: "a" | "b" = "a",
  protectVerticalSpikes = false,
  diagnostics?: ColorCarrierDiagnostics,
): Uint8Array {
  const length = width * height;
  const samples = new Array<CanonicalSample>(length);
  const coverage = new Float64Array(length);
  const bayerValues = new Uint8Array(length);
  const strongEdge = new Uint8Array(length);
  const weakEdge = new Uint8Array(length);
  const edgeBand = new Uint8Array(length);
  const auto = preference === "auto" && !rowOnly ? families(source, width, height) : [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    const sample = canonicalize(pairAt(x, y));
    samples[index] = sample;
    coverage[index] = Math.max(0, Math.min(1, sample.coverage));
    const bayerThreshold = (BAYER_4X4[(y & 3) * 4 + (x & 3)]! + 0.5) / 16;
    bayerValues[index] = coverage[index]! > bayerThreshold ? sample.highValue : sample.lowValue;
  }

  if (referenceValues !== undefined) {
    const guideLinear = new Float64Array(length * 3);
    for (let index = 0; index < length; index++) {
      const sample = samples[index]!;
      const color = referenceValues[index] === sample.highValue ? sample.high : sample.low;
      guideLinear[index * 3] = linear[color.r]!;
      guideLinear[index * 3 + 1] = linear[color.g]!;
      guideLinear[index * 3 + 2] = linear[color.b]!;
      bayerValues[index] = referenceValues[index]!;
    }
    // The area envelope is twice the guide period. Averaging actual rendered
    // colour, rather than pair-relative bits, keeps the target continuous when
    // legal attribute pairs change, without restarting at an 8x8 boundary.
    const support = Math.max(2, Math.min(8, Math.round(guidePeriod) * 2));
    const supportX = support;
    // 8x1 rows still have independent legal pairs, but their dither carrier
    // must use the same two-dimensional area envelope as 8x2 and 8x4. The
    // projection is performed against each row's own pair, so this does not
    // make pixels illegal when pairs change between scanlines.
    const supportY = support;
    const leftRadius = Math.floor((supportX - 1) / 2);
    const rightRadius = supportX - leftRadius - 1;
    const topRadius = Math.floor((supportY - 1) / 2);
    const bottomRadius = supportY - topRadius - 1;
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const index = y * width + x;
      const sample = samples[index]!;
      let red = 0, green = 0, blue = 0, count = 0;
      const sourceOffset = index * 4;
      const center = [
        linear[source[sourceOffset]!]!,
        linear[source[sourceOffset + 1]!]!,
        linear[source[sourceOffset + 2]!]!,
      ] as const;
      const centerLuma = weights[0] * center[0] + weights[1] * center[1] + weights[2] * center[2];
      for (let ny = Math.max(0, y - topRadius); ny <= Math.min(height - 1, y + bottomRadius); ny++) {
        for (let nx = Math.max(0, x - leftRadius); nx <= Math.min(width - 1, x + rightRadius); nx++) {
          const sourceNeighbor = (ny * width + nx) * 4;
          const neighborSource = [
            linear[source[sourceNeighbor]!]!,
            linear[source[sourceNeighbor + 1]!]!,
            linear[source[sourceNeighbor + 2]!]!,
          ] as const;
          const neighborLuma = weights[0] * neighborSource[0] + weights[1] * neighborSource[1] + weights[2] * neighborSource[2];
          let sourceColorDelta = 0;
          for (let channel = 0; channel < 3; channel++) {
            const difference = center[channel]! - neighborSource[channel]!;
            sourceColorDelta += weights[channel]! * difference * difference;
          }
          if (Math.abs(centerLuma - neighborLuma) > 0.10 || sourceColorDelta > 0.025) continue;
          const neighbor = (ny * width + nx) * 3;
          red += guideLinear[neighbor]!;
          green += guideLinear[neighbor + 1]!;
          blue += guideLinear[neighbor + 2]!;
          count++;
        }
      }
      const low = [linear[sample.low.r]!, linear[sample.low.g]!, linear[sample.low.b]!] as const;
      const high = [linear[sample.high.r]!, linear[sample.high.g]!, linear[sample.high.b]!] as const;
      const target = [red / count, green / count, blue / count] as const;
      let numerator = 0, denominator = 0;
      for (let channel = 0; channel < 3; channel++) {
        const delta = high[channel]! - low[channel]!;
        numerator += weights[channel]! * (target[channel]! - low[channel]!) * delta;
        denominator += weights[channel]! * delta * delta;
      }
      if (denominator > 0) coverage[index] = Math.max(0, Math.min(1, numerator / denominator));
    }
  }

  const sourceLuma = (index: number) => {
    const offset = index * 4;
    return weights[0] * linear[source[offset]!]! + weights[1] * linear[source[offset + 1]!]! + weights[2] * linear[source[offset + 2]!]!;
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    for (const [nx, ny] of [[x + 1, y], [x, y + 1]] as const) {
      if (nx >= width || ny >= height) continue;
      const neighbor = ny * width + nx;
      const lumaDelta = Math.abs(sourceLuma(index) - sourceLuma(neighbor));
      const offset = index * 4;
      const neighborOffset = neighbor * 4;
      let colorDelta = 0;
      for (let c = 0; c < 3; c++) {
        const difference = linear[source[offset + c]!]! - linear[source[neighborOffset + c]!]!;
        colorDelta += weights[c]! * difference * difference;
      }
      const oppositeSides = (coverage[index]! < 0.4 && coverage[neighbor]! > 0.6) ||
        (coverage[index]! > 0.6 && coverage[neighbor]! < 0.4);
      const pairChanged = samples[index]!.key !== samples[neighbor]!.key;
      // The ZX guide supplies an exact legal reference at hard source edges.
      // Do not require a coverage-side change there: the reconstructed field
      // may already have blurred both samples onto the same side, which is the
      // condition that previously admitted isolated pixels beside silhouettes.
      const confirmed = (lumaDelta >= 0.18 || colorDelta >= 0.055) &&
        (referenceValues !== undefined || oppositeSides || pairChanged);
      const candidate = (lumaDelta >= 0.08 || colorDelta >= 0.018) &&
        (Math.abs(coverage[index]! - coverage[neighbor]!) >= 0.18 || pairChanged);
      if (confirmed) { strongEdge[index] = 1; strongEdge[neighbor] = 1; }
      if (candidate) { weakEdge[index] = 1; weakEdge[neighbor] = 1; }
    }
  }
  edgeBand.set(strongEdge);
  // Follow an antialiased contour for one pixel. Dilation is limited
  // to weak edge candidates, so smooth checkerboard interiors are unaffected.
  for (let iteration = 0; iteration < 1; iteration++) {
    const expanded = edgeBand.slice();
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const index = y * width + x;
      if (edgeBand[index] || !weakEdge[index]) continue;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && edgeBand[ny * width + nx]) {
          expanded[index] = 1;
          break;
        }
      }
    }
    edgeBand.set(expanded);
  }

  const carrierValues = new Uint8Array(length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    const sample = samples[index]!;
    const family = preference === "auto"
      ? auto[Math.floor(y / 16) * Math.ceil(width / 16) + Math.floor(x / 16)] ?? "checkerboard"
      : preference;
    const threshold = checkerPhase === "b" && family === "checkerboard"
      ? 1 - artisticThreshold(x, y, family, rowOnly)
      : artisticThreshold(x, y, family, rowOnly);
    carrierValues[index] = coverage[index]! > threshold ? sample.highValue : sample.lowValue;
  }

  const output = new Uint8Array(length);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = y * width + x;
    const sample = samples[index]!;
    const sourceOffset = index * 4;
    if (linearDistance(source[sourceOffset]!, source[sourceOffset + 1]!, source[sourceOffset + 2]!, sample.low) <= 1e-12) {
      output[index] = sample.lowValue;
      continue;
    }
    if (linearDistance(source[sourceOffset]!, source[sourceOffset + 1]!, source[sourceOffset + 2]!, sample.high) <= 1e-12) {
      output[index] = sample.highValue;
      continue;
    }
    // The ZX guide can select a solid endpoint even when the source is only
    // near that endpoint (for example, dark antialiasing beside a red body
    // panel). Do not let the sliding guide reconstruction turn that solid
    // decision into sparse pixels. This guard uses the unsmoothed requested
    // coverage and requires guide agreement, so intermediate Artistic fields
    // keep their original motif and phase.
    if (referenceValues !== undefined && sample.coverage <= 1 / 16 && bayerValues[index] === sample.lowValue) {
      output[index] = sample.lowValue;
      continue;
    }
    if (referenceValues !== undefined && sample.coverage >= 15 / 16 && bayerValues[index] === sample.highValue) {
      output[index] = sample.highValue;
      continue;
    }
    if (sample.lowValue === sample.highValue || coverage[index]! <= 0) {
      output[index] = sample.lowValue;
      continue;
    }
    if (coverage[index]! >= 1) {
      output[index] = sample.highValue;
      continue;
    }
    if (edgeBand[index]) {
      output[index] = bayerValues[index]!;
      continue;
    }
    output[index] = carrierValues[index]!;
  }

  if (protectVerticalSpikes) {
    const endpointBit = (sample: CanonicalSample, value: number): number =>
      value === sample.highValue ? 1 : 0;
    const valueAt = (
      x: number,
      y: number,
      left: number,
      top: number,
      candidate: readonly number[],
    ): number => {
      if (x >= left && x < left + 2 && y >= top && y < top + 2) {
        return candidate[(y - top) * 2 + x - left] ?? 0;
      }
      return output[y * width + x] ?? 0;
    };
    const scorePattern = (
      left: number,
      top: number,
      candidate: readonly number[],
    ): { readonly total: number; readonly vertical: number; readonly horizontal: number; readonly diagonal: number; readonly twoByOne: number } => {
      let sourceCost = 0;
      let vertical = 0;
      let horizontal = 0;
      let diagonal = 0;
      let twoByOne = 0;
      const right = Math.min(width - 1, left + 2);
      const bottom = Math.min(height - 1, top + 3);
      for (let y = Math.max(0, top - 1); y <= bottom; y += 1) {
        for (let x = Math.max(0, left - 1); x <= right; x += 1) {
          const index = y * width + x;
          const sample = samples[index]!;
          const value = valueAt(x, y, left, top, candidate);
          const color = value === sample.highValue ? sample.high : sample.low;
          const sourceOffset = index * 4;
          sourceCost += linearDistance(
            source[sourceOffset] ?? 0,
            source[sourceOffset + 1] ?? 0,
            source[sourceOffset + 2] ?? 0,
            color,
          );
          const bit = endpointBit(sample, value);
          for (const [dx, dy, weight] of [
            [0, 1, 5], [1, 0, 3], [1, 1, 2], [-1, 1, 2],
          ] as const) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const neighbor = ny * width + nx;
            if (samples[neighbor]!.key !== sample.key) continue;
            if (endpointBit(samples[neighbor]!, valueAt(nx, ny, left, top, candidate)) !== bit) continue;
            if (dy === 1 && dx === 0) vertical += weight;
            else if (dy === 0) horizontal += weight;
            else diagonal += weight;
          }
        }
      }
      const pattern = candidate.map((value, index) =>
        endpointBit(samples[(top + Math.floor(index / 2)) * width + left + (index & 1)]!, value));
      const highCount = pattern.reduce((sum, bit) => sum + bit, 0);
      if (highCount === 2 &&
          ((pattern[0] === pattern[1] && pattern[2] === pattern[3]) ||
            (pattern[0] === pattern[2] && pattern[1] === pattern[3]))) twoByOne += 12;
      let phasePenalty = 0;
      for (let index = 0; index < 4; index += 1) {
        const x = left + (index & 1);
        const y = top + Math.floor(index / 2);
        const expected = ((x + y) & 1) === 1 ? 1 : 0;
        if (pattern[index] !== expected) phasePenalty += 1;
      }
      return {
        total: sourceCost * 100 + vertical + horizontal + diagonal + twoByOne + phasePenalty,
        vertical,
        horizontal: horizontal + twoByOne,
        diagonal,
        twoByOne,
      };
    };
    const isSmoothBlock = (left: number, top: number): boolean => {
      for (let y = Math.max(0, top - 1); y <= Math.min(height - 1, top + 2); y += 1) {
        for (let x = Math.max(0, left - 1); x <= Math.min(width - 1, left + 2); x += 1) {
          if (edgeBand[y * width + x]) return false;
        }
      }
      return true;
    };
    for (let top = 0; top + 1 < height; top += 2) {
      for (let left = 0; left + 1 < width; left += 2) {
        const indices = [
          top * width + left,
          top * width + left + 1,
          (top + 1) * width + left,
          (top + 1) * width + left + 1,
        ] as const;
        const first = samples[indices[0]]!;
        if (indices.some((index) => samples[index]!.key !== first.key)) {
          if (diagnostics) diagnostics.pairBoundaryRejections += 1;
          continue;
        }
        if (!isSmoothBlock(left, top)) {
          if (diagnostics) diagnostics.edgeRejectedBlocks += 1;
          continue;
        }
        if (indices.some((index) => coverage[index]! <= 0.12 || coverage[index]! >= 0.88)) continue;
        if (diagnostics) diagnostics.intermediateCoverageBlocks += 1;
        const current = indices.map((index) => output[index] ?? 0);
        const currentBits = current.map((value) => endpointBit(first, value));
        if (currentBits.reduce((sum, bit) => sum + bit, 0) !== 2) {
          continue;
        }
        if (diagnostics) {
          diagnostics.eligibleBlocks += 1;
          diagnostics.checkerCandidateCount += 2;
        }
        const low = first.lowValue;
        const high = first.highValue;
        const checkerB = [low, high, high, low] as const;
        const checkerA = [high, low, low, high] as const;
        const currentScore = scorePattern(left, top, current);
        const scoreB = scorePattern(left, top, checkerB);
        const scoreA = scorePattern(left, top, checkerA);
        const candidate = scoreB.total <= scoreA.total ? checkerB : checkerA;
        const candidateScore = scoreB.total <= scoreA.total ? scoreB : scoreA;
        if (diagnostics) {
          diagnostics.verticalArtifactScoreBefore += currentScore.vertical;
          diagnostics.diagonalArtifactScoreBefore += currentScore.diagonal;
          diagnostics.horizontalArtifactScoreBefore += currentScore.horizontal;
        }
        if (candidate.every((value, index) => value === current[index])) {
          if (diagnostics) {
            diagnostics.verticalArtifactScoreAfter += currentScore.vertical;
            diagnostics.diagonalArtifactScoreAfter += currentScore.diagonal;
            diagnostics.horizontalArtifactScoreAfter += currentScore.horizontal;
          }
          continue;
        }
        if (candidateScore.diagonal > currentScore.diagonal) {
          if (diagnostics) {
            diagnostics.rejectedDiagonalIncrease += 1;
            diagnostics.diagonalArtifactScoreAfter += currentScore.diagonal;
            diagnostics.verticalArtifactScoreAfter += currentScore.vertical;
            diagnostics.horizontalArtifactScoreAfter += currentScore.horizontal;
          }
          continue;
        }
        if (candidateScore.horizontal > currentScore.horizontal) {
          if (diagnostics) {
            diagnostics.rejectedHorizontal2x1 += 1;
            diagnostics.diagonalArtifactScoreAfter += currentScore.diagonal;
            diagnostics.verticalArtifactScoreAfter += currentScore.vertical;
            diagnostics.horizontalArtifactScoreAfter += currentScore.horizontal;
          }
          continue;
        }
        if (candidateScore.vertical > currentScore.vertical) {
          if (diagnostics) {
            diagnostics.structureRejectedCandidates += 1;
            diagnostics.verticalArtifactScoreAfter += currentScore.vertical;
            diagnostics.diagonalArtifactScoreAfter += currentScore.diagonal;
            diagnostics.horizontalArtifactScoreAfter += currentScore.horizontal;
          }
          continue;
        }
        if (candidateScore.total + 0.5 >= currentScore.total) {
          if (diagnostics) {
            diagnostics.sourceRejectedCandidates += 1;
            diagnostics.diagonalArtifactScoreAfter += currentScore.diagonal;
            diagnostics.verticalArtifactScoreAfter += currentScore.vertical;
            diagnostics.horizontalArtifactScoreAfter += currentScore.horizontal;
          }
          continue;
        }
        if (diagnostics) {
          diagnostics.corrected2x2Blocks += 1;
          diagnostics.correctedPixels += 4;
          diagnostics.verticalArtifactScoreAfter += candidateScore.vertical;
          diagnostics.diagonalArtifactScoreAfter += candidateScore.diagonal;
          diagnostics.horizontalArtifactScoreAfter += candidateScore.horizontal;
        }
        for (let index = 0; index < 4; index += 1) output[indices[index]!] = candidate[index]!;
      }
    }
  }
  return output;
}

export function renderArtisticOrdered(
  source: Uint8Array,
  attributes: Uint8Array,
  cellHeight: AttributeHeight,
  amount: number,
  preference: ArtisticPatternPreference = "auto",
  _referencePixels?: Uint8Array,
  guidePeriod = 4,
  checkerPhase: "a" | "b" = "a",
  protectVerticalSpikes = false,
  diagnostics?: ColorCarrierDiagnostics,
): Uint8Array {
  const width = 256;
  const pairs = Array.from({ length: 128 }, (_, attribute) => decodeAttribute(attribute));
  return renderArtisticPairField(
    source,
    width,
    192,
    amount,
    preference,
    (x, y) => {
      const pair = pairs[attributes[Math.floor(y / cellHeight) * 32 + Math.floor(x / 8)]!]!;
      const offset = (y * width + x) * 4;
      const projected = orderedPairCoverage(source[offset]!, source[offset + 1]!, source[offset + 2]!, pair.paper, pair.ink);
      const scale = Math.max(0, Math.min(100, amount)) / 100;
      return {
        first: pair.paper,
        second: pair.ink,
        firstValue: 0,
        secondValue: 1,
        // This is selectProjected's Bayer amount transform expressed as an
        // occupancy. Both threshold fields therefore represent the same tone.
        coverage: scale === 0
          ? (linearDistance(source[offset]!, source[offset + 1]!, source[offset + 2]!, pair.ink) <
              linearDistance(source[offset]!, source[offset + 1]!, source[offset + 2]!, pair.paper) ? 1 : 0)
          : Math.max(0, Math.min(1, 0.5 + (projected - 0.5) / scale)),
      };
    },
    // The Bayer-guided path uses the shared square carrier so 8x1 matches
    // 8x2. Keep the legacy row-only fallback for direct, unguided calls.
    cellHeight === 1 && _referencePixels === undefined,
    _referencePixels,
    guidePeriod,
    checkerPhase,
    protectVerticalSpikes,
    diagnostics,
  );
}

export function renderToneSafeZxOrdered(
  source: Uint8Array,
  attributes: Uint8Array,
  cellHeight: AttributeHeight,
  amount: number,
  preference: ArtisticPatternPreference = "auto",
  diagnostics?: ArtisticToneSafetyDiagnostics,
): Uint8Array {
  const pairs = Array.from({ length: 128 }, (_, attribute) => decodeAttribute(attribute));
  return renderToneSafeCandidateField(
    source,
    256,
    192,
    amount,
    preference,
    (x, y) => {
      const pair = pairs[attributes[Math.floor(y / cellHeight) * 32 + Math.floor(x / 8)]!]!;
      return [
        { color: pair.paper, value: 0 },
        { color: pair.ink, value: 1 },
      ];
    },
    diagnostics,
    8,
    cellHeight,
  );
}

interface PaletteCandidate {
  readonly first: number;
  readonly second: number;
  readonly coverage: number;
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

function artisticPaletteCandidates(
  palette: readonly RgbColor[],
  enabled: readonly number[],
  amount: number,
): PaletteCandidate[] {
  const candidates: PaletteCandidate[] = [];
  const base = Math.floor((100 - amount) * 64 / 100);
  const contribution = (value: number, level: number) =>
    Math.floor(Math.floor(level * value / 16) * amount / 100) + base;
  for (const first of enabled) for (const second of enabled) for (let level = 0; level < 16; level++) {
    const a = palette[first]!;
    const b = palette[second]!;
    candidates.push({
      first,
      second,
      coverage: level / 16,
      r: contribution(a.r, 16 - level) + contribution(b.r, level),
      g: contribution(a.g, 16 - level) + contribution(b.g, level),
      b: contribution(a.b, 16 - level) + contribution(b.b, level),
    });
  }
  return candidates;
}

/** Artistic rendering for unrestricted direct-palette targets such as QL plain modes. */
export function renderArtisticPaletteOrdered(
  source: Uint8Array,
  width: number,
  height: number,
  palette: readonly RgbColor[],
  enabled: readonly number[],
  amount: number,
  preference: ArtisticPatternPreference = "auto",
  checkerPhase: "a" | "b" = "a",
  protectVerticalSpikes = false,
  diagnostics?: ColorCarrierDiagnostics,
): Uint8Array {
  const candidates = artisticPaletteCandidates(palette, enabled, amount);
  const selected = new Array<PaletteCandidate>(width * height);
  for (let pixel = 0; pixel < selected.length; pixel++) {
    const offset = pixel * 4;
    let best = candidates[0]!;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const dr = source[offset]! - candidate.r;
      const dg = source[offset + 1]! - candidate.g;
      const db = source[offset + 2]! - candidate.b;
      const distance = dr * dr + dg * dg + db * db;
      if (distance < bestDistance) { best = candidate; bestDistance = distance; }
    }
    selected[pixel] = best;
  }
  return renderArtisticPairField(source, width, height, amount, preference, (x, y) => {
    const candidate = selected[y * width + x]!;
    return {
      first: palette[candidate.first]!,
      second: palette[candidate.second]!,
      firstValue: candidate.first,
      secondValue: candidate.second,
      coverage: candidate.coverage,
    };
  }, false, undefined, 4, checkerPhase, protectVerticalSpikes, diagnostics);
}

export function renderToneSafePaletteOrdered(
  source: Uint8Array,
  width: number,
  height: number,
  palette: readonly RgbColor[],
  enabled: readonly number[],
  amount: number,
  preference: ArtisticPatternPreference = "auto",
  diagnostics?: ArtisticToneSafetyDiagnostics,
): Uint8Array {
  const candidates = enabled.map((value) => ({ color: palette[value]!, value }));
  return renderToneSafeCandidateField(
    source,
    width,
    height,
    amount,
    preference,
    () => candidates,
    diagnostics,
  );
}
