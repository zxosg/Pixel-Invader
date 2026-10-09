import { describe, expect, it } from "vitest";
import type { CharsetAssignment, TileTransform } from "@retro-converter/zx-charset";
import {
  setCellPixel,
  stampTilemapCells,
  tileForCell,
  tileTransformToggleState,
  toggleCellPixel,
  toggleTileTransform,
} from "./tilemap-editor.js";

function assignment(overrides: Partial<CharsetAssignment> = {}): CharsetAssignment {
  return {
    characterIndex: 0,
    transform: 0,
    inverted: false,
    distance: 0,
    hamming: 0,
    ...overrides,
  };
}

describe("tilemap editor cell operations", () => {
  it("stamps tile identity, transform, polarity, and color only into requested cells", () => {
    const assignments = [assignment({ characterIndex: 0 }), assignment({ characterIndex: 1, transform: 2 })];
    const attributes = Uint8Array.from([0x07, 0x38]);
    const output = stampTilemapCells(assignments, attributes, [1], {
      characterIndex: 4,
      transform: 3,
      inverted: true,
      attribute: 0xc2,
    });

    expect(output.changed).toBe(true);
    expect(output.assignments[0]).toEqual(assignments[0]);
    expect(output.assignments[1]).toMatchObject({ characterIndex: 4, transform: 3, inverted: true });
    expect(output.attributes).toEqual(Uint8Array.from([0x07, 0xc2]));
    expect(assignments[1]?.characterIndex).toBe(1);
    expect(attributes[1]).toBe(0x38);
  });

  it("returns original arrays and no change for a no-op or invalid destination", () => {
    const assignments = [assignment({ characterIndex: 2, transform: 1, inverted: true })];
    const attributes = Uint8Array.from([0x47]);
    const stamp = { characterIndex: 2, transform: 1 as TileTransform, inverted: true, attribute: 0x47 };
    const unchanged = stampTilemapCells(assignments, attributes, [0], stamp);
    const invalid = stampTilemapCells(assignments, attributes, [8], { ...stamp, characterIndex: 3 });

    expect(unchanged.changed).toBe(false);
    expect(unchanged.assignments).toBe(assignments);
    expect(unchanged.attributes).toBe(attributes);
    expect(invalid.changed).toBe(false);
  });

  it("toggles the CCW rotation represented by CW plus Mirror X", () => {
    const ccw = toggleTileTransform(0, "rotate-ccw");

    expect(tileTransformToggleState(ccw)).toEqual({
      "mirror-x": true,
      "mirror-y": false,
      "rotate-cw": true,
    });
    expect(toggleTileTransform(ccw, "rotate-ccw")).toBe(0);
  });

  it("toggles a rendered pixel through a rotated assignment", () => {
    const charset = new Uint8Array(8);
    charset[0] = 0x80;
    const rotated = assignment({ transform: 1 });

    expect(tileForCell(charset, rotated)[0]).toBe(0x01);
    const edited = toggleCellPixel(charset, rotated, 7, 0);
    expect(tileForCell(edited, rotated)[0]).toBe(0);
  });

  it("changes the displayed pixel without changing unrelated glyph bytes", () => {
    const charset = new Uint8Array(16);
    charset[8] = 0x80;
    const edited = setCellPixel(charset, assignment({ characterIndex: 1, inverted: true }), 0, 0, true);

    expect(edited[0]).toBe(0);
    expect(edited[8]).toBe(0);
    expect(tileForCell(edited, assignment({ characterIndex: 1, inverted: true }))[0]).toBe(0xff);
  });

  it("preserves a shared glyph relationship", () => {
    const charset = new Uint8Array(8);
    const shared = assignment();
    const edited = toggleCellPixel(charset, shared, 3, 2);

    expect(tileForCell(edited, shared)[2]).toBe(0x10);
    expect(tileForCell(edited, shared)[2]).toBe(0x10);
  });

  it("maps every supported transform back to the base glyph", () => {
    const charset = new Uint8Array(8);
    charset[0] = 0x80;
    const transforms: readonly TileTransform[] = [0, 1, 2, 3, 4, 5, 6, 7];
    const expected: readonly (readonly [number, number])[] = [
      [0, 0], [7, 0], [7, 7], [0, 7],
      [7, 0], [0, 7], [0, 0], [7, 7],
    ];

    for (const [index, transform] of transforms.entries()) {
      const assignmentForTransform = assignment({ transform });
      const position = expected[index];
      if (position === undefined) throw new Error("Missing transform expectation.");
      const [x, y] = position;
      expect((tileForCell(charset, assignmentForTransform)[y] ?? 0) & (0x80 >> x)).not.toBe(0);
      const edited = toggleCellPixel(charset, assignmentForTransform, x, y);
      expect(edited[0]).toBe(0);
    }
  });

  it("edits an inverted cell in displayed coordinates", () => {
    const charset = new Uint8Array(8);
    const inverted = assignment({ inverted: true });

    expect(tileForCell(charset, inverted)[0]).toBe(0xff);
    const edited = setCellPixel(charset, inverted, 0, 0, false);
    expect(edited[0]).toBe(0x80);
    expect(tileForCell(edited, inverted)[0]).toBe(0x7f);
  });

  it("does not mutate the source charset when setting an unchanged pixel", () => {
    const charset = Uint8Array.from([0x80, 0, 0, 0, 0, 0, 0, 0]);
    const edited = setCellPixel(charset, assignment(), 0, 0, true);

    expect(edited).not.toBe(charset);
    expect([...edited]).toEqual([...charset]);
  });
});
