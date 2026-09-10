import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  PMD85_COLORACE_CANONICAL_PAIRS,
  PMD85_COLORACE_PAIR_MATRIX,
  PMD85_COLORACE_PURE_PALETTE,
  PMD85_GAP_BYTES,
  PMD85_SCREEN_WIDTH,
  PMD85_VISIBLE_BYTES,
  PMD85_VRAM_BYTES,
  assertValidPmd85Screen,
  colorAceInkIndex,
  decodePmd85Rgba,
  decodePmd85Screen,
  encodePmd85Screen,
  pmd85Address,
} from "../src/index";

describe("PMD 85 VRAM codec", () => {
  it("validates the exact 16 KiB raw format and visible addressing", () => {
    expect(() => assertValidPmd85Screen(new Uint8Array(PMD85_VRAM_BYTES))).not.toThrow();
    expect(() => assertValidPmd85Screen(new Uint8Array(PMD85_VRAM_BYTES - 1))).toThrow(/exactly 16384/);
    expect(pmd85Address(0, 0)).toBe(0xc000);
    expect(pmd85Address(255, 47)).toBe(0xffef);
    expect(() => pmd85Address(0, 48)).toThrow();
  });

  it("decodes the six pixel bits LSB-left and never displays row gaps", () => {
    const bytes = new Uint8Array(PMD85_VRAM_BYTES);
    bytes[0] = 0b0000_0001;
    bytes[47] = 0b0010_0000;
    bytes[48] = 0xff;
    const decoded = decodePmd85Screen(bytes, "pmd85-3-rgb");
    expect([...decoded.paletteIndices.slice(0, 6)]).toEqual([1, 0, 0, 0, 0, 0]);
    expect(decoded.paletteIndices[PMD85_SCREEN_WIDTH - 1]).toBe(1);
    expect(decoded.gapBytes[0]).toBe(0xff);
  });

  it("treats PMD 85-2 TV/CV bit 7 as static intensity", () => {
    const bytes = new Uint8Array(PMD85_VRAM_BYTES);
    for (let attr = 0; attr < 4; attr += 1) bytes[attr] = (attr << 6) | 1;
    const decoded = decodePmd85Screen(bytes, "pmd85-2-tv");
    expect([0, 1, 2, 3].map((byteX) => decoded.paletteIndices[byteX * 6])).toEqual([1, 2, 1, 2]);
    expect([...decoded.attributes.slice(0, 4)]).toEqual([0, 1, 2, 3]);
  });

  it("decodes all four PMD 85-3 TV/CV attributes as distinct gray levels", () => {
    const bytes = new Uint8Array(PMD85_VRAM_BYTES);
    for (let attr = 0; attr < 4; attr += 1) bytes[attr] = (attr << 6) | 1;
    const decoded = decodePmd85Screen(bytes, "pmd85-3-tv");
    expect([0, 1, 2, 3].map((byteX) => decoded.paletteIndices[byteX * 6]))
      .toEqual([1, 2, 3, 4]);
    expect([...decoded.attributes.slice(0, 4)]).toEqual([0, 1, 2, 3]);
  });

  it("implements every ColorAce pair and canonical encoding", () => {
    for (let even = 0; even < 4; even += 1) {
      for (let odd = 0; odd < 4; odd += 1) {
        expect(colorAceInkIndex(even, odd)).toBe(PMD85_COLORACE_PAIR_MATRIX[even]![odd]);
      }
    }
    PMD85_COLORACE_CANONICAL_PAIRS.forEach(([even, odd], ink) => {
      expect(colorAceInkIndex(even, odd)).toBe(ink);
      expect(colorAceInkIndex(odd, even)).toBe(ink);
    });
  });

  it("preserves imported gaps or sanitizes them without changing visible bytes", () => {
    const masks = new Uint8Array(PMD85_VISIBLE_BYTES).fill(0x15);
    const attrs = new Uint8Array(PMD85_VISIBLE_BYTES).fill(3);
    const gaps = new Uint8Array(PMD85_GAP_BYTES).fill(0xa5);
    const preserved = encodePmd85Screen(masks, attrs, "preserve-imported", gaps);
    const sanitized = encodePmd85Screen(masks, attrs, "zero");
    expect(decodePmd85Screen(preserved, "pmd85-3-rgb").gapBytes.every((value) => value === 0xa5)).toBe(true);
    expect(decodePmd85Screen(sanitized, "pmd85-3-rgb").gapBytes.every((value) => value === 0)).toBe(true);
    expect(decodePmd85Screen(preserved, "pmd85-3-rgb").attributes.every((value) => value === 3)).toBe(true);
  });

  it("round-trips all original visible attributes, including TV/CV bit 7", () => {
    const original = new Uint8Array(PMD85_VRAM_BYTES);
    for (let y = 0; y < 256; y += 1) {
      for (let x = 0; x < 48; x += 1) original[y * 64 + x] = ((x & 3) << 6) | ((x + y) & 0x3f);
      original.fill(y & 0xff, y * 64 + 48, y * 64 + 64);
    }
    const decoded = decodePmd85Screen(original, "pmd85-2-tv");
    expect(encodePmd85Screen(decoded.pixelMasks, decoded.attributes, "preserve-imported", decoded.gapBytes)).toEqual(original);
  });
});

describe("ColorAce reference fixture", () => {
  it("matches the normative binary and decoded RGBA hashes", () => {
    const file = new Uint8Array(readFileSync(new URL("../../../specs/magicland.bin", import.meta.url)));
    expect(createHash("sha256").update(file).digest("hex")).toBe(
      "1f442feedd069d330c3728e5ee831b67b4a5f1db83f5d5b06d706a23213bf7eb",
    );
    const rgba = decodePmd85Rgba(file, "pmd85-colorace", PMD85_COLORACE_PURE_PALETTE);
    expect(createHash("sha256").update(rgba).digest("hex")).toBe(
      "124fc62c10438650f6005c3321e83f3f1ef1de488be5227d4cdccd01fa4ff5ee",
    );
  });
});
