import { loadSpecsciiFontAssets, rebuildCharsetResult } from "../specscii-assets.js";
import { importSpecscii } from "../specscii.js";
import { appendBlankTile, applyTileEdit, type CharsetEncoding, decodeCharsetArtifact, encodeCharsetArtifact, renderCharsetPreview, replaceTileInCharset, type TileEditOperation } from "@retro-converter/zx-charset";
import { ConversionWorkerClient, type WorkerCharsetResult, type WorkerConversionResult } from "../worker/client.js";
import { normalizeProjectName } from "../project-name.js";
import { sanitizeArtifactBaseName } from "../artifacts.js";
import { BUILT_IN_PROFILE_ID, BUILT_IN_PROFILES, parseImportedProfile, saveStoredProfiles } from "../profiles.js";
import { allCharsetIndices } from "../charset-selection.js";
import { swapTilemapInkPaper, type TileTransformToggle, toggleTileTransform } from "../tilemap-editor.js";
import { type BitmapEditorClipboard, type UnifiedTileEditorContext } from "../app-types.js";
import { type PointerEvent as ReactPointerEvent } from "react";
import { applyBitmapCellEdit, type BitmapCell, type BitmapCellEditOperation } from "../bitmap-editor.js";
import { draftPreviewResult } from "../draft-preview-state.js";
import { ZX_BITMAP_BYTES, zxBitmapOffset } from "@retro-converter/zx-spectrum";
import { ORDERED_MATRICES, type OrderedMatrix, type OrderedMatrixId, renderAttributeFrameRgba, resolveZxPalette } from "@retro-converter/conversion-core";
import { unpackZxBitmap } from "../conversion-targets.js";
import { type BitmapEditorBuffer } from "../full-bitmap-editor.js";
import { cloneNativeResultBitmap, composeNativeResultRegion, createNativeResultBitmap, type NativeResultBitmap } from "../result-bitmap-editor.js";
import { type BitmapRegionSelection } from "../bitmap-editor-selection.js";
import { applyZxAttributeSelection, readZxAttributeCell, type ZxAttributeSelection } from "../bitmap-attribute-cell-editor.js";
import type { useRuntimeState } from "./use-runtime-state.js";
import type { useSettingsState } from "./use-settings-state.js";
import type { useWorkbenchState } from "./use-workbench-state.js";
import type { useResultEditing } from "./use-result-editing.js";
import type { useConversionActions } from "./use-conversion-actions.js";
import type { usePreviewInspection } from "./use-preview-inspection.js";
import type { useEngineSettingsBenchmarks } from "./use-engine-settings-benchmarks.js";
import { snapshotTileEditor } from "./preview-inspection-helpers.js";
import { bitmapEditorPixelFromEvent, tileEditorPixelFromEvent } from "./editor-operations-helpers.js";

export function useEditorOperations(
  { applySettings, attributeHeight, bitmapEditorBrightPolicy, bitmapEditorCell, bitmapEditorClipboard, bitmapEditorCurrentResultRef, bitmapEditorEncodedRef, bitmapEditorFlashPolicy, bitmapEditorFullPointerRef, bitmapEditorInkColor, bitmapEditorOperation, bitmapEditorOriginalResult, bitmapEditorPaperColor, bitmapEditorPasteAttributes, bitmapEditorPasteMode, bitmapEditorPastePixels, bitmapEditorPointerRef, bitmapEditorRedo, bitmapEditorRegionSelection, bitmapEditorResultBufferRef, bitmapEditorResultEdited, bitmapEditorResultFrameIndex, bitmapEditorResultOriginal, bitmapEditorResultOriginalResult, bitmapEditorResultPaletteIndex, bitmapEditorResultQuality, bitmapEditorSelection, bitmapEditorSelectionResolution, bitmapEditorStipplePattern, bitmapEditorUndo, charsetEncoding, charsetGlyphRefs, charsetSource, charsetState, charsetWorkerRef, commitTileEditorResult, customOrderedMatrices, draftState, draftWorkerRef, existingCharsetSelectionRef, finalJobRef, finalRunningRef, image, initializeResultEditor, initializeTileEditor, lastFinal, lastFinalRevisionRef, profiles, pushTileEditorHistory, resultFrameInput, resultWithEditedFrame, revisionRef, selectProfile, selectedProfileId, setBitmapEditorCell, setBitmapEditorClipboard, setBitmapEditorOriginalResult, setBitmapEditorRedo, setBitmapEditorRegionSelection, setBitmapEditorResultEdited, setBitmapEditorResultOriginal, setBitmapEditorResultOriginalResult, setBitmapEditorResultQuality, setBitmapEditorResultRedo, setBitmapEditorResultUndo, setBitmapEditorUndo, setCharsetBudget, setCharsetEncoding, setCharsetSelectionMode, setCharsetSource, setCharsetState, setCharsetTilesView, setDirty, setDraftState, setEmittedSourceCharsetIndices, setExistingCharset, setExistingCharsetLength, setExistingCharsetLengthEntry, setExistingCharsetName, setExistingCharsetSelection, setExistingCharsetStart, setExistingCharsetStartEntry, setExportError, setImageStatus, setLastFinal, setLastFinalCompletedAt, setProfiles, setProjectName, setResultEditorBuffer, setResultPreviewContent, setSelectedPresetId, setSelectedProfileId, setSelectedSourceCharsetTile, setSourcePreviewContent, setSpecsciiAuthor, setSpecsciiBorder, setSpecsciiDocumentName, setSpecsciiImageName, setState, setTileEditorColorPickerActive, setTileEditorEdited, setTileEditorOriginals, setTileEditorRedo, setTileEditorSelected, setTileEditorTilePickerActive, setTileEditorUndo, setTileEditorUsageSort, setTileStampDraft, setTilemapEditorCell, setTilemapPutActive, setTilemapStale, setUnifiedTileEditorContext, switchWorkspaceConversionMode, targetModeId, tileEditorOriginals, tileEditorPointerRef, tileEditorRedo, tileEditorSelected, tileEditorTilePickerClickGuardRef, tileEditorUndo, tilemapPutPointerRef, tilemapStale, unifiedTileEditorContext, updateSelectedTilemapAttribute, updateSelectedTilemapCell, workerRef, zxPaletteDefinition }: Pick<ReturnType<typeof useRuntimeState>, "bitmapEditorBrightPolicy" | "bitmapEditorCell" | "bitmapEditorClipboard" | "bitmapEditorCurrentResultRef" | "bitmapEditorEncodedRef" | "bitmapEditorFlashPolicy" | "bitmapEditorFullPointerRef" | "bitmapEditorInkColor" | "bitmapEditorOperation" | "bitmapEditorOriginalResult" | "bitmapEditorPaperColor" | "bitmapEditorPasteAttributes" | "bitmapEditorPasteMode" | "bitmapEditorPastePixels" | "bitmapEditorPointerRef" | "bitmapEditorRedo" | "bitmapEditorRegionSelection" | "bitmapEditorResultBufferRef" | "bitmapEditorResultEdited" | "bitmapEditorResultFrameIndex" | "bitmapEditorResultOriginal" | "bitmapEditorResultOriginalResult" | "bitmapEditorResultPaletteIndex" | "bitmapEditorResultQuality" | "bitmapEditorSelection" | "bitmapEditorSelectionResolution" | "bitmapEditorStipplePattern" | "bitmapEditorUndo" | "charsetGlyphRefs" | "charsetState" | "charsetWorkerRef" | "draftState" | "draftWorkerRef" | "existingCharsetSelectionRef" | "finalJobRef" | "finalRunningRef" | "lastFinal" | "lastFinalRevisionRef" | "revisionRef" | "setBitmapEditorCell" | "setBitmapEditorClipboard" | "setBitmapEditorOriginalResult" | "setBitmapEditorRedo" | "setBitmapEditorRegionSelection" | "setBitmapEditorResultEdited" | "setBitmapEditorResultOriginal" | "setBitmapEditorResultOriginalResult" | "setBitmapEditorResultQuality" | "setBitmapEditorResultRedo" | "setBitmapEditorResultUndo" | "setBitmapEditorUndo" | "setCharsetState" | "setDraftState" | "setLastFinal" | "setState" | "setTileEditorColorPickerActive" | "setTileEditorEdited" | "setTileEditorOriginals" | "setTileEditorRedo" | "setTileEditorSelected" | "setTileEditorTilePickerActive" | "setTileEditorUndo" | "setTileEditorUsageSort" | "setTileStampDraft" | "setTilemapEditorCell" | "setTilemapPutActive" | "setUnifiedTileEditorContext" | "tileEditorOriginals" | "tileEditorPointerRef" | "tileEditorRedo" | "tileEditorSelected" | "tileEditorTilePickerClickGuardRef" | "tileEditorUndo" | "tilemapPutPointerRef" | "unifiedTileEditorContext" | "workerRef"> &
    Pick<ReturnType<typeof useSettingsState>, "attributeHeight" | "charsetEncoding" | "charsetSource" | "customOrderedMatrices" | "image" | "profiles" | "selectedProfileId" | "setCharsetBudget" | "setCharsetEncoding" | "setCharsetSelectionMode" | "setCharsetSource" | "setCharsetTilesView" | "setDirty" | "setEmittedSourceCharsetIndices" | "setExistingCharset" | "setExistingCharsetLength" | "setExistingCharsetLengthEntry" | "setExistingCharsetName" | "setExistingCharsetSelection" | "setExistingCharsetStart" | "setExistingCharsetStartEntry" | "setExportError" | "setImageStatus" | "setLastFinalCompletedAt" | "setProfiles" | "setProjectName" | "setSelectedPresetId" | "setSelectedProfileId" | "setSelectedSourceCharsetTile" | "setSpecsciiAuthor" | "setSpecsciiBorder" | "setSpecsciiDocumentName" | "setSpecsciiImageName" | "setTilemapStale" | "targetModeId" | "tilemapStale" | "zxPaletteDefinition"> &
    Pick<ReturnType<typeof useWorkbenchState>, "setResultPreviewContent" | "setSourcePreviewContent"> &
    Pick<ReturnType<typeof useResultEditing>, "applySettings" | "initializeResultEditor" | "resultFrameInput" | "resultWithEditedFrame" | "setResultEditorBuffer"> &
    Pick<ReturnType<typeof useConversionActions>, "initializeTileEditor"> &
    Pick<ReturnType<typeof usePreviewInspection>, "commitTileEditorResult" | "pushTileEditorHistory" | "updateSelectedTilemapAttribute" | "updateSelectedTilemapCell"> &
    Pick<ReturnType<typeof useEngineSettingsBenchmarks>, "selectProfile" | "switchWorkspaceConversionMode">,
) {
  async function importSpecsciiFile(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    try {
      const fontAssets = await loadSpecsciiFontAssets();
      const imported = importSpecscii(
        await file.text(),
        fontAssets.romFont,
        fontAssets.udgFont,
      );
      const charset = imported.charset;
      const encoding: CharsetEncoding = "extended";
      const artifact = encodeCharsetArtifact({
        encoding,
        characterCount: charset.length / 8,
        transformations: false,
        characterIndices: Uint8Array.from(imported.assignments, ({ characterIndex }) => characterIndex),
        attributes: imported.attributes,
        transforms: new Uint8Array(768),
        charset,
      });
      const decoded = decodeCharsetArtifact(artifact.bytes, {
        encoding,
        characterCount: charset.length / 8,
        transformations: false,
      });
      const usedCharacterCount = new Set(imported.assignments.map(({ characterIndex }) => characterIndex)).size;
      const result: WorkerCharsetResult = {
        encoding,
        transformations: false,
        characterCount: charset.length / 8,
        artifact: artifact.bytes,
        decodedScr: decoded.scr,
        previewRgba: renderCharsetPreview(decoded.screen),
        charset: artifact.charset,
        attributes: artifact.attributes,
        assignments: imported.assignments,
        diagnostics: {
          uniqueCanonicalTiles: usedCharacterCount,
          usedCharacterCount,
          exactMatches: 768,
          averageStructuralError: 0,
          maximumStructuralError: 0,
          rgbSquaredError: 0,
          rgbRmse: 0,
          rgbSimilarityPercent: 100,
          polaritySwaps: 0,
          transformHistogram: [768, 0, 0, 0, 0, 0, 0, 0],
          memory: {
            headerBytes: 2,
            tilemapBytes: artifact.tilemap.length,
            attributeBytes: artifact.attributes.length,
            transformBytes: artifact.transforms.length,
            charsetBytes: artifact.charset.length,
            totalBytes: artifact.bytes.length,
          },
        },
      };
      setCharsetState({ kind: "ready", result });
      setCharsetEncoding("extended");
      setCharsetSource("existing");
      setExistingCharset(charset.slice());
      setExistingCharsetName(file.name);
      setCharsetTilesView("source");
      setCharsetSelectionMode(false);
      setSelectedSourceCharsetTile(null);
      setEmittedSourceCharsetIndices(Array.from({ length: charset.length / 8 }, (_, index) => index));
      setExistingCharsetStart(0);
      setExistingCharsetLength(charset.length / 8);
      setExistingCharsetStartEntry("1");
      setExistingCharsetLengthEntry(String(charset.length / 8));
      existingCharsetSelectionRef.current = null;
      setExistingCharsetSelection(null);
      setCharsetBudget(charset.length / 8);
      initializeTileEditor(result);
      setCharsetState({ kind: "ready", result });
      setTilemapStale(false);
      setTileEditorEdited(false);
      setSpecsciiDocumentName(file.name);
      setSpecsciiBorder(imported.document.border);
      setSpecsciiAuthor(imported.document.author ?? "");
      setSpecsciiImageName(imported.document.imageName ?? "");
      setProjectName(normalizeProjectName(sanitizeArtifactBaseName(file.name)));
      switchWorkspaceConversionMode("tilemap");
      setSourcePreviewContent("unified-editor");
      setResultPreviewContent("image");
      setTilemapStale(false);
      setImageStatus(`Imported Specscii screen · 32 × 24 cells · ${usedCharacterCount} symbols used.`);
      setExportError(null);
    } catch (error: unknown) {
      setExportError(`Specscii import rejected: ${error instanceof Error ? error.message : "Invalid file."}`);
    }
  }

  async function importProfile(file: File | undefined) {
    if (file === undefined) return;
    try {
      const source = await file.text();
      let parsed: unknown;
      try { parsed = JSON.parse(source); } catch { parsed = null; }
      if (typeof parsed === "object" && parsed !== null &&
          "application" in parsed && typeof parsed.application === "string" &&
          parsed.application.trim() === "SpecSCII Online") {
        await importSpecsciiFile(file);
        return;
      }
      const imported = await parseImportedProfile(new TextEncoder().encode(source));
      const importedProfiles = profiles.filter((profile) =>
        !BUILT_IN_PROFILES.some((builtIn) => builtIn.id === profile.id) &&
        profile.id !== imported.id,
      );
      const nextProfiles = [...BUILT_IN_PROFILES, ...importedProfiles, imported];
      saveStoredProfiles(localStorage, nextProfiles.slice(BUILT_IN_PROFILES.length));
      setProfiles(nextProfiles);
      setExportError(null);
      setSelectedProfileId(imported.id);
      const preset = imported.presets[0];
      if (preset !== undefined) {
        setSelectedPresetId(preset.id);
        applySettings(preset.settings);
      }
    } catch (error: unknown) {
      setExportError(`Profile import rejected: ${error instanceof Error ? error.message : "Validation failed."}`);
    }
  }

  function deleteSelectedProfile() {
    if (BUILT_IN_PROFILES.some((profile) => profile.id === selectedProfileId)) return;
    const nextProfiles = profiles.filter((profile) => profile.id !== selectedProfileId);
    saveStoredProfiles(localStorage, nextProfiles.slice(BUILT_IN_PROFILES.length));
    setProfiles(nextProfiles);
    selectProfile(BUILT_IN_PROFILE_ID);
  }

  function deleteAllImportedProfiles() {
    saveStoredProfiles(localStorage, []);
    setProfiles([...BUILT_IN_PROFILES]);
    selectProfile(BUILT_IN_PROFILE_ID);
  }

  function cancelHigh() {
    if (!finalRunningRef.current) return;
    workerRef.current?.dispose();
    charsetWorkerRef.current?.dispose();
    charsetWorkerRef.current = null;
    workerRef.current = new ConversionWorkerClient();
    finalRunningRef.current = false;
    finalJobRef.current += 1;
    setCharsetState((current) =>
      current.kind === "running" ? { kind: "idle" } : current,
    );
    if (lastFinal !== null && lastFinalRevisionRef.current === revisionRef.current) {
      setState({ kind: "ready", result: lastFinal });
    } else {
      setState(lastFinal === null ? { kind: "idle" } : { kind: "stale" });
    }
  }

  function invalidateCharset(): void {
    setCharsetState({ kind: "idle" });
  }

  function freezeGeneratedCharset(): void {
    if (charsetSource !== "derived" || charsetState.kind !== "ready") return;
    const charset = charsetState.result.charset.slice();
    const count = charset.length / 8;
    const all = allCharsetIndices(count);
    setExistingCharset(charset);
    setExistingCharsetName("generated-charset.chr");
    setCharsetTilesView("source");
    setCharsetSelectionMode(false);
    setSelectedSourceCharsetTile(null);
    setEmittedSourceCharsetIndices(all);
    setExistingCharsetStart(0);
    setExistingCharsetLength(count);
    setExistingCharsetStartEntry("1");
    setExistingCharsetLengthEntry(String(count));
    existingCharsetSelectionRef.current = all;
    setExistingCharsetSelection(all);
    setCharsetBudget(count);
    if (count > 32) setCharsetEncoding("extended");
    setCharsetSource("existing");
    setTilemapStale(true);
    setDirty(true);
  }

  function applyEditorOperation(operation: TileEditOperation, pushHistory = true): void {
    if (charsetState.kind !== "ready") return;
    const result = charsetState.result;
    const tile = result.charset.slice(tileEditorSelected * 8, tileEditorSelected * 8 + 8);
    if (pushHistory) {
      pushTileEditorHistory(result);
      setTileEditorOriginals((originals) => {
        const next = [...originals];
        if (next[tileEditorSelected] === null) next[tileEditorSelected] = tile;
        return next;
      });
    }
    const editedTile = applyTileEdit(tile, operation);
    commitTileEditorResult(
      result,
      replaceTileInCharset(result.charset, tileEditorSelected, editedTile),
    );
  }

  function toggleSelectedTilemapTransform(toggle: TileTransformToggle): void {
    if (charsetState.kind !== "ready" || !charsetState.result.transformations) return;
    if (unifiedTileEditorContext === "stamp") {
      setTileStampDraft((stamp) => ({
        ...stamp,
        transform: toggleTileTransform(stamp.transform, toggle),
      }));
      return;
    }
    updateSelectedTilemapCell((assignment) => ({
      assignment: { ...assignment, transform: toggleTileTransform(assignment.transform, toggle) },
    }));
  }

  function resetTilemapEditorTransform(): void {
    if (unifiedTileEditorContext === "stamp") {
      setTileStampDraft((stamp) => ({ ...stamp, transform: 0, inverted: false }));
      return;
    }
    updateSelectedTilemapCell((assignment) => ({
      assignment: { ...assignment, transform: 0 },
    }));
  }

  function switchUnifiedTileEditorContext(context: UnifiedTileEditorContext): void {
    tilemapPutPointerRef.current = null;
    setTilemapPutActive(false);
    setTileEditorColorPickerActive(false);
    setTileEditorTilePickerActive(false);
    setUnifiedTileEditorContext(context);
  }

  function swapSelectedTilemapInkPaper(): void {
    updateSelectedTilemapAttribute(swapTilemapInkPaper);
  }

  function consumeRecentTilePickerClick(characterIndex: number): boolean {
    const guard = tileEditorTilePickerClickGuardRef.current;
    if (guard === null) return false;
    if (guard.until < Date.now()) {
      tileEditorTilePickerClickGuardRef.current = null;
      return false;
    }
    return guard.index === characterIndex;
  }

  function selectEditorTile(index: number): void {
    if (charsetState.kind !== "ready") return;
    if (index < 0 || index >= charsetState.result.characterCount) return;
    setTileEditorSelected(index);
    const firstCell = charsetState.result.assignments.findIndex((assignment) => assignment.characterIndex === index);
    if (firstCell >= 0) setTilemapEditorCell(firstCell);
  }

  function selectUsedTile(index: number): void {
    if (charsetState.kind !== "ready") return;
    selectEditorTile(index);
    const firstCell = charsetState.result.assignments.findIndex((assignment) => assignment.characterIndex === index);
    if (firstCell >= 0) setTilemapEditorCell(firstCell);
    charsetGlyphRefs.current[index]?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function undoTileEditor(): void {
    const snapshot = tileEditorUndo[tileEditorUndo.length - 1];
    if (snapshot === undefined) return;
    if (charsetState.kind !== "ready") return;
    setTileEditorRedo((history) => [...history, snapshotTileEditor(charsetState.result)]);
    setTileEditorUndo((history) => history.slice(0, -1));
    setEmittedSourceCharsetIndices(null);
    setCharsetEncoding(snapshot.encoding);
    setCharsetState({ kind: "ready", result: rebuildCharsetResult(charsetState.result, snapshot.charset, snapshot.assignments, snapshot.encoding, snapshot.attributes) });
    setDirty(true);
    setTileEditorEdited(true);
  }

  function redoTileEditor(): void {
    const snapshot = tileEditorRedo[tileEditorRedo.length - 1];
    if (snapshot === undefined || charsetState.kind !== "ready") return;
    pushTileEditorHistory(charsetState.result);
    setTileEditorRedo((history) => history.slice(0, -1));
    setEmittedSourceCharsetIndices(null);
    setCharsetEncoding(snapshot.encoding);
    setCharsetState({ kind: "ready", result: rebuildCharsetResult(charsetState.result, snapshot.charset, snapshot.assignments, snapshot.encoding, snapshot.attributes) });
    setDirty(true);
    setTileEditorEdited(true);
  }

  function revertSelectedTile(): void {
    if (charsetState.kind !== "ready") return;
    const original = tileEditorOriginals[tileEditorSelected];
    if (original === null || original === undefined) return;
    pushTileEditorHistory(charsetState.result);
    commitTileEditorResult(
      charsetState.result,
      replaceTileInCharset(charsetState.result.charset, tileEditorSelected, original),
    );
  }

  function createEditorTile(): void {
    if (charsetState.kind !== "ready" || charsetState.result.characterCount >= 256) return;
    pushTileEditorHistory(charsetState.result);
    const nextCharset = appendBlankTile(charsetState.result.charset);
    const nextEncoding = nextCharset.length / 8 > 32 ? "extended" : charsetState.result.encoding;
    setCharsetEncoding(nextEncoding);
    commitTileEditorResult(charsetState.result, nextCharset, charsetState.result.assignments, nextEncoding);
    setTileEditorSelected(nextCharset.length / 8 - 1);
    setTileEditorOriginals((originals) => [...originals, new Uint8Array(8)]);
    setEmittedSourceCharsetIndices((indices) => indices === null ? null : [...indices, null]);
  }

  function deleteEditorTile(): void {
    if (charsetState.kind !== "ready" || charsetState.result.characterCount <= 1) return;
    const result = charsetState.result;
    const index = tileEditorSelected;
    const used = result.assignments.filter((assignment) => assignment.characterIndex === index).length;
    if (used > 0 && !window.confirm(`Tile ${index + 1} is used by ${used} cells. Delete it and remap those cells?`)) return;
    pushTileEditorHistory(result);
    const nextCharset = new Uint8Array(result.charset.length - 8);
    nextCharset.set(result.charset.subarray(0, index * 8));
    nextCharset.set(result.charset.subarray(index * 8 + 8), index * 8);
    const replacement = index === 0 ? 0 : index - 1;
    const assignments = result.assignments.map((assignment) => ({
      ...assignment,
      characterIndex: assignment.characterIndex === index
        ? replacement
        : assignment.characterIndex > index
          ? assignment.characterIndex - 1
          : assignment.characterIndex,
    }));
    const nextSelected = Math.min(index, nextCharset.length / 8 - 1);
    const nextEncoding = charsetEncoding;
    commitTileEditorResult(result, nextCharset, assignments, nextEncoding);
    setTileEditorSelected(nextSelected);
    setTileEditorOriginals((originals) => originals.filter((_, tileIndex) => tileIndex !== index));
    setEmittedSourceCharsetIndices((indices) => indices === null ? null : indices.filter((_, outputIndex) => outputIndex !== index));
  }

  function moveEditorTile(delta: -1 | 1): void {
    if (charsetState.kind !== "ready") return;
    const count = charsetState.result.characterCount;
    const target = tileEditorSelected + delta;
    if (target < 0 || target >= count) return;
    setTileEditorSelected(target);
  }

  function toggleEditorTileUsageSort(): void {
    if (charsetState.kind !== "ready" || tilemapStale) return;
    setTileEditorUsageSort((sorted) => !sorted);
  }

  function beginTileEditorPaint(event: ReactPointerEvent<HTMLDivElement>): void {
    if (charsetState.kind !== "ready") return;
    const pixel = tileEditorPixelFromEvent(event);
    if (pixel === null) return;
    event.preventDefault();
    tileEditorPointerRef.current = { pointerId: event.pointerId, visited: new Set() };
    event.currentTarget.setPointerCapture(event.pointerId);
    tileEditorPointerRef.current.visited.add(`${pixel.x},${pixel.y}`);
    applyEditorOperation({ kind: "xor-pixel", ...pixel });
  }

  function moveTileEditorPaint(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = tileEditorPointerRef.current;
    if (drag === null || drag.pointerId !== event.pointerId) return;
    const pixel = tileEditorPixelFromEvent(event);
    if (pixel === null || drag.visited.has(`${pixel.x},${pixel.y}`)) return;
    drag.visited.add(`${pixel.x},${pixel.y}`);
    applyEditorOperation({ kind: "xor-pixel", ...pixel }, false);
  }

  function endTileEditorPaint(event: ReactPointerEvent<HTMLDivElement>): void {
    if (tileEditorPointerRef.current?.pointerId === event.pointerId) tileEditorPointerRef.current = null;
  }

  function applyBitmapEditorToResult(cell: BitmapCell | null = bitmapEditorCell): void {
    const activeResult = draftPreviewResult(draftState) ?? lastFinal;
    if (cell === null || bitmapEditorSelection === null || activeResult === null ||
        activeResult.platformId !== "zx-spectrum" || activeResult.frames.length !== 1) return;
    const frame = activeResult.frames[0];
    const height = activeResult.attributeHeight ?? attributeHeight;
    if (frame === undefined || height !== 8) return;
    const encoded = Uint8Array.from(frame.encoded);
    for (let row = 0; row < 8; row += 1) {
      encoded[zxBitmapOffset(bitmapEditorSelection.cellX, bitmapEditorSelection.cellY * 8 + row)] =
        cell.rows[row] ?? 0;
    }
    encoded[6144 + bitmapEditorSelection.cellY * 32 + bitmapEditorSelection.cellX] =
      cell.attribute;
    const previewRgba = renderAttributeFrameRgba(
      unpackZxBitmap(encoded),
      encoded.subarray(6144),
      height,
      resolveZxPalette(zxPaletteDefinition),
    );
    const nextFrame = { ...frame, encoded, previewRgba };
    const nextResult: WorkerConversionResult = {
      ...activeResult,
      artifact: encoded,
      scr: encoded,
      frames: [nextFrame],
      mergedPreviewRgba: previewRgba,
      previewRgba,
    };
    if (bitmapEditorOriginalResult === null) setBitmapEditorOriginalResult(activeResult);
    if (bitmapEditorResultOriginalResult === null) setBitmapEditorResultOriginalResult(activeResult);
      setLastFinal(nextResult);
      setDraftState({ kind: "idle" });
      setState({ kind: "ready", result: nextResult });
      setBitmapEditorResultEdited(true);
      setImageStatus("Converted result · manually edited. Native artifact bytes updated.");
    setDirty(true);
  }

  function applyBitmapEditorOperation(operation: BitmapCellEditOperation): void {
    if (bitmapEditorCell === null) return;
    const nextCell = applyBitmapCellEdit(bitmapEditorCell, operation);
    setBitmapEditorUndo((history) => [...history, bitmapEditorCell]);
    setBitmapEditorRedo([]);
    setBitmapEditorCell(nextCell);
    applyBitmapEditorToResult(nextCell);
  }

  function undoBitmapEditor(): void {
    const previous = bitmapEditorUndo[bitmapEditorUndo.length - 1];
    if (previous === undefined) return;
    if (bitmapEditorCell !== null) setBitmapEditorRedo((history) => [...history, bitmapEditorCell]);
    setBitmapEditorCell(previous);
    setBitmapEditorUndo((history) => history.slice(0, -1));
    applyBitmapEditorToResult(previous);
  }

  function redoBitmapEditor(): void {
    const next = bitmapEditorRedo[bitmapEditorRedo.length - 1];
    if (next === undefined) return;
    if (bitmapEditorCell !== null) setBitmapEditorUndo((history) => [...history, bitmapEditorCell]);
    setBitmapEditorCell(next);
    setBitmapEditorRedo((history) => history.slice(0, -1));
    applyBitmapEditorToResult(next);
  }

  function beginBitmapEditorPaint(event: ReactPointerEvent<HTMLDivElement>): void {
    const pixel = bitmapEditorPixelFromEvent(event);
    if (pixel === null || bitmapEditorCell === null) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    bitmapEditorPointerRef.current = { pointerId: event.pointerId, visited: new Set([`${pixel.x},${pixel.y}`]) };
    applyBitmapEditorOperation({ kind: "toggle-pixel", ...pixel });
  }

  function moveBitmapEditorPaint(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = bitmapEditorPointerRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    const pixel = bitmapEditorPixelFromEvent(event);
    if (pixel === null) return;
    const key = `${pixel.x},${pixel.y}`;
    if (drag.visited.has(key)) return;
    drag.visited.add(key);
    applyBitmapEditorOperation({ kind: "toggle-pixel", ...pixel });
  }

  function endBitmapEditorPaint(event: ReactPointerEvent<HTMLDivElement>): void {
    if (bitmapEditorPointerRef.current?.pointerId === event.pointerId) bitmapEditorPointerRef.current = null;
  }

  function fullBitmapBufferFromSource(): BitmapEditorBuffer | null {
    if (image === null || image.rgba.length !== image.width * image.height * 4) return null;
    return { width: image.width, height: image.height, rgba: image.rgba.slice() };
  }

  function bitmapEditorActiveResult(): WorkerConversionResult | null {
    return bitmapEditorCurrentResultRef.current ?? draftPreviewResult(draftState) ?? lastFinal;
  }

  function bitmapEditorActiveNativeBuffer(): NativeResultBitmap | null {
    const result = bitmapEditorActiveResult();
    if (result === null) return null;
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, Math.max(0, result.frames.length - 1));
    return bitmapEditorResultBufferRef.current ?? initializeResultEditor(result, frameIndex);
  }

  function bitmapEditorAttributeGrid(): { readonly width: number | null; readonly height: number | null } {
    const result = bitmapEditorActiveResult();
    if (result?.platformId === "zx-spectrum") {
      return { width: 8, height: result.attributeHeight ?? attributeHeight };
    }
    if (result?.platformId === "pmd-85") {
      return { width: 6, height: targetModeId.replace(/-vertical-spatial$/, "") === "pmd85-colorace" ? 2 : 1 };
    }
    return { width: null, height: null };
  }

  function bitmapEditorOrderedMatrix(patternId = bitmapEditorStipplePattern): OrderedMatrix | null {
    if (patternId in ORDERED_MATRICES) return ORDERED_MATRICES[patternId as OrderedMatrixId];
    const custom = customOrderedMatrices.find((candidate) => candidate.id === patternId);
    if (custom === undefined) return null;
    return { width: custom.width, height: custom.height, values: custom.values, levels: new Set(custom.values).size };
  }

  function copyBitmapEditorSelection(
    selectionOverride: BitmapRegionSelection | null = bitmapEditorRegionSelection,
    announce = true,
  ): BitmapEditorClipboard | null {
    const selection = selectionOverride;
    const result = bitmapEditorActiveResult();
    const bitmap = bitmapEditorActiveNativeBuffer();
    if (selection === null || result === null || bitmap === null) return null;
    const paletteIndices = new Uint8Array(selection.width * selection.height);
    const rgba = new Uint8Array(selection.width * selection.height * 4);
    for (let y = 0; y < selection.height; y += 1) {
      for (let x = 0; x < selection.width; x += 1) {
        const offset = y * selection.width + x;
        if (selection.mask[offset] !== 1) continue;
        const sourceOffset = (selection.y + y) * bitmap.width + selection.x + x;
        paletteIndices[offset] = bitmap.paletteIndices[sourceOffset] ?? 0;
        rgba.set(bitmap.rgba.subarray(sourceOffset * 4, sourceOffset * 4 + 4), offset * 4);
      }
    }
    const grid = bitmapEditorAttributeGrid();
    const attributeWidth = grid.width ?? 1;
    const attributeHeight = grid.height ?? 1;
    let attributes: Uint8Array | null = null;
    let attributeMask: Uint8Array | null = null;
    if (result.platformId === "zx-spectrum" && grid.width !== null && grid.height !== null) {
      const firstCellX = Math.floor(selection.x / grid.width);
      const firstCellY = Math.floor(selection.y / grid.height);
      const columns = Math.ceil((selection.x + selection.width) / grid.width) - firstCellX;
      const rows = Math.ceil((selection.y + selection.height) / grid.height) - firstCellY;
      attributes = new Uint8Array(columns * rows);
      attributeMask = new Uint8Array(columns * rows);
      for (let cellY = 0; cellY < rows; cellY += 1) {
        for (let cellX = 0; cellX < columns; cellX += 1) {
          const cellIndex = cellY * columns + cellX;
          let hasSelectedPixel = false;
          for (let y = 0; y < grid.height; y += 1) {
            for (let x = 0; x < grid.width; x += 1) {
              const selectionX = (firstCellX + cellX) * grid.width + x - selection.x;
              const selectionY = (firstCellY + cellY) * grid.height + y - selection.y;
              if (selectionX < 0 || selectionX >= selection.width || selectionY < 0 || selectionY >= selection.height ||
                  selection.mask[selectionY * selection.width + selectionX] !== 1) {
                continue;
              } else {
                hasSelectedPixel = true;
              }
            }
          }
          if (!hasSelectedPixel) continue;
          attributeMask[cellIndex] = 1;
          const absoluteCellX = firstCellX + cellX;
          const absoluteCellY = firstCellY + cellY;
          attributes[cellIndex] = bitmap.encoded[ZX_BITMAP_BYTES + absoluteCellY * 32 + absoluteCellX] ?? 0;
        }
      }
    }
    const clipboard: BitmapEditorClipboard = {
      width: selection.width,
      height: selection.height,
      paletteIndices,
      rgba,
      mask: selection.mask.slice(),
      sourceX: selection.x,
      sourceY: selection.y,
      sourceAttributeX: grid.width === null ? selection.x : Math.floor(selection.x / grid.width) * grid.width,
      sourceAttributeY: grid.height === null ? selection.y : Math.floor(selection.y / grid.height) * grid.height,
      gridWidth: selection.gridWidth,
      gridHeight: selection.gridHeight,
      resolution: selection.resolution,
      attributes,
      attributeMask,
      attributeWidth,
      attributeHeight,
    };
    setBitmapEditorClipboard(clipboard);
    if (announce) {
      setImageStatus(`Copied ${selection.width}×${selection.height} px to the selection clipboard${attributeMask?.some((value) => value === 1) ? " with source cell attributes" : ""}.`);
    }
    return clipboard;
  }

  function bitmapEditorAttributeSelection(): ZxAttributeSelection {
    return {
      ink: bitmapEditorInkColor,
      paper: bitmapEditorPaperColor,
      bright: bitmapEditorBrightPolicy,
      flash: bitmapEditorFlashPolicy,
    };
  }

  function applyBitmapEditorAttributesToPixels(
    encoded: Uint8Array,
    attributeHeight: 1 | 2 | 4 | 8,
    pixels: readonly { readonly x: number; readonly y: number }[],
  ): Uint8Array {
    const next = encoded.slice();
    const cells = new Set<string>();
    for (const pixel of pixels) {
      if (pixel.x < 0 || pixel.x >= 256 || pixel.y < 0 || pixel.y >= 192) continue;
      cells.add(`${Math.floor(pixel.x / 8)},${Math.floor(pixel.y / attributeHeight)}`);
    }
    for (const key of cells) {
      const [cellXText, cellYText] = key.split(",");
      const cellX = Number(cellXText);
      const cellY = Number(cellYText);
      const current = readZxAttributeCell(next, attributeHeight, cellX, cellY);
      const selected = applyZxAttributeSelection(current, bitmapEditorAttributeSelection());
      next[ZX_BITMAP_BYTES + cellY * 32 + cellX] = selected.attribute;
    }
    return next;
  }

  function commitBitmapEditorResultEdit(
    result: WorkerConversionResult,
    frameIndex: number,
    current: NativeResultBitmap,
    next: NativeResultBitmap,
  ): boolean {
    let changed = next.encoded.length !== current.encoded.length;
    if (!changed) {
      for (let index = 0; index < next.encoded.length; index += 1) {
        if (next.encoded[index] !== current.encoded[index]) { changed = true; break; }
      }
    }
    if (!changed) return false;
    if (!bitmapEditorFullPointerRef.current?.historyCaptured) {
      setBitmapEditorResultUndo((history) => [...history, {
        result,
        bitmap: cloneNativeResultBitmap(current),
        frameIndex,
      }]);
      if (bitmapEditorFullPointerRef.current !== null) bitmapEditorFullPointerRef.current.historyCaptured = true;
    }
    if (bitmapEditorResultOriginal === null) setBitmapEditorResultOriginal(cloneNativeResultBitmap(current));
    if (bitmapEditorResultOriginalResult === null) setBitmapEditorResultOriginalResult(result);
    if (!bitmapEditorResultEdited) {
      const editedDraft = bitmapEditorResultQuality === "Draft" || draftPreviewResult(draftState) === result;
      setBitmapEditorResultQuality(editedDraft ? "Draft" : "High");
      if (editedDraft) setLastFinalCompletedAt(null);
    }
    const nextResult = resultWithEditedFrame(result, frameIndex, next);
    bitmapEditorEncodedRef.current = next.encoded.slice();
    bitmapEditorCurrentResultRef.current = nextResult;
    setResultEditorBuffer(next);
    setLastFinal(nextResult);
    setState({ kind: "ready", result: nextResult });
    setDraftState({ kind: "idle" });
    setBitmapEditorResultRedo([]);
    setBitmapEditorResultEdited(true);
    draftWorkerRef.current?.dispose();
    draftWorkerRef.current = null;
    setImageStatus("Converted result · manually edited. Native bitmap artifact bytes updated.");
    setDirty(true);
    return true;
  }

  function placeBitmapEditorClipboard(
    destination: { readonly x: number; readonly y: number },
    mode: "copy" | "move" | null = bitmapEditorPasteMode,
    clipboard = bitmapEditorClipboard,
    operation = bitmapEditorOperation,
    preserveColors = false,
    includePixels = bitmapEditorPastePixels,
    includeAttributes = bitmapEditorPasteAttributes,
    eraseOrigin?: { readonly x: number; readonly y: number },
    forcePixelResolution = false,
    eraseSelection?: BitmapRegionSelection,
  ): void {
    const result = bitmapEditorActiveResult();
    const current = bitmapEditorActiveNativeBuffer();
    if (clipboard === null || result === null || current === null) return;
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, result.frames.length - 1);
    const input = resultFrameInput(result, frameIndex);
    if (input === null) return;
    const pasteAttributes = includeAttributes && clipboard.attributes !== null && clipboard.attributeMask !== null && result.platformId === "zx-spectrum";
    const pastePixels = includePixels;
    if (!pastePixels && !pasteAttributes) {
      setImageStatus("Turn on PIXELS, ATTRS, or both before pasting.");
      return;
    }
    const grid = bitmapEditorAttributeGrid();
    const snapToAttributes = !forcePixelResolution && bitmapEditorSelectionResolution === "attribute" && grid.width !== null && grid.height !== null;
    const stepX = snapToAttributes ? grid.width! : 1;
    const stepY = snapToAttributes ? grid.height! : 1;
    const maxX = Math.max(0, Math.floor((current.width - clipboard.width) / stepX) * stepX);
    const maxY = Math.max(0, Math.floor((current.height - clipboard.height) / stepY) * stepY);
    const pixelX = Math.max(0, Math.min(maxX, Math.round(destination.x / stepX) * stepX));
    const pixelY = Math.max(0, Math.min(maxY, Math.round(destination.y / stepY) * stepY));
    const currentSelection = bitmapEditorRegionSelection;
    const moveSelection = eraseSelection ?? (mode === "move" ? clipboard.eraseSelection : undefined);
    const moveOrigin = eraseOrigin ?? moveSelection ?? currentSelection ?? { x: clipboard.sourceX, y: clipboard.sourceY };
    let base = current;
    if (mode === "move") {
      if (pastePixels) {
        const eraseWidth = moveSelection?.width ?? clipboard.width;
        const eraseHeight = moveSelection?.height ?? clipboard.height;
        const eraseMask = moveSelection?.mask ?? clipboard.mask;
        const sourceOn = new Uint8Array(eraseWidth * eraseHeight).fill(1);
        base = composeNativeResultRegion(
          base, input, sourceOn, eraseMask, eraseWidth, eraseHeight,
          moveOrigin.x, moveOrigin.y, "and", bitmapEditorResultPaletteIndex,
        );
      }
      if (pasteAttributes && base.platformId === "zx-spectrum" && input.attributeHeight !== null && clipboard.attributes !== null && clipboard.attributeMask !== null) {
        const eraseWidth = moveSelection?.width ?? clipboard.width;
        const eraseHeight = moveSelection?.height ?? clipboard.height;
        const eraseMask = moveSelection?.mask ?? clipboard.mask;
        const columns = Math.ceil((moveOrigin.x + eraseWidth) / clipboard.attributeWidth) -
          Math.floor(moveOrigin.x / clipboard.attributeWidth);
        const rows = Math.ceil((moveOrigin.y + eraseHeight) / clipboard.attributeHeight) -
          Math.floor(moveOrigin.y / clipboard.attributeHeight);
        const encoded = base.encoded.slice();
        const firstCellX = Math.floor(moveOrigin.x / clipboard.attributeWidth);
        const firstCellY = Math.floor(moveOrigin.y / clipboard.attributeHeight);
        for (let cellY = 0; cellY < rows; cellY += 1) for (let cellX = 0; cellX < columns; cellX += 1) {
          const sourceCellX = firstCellX + cellX;
          const sourceCellY = firstCellY + cellY;
          let complete = true;
          for (let y = 0; y < clipboard.attributeHeight && complete; y += 1) {
            for (let x = 0; x < clipboard.attributeWidth; x += 1) {
              const localX = sourceCellX * clipboard.attributeWidth + x - moveOrigin.x;
              const localY = sourceCellY * clipboard.attributeHeight + y - moveOrigin.y;
              if (localX < 0 || localX >= eraseWidth || localY < 0 || localY >= eraseHeight ||
                  eraseMask[localY * eraseWidth + localX] !== 1) {
                complete = false;
                break;
              }
            }
          }
          if (complete && sourceCellX >= 0 && sourceCellX < 32 && sourceCellY >= 0 && sourceCellY < 192 / input.attributeHeight) {
            encoded[ZX_BITMAP_BYTES + sourceCellY * 32 + sourceCellX] = 0;
          }
        }
        base = createNativeResultBitmap({ ...input, encoded });
      }
    }
    let next = base;
    if (pastePixels) {
      const recoloredPixels = preserveColors
        ? clipboard.paletteIndices
        : clipboard.paletteIndices.map((index) => index === 0 ? 0 : Math.max(1, bitmapEditorResultPaletteIndex));
      next = composeNativeResultRegion(
        base, input, recoloredPixels, clipboard.mask, clipboard.width, clipboard.height,
        pixelX, pixelY, operation, bitmapEditorResultPaletteIndex,
      );
      if (next.platformId === "zx-spectrum" && input.attributeHeight !== null && operation !== "none") {
        const touchedPixels: Array<{ readonly x: number; readonly y: number }> = [];
        for (let sourceY = 0; sourceY < clipboard.height; sourceY += 1) {
          for (let sourceX = 0; sourceX < clipboard.width; sourceX += 1) {
            if (clipboard.mask[sourceY * clipboard.width + sourceX] !== 1) continue;
            const destinationPixelX = pixelX + sourceX;
            const destinationPixelY = pixelY + sourceY;
            if (destinationPixelX >= 0 && destinationPixelX < next.width && destinationPixelY >= 0 && destinationPixelY < next.height) {
              touchedPixels.push({ x: destinationPixelX, y: destinationPixelY });
            }
          }
        }
        if (touchedPixels.length > 0) {
          const encoded = applyBitmapEditorAttributesToPixels(next.encoded, input.attributeHeight, touchedPixels);
          next = createNativeResultBitmap({ ...input, encoded });
        }
      }
    }
    if (pasteAttributes && next.platformId === "zx-spectrum" &&
        input.attributeHeight !== null && clipboard.attributes !== null && clipboard.attributeMask !== null) {
      const cellWidth = clipboard.attributeWidth;
      const cellHeight = clipboard.attributeHeight;
      const sourceFirstCellX = Math.floor(clipboard.sourceAttributeX / cellWidth);
      const sourceFirstCellY = Math.floor(clipboard.sourceAttributeY / cellHeight);
      const cellColumns = Math.ceil((clipboard.sourceX + clipboard.width) / cellWidth) - sourceFirstCellX;
      const cellRows = Math.ceil((clipboard.sourceY + clipboard.height) / cellHeight) - sourceFirstCellY;
      const destinationFirstCellX = Math.floor(pixelX / cellWidth);
      const destinationFirstCellY = Math.floor(pixelY / cellHeight);
      const destinationLastCellX = Math.ceil((pixelX + clipboard.width) / cellWidth);
      const destinationLastCellY = Math.ceil((pixelY + clipboard.height) / cellHeight);
      const encoded = next.encoded.slice();
      for (let destinationCellY = destinationFirstCellY; destinationCellY < destinationLastCellY; destinationCellY += 1) {
        for (let destinationCellX = destinationFirstCellX; destinationCellX < destinationLastCellX; destinationCellX += 1) {
          if (destinationCellX < 0 || destinationCellX >= 32 ||
              destinationCellY < 0 || destinationCellY >= 192 / cellHeight) continue;
          const overlapLeft = Math.max(pixelX, destinationCellX * cellWidth);
          const overlapTop = Math.max(pixelY, destinationCellY * cellHeight);
          const overlapRight = Math.min(pixelX + clipboard.width, (destinationCellX + 1) * cellWidth, current.width);
          const overlapBottom = Math.min(pixelY + clipboard.height, (destinationCellY + 1) * cellHeight, current.height);
          if (overlapLeft >= overlapRight || overlapTop >= overlapBottom) continue;
          const overlapCenterX = Math.floor((overlapLeft + overlapRight - 1) / 2);
          const overlapCenterY = Math.floor((overlapTop + overlapBottom - 1) / 2);
          const sourcePixelX = clipboard.sourceX + overlapCenterX - pixelX;
          const sourcePixelY = clipboard.sourceY + overlapCenterY - pixelY;
          const sourceCellX = Math.floor(sourcePixelX / cellWidth);
          const sourceCellY = Math.floor(sourcePixelY / cellHeight);
          const localCellX = sourceCellX - sourceFirstCellX;
          const localCellY = sourceCellY - sourceFirstCellY;
          if (localCellX < 0 || localCellX >= cellColumns || localCellY < 0 || localCellY >= cellRows) continue;
          const sourceCell = localCellY * cellColumns + localCellX;
          if (clipboard.attributeMask[sourceCell] !== 1) continue;
          let hasSelectedPixel = false;
          for (let y = overlapTop; y < overlapBottom && !hasSelectedPixel; y += 1) {
            for (let x = overlapLeft; x < overlapRight; x += 1) {
              const sourceX = x - pixelX;
              const sourceY = y - pixelY;
              if (clipboard.mask[sourceY * clipboard.width + sourceX] === 1) {
                hasSelectedPixel = true;
                break;
              }
            }
          }
          if (!hasSelectedPixel) continue;
          encoded[ZX_BITMAP_BYTES + destinationCellY * 32 + destinationCellX] = clipboard.attributes[sourceCell] ?? 0;
        }
      }
      next = createNativeResultBitmap({ ...input, encoded });
    }
    commitBitmapEditorResultEdit(result, frameIndex, current, next);
    if (mode === "move") {
      if (currentSelection !== null && currentSelection.width === clipboard.width && currentSelection.height === clipboard.height) {
        setBitmapEditorRegionSelection({ ...currentSelection, x: pixelX, y: pixelY });
      }
      setImageStatus("Selection moved · Selection paint remains active until you turn it Off.");
    } else {
      setImageStatus(`Pasted selection clipboard · ${pastePixels ? "pixels" : ""}${pastePixels && pasteAttributes ? " and " : ""}${pasteAttributes ? "attributes" : ""} · selection paint remains active until you turn it Off.`);
    }
  }

  return {
    applyBitmapEditorAttributesToPixels,
    applyBitmapEditorOperation,
    applyEditorOperation,
    beginBitmapEditorPaint,
    beginTileEditorPaint,
    bitmapEditorActiveNativeBuffer,
    bitmapEditorActiveResult,
    bitmapEditorAttributeGrid,
    bitmapEditorAttributeSelection,
    bitmapEditorOrderedMatrix,
    cancelHigh,
    commitBitmapEditorResultEdit,
    consumeRecentTilePickerClick,
    copyBitmapEditorSelection,
    createEditorTile,
    deleteAllImportedProfiles,
    deleteEditorTile,
    deleteSelectedProfile,
    endBitmapEditorPaint,
    endTileEditorPaint,
    freezeGeneratedCharset,
    fullBitmapBufferFromSource,
    importProfile,
    importSpecsciiFile,
    invalidateCharset,
    moveBitmapEditorPaint,
    moveEditorTile,
    moveTileEditorPaint,
    placeBitmapEditorClipboard,
    redoBitmapEditor,
    redoTileEditor,
    resetTilemapEditorTransform,
    revertSelectedTile,
    selectEditorTile,
    selectUsedTile,
    swapSelectedTilemapInkPaper,
    switchUnifiedTileEditorContext,
    toggleEditorTileUsageSort,
    toggleSelectedTilemapTransform,
    undoBitmapEditor,
    undoTileEditor,
  };
}
