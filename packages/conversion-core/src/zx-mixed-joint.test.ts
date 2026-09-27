import { describe, expect, it } from "vitest";
import {
  DEFAULT_CONVERSION_SETTINGS,
  buildJointMixedCandidates,
  findBestJointMixedCandidate,
  scoreJointMixedCandidateWithDualFs,
  convertToZx,
  type ConversionSettings,
  type JointMixedPhysicalColor,
} from "./index.js";
import { buildTemporalCrossPalette } from "./ql-convert.js";
import type { TemporalVirtualColor } from "./ql-convert.js";
import { zxSoftwareScrBytes } from "@retro-converter/zx-spectrum";
import { ZX_ATTRIBUTE_COLUMNS, ZX_BITMAP_BYTES, ZX_SCREEN_HEIGHT, ZX_SCREEN_WIDTH, zxBitmapOffset } from "@retro-converter/zx-spectrum";
import { renderAttributeFrameRgba } from "./convert.js";

function mixedSettings(overrides: Partial<ConversionSettings> = {}): ConversionSettings {
  const palette = DEFAULT_CONVERSION_SETTINGS.paletteSelections[0]!;
  return {
    ...DEFAULT_CONVERSION_SETTINGS,
    modeId: "zx48-mixed-256x192",
    attributeOptimizerId: "zx-mixed-joint-cell-v1",
    paletteSelections: [
      { ...palette, screenIndex: 0, enabledColorIds: [0, 7], brightMode: "off" },
      { ...palette, screenIndex: 1, enabledColorIds: [0, 7], brightMode: "off" },
    ],
    framing: "stretch",
    resampling: "nearest",
    screenFlickerSuppression: false,
    ...overrides,
  };
}

function sourceGradient(width = 256, height = 192): Uint8Array {
  const source = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const value = Math.round((x + y) * 255 / Math.max(1, width + height - 2));
      source[offset] = value;
      source[offset + 1] = Math.round(x * 255 / Math.max(1, width - 1));
      source[offset + 2] = Math.round(y * 255 / Math.max(1, height - 1));
      source[offset + 3] = 255;
    }
  }
  return source;
}

function blendError(
  source: Uint8Array,
  offsets: readonly number[],
  candidate: { readonly blendPaletteIndices: readonly number[] },
  palette: readonly TemporalVirtualColor[],
): number {
  let score = 0;
  for (const offset of offsets) {
    let best = Number.POSITIVE_INFINITY;
    for (const index of candidate.blendPaletteIndices) {
      const color = palette[index]!;
      const dr = (source[offset] ?? 0) - color.r;
      const dg = (source[offset + 1] ?? 0) - color.g;
      const db = (source[offset + 2] ?? 0) - color.b;
      best = Math.min(best, dr * dr + dg * dg + db * db);
    }
    score += best;
  }
  return score;
}

function bruteDualFsCellScore(
  source: Uint8Array,
  offsets: readonly number[],
  candidate: { readonly blendPaletteIndices: readonly number[] },
  palette: readonly TemporalVirtualColor[],
  height: number,
  amount: number,
): number {
  const errors = new Float32Array(offsets.length * 3);
  const scale = amount / 100;
  let score = 0;
  for (let y = 0; y < height; y += 1) {
    const reverse = (y & 1) === 1;
    for (let step = 0; step < 8; step += 1) {
      const x = reverse ? 7 - step : step;
      const pixel = y * 8 + x;
      const offset = offsets[pixel]!;
      const errorOffset = pixel * 3;
      const corrected = [0, 1, 2].map((channel) =>
        Math.max(0, Math.min(255, (source[offset + channel] ?? 0) + errors[errorOffset + channel]!))
      );
      let choice = 0;
      let best = Number.POSITIVE_INFINITY;
      for (let option = 0; option < candidate.blendPaletteIndices.length; option += 1) {
        const color = palette[candidate.blendPaletteIndices[option]!]!;
        const distance = corrected.reduce((sum, value, channel) =>
          sum + (value - [color.r, color.g, color.b][channel]!) ** 2, 0
        );
        if (distance < best) {
          best = distance;
          choice = option;
        }
      }
      const color = palette[candidate.blendPaletteIndices[choice]!]!;
      const actual = [color.r, color.g, color.b];
      score += actual.reduce((sum, value, channel) =>
        sum + ((source[offset + channel] ?? 0) - value) ** 2, 0
      );
      const residual = corrected.map((value, channel) => value - actual[channel]!);
      const direction = reverse ? -1 : 1;
      for (const [dx, dy, weight] of [[direction, 0, 7], [-direction, 1, 3], [0, 1, 5], [direction, 1, 1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= 8 || ny >= height) continue;
        const next = (ny * 8 + nx) * 3;
        for (let channel = 0; channel < 3; channel += 1) {
          errors[next + channel]! += residual[channel]! * weight / 16 * scale;
        }
      }
    }
  }
  return score;
}

function decodeSoftwareFrame(encoded: Uint8Array, attributeHeight: 1 | 2 | 4 | 8): Uint8Array {
  const pixels = new Uint8Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT);
  for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
    for (let byteX = 0; byteX < ZX_ATTRIBUTE_COLUMNS; byteX += 1) {
      const packed = encoded[zxBitmapOffset(byteX, y)] ?? 0;
      for (let bit = 0; bit < 8; bit += 1) {
        pixels[y * ZX_SCREEN_WIDTH + byteX * 8 + bit] = (packed & (0x80 >> bit)) === 0 ? 0 : 1;
      }
    }
  }
  return renderAttributeFrameRgba(
    pixels,
    encoded.subarray(ZX_BITMAP_BYTES),
    attributeHeight,
  );
}

describe("ZX Mixed joint-cell optimizer", () => {
  it.each([0, 60, 100])(
    "scores cell-local dual-FS candidates against a brute-force oracle at %i%%",
    (amount) => {
      const palette: TemporalVirtualColor[] = [
        { first: 0, second: 0, r: 0, g: 0, b: 0 },
        { first: 0, second: 1, r: 55, g: 55, b: 55 },
        { first: 1, second: 0, r: 150, g: 150, b: 150 },
        { first: 1, second: 1, r: 255, g: 255, b: 255 },
      ];
      const candidate = {
        firstAttribute: 0,
        secondAttribute: 0,
        blendPaletteIndices: [0, 1, 2, 3] as const,
      };
      const source = sourceGradient(8, 2);
      const offsets = Array.from({ length: 16 }, (_, index) => index * 4);
      const actual = scoreJointMixedCandidateWithDualFs(
        source,
        offsets,
        candidate,
        palette,
        2,
        amount,
      );
      expect(actual).not.toBeNull();
      expect(actual!.score).toBeCloseTo(
        bruteDualFsCellScore(source, offsets, candidate, palette, 2, amount),
        3,
      );
      expect(scoreJointMixedCandidateWithDualFs(
        source,
        offsets,
        candidate,
        palette,
        2,
        amount,
        actual!.score - 1,
      )).toBeNull();
      expect(scoreJointMixedCandidateWithDualFs(
        source,
        offsets,
        candidate,
        palette,
        2,
        amount,
        actual!.score,
      )?.score).toBeCloseTo(actual!.score, 3);
    },
  );

  it("deduplicates equivalent four-blend attribute-pair candidates", () => {
    const first: JointMixedPhysicalColor[] = [
      { code: 0, bright: false, r: 0, g: 0, b: 0 },
      { code: 7, bright: false, r: 205, g: 205, b: 205 },
    ];
    const second: JointMixedPhysicalColor[] = [
      { code: 0, bright: false, r: 0, g: 0, b: 0 },
      { code: 7, bright: false, r: 205, g: 205, b: 205 },
    ];
    const virtual = buildTemporalCrossPalette(
      [...first, ...second],
      [0, 1],
      [2, 3],
    );
    const candidates = buildJointMixedCandidates(first, second, virtual);
    expect(candidates.length).toBeLessThan(9);
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("matches a brute-force oracle for a small exact cell search", () => {
    const first: JointMixedPhysicalColor[] = [
      { code: 0, bright: false, r: 0, g: 0, b: 0 },
      { code: 7, bright: false, r: 205, g: 205, b: 205 },
    ];
    const second: JointMixedPhysicalColor[] = [
      { code: 0, bright: false, r: 0, g: 0, b: 0 },
      { code: 7, bright: false, r: 205, g: 205, b: 205 },
    ];
    const virtual = buildTemporalCrossPalette(
      [...first, ...second],
      [0, 1],
      [2, 3],
    );
    const candidates = buildJointMixedCandidates(first, second, virtual);
    const source = Uint8Array.from([
      120, 100, 80, 255,
      35, 180, 210, 255,
      205, 205, 205, 255,
    ]);
    const offsets = [0, 4, 8];
    const expected = [...candidates].sort((left, right) =>
      blendError(source, offsets, left, virtual) - blendError(source, offsets, right, virtual)
    )[0]!;
    const actual = findBestJointMixedCandidate(source, offsets, candidates, virtual);
    expect(actual).toEqual(expected);
  });

  it.each([1, 2, 4, 8] as const)(
    "generates two valid frames with attribute height %ipx",
    (attributeHeight) => {
      const result = convertToZx(
        sourceGradient(),
        256,
        192,
        mixedSettings({ attributeHeight }),
        "draft",
      );
      expect(result.frames).toHaveLength(2);
      expect(result.frames.every((frame) => frame.encoded.length === zxSoftwareScrBytes(attributeHeight))).toBe(true);
      expect(result.frames.every((frame) => frame.paletteIndices.length === 256 * 192)).toBe(true);
      expect(result.attributes).toHaveLength(32 * (192 / attributeHeight));
      for (const frame of result.frames) {
        expect(decodeSoftwareFrame(frame.encoded, attributeHeight)).toEqual(frame.previewRgba);
      }
      expect(result.previewRgba).toEqual(result.mergedPreviewRgba);

      const edgeAware = convertToZx(
        sourceGradient(),
        256,
        192,
        mixedSettings({
          attributeHeight,
          attributeOptimizerId: "zx-mixed-joint-cell-v2",
        }),
        "draft",
      );
      expect(edgeAware.frames.every((frame) => frame.encoded.length === zxSoftwareScrBytes(attributeHeight))).toBe(true);
      for (const frame of edgeAware.frames) {
        expect(decodeSoftwareFrame(frame.encoded, attributeHeight)).toEqual(frame.previewRgba);
      }

      const quantized = convertToZx(sourceGradient(), 256, 192, mixedSettings({
        attributeHeight,
        attributeOptimizerId: "zx-mixed-joint-quantized-v1",
      }), "draft");
      expect(quantized.frames.every((frame) => frame.encoded.length === zxSoftwareScrBytes(attributeHeight))).toBe(true);
      expect(quantized.previewRgba).toEqual(quantized.mergedPreviewRgba);
    },
  );

  it("respects per-frame bright modes and different enabled palettes", () => {
    const base = mixedSettings({
      attributeHeight: 4,
      paletteSelections: [
        { screenIndex: 0, enabledColorIds: [0, 1, 7], brightMode: "on" },
        { screenIndex: 1, enabledColorIds: [2, 4, 7], brightMode: "off" },
      ],
    });
    const result = convertToZx(sourceGradient(40, 30), 40, 30, base, "draft");
    expect(result.frames).toHaveLength(2);
    expect(result.frames[0]?.encoded).not.toEqual(result.frames[1]?.encoded);
    expect(result.score).toBeGreaterThanOrEqual(0);
    const edgeAware = convertToZx(sourceGradient(40, 30), 40, 30, {
      ...base,
      attributeOptimizerId: "zx-mixed-joint-cell-v2",
    }, "draft");
    expect(edgeAware.frames).toHaveLength(2);
    expect(edgeAware.frames.every((frame) => frame.encoded.length === zxSoftwareScrBytes(base.attributeHeight))).toBe(true);

    const quantized = convertToZx(sourceGradient(40, 30), 40, 30, {
      ...base,
      attributeOptimizerId: "zx-mixed-joint-quantized-v1",
      ditherEngineId: "zx-mixed-dual-fs-v1",
      dithering: "error-diffusion",
      ditheringAmount: 60,
    }, "draft");
    expect(quantized.frames).toHaveLength(2);
    expect(quantized.frames.every((frame) => frame.encoded.length === zxSoftwareScrBytes(base.attributeHeight))).toBe(true);
  });

  it("emits two standard 6912-byte frames at the hardware attribute height", () => {
    const result = convertToZx(sourceGradient(), 256, 192, mixedSettings(), "draft");
    expect(result.frames.map((frame) => frame.encoded.length)).toEqual([6912, 6912]);
  });

  it("runs paired-frame serpentine Floyd–Steinberg deterministically", () => {
    const settings = mixedSettings({
      dithering: "error-diffusion",
      ditherEngineId: "zx-mixed-dual-fs-v1",
      ditheringAmount: 75,
    });
    const source = sourceGradient();
    const first = convertToZx(source, 256, 192, settings, "draft");
    const second = convertToZx(source, 256, 192, settings, "draft");
    expect(first.frames).toEqual(second.frames);
    expect(first.previewRgba).toEqual(second.previewRgba);
    expect(first.frames).toHaveLength(2);
  });

  it("runs the edge-aware joint optimizer deterministically as a distinct v2 path", () => {
    const source = sourceGradient();
    const paletteSelections = [0, 1].map((screenIndex) => ({
      screenIndex,
      enabledColorIds: [0, 7],
      brightMode: "auto" as const,
    }));
    const baseline = convertToZx(source, 256, 192, mixedSettings({ paletteSelections }), "draft");
    const settings = mixedSettings({
      attributeOptimizerId: "zx-mixed-joint-cell-v2",
      paletteSelections,
    });
    const first = convertToZx(source, 256, 192, settings, "draft");
    const second = convertToZx(source, 256, 192, settings, "draft");
    expect(first.frames).toEqual(second.frames);
    expect(first.frames.map((frame) => frame.encoded.length)).toEqual([6912, 6912]);
    expect(first.frames[0]?.encoded).not.toEqual(baseline.frames[0]?.encoded);
    expect(first.score).toBeGreaterThanOrEqual(0);
  });

  it("uses fixed-reference candidate scoring while preserving the selected output dither engine", () => {
    const source = sourceGradient(64, 48);
    const common = mixedSettings({
      attributeHeight: 4,
      ditheringAmount: 55,
      ditherEngineId: "zx-mixed-dual-fs-v1",
      dithering: "error-diffusion",
    });
    const quantized = convertToZx(source, 64, 48, {
      ...common,
      attributeOptimizerId: "zx-mixed-joint-quantized-v1",
    }, "draft");
    const noDither = convertToZx(source, 64, 48, {
      ...common,
      attributeOptimizerId: "zx-mixed-joint-quantized-v1",
      ditherEngineId: "none-discrete-v2",
      dithering: "none",
    }, "draft");
    expect(quantized.frames.map((frame) => frame.encoded.length)).toEqual([zxSoftwareScrBytes(4), zxSoftwareScrBytes(4)]);
    expect(noDither.frames.map((frame) => frame.encoded.length)).toEqual([zxSoftwareScrBytes(4), zxSoftwareScrBytes(4)]);
    expect(quantized.frames.map((frame) => frame.encoded.subarray(ZX_BITMAP_BYTES)))
      .toEqual(noDither.frames.map((frame) => frame.encoded.subarray(ZX_BITMAP_BYTES)));
    expect(quantized.ditherEngineId).toBe("zx-mixed-dual-fs-v1");
    expect(noDither.ditherEngineId).toBe("none-discrete-v2");
    expect(quantized.previewRgba).toEqual(quantized.mergedPreviewRgba);
  });

  it("gates dual-frame diffusion at mismatched cell palettes without changing attributes", () => {
    const source = sourceGradient();
    const common = mixedSettings({
      dithering: "error-diffusion",
      ditheringAmount: 75,
      paletteSelections: [0, 1].map((screenIndex) => ({
        screenIndex,
        enabledColorIds: [0, 7],
        brightMode: "auto" as const,
      })),
    });
    const standard = convertToZx(source, 256, 192, {
      ...common,
      ditherEngineId: "zx-mixed-dual-fs-v1",
    }, "draft");
    const boundaryAware = convertToZx(source, 256, 192, {
      ...common,
      ditherEngineId: "zx-mixed-dual-fs-boundary-v1",
    }, "draft");
    expect(boundaryAware.frames.map((frame) => frame.encoded.length)).toEqual([6912, 6912]);
    expect(boundaryAware.frames.map((frame) => frame.encoded.subarray(ZX_BITMAP_BYTES)))
      .toEqual(standard.frames.map((frame) => frame.encoded.subarray(ZX_BITMAP_BYTES)));
    expect(boundaryAware.frames[0]?.encoded).not.toEqual(standard.frames[0]?.encoded);
    expect(convertToZx(source, 256, 192, {
      ...common,
      ditherEngineId: "zx-mixed-dual-fs-boundary-v1",
    }, "draft").frames).toEqual(boundaryAware.frames);
  });

  it("keeps standard dual-frame FS cell-local and aligned with projected FS", () => {
    const source = sourceGradient();
    for (const attributeHeight of [1, 2, 4, 8] as const) {
      const common = mixedSettings({
        attributeOptimizerId: "zx-mixed-joint-quantized-v1",
        dithering: "error-diffusion",
        ditheringAmount: 100,
        attributeHeight,
        screenFlickerSuppression: false,
      });
      const dualFrame = convertToZx(source, 256, 192, {
        ...common,
        ditherEngineId: "zx-mixed-dual-fs-v1",
      }, "draft");
      const projected = convertToZx(source, 256, 192, {
        ...common,
        ditherEngineId: "error-diffusion-unrestricted-v2",
      }, "draft");
      expect(dualFrame.frames.map((frame) => frame.encoded))
        .toEqual(projected.frames.map((frame) => frame.encoded));
      expect(dualFrame.mergedPreviewRgba).toEqual(projected.mergedPreviewRgba);
    }
  });

  it("keeps flicker suppression merge-invariant with matching palettes", () => {
    const source = sourceGradient(64, 48);
    const without = convertToZx(source, 64, 48, mixedSettings(), "draft");
    const withSuppression = convertToZx(source, 64, 48, mixedSettings({
      screenFlickerSuppression: true,
    }), "draft");
    expect(withSuppression.mergedPreviewRgba).toEqual(without.mergedPreviewRgba);

    const quantizedWithout = convertToZx(source, 64, 48, mixedSettings({
      attributeOptimizerId: "zx-mixed-joint-quantized-v1",
      ditherEngineId: "zx-mixed-dual-fs-v1",
      dithering: "error-diffusion",
      ditheringAmount: 60,
    }), "draft");
    const quantizedWith = convertToZx(source, 64, 48, mixedSettings({
      attributeOptimizerId: "zx-mixed-joint-quantized-v1",
      ditherEngineId: "zx-mixed-dual-fs-v1",
      dithering: "error-diffusion",
      ditheringAmount: 60,
      screenFlickerSuppression: true,
    }), "draft");
    expect(quantizedWith.mergedPreviewRgba).toEqual(quantizedWithout.mergedPreviewRgba);
  });

  it("rejects this optimizer outside ZX Mixed mode", () => {
    expect(() => convertToZx(
      sourceGradient(4, 4),
      4,
      4,
      mixedSettings({ modeId: "zx48-standard-256x192" }),
      "draft",
    )).toThrow("supports only ZX Mixed mode");
  });
});
