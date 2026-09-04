import { describe, expect, it } from "vitest";
import {
  serializeScr,
  serializeSoftwareScr,
  validateScreen,
  validateSoftwareScr,
  zxSoftwareScrBytes,
} from "@retro-converter/zx-spectrum";
import {
  DEFAULT_CONVERSION_SETTINGS,
  ORDERED_MATRICES,
  adjustRgba,
  convertToZx,
  filterRgba,
  fillGeometryForDimensions,
  frameRgba,
  frameRgbaToDimensions,
  normalizedOrderedOffset,
  orderedPerturbationDiagnostics,
  orderedThreshold,
  type ConversionSettings,
} from "./index.js";

function solid(width: number, height: number, rgba: readonly number[]): Uint8Array {
  const output = new Uint8Array(width * height * 4);
  for (let offset = 0; offset < output.length; offset += 4) output.set(rgba, offset);
  return output;
}

type LegacyTestOverrides = Partial<ConversionSettings> & {
  readonly brightMode?: "auto" | "on" | "off";
  readonly enabledPaletteColors?: readonly number[];
};

function settings(overrides: LegacyTestOverrides = {}): ConversionSettings {
  const {
    brightMode,
    enabledPaletteColors,
    ...currentOverrides
  } = overrides;
  const resolved = {
    ...DEFAULT_CONVERSION_SETTINGS,
    ...currentOverrides,
    paletteSelections: brightMode === undefined && enabledPaletteColors === undefined
      ? currentOverrides.paletteSelections ?? DEFAULT_CONVERSION_SETTINGS.paletteSelections
      : [{
          screenIndex: 0,
          enabledColorIds: enabledPaletteColors ??
            DEFAULT_CONVERSION_SETTINGS.paletteSelections[0]!.enabledColorIds,
          brightMode: brightMode ??
            DEFAULT_CONVERSION_SETTINGS.paletteSelections[0]!.brightMode ??
            "auto",
        }],
  };
  if (
    resolved.modeId === "zx48-mixed-256x192" &&
    resolved.paletteSelections.length === 1
  ) {
    resolved.paletteSelections = [
      { ...resolved.paletteSelections[0]!, screenIndex: 0 },
      { ...resolved.paletteSelections[0]!, screenIndex: 1 },
    ];
  }
  if (overrides.dithering !== undefined && overrides.ditherEngineId === undefined) {
    resolved.ditherEngineId = overrides.dithering === "none"
      ? "none-v1"
      : overrides.dithering === "ordered"
        ? "ordered-osg-v1"
        : "error-diffusion-projected-v1";
  }
  return resolved;
}

describe("geometry", () => {
  it("uses bilinear resampling by default", () => {
    expect(DEFAULT_CONVERSION_SETTINGS.resampling).toBe("bilinear");
  });

  it("composites alpha with frozen integer rounding", () => {
    const framed = frameRgba(Uint8Array.from([255, 0, 0, 128]), 1, 1, {
      framing: "stretch",
      background: { r: 0, g: 0, b: 255 },
    });
    expect(Array.from(framed.subarray(0, 4))).toEqual([128, 0, 127, 255]);
  });

  it("centers Fit and fills unused pixels with the background", () => {
    const framed = frameRgba(solid(2, 1, [255, 0, 0, 255]), 2, 1, {
      framing: "fit",
      background: { r: 1, g: 2, b: 3 },
    });
    expect(Array.from(framed.subarray(0, 4))).toEqual([1, 2, 3, 255]);
    const center = (48 * 256) * 4;
    expect(Array.from(framed.subarray(center, center + 4))).toEqual([255, 0, 0, 255]);
  });

  it("bilinear resampling blends neighboring source pixels deterministically", () => {
    const source = Uint8Array.from([
      255, 0, 0, 255,
      0, 0, 255, 255,
    ]);
    const framed = frameRgba(source, 2, 1, {
      framing: "stretch",
      resampling: "bilinear",
      background: { r: 0, g: 0, b: 0 },
    });
    const leftCenter = (96 * 256 + 127) * 4;
    const rightCenter = (96 * 256 + 128) * 4;
    expect(Array.from(framed.subarray(leftCenter, leftCenter + 4))).toEqual([128, 0, 127, 255]);
    expect(Array.from(framed.subarray(rightCenter, rightCenter + 4))).toEqual([127, 0, 128, 255]);
  });

  it("bilinear resampling anti-aliases high-frequency detail during strong reduction", () => {
    const sourceWidth = 768;
    const sourceHeight = 576;
    const source = new Uint8Array(sourceWidth * sourceHeight * 4);
    for (let y = 0; y < sourceHeight; y += 1) {
      for (let x = 0; x < sourceWidth; x += 1) {
        const offset = (y * sourceWidth + x) * 4;
        const value = (x + y) % 2 === 0 ? 0 : 255;
        source[offset] = value;
        source[offset + 1] = value;
        source[offset + 2] = value;
        source[offset + 3] = 255;
      }
    }
    const bilinear = frameRgba(source, sourceWidth, sourceHeight, {
      framing: "stretch",
      resampling: "bilinear",
      background: { r: 0, g: 0, b: 0 },
    });
    const interior: number[] = [];
    for (let y = 16; y < 176; y += 1) {
      for (let x = 16; x < 240; x += 1) {
        interior.push(bilinear[(y * 256 + x) * 4] ?? 0);
      }
    }
    expect(Math.min(...interior)).toBeGreaterThanOrEqual(126);
    expect(Math.max(...interior)).toBeLessThanOrEqual(129);
  });

  it("Lanczos-3 preserves constant color and is deterministic", () => {
    const source = solid(3, 2, [23, 117, 201, 255]);
    const first = frameRgba(source, 3, 2, {
      framing: "stretch",
      resampling: "lanczos",
      background: { r: 0, g: 0, b: 0 },
    });
    const second = frameRgba(source, 3, 2, {
      framing: "stretch",
      resampling: "lanczos",
      background: { r: 0, g: 0, b: 0 },
    });
    expect(first).toEqual(second);
    expect(Array.from(first.subarray(0, 4))).toEqual([23, 117, 201, 255]);
    expect(Array.from(first.subarray(-4))).toEqual([23, 117, 201, 255]);
  });

  it("Lanczos-3 produces bounded interpolation distinct from nearest-neighbor", () => {
    const source = Uint8Array.from([
      0, 0, 0, 255,
      255, 255, 255, 255,
      0, 0, 0, 255,
    ]);
    const nearest = frameRgba(source, 3, 1, {
      framing: "stretch",
      resampling: "nearest",
      background: { r: 0, g: 0, b: 0 },
    });
    const lanczos = frameRgba(source, 3, 1, {
      framing: "stretch",
      resampling: "lanczos",
      background: { r: 0, g: 0, b: 0 },
    });
    expect(lanczos).not.toEqual(nearest);
    expect(lanczos.every((value) => value >= 0 && value <= 255)).toBe(true);
  });

  it("Lanczos-3 anti-aliases high-frequency detail during strong reduction", () => {
    const sourceWidth = 768;
    const sourceHeight = 576;
    const source = new Uint8Array(sourceWidth * sourceHeight * 4);
    for (let y = 0; y < sourceHeight; y += 1) {
      for (let x = 0; x < sourceWidth; x += 1) {
        const offset = (y * sourceWidth + x) * 4;
        const value = (x + y) % 2 === 0 ? 0 : 255;
        source[offset] = value;
        source[offset + 1] = value;
        source[offset + 2] = value;
        source[offset + 3] = 255;
      }
    }
    const lanczos = frameRgba(source, sourceWidth, sourceHeight, {
      framing: "stretch",
      resampling: "lanczos",
      background: { r: 0, g: 0, b: 0 },
    });
    const interior: number[] = [];
    for (let y = 16; y < 176; y += 1) {
      for (let x = 16; x < 240; x += 1) {
        interior.push(lanczos[(y * 256 + x) * 4] ?? 0);
      }
    }
    expect(Math.min(...interior)).toBeGreaterThanOrEqual(126);
    expect(Math.max(...interior)).toBeLessThanOrEqual(129);
  });

  it("rotates source pixels clockwise before framing", () => {
    const source = Uint8Array.from([
      255, 0, 0, 255,
      0, 255, 0, 255,
    ]);
    const framed = frameRgba(source, 1, 2, {
      framing: "stretch",
      resampling: "nearest",
      rotation: 90,
      background: { r: 0, g: 0, b: 0 },
    });
    expect(Array.from(framed.subarray(0, 4))).toEqual([0, 255, 0, 255]);
    expect(Array.from(framed.subarray((256 - 1) * 4, 256 * 4))).toEqual([255, 0, 0, 255]);
  });

  it("applies source-coordinate mirrors before rotation", () => {
    const source = Uint8Array.from([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 0, 255,
    ]);
    const horizontal = frameRgba(source, 2, 2, {
      framing: "stretch",
      resampling: "nearest",
      mirrorHorizontal: true,
      background: { r: 0, g: 0, b: 0 },
    });
    const verticalThenRotate = frameRgba(source, 2, 2, {
      framing: "stretch",
      resampling: "nearest",
      rotation: 90,
      mirrorVertical: true,
      background: { r: 0, g: 0, b: 0 },
    });
    expect(Array.from(horizontal.subarray(0, 4))).toEqual([0, 255, 0, 255]);
    expect(Array.from(verticalThenRotate.subarray(0, 4))).toEqual([255, 0, 0, 255]);
  });

  it("uses deterministic source-pixel offsets for Fill", () => {
    const source = Uint8Array.from([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 0, 255,
    ]);
    const left = frameRgba(source, 4, 1, {
      framing: "fill",
      resampling: "nearest",
      fillOffsetX: 0,
      background: { r: 0, g: 0, b: 0 },
    });
    const right = frameRgba(source, 4, 1, {
      framing: "fill",
      resampling: "nearest",
      fillOffsetX: 100,
      background: { r: 0, g: 0, b: 0 },
    });
    expect(Array.from(left.subarray(0, 4))).toEqual([255, 0, 0, 255]);
    expect(Array.from(right.subarray(0, 4))).toEqual([255, 255, 0, 255]);
  });

  it("reports centered and clamped Fill geometry in oriented source pixels", () => {
    const centered = fillGeometryForDimensions(
      400,
      300,
      256,
      192,
    );
    expect(centered).toMatchObject({
      activeAxis: null,
      resolvedOffsetX: 0,
      resolvedOffsetY: 0,
    });
    const wide = fillGeometryForDimensions(
      800,
      300,
      256,
      192,
      0,
      { width: 1, height: 1 },
      null,
      null,
    );
    expect(wide.activeAxis).toBe("x");
    expect(wide.resolvedOffsetX).toBe(Math.floor(wide.maximumOffsetX / 2));
    expect(fillGeometryForDimensions(
      800,
      300,
      256,
      192,
      0,
      { width: 1, height: 1 },
      65_535,
      null,
    ).resolvedOffsetX).toBe(wide.maximumOffsetX);
  });

  it.each([
    ["Mode 8", 4, 4, { width: 4, height: 3 }],
    ["Mode 4", 8, 4, { width: 2, height: 3 }],
  ] as const)(
    "uses the physical 4:3 target for QL %s Fill",
    (_name, outputWidth, outputHeight, pixelAspect) => {
      const source = new Uint8Array(4 * 3 * 4);
      for (let y = 0; y < 3; y += 1) {
        for (let x = 0; x < 4; x += 1) {
          const offset = (y * 4 + x) * 4;
          source.set([x * 60, y * 90, x + y, 255], offset);
        }
      }
      const framed = frameRgbaToDimensions(
        source,
        4,
        3,
        outputWidth,
        outputHeight,
        {
          framing: "fill",
          resampling: "nearest",
          background: { r: 1, g: 2, b: 3 },
        },
        pixelAspect,
      );
      const pixel = (x: number, y: number) =>
        Array.from(framed.subarray(
          (y * outputWidth + x) * 4,
          (y * outputWidth + x) * 4 + 4,
        ));
      expect(pixel(0, 0)).toEqual([0, 0, 0, 255]);
      expect(pixel(outputWidth - 1, 0)).toEqual([180, 0, 3, 255]);
      expect(pixel(0, outputHeight - 1)).toEqual([0, 180, 2, 255]);
      expect(pixel(outputWidth - 1, outputHeight - 1))
        .toEqual([180, 180, 5, 255]);
    },
  );

  it.each([
    ["Mode 8", 4, 4, { width: 4, height: 3 }],
    ["Mode 4", 8, 4, { width: 2, height: 3 }],
  ] as const)(
    "uses the physical 4:3 target for QL %s Fit",
    (_name, outputWidth, outputHeight, pixelAspect) => {
      const framed = frameRgbaToDimensions(
        solid(4, 3, [23, 117, 201, 255]),
        4,
        3,
        outputWidth,
        outputHeight,
        {
          framing: "fit",
          resampling: "nearest",
          background: { r: 1, g: 2, b: 3 },
        },
        pixelAspect,
      );
      expect(Array.from(framed.subarray(0, 4)))
        .toEqual([23, 117, 201, 255]);
      expect(Array.from(framed.subarray(-4)))
        .toEqual([23, 117, 201, 255]);
    },
  );

  it("uses physical-aspect focal positions for wide and tall Fill sources", () => {
    const wide = new Uint8Array(6 * 3 * 4);
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 6; x += 1) {
        wide.set([x * 40, 0, 0, 255], (y * 6 + x) * 4);
      }
    }
    const wideLeft = frameRgbaToDimensions(
      wide,
      6,
      3,
      4,
      4,
      {
        framing: "fill",
        resampling: "nearest",
        fillOffsetX: 0,
        background: { r: 0, g: 0, b: 0 },
      },
      { width: 4, height: 3 },
    );
    const wideRight = frameRgbaToDimensions(
      wide,
      6,
      3,
      4,
      4,
      {
        framing: "fill",
        resampling: "nearest",
        fillOffsetX: 100,
        background: { r: 0, g: 0, b: 0 },
      },
      { width: 4, height: 3 },
    );
    expect(wideLeft[0]).toBe(0);
    expect(wideLeft[(4 - 1) * 4]).toBe(120);
    expect(wideRight[0]).toBe(80);
    expect(wideRight[(4 - 1) * 4]).toBe(200);

    const tall = new Uint8Array(4 * 5 * 4);
    for (let y = 0; y < 5; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        tall.set([0, y * 50, 0, 255], (y * 4 + x) * 4);
      }
    }
    const tallTop = frameRgbaToDimensions(
      tall,
      4,
      5,
      4,
      4,
      {
        framing: "fill",
        resampling: "nearest",
        fillOffsetY: 0,
        background: { r: 0, g: 0, b: 0 },
      },
      { width: 4, height: 3 },
    );
    const tallBottom = frameRgbaToDimensions(
      tall,
      4,
      5,
      4,
      4,
      {
        framing: "fill",
        resampling: "nearest",
        fillOffsetY: 100,
        background: { r: 0, g: 0, b: 0 },
      },
      { width: 4, height: 3 },
    );
    expect(tallTop[1]).toBe(0);
    expect(tallTop[((4 - 1) * 4) * 4 + 1]).toBe(100);
    expect(tallBottom[1]).toBe(100);
    expect(tallBottom[((4 - 1) * 4) * 4 + 1]).toBe(200);
  });

  it("rejects invalid output pixel aspect units", () => {
    expect(() => frameRgbaToDimensions(
      solid(1, 1, [0, 0, 0, 255]),
      1,
      1,
      1,
      1,
      {
        framing: "fill",
        background: { r: 0, g: 0, b: 0 },
      },
      { width: 0, height: 1 },
    )).toThrow(/positive integers/);
  });

  it("keeps the default square-pixel framing byte-identical", () => {
    const source = Uint8Array.from([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 0, 255,
      255, 0, 255, 255,
      0, 255, 255, 255,
    ]);
    const settings = {
      framing: "fill" as const,
      resampling: "bilinear" as const,
      fillOffsetX: 37,
      fillOffsetY: 63,
      background: { r: 1, g: 2, b: 3 },
    };
    expect(frameRgbaToDimensions(
      source,
      3,
      2,
      7,
      5,
      settings,
    )).toEqual(frameRgbaToDimensions(
      source,
      3,
      2,
      7,
      5,
      settings,
      { width: 1, height: 1 },
    ));
  });

  it("resamples an explicit source-pixel Crop rectangle", () => {
    const source = Uint8Array.from([
      255, 0, 0, 255, 0, 255, 0, 255,
      0, 0, 255, 255, 255, 255, 0, 255,
    ]);
    const framed = frameRgba(source, 2, 2, {
      framing: "crop",
      resampling: "nearest",
      crop: { x: 1, y: 0, width: 1, height: 1 },
      background: { r: 0, g: 0, b: 0 },
    });
    expect(Array.from(framed.subarray(0, 4))).toEqual([0, 255, 0, 255]);
    expect(Array.from(framed.subarray(-4))).toEqual([0, 255, 0, 255]);
  });

  it("rejects crop rectangles outside source-pixel bounds", () => {
    expect(() => frameRgba(solid(1, 1, [0, 0, 0, 255]), 1, 1, {
      framing: "crop",
      crop: { x: 0, y: 0, width: 2, height: 1 },
      background: { r: 0, g: 0, b: 0 },
    })).toThrow(RangeError);
  });

  it("uses exact oriented source-pixel crop coordinates", () => {
    const source = new Uint8Array(4 * 2 * 4);
    for (let y = 0; y < 2; y += 1) {
      for (let x = 0; x < 4; x += 1) {
        const offset = (y * 4 + x) * 4;
        source[offset] = x * 60;
        source[offset + 1] = y * 120;
        source[offset + 3] = 255;
      }
    }
    const result = convertToZx(source, 4, 2, settings({
      framing: "crop",
      resampling: "nearest",
      crop: { x: 1, y: 0, width: 2, height: 2 },
    }));
    expect(result.sourcePreviewRgba[0]).toBe(60);
    expect(result.sourcePreviewRgba[(255 * 4)]).toBe(120);
  });
});

describe("image adjustments", () => {
  const neutral = { brightness: 0, contrast: 0, saturation: 0, gamma: 100 } as const;

  it("leaves pixels byte-identical at neutral settings", () => {
    const source = Uint8Array.from([12, 34, 56, 78, 201, 155, 99, 255]);
    expect(adjustRgba(source, neutral)).toEqual(source);
  });

  it("applies brightness, contrast, saturation, then gamma with frozen rounding", () => {
    const adjusted = adjustRgba(Uint8Array.from([100, 150, 200, 255]), {
      brightness: 10,
      contrast: 20,
      saturation: -50,
      gamma: 100,
    });
    expect(Array.from(adjusted)).toEqual([150, 181, 211, 255]);
  });

  it("uses deterministic adjustment endpoints", () => {
    const source = Uint8Array.from([64, 128, 192, 255]);
    expect(Array.from(adjustRgba(source, { ...neutral, brightness: 100 }).subarray(0, 3)))
      .toEqual([255, 255, 255]);
    const gray = adjustRgba(source, { ...neutral, saturation: -100 });
    expect(gray[0]).toBe(gray[1]);
    expect(gray[1]).toBe(gray[2]);
    expect(Array.from(adjustRgba(source, { ...neutral, gamma: 50 }).subarray(0, 3)))
      .toEqual([16, 64, 145]);
    expect(Array.from(adjustRgba(source, { ...neutral, gamma: 200 }).subarray(0, 3)))
      .toEqual([128, 181, 222]);
    expect(Array.from(adjustRgba(source, { ...neutral, gamma: 33 }).subarray(0, 3)))
      .toEqual([3, 31, 108]);
    expect(Array.from(adjustRgba(source, { ...neutral, gamma: 300 }).subarray(0, 3)))
      .toEqual([161, 203, 232]);
  });

  it("rejects adjustment values outside their frozen ranges", () => {
    expect(() => adjustRgba(Uint8Array.from([0, 0, 0, 255]), {
      ...neutral,
      gamma: 301,
    })).toThrow(RangeError);
  });
});

describe("image filters", () => {
  const neutral = { smoothing: 0, sharpening: 0 } as const;

  it("leaves pixels byte-identical at neutral settings", () => {
    const source = Uint8Array.from([12, 34, 56, 78, 201, 155, 99, 255]);
    expect(filterRgba(source, 2, 1, neutral)).toEqual(source);
  });

  it("applies deterministic Gaussian smoothing with clamped edges", () => {
    const source = new Uint8Array(3 * 3 * 4);
    for (let offset = 3; offset < source.length; offset += 4) source[offset] = 255;
    source[(1 * 3 + 1) * 4] = 255;
    const filtered = filterRgba(source, 3, 3, {
      smoothing: 100,
      sharpening: 0,
    });
    expect([
      filtered[0],
      filtered[(1 * 3 + 0) * 4],
      filtered[(1 * 3 + 1) * 4],
    ]).toEqual([16, 32, 64]);
    expect(filtered[(1 * 3 + 1) * 4 + 3]).toBe(255);
  });

  it("applies deterministic unsharp masking after smoothing", () => {
    const source = Uint8Array.from([
      0, 0, 0, 255,
      64, 64, 64, 255,
      0, 0, 0, 255,
    ]);
    const sharpened = filterRgba(source, 3, 1, {
      smoothing: 0,
      sharpening: 100,
    });
    expect([sharpened[0], sharpened[4], sharpened[8]]).toEqual([0, 96, 0]);
    const combined = filterRgba(source, 3, 1, {
      smoothing: 100,
      sharpening: 100,
    });
    expect([combined[0], combined[4], combined[8]]).toEqual([12, 40, 12]);
  });

  it("rejects filter values outside the frozen ranges", () => {
    expect(() => filterRgba(new Uint8Array(4), 1, 1, {
      smoothing: 101,
      sharpening: 0,
    })).toThrow(RangeError);
  });
});

describe("ordered matrices", () => {
  it("tiles the 2×1 values with reversed phase on successive rows", () => {
    const matrix = ORDERED_MATRICES["checkerboard-2x1"];
    expect([
      orderedThreshold(matrix, 0, 0), orderedThreshold(matrix, 1, 0),
      orderedThreshold(matrix, 0, 1), orderedThreshold(matrix, 1, 1),
    ]).toEqual([0, 1, 1, 0]);
  });

  it("matches OsgDither's one-based Bayer tables and orientation", () => {
    expect(ORDERED_MATRICES["bayer-2x2"].values.map((value) => value + 1))
      .toEqual([1, 3, 4, 2]);
    expect(ORDERED_MATRICES["bayer-4x4"].values.map((value) => value + 1))
      .toEqual([
        1, 9, 3, 11,
        13, 5, 15, 7,
        4, 12, 2, 10,
        16, 8, 14, 6,
      ]);
    expect(ORDERED_MATRICES["bayer-8x8"].values.map((value) => value + 1))
      .toEqual([
        1,33,9,41,3,35,11,43, 49,17,57,25,51,19,59,27,
        13,45,5,37,15,47,7,39, 61,29,53,21,63,31,55,23,
        4,36,12,44,2,34,10,42, 52,20,60,28,50,18,58,26,
        16,48,8,40,14,46,6,38, 64,32,56,24,62,30,54,22,
      ]);
  });

  it("freezes complete unique ranks for experimental low-resolution patterns", () => {
    for (const id of [
      "clustered-dot-4x4",
      "clustered-dot-8x8",
      "void-cluster-8x8",
    ] as const) {
      const matrix = ORDERED_MATRICES[id];
      expect(matrix.values).toHaveLength(matrix.levels);
      expect([...matrix.values].sort((left, right) => left - right))
        .toEqual(Array.from({ length: matrix.levels }, (_, index) => index));
    }
  });

  it("normalizes v7 matrices to equal zero-mean signed energy", () => {
    for (const id of [
      "checkerboard-2x1",
      "bayer-2x2",
      "bayer-4x4",
      "bayer-8x8",
    ] as const) {
      const matrix = ORDERED_MATRICES[id];
      const values = matrix.values.map((_, index) =>
        normalizedOrderedOffset(
          matrix,
          index % matrix.width,
          Math.floor(index / matrix.width),
        )
      );
      expect(values.reduce((sum, value) => sum + value, 0)).toBe(0);
      expect(Math.sqrt(
        values.reduce((sum, value) => sum + value * value, 0) / values.length,
      )).toBe(0.25);
      expect(Math.max(...values.map(Math.abs))).toBe(0.25);
    }
  });

  it("reports linear v7 perturbation diagnostics at representative amounts", () => {
    for (const amount of [0, 1, 25, 50, 100]) {
      const diagnostics = [
        "checkerboard-2x1", "bayer-2x2", "bayer-4x4", "bayer-8x8",
      ].map((id) => orderedPerturbationDiagnostics(
        ORDERED_MATRICES[id as keyof typeof ORDERED_MATRICES], amount,
      ));
      expect(diagnostics.every((value) => value.mean === 0)).toBe(true);
      for (const value of diagnostics) {
        expect(value.rms).toBeCloseTo(0.25 * amount / 100, 12);
        expect(value.peak).toBeCloseTo(0.25 * amount / 100, 12);
      }
    }
  });
});

describe("ZX conversion", () => {
  it("rejects an invalid preview border code", () => {
    expect(() => convertToZx(
      solid(1, 1, [0, 0, 0, 255]),
      1,
      1,
      settings({ borderColor: 8 }),
    )).toThrow("Border color");
  });

  it("rejects attribute smoothing outside zero through one hundred", () => {
    expect(() => convertToZx(
      solid(1, 1, [0, 0, 0, 255]),
      1,
      1,
      settings({ attributeSmoothing: 101 }),
    )).toThrow("Attribute smoothing");
  });

  it("rejects Halo v2 influence outside zero through four hundred", () => {
    expect(() => convertToZx(
      solid(1, 1, [0, 0, 0, 255]),
      1,
      1,
      settings({ attributeHaloInfluence: 401 }),
    )).toThrow("Attribute halo influence");
  });

  it("keeps Halo v2 zero-influence output identical to Halo v1 zero smoothing", () => {
    const source = new Uint8Array(256 * 192 * 4);
    for (let y = 0; y < 192; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        source.set([
          Math.floor(255 * x / 255),
          Math.floor(255 * y / 191),
          Math.floor(255 * (x + y) / 446),
          255,
        ], (y * 256 + x) * 4);
      }
    }
    const shared = {
      framing: "stretch",
      resampling: "nearest",
      dithering: "ordered",
      ditherEngineId: "ordered-strict-matrix-v6",
      ditheringAmount: 65,
      orderedMatrix: "bayer-4x4",
      brightMode: "auto",
    } as const;
    const v1 = convertToZx(source, 256, 192, settings({
      ...shared,
      attributeOptimizerId: "zx-guide-reference-halo-v1",
      attributeSmoothing: 0,
    }));
    const v2 = convertToZx(source, 256, 192, settings({
      ...shared,
      attributeOptimizerId: "zx-guide-reference-halo-v2",
      attributeHaloInfluence: 0,
    }));
    expect(v2.attributes).toEqual(v1.attributes);
    expect(v2.pixels).toEqual(v1.pixels);
    expect(v2.score).toBe(v1.score);
  });

  it("runs RGB-guarded Halo v3 deterministically without increasing RGB cost", () => {
    const source = new Uint8Array(256 * 192 * 4);
    for (let y = 0; y < 192; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        source.set([
          Math.floor(255 * x / 255),
          Math.floor(255 * y / 191),
          Math.floor(255 * (x + y) / 446),
          255,
        ], (y * 256 + x) * 4);
      }
    }
    const shared = {
      framing: "stretch",
      ditherEngineId: "ordered-strict-matrix-v6",
      dithering: "ordered",
      ditheringAmount: 50,
      attributeHaloHorizontal: 1,
      attributeHaloVertical: 1,
    } as const;
    const baseline = convertToZx(source, 256, 192, settings({
      ...shared,
      attributeOptimizerId: "zx-guide-reference-halo-v1",
      attributeSmoothing: 100,
    }), "draft");
    const v3Settings = settings({
      ...shared,
      attributeOptimizerId: "zx-guide-reference-rgb-halo-v3",
      attributeHaloInfluence: 100,
    });
    const first = convertToZx(source, 256, 192, v3Settings, "draft");
    const second = convertToZx(source, 256, 192, v3Settings, "draft");
    expect(second.attributes).toEqual(first.attributes);
    expect(second.pixels).toEqual(first.pixels);
    const rgbError = (preview: Uint8Array) => {
      let error = 0;
      for (let offset = 0; offset < source.length; offset += 4) {
        for (let channel = 0; channel < 3; channel += 1) {
          error += (
            (source[offset + channel] ?? 0) -
            (preview[offset + channel] ?? 0)
          ) ** 2;
        }
      }
      return error;
    };
    expect(rgbError(first.previewRgba))
      .toBeLessThanOrEqual(rgbError(baseline.previewRgba));
    expect(validateScreen(first.screen)).toEqual([]);
  }, 20_000);

  it("keeps ordered coverage-normalized v7 at zero percent equal to discrete", () => {
    const source = solid(256, 192, [103, 149, 211, 255]);
    const baseline = convertToZx(source, 256, 192, settings({
      framing: "stretch",
      attributeOptimizerId: "zx-source-cell-v1",
      ditherEngineId: "none-discrete-v2",
      dithering: "none",
      ditheringAmount: 0,
    }), "draft");
    const normalized = convertToZx(source, 256, 192, settings({
      framing: "stretch",
      attributeOptimizerId: "zx-source-cell-v1",
      ditherEngineId: "ordered-coverage-normalized-v7",
      dithering: "ordered",
      ditheringAmount: 0,
      orderedMatrix: "bayer-8x8",
    }), "draft");
    expect(normalized.pixels).toEqual(baseline.pixels);
    expect(normalized.attributes).toEqual(baseline.attributes);
  });

  it("runs legal-mask block DBS deterministically and keeps ZX constraints valid", () => {
    const source = new Uint8Array(256 * 192 * 4);
    for (let y = 0; y < 192; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const value = Math.floor(255 * (x + y) / 446);
        source.set([value, Math.floor(value * 0.75), 255 - value, 255], (y * 256 + x) * 4);
      }
    }
    const dbsSettings = settings({
      framing: "stretch",
      resampling: "nearest",
      attributeOptimizerId: "zx-block-dbs-global-v1",
      ditherEngineId: "pattern-legal-mask-dbs-v1",
      dithering: "ordered",
      ditheringAmount: 60,
      orderedMatrix: "bayer-4x4",
      attributeHaloInfluence: 200,
    });
    const first = convertToZx(source, 256, 192, dbsSettings, "draft");
    const second = convertToZx(source, 256, 192, dbsSettings, "draft");
    expect(second.attributes).toEqual(first.attributes);
    expect(second.pixels).toEqual(first.pixels);
    expect(validateScreen(first.screen)).toEqual([]);
  }, 30_000);

  it.each([
    ["ordered-clustered-dot-v1", "clustered-dot-4x4"],
    ["ordered-void-cluster-v1", "void-cluster-8x8"],
  ] as const)("runs experimental pattern engine %s deterministically", (
    ditherEngineId,
    orderedMatrix,
  ) => {
    const source = solid(256, 192, [112, 72, 168, 255]);
    const conversionSettings = settings({
      framing: "stretch",
      attributeOptimizerId: "zx-guide-reference-halo-v2",
      ditherEngineId,
      dithering: "ordered",
      orderedMatrix,
      ditheringAmount: 70,
    });
    const first = convertToZx(source, 256, 192, conversionSettings, "draft");
    const second = convertToZx(source, 256, 192, conversionSettings, "draft");
    expect(second.pixels).toEqual(first.pixels);
    expect(validateScreen(first.screen)).toEqual([]);
  });

  it.each([
    "error-diffusion-atkinson-v1",
    "error-diffusion-riemersma-v1",
  ] as const)("runs experimental diffusion engine %s deterministically", (
    ditherEngineId,
  ) => {
    const source = solid(256, 192, [178, 92, 64, 255]);
    const conversionSettings = settings({
      framing: "stretch",
      attributeOptimizerId: "zx-guide-reference-halo-v2",
      ditherEngineId,
      dithering: "error-diffusion",
      ditheringAmount: 100,
    });
    const first = convertToZx(source, 256, 192, conversionSettings, "draft");
    const second = convertToZx(source, 256, 192, conversionSettings, "draft");
    expect(second.pixels).toEqual(first.pixels);
    expect(validateScreen(first.screen)).toEqual([]);
  });

  it("rejects attribute halo radii outside zero through two pixels", () => {
    expect(() => convertToZx(
      solid(1, 1, [0, 0, 0, 255]),
      1,
      1,
      settings({ attributeHaloHorizontal: 3 as 2 }),
    )).toThrow("Attribute halo");
  });

  it("rejects Error-diffusion randomization outside zero through one hundred", () => {
    expect(() => convertToZx(
      solid(1, 1, [0, 0, 0, 255]),
      1,
      1,
      settings({ errorDiffusionRandomization: 101 }),
    )).toThrow("randomization");
  });

  it("rejects Error-diffusion line suppression outside zero through one hundred", () => {
    expect(() => convertToZx(
      solid(1, 1, [0, 0, 0, 255]),
      1,
      1,
      settings({ errorDiffusionLineSuppression: 101 }),
    )).toThrow("line suppression");
  });

  it("keeps phase-balanced v3 byte-identical to unrestricted v2 at zero suppression", () => {
    const source = new Uint8Array(256 * 192 * 4);
    for (let offset = 0; offset < source.length; offset += 4) {
      const pixel = offset / 4;
      source[offset] = (pixel * 17) & 255;
      source[offset + 1] = (pixel * 29) & 255;
      source[offset + 2] = (pixel * 43) & 255;
      source[offset + 3] = 255;
    }
    const base = settings({
      framing: "stretch",
      resampling: "nearest",
      dithering: "error-diffusion",
      ditheringAmount: 100,
      errorDiffusionRandomization: 65,
    });
    const legacy = convertToZx(source, 256, 192, {
      ...base,
      ditherEngineId: "error-diffusion-unrestricted-v2",
    });
    const phaseBalanced = convertToZx(source, 256, 192, {
      ...base,
      ditherEngineId: "error-diffusion-phase-balanced-v3",
      errorDiffusionLineSuppression: 0,
    });
    expect(phaseBalanced.frames[0]?.encoded).toEqual(legacy.frames[0]?.encoded);
    expect(phaseBalanced.preConstraintPreviewRgba)
      .toEqual(legacy.preConstraintPreviewRgba);
  });

  it("reduces vertical color runs as phase-balanced suppression increases", () => {
    const source = solid(256, 192, [255, 112, 0, 255]);
    const base = settings({
      framing: "stretch",
      resampling: "nearest",
      attributeOptimizerId: "zx-guide-reference-halo-v1",
      enabledPaletteColors: [2, 6],
      brightMode: "on",
      dithering: "error-diffusion",
      ditherEngineId: "error-diffusion-phase-balanced-v3",
      ditheringAmount: 100,
      errorDiffusionRandomization: 0,
    });
    const verticalRunPenalty = (rgba: Uint8Array): number => {
      let penalty = 0;
      for (let x = 0; x < 256; x += 1) {
        let run = 1;
        for (let y = 1; y < 192; y += 1) {
          const previous = ((y - 1) * 256 + x) * 4;
          const current = (y * 256 + x) * 4;
          const matches = rgba[previous] === rgba[current] &&
            rgba[previous + 1] === rgba[current + 1] &&
            rgba[previous + 2] === rgba[current + 2];
          if (matches) run += 1;
          else {
            if (run >= 4) penalty += run - 3;
            run = 1;
          }
        }
        if (run >= 4) penalty += run - 3;
      }
      return penalty;
    };
    const resultAt = (suppression: number) => convertToZx(
      source,
      256,
      192,
      { ...base, errorDiffusionLineSuppression: suppression },
    ).preConstraintPreviewRgba;
    const zero = verticalRunPenalty(resultAt(0));
    const medium = verticalRunPenalty(resultAt(50));
    const maximum = verticalRunPenalty(resultAt(100));
    expect(medium).toBeLessThan(zero);
    expect(maximum).toBeLessThan(medium);
  });

  it("favors 2x2 checker coverage in a flat intermediate-tone field", () => {
    const source = solid(256, 192, [112, 112, 112, 255]);
    const base = settings({
      framing: "stretch",
      resampling: "nearest",
      dithering: "error-diffusion",
      ditheringAmount: 19,
      errorDiffusionRandomization: 0,
      errorDiffusionLineSuppression: 22,
    });
    const checkerCount = (rgba: Uint8Array): number => {
      let count = 0;
      for (let y = 0; y < 191; y += 1) {
        for (let x = 0; x < 255; x += 1) {
          const values = [
            (y * 256 + x) * 4,
            (y * 256 + x + 1) * 4,
            ((y + 1) * 256 + x) * 4,
            ((y + 1) * 256 + x + 1) * 4,
          ].map((offset) => (rgba[offset] ?? 0) > 100 ? 1 : 0);
          if (values[0] === values[3] && values[1] === values[2] && values[0] !== values[1]) count += 1;
        }
      }
      return count;
    };
    const phaseBalanced = convertToZx(source, 256, 192, {
      ...base,
      ditherEngineId: "error-diffusion-phase-balanced-v3",
    });
    const checkerPhase = convertToZx(source, 256, 192, {
      ...base,
      ditherEngineId: "error-diffusion-checker-phase-v4",
    });
    expect(checkerCount(checkerPhase.preConstraintPreviewRgba))
      .toBeGreaterThan(checkerCount(phaseBalanced.preConstraintPreviewRgba));
  });

  it("keeps matrix-guided placement deterministic and valid", () => {
    const source = solid(256, 192, [112, 112, 112, 255]);
    for (let pixel = 0; pixel < 256 * 192; pixel += 1) {
      const value = 80 + ((pixel * 17) % 80);
      source[pixel * 4] = value;
      source[pixel * 4 + 1] = value;
      source[pixel * 4 + 2] = value;
    }
    const base = settings({
      framing: "stretch",
      resampling: "nearest",
      dithering: "error-diffusion",
      ditherEngineId: "error-diffusion-matrix-guided-v1",
      ditheringAmount: 100,
      errorDiffusionLineSuppression: 50,
    });
    const checker = convertToZx(source, 256, 192, {
      ...base,
      orderedMatrix: "checkerboard-2x1",
    });
    const bayer = convertToZx(source, 256, 192, {
      ...base,
      orderedMatrix: "bayer-4x4",
    });
    expect(validateScreen(checker.screen)).toEqual([]);
    expect(validateScreen(bayer.screen)).toEqual([]);
    expect(checker.previewRgba).toEqual(
      convertToZx(source, 256, 192, {
        ...base,
        orderedMatrix: "checkerboard-2x1",
      }).previewRgba,
    );
  });

  it("keeps checker-phase v4.1 deterministic and preserves horizontal gradients", () => {
    const source = new Uint8Array(256 * 192 * 4);
    for (let y = 0; y < 192; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const value = x;
        const offset = (y * 256 + x) * 4;
        source[offset] = value;
        source[offset + 1] = value;
        source[offset + 2] = value;
        source[offset + 3] = 255;
      }
    }
    const base = settings({
      framing: "stretch",
      resampling: "nearest",
      dithering: "error-diffusion",
      ditheringAmount: 100,
      errorDiffusionLineSuppression: 60,
      errorDiffusionRandomization: 0,
      attributeOptimizerId: "zx-guide-reference-halo-v1",
    });
    const v4 = convertToZx(source, 256, 192, {
      ...base,
      ditherEngineId: "error-diffusion-checker-phase-v4",
    });
    const v41 = convertToZx(source, 256, 192, {
      ...base,
      ditherEngineId: "error-diffusion-checker-phase-v4-1",
    });
    expect(v41.preConstraintPreviewRgba).toEqual(v4.preConstraintPreviewRgba);
    expect(v41.previewRgba).toEqual(v4.previewRgba);
    expect(v41.previewRgba).toEqual(
      convertToZx(source, 256, 192, { ...base, ditherEngineId: "error-diffusion-checker-phase-v4-1" }).previewRgba,
    );
    expect(validateScreen(v41.screen)).toEqual([]);
  });

  it("keeps v3.1 identical to v3 when checker placement is disabled", () => {
    const source = solid(256, 192, [128, 128, 128, 255]);
    const base = settings({
      framing: "stretch",
      dithering: "error-diffusion",
      ditheringAmount: 100,
      errorDiffusionLineSuppression: 0,
      errorDiffusionRandomization: 0,
      attributeOptimizerId: "zx-guide-reference-halo-v1",
    });
    const v3 = convertToZx(source, 256, 192, {
      ...base,
      ditherEngineId: "error-diffusion-phase-balanced-v3",
    });
    const v31 = convertToZx(source, 256, 192, {
      ...base,
      ditherEngineId: "error-diffusion-phase-balanced-checker-v3-1",
    });
    expect(v31.preConstraintPreviewRgba).toEqual(v3.preConstraintPreviewRgba);
    expect(v31.previewRgba).toEqual(v3.previewRgba);
    expect(v31.attributes).toEqual(v3.attributes);
  });

  it("preserves 2x2 coverage when v3.1 changes checker placement", () => {
    const source = solid(256, 192, [128, 128, 128, 255]);
    const base = settings({
      framing: "stretch",
      dithering: "error-diffusion",
      ditheringAmount: 100,
      errorDiffusionLineSuppression: 100,
      errorDiffusionRandomization: 0,
      attributeOptimizerId: "zx-guide-reference-halo-v1",
    });
    const v3 = convertToZx(source, 256, 192, {
      ...base,
      ditherEngineId: "error-diffusion-phase-balanced-v3",
    });
    const v31 = convertToZx(source, 256, 192, {
      ...base,
      ditherEngineId: "error-diffusion-phase-balanced-checker-v3-1",
    });
    for (let y = 0; y < 192; y += 2) {
      for (let x = 0; x < 256; x += 2) {
        const count = (result: typeof v3) =>
          (result.pixels[y * 256 + x] ?? 0) +
          (result.pixels[y * 256 + x + 1] ?? 0) +
          (result.pixels[(y + 1) * 256 + x] ?? 0) +
          (result.pixels[(y + 1) * 256 + x + 1] ?? 0);
        expect(count(v31)).toBe(count(v3));
      }
    }
    expect(v31.attributes).toEqual(v3.attributes);
    expect(validateScreen(v31.screen)).toEqual([]);
  });

  it("keeps v3.2 byte-identical to v3 when checker placement is disabled", () => {
    const source = new Uint8Array(256 * 192 * 4);
    for (let pixel = 0; pixel < 256 * 192; pixel += 1) {
      source[pixel * 4] = (pixel * 17) & 255;
      source[pixel * 4 + 1] = (pixel * 29) & 255;
      source[pixel * 4 + 2] = (pixel * 43) & 255;
      source[pixel * 4 + 3] = 255;
    }
    const base = settings({
      framing: "stretch",
      resampling: "nearest",
      dithering: "error-diffusion",
      ditheringAmount: 100,
      errorDiffusionRandomization: 65,
      errorDiffusionLineSuppression: 0,
    });
    const v3 = convertToZx(source, 256, 192, {
      ...base,
      ditherEngineId: "error-diffusion-phase-balanced-v3",
    });
    const v32 = convertToZx(source, 256, 192, {
      ...base,
      ditherEngineId: "error-diffusion-phase-balanced-checker-v3-2",
    });
    expect(v32.frames[0]?.encoded).toEqual(v3.frames[0]?.encoded);
    expect(v32.preConstraintPreviewRgba).toEqual(v3.preConstraintPreviewRgba);
    expect(v32.attributes).toEqual(v3.attributes);
  });

  it("uses integrated, coverage-preserving checker blocks in v3.2", () => {
    const source = solid(256, 192, [128, 128, 128, 255]);
    const base = settings({
      framing: "stretch",
      resampling: "nearest",
      dithering: "error-diffusion",
      ditherEngineId: "error-diffusion-phase-balanced-v3",
      ditheringAmount: 100,
      errorDiffusionRandomization: 0,
      errorDiffusionLineSuppression: 100,
    });
    const v3 = convertToZx(source, 256, 192, base);
    const v32 = convertToZx(source, 256, 192, {
      ...base,
      ditherEngineId: "error-diffusion-phase-balanced-checker-v3-2",
    });
    let changedPixels = 0;
    for (let y = 0; y < 192; y += 2) {
      for (let x = 0; x < 256; x += 2) {
        let before = 0;
        let after = 0;
        let changed = 0;
        for (let dy = 0; dy < 2; dy += 1) {
          for (let dx = 0; dx < 2; dx += 1) {
            const index = (y + dy) * 256 + x + dx;
            before += v3.pixels[index] ?? 0;
            after += v32.pixels[index] ?? 0;
            if (v3.pixels[index] !== v32.pixels[index]) changed += 1;
          }
        }
        expect(after).toBe(before);
        if (changed > 0) expect(changed).toBeGreaterThan(1);
        changedPixels += changed;
      }
    }
    expect(changedPixels).toBeGreaterThan(0);
    expect(v32.attributes).toEqual(v3.attributes);
    expect(validateScreen(v32.screen)).toEqual([]);
    expect(v32.previewRgba).toEqual(
      convertToZx(source, 256, 192, {
        ...base,
        ditherEngineId: "error-diffusion-phase-balanced-checker-v3-2",
      }).previewRgba,
    );
  });

  it("keeps checker-phase v4.1 corrections inside legal ZX output", () => {
    const source = solid(256, 192, [112, 112, 112, 255]);
    const result = convertToZx(source, 256, 192, settings({
      framing: "stretch",
      dithering: "error-diffusion",
      ditherEngineId: "error-diffusion-checker-phase-v4-1",
      ditheringAmount: 100,
      errorDiffusionLineSuppression: 100,
      errorDiffusionRandomization: 0,
      attributeOptimizerId: "zx-guide-reference-halo-v1",
    }));
    expect(validateScreen(result.screen)).toEqual([]);
    expect(result.pixels.every((pixel) => pixel === 0 || pixel === 1)).toBe(true);
    expect(result.artifactCorrection?.correctedPixelCount).toBeGreaterThan(0);
  });

  it("produces a deterministic, valid bounded Draft result", () => {
    const source = new Uint8Array(16 * 16 * 4);
    for (let index = 0; index < source.length; index += 1) source[index] = (index * 53) & 255;
    const first = convertToZx(source, 16, 16, settings({ framing: "stretch" }), "draft");
    const second = convertToZx(source, 16, 16, settings({ framing: "stretch" }), "draft");
    expect(serializeScr(first.screen)).toEqual(serializeScr(second.screen));
    expect(first.sourcePreviewRgba).toEqual(second.sourcePreviewRgba);
    expect(first.sourcePreviewRgba).toHaveLength(256 * 192 * 4);
    expect(validateScreen(first.screen)).toEqual([]);
    expect(serializeScr(first.screen)).toHaveLength(6_912);
  });

  it("canonicalizes black to attribute zero and valid binary pixels", () => {
    const result = convertToZx(solid(1, 1, [0, 0, 0, 255]), 1, 1, settings({ framing: "stretch" }));
    expect(new Set(result.screen.attributes)).toEqual(new Set([0]));
    expect(new Set(result.screen.pixels)).toEqual(new Set([0]));
    expect(validateScreen(result.screen)).toEqual([]);
    expect(serializeScr(result.screen)).toHaveLength(6_912);
  });

  it("maps bright red exactly", () => {
    const result = convertToZx(solid(1, 1, [255, 0, 0, 255]), 1, 1, settings({ framing: "stretch" }));
    expect(new Set(result.screen.attributes)).toEqual(new Set([0x52]));
    expect(new Set(result.screen.pixels)).toEqual(new Set([0]));
  });

  it("supports every software attribute height and extended attribute section", () => {
    for (const attributeHeight of [8, 4, 2, 1] as const) {
      const result = convertToZx(
        solid(1, 1, [80, 120, 170, 255]),
        1,
        1,
        settings({ framing: "stretch", attributeHeight }),
      );
      const scr = serializeSoftwareScr(
        result.pixels,
        result.attributes,
        attributeHeight,
      );
      expect(result.attributes).toHaveLength(32 * (192 / attributeHeight));
      expect(scr).toHaveLength(6_144 + 32 * (192 / attributeHeight));
      expect(validateSoftwareScr(scr, attributeHeight)).toEqual([]);
    }
  });

  it("enforces BRIGHT on, off, and auto", () => {
    const source = solid(1, 1, [255, 0, 0, 255]);
    const on = convertToZx(source, 1, 1, settings({
      framing: "stretch",
      brightMode: "on",
    }));
    const off = convertToZx(source, 1, 1, settings({
      framing: "stretch",
      brightMode: "off",
    }));
    const auto = convertToZx(source, 1, 1, settings({
      framing: "stretch",
      brightMode: "auto",
    }));
    expect(Array.from(on.attributes).every((attribute) => (attribute & 0x40) !== 0)).toBe(true);
    expect(Array.from(off.attributes).every((attribute) => (attribute & 0x40) === 0)).toBe(true);
    expect(auto.attributes).toEqual(on.attributes);
  });

  it("uses only selected ZX palette colors", () => {
    const result = convertToZx(
      solid(1, 1, [255, 0, 0, 255]),
      1,
      1,
      settings({
        framing: "stretch",
        brightMode: "off",
        enabledPaletteColors: [1],
      }),
    );
    expect(new Set(result.attributes)).toEqual(new Set([0x09]));
    for (let offset = 0; offset < result.previewRgba.length; offset += 4) {
      expect(Array.from(result.previewRgba.subarray(offset, offset + 3))).toEqual([0, 0, 205]);
    }
  });

  it("applies one BRIGHT plane to both selected attribute colors", () => {
    const source = new Uint8Array(8 * 8 * 4);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const offset = (y * 8 + x) * 4;
        source.set(x < 4 ? [255, 0, 0, 255] : [0, 255, 0, 255], offset);
      }
    }
    for (const brightMode of ["on", "off"] as const) {
      const result = convertToZx(source, 8, 8, settings({
        framing: "stretch",
        brightMode,
        enabledPaletteColors: [2, 4],
      }));
      for (const attribute of result.attributes) {
        expect(new Set([2, 4])).toContain(attribute & 7);
        expect(new Set([2, 4])).toContain((attribute >> 3) & 7);
        expect((attribute & 0x40) !== 0).toBe(brightMode === "on");
      }
    }
  });

  it("makes every enabled 0% method byte-identical to no dithering", () => {
    const source = new Uint8Array(16 * 16 * 4);
    for (let index = 0; index < source.length; index += 1) source[index] = (index * 37) & 255;
    const none = serializeScr(convertToZx(source, 16, 16, settings({ framing: "stretch" })).screen);
    for (const dithering of ["ordered", "error-diffusion"] as const) {
      const actual = serializeScr(convertToZx(source, 16, 16, settings({ framing: "stretch", dithering, ditheringAmount: 0 })).screen);
      expect(actual).toEqual(none);
    }
  });

  it("keeps the unrestricted yellow guide yellow in discrete no-dither v2", () => {
    const source = solid(1, 1, [240, 120, 0, 255]);
    const legacy = convertToZx(source, 1, 1, settings({
      framing: "stretch",
      dithering: "none",
      ditherEngineId: "none-v1",
    }), "high");
    const discrete = convertToZx(source, 1, 1, settings({
      framing: "stretch",
      dithering: "none",
      ditherEngineId: "none-discrete-v2",
    }), "high");

    expect(Array.from(legacy.preConstraintPreviewRgba.subarray(0, 3)))
      .toEqual([205, 205, 0]);
    expect(Array.from(legacy.previewRgba.subarray(0, 3)))
      .toEqual([255, 0, 0]);
    expect(legacy.attributes[0]).toBe(0x56);

    expect(Array.from(discrete.preConstraintPreviewRgba.subarray(0, 3)))
      .toEqual([205, 205, 0]);
    expect(Array.from(discrete.previewRgba.subarray(0, 3)))
      .toEqual([205, 205, 0]);
    expect(discrete.attributes[0]).toBe(0x36);
    expect(discrete.previewRgba).toEqual(discrete.preConstraintPreviewRgba);
  });

  it("lets full-palette diffusion choose the dominant dark-cyan components", () => {
    const source = solid(1, 1, [10, 90, 84, 255]);
    const none = convertToZx(source, 1, 1, settings({ framing: "stretch" }));
    const dithered = convertToZx(source, 1, 1, settings({
      framing: "stretch",
      dithering: "error-diffusion",
      ditheringAmount: 50,
    }));
    expect(dithered.screen.attributes).not.toEqual(none.screen.attributes);
    expect(new Set(dithered.screen.attributes)).toEqual(new Set([4, 5]));
    expect(dithered.previewRgba.some((value, index) => index % 4 !== 3 && value > 0)).toBe(true);
    expect(validateScreen(dithered.screen)).toEqual([]);
  });

  it("keeps a muted no-dither cell non-bright and constraint-valid", () => {
    const source = solid(1, 1, [130, 147, 91, 255]);
    const result = convertToZx(source, 1, 1, settings({
      framing: "stretch",
      dithering: "none",
      ditheringAmount: 0,
    }));
    expect(Array.from(result.screen.attributes).every((attribute) => (attribute & 0x40) === 0)).toBe(true);
    expect(validateScreen(result.screen)).toEqual([]);
  });

  it("keeps red-to-yellow gradient attributes stable across the 64 percent boundary", () => {
    const source = new Uint8Array(256 * 192 * 4);
    for (let y = 0; y < 192; y += 1) {
      const green = Math.round(205 * y / 191);
      for (let x = 0; x < 256; x += 1) {
        const offset = (y * 256 + x) * 4;
        source[offset] = 205;
        source[offset + 1] = green;
        source[offset + 2] = 0;
        source[offset + 3] = 255;
      }
    }
    const attributes = [64, 65, 86].map((ditheringAmount) =>
      convertToZx(source, 256, 192, settings({
        framing: "stretch",
        brightMode: "off",
        dithering: "ordered",
        ditheringAmount,
        orderedMatrix: "bayer-2x2",
      })).attributes
    );
    expect(attributes[1]).toEqual(attributes[0]);
    expect(attributes[2]).toEqual(attributes[0]);
    expect(new Set(attributes[0])).toEqual(new Set([0x16]));
    expect(attributes[0]?.includes(0x15)).toBe(false);
    expect(attributes[0]?.includes(0x1e)).toBe(false);
  });

  it("selects ordered attributes from the unrestricted palette guide before remapping", () => {
    const source = new Uint8Array(256 * 192 * 4);
    const colors = [
      [0, 0, 0, 255],
      [205, 0, 0, 255],
      [205, 205, 0, 255],
    ] as const;
    for (let y = 0; y < 192; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const cellPixel = (y % 8) * 8 + (x % 8);
        const color = colors[cellPixel < 30 ? 0 : cellPixel < 50 ? 1 : 2];
        source.set(color, (y * 256 + x) * 4);
      }
    }
    const result = convertToZx(source, 256, 192, settings({
      framing: "stretch",
      brightMode: "off",
      enabledPaletteColors: [0, 2, 6],
      dithering: "ordered",
      ditheringAmount: 100,
      orderedMatrix: "bayer-2x2",
    }));
    expect(new Set(result.attributes)).toEqual(new Set([0x02]));
    for (let offset = 0; offset < result.previewRgba.length; offset += 4) {
      expect([
        [0, 0, 0],
        [205, 0, 0],
      ]).toContainEqual(Array.from(result.previewRgba.subarray(offset, offset + 3)));
    }
    expect(validateScreen(result.screen)).toEqual([]);
  });

  it.each([
    ["ordered", "ordered-unrestricted-v2"],
    ["error-diffusion", "error-diffusion-unrestricted-v2"],
    ["error-diffusion", "error-diffusion-decorrelated-v3"],
  ] as const)(
    "keeps the %s pre-attribute guide independent of ZX attribute height",
    (dithering, ditherEngineId) => {
      const source = new Uint8Array(256 * 192 * 4);
      for (let y = 0; y < 192; y += 1) {
        for (let x = 0; x < 256; x += 1) {
          const offset = (y * 256 + x) * 4;
          source[offset] = Math.round(110 + 145 * x / 255);
          source[offset + 1] = Math.round(40 + 215 * y / 191);
          source[offset + 2] = Math.round(35 * (x + y) / 446);
          source[offset + 3] = 255;
        }
      }
      const convert = (attributeHeight: 1 | 8) => convertToZx(
        source,
        256,
        192,
        settings({
          framing: "stretch",
          attributeHeight,
          brightMode: "auto",
          dithering,
          ditherEngineId,
          ditheringAmount: 34,
          orderedMatrix: "bayer-4x4",
        }),
      );
      const onePixelAttributes = convert(1);
      const eightPixelAttributes = convert(8);

      expect(eightPixelAttributes.preConstraintPreviewRgba)
        .toEqual(onePixelAttributes.preConstraintPreviewRgba);
      expect(validateScreen(eightPixelAttributes.screen)).toEqual([]);
    },
  );

  it("preserves the yellow-white highlight pair in the Osg ordered pass", () => {
    const result = convertToZx(
      solid(1, 1, [159, 154, 120, 255]),
      1,
      1,
      settings({
        framing: "stretch",
        brightMode: "off",
        dithering: "ordered",
        ditheringAmount: 20,
        orderedMatrix: "checkerboard-2x1",
      }),
    );
    expect(new Set(result.attributes)).toEqual(new Set([0x37]));
    expect(new Set(Array.from(result.previewRgba).filter((_, index) => index % 4 !== 3)))
      .toEqual(new Set([0, 205]));
    expect(validateScreen(result.screen)).toEqual([]);
  });

  it("keeps a dark red ramp on one black-red pair across attribute boundaries", () => {
    const source = new Uint8Array(256 * 192 * 4);
    for (let y = 0; y < 192; y += 1) {
      const red = Math.round(205 * y / 191);
      for (let x = 0; x < 256; x += 1) {
        const offset = (y * 256 + x) * 4;
        source[offset] = red;
        source[offset + 1] = 0;
        source[offset + 2] = 0;
        source[offset + 3] = 255;
      }
    }
    const result = convertToZx(source, 256, 192, settings({
      framing: "stretch",
      brightMode: "off",
      dithering: "error-diffusion",
      ditheringAmount: 100,
    }));
    expect(new Set(result.attributes)).toEqual(new Set([0x00, 0x02]));
    expect(validateScreen(result.screen)).toEqual([]);
  });

  it("selects the reference macro pair across the palette-index mean", () => {
    const source = new Uint8Array(256 * 192 * 4);
    const palette = [
      [0, 0, 0, 255],
      [0, 0, 255, 255],
      [255, 0, 0, 255],
      [255, 0, 255, 255],
      [0, 255, 0, 255],
      [0, 255, 255, 255],
      [255, 255, 0, 255],
      [255, 255, 255, 255],
    ] as const;
    for (let y = 0; y < 192; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const localPixel = (y % 8) * 8 + (x % 8);
        const code = localPixel < 8
          ? 4
          : localPixel < 36
            ? 2
            : localPixel < 54
              ? 0
              : 6;
        source.set(palette[code]!, (y * 256 + x) * 4);
      }
    }
    const result = convertToZx(source, 256, 192, settings({
      framing: "stretch",
      brightMode: "on",
      dithering: "error-diffusion",
      ditheringAmount: 20,
    }));
    expect(new Set(result.attributes)).toEqual(new Set([0x56]));
    expect(Array.from(result.previewRgba.subarray(0, 3))).toEqual([255, 255, 0]);
    expect(Array.from(result.previewRgba.subarray(4, 7))).toEqual([255, 0, 0]);
    expect(validateScreen(result.screen)).toEqual([]);
  });

  it("uses an edge-aware halo to smooth compatible neighboring attributes", () => {
    const source = new Uint8Array(256 * 192 * 4);
    const palette = [
      [0, 0, 0, 255],
      [0, 0, 255, 255],
      [255, 0, 0, 255],
      [255, 0, 255, 255],
      [0, 255, 0, 255],
      [0, 255, 255, 255],
      [255, 255, 0, 255],
      [255, 255, 255, 255],
    ] as const;
    for (let y = 0; y < 192; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const cellX = Math.floor(x / 8);
        const localX = x % 8;
        const localY = y % 8;
        let code = 6;
        if (cellX % 2 === 0) {
          if (localX === 7) {
            code = 6;
          } else {
            const rank = localY * 7 + localX;
            code = rank < 10 ? 4 : rank < 38 ? 2 : 0;
          }
        }
        source.set(palette[code]!, (y * 256 + x) * 4);
      }
    }
    const baseSettings = {
      framing: "stretch",
      brightMode: "on",
      dithering: "error-diffusion",
      ditheringAmount: 20,
    } as const;
    const exactReference = convertToZx(
      source, 256, 192, settings({ ...baseSettings, attributeSmoothing: 0 }),
    );
    const smoothed = convertToZx(
      source, 256, 192, settings({ ...baseSettings, attributeSmoothing: 100 }),
    );
    expect(exactReference.attributes[0]).toBe(0x54);
    expect(smoothed.attributes[0]).toBe(0x56);
    expect(validateScreen(exactReference.screen)).toEqual([]);
    expect(validateScreen(smoothed.screen)).toEqual([]);
  });

  it("applies the edge-aware halo to Ordered pair selection", () => {
    const source = new Uint8Array(256 * 192 * 4);
    const palette = [
      [0, 0, 0, 255],
      [0, 0, 255, 255],
      [255, 0, 0, 255],
      [255, 0, 255, 255],
      [0, 255, 0, 255],
      [0, 255, 255, 255],
      [255, 255, 0, 255],
      [255, 255, 255, 255],
    ] as const;
    for (let y = 0; y < 192; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const cellX = Math.floor(x / 8);
        const localX = x % 8;
        const localY = y % 8;
        let code = 6;
        if (cellX % 2 === 0) {
          if (localX === 7) {
            code = 6;
          } else {
            const rank = localY * 7 + localX;
            code = rank < 19 ? 4 : rank < 47 ? 2 : 6;
          }
        }
        source.set(palette[code]!, (y * 256 + x) * 4);
      }
    }
    const baseSettings = {
      framing: "stretch",
      resampling: "nearest",
      brightMode: "on",
      dithering: "ordered",
      ditheringAmount: 100,
      orderedMatrix: "bayer-2x2",
      attributeHaloHorizontal: 1,
      attributeHaloVertical: 0,
    } as const;
    const unsmoothed = convertToZx(
      source, 256, 192, settings({ ...baseSettings, attributeSmoothing: 0 }),
    );
    const smoothed = convertToZx(
      source, 256, 192, settings({ ...baseSettings, attributeSmoothing: 100 }),
    );
    expect(unsmoothed.attributes[0]).toBe(0x54);
    expect(smoothed.attributes[0]).toBe(0x56);
    expect(validateScreen(smoothed.screen)).toEqual([]);
  });

  it("ignores vertical halo radius for 8x1 and 8x2 software attributes", () => {
    const source = new Uint8Array(256 * 192 * 4);
    for (let y = 0; y < 192; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const red = Math.floor(y / 2) % 2 === 0 ? 255 : 0;
        source.set([red, 0, 0, 255], (y * 256 + x) * 4);
      }
    }
    for (const attributeHeight of [1, 2] as const) {
      const baseSettings = {
        framing: "stretch",
        resampling: "nearest",
        attributeHeight,
        brightMode: "on",
        dithering: "error-diffusion",
        ditheringAmount: 20,
        attributeSmoothing: 100,
        attributeHaloHorizontal: 0,
      } as const;
      const noVerticalHalo = convertToZx(
        source, 256, 192, settings({ ...baseSettings, attributeHaloVertical: 0 }),
      );
      const requestedVerticalHalo = convertToZx(
        source, 256, 192, settings({ ...baseSettings, attributeHaloVertical: 2 }),
      );
      expect(serializeSoftwareScr(
        requestedVerticalHalo.pixels,
        requestedVerticalHalo.attributes,
        requestedVerticalHalo.attributeHeight,
      )).toEqual(serializeSoftwareScr(
        noVerticalHalo.pixels,
        noVerticalHalo.attributes,
        noVerticalHalo.attributeHeight,
      ));
    }
  });

  it("keeps black-red dominant when independently diffusing a desaturated red tone", () => {
    const result = convertToZx(
      solid(1, 1, [67, 49, 53, 255]),
      1,
      1,
      settings({
        framing: "stretch",
        brightMode: "off",
        dithering: "error-diffusion",
        ditheringAmount: 100,
      }),
    );
    const blackRedCells = Array.from(result.attributes)
      .filter((attribute) => attribute === 0x02).length;
    expect(blackRedCells).toBeGreaterThan(result.attributes.length * 0.85);
    expect(validateScreen(result.screen)).toEqual([]);
  });

  it("keeps Error-diffusion randomization deterministic and optional", () => {
    const source = solid(256, 192, [100, 100, 100, 255]);
    const baseSettings = {
      framing: "stretch",
      resampling: "nearest",
      brightMode: "off",
      enabledPaletteColors: [0, 7],
      dithering: "error-diffusion",
      ditheringAmount: 100,
    } as const;
    const baseline = convertToZx(
      source,
      256,
      192,
      settings({ ...baseSettings, errorDiffusionRandomization: 0 }),
    );
    const first = convertToZx(
      source,
      256,
      192,
      settings({ ...baseSettings, errorDiffusionRandomization: 100 }),
    );
    const second = convertToZx(
      source,
      256,
      192,
      settings({ ...baseSettings, errorDiffusionRandomization: 100 }),
    );
    expect(serializeScr(first.screen)).toEqual(serializeScr(second.screen));
    expect(serializeScr(first.screen)).not.toEqual(serializeScr(baseline.screen));
    const baselineInk = baseline.pixels.reduce((sum, pixel) => sum + pixel, 0);
    const randomizedInk = first.pixels.reduce((sum, pixel) => sum + pixel, 0);
    expect(Math.abs(randomizedInk - baselineInk)).toBeLessThan(256 * 192 * 0.01);
    const periodicity = (pixels: Uint8Array): number => {
      const density = pixels.reduce((sum, pixel) => sum + pixel, 0) / pixels.length;
      const independentAgreement = density * density + (1 - density) * (1 - density);
      const lags = [
        [1, 0], [2, 0], [3, 0], [4, 0],
        [1, 1], [2, 2], [3, 3], [4, 4],
        [2, 1], [1, 2],
      ] as const;
      let strongestPeak = 0;
      for (const [dx, dy] of lags) {
        let matches = 0;
        let samples = 0;
        for (let y = 0; y < 192 - dy; y += 1) {
          for (let x = 0; x < 256 - dx; x += 1) {
            const firstPixel = pixels[y * 256 + x] ?? 0;
            const secondPixel = pixels[(y + dy) * 256 + x + dx] ?? 0;
            if (firstPixel === secondPixel) matches += 1;
            samples += 1;
          }
        }
        strongestPeak = Math.max(
          strongestPeak,
          Math.abs(matches / samples - independentAgreement),
        );
      }
      return strongestPeak;
    };
    expect(periodicity(first.pixels)).toBeLessThan(periodicity(baseline.pixels));
    expect(validateScreen(first.screen)).toEqual([]);
  });

  it("decorrelates Error-diffusion v3 while retaining deterministic tone", () => {
    const source = solid(256, 192, [255, 128, 128, 255]);
    const baseSettings = settings({
      framing: "stretch",
      resampling: "nearest",
      brightMode: "on",
      enabledPaletteColors: [2, 7],
      dithering: "error-diffusion",
      ditheringAmount: 100,
      errorDiffusionRandomization: 60,
    });
    const legacy = convertToZx(source, 256, 192, {
      ...baseSettings,
      ditherEngineId: "error-diffusion-unrestricted-v2",
    });
    const first = convertToZx(source, 256, 192, {
      ...baseSettings,
      ditherEngineId: "error-diffusion-decorrelated-v3",
    });
    const second = convertToZx(source, 256, 192, {
      ...baseSettings,
      ditherEngineId: "error-diffusion-decorrelated-v3",
    });

    expect(first.frames[0]?.encoded).toEqual(second.frames[0]?.encoded);
    expect(first.preConstraintPreviewRgba)
      .not.toEqual(legacy.preConstraintPreviewRgba);
    const legacyInk = legacy.pixels.reduce((sum, pixel) => sum + pixel, 0);
    const decorrelatedInk = first.pixels.reduce((sum, pixel) => sum + pixel, 0);
    expect(Math.abs(decorrelatedInk - legacyInk))
      .toBeLessThan(256 * 192 * 0.02);
  });

  it("does not restart error diffusion at each attribute boundary", () => {
    const source = solid(256, 192, [10, 90, 84, 255]);
    const result = convertToZx(source, 256, 192, settings({
      framing: "stretch",
      brightMode: "off",
      dithering: "error-diffusion",
      ditheringAmount: 100,
    }));
    const cellPattern = (cellX: number): number[] => {
      const pattern: number[] = [];
      for (let y = 0; y < 8; y += 1) {
        for (let x = cellX * 8; x < cellX * 8 + 8; x += 1) {
          pattern.push(result.pixels[y * 256 + x] ?? 0);
        }
      }
      return pattern;
    };
    expect(cellPattern(1)).not.toEqual(cellPattern(0));
  });

  it("lets reference diffusion strength influence the selected macro pairs", () => {
    const source = new Uint8Array(256 * 192 * 4);
    for (let y = 0; y < 192; y += 1) {
      const color = y < 96 ? [130, 30, 0, 255] : [205, 100, 0, 255];
      for (let x = 0; x < 256; x += 1) {
        source.set(color, (y * 256 + x) * 4);
      }
    }
    const results = [20, 33, 100].map((ditheringAmount) =>
      convertToZx(source, 256, 192, settings({
        framing: "stretch",
        brightMode: "off",
        dithering: "error-diffusion",
        ditheringAmount,
      }))
    );
    expect(results[1]?.attributes).toEqual(results[0]?.attributes);
    expect(results[2]?.attributes).not.toEqual(results[0]?.attributes);
    for (const candidate of results) expect(validateScreen(candidate.screen)).toEqual([]);
    const result = results[1]!;
    expect(new Set(result.attributes.slice(0, 12 * 32))).toEqual(new Set([0x02]));
    expect(new Set(result.attributes.slice(12 * 32))).toEqual(new Set([0x16]));
    const yellowCounts = Array.from({ length: 96 }, (_, localY) => {
      const y = localY + 96;
      let count = 0;
      for (let x = 0; x < 256; x += 1) {
        const offset = (y * 256 + x) * 4;
        if (
          result.previewRgba[offset] === 205 &&
          result.previewRgba[offset + 1] === 205 &&
          result.previewRgba[offset + 2] === 0
        ) count += 1;
      }
      return count;
    });
    expect(new Set(yellowCounts)).toEqual(new Set([128]));
  });

  it("produces deterministic, constraint-valid output for every matrix and diffusion", () => {
    const source = solid(1, 1, [128, 128, 128, 255]);
    for (const orderedMatrix of Object.keys(ORDERED_MATRICES) as Array<keyof typeof ORDERED_MATRICES>) {
      const first = convertToZx(source, 1, 1, settings({ framing: "stretch", dithering: "ordered", ditheringAmount: 100, orderedMatrix }));
      const second = convertToZx(source, 1, 1, settings({ framing: "stretch", dithering: "ordered", ditheringAmount: 100, orderedMatrix }));
      expect(serializeScr(first.screen)).toEqual(serializeScr(second.screen));
      expect(validateScreen(first.screen)).toEqual([]);
    }
    const diffused = convertToZx(source, 1, 1, settings({ framing: "stretch", dithering: "error-diffusion", ditheringAmount: 100 }));
    expect(validateScreen(diffused.screen)).toEqual([]);
  }, 30_000);

  it("uses one canonical INK/PAPER orientation and never emits reversed pairs", () => {
    const source = new Uint8Array(32 * 16 * 4);
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 32; x += 1) {
        const offset = (y * 32 + x) * 4;
        source[offset] = 0;
        source[offset + 1] = 40 + x * 4;
        source[offset + 2] = 35 + x * 4;
        source[offset + 3] = 255;
      }
    }
    const result = convertToZx(source, 32, 16, settings({
      framing: "stretch",
      dithering: "ordered",
      ditheringAmount: 100,
      orderedMatrix: "bayer-2x2",
    }));
    for (const attribute of result.screen.attributes) {
      expect(attribute & 7).toBeGreaterThanOrEqual((attribute >> 3) & 7);
    }
  });

  it.each([8, 4, 2, 1] as const)(
    "creates two independently valid ZX screens for mixed 8x%s mode",
    (attributeHeight) => {
    const result = convertToZx(
      solid(1, 1, [128, 128, 128, 255]),
      1,
      1,
      settings({
        modeId: "zx48-mixed-256x192",
        framing: "stretch",
        attributeOptimizerId: "zx-guide-reference-halo-v2",
        ditherEngineId: "none-discrete-v2",
        dithering: "none",
        ditheringAmount: 0,
        attributeHeight,
      }),
    );

    expect(result.frames).toHaveLength(2);
    for (const frame of result.frames) {
      expect(frame.encoded).toHaveLength(zxSoftwareScrBytes(attributeHeight));
      expect(validateSoftwareScr(frame.encoded, attributeHeight)).toEqual([]);
    }
    expect(result.frames[0]?.encoded).not.toEqual(result.frames[1]?.encoded);
    for (let offset = 0; offset < result.mergedPreviewRgba.length; offset += 4) {
      expect(result.mergedPreviewRgba[offset]).toBe(
        ((result.frames[0]?.previewRgba[offset] ?? 0) +
          (result.frames[1]?.previewRgba[offset] ?? 0)) >> 1,
      );
    }
    },
    10_000,
  );

  it("keeps ordered mixed-screen phase stable across the nearest-color boundary", () => {
    const source = new Uint8Array(256 * 192 * 4);
    for (let y = 0; y < 192; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const offset = (y * 256 + x) * 4;
        source[offset] = x < 128 ? 48 : 56;
        source[offset + 3] = 255;
      }
    }
    const base = settings({
      modeId: "zx48-mixed-256x192",
      framing: "stretch",
      resampling: "nearest",
      attributeOptimizerId: "zx-guide-reference-halo-v1",
      dithering: "ordered",
      ditheringAmount: 81,
      orderedMatrix: "checkerboard-2x1",
      paletteSelections: [
        {
          screenIndex: 0,
          enabledColorIds: [0, 1, 2, 3, 4, 5, 6, 7],
          brightMode: "off",
        },
        {
          screenIndex: 1,
          enabledColorIds: [0, 1, 2, 3, 4, 5, 6, 7],
          brightMode: "off",
        },
      ],
    });
    const dominantRedParity = (
      rgba: Uint8Array,
      startX: number,
      endX: number,
    ): number => {
      const counts = [0, 0];
      for (let y = 0; y < 192; y += 1) {
        for (let x = startX; x < endX; x += 1) {
          const offset = (y * 256 + x) * 4;
          if ((rgba[offset] ?? 0) > 0) counts[(x + y) & 1]! += 1;
        }
      }
      return counts[0]! > counts[1]! ? 0 : 1;
    };

    const legacy = convertToZx(source, 256, 192, {
      ...base,
      ditherEngineId: "ordered-strict-matrix-v6",
    });
    expect(dominantRedParity(legacy.preConstraintPreviewRgba, 0, 128))
      .not.toBe(dominantRedParity(legacy.preConstraintPreviewRgba, 128, 256));

    const corrected = convertToZx(source, 256, 192, {
      ...base,
      ditherEngineId: "ordered-mixed-phase-stable-v8",
    });
    expect(dominantRedParity(corrected.preConstraintPreviewRgba, 0, 128))
      .toBe(dominantRedParity(corrected.preConstraintPreviewRgba, 128, 256));
    corrected.frames.forEach((frame) => {
      expect(validateSoftwareScr(frame.encoded, 8)).toEqual([]);
    });
  }, 20_000);

  it("keeps asymmetric ZX palettes and BRIGHT policies on their designated screens", () => {
    const result = convertToZx(
      solid(1, 1, [128, 128, 0, 255]),
      1,
      1,
      settings({
        modeId: "zx48-mixed-256x192",
        framing: "stretch",
        attributeOptimizerId: "zx-guide-reference-halo-v2",
        paletteSelections: [
          {
            screenIndex: 0,
            enabledColorIds: [0, 2],
            brightMode: "off",
          },
          {
            screenIndex: 1,
            enabledColorIds: [4, 6],
            brightMode: "on",
          },
        ],
        screenFlickerSuppression: true,
      }),
    );
    const expected = [
      { colors: new Set([0, 2]), bright: false },
      { colors: new Set([4, 6]), bright: true },
    ];
    result.frames.forEach((frame, screenIndex) => {
      for (const attribute of frame.encoded.subarray(6_144)) {
        expect(expected[screenIndex]!.colors.has(attribute & 7)).toBe(true);
        expect(expected[screenIndex]!.colors.has((attribute >> 3) & 7)).toBe(true);
        expect((attribute & 0x40) !== 0).toBe(expected[screenIndex]!.bright);
      }
    });
  });

  it("orients mixed ZX endpoints by complete attribute cells", () => {
    const convert = (screenFlickerSuppression: boolean) =>
      convertToZx(
        solid(1, 1, [128, 128, 128, 255]),
        1,
        1,
        settings({
        modeId: "zx48-mixed-256x192",
        framing: "stretch",
        attributeOptimizerId: "zx-guide-reference-halo-v2",
        ditherEngineId: "none-discrete-v2",
        dithering: "none",
        ditheringAmount: 0,
          screenFlickerSuppression,
        }),
      );
    const result = convert(true);
    for (const frame of result.frames) {
      const firstCellColors = new Set<string>();
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          const offset = (y * 256 + x) * 4;
          firstCellColors.add(
            `${frame.previewRgba[offset]},${frame.previewRgba[offset + 1]},${frame.previewRgba[offset + 2]}`,
          );
        }
      }
      expect(firstCellColors.size).toBe(1);
    }
    const enabledFirst = result.frames[0]!.previewRgba;
    const disabledFirst = convert(false).frames[0]!.previewRgba;
    expect(enabledFirst.subarray(0, 3)).not.toEqual(
      enabledFirst.subarray(8 * 4, 8 * 4 + 3),
    );
    expect(disabledFirst.subarray(0, 3)).toEqual(
      disabledFirst.subarray(8 * 4, 8 * 4 + 3),
    );
  });
});
