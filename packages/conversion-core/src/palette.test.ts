import { describe, expect, it } from "vitest";
import {
  DEFAULT_ZX_PALETTE,
  DEFAULT_ZX_PALETTE_DEFINITION,
  decodeAttribute,
  isValidZxPaletteDefinition,
  resolveZxPalette,
  zxColor,
} from "./index.js";

describe("ZX palette calibration", () => {
  it("preserves the default 205/255 channel-drive palette", () => {
    expect(resolveZxPalette(DEFAULT_ZX_PALETTE_DEFINITION)).toEqual(DEFAULT_ZX_PALETTE);
    expect(zxColor(1, false)).toEqual({ r: 0, g: 0, b: 205 });
    expect(zxColor(7, true)).toEqual({ r: 255, g: 255, b: 255 });
  });

  it("resolves single-, double-, and triple-channel levels", () => {
    const palette = resolveZxPalette({
      kind: "channel-drive-ramp-v1",
      normal: { singleChannel: 128, doubleChannel: 160, tripleChannel: 192 },
      bright: { singleChannel: 128, doubleChannel: 160, tripleChannel: 192 },
    });
    expect(palette.normal).toEqual([
      { r: 0, g: 0, b: 0 },
      { r: 0, g: 0, b: 128 },
      { r: 128, g: 0, b: 0 },
      { r: 160, g: 0, b: 160 },
      { r: 0, g: 128, b: 0 },
      { r: 0, g: 160, b: 160 },
      { r: 160, g: 160, b: 0 },
      { r: 192, g: 192, b: 192 },
    ]);
    expect(palette.bright).toEqual(palette.normal);
  });

  it("uses explicit RGB values when decoding attributes", () => {
    const normal = Array.from({ length: 8 }, (_, code) => ({ r: code, g: 20, b: 30 }));
    const bright = Array.from({ length: 8 }, (_, code) => ({ r: code + 100, g: 40, b: 50 }));
    const palette = resolveZxPalette({ kind: "explicit", normal, bright });
    expect(decodeAttribute(0x40 | (3 << 3) | 2, palette)).toEqual({
      ink: bright[2],
      paper: bright[3],
    });
    expect(isValidZxPaletteDefinition({ kind: "explicit", normal, bright })).toBe(true);
    expect(isValidZxPaletteDefinition({ kind: "explicit", normal: normal.slice(1), bright })).toBe(false);
  });

  it("rejects channel values outside the byte range", () => {
    expect(() => resolveZxPalette({
      kind: "channel-drive-ramp-v1",
      normal: { singleChannel: 256, doubleChannel: 160, tripleChannel: 192 },
      bright: { singleChannel: 255, doubleChannel: 255, tripleChannel: 255 },
    })).toThrow(RangeError);
  });
});
