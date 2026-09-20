import { describe, expect, it } from "vitest";
import {
  customOrderedMatrix,
  customOrderedMatrixId,
  defineCustomOrderedMatrix,
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

  it("rejects duplicate ranks", () => {
    expect(() => validateCustomOrderedMatrix({
      width: 2, height: 2, values: [0, 0, 1, 2],
    })).toThrow(RangeError);
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
