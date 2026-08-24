import { describe, expect, it } from "vitest";
import {
  QL_SCREEN_BYTES,
  assertValidQlScreen,
  decodeQlScreen,
  encodeQlScreen,
} from "../src/index.js";

describe("Sinclair QL screen encoding", () => {
  it("round-trips Mode 8 and keeps FLASH clear", () => {
    const pixels = new Uint8Array(256 * 256);
    for (let index = 0; index < pixels.length; index += 1) pixels[index] = index & 7;
    const encoded = encodeQlScreen(pixels, "mode8-256x256");
    expect(encoded).toHaveLength(QL_SCREEN_BYTES);
    expect(Array.from(encoded.filter((_, index) => index % 2 === 0))
      .every((value) => (value & 0x55) === 0)).toBe(true);
    expect(decodeQlScreen(encoded, "mode8-256x256")).toEqual(pixels);
  });

  it("round-trips Mode 4", () => {
    const pixels = new Uint8Array(512 * 256);
    for (let index = 0; index < pixels.length; index += 1) pixels[index] = index & 3;
    const encoded = encodeQlScreen(pixels, "mode4-512x256");
    expect(encoded).toHaveLength(QL_SCREEN_BYTES);
    expect(decodeQlScreen(encoded, "mode4-512x256")).toEqual(pixels);
  });

  it("rejects Mode 8 FLASH bits", () => {
    const bytes = new Uint8Array(QL_SCREEN_BYTES);
    bytes[0] = 1;
    expect(() => assertValidQlScreen(bytes, "mode8-256x256")).toThrow("FLASH");
  });
});
