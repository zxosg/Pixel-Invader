import { ZX_BITMAP_BYTES } from "@retro-converter/zx-spectrum";
import { encodeRgbaPng } from "@retro-converter/image-codecs";
import { sha256Hex } from "./artifacts.js";
import { type WorkerConversionResult } from "./worker/client.js";
import { type AttributeOptimizerId, type AttributeHeight, type DitherEngineId, type OrderedMatrixId, type QlMixedOptimizerId } from "@retro-converter/conversion-core";
import { type BenchmarkClassification, type TextureBenchmarkMetrics } from "./benchmark.js";

export function commonPreviewError(source: Uint8Array, output: Uint8Array): number {
  let score = 0;
  for (let offset = 0; offset < source.length; offset += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const difference =
        (source[offset + channel] ?? 0) - (output[offset + channel] ?? 0);
      score += difference * difference;
    }
  }
  return score;
}

export function previewBufferDimensions(rgba: Uint8Array): readonly [number, number] {
  const pixelCount = rgba.length / 4;
  const width = pixelCount === 512 * 256
    ? 512
    : pixelCount === 288 * 256
      ? 288
      : 256;
  return [width, pixelCount / width];
}

export function lowPass2PreviewError(source: Uint8Array, output: Uint8Array): number {
  let score = 0;
  const [width, height] = previewBufferDimensions(source);
  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      for (let channel = 0; channel < 3; channel += 1) {
        let sourceSum = 0;
        let outputSum = 0;
        let samples = 0;
        for (let dy = 0; dy < 2 && y + dy < height; dy += 1) {
          for (let dx = 0; dx < 2 && x + dx < width; dx += 1) {
            const offset = ((y + dy) * width + x + dx) * 4 + channel;
            sourceSum += source[offset] ?? 0;
            outputSum += output[offset] ?? 0;
            samples += 1;
          }
        }
        const difference = sourceSum / samples - outputSum / samples;
        score += difference * difference;
      }
    }
  }
  return score;
}

export function edgePreviewError(source: Uint8Array, output: Uint8Array): number {
  let score = 0;
  const [width, height] = previewBufferDimensions(source);
  const compare = (first: number, second: number) => {
    for (let channel = 0; channel < 3; channel += 1) {
      const sourceDelta =
        (source[first + channel] ?? 0) - (source[second + channel] ?? 0);
      const outputDelta =
        (output[first + channel] ?? 0) - (output[second + channel] ?? 0);
      score += (sourceDelta - outputDelta) ** 2;
    }
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (x + 1 < width) compare(offset, offset + 4);
      if (y + 1 < height) compare(offset, offset + width * 4);
    }
  }
  return score;
}

export function attributeBoundaryPreviewError(
  source: Uint8Array,
  output: Uint8Array,
  attributeHeight: AttributeHeight,
): number {
  const width = 256;
  const height = source.length / 4 / width;
  let score = 0;
  const compare = (first: number, second: number) => {
    for (let channel = 0; channel < 3; channel += 1) {
      const sourceDelta =
        (source[first + channel] ?? 0) - (source[second + channel] ?? 0);
      const outputDelta =
        (output[first + channel] ?? 0) - (output[second + channel] ?? 0);
      score += (sourceDelta - outputDelta) ** 2;
    }
  };
  for (let y = 0; y < height; y += 1) {
    for (let x = 8; x < width; x += 8) {
      compare((y * width + x - 1) * 4, (y * width + x) * 4);
    }
  }
  for (let y = attributeHeight; y < height; y += attributeHeight) {
    for (let x = 0; x < width; x += 1) {
      compare(((y - 1) * width + x) * 4, (y * width + x) * 4);
    }
  }
  return score;
}

export async function conversionOutputDigest(
  result: WorkerConversionResult,
): Promise<string> {
  const length = result.frames.reduce(
    (total, frame) => total + frame.encoded.length + frame.previewRgba.length,
    result.mergedPreviewRgba.length,
  ) + (result.verticalSpatialDiagnostics?.analyticPreviewRgba.length ?? 0);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const frame of result.frames) {
    bytes.set(frame.encoded, offset);
    offset += frame.encoded.length;
    bytes.set(frame.previewRgba, offset);
    offset += frame.previewRgba.length;
  }
  bytes.set(result.mergedPreviewRgba, offset);
  offset += result.mergedPreviewRgba.length;
  if (result.verticalSpatialDiagnostics !== undefined) {
    bytes.set(result.verticalSpatialDiagnostics.analyticPreviewRgba, offset);
  }
  return sha256Hex(bytes);
}

export function rgbaPngDataUrl(rgba: Uint8Array, width: number, height: number): string {
  const png = encodeRgbaPng(rgba, width, height);
  let binary = "";
  for (let offset = 0; offset < png.length; offset += 0x8000) {
    binary += String.fromCharCode(...png.subarray(offset, offset + 0x8000));
  }
  return `data:image/png;base64,${btoa(binary)}`;
}

export function resultContainsZxFlash(result: WorkerConversionResult | null): boolean {
  return result?.platformId === "zx-spectrum" && result.attributeHeight !== null &&
    result.frames.some((frame) => zxScreenContainsFlash(frame.encoded));
}

export function zxScreenContainsFlash(encoded: Uint8Array): boolean {
  return encoded.subarray(ZX_BITMAP_BYTES).some((attribute) => (attribute & 0x80) !== 0);
}

export function previewDifferenceHeatmap(
  first: Uint8Array,
  second: Uint8Array,
): Uint8Array {
  const output = new Uint8Array(first.length);
  for (let offset = 0; offset < output.length; offset += 4) {
    output[offset] = Math.min(255, Math.abs((second[offset] ?? 0) - (first[offset] ?? 0)) * 4);
    output[offset + 1] = Math.min(255, Math.abs((second[offset + 1] ?? 0) - (first[offset + 1] ?? 0)) * 4);
    output[offset + 2] = Math.min(255, Math.abs((second[offset + 2] ?? 0) - (first[offset + 2] ?? 0)) * 4);
    output[offset + 3] = 255;
  }
  return output;
}

export function previewPixelChangePercent(first: Uint8Array, second: Uint8Array): number {
  let changed = 0;
  const pixels = Math.min(first.length, second.length) / 4;
  for (let offset = 0; offset < pixels * 4; offset += 4) {
    if (
      first[offset] !== second[offset] ||
      first[offset + 1] !== second[offset + 1] ||
      first[offset + 2] !== second[offset + 2]
    ) changed += 1;
  }
  return pixels === 0 ? 0 : changed / pixels * 100;
}

export interface ConversionBenchmarkAlias {
  readonly optimizerId: AttributeOptimizerId;
  readonly qlMixedOptimizerId: QlMixedOptimizerId;
  readonly ditherEngineId: DitherEngineId;
  readonly matrix: OrderedMatrixId;
}

export interface ConversionBenchmarkRow extends ConversionBenchmarkAlias {
  readonly matrixEffective: boolean;
  readonly score: number;
  readonly lowPassScore: number;
  readonly edgeScore: number;
  readonly textureMetrics: TextureBenchmarkMetrics;
  readonly platformScore: number;
  readonly attributeBoundaryScore: number | null;
  readonly orderedPerturbationRms: number | null;
  readonly outputPixelChangePercent?: number;
  readonly elapsedMs: number;
  readonly digest: string;
  readonly aliases: readonly ConversionBenchmarkAlias[];
  readonly classification: BenchmarkClassification;
  readonly result: WorkerConversionResult;
}
