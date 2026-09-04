import { describe, expect, it } from "vitest";
import {
  checkerPhaseDiffusionKernel,
  checkerPhaseV43DiffusionKernel,
  checkerPhaseV5DiffusionKernel,
  phaseBalancedDiffusionKernel,
} from "./diffusion.js";

describe("phase-balanced error diffusion", () => {
  it("keeps checker-phase v4 equal to unrestricted v2 at zero suppression", () => {
    expect(checkerPhaseDiffusionKernel(1, 17, 23, 0, 99)).toEqual([
      [1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1],
    ]);
    expect(checkerPhaseDiffusionKernel(-1, 17, 23, 0, 99)).toEqual([
      [-1, 0, 7], [1, 1, 3], [0, 1, 5], [-1, 1, 1],
    ]);
  });

  it("keeps v4.3 direction-neutral and conserves weight", () => {
    for (const direction of [-1, 1] as const) {
      for (const suppression of [1, 50, 100]) {
        const kernel = checkerPhaseV43DiffusionKernel(direction, 17, 23, suppression, 20);
        expect(kernel.reduce((sum, [, , weight]) => sum + weight, 0)).toBeCloseTo(16, 10);
        expect(kernel.every(([, , weight]) => weight >= 0)).toBe(true);
        expect(kernel.find(([dx, dy]) => dx === 0 && dy === 1)?.[2]).toBe(5);
        expect(kernel.find(([dx, dy]) => dx === -1 && dy === 2)?.[2])
          .toBeCloseTo(kernel.find(([dx, dy]) => dx === 1 && dy === 2)?.[2] ?? 0);
      }
    }
    expect(checkerPhaseV43DiffusionKernel(1, 17, 23, 0, 99)).toEqual([
      [1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1],
    ]);
  });

  it("conserves checker-phase kernel weight and prefers alternating phase", () => {
    for (const direction of [-1, 1] as const) {
      for (const y of [0, 1, 2, 3]) {
        const kernel = checkerPhaseDiffusionKernel(direction, 7, y, 100, 0);
        expect(kernel.reduce((sum, [, , weight]) => sum + weight, 0)).toBeCloseTo(16);
        const forward = kernel.find(([dx, dy]) => dx === direction && dy === 0)?.[2] ?? 0;
        const down = kernel.find(([dx, dy]) => dx === 0 && dy === 1)?.[2] ?? 0;
        expect(forward + down).toBeGreaterThan(7);
      }
    }
  });

  it("keeps v5 symmetric and suppresses the direct column after a short run", () => {
    const noRun = checkerPhaseV5DiffusionKernel(1, 7, 4, 100, 0);
    const run = checkerPhaseV5DiffusionKernel(1, 7, 4, 100, 4);
    const base = phaseBalancedDiffusionKernel(1, 7, 4, 100, 0);
    const weight = (kernel: typeof noRun, dx: number, dy: number) =>
      kernel.find(([x, y]) => x === dx && y === dy)?.[2] ?? 0;
    expect(weight(noRun, 1, 0) - weight(base, 1, 0))
      .toBeCloseTo(weight(noRun, 0, 1) - weight(base, 0, 1));
    expect(weight(run, 0, 1)).toBeLessThan(weight(noRun, 0, 1));
    expect(run.reduce((sum, [, , value]) => sum + value, 0)).toBeCloseTo(16);
  });

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
