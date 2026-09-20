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
  "error-diffusion-phase-balanced-checker-v3-3",
  "error-diffusion-checker-phase-v4",
  "error-diffusion-checker-phase-v4-5",
  "error-diffusion-checker-phase-v4-3",
  "error-diffusion-checker-phase-v4-4",
];
const engineFilter = process.argv.find((argument) => argument.startsWith("--engines="));
const engines = engineFilter === undefined
  ? allEngines
  : allEngines.filter((engine) => engineFilter.slice("--engines=".length).split(",").includes(engine));
if (engines.length === 0) throw new RangeError("No selected QL benchmark engines are registered.");
const modes = [
  ["mode8-256x256", 256, 8],
  ["mode4-512x256", 512, 4],
  ["mode8-mode4-mixed-512x256", 512, 4],
];
const amounts = quick ? [35, 100] : [23, 35, 50, 100];
const suppressions = [0, 25, 50, 75, 100];
const randomizations = [0];

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

function paletteSelectionsFor(modeId, paletteSize) {
  if (modeId === "mode8-mode4-mixed-512x256") {
    return [
      { screenIndex: 0, enabledColorIds: [0, 1, 2, 3, 4, 5, 6, 7] },
      { screenIndex: 1, enabledColorIds: [0, 1, 2, 3] },
    ];
  }
  return [
    { screenIndex: 0, enabledColorIds: Array.from({ length: paletteSize }, (_, index) => index) },
    { screenIndex: 1, enabledColorIds: Array.from({ length: paletteSize }, (_, index) => index) },
  ];
}

function metricPair(source, output, frame) {
  const pixelCount = output.length / 4;
  const width = source.length / 4 / 256;
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
  let clumpedNeighbors = 0;
  let neighborPairs = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = y * width + x;
    for (const [dx, dy] of [[1, 0], [0, 1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= width || ny >= height) continue;
      const left = residual[index] ?? 0;
      const right = residual[ny * width + nx] ?? 0;
      if (Math.abs(left) < 8 || Math.abs(right) < 8) continue;
      neighborPairs += 1;
      if (Math.sign(left) === Math.sign(right)) clumpedNeighbors += 1;
    }
  }
  const vertical = runScore(0, 1);
  const horizontal = runScore(1, 0);
  const diagonal = (runScore(1, 1) + runScore(-1, 1)) / 2;
  let edgeDisplacement = 0;
  let edgePixels = 0;
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const index = y * width + x;
    const sourceValue = source[index * 4] ?? 0;
    const sourceGradient = Math.abs(
      (source[Math.min(width - 1, x + 1) * 4 + y * width * 4] ?? sourceValue) -
      (source[Math.max(0, x - 1) * 4 + y * width * 4] ?? sourceValue),
    ) + Math.abs(
      (source[Math.min(height - 1, y + 1) * width * 4 + x * 4] ?? sourceValue) -
      (source[Math.max(0, y - 1) * width * 4 + x * 4] ?? sourceValue),
    );
    if (sourceGradient < 48) continue;
    edgePixels += 1;
    edgeDisplacement += Math.abs(residual[index] ?? 0);
  }
  let checkerBlocks = 0;
  let checkerPhaseMatches = 0;
  let intermediateBlocks = 0;
  let twoByOneArtifacts = 0;
  for (let y = 0; y + 1 < height; y += 1) for (let x = 0; x + 1 < width; x += 1) {
    const bits = [
      output[(y * width + x) * 4] > 128 ? 1 : 0,
      output[(y * width + x + 1) * 4] > 128 ? 1 : 0,
      output[((y + 1) * width + x) * 4] > 128 ? 1 : 0,
      output[((y + 1) * width + x + 1) * 4] > 128 ? 1 : 0,
    ];
    if (bits.reduce((sum, bit) => sum + bit, 0) !== 2) continue;
    intermediateBlocks += 1;
    if (bits[0] === bits[3] && bits[1] === bits[2] && bits[0] !== bits[1]) {
      checkerBlocks += 1;
      if (bits[0] === (((x + y) & 1) ^ 1)) checkerPhaseMatches += 1;
    } else if (
      (bits[0] === bits[1] && bits[2] === bits[3]) ||
      (bits[0] === bits[2] && bits[1] === bits[3])
    ) {
      twoByOneArtifacts += 1;
    }
  }
  let pairCheckerBlocks = 0;
  let pairPhaseMatches = 0;
  let pairBlockCount = 0;
  if (frame !== undefined) {
    const frameWidth = frame.length / height;
    pairBlockCount = Math.max(0, (frameWidth - 1) * (height - 1));
    for (let y = 0; y + 1 < height; y += 1) for (let x = 0; x + 1 < frameWidth; x += 1) {
      const values = [
        frame[y * frameWidth + x] ?? 0,
        frame[y * frameWidth + x + 1] ?? 0,
        frame[(y + 1) * frameWidth + x] ?? 0,
        frame[(y + 1) * frameWidth + x + 1] ?? 0,
      ];
      const firstCount = values.filter((value) => value === values[0]).length;
      const bits = values.map((value) => value === values[0] ? 0 : 1);
      if (firstCount === 2 && bits[0] === bits[3] && bits[1] === bits[2] && bits[0] !== bits[1]) {
        pairCheckerBlocks += 1;
        if (bits[0] === (((x + y) & 1) ^ 1)) pairPhaseMatches += 1;
      }
    }
  }
  return {
    verticalRunScore: vertical,
    horizontalRunScore: horizontal,
    diagonalRunScore: diagonal,
    directionalAnisotropy: Math.abs(vertical - horizontal) / Math.max(1, vertical + horizontal),
    toneDrift,
    toneVariance: residual.reduce((sum, value) => sum + (value - toneDrift) ** 2, 0) / pixelCount,
    localErrorClumping: neighborPairs === 0 ? 0 : clumpedNeighbors / neighborPairs,
    edgeDisplacement: edgePixels === 0 ? 0 : edgeDisplacement / edgePixels,
    checkerOccupancy: intermediateBlocks === 0 ? 0 : checkerBlocks / intermediateBlocks,
    checkerPhaseConsistency: checkerBlocks === 0 ? 0 : checkerPhaseMatches / checkerBlocks,
    pairCheckerOccupancy: pairCheckerBlocks / Math.max(1, pairBlockCount),
    pairCheckerPhaseConsistency: pairCheckerBlocks === 0 ? 0 : pairPhaseMatches / pairCheckerBlocks,
    twoByOneArtifacts,
  };
}

const rows = [];
for (const [modeId, width, paletteSize] of modes) {
  const paletteSelections = paletteSelectionsFor(modeId, paletteSize);
  for (const fixtureName of ["flat", "horizontal-gradient", "vertical-gradient", "diagonal-edge"]) {
    const source = sourceFixture(width, 256, fixtureName);
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
      const first = convertToQl(source, width, 256, settings, "draft");
      const elapsedMs = performance.now() - start;
      const second = convertToQl(source, width, 256, settings, "draft");
      const digestHash = createHash("sha256");
      const repeatHash = createHash("sha256");
      for (const frame of first.frames) digestHash.update(frame.encoded);
      for (const frame of second.frames) repeatHash.update(frame.encoded);
      const digest = digestHash.digest("hex");
      const repeatDigest = repeatHash.digest("hex");
      const paletteIndexFrame = first.frames[0]?.paletteIndices;
      rows.push({
        modeId,
        fixture: fixtureName,
        engine,
        amount,
        suppression,
        randomization,
        elapsedMs,
        deterministic: digest === repeatDigest,
        digest,
        frameCount: first.frames.length,
        serializationValidity: first.frames.every((frame) => frame.encoded.length > 0),
        frameSwapPixels: first.frames.length < 2 ||
          paletteIndexFrame === undefined ||
          first.frames[1].paletteIndices.length !== paletteIndexFrame.length
          ? 0
          : first.frames[1].paletteIndices.reduce(
              (count, value, index) => count + (value !== paletteIndexFrame[index] ? 1 : 0),
              0,
            ),
        ...metricPair(first.sourcePreviewRgba, first.mergedPreviewRgba, paletteIndexFrame),
        deterministicHash: digest,
      });
    }
  }
}
await mkdir(outputDirectory, { recursive: true });
await writeFile(`${outputDirectory}/results.json`, JSON.stringify({ schemaVersion: "1.0.0", rows }, null, 2));
const columns = Object.keys(rows[0] ?? {});
await writeFile(`${outputDirectory}/results.csv`, [columns.join(","), ...rows.map((row) => columns.map((column) => JSON.stringify(row[column] ?? "")).join(","))].join("\n") + "\n");
console.log(`Wrote ${rows.length} deterministic QL benchmark rows to ${outputDirectory}`);
