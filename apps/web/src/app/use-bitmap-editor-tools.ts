import { bitmapEditorStippleFootprint, type BitmapRegionSelection, type BitmapSelectionKind, type BitmapSelectionResolution, type BitmapSelectionTransform, makeBitmapRegionSelection, shiftBitmapRegionPixels, transformBitmapRegionData, transformBitmapRegionSelection } from "../bitmap-editor-selection.js";
import { type BitmapEditorClipboard, type BitmapSelectionResizeHandle } from "../app-types.js";
import { applyNativePaletteIndexOperation, applyNativeResultPixels, cloneNativeResultBitmap, composeNativeResultRegion, createNativeResultBitmap, type NativeResultBitmap } from "../result-bitmap-editor.js";
import { bitmapEditorBrushPixels, bitmapEditorConnectedRegion, type BitmapEditorOperation, bitmapEditorOperationLabel, type BitmapEditorScope, nextBitmapEditorBrushSize, nextBitmapEditorCellMode } from "../bitmap-editor-tools.js";
import { type WorkerConversionResult } from "../worker/client.js";
import { ZX_BITMAP_BYTES } from "@retro-converter/zx-spectrum";
import { draftPreviewResult } from "../draft-preview-state.js";
import { type BitmapEditorBuffer, type BitmapPixelColor, cloneBitmapBuffer, paintPixels } from "../full-bitmap-editor.js";
import { type InspectedAttribute, inspectSoftwareScr, ZX_BASE_COLORS } from "../inspection.js";
import { hexToRgb } from "../dithering-labels.js";
import { bitmapCustomPatternOn, type BitmapPrimitiveKind, bitmapPrimitiveStippleOn, rasterizeBitmapBrushStroke, rasterizeBitmapPrimitive, sampleBitmapPrimitivePattern } from "../bitmap-editor-primitives.js";
import { type PointerEvent as ReactPointerEvent } from "react";
import { applyZxAttributeCellMaskOperation, applyZxAttributeSelection, readZxAttributeCell } from "../bitmap-attribute-cell-editor.js";
import type { useRuntimeState } from "./use-runtime-state.js";
import type { useSettingsState } from "./use-settings-state.js";
import type { useWorkbenchState } from "./use-workbench-state.js";
import type { useResultEditing } from "./use-result-editing.js";
import type { usePreviewInspection } from "./use-preview-inspection.js";
import type { useEditorOperations } from "./use-editor-operations.js";

export function useBitmapEditorTools(
  { applyBitmapEditorAttributesToPixels, attributeHeight, bitmapEditorActiveNativeBuffer, bitmapEditorActiveResult, bitmapEditorAttributeGrid, bitmapEditorAttributeSelection, bitmapEditorBrightPolicy, bitmapEditorBrushSize, bitmapEditorBuffer, bitmapEditorCellMode, bitmapEditorClipboard, bitmapEditorColorChannel, bitmapEditorColorDraftRef, bitmapEditorColorFrom, bitmapEditorColorOperation, bitmapEditorColorPickerActive, bitmapEditorColorScope, bitmapEditorColorTo, bitmapEditorCurrentResultRef, bitmapEditorFullBufferRef, bitmapEditorFullPointerRef, bitmapEditorInkColor, bitmapEditorOperation, bitmapEditorOrderedMatrix, bitmapEditorPaperColor, bitmapEditorPasteAttributes, bitmapEditorPasteMode, bitmapEditorPastePixels, bitmapEditorPatternPickerActive, bitmapEditorPickedCell, bitmapEditorPickedFrameIndex, bitmapEditorPrimitiveCursor, bitmapEditorPrimitiveCustomPattern, bitmapEditorPrimitiveDraft, bitmapEditorPrimitiveFillEnabled, bitmapEditorPrimitiveFillOperation, bitmapEditorPrimitiveFillPattern, bitmapEditorPrimitiveKind, bitmapEditorPrimitiveStrokeEnabled, bitmapEditorPrimitiveStrokePattern, bitmapEditorRegionSelection, bitmapEditorResultBuffer, bitmapEditorResultBufferRef, bitmapEditorResultFrameIndex, bitmapEditorResultPaletteIndex, bitmapEditorScope, bitmapEditorSelectionResolution, bitmapEditorSourceColor, bitmapEditorStippleDensity, bitmapEditorStippleEnabled, bitmapEditorTarget, commitBitmapEditorResultEdit, copyBitmapEditorSelection, displayedHeight, displayedResult, displayedWidth, draftState, fullBitmapBufferFromSource, image, initializeResultEditor, lastFinal, outputPreviewStage, placeBitmapEditorClipboard, resultFrameInput, setBitmapEditorBrightPolicy, setBitmapEditorBrushSize, setBitmapEditorBuffer, setBitmapEditorCell, setBitmapEditorCellMode, setBitmapEditorClipboard, setBitmapEditorColorOperation, setBitmapEditorColorPickerActive, setBitmapEditorFlashPolicy, setBitmapEditorInkColor, setBitmapEditorOperation, setBitmapEditorPaperColor, setBitmapEditorPasteMode, setBitmapEditorPatternPickerActive, setBitmapEditorPrimitiveCursor, setBitmapEditorPrimitiveCustomPattern, setBitmapEditorPrimitiveDraft, setBitmapEditorPrimitivePatternPickerActive, setBitmapEditorRedoFull, setBitmapEditorRegionSelection, setBitmapEditorResultPaletteIndex, setBitmapEditorRevertSource, setBitmapEditorScope, setBitmapEditorSelection, setBitmapEditorSelectionDraft, setBitmapEditorSelectionTool, setBitmapEditorSourceColor, setBitmapEditorUndoFull, setDirty, setDraftState, setExportError, setImage, setImageStatus, setInspection, setLastFinal, setResultEditorBuffer, setState, skipNextDraftAfterBitmapEditRef }: Pick<ReturnType<typeof useRuntimeState>, "bitmapEditorBrightPolicy" | "bitmapEditorBrushSize" | "bitmapEditorBuffer" | "bitmapEditorCellMode" | "bitmapEditorClipboard" | "bitmapEditorColorChannel" | "bitmapEditorColorDraftRef" | "bitmapEditorColorFrom" | "bitmapEditorColorOperation" | "bitmapEditorColorPickerActive" | "bitmapEditorColorScope" | "bitmapEditorColorTo" | "bitmapEditorCurrentResultRef" | "bitmapEditorFullBufferRef" | "bitmapEditorFullPointerRef" | "bitmapEditorInkColor" | "bitmapEditorOperation" | "bitmapEditorPaperColor" | "bitmapEditorPasteAttributes" | "bitmapEditorPasteMode" | "bitmapEditorPastePixels" | "bitmapEditorPatternPickerActive" | "bitmapEditorPickedCell" | "bitmapEditorPickedFrameIndex" | "bitmapEditorRegionSelection" | "bitmapEditorResultBuffer" | "bitmapEditorResultBufferRef" | "bitmapEditorResultFrameIndex" | "bitmapEditorResultPaletteIndex" | "bitmapEditorScope" | "bitmapEditorSelectionResolution" | "bitmapEditorSourceColor" | "bitmapEditorStippleDensity" | "bitmapEditorStippleEnabled" | "bitmapEditorTarget" | "draftState" | "lastFinal" | "setBitmapEditorBrightPolicy" | "setBitmapEditorBrushSize" | "setBitmapEditorBuffer" | "setBitmapEditorCell" | "setBitmapEditorCellMode" | "setBitmapEditorClipboard" | "setBitmapEditorColorOperation" | "setBitmapEditorColorPickerActive" | "setBitmapEditorFlashPolicy" | "setBitmapEditorInkColor" | "setBitmapEditorOperation" | "setBitmapEditorPaperColor" | "setBitmapEditorPasteMode" | "setBitmapEditorPatternPickerActive" | "setBitmapEditorRedoFull" | "setBitmapEditorRegionSelection" | "setBitmapEditorResultPaletteIndex" | "setBitmapEditorRevertSource" | "setBitmapEditorScope" | "setBitmapEditorSelection" | "setBitmapEditorSelectionDraft" | "setBitmapEditorSelectionTool" | "setBitmapEditorSourceColor" | "setBitmapEditorUndoFull" | "setDraftState" | "setLastFinal" | "setState" | "skipNextDraftAfterBitmapEditRef"> &
    Pick<ReturnType<typeof useSettingsState>, "attributeHeight" | "image" | "setDirty" | "setExportError" | "setImage" | "setImageStatus"> &
    Pick<ReturnType<typeof useWorkbenchState>, "bitmapEditorPrimitiveCursor" | "bitmapEditorPrimitiveCustomPattern" | "bitmapEditorPrimitiveDraft" | "bitmapEditorPrimitiveFillEnabled" | "bitmapEditorPrimitiveFillOperation" | "bitmapEditorPrimitiveFillPattern" | "bitmapEditorPrimitiveKind" | "bitmapEditorPrimitiveStrokeEnabled" | "bitmapEditorPrimitiveStrokePattern" | "outputPreviewStage" | "setBitmapEditorPrimitiveCursor" | "setBitmapEditorPrimitiveCustomPattern" | "setBitmapEditorPrimitiveDraft" | "setBitmapEditorPrimitivePatternPickerActive" | "setInspection"> &
    Pick<ReturnType<typeof useResultEditing>, "initializeResultEditor" | "resultFrameInput" | "setResultEditorBuffer"> &
    Pick<ReturnType<typeof usePreviewInspection>, "displayedHeight" | "displayedResult" | "displayedWidth"> &
    Pick<ReturnType<typeof useEditorOperations>, "applyBitmapEditorAttributesToPixels" | "bitmapEditorActiveNativeBuffer" | "bitmapEditorActiveResult" | "bitmapEditorAttributeGrid" | "bitmapEditorAttributeSelection" | "bitmapEditorOrderedMatrix" | "commitBitmapEditorResultEdit" | "copyBitmapEditorSelection" | "fullBitmapBufferFromSource" | "placeBitmapEditorClipboard">,
) {
  function bitmapEditorSelectionDimensions(): { readonly width: number; readonly height: number } | null {
    const result = bitmapEditorActiveResult();
    const bitmap = bitmapEditorResultBufferRef.current;
    const frame = result?.frames[Math.min(bitmapEditorResultFrameIndex, Math.max(0, result.frames.length - 1))];
    const width = bitmap?.width ?? frame?.nativeWidth;
    const height = bitmap?.height ?? frame?.nativeHeight;
    return width === undefined || height === undefined ? null : { width, height };
  }

  function transformBitmapEditorSelection(transform: BitmapSelectionTransform): void {
    const selection = bitmapEditorRegionSelection;
    if (selection === null || bitmapEditorTarget !== "result") return;
    const source = bitmapEditorClipboard !== null &&
      bitmapEditorClipboard.width === selection.width && bitmapEditorClipboard.height === selection.height
      ? bitmapEditorClipboard
      : copyBitmapEditorSelection(selection, false);
    if (source === null) return;
    const transformedSelection = transformBitmapRegionSelection(selection, transform);
    const width = transformedSelection.width;
    const height = transformedSelection.height;
    const transformedPixels = transformBitmapRegionData(source.paletteIndices, source.width, source.height, transform);
    const transformedRgba = transformBitmapRegionData(source.rgba, source.width, source.height, transform, 4);
    const oldAttributeColumns = source.attributes === null ? 0 : Math.ceil((source.sourceX + source.width) / source.attributeWidth) - Math.floor(source.sourceX / source.attributeWidth);
    const oldAttributeRows = source.attributes === null ? 0 : Math.ceil((source.sourceY + source.height) / source.attributeHeight) - Math.floor(source.sourceY / source.attributeHeight);
    const newAttributeColumns = source.attributes === null ? 0 : Math.ceil((selection.x + width) / source.attributeWidth) - Math.floor(selection.x / source.attributeWidth);
    const newAttributeRows = source.attributes === null ? 0 : Math.ceil((selection.y + height) / source.attributeHeight) - Math.floor(selection.y / source.attributeHeight);
    let attributes: Uint8Array | null = null;
    let attributeMask: Uint8Array | null = null;
    if (source.attributes !== null && source.attributeMask !== null && oldAttributeColumns > 0 && oldAttributeRows > 0) {
      const transformedAttributes = transformBitmapRegionData(source.attributes, oldAttributeColumns, oldAttributeRows, transform);
      const transformedMask = transformBitmapRegionData(source.attributeMask, oldAttributeColumns, oldAttributeRows, transform);
      attributes = new Uint8Array(newAttributeColumns * newAttributeRows);
      attributeMask = new Uint8Array(newAttributeColumns * newAttributeRows);
      for (let y = 0; y < Math.min(newAttributeRows, transformedAttributes.height); y += 1) {
        for (let x = 0; x < Math.min(newAttributeColumns, transformedAttributes.width); x += 1) {
          const destination = y * newAttributeColumns + x;
          const index = y * transformedAttributes.width + x;
          attributes[destination] = transformedAttributes.data[index] ?? 0;
          attributeMask[destination] = transformedMask.data[index] ?? 0;
        }
      }
    }
    const finalClipboard: BitmapEditorClipboard = {
      ...source,
      width,
      height,
      paletteIndices: transformedPixels.data,
      rgba: transformedRgba.data,
      mask: transformedSelection.mask,
      attributes,
      attributeMask,
      sourceX: selection.x,
      sourceY: selection.y,
      sourceAttributeX: Math.floor(selection.x / source.attributeWidth) * source.attributeWidth,
      sourceAttributeY: Math.floor(selection.y / source.attributeHeight) * source.attributeHeight,
      ...(bitmapEditorPasteMode === "move" ? { eraseSelection: source.eraseSelection ?? selection } : {}),
    };
    const result = bitmapEditorActiveResult();
    const dimensions = bitmapEditorSelectionDimensions();
    if (result === null || dimensions === null || width > dimensions.width || height > dimensions.height) return;
    const x = Math.min(selection.x, dimensions.width - width);
    const y = Math.min(selection.y, dimensions.height - height);
    const placedClipboard = {
      ...finalClipboard,
      sourceX: x,
      sourceY: y,
      sourceAttributeX: Math.floor(x / source.attributeWidth) * source.attributeWidth,
      sourceAttributeY: Math.floor(y / source.attributeHeight) * source.attributeHeight,
    };
    const nextSelection = { ...transformedSelection, x, y, mask: placedClipboard.mask };
    setBitmapEditorClipboard(placedClipboard);
    setBitmapEditorRegionSelection(nextSelection);
    if (bitmapEditorPasteMode === null) {
      placeBitmapEditorClipboard({ x, y }, "move", placedClipboard, "copy", true, true, true, selection, true, selection);
      setImageStatus(`Selection ${transform === "mirror-x" ? "mirrored horizontally" : transform === "mirror-y" ? "mirrored vertically" : transform === "rotate-cw" ? "rotated 90° clockwise" : "rotated 90° counterclockwise"}.`);
    } else {
      setImageStatus(`${bitmapEditorPasteMode === "move" ? "Move" : "Paste"} clipboard ${transform === "mirror-x" ? "mirrored horizontally" : transform === "mirror-y" ? "mirrored vertically" : transform === "rotate-cw" ? "rotated 90° clockwise" : "rotated 90° counterclockwise"} · click a destination to finish.`);
    }
  }

  function eraseBitmapEditorSelection(): void {
    const selection = bitmapEditorRegionSelection;
    const result = bitmapEditorActiveResult();
    const current = bitmapEditorActiveNativeBuffer();
    if (selection === null || result === null || current === null) return;
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, result.frames.length - 1);
    const input = resultFrameInput(result, frameIndex);
    if (input === null) return;
    const erasePixels = new Uint8Array(selection.width * selection.height).fill(1);
    const next = composeNativeResultRegion(
      current, input, erasePixels, selection.mask, selection.width, selection.height,
      selection.x, selection.y, "and", bitmapEditorResultPaletteIndex,
    );
    commitBitmapEditorResultEdit(result, frameIndex, current, next);
    setImageStatus("Selected pixels erased.");
  }

  function chooseBitmapEditorOperation(operation: BitmapEditorOperation): void {
    setBitmapEditorOperation(operation);
    const selection = bitmapEditorRegionSelection;
    if (bitmapEditorPasteMode !== null || selection === null) return;
    if (operation === "and") {
      eraseBitmapEditorSelection();
      return;
    }
    if (operation === "none") {
      setBitmapEditorRegionSelection(null);
      setBitmapEditorSelectionDraft(null);
      setBitmapEditorPasteMode(null);
      setBitmapEditorSelectionTool("rectangle");
      setImageStatus("Selection cleared · bitmap unchanged.");
      return;
    }
    if (operation === "copy" || operation === "or" || operation === "xor") {
      copyBitmapEditorSelection();
      setBitmapEditorPasteMode("copy");
      setBitmapEditorSelectionTool("none");
      setImageStatus(`Selected region ready to place · ${bitmapEditorOperationLabel(operation)} operation · click destination or Esc to finish.`);
    }
  }

  function makeBitmapEditorColorTransform(
    result: WorkerConversionResult,
    frameIndex: number,
    current: NativeResultBitmap,
    operation: "replace" | "increase" | "decrease",
    from: number,
    to: number,
    channel: "both" | "ink" | "paper",
    scope: "selection" | "image",
  ): NativeResultBitmap | null {
    const input = resultFrameInput(result, frameIndex);
    if (input === null) return null;
    const selection = bitmapEditorRegionSelection;
    if (scope === "selection" && selection === null) {
      setImageStatus("Select an area first, or apply the color operation to the whole image.");
      return null;
    }
    if (result.platformId === "zx-spectrum") {
      if (input.attributeHeight === null) return null;
      const encoded = current.encoded.slice();
      for (let cellY = 0; cellY < 192 / input.attributeHeight; cellY += 1) {
        for (let cellX = 0; cellX < 32; cellX += 1) {
          if (scope === "selection" && selection !== null) {
            let intersects = false;
            const left = cellX * 8;
            const top = cellY * input.attributeHeight;
            for (let y = top; y < top + input.attributeHeight && !intersects; y += 1) {
              for (let x = left; x < left + 8; x += 1) {
                const sx = x - selection.x;
                const sy = y - selection.y;
                if (sx >= 0 && sx < selection.width && sy >= 0 && sy < selection.height && selection.mask[sy * selection.width + sx] === 1) {
                  intersects = true;
                  break;
                }
              }
            }
            if (!intersects) continue;
          }
          const offset = ZX_BITMAP_BYTES + cellY * 32 + cellX;
          const attribute = encoded[offset] ?? 0;
          const adjust = (value: number): number => operation === "replace"
            ? value === from ? to : value
            : Math.max(0, Math.min(7, value + (operation === "increase" ? 1 : -1)));
          const ink = channel === "paper" ? attribute & 7 : adjust(attribute & 7);
          const paper = channel === "ink" ? (attribute >> 3) & 7 : adjust((attribute >> 3) & 7);
          encoded[offset] = (attribute & 0xc0) | ink | (paper << 3);
        }
      }
      return createNativeResultBitmap({ ...input, encoded });
    }
    const mask = new Uint8Array(current.width * current.height);
    if (scope === "image" || selection === null) mask.fill(1);
    else {
      for (let y = 0; y < selection.height; y += 1) {
        for (let x = 0; x < selection.width; x += 1) {
          if (selection.mask[y * selection.width + x] !== 1) continue;
          const absoluteX = selection.x + x;
          const absoluteY = selection.y + y;
          if (absoluteX >= 0 && absoluteX < current.width && absoluteY >= 0 && absoluteY < current.height) {
            mask[absoluteY * current.width + absoluteX] = 1;
          }
        }
      }
    }
    return applyNativePaletteIndexOperation(current, input, mask, operation, from, to);
  }

  function previewBitmapEditorColorTransform(
    operation: "replace" | "increase" | "decrease" = bitmapEditorColorOperation,
    overrides: Partial<{ from: number; to: number; channel: "both" | "ink" | "paper"; scope: "selection" | "image" }> = {},
  ): void {
    const result = bitmapEditorCurrentResultRef.current ?? draftPreviewResult(draftState) ?? lastFinal;
    if (result === null) return;
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, Math.max(0, result.frames.length - 1));
    const current = bitmapEditorResultBufferRef.current ?? initializeResultEditor(result, frameIndex);
    if (current === null) return;
    const existingDraft = bitmapEditorColorDraftRef.current;
    const draftMatchesTarget = existingDraft?.result === result && existingDraft.frameIndex === frameIndex;
    const baseline = draftMatchesTarget ? existingDraft.baseline : cloneNativeResultBitmap(current);
    if (!draftMatchesTarget) bitmapEditorColorDraftRef.current = { result, frameIndex, baseline, steps: 0 };
    try {
      const from = overrides.from ?? bitmapEditorColorFrom;
      const to = overrides.to ?? bitmapEditorColorTo;
      const channel = overrides.channel ?? bitmapEditorColorChannel;
      const scope = overrides.scope ?? bitmapEditorColorScope;
      let next = baseline;
      const iterations = operation === "replace" ? 1 : Math.abs(bitmapEditorColorDraftRef.current?.steps ?? 0);
      for (let step = 0; step < iterations; step += 1) {
        const direction = (bitmapEditorColorDraftRef.current?.steps ?? 0) < 0 ? "decrease" : "increase";
        const transformOperation = operation === "replace" ? "replace" : direction;
        const transformed = makeBitmapEditorColorTransform(result, frameIndex, next, transformOperation, from, to, channel, scope);
        if (transformed === null) break;
        next = transformed;
      }
      if (next !== null) setResultEditorBuffer(next);
    } catch {
      setExportError("Bitmap editor could not preview the color transform.");
    }
  }

  function applyBitmapEditorColorStep(operation: "increase" | "decrease"): void {
    const result = bitmapEditorCurrentResultRef.current ?? draftPreviewResult(draftState) ?? lastFinal;
    if (result === null) return;
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, Math.max(0, result.frames.length - 1));
    const current = bitmapEditorResultBufferRef.current ?? initializeResultEditor(result, frameIndex);
    if (current === null) return;
    let draft = bitmapEditorColorDraftRef.current;
    if (draft?.result !== result || draft.frameIndex !== frameIndex) {
      draft = { result, frameIndex, baseline: cloneNativeResultBitmap(current), steps: 0 };
      bitmapEditorColorDraftRef.current = draft;
    }
    draft.steps = Math.max(-7, Math.min(7, draft.steps + (operation === "increase" ? 1 : -1)));
    setBitmapEditorColorOperation(operation);
    previewBitmapEditorColorTransform(operation);
    const stepDirection = draft.steps > 0 ? "up" : draft.steps < 0 ? "down" : "unchanged";
    setImageStatus(`Color preview adjusted ${stepDirection} (${Math.abs(draft.steps)} step${Math.abs(draft.steps) === 1 ? "" : "s"}). Apply to save; Undo restores the saved colors.`);
  }

  function commitBitmapEditorColorDraft(): void {
    const draft = bitmapEditorColorDraftRef.current;
    if (draft === null) return;
    const preview = bitmapEditorResultBufferRef.current;
    bitmapEditorColorDraftRef.current = null;
    if (preview === null) return;
    const changed = commitBitmapEditorResultEdit(draft.result, draft.frameIndex, draft.baseline, preview);
    setImageStatus(changed ? "Color changes saved to the result. Use Undo to restore the previous colors." : "No color changes to save.");
  }

  function cancelBitmapEditorColorDraft(): void {
    const draft = bitmapEditorColorDraftRef.current;
    if (draft === null) return;
    bitmapEditorColorDraftRef.current = null;
    setResultEditorBuffer(draft.baseline);
    setImageStatus("Palette changes canceled. The image is back to its original colors.");
  }

  function startBitmapEditorPaste(mode: "copy" | "move"): void {
    if (bitmapEditorActiveResult() === null || bitmapEditorActiveNativeBuffer() === null) {
      setImageStatus("Selection paste is available on the converted result.");
      return;
    }
    if (!bitmapEditorPastePixels && !bitmapEditorPasteAttributes) {
      setImageStatus("Turn on PIXELS, ATTRS, or both before pasting.");
      return;
    }
    if (bitmapEditorClipboard === null && bitmapEditorRegionSelection !== null) {
      copyBitmapEditorSelection();
    }
    if (bitmapEditorClipboard === null && bitmapEditorRegionSelection === null) return;
    setBitmapEditorPasteMode(mode);
    setBitmapEditorSelectionTool("none");
    const willPasteAttributes = bitmapEditorPasteAttributes && bitmapEditorActiveResult()?.platformId === "zx-spectrum";
    setImageStatus(mode === "move"
      ? "Move selected content · click a destination. Turn Selection mode Off to stop."
      : `Paste ${bitmapEditorPastePixels ? "pixels" : ""}${bitmapEditorPastePixels && willPasteAttributes ? " and " : ""}${willPasteAttributes ? "attributes" : ""} · click a destination. Turn Selection mode Off to stop.`);
  }

  function shiftBitmapEditorSelection(
    direction: "left" | "right" | "up" | "down",
    resolution: BitmapSelectionResolution = "pixel",
  ): void {
    const selection = bitmapEditorRegionSelection;
    const result = bitmapEditorActiveResult();
    const current = bitmapEditorActiveNativeBuffer();
    if (selection === null || result === null || current === null) return;
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, result.frames.length - 1);
    const input = resultFrameInput(result, frameIndex);
    if (input === null) return;
    const values = new Uint8Array(selection.width * selection.height);
    for (let y = 0; y < selection.height; y += 1) {
      for (let x = 0; x < selection.width; x += 1) {
        const offset = y * selection.width + x;
        if (selection.mask[offset] !== 1) continue;
        values[offset] = current.paletteIndices[(selection.y + y) * current.width + selection.x + x] ?? 0;
      }
    }
    const stepCount = resolution === "attribute"
      ? direction === "left" || direction === "right" ? selection.gridWidth : selection.gridHeight
      : 1;
    let shiftedValues: Uint8Array<ArrayBufferLike> = values;
    for (let step = 0; step < stepCount; step += 1) {
      shiftedValues = shiftBitmapRegionPixels(shiftedValues, selection.mask, selection.width, selection.height, direction);
    }
    let next = composeNativeResultRegion(
      current,
      input,
      shiftedValues,
      selection.mask,
      selection.width,
      selection.height,
      selection.x,
      selection.y,
      "copy",
      bitmapEditorResultPaletteIndex,
    );
    if (resolution === "attribute" && next.platformId === "zx-spectrum" && input.attributeHeight !== null) {
      const cellWidth = selection.gridWidth;
      const cellHeight = selection.gridHeight;
      const columns = Math.floor(selection.width / cellWidth);
      const rows = Math.floor(selection.height / cellHeight);
      const firstCellX = Math.floor(selection.x / cellWidth);
      const firstCellY = Math.floor(selection.y / cellHeight);
      if (columns > 0 && rows > 0 && cellWidth === 8 && cellHeight === input.attributeHeight) {
        const cellMask = new Uint8Array(columns * rows);
        const cellValues = new Uint8Array(columns * rows);
        for (let cellY = 0; cellY < rows; cellY += 1) {
          for (let cellX = 0; cellX < columns; cellX += 1) {
            let fullySelected = true;
            for (let y = 0; y < cellHeight && fullySelected; y += 1) {
              for (let x = 0; x < cellWidth; x += 1) {
                const localX = cellX * cellWidth + x;
                const localY = cellY * cellHeight + y;
                if (selection.mask[localY * selection.width + localX] !== 1) {
                  fullySelected = false;
                  break;
                }
              }
            }
            if (!fullySelected) continue;
            const localCell = cellY * columns + cellX;
            const absoluteCellX = firstCellX + cellX;
            const absoluteCellY = firstCellY + cellY;
            cellMask[localCell] = 1;
            cellValues[localCell] = current.encoded[ZX_BITMAP_BYTES + absoluteCellY * 32 + absoluteCellX] ?? 0;
          }
        }
        const shiftedAttributes = shiftBitmapRegionPixels(cellValues, cellMask, columns, rows, direction);
        const encoded = next.encoded.slice();
        for (let cellY = 0; cellY < rows; cellY += 1) {
          for (let cellX = 0; cellX < columns; cellX += 1) {
            const localCell = cellY * columns + cellX;
            if (cellMask[localCell] !== 1) continue;
            const absoluteCellX = firstCellX + cellX;
            const absoluteCellY = firstCellY + cellY;
            encoded[ZX_BITMAP_BYTES + absoluteCellY * 32 + absoluteCellX] = shiftedAttributes[localCell] ?? 0;
          }
        }
        next = createNativeResultBitmap({ ...input, encoded });
      }
    }
    commitBitmapEditorResultEdit(result, frameIndex, current, next);
    setImageStatus(resolution === "attribute" && result.platformId === "zx-spectrum"
      ? `Selected pixels and attributes rotated ${direction} with wrap.`
      : `Selected pixels rotated ${direction} with wrap.`);
  }

  const bitmapEditorColorForState: BitmapPixelColor = (x, y, on) => {
    if (bitmapEditorTarget === "source") return bitmapEditorSourceColor;
    const activeResult = draftPreviewResult(draftState) ?? lastFinal;
    if (activeResult?.platformId !== "zx-spectrum") return null;
    const frameIndex = bitmapEditorTarget === "result"
      ? bitmapEditorResultFrameIndex
      : outputPreviewStage === "screen-2" ? 1 : 0;
    const encoded = bitmapEditorTarget === "result"
      ? bitmapEditorResultBufferRef.current?.encoded ?? activeResult.frames[frameIndex]?.encoded
      : activeResult.frames[frameIndex]?.encoded ?? activeResult.frames[0]?.encoded;
    if (encoded === undefined || x >= 256 || y >= 192) return null;
    const activeAttributeHeight = activeResult.attributeHeight ?? attributeHeight;
    if (activeAttributeHeight === null || encoded.length < 6144 + 32 * (192 / activeAttributeHeight)) return null;
    let inspected: InspectedAttribute;
    try {
      inspected = inspectSoftwareScr(encoded, activeAttributeHeight, x, y);
    } catch {
      return null;
    }
    const colorCode = on
      ? (bitmapEditorInkColor ?? inspected.ink)
      : (bitmapEditorPaperColor ?? inspected.paper);
    const paletteColor = ZX_BASE_COLORS[colorCode];
    if (paletteColor === undefined) return null;
    const bright = bitmapEditorBrightPolicy ?? inspected.bright;
    const rgb = hexToRgb(bright ? paletteColor.bright : paletteColor.normal);
    return [rgb.r, rgb.g, rgb.b, 255];
  };

  function captureBitmapEditorSourceColor(x: number, y: number): void {
    const source = bitmapEditorFullBufferRef.current ?? fullBitmapBufferFromSource();
    if (source === null || x >= source.width || y >= source.height) return;
    const offset = (y * source.width + x) * 4;
    setBitmapEditorSourceColor([
      source.rgba[offset] ?? 0,
      source.rgba[offset + 1] ?? 0,
      source.rgba[offset + 2] ?? 0,
      source.rgba[offset + 3] ?? 255,
    ]);
    setBitmapEditorColorPickerActive(false);
  }

  function captureBitmapEditorAttribute(pixelX: number, pixelY: number): void {
    const activeResult = draftPreviewResult(draftState) ?? lastFinal;
    if (activeResult === null || activeResult.platformId !== "zx-spectrum") return;
    const frameIndex = bitmapEditorTarget === "result"
      ? bitmapEditorResultFrameIndex
      : outputPreviewStage === "screen-2" ? 1 : 0;
    const encoded = bitmapEditorTarget === "result"
      ? bitmapEditorResultBufferRef.current?.encoded ?? activeResult.frames[frameIndex]?.encoded
      : activeResult.frames[frameIndex]?.encoded ?? activeResult.frames[0]?.encoded;
    if (encoded === undefined) return;
    const selected = inspectSoftwareScr(
      encoded,
      activeResult.attributeHeight ?? attributeHeight,
      Math.max(0, Math.min(255, pixelX)),
      Math.max(0, Math.min(191, pixelY)),
    );
    setInspection(selected);
    setBitmapEditorSelection(selected);
    setBitmapEditorCell({
      rows: Uint8Array.from(selected.bitmapBytes.slice(0, 8)),
      attribute: selected.attribute,
    });
    setBitmapEditorInkColor(selected.ink);
    setBitmapEditorPaperColor(selected.paper);
    setBitmapEditorBrightPolicy(selected.bright);
    setBitmapEditorFlashPolicy((selected.attribute & 0x80) !== 0);
    setBitmapEditorColorPickerActive(false);
  }

  function captureBitmapEditorResultColor(x: number, y: number): void {
    const result = draftPreviewResult(draftState) ?? lastFinal;
    const buffer = bitmapEditorResultBufferRef.current ??
      (result === null ? null : initializeResultEditor(result, bitmapEditorResultFrameIndex));
    if (buffer === null || x >= buffer.width || y >= buffer.height) return;
    const index = buffer.paletteIndices[y * buffer.width + x] ?? 0;
    setBitmapEditorResultPaletteIndex(index === 0 ? 1 : index);
    if (buffer.platformId === "zx-spectrum") captureBitmapEditorAttribute(x, y);
    else setBitmapEditorColorPickerActive(false);
  }

  function updateResultPreviewFromBitmap(buffer: BitmapEditorBuffer): void {
    const activeResult = draftPreviewResult(draftState) ?? lastFinal;
    if (activeResult === null) return;
    const frameIndex = outputPreviewStage === "screen-2" ? 1 : 0;
    const frames = activeResult.frames.map((frame, index) =>
      index === frameIndex && frame.previewRgba.length === buffer.rgba.length
        ? { ...frame, previewRgba: buffer.rgba.slice() }
        : frame,
    );
    const nextResult: WorkerConversionResult = {
      ...activeResult,
      frames,
      previewRgba: buffer.rgba.slice(),
      mergedPreviewRgba: buffer.rgba.slice(),
    };
    setDraftState({ kind: "idle" });
    setLastFinal(nextResult);
    setState({ kind: "ready", result: nextResult });
  }

  function promoteBitmapSource(pixel: { readonly x: number; readonly y: number }): void {
    if (bitmapEditorScope !== "pixel") return;
    const base = bitmapEditorFullBufferRef.current ?? fullBitmapBufferFromSource();
    if (base === null || image === null) return;
    if (bitmapEditorFullBufferRef.current === null) {
      setBitmapEditorRevertSource({ ...image, rgba: image.rgba.slice() });
    }
    const pointer = bitmapEditorFullPointerRef.current;
    const pixels = bitmapEditorBrushPixels(pixel.x, pixel.y, bitmapEditorBrushSize, base.width, base.height)
      .filter((point) => pointer === null || !pointer.visited.has(`${point.x},${point.y}`));
    for (const point of pixels) pointer?.visited.add(`${point.x},${point.y}`);
    const sourcePaintMode = bitmapEditorOperation === "xor"
      ? "toggle"
      : bitmapEditorOperation === "and" ? "reset" : bitmapEditorOperation === "none" ? "none" : "set";
    const next = paintPixels(base, pixels, sourcePaintMode, bitmapEditorColorForState);
    let changed = next.rgba.length !== base.rgba.length;
    if (!changed) {
      for (let index = 0; index < next.rgba.length; index += 1) {
        if (next.rgba[index] !== base.rgba[index]) { changed = true; break; }
      }
    }
    if (!changed) return;
    bitmapEditorFullBufferRef.current = next;
    setBitmapEditorBuffer(next);
    if (pointer !== null && !pointer.historyCaptured) {
      setBitmapEditorUndoFull((history) => [...history, cloneBitmapBuffer(base)]);
      pointer.historyCaptured = true;
    }
    setBitmapEditorRedoFull([]);
    setImage({ ...image, width: next.width, height: next.height, rgba: next.rgba.slice() });
    skipNextDraftAfterBitmapEditRef.current = false;
    setImageStatus("Working source · manually edited. Convert will reprocess the edited source with current settings.");
    setDirty(true);
  }

  function promoteBitmapResult(pixel: { readonly x: number; readonly y: number }): void {
    if (bitmapEditorScope !== "pixel") return;
    const result = bitmapEditorCurrentResultRef.current ?? draftPreviewResult(draftState) ?? lastFinal;
    if (result === null) return;
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, Math.max(0, result.frames.length - 1));
    const input = resultFrameInput(result, frameIndex);
    if (input === null) return;
    const current = bitmapEditorResultBufferRef.current ?? initializeResultEditor(result, frameIndex);
    if (current === null) return;
    const pointer = bitmapEditorFullPointerRef.current;
    const pixels = bitmapEditorBrushPixels(pixel.x, pixel.y, bitmapEditorBrushSize, current.width, current.height)
      .filter((point) => pointer === null || !pointer.visited.has(`${point.x},${point.y}`));
    for (const point of pixels) pointer?.visited.add(`${point.x},${point.y}`);
    if (bitmapEditorStippleEnabled && bitmapEditorOperation !== "none") {
      const matrix = bitmapEditorOrderedMatrix();
      if (matrix !== null && pixels.length > 0) {
        const left = Math.min(...pixels.map(({ x }) => x));
        const top = Math.min(...pixels.map(({ y }) => y));
        const right = Math.max(...pixels.map(({ x }) => x));
        const bottom = Math.max(...pixels.map(({ y }) => y));
        const width = right - left + 1;
        const height = bottom - top + 1;
        const mask = new Uint8Array(width * height);
        const paletteIndices = new Uint8Array(width * height);
        for (const point of pixels) mask[(point.y - top) * width + point.x - left] = 1;
        const stipplePixels = bitmapEditorStippleFootprint(
          pixel.x, pixel.y, bitmapEditorBrushSize, current.width, current.height,
          matrix, bitmapEditorStippleDensity, false,
        );
        for (const point of stipplePixels) {
          if (point.x < left || point.x > right || point.y < top || point.y > bottom) continue;
          paletteIndices[(point.y - top) * width + point.x - left] = Math.max(1, bitmapEditorResultPaletteIndex);
        }
        let next = composeNativeResultRegion(
          current, input, paletteIndices, mask, width, height, left, top,
          bitmapEditorOperation, bitmapEditorResultPaletteIndex,
        );
        if (next.platformId === "zx-spectrum" && input.attributeHeight !== null) {
          const encoded = applyBitmapEditorAttributesToPixels(next.encoded, input.attributeHeight, pixels);
          next = createNativeResultBitmap({ ...input, encoded });
        }
        commitBitmapEditorResultEdit(result, frameIndex, current, next);
        return;
      }
    }
    let next = applyNativeResultPixels(
      current,
      input,
      pixels,
      bitmapEditorOperation,
      bitmapEditorResultPaletteIndex,
    );
    if (input.platformId === "zx-spectrum" && input.attributeHeight !== null) {
      const encoded = applyBitmapEditorAttributesToPixels(next.encoded, input.attributeHeight, pixels);
      next = createNativeResultBitmap({ ...input, encoded });
    }
    commitBitmapEditorResultEdit(result, frameIndex, current, next);
  }

  function floodFillBitmapResult(seed: { readonly x: number; readonly y: number }): void {
    if (bitmapEditorTarget !== "result") return;
    const result = bitmapEditorCurrentResultRef.current ?? draftPreviewResult(draftState) ?? lastFinal;
    if (result === null) return;
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, Math.max(0, result.frames.length - 1));
    const input = resultFrameInput(result, frameIndex);
    if (input === null) return;
    const current = bitmapEditorResultBufferRef.current ?? initializeResultEditor(result, frameIndex);
    if (current === null) return;
    const region = bitmapEditorConnectedRegion(current.paletteIndices, current.width, current.height, seed.x, seed.y);
    if (region.length === 0) return;

    let next: NativeResultBitmap;
    const matrix = bitmapEditorStippleEnabled && bitmapEditorOperation !== "none"
      ? bitmapEditorOrderedMatrix()
      : null;
    if (matrix !== null) {
      let left = current.width;
      let top = current.height;
      let right = -1;
      let bottom = -1;
      for (const point of region) {
        left = Math.min(left, point.x);
        top = Math.min(top, point.y);
        right = Math.max(right, point.x);
        bottom = Math.max(bottom, point.y);
      }
      const width = right - left + 1;
      const height = bottom - top + 1;
      const mask = new Uint8Array(width * height);
      const paletteIndices = new Uint8Array(width * height);
      for (const point of region) {
        const offset = (point.y - top) * width + point.x - left;
        mask[offset] = 1;
        if (bitmapPrimitiveStippleOn(point.x, point.y, matrix, bitmapEditorStippleDensity)) {
          paletteIndices[offset] = Math.max(1, bitmapEditorResultPaletteIndex);
        }
      }
      next = composeNativeResultRegion(
        current,
        input,
        paletteIndices,
        mask,
        width,
        height,
        left,
        top,
        bitmapEditorOperation,
        bitmapEditorResultPaletteIndex,
      );
    } else {
      next = applyNativeResultPixels(
        current,
        input,
        region,
        bitmapEditorOperation,
        bitmapEditorResultPaletteIndex,
      );
    }
    if (next.platformId === "zx-spectrum" && input.attributeHeight !== null) {
      const encoded = applyBitmapEditorAttributesToPixels(next.encoded, input.attributeHeight, region);
      next = createNativeResultBitmap({ ...input, encoded });
    }
    bitmapEditorFullPointerRef.current = null;
    commitBitmapEditorResultEdit(result, frameIndex, current, next);
    setImageStatus(`Flood fill · ${region.length.toLocaleString()} connected pixels updated.`);
  }

  function selectBitmapEditorScope(scope: BitmapEditorScope): void {
    setBitmapEditorScope(scope);
  }

  function cycleBitmapEditorBrushSize(): void {
    setBitmapEditorBrushSize((size) => nextBitmapEditorBrushSize(size));
  }

  function cycleBitmapEditorCellMode(): void {
    setBitmapEditorCellMode((mode) => nextBitmapEditorCellMode(mode));
  }

  function cycleBitmapEditorOperation(): void {
    const operations: readonly BitmapEditorOperation[] = ["copy", "or", "and", "xor", "none"];
    setBitmapEditorOperation((operation) => operations[(operations.indexOf(operation) + 1) % operations.length]!);
  }

  function toggleBitmapEditorColorPicker(): void {
    setBitmapEditorColorPickerActive((active) => !active);
  }

  function toggleBitmapEditorPatternPicker(): void {
    setBitmapEditorPatternPickerActive((active) => !active);
  }

  function fullBitmapPixelFromEvent(
    event: { readonly currentTarget: HTMLElement; readonly clientX: number; readonly clientY: number },
    clampToBitmap = false,
  ): { readonly x: number; readonly y: number } | null {
    const rect = event.currentTarget.getBoundingClientRect();
    const activeBuffer = bitmapEditorTarget === "result"
      ? bitmapEditorResultBuffer
      : bitmapEditorBuffer;
    const frame = displayedResult?.frames[bitmapEditorResultFrameIndex];
    const width = activeBuffer?.width ?? (bitmapEditorTarget === "result" ? frame?.nativeWidth : undefined) ?? displayedWidth;
    const height = activeBuffer?.height ?? (bitmapEditorTarget === "result" ? frame?.nativeHeight : undefined) ?? displayedHeight;
    const rawX = Math.floor((event.clientX - rect.left) / rect.width * width);
    const rawY = Math.floor((event.clientY - rect.top) / rect.height * height);
    const x = clampToBitmap ? Math.max(0, Math.min(width - 1, rawX)) : rawX;
    const y = clampToBitmap ? Math.max(0, Math.min(height - 1, rawY)) : rawY;
    return x >= 0 && x < width && y >= 0 && y < height ? { x, y } : null;
  }

  function fullBitmapAttributeCellFromEvent(
    event: ReactPointerEvent<HTMLDivElement>,
  ): { readonly cellX: number; readonly cellY: number } | null {
    const pixel = fullBitmapPixelFromEvent(event);
    const activeResult = draftPreviewResult(draftState) ?? lastFinal;
    const activeHeight = activeResult?.platformId === "zx-spectrum"
      ? activeResult.attributeHeight
      : null;
    if (pixel === null || activeHeight === null || activeHeight === undefined) return null;
    return { cellX: Math.floor(pixel.x / 8), cellY: Math.floor(pixel.y / activeHeight) };
  }

  function bitmapEditorNativeSourcePickerActive(): boolean {
    return bitmapEditorTarget === "result" && displayedResult?.platformId === "zx-spectrum" &&
      (bitmapEditorColorPickerActive || bitmapEditorPatternPickerActive);
  }

  function bitmapEditorNativeCellToolActive(): boolean {
    return bitmapEditorTarget === "result" && displayedResult?.platformId === "zx-spectrum" &&
      bitmapEditorScope === "cell";
  }

  function commitBitmapPrimitive(kind: BitmapPrimitiveKind, first: { readonly x: number; readonly y: number }, second: { readonly x: number; readonly y: number }): void {
    const result = bitmapEditorCurrentResultRef.current ?? draftPreviewResult(draftState) ?? lastFinal;
    if (result === null || bitmapEditorTarget !== "result") return;
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, Math.max(0, result.frames.length - 1));
    const input = resultFrameInput(result, frameIndex);
    const current = bitmapEditorResultBufferRef.current ?? initializeResultEditor(result, frameIndex);
    if (input === null || current === null) return;

    const geometry = rasterizeBitmapPrimitive(kind, first, second, current.width, current.height);
    const outline = bitmapEditorPrimitiveStrokeEnabled
      ? rasterizeBitmapBrushStroke(geometry.outline, (x, y) => bitmapEditorBrushPixels(x, y, bitmapEditorBrushSize, current.width, current.height))
      : [];
    const fill = bitmapEditorPrimitiveFillEnabled ? geometry.fill : [];
    let next = current;
    const paletteIndex = current.platformId === "zx-spectrum" ? 1 : bitmapEditorResultPaletteIndex;

    const applyLayer = (
      points: readonly { readonly x: number; readonly y: number }[],
      operation: BitmapEditorOperation,
      patternOn: (x: number, y: number) => boolean,
    ) => {
      if (points.length === 0) return;
      let left = current.width;
      let top = current.height;
      let right = -1;
      let bottom = -1;
      for (const point of points) {
        left = Math.min(left, point.x);
        top = Math.min(top, point.y);
        right = Math.max(right, point.x);
        bottom = Math.max(bottom, point.y);
      }
      const layerWidth = right - left + 1;
      const layerHeight = bottom - top + 1;
      const mask = new Uint8Array(layerWidth * layerHeight);
      const indices = new Uint8Array(layerWidth * layerHeight);
      for (const point of points) {
        const offset = (point.y - top) * layerWidth + point.x - left;
        mask[offset] = 1;
        indices[offset] = patternOn(point.x, point.y) ? paletteIndex : 0;
      }
      next = composeNativeResultRegion(
        next,
        { ...input, encoded: next.encoded },
        indices,
        mask,
        layerWidth,
        layerHeight,
        left,
        top,
        operation,
        paletteIndex,
      );
    };

    const matrix = bitmapEditorOrderedMatrix();
    const orderedPatternOn = (x: number, y: number) =>
      matrix === null || bitmapPrimitiveStippleOn(x, y, matrix, bitmapEditorStippleDensity);
    const strokePatternOn = (x: number, y: number) => {
      if (bitmapEditorPrimitiveStrokePattern === "solid") return true;
      if (bitmapEditorPrimitiveStrokePattern === "empty") return false;
      if (bitmapEditorPrimitiveStrokePattern === "custom") {
        return bitmapEditorPrimitiveCustomPattern !== null &&
          bitmapCustomPatternOn(x, y, bitmapEditorPrimitiveCustomPattern);
      }
      return orderedPatternOn(x, y);
    };
    applyLayer(outline, bitmapEditorOperation, strokePatternOn);
    applyLayer(fill, bitmapEditorPrimitiveFillOperation, (x, y) => {
      if (bitmapEditorPrimitiveFillPattern === "solid") return true;
      if (bitmapEditorPrimitiveFillPattern === "empty") return false;
      if (bitmapEditorPrimitiveFillPattern === "custom") {
        return bitmapEditorPrimitiveCustomPattern !== null &&
          bitmapCustomPatternOn(x, y, bitmapEditorPrimitiveCustomPattern);
      }
      return orderedPatternOn(x, y);
    });

    const affected = [...outline, ...fill];
    if (next.platformId === "zx-spectrum" && input.attributeHeight !== null && affected.length > 0) {
      const encoded = applyBitmapEditorAttributesToPixels(next.encoded, input.attributeHeight, affected);
      next = createNativeResultBitmap({ ...input, encoded });
    }
    commitBitmapEditorResultEdit(result, frameIndex, current, next);
  }

  function sampleBitmapEditorPrimitivePattern(pixel: { readonly x: number; readonly y: number }): void {
    const bitmap = bitmapEditorActiveNativeBuffer();
    if (bitmap === null) return;
    const originX = Math.floor(pixel.x / 8) * 8;
    const originY = Math.floor(pixel.y / 8) * 8;
    setBitmapEditorPrimitiveCustomPattern(sampleBitmapPrimitivePattern(bitmap.paletteIndices, bitmap.width, bitmap.height, pixel));
    setBitmapEditorPrimitivePatternPickerActive(false);
    setImageStatus(`Custom primitive pattern sampled from ${originX},${originY} · 8×8.`);
  }

  function placeBitmapEditorPrimitivePoint(
    point: { readonly x: number; readonly y: number },
  ): void {
    const kind = bitmapEditorPrimitiveKind;
    // Ctrl+click/Enter remains supported as an explicit corner-placement gesture,
    // but ordinary clicks are also accepted so these tools are discoverable.
    setBitmapEditorPrimitiveCursor(point);
    const draft = bitmapEditorPrimitiveDraft;
    if (draft === null || draft.kind !== kind) {
      setBitmapEditorPrimitiveDraft({ kind, start: point, current: point });
      return;
    }
    commitBitmapPrimitive(kind, draft.start, point);
    if (kind === "line") setBitmapEditorPrimitiveDraft({ kind, start: point, current: point });
    else setBitmapEditorPrimitiveDraft(null);
  }

  function moveBitmapEditorPrimitiveCursor(dx: number, dy: number): void {
    const dimensions = bitmapEditorSelectionDimensions();
    if (dimensions === null) return;
    const current = bitmapEditorPrimitiveCursor ?? {
      x: Math.floor(dimensions.width / 2),
      y: Math.floor(dimensions.height / 2),
    };
    const point = {
      x: Math.max(0, Math.min(dimensions.width - 1, current.x + dx)),
      y: Math.max(0, Math.min(dimensions.height - 1, current.y + dy)),
    };
    setBitmapEditorPrimitiveCursor(point);
    setBitmapEditorPrimitiveDraft((draft) => draft === null ? null : { ...draft, current: point });
  }

  function applyBitmapEditorCellOperation(cellX: number, cellY: number): boolean {
    const result = bitmapEditorCurrentResultRef.current ?? draftPreviewResult(draftState) ?? lastFinal;
    if (result?.platformId !== "zx-spectrum") return false;
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, Math.max(0, result.frames.length - 1));
    const input = resultFrameInput(result, frameIndex);
    const current = bitmapEditorResultBufferRef.current ?? initializeResultEditor(result, frameIndex);
    if (input === null || input.attributeHeight === null || current === null) return false;
    const maskRows = bitmapEditorCellMode === "filled"
      ? new Uint8Array(input.attributeHeight).fill(0xff)
      : bitmapEditorPickedCell !== null && bitmapEditorPickedCell.attributeHeight === input.attributeHeight && bitmapEditorPickedFrameIndex === frameIndex
        ? bitmapEditorPickedCell.rows.slice()
        : new Uint8Array(input.attributeHeight);
    let encoded: Uint8Array;
    try {
      encoded = applyZxAttributeCellMaskOperation(current.encoded, input.attributeHeight, cellX, cellY, maskRows, bitmapEditorOperation);
      const destination = readZxAttributeCell(encoded, input.attributeHeight, cellX, cellY);
      const colored = applyZxAttributeSelection(destination, bitmapEditorAttributeSelection());
      if (colored.attribute !== destination.attribute) {
        encoded[ZX_BITMAP_BYTES + cellY * 32 + cellX] = colored.attribute;
      }
    } catch {
      setExportError("Bitmap editor could not apply the attribute-cell operation.");
      return false;
    }
    try {
      const nextBitmap = createNativeResultBitmap({ ...input, encoded });
      return commitBitmapEditorResultEdit(result, frameIndex, current, nextBitmap);
    } catch {
      setExportError("Bitmap editor could not render the edited attribute cell.");
      return false;
    }
  }

  function makeSelectionDraft(kind: BitmapSelectionKind, points: readonly { readonly x: number; readonly y: number }[]): BitmapRegionSelection | null {
    const dimensions = bitmapEditorSelectionDimensions();
    if (dimensions === null) return null;
    return makeBitmapRegionSelection(
      kind,
      kind === "rectangle" && points.length > 1 ? [points[0]!, points[points.length - 1]!] : points,
      dimensions.width,
      dimensions.height,
      bitmapEditorSelectionResolution,
      bitmapEditorAttributeGrid(),
    );
  }

  function bitmapSelectionResizeHandleAt(
    selection: BitmapRegionSelection,
    event: ReactPointerEvent<HTMLDivElement>,
  ): BitmapSelectionResizeHandle | null {
    if (!selection.mask.every((pixel) => pixel === 1)) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const dimensions = bitmapEditorSelectionDimensions();
    if (dimensions === null || rect.width <= 0 || rect.height <= 0) return null;
    const left = rect.left + selection.x / dimensions.width * rect.width;
    const right = rect.left + (selection.x + selection.width) / dimensions.width * rect.width;
    const top = rect.top + selection.y / dimensions.height * rect.height;
    const bottom = rect.top + (selection.y + selection.height) / dimensions.height * rect.height;
    const edgeThresholdX = Math.max(10, rect.width / dimensions.width * 0.65);
    const edgeThresholdY = Math.max(10, rect.height / dimensions.height * 0.65);
    const edgeX = Math.abs(event.clientX - left) <= edgeThresholdX ? "w" : Math.abs(event.clientX - right) <= edgeThresholdX ? "e" : null;
    const edgeY = Math.abs(event.clientY - top) <= edgeThresholdY ? "n" : Math.abs(event.clientY - bottom) <= edgeThresholdY ? "s" : null;
    if (edgeX !== null && edgeY !== null) return `${edgeY}${edgeX}` as BitmapSelectionResizeHandle;
    if (edgeX !== null && event.clientY >= top && event.clientY <= bottom) return edgeX;
    if (edgeY !== null && event.clientX >= left && event.clientX <= right) return edgeY;
    return null;
  }

  function resizeBitmapEditorSelection(
    selection: BitmapRegionSelection,
    handle: BitmapSelectionResizeHandle,
    pixel: { readonly x: number; readonly y: number },
  ): BitmapRegionSelection {
    const dimensions = bitmapEditorSelectionDimensions();
    if (dimensions === null) return selection;
    const grid = bitmapEditorAttributeGrid();
    const attributeResolution = bitmapEditorSelectionResolution === "attribute" && grid.width !== null && grid.height !== null;
    const stepX = attributeResolution ? grid.width! : 1;
    const stepY = attributeResolution ? grid.height! : 1;
    let left = selection.x;
    let top = selection.y;
    let right = selection.x + selection.width;
    let bottom = selection.y + selection.height;
    if (handle.includes("w")) left = Math.max(0, Math.min(right - stepX, Math.floor(pixel.x / stepX) * stepX));
    if (handle.includes("e")) right = Math.min(dimensions.width, Math.max(left + stepX, Math.ceil((pixel.x + 1) / stepX) * stepX));
    if (handle.includes("n")) top = Math.max(0, Math.min(bottom - stepY, Math.floor(pixel.y / stepY) * stepY));
    if (handle.includes("s")) bottom = Math.min(dimensions.height, Math.max(top + stepY, Math.ceil((pixel.y + 1) / stepY) * stepY));
    return { ...selection, x: left, y: top, width: right - left, height: bottom - top, mask: new Uint8Array((right - left) * (bottom - top)).fill(1) };
  }

  function moveBitmapEditorSelection(
    selection: BitmapRegionSelection,
    start: { readonly x: number; readonly y: number },
    current: { readonly x: number; readonly y: number },
  ): BitmapRegionSelection {
    const dimensions = bitmapEditorSelectionDimensions();
    if (dimensions === null) return selection;
    const grid = bitmapEditorAttributeGrid();
    const attributeResolution = bitmapEditorSelectionResolution === "attribute" && grid.width !== null && grid.height !== null;
    const stepX = attributeResolution ? grid.width! : 1;
    const stepY = attributeResolution ? grid.height! : 1;
    const maxX = Math.max(0, Math.floor((dimensions.width - selection.width) / stepX) * stepX);
    const maxY = Math.max(0, Math.floor((dimensions.height - selection.height) / stepY) * stepY);
    const x = Math.max(0, Math.min(maxX, Math.round((selection.x + current.x - start.x) / stepX) * stepX));
    const y = Math.max(0, Math.min(maxY, Math.round((selection.y + current.y - start.y) / stepY) * stepY));
    return { ...selection, x, y };
  }

  return {
    applyBitmapEditorCellOperation,
    applyBitmapEditorColorStep,
    bitmapEditorNativeCellToolActive,
    bitmapEditorNativeSourcePickerActive,
    bitmapEditorSelectionDimensions,
    bitmapSelectionResizeHandleAt,
    cancelBitmapEditorColorDraft,
    captureBitmapEditorResultColor,
    captureBitmapEditorSourceColor,
    chooseBitmapEditorOperation,
    commitBitmapEditorColorDraft,
    cycleBitmapEditorBrushSize,
    cycleBitmapEditorCellMode,
    cycleBitmapEditorOperation,
    floodFillBitmapResult,
    fullBitmapAttributeCellFromEvent,
    fullBitmapPixelFromEvent,
    makeSelectionDraft,
    moveBitmapEditorPrimitiveCursor,
    moveBitmapEditorSelection,
    placeBitmapEditorPrimitivePoint,
    previewBitmapEditorColorTransform,
    promoteBitmapResult,
    promoteBitmapSource,
    resizeBitmapEditorSelection,
    sampleBitmapEditorPrimitivePattern,
    selectBitmapEditorScope,
    shiftBitmapEditorSelection,
    startBitmapEditorPaste,
    toggleBitmapEditorColorPicker,
    toggleBitmapEditorPatternPicker,
    transformBitmapEditorSelection,
    updateResultPreviewFromBitmap,
  };
}
