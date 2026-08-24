import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createBlankScreen,
  parseScr,
  serializeScr,
  serializeSoftwareScr,
  validateSoftwareScr,
  validateScr,
  validateScreen,
  ZX_BITMAP_BYTES,
  ZX_SCR_BYTES,
} from "../src/index.js";

describe(".scr serialization", () => {
  it("produces the independently fixed blank-screen golden hash", () => {
    const bytes = serializeScr(createBlankScreen());
    const digest = createHash("sha256").update(bytes).digest("hex");

    expect(bytes).toHaveLength(ZX_SCR_BYTES);
    expect(digest).toBe(
      "35f6d008cb12b48253e64c6641bdcc50540cc9077210e22be3ee4ff5b93cff95",
    );
  });

  it("packs the leftmost pixel into bit 7 and rightmost into bit 0", () => {
    const left = createBlankScreen();
    left.pixels[0] = 1;
    expect(serializeScr(left)[0]).toBe(0x80);

    const right = createBlankScreen();
    right.pixels[7] = 1;
    expect(serializeScr(right)[0]).toBe(0x01);
  });

  it("round-trips pixels and attributes", () => {
    const screen = createBlankScreen(0x47);
    for (let y = 0; y < 192; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        screen.pixels[y * 256 + x] = (x + y) % 3 === 0 ? 1 : 0;
      }
    }

    const parsed = parseScr(serializeScr(screen));
    expect(parsed.pixels).toEqual(screen.pixels);
    expect(parsed.attributes).toEqual(screen.attributes);
  });

  it("rejects invalid pixels and FLASH attributes", () => {
    const invalidPixel = createBlankScreen();
    invalidPixel.pixels[123] = 2;
    expect(validateScreen(invalidPixel)[0]?.code).toBe("SCREEN_PIXEL_VALUE");

    const invalidAttribute = createBlankScreen();
    invalidAttribute.attributes[10] = 0x80;
    expect(validateScreen(invalidAttribute)[0]?.code).toBe(
      "SCREEN_FLASH_SET",
    );
    expect(() => serializeScr(invalidAttribute)).toThrow();
  });

  it("rejects malformed .scr length and FLASH bytes", () => {
    expect(validateScr(new Uint8Array(ZX_SCR_BYTES - 1))[0]?.code).toBe(
      "SCR_LENGTH",
    );

    const bytes = serializeScr(createBlankScreen());
    bytes[ZX_BITMAP_BYTES] = 0x80;
    expect(validateScr(bytes)[0]?.code).toBe("SCR_FLASH_SET");
    expect(() => parseScr(bytes)).toThrow();
  });

  it("serializes software modes with an extended attribute section", () => {
    const pixels = new Uint8Array(256 * 192);
    for (const attributeHeight of [8, 4, 2, 1] as const) {
      const attributes = new Uint8Array(32 * (192 / attributeHeight));
      attributes.fill(0x47);
      const bytes = serializeSoftwareScr(pixels, attributes, attributeHeight);
      expect(bytes).toHaveLength(6_144 + attributes.length);
      expect(bytes.subarray(ZX_BITMAP_BYTES)).toEqual(attributes);
      expect(validateSoftwareScr(bytes, attributeHeight)).toEqual([]);
    }
  });
});
