import { describe, expect, it } from "vitest";
import {
  defaultOutputPreviewStage,
  verticalSpatialPreviewForStage,
} from "./vertical-spatial-preview.js";

describe("vertical spatial preview selection", () => {
  it("defaults spatial targets to the physical full-resolution frame", () => {
    expect(defaultOutputPreviewStage("zx48-vertical-spatial-256x192", true))
      .toBe("screen-1");
    expect(defaultOutputPreviewStage("zx48-mixed-256x192", true))
      .toBe("merged");
  });

  it("keeps physical pixels full-size and averaging exclusive to Analytic", () => {
    const physical = new Uint8Array(256 * 192 * 4).fill(17);
    const averaged = new Uint8Array(256 * 96 * 4).fill(29);
    const diagnostics = {
      algorithmId: "vertical-spatial-uniform-v1",
      calibrationId: "srgb-ideal-v1",
      logicalWidth: 256,
      logicalHeight: 96,
      analyticPreviewRgba: averaged,
      colorCost: 0,
      stripeCost: 0,
      totalCost: 0,
    } as const;

    expect(verticalSpatialPreviewForStage(
      "screen-1", physical, 256, 192, diagnostics,
    )).toEqual({ rgba: physical, width: 256, height: 192 });
    expect(verticalSpatialPreviewForStage(
      "screen-2", physical, 256, 192, diagnostics,
    )).toEqual({ rgba: averaged, width: 256, height: 96 });
  });
});
