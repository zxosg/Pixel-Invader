import { decodeAttribute } from "./palette.js";
import { ARTISTIC_ROW_RANKS, ARTISTIC_SQUARE_RANKS } from "./artistic-ranks.js";
import type { AttributeHeight, ArtisticPatternPreference, RgbColor } from "./types.js";

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

  const output = new Uint8Array(length);
  const familyColumns = Math.ceil(width / 16);
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
    const family = preference === "auto"
      ? auto[Math.floor(y / 16) * familyColumns + Math.floor(x / 16)] ?? "checkerboard"
      : preference;
    output[index] = coverage[index]! > artisticThreshold(x, y, family, rowOnly)
      ? sample.highValue
      : sample.lowValue;
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
  });
}
