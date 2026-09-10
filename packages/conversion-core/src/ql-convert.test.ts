import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONVERSION_SETTINGS,
  buildMixedResolutionPalette,
  buildTemporalCrossPalette,
  convertToQl,
  convertToZx,
} from "./index.js";

function qlPaletteSelections(colors: readonly number[], screens: 1 | 2 = 2) {
  return Array.from({ length: screens }, (_, screenIndex) => ({
    screenIndex,
    enabledColorIds: [...colors],
  }));
}

function checkerOccupancy(
  pixels: Uint8Array,
  width: number,
  height: number,
): number {
  let checker = 0;
  let intermediate = 0;
  for (let y = 0; y + 1 < height; y += 1) {
    for (let x = 0; x + 1 < width; x += 1) {
      const a = pixels[y * width + x] ?? 0;
      const b = pixels[y * width + x + 1] ?? 0;
      const c = pixels[(y + 1) * width + x] ?? 0;
      const d = pixels[(y + 1) * width + x + 1] ?? 0;
      if (new Set([a, b, c, d]).size < 2) continue;
      intermediate += 1;
      if (a === d && b === c && a !== b) checker += 1;
    }
  }
  return checker / Math.max(1, intermediate);
}

describe("Sinclair QL conversion", () => {
  it.each([
    ["mode8-plain-256x256", 256, 1],
    ["mode4-plain-512x256", 512, 1],
    ["mode8-256x256", 256, 2],
    ["mode4-512x256", 512, 2],
    ["mode8-mode4-mixed-512x256", 512, 2],
  ] as const)("supports v4.4 in %s", (modeId, expectedWidth, screenCount) => {
    const source = new Uint8Array([128, 128, 128, 255]);
    const selections = Array.from({ length: screenCount }, (_, screenIndex) => ({
      screenIndex,
      enabledColorIds: (modeId.startsWith("mode4-") ||
        (screenIndex === 1 && modeId === "mode8-mode4-mixed-512x256"))
        ? [0, 1, 2, 3]
        : [0, 1, 2, 3, 4, 5, 6, 7],
    }));
    const settings = {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "sinclair-ql" as const,
      profileId: "org.retroconverter.sinclair-ql.default",
      modeId,
      framing: "stretch" as const,
      resampling: "nearest" as const,
      dithering: "error-diffusion" as const,
      ditherEngineId: "error-diffusion-checker-phase-v4-4" as const,
      ditheringAmount: 35,
      errorDiffusionLineSuppression: 75,
      paletteSelections: selections,
    };
    const first = convertToQl(source, 1, 1, settings);
    const second = convertToQl(source, 1, 1, settings);
    expect(first).toEqual(second);
    expect(first.width).toBe(expectedWidth);
    expect(first.frames).toHaveLength(screenCount);
    expect(first.frames.every((frame) => frame.encoded.length === 32_768)).toBe(true);
    expect(first.previewRgba).toHaveLength(expectedWidth * 256 * 4);
  }, 20_000);

  it("uses genuine paired 512-wide samples in mixed optimizer v2", () => {
    const source = new Uint8Array(512 * 4);
    for (let x = 0; x < 512; x += 1) {
      const offset = x * 4;
      source[offset] = (x & 1) === 0 ? 255 : 0;
      source[offset + 2] = (x & 1) === 0 ? 0 : 255;
      source[offset + 3] = 255;
    }
    const settings = {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "sinclair-ql" as const,
      profileId: "org.retroconverter.sinclair-ql.default",
      modeId: "mode8-mode4-mixed-512x256" as const,
      framing: "stretch" as const,
      resampling: "nearest" as const,
      paletteSelections: [
        { screenIndex: 0, enabledColorIds: [0, 1, 2, 3, 4, 5, 6, 7] },
        { screenIndex: 1, enabledColorIds: [0, 1, 2, 3] },
      ],
    };
    const legacy = convertToQl(source, 512, 1, {
      ...settings,
      qlMixedOptimizerId: "ql-mixed-average-v1",
    });
    const balanced = convertToQl(source, 512, 1, {
      ...settings,
      qlMixedOptimizerId: "ql-mixed-balanced-v2",
    });
    expect(legacy.sourcePreviewRgba[0]).toBe(legacy.sourcePreviewRgba[4]);
    expect(balanced.sourcePreviewRgba[0]).not.toBe(
      balanced.sourcePreviewRgba[4],
    );
    expect(balanced.frames[0]?.encoded).toHaveLength(32_768);
    expect(balanced.frames[1]?.encoded).toHaveLength(32_768);
    expect(convertToQl(source, 512, 1, {
      ...settings,
      qlMixedOptimizerId: "ql-mixed-balanced-v2",
    }).frames).toEqual(balanced.frames);
  }, 15_000);

  it("builds all 128 deterministic mixed Low/High candidates", () => {
    const lowPalette = [
      { r: 0, g: 0, b: 0 },
      { r: 100, g: 200, b: 240 },
      ...Array.from({ length: 6 }, () => ({ r: 0, g: 0, b: 0 })),
    ];
    const highPalette = [
      { r: 0, g: 0, b: 0 },
      { r: 200, g: 0, b: 0 },
      { r: 0, g: 200, b: 0 },
      { r: 200, g: 200, b: 200 },
    ];
    const palette = buildMixedResolutionPalette(
      lowPalette,
      [0, 1, 2, 3, 4, 5, 6, 7],
      highPalette,
      [0, 1, 2, 3],
    );

    expect(palette).toHaveLength(128);
    expect(palette[16]).toEqual({
      first: 1,
      second: 0,
      low: 1,
      highLeft: 0,
      highRight: 0,
      r: 50,
      g: 100,
      b: 120,
    });
    expect(palette[23]).toEqual({
      first: 1,
      second: 1,
      low: 1,
      highLeft: 1,
      highRight: 3,
      r: 150,
      g: 150,
      b: 170,
    });
    expect(palette.some((candidate, index) =>
      palette.some((other, otherIndex) =>
        index !== otherIndex &&
        candidate.r === other.r &&
        candidate.g === other.g &&
        candidate.b === other.b &&
        (
          candidate.highLeft !== other.highLeft ||
          candidate.highRight !== other.highRight
        )
      )
    )).toBe(true);
  });

  it("jointly converts mixed Mode 8 and Mode 4 on a common 512 canvas", () => {
    const result = convertToQl(
      new Uint8Array([120, 90, 40, 255]),
      1,
      1,
      {
        ...DEFAULT_CONVERSION_SETTINGS,
        platformId: "sinclair-ql",
        profileId: "org.retroconverter.sinclair-ql.default",
        modeId: "mode8-mode4-mixed-512x256",
        framing: "stretch",
        paletteSelections: [
          { screenIndex: 0, enabledColorIds: [0, 2, 4, 6] },
          { screenIndex: 1, enabledColorIds: [0, 1, 2, 3] },
        ],
      },
    );

    expect(result.width).toBe(512);
    expect(result.height).toBe(256);
    expect(result.pixelAspectRatio).toBeCloseTo(2 / 3);
    expect(result.frames).toHaveLength(2);
    expect(result.frames[0]).toMatchObject({
      hardwareModeId: "mode8-256x256",
      nativeWidth: 256,
      nativeHeight: 256,
      nativePixelAspectRatio: 4 / 3,
    });
    expect(result.frames[1]).toMatchObject({
      hardwareModeId: "mode4-512x256",
      nativeWidth: 512,
      nativeHeight: 256,
      nativePixelAspectRatio: 2 / 3,
    });
    expect(result.frames[0]!.encoded).toHaveLength(32_768);
    expect(result.frames[1]!.encoded).toHaveLength(32_768);
    expect(result.frames[0]!.paletteIndices).toHaveLength(256 * 256);
    expect(result.frames[1]!.paletteIndices).toHaveLength(512 * 256);
    for (const buffer of [
      result.sourcePreviewRgba,
      result.preConstraintPreviewRgba,
      result.frames[0]!.previewRgba,
      result.frames[1]!.previewRgba,
      result.mergedPreviewRgba,
    ]) {
      expect(buffer).toHaveLength(512 * 256 * 4);
    }
    expect([...result.frames[0]!.paletteIndices].every((color) =>
      [0, 2, 4, 6].includes(color)
    )).toBe(true);
    expect([...result.frames[1]!.paletteIndices].every((color) =>
      [0, 1, 2, 3].includes(color)
    )).toBe(true);
    for (let offset = 0; offset < result.mergedPreviewRgba.length; offset += 4) {
      expect(result.mergedPreviewRgba[offset]).toBe(
        ((result.frames[0]!.previewRgba[offset] ?? 0) +
          (result.frames[1]!.previewRgba[offset] ?? 0)) >> 1,
      );
    }
  });

  it("uses adaptive row ordering only in stable mixed-resolution regions", () => {
    const convert = (screenFlickerSuppression: boolean) => convertToQl(
      new Uint8Array([128, 0, 0, 255]),
      1,
      1,
      {
        ...DEFAULT_CONVERSION_SETTINGS,
        platformId: "sinclair-ql",
        profileId: "org.retroconverter.sinclair-ql.default",
        modeId: "mode8-mode4-mixed-512x256",
        framing: "stretch",
        screenFlickerSuppression,
        paletteSelections: [
          { screenIndex: 0, enabledColorIds: [0] },
          { screenIndex: 1, enabledColorIds: [0, 1] },
        ],
      },
    );
    const fixed = convert(false);
    const adaptive = convert(true);
    const fixedHigh = fixed.frames[1]!.paletteIndices;
    const adaptiveHigh = adaptive.frames[1]!.paletteIndices;

    expect(adaptiveHigh[0]).toBe(fixedHigh[1]);
    expect(adaptiveHigh[1]).toBe(fixedHigh[0]);
    expect(adaptiveHigh[512]).toBe(fixedHigh[512]);
    expect(adaptiveHigh[513]).toBe(fixedHigh[513]);
  });

  it("builds deterministic oriented Cartesian mixed-color pairs", () => {
    const palette = [
      { r: 0, g: 0, b: 0 },
      { r: 255, g: 0, b: 0 },
      { r: 0, g: 255, b: 0 },
    ];
    expect(buildTemporalCrossPalette(palette, [2, 0], [1, 0])).toEqual([
      { first: 0, second: 0, r: 0, g: 0, b: 0 },
      { first: 0, second: 1, r: 127, g: 0, b: 0 },
      { first: 2, second: 0, r: 0, g: 127, b: 0 },
      { first: 2, second: 1, r: 127, g: 127, b: 0 },
    ]);
  });

  it("keeps asymmetric mixed palettes on their designated QL screens", () => {
    const result = convertToQl(
      new Uint8Array([128, 128, 0, 255]),
      1,
      1,
      {
        ...DEFAULT_CONVERSION_SETTINGS,
        platformId: "sinclair-ql",
        profileId: "org.retroconverter.sinclair-ql.default",
        modeId: "mode8-256x256",
        framing: "stretch",
        paletteSelections: [
          { screenIndex: 0, enabledColorIds: [0, 4] },
          { screenIndex: 1, enabledColorIds: [2, 6] },
        ],
        screenFlickerSuppression: true,
      },
    );
    expect([...result.frames[0]!.paletteIndices].every((color) =>
      color === 0 || color === 4
    )).toBe(true);
    expect([...result.frames[1]!.paletteIndices].every((color) =>
      color === 2 || color === 6
    )).toBe(true);
  });

  it("creates two Mode 8 screens and an exact merged preview", () => {
    const source = new Uint8Array(4);
    source.set([128, 128, 0, 255]);
    const result = convertToQl(source, 1, 1, {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "sinclair-ql",
      profileId: "org.retroconverter.sinclair-ql.default",
      modeId: "mode8-256x256",
      paletteSelections: qlPaletteSelections([0, 1, 2, 3, 4, 5, 6, 7]),
    });
    expect(result.frames).toHaveLength(2);
    expect(result.frames[0]?.encoded).toHaveLength(32_768);
    expect(result.frames[1]?.encoded).toHaveLength(32_768);
    for (let offset = 0; offset < result.mergedPreviewRgba.length; offset += 4) {
      expect(result.mergedPreviewRgba[offset]).toBe(
        ((result.frames[0]?.previewRgba[offset] ?? 0) +
          (result.frames[1]?.previewRgba[offset] ?? 0)) >> 1,
      );
    }
  });

  it("makes QL pixel-level endpoint swapping optional", () => {
    const convert = (screenFlickerSuppression: boolean) => convertToQl(
      new Uint8Array([128, 128, 128, 255]),
      1,
      1,
      {
        ...DEFAULT_CONVERSION_SETTINGS,
        platformId: "sinclair-ql",
        profileId: "org.retroconverter.sinclair-ql.default",
        modeId: "mode8-256x256",
        framing: "stretch",
        screenFlickerSuppression,
        paletteSelections: qlPaletteSelections([0, 1, 2, 3, 4, 5, 6, 7]),
      },
    );
    const enabled = convert(true);
    const disabled = convert(false);

    expect(new Set(enabled.frames[0]!.paletteIndices).size).toBe(2);
    expect(new Set(disabled.frames[0]!.paletteIndices).size).toBe(1);
    expect(enabled.mergedPreviewRgba).toEqual(disabled.mergedPreviewRgba);
  });

  it("creates 512 by 256 Mode 4 frames", () => {
    const source = new Uint8Array([0, 0, 0, 255]);
    const result = convertToQl(source, 1, 1, {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "sinclair-ql",
      profileId: "org.retroconverter.sinclair-ql.default",
      modeId: "mode4-512x256",
      paletteSelections: qlPaletteSelections([0, 1, 2, 3]),
    });
    expect(result.width).toBe(512);
    expect(result.height).toBe(256);
    expect(result.pixelAspectRatio).toBeCloseTo(2 / 3);
  });

  it.each([
    ["mode8-256x256", 256, 2],
    ["mode8-plain-256x256", 256, 1],
    ["mode4-512x256", 512, 2],
    ["mode4-plain-512x256", 512, 1],
  ] as const)(
    "frames a 4:3 source without cropping for %s Fill",
    (modeId, width, screenCount) => {
      const source = new Uint8Array(4 * 3 * 4);
      for (let y = 0; y < 3; y += 1) {
        for (let x = 0; x < 4; x += 1) {
          source.set([x * 60, y * 90, x + y, 255], (y * 4 + x) * 4);
        }
      }
      const paletteSize = width === 256 ? 8 : 4;
      const result = convertToQl(source, 4, 3, {
        ...DEFAULT_CONVERSION_SETTINGS,
        platformId: "sinclair-ql",
        profileId: "org.retroconverter.sinclair-ql.default",
        modeId,
        framing: "fill",
        resampling: "nearest",
        paletteSelections: qlPaletteSelections(
          Array.from({ length: paletteSize }, (_, index) => index),
          screenCount,
        ),
      });
      const pixel = (x: number, y: number) =>
        Array.from(result.sourcePreviewRgba.subarray(
          (y * width + x) * 4,
          (y * width + x) * 4 + 4,
        ));
      expect(pixel(0, 0)).toEqual([0, 0, 0, 255]);
      expect(pixel(width - 1, 0)).toEqual([180, 0, 3, 255]);
      expect(pixel(0, 255)).toEqual([0, 180, 2, 255]);
      expect(pixel(width - 1, 255)).toEqual([180, 180, 5, 255]);
    },
  );

  it.each([
    ["mode8-plain-256x256", 256, 8],
    ["mode4-plain-512x256", 512, 4],
  ] as const)(
    "creates one direct-palette screen for %s",
    (modeId, width, paletteSize) => {
      const source = new Uint8Array([96, 160, 32, 255]);
      const result = convertToQl(source, 1, 1, {
        ...DEFAULT_CONVERSION_SETTINGS,
        platformId: "sinclair-ql",
        profileId: "org.retroconverter.sinclair-ql.default",
        modeId,
        framing: "stretch",
        paletteSelections: qlPaletteSelections(
          Array.from({ length: paletteSize }, (_, index) => index),
          1,
        ),
      });

      expect(result.width).toBe(width);
      expect(result.frames).toHaveLength(1);
      expect(result.frames[0]?.encoded).toHaveLength(32_768);
      expect(result.mergedPreviewRgba).toEqual(
        result.frames[0]?.previewRgba,
      );
      expect(result.preConstraintPreviewRgba).toEqual(
        result.frames[0]?.previewRgba,
      );
    },
  );

  it("applies ordered dithering directly to the plain Mode 8 palette", () => {
    const source = new Uint8Array([96, 96, 96, 255]);
    const convert = (ditheringAmount: number) => convertToQl(source, 1, 1, {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "sinclair-ql",
      profileId: "org.retroconverter.sinclair-ql.default",
      modeId: "mode8-plain-256x256",
      framing: "stretch",
      paletteSelections: qlPaletteSelections([0, 1, 2, 3, 4, 5, 6, 7], 1),
      dithering: "ordered",
      ditherEngineId: "ordered-unrestricted-v2",
      ditheringAmount,
      orderedMatrix: "bayer-4x4",
    });

    const zero = convert(0);
    const full = convert(100);
    expect(full.frames).toHaveLength(1);
    expect(full.previewRgba).not.toEqual(zero.previewRgba);
  });

  it.each([
    ["mode8-plain-256x256", 256, [0, 1, 2, 3, 4, 5, 6, 7]],
    ["mode4-plain-512x256", 512, [0, 1, 2, 3]],
  ] as const)("applies deterministic Artistic placement to %s", (modeId, width, colors) => {
    const source = new Uint8Array([144, 144, 144, 255]);
    const settings = {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "sinclair-ql" as const,
      profileId: "org.retroconverter.sinclair-ql.default",
      modeId,
      framing: "stretch" as const,
      dithering: "ordered" as const,
      ditherEngineId: "artistic-ordered-hybrid-v1" as const,
      ditheringAmount: 100,
      artisticPattern: "checkerboard" as const,
      paletteSelections: qlPaletteSelections(colors, 1),
    };
    const first = convertToQl(source, 1, 1, settings);
    const second = convertToQl(source, 1, 1, settings);
    expect(first.width).toBe(width);
    expect(first.frames[0]!.encoded).toEqual(second.frames[0]!.encoded);
    expect(new Set(first.frames[0]!.paletteIndices).size).toBeGreaterThan(1);
    expect(first.frames[0]!.paletteIndices.every((index) => colors.includes(index as never))).toBe(true);

    const zero = convertToQl(source, 1, 1, { ...settings, ditheringAmount: 0 });
    const none = convertToQl(source, 1, 1, {
      ...settings,
      ditherEngineId: "none-discrete-v2",
      dithering: "none",
      ditheringAmount: 0,
    });
    expect(zero.frames[0]!.encoded).toEqual(none.frames[0]!.encoded);
  }, 20_000);

  it("applies Artistic placement to temporal QL modes", () => {
    const result = convertToQl(new Uint8Array([128, 128, 128, 255]), 1, 1, {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "sinclair-ql",
      profileId: "org.retroconverter.sinclair-ql.default",
      modeId: "mode8-256x256",
      framing: "stretch",
      dithering: "ordered",
      ditherEngineId: "artistic-ordered-hybrid-v1",
      ditheringAmount: 100,
      paletteSelections: qlPaletteSelections([0, 1, 2, 3, 4, 5, 6, 7]),
    });
    expect(result.frames).toHaveLength(2);
    expect(result.frames[0]!.paletteIndices).not.toEqual(result.frames[1]!.paletteIndices);
  });

  it("lets Artistic temporal endpoint swapping control the two screen frames", () => {
    const convert = (screenFlickerSuppression: boolean) => convertToQl(
      new Uint8Array([128, 128, 128, 255]),
      1,
      1,
      {
        ...DEFAULT_CONVERSION_SETTINGS,
        platformId: "sinclair-ql",
        profileId: "org.retroconverter.sinclair-ql.default",
        modeId: "mode8-256x256",
        framing: "stretch",
        dithering: "ordered",
        ditherEngineId: "artistic-ordered-hybrid-v1",
        ditheringAmount: 100,
        errorDiffusionLineSuppression: 100,
        artisticPattern: "checkerboard",
        screenFlickerSuppression,
        paletteSelections: qlPaletteSelections([0, 7]),
      },
    );
    const disabled = convert(false);
    const enabled = convert(true);
    const differs = (left: Uint8Array, right: Uint8Array) =>
      left.some((value, index) => value !== right[index]);

    expect(differs(disabled.frames[0]!.paletteIndices, enabled.frames[0]!.paletteIndices)).toBe(true);
    expect(differs(disabled.frames[1]!.paletteIndices, enabled.frames[1]!.paletteIndices)).toBe(true);
    expect(enabled.mergedPreviewRgba).toEqual(disabled.mergedPreviewRgba);
  }, 20_000);

  it.each([
    ["mode8-256x256", 256, [0, 7]],
    ["mode4-512x256", 512, [0, 3]],
  ] as const)("uses an Artistic checker candidate field for v4.4 %s", (modeId, width, colors) => {
    const source = new Uint8Array(width * 256 * 4);
    for (let offset = 0; offset < source.length; offset += 4) {
      source[offset] = 188;
      source[offset + 1] = 188;
      source[offset + 2] = 188;
      source[offset + 3] = 255;
    }
    const convert = (suppression: number, screenFlickerSuppression = true) =>
      convertToQl(source, width, 256, {
        ...DEFAULT_CONVERSION_SETTINGS,
        platformId: "sinclair-ql",
        profileId: "org.retroconverter.sinclair-ql.default",
        modeId,
        framing: "stretch",
        dithering: "error-diffusion",
        ditherEngineId: "error-diffusion-checker-phase-v4-4",
        ditheringAmount: 100,
        errorDiffusionLineSuppression: suppression,
        screenFlickerSuppression,
        paletteSelections: qlPaletteSelections(colors),
      });
    const neutral = convert(0);
    const checker = convert(100);
    const repeated = convert(100);
    expect(checker.frames).toHaveLength(2);
    expect(checker).toEqual(repeated);
    expect(checker.mergedPreviewRgba).not.toEqual(neutral.mergedPreviewRgba);
    const checkerScore = checkerOccupancy(
      checker.frames[0]!.paletteIndices,
      width,
      256,
    );
    const neutralScore = checkerOccupancy(
      neutral.frames[0]!.paletteIndices,
      width,
      256,
    );
    expect(checkerScore).toBeGreaterThan(0.45);
    expect(checkerScore).toBeGreaterThanOrEqual(neutralScore - 0.10);

    const swappedOff = convert(100, false);
    expect(swappedOff.frames[0]!.paletteIndices).not.toEqual(
      checker.frames[0]!.paletteIndices,
    );
    expect(swappedOff.frames[1]!.paletteIndices).not.toEqual(
      checker.frames[1]!.paletteIndices,
    );
    expect(swappedOff.mergedPreviewRgba).toEqual(checker.mergedPreviewRgba);
  }, 30_000);

  it("derives QL Mode 8/4 v4.4 frames from one legal candidate field", () => {
    const source = new Uint8Array(512 * 256 * 4);
    for (let offset = 0; offset < source.length; offset += 4) {
      source[offset] = 188;
      source[offset + 1] = 188;
      source[offset + 2] = 188;
      source[offset + 3] = 255;
    }
    const settings = {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "sinclair-ql" as const,
      profileId: "org.retroconverter.sinclair-ql.default",
      modeId: "mode8-mode4-mixed-512x256" as const,
      framing: "stretch" as const,
      dithering: "error-diffusion" as const,
      ditherEngineId: "error-diffusion-checker-phase-v4-4" as const,
      ditheringAmount: 100,
      errorDiffusionLineSuppression: 100,
      screenFlickerSuppression: true,
      paletteSelections: [
        { screenIndex: 0, enabledColorIds: [0, 1, 2, 3, 4, 5, 6, 7] },
        { screenIndex: 1, enabledColorIds: [0, 1, 2, 3] },
      ],
    };
    const first = convertToQl(source, 512, 256, settings);
    const second = convertToQl(source, 512, 256, settings);
    expect(first).toEqual(second);
    expect(first.frames[0]!.paletteIndices.every((index) => index < 8)).toBe(true);
    expect(first.frames[1]!.paletteIndices.every((index) => index < 4)).toBe(true);
    for (let y = 0; y < 256; y += 1) {
      for (let x = 0; x < 256; x += 1) {
        const highOffset = y * 512 + x * 2;
        const left = first.frames[1]!.paletteIndices[highOffset]!;
        const right = first.frames[1]!.paletteIndices[highOffset + 1]!;
        expect(left).toBeLessThan(4);
        expect(right).toBeLessThan(4);
      }
    }
  }, 30_000);

  it("applies suppression-scaled Artistic checker placement to QL mixed resolution", () => {
    const source = new Uint8Array(512 * 256 * 4);
    for (let y = 0; y < 256; y += 1) for (let x = 0; x < 512; x += 1) {
      const value = Math.round((x + y) * 255 / (512 + 256 - 2));
      const offset = (y * 512 + x) * 4;
      source[offset] = value;
      source[offset + 1] = value;
      source[offset + 2] = value;
      source[offset + 3] = 255;
    }
    const convert = (suppression: number) => convertToQl(source, 512, 256, {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "sinclair-ql",
      profileId: "org.retroconverter.sinclair-ql.default",
      modeId: "mode8-mode4-mixed-512x256",
      framing: "stretch",
      resampling: "nearest",
      dithering: "ordered",
      ditherEngineId: "artistic-ordered-hybrid-v1",
      ditheringAmount: 35,
      errorDiffusionLineSuppression: suppression,
      artisticPattern: "checkerboard",
      paletteSelections: [
        { screenIndex: 0, enabledColorIds: [0, 1, 2, 3, 4, 5, 6, 7] },
        { screenIndex: 1, enabledColorIds: [0, 1, 2, 3] },
      ],
    });
    const low = convert(25);
    const high = convert(75);
    expect(low.frames).toHaveLength(2);
    expect(high.frames).toHaveLength(2);
    expect(low.frames[0]!.encoded).not.toEqual(high.frames[0]!.encoded);
    expect(low.frames[1]!.encoded).not.toEqual(high.frames[1]!.encoded);
    expect(high.frames[1]!.encoded).toEqual(convert(75).frames[1]!.encoded);
  }, 20_000);

  it("applies deterministic randomization in decorrelated diffusion v3", () => {
    const source = new Uint8Array([255, 128, 128, 255]);
    const convert = (randomization: number) => convertToQl(source, 1, 1, {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "sinclair-ql",
      profileId: "org.retroconverter.sinclair-ql.default",
      modeId: "mode8-plain-256x256",
      framing: "stretch",
      paletteSelections: qlPaletteSelections([0, 1, 2, 3, 4, 5, 6, 7], 1),
      dithering: "error-diffusion",
      ditherEngineId: "error-diffusion-decorrelated-v3",
      ditheringAmount: 100,
      errorDiffusionRandomization: randomization,
    });

    const baseline = convert(0);
    const first = convert(60);
    const second = convert(60);
    expect(first.frames[0]?.encoded).toEqual(second.frames[0]?.encoded);
    expect(first.preConstraintPreviewRgba)
      .not.toEqual(baseline.preConstraintPreviewRgba);
  });

  it("reduces long vertical diffusion runs in a flat red transition", () => {
    const source = new Uint8Array([255, 104, 104, 255]);
    const convert = (ditherEngineId:
      | "error-diffusion-unrestricted-v2"
      | "error-diffusion-decorrelated-v3"
      | "error-diffusion-phase-balanced-v3"
      | "error-diffusion-checker-phase-v4") => convertToQl(source, 1, 1, {
        ...DEFAULT_CONVERSION_SETTINGS,
        platformId: "sinclair-ql",
        profileId: "org.retroconverter.sinclair-ql.default",
        modeId: "mode4-plain-512x256",
        framing: "stretch",
        paletteSelections: qlPaletteSelections([0, 1, 2, 3], 1),
        dithering: "error-diffusion",
        ditherEngineId,
        ditheringAmount: 100,
      errorDiffusionRandomization: 60,
      errorDiffusionLineSuppression: 100,
      });
    const maximumVerticalRun = (pixels: Uint8Array): number => {
      let maximum = 0;
      for (let x = 0; x < 512; x += 1) {
        let run = 1;
        for (let y = 1; y < 256; y += 1) {
          if (
            pixels[y * 512 + x] ===
            pixels[(y - 1) * 512 + x]
          ) {
            run += 1;
          } else {
            maximum = Math.max(maximum, run);
            run = 1;
          }
        }
        maximum = Math.max(maximum, run);
      }
      return maximum;
    };
    const legacy = convert("error-diffusion-unrestricted-v2");
    const decorrelated = convert("error-diffusion-decorrelated-v3");
    const phaseBalanced = convert("error-diffusion-phase-balanced-v3");
    const checkerPhase = convert("error-diffusion-checker-phase-v4");

    expect(maximumVerticalRun(decorrelated.frames[0]!.paletteIndices))
      .toBeLessThan(maximumVerticalRun(legacy.frames[0]!.paletteIndices));
    expect(phaseBalanced.frames[0]?.encoded).toEqual(
      convert("error-diffusion-phase-balanced-v3").frames[0]?.encoded,
    );
    expect(phaseBalanced.frames[0]?.encoded).not.toEqual(
      legacy.frames[0]?.encoded,
    );
    expect(checkerPhase.frames[0]?.encoded).toEqual(
      convert("error-diffusion-checker-phase-v4").frames[0]?.encoded,
    );
    expect(checkerPhase.frames[0]?.encoded).not.toEqual(
      legacy.frames[0]?.encoded,
    );
  });

  it("keeps v3.1 QL placement deterministic and valid", () => {
    const source = new Uint8Array(256 * 256 * 4);
    for (let pixel = 0; pixel < 256 * 256; pixel += 1) {
      const value = 96 + ((pixel * 13) % 96);
      source[pixel * 4] = value;
      source[pixel * 4 + 1] = value;
      source[pixel * 4 + 2] = value;
      source[pixel * 4 + 3] = 255;
    }
    const settings = {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "sinclair-ql" as const,
      profileId: "org.retroconverter.sinclair-ql.default",
      modeId: "mode8-256x256" as const,
      framing: "stretch" as const,
      paletteSelections: qlPaletteSelections([0, 1, 2, 3, 4, 5, 6, 7]),
      dithering: "error-diffusion" as const,
      ditherEngineId: "error-diffusion-phase-balanced-checker-v3-1" as const,
      ditheringAmount: 100,
      errorDiffusionLineSuppression: 75,
      errorDiffusionRandomization: 0,
    };
    const first = convertToQl(source, 256, 256, settings);
    const second = convertToQl(source, 256, 256, settings);
    expect(first.frames[0]?.encoded).toEqual(second.frames[0]?.encoded);
    expect(first.frames[1]?.encoded).toEqual(second.frames[1]?.encoded);
    expect(first.frames[0]?.encoded).toHaveLength(32_768);
    expect(first.frames[1]?.encoded).toHaveLength(32_768);
  });

  it("keeps v3.2 QL temporal output deterministic and valid", () => {
    const source = new Uint8Array(256 * 256 * 4);
    for (let pixel = 0; pixel < 256 * 256; pixel += 1) {
      const value = 96 + ((pixel * 13) % 96);
      source[pixel * 4] = value;
      source[pixel * 4 + 1] = value;
      source[pixel * 4 + 2] = value;
      source[pixel * 4 + 3] = 255;
    }
    const settings = {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "sinclair-ql" as const,
      profileId: "org.retroconverter.sinclair-ql.default",
      modeId: "mode8-256x256" as const,
      framing: "stretch" as const,
      paletteSelections: qlPaletteSelections([0, 1, 2, 3, 4, 5, 6, 7]),
      dithering: "error-diffusion" as const,
      ditherEngineId: "error-diffusion-phase-balanced-checker-v3-2" as const,
      ditheringAmount: 100,
      errorDiffusionLineSuppression: 75,
      errorDiffusionRandomization: 0,
    };
    const first = convertToQl(source, 256, 256, settings);
    const second = convertToQl(source, 256, 256, settings);
    expect(first.frames[0]?.encoded).toEqual(second.frames[0]?.encoded);
    expect(first.frames[1]?.encoded).toEqual(second.frames[1]?.encoded);
    expect(first.frames[0]?.encoded).toHaveLength(32_768);
    expect(first.frames[1]?.encoded).toHaveLength(32_768);
  });

  it("keeps v3.3 QL temporal output deterministic and valid", () => {
    const source = new Uint8Array(256 * 256 * 4);
    for (let pixel = 0; pixel < 256 * 256; pixel += 1) {
      const value = 96 + ((pixel * 13) % 96);
      source[pixel * 4] = value;
      source[pixel * 4 + 1] = value;
      source[pixel * 4 + 2] = value;
      source[pixel * 4 + 3] = 255;
    }
    const conversionSettings = {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "sinclair-ql" as const,
      profileId: "org.retroconverter.sinclair-ql.default",
      modeId: "mode8-mode4-mixed-512x256" as const,
      framing: "stretch" as const,
      paletteSelections: [
        { screenIndex: 0, enabledColorIds: [0, 1, 2, 3, 4, 5, 6, 7] },
        { screenIndex: 1, enabledColorIds: [0, 1, 2, 3] },
      ],
      dithering: "error-diffusion" as const,
      ditherEngineId: "error-diffusion-phase-balanced-checker-v3-3" as const,
      ditheringAmount: 100,
      errorDiffusionLineSuppression: 100,
      errorDiffusionRandomization: 0,
    };
    const first = convertToQl(source, 256, 256, conversionSettings);
    const second = convertToQl(source, 256, 256, conversionSettings);
    expect(first.frames[0]?.encoded).toEqual(second.frames[0]?.encoded);
    expect(first.frames[1]?.encoded).toEqual(second.frames[1]?.encoded);
    expect(first.frames[0]?.encoded).toHaveLength(32_768);
    expect(first.frames[1]?.encoded).toHaveLength(32_768);
  });

  it("keeps projected phase-balanced v3 equal to unrestricted v2 at zero suppression", () => {
    const source = new Uint8Array([220, 108, 64, 255]);
    const base = {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "sinclair-ql" as const,
      profileId: "org.retroconverter.sinclair-ql.default",
      modeId: "mode8-plain-256x256" as const,
      framing: "stretch" as const,
      paletteSelections: qlPaletteSelections([0, 1, 2, 3, 4, 5, 6, 7], 1),
      dithering: "error-diffusion" as const,
      ditheringAmount: 100,
      errorDiffusionRandomization: 80,
    };
    const legacy = convertToQl(source, 1, 1, {
      ...base,
      ditherEngineId: "error-diffusion-unrestricted-v2",
    });
    const phaseBalanced = convertToQl(source, 1, 1, {
      ...base,
      ditherEngineId: "error-diffusion-phase-balanced-v3",
      errorDiffusionLineSuppression: 0,
    });
    expect(phaseBalanced.frames[0]?.encoded).toEqual(legacy.frames[0]?.encoded);
    expect(phaseBalanced.preConstraintPreviewRgba)
      .toEqual(legacy.preConstraintPreviewRgba);
  });

  it("keeps checker-phase v4 equal to unrestricted v2 at zero suppression", () => {
    const source = new Uint8Array([220, 108, 64, 255]);
    const base = {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "sinclair-ql" as const,
      profileId: "org.retroconverter.sinclair-ql.default",
      modeId: "mode8-plain-256x256" as const,
      framing: "stretch" as const,
      paletteSelections: qlPaletteSelections([0, 1, 2, 3, 4, 5, 6, 7], 1),
      dithering: "error-diffusion" as const,
      ditheringAmount: 100,
      errorDiffusionRandomization: 80,
      errorDiffusionLineSuppression: 0,
    };
    const legacy = convertToQl(source, 1, 1, {
      ...base,
      ditherEngineId: "error-diffusion-unrestricted-v2",
    });
    const checkerPhase = convertToQl(source, 1, 1, {
      ...base,
      ditherEngineId: "error-diffusion-checker-phase-v4",
    });
    expect(checkerPhase.frames[0]?.encoded).toEqual(legacy.frames[0]?.encoded);
    expect(checkerPhase.preConstraintPreviewRgba)
      .toEqual(legacy.preConstraintPreviewRgba);
  });

  it("uses softer local mixed tones in Ordered local-tone v3", () => {
    const source = new Uint8Array([96, 64, 64, 255]);
    const convert = (ditherEngineId:
      | "ordered-unrestricted-v2"
      | "ordered-local-tone-v3") => convertToQl(source, 1, 1, {
        ...DEFAULT_CONVERSION_SETTINGS,
        platformId: "sinclair-ql",
        profileId: "org.retroconverter.sinclair-ql.default",
        modeId: "mode8-256x256",
        framing: "stretch",
        paletteSelections: qlPaletteSelections([0, 1, 2, 3, 4, 5, 6, 7]),
        dithering: "ordered",
        ditherEngineId,
        ditheringAmount: 28,
        orderedMatrix: "bayer-8x8",
      });
    const maximumHorizontalContrast = (rgba: Uint8Array) => {
      let maximum = 0;
      for (let x = 0; x < 255; x += 1) {
        const offset = x * 4;
        const next = offset + 4;
        maximum = Math.max(
          maximum,
          Math.abs((rgba[offset] ?? 0) - (rgba[next] ?? 0)) +
          Math.abs((rgba[offset + 1] ?? 0) - (rgba[next + 1] ?? 0)) +
          Math.abs((rgba[offset + 2] ?? 0) - (rgba[next + 2] ?? 0)),
        );
      }
      return maximum;
    };

    const previous = convert("ordered-unrestricted-v2");
    const corrected = convert("ordered-local-tone-v3");

    expect(maximumHorizontalContrast(previous.mergedPreviewRgba)).toBe(381);
    expect(maximumHorizontalContrast(corrected.mergedPreviewRgba)).toBe(254);
    expect(corrected.score).toBeLessThan(previous.score);
  });

  it("matches the ZX BRIGHT ON ordered guide in plain QL Mode 8", () => {
    const width = 256;
    const height = 256;
    const source = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        source[offset] = x;
        source[offset + 1] = 255 - x;
        source[offset + 2] = Math.floor(x / 2);
        source[offset + 3] = 255;
      }
    }
    const common = {
      ...DEFAULT_CONVERSION_SETTINGS,
      framing: "stretch" as const,
      dithering: "ordered" as const,
      ditherEngineId: "ordered-palette-pairs-v4" as const,
      ditheringAmount: 63,
      orderedMatrix: "bayer-4x4" as const,
      paletteSelections: qlPaletteSelections([0, 1, 2, 3, 4, 5, 6, 7]),
    };
    const zx = convertToZx(source, width, height, {
      ...common,
      platformId: "zx-spectrum",
      profileId: "org.retroconverter.zx48.default",
      modeId: "zx48-standard-256x192",
      attributeOptimizerId: "zx-guide-reference-halo-v1",
      paletteSelections: [{
        screenIndex: 0,
        enabledColorIds: [0, 1, 2, 3, 4, 5, 6, 7],
        brightMode: "on",
      }],
    });
    const ql = convertToQl(source, width, height, {
      ...common,
      platformId: "sinclair-ql",
      profileId: "org.retroconverter.sinclair-ql.default",
      modeId: "mode8-plain-256x256",
      paletteSelections: qlPaletteSelections([0, 1, 2, 3, 4, 5, 6, 7], 1),
    });

    expect(ql.preConstraintPreviewRgba.subarray(0, width * 4))
      .toEqual(zx.preConstraintPreviewRgba.subarray(0, width * 4));
  });

  it("adds 1% mixed ordered dithering to the no-dither baseline", () => {
    const width = 256;
    const height = 256;
    const source = new Uint8Array(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        source[offset] = (x * 5 + y * 2) & 0xff;
        source[offset + 1] = (x * 2 + y * 3) & 0xff;
        source[offset + 2] = (x + y * 5) & 0xff;
        source[offset + 3] = 255;
      }
    }
    const common = {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "sinclair-ql" as const,
      profileId: "org.retroconverter.sinclair-ql.default",
      modeId: "mode8-256x256" as const,
      framing: "stretch" as const,
      paletteSelections: qlPaletteSelections([0, 1, 2, 3, 4, 5, 6, 7]),
    };
    const baseline = convertToQl(source, width, height, {
      ...common,
      dithering: "none",
      ditherEngineId: "none-discrete-v2",
      ditheringAmount: 0,
    });
    const convertOrdered = (ditheringAmount: number) => convertToQl(
      source,
      width,
      height,
      {
        ...common,
        dithering: "ordered",
        ditherEngineId: "ordered-baseline-additive-v5",
        ditheringAmount,
        orderedMatrix: "bayer-8x8",
      },
    );
    const changedPixelCount = (candidate: Uint8Array) => {
      let changedPixels = 0;
      for (let offset = 0; offset < baseline.mergedPreviewRgba.length; offset += 4) {
        if (
          baseline.mergedPreviewRgba[offset] !== candidate[offset] ||
          baseline.mergedPreviewRgba[offset + 1] !== candidate[offset + 1] ||
          baseline.mergedPreviewRgba[offset + 2] !== candidate[offset + 2]
        ) {
          changedPixels += 1;
        }
      }
      return changedPixels;
    };
    const onePercentChanges = changedPixelCount(
      convertOrdered(1).mergedPreviewRgba,
    );
    const tenPercentChanges = changedPixelCount(
      convertOrdered(10).mergedPreviewRgba,
    );

    expect(onePercentChanges).toBeLessThanOrEqual(width * height / 64);
    expect(tenPercentChanges).toBeGreaterThan(onePercentChanges);
  });

  it.each([
    "checkerboard-2x1",
    "bayer-2x2",
    "bayer-4x4",
    "bayer-8x8",
  ] as const)(
    "activates mixed %s ordered coverage at 1%%",
    (orderedMatrix) => {
      const source = new Uint8Array([64, 64, 64, 255]);
      const common = {
        ...DEFAULT_CONVERSION_SETTINGS,
        platformId: "sinclair-ql" as const,
        profileId: "org.retroconverter.sinclair-ql.default",
        modeId: "mode8-256x256" as const,
        framing: "stretch" as const,
        paletteSelections: qlPaletteSelections([0, 1, 2, 3, 4, 5, 6, 7]),
      };
      const baseline = convertToQl(source, 1, 1, {
        ...common,
        dithering: "none",
        ditherEngineId: "none-discrete-v2",
        ditheringAmount: 0,
      });
      const ordered = convertToQl(source, 1, 1, {
        ...common,
        dithering: "ordered",
        ditherEngineId: "ordered-baseline-additive-v5",
        ditheringAmount: 1,
        orderedMatrix,
      });
      let changedPixels = 0;
      for (
        let offset = 0;
        offset < baseline.mergedPreviewRgba.length;
        offset += 4
      ) {
        if (
          baseline.mergedPreviewRgba[offset] !==
            ordered.mergedPreviewRgba[offset] ||
          baseline.mergedPreviewRgba[offset + 1] !==
            ordered.mergedPreviewRgba[offset + 1] ||
          baseline.mergedPreviewRgba[offset + 2] !==
            ordered.mergedPreviewRgba[offset + 2]
        ) {
          changedPixels += 1;
        }
      }

      expect(changedPixels).toBeGreaterThan(0);
      expect(changedPixels).toBeLessThan(
        baseline.mergedPreviewRgba.length / 4 / 100,
      );
    },
  );

  it.each([
    "ordered-baseline-additive-v5",
    "ordered-strict-matrix-v6",
  ] as const)(
    "keeps %s identical to exhaustive v4 in plain QL modes",
    (ditherEngineId) => {
    const source = new Uint8Array([83, 147, 211, 255]);
    const convert = (engineId:
      | "ordered-palette-pairs-v4"
      | "ordered-baseline-additive-v5"
      | "ordered-strict-matrix-v6") => convertToQl(source, 1, 1, {
        ...DEFAULT_CONVERSION_SETTINGS,
        platformId: "sinclair-ql",
        profileId: "org.retroconverter.sinclair-ql.default",
        modeId: "mode8-plain-256x256",
        framing: "stretch",
        paletteSelections: qlPaletteSelections([0, 1, 2, 3, 4, 5, 6, 7], 1),
        dithering: "ordered",
        ditherEngineId: engineId,
        ditheringAmount: 37,
        orderedMatrix: "bayer-8x8",
      });

    expect(convert(ditherEngineId).previewRgba)
      .toEqual(convert("ordered-palette-pairs-v4").previewRgba);
    },
  );

  it.each([
    ["checkerboard-2x1", 2, 2],
    ["bayer-2x2", 2, 2],
    ["bayer-4x4", 4, 4],
    ["bayer-8x8", 8, 8],
  ] as const)(
    "keeps mixed %s output within its selected matrix period",
    (orderedMatrix, matrixWidth, matrixHeight) => {
      const width = 256;
      const result = convertToQl(
        new Uint8Array([64, 64, 64, 255]),
        1,
        1,
        {
          ...DEFAULT_CONVERSION_SETTINGS,
          platformId: "sinclair-ql",
          profileId: "org.retroconverter.sinclair-ql.default",
          modeId: "mode8-256x256",
          framing: "stretch",
          paletteSelections: qlPaletteSelections([0, 1, 2, 3, 4, 5, 6, 7]),
          dithering: "ordered",
          ditherEngineId: "ordered-strict-matrix-v6",
          ditheringAmount: 100,
          orderedMatrix,
        },
      );
      const expected = new Uint8Array(result.mergedPreviewRgba.length);
      for (let y = 0; y < 256; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const offset = (y * width + x) * 4;
          const referenceOffset = (
            (y % matrixHeight) * width +
            x % matrixWidth
          ) * 4;
          expected.set(
            result.mergedPreviewRgba.subarray(
              referenceOffset,
              referenceOffset + 4,
            ),
            offset,
          );
        }
      }
      expect(result.mergedPreviewRgba).toEqual(expected);
    },
  );

  it("keeps Ordered local-tone v3 behavior unchanged in plain QL modes", () => {
    const source = new Uint8Array([96, 64, 64, 255]);
    const convert = (ditherEngineId:
      | "ordered-unrestricted-v2"
      | "ordered-local-tone-v3") => convertToQl(source, 1, 1, {
        ...DEFAULT_CONVERSION_SETTINGS,
        platformId: "sinclair-ql",
        profileId: "org.retroconverter.sinclair-ql.default",
        modeId: "mode8-plain-256x256",
        framing: "stretch",
        paletteSelections: qlPaletteSelections([0, 1, 2, 3, 4, 5, 6, 7], 1),
        dithering: "ordered",
        ditherEngineId,
        ditheringAmount: 28,
        orderedMatrix: "bayer-8x8",
      });

    expect(convert("ordered-local-tone-v3").previewRgba)
      .toEqual(convert("ordered-unrestricted-v2").previewRgba);
  });

  it("keeps the mixed no-dither merged result spatially uniform", () => {
    const source = new Uint8Array([127, 127, 127, 255]);
    const result = convertToQl(source, 1, 1, {
        ...DEFAULT_CONVERSION_SETTINGS,
        platformId: "sinclair-ql",
        profileId: "org.retroconverter.sinclair-ql.default",
        modeId: "mode8-256x256",
        framing: "stretch",
        paletteSelections: qlPaletteSelections([0, 1, 2, 3, 4, 5, 6, 7]),
        dithering: "none",
        ditherEngineId: "none-discrete-v2",
        ditheringAmount: 0,
      });
    const mergedColors = new Set<string>();
    for (let offset = 0; offset < result.mergedPreviewRgba.length; offset += 4) {
      mergedColors.add([
        result.mergedPreviewRgba[offset],
        result.mergedPreviewRgba[offset + 1],
        result.mergedPreviewRgba[offset + 2],
      ].join(","));
    }

    expect(mergedColors).toEqual(new Set(["127,127,127"]));
  });

  it("keeps 2x1 and 2x2 ordered guides distinct in mixed Mode 8", () => {
    const source = new Uint8Array([96, 64, 64, 255]);
    const convert = (orderedMatrix:
      | "checkerboard-2x1"
      | "bayer-2x2") => convertToQl(source, 1, 1, {
        ...DEFAULT_CONVERSION_SETTINGS,
        platformId: "sinclair-ql",
        profileId: "org.retroconverter.sinclair-ql.default",
        modeId: "mode8-256x256",
        framing: "stretch",
        paletteSelections: qlPaletteSelections([0, 1, 2, 3, 4, 5, 6, 7]),
        dithering: "ordered",
        ditherEngineId: "ordered-local-tone-v3",
        ditheringAmount: 28,
        orderedMatrix,
      });

    expect(convert("checkerboard-2x1").preConstraintPreviewRgba)
      .not.toEqual(convert("bayer-2x2").preConstraintPreviewRgba);
  });

  it("applies Ordered method and amount to the merged Mode 8 image", () => {
    const source = new Uint8Array([64, 64, 64, 255]);
    const convert = (ditheringAmount: number) => convertToQl(source, 1, 1, {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "sinclair-ql",
      profileId: "org.retroconverter.sinclair-ql.default",
      modeId: "mode8-256x256",
      framing: "stretch",
      paletteSelections: qlPaletteSelections([0, 1, 2, 3, 4, 5, 6, 7]),
      dithering: "ordered",
      ditherEngineId: "ordered-unrestricted-v2",
      ditheringAmount,
      orderedMatrix: "bayer-4x4",
    });
    const zero = convert(0);
    const quarter = convert(25);
    const full = convert(100);

    expect(quarter.mergedPreviewRgba).not.toEqual(zero.mergedPreviewRgba);
    expect(full.mergedPreviewRgba).not.toEqual(quarter.mergedPreviewRgba);
    expect(new Set(full.mergedPreviewRgba)).toEqual(new Set([0, 127, 255]));
  });

  it("applies Error diffusion method and amount to the merged Mode 8 image", () => {
    const source = new Uint8Array([64, 64, 64, 255]);
    const convert = (ditheringAmount: number) => convertToQl(source, 1, 1, {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "sinclair-ql",
      profileId: "org.retroconverter.sinclair-ql.default",
      modeId: "mode8-256x256",
      framing: "stretch",
      paletteSelections: qlPaletteSelections([0, 1, 2, 3, 4, 5, 6, 7]),
      dithering: "error-diffusion",
      ditherEngineId: "error-diffusion-unrestricted-v2",
      ditheringAmount,
    });
    const zero = convert(0);
    const half = convert(50);
    const full = convert(100);

    expect(half.mergedPreviewRgba).not.toEqual(zero.mergedPreviewRgba);
    expect(full.mergedPreviewRgba).not.toEqual(half.mergedPreviewRgba);
  });

  it("keeps normalized ordered v7 at zero equal to QL no-dither", () => {
    const source = new Uint8Array([83, 147, 211, 255]);
    const shared = {
      ...DEFAULT_CONVERSION_SETTINGS,
      platformId: "sinclair-ql" as const,
      profileId: "org.retroconverter.sinclair-ql.default",
      modeId: "mode8-mode4-mixed-512x256" as const,
      framing: "stretch" as const,
      paletteSelections: [
        { screenIndex: 0, enabledColorIds: [0, 1, 2, 3, 4, 5, 6, 7] },
        { screenIndex: 1, enabledColorIds: [0, 1, 2, 3] },
      ],
      qlMixedOptimizerId: "ql-mixed-balanced-v2" as const,
    };
    const baseline = convertToQl(source, 1, 1, {
      ...shared,
      dithering: "none",
      ditherEngineId: "none-discrete-v2",
      ditheringAmount: 0,
    });
    const normalized = convertToQl(source, 1, 1, {
      ...shared,
      dithering: "ordered",
      ditherEngineId: "ordered-coverage-normalized-v7",
      ditheringAmount: 0,
      orderedMatrix: "bayer-8x8",
    });
    expect(normalized.frames.map((frame) => frame.encoded))
      .toEqual(baseline.frames.map((frame) => frame.encoded));
    expect(normalized.mergedPreviewRgba).toEqual(baseline.mergedPreviewRgba);
  });
});
