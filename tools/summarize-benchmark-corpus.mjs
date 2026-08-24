#!/usr/bin/env node

import { readFile } from "node:fs/promises";

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

function engineKey(row) {
  return [
    row.attributeOptimizerId ?? "—",
    row.qlMixedOptimizerId ?? "—",
    row.ditherEngineId,
    row.matrix ?? "—",
  ].join(" | ");
}

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error("Usage: pnpm benchmark:corpus <benchmark.json> [more.json ...]");
  process.exitCode = 2;
} else {
  const groups = new Map();
  for (const path of paths) {
    const document = JSON.parse(await readFile(path, "utf8"));
    if (document.schemaVersion !== "1.0.0" || !Array.isArray(document.rows)) {
      throw new Error(`${path}: unsupported benchmark export`);
    }
    const bestRgb = Math.min(...document.rows.map((row) => row.score));
    for (const row of document.rows) {
      const key = engineKey(row);
      const group = groups.get(key) ?? [];
      group.push({
        rank: row.rank,
        rgbImprovementPercent: bestRgb === 0
          ? 0
          : (bestRgb - row.score) / bestRgb * 100,
        pareto: !row.dominated,
        elapsedMs: row.elapsedMs,
        digest: row.digest,
      });
      groups.set(key, group);
    }
  }
  const summary = [...groups.entries()].map(([engineId, samples]) => ({
    engineId,
    samples: samples.length,
    meanRank: samples.reduce((sum, sample) => sum + sample.rank, 0) / samples.length,
    medianRank: median(samples.map((sample) => sample.rank)),
    meanRgbImprovementPercent:
      samples.reduce((sum, sample) => sum + sample.rgbImprovementPercent, 0) /
      samples.length,
    medianRgbImprovementPercent: median(
      samples.map((sample) => sample.rgbImprovementPercent),
    ),
    worstRgbRegressionPercent: Math.max(
      0,
      ...samples.map((sample) => -sample.rgbImprovementPercent),
    ),
    paretoAppearances: samples.filter((sample) => sample.pareto).length,
    medianRuntimeMs: median(samples.map((sample) => sample.elapsedMs)),
    distinctOutputDigests: new Set(samples.map((sample) => sample.digest)).size,
  })).sort((left, right) =>
    left.medianRank - right.medianRank || left.engineId.localeCompare(right.engineId)
  );
  process.stdout.write(`${JSON.stringify({
    schemaVersion: "1.0.0",
    benchmarkFiles: paths.length,
    summary,
  }, null, 2)}\n`);
}
