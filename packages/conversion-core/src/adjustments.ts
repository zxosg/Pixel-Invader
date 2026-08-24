import type { ConversionSettings } from "./types.js";

export type ImageAdjustments = Pick<
  ConversionSettings,
  "brightness" | "contrast" | "saturation" | "gamma"
>;

function signedRoundDiv(numerator: number, denominator: number): number {
  return numerator < 0
    ? -Math.floor((-numerator + Math.floor(denominator / 2)) / denominator)
    : Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

function clipChannel(value: number): number {
  return Math.max(0, Math.min(255, value));
}

function gammaChannel(value: number, gamma: number): number {
  if (gamma === 100) return value;
  const exponent = 100 / gamma;
  return clipChannel(Math.floor(Math.pow(value / 255, exponent) * 256));
}

export function validateAdjustments(settings: ImageAdjustments): void {
  for (const [name, value] of [
    ["Brightness", settings.brightness],
    ["Contrast", settings.contrast],
    ["Saturation", settings.saturation],
  ] as const) {
    if (!Number.isInteger(value) || value < -100 || value > 100) {
      throw new RangeError(`${name} must be an integer from -100 through 100.`);
    }
  }
  if (!Number.isInteger(settings.gamma) || settings.gamma < 33 || settings.gamma > 300) {
    throw new RangeError("Gamma must be an integer from 33 through 300 percent.");
  }
}

export function adjustRgba(source: Uint8Array, settings: ImageAdjustments): Uint8Array {
  if (source.length % 4 !== 0) throw new RangeError("RGBA buffer length is invalid.");
  validateAdjustments(settings);
  const output = new Uint8Array(source.length);
  const brightnessDelta = signedRoundDiv(255 * settings.brightness, 100);
  const contrastScale = 100 + settings.contrast;
  const saturationScale = 100 + settings.saturation;

  for (let offset = 0; offset < source.length; offset += 4) {
    const channels = [source[offset] ?? 0, source[offset + 1] ?? 0, source[offset + 2] ?? 0];
    for (let channel = 0; channel < 3; channel += 1) {
      const brightened = clipChannel((channels[channel] ?? 0) + brightnessDelta);
      channels[channel] = clipChannel(128 + signedRoundDiv((brightened - 128) * contrastScale, 100));
    }
    const luma = signedRoundDiv(
      77 * (channels[0] ?? 0) + 150 * (channels[1] ?? 0) + 29 * (channels[2] ?? 0),
      256,
    );
    for (let channel = 0; channel < 3; channel += 1) {
      const saturated = clipChannel(
        luma + signedRoundDiv(((channels[channel] ?? 0) - luma) * saturationScale, 100),
      );
      output[offset + channel] = clipChannel(gammaChannel(saturated, settings.gamma));
    }
    output[offset + 3] = source[offset + 3] ?? 255;
  }
  return output;
}
