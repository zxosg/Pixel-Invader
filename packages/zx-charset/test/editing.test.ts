import { describe, expect, it } from "vitest";
import { applyTileEdit } from "../src/editing.js";

describe("tile editing", () => {
  it("toggles a pixel without mutating the input", () => {
    const source = new Uint8Array([0x80, 0, 0, 0, 0, 0, 0, 0]);
    expect(applyTileEdit(source, { kind: "xor-pixel", x: 0, y: 0 })).toEqual(new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]));
    expect(source[0]).toBe(0x80);
  });

  it("rotates rows cyclically", () => {
    const source = new Uint8Array([0x80, 0, 0, 0, 0, 0, 0, 0]);
    expect(applyTileEdit(source, { kind: "rotate-right" })[0]).toBe(0x40);
    expect(applyTileEdit(source, { kind: "rotate-left" })[0]).toBe(0x01);
    expect(applyTileEdit(source, { kind: "rotate-down" })[1]).toBe(0x80);
    expect(applyTileEdit(source, { kind: "rotate-up" })[7]).toBe(0x80);
  });

  it("clears and inverts", () => {
    const source = new Uint8Array([0x00, 0xff, 0, 0, 0, 0, 0, 0]);
    expect(applyTileEdit(source, { kind: "clear" })).toEqual(new Uint8Array(8));
    expect(applyTileEdit(source, { kind: "invert" })[1]).toBe(0x00);
  });
});
