#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { convertToZx, DEFAULT_CONVERSION_SETTINGS } from "../packages/conversion-core/dist/index.js";

const width = 256;
const height = 192;
const quick = process.argv.includes("--quick");
const outputDirectory = process.argv.find((argument, index) => index >= 2 && !argument.startsWith("--")) ?? "benchmark-results/error-diffusion";
const allEngines = [
  "error-diffusion-phase-balanced-v3",
  "error-diffusion-phase-balanced-checker-v3-1",
  "error-diffusion-phase-balanced-checker-v3-2",
  "error-diffusion-checker-phase-v4",
  "error-diffusion-checker-phase-v4-1",
  "error-diffusion-checker-phase-v4-2",
  "error-diffusion-checker-phase-v4-3",
];
const engineFilter = process.argv.find((argument) => argument.startsWith("--engines="));
const engines = engineFilter === undefined
  ? allEngines
  : allEngines.filter((engine) => engineFilter.slice("--engines=".length).split(",").includes(engine));
if (engines.length === 0) throw new RangeError("No selected ZX benchmark engines are registered.");
const amounts = quick ? [50, 100] : [25, 50, 75, 100];
const suppressions = quick ? [0, 50, 100] : [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const randomizations = quick ? [0] : [0, 25, 50, 75, 100];
const fixtureNames = quick
  ? ["flat", "horizontal-gradient", "vertical-edge"]
  : ["flat", "horizontal-gradient", "vertical-gradient", "diagonal-gradient", "vertical-edge", "horizontal-edge", "diagonal-edge"];

function fixture(name) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let value = 128;
      if (name === "horizontal-gradient") value = x;
      else if (name === "vertical-gradient") value = y * 255 / (height - 1);
      else if (name === "diagonal-gradient") value = (x + y) * 255 / (width + height - 2);
      else if (name === "vertical-edge") value = x < width / 2 ? 64 : 192;
      else if (name === "horizontal-edge") value = y < height / 2 ? 64 : 192;
      else if (name === "diagonal-edge") value = x + y < (width + height) / 2 ? 64 : 192;
      const offset = (y * width + x) * 4;
      rgba[offset] = value;
      rgba[offset + 1] = value;
      rgba[offset + 2] = value;
      rgba[offset + 3] = 255;
    }
  }
  return rgba;
}

function metrics(source, output, screenPixels, attributes, attributeHeight) {
  const residual = new Float64Array(width * height);
  for (let pixel = 0; pixel < residual.length; pixel += 1) {
    const offset = pixel * 4;
    residual[pixel] = (((output[offset] ?? 0) - (source[offset] ?? 0)) * 77 +
      ((output[offset + 1] ?? 0) - (source[offset + 1] ?? 0)) * 150 +
      ((output[offset + 2] ?? 0) - (source[offset + 2] ?? 0)) * 29) / 256;
  }
  const directionEnergy = (dx, dy) => {
    let total = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const index = y * width + x;
        total += Math.abs((residual[ny * width + nx] ?? 0) - (residual[index] ?? 0));
      }
    }
    return total;
  };
  const runScore = (dx, dy) => {
    let score = 0;
    const starts = [];
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) starts.push([x, y]);
    for (const [startX, startY] of starts) {
      let previous = 0;
      let run = 0;
      for (let x = startX, y = startY; x >= 0 && x < width && y >= 0 && y < height; x += dx, y += dy) {
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
  const vertical = runScore(0, 1);
  const horizontal = runScore(1, 0);
  const diagonal = (runScore(1, 1) + runScore(-1, 1)) / 2;
  const horizontalEnergy = directionEnergy(1, 0);
  const verticalEnergy = directionEnergy(0, 1);
  const toneDrift = residual.reduce((sum, value) => sum + value, 0) / residual.length;
  let pairCheckerBlocks = 0;
  let pairIntermediateBlocks = 0;
  let phaseConsistentBlocks = 0;
  let twoByOneArtifacts = 0;
  if (screenPixels && attributes) {
    const cellHeight = attributeHeight ?? 8;
    for (let y = 0; y + 1 < height; y += 2) {
      for (let x = 0; x + 1 < width; x += 2) {
        if (
          Math.floor((y + 1) / cellHeight) !== Math.floor(y / cellHeight) ||
          Math.floor((x + 1) / 8) !== Math.floor(x / 8)
        ) continue;
        const bits = [
          screenPixels[y * width + x] ?? 0,
          screenPixels[y * width + x + 1] ?? 0,
          screenPixels[(y + 1) * width + x] ?? 0,
          screenPixels[(y + 1) * width + x + 1] ?? 0,
        ];
        const coverage = bits.reduce((sum, bit) => sum + bit, 0);
        if (coverage === 2) {
          pairIntermediateBlocks += 1;
          if (
            bits[0] === bits[1] && bits[2] === bits[3] ||
            bits[0] === bits[2] && bits[1] === bits[3]
          ) twoByOneArtifacts += 1;
          if (bits[0] === bits[3] && bits[1] === bits[2] && bits[0] !== bits[1]) {
            pairCheckerBlocks += 1;
            if (bits[0] === (((x + y) & 1) ^ 1)) phaseConsistentBlocks += 1;
          }
        }
      }
    }
  }
  return {
    verticalRunScore: vertical,
    horizontalRunScore: horizontal,
    diagonalRunScore: diagonal,
    directionalAnisotropy: Math.abs(horizontalEnergy - verticalEnergy) /
      Math.max(1, horizontalEnergy + verticalEnergy),
    toneDrift,
    checkerOccupancy: (() => {
      let count = 0;
      for (let y = 0; y < height - 1; y += 1) for (let x = 0; x < width - 1; x += 1) {
        const a = output[(y * width + x) * 4] > 100;
        const b = output[(y * width + x + 1) * 4] > 100;
        const c = output[((y + 1) * width + x) * 4] > 100;
        const d = output[((y + 1) * width + x + 1) * 4] > 100;
        if (a === d && b === c && a !== b) count += 1;
      }
      return count / ((width - 1) * (height - 1));
    })(),
    pairCheckerOccupancy: pairIntermediateBlocks === 0
      ? 0
      : pairCheckerBlocks / pairIntermediateBlocks,
    pairPhaseConsistency: pairCheckerBlocks === 0
      ? 0
      : phaseConsistentBlocks / pairCheckerBlocks,
    twoByOneArtifacts,
  };
}

const rows = [];
for (const fixtureName of fixtureNames) {
  const source = fixture(fixtureName);
  for (const engine of engines) {
    for (const amount of amounts) {
      for (const suppression of suppressions) {
        for (const randomization of randomizations) {
          const settings = {
            ...DEFAULT_CONVERSION_SETTINGS,
            framing: "stretch",
            resampling: "nearest",
            dithering: "error-diffusion",
            ditheringAmount: amount,
            errorDiffusionLineSuppression: suppression,
            errorDiffusionRandomization: randomization,
            ditherEngineId: engine,
            attributeOptimizerId: "zx-guide-reference-halo-v1",
          };
          const start = performance.now();
          const first = convertToZx(source, width, height, settings, "draft");
          const elapsedMs = performance.now() - start;
          const second = convertToZx(source, width, height, settings, "draft");
          const digest = createHash("sha256").update(first.screen.pixels).update(first.screen.attributes).digest("hex");
          const checkerDiagnostics = first.checkerPlacementDiagnostics;
          rows.push({ fixture: fixtureName, engine, amount, suppression, randomization, elapsedMs, deterministic: digest === createHash("sha256").update(second.screen.pixels).update(second.screen.attributes).digest("hex"), digest, ...metrics(source, first.previewRgba, first.screen.pixels, first.screen.attributes, first.attributeHeight), checkerPlacementChangedPixels: checkerDiagnostics?.changedPixels ?? 0, checkerPlacementChangedBlocks: checkerDiagnostics?.changedBlocks ?? 0, checkerPlacementEligibleBlocks: checkerDiagnostics?.eligibleBlocks ?? 0, checkerPlacementIntermediateBlocks: checkerDiagnostics?.intermediateCoverageBlocks ?? 0, checkerPlacementCheckerCandidates: checkerDiagnostics?.checkerCandidateCount ?? 0, checkerPlacementAcceptedCheckerBlocks: checkerDiagnostics?.acceptedCheckerBlocks ?? 0 });
        }
      }
    }
  }
}
await mkdir(outputDirectory, { recursive: true });
await writeFile(`${outputDirectory}/results.json`, JSON.stringify({ schemaVersion: "1.0.0", width, height, rows }, null, 2));
const columns = Object.keys(rows[0] ?? {});
const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => JSON.stringify(row[column] ?? "")).join(","))].join("\n") + "\n";
await writeFile(`${outputDirectory}/results.csv`, csv);
console.log(`Wrote ${rows.length} deterministic benchmark rows to ${outputDirectory}`);
