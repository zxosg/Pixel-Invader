import { describe, expect, it } from "vitest";
import {
  checkerCarrierStrengthV44,
  renderGrayscaleArtisticCarrier,
  renderGrayscaleCheckerPhaseV44,
  renderGrayscaleDiffusionReference,
} from "./grayscale-checker-v44.js";

function flatSource(width: number, height: number, value: number): Uint8Array {
  const source = new Uint8Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    source[offset] = value;
    source[offset + 1] = value;
    source[offset + 2] = value;
    source[offset + 3] = 255;
  }
  return source;
}

function horizontalGradient(width: number, height: number): Uint8Array {
  const source = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const value = Math.round(255 * x / Math.max(1, width - 1));
    const offset = (y * width + x) * 4;
    source[offset] = value;
    source[offset + 1] = value;
    source[offset + 2] = value;
    source[offset + 3] = 255;
  }
  return source;
}

const options = {
  ditheringAmount: 35,
  lineSuppression: 30,
  randomization: 0,
};

describe("grayscale checker-phase v4.4 prototype", () => {
  it("maps suppression linearly to checker-carrier strength", () => {
    expect(checkerCarrierStrengthV44(35, 0)).toBe(0);
    expect(checkerCarrierStrengthV44(35, 25)).toBeCloseTo(0.0875, 6);
    expect(checkerCarrierStrengthV44(35, 50)).toBeCloseTo(0.175, 6);
    expect(checkerCarrierStrengthV44(35, 75)).toBeCloseTo(0.2625, 6);
    expect(checkerCarrierStrengthV44(35, 100)).toBeCloseTo(0.35, 6);
  });

  it("keeps the tone guide independent from suppression", () => {
    const source = horizontalGradient(43, 31);
    for (const lineSuppression of [0, 25, 50, 75, 100]) {
      const renderOptions = { ditheringAmount: 35, lineSuppression, randomization: 0 };
      const neutralOptions = { ...renderOptions, lineSuppression: 0 };
      const v3 = renderGrayscaleDiffusionReference(source, 43, 31, neutralOptions, "v3");
      const v44 = renderGrayscaleCheckerPhaseV44(source, 43, 31, renderOptions);
      expect(v44.guide).toEqual(v3.guide);
    }
  });

  it("matches the grayscale v3 guide and bits at zero suppression", () => {
    const source = flatSource(37, 29, 178);
    const v3 = renderGrayscaleDiffusionReference(source, 37, 29, {
      ...options,
      lineSuppression: 0,
    }, "v3");
    const v44 = renderGrayscaleCheckerPhaseV44(source, 37, 29, {
      ...options,
      lineSuppression: 0,
    });
    expect(v44.bits).toEqual(v3.bits);
    expect(v44.guide).toEqual(v3.guide);
    expect(v44.diagnostics.acceptedCount).toBe(0);
  });

  it("is deterministic and emits exactly one binary endpoint per pixel", () => {
    const source = horizontalGradient(41, 27);
    const first = renderGrayscaleCheckerPhaseV44(source, 41, 27, options);
    const second = renderGrayscaleCheckerPhaseV44(source, 41, 27, options);
    expect(first.bits).toEqual(second.bits);
    expect(first.guide).toEqual(second.guide);
    expect(first.diagnostics).toEqual(second.diagnostics);
    expect(Array.from(first.bits).every((bit) => bit === 0 || bit === 1)).toBe(true);
  });

  it("increases checker occupancy on a smooth intermediate field without post-flipping pixels", () => {
    const source = flatSource(64, 64, 178);
    const v3 = renderGrayscaleDiffusionReference(source, 64, 64, options, "v3");
    const v44 = renderGrayscaleCheckerPhaseV44(source, 64, 64, {
      ...options,
      lineSuppression: 75,
    });
    expect(v44.diagnostics.acceptedCount).toBeGreaterThan(0);
    expect(v44.diagnostics.checkerOccupancy)
      .toBeGreaterThan(v3.diagnostics.checkerOccupancy);
    expect(v44.diagnostics.checkerPhaseConsistency).toBeGreaterThan(0.9);
    expect(v44.diagnostics.twoByOneArtifacts).toBeLessThanOrEqual(v3.diagnostics.twoByOneArtifacts);
  });

  it("keeps solid endpoint fields unchanged", () => {
    for (const value of [0, 255]) {
      const source = flatSource(32, 24, value);
      const v3 = renderGrayscaleDiffusionReference(source, 32, 24, options, "v3");
      const v44 = renderGrayscaleCheckerPhaseV44(source, 32, 24, options);
      expect(v44.bits).toEqual(v3.bits);
      expect(v44.diagnostics.acceptedCount).toBe(0);
    }
  });

  it("does not apply the carrier across strong edges", () => {
    const source = new Uint8Array(48 * 32 * 4);
    for (let y = 0; y < 32; y += 1) for (let x = 0; x < 48; x += 1) {
      const value = x < 24 ? 32 : 224;
      const offset = (y * 48 + x) * 4;
      source[offset] = value;
      source[offset + 1] = value;
      source[offset + 2] = value;
      source[offset + 3] = 255;
    }
    const result = renderGrayscaleCheckerPhaseV44(source, 48, 32, {
      ...options,
      lineSuppression: 75,
    });
    expect(result.diagnostics.edgeRejectedCount).toBeGreaterThan(0);
    expect(result.diagnostics.acceptedCount).toBe(0);
  });

  it("preserves a stable global checker phase", () => {
    const source = flatSource(64, 64, 178);
    const result = renderGrayscaleCheckerPhaseV44(source, 64, 64, {
      ...options,
      lineSuppression: 100,
      ditheringAmount: 100,
    });
    expect(result.diagnostics.checkerPhaseConsistency).toBeGreaterThan(0.75);
  });

  it("provides a pure artistic checker reference for benchmark comparison", () => {
    const result = renderGrayscaleArtisticCarrier(flatSource(32, 32, 188), 32, 32);
    expect(result.diagnostics.checkerOccupancy).toBe(1);
    expect(result.diagnostics.checkerPhaseConsistency).toBe(1);
  });
});
