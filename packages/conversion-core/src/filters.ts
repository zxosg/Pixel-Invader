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
const LINEAR = Array.from({ length: 256 }, (_, index) => {
  const value = index / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
});

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

/**
 * Low-pass only source texture that is unlikely to be a real contour. The
 * bilateral weights keep colour boundaries and one-pixel features anchored,
 * while flat high-frequency noise converges toward its local mean.
 */
export function adaptiveDitherPrefilter(
  source: Uint8Array,
  width: number,
  height: number,
  strength: number,
): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || source.length !== width * height * 4) {
    throw new RangeError("RGBA dimensions are invalid.");
  }
  if (!Number.isInteger(strength) || strength < 0 || strength > 100) {
    throw new RangeError("Adaptive prefilter strength must be an integer from 0 through 100.");
  }
  if (strength === 0) return Uint8Array.from(source);
  const output = new Uint8Array(source.length);
  const lumaAt = (x: number, y: number): number => {
    const offset = (y * width + x) * 4;
    return 0.2126 * LINEAR[source[offset] ?? 0]! +
      0.7152 * LINEAR[source[offset + 1] ?? 0]! +
      0.0722 * LINEAR[source[offset + 2] ?? 0]!;
  };
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const offset = (y * width + x) * 4;
    const centerLuma = lumaAt(x, y);
    const horizontal = Math.abs(lumaAt(Math.max(0, x - 1), y) - lumaAt(Math.min(width - 1, x + 1), y));
    const vertical = Math.abs(lumaAt(x, Math.max(0, y - 1)) - lumaAt(x, Math.min(height - 1, y + 1)));
    const edgeSpan = Math.max(horizontal, vertical);
    let red = 0, green = 0, blue = 0, total = 0;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      const nx = Math.max(0, Math.min(width - 1, x + dx));
      const ny = Math.max(0, Math.min(height - 1, y + dy));
      const neighbor = (ny * width + nx) * 4;
      const neighborLuma = lumaAt(nx, ny);
      const colorDistance =
        0.2126 * (LINEAR[source[offset] ?? 0]! - LINEAR[source[neighbor] ?? 0]!) ** 2 +
        0.7152 * (LINEAR[source[offset + 1] ?? 0]! - LINEAR[source[neighbor + 1] ?? 0]!) ** 2 +
        0.0722 * (LINEAR[source[offset + 2] ?? 0]! - LINEAR[source[neighbor + 2] ?? 0]!) ** 2;
      const spatial = dx === 0 && dy === 0 ? 4 : (dx === 0 || dy === 0 ? 2 : 1);
      const similarity = Math.exp(-Math.abs(centerLuma - neighborLuma) * 8 - colorDistance * 30);
      const weight = spatial * similarity;
      red += (source[neighbor] ?? 0) * weight;
      green += (source[neighbor + 1] ?? 0) * weight;
      blue += (source[neighbor + 2] ?? 0) * weight;
      total += weight;
    }
    const blend = edgeSpan >= 0.16 ? 0 : Math.min(0.24, strength / 100 * 0.24);
    output[offset] = clipChannel(Math.round((source[offset] ?? 0) * (1 - blend) + red / total * blend));
    output[offset + 1] = clipChannel(Math.round((source[offset + 1] ?? 0) * (1 - blend) + green / total * blend));
    output[offset + 2] = clipChannel(Math.round((source[offset + 2] ?? 0) * (1 - blend) + blue / total * blend));
    output[offset + 3] = source[offset + 3] ?? 255;
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
