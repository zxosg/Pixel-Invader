import { describe, expect, it } from "vitest";
import {
  bitmapEditorCell,
  cloneBitmapBuffer,
  paintPixel,
  paintPixels,
  type BitmapEditorBuffer,
} from "./full-bitmap-editor.js";

function buffer(): BitmapEditorBuffer {
  return { width: 4, height: 3, rgba: Uint8Array.from({ length: 48 }, (_, index) => index % 4 === 3 ? 255 : 10) };
}

describe("full bitmap editor model", () => {
  it("paints set, reset, and toggle without mutating the input", () => {
    const original = buffer();
    const set = paintPixel(original, 1, 1, "set");
    expect([...original.rgba.slice(20, 24)]).toEqual([10, 10, 10, 255]);
    expect([...set.rgba.slice(20, 24)]).toEqual([255, 255, 255, 255]);
    const reset = paintPixel(set, 1, 1, "reset");
    expect([...reset.rgba.slice(20, 24)]).toEqual([0, 0, 0, 255]);
    const toggled = paintPixel(reset, 1, 1, "toggle");
    expect([...toggled.rgba.slice(20, 24)]).toEqual([255, 255, 255, 255]);
  });

  it("deduplicates pixels within one stroke", () => {
    const next = paintPixels(buffer(), [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 3, y: 2 }], "set");
    expect([...next.rgba.slice(0, 4)]).toEqual([255, 255, 255, 255]);
    expect([...next.rgba.slice(44, 48)]).toEqual([255, 255, 255, 255]);
  });

  it("maps pixels through arbitrary attribute geometry", () => {
    expect(bitmapEditorCell({ x: 13, y: 9 }, { attributeWidth: 8, attributeHeight: 4 })).toEqual({
      cellX: 1, cellY: 2, localX: 5, localY: 1,
    });
    expect(bitmapEditorCell({ x: 7, y: 3 }, { attributeWidth: 6, attributeHeight: 1 })).toEqual({
      cellX: 1, cellY: 3, localX: 1, localY: 0,
    });
    expect(bitmapEditorCell({ x: 1, y: 1 }, { attributeWidth: null, attributeHeight: null })).toBeNull();
  });

  it("clones buffers for history snapshots", () => {
    const original = buffer();
    const snapshot = cloneBitmapBuffer(original);
    snapshot.rgba[0] = 255;
    expect(original.rgba[0]).toBe(10);
  });

  it("uses logical pixel state and target colors when provided", () => {
    const original: BitmapEditorBuffer = {
      width: 1,
      height: 1,
      rgba: Uint8Array.from([12, 34, 56, 255]),
      pixels: Uint8Array.from([1]),
    };
    const colors = (x: number, y: number, on: boolean) => {
      expect([x, y]).toEqual([0, 0]);
      return on ? [1, 2, 3, 255] as const : [4, 5, 6, 255] as const;
    };
    const reset = paintPixel(original, 0, 0, "reset", colors);
    expect([...reset.rgba]).toEqual([4, 5, 6, 255]);
    expect(reset.pixels?.[0]).toBe(0);
    const toggled = paintPixel(reset, 0, 0, "toggle", colors);
    expect([...toggled.rgba]).toEqual([1, 2, 3, 255]);
    expect(toggled.pixels?.[0]).toBe(1);
  });

  it("leaves the pixel unchanged in None mode", () => {
    const original: BitmapEditorBuffer = {
      width: 1,
      height: 1,
      rgba: Uint8Array.from([12, 34, 56, 255]),
      pixels: Uint8Array.from([1]),
    };
    const unchanged = paintPixel(original, 0, 0, "none");
    expect([...unchanged.rgba]).toEqual([...original.rgba]);
    expect(unchanged.pixels?.[0]).toBe(1);
  });
});
