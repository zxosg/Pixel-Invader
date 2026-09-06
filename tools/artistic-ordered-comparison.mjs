#!/usr/bin/env node
/**
 * Reproducible visual review for Artistic ordered hybrid v1.
 *
 * Run after `pnpm build`. The contact sheet keeps the source adjustments,
 * palette, and Halo v1 optimizer fixed for every independent engine. The
 * structured column intentionally uses its coupled v4 optimizer and is marked
 * as such in the JSON report.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { decodeImage, encodeRgbaPng } from "../packages/image-codecs/dist/index.js";
import { convertToZx, DEFAULT_CONVERSION_SETTINGS } from "../packages/conversion-core/dist/index.js";

const outputDirectory = process.argv[2] ?? "docs/artistic-ordered-hybrid-v1";
const width = 256;
const height = 192;
const outputWidth = width * 7;
const outputHeight = height * 3;

function synthetic(kind) {
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4;
    let value = 0;
    if (kind === "gradient") value = Math.round(x * 255 / (width - 1));
    if (kind === "diagonal-and-features") {
      value = x + y < width ? 40 : 210;
      if (x === 32 || y === 80 || x === y || (x === 140 && y === 90)) value = 255;
    }
    rgba[offset] = rgba[offset + 1] = rgba[offset + 2] = value;
    rgba[offset + 3] = 255;
  }
  return rgba;
}

const photo = decodeImage(new Uint8Array(await readFile(new URL("../_comparative%20solutions/ImageJ_dev/Images/selfie.png", import.meta.url))));
const fixtures = [
  { id: "gradient", rgba: synthetic("gradient"), sourceWidth: width, sourceHeight: height },
  { id: "diagonal-and-features", rgba: synthetic("diagonal-and-features"), sourceWidth: width, sourceHeight: height },
  { id: "photograph", rgba: photo.rgba, sourceWidth: photo.width, sourceHeight: photo.height },
];
const engines = [
  { id: "none-discrete-v2", label: "No dither", dithering: "none", amount: 0 },
  { id: "ordered-strict-matrix-v6", label: "Strict matrix v6", dithering: "ordered", amount: 100 },
  { id: "ordered-void-cluster-v1", label: "Void cluster v1", dithering: "ordered", amount: 100 },
  { id: "error-diffusion-decorrelated-v3", label: "Decorrelated diffusion v3", dithering: "error-diffusion", amount: 100 },
  { id: "ordered-cell-pattern-v4", label: "Structured cell v4", dithering: "ordered", amount: 100, optimizer: "zx-structured-global-v4" },
  { id: "artistic-ordered-hybrid-v1", label: "Artistic hybrid v1", dithering: "ordered", amount: 100 },
];

function settings(engine) {
  return {
    ...DEFAULT_CONVERSION_SETTINGS,
    framing: "stretch", resampling: "bilinear", attributeHeight: 8,
    attributeOptimizerId: engine.optimizer ?? "zx-guide-reference-halo-v1",
    ditherEngineId: engine.id, dithering: engine.dithering,
    ditheringAmount: engine.amount, orderedMatrix: "bayer-2x2",
    artisticPattern: "auto",
    structured: engine.id === "ordered-cell-pattern-v4" ? {
      ...DEFAULT_CONVERSION_SETTINGS.structured,
      ditherAmountPermille: engine.amount * 10,
      ditherResponseCurveId: "power-035-percent-v2",
      colorAnchorModelId: "srgb-squared-v1",
      structuralModelId: "palette-topology-v1",
      objectiveWeights: {
        ...DEFAULT_CONVERSION_SETTINGS.structured.objectiveWeights,
        pixel: 192, rgbAnchor: 2048, patternReference: 1536,
        paletteDistribution: 1024, luminanceRank: 512, edgePolarity: 768,
        mean: 768, sharedEndpoint: 0,
      },
      candidateParameters: {
        ...DEFAULT_CONVERSION_SETTINGS.structured.candidateParameters,
        localAdmissibilityPermille: 100, boundaryCapPermille: 100,
      },
    } : {
      ...DEFAULT_CONVERSION_SETTINGS.structured,
      ditherAmountPermille: engine.amount * 10,
    },
  };
}

function copy(canvas, image, x, y) {
  for (let row = 0; row < height; row += 1) {
    canvas.set(image.subarray(row * width * 4, (row + 1) * width * 4), ((y + row) * outputWidth + x) * 4);
  }
}

function error(source, result) {
  let rgb = 0;
  let lowPass = 0;
  for (let y = 0; y < height; y += 2) for (let x = 0; x < width; x += 2) {
    for (let channel = 0; channel < 3; channel += 1) {
      let sourceSum = 0, outputSum = 0;
      for (let dy = 0; dy < 2; dy += 1) for (let dx = 0; dx < 2; dx += 1) {
        const offset = ((y + dy) * width + x + dx) * 4 + channel;
        const delta = source[offset] - result[offset];
        rgb += delta * delta;
        sourceSum += source[offset]; outputSum += result[offset];
      }
      lowPass += (sourceSum - outputSum) ** 2 / 4;
    }
  }
  return { rgbError: rgb, lowPass2x2Error: lowPass };
}

const canvas = new Uint8Array(outputWidth * outputHeight * 4).fill(255);
const report = { schemaVersion: "1.0.0", engines, rows: [] };
for (let row = 0; row < fixtures.length; row += 1) {
  const fixture = fixtures[row];
  const baseline = convertToZx(fixture.rgba, fixture.sourceWidth, fixture.sourceHeight, settings(engines[0]), "high");
  copy(canvas, baseline.sourcePreviewRgba, 0, row * height);
  const metrics = [];
  for (let column = 0; column < engines.length; column += 1) {
    const engine = engines[column];
    const result = convertToZx(fixture.rgba, fixture.sourceWidth, fixture.sourceHeight, settings(engine), "high");
    copy(canvas, result.previewRgba, (column + 1) * width, row * height);
    metrics.push({ engineId: engine.id, optimizerId: engine.optimizer ?? "zx-guide-reference-halo-v1", ...error(result.sourcePreviewRgba, result.previewRgba) });
  }
  report.rows.push({ fixture: fixture.id, metrics });
}
await mkdir(outputDirectory, { recursive: true });
await writeFile(`${outputDirectory}/contact-sheet.png`, encodeRgbaPng(canvas, outputWidth, outputHeight));
await writeFile(`${outputDirectory}/report.json`, `${JSON.stringify({
  ...report,
  columns: ["adjusted source", ...engines.map(({ label }) => label)],
  notes: "All independent engine columns use Halo v1 and bayer-2x2 where applicable. Structured cell v4 requires zx-structured-global-v4, so its result is not a like-for-like optimizer comparison. Source has no output column. Artistic v1 has a fixed void-and-cluster seed (1729).",
}, null, 2)}\n`);
console.log(`Wrote ${outputDirectory}/contact-sheet.png and report.json`);
