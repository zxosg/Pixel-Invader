import { describe, expect, it } from "vitest";
import {
  allCharsetIndices,
  effectiveCharsetSelection,
  invertCharsetSelection,
  mapSourceTileToOutputIndex,
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

  it("can restore an excluded source tile by its original index", () => {
    const sourceCount = 6;
    const afterExcludingTile = toggleCharsetSelection(null, sourceCount, 4);
    expect(afterExcludingTile).toEqual([0, 1, 2, 3, 5]);
    expect(toggleCharsetSelection(afterExcludingTile, sourceCount, 4)).toEqual(
      allCharsetIndices(sourceCount),
    );
  });

  it("maps source indices to compacted output positions without assuming identity", () => {
    const outputSourceIndices = [2, 7, null, 11] as const;
    expect(mapSourceTileToOutputIndex(2, outputSourceIndices)).toBe(0);
    expect(mapSourceTileToOutputIndex(11, outputSourceIndices)).toBe(3);
    expect(mapSourceTileToOutputIndex(7, outputSourceIndices)).toBe(1);
    expect(mapSourceTileToOutputIndex(5, outputSourceIndices)).toBe(-1);
    expect(mapSourceTileToOutputIndex(2, null)).toBe(-1);
  });

  it("remaps selection indices after charset reordering or deletion", () => {
    expect(remapCharsetSelection([0, 2], [2, 0, 1])).toEqual([1, 2]);
    expect(remapCharsetSelection([0, 2], [0, -1, 1])).toEqual([0, 1]);
    expect(remapCharsetSelection(null, [2, 0, 1])).toBeNull();
  });
});
