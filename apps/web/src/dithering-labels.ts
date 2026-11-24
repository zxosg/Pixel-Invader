import { type Pmd85RgbColor } from "@retro-converter/pmd-85";
import { type ConversionSettings, type OrderedMatrixId, type RgbColor } from "@retro-converter/conversion-core";

export const ORDERED_MATRIX_IDS: readonly OrderedMatrixId[] = [
  "checkerboard-2x1",
  "bayer-2x2",
  "bayer-4x4",
  "bayer-8x8",
  "clustered-dot-4x4",
  "clustered-dot-8x8",
  "void-cluster-8x8",
];

export function orderedMatrixLabel(matrixId: OrderedMatrixId): string {
  switch (matrixId) {
    case "checkerboard-2x1": return "2×1 Checkerboard";
    case "bayer-2x2": return "2×2";
    case "bayer-4x4": return "4×4";
    case "bayer-8x8": return "8×8";
    case "clustered-dot-4x4": return "Clustered dot 4×4";
    case "clustered-dot-8x8": return "Clustered dot 8×8";
    case "void-cluster-8x8": return "Void-and-cluster 8×8";
  }
}

export const BUILT_IN_COMPOSER_PROPAGATION_IDS = [
  "none",
  "error-diffusion-unrestricted-v2",
  "error-diffusion-phase-balanced-v3",
  "error-diffusion-checker-phase-v4-3",
  "error-diffusion-checker-phase-v5",
  "error-diffusion-decorrelated-v3",
  "error-diffusion-atkinson-v1",
] as const;

export function composerPropagationLabel(id: ConversionSettings["composer"]["propagationId"]): string {
  switch (id) {
    case "none": return "Pattern only";
    case "error-diffusion-unrestricted-v2": return "Projected unrestricted v2";
    case "error-diffusion-phase-balanced-v3": return "Phase balanced v3";
    case "error-diffusion-checker-phase-v4-3": return "Checker phase v4.3";
    case "error-diffusion-checker-phase-v5": return "Checker phase v5";
    case "error-diffusion-decorrelated-v3": return "Decorrelated v3";
    case "error-diffusion-atkinson-v1": return "Atkinson v1";
    default: return id;
  }
}

export function parseMatrixValues(text: string): number[] {
  return text
    .split(/[^0-9-]+/)
    .filter((token) => token.length > 0)
    .map((token) => Number.parseInt(token, 10));
}

export function formatMatrixValues(values: readonly number[]): string {
  return values.join(" ");
}

export function parseKernelEntries(text: string): readonly (readonly [number, number, number])[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [dx, dy, weight] = line.split(/[^0-9.-]+/).filter((token) => token.length > 0).map(Number);
      return [dx ?? Number.NaN, dy ?? Number.NaN, weight ?? Number.NaN] as const;
    });
}

export function formatKernelEntries(
  entries: readonly (readonly [number, number, number])[],
): string {
  return entries.map(([dx, dy, weight]) => `${dx} ${dy} ${weight}`).join("\n");
}

export function hexToRgb(hex: string): Pmd85RgbColor {
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

export function rgbToHex(color: RgbColor): string {
  return `#${[color.r, color.g, color.b]
    .map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, "0"))
    .join("")}`;
}
