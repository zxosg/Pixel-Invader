import type { OrderedMatrixId } from "./types.js";

export interface OrderedMatrix {
  readonly width: number;
  readonly height: number;
  readonly levels: number;
  readonly values: readonly number[];
}

export const ORDERED_MATRICES: Readonly<Record<OrderedMatrixId, OrderedMatrix>> = {
  "checkerboard-2x1": { width: 2, height: 2, levels: 2, values: [0, 1, 1, 0] },
  "bayer-2x2": { width: 2, height: 2, levels: 4, values: [0, 2, 3, 1] },
  "bayer-4x4": {
    width: 4,
    height: 4,
    levels: 16,
    values: [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5],
  },
  "bayer-8x8": {
    width: 8,
    height: 8,
    levels: 64,
    values: [
      0,32,8,40,2,34,10,42, 48,16,56,24,50,18,58,26,
      12,44,4,36,14,46,6,38, 60,28,52,20,62,30,54,22,
      3,35,11,43,1,33,9,41, 51,19,59,27,49,17,57,25,
      15,47,7,39,13,45,5,37, 63,31,55,23,61,29,53,21,
    ],
  },
  "clustered-dot-4x4": {
    width: 4,
    height: 4,
    levels: 16,
    values: [12, 5, 6, 13, 4, 0, 1, 7, 11, 3, 2, 8, 15, 10, 9, 14],
  },
  "clustered-dot-8x8": {
    width: 8,
    height: 8,
    levels: 64,
    values: [
      24,10,12,26,35,47,49,37, 8,0,2,14,45,59,61,51,
      22,6,4,16,43,57,63,53, 30,20,18,28,33,41,55,39,
      34,46,48,36,25,11,13,27, 44,58,60,50,9,1,3,15,
      42,56,62,52,23,7,5,17, 32,40,54,38,31,21,19,29,
    ],
  },
  "void-cluster-8x8": {
    width: 8,
    height: 8,
    levels: 64,
    values: [
      0,48,8,56,2,32,12,40, 41,16,49,20,57,24,33,28,
      13,42,4,50,9,58,6,34, 35,29,43,17,51,21,59,25,
      3,36,14,44,1,52,10,60, 61,26,37,30,45,18,53,22,
      11,62,7,38,15,46,5,54, 55,23,63,27,39,31,47,19,
    ],
  },
};

export function orderedThreshold(matrix: OrderedMatrix, x: number, y: number): number {
  return matrix.values[(y % matrix.height) * matrix.width + (x % matrix.width)] ?? 0;
}

/**
 * A zero-mean, equal-energy threshold used by coverage-normalized v7.
 * Every supported Bayer/checker matrix contributes the same +/- 0.25
 * perturbation; the matrix changes spatial placement, not effective strength.
 */
export function normalizedOrderedOffset(
  matrix: OrderedMatrix,
  x: number,
  y: number,
): number {
  const centered =
    (orderedThreshold(matrix, x, y) + 0.5) / matrix.levels - 0.5;
  return centered < 0 ? -0.25 : centered > 0 ? 0.25 : 0;
}

export interface OrderedPerturbationDiagnostics {
  readonly mean: number;
  readonly rms: number;
  readonly peak: number;
  readonly samples: number;
}

export function orderedPerturbationDiagnostics(
  matrix: OrderedMatrix,
  amountPercent = 100,
): OrderedPerturbationDiagnostics {
  const scale = Math.max(0, Math.min(100, amountPercent)) / 100;
  const values: number[] = [];
  for (let y = 0; y < matrix.height; y += 1) {
    for (let x = 0; x < matrix.width; x += 1) {
      values.push(normalizedOrderedOffset(matrix, x, y) * scale);
    }
  }
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const rms = Math.sqrt(
    values.reduce((sum, value) => sum + value * value, 0) / values.length,
  );
  const peak = Math.max(...values.map(Math.abs));
  return { mean, rms, peak, samples: values.length };
}
