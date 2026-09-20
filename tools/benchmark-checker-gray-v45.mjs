#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { decodeImage, encodeRgbaPng } from "../packages/image-codecs/dist/index.js";
import {
  renderGrayscaleCarrierReference,
  renderGrayscaleCheckerPhaseV44,
  renderGrayscaleCheckerPhaseV45,
  renderGrayscaleCheckerPhaseV451,
  renderGrayscaleDiffusionReference,
} from "../packages/conversion-core/dist/index.js";

const quick = process.argv.includes("--quick");
const outputDirectory = process.argv.find((argument, index) => index >= 2 && !argument.startsWith("--")) ??
  "benchmark-results/checker-gray-v45";
const imageArgument = process.argv.find((argument) => argument.startsWith("--image="));
const width = 128;
const height = 96;
const amounts = quick ? [35, 100] : [23, 35, 50, 100];
const suppressions = quick ? [0, 50, 75, 100] : [0, 25, 50, 75, 100];
const randomizations = [0];

function fixtureSource(kind, fixtureWidth = width, fixtureHeight = height) {
  const source = new Uint8Array(fixtureWidth * fixtureHeight * 4);
  for (let y = 0; y < fixtureHeight; y += 1) for (let x = 0; x < fixtureWidth; x += 1) {
    let value = 128;
    if (kind === "flat-25") value = 137;
    else if (kind === "flat-50") value = 188;
    else if (kind === "flat-75") value = 225;
    else if (kind === "horizontal-gradient") value = Math.round(x * 255 / Math.max(1, fixtureWidth - 1));
    else if (kind === "vertical-gradient") value = Math.round(y * 255 / Math.max(1, fixtureHeight - 1));
    else if (kind === "diagonal-gradient") value = Math.round((x + y) * 255 / Math.max(1, fixtureWidth + fixtureHeight - 2));
    else if (kind === "vertical-edge") value = x < fixtureWidth / 2 ? 48 : 208;
    else if (kind === "horizontal-edge") value = y < fixtureHeight / 2 ? 48 : 208;
    else if (kind === "diagonal-silhouette") value = x + y < (fixtureWidth + fixtureHeight) / 2 ? 215 : 35;
    else if (kind === "sky-like") {
      value = Math.round(115 + 70 * (1 - y / Math.max(1, fixtureHeight - 1)) + 14 * Math.sin(x / 17));
      if (y > fixtureHeight * 0.72 && x > fixtureWidth * 0.18 && x < fixtureWidth * 0.82) value = Math.min(value, 82);
    } else if (kind === "cityscape-sunset") {
      const sky = 42 + 150 * (1 - y / Math.max(1, fixtureHeight - 1));
      const sun = Math.max(0, 65 - Math.hypot(x - fixtureWidth * 0.69, y - fixtureHeight * 0.39) * 2.2);
      value = Math.round(Math.min(255, sky + sun));
      if (y > fixtureHeight * 0.7) value = Math.min(value, 42 + ((x * 13) % 24));
      if ((x > fixtureWidth * 0.13 && x < fixtureWidth * 0.24 && y > fixtureHeight * 0.5) ||
          (x > fixtureWidth * 0.43 && x < fixtureWidth * 0.53 && y > fixtureHeight * 0.4) ||
          (x > fixtureWidth * 0.79 && x < fixtureWidth * 0.91 && y > fixtureHeight * 0.58)) value = 18;
    }
    const offset = (y * fixtureWidth + x) * 4;
    source[offset] = value;
    source[offset + 1] = value;
    source[offset + 2] = value;
    source[offset + 3] = 255;
  }
  return source;
}

const fixtures = [
  "flat-25", "flat-50", "flat-75", "horizontal-gradient", "vertical-gradient",
  "diagonal-gradient", "vertical-edge", "horizontal-edge", "diagonal-silhouette",
  "sky-like", "cityscape-sunset",
].map((id) => ({ id, width, height, rgba: fixtureSource(id) }));
if (imageArgument !== undefined) {
  const decoded = decodeImage(new Uint8Array(await readFile(imageArgument.slice("--image=".length))));
  fixtures.push({ id: "supplied-image", width: decoded.width, height: decoded.height, rgba: decoded.rgba });
}

const engines = [
  { id: "v3", label: "neutral v3" },
  { id: "v4", label: "neutral v4" },
  { id: "v4.4", label: "checker carrier v4.4" },
  { id: "checker-a", label: "checker phase A" },
  { id: "checker-b", label: "checker phase B" },
  { id: "dispersed-4x4", label: "dispersed Bayer 4×4" },
  { id: "diagonal", label: "diagonal benchmark carrier" },
  { id: "v4.5", label: "adaptive carrier v4.5" },
  { id: "v4.5.1", label: "stable checker carrier v4.5.1" },
];

function render(engine, fixture, options) {
  if (engine === "v3" || engine === "v4") {
    return renderGrayscaleDiffusionReference(
      fixture.rgba, fixture.width, fixture.height, options, engine,
    );
  }
  if (engine === "v4.4") return renderGrayscaleCheckerPhaseV44(fixture.rgba, fixture.width, fixture.height, options);
  if (engine === "v4.5") return renderGrayscaleCheckerPhaseV45(fixture.rgba, fixture.width, fixture.height, options);
  if (engine === "v4.5.1") return renderGrayscaleCheckerPhaseV451(fixture.rgba, fixture.width, fixture.height, options);
  return renderGrayscaleCarrierReference(
    fixture.rgba, fixture.width, fixture.height, options, engine,
  );
}

function digest(result) {
  return createHash("sha256")
    .update(result.bits)
    .update(new Uint8Array(result.guide.buffer))
    .digest("hex");
}

function preview(result, fixture) {
  const rgba = new Uint8Array(fixture.width * fixture.height * 4);
  for (let index = 0; index < result.bits.length; index += 1) {
    const value = result.bits[index] === 1 ? 255 : 0;
    const offset = index * 4;
    rgba[offset] = value;
    rgba[offset + 1] = value;
    rgba[offset + 2] = value;
    rgba[offset + 3] = 255;
  }
  return rgba;
}

function structuralMetrics(result, baseline, fixture) {
  let changedPixels = 0;
  for (let index = 0; index < result.bits.length; index += 1) {
    if (result.bits[index] !== baseline.bits[index]) changedPixels += 1;
  }
  let edgeDisplacement = 0;
  let edgePixels = 0;
  for (let y = 0; y < fixture.height; y += 1) for (let x = 0; x < fixture.width; x += 1) {
    const index = y * fixture.width + x;
    const source = fixture.rgba[index * 4] ?? 0;
    const right = fixture.rgba[(y * fixture.width + Math.min(fixture.width - 1, x + 1)) * 4] ?? source;
    const down = fixture.rgba[(Math.min(fixture.height - 1, y + 1) * fixture.width + x) * 4] ?? source;
    if (Math.abs(source - right) + Math.abs(source - down) < 48) continue;
    edgePixels += 1;
    edgeDisplacement += Math.abs((result.bits[index] ?? 0) - (baseline.bits[index] ?? 0));
  }
  return {
    changedPixels,
    changedPixelPercentage: changedPixels / Math.max(1, result.bits.length),
    edgeDisplacement: edgePixels === 0 ? 0 : edgeDisplacement / edgePixels,
  };
}

const rows = [];
for (const fixture of fixtures) {
  for (const amount of amounts) for (const suppression of suppressions) for (const randomization of randomizations) {
    const options = { ditheringAmount: amount, lineSuppression: suppression, randomization };
    const baseline = render("v3", fixture, options);
    for (const engine of engines) {
      const start = performance.now();
      const first = render(engine.id, fixture, options);
      const runtimeMs = performance.now() - start;
      const second = render(engine.id, fixture, options);
      const firstHash = digest(first);
      const secondHash = digest(second);
      const metrics = structuralMetrics(first, baseline, fixture);
      rows.push({
        fixture: fixture.id,
        engine: engine.id,
        amount,
        suppression,
        randomization,
        runtimeMs,
        deterministic: firstHash === secondHash,
        deterministicHash: firstHash,
        ...metrics,
        ...first.diagnostics,
        selectedCarrierFamilyCounts: first.diagnostics.carrierFamilyCounts,
      });
    }
  }
}

const comparisonAmount = 35;
const comparisonSuppression = 75;
const comparisonWidth = fixtures.reduce((maximum, fixture) => Math.max(maximum, fixture.width), 0);
const comparisonHeight = fixtures.reduce((sum, fixture) => sum + fixture.height, 0);
const comparison = new Uint8Array(comparisonWidth * (engines.length + 1) * comparisonHeight * 4).fill(255);
const copy = (image, fixture, column, rowOffset) => {
  const rowWidth = comparisonWidth * (engines.length + 1);
  for (let y = 0; y < fixture.height; y += 1) {
    const sourceStart = y * fixture.width * 4;
    const targetStart = ((rowOffset + y) * rowWidth + column * comparisonWidth) * 4;
    comparison.set(image.subarray(sourceStart, sourceStart + fixture.width * 4), targetStart);
  }
};
let rowOffset = 0;
for (const fixture of fixtures) {
  copy(fixture.rgba, fixture, 0, rowOffset);
  for (let index = 0; index < engines.length; index += 1) {
    const result = render(engines[index].id, fixture, {
      ditheringAmount: comparisonAmount,
      lineSuppression: comparisonSuppression,
      randomization: 0,
    });
    copy(preview(result, fixture), fixture, index + 1, rowOffset);
  }
  rowOffset += fixture.height;
}

await mkdir(outputDirectory, { recursive: true });
await writeFile(`${outputDirectory}/results.json`, JSON.stringify({
  schemaVersion: "1.0.0",
  width,
  height,
  engines,
  amounts,
  suppressions,
  randomizations,
  rows,
}, null, 2));
const columns = Object.keys(rows[0] ?? {});
await writeFile(`${outputDirectory}/results.csv`, [
  columns.join(","),
  ...rows.map((row) => columns.map((column) => JSON.stringify(row[column] ?? "")).join(",")),
].join("\n") + "\n");
await writeFile(`${outputDirectory}/comparison.png`, encodeRgbaPng(
  comparison,
  comparisonWidth * (engines.length + 1),
  comparisonHeight,
));
console.log(`Wrote ${rows.length} grayscale v4.5 benchmark rows to ${outputDirectory}`);
