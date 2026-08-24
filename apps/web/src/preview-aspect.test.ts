import { describe, expect, it } from "vitest";

import { resolvePreviewAspect } from "./preview-aspect.js";

describe("preview aspect", () => {
  it("maps QL Mode 8 pixels to a 4/3 display", () => {
    expect(resolvePreviewAspect(256, 256, true, 1))
      .toEqual({ width: 256 * 4 / 3, height: 256 });
  });

  it("maps QL Mode 4 pixels to a 4/3 display", () => {
    expect(resolvePreviewAspect(512, 256, true, 2))
      .toEqual({ width: 512 * 4 / 3, height: 512 });
  });

  it("uses raw pixel proportions when display correction is disabled", () => {
    expect(resolvePreviewAspect(256, 256, false, 1))
      .toEqual({ width: 256, height: 256 });
    expect(resolvePreviewAspect(512, 256, false, 2))
      .toEqual({ width: 512, height: 256 });
  });

  it("uses PMD's 32:27 pixel aspect without inflating zoom dimensions", () => {
    expect(resolvePreviewAspect(288, 256, true, 1, 32 / 27))
      .toEqual({ width: 1024 / 3, height: 256 });
  });

  it("restores collapsed spatial row pairs without widening square-pixel output", () => {
    expect(resolvePreviewAspect(256, 96, false, 1, 1, 2))
      .toEqual({ width: 256, height: 192 });
    expect(resolvePreviewAspect(288, 128, false, 1, 1, 2))
      .toEqual({ width: 288, height: 256 });
  });

  it("provides dimensions that scale exactly at discrete zoom levels", () => {
    const corrected = resolvePreviewAspect(512, 256, true, 2);
    expect(corrected.width * 3).toBe(2048);
    expect(corrected.height * 3).toBe(1536);

    const squarePixels = resolvePreviewAspect(512, 256, false, 2);
    expect(squarePixels.width * 3).toBe(1536);
    expect(squarePixels.height * 3).toBe(768);
  });

  it.each([
    "mode8-256x256",
    "mode8-plain-256x256",
  ])("uses Mode 8 geometry for %s", () => {
    expect(resolvePreviewAspect(256, 256, true, 1))
      .toEqual({ width: 256 * 4 / 3, height: 256 });
  });

  it.each([
    "mode4-512x256",
    "mode4-plain-512x256",
    "mode8-mode4-mixed-512x256",
  ])("uses Mode 4 geometry for %s", () => {
    expect(resolvePreviewAspect(512, 256, true, 2))
      .toEqual({ width: 512 * 4 / 3, height: 512 });
  });
});
