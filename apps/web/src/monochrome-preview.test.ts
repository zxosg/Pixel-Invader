import { describe, expect, it } from "vitest";
import {
  ZX_BITMAP_BYTES,
  zxBitmapOffset,
} from "@retro-converter/zx-spectrum";
import {
  mergeMonochromeRgba,
  zxBitmapToMonochromeRgba,
} from "./monochrome-preview";

describe("ZX monochrome previews", () => {
  it("decodes ZX bitmap addressing without consulting attributes", () => {
    const encoded = new Uint8Array(ZX_BITMAP_BYTES + 768);
    encoded[zxBitmapOffset(0, 0)] = 0b10000001;
    encoded[zxBitmapOffset(1, 1)] = 0b01000000;
    encoded.fill(0xff, ZX_BITMAP_BYTES);

    const rgba = zxBitmapToMonochromeRgba(encoded);
    const pixel = (x: number, y: number) =>
      [...rgba.slice((y * 256 + x) * 4, (y * 256 + x) * 4 + 4)];

    expect(pixel(0, 0)).toEqual([255, 255, 255, 255]);
    expect(pixel(1, 0)).toEqual([0, 0, 0, 255]);
    expect(pixel(7, 0)).toEqual([255, 255, 255, 255]);
    expect(pixel(8, 1)).toEqual([0, 0, 0, 255]);
    expect(pixel(9, 1)).toEqual([255, 255, 255, 255]);
  });

  it("rejects truncated encoded screens", () => {
    expect(() =>
      zxBitmapToMonochromeRgba(new Uint8Array(ZX_BITMAP_BYTES - 1))
    ).toThrow(/at least/);
  });

  it("merges agreeing bits to black or white and disagreements to gray", () => {
    const first = Uint8Array.from([
      0, 0, 0, 255,
      255, 255, 255, 255,
      255, 255, 255, 255,
    ]);
    const second = Uint8Array.from([
      0, 0, 0, 255,
      255, 255, 255, 255,
      0, 0, 0, 255,
    ]);

    expect(mergeMonochromeRgba(first, second)).toEqual(
      Uint8Array.from([
        0, 0, 0, 255,
        255, 255, 255, 255,
        127, 127, 127, 255,
      ]),
    );
  });
});
