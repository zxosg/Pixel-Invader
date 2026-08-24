/// <reference lib="webworker" />

import {
  createBlankScreen,
  serializeScr,
} from "@retro-converter/zx-spectrum";
import { decodeImage, ImageImportError } from "@retro-converter/image-codecs";
import { convertToPmd85, convertToQl, convertToZx } from "@retro-converter/conversion-core";
import {
  decodePmd85Screen,
  pmd85AttributeCellHeight,
  renderPmd85Rgba,
} from "@retro-converter/pmd-85";
import type { Pmd85ModeId } from "@retro-converter/pmd-85";
import { convertScrToCharset } from "@retro-converter/zx-charset";
import type {
  ConversionWorkerRequest,
  ConversionWorkerResponse,
} from "./protocol.js";
import { restoreCharsetConversionOptions } from "./charset-options.js";

const worker = self as DedicatedWorkerGlobalScope;

worker.addEventListener(
  "message",
  (event: MessageEvent<ConversionWorkerRequest>) => {
    const request = event.data;

    try {
      if (request.kind === "create-blank-scr") {
        const bytes = serializeScr(createBlankScreen(request.attribute));
        const response: ConversionWorkerResponse = {
          kind: "scr-success",
          jobId: request.jobId,
          bytes: Uint8Array.from(bytes).buffer,
        };
        worker.postMessage(response, [response.bytes]);
        return;
      }

      if (request.kind === "decode-pmd85") {
        const original = new Uint8Array(request.bytes);
        const decoded = decodePmd85Screen(original, request.mode);
        const originalBytes = Uint8Array.from(original).buffer;
        const rgba = Uint8Array.from(
          renderPmd85Rgba(decoded, request.foregroundPalette),
        ).buffer;
        const paletteIndices = Uint8Array.from(decoded.paletteIndices).buffer;
        const gapBytes = Uint8Array.from(decoded.gapBytes).buffer;
        const response: ConversionWorkerResponse = {
          kind: "pmd85-image-success",
          jobId: request.jobId,
          mode: request.mode,
          paletteCalibrationId: request.paletteCalibrationId,
          pixelAspectRatio: request.pixelAspectRatio,
          originalBytes,
          rgba,
          paletteIndices,
          gapBytes,
          attributeHeight: pmd85AttributeCellHeight(request.mode),
        };
        worker.postMessage(response, [originalBytes, rgba, paletteIndices, gapBytes]);
        return;
      }

      if (request.kind === "convert-image") {
        const result = request.settings.platformId === "sinclair-ql"
          ? convertToQl(
              new Uint8Array(request.rgba),
              request.width,
              request.height,
              request.settings,
              request.level,
            )
          : request.settings.platformId === "pmd-85"
            ? convertToPmd85(
                new Uint8Array(request.rgba),
                request.width,
                request.height,
                request.settings,
                request.pmd85ForegroundPalette ?? [],
                request.pmd85ImportedGapBytes === undefined
                  ? undefined
                  : new Uint8Array(request.pmd85ImportedGapBytes),
                request.level,
              )
            : convertToZx(
                new Uint8Array(request.rgba),
                request.width,
                request.height,
                request.settings,
                request.level,
              );
        const artifact = Uint8Array.from(result.frames[0]?.encoded ?? new Uint8Array()).buffer;
        const frames = result.frames.map((frame) => ({
          hardwareModeId: frame.hardwareModeId,
          nativeWidth: frame.nativeWidth,
          nativeHeight: frame.nativeHeight,
          nativePixelAspectRatio: frame.nativePixelAspectRatio,
          encoded: Uint8Array.from(frame.encoded).buffer,
          paletteIndices: Uint8Array.from(frame.paletteIndices).buffer,
          previewRgba: Uint8Array.from(frame.previewRgba).buffer,
        }));
        const sourcePreviewRgba = Uint8Array.from(result.sourcePreviewRgba).buffer;
        const preConstraintPreviewRgba =
          Uint8Array.from(result.preConstraintPreviewRgba).buffer;
        const mergedPreviewRgba = Uint8Array.from(result.mergedPreviewRgba).buffer;
        const previewRgba = Uint8Array.from(result.previewRgba).buffer;
        const analyticPreviewRgba = result.verticalSpatialDiagnostics === undefined
          ? undefined
          : Uint8Array.from(
              result.verticalSpatialDiagnostics.analyticPreviewRgba,
            ).buffer;
        const response: ConversionWorkerResponse = {
          kind: "conversion-success",
          jobId: request.jobId,
          scr: artifact,
          artifact,
          platformId: result.platformId,
          modeId: result.modeId,
          width: result.width,
          height: result.height,
          pixelAspectRatio: result.pixelAspectRatio,
          attributeOptimizerId: result.attributeOptimizerId,
          ditherEngineId: result.ditherEngineId,
          paletteSelections: result.paletteSelections,
          frames,
          sourcePreviewRgba,
          preConstraintPreviewRgba,
          mergedPreviewRgba,
          previewRgba,
          score: result.score,
          attributeHeight: result.platformId === "zx-spectrum"
            ? result.attributeHeight
            : result.platformId === "pmd-85"
              ? pmd85AttributeCellHeight(
                  result.frames[0]!.hardwareModeId as Pmd85ModeId,
                )
              : null,
          ...(result.structuredDiagnostics === undefined
            ? {}
            : { structuredDiagnostics: result.structuredDiagnostics }),
          ...(result.verticalSpatialDiagnostics === undefined || analyticPreviewRgba === undefined
            ? {}
            : {
                verticalSpatialDiagnostics: {
                  ...result.verticalSpatialDiagnostics,
                  analyticPreviewRgba,
                },
              }),
        };
        worker.postMessage(response, [
          artifact,
          sourcePreviewRgba,
          preConstraintPreviewRgba,
          mergedPreviewRgba,
          previewRgba,
          ...(analyticPreviewRgba === undefined ? [] : [analyticPreviewRgba]),
          ...frames.flatMap((frame) => [
            frame.encoded,
            frame.paletteIndices,
            frame.previewRgba,
          ]),
        ]);
        return;
      }

      if (request.kind === "convert-charset") {
        const result = convertScrToCharset(
          new Uint8Array(request.scr),
          restoreCharsetConversionOptions(request.options),
        );
        const artifact = Uint8Array.from(result.artifact.bytes).buffer;
        const decodedScr = Uint8Array.from(result.decodedScr).buffer;
        const previewRgba = Uint8Array.from(result.previewRgba).buffer;
        const charset = Uint8Array.from(result.artifact.charset).buffer;
        const attributes = Uint8Array.from(
          result.artifact.attributes,
        ).buffer;
        const response: ConversionWorkerResponse = {
          kind: "charset-success",
          jobId: request.jobId,
          encoding: result.artifact.encoding,
          transformations: result.artifact.transformations,
          characterCount: result.artifact.characterCount,
          artifact,
          decodedScr,
          previewRgba,
          charset,
          attributes,
          assignments: result.assignments,
          diagnostics: result.diagnostics,
        };
        worker.postMessage(response, [
          artifact,
          decodedScr,
          previewRgba,
          charset,
          attributes,
        ]);
        return;
      }

      const decoded = decodeImage(new Uint8Array(request.bytes));
      const rgba = Uint8Array.from(decoded.rgba).buffer;
      const response: ConversionWorkerResponse = {
        kind: "image-success",
        jobId: request.jobId,
        format: decoded.format,
        width: decoded.width,
        height: decoded.height,
        rgba,
      };
      worker.postMessage(response, [rgba]);
    } catch (error: unknown) {
      const response: ConversionWorkerResponse = {
        kind: "failure",
        jobId: request.jobId,
        code:
          error instanceof ImageImportError
            ? error.code
            : error instanceof RangeError
            ? "CONVERSION_INVALID_REQUEST"
            : "CONVERSION_INTERNAL",
        message: error instanceof Error ? error.message : "Unknown worker error.",
      };
      worker.postMessage(response);
    }
  },
);
