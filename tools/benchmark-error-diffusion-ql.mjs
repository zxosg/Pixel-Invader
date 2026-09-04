#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { convertToQl, DEFAULT_CONVERSION_SETTINGS } from "../packages/conversion-core/dist/index.js";

const quick = process.argv.includes("--quick");
const outputDirectory = process.argv.find((argument, index) => index >= 2 && !argument.startsWith("--")) ?? "benchmark-results/error-diffusion-ql";
const allEngines = [
  "error-diffusion-phase-balanced-v3",
  "error-diffusion-phase-balanced-checker-v3-1",
  "error-diffusion-phase-balanced-checker-v3-2",
  "error-diffusion-checker-phase-v4",
  "error-diffusion-checker-phase-v4-3",
];
const engineFilter = process.argv.find((argument) => argument.startsWith("--engines="));
const engines = engineFilter === undefined
  ? allEngines
  : allEngines.filter((engine) => engineFilter.slice("--engines=".length).split(",").includes(engine));
if (engines.length === 0) throw new RangeError("No selected QL benchmark engines are registered.");
const modes = [
  ["mode8-plain-256x256", 256, 8],
  ["mode4-plain-512x256", 512, 4],
  ["mode8-mode4-mixed-512x256", 512, 4],
];
const amounts = quick ? [50, 100] : [25, 50, 75, 100];
const suppressions = quick ? [0, 50, 100] : [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const randomizations = quick ? [0] : [0, 50, 100];

function sourceFixture(width, height, kind) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = kind === "flat" ? 128 : kind === "horizontal-gradient" ? x * 255 / (width - 1) : x + y < (width + height) / 2 ? 64 : 192;
      const offset = (y * width + x) * 4;
      rgba[offset] = value;
      rgba[offset + 1] = value;
      rgba[offset + 2] = value;
      rgba[offset + 3] = 255;
    }
  }
  return rgba;
}

function metricPair(source, output) {
  const pixelCount = output.length / 4;
  const width = pixelCount === 512 * 256 ? 512 : 256;
  const height = pixelCount / width;
  const residual = new Float64Array(pixelCount);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    residual[pixel] = (((output[offset] ?? 0) - (source[offset] ?? 0)) * 77 +
      ((output[offset + 1] ?? 0) - (source[offset + 1] ?? 0)) * 150 +
      ((output[offset + 2] ?? 0) - (source[offset + 2] ?? 0)) * 29) / 256;
  }
  const runScore = (dx, dy) => {
    let score = 0;
    for (let y0 = 0; y0 < height; y0 += 1) for (let x0 = 0; x0 < width; x0 += 1) {
      let previous = 0;
      let run = 0;
      for (let x = x0, y = y0; x >= 0 && x < width && y >= 0 && y < height; x += dx, y += dy) {
        const value = residual[y * width + x] ?? 0;
        const sign = Math.abs(value) < 8 ? 0 : Math.sign(value);
        if (sign !== 0 && sign === previous) run += 1;
        else run = sign === 0 ? 0 : 1;
        if (run >= 4) score += run - 3;
        previous = sign;
      }
    }
    return score;
  };
  const toneDrift = residual.reduce((sum, value) => sum + value, 0) / pixelCount;
  const vertical = runScore(0, 1);
  const horizontal = runScore(1, 0);
  const diagonal = (runScore(1, 1) + runScore(-1, 1)) / 2;
  return {
    verticalRunScore: vertical,
    horizontalRunScore: horizontal,
    diagonalRunScore: diagonal,
    directionalAnisotropy: Math.abs(vertical - horizontal) / Math.max(1, vertical + horizontal),
    toneDrift,
  };
}

const rows = [];
for (const [modeId, width, paletteSize] of modes) {
  const source = sourceFixture(width, 256, "flat");
  const paletteSelections = modeId === "mode8-mode4-mixed-512x256"
    ? [
        { screenIndex: 0, enabledColorIds: [0, 1, 2, 3, 4, 5, 6, 7] },
        { screenIndex: 1, enabledColorIds: [0, 1, 2, 3] },
      ]
    : [{ screenIndex: 0, enabledColorIds: Array.from({ length: paletteSize }, (_, index) => index) }];
  for (const fixtureName of ["flat", "horizontal-gradient", "diagonal-edge"]) {
    const fixture = sourceFixture(width, 256, fixtureName);
    for (const engine of engines) for (const amount of amounts) for (const suppression of suppressions) for (const randomization of randomizations) {
      const settings = {
        ...DEFAULT_CONVERSION_SETTINGS,
        platformId: "sinclair-ql",
        profileId: "org.retroconverter.sinclair-ql.default",
        modeId,
        framing: "stretch",
        resampling: "nearest",
        paletteSelections,
        dithering: "error-diffusion",
        ditherEngineId: engine,
        ditheringAmount: amount,
        errorDiffusionLineSuppression: suppression,
        errorDiffusionRandomization: randomization,
      };
      const start = performance.now();
      const first = convertToQl(fixture, width, 256, settings, "draft");
      const elapsedMs = performance.now() - start;
      const second = convertToQl(fixture, width, 256, settings, "draft");
      const digestHash = createHash("sha256");
      const repeatHash = createHash("sha256");
      for (const frame of first.frames) digestHash.update(frame.encoded);
      for (const frame of second.frames) repeatHash.update(frame.encoded);
      const digest = digestHash.digest("hex");
      const repeatDigest = repeatHash.digest("hex");
      rows.push({ modeId, fixture: fixtureName, engine, amount, suppression, randomization, elapsedMs, deterministic: digest === repeatDigest, digest, ...metricPair(first.sourcePreviewRgba, first.mergedPreviewRgba) });
    }
  }
}
await mkdir(outputDirectory, { recursive: true });
await writeFile(`${outputDirectory}/results.json`, JSON.stringify({ schemaVersion: "1.0.0", rows }, null, 2));
const columns = Object.keys(rows[0] ?? {});
await writeFile(`${outputDirectory}/results.csv`, [columns.join(","), ...rows.map((row) => columns.map((column) => JSON.stringify(row[column] ?? "")).join(","))].join("\n") + "\n");
console.log(`Wrote ${rows.length} deterministic QL benchmark rows to ${outputDirectory}`);
