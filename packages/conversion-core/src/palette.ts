import type { RgbColor } from "./types.js";

function channel(code: number, mask: number, bright: boolean): number {
  return (code & mask) === 0 ? 0 : bright ? 255 : 205;
}

export function zxColor(code: number, bright: boolean): RgbColor {
  if (!Number.isInteger(code) || code < 0 || code > 7) {
    throw new RangeError("ZX color code must be an integer from 0 through 7.");
  }
  return {
    r: channel(code, 2, bright),
    g: channel(code, 4, bright),
    b: channel(code, 1, bright),
  };
}

export function decodeAttribute(attribute: number): {
  readonly ink: RgbColor;
  readonly paper: RgbColor;
} {
  const bright = (attribute & 0x40) !== 0;
  return {
    ink: zxColor(attribute & 7, bright),
    paper: zxColor((attribute >> 3) & 7, bright),
  };
}
