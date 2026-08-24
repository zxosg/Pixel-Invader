import { describe, expect, it } from "vitest";
import type { ConvertCharsetRequest } from "./protocol";
import { restoreCharsetConversionOptions } from "./charset-options";

describe("charset worker options", () => {
  it("preserves arbitrary indices instead of selecting the first N tiles", () => {
    const existingCharset = Uint8Array.from(
      { length: 14 * 8 },
      (_, index) => index,
    );
    const options: ConvertCharsetRequest["options"] = {
      source: "existing",
      characterBudget: 2,
      encoding: "compact",
      allowTransforms: true,
      allowPolarity: true,
      derivedStrategy: "image-similarity-v2",
      distanceMetric: "image-similarity-v2",
      visualWeighting: true,
      swapRefinementPasses: 4,
      existingCharsetRange: { startIndex: 0, length: 14 },
      existingCharsetSelection: { indices: [11, 12] },
      existingCharset: existingCharset.buffer,
    };

    const restored = restoreCharsetConversionOptions(options);

    expect(restored.existingCharsetRange).toEqual({
      startIndex: 0,
      length: 14,
    });
    expect(restored.existingCharsetSelection).toEqual({
      indices: [11, 12],
    });
    expect(restored.existingCharset).toEqual(existingCharset);
  });
});
