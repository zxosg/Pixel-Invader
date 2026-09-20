import { decodeAttribute } from "./palette.js";
import { artisticCoverage } from "./artistic-ordered.js";
import type { AttributeHeight, RgbColor } from "./types.js";

const WIDTH = 256;
const HEIGHT = 192;
const BLOCK_SIZE = 2;

interface Pair {
  readonly paper: RgbColor;
  readonly ink: RgbColor;
}

const MASKS_BY_COUNT: readonly (readonly number[])[] = [
  [0],
  [1, 2, 4, 8],
  [0b1001, 0b0110, 0b0011, 0b1100, 0b0101, 0b1010],
  [14, 13, 11, 7],
  [15],
];

function bitCount(mask: number): number {
  let count = 0;
  for (let value = mask; value !== 0; value >>>= 1) count += value & 1;
  return count;
}

function colorError(source: Uint8Array, offset: number, color: RgbColor): number {
  const dr = (source[offset] ?? 0) - color.r;
  const dg = (source[offset + 1] ?? 0) - color.g;
  const db = (source[offset + 2] ?? 0) - color.b;
  return dr * dr + dg * dg + db * db;
}

function pairAt(
  attributes: Uint8Array,
  cellHeight: AttributeHeight,
  x: number,
  y: number,
): Pair {
  const attribute = attributes[
    Math.floor(y / cellHeight) * 32 + Math.floor(x / 8)
  ] ?? 0;
  const decoded = decodeAttribute(attribute);
  return { paper: decoded.paper, ink: decoded.ink };
}

function sameColor(left: RgbColor, right: RgbColor): boolean {
  return left.r === right.r && left.g === right.g && left.b === right.b;
}

function strongEdge(source: Uint8Array, x: number, y: number, width: number): boolean {
  const offset = (y * width + x) * 4;
  for (const [nx, ny] of [[x + 1, y], [x, y + 1]] as const) {
    if (nx >= width || ny >= HEIGHT) continue;
    const neighbor = (ny * width + nx) * 4;
    if (
      Math.max(
        Math.abs((source[offset] ?? 0) - (source[neighbor] ?? 0)),
        Math.abs((source[offset + 1] ?? 0) - (source[neighbor + 1] ?? 0)),
        Math.abs((source[offset + 2] ?? 0) - (source[neighbor + 2] ?? 0)),
      ) > 48
    ) return true;
  }
  return false;
}

function maskPenalty(mask: number, left: number, top: number): number {
  if (bitCount(mask) !== 2) return 0;
  const checker = mask === 0b1001 || mask === 0b0110;
  if (!checker) return 8;
  const preferred = ((left + top) & 1) === 0 ? 0b1001 : 0b0110;
  return mask === preferred ? -2 : 0;
}

/** Render a smooth, deterministic 2x2 chessboard carrier inside fixed ZX pairs. */
export function renderSmoothChessboardZx(
  source: Uint8Array,
  attributes: Uint8Array,
  cellHeight: AttributeHeight,
  amount: number,
): Uint8Array {
  const output = new Uint8Array(WIDTH * HEIGHT);
  const strength = Math.max(0, Math.min(100, amount)) / 100;

  for (let top = 0; top < HEIGHT; top += BLOCK_SIZE) {
    for (let left = 0; left < WIDTH; left += BLOCK_SIZE) {
      const points: readonly [number, number][] = [
        [left, top], [left + 1, top], [left, top + 1], [left + 1, top + 1],
      ];
      const pairs = points.map(([x, y]) => pairAt(attributes, cellHeight, x, y));
      const pair = pairs[0]!;
      const samePair = pairs.every((candidate) =>
        sameColor(candidate.paper, pair.paper) && sameColor(candidate.ink, pair.ink),
      );
      const edge = points.some(([x, y]) => strongEdge(source, x, y, WIDTH));
      const coverages = points.map(([x, y]) => {
        const offset = (y * WIDTH + x) * 4;
        const projected = artisticCoverage(
          source[offset] ?? 0,
          source[offset + 1] ?? 0,
          source[offset + 2] ?? 0,
          pair.paper,
          pair.ink,
        );
        const nearestInk = colorError(source, offset, pair.ink) <
          colorError(source, offset, pair.paper);
        const baseline = nearestInk ? 1 : 0;
        return baseline + strength * (projected - baseline);
      });
      const fallback: number[] = coverages.map((coverage, index) => {
        const [x, y] = points[index]!;
        const offset = (y * WIDTH + x) * 4;
        return coverage >= 0.5 && !edge
          ? 1
          : colorError(source, offset, pair.ink) < colorError(source, offset, pair.paper) ? 1 : 0;
      });
      const targetCount = Math.max(0, Math.min(4, Math.round(
        coverages.reduce((sum, value) => sum + value, 0),
      )));
      let selectedMask = fallback.reduce(
        (mask: number, value, index) => mask | (value << index),
        0,
      );
      if (samePair && !edge && strength > 0) {
        let bestScore = Number.POSITIVE_INFINITY;
        for (const mask of MASKS_BY_COUNT[targetCount] ?? []) {
          let score = maskPenalty(mask, left, top);
          for (let index = 0; index < points.length; index += 1) {
            const [x, y] = points[index]!;
            const offset = (y * WIDTH + x) * 4;
            const bit = (mask >> index) & 1;
            score += colorError(source, offset, bit === 1 ? pair.ink : pair.paper);
          }
          if (score < bestScore || score === bestScore && mask < selectedMask) {
            bestScore = score;
            selectedMask = mask;
          }
        }
      }
      for (let index = 0; index < points.length; index += 1) {
        const [x, y] = points[index]!;
        output[y * WIDTH + x] = (selectedMask >> index) & 1;
      }
    }
  }
  return output;
}
