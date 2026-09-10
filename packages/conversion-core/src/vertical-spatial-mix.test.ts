import { describe, expect, it } from "vitest";
import {
  buildVerticalSpatialAnalyticPreview,
  optimizeVerticalSpatialPmd,
  optimizeVerticalSpatialPmdDetail,
  optimizeVerticalSpatialPixels,
  optimizeVerticalSpatialZx,
  VERTICAL_SPATIAL_SRGB_TO_LINEAR_Q16,
} from "./vertical-spatial-mix.js";
import { convertToZx, renderAttributeFrameRgba } from "./convert.js";
import { convertToQl } from "./ql-convert.js";
import { convertToPmd85 } from "./pmd85-convert.js";
import { DEFAULT_CONVERSION_SETTINGS } from "./types.js";

function solid(width: number, height: number, r: number, g: number, b: number): Uint8Array {
  const output = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < output.length; offset += 4) {
    output[offset] = r;
    output[offset + 1] = g;
    output[offset + 2] = b;
    output[offset + 3] = 255;
  }
  return output;
}

describe("vertical spatial mixing v1", () => {
  it("freezes the Q16 sRGB endpoints and linear black/white preview", () => {
    expect(VERTICAL_SPATIAL_SRGB_TO_LINEAR_Q16[0]).toBe(0);
    expect(VERTICAL_SPATIAL_SRGB_TO_LINEAR_Q16[255]).toBe(65_535);
    const physical = new Uint8Array([
      0, 0, 0, 255,
      255, 255, 255, 255,
    ]);
    expect([...buildVerticalSpatialAnalyticPreview(physical, 1, 2)])
      .toEqual([188, 188, 188, 255]);
  });

  it("matches the linear-light primary reference vectors and is order-symmetric", () => {
    const redOverGreen = new Uint8Array([
      255, 0, 0, 255,
      0, 255, 0, 255,
    ]);
    const greenOverRed = new Uint8Array([
      0, 255, 0, 255,
      255, 0, 0, 255,
    ]);
    expect([...buildVerticalSpatialAnalyticPreview(redOverGreen, 1, 2)])
      .toEqual([188, 188, 0, 255]);
    expect(buildVerticalSpatialAnalyticPreview(greenOverRed, 1, 2))
      .toEqual(buildVerticalSpatialAnalyticPreview(redOverGreen, 1, 2));
  });

  it("applies brightness and contrast before spatial quantization", () => {
    const source = solid(256, 192, 96, 96, 96);
    const base = {
      ...DEFAULT_CONVERSION_SETTINGS,
      modeId: "zx48-vertical-spatial-256x192" as const,
      attributeOptimizerId: "zx-vertical-spatial-uniform-v1" as const,
      ditherEngineId: "vertical-spatial-none-v1" as const,
      dithering: "none" as const,
      attributeHeight: 1 as const,
      verticalSpatialMix: { schemaVersion: 1 as const, algorithmId: "vertical-spatial-uniform-v1" as const, calibrationId: "srgb-ideal-v1" as const },
      paletteSelections: [{ screenIndex: 0, enabledColorIds: [0, 7], brightMode: "auto" as const }],
    };
    const normal = convertToZx(source, 256, 192, base).frames[0]!.previewRgba;
    const adjusted = convertToZx(source, 256, 192, { ...base, brightness: 60, contrast: 40 }).frames[0]!.previewRgba;
    expect(adjusted).not.toEqual(normal);
  });

  it("chooses exact ordered QL row pairs deterministically", () => {
    const source = new Uint8Array([
      255, 0, 0, 255,
      0, 255, 0, 255,
    ]);
    const palette = [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
    ];
    const result = optimizeVerticalSpatialPixels(source, 1, 2, palette, [0, 1, 2]);
    expect([...result.upperIndices]).toEqual([1, 2]);
    expect(result.diagnostics.colorCost).toBe(0);
  });

  it("makes QL physical row ordering an explicit optional phase", () => {
    const source = new Uint8Array([
      0, 0, 0, 255, 255, 0, 0, 255,
      0, 0, 0, 255, 0, 255, 0, 255,
    ]);
    const palette = [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
    ];
    const withoutSwap = optimizeVerticalSpatialPixels(source, 2, 2, palette, [0, 1, 2]);
    const withSwap = optimizeVerticalSpatialPixels(source, 2, 2, palette, [0, 1, 2], {
      method: "none", amount: 0, orderedMatrix: "bayer-4x4", errorRandomization: 0, swapRows: true,
    });
    expect([...withoutSwap.upperIndices]).toEqual([0, 1, 0, 2]);
    expect([...withSwap.upperIndices]).toEqual([0, 2, 0, 1]);
  });

  it("supports logical ordered and error-diffusion dithering with zero-amount identity", () => {
    const source = solid(16, 2, 200, 200, 200);
    const palette = [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 255, b: 255 },
    ];
    const none = optimizeVerticalSpatialPixels(source, 16, 2, palette, [0, 1]);
    const orderedZero = optimizeVerticalSpatialPixels(source, 16, 2, palette, [0, 1], {
      method: "ordered",
      amount: 0,
      orderedMatrix: "bayer-4x4",
      errorRandomization: 0,
    });
    const ordered = optimizeVerticalSpatialPixels(source, 16, 2, palette, [0, 1], {
      method: "ordered",
      amount: 100,
      orderedMatrix: "bayer-4x4",
      errorRandomization: 0,
    });
    const diffused = optimizeVerticalSpatialPixels(source, 16, 2, palette, [0, 1], {
      method: "error-diffusion",
      amount: 100,
      orderedMatrix: "bayer-4x4",
      errorRandomization: 0,
    });
    expect(orderedZero.upperIndices).toEqual(none.upperIndices);
    expect(ordered.upperIndices).not.toEqual(none.upperIndices);
    expect(diffused.upperIndices).not.toEqual(none.upperIndices);
    expect(optimizeVerticalSpatialPixels(source, 16, 2, palette, [0, 1], {
      method: "error-diffusion",
      amount: 100,
      orderedMatrix: "bayer-4x4",
      errorRandomization: 0,
    }).upperIndices).toEqual(diffused.upperIndices);
  });

  it("emits legal PMD masks and independent row attributes", () => {
    const result = optimizeVerticalSpatialPmd(
      solid(6, 2, 255, 0, 0),
      6,
      2,
      [
        { r: 0, g: 255, b: 0 },
        { r: 255, g: 0, b: 0 },
        { r: 0, g: 0, b: 255 },
        { r: 255, g: 0, b: 255 },
      ],
      [0, 1, 2, 3],
    );
    expect([...result.pixelMasks]).toEqual([0x3f, 0x3f]);
    expect([...result.attributes]).toEqual([1, 1]);
  });

  it("emits a complete exhaustive ZX 8x1 plane with FLASH clear", () => {
    const result = optimizeVerticalSpatialZx(
      solid(256, 192, 0, 0, 0),
      [0, 1, 2, 3, 4, 5, 6, 7],
      "auto",
    );
    expect(result.pixelMasks).toHaveLength(256 * 192);
    expect(result.attributes).toHaveLength(32 * 192);
    expect([...result.attributes].every((attribute) => (attribute & 0x80) === 0)).toBe(true);
  }, 20_000);

  it("refines ZX physical row orientation without changing the analytic mixture", () => {
    const source = new Uint8Array(256 * 192 * 4);
    for (let y = 0; y < 192; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const offset = (y * 256 + x) * 4;
        source.set(y % 2 === 0
          ? [0, 0, 205, 255]
          : [205, 0, 0, 255], offset);
      }
    }
    const uniform = optimizeVerticalSpatialZx(
      source, [0, 1, 2, 7], "off", undefined, "uniform-blend",
    );
    const detail = optimizeVerticalSpatialZx(
      source, [0, 1, 2, 7], "off", undefined, "detail-preserving",
    );
    expect(detail.pixelMasks).not.toEqual(uniform.pixelMasks);
    expect(detail.diagnostics.algorithmId).toBe("vertical-spatial-detail-v1");
    expect(detail.diagnostics.detailCost).toBe(0);
    const uniformPreview = buildVerticalSpatialAnalyticPreview(
      renderAttributeFrameRgba(uniform.pixelMasks, uniform.attributes, 1),
      256,
      192,
    );
    const detailPreview = buildVerticalSpatialAnalyticPreview(
      renderAttributeFrameRgba(detail.pixelMasks, detail.attributes, 1),
      256,
      192,
    );
    expect(detailPreview).toEqual(uniformPreview);
  }, 20_000);

  it("integrates single-frame spatial targets with all three codecs", () => {
    const input = new Uint8Array([0, 0, 0, 255]);
    const verticalSpatialMix = {
      schemaVersion: 1 as const,
      algorithmId: "vertical-spatial-uniform-v1" as const,
      calibrationId: "srgb-ideal-v1" as const,
    };
    const ql = convertToQl(input, 1, 1, {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "sinclair-ql",
      modeId: "mode8-vertical-spatial-256x256",
      attributeOptimizerId: "ql-vertical-spatial-uniform-v1",
      ditherEngineId: "vertical-spatial-none-v1",
      paletteSelections: [{ screenIndex: 0, enabledColorIds: [0] }],
      verticalSpatialMix,
    });
    expect(ql.frames).toHaveLength(1);
    expect(ql.frames[0]?.encoded).toHaveLength(32_768);
    expect(ql.verticalSpatialDiagnostics?.analyticPreviewRgba).toHaveLength(256 * 128 * 4);

    const pmd = convertToPmd85(input, 1, 1, {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "pmd-85",
      modeId: "pmd85-3-rgb-vertical-spatial",
      attributeOptimizerId: "pmd85-vertical-spatial-uniform-v1",
      ditherEngineId: "vertical-spatial-none-v1",
      paletteSelections: [{ screenIndex: 0, enabledColorIds: [0] }],
      pmd85: { ...DEFAULT_CONVERSION_SETTINGS.pmd85, mode: "pmd85-3-rgb" },
      verticalSpatialMix,
    }, [{ r: 0, g: 255, b: 0 }, { r: 255, g: 0, b: 0 }, { r: 0, g: 0, b: 255 }, { r: 255, g: 0, b: 255 }]);
    expect(pmd.frames[0]?.encoded).toHaveLength(16_384);
    expect(pmd.verticalSpatialDiagnostics?.logicalHeight).toBe(128);

    const zx = convertToZx(input, 1, 1, {
      ...DEFAULT_CONVERSION_SETTINGS,
      modeId: "zx48-vertical-spatial-256x192",
      attributeOptimizerId: "zx-vertical-spatial-uniform-v1",
      ditherEngineId: "vertical-spatial-none-v1",
      attributeHeight: 1,
      paletteSelections: [{ screenIndex: 0, enabledColorIds: [0], brightMode: "off" }],
      verticalSpatialMix,
    });
    expect(zx.frames[0]?.encoded).toHaveLength(12_288);
    expect(zx.verticalSpatialDiagnostics?.logicalHeight).toBe(96);
  });

  it("preserves PMD physical row detail without changing the analytic pair", () => {
    const source = new Uint8Array(6 * 2 * 4);
    for (let x = 0; x < 6; x += 1) {
      source.set([255, 0, 0, 255], x * 4);
      source.set([0, 0, 0, 255], (6 + x) * 4);
    }
    const result = optimizeVerticalSpatialPmdDetail(
      source, 6, 2, [{ r: 255, g: 0, b: 0 }], [0],
    );
    expect(result.pixelMasks[0]).toBe(0x3f);
    expect(result.pixelMasks[1]).toBe(0);
    expect(result.diagnostics.algorithmId).toBe("vertical-spatial-pmd-detail-v2");
    expect(result.diagnostics.detailCost).toBe(0);
  });

  it.each([
    ["ordered", "bayer-4x4"],
    ["error-diffusion", "bayer-4x4"],
  ] as const)("dithers PMD spatial coverage within a six-pixel cell using %s", (method, orderedMatrix) => {
    const result = optimizeVerticalSpatialPmdDetail(
      solid(24, 4, 140, 140, 140),
      24,
      4,
      [{ r: 255, g: 255, b: 255 }],
      [0],
      { method, amount: 100, orderedMatrix, errorRandomization: 0 },
    );
    const coverages = result.pixelMasks.map((mask, index) =>
      mask | (result.pixelMasks[index + 4] ?? 0));
    expect([...coverages].some((mask) => mask !== 0 && mask !== 0x3f)).toBe(true);
  });

  it("integrates the PMD detail v2 optimizer with the spatial codec", () => {
    const result = convertToPmd85(new Uint8Array([140, 140, 140, 255]), 1, 1, {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "pmd-85",
      modeId: "pmd85-3-rgb-vertical-spatial",
      attributeOptimizerId: "pmd85-vertical-spatial-detail-v2",
      ditherEngineId: "vertical-spatial-error-diffusion-v1",
      dithering: "error-diffusion",
      ditheringAmount: 100,
      paletteSelections: [{ screenIndex: 0, enabledColorIds: [0, 1, 2, 3] }],
      pmd85: { ...DEFAULT_CONVERSION_SETTINGS.pmd85, mode: "pmd85-3-rgb" },
      verticalSpatialMix: {
        schemaVersion: 1,
        algorithmId: "vertical-spatial-pmd-detail-v2",
        calibrationId: "srgb-ideal-v1",
      },
    }, [
      { r: 0, g: 255, b: 0 },
      { r: 255, g: 255, b: 0 },
      { r: 0, g: 255, b: 255 },
      { r: 255, g: 255, b: 255 },
    ]);
    expect(result.frames[0]?.encoded).toHaveLength(16_384);
    expect(result.verticalSpatialDiagnostics?.algorithmId)
      .toBe("vertical-spatial-pmd-detail-v2");
    expect(result.verticalSpatialDiagnostics?.phaseChanges).toBeGreaterThan(0);
  });

  it.each([
    ["ordered", "vertical-spatial-ordered-v1"],
    ["error-diffusion", "vertical-spatial-error-diffusion-v1"],
  ] as const)("integrates %s with legal ZX 8x1 output", (dithering, ditherEngineId) => {
    const zx = convertToZx(new Uint8Array([128, 128, 128, 255]), 1, 1, {
      ...DEFAULT_CONVERSION_SETTINGS,
      modeId: "zx48-vertical-spatial-256x192",
      attributeOptimizerId: "zx-vertical-spatial-uniform-v1",
      ditherEngineId,
      dithering,
      ditheringAmount: 100,
      attributeHeight: 1,
      paletteSelections: [{ screenIndex: 0, enabledColorIds: [0, 7], brightMode: "off" }],
      verticalSpatialMix: {
        schemaVersion: 1,
        algorithmId: "vertical-spatial-uniform-v1",
        calibrationId: "srgb-ideal-v1",
      },
    });
    expect(zx.frames[0]?.encoded).toHaveLength(12_288);
    expect([...zx.attributes].every((attribute) => (attribute & 0x80) === 0)).toBe(true);
  }, 20_000);

  it.each([
    ["ordered", "vertical-spatial-ordered-v1"],
    ["error-diffusion", "vertical-spatial-error-diffusion-v1"],
  ] as const)("integrates %s with QL and PMD spatial codecs", (dithering, ditherEngineId) => {
    const input = new Uint8Array([160, 160, 160, 255]);
    const verticalSpatialMix = {
      schemaVersion: 1 as const,
      algorithmId: "vertical-spatial-uniform-v1" as const,
      calibrationId: "srgb-ideal-v1" as const,
    };
    const ql = convertToQl(input, 1, 1, {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "sinclair-ql",
      modeId: "mode8-vertical-spatial-256x256",
      attributeOptimizerId: "ql-vertical-spatial-uniform-v1",
      ditherEngineId,
      dithering,
      ditheringAmount: 100,
      paletteSelections: [{ screenIndex: 0, enabledColorIds: [0, 7] }],
      verticalSpatialMix,
    });
    expect(ql.frames[0]?.encoded).toHaveLength(32_768);

    const pmd = convertToPmd85(input, 1, 1, {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "pmd-85",
      modeId: "pmd85-3-rgb-vertical-spatial",
      attributeOptimizerId: "pmd85-vertical-spatial-uniform-v1",
      ditherEngineId,
      dithering,
      ditheringAmount: 100,
      paletteSelections: [{ screenIndex: 0, enabledColorIds: [0, 1, 2, 3] }],
      pmd85: { ...DEFAULT_CONVERSION_SETTINGS.pmd85, mode: "pmd85-3-rgb" },
      verticalSpatialMix,
    }, [
      { r: 0, g: 255, b: 0 },
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 0, b: 255 },
      { r: 255, g: 0, b: 255 },
    ]);
    expect(pmd.frames[0]?.encoded).toHaveLength(16_384);
  });

  it("supports checker-phase v4.4 in regular PMD 85 cell mode", () => {
    const input = new Uint8Array([128, 128, 128, 255]);
    const settings = {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "pmd-85" as const,
      modeId: "pmd85-2-tv" as const,
      attributeOptimizerId: "pmd85-cell-v1" as const,
      ditherEngineId: "error-diffusion-checker-phase-v4-4" as const,
      dithering: "error-diffusion" as const,
      ditheringAmount: 35,
      errorDiffusionLineSuppression: 75,
      paletteSelections: [{ screenIndex: 0, enabledColorIds: [0, 1] }],
      pmd85: { ...DEFAULT_CONVERSION_SETTINGS.pmd85, mode: "pmd85-2-tv" as const },
    };
    const foreground = [
      { r: 255, g: 255, b: 255 },
      { r: 255, g: 0, b: 0 },
    ];
    const first = convertToPmd85(input, 1, 1, settings, foreground);
    const second = convertToPmd85(input, 1, 1, settings, foreground);
    expect(first).toEqual(second);
    expect(first.frames[0]?.encoded.length).toBeGreaterThan(0);
    expect(first.pixelMasks.length).toBeGreaterThan(0);
  });
});
