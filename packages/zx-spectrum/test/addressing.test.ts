import { describe, expect, it } from "vitest";
import { zxAttributeOffset, zxBitmapOffset } from "../src/index.js";

describe("ZX Spectrum addressing", () => {
  it("maps representative scanlines to the native interleaved layout", () => {
    expect(zxBitmapOffset(0, 0)).toBe(0);
    expect(zxBitmapOffset(31, 0)).toBe(31);
    expect(zxBitmapOffset(0, 1)).toBe(256);
    expect(zxBitmapOffset(0, 7)).toBe(1_792);
    expect(zxBitmapOffset(0, 8)).toBe(32);
    expect(zxBitmapOffset(0, 63)).toBe(2_016);
    expect(zxBitmapOffset(0, 64)).toBe(2_048);
    expect(zxBitmapOffset(31, 191)).toBe(6_143);
  });

  it("maps attributes after bitmap memory in row-major order", () => {
    expect(zxAttributeOffset(0, 0)).toBe(6_144);
    expect(zxAttributeOffset(31, 0)).toBe(6_175);
    expect(zxAttributeOffset(0, 1)).toBe(6_176);
    expect(zxAttributeOffset(31, 23)).toBe(6_911);
  });

  it("rejects coordinates outside the display", () => {
    expect(() => zxBitmapOffset(-1, 0)).toThrow(RangeError);
    expect(() => zxBitmapOffset(32, 0)).toThrow(RangeError);
    expect(() => zxBitmapOffset(0, 192)).toThrow(RangeError);
    expect(() => zxAttributeOffset(0, 24)).toThrow(RangeError);
  });
});

