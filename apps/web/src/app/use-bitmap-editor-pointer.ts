import { type BitmapEditorResultHistoryEntry, type CharsetTilesView, type PreviewSide } from "../app-types.js";
import { type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { bitmapEditorLinePoints } from "../bitmap-editor-geometry.js";
import { cloneBitmapBuffer } from "../full-bitmap-editor.js";
import { cloneNativeResultBitmap } from "../result-bitmap-editor.js";
import { mapSourceTileToOutputIndex } from "../charset-selection.js";
import type { useRuntimeState } from "./use-runtime-state.js";
import type { useSettingsState } from "./use-settings-state.js";
import type { useWorkbenchState } from "./use-workbench-state.js";
import type { useResultEditing } from "./use-result-editing.js";
import type { useConversionActions } from "./use-conversion-actions.js";
import type { usePreviewInspection } from "./use-preview-inspection.js";
import type { useEditorOperations } from "./use-editor-operations.js";
import type { useBitmapEditorTools } from "./use-bitmap-editor-tools.js";
import { selectionContainsPixel } from "./bitmap-editor-tools-helpers.js";

export function useBitmapEditorPointer(
  { applyBitmapEditorCellOperation, applyBitmapEditorOperation, applyPickedTilemapIndex, bitmapEditorAttributeGrid, bitmapEditorCell, bitmapEditorClipboard, bitmapEditorColorPickerActive, bitmapEditorConnectPoints, bitmapEditorCurrentResultRef, bitmapEditorEncodedRef, bitmapEditorFloodFillActive, bitmapEditorFullBufferRef, bitmapEditorFullPointerRef, bitmapEditorNativeCellToolActive, bitmapEditorNativeSourcePickerActive, bitmapEditorOriginalResult, bitmapEditorPasteMode, bitmapEditorPatternPickerActive, bitmapEditorPointerRef, bitmapEditorPrimitiveCursor, bitmapEditorPrimitiveDraft, bitmapEditorPrimitiveKind, bitmapEditorPrimitivePatternPickerActive, bitmapEditorRedoFull, bitmapEditorRegionSelection, bitmapEditorResultBufferRef, bitmapEditorResultFrameIndex, bitmapEditorResultOriginalResult, bitmapEditorResultRedo, bitmapEditorResultUndo, bitmapEditorRevertSource, bitmapEditorScope, bitmapEditorSelection, bitmapEditorSelectionDimensions, bitmapEditorSelectionPointerRef, bitmapEditorSelectionResolution, bitmapEditorSelectionTool, bitmapEditorTarget, bitmapEditorToolMode, bitmapEditorUndoFull, bitmapSelectionResizeHandleAt, captureBitmapEditorResultColor, captureBitmapEditorSourceColor, charsetSelectionClickRef, charsetSelectionDragRef, charsetSelectionMode, charsetState, clearBitmapEditorPickedCell, confirmBitmapEditorAction, copyBitmapEditorSelection, cycleBitmapEditorOperation, draftWorkerRef, emittedSourceCharsetIndices, existingCharset, existingCharsetSelectionRef, floodFillBitmapResult, fullBitmapAttributeCellFromEvent, fullBitmapPixelFromEvent, initializeResultEditor, lastFinal, makeSelectionDraft, moveBitmapEditorPrimitiveCursor, moveBitmapEditorSelection, panDragRef, pickBitmapEditorAttributeCell, placeBitmapEditorClipboard, placeBitmapEditorPrimitivePoint, promoteBitmapResult, promoteBitmapSource, redoBitmapEditor, redoTileEditor, resizeBitmapEditorSelection, resultViewportRef, sampleBitmapEditorPrimitivePattern, selectEditorTile, setBitmapEditorBuffer, setBitmapEditorCell, setBitmapEditorColorPickerActive, setBitmapEditorFlashPreviewMode, setBitmapEditorFlashPreviewPhase, setBitmapEditorOriginalResult, setBitmapEditorPasteMode, setBitmapEditorPatternPickerActive, setBitmapEditorPrimitiveCursor, setBitmapEditorPrimitiveDraft, setBitmapEditorPrimitivePatternPickerActive, setBitmapEditorRedo, setBitmapEditorRedoFull, setBitmapEditorRegionSelection, setBitmapEditorResultEdited, setBitmapEditorResultFrameIndex, setBitmapEditorResultOriginal, setBitmapEditorResultOriginalResult, setBitmapEditorResultQuality, setBitmapEditorResultRedo, setBitmapEditorResultUndo, setBitmapEditorRevertSource, setBitmapEditorSelectionDraft, setBitmapEditorSelectionTool, setBitmapEditorUndo, setBitmapEditorUndoFull, setCharsetEncoding, setCharsetSelectionMode, setCharsetTilesView, setDirty, setDraftState, setExistingCharsetSelection, setImage, setImageStatus, setLastFinal, setResultEditorBuffer, setSelectedSourceCharsetTile, setState, setTileEditorColorPickerActive, setTileEditorTilePickerActive, setTilemapStale, skipNextDraftAfterBitmapEditRef, sourceViewportRef, tileEditorTilePickerActive, tileEditorTilePickerClickGuardRef, tilemapStale, undoBitmapEditor, undoTileEditor, unifiedTileEditorContext, updateResultPreviewFromBitmap }: Pick<ReturnType<typeof useRuntimeState>, "bitmapEditorCell" | "bitmapEditorClipboard" | "bitmapEditorColorPickerActive" | "bitmapEditorConnectPoints" | "bitmapEditorCurrentResultRef" | "bitmapEditorEncodedRef" | "bitmapEditorFloodFillActive" | "bitmapEditorFullBufferRef" | "bitmapEditorFullPointerRef" | "bitmapEditorOriginalResult" | "bitmapEditorPasteMode" | "bitmapEditorPatternPickerActive" | "bitmapEditorPointerRef" | "bitmapEditorRedoFull" | "bitmapEditorRegionSelection" | "bitmapEditorResultBufferRef" | "bitmapEditorResultFrameIndex" | "bitmapEditorResultOriginalResult" | "bitmapEditorResultRedo" | "bitmapEditorResultUndo" | "bitmapEditorRevertSource" | "bitmapEditorScope" | "bitmapEditorSelection" | "bitmapEditorSelectionPointerRef" | "bitmapEditorSelectionResolution" | "bitmapEditorSelectionTool" | "bitmapEditorTarget" | "bitmapEditorUndoFull" | "charsetSelectionClickRef" | "charsetSelectionDragRef" | "charsetState" | "draftWorkerRef" | "existingCharsetSelectionRef" | "lastFinal" | "panDragRef" | "resultViewportRef" | "setBitmapEditorBuffer" | "setBitmapEditorCell" | "setBitmapEditorColorPickerActive" | "setBitmapEditorFlashPreviewMode" | "setBitmapEditorFlashPreviewPhase" | "setBitmapEditorOriginalResult" | "setBitmapEditorPasteMode" | "setBitmapEditorPatternPickerActive" | "setBitmapEditorRedo" | "setBitmapEditorRedoFull" | "setBitmapEditorRegionSelection" | "setBitmapEditorResultEdited" | "setBitmapEditorResultFrameIndex" | "setBitmapEditorResultOriginal" | "setBitmapEditorResultOriginalResult" | "setBitmapEditorResultQuality" | "setBitmapEditorResultRedo" | "setBitmapEditorResultUndo" | "setBitmapEditorRevertSource" | "setBitmapEditorSelectionDraft" | "setBitmapEditorSelectionTool" | "setBitmapEditorUndo" | "setBitmapEditorUndoFull" | "setDraftState" | "setLastFinal" | "setState" | "setTileEditorColorPickerActive" | "setTileEditorTilePickerActive" | "skipNextDraftAfterBitmapEditRef" | "sourceViewportRef" | "tileEditorTilePickerActive" | "tileEditorTilePickerClickGuardRef" | "unifiedTileEditorContext"> &
    Pick<ReturnType<typeof useSettingsState>, "charsetSelectionMode" | "emittedSourceCharsetIndices" | "existingCharset" | "setCharsetEncoding" | "setCharsetSelectionMode" | "setCharsetTilesView" | "setDirty" | "setExistingCharsetSelection" | "setImage" | "setImageStatus" | "setSelectedSourceCharsetTile" | "setTilemapStale" | "tilemapStale"> &
    Pick<ReturnType<typeof useWorkbenchState>, "bitmapEditorPrimitiveCursor" | "bitmapEditorPrimitiveDraft" | "bitmapEditorPrimitiveKind" | "bitmapEditorPrimitivePatternPickerActive" | "bitmapEditorToolMode" | "setBitmapEditorPrimitiveCursor" | "setBitmapEditorPrimitiveDraft" | "setBitmapEditorPrimitivePatternPickerActive"> &
    Pick<ReturnType<typeof useResultEditing>, "clearBitmapEditorPickedCell" | "initializeResultEditor" | "setResultEditorBuffer"> &
    Pick<ReturnType<typeof useConversionActions>, "confirmBitmapEditorAction"> &
    Pick<ReturnType<typeof usePreviewInspection>, "applyPickedTilemapIndex" | "pickBitmapEditorAttributeCell"> &
    Pick<ReturnType<typeof useEditorOperations>, "applyBitmapEditorOperation" | "bitmapEditorAttributeGrid" | "copyBitmapEditorSelection" | "placeBitmapEditorClipboard" | "redoBitmapEditor" | "redoTileEditor" | "selectEditorTile" | "undoBitmapEditor" | "undoTileEditor"> &
    Pick<ReturnType<typeof useBitmapEditorTools>, "applyBitmapEditorCellOperation" | "bitmapEditorNativeCellToolActive" | "bitmapEditorNativeSourcePickerActive" | "bitmapEditorSelectionDimensions" | "bitmapSelectionResizeHandleAt" | "captureBitmapEditorResultColor" | "captureBitmapEditorSourceColor" | "cycleBitmapEditorOperation" | "floodFillBitmapResult" | "fullBitmapAttributeCellFromEvent" | "fullBitmapPixelFromEvent" | "makeSelectionDraft" | "moveBitmapEditorPrimitiveCursor" | "moveBitmapEditorSelection" | "placeBitmapEditorPrimitivePoint" | "promoteBitmapResult" | "promoteBitmapSource" | "resizeBitmapEditorSelection" | "sampleBitmapEditorPrimitivePattern" | "updateResultPreviewFromBitmap">,
) {
  function beginFullBitmapPointer(side: PreviewSide, event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.pointerType === "mouse" && event.button !== 0 && event.button !== 1 && event.button !== 2) return;
    event.preventDefault();
    event.stopPropagation();
    const viewport = side === "source" ? sourceViewportRef.current : resultViewportRef.current;
    if (viewport === null) return;
    const pan = event.button === 1 || (event.button === 0 && (event.altKey || event.metaKey));
    if (event.button === 2) {
      bitmapEditorFullPointerRef.current = {
        side,
        pointerId: event.pointerId,
        visited: new Set(),
        pan: false,
        nativeCells: false,
        button: event.button,
        moved: false,
        historyCaptured: false,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (pan) {
      bitmapEditorFullPointerRef.current = {
        side,
        pointerId: event.pointerId,
        visited: new Set(),
        pan: true,
        nativeCells: false,
        button: event.button,
        moved: false,
        historyCaptured: false,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const pixel = event.button === 0 ? fullBitmapPixelFromEvent(event) : null;
    const currentSelection = bitmapEditorRegionSelection;
    if (event.button === 0 && bitmapEditorToolMode === "primitives") {
      if (pixel === null) return;
      if (bitmapEditorPrimitivePatternPickerActive) {
        sampleBitmapEditorPrimitivePattern(pixel);
        return;
      }
      placeBitmapEditorPrimitivePoint(pixel);
      return;
    }
    if (event.button === 0 && !pan && bitmapEditorTarget === "result" && bitmapEditorToolMode === "selection" && bitmapEditorPasteMode === null && currentSelection !== null) {
      const handle = bitmapSelectionResizeHandleAt(currentSelection, event);
      if (handle !== null) {
        bitmapEditorSelectionPointerRef.current = { action: "resize", side, pointerId: event.pointerId, selection: currentSelection, handle, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      if (pixel !== null && selectionContainsPixel(currentSelection, pixel)) {
        bitmapEditorSelectionPointerRef.current = { action: "move", side, pointerId: event.pointerId, selection: currentSelection, start: pixel, moved: false };
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
    }
    if (event.button === 0 && bitmapEditorToolMode === "selection" && bitmapEditorSelectionTool !== "none") {
      if (pixel === null) return;
      bitmapEditorSelectionPointerRef.current = {
        action: "draw",
        side,
        pointerId: event.pointerId,
        kind: bitmapEditorSelectionTool,
        points: [pixel],
      };
      setBitmapEditorSelectionDraft(null);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (event.button === 0 && bitmapEditorPasteMode !== null) {
      const pixel = fullBitmapPixelFromEvent(event, true);
      if (pixel !== null) placeBitmapEditorClipboard(pixel);
      return;
    }
    if (bitmapEditorNativeSourcePickerActive()) {
      if (event.button !== 0) return;
      const cell = fullBitmapAttributeCellFromEvent(event);
      if (cell === null) return;
      pickBitmapEditorAttributeCell(cell.cellX, cell.cellY);
      return;
    }
    if (bitmapEditorPatternPickerActive && bitmapEditorTarget !== "result") {
      setImageStatus("Select a pattern source from a Converted result pane.");
      return;
    }
    const nativeCells = bitmapEditorNativeCellToolActive();
    if (nativeCells) {
      if (event.button !== 0) return;
      const cell = fullBitmapAttributeCellFromEvent(event);
      if (cell === null) return;
      bitmapEditorFullPointerRef.current = {
        side,
        pointerId: event.pointerId,
        visited: new Set(),
        pan: false,
        nativeCells: true,
        button: event.button,
        moved: false,
        historyCaptured: false,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      bitmapEditorFullPointerRef.current.visited.add(`${cell.cellX},${cell.cellY}`);
      applyBitmapEditorCellOperation(cell.cellX, cell.cellY);
      return;
    }
    const activePixel = pan ? null : pixel;
    if (activePixel !== null && bitmapEditorColorPickerActive) {
      if (bitmapEditorTarget === "source") captureBitmapEditorSourceColor(activePixel.x, activePixel.y);
      else captureBitmapEditorResultColor(activePixel.x, activePixel.y);
      return;
    }
    if (event.button === 0 && activePixel !== null && bitmapEditorFloodFillActive) {
      floodFillBitmapResult(activePixel);
      return;
    }
    bitmapEditorFullPointerRef.current = {
      side,
      pointerId: event.pointerId,
      visited: new Set(),
      pan,
      nativeCells: false,
      button: event.button,
      moved: false,
      historyCaptured: false,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop,
      lastPixel: activePixel,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    if (activePixel !== null) {
      if (bitmapEditorTarget === "source") promoteBitmapSource(activePixel);
      else promoteBitmapResult(activePixel);
    }
  }

  function moveFullBitmapPointer(event: ReactPointerEvent<HTMLDivElement>): void {
    const selectionPointer = bitmapEditorSelectionPointerRef.current;
    if (selectionPointer !== null && selectionPointer.pointerId === event.pointerId) {
      event.preventDefault();
      event.stopPropagation();
      const pixel = fullBitmapPixelFromEvent(event, true);
      if (pixel === null) return;
      if (selectionPointer.action === "draw") {
        const last = selectionPointer.points[selectionPointer.points.length - 1];
        if (last !== undefined && (pixel.x !== last.x || pixel.y !== last.y)) {
          selectionPointer.points.push(...bitmapEditorLinePoints(last, pixel));
          const previewPoints = selectionPointer.kind === "rectangle"
            ? [selectionPointer.points[0]!, selectionPointer.points[selectionPointer.points.length - 1]!]
            : selectionPointer.points;
          setBitmapEditorSelectionDraft(makeSelectionDraft(selectionPointer.kind, previewPoints));
        }
      } else if (selectionPointer.action === "move") {
        const moved = moveBitmapEditorSelection(selectionPointer.selection, selectionPointer.start, pixel);
        selectionPointer.moved ||= moved.x !== selectionPointer.selection.x || moved.y !== selectionPointer.selection.y;
        setBitmapEditorSelectionDraft(moved);
      } else {
        const resized = resizeBitmapEditorSelection(selectionPointer.selection, selectionPointer.handle, pixel);
        selectionPointer.moved ||= resized.x !== selectionPointer.selection.x || resized.y !== selectionPointer.selection.y ||
          resized.width !== selectionPointer.selection.width || resized.height !== selectionPointer.selection.height;
        setBitmapEditorSelectionDraft(resized);
      }
      return;
    }
    const pointer = bitmapEditorFullPointerRef.current;
    if (pointer === null || pointer.pointerId !== event.pointerId) {
      if (bitmapEditorToolMode === "primitives" && !bitmapEditorPrimitivePatternPickerActive) {
        const pixel = fullBitmapPixelFromEvent(event, true);
        if (pixel !== null) {
          setBitmapEditorPrimitiveCursor(pixel);
          setBitmapEditorPrimitiveDraft((draft) => draft === null ? null : { ...draft, current: pixel });
        }
      }
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    if (pointer.button === 2) {
      pointer.moved ||= Math.abs(event.clientX - pointer.startX) > 2 || Math.abs(event.clientY - pointer.startY) > 2;
      return;
    }
    if (pointer.nativeCells) {
      const cell = fullBitmapAttributeCellFromEvent(event);
      if (cell === null) return;
      const key = `${cell.cellX},${cell.cellY}`;
      if (pointer.visited.has(key)) return;
      pointer.visited.add(key);
      applyBitmapEditorCellOperation(cell.cellX, cell.cellY);
      return;
    }
    const viewport = pointer.side === "source" ? sourceViewportRef.current : resultViewportRef.current;
    if (pointer.pan && viewport !== null) {
      if (Math.abs(event.clientX - pointer.startX) > 2 || Math.abs(event.clientY - pointer.startY) > 2) {
        pointer.moved = true;
      }
      viewport.scrollLeft = pointer.scrollLeft - (event.clientX - pointer.startX);
      viewport.scrollTop = pointer.scrollTop - (event.clientY - pointer.startY);
      return;
    }
    const pixel = fullBitmapPixelFromEvent(event);
    if (pixel === null) return;
    const previousPixel = pointer.lastPixel;
    pointer.lastPixel = pixel;
    const connectedStroke = bitmapEditorConnectPoints && pointer.button === 0 &&
      bitmapEditorScope === "pixel" && !bitmapEditorFloodFillActive &&
      previousPixel !== null && previousPixel !== undefined;
    const points = connectedStroke ? bitmapEditorLinePoints(previousPixel, pixel) : [pixel];
    for (const point of points) {
      if (bitmapEditorTarget === "source") promoteBitmapSource(point);
      else promoteBitmapResult(point);
    }
  }

  function endFullBitmapPointer(event: ReactPointerEvent<HTMLDivElement>): void {
    const selectionPointer = bitmapEditorSelectionPointerRef.current;
    if (selectionPointer?.pointerId === event.pointerId) {
      const pixel = fullBitmapPixelFromEvent(event, true);
      if (selectionPointer.action === "draw") {
        const points = selectionPointer.kind === "rectangle"
          ? [selectionPointer.points[0]!, selectionPointer.points[selectionPointer.points.length - 1]!]
          : selectionPointer.points;
        const selection = makeSelectionDraft(selectionPointer.kind, points);
        setBitmapEditorRegionSelection(selection);
        if (selection !== null) copyBitmapEditorSelection(selection, false);
      } else if (pixel !== null && selectionPointer.action === "move") {
        const moved = moveBitmapEditorSelection(selectionPointer.selection, selectionPointer.start, pixel);
        if (selectionPointer.moved && (moved.x !== selectionPointer.selection.x || moved.y !== selectionPointer.selection.y)) {
          const clipboard = bitmapEditorClipboard ?? copyBitmapEditorSelection(selectionPointer.selection, false);
          if (clipboard !== null) {
            placeBitmapEditorClipboard({ x: moved.x, y: moved.y }, "move", clipboard, "copy", true, true, true, selectionPointer.selection);
            setBitmapEditorRegionSelection(moved);
          }
        }
      } else if (pixel !== null && selectionPointer.action === "resize") {
        const resized = resizeBitmapEditorSelection(selectionPointer.selection, selectionPointer.handle, pixel);
        if (selectionPointer.moved) {
          setBitmapEditorRegionSelection(resized);
          copyBitmapEditorSelection(resized, false);
        }
      }
      setBitmapEditorSelectionDraft(null);
      bitmapEditorSelectionPointerRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      event.stopPropagation();
      return;
    }
    const pointer = bitmapEditorFullPointerRef.current;
    if (pointer?.pointerId === event.pointerId && pointer.button === 2 && !pointer.moved) {
      cycleBitmapEditorOperation();
    }
    if (pointer?.pointerId === event.pointerId) {
      bitmapEditorFullPointerRef.current = null;
    }
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    event.stopPropagation();
  }

  function clearBitmapEditorSelectionOnDoubleClick(event: ReactMouseEvent<HTMLElement>): void {
    if (bitmapEditorToolMode === "primitives") {
      if (bitmapEditorPrimitiveKind === "line" && bitmapEditorPrimitiveDraft !== null) {
        event.preventDefault();
        event.stopPropagation();
        setBitmapEditorPrimitiveDraft(null);
        setImageStatus("Connected line ended.");
      }
      return;
    }
    const selection = bitmapEditorRegionSelection;
    const pixel = fullBitmapPixelFromEvent(event);
    if (bitmapEditorPasteMode !== null || selection === null || pixel === null || !selectionContainsPixel(selection, pixel)) return;
    event.preventDefault();
    event.stopPropagation();
    setBitmapEditorRegionSelection(null);
    setBitmapEditorSelectionDraft(null);
    setBitmapEditorPasteMode(null);
    setBitmapEditorSelectionTool("rectangle");
    setImageStatus("Selection cleared · bitmap unchanged.");
  }

  function moveBitmapEditorSelectionByArrow(direction: "left" | "right" | "up" | "down"): void {
    const selection = bitmapEditorRegionSelection;
    if (selection === null || bitmapEditorPasteMode !== null || bitmapEditorTarget !== "result") return;
    const dimensions = bitmapEditorSelectionDimensions();
    if (dimensions === null) return;
    const grid = bitmapEditorAttributeGrid();
    const attributeResolution = bitmapEditorSelectionResolution === "attribute" && grid.width !== null && grid.height !== null;
    const stepX = attributeResolution ? grid.width! : 1;
    const stepY = attributeResolution ? grid.height! : 1;
    const maxX = Math.max(0, Math.floor((dimensions.width - selection.width) / stepX) * stepX);
    const maxY = Math.max(0, Math.floor((dimensions.height - selection.height) / stepY) * stepY);
    const alignedX = attributeResolution ? Math.round(selection.x / stepX) * stepX : selection.x;
    const alignedY = attributeResolution ? Math.round(selection.y / stepY) * stepY : selection.y;
    const x = Math.max(0, Math.min(maxX, alignedX + (direction === "left" ? -stepX : direction === "right" ? stepX : 0)));
    const y = Math.max(0, Math.min(maxY, alignedY + (direction === "up" ? -stepY : direction === "down" ? stepY : 0)));
    if (x === selection.x && y === selection.y) return;
    const moved = { ...selection, x, y };
    const clipboard = bitmapEditorClipboard !== null &&
      bitmapEditorClipboard.width === selection.width && bitmapEditorClipboard.height === selection.height
      ? bitmapEditorClipboard
      : copyBitmapEditorSelection(selection, false);
    if (clipboard === null) return;
    placeBitmapEditorClipboard({ x, y }, "move", clipboard, "copy", true, true, true, selection);
    setBitmapEditorRegionSelection(moved);
  }

  function undoFullBitmap(): void {
    bitmapEditorFullPointerRef.current = null;
    bitmapEditorPointerRef.current = null;
    panDragRef.current = null;
    const previous = bitmapEditorUndoFull[bitmapEditorUndoFull.length - 1];
    const current = bitmapEditorFullBufferRef.current;
    if (previous === undefined || current === null) return;
    setBitmapEditorRedoFull((history) => [...history, cloneBitmapBuffer(current)]);
    const next = cloneBitmapBuffer(previous);
    bitmapEditorFullBufferRef.current = next;
    setBitmapEditorBuffer(next);
    setBitmapEditorUndoFull((history) => history.slice(0, -1));
    skipNextDraftAfterBitmapEditRef.current = true;
    setImage((currentImage) => currentImage === null ? null : { ...currentImage, width: next.width, height: next.height, rgba: next.rgba.slice() });
    updateResultPreviewFromBitmap(next);
    setDirty(true);
  }

  function redoFullBitmap(): void {
    bitmapEditorFullPointerRef.current = null;
    bitmapEditorPointerRef.current = null;
    panDragRef.current = null;
    const next = bitmapEditorRedoFull[bitmapEditorRedoFull.length - 1];
    const current = bitmapEditorFullBufferRef.current;
    if (next === undefined || current === null) return;
    setBitmapEditorUndoFull((history) => [...history, cloneBitmapBuffer(current)]);
    const restored = cloneBitmapBuffer(next);
    bitmapEditorFullBufferRef.current = restored;
    setBitmapEditorBuffer(restored);
    setBitmapEditorRedoFull((history) => history.slice(0, -1));
    skipNextDraftAfterBitmapEditRef.current = true;
    setImage((currentImage) => currentImage === null ? null : { ...currentImage, width: restored.width, height: restored.height, rgba: restored.rgba.slice() });
    updateResultPreviewFromBitmap(restored);
    setDirty(true);
  }

  function commitFullResultSnapshot(snapshot: BitmapEditorResultHistoryEntry): void {
    draftWorkerRef.current?.dispose();
    draftWorkerRef.current = null;
    setDraftState({ kind: "idle" });
    bitmapEditorCurrentResultRef.current = snapshot.result;
    setBitmapEditorResultFrameIndex(snapshot.frameIndex);
    setResultEditorBuffer(cloneNativeResultBitmap(snapshot.bitmap));
    setLastFinal(snapshot.result);
    setState({ kind: "ready", result: snapshot.result });
    setDirty(true);
  }

  function undoFullResult(): void {
    const previous = bitmapEditorResultUndo[bitmapEditorResultUndo.length - 1];
    const current = bitmapEditorResultBufferRef.current;
    const result = lastFinal;
    if (previous === undefined || current === null || result === null) return;
    setBitmapEditorResultRedo((history) => [...history, {
      result,
      bitmap: cloneNativeResultBitmap(current),
      frameIndex: bitmapEditorResultFrameIndex,
    }]);
    setBitmapEditorResultUndo((history) => history.slice(0, -1));
    commitFullResultSnapshot({
      result: previous.result,
      bitmap: cloneNativeResultBitmap(previous.bitmap),
      frameIndex: previous.frameIndex,
    });
  }

  function redoFullResult(): void {
    const next = bitmapEditorResultRedo[bitmapEditorResultRedo.length - 1];
    const current = bitmapEditorResultBufferRef.current;
    const result = lastFinal;
    if (next === undefined || current === null || result === null) return;
    setBitmapEditorResultUndo((history) => [...history, {
      result,
      bitmap: cloneNativeResultBitmap(current),
      frameIndex: bitmapEditorResultFrameIndex,
    }]);
    setBitmapEditorResultRedo((history) => history.slice(0, -1));
    commitFullResultSnapshot({
      result: next.result,
      bitmap: cloneNativeResultBitmap(next.bitmap),
      frameIndex: next.frameIndex,
    });
  }

  function revertFullResult(): void {
    const originalResult = bitmapEditorResultOriginalResult;
    if (originalResult === null) return;
    if (!confirmBitmapEditorAction("revert")) return;
    draftWorkerRef.current?.dispose();
    draftWorkerRef.current = null;
    setDraftState({ kind: "idle" });
    setLastFinal(originalResult);
    setState({ kind: "ready", result: originalResult });
    const frameIndex = Math.min(bitmapEditorResultFrameIndex, Math.max(0, originalResult.frames.length - 1));
    const bitmap = initializeResultEditor(originalResult, frameIndex);
    if (bitmap !== null) setResultEditorBuffer(bitmap);
    setBitmapEditorResultUndo([]);
    setBitmapEditorResultRedo([]);
    setBitmapEditorResultOriginal(null);
    setBitmapEditorResultOriginalResult(null);
    setBitmapEditorResultEdited(false);
    setBitmapEditorResultQuality("High");
    setBitmapEditorFlashPreviewMode("normal");
    setBitmapEditorFlashPreviewPhase(false);
    setImageStatus("Converted result restored to the last High conversion.");
    setDirty(true);
  }

  function revertFullBitmap(): void {
    bitmapEditorFullPointerRef.current = null;
    bitmapEditorPointerRef.current = null;
    panDragRef.current = null;
    if (bitmapEditorRevertSource === null) return;
    if (!confirmBitmapEditorAction("revert")) return;
    const restored = { ...bitmapEditorRevertSource, rgba: bitmapEditorRevertSource.rgba.slice() };
    setImage(restored);
    bitmapEditorFullBufferRef.current = null;
    bitmapEditorEncodedRef.current = null;
    setBitmapEditorBuffer(null);
    setBitmapEditorUndoFull([]);
    setBitmapEditorRedoFull([]);
    setBitmapEditorRevertSource(null);
    setBitmapEditorOriginalResult(null);
    setImageStatus("Original source restored. Ready to reconvert.");
    setDirty(true);
  }

  function handleBitmapEditorKey(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.key.toLowerCase() === "z" && event.shiftKey) {
      event.preventDefault();
      redoBitmapEditor();
    } else if (event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoBitmapEditor();
    } else if (event.key.toLowerCase() === "y") {
      event.preventDefault();
      redoBitmapEditor();
    }
  }

  function handleFullBitmapCanvasKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (bitmapEditorToolMode === "primitives") {
      if (event.code === "Escape") {
        event.preventDefault();
        setBitmapEditorPrimitivePatternPickerActive(false);
        setBitmapEditorPrimitiveDraft(null);
        setImageStatus("Primitive placement ended. Unfinished preview discarded.");
        return;
      }
      if (event.code === "ArrowLeft" || event.code === "ArrowRight" || event.code === "ArrowUp" || event.code === "ArrowDown") {
        event.preventDefault();
        moveBitmapEditorPrimitiveCursor(
          event.code === "ArrowLeft" ? -1 : event.code === "ArrowRight" ? 1 : 0,
          event.code === "ArrowUp" ? -1 : event.code === "ArrowDown" ? 1 : 0,
        );
        return;
      }
      if (event.code === "Enter") {
        event.preventDefault();
        if (event.repeat) return;
        const point = bitmapEditorPrimitiveCursor ?? (() => {
          const dimensions = bitmapEditorSelectionDimensions();
          return dimensions === null ? null : { x: Math.floor(dimensions.width / 2), y: Math.floor(dimensions.height / 2) };
        })();
        if (point !== null) placeBitmapEditorPrimitivePoint(point);
        return;
      }
    }
    if (event.code === "Escape") {
      event.preventDefault();
      setBitmapEditorColorPickerActive(false);
      setBitmapEditorPatternPickerActive(false);
      clearBitmapEditorPickedCell();
      bitmapEditorFullPointerRef.current = null;
      bitmapEditorSelectionPointerRef.current = null;
      setBitmapEditorSelectionDraft(null);
      setBitmapEditorSelectionTool("rectangle");
    }
    if (bitmapEditorRegionSelection !== null && bitmapEditorPasteMode === null && event.code.startsWith("Arrow")) {
      const direction = event.code === "ArrowLeft" ? "left" : event.code === "ArrowRight" ? "right" : event.code === "ArrowUp" ? "up" : "down";
      event.preventDefault();
      moveBitmapEditorSelectionByArrow(direction);
    }
  }

  function handleUnifiedEditorKey(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (!(event.metaKey || event.ctrlKey)) return;
    if (event.key.toLowerCase() === "z" && event.shiftKey) {
      event.preventDefault();
      redoTileEditor();
    } else if (event.key.toLowerCase() === "z") {
      event.preventDefault();
      undoTileEditor();
    } else if (event.key.toLowerCase() === "y") {
      event.preventDefault();
      redoTileEditor();
    }
  }

  function setBitmapEditorAttribute(mask: number, value: number): void {
    if (bitmapEditorCell === null) return;
    applyBitmapEditorOperation({
      kind: "set-attribute",
      attribute: (bitmapEditorCell.attribute & ~mask) | (value & mask),
    });
  }

  function invertBitmapEditorAttributes(): void {
    if (bitmapEditorCell === null) return;
    const ink = bitmapEditorCell.attribute & 7;
    const paper = (bitmapEditorCell.attribute >> 3) & 7;
    applyBitmapEditorOperation({
      kind: "set-attribute",
      attribute: (bitmapEditorCell.attribute & 0xc0) | paper | (ink << 3),
    });
  }

  function revertBitmapEditorChanges(): void {
    if (bitmapEditorOriginalResult === null) return;
    if (!confirmBitmapEditorAction("revert")) return;
    draftWorkerRef.current?.dispose();
    draftWorkerRef.current = null;
    setLastFinal(bitmapEditorOriginalResult);
    setDraftState({ kind: "idle" });
    setState({ kind: "ready", result: bitmapEditorOriginalResult });
    setBitmapEditorCell(
      bitmapEditorSelection === null
        ? null
        : {
            rows: Uint8Array.from(bitmapEditorSelection.bitmapBytes.slice(0, 8)),
            attribute: bitmapEditorSelection.attribute,
          },
    );
    setBitmapEditorUndo([]);
    setBitmapEditorRedo([]);
    setBitmapEditorOriginalResult(null);
    setBitmapEditorResultOriginalResult(null);
    setBitmapEditorResultEdited(false);
    setImageStatus("Converted result restored to the last High conversion.");
    setDirty(true);
  }

  function markCharsetSelectionChanged(indices: readonly number[]): void {
    const sorted = [...new Set(indices)].sort((left, right) => left - right);
    existingCharsetSelectionRef.current = sorted;
    setExistingCharsetSelection(sorted);
    setCharsetTilesView("source");
    if (sorted.length > 32) setCharsetEncoding("extended");
    setTilemapStale(true);
  }

  function switchCharsetTilesView(view: CharsetTilesView): void {
    for (const timer of charsetSelectionClickRef.current.values()) {
      window.clearTimeout(timer);
    }
    charsetSelectionClickRef.current.clear();
    charsetSelectionDragRef.current = null;
    tileEditorTilePickerClickGuardRef.current = null;
    if (view === "source") {
      setTileEditorColorPickerActive(false);
    } else {
      setCharsetSelectionMode(false);
    }
    setCharsetTilesView(view);
  }

  function toggleCharsetSelectionMode(): void {
    const next = !charsetSelectionMode;
    for (const timer of charsetSelectionClickRef.current.values()) {
      window.clearTimeout(timer);
    }
    charsetSelectionClickRef.current.clear();
    charsetSelectionDragRef.current = null;
    tileEditorTilePickerClickGuardRef.current = null;
    if (next) {
      setTileEditorColorPickerActive(false);
      setTileEditorTilePickerActive(false);
    }
    setCharsetSelectionMode(next);
  }

  function handleSourceCharsetTileClick(sourceIndex: number): void {
    if (charsetSelectionMode) return;
    if (charsetState.kind !== "ready") {
      setImageStatus("Convert the tilemap before selecting source tiles for editing.");
      return;
    }
    if (tilemapStale) {
      setImageStatus("The tilemap is stale. Convert again before using source tiles in the editor or map.");
      return;
    }
    setSelectedSourceCharsetTile(sourceIndex);
    let outputIndex = mapSourceTileToOutputIndex(sourceIndex, emittedSourceCharsetIndices);
    if (outputIndex < 0 && existingCharset !== null) {
      const sourceTile = existingCharset.subarray(sourceIndex * 8, sourceIndex * 8 + 8);
      outputIndex = Array.from({ length: charsetState.result.characterCount }, (_, index) => index)
        .find((index) => charsetState.result.charset.subarray(index * 8, index * 8 + 8)
          .every((byte, row) => byte === sourceTile[row])) ?? -1;
    }
    if (outputIndex < 0) {
      setImageStatus(`Source tile ${sourceIndex + 1} is not in the converted charset. Enable “Edit conversion set”, include it, then convert again.`);
      return;
    }
    if (tileEditorTilePickerActive) {
      applyPickedTilemapIndex(outputIndex);
      setImageStatus(`Source tile ${sourceIndex + 1} selected for the current ${unifiedTileEditorContext === "stamp" ? "tile stamp" : "map cell"}.`);
    } else {
      selectEditorTile(outputIndex);
      setImageStatus(`Source tile ${sourceIndex + 1} selected as output tile ${outputIndex + 1}.`);
    }
  }

  return {
    beginFullBitmapPointer,
    clearBitmapEditorSelectionOnDoubleClick,
    endFullBitmapPointer,
    handleBitmapEditorKey,
    handleFullBitmapCanvasKeyDown,
    handleSourceCharsetTileClick,
    handleUnifiedEditorKey,
    invertBitmapEditorAttributes,
    markCharsetSelectionChanged,
    moveFullBitmapPointer,
    redoFullBitmap,
    redoFullResult,
    revertBitmapEditorChanges,
    revertFullBitmap,
    revertFullResult,
    setBitmapEditorAttribute,
    switchCharsetTilesView,
    toggleCharsetSelectionMode,
    undoFullBitmap,
    undoFullResult,
  };
}
