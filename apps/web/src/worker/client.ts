import type {
  ConversionWorkerSuccess,
  ConversionWorkerRequest,
  ConversionWorkerResponse,
} from "./protocol.js";
import type {
  AttributeOptimizerId,
  ConversionSettings,
  DitherEngineId,
  OptimizationLevel,
  PlatformId,
  PaletteSelection,
  TargetModeId,
  StructuredDiagnostics,
  VerticalSpatialDiagnostics,
} from "@retro-converter/conversion-core";
import type { Pmd85ModeId, Pmd85RgbColor } from "@retro-converter/pmd-85";
import type {
  CharsetConversionOptions,
  CharsetAssignment,
  CharsetDiagnostics,
  CharsetEncoding,
} from "@retro-converter/zx-charset";

export interface WorkerDecodedImage {
  readonly format: "png" | "jpeg" | "pmd85-bin";
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

export interface WorkerConversionResult {
  readonly artifact: Uint8Array;
  /** @deprecated Use artifact. Retained for project-schema-10 compatibility. */
  readonly scr: Uint8Array;
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
    readonly encoded: Uint8Array;
    readonly paletteIndices: Uint8Array;
    readonly previewRgba: Uint8Array;
  }[];
  readonly sourcePreviewRgba: Uint8Array;
  readonly preConstraintPreviewRgba: Uint8Array;
  readonly mergedPreviewRgba: Uint8Array;
  readonly previewRgba: Uint8Array;
  readonly score: number;
  readonly attributeHeight: 1 | 2 | 4 | 8 | null;
  readonly structuredDiagnostics?: StructuredDiagnostics;
  readonly verticalSpatialDiagnostics?: VerticalSpatialDiagnostics;
}

export interface WorkerPmd85Import {
  readonly image: WorkerDecodedImage;
  readonly originalBytes: Uint8Array;
  readonly mode: Pmd85ModeId;
  readonly paletteCalibrationId: string;
  readonly pixelAspectRatio: number;
  readonly paletteIndices: Uint8Array;
  readonly gapBytes: Uint8Array;
  readonly attributeHeight: 1 | 2;
}

export interface WorkerCharsetResult {
  readonly encoding: CharsetEncoding;
  readonly transformations: boolean;
  readonly characterCount: number;
  readonly artifact: Uint8Array;
  readonly decodedScr: Uint8Array;
  readonly previewRgba: Uint8Array;
  readonly charset: Uint8Array;
  readonly attributes: Uint8Array;
  readonly assignments: readonly CharsetAssignment[];
  readonly diagnostics: CharsetDiagnostics;
}

export class ConversionWorkerClient {
  readonly #worker = new Worker(
    new URL("./conversion.worker.ts", import.meta.url),
    { type: "module" },
  );

  readonly #pending = new Map<
    string,
    {
      readonly resolve: (response: ConversionWorkerSuccess) => void;
      readonly reject: (error: Error) => void;
    }
  >();

  constructor() {
    this.#worker.addEventListener(
      "message",
      (event: MessageEvent<ConversionWorkerResponse>) => {
        const response = event.data;
        const pending = this.#pending.get(response.jobId);
        if (pending === undefined) {
          return;
        }

        this.#pending.delete(response.jobId);
        if (response.kind !== "failure") {
          pending.resolve(response);
        } else {
          pending.reject(new Error(`${response.code}: ${response.message}`));
        }
      },
    );

    this.#worker.addEventListener("error", (event) => {
      const error = new Error(event.message || "Conversion worker crashed.");
      for (const pending of this.#pending.values()) {
        pending.reject(error);
      }
      this.#pending.clear();
    });
  }

  createBlankScr(attribute: number): Promise<Uint8Array> {
    const jobId = crypto.randomUUID();
    const request: ConversionWorkerRequest = {
      kind: "create-blank-scr",
      jobId,
      attribute,
    };

    return new Promise<ConversionWorkerSuccess>((resolve, reject) => {
      this.#pending.set(jobId, { resolve, reject });
      this.#worker.postMessage(request);
    }).then((response) => {
      if (response.kind !== "scr-success") {
        throw new Error("Worker returned an unexpected response.");
      }
      return new Uint8Array(response.bytes);
    });
  }

  decodeImage(bytes: ArrayBuffer): Promise<WorkerDecodedImage> {
    const jobId = crypto.randomUUID();
    const request: ConversionWorkerRequest = { kind: "decode-image", jobId, bytes };
    return new Promise<ConversionWorkerSuccess>((resolve, reject) => {
      this.#pending.set(jobId, { resolve, reject });
      this.#worker.postMessage(request, [bytes]);
    }).then((response) => {
      if (response.kind !== "image-success") {
        throw new Error("Worker returned an unexpected response.");
      }
      return {
        format: response.format,
        width: response.width,
        height: response.height,
        rgba: new Uint8Array(response.rgba),
      };
    });
  }

  decodePmd85(
    bytes: ArrayBuffer,
    mode: Pmd85ModeId,
    foregroundPalette: readonly Pmd85RgbColor[],
    paletteCalibrationId: string,
  ): Promise<WorkerPmd85Import> {
    const jobId = crypto.randomUUID();
    const request: ConversionWorkerRequest = {
      kind: "decode-pmd85",
      jobId,
      bytes,
      mode,
      foregroundPalette,
      paletteCalibrationId,
    };
    return new Promise<ConversionWorkerSuccess>((resolve, reject) => {
      this.#pending.set(jobId, { resolve, reject });
      this.#worker.postMessage(request, [bytes]);
    }).then((response) => {
      if (response.kind !== "pmd85-image-success") {
        throw new Error("Worker returned an unexpected PMD 85 response.");
      }
      const rgba = new Uint8Array(response.rgba);
      return {
        image: {
          format: "pmd85-bin",
          width: 288,
          height: 256,
          rgba,
        },
        originalBytes: new Uint8Array(response.originalBytes),
        mode: response.mode,
        paletteCalibrationId: response.paletteCalibrationId,
        pixelAspectRatio: response.pixelAspectRatio,
        paletteIndices: new Uint8Array(response.paletteIndices),
        gapBytes: new Uint8Array(response.gapBytes),
        attributeHeight: response.attributeHeight,
      };
    });
  }

  convertImage(
    image: WorkerDecodedImage,
    settings: ConversionSettings,
    level: OptimizationLevel = "high",
    pmd85?: {
      readonly foregroundPalette: readonly Pmd85RgbColor[];
      readonly importedGapBytes?: Uint8Array;
    },
  ): Promise<WorkerConversionResult> {
    const jobId = crypto.randomUUID();
    const rgba = Uint8Array.from(image.rgba).buffer;
    const pmd85ImportedGapBytes = pmd85?.importedGapBytes === undefined
      ? undefined
      : Uint8Array.from(pmd85.importedGapBytes).buffer;
    const request: ConversionWorkerRequest = {
      kind: "convert-image",
      jobId,
      width: image.width,
      height: image.height,
      rgba,
      settings,
      level,
      ...(pmd85 === undefined
        ? {}
        : { pmd85ForegroundPalette: pmd85.foregroundPalette }),
      ...(pmd85ImportedGapBytes === undefined ? {} : { pmd85ImportedGapBytes }),
    };
    return new Promise<ConversionWorkerSuccess>((resolve, reject) => {
      this.#pending.set(jobId, { resolve, reject });
      this.#worker.postMessage(
        request,
        pmd85ImportedGapBytes === undefined ? [rgba] : [rgba, pmd85ImportedGapBytes],
      );
    }).then((response) => {
      if (response.kind !== "conversion-success") {
        throw new Error("Worker returned an unexpected response.");
      }
      return {
        artifact: new Uint8Array(response.artifact),
        scr: new Uint8Array(response.scr),
        platformId: response.platformId,
        modeId: response.modeId,
        width: response.width,
        height: response.height,
        pixelAspectRatio: response.pixelAspectRatio,
        attributeOptimizerId: response.attributeOptimizerId,
        ditherEngineId: response.ditherEngineId,
        paletteSelections: response.paletteSelections,
        frames: response.frames.map((frame) => ({
          hardwareModeId: frame.hardwareModeId,
          nativeWidth: frame.nativeWidth,
          nativeHeight: frame.nativeHeight,
          nativePixelAspectRatio: frame.nativePixelAspectRatio,
          encoded: new Uint8Array(frame.encoded),
          paletteIndices: new Uint8Array(frame.paletteIndices),
          previewRgba: new Uint8Array(frame.previewRgba),
        })),
        sourcePreviewRgba: new Uint8Array(response.sourcePreviewRgba),
        preConstraintPreviewRgba: new Uint8Array(response.preConstraintPreviewRgba),
        mergedPreviewRgba: new Uint8Array(response.mergedPreviewRgba),
        previewRgba: new Uint8Array(response.previewRgba),
        score: response.score,
        attributeHeight: response.attributeHeight,
        ...(response.structuredDiagnostics === undefined
          ? {}
          : { structuredDiagnostics: response.structuredDiagnostics }),
        ...(response.verticalSpatialDiagnostics === undefined
          ? {}
          : {
              verticalSpatialDiagnostics: {
                ...response.verticalSpatialDiagnostics,
                analyticPreviewRgba: new Uint8Array(
                  response.verticalSpatialDiagnostics.analyticPreviewRgba,
                ),
              },
            }),
      };
    });
  }

  convertCharset(
    scrBytes: Uint8Array,
    options: CharsetConversionOptions,
  ): Promise<WorkerCharsetResult> {
    const jobId = crypto.randomUUID();
    const scr = Uint8Array.from(scrBytes).buffer;
    const existingCharset = options.existingCharset === undefined
      ? undefined
      : Uint8Array.from(options.existingCharset).buffer;
    const request: ConversionWorkerRequest = {
      kind: "convert-charset",
      jobId,
      scr,
      options: {
        source: options.source,
        characterBudget: options.characterBudget,
        encoding: options.encoding,
        allowTransforms: options.allowTransforms,
        allowPolarity: options.allowPolarity,
        derivedStrategy: options.derivedStrategy,
        distanceMetric: options.distanceMetric,
        visualWeighting: options.visualWeighting,
        ...(options.swapRefinementPasses === undefined
          ? {}
          : { swapRefinementPasses: options.swapRefinementPasses }),
        ...(options.existingCharsetRange === undefined
          ? {}
          : { existingCharsetRange: options.existingCharsetRange }),
        ...(options.existingCharsetSelection === undefined
          ? {}
          : { existingCharsetSelection: options.existingCharsetSelection }),
        ...(existingCharset === undefined ? {} : { existingCharset }),
      },
    };
    const transfer = existingCharset === undefined ? [scr] : [scr, existingCharset];
    return new Promise<ConversionWorkerSuccess>((resolve, reject) => {
      this.#pending.set(jobId, { resolve, reject });
      this.#worker.postMessage(request, transfer);
    }).then((response) => {
      if (response.kind !== "charset-success") {
        throw new Error("Worker returned an unexpected response.");
      }
      return {
        encoding: response.encoding,
        transformations: response.transformations,
        characterCount: response.characterCount,
        artifact: new Uint8Array(response.artifact),
        decodedScr: new Uint8Array(response.decodedScr),
        previewRgba: new Uint8Array(response.previewRgba),
        charset: new Uint8Array(response.charset),
        attributes: new Uint8Array(response.attributes),
        assignments: response.assignments,
        diagnostics: response.diagnostics,
      };
    });
  }

  dispose(): void {
    this.#worker.terminate();
    const error = new Error("Conversion worker was disposed.");
    for (const pending of this.#pending.values()) {
      pending.reject(error);
    }
    this.#pending.clear();
  }
}
