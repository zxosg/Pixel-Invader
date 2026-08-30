import { describe, expect, it } from "vitest";
import { applyBitmapCellEdit, type BitmapCell } from "./bitmap-editor.js";

const cell: BitmapCell = { rows: Uint8Array.from([0x80, 0, 0, 0, 0, 0, 0, 0]), attribute: 0x47 };

describe("bitmap cell editor model", () => {
  it("toggles and sets individual pixels immutably", () => {
    const toggled = applyBitmapCellEdit(cell, { kind: "toggle-pixel", x: 0, y: 0 });
    expect([...toggled.rows]).toEqual([0, 0, 0, 0, 0, 0, 0, 0]);
    expect([...cell.rows]).toEqual([0x80, 0, 0, 0, 0, 0, 0, 0]);
    const set = applyBitmapCellEdit(toggled, { kind: "set-pixel", x: 7, y: 7, value: true });
    expect(set.rows[7]).toBe(1);
  });

  it("inverts and shifts within the cell boundary", () => {
    expect([...applyBitmapCellEdit(cell, { kind: "invert" }).rows]).toEqual([0x7f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);
    expect([...applyBitmapCellEdit(cell, { kind: "shift", dx: 1, dy: 1 }).rows]).toEqual([0, 0x40, 0, 0, 0, 0, 0, 0]);
    expect([...applyBitmapCellEdit({ rows: Uint8Array.from([0x01, 0, 0, 0, 0, 0, 0, 0]), attribute: 0 }, { kind: "shift", dx: 1, dy: 1 }).rows]).toEqual([0, 0x80, 0, 0, 0, 0, 0, 0]);
    expect([...applyBitmapCellEdit({ rows: Uint8Array.from([0x80, 0, 0, 0, 0, 0, 0, 0]), attribute: 0 }, { kind: "shift", dx: -1, dy: -1 }).rows]).toEqual([0, 0, 0, 0, 0, 0, 0, 0x01]);
  });

  it("edits the attribute without changing bitmap rows", () => {
    const edited = applyBitmapCellEdit(cell, { kind: "set-attribute", attribute: 0x3a });
    expect(edited.attribute).toBe(0x3a);
    expect([...edited.rows]).toEqual([...cell.rows]);
  });
});
