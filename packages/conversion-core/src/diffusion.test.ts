import { describe, expect, it } from "vitest";
import { phaseBalancedDiffusionKernel } from "./diffusion.js";

describe("phase-balanced error diffusion", () => {
  it("returns the historical Floyd-Steinberg kernel exactly at zero suppression", () => {
    expect(phaseBalancedDiffusionKernel(1, 17, 23, 0, 99)).toEqual([
      [1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1],
    ]);
    expect(phaseBalancedDiffusionKernel(-1, 17, 23, 0, 99)).toEqual([
      [-1, 0, 7], [1, 1, 3], [0, 1, 5], [-1, 1, 1],
    ]);
  });

  it("is deterministic, non-negative, and conserves all sixteen weights", () => {
    for (const suppression of [1, 50, 100]) {
      for (const run of [0, 4, 20]) {
        const first = phaseBalancedDiffusionKernel(1, 31, 47, suppression, run);
        expect(phaseBalancedDiffusionKernel(1, 31, 47, suppression, run))
          .toEqual(first);
        expect(first.every(([, , weight]) => weight >= 0)).toBe(true);
        expect(first.reduce((sum, [, , weight]) => sum + weight, 0))
          .toBeCloseTo(16, 10);
      }
    }
  });

  it("strengthens direct-down corrective feedback after a long vertical run", () => {
    const normal = phaseBalancedDiffusionKernel(1, 9, 9, 100, 0);
    const suppressed = phaseBalancedDiffusionKernel(1, 9, 9, 100, 8);
    expect(suppressed.find(([dx, dy]) => dx === 0 && dy === 1)?.[2])
      .toBeGreaterThan(normal.find(([dx, dy]) => dx === 0 && dy === 1)?.[2] ?? 0);
  });
});
