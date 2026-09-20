import { describe, expect, it } from "vitest";
import { destinationGeometryFor } from "./destination-geometry.js";

describe("destination geometry", () => {
  it.each([
    ["zx-spectrum", "zx48-standard-256x192", 256, 192, 1, 1],
    ["zx-spectrum", "zx48-mixed-256x192", 256, 192, 1, 1],
    ["zx-spectrum", "zx48-vertical-spatial-256x192", 256, 192, 1, 1],
    ["sinclair-ql", "mode8-256x256", 256, 256, 4, 3],
    ["sinclair-ql", "mode8-plain-256x256", 256, 256, 4, 3],
    ["sinclair-ql", "mode8-vertical-spatial-256x256", 256, 256, 4, 3],
    ["sinclair-ql", "mode4-512x256", 512, 256, 2, 3],
    ["sinclair-ql", "mode4-plain-512x256", 512, 256, 2, 3],
    ["sinclair-ql", "mode4-vertical-spatial-512x256", 512, 256, 2, 3],
    ["sinclair-ql", "mode8-mode4-mixed-512x256", 512, 256, 2, 3],
    ["pmd-85", "pmd85-3-rgb", 288, 256, 1, 1],
    ["pmd-85", "pmd85-3-rgb-vertical-spatial", 288, 256, 1, 1],
  ] as const)("resolves %s/%s", (platformId, modeId, width, height, pixelWidth, pixelHeight) => {
    expect(destinationGeometryFor(platformId, modeId)).toEqual({
      width,
      height,
      pixelAspect: { width: pixelWidth, height: pixelHeight },
    });
  });
});
