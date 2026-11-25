import { type ConversionSettings, DEFAULT_CONVERSION_SETTINGS, fillGeometryForDimensions, outputScreenCount, type Pmd85TargetModeId } from "@retro-converter/conversion-core";
import { pmdHardwareModeForTarget } from "../conversion-targets.js";
import { assertValidPmd85Screen, extractPmd85GapBytes, PMD85_SCREEN_HEIGHT, PMD85_SCREEN_WIDTH, type Pmd85ModeId } from "@retro-converter/pmd-85";
import { normalizeProjectName } from "../project-name.js";
import { sanitizeArtifactBaseName, sha256Hex } from "../artifacts.js";
import { ConversionWorkerClient, type WorkerDecodedImage } from "../worker/client.js";
import { orientedSourceSize } from "../crop.js";
import { decodeZxScrSource } from "../zx-scr-import.js";
import { encodeRgbaPng, inspectGif, MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS, sniffImageFormat } from "@retro-converter/image-codecs";
import { useEffect } from "react";
import { benchmarkCacheKey } from "../benchmark.js";
import { draftPreviewResult } from "../draft-preview-state.js";
import type { useRuntimeState } from "./use-runtime-state.js";
import type { useSettingsState } from "./use-settings-state.js";
import type { useWorkbenchState } from "./use-workbench-state.js";
import type { useResultEditing } from "./use-result-editing.js";
import { directPmd85Result } from "./result-editing-helpers.js";

export function useConversionSettings(
  { amountEntry, artisticPattern, attributeHaloHorizontal, attributeHaloInfluence, attributeHaloVertical, attributeHeight, attributeOptimizerId, attributeSmoothing, background, benchmarkContextKeyRef, benchmarkRunRef, benchmarkWorkerRef, bitmapEditorEncodedRef, bitmapEditorFullBufferRef, bitmapEditorResultEdited, borderColor, brightness, charsetAllowPolarity, charsetAllowTransforms, charsetBudget, charsetEncoding, charsetSource, charsetState, charsetVisualWeighting, charsetWorkerRef, clearBitmapEditorPickedCell, colorize, composer, contrast, cropAspectRatio, cropHeightEntry, cropWidthEntry, cropXEntry, cropYEntry, customDiffusionKernels, customOrderedMatrices, destinationGeometry, developmentMode, dirty, ditherEngineId, dithering, draftState, draftWorkerRef, errorDiffusionLineSuppression, errorDiffusionRandomization, existingCharset, existingCharsetLength, existingCharsetLengthEntry, existingCharsetSelection, existingCharsetStart, existingCharsetStartEntry, fillOffsetX, fillOffsetY, finalJobRef, finalRunningRef, framing, gamma, gifFrameSelection, hslSaturation, hueShift, image, invalidSliderIds, isPmd, lastFinal, lastFinalRevisionRef, lastZxSettingsRef, lightness, mirrorHorizontal, mirrorVertical, orderedMatrix, paletteSelections, panEdgeMode, panOffsetX, panOffsetY, pendingNewEmptyImageRef, pendingOpenedFinalRef, pmd85ForegroundPalette, pmd85GapPolicy, pmd85PaletteCalibrationId, qlMixedOptimizerId, resampling, resetResultEditorState, resolvedZxPalette, revisionRef, rotation, saturation, screenFlickerSuppression, selectedPlatformId, selectedProfile, selectedProfileId, setBenchmarkOpen, setBenchmarkRows, setBenchmarkRunning, setBitmapEditorBuffer, setBitmapEditorFlashPreviewMode, setBitmapEditorFlashPreviewPhase, setBitmapEditorPatternPickerActive, setBitmapEditorRedoFull, setBitmapEditorRevertSource, setBitmapEditorScope, setBitmapEditorSourceColor, setBitmapEditorUndoFull, setCharsetState, setCropEntries, setCropSelectionActive, setDirty, setDraftState, setExportError, setFillOffsetX, setFillOffsetY, setGifFrameSelection, setImage, setImageStatus, setLastFinal, setLastFinalCompletedAt, setOriginalImage, setPanOffsetX, setPanOffsetY, setPmd85GapPolicy, setProjectName, setResultOrigin, setSourceArtifact, setSourceFileName, setSourceFrameIndex, setSourcePreviewZoom, setState, setTilemapBenchmarkOpen, setTilemapBenchmarkRows, setTilemapBenchmarkRunning, setTilemapStale, sharpening, skipNextDraftAfterBitmapEditRef, smoothing, sourceArtifact, sourceReplacementRevisionRef, specsciiDocumentName, structuredSettings, targetModeId, tilemapBenchmarkRunRef, verticalSpatialSwapRows, workerRef, workspaceMode, zxMixedAttributesOnly, zxPaletteDefinition }: Pick<ReturnType<typeof useRuntimeState>, "benchmarkContextKeyRef" | "benchmarkRunRef" | "benchmarkWorkerRef" | "bitmapEditorEncodedRef" | "bitmapEditorFullBufferRef" | "bitmapEditorResultEdited" | "charsetState" | "charsetWorkerRef" | "draftState" | "draftWorkerRef" | "finalJobRef" | "finalRunningRef" | "invalidSliderIds" | "lastFinal" | "lastFinalRevisionRef" | "lastZxSettingsRef" | "pendingOpenedFinalRef" | "revisionRef" | "setBitmapEditorBuffer" | "setBitmapEditorFlashPreviewMode" | "setBitmapEditorFlashPreviewPhase" | "setBitmapEditorPatternPickerActive" | "setBitmapEditorRedoFull" | "setBitmapEditorRevertSource" | "setBitmapEditorScope" | "setBitmapEditorSourceColor" | "setBitmapEditorUndoFull" | "setCharsetState" | "setDraftState" | "setLastFinal" | "setState" | "skipNextDraftAfterBitmapEditRef" | "workerRef"> &
    Pick<ReturnType<typeof useSettingsState>, "amountEntry" | "artisticPattern" | "attributeHaloHorizontal" | "attributeHaloInfluence" | "attributeHaloVertical" | "attributeHeight" | "attributeOptimizerId" | "attributeSmoothing" | "background" | "borderColor" | "brightness" | "charsetAllowPolarity" | "charsetAllowTransforms" | "charsetBudget" | "charsetEncoding" | "charsetSource" | "charsetVisualWeighting" | "colorize" | "composer" | "contrast" | "cropAspectRatio" | "cropHeightEntry" | "cropWidthEntry" | "cropXEntry" | "cropYEntry" | "customDiffusionKernels" | "customOrderedMatrices" | "dirty" | "ditherEngineId" | "dithering" | "errorDiffusionLineSuppression" | "errorDiffusionRandomization" | "existingCharset" | "existingCharsetLength" | "existingCharsetLengthEntry" | "existingCharsetSelection" | "existingCharsetStart" | "existingCharsetStartEntry" | "fillOffsetX" | "fillOffsetY" | "framing" | "gamma" | "gifFrameSelection" | "hslSaturation" | "hueShift" | "image" | "lightness" | "mirrorHorizontal" | "mirrorVertical" | "orderedMatrix" | "paletteSelections" | "panEdgeMode" | "panOffsetX" | "panOffsetY" | "qlMixedOptimizerId" | "resampling" | "resolvedZxPalette" | "rotation" | "saturation" | "screenFlickerSuppression" | "selectedProfileId" | "setDirty" | "setExportError" | "setFillOffsetX" | "setFillOffsetY" | "setGifFrameSelection" | "setImage" | "setImageStatus" | "setLastFinalCompletedAt" | "setOriginalImage" | "setPanOffsetX" | "setPanOffsetY" | "setProjectName" | "setResultOrigin" | "setSourceArtifact" | "setSourceFileName" | "setSourceFrameIndex" | "setTilemapStale" | "sharpening" | "smoothing" | "sourceArtifact" | "specsciiDocumentName" | "structuredSettings" | "targetModeId" | "verticalSpatialSwapRows" | "workspaceMode" | "zxMixedAttributesOnly" | "zxPaletteDefinition"> &
    Pick<ReturnType<typeof useWorkbenchState>, "destinationGeometry" | "developmentMode" | "isPmd" | "pendingNewEmptyImageRef" | "pmd85GapPolicy" | "pmd85PaletteCalibrationId" | "selectedPlatformId" | "selectedProfile" | "setBenchmarkOpen" | "setBenchmarkRows" | "setBenchmarkRunning" | "setCropSelectionActive" | "setPmd85GapPolicy" | "setSourcePreviewZoom" | "setTilemapBenchmarkOpen" | "setTilemapBenchmarkRows" | "setTilemapBenchmarkRunning" | "sourceReplacementRevisionRef" | "tilemapBenchmarkRunRef"> &
    Pick<ReturnType<typeof useResultEditing>, "clearBitmapEditorPickedCell" | "pmd85ForegroundPalette" | "resetResultEditorState" | "setCropEntries">,
) {
  const amount = Number(amountEntry);
  const cropX = Number(cropXEntry);
  const cropY = Number(cropYEntry);
  const cropWidth = Number(cropWidthEntry);
  const cropHeight = Number(cropHeightEntry);
  const conversionSettings: ConversionSettings = {
    profileId: selectedProfileId,
    platformId: selectedPlatformId,
    modeId: targetModeId,
    attributeOptimizerId,
    ditherEngineId,
    qlMixedOptimizerId,
    framing,
    resampling,
    rotation,
    mirrorHorizontal,
    mirrorVertical,
    fillOffsetX,
    fillOffsetY,
    panOffsetX,
    panOffsetY,
    panEdgeMode,
    crop: { x: cropX, y: cropY, width: cropWidth, height: cropHeight },
    cropAspectRatio,
    brightness,
    contrast,
    // Preserve imported legacy Color Intensity values without exposing a duplicate control.
    saturation,
    hueShift,
    hslSaturation,
    lightness,
    colorize,
    gamma,
    smoothing,
    sharpening,
    background,
    borderColor,
    attributeHeight,
    attributeSmoothing,
    attributeHaloInfluence,
    attributeHaloHorizontal,
    attributeHaloVertical,
    screenFlickerSuppression,
    zxMixedAttributesOnly,
    paletteSelections,
    zxPalette: zxPaletteDefinition,
    dithering,
    ditheringAmount: dithering === "none" ? 0 : amount,
    errorDiffusionRandomization,
    errorDiffusionLineSuppression,
    orderedMatrix,
    artisticPattern,
    customOrderedMatrices,
    customDiffusionKernels,
    composer,
    structured: {
      ...structuredSettings,
      ditherAmountPermille: dithering === "none" ? 0 : amount * 10,
    },
      pmd85: {
        mode: isPmd
          ? pmdHardwareModeForTarget(targetModeId as Pmd85TargetModeId)
          : DEFAULT_CONVERSION_SETTINGS.pmd85.mode,
        paletteCalibrationId: pmd85PaletteCalibrationId,
        gapPolicy: pmd85GapPolicy,
      },
    ...(targetModeId.includes("vertical-spatial")
      ? {
          verticalSpatialMix: {
            schemaVersion: 1 as const,
            algorithmId: attributeOptimizerId === "zx-vertical-spatial-detail-v1"
              ? "vertical-spatial-detail-v1" as const
              : attributeOptimizerId === "pmd85-vertical-spatial-detail-v2"
                ? "vertical-spatial-pmd-detail-v2" as const
              : "vertical-spatial-uniform-v1" as const,
            calibrationId: "srgb-ideal-v1" as const,
            swapRows: verticalSpatialSwapRows,
          },
        }
      : {}),
  };

  async function importPmd85(file: File | undefined) {
    if (file === undefined || !isPmd) return;
    if (dirty && !window.confirm("Replace the current unsaved work with this PMD binary?")) return;
    const worker = workerRef.current;
    if (worker === null) {
      setImageStatus("Failed: conversion worker is unavailable.");
      return;
    }
    setImageStatus(`Validating and decoding ${file.name} as ${targetModeId}…`);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      assertValidPmd85Screen(bytes);
      const imported = await worker.decodePmd85(
        Uint8Array.from(bytes).buffer,
        targetModeId as Pmd85ModeId,
        pmd85ForegroundPalette,
        pmd85PaletteCalibrationId,
      );
      const directSettings: ConversionSettings = {
        ...conversionSettings,
        pmd85: { ...conversionSettings.pmd85, gapPolicy: "preserve-imported" },
      };
      const directResult = directPmd85Result(imported, directSettings);
      pendingOpenedFinalRef.current = {
        result: directResult,
        completedAtUtc: new Date().toISOString(),
      };
      setPmd85GapPolicy("preserve-imported");
      setResultOrigin("direct-import");
      setSourceFrameIndex(0);
      setSourceFileName(file.name);
      setProjectName(normalizeProjectName(sanitizeArtifactBaseName(file.name)));
      setSourceArtifact({
        sha256: await sha256Hex(bytes),
        baseName: sanitizeArtifactBaseName(file.name),
        bytes: Uint8Array.from(bytes),
      });
      setFillOffsetX(null);
      setFillOffsetY(null);
      setCropEntries({ x: 0, y: 0, width: PMD85_SCREEN_WIDTH, height: PMD85_SCREEN_HEIGHT });
      setCropSelectionActive(true);
      setImage(imported.image);
      setOriginalImage({ ...imported.image, rgba: imported.image.rgba.slice() });
      setLastFinal(directResult);
      setState({ kind: "ready", result: directResult });
      setDraftState({ kind: "idle" });
      setDirty(true);
      setImageStatus(
        `Accepted raw PMD 85 binary · 16,384 bytes · interpreted as ${targetModeId}. Original bytes are ready for exact export.`,
      );
    } catch (error: unknown) {
      setImageStatus(`Invalid PMD 85 binary: ${error instanceof Error ? error.message : "Unknown error."}`);
    }
  }

  async function finishImageImport(
    file: File,
    sourceBytes: Uint8Array,
    frameIndex: number,
    decodedOverride?: WorkerDecodedImage,
    acceptedDescription?: string,
    replacementRevision = ++sourceReplacementRevisionRef.current,
  ) {
    const worker = workerRef.current;
    if (worker === null && decodedOverride === undefined) {
      setImageStatus("Failed: conversion worker is unavailable.");
      return;
    }
    // A newly loaded source must start fitted to the available preview window,
    // regardless of the zoom used for the previous image or editor view.
    setSourcePreviewZoom("fit");
    setImageStatus(decodedOverride === undefined
      ? `Validating and decoding ${file.name} in worker…`
      : `Preparing ${file.name}…`);
    try {
      const sourceSha256 = await sha256Hex(sourceBytes);
      const decoded = decodedOverride ?? await worker!.decodeImage(sourceBytes.slice().buffer, frameIndex);
      if (replacementRevision !== sourceReplacementRevisionRef.current) return;
      setImage(null);
      setOriginalImage(null);
      bitmapEditorFullBufferRef.current = null;
      bitmapEditorEncodedRef.current = null;
      setBitmapEditorBuffer(null);
      setBitmapEditorUndoFull([]);
      setBitmapEditorRedoFull([]);
      setBitmapEditorRevertSource(null);
      resetResultEditorState();
      setBitmapEditorSourceColor(null);
      setState({ kind: "idle" });
      setDraftState({ kind: "idle" });
      setLastFinal(null);
      setLastFinalCompletedAt(null);
      setSourceArtifact(null);
      setSourceFileName(file.name);
      setExportError(null);
      setBenchmarkRows([]);
      lastFinalRevisionRef.current = -1;
      setFillOffsetX(null);
      setFillOffsetY(null);
      const decodedSize = orientedSourceSize(decoded.width, decoded.height, rotation);
      setCropEntries({
        x: 0,
        y: 0,
        width: decodedSize.width,
        height: decodedSize.height,
      });
      setCropSelectionActive(true);
      setImage(decoded);
      setOriginalImage({ ...decoded, rgba: decoded.rgba.slice() });
      setSourceFrameIndex(frameIndex);
      setResultOrigin("converted");
      setDirty(true);
      setProjectName(normalizeProjectName(sanitizeArtifactBaseName(file.name)));
      setSourceArtifact({
        sha256: sourceSha256,
        baseName: sanitizeArtifactBaseName(file.name),
        bytes: sourceBytes,
      });
      setImageStatus(acceptedDescription ??
        `Accepted ${decoded.format.toUpperCase()}${decoded.format === "gif" ? ` frame ${frameIndex + 1}` : ""} · ${decoded.width} × ${decoded.height} · ${decoded.rgba.length.toLocaleString()} RGBA bytes.`);
    } catch (error: unknown) {
      setImageStatus(`Invalid image: ${error instanceof Error ? error.message : "Unknown error."}`);
    }
  }

  async function importImage(file: File | undefined) {
    if (file === undefined) return;
    if (dirty && !window.confirm("Replace the current unsaved work with this image?")) return;
    const replacementRevision = ++sourceReplacementRevisionRef.current;
    pendingNewEmptyImageRef.current = false;
    skipNextDraftAfterBitmapEditRef.current = false;
    setImageStatus(`Reading ${file.name}…`);
    try {
      const sourceBytes = new Uint8Array(await file.arrayBuffer());
      if (/\.scr$/i.test(file.name)) {
        const decoded = decodeZxScrSource(sourceBytes, resolvedZxPalette);
        const normalized = encodeRgbaPng(decoded.rgba, decoded.width, decoded.height);
        await finishImageImport(
          file,
          normalized,
          0,
          decoded,
          `Accepted ZX Spectrum SCR · ${sourceBytes.length.toLocaleString()} bytes · decoded as ${decoded.width} × ${decoded.height} source image.`,
          replacementRevision,
        );
        return;
      }
      const format = sniffImageFormat(sourceBytes);
      if (format === "gif") {
        const gif = inspectGif(sourceBytes);
        if (gif.frameCount > 1) {
          setGifFrameSelection({ file, bytes: sourceBytes, frameCount: gif.frameCount, frameEntry: "1" });
          setImageStatus(`Animated GIF · ${gif.frameCount} frames · choose a frame to import.`);
          return;
        }
      }
      await finishImageImport(file, sourceBytes, 0, undefined, undefined, replacementRevision);
    } catch (error: unknown) {
      setImageStatus(`Invalid image: ${error instanceof Error ? error.message : "Unknown error."}`);
    }
  }

  function importSelectedGifFrame(): void {
    if (gifFrameSelection === null) return;
    const frameNumber = Number(gifFrameSelection.frameEntry);
    if (!Number.isInteger(frameNumber) || frameNumber < 1 || frameNumber > gifFrameSelection.frameCount) return;
    const selection = gifFrameSelection;
    setGifFrameSelection(null);
    const replacementRevision = ++sourceReplacementRevisionRef.current;
    pendingNewEmptyImageRef.current = false;
    skipNextDraftAfterBitmapEditRef.current = false;
    void finishImageImport(selection.file, selection.bytes, frameNumber - 1, undefined, undefined, replacementRevision);
  }

  function cancelGifFrameSelection(): void {
    setGifFrameSelection(null);
    setImageStatus("GIF import canceled.");
  }

  async function importClipboardImage(): Promise<void> {
    if (navigator.clipboard?.read === undefined) {
      setImageStatus("Clipboard image import is unavailable in this browser. Use a secure connection and a browser that supports clipboard reading.");
      return;
    }

    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const mimeType = ["image/png", "image/jpeg"].find((type) => item.types.includes(type));
        if (mimeType === undefined) continue;

        const blob = await item.getType(mimeType);
        const bitmap = await createImageBitmap(blob);
        try {
          if (bitmap.width < 1 || bitmap.height < 1 || bitmap.width > MAX_IMAGE_DIMENSION || bitmap.height > MAX_IMAGE_DIMENSION || bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
            throw new Error("Clipboard image dimensions exceed the supported image limits.");
          }
          const canvas = document.createElement("canvas");
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const context = canvas.getContext("2d");
          if (context === null) throw new Error("Image conversion is unavailable in this browser.");
          context.drawImage(bitmap, 0, 0);
          const normalized = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((result) => {
              if (result === null) reject(new Error("The clipboard image could not be normalized."));
              else resolve(result);
            }, "image/png");
          });
          await importImage(new File([normalized], "clipboard.png", { type: "image/png" }));
        } finally {
          bitmap.close();
        }
        return;
      }
      setImageStatus("The clipboard does not contain a PNG or JPEG image.");
    } catch (error: unknown) {
      setImageStatus(`Could not read an image from the clipboard: ${error instanceof Error ? error.message : "Clipboard access was denied."}`);
    }
  }
  const amountValid = /^\d+$/.test(amountEntry) && Number.isInteger(amount) && amount >= 0 && amount <= 100;
  const cropSourceSize = image === null
    ? null
    : orientedSourceSize(image.width, image.height, rotation);
  const cropValid = [cropXEntry, cropYEntry, cropWidthEntry, cropHeightEntry].every((entry) => /^\d+$/.test(entry)) &&
    [cropX, cropY, cropWidth, cropHeight].every(Number.isInteger) &&
    cropX >= 0 && cropY >= 0 && cropWidth >= 1 && cropHeight >= 1 &&
    cropSourceSize !== null &&
    cropX + cropWidth <= cropSourceSize.width &&
    cropY + cropHeight <= cropSourceSize.height;
  const paletteValid =
    paletteSelections.length === outputScreenCount(targetModeId) &&
    paletteSelections.every((selection) => selection.enabledColorIds.length > 0);
  const availableExistingCharsetCount = existingCharset === null
    ? 0
    : existingCharset.length / 8;
  const enteredCharsetStart = Number(existingCharsetStartEntry);
  const enteredCharsetLength = Number(existingCharsetLengthEntry);
  const charsetRangeEntriesValid =
    /^\d+$/.test(existingCharsetStartEntry) &&
    /^\d+$/.test(existingCharsetLengthEntry) &&
    Number.isInteger(enteredCharsetStart) &&
    Number.isInteger(enteredCharsetLength) &&
    enteredCharsetStart >= 1 &&
    enteredCharsetStart <= availableExistingCharsetCount &&
    enteredCharsetLength >= 1 &&
    enteredCharsetLength <=
      availableExistingCharsetCount - (enteredCharsetStart - 1);
  const existingCharsetChoiceValid = existingCharsetSelection === null
    ? charsetRangeEntriesValid
    : existingCharsetSelection.length > 0;
  const tilemapSettingsValid = workspaceMode !== "tilemap" ||
    charsetSource !== "existing" ||
    (existingCharset !== null && existingCharsetChoiceValid);
  const existingActiveCharacterCount = existingCharsetSelection?.length ??
    existingCharsetLength;
  const settingsValid = amountValid && invalidSliderIds.size === 0 && paletteValid &&
    (!isPmd || pmd85ForegroundPalette.length > 0) &&
    (framing !== "crop" || cropValid) && tilemapSettingsValid;
  const fillGeometry = image === null
    ? null
    : fillGeometryForDimensions(
        image.width,
        image.height,
        destinationGeometry.width,
        destinationGeometry.height,
        rotation,
        destinationGeometry.pixelAspect,
        fillOffsetX,
        fillOffsetY,
      );
  const panMaximumX = destinationGeometry.width;
  const panMaximumY = destinationGeometry.height;
  useEffect(() => {
    if (fillGeometry === null) return;
    if (
      fillOffsetX !== null &&
      fillOffsetX > fillGeometry.maximumOffsetX
    ) setFillOffsetX(fillGeometry.maximumOffsetX);
    if (
      fillOffsetY !== null &&
      fillOffsetY > fillGeometry.maximumOffsetY
    ) setFillOffsetY(fillGeometry.maximumOffsetY);
  }, [
    fillGeometry?.maximumOffsetX,
    fillGeometry?.maximumOffsetY,
    fillOffsetX,
    fillOffsetY,
  ]);
  useEffect(() => {
    setPanOffsetX((current) => Math.max(-panMaximumX, Math.min(panMaximumX, current)));
    setPanOffsetY((current) => Math.max(-panMaximumY, Math.min(panMaximumY, current)));
  }, [panMaximumX, panMaximumY]);
  const pmd85WorkerOptions = isPmd
    ? {
        foregroundPalette: pmd85ForegroundPalette,
        ...(image?.format === "pmd85-bin" &&
            sourceArtifact !== null &&
            pmd85GapPolicy === "preserve-imported"
          ? { importedGapBytes: extractPmd85GapBytes(sourceArtifact.bytes) }
          : {}),
      }
    : undefined;
  if (selectedPlatformId === "zx-spectrum") {
    lastZxSettingsRef.current = conversionSettings;
  }
  const currentBenchmarkContextKey = benchmarkCacheKey(
    sourceArtifact?.sha256 ?? null,
    conversionSettings,
    amountEntry,
    selectedProfile.content_sha256,
  );
  benchmarkContextKeyRef.current = currentBenchmarkContextKey;

  useEffect(() => {
    benchmarkRunRef.current += 1;
    benchmarkWorkerRef.current?.dispose();
    benchmarkWorkerRef.current = null;
    setBenchmarkRunning(false);
    setBenchmarkRows([]);
  }, [currentBenchmarkContextKey]);

  useEffect(() => {
    if (developmentMode) return;
    benchmarkRunRef.current += 1;
    benchmarkWorkerRef.current?.dispose();
    benchmarkWorkerRef.current = null;
    tilemapBenchmarkRunRef.current += 1;
    setBenchmarkRunning(false);
    setTilemapBenchmarkRunning(false);
    setBenchmarkOpen(false);
    setTilemapBenchmarkOpen(false);
  }, [developmentMode]);

  useEffect(() => {
    setTilemapBenchmarkRows([]);
  }, [
    lastFinal,
    charsetSource,
    existingCharset,
    existingCharsetStart,
    existingCharsetLength,
    existingCharsetSelection,
    charsetBudget,
    charsetEncoding,
    charsetAllowTransforms,
    charsetAllowPolarity,
    charsetVisualWeighting,
  ]);

  useEffect(() => {
    const revision = revisionRef.current + 1;
    revisionRef.current = revision;
    setBitmapEditorFlashPreviewMode("normal");
    setBitmapEditorFlashPreviewPhase(false);
    setBitmapEditorScope("pixel");
    setBitmapEditorPatternPickerActive(false);
    clearBitmapEditorPickedCell();
    // Any source/settings change starts a new conversion lifecycle. An edited
    // native result belongs to the previous conversion and must not be carried
    // into the new draft/final result.
    if (bitmapEditorResultEdited) resetResultEditorState();
    setExportError(null);
    if (workspaceMode === "tilemap" && charsetState.kind === "ready" &&
        specsciiDocumentName === null) {
      setTilemapStale(true);
    }

    if (finalRunningRef.current) {
      workerRef.current?.dispose();
      workerRef.current = new ConversionWorkerClient();
      charsetWorkerRef.current?.dispose();
      charsetWorkerRef.current = null;
      finalRunningRef.current = false;
      finalJobRef.current += 1;
      setCharsetState((current) =>
        current.kind === "running" ? { kind: "idle" } : current,
      );
      if (workspaceMode === "tilemap" && specsciiDocumentName === null) {
        setTilemapStale(true);
      }
    }
    const openedFinal = pendingOpenedFinalRef.current;
    if (openedFinal !== null) {
      pendingOpenedFinalRef.current = null;
      draftWorkerRef.current?.dispose();
      draftWorkerRef.current = null;
      setDraftState({ kind: "idle" });
      lastFinalRevisionRef.current = revision;
      setLastFinal(openedFinal.result);
      setLastFinalCompletedAt(openedFinal.completedAtUtc);
      setState({ kind: "ready", result: openedFinal.result });
      setDirty(false);
      return;
    }
    if (image !== null) setDirty(true);
    if (skipNextDraftAfterBitmapEditRef.current) {
      skipNextDraftAfterBitmapEditRef.current = false;
      draftWorkerRef.current?.dispose();
      draftWorkerRef.current = null;
      setDraftState({ kind: "idle" });
      if (lastFinal !== null) {
        lastFinalRevisionRef.current = revision;
        setState({ kind: "ready", result: lastFinal });
      }
      return;
    }
    const hasStaleFinal = lastFinalRevisionRef.current >= 0 &&
      lastFinalRevisionRef.current !== revision;
    setState((current) => hasStaleFinal
      ? { kind: "stale" }
      : current.kind === "running" ? { kind: "idle" } : current,
    );

    const priorDraft = draftPreviewResult(draftState);
    const retainedResult = priorDraft !== null &&
        priorDraft.platformId === selectedPlatformId &&
        priorDraft.modeId === targetModeId
      ? priorDraft
      : null;
    if (image === null || !settingsValid) {
      setDraftState({ kind: "idle" });
      return;
    }
    setDraftState({ kind: "scheduled", retainedResult });
    const timer = window.setTimeout(() => {
      if (revisionRef.current !== revision) return;
      draftWorkerRef.current?.dispose();
      const draftWorker = new ConversionWorkerClient();
      draftWorkerRef.current = draftWorker;
      setDraftState({ kind: "running", retainedResult });
      void draftWorker.convertImage(
        image,
        conversionSettings,
        "draft",
        pmd85WorkerOptions,
      ).then((result) => {
        if (revisionRef.current === revision && draftWorkerRef.current === draftWorker) {
          setDraftState({ kind: "ready", result });
        }
      }).catch((error: unknown) => {
        if (revisionRef.current === revision && draftWorkerRef.current === draftWorker) {
          setDraftState({
            kind: "error",
            message: error instanceof Error ? error.message : "Unknown Draft error.",
            retainedResult,
          });
        }
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    image, settingsValid, framing, resampling, rotation, mirrorHorizontal,
    mirrorVertical, fillOffsetX, fillOffsetY, panOffsetX, panOffsetY, panEdgeMode,
    cropX, cropY, cropWidth, cropHeight,
    cropAspectRatio,
    brightness, contrast, saturation, hueShift, hslSaturation, lightness, colorize, gamma, smoothing, sharpening,
    background, borderColor, attributeHeight, attributeSmoothing, attributeHaloInfluence,
    attributeHaloHorizontal, attributeHaloVertical,
    screenFlickerSuppression,
    zxMixedAttributesOnly,
    paletteSelections, zxPaletteDefinition, dithering, amount, errorDiffusionRandomization,
    errorDiffusionLineSuppression,
    orderedMatrix, artisticPattern, selectedProfileId, targetModeId, attributeOptimizerId,
    ditherEngineId, qlMixedOptimizerId, structuredSettings,
    composer, customOrderedMatrices, customDiffusionKernels,
    pmd85PaletteCalibrationId, pmd85GapPolicy,
    workspaceMode, specsciiDocumentName,
  ]);

  return {
    amount,
    amountValid,
    availableExistingCharsetCount,
    cancelGifFrameSelection,
    charsetRangeEntriesValid,
    conversionSettings,
    cropHeight,
    cropSourceSize,
    cropValid,
    cropWidth,
    cropX,
    cropY,
    currentBenchmarkContextKey,
    existingActiveCharacterCount,
    existingCharsetChoiceValid,
    fillGeometry,
    importClipboardImage,
    importImage,
    importPmd85,
    importSelectedGifFrame,
    paletteValid,
    panMaximumX,
    panMaximumY,
    pmd85WorkerOptions,
    settingsValid,
  };
}
