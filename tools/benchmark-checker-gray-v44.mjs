#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { decodeImage, encodeRgbaPng } from "../packages/image-codecs/dist/index.js";
import {
  renderGrayscaleArtisticCarrier,
  renderGrayscaleCheckerPhaseV44,
  renderGrayscaleDiffusionReference,
} from "../packages/conversion-core/dist/index.js";

const quick = process.argv.includes("--quick");
const outputDirectory = process.argv.find((argument, index) => index >= 2 && !argument.startsWith("--")) ??
  "benchmark-results/checker-gray-v44";
const imageArgument = process.argv.find((argument) => argument.startsWith("--image="));
const width = 128;
const height = 96;
const amounts = quick ? [35, 100] : [23, 35, 50, 100];
const suppressions = quick ? [0, 30, 100] : [0, 25, 30, 50, 75, 100];
const randomizations = [0];

function rgbaFixture(kind) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    let value = 128;
    if (kind === "flat-25") value = 137;
    else if (kind === "flat-50") value = 188;
    else if (kind === "flat-75") value = 225;
    else if (kind === "horizontal-gradient") value = Math.round(x * 255 / (width - 1));
    else if (kind === "vertical-gradient") value = Math.round(y * 255 / (height - 1));
    else if (kind === "diagonal-gradient") value = Math.round((x + y) * 255 / (width + height - 2));
    else if (kind === "vertical-edge") value = x < width / 2 ? 48 : 208;
    else if (kind === "horizontal-edge") value = y < height / 2 ? 48 : 208;
    else if (kind === "diagonal-silhouette") value = x + y < 94 ? 215 : 35;
    else if (kind === "sky-like") {
      value = Math.round(115 + 70 * (1 - y / (height - 1)) + 14 * Math.sin(x / 17));
      if (y > 70 && x > 24 && x < 105) value = Math.min(value, 82);
    } else if (kind === "cityscape-sunset") {
      const sky = 42 + 150 * (1 - y / (height - 1));
      const sun = Math.max(0, 65 - Math.hypot(x - 88, y - 37) * 2.2);
      value = Math.round(Math.min(255, sky + sun));
      if (y > 68) value = Math.min(value, 42 + ((x * 13) % 24));
      if ((x > 17 && x < 31 && y > 49) || (x > 55 && x < 66 && y > 38) || (x > 101 && x < 116 && y > 56)) {
        value = 18;
      }
    }
    const offset = (y * width + x) * 4;
    rgba[offset] = value;
    rgba[offset + 1] = value;
    rgba[offset + 2] = value;
    rgba[offset + 3] = 255;
  }
  return rgba;
}

const fixtures = [
  "flat-25", "flat-50", "flat-75", "horizontal-gradient", "vertical-gradient",
  "diagonal-gradient", "vertical-edge", "horizontal-edge", "diagonal-silhouette",
  "sky-like", "cityscape-sunset",
].map((id) => ({ id, width, height, rgba: rgbaFixture(id) }));

if (imageArgument !== undefined) {
  const decoded = decodeImage(new Uint8Array(await readFile(imageArgument.slice("--image=".length))));
  fixtures.push({ id: "supplied-image", width: decoded.width, height: decoded.height, rgba: decoded.rgba });
}

const engines = [
  { id: "v3", label: "grayscale v3" },
  { id: "v4", label: "grayscale v4" },
  { id: "artistic", label: "artistic checker carrier" },
  { id: "v4.4", label: "grayscale v4.4" },
];

function render(engine, fixture, options) {
  if (engine === "v3") return renderGrayscaleDiffusionReference(fixture.rgba, fixture.width, fixture.height, options, "v3");
  if (engine === "v4") return renderGrayscaleDiffusionReference(fixture.rgba, fixture.width, fixture.height, options, "v4");
  if (engine === "artistic") return renderGrayscaleArtisticCarrier(fixture.rgba, fixture.width, fixture.height);
  return renderGrayscaleCheckerPhaseV44(fixture.rgba, fixture.width, fixture.height, options);
}

function digest(result) {
  return createHash("sha256").update(result.bits).update(new Uint8Array(result.guide.buffer)).digest("hex");
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

function csvValue(value) {
  return JSON.stringify(value ?? "");
}

const rows = [];
for (const fixture of fixtures) {
  for (const amount of amounts) for (const suppression of suppressions) for (const randomization of randomizations) {
    const options = { ditheringAmount: amount, lineSuppression: suppression, randomization };
    const baseline = render("v3", fixture, options);
    const baselineDigest = digest(baseline);
    for (const engine of engines) {
      const start = performance.now();
      const first = render(engine.id, fixture, options);
      const elapsedMs = performance.now() - start;
      const second = render(engine.id, fixture, options);
      const secondDigest = digest(second);
      const diagnostics = first.diagnostics;
      let changedPixels = 0;
      for (let index = 0; index < first.bits.length; index += 1) {
        if (first.bits[index] !== baseline.bits[index]) changedPixels += 1;
      }
      rows.push({
        fixture: fixture.id,
        engine: engine.id,
        amount,
        suppression,
        randomization,
        runtimeMs: elapsedMs,
        deterministic: digest(first) === secondDigest,
        digest: digest(first),
        baselineDigest,
        changedPixels,
        changedPixelPercentage: changedPixels / Math.max(1, first.bits.length),
        ...diagnostics,
      });
    }
  }
}

const comparisonAmount = 35;
const comparisonSuppression = 30;
const comparisonFixtures = fixtures;
const comparisonWidth = comparisonFixtures.reduce((maximum, fixture) => Math.max(maximum, fixture.width), 0);
const comparisonHeight = comparisonFixtures.reduce((sum, fixture) => sum + fixture.height, 0);
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
for (const fixture of comparisonFixtures) {
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
const csv = [columns.join(","), ...rows.map((row) => columns.map((column) => csvValue(row[column])).join(","))].join("\n") + "\n";
await writeFile(`${outputDirectory}/results.csv`, csv);
await writeFile(`${outputDirectory}/comparison.png`, encodeRgbaPng(
  comparison,
  comparisonWidth * (engines.length + 1),
  comparisonHeight,
));
console.log(`Wrote ${rows.length} grayscale v4.4 benchmark rows to ${outputDirectory}`);
