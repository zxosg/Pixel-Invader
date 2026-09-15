import { describe, expect, it } from "vitest";
import {
  applyBitmapEditorOperation,
  bitmapEditorBrushPixels,
  bitmapEditorCellModeLabel,
  bitmapEditorOperationDescription,
  bitmapEditorOperationLabel,
  nextBitmapEditorBrushSize,
  nextBitmapEditorCellMode,
  nextBitmapEditorOperation,
} from "./bitmap-editor-tools.js";

describe("bitmap editor tools", () => {
  it("cycles operations and cell modes", () => {
    expect(nextBitmapEditorOperation("copy")).toBe("or");
    expect(nextBitmapEditorOperation("or")).toBe("and");
    expect(nextBitmapEditorOperation("and")).toBe("xor");
    expect(nextBitmapEditorOperation("xor")).toBe("none");
    expect(nextBitmapEditorOperation("none")).toBe("copy");
    expect(nextBitmapEditorCellMode("filled")).toBe("picked");
    expect(nextBitmapEditorCellMode("picked")).toBe("filled");
    expect(bitmapEditorCellModeLabel("filled")).toBe("FILL");
    expect(bitmapEditorCellModeLabel("picked")).toBe("TILE");
    expect(bitmapEditorOperationLabel("copy")).toBe("SET");
    expect(bitmapEditorOperationLabel("or")).toBe("OVR");
    expect(bitmapEditorOperationLabel("and")).toBe("RES");
    expect(bitmapEditorOperationLabel("xor")).toBe("INV");
    expect(bitmapEditorOperationLabel("none")).toBe("NONE");
    expect(bitmapEditorOperationDescription("copy")).toBe("Copy");
    expect(bitmapEditorOperationDescription("and")).toBe("AND NOT");
    expect(bitmapEditorOperationDescription("and", "pixel")).toBe("Reset");
  });

  it("cycles all requested brush sizes", () => {
    expect(nextBitmapEditorBrushSize("1x1")).toBe("2x2");
    expect(nextBitmapEditorBrushSize("2x2")).toBe("3x3");
    expect(nextBitmapEditorBrushSize("3x3")).toBe("4x4");
    expect(nextBitmapEditorBrushSize("4x4")).toBe("1x1");
  });

  it("clips the top-left anchored brush at screen edges", () => {
    expect(bitmapEditorBrushPixels(3, 2, "4x4", 5, 5)).toEqual([
      { x: 3, y: 2 }, { x: 4, y: 2 },
      { x: 3, y: 3 }, { x: 4, y: 3 },
      { x: 3, y: 4 }, { x: 4, y: 4 },
    ]);
    expect(bitmapEditorBrushPixels(4, 4, "1x1", 5, 5)).toEqual([{ x: 4, y: 4 }]);
  });

  it("implements Copy, OR, AND, XOR, and no-op semantics", () => {
    expect(applyBitmapEditorOperation(0, 1, "copy")).toBe(1);
    expect(applyBitmapEditorOperation(1, 0, "copy")).toBe(0);
    expect(applyBitmapEditorOperation(0, 1, "or")).toBe(1);
    expect(applyBitmapEditorOperation(1, 1, "and")).toBe(0);
    expect(applyBitmapEditorOperation(1, 0, "and")).toBe(1);
    expect(applyBitmapEditorOperation(0, 1, "xor")).toBe(1);
    expect(applyBitmapEditorOperation(1, 1, "xor")).toBe(0);
    expect(applyBitmapEditorOperation(1, 1, "none")).toBe(1);
  });

  it("uses AND NOT semantics for cell RES", () => {
    expect(applyBitmapEditorOperation(1, 1, "and")).toBe(0);
    expect(applyBitmapEditorOperation(1, 0, "and")).toBe(1);
  });
});
