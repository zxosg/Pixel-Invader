import { describe, expect, it } from "vitest";
import { createBlankScreen, serializeScr, ZX_SCR_BYTES } from "@retro-converter/zx-spectrum";
import { decodeZxScrSource } from "./zx-scr-import.js";

describe("ZX Spectrum SCR source import", () => {
  it("renders the native 6,912-byte screen as a 256×192 opaque image", () => {
    const bytes = serializeScr(createBlankScreen(0x0a));
    const decoded = decodeZxScrSource(bytes);

    expect(bytes).toHaveLength(ZX_SCR_BYTES);
    expect(decoded).toMatchObject({ format: "png", width: 256, height: 192 });
    expect(decoded.rgba).toHaveLength(256 * 192 * 4);
    expect([...decoded.rgba.slice(0, 4)]).toEqual([0, 0, 205, 255]);
  });

  it("rejects files that are not exactly 6,912 bytes", () => {
    expect(() => decodeZxScrSource(new Uint8Array(ZX_SCR_BYTES - 1)))
      .toThrow("Expected 6912 bytes, received 6911.");
  });
});
