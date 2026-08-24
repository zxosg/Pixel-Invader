import { describe, expect, it } from "vitest";
import { DEFAULT_CONVERSION_SETTINGS } from "@retro-converter/conversion-core";
import { createBlankScreen, serializeScr } from "@retro-converter/zx-spectrum";
import { encodeQlScreen } from "@retro-converter/sinclair-ql";
import { PMD85_VRAM_BYTES } from "@retro-converter/pmd-85";
import { buildConversionMetadata, sanitizeArtifactBaseName, sha256Hex } from "./artifacts.js";

describe("artifact helpers", () => {
  it("sanitizes deterministic cross-platform base names", () => {
    expect(sanitizeArtifactBaseName("My image?.PNG")).toBe("My-image");
    expect(sanitizeArtifactBaseName("CON.png")).toBe("retro-CON");
    expect(sanitizeArtifactBaseName("...png")).toBe("retro-converter");
  });

  it("computes standard SHA-256 hex", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc")))
      .toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  it("builds complete deterministic metadata with output hashes", async () => {
    const scr = serializeScr(createBlankScreen(0));
    const previewRgba = new Uint8Array(256 * 192 * 4);
    const metadata = await buildConversionMetadata({
      sourceSha256: "11".repeat(32),
      sourceFormat: "png",
      sourceWidth: 1,
      sourceHeight: 1,
      settings: DEFAULT_CONVERSION_SETTINGS,
      scr,
      previewRgba,
      score: 0,
      completedAtUtc: "2026-07-23T00:00:00.000Z",
    });
    expect(metadata.schema_version).toBe("4.0.0");
    expect(metadata.conversion.settings).toEqual(DEFAULT_CONVERSION_SETTINGS);
    expect(metadata.conversion.algorithm_versions.geometry)
      .toBe("rc-geometry-3");
    expect(metadata.conversion.algorithm_versions.adjustments)
      .toBe("rc-adjustments-filters-3");
    expect(metadata.conversion.algorithm_versions.optimizer)
      .toBe("zx-adaptive-v1");
    expect(metadata.conversion.algorithm_versions.dithering)
      .toBe("none-discrete-v2");
    expect(metadata.conversion.seed).toBe("none");
    expect(metadata.zx_spectrum?.attributes_hex).toHaveLength(768 * 2);
    expect(metadata.outputs.scr_sha256).toHaveLength(64);
    expect(JSON.stringify(metadata)).not.toContain("filename");

    const randomizedMetadata = await buildConversionMetadata({
      sourceSha256: "ab".repeat(32),
      sourceFormat: "png",
      sourceWidth: 1,
      sourceHeight: 1,
      settings: {
        ...DEFAULT_CONVERSION_SETTINGS,
        errorDiffusionRandomization: 50,
      },
      scr,
      previewRgba,
      score: 0,
      completedAtUtc: "2026-07-23T00:00:00.000Z",
    });
    expect(randomizedMetadata.conversion.seed).toBe("rc-error-randomizer-1:seed-1");
  });

  it("records plain QL conversion without screen mixing", async () => {
    const scr = encodeQlScreen(
      new Uint8Array(256 * 256),
      "mode8-256x256",
    );
    const metadata = await buildConversionMetadata({
      sourceSha256: "22".repeat(32),
      sourceFormat: "png",
      sourceWidth: 1,
      sourceHeight: 1,
      settings: {
        ...DEFAULT_CONVERSION_SETTINGS,
        profileId: "org.retroconverter.sinclair-ql.default",
        platformId: "sinclair-ql",
        modeId: "mode8-plain-256x256",
      },
      scr,
      frames: [scr],
      previewRgba: new Uint8Array(256 * 256 * 4),
      width: 256,
      height: 256,
      score: 0,
      completedAtUtc: "2026-07-26T00:00:00.000Z",
    });

    expect(metadata.target.frame_count).toBe(1);
    expect(metadata.sinclair_ql?.mixing).toBe("none");
    expect(metadata.preview.calibration)
      .toBe("exact-sinclair-ql-rgb-pixel-preview");
  });

  it("records static vertical spatial mixing and analytic preview identity", async () => {
    const scr = encodeQlScreen(new Uint8Array(256 * 256), "mode8-256x256");
    const analyticPreviewRgba = new Uint8Array(256 * 128 * 4);
    const metadata = await buildConversionMetadata({
      sourceSha256: "66".repeat(32),
      sourceFormat: "png",
      sourceWidth: 1,
      sourceHeight: 1,
      settings: {
        ...DEFAULT_CONVERSION_SETTINGS,
        platformId: "sinclair-ql",
        modeId: "mode8-vertical-spatial-256x256",
        attributeOptimizerId: "ql-vertical-spatial-uniform-v1",
        ditherEngineId: "vertical-spatial-none-v1",
        paletteSelections: [{ screenIndex: 0, enabledColorIds: [0, 1, 2, 3, 4, 5, 6, 7] }],
        verticalSpatialMix: {
          schemaVersion: 1,
          algorithmId: "vertical-spatial-uniform-v1",
          calibrationId: "srgb-ideal-v1",
        },
      },
      scr,
      previewRgba: new Uint8Array(256 * 256 * 4),
      width: 256,
      height: 256,
      score: 0,
      verticalSpatialDiagnostics: {
        algorithmId: "vertical-spatial-uniform-v1",
        calibrationId: "srgb-ideal-v1",
        logicalWidth: 256,
        logicalHeight: 128,
        analyticPreviewRgba,
        colorCost: 0,
        stripeCost: 0,
        totalCost: 0,
      },
      completedAtUtc: "2026-08-06T00:00:00.000Z",
    });
    expect(metadata.target.logical_height).toBe(128);
    expect(metadata.sinclair_ql?.mixing)
      .toBe("vertical-spatial-static-50-50-linear-srgb-v1");
    expect(metadata.outputs.analytic_preview_rgba_sha256).toHaveLength(64);
  });

  it("records heterogeneous QL Low/High frame modes and mixing", async () => {
    const low = encodeQlScreen(
      new Uint8Array(256 * 256),
      "mode8-256x256",
    );
    const high = encodeQlScreen(
      new Uint8Array(512 * 256),
      "mode4-512x256",
    );
    const metadata = await buildConversionMetadata({
      sourceSha256: "44".repeat(32),
      sourceFormat: "png",
      sourceWidth: 4,
      sourceHeight: 3,
      settings: {
        ...DEFAULT_CONVERSION_SETTINGS,
        profileId: "org.retroconverter.sinclair-ql.default",
        platformId: "sinclair-ql",
        modeId: "mode8-mode4-mixed-512x256",
        paletteSelections: [
          { screenIndex: 0, enabledColorIds: [0, 1, 2, 3, 4, 5, 6, 7] },
          { screenIndex: 1, enabledColorIds: [0, 1, 2, 3] },
        ],
      },
      scr: low,
      frames: [low, high],
      previewRgba: new Uint8Array(512 * 256 * 4),
      width: 512,
      height: 256,
      score: 0,
      completedAtUtc: "2026-07-29T00:00:00.000Z",
    });

    expect(metadata.sinclair_ql?.frame_hardware_modes).toEqual([
      "mode8-256x256",
      "mode4-512x256",
    ]);
    expect(metadata.sinclair_ql?.mixing)
      .toBe("low-high-spatiotemporal-average-50-50");
    expect(metadata.sinclair_ql?.screen_flicker_suppression).toBe(true);
  });

  it("records two-screen ZX mixing and validates both frames", async () => {
    const first = serializeScr(createBlankScreen(0));
    const second = serializeScr(createBlankScreen(0x47));
    const metadata = await buildConversionMetadata({
      sourceSha256: "33".repeat(32),
      sourceFormat: "png",
      sourceWidth: 1,
      sourceHeight: 1,
      settings: {
        ...DEFAULT_CONVERSION_SETTINGS,
        modeId: "zx48-mixed-256x192",
        paletteSelections: [0, 1].map((screenIndex) => ({
          ...DEFAULT_CONVERSION_SETTINGS.paletteSelections[0]!,
          screenIndex,
        })),
      },
      scr: first,
      frames: [first, second],
      previewRgba: new Uint8Array(256 * 192 * 4),
      score: 0,
      completedAtUtc: "2026-07-26T00:00:00.000Z",
    });

    expect(metadata.target.frame_count).toBe(2);
    expect(metadata.zx_spectrum?.mixing)
      .toBe("two-frame-rgb-average-50-50-floor");
    expect(metadata.zx_spectrum?.screen_flicker_suppression).toBe(true);
    expect(metadata.zx_spectrum?.frame_attributes_hex).toHaveLength(2);
    expect(metadata.preview.calibration).toBe("zx-two-frame-average-preview");
  });

  it("records static PMD 85 TV/CV interpretation without blink animation", async () => {
    const screen = new Uint8Array(PMD85_VRAM_BYTES);
    screen[0] = 0x81;
    const settings = {
      ...DEFAULT_CONVERSION_SETTINGS,
      profileId: "org.retroconverter.tesla.pmd85-2.tv",
      platformId: "pmd-85" as const,
      modeId: "pmd85-2-tv" as const,
      attributeOptimizerId: "pmd85-cell-v1" as const,
      paletteSelections: [{ screenIndex: 0, enabledColorIds: [0, 1] }],
      pmd85: {
        mode: "pmd85-2-tv" as const,
        paletteCalibrationId: "neutral-white",
        crtAspect: "square-pixel" as const,
        gapPolicy: "preserve-imported" as const,
      },
    };
    const metadata = await buildConversionMetadata({
      sourceSha256: "55".repeat(32),
      sourceFormat: "pmd85-bin",
      sourceWidth: 288,
      sourceHeight: 256,
      settings,
      scr: screen,
      previewRgba: new Uint8Array(288 * 256 * 4),
      width: 288,
      height: 256,
      score: 0,
      completedAtUtc: "2026-08-01T00:00:00.000Z",
    });
    expect(metadata.pmd_85?.blink_animation_supported).toBe(false);
    expect(metadata.pmd_85?.blink_bit_interpretation).toBe("static-intensity");
    expect(metadata.pmd_85?.addressing.visible_bytes_per_line).toBe(48);
    expect(metadata.outputs.artifact_sha256).toHaveLength(64);
  });
});
