import { describe, expect, it } from "vitest";
import {
  allCharsetIndices,
  effectiveCharsetSelection,
  invertCharsetSelection,
  remapCharsetSelection,
  toggleCharsetSelection,
} from "./charset-selection.js";

describe("charset selection model", () => {
  it("treats null selection as all tiles", () => {
    expect(allCharsetIndices(4)).toEqual([0, 1, 2, 3]);
    expect(effectiveCharsetSelection(null, 4)).toEqual([0, 1, 2, 3]);
  });

  it("toggles one tile and inverts the complete selection", () => {
    expect(toggleCharsetSelection(null, 4, 2)).toEqual([0, 1, 3]);
    expect(toggleCharsetSelection([0, 1, 3], 4, 2)).toEqual([0, 1, 2, 3]);
    expect(invertCharsetSelection([0, 2], 4)).toEqual([1, 3]);
  });

  it("remaps selection indices after charset reordering or deletion", () => {
    expect(remapCharsetSelection([0, 2], [2, 0, 1])).toEqual([1, 2]);
    expect(remapCharsetSelection([0, 2], [0, -1, 1])).toEqual([0, 1]);
    expect(remapCharsetSelection(null, [2, 0, 1])).toBeNull();
  });
});
