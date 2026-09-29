import type { RgbColor, ZxChannelDriveRamp, ZxPalette, ZxPaletteDefinition } from "./types.js";

const DEFAULT_NORMAL_RAMP = { singleChannel: 205, doubleChannel: 205, tripleChannel: 205 } as const;
const DEFAULT_BRIGHT_RAMP = { singleChannel: 255, doubleChannel: 255, tripleChannel: 255 } as const;

export const DEFAULT_ZX_PALETTE: ZxPalette = Object.freeze({
  normal: Object.freeze([
    { r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 205 }, { r: 205, g: 0, b: 0 },
    { r: 205, g: 0, b: 205 }, { r: 0, g: 205, b: 0 }, { r: 0, g: 205, b: 205 },
    { r: 205, g: 205, b: 0 }, { r: 205, g: 205, b: 205 },
  ]),
  bright: Object.freeze([
    { r: 0, g: 0, b: 0 }, { r: 0, g: 0, b: 255 }, { r: 255, g: 0, b: 0 },
    { r: 255, g: 0, b: 255 }, { r: 0, g: 255, b: 0 }, { r: 0, g: 255, b: 255 },
    { r: 255, g: 255, b: 0 }, { r: 255, g: 255, b: 255 },
  ]),
});

export const DEFAULT_ZX_PALETTE_DEFINITION: ZxPaletteDefinition = Object.freeze({
  kind: "channel-drive-ramp-v1",
  normal: DEFAULT_NORMAL_RAMP,
  bright: DEFAULT_BRIGHT_RAMP,
});

const resolvedPaletteCache = new WeakMap<object, ZxPalette>();

function validateRamp(value: unknown): asserts value is ZxChannelDriveRamp {
  if (typeof value !== "object" || value === null) throw new RangeError("ZX channel-drive ramp is invalid.");
  const ramp = value as Record<string, unknown>;
  if (![ramp.singleChannel, ramp.doubleChannel, ramp.tripleChannel].every((channel) =>
    Number.isInteger(channel) && (channel as number) >= 0 && (channel as number) <= 255
  )) throw new RangeError("ZX channel-drive levels must be integers from 0 through 255.");
}

function validateRgb(value: unknown): asserts value is RgbColor {
  if (typeof value !== "object" || value === null) throw new RangeError("ZX palette color is invalid.");
  const color = value as Record<string, unknown>;
  if (![color.r, color.g, color.b].every((channel) =>
    Number.isInteger(channel) && (channel as number) >= 0 && (channel as number) <= 255
  )) throw new RangeError("ZX RGB channels must be integers from 0 through 255.");
}

function rampPalette(ramp: ZxChannelDriveRamp): readonly RgbColor[] {
  const output: RgbColor[] = [{ r: 0, g: 0, b: 0 }];
  for (let code = 1; code < 8; code += 1) {
    const activeChannels = [2, 4, 1];
    const count = activeChannels.reduce((total, mask) => total + ((code & mask) !== 0 ? 1 : 0), 0);
    const level = count === 1 ? ramp.singleChannel : count === 2 ? ramp.doubleChannel : ramp.tripleChannel;
    output.push({
      r: (code & 2) !== 0 ? level : 0,
      g: (code & 4) !== 0 ? level : 0,
      b: (code & 1) !== 0 ? level : 0,
    });
  }
  return output;
}

export function resolveZxPalette(definition?: ZxPaletteDefinition): ZxPalette {
  if (definition === undefined) return DEFAULT_ZX_PALETTE;
  const cached = resolvedPaletteCache.get(definition);
  if (cached !== undefined) return cached;
  let resolved: ZxPalette;
  if (definition.kind === "channel-drive-ramp-v1") {
    validateRamp(definition.normal);
    validateRamp(definition.bright);
    resolved = { normal: rampPalette(definition.normal), bright: rampPalette(definition.bright) };
    resolvedPaletteCache.set(definition, resolved);
    return resolved;
  }
  if (definition.kind !== "explicit" || !Array.isArray(definition.normal) ||
      !Array.isArray(definition.bright) || definition.normal.length !== 8 || definition.bright.length !== 8) {
    throw new RangeError("Explicit ZX palette must contain exactly eight normal and eight BRIGHT colors.");
  }
  definition.normal.forEach(validateRgb);
  definition.bright.forEach(validateRgb);
  resolved = { normal: definition.normal, bright: definition.bright };
  resolvedPaletteCache.set(definition, resolved);
  return resolved;
}

export function isValidZxPaletteDefinition(value: unknown): value is ZxPaletteDefinition {
  try {
    resolveZxPalette(value as ZxPaletteDefinition | undefined);
    return value === undefined || typeof value === "object" && value !== null;
  } catch {
    return false;
  }
}

export function zxColor(code: number, bright: boolean, palette: ZxPalette | ZxPaletteDefinition = DEFAULT_ZX_PALETTE): RgbColor {
  if (!Number.isInteger(code) || code < 0 || code > 7) {
    throw new RangeError("ZX color code must be an integer from 0 through 7.");
  }
  const resolved = "kind" in palette ? resolveZxPalette(palette) : palette;
  return (bright ? resolved.bright : resolved.normal)[code]!;
}

export function decodeAttribute(attribute: number, palette: ZxPalette = DEFAULT_ZX_PALETTE): {
  readonly ink: RgbColor;
  readonly paper: RgbColor;
} {
  const bright = (attribute & 0x40) !== 0;
  return {
    ink: zxColor(attribute & 7, bright, palette),
    paper: zxColor((attribute >> 3) & 7, bright, palette),
  };
}
