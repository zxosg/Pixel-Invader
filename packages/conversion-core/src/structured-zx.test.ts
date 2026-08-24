import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONVERSION_SETTINGS,
  convertToZx,
  quantizedOklab,
  type AttributeHeight,
  type ConversionSettings,
} from "./index.js";

function structuredSettings(
  attributeHeight: AttributeHeight,
  amount: number,
): ConversionSettings {
  return {
    ...DEFAULT_CONVERSION_SETTINGS,
    framing: "stretch",
    attributeHeight,
    paletteSelections: [{
      screenIndex: 0,
      enabledColorIds: [0, 7],
      brightMode: "on",
    }],
    attributeOptimizerId: "zx-structured-global-v1",
    ditherEngineId: "ordered-cell-pattern-v1",
    dithering: "ordered",
    ditheringAmount: amount,
    structured: {
      ...DEFAULT_CONVERSION_SETTINGS.structured,
      ditherAmountPermille: amount * 10,
    },
  };
}

function checkerboard(): Uint8Array {
  const output = new Uint8Array(256 * 192 * 4);
  for (let y = 0; y < 192; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const value = ((x + y) & 1) === 0 ? 0 : 255;
      const offset = (y * 256 + x) * 4;
      output.set([value, value, value, 255], offset);
    }
  }
  return output;
}

function horizontalGradient(): Uint8Array {
  const output = new Uint8Array(256 * 192 * 4);
  for (let y = 0; y < 192; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const offset = (y * 256 + x) * 4;
      output.set([x, x, x, 255], offset);
    }
  }
  return output;
}

function structuredV2Settings(amount: number): ConversionSettings {
  const settings = structuredSettings(8, amount);
  return {
    ...settings,
    attributeOptimizerId: "zx-structured-global-v2",
    ditherEngineId: "ordered-cell-pattern-v2",
    structured: {
      ...settings.structured,
      ditherResponseCurveId: "power-035-percent-v2",
      objectiveWeights: {
        ...settings.structured.objectiveWeights,
        pixel: 192,
        rgbAnchor: 0,
        mean: 2048,
      },
    },
  };
}

function structuredV3Settings(amount: number): ConversionSettings {
  const settings = structuredV2Settings(amount);
  return {
    ...settings,
    attributeOptimizerId: "zx-structured-global-v3",
    ditherEngineId: "ordered-cell-pattern-v3",
    structured: {
      ...settings.structured,
      colorAnchorModelId: "srgb-squared-v1",
      objectiveWeights: {
        ...settings.structured.objectiveWeights,
        rgbAnchor: 6144,
      },
    },
  };
}

function structuredV4Settings(
  amount: number,
  orderedMatrix: ConversionSettings["orderedMatrix"] = "bayer-4x4",
): ConversionSettings {
  const settings = structuredV3Settings(amount);
  return {
    ...settings,
    attributeOptimizerId: "zx-structured-global-v4",
    ditherEngineId: "ordered-cell-pattern-v4",
    orderedMatrix,
    structured: {
      ...settings.structured,
      structuralModelId: "palette-topology-v1",
      objectiveWeights: {
        ...settings.structured.objectiveWeights,
        rgbAnchor: 2048,
        patternReference: 1536,
        paletteDistribution: 1024,
        luminanceRank: 512,
        edgePolarity: 768,
        mean: 768,
        sharedEndpoint: 0,
      },
      candidateParameters: {
        ...settings.structured.candidateParameters,
        localAdmissibilityPermille: 100,
        boundaryCapPermille: 100,
      },
    },
  };
}

function naturalColorBands(): Uint8Array {
  const colors = [
    [96, 128, 96],
    [128, 128, 64],
    [128, 160, 128],
    [192, 128, 64],
  ] as const;
  const output = new Uint8Array(256 * 192 * 4);
  for (let y = 0; y < 192; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const color = colors[Math.min(3, Math.floor(x / 64))]!;
      const offset = (y * 256 + x) * 4;
      output.set([color[0], color[1], color[2], 255], offset);
    }
  }
  return output;
}

describe("structured ZX Version 1", () => {
  it("freezes the quantized OKLab reference vectors", () => {
    expect(quantizedOklab(0, 0, 0)).toEqual({ l: 0, a: 0, b: 0 });
    expect(quantizedOklab(255, 255, 255)).toEqual({ l: 4096, a: 0, b: 0 });
    expect(quantizedOklab(255, 0, 0)).toEqual({ l: 2572, a: 921, b: 515 });
    expect(quantizedOklab(0, 255, 0)).toEqual({ l: 3549, a: -958, b: 735 });
    expect(quantizedOklab(0, 0, 255)).toEqual({ l: 1851, a: -133, b: -1276 });
  });

  it.each([1, 2, 4, 8] as const)(
    "uses the exact independent-pixel baseline at 0%% for 8x%s",
    (attributeHeight) => {
      const source = checkerboard();
      const result = convertToZx(
        source,
        256,
        192,
        structuredSettings(attributeHeight, 0),
        "draft",
      );

      expect(result.previewRgba).toEqual(source);
      expect(result.structuredDiagnostics?.deliberateFlips).toBe(0);
      expect(result.attributes).toHaveLength(32 * (192 / attributeHeight));
    },
  );

  it("is deterministic and exports structured diagnostics", () => {
    const source = checkerboard();
    const settings = structuredSettings(8, 65);
    const first = convertToZx(source, 256, 192, settings, "draft");
    const second = convertToZx(source, 256, 192, settings, "draft");

    expect(first.frames[0]?.encoded).toEqual(second.frames[0]?.encoded);
    expect(first.preConstraintPreviewRgba)
      .toEqual(second.preConstraintPreviewRgba);
    expect(first.structuredDiagnostics).toEqual(second.structuredDiagnostics);
    const diagnostics = first.structuredDiagnostics!;
    expect(diagnostics.localCost).toBe(
      diagnostics.pixelCost +
        diagnostics.rgbAnchorCost +
        diagnostics.patternReferenceCost +
        diagnostics.paletteDistributionCost +
        diagnostics.luminanceRankCost +
        diagnostics.edgePolarityCost +
        diagnostics.meanCost +
        diagnostics.edgeCost +
        diagnostics.deviationFlipCost +
        diagnostics.deviationContrastCost +
        diagnostics.visibilityCost,
    );
    expect(diagnostics.boundaryCost).toBeLessThanOrEqual(
      diagnostics.boundaryExcessCost,
    );
    expect(diagnostics.totalEnergy).toBe(first.score);
  });

  it("rejects a mismatched percentage and authoritative permille value", () => {
    const settings = structuredSettings(8, 50);
    expect(() => convertToZx(
      checkerboard(),
      256,
      192,
      {
        ...settings,
        structured: {
          ...settings.structured,
          ditherAmountPermille: 499,
        },
      },
      "draft",
    )).toThrow(/permille/);
  });

  it("rejects structured weights whose conservative bound is unsafe", () => {
    const settings = structuredSettings(8, 50);
    expect(() => convertToZx(
      checkerboard(),
      256,
      192,
      {
        ...settings,
        structured: {
          ...settings.structured,
          oklabWeights: { l: 65_536, a: 65_536, b: 65_536 },
          objectiveWeights: {
            ...settings.structured.objectiveWeights,
            pixel: 65_536,
          },
        },
      },
      "draft",
    )).toThrow(/safe integer/);
  });

  it("Version 2 introduces structured patterns progressively above zero", () => {
    const source = horizontalGradient();
    const none = convertToZx(
      source,
      256,
      192,
      structuredV2Settings(0),
      "draft",
    );
    const low = convertToZx(
      source,
      256,
      192,
      structuredV2Settings(4),
      "draft",
    );
    const full = convertToZx(
      source,
      256,
      192,
      structuredV2Settings(100),
      "draft",
    );

    expect(none.structuredDiagnostics?.deliberateFlips).toBe(0);
    expect(low.structuredDiagnostics?.deliberateFlips).toBeGreaterThan(0);
    expect(low.preConstraintPreviewRgba)
      .not.toEqual(none.preConstraintPreviewRgba);
    expect(low.previewRgba).not.toEqual(none.previewRgba);
    expect(full.structuredDiagnostics?.deliberateFlips)
      .toBeGreaterThan(low.structuredDiagnostics?.deliberateFlips ?? 0);
  });

  it("Version 3 suppresses unrelated complementary palette bias", () => {
    const source = naturalColorBands();
    const unanchored = convertToZx(
      source,
      256,
      192,
      {
        ...structuredV2Settings(100),
        paletteSelections: [{
          screenIndex: 0,
          enabledColorIds: [0, 1, 2, 3, 4, 5, 6, 7],
          brightMode: "on",
        }],
      },
      "draft",
    );
    const anchored = convertToZx(
      source,
      256,
      192,
      {
        ...structuredV3Settings(100),
        paletteSelections: [{
          screenIndex: 0,
          enabledColorIds: [0, 1, 2, 3, 4, 5, 6, 7],
          brightMode: "on",
        }],
      },
      "draft",
    );
    const redOrCyanPixels = (rgba: Uint8Array) => {
      let count = 0;
      for (let offset = 0; offset < rgba.length; offset += 4) {
        const r = rgba[offset] ?? 0;
        const g = rgba[offset + 1] ?? 0;
        const b = rgba[offset + 2] ?? 0;
        if ((r > 0 && g === 0 && b === 0) || (r === 0 && g > 0 && b > 0)) {
          count += 1;
        }
      }
      return count;
    };

    expect(redOrCyanPixels(anchored.previewRgba))
      .toBeLessThan(redOrCyanPixels(unanchored.previewRgba));
    expect(anchored.structuredDiagnostics?.colorAnchorModelId)
      .toBe("srgb-squared-v1");
    expect(anchored.structuredDiagnostics?.deliberateFlips).toBeGreaterThan(0);
  }, 10_000);

  it("Version 4 preserves the exact no-dither baseline", () => {
    const source = checkerboard();
    const result = convertToZx(
      source,
      256,
      192,
      structuredV4Settings(0),
      "draft",
    );

    expect(result.previewRgba).toEqual(source);
    expect(result.preConstraintPreviewRgba).toEqual(source);
    expect(result.structuredDiagnostics?.engineVersion)
      .toBe("zx-structured-global-v4");
    expect(result.structuredDiagnostics?.structuralModelId)
      .toBe("palette-topology-v1");
    expect(result.structuredDiagnostics?.deliberateFlips).toBe(0);
  });

  it("Version 4 uses the selected ordered matrix in its pattern reference", () => {
    const source = horizontalGradient();
    const twoByTwo = convertToZx(
      source,
      256,
      192,
      structuredV4Settings(100, "bayer-2x2"),
      "draft",
    );
    const fourByFour = convertToZx(
      source,
      256,
      192,
      structuredV4Settings(100, "bayer-4x4"),
      "draft",
    );

    expect(twoByTwo.preConstraintPreviewRgba)
      .not.toEqual(fourByFour.preConstraintPreviewRgba);
    expect(twoByTwo.previewRgba).not.toEqual(fourByFour.previewRgba);
    expect(twoByTwo.structuredDiagnostics?.patternReferenceCost)
      .toBeGreaterThan(0);
  });
});
