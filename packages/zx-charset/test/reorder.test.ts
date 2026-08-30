import { describe, expect, it } from "vitest";
import { reorderCharsetTiles } from "../src/editing.js";

const assignment = (characterIndex: number) => ({
  characterIndex,
  transform: 0 as const,
  inverted: false,
  distance: 0,
  hamming: 0,
});

describe("charset tile reordering", () => {
  it("reorders tiles and remaps assignments", () => {
    const result = reorderCharsetTiles(
      new Uint8Array([1, 1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2]),
      [assignment(0), assignment(1)],
      [1, 0],
    );
    expect(result.charset[0]).toBe(2);
    expect(result.charset[8]).toBe(1);
    expect(result.assignments.map((item) => item.characterIndex)).toEqual([1, 0]);
  });
});
