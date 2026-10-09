import { describe, expect, it } from "vitest";
import {
  customOrderedMatrix,
  customOrderedMatrixId,
  defineCustomOrderedMatrix,
  normalizedOrderedOffset,
  validateCustomOrderedMatrix,
} from "./matrices.js";
import {
  customDiffusionKernelId,
  defineCustomDiffusionKernel,
  validateCustomDiffusionKernel,
} from "./diffusion.js";

describe("custom ordered matrix validation", () => {
  it("accepts a valid rank-unique matrix", () => {
    expect(() => validateCustomOrderedMatrix({
      width: 2, height: 2, values: [0, 2, 3, 1],
    })).not.toThrow();
    const matrix = customOrderedMatrix({ width: 2, height: 2, values: [0, 2, 3, 1] });
    expect(matrix.levels).toBe(4);
  });

  it("accepts balanced repeated ranks and compresses them into contiguous levels", () => {
    const checker = customOrderedMatrix({
      width: 2,
      height: 2,
      values: [0, 1, 1, 0],
    });
    expect(checker.levels).toBe(2);
    expect(checker.values).toEqual([0, 1, 1, 0]);

    const matrix = customOrderedMatrix({
      width: 4,
      height: 2,
      values: [0, 2, 2, 0, 2, 0, 0, 2],
    });
    expect(matrix.levels).toBe(2);
    expect(matrix.values).toEqual([0, 1, 1, 0, 1, 0, 0, 1]);
    const offsets = matrix.values.map((_, index) =>
      normalizedOrderedOffset(matrix, index % matrix.width, Math.floor(index / matrix.width)),
    );
    expect(offsets.reduce((sum, offset) => sum + offset, 0)).toBeCloseTo(0, 12);

    const fourLevels = customOrderedMatrix({
      width: 4,
      height: 2,
      values: [0, 1, 2, 3, 3, 2, 1, 0],
    });
    expect(fourLevels.levels).toBe(4);
    expect(fourLevels.values).toEqual([0, 1, 2, 3, 3, 2, 1, 0]);

    const eightLevels = customOrderedMatrix({
      width: 4,
      height: 2,
      values: [0, 1, 2, 3, 4, 5, 6, 7],
    });
    expect(eightLevels.levels).toBe(8);
  });

  it("rejects repeated ranks with unequal frequencies", () => {
    expect(() => validateCustomOrderedMatrix({
      width: 2, height: 2, values: [0, 0, 0, 1],
    })).toThrow("each rank must occur equally often");
  });

  it("normalizes equivalent repeated-rank labels to the same stable ID", () => {
    expect(customOrderedMatrixId({ width: 2, height: 2, values: [0, 1, 1, 0] }))
      .toBe(customOrderedMatrixId({ width: 2, height: 2, values: [1, 3, 3, 1] }));
  });

  it("rejects out-of-range or non-integer values", () => {
    expect(() => validateCustomOrderedMatrix({
      width: 2, height: 2, values: [0, 1, 2, 4],
    })).toThrow(RangeError);
    expect(() => validateCustomOrderedMatrix({
      width: 2, height: 2, values: [0, 1, 2, 1.5],
    })).toThrow(RangeError);
  });

  it("rejects mismatched dimensions and oversized matrices", () => {
    expect(() => validateCustomOrderedMatrix({
      width: 2, height: 2, values: [0, 1, 2],
    })).toThrow(RangeError);
    expect(() => validateCustomOrderedMatrix({
      width: 10, height: 10, values: Array.from({ length: 100 }, (_, i) => i),
    })).toThrow(RangeError);
  });

  it("builds stable custom matrix IDs and normalized definitions", () => {
    const matrix = { width: 2, height: 2, values: [0, 2, 3, 1] } as const;
    expect(customOrderedMatrixId(matrix)).toBe(customOrderedMatrixId(matrix));
    expect(defineCustomOrderedMatrix(matrix)).toEqual({
      id: customOrderedMatrixId(matrix),
      width: 2,
      height: 2,
      values: [0, 2, 3, 1],
    });
  });
});

describe("custom diffusion kernel validation", () => {
  it("accepts a small conserved-weight kernel", () => {
    expect(() => validateCustomDiffusionKernel([
      [1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1],
    ])).not.toThrow();
  });

  it("rejects negative weights", () => {
    expect(() => validateCustomDiffusionKernel([[1, 0, -1]])).toThrow(RangeError);
  });

  it("rejects out-of-range offsets", () => {
    expect(() => validateCustomDiffusionKernel([[10, 0, 1]])).toThrow(RangeError);
    expect(() => validateCustomDiffusionKernel([[0, -1, 1]])).toThrow(RangeError);
  });

  it("rejects an all-zero or empty kernel", () => {
    expect(() => validateCustomDiffusionKernel([])).toThrow(RangeError);
    expect(() => validateCustomDiffusionKernel([[0, 1, 0]])).toThrow(RangeError);
  });

  it("rejects an oversized kernel", () => {
    const entries = Array.from({ length: 17 }, () => [0, 1, 1] as const);
    expect(() => validateCustomDiffusionKernel(entries)).toThrow(RangeError);
  });

  it("builds stable custom kernel IDs and normalized definitions", () => {
    const entries = [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] as const;
    expect(customDiffusionKernelId(entries)).toBe(customDiffusionKernelId(entries));
    expect(defineCustomDiffusionKernel(entries)).toEqual({
      id: customDiffusionKernelId(entries),
      entries: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]],
    });
  });
});
