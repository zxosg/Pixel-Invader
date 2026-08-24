import { describe, expect, it } from "vitest";
import {
  ZX_BITMAP_BYTES,
  serializeSoftwareScr,
  zxBitmapOffset,
} from "@retro-converter/zx-spectrum";
import {
  buildInspectionReport,
  buildGridPath,
  inspectSoftwareScr,
  mapSynchronizedScroll,
  summarizePaletteUsage,
} from "./inspection.js";

describe("screen inspection", () => {
  it("places grid lines on logical pixel boundaries", () => {
    const pixelGrid = buildGridPath(1, 1);
    expect(pixelGrid).toContain("M1 0V192");
    expect(pixelGrid).toContain("M255 0V192");
    expect(pixelGrid).not.toContain("M0 0V192");
    const attributeGrid = buildGridPath(8, 4);
    expect(attributeGrid).toContain("M8 0V192");
    expect(attributeGrid).toContain("M0 4H256");
  });

  it("maps synchronized scroll once by normalized position", () => {
    expect(mapSynchronizedScroll(
      { left: 300, top: 150 },
      { width: 600, height: 300 },
      { width: 1_200, height: 900 },
    )).toEqual({ left: 600, top: 450 });
  });

  it("decodes variable-height attributes and bitmap pixels", () => {
    const pixels = new Uint8Array(256 * 192);
    pixels[3 * 256 + 10] = 1;
    const attributes = new Uint8Array(32 * 48);
    attributes[1] = 0x54;
    const scr = serializeSoftwareScr(pixels, attributes, 4);
    const inspected = inspectSoftwareScr(scr, 4, 10, 3);
    expect(inspected).toMatchObject({
      cellX: 1,
      cellY: 0,
      attributeOffset: 1,
      attribute: 0x54,
      ink: 4,
      paper: 2,
      bright: true,
      pixel: 1,
      selectedColor: 4,
    });
    expect(inspected.bitmapBytes[3]).toBe(scr[zxBitmapOffset(1, 3)]);
  });

  it("summarizes palette and brightness-plane usage", () => {
    const attributes = new Uint8Array(768);
    attributes[0] = 0x0a;
    attributes[1] = 0x64;
    const scr = serializeSoftwareScr(new Uint8Array(256 * 192), attributes, 8);
    expect(summarizePaletteUsage(scr, 8)).toEqual({
      baseColorCodes: [0, 1, 2, 4],
      normalColorCodes: [0, 1, 2],
      brightColorCodes: [4],
      normalCells: 767,
      brightCells: 1,
    });
  });

  it("builds a lossless diagnostic report", () => {
    const scr = serializeSoftwareScr(
      new Uint8Array(256 * 192),
      new Uint8Array(32 * 192),
      1,
    );
    const report = buildInspectionReport(scr, 1, [0, 2, 4]);
    expect(report).toMatchObject({
      attribute_size: "8x1",
      attribute_rows: 192,
      bitmap_bytes: ZX_BITMAP_BYTES,
      attribute_bytes: 6_144,
      total_bytes: 12_288,
      enabled_base_color_codes: [0, 2, 4],
    });
    expect(String(report.attributes_hex)).toHaveLength(12_288);
  });
});
