import type { ZxScreen } from "@retro-converter/zx-spectrum";
import type { Pmd85GapPolicy, Pmd85ModeId } from "@retro-converter/pmd-85";

export type FramingMode = "fit" | "fill" | "crop" | "stretch";
export type ResamplingMethod = "nearest" | "bilinear" | "lanczos";
export type Rotation = 0 | 90 | 180 | 270;
export type OptimizationLevel = "draft" | "high";
export type DitheringMethod = "none" | "ordered" | "error-diffusion";
export type PlatformId = "zx-spectrum" | "sinclair-ql" | "pmd-85";
export type Pmd85SpatialTargetModeId =
  | "pmd85-2-rgb-vertical-spatial"
  | "pmd85-3-rgb-vertical-spatial"
  | "pmd85-3-pal-vertical-spatial";
export type Pmd85TargetModeId = Pmd85ModeId | Pmd85SpatialTargetModeId;
export type QlTargetModeId =
  | "mode8-256x256"
  | "mode4-512x256"
  | "mode8-mode4-mixed-512x256"
  | "mode8-plain-256x256"
  | "mode4-plain-512x256"
  | "mode8-vertical-spatial-256x256"
  | "mode4-vertical-spatial-512x256";
export type ZxTargetModeId =
  | "zx48-standard-256x192"
  | "zx48-mixed-256x192"
  | "zx48-vertical-spatial-256x192";
export type TargetModeId =
  | ZxTargetModeId
  | QlTargetModeId
  | Pmd85TargetModeId;
export type QlMixedOptimizerId =
  | "ql-mixed-average-v1"
  | "ql-mixed-low-perception-v2"
  | "ql-mixed-high-detail-v2"
  | "ql-mixed-balanced-v2";
export type AttributeOptimizerId =
  | "pmd85-cell-v1"
  | "pmd85-vertical-spatial-uniform-v1"
  | "zx-adaptive-v1"
  | "zx-source-cell-v1"
  | "zx-guide-local-v1"
  | "zx-guide-reference-halo-v1"
  | "zx-guide-reference-halo-v2"
  | "zx-guide-reference-rgb-halo-v3"
  | "zx-block-dbs-global-v1"
  | "zx-structured-global-v1"
  | "zx-structured-global-v2"
  | "zx-structured-global-v3"
  | "zx-structured-global-v4"
  | "zx-vertical-spatial-uniform-v1"
  | "zx-vertical-spatial-detail-v1"
  | "ql-vertical-spatial-uniform-v1";
export type ArtisticPatternPreference = "auto" | "checkerboard" | "horizontal" | "vertical";
export type DitherEngineId =
  | "artistic-ordered-hybrid-v1"
  | "vertical-spatial-none-v1"
  | "vertical-spatial-ordered-v1"
  | "vertical-spatial-error-diffusion-v1"
  | "none-v1"
  | "none-discrete-v2"
  | "ordered-osg-v1"
  | "ordered-unrestricted-v2"
  | "ordered-local-tone-v3"
  | "ordered-palette-pairs-v4"
  | "ordered-baseline-additive-v5"
  | "ordered-strict-matrix-v6"
  | "ordered-coverage-normalized-v7"
  | "ordered-mixed-phase-stable-v8"
  | "ordered-clustered-dot-v1"
  | "ordered-void-cluster-v1"
  | "ordered-cell-pattern-v1"
  | "ordered-cell-pattern-v2"
  | "ordered-cell-pattern-v3"
  | "ordered-cell-pattern-v4"
  | "pattern-legal-mask-dbs-v1"
  | "error-diffusion-projected-v1"
  | "error-diffusion-unrestricted-v2"
  | "error-diffusion-phase-balanced-v3"
  | "error-diffusion-phase-balanced-checker-v3-1"
  | "error-diffusion-phase-balanced-checker-v3-2"
  | "error-diffusion-phase-balanced-checker-v3-3"
  | "error-diffusion-checker-phase-v4"
  | "error-diffusion-checker-phase-v4-4"
  | "error-diffusion-checker-phase-v4-1"
  | "error-diffusion-checker-phase-v4-2"
  | "error-diffusion-checker-phase-v4-3"
  | "error-diffusion-checker-phase-v5"
  | "error-diffusion-matrix-guided-v1"
  | "error-diffusion-decorrelated-v3"
  | "error-diffusion-atkinson-v1"
  | "error-diffusion-riemersma-v1";
export type AttributeHeight = 1 | 2 | 4 | 8;
export type AttributeHaloRadius = 0 | 1 | 2;
export type BrightMode = "auto" | "on" | "off";
export type CropAspectRatio = "none" | "source" | "destination";
export type OrderedMatrixId =
  | "checkerboard-2x1"
  | "bayer-2x2"
  | "bayer-4x4"
  | "bayer-8x8"
  | "clustered-dot-4x4"
  | "clustered-dot-8x8"
  | "void-cluster-8x8";

export interface RgbColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface PixelCrop {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PaletteSelection {
  readonly screenIndex: number;
  readonly enabledColorIds: readonly number[];
  readonly brightMode?: BrightMode;
}

export interface ConversionSettings {
  readonly profileId: string;
  readonly platformId: PlatformId;
  readonly modeId: TargetModeId;
  readonly attributeOptimizerId: AttributeOptimizerId;
  readonly ditherEngineId: DitherEngineId;
  readonly qlMixedOptimizerId: QlMixedOptimizerId;
  readonly paletteSelections: readonly PaletteSelection[];
  readonly framing: FramingMode;
  readonly resampling: ResamplingMethod;
  readonly rotation: Rotation;
  readonly mirrorHorizontal: boolean;
  readonly mirrorVertical: boolean;
  readonly fillOffsetX: number | null;
  readonly fillOffsetY: number | null;
  readonly crop: PixelCrop;
  readonly cropAspectRatio: CropAspectRatio;
  readonly brightness: number;
  readonly contrast: number;
  readonly saturation: number;
  readonly gamma: number;
  readonly smoothing: number;
  readonly sharpening: number;
  readonly background: RgbColor;
  readonly borderColor: number;
  readonly attributeHeight: AttributeHeight;
  readonly attributeSmoothing: number;
  readonly attributeHaloInfluence: number;
  readonly attributeHaloHorizontal: AttributeHaloRadius;
  readonly attributeHaloVertical: AttributeHaloRadius;
  readonly screenFlickerSuppression: boolean;
  readonly dithering: DitheringMethod;
  readonly ditheringAmount: number;
  readonly errorDiffusionRandomization: number;
  readonly errorDiffusionLineSuppression: number;
  readonly orderedMatrix: OrderedMatrixId;
  readonly artisticPattern?: ArtisticPatternPreference;
  readonly structured: StructuredConversionSettings;
  readonly pmd85: Pmd85ConversionSettings;
  readonly verticalSpatialMix?: VerticalSpatialMixSettings;
}

export interface VerticalSpatialMixSettings {
  readonly schemaVersion: 1;
  readonly algorithmId:
    | "vertical-spatial-uniform-v1"
    | "vertical-spatial-detail-v1";
  readonly calibrationId: "srgb-ideal-v1";
}

export interface Pmd85ConversionSettings {
  readonly mode: Pmd85ModeId;
  readonly paletteCalibrationId: string;
  readonly crtAspect: "square-pixel" | "logical-9:8" | "approximate-4:3";
  readonly gapPolicy: Pmd85GapPolicy;
}

export interface StructuredConversionSettings {
  readonly schemaVersion: 1;
  readonly ditherAmountPermille: number;
  readonly paletteProfileId: "zx-205-255-v1";
  readonly paletteProfileVersion: 1;
  readonly mixtureModelId:
    | "linear-light-average-v1"
    | "gamma-average-v1";
  readonly perceptualModelId: "oklab-quantized-v1";
  readonly colorAnchorModelId:
    | "none-v1"
    | "srgb-squared-v1";
  readonly structuralModelId:
    | "none-v1"
    | "palette-topology-v1";
  readonly ditherResponseCurveId:
    | "power-065-percent-v1"
    | "power-035-percent-v2";
  readonly oklabWeights: {
    readonly l: number;
    readonly a: number;
    readonly b: number;
  };
  readonly objectiveWeights: {
    readonly pixel: number;
    readonly rgbAnchor: number;
    readonly patternReference: number;
    readonly paletteDistribution: number;
    readonly luminanceRank: number;
    readonly edgePolarity: number;
    readonly mean: number;
    readonly edge: number;
    readonly deviationFlip: number;
    readonly deviationContrast: number;
    readonly visibility: number;
    readonly boundary: number;
    readonly sharedEndpoint: number;
  };
  readonly boundaryParameters: {
    readonly sourceDiscontinuityAllowance: number;
    readonly edgeAttenuation: number;
  };
  readonly candidateParameters: {
    readonly edgeImportanceWeight: number;
    readonly strongEdgeThreshold: number;
    readonly importantMassPermille: number;
    readonly localAdmissibilityPermille: number;
    readonly boundaryCapPermille: number;
  };
}

export interface StructuredDiagnostics {
  readonly engineVersion:
    | "zx-structured-global-v1"
    | "zx-structured-global-v2"
    | "zx-structured-global-v3"
    | "zx-structured-global-v4";
  readonly pixelCost: number;
  readonly rgbAnchorCost: number;
  readonly patternReferenceCost: number;
  readonly paletteDistributionCost: number;
  readonly luminanceRankCost: number;
  readonly edgePolarityCost: number;
  readonly meanCost: number;
  readonly edgeCost: number;
  readonly deviationFlipCost: number;
  readonly deviationContrastCost: number;
  readonly visibilityCost: number;
  readonly boundaryExcessCost: number;
  readonly sharedEndpointBonus: number;
  readonly localCost: number;
  readonly boundaryCost: number;
  readonly totalEnergy: number;
  readonly deliberateFlips: number;
  readonly candidateCount: number;
  readonly attributePasses: number;
  readonly mixtureModelId: StructuredConversionSettings["mixtureModelId"];
  readonly perceptualModelId: StructuredConversionSettings["perceptualModelId"];
  readonly colorAnchorModelId: StructuredConversionSettings["colorAnchorModelId"];
  readonly structuralModelId: StructuredConversionSettings["structuralModelId"];
  readonly responseCurveId: StructuredConversionSettings["ditherResponseCurveId"];
}

export interface BaseConversionResult {
  readonly platformId: PlatformId;
  readonly modeId: TargetModeId;
  readonly width: number;
  readonly height: number;
  readonly pixelAspectRatio: number;
  readonly attributeOptimizerId: AttributeOptimizerId;
  readonly ditherEngineId: DitherEngineId;
  readonly paletteSelections: readonly PaletteSelection[];
  readonly frames: readonly ConversionFrame[];
  readonly preConstraintPreviewRgba: Uint8Array;
  readonly mergedPreviewRgba: Uint8Array;
  readonly sourcePreviewRgba: Uint8Array;
  readonly previewRgba: Uint8Array;
  readonly score: number;
  readonly structuredDiagnostics?: StructuredDiagnostics;
  readonly verticalSpatialDiagnostics?: VerticalSpatialDiagnostics;
}

export interface VerticalSpatialDiagnostics {
  readonly algorithmId:
    | "vertical-spatial-uniform-v1"
    | "vertical-spatial-detail-v1";
  readonly calibrationId: "srgb-ideal-v1";
  readonly logicalWidth: number;
  readonly logicalHeight: number;
  readonly analyticPreviewRgba: Uint8Array;
  readonly colorCost: number;
  readonly stripeCost: number;
  readonly detailCost?: number;
  readonly phaseChanges?: number;
  readonly totalCost: number;
}

export interface ConversionFrame {
  readonly hardwareModeId: string;
  readonly nativeWidth: number;
  readonly nativeHeight: number;
  readonly nativePixelAspectRatio: number;
  readonly encoded: Uint8Array;
  readonly paletteIndices: Uint8Array;
  readonly previewRgba: Uint8Array;
}

export interface ZxConversionResult extends BaseConversionResult {
  readonly platformId: "zx-spectrum";
  readonly modeId: ZxTargetModeId;
  readonly screen: ZxScreen;
  readonly pixels: Uint8Array;
  readonly attributes: Uint8Array;
  readonly attributeHeight: AttributeHeight;
  readonly artifactCorrection?: {
    readonly correctedPixelCount: number;
    readonly totalArtifactScore: number;
  };
  readonly checkerPlacementDiagnostics?: {
    readonly changedPixels: number;
    readonly changedBlocks: number;
    readonly fullBlocks: number;
    readonly eligibleBlocks: number;
    readonly intermediateCoverageBlocks: number;
    readonly checkerCandidateCount: number;
    readonly sourceRejectedCandidates: number;
    readonly structureRejectedCandidates: number;
    readonly edgeRejectedBlocks: number;
    readonly acceptedCheckerBlocks: number;
    readonly phaseReorientedBlocks?: number;
  };
}

export interface QlConversionResult extends BaseConversionResult {
  readonly platformId: "sinclair-ql";
  readonly modeId: QlTargetModeId;
}

export interface Pmd85ConversionResult extends BaseConversionResult {
  readonly platformId: "pmd-85";
  readonly modeId: Pmd85TargetModeId;
  readonly pixelMasks: Uint8Array;
  readonly attributes: Uint8Array;
  readonly gapPolicy: Pmd85GapPolicy;
  readonly paletteCalibrationId: string;
}

export type ConversionResult = ZxConversionResult | QlConversionResult | Pmd85ConversionResult;

export const DEFAULT_ENABLED_PALETTE_COLORS = [
  0, 1, 2, 3, 4, 5, 6, 7,
] as const;

export const DEFAULT_CONVERSION_SETTINGS: ConversionSettings = {
  profileId: "org.retroconverter.zx48.default",
  platformId: "zx-spectrum",
  modeId: "zx48-standard-256x192",
  attributeOptimizerId: "zx-adaptive-v1",
  ditherEngineId: "none-discrete-v2",
  qlMixedOptimizerId: "ql-mixed-balanced-v2",
  framing: "fit",
  resampling: "bilinear",
  rotation: 0,
  mirrorHorizontal: false,
  mirrorVertical: false,
  fillOffsetX: null,
  fillOffsetY: null,
  crop: { x: 0, y: 0, width: 256, height: 192 },
  cropAspectRatio: "none",
  brightness: 0,
  contrast: 0,
  saturation: 0,
  gamma: 100,
  smoothing: 0,
  sharpening: 0,
  background: { r: 255, g: 255, b: 255 },
  borderColor: 0,
  attributeHeight: 8,
  attributeSmoothing: 0,
  attributeHaloInfluence: 100,
  attributeHaloHorizontal: 1,
  attributeHaloVertical: 0,
  screenFlickerSuppression: true,
  paletteSelections: [{
    screenIndex: 0,
    enabledColorIds: DEFAULT_ENABLED_PALETTE_COLORS,
    brightMode: "auto",
  }],
  dithering: "none",
  ditheringAmount: 0,
  errorDiffusionRandomization: 0,
  errorDiffusionLineSuppression: 50,
  orderedMatrix: "bayer-4x4",
  structured: {
    schemaVersion: 1,
    ditherAmountPermille: 0,
    paletteProfileId: "zx-205-255-v1",
    paletteProfileVersion: 1,
    mixtureModelId: "linear-light-average-v1",
    perceptualModelId: "oklab-quantized-v1",
    colorAnchorModelId: "none-v1",
    structuralModelId: "none-v1",
    ditherResponseCurveId: "power-065-percent-v1",
    oklabWeights: { l: 1024, a: 768, b: 768 },
    objectiveWeights: {
      pixel: 1024,
      rgbAnchor: 0,
      patternReference: 0,
      paletteDistribution: 0,
      luminanceRank: 0,
      edgePolarity: 0,
      mean: 256,
      edge: 512,
      deviationFlip: 384,
      deviationContrast: 128,
      visibility: 96,
      boundary: 384,
      sharedEndpoint: 64,
    },
    boundaryParameters: {
      sourceDiscontinuityAllowance: 1024,
      edgeAttenuation: 512,
    },
    candidateParameters: {
      edgeImportanceWeight: 1024,
      strongEdgeThreshold: 256,
      importantMassPermille: 100,
      localAdmissibilityPermille: 1000,
      boundaryCapPermille: 1000,
    },
  },
  pmd85: {
    mode: "pmd85-3-rgb",
    paletteCalibrationId: "emulator-soft",
    crtAspect: "square-pixel",
    gapPolicy: "zero",
  },
};
