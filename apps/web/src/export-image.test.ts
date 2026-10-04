import { describe, expect, it } from "vitest";
import { scaleRgbaNearest } from "./export-image.js";

describe("scaleRgbaNearest", () => {
  it("replicates each source pixel exactly in 2× blocks", () => {
    const image = scaleRgbaNearest(Uint8Array.from([
      255, 0, 0, 255, 0, 255, 0, 128,
    ]), 2, 1, 2);
    expect(image).toEqual({
      width: 4,
      height: 2,
      rgba: Uint8Array.from([
        255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 128, 0, 255, 0, 128,
        255, 0, 0, 255, 255, 0, 0, 255, 0, 255, 0, 128, 0, 255, 0, 128,
      ]),
    });
  });

  it("leaves 1× buffers unchanged and supports 3× and 4× dimensions", () => {
    const source = Uint8Array.from([12, 34, 56, 78]);
    expect(scaleRgbaNearest(source, 1, 1, 1).rgba).toBe(source);
    expect(scaleRgbaNearest(source, 1, 1, 3)).toMatchObject({ width: 3, height: 3 });
    expect(scaleRgbaNearest(source, 1, 1, 4)).toMatchObject({ width: 4, height: 4 });
  });

  it("rejects mismatched buffers and invalid dimensions", () => {
    expect(() => scaleRgbaNearest(new Uint8Array(3), 1, 1, 2)).toThrow(RangeError);
    expect(() => scaleRgbaNearest(new Uint8Array(4), 0, 1, 2)).toThrow(RangeError);
  });
});
