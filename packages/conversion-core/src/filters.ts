import type { ConversionSettings } from "./types.js";

export type ImageFilters = Pick<
  ConversionSettings,
  "smoothing" | "sharpening"
>;

const KERNEL = [
  1, 2, 1,
  2, 4, 2,
  1, 2, 1,
] as const;
const KERNEL_SCALE = 16;

function signedRoundDiv(numerator: number, denominator: number): number {
  return numerator < 0
    ? -Math.floor((-numerator + Math.floor(denominator / 2)) / denominator)
    : Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

function clipChannel(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function blurredChannel(
  source: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  channel: number,
): number {
  let sum = 0;
  let kernelIndex = 0;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    const sampleY = Math.max(0, Math.min(height - 1, y + offsetY));
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const sampleX = Math.max(0, Math.min(width - 1, x + offsetX));
      const sourceOffset = (sampleY * width + sampleX) * 4 + channel;
      sum += (source[sourceOffset] ?? 0) * (KERNEL[kernelIndex] ?? 0);
      kernelIndex += 1;
    }
  }
  return signedRoundDiv(sum, KERNEL_SCALE);
}

function smoothRgba(
  source: Uint8Array,
  width: number,
  height: number,
  amount: number,
): Uint8Array {
  if (amount === 0) return Uint8Array.from(source);
  const output = new Uint8Array(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const original = source[pixelOffset + channel] ?? 0;
        const blurred = blurredChannel(source, width, height, x, y, channel);
        output[pixelOffset + channel] = clipChannel(
          signedRoundDiv(original * (100 - amount) + blurred * amount, 100),
        );
      }
      output[pixelOffset + 3] = source[pixelOffset + 3] ?? 255;
    }
  }
  return output;
}

function sharpenRgba(
  source: Uint8Array,
  width: number,
  height: number,
  amount: number,
): Uint8Array {
  if (amount === 0) return Uint8Array.from(source);
  const output = new Uint8Array(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const pixelOffset = (y * width + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const original = source[pixelOffset + channel] ?? 0;
        const blurred = blurredChannel(source, width, height, x, y, channel);
        output[pixelOffset + channel] = clipChannel(
          original + signedRoundDiv((original - blurred) * amount, 100),
        );
      }
      output[pixelOffset + 3] = source[pixelOffset + 3] ?? 255;
    }
  }
  return output;
}

export function validateImageFilters(settings: ImageFilters): void {
  for (const [name, value] of [
    ["Smoothing", settings.smoothing],
    ["Sharpening", settings.sharpening],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > 100) {
      throw new RangeError(`${name} must be an integer from 0 through 100.`);
    }
  }
}

export function filterRgba(
  source: Uint8Array,
  width: number,
  height: number,
  settings: ImageFilters,
): Uint8Array {
  if (
    !Number.isInteger(width) || !Number.isInteger(height) ||
    width < 1 || height < 1 || source.length !== width * height * 4
  ) {
    throw new RangeError("RGBA dimensions are invalid.");
  }
  validateImageFilters(settings);
  const smoothed = smoothRgba(source, width, height, settings.smoothing);
  return sharpenRgba(smoothed, width, height, settings.sharpening);
}
