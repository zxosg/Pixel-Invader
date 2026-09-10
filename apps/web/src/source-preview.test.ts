import { describe, expect, it } from "vitest";
import { frameFallbackSourcePreview } from "./source-preview.js";

function solid(width: number, height: number): Uint8Array {
  const output = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < output.length; offset += 4) {
    output.set([255, 0, 0, 255], offset);
  }
  return output;
}

describe("source preview framing fallback", () => {
  it("letterboxes Fit instead of stretching it across the preview", () => {
    const common = {
      background: { r: 1, g: 2, b: 3 },
      resampling: "nearest" as const,
      rotation: 0 as const,
      mirrorHorizontal: false,
      mirrorVertical: false,
      fillOffsetX: null,
      fillOffsetY: null,
      panOffsetX: 0,
      panOffsetY: 0,
      panEdgeMode: "background" as const,
      crop: { x: 0, y: 0, width: 1, height: 2 },
    };
    const fit = frameFallbackSourcePreview(
      solid(1, 2), 1, 2, "zx-spectrum", "zx48-standard-256x192",
      { ...common, framing: "fit" },
    );
    const stretch = frameFallbackSourcePreview(
      solid(1, 2), 1, 2, "zx-spectrum", "zx48-standard-256x192",
      { ...common, framing: "stretch" },
    );
    expect([...fit.rgba.subarray(0, 4)]).toEqual([1, 2, 3, 255]);
    expect([...stretch.rgba.subarray(0, 4)]).toEqual([255, 0, 0, 255]);
    expect(fit.rgba).not.toEqual(stretch.rgba);
  });

  it("applies output-pixel panning in the fallback preview", () => {
    const preview = frameFallbackSourcePreview(
      solid(1, 1), 1, 1, "zx-spectrum", "zx48-standard-256x192",
      {
        background: { r: 1, g: 2, b: 3 },
        framing: "stretch",
        resampling: "nearest",
        rotation: 0,
        mirrorHorizontal: false,
        mirrorVertical: false,
        fillOffsetX: null,
        fillOffsetY: null,
        panOffsetX: 1,
        panOffsetY: 0,
        panEdgeMode: "background",
        crop: { x: 0, y: 0, width: 1, height: 1 },
      },
    );
    expect([...preview.rgba.subarray(0, 4)]).toEqual([1, 2, 3, 255]);
    expect([...preview.rgba.subarray(4, 8)]).toEqual([255, 0, 0, 255]);
  });
});
