import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONVERSION_SETTINGS,
  type ConversionSettings,
} from "@retro-converter/conversion-core";
import {
  aggregateCorpusBenchmarks,
  assertExperimentalBenchmarkCoverage,
  benchmarkExportCsv,
  benchmarkExportJson,
  benchmarkCacheKey,
  classifyBenchmarkRows,
  diffusionTextureMetrics,
  qlMixedOptimizersForBenchmark,
} from "./benchmark.js";

function settings(
  overrides: Partial<ConversionSettings> = {},
): ConversionSettings {
  return { ...DEFAULT_CONVERSION_SETTINGS, ...overrides };
}

describe("benchmark cache identity", () => {
  it("does not invalidate when selecting another benchmark axis", () => {
    const baseline = benchmarkCacheKey("source-a", settings());
    const selectedRow = benchmarkCacheKey("source-a", settings({
      attributeOptimizerId: "zx-guide-reference-halo-v1",
      ditherEngineId: "ordered-unrestricted-v2",
      qlMixedOptimizerId: "ql-mixed-low-perception-v2",
      dithering: "ordered",
      orderedMatrix: "bayer-8x8",
      structured: {
        ...DEFAULT_CONVERSION_SETTINGS.structured,
        ditherResponseCurveId: "power-035-percent-v2",
        colorAnchorModelId: "srgb-squared-v1",
        structuralModelId: "palette-topology-v1",
      },
    }));
    expect(selectedRow).toBe(baseline);
  });

  it("expands all four optimizers only for heterogeneous QL mixed mode", () => {
    expect(qlMixedOptimizersForBenchmark(
      "sinclair-ql",
      "mode8-mode4-mixed-512x256",
      "ql-mixed-balanced-v2",
    )).toEqual([
      "ql-mixed-average-v1",
      "ql-mixed-low-perception-v2",
      "ql-mixed-high-detail-v2",
      "ql-mixed-balanced-v2",
    ]);
    expect(qlMixedOptimizersForBenchmark(
      "sinclair-ql",
      "mode8-256x256",
      "ql-mixed-balanced-v2",
    )).toEqual(["ql-mixed-balanced-v2"]);
  });

  it("invalidates immediately when the retained amount entry becomes invalid", () => {
    expect(benchmarkCacheKey("source-a", settings(), "34"))
      .not.toBe(benchmarkCacheKey("source-a", settings(), ""));
  });

  it.each([
    ["source", "source-b", settings()],
    ["brightness", "source-a", settings({ brightness: 1 })],
    ["dither amount", "source-a", settings({ ditheringAmount: 34 })],
    ["randomization", "source-a", settings({ errorDiffusionRandomization: 25 })],
    ["palette", "source-a", settings({
      paletteSelections: [{
        screenIndex: 0,
        enabledColorIds: [0, 2, 6],
        brightMode: "auto",
      }],
    })],
    ["mode", "source-a", settings({
      platformId: "sinclair-ql",
      modeId: "mode8-256x256",
    })],
  ])("invalidates after a %s change", (_label, source, changed) => {
    expect(benchmarkCacheKey(source, changed))
      .not.toBe(benchmarkCacheKey("source-a", settings()));
  });
});

describe("benchmark interpretation", () => {
  it("detects directional residual patterns independently from RGB ranking", () => {
    const source = new Uint8Array(256 * 8 * 4);
    const vertical = new Uint8Array(source.length);
    const isotropic = new Uint8Array(source.length);
    for (let pixel = 0; pixel < 256 * 8; pixel += 1) {
      const x = pixel % 256;
      const y = Math.floor(pixel / 256);
      const verticalValue = x % 4 < 2 ? 255 : 0;
      const isotropicValue = ((x * 17 + y * 31) & 1) === 0 ? 255 : 0;
      for (let channel = 0; channel < 3; channel += 1) {
        vertical[pixel * 4 + channel] = verticalValue;
        isotropic[pixel * 4 + channel] = isotropicValue;
      }
      vertical[pixel * 4 + 3] = 255;
      isotropic[pixel * 4 + 3] = 255;
    }
    const verticalMetrics = diffusionTextureMetrics(source, vertical);
    const isotropicMetrics = diffusionTextureMetrics(source, isotropic);
    expect(verticalMetrics.directionalAnisotropy)
      .toBeGreaterThan(isotropicMetrics.directionalAnisotropy);
    expect(verticalMetrics.straightRunPenalty).toBeGreaterThan(0);
  });

  it("labels exact, smooth, and balanced Pareto results without a hidden score", () => {
    const classifications = classifyBenchmarkRows([
      { score: 10, lowPassScore: 30, edgeScore: 10, elapsedMs: 20 },
      { score: 12, lowPassScore: 10, edgeScore: 30, elapsedMs: 30 },
      { score: 11, lowPassScore: 20, edgeScore: 20, elapsedMs: 25 },
      { score: 20, lowPassScore: 40, edgeScore: 40, elapsedMs: 10 },
    ]);
    expect(classifications.map((value) => value.guidance)).toEqual([
      "exact", "smooth", "balanced", null,
    ]);
    expect(classifications[3]?.dominated).toBe(true);
    expect(classifications[0]?.normalized.rgb).toBe(1);
  });

  it("requires the new experimental engines in compatible benchmark contexts", () => {
    expect(() => assertExperimentalBenchmarkCoverage(
      "zx-spectrum",
      "zx48-standard-256x192",
      ["zx-guide-reference-rgb-halo-v3"],
      ["ordered-coverage-normalized-v7"],
    )).not.toThrow();
    expect(() => assertExperimentalBenchmarkCoverage(
      "zx-spectrum",
      "zx48-standard-256x192",
      [],
      [],
    )).toThrow(/rgb-halo-v3.*normalized-v7/);
  });

  it("aggregates repeatable corpus results by engine", () => {
    expect(aggregateCorpusBenchmarks([
      { engineId: "a", rank: 1, rgbImprovementPercent: 2, pareto: true, elapsedMs: 20 },
      { engineId: "a", rank: 3, rgbImprovementPercent: -1, pareto: false, elapsedMs: 40 },
      { engineId: "b", rank: 2, rgbImprovementPercent: 0, pareto: true, elapsedMs: 10 },
    ])[0]).toMatchObject({
      engineId: "a",
      samples: 2,
      medianRank: 2,
      meanRgbImprovementPercent: 0.5,
      worstRgbRegressionPercent: 1,
      paretoAppearances: 1,
      medianRuntimeMs: 30,
    });
  });

  it("exports portable JSON and CSV benchmark documents", () => {
    const document = {
      schemaVersion: "1.0.0" as const,
      createdAt: "2026-01-01T00:00:00.000Z",
      context: { platformId: "zx-spectrum" },
      rows: [{
        rank: 1,
        attributeOptimizerId: "zx-source-cell-v1" as const,
        ditherEngineId: "none-discrete-v2" as const,
        score: 10,
        lowPassScore: 5,
        edgeScore: 6,
        elapsedMs: 2,
        platformScore: 10,
        digest: "abc",
        aliases: ["alias,one"],
        guidance: "exact" as const,
        dominated: false,
      }],
    };
    expect(new TextDecoder().decode(benchmarkExportJson(document)))
      .toContain('"guidance": "exact"');
    expect(new TextDecoder().decode(benchmarkExportCsv(document)))
      .toContain('"alias,one"');
  });
});
