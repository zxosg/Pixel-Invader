import { describe, expect, it } from "vitest";
import { decodeAttribute, renderZxFlashPreview } from "./index.js";
import {
  ZX_BITMAP_BYTES,
  zxBitmapOffset,
  zxSoftwareScrBytes,
} from "@retro-converter/zx-spectrum";

describe("ZX FLASH inspection rendering", () => {
  it.each([1, 2, 4, 8] as const)("renders both phases at attribute height %i", (height) => {
    const encoded = new Uint8Array(zxSoftwareScrBytes(height));
    const flashedAttribute = 0x80 | 0x40 | (2 << 3) | 4;
    const staticAttribute = 0x40 | (1 << 3) | 6;
    encoded[ZX_BITMAP_BYTES] = flashedAttribute;
    encoded[ZX_BITMAP_BYTES + 1] = staticAttribute;
    encoded[zxBitmapOffset(0, 0)] = 0x80;
    const before = encoded.slice();

    const normal = renderZxFlashPreview(encoded, height, false);
    const inverted = renderZxFlashPreview(encoded, height, true);
    const flashed = decodeAttribute(flashedAttribute);
    const staticColors = decodeAttribute(staticAttribute);
    const leftInkOffset = 0;
    const leftPaperOffset = 4 * 4;
    const rightInkOffset = 8 * 4;

    expect(Array.from(normal.subarray(leftInkOffset, leftInkOffset + 4))).toEqual([
      flashed.ink.r, flashed.ink.g, flashed.ink.b, 255,
    ]);
    expect(Array.from(inverted.subarray(leftInkOffset, leftInkOffset + 4))).toEqual([
      flashed.paper.r, flashed.paper.g, flashed.paper.b, 255,
    ]);
    expect(Array.from(normal.subarray(leftPaperOffset, leftPaperOffset + 4))).toEqual([
      flashed.paper.r, flashed.paper.g, flashed.paper.b, 255,
    ]);
    expect(Array.from(inverted.subarray(leftPaperOffset, leftPaperOffset + 4))).toEqual([
      flashed.ink.r, flashed.ink.g, flashed.ink.b, 255,
    ]);
    expect(Array.from(normal.subarray(rightInkOffset, rightInkOffset + 4))).toEqual([
      staticColors.paper.r, staticColors.paper.g, staticColors.paper.b, 255,
    ]);
    for (let y = 0; y < height; y += 1) {
      const row = y * 256 * 4;
      expect(inverted.subarray(row + 8 * 4, row + 16 * 4)).toEqual(
        normal.subarray(row + 8 * 4, row + 16 * 4),
      );
    }
    expect(encoded).toEqual(before);
  });

  it("rejects invalid encoded screen lengths", () => {
    expect(() => renderZxFlashPreview(new Uint8Array(6912), 1, true)).toThrow();
  });
});
