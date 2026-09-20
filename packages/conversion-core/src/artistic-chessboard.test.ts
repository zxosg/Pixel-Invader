import { describe, expect, it } from "vitest";
import { serializeSoftwareScr } from "@retro-converter/zx-spectrum";
import { renderSmoothChessboardZx } from "./artistic-chessboard.js";
import {
  DEFAULT_CONVERSION_SETTINGS,
  convertToZx,
} from "./index.js";

function solid(width: number, height: number, value: number): Uint8Array {
  const output = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    output.set([value, value, value, 255], pixel * 4);
  }
  return output;
}

describe("Artistic chessboard smooth v1", () => {
  it("is deterministic and prefers diagonal masks for flat mid-tones", () => {
    const source = solid(256, 192, 188);
    const attributes = new Uint8Array(32 * 24).fill(71);
    const first = renderSmoothChessboardZx(source, attributes, 8, 100);
    const second = renderSmoothChessboardZx(source, attributes, 8, 100);

    expect(first).toEqual(second);
    for (let top = 0; top < 192; top += 2) {
      for (let left = 0; left < 256; left += 2) {
        const count =
          first[top * 256 + left]! +
          first[top * 256 + left + 1]! +
          first[(top + 1) * 256 + left]! +
          first[(top + 1) * 256 + left + 1]!;
        expect(count).toBe(2);
        const diagonal =
          first[top * 256 + left] === first[(top + 1) * 256 + left + 1] &&
          first[top * 256 + left + 1] === first[(top + 1) * 256 + left];
        expect(diagonal).toBe(true);
      }
    }
  });

  it("does not replace a hard edge with a checkerboard carrier", () => {
    const source = new Uint8Array(256 * 192 * 4);
    for (let y = 0; y < 192; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const value = x < 128 ? 0 : 255;
        source.set([value, value, value, 255], (y * 256 + x) * 4);
      }
    }
    const attributes = new Uint8Array(32 * 24).fill(71);
    const output = renderSmoothChessboardZx(source, attributes, 8, 100);
    for (let y = 0; y < 192; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        expect(output[y * 256 + x]).toBe(x < 128 ? 0 : 1);
      }
    }
  });

  it("keeps 0% byte-identical to no dithering", () => {
    const source = solid(16, 16, 128);
    const ordered = convertToZx(source, 16, 16, {
      ...DEFAULT_CONVERSION_SETTINGS,
      dithering: "ordered",
      ditherEngineId: "artistic-chessboard-smooth-v1",
      ditheringAmount: 0,
      framing: "stretch",
    });
    const none = convertToZx(source, 16, 16, {
      ...DEFAULT_CONVERSION_SETTINGS,
      dithering: "none",
      ditherEngineId: "none-discrete-v2",
      ditheringAmount: 0,
      framing: "stretch",
    });
    expect(serializeSoftwareScr(ordered.screen.pixels, ordered.screen.attributes, 8))
      .toEqual(serializeSoftwareScr(none.screen.pixels, none.screen.attributes, 8));
    expect(ordered.previewRgba).toEqual(none.previewRgba);
  });

  it("keeps standard ZX output legal at full strength", () => {
    const result = convertToZx(solid(16, 16, 128), 16, 16, {
      ...DEFAULT_CONVERSION_SETTINGS,
      dithering: "ordered",
      ditherEngineId: "artistic-chessboard-smooth-v1",
      ditheringAmount: 100,
      framing: "stretch",
    });
    expect(result.pixels.every((value) => value === 0 || value === 1)).toBe(true);
    expect(result.attributes.length).toBe(32 * 24);
  });

  it("supports ZX mixed mode through legal virtual candidates", () => {
    const source = solid(16, 16, 188);
    const settings = {
      ...DEFAULT_CONVERSION_SETTINGS,
      modeId: "zx48-mixed-256x192" as const,
      dithering: "ordered" as const,
      ditherEngineId: "artistic-chessboard-smooth-v1" as const,
      ditheringAmount: 100,
      framing: "stretch" as const,
      paletteSelections: [
        DEFAULT_CONVERSION_SETTINGS.paletteSelections[0]!,
        { ...DEFAULT_CONVERSION_SETTINGS.paletteSelections[0]!, screenIndex: 1 },
      ],
    };
    const result = convertToZx(source, 16, 16, settings);
    expect(result.frames).toHaveLength(2);
    expect(result.frames.every((frame) => frame.encoded.length > 0)).toBe(true);
  });
});
