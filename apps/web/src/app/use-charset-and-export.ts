import { effectiveCharsetSelection, invertCharsetSelection as invertSelection, toggleCharsetSelection } from "../charset-selection.js";
import { clampCharsetRange, loadSpecsciiFontAssets } from "../specscii-assets.js";
import { type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { exportSpecscii } from "../specscii.js";
import { scaleRgbaNearest } from "../export-image.js";
import { encodeRgbaPng } from "@retro-converter/image-codecs";
import { charsetViewerType } from "@retro-converter/zx-charset";
import { type ConversionSettings, DEFAULT_CONVERSION_SETTINGS, ditherMethodForEngine, type Pmd85TargetModeId, qlHardwareModesForTarget, type QlTargetModeId, renderZxFlashPreview, resolveZxPalette, type TargetModeId } from "@retro-converter/conversion-core";
import { assertValidQlScreen, encodeQlScreen, QL_SCREEN_HEIGHT, type QlMode, qlModeWidth } from "@retro-converter/sinclair-ql";
import { assertValidPmd85Screen, encodePmd85Screen, PMD85_COLORACE_CANONICAL_PAIRS, PMD85_NATIVE_ATTRIBUTE_MAPS, PMD85_SCREEN_HEIGHT, PMD85_SCREEN_WIDTH, PMD85_VISIBLE_BYTES, pmd85ForegroundCount } from "@retro-converter/pmd-85";
import { assertValidSoftwareScr, createBlankScreen, serializeScr, ZX_SCREEN_HEIGHT, ZX_SCREEN_WIDTH } from "@retro-converter/zx-spectrum";
import { resultContainsZxFlash, zxScreenContainsFlash } from "../preview-metrics.js";
import { mergeMonochromeRgba, mergeTemporalRgba } from "../monochrome-preview.js";
import { addGifBorder, encodeAnimatedGif } from "../animated-gif.js";
import { type WorkerConversionResult, type WorkerDecodedImage } from "../worker/client.js";
import { buildConversionMetadata, sanitizeArtifactBaseName, sha256Hex } from "../artifacts.js";
import { buildInspectionReport } from "../inspection.js";
import { type EmptyImageOptions } from "../workbench-menu-bar.js";
import { retargetHardwareModeSettings } from "../hardware-mode-settings.js";
import { resolveEnginePreferencesForTarget } from "../engine-preferences.js";
import { pmdHardwareModeForTarget, targetProducesMultipleFrames } from "../conversion-targets.js";
import { profileModeScreens } from "../profiles.js";
import { hexToRgb } from "../dithering-labels.js";
import { cloneNativeResultBitmap, createNativeResultBitmap, type NativeResultBitmap } from "../result-bitmap-editor.js";
import { renderQlMixedDisplayPreview } from "../ql-mixed-preview.js";
import { type SourceArtifactInfo } from "../app-types.js";
import { normalizeProjectName } from "../project-name.js";
import type { useRuntimeState } from "./use-runtime-state.js";
import type { useSettingsState } from "./use-settings-state.js";
import type { useWorkbenchState } from "./use-workbench-state.js";
import type { useResultEditing } from "./use-result-editing.js";
import type { useConversionSettings } from "./use-conversion-settings.js";
import type { useConversionActions } from "./use-conversion-actions.js";
import type { useEngineSettingsBenchmarks } from "./use-engine-settings-benchmarks.js";
import type { useEditorOperations } from "./use-editor-operations.js";
import type { useBitmapEditorPointer } from "./use-bitmap-editor-pointer.js";
import { downloadBytes } from "./engine-settings-benchmarks-helpers.js";

export function useCharsetAndExport(
  { applySettings, attributeHeight, availableExistingCharsetCount, bitmapEditorCurrentResultRef, bitmapEditorResultEdited, bitmapEditorResultQuality, bitmapEditorResultSourceRef, bitmapEditorRevertSource, borderColor, charsetAllowPolarity, charsetAllowTransforms, charsetBudget, charsetDistance, charsetEncoding, charsetGlyphRefs, charsetSelectionClickRef, charsetSelectionDragRef, charsetSelectionMode, charsetSource, charsetState, charsetStrategy, charsetTilesView, charsetVisualWeighting, conversionSettings, dirty, draftState, existingActiveCharacterCount, existingCharset, existingCharsetLength, existingCharsetLengthEntry, existingCharsetName, existingCharsetSelection, existingCharsetSelectionRef, existingCharsetStart, existingCharsetStartEntry, exportBorderColor, exportBorderEnabled, exportBorderWidth, exportZoomFactor, image, invalidateCharset, lastFinal, lastFinalCompletedAt, markCharsetSelectionChanged, originalImage, outputPreviewStage, paletteSelections, pendingNewEmptyImageRef, pmdSettingsForMode, profiles, projectFileBaseName, projectName, qlMixedDisplayResolution, resetResultEditorState, resultOrigin, selectedPresetId, selectedProfile, selectedProfileId, setBitmapEditorResultEdited, setBitmapEditorResultFrameIndex, setBitmapEditorResultOriginal, setBitmapEditorResultOriginalResult, setBitmapEditorResultQuality, setCharsetBudget, setCharsetEncoding, setCharsetSelectionMode, setCharsetSource, setCharsetTilesView, setDirty, setDraftState, setEmittedSourceCharsetIndices, setExistingCharset, setExistingCharsetLength, setExistingCharsetLengthEntry, setExistingCharsetName, setExistingCharsetSelection, setExistingCharsetStart, setExistingCharsetStartEntry, setExportError, setImage, setImageStatus, setLastFinal, setLastFinalCompletedAt, setOriginalImage, setProjectName, setProjectNameDraft, setProjectSaveDialogOpen, setResultEditorBuffer, setResultOrigin, setResultPreviewContent, setSelectedPresetId, setSelectedProfileId, setSelectedSourceCharsetTile, setSourceArtifact, setSourceFileName, setSourceFrameIndex, setSourcePreviewContent, setState, setTilemapStale, setWorkspaceMode, skipNextDraftAfterBitmapEditRef, sourceArtifact, sourceFrameIndex, sourceReplacementRevisionRef, specsciiAuthor, specsciiBorder, specsciiImageName, state, tileEditorUsageSort, tilemapStale, workspaceMode, zxPaletteDefinition }: Pick<ReturnType<typeof useRuntimeState>, "bitmapEditorCurrentResultRef" | "bitmapEditorResultEdited" | "bitmapEditorResultQuality" | "bitmapEditorResultSourceRef" | "bitmapEditorRevertSource" | "charsetGlyphRefs" | "charsetSelectionClickRef" | "charsetSelectionDragRef" | "charsetState" | "draftState" | "existingCharsetSelectionRef" | "lastFinal" | "setBitmapEditorResultEdited" | "setBitmapEditorResultFrameIndex" | "setBitmapEditorResultOriginal" | "setBitmapEditorResultOriginalResult" | "setBitmapEditorResultQuality" | "setDraftState" | "setLastFinal" | "setState" | "skipNextDraftAfterBitmapEditRef" | "state" | "tileEditorUsageSort"> &
    Pick<ReturnType<typeof useSettingsState>, "attributeHeight" | "borderColor" | "charsetAllowPolarity" | "charsetAllowTransforms" | "charsetBudget" | "charsetDistance" | "charsetEncoding" | "charsetSelectionMode" | "charsetSource" | "charsetStrategy" | "charsetTilesView" | "charsetVisualWeighting" | "dirty" | "existingCharset" | "existingCharsetLength" | "existingCharsetLengthEntry" | "existingCharsetName" | "existingCharsetSelection" | "existingCharsetStart" | "existingCharsetStartEntry" | "exportBorderColor" | "exportBorderEnabled" | "exportBorderWidth" | "exportZoomFactor" | "image" | "lastFinalCompletedAt" | "originalImage" | "paletteSelections" | "profiles" | "projectName" | "resultOrigin" | "selectedPresetId" | "selectedProfileId" | "setCharsetBudget" | "setCharsetEncoding" | "setCharsetSelectionMode" | "setCharsetSource" | "setCharsetTilesView" | "setDirty" | "setEmittedSourceCharsetIndices" | "setExistingCharset" | "setExistingCharsetLength" | "setExistingCharsetLengthEntry" | "setExistingCharsetName" | "setExistingCharsetSelection" | "setExistingCharsetStart" | "setExistingCharsetStartEntry" | "setExportError" | "setImage" | "setImageStatus" | "setLastFinalCompletedAt" | "setOriginalImage" | "setProjectName" | "setResultOrigin" | "setSelectedPresetId" | "setSelectedProfileId" | "setSelectedSourceCharsetTile" | "setSourceArtifact" | "setSourceFileName" | "setSourceFrameIndex" | "setTilemapStale" | "setWorkspaceMode" | "sourceArtifact" | "sourceFrameIndex" | "specsciiAuthor" | "specsciiBorder" | "specsciiImageName" | "tilemapStale" | "workspaceMode" | "zxPaletteDefinition"> &
    Pick<ReturnType<typeof useWorkbenchState>, "outputPreviewStage" | "pendingNewEmptyImageRef" | "qlMixedDisplayResolution" | "selectedProfile" | "setProjectNameDraft" | "setProjectSaveDialogOpen" | "setResultPreviewContent" | "setSourcePreviewContent" | "sourceReplacementRevisionRef"> &
    Pick<ReturnType<typeof useResultEditing>, "applySettings" | "resetResultEditorState" | "setResultEditorBuffer"> &
    Pick<ReturnType<typeof useConversionSettings>, "availableExistingCharsetCount" | "conversionSettings" | "existingActiveCharacterCount"> &
    Pick<ReturnType<typeof useConversionActions>, "pmdSettingsForMode"> &
    Pick<ReturnType<typeof useEngineSettingsBenchmarks>, "projectFileBaseName"> &
    Pick<ReturnType<typeof useEditorOperations>, "invalidateCharset"> &
    Pick<ReturnType<typeof useBitmapEditorPointer>, "markCharsetSelectionChanged">,
) {
  function currentCharsetSelectionIndices(count: number): number[] {
    const selection = existingCharsetSelectionRef.current;
    if (selection !== null) return effectiveCharsetSelection(selection, count);
    const range = clampCharsetRange(count, existingCharsetStart, existingCharsetLength);
    return Array.from({ length: range.length }, (_, index) => range.startIndex + index);
  }

  function toggleCharsetCharacter(characterIndex: number): void {
    if (charsetSource !== "existing" || existingCharset === null) return;
    markCharsetSelectionChanged(toggleCharsetSelection(
      currentCharsetSelectionIndices(existingCharset.length / 8),
      existingCharset.length / 8,
      characterIndex,
    ));
  }

  function paintCharsetCharacter(
    characterIndex: number,
    selecting: boolean,
  ): void {
    const drag = charsetSelectionDragRef.current;
    if (drag === null || drag.visited.has(characterIndex)) return;
    drag.visited.add(characterIndex);
    const selected = new Set(currentCharsetSelectionIndices((existingCharset?.length ?? 0) / 8));
    if (selecting) selected.add(characterIndex);
    else selected.delete(characterIndex);
    markCharsetSelectionChanged([...selected]);
  }

  function beginCharsetSelection(
    characterIndex: number,
    event: ReactPointerEvent<HTMLButtonElement>,
  ): void {
    if (charsetSource !== "existing" || existingCharset === null || charsetTilesView !== "source" || !charsetSelectionMode) return;
    const selected = new Set(currentCharsetSelectionIndices(existingCharset.length / 8));
    const selecting = !selected.has(characterIndex);
    charsetSelectionDragRef.current = {
      pointerId: event.pointerId,
      selecting,
      visited: new Set<number>(),
      characterIndex,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.focus();
  }

  function moveCharsetSelection(
    event: ReactPointerEvent<HTMLDivElement>,
  ): void {
    const drag = charsetSelectionDragRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-character-index]");
    const characterIndex = Number(target?.dataset.characterIndex);
    if (Number.isInteger(characterIndex)) {
      paintCharsetCharacter(characterIndex, drag.selecting);
    }
  }

  function clearPendingCharsetClick(characterIndex: number): void {
    const timer = charsetSelectionClickRef.current.get(characterIndex);
    if (timer !== undefined) window.clearTimeout(timer);
    charsetSelectionClickRef.current.delete(characterIndex);
  }

  function queueCharsetSelectionClick(characterIndex: number): void {
    clearPendingCharsetClick(characterIndex);
    const timer = window.setTimeout(() => {
      charsetSelectionClickRef.current.delete(characterIndex);
      toggleCharsetCharacter(characterIndex);
    }, 300);
    charsetSelectionClickRef.current.set(characterIndex, timer);
  }

  function endCharsetSelection(event: ReactPointerEvent): void {
    const drag = charsetSelectionDragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    if (drag.visited.size === 0) queueCharsetSelectionClick(drag.characterIndex);
    charsetSelectionDragRef.current = null;
  }

  function handleCharsetDoubleClick(characterIndex: number): void {
    clearPendingCharsetClick(characterIndex);
    toggleCharsetCharacter(characterIndex);
  }

  function clearCharsetSelection(): void {
    const count = Math.floor((existingCharset?.length ?? 0) / 8);
    // Null means there is no subset filter; conversion uses the full range.
    // Keeping an explicit all-indices array is equivalent for mapping, but it
    // leaves the UI/project in a "selection active" state after choosing All.
    existingCharsetSelectionRef.current = null;
    setExistingCharsetSelection(null);
    setCharsetTilesView("source");
    setExistingCharsetStart(0);
    setExistingCharsetLength(count);
    setExistingCharsetStartEntry("1");
    setExistingCharsetLengthEntry(String(count));
    if (count > 32) setCharsetEncoding("extended");
    invalidateCharset();
    setTilemapStale(true);
  }

  function invertCharsetSelection(): void {
    if (charsetSource !== "existing" || existingCharset === null) return;
    setCharsetTilesView("source");
    const count = Math.floor(existingCharset.length / 8);
    markCharsetSelectionChanged(invertSelection(
      currentCharsetSelectionIndices(count),
      count,
    ));
  }
  const showingSourceCharset = charsetSource === "existing" && existingCharset !== null && charsetTilesView === "source";
  const glyphCharset = showingSourceCharset
    ? existingCharset
    : charsetState.kind === "ready" ? charsetState.result.charset : null;
  const glyphCount = glyphCharset === null
    ? 0
    : Math.floor(glyphCharset.length / 8);
  const glyphDisplayIndices = Array.from({ length: glyphCount }, (_, index) => index);
  const tileUsage = charsetState.kind !== "ready"
    ? []
    : (() => {
        const counts = charsetState.result.assignments.reduce((result, assignment) => {
          result.set(assignment.characterIndex, (result.get(assignment.characterIndex) ?? 0) + 1);
          return result;
        }, new Map<number, number>());
        return Array.from({ length: charsetState.result.characterCount }, (_, characterIndex) => ({
          characterIndex,
          count: counts.get(characterIndex) ?? 0,
        })).sort((first, second) => second.count - first.count || first.characterIndex - second.characterIndex);
      })();
  const tileUsageCountByIndex = new Map(
    tileUsage.map(({ characterIndex, count }) => [characterIndex, count]),
  );
  const tileUsageAvailable = charsetState.kind === "ready" && !tilemapStale && !showingSourceCharset;
  if (tileEditorUsageSort && tileUsageAvailable) {
    glyphDisplayIndices.sort((left, right) =>
      (tileUsageCountByIndex.get(right) ?? 0) - (tileUsageCountByIndex.get(left) ?? 0) || left - right);
  }

  function handleCharsetGlyphKey(
    characterIndex: number,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ): void {
    if (event.key === "Delete") {
      event.preventDefault();
      clearCharsetSelection();
      return;
    }
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggleCharsetCharacter(characterIndex);
      return;
    }
    const delta = event.key === "ArrowLeft" ? -1
      : event.key === "ArrowRight" ? 1
        : event.key === "ArrowUp" ? -8
          : event.key === "ArrowDown" ? 8
            : 0;
    if (delta === 0) return;
    event.preventDefault();
    const displayIndex = glyphDisplayIndices.indexOf(characterIndex);
    if (displayIndex < 0) return;
    const next = glyphDisplayIndices[Math.max(0, Math.min(glyphDisplayIndices.length - 1, displayIndex + delta))];
    if (next !== undefined) charsetGlyphRefs.current[next]?.focus();
  }

  function commitCharsetStartEntry(): void {
    const requested = Number(existingCharsetStartEntry);
    if (
      !/^\d+$/.test(existingCharsetStartEntry) ||
      !Number.isInteger(requested)
    ) {
      setExistingCharsetStartEntry(String(existingCharsetStart + 1));
      return;
    }
    const range = clampCharsetRange(
      availableExistingCharsetCount,
      requested - 1,
      existingCharsetLength,
    );
    setExistingCharsetStart(range.startIndex);
    setExistingCharsetLength(range.length);
    setExistingCharsetStartEntry(String(range.startIndex + 1));
    setExistingCharsetLengthEntry(String(range.length));
    invalidateCharset();
    setTilemapStale(true);
  }

  function commitCharsetLengthEntry(): void {
    const requested = Number(existingCharsetLengthEntry);
    if (
      !/^\d+$/.test(existingCharsetLengthEntry) ||
      !Number.isInteger(requested)
    ) {
      setExistingCharsetLengthEntry(String(existingCharsetLength));
      return;
    }
    const range = clampCharsetRange(
      availableExistingCharsetCount,
      existingCharsetStart,
      requested,
    );
    setExistingCharsetLength(range.length);
    setExistingCharsetLengthEntry(String(range.length));
    if (range.length > 32) setCharsetEncoding("extended");
    invalidateCharset();
    setTilemapStale(true);
  }

  async function importExistingCharset(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length === 0 || bytes.length % 8 !== 0 || bytes.length > 256 * 8) {
        throw new RangeError("Expected 1–256 characters stored as eight bytes each.");
      }
      setExistingCharset(Uint8Array.from(bytes));
      setExistingCharsetName(file.name);
      setCharsetTilesView("source");
      setCharsetSelectionMode(false);
      setSelectedSourceCharsetTile(null);
      setEmittedSourceCharsetIndices(null);
      const characterCount = bytes.length / 8;
      setExistingCharsetStart(0);
      setExistingCharsetLength(characterCount);
      setExistingCharsetStartEntry("1");
      setExistingCharsetLengthEntry(String(characterCount));
      existingCharsetSelectionRef.current = null;
      setExistingCharsetSelection(null);
      setCharsetBudget(characterCount);
      if (characterCount > 32) setCharsetEncoding("extended");
      setCharsetSource("existing");
      invalidateCharset();
      setTilemapStale(true);
      setExportError(null);
    } catch (error: unknown) {
      setExportError(
        `Charset import rejected: ${error instanceof Error ? error.message : "Invalid charset."}`,
      );
    }
  }

  function exportCharsetArtifact(): void {
    if (charsetState.kind !== "ready") return;
    downloadBytes(
      charsetState.result.artifact,
      "application/octet-stream",
      `${projectFileBaseName()}-tilemap.bin`,
    );
  }

  async function exportSpecsciiFile(): Promise<void> {
    if (charsetState.kind !== "ready" || tilemapStale) return;
    try {
      const fontAssets = await loadSpecsciiFontAssets();
      const exported = exportSpecscii({
        assignments: charsetState.result.assignments,
        attributes: charsetState.result.attributes,
        charset: charsetState.result.charset,
        specsciiCharset: fontAssets.charset,
        border: specsciiBorder,
        author: specsciiAuthor,
        imageName: specsciiImageName,
      });
      downloadBytes(exported.bytes, "application/json", `${projectFileBaseName()}-specscii.json`);
      setExportError(null);
      setImageStatus(exported.approximatedCells === 0
        ? "Exported Specscii screen · all 768 glyphs matched the built-in symbol set."
        : `Exported Specscii screen · ${exported.approximatedCells} cells use the closest built-in Specscii glyph.`);
    } catch (error: unknown) {
      setExportError(`Specscii export blocked: ${error instanceof Error ? error.message : "Unsupported tilemap."}`);
    }
  }

  function exportFinalCharset(): void {
    if (charsetState.kind !== "ready" || tilemapStale) return;
    downloadBytes(
      charsetState.result.charset,
      "application/octet-stream",
      `${projectFileBaseName()}-charset.chr`,
    );
  }

  function exportCharsetPreview(): void {
    if (charsetState.kind !== "ready") return;
    const preview = scaleRgbaNearest(charsetState.result.previewRgba, 256, 192, exportZoomFactor);
    const png = encodeRgbaPng(preview.rgba, preview.width, preview.height);
    downloadBytes(
      png,
      "image/png",
      `${projectFileBaseName()}-charset-preview.png`,
    );
  }

  function exportCharsetDiagnostics(): void {
    if (charsetState.kind !== "ready") return;
    const bytes = new TextEncoder().encode(`${JSON.stringify({
      source: charsetSource,
      encoding: charsetState.result.encoding,
      transformations: charsetState.result.transformations,
      viewer_type: charsetViewerType(
        charsetState.result.encoding,
        charsetState.result.transformations,
      ),
      character_count: charsetState.result.characterCount,
      existing_charset: existingCharsetName,
      existing_charset_range: charsetSource === "existing"
        ? {
            start_index: existingCharsetStart,
            length: existingCharsetLength,
          }
        : null,
      existing_charset_selection: existingCharsetSelection,
      diagnostics: charsetState.result.diagnostics,
    }, null, 2)}\n`);
    downloadBytes(
      bytes,
      "application/json",
      `${projectFileBaseName()}-charset-diagnostics.json`,
    );
  }

  function exportScr() {
    if (state.kind !== "ready" || lastFinal === null || sourceArtifact === null) return;
    try {
      if (lastFinal.platformId === "sinclair-ql") {
        const hardwareModes = qlHardwareModesForTarget(
          lastFinal.modeId as QlTargetModeId,
        );
        for (const [index, frame] of lastFinal.frames.entries()) {
          assertValidQlScreen(
            frame.encoded,
            hardwareModes[index]!,
          );
          downloadBytes(
            frame.encoded,
            "application/octet-stream",
            `${projectFileBaseName()}-screen-${index + 1}${
              lastFinal.modeId === "mode8-mode4-mixed-512x256"
                ? index === 0 ? "-mode8" : "-mode4"
                : ""
            }.scr`,
          );
        }
      } else if (lastFinal.platformId === "pmd-85") {
        assertValidPmd85Screen(lastFinal.artifact);
        downloadBytes(lastFinal.artifact, "application/octet-stream", `${projectFileBaseName()}.bin`);
      } else {
        for (const [index, frame] of lastFinal.frames.entries()) {
          assertValidSoftwareScr(frame.encoded, attributeHeight);
          downloadBytes(
            frame.encoded,
            "application/octet-stream",
            lastFinal.frames.length > 1
              ? `${projectFileBaseName()}-screen-${index + 1}.scr`
              : `${projectFileBaseName()}.scr`,
          );
        }
      }
      setExportError(null);
    } catch (error: unknown) {
      setExportError(`Hardware export blocked: ${error instanceof Error ? error.message : "Validation failed."}`);
    }
  }

  function exportPreviewPng() {
    if (state.kind !== "ready" || lastFinal === null || sourceArtifact === null) return;
    try {
      const spatial = lastFinal.verticalSpatialDiagnostics;
      const physicalFrame = lastFinal.frames[0];
      const preview = spatial !== undefined && physicalFrame !== undefined
        ? {
            rgba: physicalFrame.previewRgba,
            width: lastFinal.width,
            height: lastFinal.height,
          }
        : {
            rgba: lastFinal.mergedPreviewRgba,
            width: lastFinal.width,
            height: lastFinal.height,
          };
      const scaledPreview = scaleRgbaNearest(preview.rgba, preview.width, preview.height, exportZoomFactor);
      const png = encodeRgbaPng(scaledPreview.rgba, scaledPreview.width, scaledPreview.height);
      downloadBytes(
        png,
        "image/png",
        `${projectFileBaseName()}${
          lastFinal.frames.length > 1
            ? "-merged"
            : ""
        }-preview.png`,
      );
      setExportError(null);
    } catch (error: unknown) {
      setExportError(`Preview export blocked: ${error instanceof Error ? error.message : "Encoding failed."}`);
    }
  }

  function exportAnimatedFlashGif(): void {
    const tilemapResult = workspaceMode === "tilemap" && charsetState.kind === "ready" && !tilemapStale
      ? charsetState.result
      : null;
    if (state.kind !== "ready" || sourceArtifact === null ||
        (workspaceMode === "tilemap" ? tilemapResult === null : lastFinal === null)) return;
    try {
      const hasFlash = tilemapResult !== null
        ? zxScreenContainsFlash(tilemapResult.decodedScr)
        : resultContainsZxFlash(lastFinal);
      const previewWidth = tilemapResult === null ? lastFinal!.width : 256;
      const previewHeight = tilemapResult === null ? lastFinal!.height : 192;
      const previewFrames = tilemapResult !== null
        ? hasFlash
          ? [false, true].map((invertedPhase) =>
              renderZxFlashPreview(tilemapResult.decodedScr, 8, invertedPhase, resolveZxPalette(zxPaletteDefinition)))
          : [tilemapResult.previewRgba]
        : hasFlash && lastFinal!.platformId === "zx-spectrum" &&
            lastFinal!.attributeHeight !== null
          ? [false, true].map((invertedPhase) => {
              const framePreviews = lastFinal!.frames.map((frame) =>
                renderZxFlashPreview(frame.encoded, lastFinal!.attributeHeight!, invertedPhase, resolveZxPalette(zxPaletteDefinition)));
              if (lastFinal!.modeId === "zx48-mixed-256x192" && framePreviews.length >= 2) {
                return mergeTemporalRgba(framePreviews[0]!, framePreviews[1]!);
              }
              return framePreviews[0]!;
            })
          : [lastFinal!.mergedPreviewRgba];
      const gifFrames = previewFrames.map((rgba) => {
        const frame = { rgba, width: previewWidth, height: previewHeight };
        const bordered = exportBorderEnabled
          ? addGifBorder(frame, {
              width: exportBorderWidth,
              color: [exportBorderColor.r, exportBorderColor.g, exportBorderColor.b],
            })
          : frame;
        return scaleRgbaNearest(bordered.rgba, bordered.width, bordered.height, exportZoomFactor);
      });
      const gif = encodeAnimatedGif(gifFrames, 50);
      downloadBytes(
        gif,
        "image/gif",
        `${projectFileBaseName()}${hasFlash ? "-flashing" : ""}-preview.gif`,
      );
      setExportError(null);
    } catch (error: unknown) {
      setExportError(`GIF export blocked: ${error instanceof Error ? error.message : "GIF encoding failed."}`);
    }
  }

  async function createCurrentMetadataJson(options: {
    readonly result?: WorkerConversionResult;
    readonly resultQuality?: "Draft" | "High";
    readonly allowDraft?: boolean;
  } = {}): Promise<Uint8Array> {
    const result = options.result ?? lastFinal;
    const resultQuality = options.resultQuality ?? "High";
    const draftResultIsCurrent = draftState.kind === "ready" && result === draftState.result;
    const draftResultAllowed = options.allowDraft === true && resultQuality === "Draft" &&
      (draftResultIsCurrent || (
        bitmapEditorResultEdited &&
        result === lastFinal &&
        state.kind === "ready"
      ));
    if (
      result === null || sourceArtifact === null || image === null ||
      (state.kind !== "ready" && !draftResultAllowed) ||
      (lastFinalCompletedAt === null && !draftResultAllowed)
    ) throw new Error("A current completed High result is required.");
    if (result.platformId === "zx-spectrum") {
      for (const frame of result.frames) {
        assertValidSoftwareScr(frame.encoded, result.attributeHeight ?? attributeHeight);
      }
    } else if (result.platformId === "sinclair-ql") {
      const hardwareModes = qlHardwareModesForTarget(
        result.modeId as QlTargetModeId,
      );
      for (const [index, frame] of result.frames.entries()) {
        assertValidQlScreen(
          frame.encoded,
          hardwareModes[index]!,
        );
      }
    } else {
      assertValidPmd85Screen(result.artifact);
    }
    const metadata = await buildConversionMetadata({
      sourceSha256: sourceArtifact.sha256,
      sourceFormat: (originalImage ?? image).format,
      sourceWidth: (originalImage ?? image).width,
      sourceHeight: (originalImage ?? image).height,
      settings: conversionSettings,
      scr: result.scr,
      previewRgba: result.mergedPreviewRgba,
      frames: result.frames.map((frame) => frame.encoded),
      width: result.width,
      height: result.height,
      score: result.score,
      resultQuality,
      ...(result.structuredDiagnostics === undefined
        ? {}
        : { structuredDiagnostics: result.structuredDiagnostics }),
      ...(result.verticalSpatialDiagnostics === undefined
        ? {}
        : { verticalSpatialDiagnostics: result.verticalSpatialDiagnostics }),
      completedAtUtc: lastFinalCompletedAt ?? new Date().toISOString(),
      profile: selectedProfile,
    });
    return new TextEncoder().encode(`${JSON.stringify(metadata, null, 2)}\n`);
  }

  async function exportMetadata() {
    if (sourceArtifact === null) return;
    try {
      const json = await createCurrentMetadataJson();
      downloadBytes(json, "application/json", `${projectFileBaseName()}-metadata.json`);
      setExportError(null);
    } catch (error: unknown) {
      setExportError(`Metadata export blocked: ${error instanceof Error ? error.message : "Generation failed."}`);
    }
  }

  function exportInspectionReport() {
    if (state.kind !== "ready" || lastFinal === null || sourceArtifact === null) return;
    try {
      const frameIndex = outputPreviewStage === "screen-2" ? 1 : 0;
      const encoded = lastFinal.frames[frameIndex]?.encoded ??
        lastFinal.frames[0]?.encoded;
      if (encoded === undefined) throw new Error("No ZX frame is available.");
      const selection = paletteSelections[frameIndex] ?? paletteSelections[0]!;
      const report = {
        ...buildInspectionReport(
          encoded,
          lastFinal.attributeHeight ?? attributeHeight,
          selection.enabledColorIds,
        ),
        bright_mode: selection.brightMode,
        border_color: borderColor,
      };
      downloadBytes(
        new TextEncoder().encode(`${JSON.stringify(report, null, 2)}\n`),
        "application/json",
        `${projectFileBaseName()}-inspection.json`,
      );
      setExportError(null);
    } catch (error: unknown) {
      setExportError(`Inspection export blocked: ${error instanceof Error ? error.message : "Generation failed."}`);
    }
  }

  async function createEmptyImage(options: EmptyImageOptions): Promise<void> {
    if (dirty && !window.confirm("Replace the current unsaved work with a new empty image?")) return;
    const replacementRevision = ++sourceReplacementRevisionRef.current;
    pendingNewEmptyImageRef.current = false;
    skipNextDraftAfterBitmapEditRef.current = false;
    const modeProfile = profiles.find((profile) =>
      profile.platform_id === options.platformId && profile.palette.modes[options.modeId] !== undefined && profile.id === selectedProfileId,
    ) ?? profiles.find((profile) =>
      profile.platform_id === options.platformId && profile.palette.modes[options.modeId] !== undefined,
    );
    if (modeProfile === undefined) {
      setExportError("No installed profile supports that platform and display mode.");
      return;
    }
    const preset = modeProfile.presets.find(({ id }) => modeProfile.id === selectedProfileId && id === selectedPresetId)
      ?? modeProfile.presets[0];
    if (preset === undefined) return;

    try {
      const modePalette = modeProfile.palette.modes[options.modeId];
      const selections = Array.from({ length: modePalette?.screen_count ?? 1 }, (_, screenIndex) => ({
        screenIndex,
        enabledColorIds: [...(modePalette?.screens[screenIndex]?.colors ?? modePalette?.screens[0]?.colors ?? []).map(({ id }) => id)],
        ...(options.platformId === "zx-spectrum" ? { brightMode: "on" as const } : {}),
      }));
      const baseSettings = options.platformId === "pmd-85"
        ? pmdSettingsForMode(modeProfile, preset.settings, options.modeId as Pmd85TargetModeId)
        : retargetHardwareModeSettings(preset.settings, {
            profileId: modeProfile.id,
            platformId: options.platformId,
            modeId: options.modeId as TargetModeId,
            attributeHeight: options.platformId === "zx-spectrum" ? 8 : preset.settings.attributeHeight,
            paletteSelections: selections,
          });
      const engines = resolveEnginePreferencesForTarget(
        { platformId: options.platformId, modeId: options.modeId as TargetModeId },
        { attributeOptimizerId: baseSettings.attributeOptimizerId, ditherEngineId: baseSettings.ditherEngineId },
        baseSettings.dithering,
      );
      const settings: ConversionSettings = {
        ...baseSettings,
        ...engines,
        dithering: ditherMethodForEngine(engines.ditherEngineId),
        ...(options.platformId === "zx-spectrum" ? { attributeHeight: 8 } : {}),
      };
      const pmdMode = options.platformId === "pmd-85"
        ? pmdHardwareModeForTarget(options.modeId as Pmd85TargetModeId)
        : null;
      const pmdColors = pmdMode === null ? [] : profileModeScreens(
        modeProfile,
        options.modeId,
        settings.pmd85.paletteCalibrationId,
      )[0]?.colors.map((color) => hexToRgb(color.normal)) ?? [];
      const pmdColorIndex = Math.max(0, Math.min(pmd85ForegroundCount(pmdMode ?? "pmd85-2-rgb") - 1, options.colorIndex));
      const pmdAttribute = pmdMode === null ? 0 : pmdMode === "pmd85-colorace"
        ? PMD85_COLORACE_CANONICAL_PAIRS[pmdColorIndex]?.[0] ?? 0
        : Math.max(0, PMD85_NATIVE_ATTRIBUTE_MAPS[pmdMode].findIndex((index) => index === pmdColorIndex));
      const nativeModes: readonly string[] = options.platformId === "sinclair-ql"
        ? qlHardwareModesForTarget(options.modeId as QlTargetModeId)
        : options.platformId === "pmd-85"
          ? options.modeId.includes("vertical-spatial") ? [pmdMode!, pmdMode!] : [pmdMode!]
          : targetProducesMultipleFrames(options.platformId, options.modeId as TargetModeId)
            ? [options.modeId, options.modeId]
            : [options.modeId];
      const resultFrames: WorkerConversionResult["frames"][number][] = [];
      const nativeBitmaps: NativeResultBitmap[] = [];
      for (const hardwareModeId of nativeModes) {
        let encoded: Uint8Array;
        let nativeWidth: number;
        let nativeHeight: number;
        let frameAttributeHeight: 1 | 2 | 4 | 8 | null;
        if (options.platformId === "zx-spectrum") {
          const attribute = options.ink | (options.paper << 3) | (options.bright ? 0x40 : 0) | (options.flash ? 0x80 : 0);
          encoded = serializeScr(createBlankScreen(attribute));
          nativeWidth = ZX_SCREEN_WIDTH;
          nativeHeight = ZX_SCREEN_HEIGHT;
          frameAttributeHeight = 8;
        } else if (options.platformId === "sinclair-ql") {
          const qlMode = hardwareModeId as QlMode;
          nativeWidth = qlModeWidth(qlMode);
          nativeHeight = QL_SCREEN_HEIGHT;
          frameAttributeHeight = null;
          const indices = new Uint8Array(nativeWidth * nativeHeight);
          indices.fill(Math.max(0, Math.min(qlMode === "mode8-256x256" ? 7 : 3, options.colorIndex)));
          encoded = encodeQlScreen(indices, qlMode);
        } else {
          nativeWidth = PMD85_SCREEN_WIDTH;
          nativeHeight = PMD85_SCREEN_HEIGHT;
          frameAttributeHeight = pmdMode === "pmd85-colorace" ? 2 : 1;
          const attributes = new Uint8Array(PMD85_VISIBLE_BYTES);
          if (pmdMode === "pmd85-colorace") {
            const pair = PMD85_COLORACE_CANONICAL_PAIRS[pmdColorIndex] ?? [0, 0];
            for (let y = 0; y < PMD85_SCREEN_HEIGHT; y += 1) attributes.fill(pair[y & 1] ?? 0, y * 48, (y + 1) * 48);
          } else {
            attributes.fill(pmdAttribute);
          }
          encoded = encodePmd85Screen(new Uint8Array(PMD85_VISIBLE_BYTES), attributes, "zero");
        }
        const nativeBitmap = createNativeResultBitmap({
          platformId: options.platformId,
          modeId: options.modeId,
          hardwareModeId,
          encoded,
          nativeWidth,
          nativeHeight,
          attributeHeight: frameAttributeHeight,
          ...(options.platformId === "zx-spectrum" ? { zxPalette: resolveZxPalette(settings.zxPalette ?? DEFAULT_CONVERSION_SETTINGS.zxPalette) } : {}),
          ...(options.platformId === "pmd-85" ? { pmd85ForegroundPalette: pmdColors, pmd85GapPolicy: "zero" as const } : {}),
        });
        nativeBitmaps.push(nativeBitmap);
        resultFrames.push({
          hardwareModeId,
          nativeWidth,
          nativeHeight,
          nativePixelAspectRatio: modeProfile.preview.pixel_aspect_ratio,
          encoded: nativeBitmap.encoded,
          paletteIndices: nativeBitmap.paletteIndices,
          previewRgba: nativeBitmap.rgba,
        });
      }
      const resultWidth = options.platformId === "sinclair-ql" && options.modeId === "mode8-mode4-mixed-512x256"
        ? 512
        : resultFrames[0]?.nativeWidth ?? 0;
      const resultHeight = resultFrames[0]?.nativeHeight ?? 0;
      const firstPreview = resultFrames[0]?.previewRgba ?? new Uint8Array();
      const merged = options.platformId === "sinclair-ql" && options.modeId === "mode8-mode4-mixed-512x256" && resultFrames[1] !== undefined
        ? renderQlMixedDisplayPreview(firstPreview, resultFrames[1].previewRgba, resultWidth, qlMixedDisplayResolution)
        : options.platformId === "zx-spectrum" && options.modeId === "zx48-mixed-256x192" && resultFrames[1] !== undefined
          ? mergeTemporalRgba(firstPreview, resultFrames[1].previewRgba)
          : options.platformId === "zx-spectrum" && resultFrames.length > 1
            ? mergeMonochromeRgba(firstPreview, resultFrames[1]!.previewRgba)
            : firstPreview.slice();
      const result: WorkerConversionResult = {
        artifact: resultFrames[0]?.encoded.slice() ?? new Uint8Array(),
        scr: resultFrames[0]?.encoded.slice() ?? new Uint8Array(),
        platformId: options.platformId,
        modeId: options.modeId as TargetModeId,
        width: resultWidth,
        height: resultHeight,
        pixelAspectRatio: modeProfile.preview.pixel_aspect_ratio,
        attributeOptimizerId: settings.attributeOptimizerId,
        ditherEngineId: settings.ditherEngineId,
        paletteSelections: settings.paletteSelections,
        frames: resultFrames,
        sourcePreviewRgba: merged.slice(),
        preConstraintPreviewRgba: merged.slice(),
        mergedPreviewRgba: merged,
        previewRgba: merged.slice(),
        score: 0,
        attributeHeight: options.platformId === "zx-spectrum" ? 8 : options.platformId === "pmd-85" ? (pmdMode === "pmd85-colorace" ? 2 : 1) : null,
      };
      const pngBytes = encodeRgbaPng(merged, resultWidth, resultHeight);
      const blankImage: WorkerDecodedImage = { format: "png", width: resultWidth, height: resultHeight, rgba: merged.slice() };
      const blankArtifact: SourceArtifactInfo = { sha256: await sha256Hex(pngBytes), baseName: "empty-image", bytes: pngBytes };
      if (replacementRevision !== sourceReplacementRevisionRef.current) return;
      // New native screens already have a complete result. The source/settings
      // lifecycle would otherwise run a delayed Draft conversion of the PNG
      // backing image and replace the screen bitmap/attributes in the editor.
      skipNextDraftAfterBitmapEditRef.current = true;
      pendingNewEmptyImageRef.current = true;
      setSelectedProfileId(modeProfile.id);
      setSelectedPresetId(preset.id);
      setWorkspaceMode("palette");
      applySettings(settings, null);
      setSourcePreviewContent("source-image");
      setResultPreviewContent("bitmap-editor");
      setImage(blankImage);
      setOriginalImage({ ...blankImage, rgba: blankImage.rgba.slice() });
      setSourceArtifact(blankArtifact);
      setSourceFileName("New empty image");
      setProjectName("Untitled image");
      setSourceFrameIndex(0);
      setLastFinal(result);
      setLastFinalCompletedAt(new Date().toISOString());
      setBitmapEditorResultQuality("High");
      setResultOrigin("direct-import");
      setState({ kind: "ready", result });
      setDraftState({ kind: "idle" });
      setDirty(true);
      setImageStatus(`Created empty ${options.platformId} image · ${options.modeId} · ready to edit or save.`);
      setExportError(null);
      resetResultEditorState();
      const nativeBitmap = nativeBitmaps[0] ?? null;
      bitmapEditorResultSourceRef.current = result;
      bitmapEditorCurrentResultRef.current = result;
      setResultEditorBuffer(nativeBitmap);
      setBitmapEditorResultOriginal(nativeBitmap === null ? null : cloneNativeResultBitmap(nativeBitmap));
      setBitmapEditorResultOriginalResult(result);
      setBitmapEditorResultEdited(false);
      setBitmapEditorResultQuality("High");
      setBitmapEditorResultFrameIndex(0);
    } catch (error) {
      setExportError(`Could not create empty image: ${error instanceof Error ? error.message : "Invalid display settings."}`);
    }
  }

  function openProjectSaveDialog(): void {
    setProjectNameDraft(projectName || sourceArtifact?.baseName || "Untitled project");
    setProjectSaveDialogOpen(true);
  }

  async function exportProject(requestedProjectName: string): Promise<void> {
    const quickResult = workspaceMode === "palette" && draftState.kind === "ready"
      ? draftState.result
      : null;
    const projectResult = bitmapEditorResultEdited ? lastFinal : quickResult ?? lastFinal;
    const resultQuality = bitmapEditorResultEdited
      // If there is no High completion timestamp, this edited result came
      // from a Draft (or has no provable High provenance). The user's edit
      // explicitly accepts those pixels as the project result, but must not
      // relabel them as a High conversion.
      ? lastFinalCompletedAt === null ? "Draft" : bitmapEditorResultQuality
      : quickResult !== null ? "Draft" : "High";
    if (projectResult === null || sourceArtifact === null || image === null) return;
    try {
      if (bitmapEditorRevertSource !== null && originalImage !== null &&
          (image.width !== originalImage.width || image.height !== originalImage.height)) {
        throw new Error(
          "PROJECT_WORKING_SOURCE_INVALID: result-sized bitmap edits cannot be saved as a working source. Edit the source image or revert the result edit first.",
        );
      }
      const metadataJson = await createCurrentMetadataJson({
        result: projectResult,
        resultQuality,
        allowDraft: true,
      });
      const spatialPreview = projectResult.verticalSpatialDiagnostics;
      const previewPng = encodeRgbaPng(
        spatialPreview?.analyticPreviewRgba ?? projectResult.mergedPreviewRgba,
        spatialPreview?.logicalWidth ?? projectResult.width,
        spatialPreview?.logicalHeight ?? projectResult.height,
      );
      const project = await (await import("../projects.js")).createCompletedProject({
        sourceBytes: sourceArtifact.bytes,
        sourceFormat: (originalImage ?? image).format,
        sourceFrameIndex,
        resultOrigin,
        settings: conversionSettings,
        scr: projectResult.scr,
        frames: projectResult.frames.map((frame) => frame.encoded),
        previewPng,
        metadataJson,
        profile: selectedProfile,
        projectName: normalizeProjectName(requestedProjectName),
        resultQuality,
        resultEdited: bitmapEditorResultEdited,
        ...(bitmapEditorRevertSource === null || image === null
          ? {}
          : {
              workingSourcePng: encodeRgbaPng(image.rgba, image.width, image.height),
            }),
        workspaceMode,
        ...(workspaceMode === "tilemap" && charsetState.kind === "ready"
          ? {
              tilemap: {
                settings: {
                  source: charsetSource,
                  ...(charsetSource === "existing"
                    ? {
                        existingCharsetRange: {
                          startIndex: existingCharsetStart,
                          length: existingCharsetLength,
                        },
                        ...(existingCharsetSelection === null
                          ? {}
                          : {
                              existingCharsetSelection: {
                                indices: existingCharsetSelection,
                              },
                            }),
                      }
                    : {}),
                  characterBudget: charsetSource === "existing"
                    ? existingActiveCharacterCount
                    : charsetBudget,
                  encoding: charsetEncoding,
                  allowTransforms: charsetAllowTransforms,
                  allowPolarity: charsetAllowPolarity,
                  derivedStrategy: charsetStrategy,
                  distanceMetric:
                      charsetStrategy === "image-similarity-v2" ||
                      charsetStrategy === "image-similarity-v3" ||
                      charsetStrategy === "image-similarity-v4" ||
                      charsetStrategy === "image-similarity-v5"
                    ? charsetStrategy
                    : charsetDistance,
                  visualWeighting: charsetVisualWeighting,
                  swapRefinementPasses:
                    charsetStrategy === "image-similarity-v2" ||
                    charsetStrategy === "image-similarity-v3" ||
                    charsetStrategy === "image-similarity-v4" ||
                    charsetStrategy === "image-similarity-v5"
                      ? 4
                      : charsetStrategy === "best-coverage" ? 1 : 0,
                },
                artifact: charsetState.result.artifact,
                previewPng: encodeRgbaPng(
                  charsetState.result.previewRgba,
                  256,
                  192,
                ),
                diagnostics: charsetState.result.diagnostics,
                assignments: charsetState.result.assignments,
                charset: charsetState.result.charset,
                sourceCharset: charsetSource === "existing" &&
                    existingCharset !== null
                  ? existingCharset
                  : charsetState.result.charset,
              },
            }
          : {}),
      });
      const savedProjectName = normalizeProjectName(requestedProjectName);
      downloadBytes(project, "application/zip", `${sanitizeArtifactBaseName(savedProjectName)}.rccproject`);
      setProjectName(savedProjectName);
      setProjectSaveDialogOpen(false);
      setDirty(false);
      setExportError(null);
    } catch (error: unknown) {
      setExportError(`Project export blocked: ${error instanceof Error ? error.message : "Generation failed."}`);
    }
  }

  return {
    beginCharsetSelection,
    clearCharsetSelection,
    commitCharsetLengthEntry,
    commitCharsetStartEntry,
    createEmptyImage,
    endCharsetSelection,
    exportAnimatedFlashGif,
    exportCharsetArtifact,
    exportCharsetDiagnostics,
    exportCharsetPreview,
    exportFinalCharset,
    exportInspectionReport,
    exportMetadata,
    exportPreviewPng,
    exportProject,
    exportScr,
    exportSpecsciiFile,
    glyphCharset,
    glyphCount,
    glyphDisplayIndices,
    handleCharsetDoubleClick,
    handleCharsetGlyphKey,
    importExistingCharset,
    invertCharsetSelection,
    moveCharsetSelection,
    openProjectSaveDialog,
    showingSourceCharset,
    tileUsage,
    tileUsageAvailable,
    tileUsageCountByIndex,
    toggleCharsetCharacter,
  };
}
