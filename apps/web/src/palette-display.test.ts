import { describe, expect, it } from "vitest";
import { distinctPreviewColors } from "./palette-display.js";

describe("output palette display", () => {
  it("returns only used RGB colors in deterministic order", () => {
    expect(distinctPreviewColors(Uint8Array.from([
      255, 0, 0, 255,
      0, 0, 0, 255,
      255, 0, 0, 64,
      0, 255, 255, 255,
    ]))).toEqual([
      "#000000",
      "#00ffff",
      "#ff0000",
    ]);
  });
});

