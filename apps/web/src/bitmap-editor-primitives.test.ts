import { describe, expect, it } from "vitest";
import { ORDERED_MATRICES } from "@retro-converter/conversion-core";
import {
  bitmapCustomPatternOn,
  bitmapPrimitiveStippleOn,
  bitmapPrimitivePointsPath,
  rasterizeBitmapBrushStroke,
  rasterizeBitmapPrimitive,
  sampleBitmapPrimitivePattern,
} from "./bitmap-editor-primitives.js";
import { applyBitmapEditorOperation, bitmapEditorBrushPixels } from "./bitmap-editor-tools.js";

const line = (from: { x: number; y: number }, to: { x: number; y: number }) =>
  rasterizeBitmapPrimitive("line", from, to, 8, 8).outline;

describe("bitmap editor primitive rasterization", () => {
  it("rasterizes inclusive horizontal, vertical, and diagonal lines", () => {
    expect(line({ x: 1, y: 2 }, { x: 4, y: 2 })).toEqual([
      { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 4, y: 2 },
    ]);
    expect(line({ x: 3, y: 1 }, { x: 3, y: 4 })).toEqual([
      { x: 3, y: 1 }, { x: 3, y: 2 }, { x: 3, y: 3 }, { x: 3, y: 4 },
    ]);
    expect(line({ x: 0, y: 0 }, { x: 3, y: 3 })).toHaveLength(4);
  });

  it("rasterizes a filled circle and its outline from center and radius point", () => {
    const raster = rasterizeBitmapPrimitive("circle", { x: 3, y: 3 }, { x: 5, y: 3 }, 8, 8);
    expect(raster.fill).toContainEqual({ x: 3, y: 3 });
    expect(raster.fill).toContainEqual({ x: 5, y: 3 });
    expect(raster.outline).toContainEqual({ x: 3, y: 1 });
    expect(raster.outline).toContainEqual({ x: 3, y: 5 });
    expect(raster.fill.length).toBeGreaterThan(raster.outline.length);
  });

  it("rasterizes an inclusive filled rectangle and ellipse", () => {
    const rectangle = rasterizeBitmapPrimitive("rectangle", { x: 4, y: 3 }, { x: 1, y: 1 }, 8, 8);
    expect(rectangle.fill).toHaveLength(12);
    expect(rectangle.outline).toContainEqual({ x: 2, y: 1 });
    expect(rectangle.outline).not.toContainEqual({ x: 2, y: 2 });

    const ellipse = rasterizeBitmapPrimitive("ellipse", { x: 1, y: 1 }, { x: 5, y: 5 }, 8, 8);
    expect(ellipse.fill).toContainEqual({ x: 3, y: 3 });
    expect(ellipse.outline).toContainEqual({ x: 3, y: 1 });
    expect(ellipse.outline).not.toContainEqual({ x: 3, y: 3 });
  });

  it("clips primitive geometry at bitmap boundaries", () => {
    const raster = rasterizeBitmapPrimitive("circle", { x: 0, y: 0 }, { x: 3, y: 0 }, 4, 3);
    expect(raster.fill.every(({ x, y }) => x >= 0 && x < 4 && y >= 0 && y < 3)).toBe(true);
    expect(raster.outline.every(({ x, y }) => x >= 0 && x < 4 && y >= 0 && y < 3)).toBe(true);
  });

  it("stamps the existing top-left anchored brush footprint without duplicate pixels", () => {
    const points = rasterizeBitmapBrushStroke([{ x: 0, y: 0 }, { x: 1, y: 0 }], (x, y) =>
      bitmapEditorBrushPixels(x, y, "2x2", 4, 4),
    );
    expect(points).toHaveLength(6);
  });

  it("aligns stipple phase to absolute target pixels", () => {
    const matrix = ORDERED_MATRICES["bayer-2x2"];
    expect(bitmapPrimitiveStippleOn(0, 0, matrix, 50)).toBe(bitmapPrimitiveStippleOn(2, 0, matrix, 50));
    expect(bitmapPrimitiveStippleOn(0, 0, matrix, 0)).toBe(false);
    expect(bitmapPrimitiveStippleOn(0, 0, matrix, 100)).toBe(true);
  });

  it("tiles sampled 8×8 custom patterns from the target origin", () => {
    const pattern = new Uint8Array(64);
    pattern[0] = 1;
    pattern[63] = 1;
    expect(bitmapCustomPatternOn(0, 0, pattern)).toBe(true);
    expect(bitmapCustomPatternOn(8, 8, pattern)).toBe(true);
    expect(bitmapCustomPatternOn(1, 0, pattern)).toBe(false);
    expect(bitmapCustomPatternOn(7, 7, pattern)).toBe(true);
  });

  it("samples non-background native palette pixels as ON in an 8×8 custom mask", () => {
    const indices = new Uint8Array(16 * 16);
    indices[2 * 16 + 3] = 5;
    const pattern = sampleBitmapPrimitivePattern(indices, 16, 16, { x: 7, y: 4 });
    expect(pattern[2 * 8 + 3]).toBe(1);
    expect(pattern[0]).toBe(0);
    expect(pattern).toHaveLength(64);
  });

  it("applies the shared bitmap operation semantics to patterned ON and OFF bits", () => {
    expect(applyBitmapEditorOperation(1, 0, "copy")).toBe(0);
    expect(applyBitmapEditorOperation(1, 0, "or")).toBe(1);
    expect(applyBitmapEditorOperation(1, 0, "and")).toBe(1);
    expect(applyBitmapEditorOperation(1, 0, "xor")).toBe(1);
    expect(applyBitmapEditorOperation(1, 1, "and")).toBe(0);
    expect(applyBitmapEditorOperation(1, 1, "none")).toBe(1);
  });

  it("encodes pixel paths as compact row runs for the live preview", () => {
    expect(bitmapPrimitivePointsPath([
      { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }, { x: 1, y: 3 },
    ])).toBe("M1 2h3v1h-3zM1 3h1v1h-1z");
  });
});
