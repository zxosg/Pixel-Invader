import { describe, expect, it } from "vitest";
import {
  decodeImage,
  encodeRgbaPng,
} from "@retro-converter/image-codecs";
import {
  DEFAULT_CONVERSION_SETTINGS,
  convertToZx,
} from "@retro-converter/conversion-core";
import { convertScrToCharset } from "@retro-converter/zx-charset";

const INDEXED_PNG = Uint8Array.from([
  137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 3, 0, 0, 0, 1, 8, 3, 0, 0, 0, 44, 62, 228, 134,
  0, 0, 0, 9, 80, 76, 84, 69, 4, 8, 12, 120, 80, 40, 240, 220,
  200, 125, 216, 189, 250, 0, 0, 0, 12, 73, 68, 65, 84, 120, 94,
  99, 96, 98, 96, 4, 0, 0, 11, 0, 4, 173, 80, 91, 61, 0, 0, 0,
  0, 73, 69, 78, 68, 174, 66, 96, 130,
]);

describe("indexed PNG conversion normalization", () => {
  it("matches equivalent true-color palette and tilemap conversion results", () => {
    const rgba = Uint8Array.from([
      240, 220, 200, 255,
      4, 8, 12, 255,
      120, 80, 40, 255,
    ]);
    const indexed = decodeImage(INDEXED_PNG);
    const trueColor = decodeImage(encodeRgbaPng(rgba, 3, 1));
    const settings = {
      ...DEFAULT_CONVERSION_SETTINGS,
      framing: "stretch" as const,
    };
    const indexedConversion = convertToZx(
      indexed.rgba,
      indexed.width,
      indexed.height,
      settings,
      "draft",
    );
    const trueColorConversion = convertToZx(
      trueColor.rgba,
      trueColor.width,
      trueColor.height,
      settings,
      "draft",
    );

    expect(indexedConversion.frames[0]!.encoded).toEqual(
      trueColorConversion.frames[0]!.encoded,
    );
    expect(indexedConversion.previewRgba).toEqual(
      trueColorConversion.previewRgba,
    );
    expect(indexedConversion.score).toBe(trueColorConversion.score);

    const charsetOptions = {
      source: "derived" as const,
      characterBudget: 8,
      encoding: "compact" as const,
      allowTransforms: true,
      allowPolarity: true,
      derivedStrategy: "frequency" as const,
      distanceMetric: "hybrid" as const,
      visualWeighting: false,
      swapRefinementPasses: 0,
    };
    const indexedTilemap = convertScrToCharset(
      indexedConversion.frames[0]!.encoded,
      charsetOptions,
    );
    const trueColorTilemap = convertScrToCharset(
      trueColorConversion.frames[0]!.encoded,
      charsetOptions,
    );

    expect(indexedTilemap.artifact.bytes).toEqual(
      trueColorTilemap.artifact.bytes,
    );
    expect(indexedTilemap.previewRgba).toEqual(
      trueColorTilemap.previewRgba,
    );
  });
});
