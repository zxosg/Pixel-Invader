import type { ConversionSettings } from "./types.js";

export type ImageAdjustments = Pick<
  ConversionSettings,
  "brightness" | "contrast" | "saturation" | "gamma"
> & Partial<Pick<ConversionSettings, "hueShift" | "hslSaturation" | "lightness" | "colorize">>;

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

function rgbToHsl(red: number, green: number, blue: number): [number, number, number] {
  const r = red / 255, g = green / 255, b = blue / 255;
  const maximum = Math.max(r, g, b), minimum = Math.min(r, g, b);
  const delta = maximum - minimum;
  let hue = 0;
  const lightness = (maximum + minimum) / 2;
  let saturation = 0;
  if (delta !== 0) {
    saturation = delta / (1 - Math.abs(2 * lightness - 1));
    if (maximum === r) hue = ((g - b) / delta) % 6;
    else if (maximum === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return [hue, saturation, lightness];
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const sector = ((hue % 360) + 360) % 360 / 60;
  const secondary = chroma * (1 - Math.abs(sector % 2 - 1));
  let red = 0, green = 0, blue = 0;
  if (sector < 1) [red, green] = [chroma, secondary];
  else if (sector < 2) [red, green] = [secondary, chroma];
  else if (sector < 3) [green, blue] = [chroma, secondary];
  else if (sector < 4) [green, blue] = [secondary, chroma];
  else if (sector < 5) [red, blue] = [secondary, chroma];
  else [red, blue] = [chroma, secondary];
  const match = lightness - chroma / 2;
  return [red, green, blue].map((channel) => Math.round((channel + match) * 255)) as [number, number, number];
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
  if (!Number.isInteger(settings.gamma) || settings.gamma < 10 || settings.gamma > 300) {
    throw new RangeError("Gamma must be an integer from 10 through 300 percent.");
  }
  const hueShift = settings.hueShift ?? 0;
  const hslSaturation = settings.hslSaturation ?? 0;
  const lightness = settings.lightness ?? 0;
  if (!Number.isInteger(hueShift) || hueShift < -180 || hueShift > 180) {
    throw new RangeError("Hue must be an integer from -180 through 180 degrees.");
  }
  for (const [name, value] of [["HSL saturation", hslSaturation], ["Lightness", lightness]] as const) {
    if (!Number.isInteger(value) || value < -100 || value > 100) {
      throw new RangeError(`${name} must be an integer from -100 through 100.`);
    }
  }
  if (settings.colorize !== undefined && typeof settings.colorize !== "boolean") {
    throw new RangeError("Colorize must be a boolean.");
  }
}

export function adjustRgba(source: Uint8Array, settings: ImageAdjustments): Uint8Array {
  if (source.length % 4 !== 0) throw new RangeError("RGBA buffer length is invalid.");
  validateAdjustments(settings);
  const output = new Uint8Array(source.length);
  const brightnessDelta = signedRoundDiv(255 * settings.brightness, 100);
  const contrastScale = 100 + settings.contrast;
  const saturationScale = 100 + settings.saturation;
  const hueShift = settings.hueShift ?? 0;
  const hslSaturation = settings.hslSaturation ?? 0;
  const lightness = settings.lightness ?? 0;
  const colorize = settings.colorize ?? false;

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
    const saturatedChannels = [0, 0, 0];
    for (let channel = 0; channel < 3; channel += 1) {
      const saturated = clipChannel(
        luma + signedRoundDiv(((channels[channel] ?? 0) - luma) * saturationScale, 100),
      );
      saturatedChannels[channel] = saturated;
    }
    if (hueShift === 0 && hslSaturation === 0 && lightness === 0 && !colorize) {
      for (let channel = 0; channel < 3; channel += 1) {
        output[offset + channel] = clipChannel(gammaChannel(saturatedChannels[channel] ?? 0, settings.gamma));
      }
      output[offset + 3] = source[offset + 3] ?? 255;
      continue;
    }
    const [hue, originalSaturation, originalLightness] = rgbToHsl(
      saturatedChannels[0] ?? 0, saturatedChannels[1] ?? 0, saturatedChannels[2] ?? 0,
    );
    const adjustedSaturation = colorize
      ? Math.max(0, Math.min(1, 1 + hslSaturation / 100))
      : Math.max(0, Math.min(1, originalSaturation * (1 + hslSaturation / 100)));
    const adjustedLightness = Math.max(0, Math.min(1, originalLightness + lightness / 100));
    const [red, green, blue] = hslToRgb(
      colorize ? hueShift : hue + hueShift,
      adjustedSaturation,
      adjustedLightness,
    );
    for (const [channel, value] of [red, green, blue].entries()) {
      output[offset + channel] = clipChannel(gammaChannel(value, settings.gamma));
    }
    output[offset + 3] = source[offset + 3] ?? 255;
  }
  return output;
}
