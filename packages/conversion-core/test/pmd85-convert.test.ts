import { describe, expect, it } from "vitest";
import {
  PMD85_COLORACE_PURE_PALETTE,
  PMD85_SCREEN_HEIGHT,
  PMD85_SCREEN_WIDTH,
  decodePmd85Screen,
  type Pmd85ModeId,
  type Pmd85RgbColor,
} from "@retro-converter/pmd-85";
import { convertToPmd85 } from "../src/pmd85-convert";
import { DEFAULT_CONVERSION_SETTINGS, type ConversionSettings } from "../src/types";

const PALETTES: Readonly<Record<Pmd85ModeId, readonly Pmd85RgbColor[]>> = {
  "pmd85-2-tv": [{ r: 255, g: 255, b: 255 }, { r: 191, g: 191, b: 191 }],
  "pmd85-2-rgb": [
    { r: 80, g: 255, b: 80 }, { r: 255, g: 255, b: 80 },
    { r: 80, g: 255, b: 255 }, { r: 255, g: 255, b: 255 },
  ],
  "pmd85-3-tv": [
    { r: 255, g: 255, b: 255 }, { r: 184, g: 184, b: 184 },
    { r: 119, g: 119, b: 119 }, { r: 68, g: 68, b: 68 },
  ],
  "pmd85-3-pal": [
    { r: 255, g: 255, b: 255 }, { r: 80, g: 255, b: 80 },
    { r: 255, g: 80, b: 80 }, { r: 160, g: 0, b: 0 },
  ],
  "pmd85-3-rgb": [
    { r: 80, g: 255, b: 80 }, { r: 255, g: 80, b: 80 },
    { r: 80, g: 80, b: 255 }, { r: 255, g: 80, b: 255 },
  ],
  "pmd85-colorace": PMD85_COLORACE_PURE_PALETTE,
};

function source(): Uint8Array {
  const rgba = new Uint8Array(PMD85_SCREEN_WIDTH * PMD85_SCREEN_HEIGHT * 4);
  for (let y = 0; y < PMD85_SCREEN_HEIGHT; y += 1) {
    for (let x = 0; x < PMD85_SCREEN_WIDTH; x += 1) {
      const offset = (y * PMD85_SCREEN_WIDTH + x) * 4;
      rgba[offset] = x & 0xff;
      rgba[offset + 1] = y & 0xff;
      rgba[offset + 2] = (x + y) & 0xff;
      rgba[offset + 3] = 255;
    }
  }
  return rgba;
}

function settings(mode: Pmd85ModeId, engine: ConversionSettings["ditherEngineId"], amount: number): ConversionSettings {
  const dithering = engine.startsWith("ordered") ? "ordered" : engine.startsWith("error") ? "error-diffusion" : "none";
  return {
    ...DEFAULT_CONVERSION_SETTINGS,
    profileId: `test.${mode}`,
    platformId: "pmd-85",
    modeId: mode,
    attributeOptimizerId: "pmd85-cell-v1",
    ditherEngineId: engine,
    dithering,
    ditheringAmount: amount,
    framing: "stretch",
    resampling: "nearest",
    crop: { x: 0, y: 0, width: PMD85_SCREEN_WIDTH, height: PMD85_SCREEN_HEIGHT },
    background: { r: 0, g: 0, b: 0 },
    paletteSelections: [{
      screenIndex: 0,
      enabledColorIds: PALETTES[mode].map((_, index) => index),
    }],
    pmd85: {
      mode,
      paletteCalibrationId: mode === "pmd85-colorace" ? "pure-rgb" : "emulator-soft",
      gapPolicy: "zero",
    },
  };
}

describe("PMD 85 hardware-aware conversion", () => {
  it.each(Object.keys(PALETTES) as Pmd85ModeId[])(
    "uses squared RGB black/INK decisions throughout %s",
    (mode) => {
      const input = source();
      const restricted = {
        ...settings(mode, "none-discrete-v2", 0),
        paletteSelections: [{ screenIndex: 0, enabledColorIds: [0] }],
      };
      const result = convertToPmd85(
        input,
        PMD85_SCREEN_WIDTH,
        PMD85_SCREEN_HEIGHT,
        restricted,
        PALETTES[mode],
      );
      const ink = PALETTES[mode][0]!;
      let mismatches = 0;
      for (let y = 0; y < PMD85_SCREEN_HEIGHT; y += 1) {
        for (let x = 0; x < PMD85_SCREEN_WIDTH; x += 1) {
          const rgba = (y * PMD85_SCREEN_WIDTH + x) * 4;
          const r = input[rgba] ?? 0;
          const g = input[rgba + 1] ?? 0;
          const b = input[rgba + 2] ?? 0;
          const blackDistance = r * r + g * g + b * b;
          const inkDistance =
            (r - ink.r) ** 2 + (g - ink.g) ** 2 + (b - ink.b) ** 2;
          const mask = result.pixelMasks[
            y * (PMD85_SCREEN_WIDTH / 6) + Math.floor(x / 6)
          ] ?? 0;
          if (
            ((mask & (1 << (x % 6))) !== 0) !==
              (inkDistance < blackDistance)
          ) mismatches += 1;
        }
      }
      expect(mismatches).toBe(0);
    },
  );

  it("keeps saturated green black in TV/CV white-only conversion", () => {
    const rgba = new Uint8Array(PMD85_SCREEN_WIDTH * PMD85_SCREEN_HEIGHT * 4);
    for (let offset = 0; offset < rgba.length; offset += 4) {
      rgba[offset + 1] = 255;
      rgba[offset + 3] = 255;
    }
    const tvSettings = {
      ...settings("pmd85-2-tv", "none-discrete-v2", 0),
      paletteSelections: [{ screenIndex: 0, enabledColorIds: [0] }],
    };
    const result = convertToPmd85(
      rgba,
      PMD85_SCREEN_WIDTH,
      PMD85_SCREEN_HEIGHT,
      tvSettings,
      PALETTES["pmd85-2-tv"],
    );
    expect(result.pixelMasks.every((mask) => mask === 0)).toBe(true);
  });

  it("uses implicit black PAPER and one selected INK in every 6x1 cell", () => {
    const solid = (value: number) => {
      const rgba = new Uint8Array(PMD85_SCREEN_WIDTH * PMD85_SCREEN_HEIGHT * 4);
      for (let offset = 0; offset < rgba.length; offset += 4) {
        rgba[offset] = value;
        rgba[offset + 1] = value;
        rgba[offset + 2] = value;
        rgba[offset + 3] = 255;
      }
      return rgba;
    };
    const black = convertToPmd85(solid(0), 288, 256, settings("pmd85-2-tv", "none-discrete-v2", 0), PALETTES["pmd85-2-tv"]);
    const white = convertToPmd85(solid(255), 288, 256, settings("pmd85-2-tv", "none-discrete-v2", 0), PALETTES["pmd85-2-tv"]);
    expect(black.pixelMasks.every((mask) => mask === 0)).toBe(true);
    expect(white.pixelMasks.every((mask) => mask === 0x3f)).toBe(true);
    expect(black.previewRgba[0]).toBe(0);
    expect(white.previewRgba[0]).toBe(255);
  });

  it("does not assign black-only cells to the lowest numeric palette ID", () => {
    const rgba = new Uint8Array(PMD85_SCREEN_WIDTH * PMD85_SCREEN_HEIGHT * 4);
    for (let offset = 0; offset < rgba.length; offset += 4) rgba[offset + 3] = 255;
    const magenta = PALETTES["pmd85-3-rgb"][3]!;
    for (let x = 0; x < 6; x += 1) {
      const offset = x * 4;
      rgba[offset] = magenta.r;
      rgba[offset + 1] = magenta.g;
      rgba[offset + 2] = magenta.b;
    }
    const result = convertToPmd85(
      rgba,
      288,
      256,
      {
        ...settings("pmd85-3-rgb", "none-discrete-v2", 0),
        paletteSelections: [{ screenIndex: 0, enabledColorIds: [0, 3] }],
      },
      PALETTES["pmd85-3-rgb"],
    );
    expect(new Set(result.attributes)).toEqual(new Set([3]));
    expect(result.pixelMasks[0]).toBe(0x3f);
    expect(result.pixelMasks.slice(1).every((mask) => mask === 0)).toBe(true);
  });

  it("preserves coherent magenta diffusion when unsupported Green is enabled", () => {
    const rgba = new Uint8Array(PMD85_SCREEN_WIDTH * PMD85_SCREEN_HEIGHT * 4);
    for (let offset = 0; offset < rgba.length; offset += 4) rgba[offset + 3] = 255;
    const magenta = PALETTES["pmd85-3-rgb"][3]!;
    for (let y = 32; y < 224; y += 1) {
      for (let x = 24; x < 264; x += 1) {
        if ((x + y) % 9 > 2) continue;
        const offset = (y * PMD85_SCREEN_WIDTH + x) * 4;
        rgba[offset] = magenta.r;
        rgba[offset + 1] = magenta.g;
        rgba[offset + 2] = magenta.b;
      }
    }
    const convert = (enabledColorIds: readonly number[]) => convertToPmd85(
      rgba,
      288,
      256,
      {
        ...settings("pmd85-3-rgb", "error-diffusion-decorrelated-v3", 100),
        paletteSelections: [{ screenIndex: 0, enabledColorIds }],
      },
      PALETTES["pmd85-3-rgb"],
    );
    const magentaOnly = convert([3]);
    const withGreen = convert([0, 3]);
    expect(withGreen.pixelMasks).toEqual(magentaOnly.pixelMasks);
    expect(new Set(withGreen.attributes)).toEqual(new Set([3]));
    expect(withGreen.previewRgba).toEqual(magentaOnly.previewRgba);
  });

  it("does not light black cells with chromatic diffusion residue", () => {
    const rgba = new Uint8Array(PMD85_SCREEN_WIDTH * PMD85_SCREEN_HEIGHT * 4);
    for (let offset = 0; offset < rgba.length; offset += 4) rgba[offset + 3] = 255;
    const green = PALETTES["pmd85-3-rgb"][0]!;
    for (let y = 0; y < PMD85_SCREEN_HEIGHT; y += 1) {
      for (let x = 0; x < 6; x += 1) {
        const offset = (y * PMD85_SCREEN_WIDTH + x) * 4;
        rgba[offset] = green.r;
        rgba[offset + 1] = green.g;
        rgba[offset + 2] = green.b;
      }
    }
    const result = convertToPmd85(
      rgba,
      288,
      256,
      {
        ...settings("pmd85-3-rgb", "error-diffusion-decorrelated-v3", 100),
        paletteSelections: [{ screenIndex: 0, enabledColorIds: [0, 3] }],
      },
      PALETTES["pmd85-3-rgb"],
    );
    for (let y = 0; y < PMD85_SCREEN_HEIGHT; y += 1) {
      const rowOffset = y * (PMD85_SCREEN_WIDTH / 6);
      expect(result.pixelMasks[rowOffset]).toBe(0x3f);
      expect(result.pixelMasks.slice(rowOffset + 1, rowOffset + 48)
        .every((mask) => mask === 0)).toBe(true);
    }
  });

  it("allows a second foreground only in cells where the guide supports it", () => {
    const rgba = new Uint8Array(PMD85_SCREEN_WIDTH * PMD85_SCREEN_HEIGHT * 4);
    for (let offset = 0; offset < rgba.length; offset += 4) rgba[offset + 3] = 255;
    const palette = PALETTES["pmd85-3-rgb"];
    for (let x = 0; x < 6; x += 1) {
      for (const [cell, ink] of [[0, 3], [2, 0]] as const) {
        const offset = (cell * 6 + x) * 4;
        rgba[offset] = palette[ink]!.r;
        rgba[offset + 1] = palette[ink]!.g;
        rgba[offset + 2] = palette[ink]!.b;
      }
    }
    const result = convertToPmd85(
      rgba,
      288,
      256,
      {
        ...settings("pmd85-3-rgb", "error-diffusion-decorrelated-v3", 100),
        paletteSelections: [{ screenIndex: 0, enabledColorIds: [0, 3] }],
      },
      palette,
    );
    expect(result.attributes[0]).toBe(3);
    expect(result.attributes[2]).toBe(0);
    expect(result.pixelMasks[0]).toBe(0x3f);
    expect(result.pixelMasks[1]).toBe(0);
    expect(result.pixelMasks[2]).toBe(0x3f);
  });

  it.each(Object.keys(PALETTES) as Pmd85ModeId[])("produces deterministic legal %s cells and decoder previews", (mode) => {
    const first = convertToPmd85(source(), PMD85_SCREEN_WIDTH, PMD85_SCREEN_HEIGHT, settings(mode, "none-discrete-v2", 0), PALETTES[mode]);
    const second = convertToPmd85(source(), PMD85_SCREEN_WIDTH, PMD85_SCREEN_HEIGHT, settings(mode, "none-discrete-v2", 0), PALETTES[mode]);
    expect(first.frames[0]?.encoded).toEqual(second.frames[0]?.encoded);
    expect(first.previewRgba).toEqual(first.frames[0]?.previewRgba);
    expect(first.previewRgba).toHaveLength(PMD85_SCREEN_WIDTH * PMD85_SCREEN_HEIGHT * 4);
  });

  it("new TV/CV output emits only static attributes 00 and 01", () => {
    const result = convertToPmd85(source(), 288, 256, settings("pmd85-2-tv", "error-diffusion-decorrelated-v3", 70), PALETTES["pmd85-2-tv"]);
    const decoded = decodePmd85Screen(result.frames[0]!.encoded, "pmd85-2-tv");
    expect(Math.max(...decoded.attributes)).toBeLessThanOrEqual(1);
  });

  it("new PMD 85-3 TV/CV output may emit all four native intensity attributes", () => {
    const input = new Uint8Array(PMD85_SCREEN_WIDTH * PMD85_SCREEN_HEIGHT * 4);
    const levels = [255, 184, 119, 68];
    for (let y = 0; y < PMD85_SCREEN_HEIGHT; y += 1) {
      for (let x = 0; x < PMD85_SCREEN_WIDTH; x += 1) {
        const value = levels[Math.floor(x / 72)]!;
        const offset = (y * PMD85_SCREEN_WIDTH + x) * 4;
        input[offset] = value;
        input[offset + 1] = value;
        input[offset + 2] = value;
        input[offset + 3] = 255;
      }
    }
    const result = convertToPmd85(
      input,
      288,
      256,
      settings("pmd85-3-tv", "none-discrete-v2", 0),
      PALETTES["pmd85-3-tv"],
    );
    expect(new Set(result.attributes)).toEqual(new Set([0, 1, 2, 3]));
  });

  it.each(["ordered-strict-matrix-v6", "ordered-void-cluster-v1", "error-diffusion-decorrelated-v3"] as const)(
    "%s at 0% equals the no-dither baseline",
    (engine) => {
      const baseline = convertToPmd85(source(), 288, 256, settings("pmd85-3-rgb", "none-discrete-v2", 0), PALETTES["pmd85-3-rgb"]);
      const zero = convertToPmd85(source(), 288, 256, settings("pmd85-3-rgb", engine, 0), PALETTES["pmd85-3-rgb"]);
      expect(zero.frames[0]?.encoded).toEqual(baseline.frames[0]?.encoded);
    },
  );

  it("uses the complete selected ordered matrix rather than a binary checker reduction", () => {
    const ordered = (matrix: ConversionSettings["orderedMatrix"]) =>
      convertToPmd85(
        source(),
        288,
        256,
        {
          ...settings("pmd85-3-rgb", "ordered-strict-matrix-v6", 70),
          orderedMatrix: matrix,
        },
        PALETTES["pmd85-3-rgb"],
      );
    expect(ordered("bayer-2x2").frames[0]?.encoded)
      .not.toEqual(ordered("bayer-4x4").frames[0]?.encoded);
    expect(ordered("bayer-4x4").frames[0]?.encoded)
      .not.toEqual(ordered("bayer-8x8").frames[0]?.encoded);
  });

  it.each(Object.keys(PALETTES) as Pmd85ModeId[])(
    "supports every selectable ordered matrix in %s",
    (mode) => {
      const outputs = (["checkerboard-2x1", "bayer-2x2", "bayer-4x4", "bayer-8x8"] as const)
        .map((orderedMatrix) => convertToPmd85(
          source(),
          288,
          256,
          {
            ...settings(mode, "ordered-strict-matrix-v6", 70),
            orderedMatrix,
          },
          PALETTES[mode],
        ).frames[0]!.encoded);
      for (const output of outputs) expect(output).toHaveLength(16_384);
      expect(new Set(outputs.map((output) => Array.from(output).join(","))).size)
        .toBeGreaterThan(1);
    },
  );

  it.each(Object.keys(PALETTES) as Pmd85ModeId[])(
    "supports decorrelated diffusion and void-cluster output in %s",
    (mode) => {
      for (const engine of [
        "error-diffusion-decorrelated-v3",
        "ordered-void-cluster-v1",
      ] as const) {
        const result = convertToPmd85(
          source(),
          288,
          256,
          settings(mode, engine, 70),
          PALETTES[mode],
        );
        expect(result.frames[0]!.encoded).toHaveLength(16_384);
        expect(result.previewRgba).toEqual(result.frames[0]!.previewRgba);
      }
    },
  );

  it("frames PMD output using square pixels", () => {
    const rgba = new Uint8Array(256 * 204 * 4);
    for (let offset = 0; offset < rgba.length; offset += 4) {
      rgba[offset] = 255;
      rgba[offset + 1] = 255;
      rgba[offset + 2] = 255;
      rgba[offset + 3] = 255;
    }
    const base = settings("pmd85-2-tv", "none-discrete-v2", 0);
    const converted = convertToPmd85(
      rgba,
      256,
      204,
      {
        ...base,
        framing: "fit",
      },
      PALETTES["pmd85-2-tv"],
    );
    expect(converted.pixelAspectRatio).toBe(1);
    // The 256×204 source is wider than the 288×256 square-pixel canvas,
    // so Fit preserves its aspect ratio with 13-pixel top/bottom bars.
    expect(converted.sourcePreviewRgba[0]).toBe(0);
    expect(converted.sourcePreviewRgba[(13 * PMD85_SCREEN_WIDTH) * 4]).toBe(255);
    expect(converted.sourcePreviewRgba[(242 * PMD85_SCREEN_WIDTH) * 4]).toBe(255);
    expect(converted.sourcePreviewRgba[(243 * PMD85_SCREEN_WIDTH) * 4]).toBe(0);
  });
});
