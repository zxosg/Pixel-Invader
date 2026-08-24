import { describe, expect, it } from "vitest";

import { renderQlMixedDisplayPreview } from "./ql-mixed-preview.js";

describe("QL mixed display preview", () => {
  const low = Uint8Array.from([
    100, 80, 60, 255,
    100, 80, 60, 255,
  ]);
  const high = Uint8Array.from([
    255, 0, 40, 255,
    0, 200, 220, 255,
  ]);

  it("preserves high-resolution left and right subpixel colors", () => {
    expect(renderQlMixedDisplayPreview(low, high, 2, "high")).toEqual(
      Uint8Array.from([
        177, 40, 50, 255,
        50, 140, 140, 255,
      ]),
    );
  });

  it("averages the high pair before mixing it with the low pixel", () => {
    expect(renderQlMixedDisplayPreview(low, high, 2, "low")).toEqual(
      Uint8Array.from([
        113, 90, 95, 255,
        113, 90, 95, 255,
      ]),
    );
  });

  it("turns a white and black high pair into gray before the low mix", () => {
    const blackLow = Uint8Array.from([
      0, 0, 0, 255,
      0, 0, 0, 255,
    ]);
    const whiteBlackHigh = Uint8Array.from([
      255, 255, 255, 255,
      0, 0, 0, 255,
    ]);
    expect(
      renderQlMixedDisplayPreview(blackLow, whiteBlackHigh, 2, "low"),
    ).toEqual(Uint8Array.from([
      63, 63, 63, 255,
      63, 63, 63, 255,
    ]));
  });

  it("rejects mismatched or odd-width preview buffers", () => {
    expect(() =>
      renderQlMixedDisplayPreview(low, high.subarray(0, 4), 2, "low")
    ).toThrow(RangeError);
    expect(() =>
      renderQlMixedDisplayPreview(low, high, 1, "low")
    ).toThrow(RangeError);
  });
});
