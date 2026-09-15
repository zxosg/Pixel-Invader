import { describe, expect, it } from "vitest";
import { ZX_BITMAP_BYTES, zxBitmapOffset, zxSoftwareScrBytes } from "@retro-converter/zx-spectrum";
import {
  applyZxCellAction,
  applyZxAttributeSelection,
  applyZxAttributeCellOperation,
  applyZxAttributeCellMaskOperation,
  copyZxAttributeCell,
  readZxAttributeCell,
  writeZxAttributeCell,
  zxAttributeCellsEqual,
} from "./bitmap-attribute-cell-editor.js";

describe("ZX attribute-cell editor", () => {
  it.each([1, 2, 4, 8] as const)("reads and applies bitmap actions at attribute height %i", (height) => {
    const scr = new Uint8Array(zxSoftwareScrBytes(height));
    scr[ZX_BITMAP_BYTES + 2 * 32 + 3] = 0x42;
    for (let y = 0; y < height; y += 1) scr[zxBitmapOffset(3, 2 * height + y)] = 0x18;
    const cell = readZxAttributeCell(scr, height, 3, 2);
    expect(cell.rows).toEqual(new Uint8Array(height).fill(0x18));
    expect(cell.attribute).toBe(0x42);
    expect(applyZxCellAction(cell, "set").rows).toEqual(new Uint8Array(height).fill(0xff));
    expect(applyZxCellAction(cell, "reset").rows).toEqual(new Uint8Array(height));
    expect(applyZxCellAction(cell, "invert").rows).toEqual(new Uint8Array(height).fill(0xe7));
  });

  it("copies bitmap rows, attributes, or both without mutating snapshots", () => {
    const destination = { cellX: 0, cellY: 0, attributeHeight: 2 as const, rows: Uint8Array.from([0x01, 0x02]), attribute: 0x11 };
    const source = { cellX: 1, cellY: 1, attributeHeight: 2 as const, rows: Uint8Array.from([0xa0, 0xb0]), attribute: 0xd6 };
    const color = copyZxAttributeCell(destination, source, "color");
    const clone = copyZxAttributeCell(destination, source, "clone");
    const both = copyZxAttributeCell(destination, source, "clone-color");
    expect(color).toMatchObject({ attribute: 0xd6 });
    expect(color.rows).toEqual(destination.rows);
    expect(clone).toMatchObject({ attribute: 0x11 });
    expect(clone.rows).toEqual(source.rows);
    expect(both).toMatchObject({ attribute: 0xd6 });
    expect(both.rows).toEqual(source.rows);
    source.rows[0] = 0;
    expect(both.rows[0]).toBe(0xa0);
  });

  it("writes complete cells and reports no-op operations", () => {
    const scr = new Uint8Array(zxSoftwareScrBytes(8));
    const cell = { cellX: 31, cellY: 23, attributeHeight: 8 as const, rows: new Uint8Array(8).fill(0xff), attribute: 0x47 };
    const updated = writeZxAttributeCell(scr, cell);
    expect(updated).not.toBe(scr);
    expect(readZxAttributeCell(updated, 8, 31, 23)).toMatchObject({ attribute: 0x47 });
    expect(applyZxAttributeCellOperation(updated, 8, 31, 23, { kind: "copy", source: readZxAttributeCell(updated, 8, 31, 23), mode: "clone-color" })).toEqual(updated);
    expect(zxAttributeCellsEqual(readZxAttributeCell(updated, 8, 31, 23), cell)).toBe(true);
  });

  it("applies selected attributes without changing bitmap rows", () => {
    const cell = { cellX: 0, cellY: 0, attributeHeight: 4 as const, rows: Uint8Array.from([0x80, 0x40, 0x20, 0x10]), attribute: 0x01 };
    const edited = applyZxAttributeSelection(cell, { ink: 6, paper: 2, bright: true, flash: true });
    expect(edited.rows).toEqual(cell.rows);
    expect(edited.attribute).toBe(0xd6);
    const transparent = applyZxAttributeSelection(cell, { ink: null, paper: null, bright: null, flash: null });
    expect(transparent.attribute).toBe(cell.attribute);
  });

  it("applies Copy, OR, AND NOT, and XOR masks at every attribute height", () => {
    for (const height of [1, 2, 4, 8] as const) {
      const scr = new Uint8Array(zxSoftwareScrBytes(height));
      for (let row = 0; row < height; row += 1) scr[zxBitmapOffset(0, row)] = 0x55;
      const mask = new Uint8Array(height).fill(0x0f);
      const copy = applyZxAttributeCellMaskOperation(scr, height, 0, 0, mask, "copy");
      const or = applyZxAttributeCellMaskOperation(scr, height, 0, 0, mask, "or");
      const and = applyZxAttributeCellMaskOperation(scr, height, 0, 0, mask, "and");
      const xor = applyZxAttributeCellMaskOperation(scr, height, 0, 0, mask, "xor");
      expect(readZxAttributeCell(copy, height, 0, 0).rows[0]).toBe(0x0f);
      expect(readZxAttributeCell(or, height, 0, 0).rows[0]).toBe(0x5f);
      expect(readZxAttributeCell(and, height, 0, 0).rows[0]).toBe(0x50);
      expect(readZxAttributeCell(xor, height, 0, 0).rows[0]).toBe(0x5a);
    }
  });

  it("rejects invalid cell coordinates and heights", () => {
    const scr = new Uint8Array(zxSoftwareScrBytes(8));
    expect(() => readZxAttributeCell(scr, 8, 32, 0)).toThrow();
    expect(() => readZxAttributeCell(scr, 4, 0, 48)).toThrow();
    expect(() => readZxAttributeCell(scr, 3 as never, 0, 0)).toThrow();
  });
});
