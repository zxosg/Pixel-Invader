import type {
  AttributeOptimizerId,
  ConversionSettings,
  DitherEngineId,
  OptimizationLevel,
  PlatformId,
  TargetModeId,
  StructuredDiagnostics,
  VerticalSpatialDiagnostics,
  PaletteSelection,
} from "@retro-converter/conversion-core";
import type { Pmd85ModeId, Pmd85RgbColor } from "@retro-converter/pmd-85";
import type {
  CharsetConversionOptions,
  CharsetAssignment,
  CharsetDiagnostics,
  CharsetEncoding,
} from "@retro-converter/zx-charset";

export interface CreateBlankScrRequest {
  readonly kind: "create-blank-scr";
  readonly jobId: string;
  readonly attribute: number;
}

export interface DecodeImageRequest {
  readonly kind: "decode-image";
  readonly jobId: string;
  readonly bytes: ArrayBuffer;
}

export interface DecodePmd85Request {
  readonly kind: "decode-pmd85";
  readonly jobId: string;
  readonly bytes: ArrayBuffer;
  readonly mode: Pmd85ModeId;
  readonly foregroundPalette: readonly Pmd85RgbColor[];
  readonly paletteCalibrationId: string;
  readonly pixelAspectRatio: number;
}

export interface ConvertImageRequest {
  readonly kind: "convert-image";
  readonly jobId: string;
  readonly width: number;
  readonly height: number;
  readonly rgba: ArrayBuffer;
  readonly settings: ConversionSettings;
  readonly level: OptimizationLevel;
  readonly pmd85ForegroundPalette?: readonly Pmd85RgbColor[];
  readonly pmd85ImportedGapBytes?: ArrayBuffer;
}

export interface ConvertCharsetRequest {
  readonly kind: "convert-charset";
  readonly jobId: string;
  readonly scr: ArrayBuffer;
  readonly options: Omit<CharsetConversionOptions, "existingCharset"> & {
    readonly existingCharset?: ArrayBuffer;
  };
}

export type ConversionWorkerRequest =
  | CreateBlankScrRequest
  | DecodeImageRequest
  | DecodePmd85Request
  | ConvertImageRequest
  | ConvertCharsetRequest;

export interface CreateBlankScrSuccess {
  readonly kind: "scr-success";
  readonly jobId: string;
  readonly bytes: ArrayBuffer;
}

export interface DecodeImageSuccess {
  readonly kind: "image-success";
  readonly jobId: string;
  readonly format: "png" | "jpeg";
  readonly width: number;
  readonly height: number;
  readonly rgba: ArrayBuffer;
}

export interface DecodePmd85Success {
  readonly kind: "pmd85-image-success";
  readonly jobId: string;
  readonly mode: Pmd85ModeId;
  readonly paletteCalibrationId: string;
  readonly pixelAspectRatio: number;
  readonly originalBytes: ArrayBuffer;
  readonly rgba: ArrayBuffer;
  readonly paletteIndices: ArrayBuffer;
  readonly gapBytes: ArrayBuffer;
  readonly attributeHeight: 1 | 2;
}

export interface ConvertImageSuccess {
  readonly kind: "conversion-success";
  readonly jobId: string;
  readonly scr: ArrayBuffer;
  readonly artifact: ArrayBuffer;
  readonly platformId: PlatformId;
  readonly modeId: TargetModeId;
  readonly width: number;
  readonly height: number;
  readonly pixelAspectRatio: number;
  readonly attributeOptimizerId: AttributeOptimizerId;
  readonly ditherEngineId: DitherEngineId;
  readonly paletteSelections: readonly PaletteSelection[];
  readonly frames: readonly {
    readonly hardwareModeId: string;
    readonly nativeWidth: number;
    readonly nativeHeight: number;
    readonly nativePixelAspectRatio: number;
    readonly encoded: ArrayBuffer;
    readonly paletteIndices: ArrayBuffer;
    readonly previewRgba: ArrayBuffer;
  }[];
  readonly sourcePreviewRgba: ArrayBuffer;
  readonly preConstraintPreviewRgba: ArrayBuffer;
  readonly mergedPreviewRgba: ArrayBuffer;
  readonly previewRgba: ArrayBuffer;
  readonly score: number;
  readonly attributeHeight: 1 | 2 | 4 | 8 | null;
  readonly structuredDiagnostics?: StructuredDiagnostics;
  readonly verticalSpatialDiagnostics?: Omit<VerticalSpatialDiagnostics, "analyticPreviewRgba"> & {
    readonly analyticPreviewRgba: ArrayBuffer;
  };
}

export interface ConvertCharsetSuccess {
  readonly kind: "charset-success";
  readonly jobId: string;
  readonly encoding: CharsetEncoding;
  readonly transformations: boolean;
  readonly characterCount: number;
  readonly artifact: ArrayBuffer;
  readonly decodedScr: ArrayBuffer;
  readonly previewRgba: ArrayBuffer;
  readonly charset: ArrayBuffer;
  readonly attributes: ArrayBuffer;
  readonly assignments: readonly CharsetAssignment[];
  readonly diagnostics: CharsetDiagnostics;
}

export type ConversionWorkerSuccess =
  | CreateBlankScrSuccess
  | DecodeImageSuccess
  | DecodePmd85Success
  | ConvertImageSuccess
  | ConvertCharsetSuccess;

export interface ConversionWorkerFailure {
  readonly kind: "failure";
  readonly jobId: string;
  readonly code: string;
  readonly message: string;
}

export type ConversionWorkerResponse =
  | ConversionWorkerSuccess
  | ConversionWorkerFailure;
