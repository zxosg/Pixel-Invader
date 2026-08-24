import type {
  AttributeOptimizerId,
  ConversionSettings,
  DitherEngineId,
  OrderedMatrixId,
  PlatformId,
  QlMixedOptimizerId,
  TargetModeId,
} from "@retro-converter/conversion-core";

export type BenchmarkGuidance =
  | "exact"
  | "smooth"
  | "edge-preserving"
  | "low-pattern"
  | "balanced"
  | "fast";

export interface TextureBenchmarkMetrics {
  readonly directionalAnisotropy: number;
  readonly straightRunPenalty: number;
  readonly lowFrequencyNoise: number;
  readonly localErrorClumping: number;
  readonly edgeDisplacement: number;
}

export interface CommonBenchmarkMetrics {
  readonly score: number;
  readonly lowPassScore: number;
  readonly edgeScore: number;
  readonly elapsedMs: number;
  readonly textureMetrics?: TextureBenchmarkMetrics;
}

export interface BenchmarkClassification {
  readonly guidance: BenchmarkGuidance | null;
  readonly dominated: boolean;
  readonly normalized: {
    readonly rgb: number;
    readonly lowPass: number;
    readonly edge: number;
    readonly runtime: number;
  };
}

export interface SerializableBenchmarkRow extends CommonBenchmarkMetrics {
  readonly rank: number;
  readonly attributeOptimizerId?: AttributeOptimizerId | undefined;
  readonly qlMixedOptimizerId?: QlMixedOptimizerId | undefined;
  readonly ditherEngineId: DitherEngineId;
  readonly matrix?: OrderedMatrixId | undefined;
  readonly platformScore: number;
  readonly attributeBoundaryScore?: number | undefined;
  readonly orderedPerturbationRms?: number | undefined;
  readonly outputPixelChangePercent?: number | undefined;
  readonly digest: string;
  readonly aliases: readonly string[];
  readonly guidance: BenchmarkGuidance | null;
  readonly dominated: boolean;
  readonly visualFavorite?: boolean;
}

export interface BenchmarkExportDocument {
  readonly schemaVersion: "1.0.0";
  readonly createdAt: string;
  readonly context: Readonly<Record<string, unknown>>;
  readonly rows: readonly SerializableBenchmarkRow[];
}

export const QL_MIXED_BENCHMARK_OPTIMIZERS = [
  "ql-mixed-average-v1",
  "ql-mixed-low-perception-v2",
  "ql-mixed-high-detail-v2",
  "ql-mixed-balanced-v2",
] as const satisfies readonly QlMixedOptimizerId[];

export function qlMixedOptimizersForBenchmark(
  platformId: PlatformId,
  modeId: TargetModeId,
  selected: QlMixedOptimizerId,
): readonly QlMixedOptimizerId[] {
  return platformId === "sinclair-ql" &&
      modeId === "mode8-mode4-mixed-512x256"
    ? QL_MIXED_BENCHMARK_OPTIMIZERS
    : [selected];
}

export function requiredExperimentalEnginesForBenchmark(
  platformId: PlatformId,
  modeId: TargetModeId,
): {
  readonly attributeOptimizerIds: readonly AttributeOptimizerId[];
  readonly ditherEngineIds: readonly DitherEngineId[];
} {
  return platformId === "zx-spectrum"
    ? {
        attributeOptimizerIds: modeId === "zx48-standard-256x192"
          ? ["zx-guide-reference-rgb-halo-v3"]
          : [],
        ditherEngineIds: ["ordered-coverage-normalized-v7"],
      }
    : platformId === "sinclair-ql" ? {
        attributeOptimizerIds: [],
        ditherEngineIds: ["ordered-coverage-normalized-v7"],
      }
    : {
        attributeOptimizerIds: [],
        ditherEngineIds: [],
      };
}

export function assertExperimentalBenchmarkCoverage(
  platformId: PlatformId,
  modeId: TargetModeId,
  optimizerIds: readonly AttributeOptimizerId[],
  ditherIds: readonly DitherEngineId[],
): void {
  const required = requiredExperimentalEnginesForBenchmark(platformId, modeId);
  const missing = [
    ...required.attributeOptimizerIds.filter((id) => !optimizerIds.includes(id)),
    ...required.ditherEngineIds.filter((id) => !ditherIds.includes(id)),
  ];
  if (missing.length > 0) {
    throw new Error(`BENCHMARK_EXPERIMENTAL_COVERAGE: ${missing.join(", ")}`);
  }
}

function isDominated(
  row: CommonBenchmarkMetrics,
  rows: readonly CommonBenchmarkMetrics[],
): boolean {
  return rows.some((candidate) =>
    candidate !== row &&
    candidate.score <= row.score &&
    candidate.lowPassScore <= row.lowPassScore &&
    candidate.edgeScore <= row.edgeScore &&
    (
      candidate.score < row.score ||
      candidate.lowPassScore < row.lowPassScore ||
      candidate.edgeScore < row.edgeScore
    )
  );
}

function previewDimensions(rgba: Uint8Array): readonly [number, number] {
  const pixelCount = rgba.length / 4;
  const width = pixelCount === 512 * 256
    ? 512
    : pixelCount === 288 * 256
      ? 288
      : 256;
  return [width, pixelCount / width];
}

/**
 * Deterministic, scale-independent diagnostics for diffusion texture. These
 * deliberately remain separate from the canonical RGB ranking.
 */
export function diffusionTextureMetrics(
  source: Uint8Array,
  output: Uint8Array,
): TextureBenchmarkMetrics {
  const [width, height] = previewDimensions(source);
  if (source.length !== output.length || height <= 0) {
    throw new RangeError("Texture benchmark previews must have matching dimensions.");
  }
  const residual = new Float64Array(width * height);
  for (let pixel = 0; pixel < residual.length; pixel += 1) {
    const offset = pixel * 4;
    residual[pixel] = (
      ((output[offset] ?? 0) - (source[offset] ?? 0)) * 77 +
      ((output[offset + 1] ?? 0) - (source[offset + 1] ?? 0)) * 150 +
      ((output[offset + 2] ?? 0) - (source[offset + 2] ?? 0)) * 29
    ) / 256;
  }
  let horizontalEnergy = 0;
  let verticalEnergy = 0;
  let edgeDisplacement = 0;
  const runPenalty = (step: number, starts: readonly number[], length: number) => {
    let penalty = 0;
    for (const start of starts) {
      let previousSign = 0;
      let run = 0;
      for (let position = 0; position < length; position += 1) {
        const value = residual[start + position * step] ?? 0;
        const sign = Math.abs(value) < 8 ? 0 : Math.sign(value);
        if (sign !== 0 && sign === previousSign) run += 1;
        else run = sign === 0 ? 0 : 1;
        if (run >= 4) penalty += run - 3;
        previousSign = sign;
      }
    }
    return penalty;
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (x + 1 < width) {
        horizontalEnergy += ((residual[index + 1] ?? 0) - (residual[index] ?? 0)) ** 2;
      }
      if (y + 1 < height) {
        verticalEnergy += ((residual[index + width] ?? 0) - (residual[index] ?? 0)) ** 2;
      }
      if (x + 1 < width && y + 1 < height) {
        const sourceOffset = index * 4;
        const rightOffset = sourceOffset + 4;
        const belowOffset = sourceOffset + width * 4;
        const sourceEdge = Math.abs((source[sourceOffset] ?? 0) - (source[rightOffset] ?? 0)) +
          Math.abs((source[sourceOffset] ?? 0) - (source[belowOffset] ?? 0));
        const outputEdge = Math.abs((output[sourceOffset] ?? 0) - (output[rightOffset] ?? 0)) +
          Math.abs((output[sourceOffset] ?? 0) - (output[belowOffset] ?? 0));
        edgeDisplacement += Math.abs(sourceEdge - outputEdge);
      }
    }
  }
  const horizontalStarts = Array.from({ length: height }, (_, y) => y * width);
  const verticalStarts = Array.from({ length: width }, (_, x) => x);
  const straightRunPenalty = runPenalty(1, horizontalStarts, width) +
    runPenalty(width, verticalStarts, height);
  let lowFrequencyNoise = 0;
  const localMagnitudes: number[] = [];
  for (let y = 0; y < height; y += 4) {
    for (let x = 0; x < width; x += 4) {
      let sum = 0;
      let magnitude = 0;
      let samples = 0;
      for (let dy = 0; dy < 4 && y + dy < height; dy += 1) {
        for (let dx = 0; dx < 4 && x + dx < width; dx += 1) {
          const value = residual[(y + dy) * width + x + dx] ?? 0;
          sum += value;
          magnitude += Math.abs(value);
          samples += 1;
        }
      }
      lowFrequencyNoise += (sum / samples) ** 2;
      localMagnitudes.push(magnitude / samples);
    }
  }
  const meanMagnitude = localMagnitudes.reduce((sum, value) => sum + value, 0) /
    Math.max(1, localMagnitudes.length);
  const localErrorClumping = localMagnitudes.reduce(
    (sum, value) => sum + (value - meanMagnitude) ** 2,
    0,
  ) / Math.max(1, localMagnitudes.length);
  return {
    directionalAnisotropy: Math.abs(horizontalEnergy - verticalEnergy) /
      Math.max(1, horizontalEnergy + verticalEnergy),
    straightRunPenalty,
    lowFrequencyNoise,
    localErrorClumping,
    edgeDisplacement,
  };
}

export function classifyBenchmarkRows<T extends CommonBenchmarkMetrics>(
  rows: readonly T[],
): readonly BenchmarkClassification[] {
  if (rows.length === 0) return [];
  const minimum = (value: (row: T) => number) =>
    Math.min(...rows.map(value));
  const minRgb = minimum((row) => row.score);
  const minLowPass = minimum((row) => row.lowPassScore);
  const minEdge = minimum((row) => row.edgeScore);
  const minRuntime = minimum((row) => row.elapsedMs);
  const textureRows = rows.filter((row) => row.textureMetrics !== undefined);
  const minPattern = textureRows.length === 0 ? Number.POSITIVE_INFINITY : Math.min(
    ...textureRows.map((row) =>
      (row.textureMetrics?.directionalAnisotropy ?? 0) +
      (row.textureMetrics?.straightRunPenalty ?? 0) / 1_000_000
    ),
  );
  const minEdgeDisplacement = textureRows.length === 0
    ? Number.POSITIVE_INFINITY
    : Math.min(...textureRows.map((row) => row.textureMetrics?.edgeDisplacement ?? 0));
  const safeRatio = (value: number, reference: number) =>
    reference === 0 ? (value === 0 ? 1 : Number.POSITIVE_INFINITY) : value / reference;
  return rows.map((row) => {
    const dominated = isDominated(row, rows);
    let guidance: BenchmarkGuidance | null = null;
    if (row.score === minRgb) guidance = "exact";
    else if (row.lowPassScore === minLowPass) guidance = "smooth";
    else if (row.textureMetrics?.edgeDisplacement === minEdgeDisplacement) guidance = "edge-preserving";
    else if (row.textureMetrics !== undefined &&
      row.textureMetrics.directionalAnisotropy +
        row.textureMetrics.straightRunPenalty / 1_000_000 === minPattern) guidance = "low-pattern";
    else if (row.elapsedMs === minRuntime && row.score <= minRgb * 1.1) guidance = "fast";
    else if (!dominated) guidance = "balanced";
    return {
      guidance,
      dominated,
      normalized: {
        rgb: safeRatio(row.score, minRgb),
        lowPass: safeRatio(row.lowPassScore, minLowPass),
        edge: safeRatio(row.edgeScore, minEdge),
        runtime: safeRatio(row.elapsedMs, minRuntime),
      },
    };
  });
}

export interface CorpusBenchmarkAggregate {
  readonly engineId: string;
  readonly samples: number;
  readonly meanRank: number;
  readonly medianRank: number;
  readonly meanRgbImprovementPercent: number;
  readonly medianRgbImprovementPercent: number;
  readonly worstRgbRegressionPercent: number;
  readonly paretoAppearances: number;
  readonly medianRuntimeMs: number;
}

export interface CorpusBenchmarkSample {
  readonly engineId: string;
  readonly rank: number;
  readonly rgbImprovementPercent: number;
  readonly pareto: boolean;
  readonly elapsedMs: number;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]!
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

export function aggregateCorpusBenchmarks(
  samples: readonly CorpusBenchmarkSample[],
): readonly CorpusBenchmarkAggregate[] {
  const grouped = new Map<string, CorpusBenchmarkSample[]>();
  for (const sample of samples) {
    const group = grouped.get(sample.engineId) ?? [];
    group.push(sample);
    grouped.set(sample.engineId, group);
  }
  return [...grouped.entries()].map(([engineId, group]) => ({
    engineId,
    samples: group.length,
    meanRank: group.reduce((sum, sample) => sum + sample.rank, 0) / group.length,
    medianRank: median(group.map((sample) => sample.rank)),
    meanRgbImprovementPercent:
      group.reduce((sum, sample) => sum + sample.rgbImprovementPercent, 0) /
      group.length,
    medianRgbImprovementPercent: median(
      group.map((sample) => sample.rgbImprovementPercent),
    ),
    worstRgbRegressionPercent: Math.max(
      0,
      ...group.map((sample) => -sample.rgbImprovementPercent),
    ),
    paretoAppearances: group.filter((sample) => sample.pareto).length,
    medianRuntimeMs: median(group.map((sample) => sample.elapsedMs)),
  })).sort((left, right) =>
    left.medianRank - right.medianRank || left.engineId.localeCompare(right.engineId)
  );
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function benchmarkExportJson(document: BenchmarkExportDocument): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(document, null, 2)}\n`);
}

export function benchmarkExportCsv(document: BenchmarkExportDocument): Uint8Array {
  const header = [
    "rank", "attributeOptimizerId", "qlMixedOptimizerId", "ditherEngineId",
    "matrix", "rgbError", "lowPass2x2", "edgeError", "platformScore",
    "runtimeMs", "attributeBoundaryError", "orderedPerturbationRms",
    "outputPixelChangePercent", "directionalAnisotropy", "straightRunPenalty",
    "lowFrequencyNoise", "localErrorClumping", "edgeDisplacement",
    "visualFavorite",
    "guidance", "dominated", "digest", "aliases",
  ];
  const lines = [header.join(",")];
  for (const row of document.rows) {
    lines.push([
      row.rank,
      row.attributeOptimizerId,
      row.qlMixedOptimizerId,
      row.ditherEngineId,
      row.matrix,
      row.score,
      row.lowPassScore,
      row.edgeScore,
      row.platformScore,
      row.elapsedMs,
      row.attributeBoundaryScore,
      row.orderedPerturbationRms,
      row.outputPixelChangePercent,
      row.textureMetrics?.directionalAnisotropy,
      row.textureMetrics?.straightRunPenalty,
      row.textureMetrics?.lowFrequencyNoise,
      row.textureMetrics?.localErrorClumping,
      row.textureMetrics?.edgeDisplacement,
      row.visualFavorite ?? false,
      row.guidance,
      row.dominated,
      row.digest,
      row.aliases.join(" | "),
    ].map(csvCell).join(","));
  }
  return new TextEncoder().encode(`${lines.join("\n")}\n`);
}

export function benchmarkCacheKey(
  sourceSha256: string | null,
  settings: ConversionSettings,
  retainedDitheringAmount: number | string = settings.ditheringAmount,
  profileContentSha256?: string,
): string {
  const {
    attributeOptimizerId: _attributeOptimizerId,
    ditherEngineId: _ditherEngineId,
    qlMixedOptimizerId: _qlMixedOptimizerId,
    dithering: _dithering,
    ditheringAmount: _ditheringAmount,
    orderedMatrix: _orderedMatrix,
    structured: _structured,
    ...sharedBenchmarkSettings
  } = settings;
  return JSON.stringify({
    sourceSha256,
    retainedDitheringAmount,
    profileContentSha256,
    settings: sharedBenchmarkSettings,
  });
}
