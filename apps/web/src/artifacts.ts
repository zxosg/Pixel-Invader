import {
  qlHardwareModesForTarget,
  qlTargetUsesMixing,
  paletteSelectionsMatch,
  type ConversionSettings,
  type QlTargetModeId,
  type StructuredDiagnostics,
  type VerticalSpatialDiagnostics,
} from "@retro-converter/conversion-core";
import {
  ZX_BITMAP_BYTES,
  assertValidSoftwareScr,
} from "@retro-converter/zx-spectrum";
import { assertValidQlScreen } from "@retro-converter/sinclair-ql";
import {
  PMD85_BYTES_PER_LINE,
  PMD85_SCREEN_HEIGHT,
  PMD85_SCREEN_WIDTH,
  PMD85_VISIBLE_BYTES_PER_LINE,
  PMD85_VRAM_BASE_ADDRESS,
  assertValidPmd85Screen,
  pmd85AttributeCellHeight,
} from "@retro-converter/pmd-85";

export const APPLICATION_VERSION = "1.0.0-draft.5";

export function formatApplicationDisplayVersion(
  version: string,
  buildId?: string,
): string {
  const normalizedBuildId = buildId
    ?.trim()
    .replace(/[^0-9A-Za-z._-]/g, "")
    .slice(0, 12);
  return normalizedBuildId
    ? `${version} · build ${normalizedBuildId}`
    : version;
}

export const APPLICATION_DISPLAY_VERSION = formatApplicationDisplayVersion(
  APPLICATION_VERSION,
  import.meta.env.VITE_BUILD_ID,
);

export const DEFAULT_PROFILE = {
  id: "org.retroconverter.zx48.default",
  version: "1.0.0",
  mode: "zx48-standard-256x192",
  normal_channel: 205,
  bright_channel: 255,
  border_color: 0,
} as const;

function bytesToHex(bytes: Uint8Array): string {
  let output = "";
  for (const value of bytes) output += value.toString(16).padStart(2, "0");
  return output;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const input = Uint8Array.from(bytes).buffer;
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", input)));
}

export function sanitizeArtifactBaseName(fileName: string): string {
  const withoutExtension = fileName.replace(/\.[^.]*$/, "");
  let safe = withoutExtension
    .normalize("NFKD")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[^\x20-\x7e]/g, "")
    .replace(/[\s._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/[ .-]+$/g, "");
  if (safe === "") safe = "retro-converter";
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(safe)) safe = `retro-${safe}`;
  return safe;
}

export interface MetadataInput {
  readonly sourceSha256: string;
  readonly sourceFormat: "png" | "jpeg" | "pmd85-bin";
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly settings: ConversionSettings;
  readonly scr: Uint8Array;
  readonly frames?: readonly Uint8Array[];
  readonly previewRgba: Uint8Array;
  readonly width?: number;
  readonly height?: number;
  readonly score: number;
  readonly structuredDiagnostics?: StructuredDiagnostics;
  readonly verticalSpatialDiagnostics?: VerticalSpatialDiagnostics;
  readonly completedAtUtc: string;
  readonly profile?: {
    readonly id: string;
    readonly version: string;
    readonly name?: string;
    readonly content_sha256?: string;
    readonly preview?: {
      readonly normal_channel: number;
      readonly bright_channel: number;
      readonly border_color: number;
      readonly pixel_aspect_ratio?: number;
      readonly display_aspect_ratio?: {
        readonly width: number;
        readonly height: number;
      };
    };
  };
}

export async function buildConversionMetadata(input: MetadataInput) {
  const width = input.width ?? 256;
  const height = input.height ?? 192;
  const frames = input.frames ?? [input.scr];
  if (input.settings.platformId === "zx-spectrum") {
    for (const frame of frames) {
      assertValidSoftwareScr(frame, input.settings.attributeHeight);
    }
  } else if (input.settings.platformId === "sinclair-ql") {
    const hardwareModes = qlHardwareModesForTarget(
      input.settings.modeId as QlTargetModeId,
    );
    for (const [index, frame] of frames.entries()) {
      assertValidQlScreen(
        frame,
        hardwareModes[index]!,
      );
    }
  } else {
    for (const frame of frames) assertValidPmd85Screen(frame);
  }
  if (input.previewRgba.length !== width * height * 4) {
    throw new RangeError("Decoded preview pixel length is invalid.");
  }
  const profileSnapshot = input.profile ?? DEFAULT_PROFILE;
  const profileBytes = new TextEncoder().encode(JSON.stringify(profileSnapshot));
  const [profileSha256, scrSha256, previewSha256, ...frameHashes] = await Promise.all([
    sha256Hex(profileBytes),
    sha256Hex(input.scr),
    sha256Hex(input.previewRgba),
    ...frames.map(sha256Hex),
  ]);
  const attributes = input.settings.platformId === "zx-spectrum"
    ? bytesToHex(input.scr.subarray(ZX_BITMAP_BYTES))
    : "";
  const analyticPreviewSha256 = input.verticalSpatialDiagnostics === undefined
    ? null
    : await sha256Hex(input.verticalSpatialDiagnostics.analyticPreviewRgba);

  return {
    schema_version: "4.0.0",
    application_version: APPLICATION_VERSION,
    fidelity_class: input.settings.platformId !== "zx-spectrum" ||
      input.settings.attributeHeight === 8
      ? "NATIVE_STATIC"
      : "SIMULATION_ONLY",
    deterministic_projection: [
      "schema_version", "application_version", "fidelity_class", "source",
      "profile", "conversion", "target", "zx_spectrum", "sinclair_ql", "pmd_85",
      "quality", "warnings",
      "validation", "outputs", "preview",
    ],
    source: {
      sha256: input.sourceSha256,
      format: input.sourceFormat,
      decoded_width: input.sourceWidth,
      decoded_height: input.sourceHeight,
      interpretation: {
        color_space: input.sourceFormat === "pmd85-bin"
          ? "hardware-palette-decode"
          : "controlled-srgb-8bit",
        exif_orientation: input.sourceFormat === "pmd85-bin"
          ? "not-applicable"
          : "applied-during-decode",
        icc_policy: "untagged-or-recognized-srgb",
        alpha_background: input.settings.background,
      },
    },
    profile: {
      id: profileSnapshot.id,
      version: profileSnapshot.version,
      name: "name" in profileSnapshot ? profileSnapshot.name : "ZX Spectrum 48K standard",
      sha256: profileSha256,
    },
    conversion: {
      quality_level: "High",
      seed: input.settings.errorDiffusionRandomization > 0
        ? "rc-error-randomizer-1:seed-1"
        : "none",
      settings: input.settings,
      algorithm_versions: {
        geometry: "rc-geometry-3",
        adjustments: "rc-adjustments-filters-3",
        optimizer: input.settings.attributeOptimizerId,
        dithering: input.settings.ditherEngineId,
        vertical_spatial: input.settings.verticalSpatialMix?.algorithmId ?? null,
      },
    },
    target: {
      platform_id: input.settings.platformId,
      mode_id: input.settings.modeId,
      width,
      height,
      frame_count: frames.length,
      logical_width: input.verticalSpatialDiagnostics?.logicalWidth ?? width,
      logical_height: input.verticalSpatialDiagnostics?.logicalHeight ?? height,
    },
    zx_spectrum: input.settings.platformId === "zx-spectrum" ? {
      mode: input.settings.modeId === "zx48-mixed-256x192"
        ? input.settings.modeId
        : input.settings.attributeHeight === 8
        ? DEFAULT_PROFILE.mode
        : `zx48-software-8x${input.settings.attributeHeight}`,
      border_color: input.settings.borderColor,
      palette: {
        normal_channel: DEFAULT_PROFILE.normal_channel,
        bright_channel: DEFAULT_PROFILE.bright_channel,
        screen_selections: input.settings.paletteSelections.map((selection) => ({
          screen_index: selection.screenIndex,
          bright_mode: selection.brightMode,
          enabled_base_color_codes: selection.enabledColorIds,
        })),
      },
      attributes_hex: attributes,
      mixing: input.settings.modeId === "zx48-vertical-spatial-256x192"
        ? "vertical-spatial-static-50-50-linear-srgb-v1"
        : input.settings.modeId === "zx48-mixed-256x192"
        ? "two-frame-rgb-average-50-50-floor"
        : "none",
      screen_flicker_suppression:
        input.settings.modeId === "zx48-mixed-256x192"
          ? input.settings.screenFlickerSuppression &&
            paletteSelectionsMatch(
              input.settings.paletteSelections[0]!,
              input.settings.paletteSelections[1]!,
            )
          : null,
      frame_attributes_hex: frames.map((frame) =>
        bytesToHex(frame.subarray(ZX_BITMAP_BYTES))
      ),
    } : null,
    sinclair_ql: input.settings.platformId === "sinclair-ql" ? {
      mode: input.settings.modeId,
      frame_hardware_modes: qlHardwareModesForTarget(
        input.settings.modeId as QlTargetModeId,
      ),
      flash_enabled: false,
      mixing: input.settings.modeId.includes("vertical-spatial")
        ? "vertical-spatial-static-50-50-linear-srgb-v1"
        : qlTargetUsesMixing(input.settings.modeId as QlTargetModeId)
        ? input.settings.modeId === "mode8-mode4-mixed-512x256"
          ? "low-high-spatiotemporal-average-50-50"
          : "two-frame-rgb-average-50-50-floor"
        : "none",
      screen_flicker_suppression:
        qlTargetUsesMixing(input.settings.modeId as QlTargetModeId)
          ? input.settings.modeId === "mode8-mode4-mixed-512x256"
            ? input.settings.screenFlickerSuppression
            : input.settings.screenFlickerSuppression &&
              paletteSelectionsMatch(
                input.settings.paletteSelections[0]!,
                input.settings.paletteSelections[1]!,
              )
          : null,
      screen_palette_selections: input.settings.paletteSelections.map((selection) => ({
        screen_index: selection.screenIndex,
        enabled_palette_codes: selection.enabledColorIds,
      })),
    } : null,
    pmd_85: input.settings.platformId === "pmd-85" ? {
      mode: input.settings.pmd85.mode,
      target_mode: input.settings.modeId,
      calibration: input.settings.pmd85.paletteCalibrationId,
      attribute_model: input.settings.modeId === "pmd85-colorace"
        ? "colorace-pair"
        : "native",
      attribute_cell: {
        width: 6,
        height: input.settings.modeId.includes("vertical-spatial")
          ? 2
          : pmd85AttributeCellHeight(input.settings.pmd85.mode),
      },
      fixed_background: "black",
      blink_animation_supported: false,
      blink_bit_interpretation: input.settings.modeId === "pmd85-2-tv"
        ? "static-intensity"
        : "native-color-bit",
      gap_policy: input.settings.pmd85.gapPolicy,
      addressing: {
        base_address: PMD85_VRAM_BASE_ADDRESS,
        stride_bytes: PMD85_BYTES_PER_LINE,
        visible_bytes_per_line: PMD85_VISIBLE_BYTES_PER_LINE,
        width: PMD85_SCREEN_WIDTH,
        height: PMD85_SCREEN_HEIGHT,
        pixel_bit_order: "lsb-left",
      },
      enabled_foreground_ids: input.settings.paletteSelections[0]?.enabledColorIds ?? [],
      artifact_sha256: scrSha256,
      decoded_rgba_sha256: previewSha256,
      mixing: input.settings.modeId.includes("vertical-spatial")
        ? "vertical-spatial-static-50-50-linear-srgb-v1"
        : "none",
    } : null,
    quality: {
      metric: input.verticalSpatialDiagnostics !== undefined
        ? "vertical-spatial-q16-linear-rgb-v1"
        : input.structuredDiagnostics === undefined
        ? "squared-srgb-cell-cost-v1"
        : "structured-quantized-oklab-energy-v1",
      score: input.score,
      structured_components: input.structuredDiagnostics ?? null,
      vertical_spatial_components: input.verticalSpatialDiagnostics === undefined
        ? null
        : {
            color_cost: input.verticalSpatialDiagnostics.colorCost,
            stripe_cost: input.verticalSpatialDiagnostics.stripeCost,
            detail_cost: input.verticalSpatialDiagnostics.detailCost ?? null,
            phase_changes: input.verticalSpatialDiagnostics.phaseChanges ?? null,
            total_cost: input.verticalSpatialDiagnostics.totalCost,
          },
    },
    warnings: [],
    validation: {
      status: "valid",
      scr_bytes: input.scr.length,
      artifact_bytes: input.scr.length,
      attribute_size: input.settings.platformId === "zx-spectrum"
        ? `8x${input.settings.attributeHeight}`
        : null,
      issues: [],
    },
    outputs: {
      scr_sha256: scrSha256,
      artifact_sha256: scrSha256,
      frame_sha256: frameHashes,
      decoded_preview_rgba_sha256: previewSha256,
      preview_width: width,
      preview_height: height,
      analytic_preview_rgba_sha256: analyticPreviewSha256,
      encoded_preview_png_normative: false,
    },
    preview: {
      calibration: input.verticalSpatialDiagnostics !== undefined
        ? "srgb-ideal-v1"
        : input.settings.platformId === "zx-spectrum"
        ? input.settings.modeId === "zx48-mixed-256x192"
          ? "zx-two-frame-average-preview"
          : "exact-zx-rgb-pixel-preview"
        : input.settings.platformId === "pmd-85"
          ? `exact-pmd85-${input.settings.pmd85.paletteCalibrationId}-decoder-preview`
        : qlTargetUsesMixing(input.settings.modeId as QlTargetModeId)
          ? "sinclair-ql-two-frame-average-preview"
          : "exact-sinclair-ql-rgb-pixel-preview",
      normative_pixels: true,
      software_mode: input.settings.platformId === "zx-spectrum" &&
        input.settings.attributeHeight !== 8,
    },
    completed_at_utc: input.completedAtUtc,
  } as const;
}
