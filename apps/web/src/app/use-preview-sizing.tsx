import { clampCharsetRange } from "../specscii-assets.js";
import { fitPreviewToViewport, type PreviewFitSize, resolvePreviewAspect } from "../preview-aspect.js";
import { type PreviewSide } from "../app-types.js";
import { nativePaletteForResult } from "../result-bitmap-editor.js";
import { ORDERED_MATRIX_IDS, orderedMatrixLabel } from "../dithering-labels.js";
import { ORDERED_MATRICES } from "@retro-converter/conversion-core";
import { bitmapPrimitivePointsPath, bitmapPrimitiveStippleOn, rasterizeBitmapBrushStroke, rasterizeBitmapPrimitive } from "../bitmap-editor-primitives.js";
import { bitmapEditorBrushPixels, bitmapEditorCellModeLabel, type BitmapEditorOperation, bitmapEditorOperationDescription, bitmapEditorOperationLabel } from "../bitmap-editor-tools.js";
import { ZX_BASE_COLORS } from "../inspection.js";
import { NavLink, SegmentedControl, Tooltip } from "@mantine/core";
import { BITMAP_EDITOR_SEGMENTED_CLASSES } from "../app-controls.js";
import { type BitmapRegionSelection, type BitmapSelectionKind, bitmapSelectionOutlinePath, type BitmapSelectionResolution } from "../bitmap-editor-selection.js";
import { BitmapEditorStipplePicker } from "../bitmap-editor-stipple-picker.js";
import { transformZxAttributeCell } from "../bitmap-attribute-cell-editor.js";
import { createPortal } from "react-dom";
import { gridPathForDimensions } from "../bitmap-editor-geometry.js";
import { swapTilemapInkPaper, tileTransformLabel, type TileTransformToggle, tileTransformToggleState } from "../tilemap-editor.js";
import { transformTile } from "@retro-converter/zx-charset";
import type { useRuntimeState } from "./use-runtime-state.js";
import type { useSettingsState } from "./use-settings-state.js";
import type { useWorkbenchState } from "./use-workbench-state.js";
import type { useWorkbenchWindows } from "./use-workbench-windows.js";
import type { useResultEditing } from "./use-result-editing.js";
import type { useConversionSettings } from "./use-conversion-settings.js";
import type { usePreviewInspection } from "./use-preview-inspection.js";
import type { useEditorOperations } from "./use-editor-operations.js";
import type { useBitmapEditorTools } from "./use-bitmap-editor-tools.js";
import type { useBitmapEditorPointer } from "./use-bitmap-editor-pointer.js";
import type { useCharsetAndExport } from "./use-charset-and-export.js";
import type { useProjectAndArtifacts } from "./use-project-and-artifacts.js";
import { bitmapEditorSelectionResizeHandles } from "./bitmap-editor-tools-helpers.js";

export function usePreviewSizing(
  { applyBitmapEditorColorStep, applyBitmapEditorOperation, applyEditorOperation, beginBitmapEditorPaint, beginFullBitmapPointer, beginPreviewDrag, beginTileEditorPaint, bitmapEditorActiveSide, bitmapEditorBrightPolicy, bitmapEditorBrushSize, bitmapEditorBuffer, bitmapEditorCell, bitmapEditorCellMode, bitmapEditorClipboard, bitmapEditorColorChannel, bitmapEditorColorDraftRef, bitmapEditorColorFrom, bitmapEditorColorOperation, bitmapEditorColorPickerActive, bitmapEditorColorScope, bitmapEditorColorTo, bitmapEditorConnectPoints, bitmapEditorFlashPolicy, bitmapEditorFlashPreviewMode, bitmapEditorFlashPreviewPhase, bitmapEditorFloodFillActive, bitmapEditorFullBufferRef, bitmapEditorFullPointerRef, bitmapEditorGridMode, bitmapEditorInkColor, bitmapEditorMergedFlashCanvasRef, bitmapEditorOperation, bitmapEditorOrderedMatrix, bitmapEditorOriginalResult, bitmapEditorPaperColor, bitmapEditorPasteAttributes, bitmapEditorPasteMode, bitmapEditorPastePixels, bitmapEditorPatternPickerActive, bitmapEditorPickedCell, bitmapEditorPointerRef, bitmapEditorPrimitiveCursor, bitmapEditorPrimitiveCustomPattern, bitmapEditorPrimitiveDraft, bitmapEditorPrimitiveFillEnabled, bitmapEditorPrimitiveFillOperation, bitmapEditorPrimitiveFillPattern, bitmapEditorPrimitiveKind, bitmapEditorPrimitivePatternPickerActive, bitmapEditorPrimitiveStrokeEnabled, bitmapEditorPrimitiveStrokePattern, bitmapEditorRedo, bitmapEditorRedoFull, bitmapEditorRegionSelection, bitmapEditorResultBuffer, bitmapEditorResultCanvasRef, bitmapEditorResultEdited, bitmapEditorResultFrameIndex, bitmapEditorResultPaletteIndex, bitmapEditorResultRedo, bitmapEditorResultUndo, bitmapEditorRevertSource, bitmapEditorScope, bitmapEditorSelection, bitmapEditorSelectionDimensions, bitmapEditorSelectionDraft, bitmapEditorSelectionResolution, bitmapEditorSelectionTool, bitmapEditorShowAttributes, bitmapEditorShowPixels, bitmapEditorSourceCanvasRef, bitmapEditorStippleDensity, bitmapEditorStippleEnabled, bitmapEditorStipplePattern, bitmapEditorTarget, bitmapEditorToolMode, bitmapEditorToolsHost, bitmapEditorUndo, bitmapEditorUndoFull, bitmapEditorUseColors, cancelBitmapEditorColorDraft, charsetState, chooseBitmapEditorOperation, clearBitmapEditorSelectionOnDoubleClick, commitBitmapEditorColorDraft, copyBitmapEditorSelection, cropSourceSize, customOrderedMatrices, cycleBitmapEditorBrushSize, cycleBitmapEditorCellMode, destinationGeometry, displayedAttributeHeight, displayedHeight, displayedResult, displayedWidth, draggingSide, endBitmapEditorPaint, endFullBitmapPointer, endPreviewDrag, endTileEditorPaint, existingCharsetLength, existingCharsetSelection, existingCharsetStart, flashPreviewAvailable, framing, fullBitmapBufferFromSource, glyphCount, handleBitmapEditorKey, handleFullBitmapCanvasKeyDown, handlePreviewScroll, handlePreviewWheel, handleUnifiedEditorKey, highlightSelectedTileUses, image, inspection, invertBitmapEditorAttributes, isQl, markPanSource, moveBitmapEditorPaint, moveEditorTile, moveFullBitmapPointer, movePreviewDrag, moveTileEditorPaint, outputPreviewStage, panDragRef, previewBitmapEditorColorTransform, previewViewportSizes, redoBitmapEditor, redoFullBitmap, redoFullResult, redoTileEditor, resetTilemapEditorTransform, resultFrameInput, resultPreviewContent, resultPreviewZoom, resultViewportRef, revertBitmapEditorChanges, revertFullBitmap, revertFullResult, revertSelectedTile, scaleQlToDisplayAspect, selectBitmapEditorScope, selectResultEditorFrame, setBitmapEditorAttribute, setBitmapEditorColorChannel, setBitmapEditorColorFrom, setBitmapEditorColorOperation, setBitmapEditorColorScope, setBitmapEditorColorTo, setBitmapEditorConnectPoints, setBitmapEditorFlashPreviewMode, setBitmapEditorFloodFillActive, setBitmapEditorGridMode, setBitmapEditorOperation, setBitmapEditorPasteAttributes, setBitmapEditorPasteMode, setBitmapEditorPastePixels, setBitmapEditorPickedCell, setBitmapEditorPrimitiveCursor, setBitmapEditorPrimitiveDraft, setBitmapEditorPrimitiveFillEnabled, setBitmapEditorPrimitiveFillOperation, setBitmapEditorPrimitiveFillPattern, setBitmapEditorPrimitiveKind, setBitmapEditorPrimitivePatternPickerActive, setBitmapEditorPrimitiveStrokeEnabled, setBitmapEditorPrimitiveStrokePattern, setBitmapEditorRegionSelection, setBitmapEditorScope, setBitmapEditorSelectionDraft, setBitmapEditorSelectionResolution, setBitmapEditorSelectionTool, setBitmapEditorShowAttributes, setBitmapEditorShowPixels, setBitmapEditorStippleDensity, setBitmapEditorStippleEnabled, setBitmapEditorStipplePattern, setBitmapEditorToolMode, setBitmapEditorUseColors, setResultPreviewZoom, setSourcePreviewZoom, setSynchronizePan, setTileEditorColorPickerActive, setTileEditorTilePickerActive, setTilemapPutActive, shiftBitmapEditorSelection, showingSourceCharset, sourceCharsetCount, sourcePreviewContent, sourcePreviewZoom, sourceViewportRef, startBitmapEditorPaste, stepPreviewZoom, swapSelectedTilemapInkPaper, switchUnifiedTileEditorContext, synchronizePan, targetModeId, tileEditorColorPickerActive, tileEditorOriginals, tileEditorRedo, tileEditorSelected, tileEditorTilePickerActive, tileEditorUndo, tileStampDraft, tileUsage, tileUsageAvailable, tileUsageFilter, tilemapEditorCell, tilemapPutActive, tilemapPutPointerRef, toggleBitmapEditorColorPicker, toggleBitmapEditorPatternPicker, toggleSelectedTilemapTransform, transformBitmapEditorSelection, undoBitmapEditor, undoFullBitmap, undoFullResult, undoTileEditor, unifiedTileEditorContext, updateSelectedTilemapAttribute, workspaceMode, zxPaletteOptions }: Pick<ReturnType<typeof useRuntimeState>, "bitmapEditorBrightPolicy" | "bitmapEditorBrushSize" | "bitmapEditorBuffer" | "bitmapEditorCell" | "bitmapEditorCellMode" | "bitmapEditorClipboard" | "bitmapEditorColorChannel" | "bitmapEditorColorDraftRef" | "bitmapEditorColorFrom" | "bitmapEditorColorOperation" | "bitmapEditorColorPickerActive" | "bitmapEditorColorScope" | "bitmapEditorColorTo" | "bitmapEditorConnectPoints" | "bitmapEditorFlashPolicy" | "bitmapEditorFlashPreviewMode" | "bitmapEditorFlashPreviewPhase" | "bitmapEditorFloodFillActive" | "bitmapEditorFullBufferRef" | "bitmapEditorFullPointerRef" | "bitmapEditorGridMode" | "bitmapEditorInkColor" | "bitmapEditorMergedFlashCanvasRef" | "bitmapEditorOperation" | "bitmapEditorOriginalResult" | "bitmapEditorPaperColor" | "bitmapEditorPasteAttributes" | "bitmapEditorPasteMode" | "bitmapEditorPastePixels" | "bitmapEditorPatternPickerActive" | "bitmapEditorPickedCell" | "bitmapEditorPointerRef" | "bitmapEditorRedo" | "bitmapEditorRedoFull" | "bitmapEditorRegionSelection" | "bitmapEditorResultBuffer" | "bitmapEditorResultCanvasRef" | "bitmapEditorResultEdited" | "bitmapEditorResultFrameIndex" | "bitmapEditorResultPaletteIndex" | "bitmapEditorResultRedo" | "bitmapEditorResultUndo" | "bitmapEditorRevertSource" | "bitmapEditorScope" | "bitmapEditorSelection" | "bitmapEditorSelectionDraft" | "bitmapEditorSelectionResolution" | "bitmapEditorSelectionTool" | "bitmapEditorShowAttributes" | "bitmapEditorShowPixels" | "bitmapEditorSourceCanvasRef" | "bitmapEditorStippleDensity" | "bitmapEditorStippleEnabled" | "bitmapEditorStipplePattern" | "bitmapEditorTarget" | "bitmapEditorUndo" | "bitmapEditorUndoFull" | "bitmapEditorUseColors" | "charsetState" | "highlightSelectedTileUses" | "panDragRef" | "resultViewportRef" | "setBitmapEditorColorChannel" | "setBitmapEditorColorFrom" | "setBitmapEditorColorOperation" | "setBitmapEditorColorScope" | "setBitmapEditorColorTo" | "setBitmapEditorConnectPoints" | "setBitmapEditorFlashPreviewMode" | "setBitmapEditorFloodFillActive" | "setBitmapEditorGridMode" | "setBitmapEditorOperation" | "setBitmapEditorPasteAttributes" | "setBitmapEditorPasteMode" | "setBitmapEditorPastePixels" | "setBitmapEditorPickedCell" | "setBitmapEditorRegionSelection" | "setBitmapEditorScope" | "setBitmapEditorSelectionDraft" | "setBitmapEditorSelectionResolution" | "setBitmapEditorSelectionTool" | "setBitmapEditorShowAttributes" | "setBitmapEditorShowPixels" | "setBitmapEditorStippleDensity" | "setBitmapEditorStippleEnabled" | "setBitmapEditorStipplePattern" | "setBitmapEditorUseColors" | "setTileEditorColorPickerActive" | "setTileEditorTilePickerActive" | "setTilemapPutActive" | "sourceViewportRef" | "tileEditorColorPickerActive" | "tileEditorOriginals" | "tileEditorRedo" | "tileEditorSelected" | "tileEditorTilePickerActive" | "tileEditorUndo" | "tileStampDraft" | "tilemapEditorCell" | "tilemapPutActive" | "tilemapPutPointerRef" | "unifiedTileEditorContext"> &
    Pick<ReturnType<typeof useSettingsState>, "customOrderedMatrices" | "existingCharsetLength" | "existingCharsetSelection" | "existingCharsetStart" | "framing" | "image" | "targetModeId" | "workspaceMode" | "zxPaletteOptions"> &
    Pick<ReturnType<typeof useWorkbenchState>, "bitmapEditorPrimitiveCursor" | "bitmapEditorPrimitiveCustomPattern" | "bitmapEditorPrimitiveDraft" | "bitmapEditorPrimitiveFillEnabled" | "bitmapEditorPrimitiveFillOperation" | "bitmapEditorPrimitiveFillPattern" | "bitmapEditorPrimitiveKind" | "bitmapEditorPrimitivePatternPickerActive" | "bitmapEditorPrimitiveStrokeEnabled" | "bitmapEditorPrimitiveStrokePattern" | "bitmapEditorToolMode" | "bitmapEditorToolsHost" | "destinationGeometry" | "draggingSide" | "inspection" | "isQl" | "outputPreviewStage" | "previewViewportSizes" | "resultPreviewContent" | "resultPreviewZoom" | "scaleQlToDisplayAspect" | "setBitmapEditorPrimitiveCursor" | "setBitmapEditorPrimitiveDraft" | "setBitmapEditorPrimitiveFillEnabled" | "setBitmapEditorPrimitiveFillOperation" | "setBitmapEditorPrimitiveFillPattern" | "setBitmapEditorPrimitiveKind" | "setBitmapEditorPrimitivePatternPickerActive" | "setBitmapEditorPrimitiveStrokeEnabled" | "setBitmapEditorPrimitiveStrokePattern" | "setBitmapEditorToolMode" | "setResultPreviewZoom" | "setSourcePreviewZoom" | "setSynchronizePan" | "sourcePreviewContent" | "sourcePreviewZoom" | "synchronizePan" | "tileUsageFilter"> &
    Pick<ReturnType<typeof useWorkbenchWindows>, "bitmapEditorActiveSide"> &
    Pick<ReturnType<typeof useResultEditing>, "resultFrameInput"> &
    Pick<ReturnType<typeof useConversionSettings>, "cropSourceSize"> &
    Pick<ReturnType<typeof usePreviewInspection>, "beginPreviewDrag" | "displayedHeight" | "displayedResult" | "displayedWidth" | "endPreviewDrag" | "handlePreviewScroll" | "handlePreviewWheel" | "markPanSource" | "movePreviewDrag" | "selectResultEditorFrame" | "stepPreviewZoom" | "updateSelectedTilemapAttribute"> &
    Pick<ReturnType<typeof useEditorOperations>, "applyBitmapEditorOperation" | "applyEditorOperation" | "beginBitmapEditorPaint" | "beginTileEditorPaint" | "bitmapEditorOrderedMatrix" | "copyBitmapEditorSelection" | "endBitmapEditorPaint" | "endTileEditorPaint" | "fullBitmapBufferFromSource" | "moveBitmapEditorPaint" | "moveEditorTile" | "moveTileEditorPaint" | "redoBitmapEditor" | "redoTileEditor" | "resetTilemapEditorTransform" | "revertSelectedTile" | "swapSelectedTilemapInkPaper" | "switchUnifiedTileEditorContext" | "toggleSelectedTilemapTransform" | "undoBitmapEditor" | "undoTileEditor"> &
    Pick<ReturnType<typeof useBitmapEditorTools>, "applyBitmapEditorColorStep" | "bitmapEditorSelectionDimensions" | "cancelBitmapEditorColorDraft" | "chooseBitmapEditorOperation" | "commitBitmapEditorColorDraft" | "cycleBitmapEditorBrushSize" | "cycleBitmapEditorCellMode" | "previewBitmapEditorColorTransform" | "selectBitmapEditorScope" | "shiftBitmapEditorSelection" | "startBitmapEditorPaste" | "toggleBitmapEditorColorPicker" | "toggleBitmapEditorPatternPicker" | "transformBitmapEditorSelection"> &
    Pick<ReturnType<typeof useBitmapEditorPointer>, "beginFullBitmapPointer" | "clearBitmapEditorSelectionOnDoubleClick" | "endFullBitmapPointer" | "handleBitmapEditorKey" | "handleFullBitmapCanvasKeyDown" | "handleUnifiedEditorKey" | "invertBitmapEditorAttributes" | "moveFullBitmapPointer" | "redoFullBitmap" | "redoFullResult" | "revertBitmapEditorChanges" | "revertFullBitmap" | "revertFullResult" | "setBitmapEditorAttribute" | "undoFullBitmap" | "undoFullResult"> &
    Pick<ReturnType<typeof useCharsetAndExport>, "glyphCount" | "showingSourceCharset" | "tileUsage" | "tileUsageAvailable"> &
    Pick<ReturnType<typeof useProjectAndArtifacts>, "displayedAttributeHeight" | "flashPreviewAvailable" | "sourceCharsetCount">,
) {
  const glyphActiveRange = showingSourceCharset
    ? clampCharsetRange(
        sourceCharsetCount,
        existingCharsetStart,
        existingCharsetLength,
      )
    : { startIndex: 0, length: glyphCount };
  const glyphActiveIndices = !showingSourceCharset
    ? Array.from({ length: glyphCount }, (_, index) => index)
    : existingCharsetSelection === null
      ? Array.from(
          { length: glyphActiveRange.length },
          (_, index) => glyphActiveRange.startIndex + index,
        )
      : [...existingCharsetSelection];
  const glyphActiveIndexSet = new Set(glyphActiveIndices);
  const glyphActiveCount = showingSourceCharset
    ? glyphActiveIndices.length
    : glyphCount;
  const inspectedTileIndex = inspection === null
    ? null
    : inspection.cellY * 32 + inspection.cellX;
  const inspectedTileAssignment = inspectedTileIndex === null ||
    charsetState.kind !== "ready"
    ? null
    : charsetState.result.assignments[inspectedTileIndex] ?? null;
  const visibleTileUsage = tileUsageFilter === "used"
    ? tileUsage.filter((tile) => tile.count > 0)
    : tileUsage;
  const maximumTileUsage = tileUsageAvailable
    ? Math.max(0, ...tileUsage.map(({ count }) => count))
    : 0;
  const sourceZoom = sourcePreviewZoom;
  const resultZoom = resultPreviewZoom;
  const qlVerticalPixelScale = isQl && (
      targetModeId === "mode4-512x256" ||
      targetModeId === "mode4-plain-512x256" ||
      targetModeId === "mode8-mode4-mixed-512x256" ||
      targetModeId === "mode4-vertical-spatial-512x256"
    )
    ? 2
    : 1;
  const analyticVerticalScale = targetModeId.includes("vertical-spatial") &&
      (outputPreviewStage === "merged" || outputPreviewStage === "screen-2")
    ? 2
    : 1;
  const previewAspect = resolvePreviewAspect(
    displayedWidth,
    displayedHeight,
    isQl && scaleQlToDisplayAspect,
    qlVerticalPixelScale,
    4 / 3,
    analyticVerticalScale,
  );
  const sourceShowsImage = framing !== "crop" &&
    (sourcePreviewContent === "image" || sourcePreviewContent === "source-image") &&
    image !== null;
  const sourceShowsConvertedResult = sourcePreviewContent === "result-image" ||
    (targetModeId.includes("vertical-spatial") &&
      (sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2"));
  const sourceStageAspect = sourceShowsConvertedResult
    ? previewAspect
    : framing === "crop"
      ? cropSourceSize ?? destinationGeometry
      : sourceShowsImage
        ? { width: image.width, height: image.height }
        : previewAspect;
  const sourceFitStageSize: PreviewFitSize | null = sourceZoom === "fit"
    ? fitPreviewToViewport(
        previewViewportSizes.source.width,
        previewViewportSizes.source.height,
        sourceStageAspect.width,
        sourceStageAspect.height,
      )
    : null;
  const resultStageAspect = resultPreviewContent === "source-image" && image !== null
    ? { width: image.width, height: image.height }
    : previewAspect;
  const resultFitStageSize: PreviewFitSize | null = resultZoom === "fit"
    ? fitPreviewToViewport(
        previewViewportSizes.result.width,
        previewViewportSizes.result.height,
        resultStageAspect.width,
        resultStageAspect.height,
      )
    : null;
  const fullBitmapEditorPreview = (side: PreviewSide) => {
    const buffer = bitmapEditorTarget === "result"
      ? bitmapEditorResultBuffer
      : bitmapEditorBuffer;
    const frameForEditor = displayedResult?.frames[bitmapEditorResultFrameIndex];
    const sourceForEditor = bitmapEditorTarget === "source" ? (bitmapEditorFullBufferRef.current ?? fullBitmapBufferFromSource()) : null;
    const width = buffer?.width ?? sourceForEditor?.width ?? (bitmapEditorTarget === "result" ? frameForEditor?.nativeWidth : undefined) ?? displayedWidth;
    const height = buffer?.height ?? sourceForEditor?.height ?? (bitmapEditorTarget === "result" ? frameForEditor?.nativeHeight : undefined) ?? displayedHeight;
    const canvasRefForSide = side === "source" ? bitmapEditorSourceCanvasRef : bitmapEditorResultCanvasRef;
    const compatible = workspaceMode === "palette" && (bitmapEditorTarget === "source" ? image !== null : displayedResult !== null);
    const resultFrame = displayedResult?.frames[Math.min(bitmapEditorResultFrameIndex, Math.max(0, (displayedResult?.frames.length ?? 1) - 1))];
    const resultInput = displayedResult === null || resultFrame === undefined
      ? null
      : resultFrameInput(displayedResult, Math.min(bitmapEditorResultFrameIndex, displayedResult.frames.length - 1));
    const nativePalette = bitmapEditorTarget === "result" && resultInput !== null
      ? nativePaletteForResult(resultInput)
      : [];
    const paletteIndexMinimum = displayedResult?.platformId === "pmd-85" ? 1 : 0;
    const paletteIndexMaximum = displayedResult?.platformId === "zx-spectrum" ? 7 : Math.max(paletteIndexMinimum, ...nativePalette.map((color) => color.index));
    const replacementFromIndex = Math.max(paletteIndexMinimum, Math.min(paletteIndexMaximum, bitmapEditorColorFrom));
    const replacementToIndex = Math.max(paletteIndexMinimum, Math.min(paletteIndexMaximum, bitmapEditorColorTo));
    const replacementSwatches = displayedResult?.platformId === "zx-spectrum"
      ? zxPaletteOptions.map((color) => {
          const normal = resultInput?.zxPalette?.normal[color.code];
          const bright = resultInput?.zxPalette?.bright[color.code];
          const rgb = (value: { readonly r: number; readonly g: number; readonly b: number } | undefined) =>
            value === undefined ? color.normal : `rgb(${value.r} ${value.g} ${value.b})`;
          return {
            index: color.code,
            label: color.name,
            color: `linear-gradient(135deg, ${rgb(normal)} 0 49%, ${rgb(bright)} 51% 100%)`,
          };
        })
      : nativePalette.map((color) => ({ index: color.index, label: `Color ${color.index}`, color: `rgb(${color.r} ${color.g} ${color.b})` }));
    const stippleOptions = [
      ...ORDERED_MATRIX_IDS.map((id) => ({ id, label: orderedMatrixLabel(id), matrix: ORDERED_MATRICES[id] })),
      ...customOrderedMatrices.map((matrix) => ({
        id: matrix.id,
        label: `Custom ${matrix.width}×${matrix.height}`,
        matrix: { width: matrix.width, height: matrix.height, values: matrix.values, levels: new Set(matrix.values).size },
      })),
    ];
    const primitiveStrokeMatrix = bitmapEditorPrimitiveStrokePattern === "stipple" ? bitmapEditorOrderedMatrix() : null;
    const primitiveFillMatrix = bitmapEditorPrimitiveFillPattern === "stipple" ? bitmapEditorOrderedMatrix() : null;
    const primitiveStrokePatternWidth = bitmapEditorPrimitiveStrokePattern === "custom" ? 8 : primitiveStrokeMatrix?.width ?? 1;
    const primitiveStrokePatternHeight = bitmapEditorPrimitiveStrokePattern === "custom" ? 8 : primitiveStrokeMatrix?.height ?? 1;
    const primitiveStrokePatternId = `bitmap-primitive-stroke-${side}`;
    const primitiveFillPatternId = `bitmap-primitive-fill-${side}`;
    const primitivePreviewRaster = bitmapEditorPrimitiveDraft === null
      ? null
      : rasterizeBitmapPrimitive(bitmapEditorPrimitiveDraft.kind, bitmapEditorPrimitiveDraft.start, bitmapEditorPrimitiveDraft.current, width, height);
    const primitivePreviewStroke = primitivePreviewRaster === null || !bitmapEditorPrimitiveStrokeEnabled
      ? []
      : rasterizeBitmapBrushStroke(primitivePreviewRaster.outline, (x, y) => bitmapEditorBrushPixels(x, y, bitmapEditorBrushSize, width, height));
    const attributeWidth = bitmapEditorTarget === "result" && displayedResult?.platformId === "pmd-85" ? 6 : bitmapEditorTarget === "result" && displayedResult?.platformId === "zx-spectrum" ? 8 : null;
    const attributeHeight = bitmapEditorTarget === "result" && displayedResult?.platformId === "pmd-85" ? targetModeId === "pmd85-colorace" ? 2 : 1 : bitmapEditorTarget === "result" ? displayedResult?.attributeHeight ?? null : null;
    const sideZoom = side === "source" ? sourceZoom : resultZoom;
    const effectiveGridMode = sideZoom === "fit" && bitmapEditorGridMode === "pixel" && attributeWidth !== null && attributeHeight !== null
      ? "cell"
      : bitmapEditorGridMode;
    const pickedPreviewHeight = bitmapEditorPickedCell?.attributeHeight ?? (attributeHeight === 1 || attributeHeight === 2 || attributeHeight === 4 || attributeHeight === 8 ? attributeHeight : 8);
    const pickedPreviewRows = bitmapEditorPickedCell?.rows ?? new Uint8Array(pickedPreviewHeight);
    const pickedPreviewBaseAttribute = bitmapEditorPickedCell?.attribute ?? 0;
    const pickedPreviewAttribute =
      (bitmapEditorInkColor ?? (bitmapEditorPickedCell === null ? 0 : pickedPreviewBaseAttribute & 7)) |
      ((bitmapEditorPaperColor ?? (bitmapEditorPickedCell === null ? 7 : (pickedPreviewBaseAttribute >> 3) & 7)) << 3) |
      ((bitmapEditorBrightPolicy ?? (bitmapEditorPickedCell === null ? false : (pickedPreviewBaseAttribute & 0x40) !== 0)) ? 0x40 : 0) |
      ((bitmapEditorFlashPolicy ?? (bitmapEditorPickedCell === null ? false : (pickedPreviewBaseAttribute & 0x80) !== 0)) ? 0x80 : 0);
    const pickedPreviewBright = (pickedPreviewAttribute & 0x40) !== 0;
    const pickedPreviewInk = ZX_BASE_COLORS[pickedPreviewAttribute & 7];
    const pickedPreviewPaper = ZX_BASE_COLORS[(pickedPreviewAttribute >> 3) & 7];
    const primitiveSampleInkColor = displayedResult?.platformId === "zx-spectrum"
      ? pickedPreviewInk?.[pickedPreviewBright ? "bright" : "normal"] ?? "#000000"
      : (() => {
          const color = nativePalette.find(({ index }) => index === bitmapEditorResultPaletteIndex) ?? nativePalette[0];
          return color === undefined ? "#ffffff" : `rgb(${color.r} ${color.g} ${color.b})`;
        })();
    const primitiveSamplePaperColor = displayedResult?.platformId === "zx-spectrum"
      ? pickedPreviewPaper?.[pickedPreviewBright ? "bright" : "normal"] ?? "#ffffff"
      : (() => {
          const color = nativePalette.find(({ index }) => index === 0) ?? nativePalette[0];
          return color === undefined ? "#000000" : `rgb(${color.r} ${color.g} ${color.b})`;
        })();
    const bitmapEditorActions = <div className="bitmap-editor-full-toolbar" data-tool-mode={bitmapEditorToolMode} aria-label="Bitmap editor actions" onPointerDown={(event) => { bitmapEditorFullPointerRef.current = null; bitmapEditorPointerRef.current = null; panDragRef.current = null; event.stopPropagation(); }}>
      <nav className="bitmap-editor-tool-mode-tabs" aria-label="Bitmap editor tools">
        {(["display", "selection", "draw", "primitives", "colors"] as const).map((mode) => {
          const label = mode === "display" ? "Display" : mode === "selection" ? "Selection" : mode === "draw" ? "Draw" : mode === "primitives" ? "Primitives" : "Palette";
          const icon = mode === "display"
            ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.2-6 9.5-6 9.5 6 9.5 6-3.2 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.7" /></svg>
            : mode === "selection"
              ? <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="1" strokeDasharray="2.5 2.5" /><path d="M8 8h8v8H8z" /></svg>
              : mode === "draw"
                ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5 4 16.5Z" /><path d="m13.8 6.7 3.5 3.5M4 20.8l4.3-.8" /></svg>
                : mode === "primitives"
                  ? <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="7.5" /><path d="M3 20 8 15M3 20h5M3 20v-5" /><rect x="13.5" y="3.5" width="7" height="5" rx=".5" /></svg>
                  : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2a8.8 8.8 0 1 0 0 17.6h1.1a2 2 0 0 0 1.5-3.3 1.7 1.7 0 0 1 1.3-2.8h1.2a3.7 3.7 0 0 0 3.7-3.7c0-4.3-4-7.8-8.8-7.8Z" /><circle cx="7.7" cy="10" r=".9" /><circle cx="11" cy="7.2" r=".9" /><circle cx="15.1" cy="8" r=".9" /><circle cx="17.1" cy="11.2" r=".9" /></svg>;
          return <Tooltip key={mode} label={label} position="right" withArrow openDelay={350}>
            <NavLink
              component="button"
              type="button"
              className="bitmap-editor-tool-nav-link"
              active={bitmapEditorToolMode === mode}
              aria-label={label}
              aria-current={bitmapEditorToolMode === mode ? "page" : undefined}
              aria-pressed={bitmapEditorToolMode === mode}
              classNames={{ section: "bitmap-editor-tool-nav-section" }}
              label={<span className="bitmap-editor-visually-hidden">{label}</span>}
              leftSection={<span className="bitmap-editor-tool-icon">{icon}</span>}
              onClick={() => {
                setBitmapEditorToolMode(mode);
                if (mode === "primitives") {
                  const dimensions = bitmapEditorSelectionDimensions();
                  const selected = bitmapEditorSelection;
                  setBitmapEditorPrimitiveCursor(selected === null || dimensions === null
                    ? dimensions === null ? null : { x: Math.floor(dimensions.width / 2), y: Math.floor(dimensions.height / 2) }
                    : { x: selected.pixelX, y: selected.pixelY });
                  setBitmapEditorPrimitiveDraft(null);
                } else {
                  setBitmapEditorPrimitiveDraft(null);
                  setBitmapEditorPrimitivePatternPickerActive(false);
                }
              }}
            />
          </Tooltip>;
        })}
      </nav>
      <div className="bitmap-editor-tool-panel" aria-label={`${bitmapEditorToolMode} controls`}>
      {bitmapEditorToolMode !== "colors" && bitmapEditorColorDraftRef.current !== null ? <div className="bitmap-editor-pending-color-draft" role="status">Palette preview not applied. Return to Palette and choose Apply to save it.</div> : null}
      <div className="bitmap-editor-control-grid" aria-label="Bitmap editor controls">
      {bitmapEditorTarget === "result" && displayedResult !== null && displayedResult.frames.length > 1 ? <label className="bitmap-editor-target-control"><span>Frame</span><select value={bitmapEditorResultFrameIndex} onChange={(event) => { const index = Number(event.target.value); selectResultEditorFrame(displayedResult, index); }} aria-label="Result frame">{displayedResult.frames.map((_, index) => <option value={index} key={index}>Screen {index + 1}</option>)}</select></label> : null}
      <SegmentedControl
        className="bitmap-editor-command-segments"
        classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
        fullWidth
        aria-label="Undo, redo, and revert"
        value=""
        data={[
          { value: "undo", label: "Undo", disabled: bitmapEditorTarget === "result" ? bitmapEditorResultUndo.length === 0 : bitmapEditorUndoFull.length === 0 },
          { value: "redo", label: "Redo", disabled: bitmapEditorTarget === "result" ? bitmapEditorResultRedo.length === 0 : bitmapEditorRedoFull.length === 0 },
          { value: "revert", label: "Revert", disabled: bitmapEditorTarget === "result" ? !bitmapEditorResultEdited : bitmapEditorRevertSource === null },
        ]}
        onChange={(action) => {
          if (action === "undo") bitmapEditorTarget === "result" ? undoFullResult() : undoFullBitmap();
          if (action === "redo") bitmapEditorTarget === "result" ? redoFullResult() : redoFullBitmap();
          if (action === "revert") bitmapEditorTarget === "result" ? revertFullResult() : revertFullBitmap();
        }}
      />
      <div className="bitmap-editor-display-tools" data-editor-group="display" aria-label="Bitmap display controls">
        <div className="bitmap-editor-display-row">
          <div className="bitmap-editor-display-control"><span>Grid</span><SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Grid display"
            value={bitmapEditorGridMode}
            data={[{ value: "pixel", label: "1×1" }, { value: "cell", label: attributeWidth !== null && attributeHeight !== null ? `${attributeWidth}×${attributeHeight}` : "Attribute", disabled: attributeWidth === null || attributeHeight === null }, { value: "off", label: "Off" }]}
            onChange={(value) => setBitmapEditorGridMode(value as "pixel" | "cell" | "off")}
          /></div>
          <div className="bitmap-editor-display-control"><span>Zoom</span><SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Bitmap editor zoom"
            value=""
            data={[{ value: "out", label: <span title="Zoom out">−</span> }, { value: "in", label: <span title="Zoom in">+</span> }, { value: "fit", label: "Fit" }]}
            onChange={(action) => {
              if (action === "out" && bitmapEditorActiveSide !== null) stepPreviewZoom(bitmapEditorActiveSide, -1);
              if (action === "in" && bitmapEditorActiveSide !== null) stepPreviewZoom(bitmapEditorActiveSide, 1);
              if (action === "fit") bitmapEditorActiveSide === "source" ? setSourcePreviewZoom("fit") : setResultPreviewZoom("fit");
            }}
          /></div>
          {bitmapEditorTarget === "result" && displayedResult?.platformId === "zx-spectrum" ? <div className="bitmap-editor-display-control bitmap-editor-flash-control" data-toggle-state={bitmapEditorFlashPreviewMode === "off" ? "off" : "on"}><span>FLASH</span><SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="FLASH preview"
            value={bitmapEditorFlashPreviewMode}
            data={[{ value: "normal", label: "1" }, { value: "inverted", label: "2", disabled: !flashPreviewAvailable }, { value: "off", label: "Off" }, { value: "animate", label: "Anim", disabled: !flashPreviewAvailable }]}
            onChange={(value) => setBitmapEditorFlashPreviewMode(value as "normal" | "inverted" | "off" | "animate")}
          /></div> : null}
        </div>
        <div className="bitmap-editor-display-row bitmap-editor-content-visibility" aria-label="Result content visibility">
          <div className="bitmap-editor-display-control" data-toggle-state={bitmapEditorShowPixels ? "on" : "off"}><span>Show pixels</span><SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            color={bitmapEditorShowPixels ? "#7189aa" : "#34435b"}
            fullWidth
            aria-label="Show pixels in result"
            value={bitmapEditorShowPixels ? "on" : "off"}
            data={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]}
            onChange={(value) => setBitmapEditorShowPixels(value === "on")}
          /></div>
          <div className="bitmap-editor-display-control" data-toggle-state={bitmapEditorShowAttributes ? "on" : "off"}><span>Show attributes</span><SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            color={bitmapEditorShowAttributes ? "#7189aa" : "#34435b"}
            fullWidth
            aria-label="Show attributes in result"
            value={bitmapEditorShowAttributes ? "on" : "off"}
            data={[{ value: "on", label: "On" }, { value: "off", label: "Off", disabled: attributeWidth === null || attributeHeight === null }]}
            onChange={(value) => setBitmapEditorShowAttributes(value === "on")}
          /></div>
        </div>
        <label className="bitmap-editor-sync-pan"><input type="checkbox" checked={synchronizePan} onChange={(event) => setSynchronizePan(event.target.checked)} /><span>Synchronize pan</span></label>
      </div>
      <div className="bitmap-editor-action-grid bitmap-editor-tools-grid" data-editor-group="draw" aria-label="Bitmap editing tools">
        <SegmentedControl
          className="bitmap-editor-segmented bitmap-editor-tool-mode-segments"
          classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
          fullWidth
          aria-label="Active paint mode"
          value={bitmapEditorPasteMode !== null ? "selection" : bitmapEditorFloodFillActive ? "flood-fill" : bitmapEditorScope}
          data={[
            { value: "pixel", label: <span className="bitmap-editor-mode-label" aria-label={`Pixel paint, ${bitmapEditorBrushSize} brush`} title={`Pixel paint: ${bitmapEditorBrushSize} brush · select to cycle size`}><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="3" width="10" height="10" rx="1" /></svg>{bitmapEditorBrushSize.replace("x", "×")}</span> },
            { value: "cell", label: <span className="bitmap-editor-mode-label" aria-label={`Cell paint: ${bitmapEditorCellModeLabel(bitmapEditorCellMode)}`} title={bitmapEditorTarget === "result" && displayedResult?.platformId === "zx-spectrum" ? `Cell paint: ${bitmapEditorCellModeLabel(bitmapEditorCellMode)} · select to cycle cell mode` : "Cell paint is available for a converted ZX Spectrum result"}><svg viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" rx="1" /><path d="M6 2v12M10 2v12M2 6h12M2 10h12" /></svg>{bitmapEditorCellModeLabel(bitmapEditorCellMode)}</span>, disabled: bitmapEditorTarget !== "result" || displayedResult?.platformId !== "zx-spectrum" },
            { value: "flood-fill", label: <span className="bitmap-editor-mode-label" aria-label="Flood fill connected area" title="Fill the connected area under the pointer"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3h7l3 3v7H3z" /><path d="M10 3v3h3M6 8c0 1.5-2 2-2 3.4a2 2 0 0 0 4 0C8 10 6 9.5 6 8Z" /></svg>FILL</span> },
            { value: "selection", label: <span aria-label="Selection paint" title="Paste the selection clipboard. Turn PIXELS and ATTRS on or off in the Selection tab.">SEL</span>, disabled: bitmapEditorClipboard === null && bitmapEditorRegionSelection === null },
          ]}
          onChange={(value) => {
            if (value === "selection") startBitmapEditorPaste("copy");
            else if (value === "flood-fill") {
              setBitmapEditorPasteMode(null);
              setBitmapEditorFloodFillActive(true);
              setBitmapEditorScope("pixel");
            }
            else {
              setBitmapEditorPasteMode(null);
              setBitmapEditorFloodFillActive(false);
              selectBitmapEditorScope(value as "pixel" | "cell");
            }
          }}
          onClick={(event) => {
            const label = (event.target as HTMLElement).closest(".bitmap-editor-segment-label");
            if (label === null) return;
            if (bitmapEditorPasteMode !== null) {
              if (label.textContent?.trim() === "SEL") startBitmapEditorPaste("copy");
              return;
            }
            if (!bitmapEditorFloodFillActive && label.textContent?.trim() === bitmapEditorBrushSize.replace("x", "×") && bitmapEditorScope === "pixel") cycleBitmapEditorBrushSize();
            if (label.textContent?.trim() === bitmapEditorCellModeLabel(bitmapEditorCellMode) && bitmapEditorScope === "cell") cycleBitmapEditorCellMode();
          }}
        />
        <SegmentedControl
          className="bitmap-editor-segmented bitmap-editor-tools-segment"
          classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
          fullWidth
          aria-label="Bitmap operation for pixel, graphics, and selection paste"
          value={bitmapEditorOperation}
          data={(["copy", "or", "and", "xor", "none"] as const).map((operation) => ({
            value: operation,
            label: <Tooltip
              label={`${bitmapEditorOperationLabel(operation)}${bitmapEditorOperationDescription(operation, bitmapEditorScope) === bitmapEditorOperationLabel(operation) ? "" : ` · ${bitmapEditorOperationDescription(operation, bitmapEditorScope)}`}${bitmapEditorRegionSelection !== null && bitmapEditorPasteMode === null ? operation === "copy" ? " · copy selection and place" : operation === "and" ? " · remove selected pixels" : operation === "none" ? " · clear selection" : " · copy selection and place" : ""}`}
              position="top"
              withArrow
              openDelay={350}
            >
              <span aria-label={`Operation ${bitmapEditorOperationLabel(operation)}: ${bitmapEditorOperationDescription(operation, bitmapEditorScope)}`}>
                {bitmapEditorOperationLabel(operation)}
              </span>
            </Tooltip>,
          }))}
          onChange={(value) => chooseBitmapEditorOperation(value as typeof bitmapEditorOperation)}
        />
        <div className="bitmap-editor-picker-mode-segments" role="group" aria-label="Color and graphics pickers">
          <Tooltip label="Color picker" position="top" withArrow openDelay={350}><button className={`secondary compact bitmap-editor-full-action bitmap-editor-picker-icon${bitmapEditorColorPickerActive ? " active" : ""}`} type="button" onClick={toggleBitmapEditorColorPicker} disabled={bitmapEditorTarget !== "result" || displayedResult?.platformId !== "zx-spectrum"} aria-label="Color picker: choose INK, PAPER, BRIGHT, and FLASH" aria-pressed={bitmapEditorColorPickerActive}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.2 6.1 3.7 3.7M5.2 18.8l3.3-.8L19.2 7.3a2 2 0 0 0-2.8-2.8L5.7 15.2l-.5 3.6Z" /><path d="M4 21h7" /></svg></button></Tooltip>
          <Tooltip label="Pattern picker" position="top" withArrow openDelay={350}><button className={`secondary compact bitmap-editor-full-action bitmap-editor-picker-icon${bitmapEditorPatternPickerActive ? " active" : ""}`} type="button" onClick={toggleBitmapEditorPatternPicker} disabled={bitmapEditorTarget !== "result" || displayedResult?.platformId !== "zx-spectrum"} aria-label="Pattern picker: choose a source cell for Cell Tile" aria-pressed={bitmapEditorPatternPickerActive}><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></svg></button></Tooltip>
        </div>
      </div>
      {bitmapEditorTarget === "result" && displayedResult !== null ? <div className="bitmap-editor-color-operations" data-editor-group="colors" aria-label="Color transformation controls">
        <span className="bitmap-editor-control-heading">Color transform</span>
        <SegmentedControl
          className="bitmap-editor-segmented bitmap-editor-color-operation-control"
          classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
          fullWidth
          aria-label="Color operation"
          value={bitmapEditorColorOperation}
          data={[{ value: "replace", label: "Replace" }, { value: "increase", label: "Increase" }, { value: "decrease", label: "Decrease" }]}
          onChange={(value) => {
            const operation = value as typeof bitmapEditorColorOperation;
            if (operation === "replace") {
              if (bitmapEditorColorDraftRef.current !== null) bitmapEditorColorDraftRef.current.steps = 0;
              setBitmapEditorColorOperation(operation);
              previewBitmapEditorColorTransform(operation);
            } else applyBitmapEditorColorStep(operation);
          }}
          onClick={(event) => {
            const label = (event.target as HTMLElement).closest(".bitmap-editor-segment-label");
            const selectedLabel = bitmapEditorColorOperation === "replace"
              ? "Replace"
              : bitmapEditorColorOperation === "increase"
                ? "Increase"
                : "Decrease";
            if (label?.textContent?.trim() === selectedLabel) {
              if (bitmapEditorColorOperation === "increase" || bitmapEditorColorOperation === "decrease") {
                applyBitmapEditorColorStep(bitmapEditorColorOperation);
              } else {
                if (bitmapEditorColorDraftRef.current !== null) bitmapEditorColorDraftRef.current.steps = 0;
                previewBitmapEditorColorTransform("replace");
              }
            }
          }}
        />
        {displayedResult.platformId === "zx-spectrum" ? <label className="bitmap-editor-tool-select"><span>Fields</span><select aria-label="Color fields" value={bitmapEditorColorChannel} onChange={(event) => { const channel = event.target.value as "both" | "ink" | "paper"; setBitmapEditorColorChannel(channel); previewBitmapEditorColorTransform(bitmapEditorColorOperation, { channel }); }}><option value="both">INK and PAPER</option><option value="ink">INK only</option><option value="paper">PAPER only</option></select></label> : null}
        {bitmapEditorColorOperation === "replace" ? <>
          <div className="bitmap-editor-color-replace-row">
            <div className="bitmap-editor-color-swatches" role="group" aria-label="Replace this color">
              <span>From</span>
              <div>{replacementSwatches.filter((swatch) => swatch.index >= paletteIndexMinimum && swatch.index <= paletteIndexMaximum).map((swatch) => <button key={swatch.index} type="button" title={`From ${swatch.label}`} aria-label={`Replace from ${swatch.label}`} aria-pressed={replacementFromIndex === swatch.index} className={replacementFromIndex === swatch.index ? "selected" : ""} style={{ "--swatch-color": swatch.color } as React.CSSProperties} onClick={() => { setBitmapEditorColorFrom(swatch.index); previewBitmapEditorColorTransform("replace", { from: swatch.index, to: replacementToIndex }); }} />)}</div>
            </div>
            <div className="bitmap-editor-color-swatches" role="group" aria-label="Replace with this color">
              <span>To</span>
              <div>{replacementSwatches.filter((swatch) => swatch.index >= paletteIndexMinimum && swatch.index <= paletteIndexMaximum).map((swatch) => <button key={swatch.index} type="button" title={`To ${swatch.label}`} aria-label={`Replace with ${swatch.label}`} aria-pressed={replacementToIndex === swatch.index} className={replacementToIndex === swatch.index ? "selected" : ""} style={{ "--swatch-color": swatch.color } as React.CSSProperties} onClick={() => { setBitmapEditorColorTo(swatch.index); previewBitmapEditorColorTransform("replace", { from: replacementFromIndex, to: swatch.index }); }} />)}</div>
            </div>
          </div>
        </> : null}
        <SegmentedControl
          className="bitmap-editor-segmented"
          classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
          fullWidth
          aria-label="Color operation scope"
          value={bitmapEditorColorScope}
          data={[{ value: "selection", label: "Selection" }, { value: "image", label: "Whole image" }]}
          onChange={(value) => { const scope = value as typeof bitmapEditorColorScope; setBitmapEditorColorScope(scope); previewBitmapEditorColorTransform(bitmapEditorColorOperation, { scope }); }}
        />
        <SegmentedControl
          className="bitmap-editor-segmented bitmap-editor-color-actions"
          classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
          fullWidth
          aria-label="Apply or cancel color changes"
          value=""
          data={[
            { value: "apply", label: "Apply", disabled: bitmapEditorColorDraftRef.current === null },
            { value: "cancel", label: "Cancel", disabled: bitmapEditorColorDraftRef.current === null },
          ]}
          onChange={(action) => {
            if (action === "apply") commitBitmapEditorColorDraft();
            if (action === "cancel") cancelBitmapEditorColorDraft();
          }}
        />
        {bitmapEditorColorOperation !== "replace" ? <span className="bitmap-editor-color-help">Each click previews from the saved colors. Repeated changes remain reversible until Apply.</span> : null}
      </div> : null}
      <div className="bitmap-editor-region-tools" data-editor-group="selection" aria-label="Region selection tools">
        <div className="bitmap-editor-region-buttons">
          <SegmentedControl
            className="bitmap-editor-command-segments"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Select bitmap area"
            value=""
            data={[
              { value: "all", label: "All" },
              { value: "off", label: "Off" },
              { value: "invert", label: "Invert", disabled: bitmapEditorRegionSelection === null },
            ]}
            onChange={(action) => {
              if (action === "all") {
                setBitmapEditorSelectionTool("none");
                const selection = { x: 0, y: 0, width, height, mask: new Uint8Array(width * height).fill(1), resolution: bitmapEditorSelectionResolution, gridWidth: attributeWidth ?? 1, gridHeight: attributeHeight ?? 1 } satisfies BitmapRegionSelection;
                setBitmapEditorRegionSelection(selection);
                copyBitmapEditorSelection(selection, false);
              }
              if (action === "off") {
                setBitmapEditorRegionSelection(null);
                setBitmapEditorSelectionDraft(null);
                setBitmapEditorSelectionTool("rectangle");
                setBitmapEditorPasteMode(null);
              }
              if (action === "invert") {
                const selected = bitmapEditorRegionSelection;
                if (selected !== null) {
                  const inverted = { ...selected, mask: Uint8Array.from(selected.mask, (pixel) => pixel ? 0 : 1) };
                  setBitmapEditorRegionSelection(inverted);
                  copyBitmapEditorSelection(inverted, false);
                }
              }
            }}
          />
        </div>
        <div className="bitmap-editor-tool-select">
          <span>Selection</span>
          <SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Selection tool"
            value={bitmapEditorSelectionTool}
            data={[{ value: "none", label: "Off" }, { value: "rectangle", label: "Rect" }, { value: "freeform", label: "Free" }]}
            onChange={(value) => setBitmapEditorSelectionTool(value as "none" | BitmapSelectionKind)}
          />
        </div>
        <div className="bitmap-editor-tool-select">
          <span>Resolution</span>
          <SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Selection resolution"
            value={bitmapEditorSelectionResolution}
            data={[{ value: "pixel", label: "Pixels" }, { value: "attribute", label: "Attributes", disabled: attributeWidth === null || attributeHeight === null }]}
            onChange={(value) => {
              const resolution = value as BitmapSelectionResolution;
              setBitmapEditorSelectionResolution(resolution);
            }}
          />
        </div>
        <div className="bitmap-editor-tool-select bitmap-editor-selection-paste-content">
          <span>Paste content</span>
          <div className="bitmap-editor-display-row">
            <div className="bitmap-editor-display-control" data-toggle-state={bitmapEditorPastePixels ? "on" : "off"}><span>PIXELS</span><SegmentedControl
              className="bitmap-editor-segmented"
              classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
              color={bitmapEditorPastePixels ? "#7189aa" : "#34435b"}
              fullWidth
              aria-label="Paste pixels"
              value={bitmapEditorPastePixels ? "on" : "off"}
              data={[{ value: "on", label: "On" }, { value: "off", label: "Off" }]}
              onChange={(value) => setBitmapEditorPastePixels(value === "on")}
            /></div>
            <div className="bitmap-editor-display-control" data-toggle-state={bitmapEditorPasteAttributes ? "on" : "off"}><span>ATTRS</span><SegmentedControl
              className="bitmap-editor-segmented"
              classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
              color={bitmapEditorPasteAttributes ? "#7189aa" : "#34435b"}
              fullWidth
              aria-label="Paste attributes"
              value={bitmapEditorPasteAttributes ? "on" : "off"}
              data={[{ value: "on", label: "On", disabled: attributeWidth === null || attributeHeight === null || displayedResult?.platformId !== "zx-spectrum" }, { value: "off", label: "Off" }]}
              onChange={(value) => setBitmapEditorPasteAttributes(value === "on")}
            /></div>
          </div>
        </div>
        <div className="bitmap-editor-region-buttons">
          <SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Selection CORIN operation"
            value={bitmapEditorOperation}
            data={([
              ["copy", "Copy"], ["or", "OR"], ["and", "AND"], ["xor", "XOR"],
            ] as const).map(([operation, label]) => ({
              value: operation,
              label,
            }))}
            onChange={(value) => chooseBitmapEditorOperation(value as typeof bitmapEditorOperation)}
          />
        </div>
        <div className="bitmap-editor-region-buttons">
          <SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Copy selection to clipboard"
            value=""
            data={[{ value: "copy", label: "Copy", disabled: bitmapEditorRegionSelection === null || bitmapEditorTarget !== "result" }]}
            onChange={() => copyBitmapEditorSelection()}
          />
        </div>
        <div className="bitmap-editor-region-buttons">
          <SegmentedControl
            className="bitmap-editor-segmented"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Selection paste mode"
            value={bitmapEditorPasteMode ?? "off"}
            data={[
              { value: "off", label: "Off" },
              { value: "copy", label: "Paste", disabled: bitmapEditorClipboard === null && bitmapEditorRegionSelection === null },
              { value: "move", label: "Move", disabled: bitmapEditorClipboard === null && bitmapEditorRegionSelection === null },
            ]}
            onChange={(value) => value === "off" ? setBitmapEditorPasteMode(null) : startBitmapEditorPaste(value as "copy" | "move")}
          />
        </div>
        <div className="bitmap-editor-region-buttons bitmap-editor-selection-transform-tools">
          <span className="bitmap-editor-selection-tool-label">Transform selection</span>
          <SegmentedControl
            className="bitmap-editor-command-segments bitmap-editor-transform-segments"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Transform selection"
            value=""
            data={([
              ["mirror-x", "Mirror horizontally", <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M4 7h5M4 12h5M4 17h5M15 7h5M15 12h5M15 17h5" /><path d="m6 5-2 2 2 2m12-4 2 2-2 2m-12 6-2 2 2 2m12-4 2 2-2 2" /></svg>],
              ["mirror-y", "Mirror vertically", <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12h18M7 4v5M12 4v5M17 4v5M7 15v5M12 15v5M17 15v5" /><path d="m5 6 2-2 2 2m4 0 2-2 2 2m-10 12 2 2 2-2m4 0 2 2 2-2" /></svg>],
              ["rotate-cw", "Rotate 90 degrees clockwise", <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0 1 4M20 4v7h-7" /><path d="M8 9h3v7M8 12h3" /></svg>],
              ["rotate-ccw", "Rotate 90 degrees counterclockwise", <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11a8 8 0 1 1-1 4M4 4v7h7" /><path d="M13 9h3v7M13 12h3" /></svg>],
            ] as const).map(([value, label, icon]) => ({
              value,
              label: <Tooltip label={label} position="top" withArrow openDelay={350}><span className="bitmap-editor-transform-icon" aria-label={label}>{icon}</span></Tooltip>,
              disabled: bitmapEditorRegionSelection === null || bitmapEditorTarget !== "result",
            }))}
            onChange={(value) => transformBitmapEditorSelection(value as "mirror-x" | "mirror-y" | "rotate-cw" | "rotate-ccw")}
          />
          <span className="bitmap-editor-selection-tool-label">Move selection</span>
          <SegmentedControl
            className="bitmap-editor-command-segments"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Shift selected pixels"
            value=""
            data={(["left", "right", "up", "down"] as const).map((direction) => ({
              value: direction,
              label: <Tooltip label={`Move selection ${direction}`} position="top" withArrow openDelay={350}><span aria-label={`Move selection ${direction}`}>{direction === "left" ? "←" : direction === "right" ? "→" : direction === "up" ? "↑" : "↓"}</span></Tooltip>,
              disabled: bitmapEditorRegionSelection === null,
            }))}
            onChange={(value) => shiftBitmapEditorSelection(value as "left" | "right" | "up" | "down", bitmapEditorSelectionResolution)}
          />
        </div>
        {bitmapEditorPasteMode !== null ? <span role="status" className="bitmap-editor-selection-status">{bitmapEditorPasteMode === "move" ? "Click destination to move · Off ends selection paint" : `Click destination · ${bitmapEditorOperationLabel(bitmapEditorOperation)} ${bitmapEditorOperationDescription(bitmapEditorOperation, "pixel")} · click again to paste · Off ends selection paint`}</span> : bitmapEditorRegionSelection !== null ? <span className="bitmap-editor-selection-status">Selected {bitmapEditorRegionSelection.width}×{bitmapEditorRegionSelection.height} px{bitmapEditorRegionSelection.resolution === "attribute" ? ` · ${bitmapEditorRegionSelection.gridWidth}×${bitmapEditorRegionSelection.gridHeight} grid` : ""}</span> : null}
      </div>
      <div className="bitmap-editor-stipple-tools" data-editor-group="draw" aria-label="Stipple brush">
        <div className="bitmap-editor-stipple-toggles">
          <label className="bitmap-editor-stipple-toggle"><input type="checkbox" checked={bitmapEditorStippleEnabled} onChange={(event) => setBitmapEditorStippleEnabled(event.target.checked)} /><span>Stipple</span></label>
          <label className="bitmap-editor-stipple-toggle" title="Connect consecutive pointer positions with a continuous pixel stroke"><input type="checkbox" checked={bitmapEditorConnectPoints} disabled={bitmapEditorScope !== "pixel" || bitmapEditorFloodFillActive} onChange={(event) => setBitmapEditorConnectPoints(event.target.checked)} /><span>Connect points</span></label>
        </div>
        <BitmapEditorStipplePicker choices={stippleOptions} selectedId={bitmapEditorStipplePattern} density={bitmapEditorStippleDensity} onSelect={setBitmapEditorStipplePattern} onDensityChange={setBitmapEditorStippleDensity} disabled={!bitmapEditorStippleEnabled} />
      </div>
      <div className="bitmap-editor-primitives" data-editor-group="primitives" aria-label="Primitive drawing controls">
        <div className="bitmap-editor-primitive-kind" role="group" aria-label="Primitive shape">
          {([
            ["line", "Connected line", <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 16 9 9l4 3 4-8" /><circle cx="3" cy="16" r="1" /><circle cx="17" cy="4" r="1" /></svg>],
            ["circle", "Circle from center", <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5" /><path d="M10 10 16 10" /><circle cx="10" cy="10" r="1" /></svg>],
            ["ellipse", "Ellipse from corners", <svg viewBox="0 0 20 20" aria-hidden="true"><ellipse cx="10" cy="10" rx="7" ry="4.5" /><path d="M3 5.5h3v2m11 7h-3v-2" /></svg>],
            ["rectangle", "Rectangle from corners", <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="4" width="14" height="12" rx=".5" /><path d="M3 7V4h3m8 12h3v-3" /></svg>],
          ] as const).map(([kind, label, icon]) => <Tooltip key={kind} label={label} position="top" withArrow openDelay={350}>
            <button className={`secondary compact bitmap-editor-primitive-kind-button${bitmapEditorPrimitiveKind === kind ? " active" : ""}`} type="button" aria-label={label} aria-pressed={bitmapEditorPrimitiveKind === kind} onClick={() => { setBitmapEditorPrimitiveKind(kind); setBitmapEditorPrimitiveDraft(null); }}>{icon}</button>
          </Tooltip>)}
        </div>
        <label className="bitmap-editor-primitive-toggle"><input type="checkbox" checked={bitmapEditorPrimitiveStrokeEnabled} onChange={(event) => setBitmapEditorPrimitiveStrokeEnabled(event.target.checked)} /><span>Stroke</span></label>
        <SegmentedControl
          className="bitmap-editor-segmented bitmap-editor-primitive-operation"
          classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
          fullWidth
          aria-label="Stroke operation"
          value={bitmapEditorOperation}
          data={(["copy", "or", "and", "xor", "none"] as const).map((operation) => ({ value: operation, label: bitmapEditorOperationLabel(operation) }))}
          onChange={(value) => setBitmapEditorOperation(value as BitmapEditorOperation)}
        />
        <SegmentedControl
          className="bitmap-editor-segmented bitmap-editor-primitive-pattern-source"
          classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
          fullWidth
          aria-label="Stroke pattern source"
          value={bitmapEditorPrimitiveStrokePattern}
          data={[{ value: "solid", label: "Solid" }, { value: "empty", label: "Empty" }, { value: "stipple", label: "Stipple" }, { value: "custom", label: "Custom" }]}
          onChange={(value) => setBitmapEditorPrimitiveStrokePattern(value as "solid" | "empty" | "stipple" | "custom")}
          disabled={!bitmapEditorPrimitiveStrokeEnabled}
        />
        {bitmapEditorPrimitiveStrokePattern === "stipple" ? <BitmapEditorStipplePicker choices={stippleOptions} selectedId={bitmapEditorStipplePattern} density={bitmapEditorStippleDensity} onSelect={setBitmapEditorStipplePattern} onDensityChange={setBitmapEditorStippleDensity} disabled={!bitmapEditorPrimitiveStrokeEnabled} /> : bitmapEditorPrimitiveStrokePattern === "custom" ? <div className="bitmap-editor-primitive-custom-pattern">
          <button className={`secondary compact${bitmapEditorPrimitivePatternPickerActive ? " active" : ""}`} type="button" disabled={!bitmapEditorPrimitiveStrokeEnabled} aria-pressed={bitmapEditorPrimitivePatternPickerActive} onClick={() => setBitmapEditorPrimitivePatternPickerActive((active) => !active)}>{bitmapEditorPrimitiveCustomPattern === null ? "Pick 8×8" : "Repick 8×8"}</button>
          <span role="status">{bitmapEditorPrimitivePatternPickerActive ? "Click a result area to sample" : bitmapEditorPrimitiveCustomPattern === null ? "No custom pattern" : "Pattern ready"}</span>
        </div> : null}
        <label className="bitmap-editor-primitive-toggle"><input type="checkbox" checked={bitmapEditorPrimitiveFillEnabled} onChange={(event) => setBitmapEditorPrimitiveFillEnabled(event.target.checked)} /><span>Fill</span></label>
        <SegmentedControl
          className="bitmap-editor-segmented bitmap-editor-primitive-operation"
          classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
          fullWidth
          aria-label="Fill operation"
          value={bitmapEditorPrimitiveFillOperation}
          data={(["copy", "and", "xor", "none"] as const).map((operation) => ({ value: operation, label: bitmapEditorOperationLabel(operation) }))}
          onChange={(value) => setBitmapEditorPrimitiveFillOperation(value as Exclude<BitmapEditorOperation, "or">)}
          disabled={!bitmapEditorPrimitiveFillEnabled}
        />
        <SegmentedControl
          className="bitmap-editor-segmented bitmap-editor-primitive-pattern-source"
          classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
          fullWidth
          aria-label="Fill pattern source"
          value={bitmapEditorPrimitiveFillPattern}
          data={[{ value: "solid", label: "Solid" }, { value: "empty", label: "Empty" }, { value: "stipple", label: "Stipple" }, { value: "custom", label: "Custom" }]}
          onChange={(value) => setBitmapEditorPrimitiveFillPattern(value as "solid" | "empty" | "stipple" | "custom")}
          disabled={!bitmapEditorPrimitiveFillEnabled}
        />
        {bitmapEditorPrimitiveFillPattern === "stipple" ? <BitmapEditorStipplePicker choices={stippleOptions} selectedId={bitmapEditorStipplePattern} density={bitmapEditorStippleDensity} onSelect={setBitmapEditorStipplePattern} onDensityChange={setBitmapEditorStippleDensity} disabled={!bitmapEditorPrimitiveFillEnabled} /> : bitmapEditorPrimitiveFillPattern === "custom" ? <div className="bitmap-editor-primitive-custom-pattern">
          <button className={`secondary compact${bitmapEditorPrimitivePatternPickerActive ? " active" : ""}`} type="button" disabled={!bitmapEditorPrimitiveFillEnabled} aria-pressed={bitmapEditorPrimitivePatternPickerActive} onClick={() => setBitmapEditorPrimitivePatternPickerActive((active) => !active)}>{bitmapEditorPrimitiveCustomPattern === null ? "Pick 8×8" : "Repick 8×8"}</button>
          <span role="status">{bitmapEditorPrimitivePatternPickerActive ? "Click a result area to sample" : bitmapEditorPrimitiveCustomPattern === null ? "No custom pattern" : "Pattern ready"}</span>
        </div> : null}
        <div className="bitmap-editor-primitive-color-sample" role="group" aria-label="Current INK and PAPER sample">
          <span className="bitmap-editor-primitive-color-sample-label">INK</span>
          <span className="bitmap-editor-primitive-color-chip" title="Current INK" style={{ backgroundColor: primitiveSampleInkColor }} />
          <div className="bitmap-editor-primitive-pattern-sample" role="img" aria-label="Sampled 8 by 8 pattern shown with current INK and PAPER colors">
            {Array.from({ length: 64 }, (_, index) => {
              const bit = bitmapEditorPrimitiveCustomPattern?.[index] ?? 0;
              return <span key={index} style={{ backgroundColor: bit === 1 ? primitiveSampleInkColor : primitiveSamplePaperColor }} />;
            })}
          </div>
          <span className="bitmap-editor-primitive-color-sample-label">PAPER</span>
          <span className="bitmap-editor-primitive-color-chip" title="Current PAPER" style={{ backgroundColor: primitiveSamplePaperColor }} />
        </div>
        <p className="bitmap-editor-primitive-help">Click to place points; arrows move the cursor and Enter confirms. Double-click ends connected lines; Escape cancels the preview.</p>
      </div>
      </div>
      <div className="bitmap-editor-picked-cell-preview" data-editor-group="draw" data-picked={bitmapEditorPickedCell !== null ? "true" : "false"} aria-live="polite" aria-label="Picked attribute cell preview">
        <span className="bitmap-editor-picked-cell-title">Picked cell</span>
        <span className="bitmap-editor-picked-cell-status">Color {bitmapEditorInkColor === null && bitmapEditorPaperColor === null && bitmapEditorBrightPolicy === null && bitmapEditorFlashPolicy === null ? "transparent" : "selected"} · Pattern {bitmapEditorPickedCell === null ? bitmapEditorPatternPickerActive ? "waiting" : "none" : "ready"}</span>
        <div className={`bitmap-editor-picked-cell-color-preview${bitmapEditorPickedCell === null ? " empty" : ""}`} style={{ backgroundColor: pickedPreviewPaper?.[pickedPreviewBright ? "bright" : "normal"] }}>
          <div className="bitmap-editor-picked-cell-grid" style={{ gridTemplateColumns: "repeat(8, 1fr)", gridTemplateRows: `repeat(${pickedPreviewHeight}, 1fr)`, aspectRatio: `8 / ${pickedPreviewHeight}` }} role="img" aria-label={bitmapEditorPickedCell === null ? `Empty cell preview, 8 by ${pickedPreviewHeight}` : `Picked cell ${bitmapEditorPickedCell.cellX}, ${bitmapEditorPickedCell.cellY}`}>
            {Array.from({ length: pickedPreviewHeight * 8 }, (_, index) => {
              const x = index % 8;
              const y = Math.floor(index / 8);
              const on = ((pickedPreviewRows[y] ?? 0) & (0x80 >> x)) !== 0;
              return <span className="bitmap-editor-picked-cell-pixel" key={index} style={{ backgroundColor: on ? pickedPreviewBright ? pickedPreviewInk?.bright : pickedPreviewInk?.normal : pickedPreviewBright ? pickedPreviewPaper?.bright : pickedPreviewPaper?.normal }} />;
            })}
          </div>
        </div>
        {bitmapEditorTarget === "result" && displayedResult !== null &&
          (displayedResult.platformId === "zx-spectrum" || bitmapEditorRegionSelection !== null) ? <div className="bitmap-editor-picked-cell-manipulation" aria-label="Picked cell and selection controls">
          <SegmentedControl
            className="bitmap-editor-command-segments bitmap-editor-picked-cell-actions"
            classNames={BITMAP_EDITOR_SEGMENTED_CLASSES}
            fullWidth
            aria-label="Move, invert, or reset picked tile"
            value=""
            data={([
              ...(["left", "right", "up", "down"] as const).map((direction) => ({
                value: direction,
                label: <Tooltip label={`Move picked cell ${direction}`} position="top" withArrow openDelay={350}><span aria-label={`Move picked cell ${direction}`}>{direction === "left" ? "←" : direction === "right" ? "→" : direction === "up" ? "↑" : "↓"}</span></Tooltip>,
                disabled: bitmapEditorRegionSelection === null && bitmapEditorPickedCell === null,
              })),
              ...(displayedResult.platformId === "zx-spectrum" ? [
                { value: "invert", label: <Tooltip label="Invert picked tile" position="top" withArrow openDelay={350}><span aria-label="Invert picked tile">INV</span></Tooltip>, disabled: bitmapEditorPickedCell === null },
                { value: "reset", label: <Tooltip label="Reset picked tile" position="top" withArrow openDelay={350}><span aria-label="Reset picked tile">RST</span></Tooltip>, disabled: bitmapEditorPickedCell === null },
              ] : []),
            ] as const)}
            onChange={(action) => {
              if (action === "invert" || action === "reset") {
                setBitmapEditorPickedCell((cell) => cell === null ? null : transformZxAttributeCell(cell, action));
                return;
              }
              if (action !== "left" && action !== "right" && action !== "up" && action !== "down") return;
              if (bitmapEditorRegionSelection !== null) shiftBitmapEditorSelection(action);
              else setBitmapEditorPickedCell((cell) => cell === null ? null : transformZxAttributeCell(cell, action));
            }}
          />
        </div> : null}
        {bitmapEditorPickedCell === null ? <span className="bitmap-editor-picked-cell-empty">Empty · 8×{pickedPreviewHeight} · select a result cell with Pattern picker</span> : <span className="bitmap-editor-picked-cell-meta">{bitmapEditorPickedCell.cellX},{bitmapEditorPickedCell.cellY} · 8×{bitmapEditorPickedCell.attributeHeight} · INK {bitmapEditorPickedCell.attribute & 7} / PAPER {(bitmapEditorPickedCell.attribute >> 3) & 7} · BRIGHT {(bitmapEditorPickedCell.attribute & 0x40) !== 0 ? "on" : "off"} · FLASH {(bitmapEditorPickedCell.attribute & 0x80) !== 0 ? "on" : "off"} · 0x{bitmapEditorPickedCell.attribute.toString(16).padStart(2, "0")}</span>}
      </div>
      {displayedResult?.platformId === "zx-spectrum" &&
        displayedResult.modeId === "zx48-mixed-256x192" &&
        workspaceMode === "palette" && flashPreviewAvailable ? (
          <div className="bitmap-editor-flash-merged-preview" data-editor-group="display">
            <span>Mixed result · shared phase</span>
            <canvas ref={bitmapEditorMergedFlashCanvasRef} aria-label="ZX mixed result FLASH phase preview" />
          </div>
        ) : null}
      </div>
    </div>;
    return <>
      {side === bitmapEditorActiveSide && bitmapEditorToolsHost !== null
        ? createPortal(bitmapEditorActions, bitmapEditorToolsHost, "bitmap-editor-actions")
        : null}
      <div className="bitmap-editor-pane-layout">
      <div className={`preview-frame preview-viewport zx-preview bitmap-editor-full-viewport ${draggingSide === side ? "dragging" : ""}`} ref={side === "source" ? sourceViewportRef : resultViewportRef} onScroll={(event) => handlePreviewScroll(side, event)} onPointerDown={(event) => beginPreviewDrag(side, event)} onPointerMove={movePreviewDrag} onPointerUp={endPreviewDrag} onPointerCancel={endPreviewDrag} onWheel={(event) => handlePreviewWheel(side, event)} onFocusCapture={() => markPanSource(side)}>
        {!compatible ? <p className="preview-placeholder">Run a bitmap conversion to edit its result.</p> : <div className="bitmap-editor-full-layout">
          <div className={["preview-stage", "bitmap-editor-full-canvas", sideZoom === "fit" ? "fit-stage" : "", effectiveGridMode === "pixel" ? "show-pixel-grid" : "", effectiveGridMode === "cell" ? "show-attribute-grid" : ""].filter(Boolean).join(" ")} style={{
            width: (side === "source" ? sourceFitStageSize : resultFitStageSize)?.width !== undefined
              ? String((side === "source" ? sourceFitStageSize : resultFitStageSize)?.width) + "px"
              : (side === "source" ? sourceZoom : resultZoom) === "fit" ? undefined : String(width * Number(side === "source" ? sourceZoom : resultZoom)) + "px",
            height: (side === "source" ? sourceFitStageSize : resultFitStageSize)?.height !== undefined
              ? String((side === "source" ? sourceFitStageSize : resultFitStageSize)?.height) + "px"
              : undefined,
            aspectRatio: String(width) + " / " + String(height),
          }}>
            <canvas ref={canvasRefForSide} aria-label="Full bitmap editor" tabIndex={0} />
            <svg className="pixel-grid-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true"><path d={gridPathForDimensions(width, height, 1, 1)} vectorEffect="non-scaling-stroke" /></svg>
            {attributeWidth !== null && attributeHeight !== null ? <svg className="attribute-grid-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true"><path d={gridPathForDimensions(width, height, attributeWidth, attributeHeight)} vectorEffect="non-scaling-stroke" /></svg> : null}
            {bitmapEditorToolMode === "primitives" ? <svg className="bitmap-editor-primitive-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <pattern id={primitiveStrokePatternId} width={primitiveStrokePatternWidth} height={primitiveStrokePatternHeight} patternUnits="userSpaceOnUse">
                  {bitmapEditorOperation === "none"
                    ? <rect width={primitiveStrokePatternWidth} height={primitiveStrokePatternHeight} fill="#bd8cff" />
                    : bitmapEditorPrimitiveStrokePattern === "empty"
                      ? <rect width={primitiveStrokePatternWidth} height={primitiveStrokePatternHeight} fill={bitmapEditorOperation === "copy" ? "#ff7188" : "#72839a"} />
                    : <>
                      {bitmapEditorOperation === "copy" ? <rect width={primitiveStrokePatternWidth} height={primitiveStrokePatternHeight} fill="#ff7188" /> : null}
                      {bitmapEditorPrimitiveStrokePattern === "solid"
                        ? <rect width="1" height="1" fill="#ffd166" />
                        : bitmapEditorPrimitiveStrokePattern === "custom"
                          ? bitmapEditorPrimitiveCustomPattern === null ? null : Array.from(bitmapEditorPrimitiveCustomPattern, (on, index) => on === 1 ? <rect key={index} x={index % 8} y={Math.floor(index / 8)} width="1" height="1" fill="#ffd166" /> : null)
                          : primitiveStrokeMatrix === null
                            ? <rect width="1" height="1" fill="#ffd166" />
                            : Array.from({ length: primitiveStrokeMatrix.width * primitiveStrokeMatrix.height }, (_, index) => {
                              const x = index % primitiveStrokeMatrix.width;
                              const y = Math.floor(index / primitiveStrokeMatrix.width);
                              return bitmapPrimitiveStippleOn(x, y, primitiveStrokeMatrix, bitmapEditorStippleDensity)
                                ? <rect key={index} x={x} y={y} width="1" height="1" fill="#ffd166" />
                                : null;
                            })}
                    </>}
                </pattern>
                <pattern id={primitiveFillPatternId} width={bitmapEditorPrimitiveFillPattern === "custom" ? 8 : primitiveFillMatrix?.width ?? 1} height={bitmapEditorPrimitiveFillPattern === "custom" ? 8 : primitiveFillMatrix?.height ?? 1} patternUnits="userSpaceOnUse">
                  {bitmapEditorPrimitiveFillOperation === "none"
                    ? <rect width={bitmapEditorPrimitiveFillPattern === "custom" ? 8 : primitiveFillMatrix?.width ?? 1} height={bitmapEditorPrimitiveFillPattern === "custom" ? 8 : primitiveFillMatrix?.height ?? 1} fill="#bd8cff" />
                    : bitmapEditorPrimitiveFillPattern === "empty"
                      ? <rect width="1" height="1" fill={bitmapEditorPrimitiveFillOperation === "copy" ? "#ff7188" : "#72839a"} />
                    : <>
                      {bitmapEditorPrimitiveFillOperation === "copy" ? <rect width={bitmapEditorPrimitiveFillPattern === "custom" ? 8 : primitiveFillMatrix?.width ?? 1} height={bitmapEditorPrimitiveFillPattern === "custom" ? 8 : primitiveFillMatrix?.height ?? 1} fill="#ff7188" /> : null}
                      {bitmapEditorPrimitiveFillPattern === "custom"
                        ? bitmapEditorPrimitiveCustomPattern === null ? null : Array.from(bitmapEditorPrimitiveCustomPattern, (on, index) => on === 1 ? <rect key={index} x={index % 8} y={Math.floor(index / 8)} width="1" height="1" fill="#70b8ff" /> : null)
                        : primitiveFillMatrix === null
                          ? <rect width="1" height="1" fill="#70b8ff" />
                          : Array.from({ length: primitiveFillMatrix.width * primitiveFillMatrix.height }, (_, index) => {
                        const x = index % primitiveFillMatrix.width;
                        const y = Math.floor(index / primitiveFillMatrix.width);
                        return bitmapPrimitiveStippleOn(x, y, primitiveFillMatrix, bitmapEditorStippleDensity)
                          ? <rect key={index} x={x} y={y} width="1" height="1" fill="#70b8ff" />
                          : null;
                          })}
                    </>}
                </pattern>
              </defs>
              {primitivePreviewRaster !== null && bitmapEditorPrimitiveFillEnabled ? <path
                d={bitmapPrimitivePointsPath(primitivePreviewRaster.fill)}
                fill={`url(#${primitiveFillPatternId})`}
                fillOpacity="0.72"
              /> : null}
              {primitivePreviewStroke.length > 0 ? <path d={bitmapPrimitivePointsPath(primitivePreviewStroke)} fill={`url(#${primitiveStrokePatternId})`} fillOpacity="0.9" /> : null}
              {bitmapEditorPrimitiveCursor !== null ? <rect className="bitmap-editor-primitive-cursor" x={bitmapEditorPrimitiveCursor.x + 0.1} y={bitmapEditorPrimitiveCursor.y + 0.1} width="0.8" height="0.8" /> : null}
            </svg> : null}
            {(bitmapEditorSelectionDraft ?? bitmapEditorRegionSelection) !== null ? <svg className="bitmap-editor-selection-overlay" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true"><path d={bitmapSelectionOutlinePath((bitmapEditorSelectionDraft ?? bitmapEditorRegionSelection)!)} />{bitmapEditorSelectionResizeHandles(bitmapEditorSelectionDraft ?? bitmapEditorRegionSelection!).map((handle, index) => <rect className="bitmap-editor-selection-handle" key={index} {...handle} />)}</svg> : null}
            <div className={`bitmap-editor-interaction-layer${bitmapEditorToolMode === "selection" ? " selection-mode" : ""}${bitmapEditorToolMode === "selection" && bitmapEditorSelectionTool !== "none" ? " selecting" : ""}${bitmapEditorPasteMode !== null ? " pasting" : ""}${bitmapEditorRegionSelection !== null ? " has-selection" : ""}`} role="grid" tabIndex={0} aria-label={`Bitmap editor ${width} by ${height} pixels`} onContextMenu={(event) => event.preventDefault()} onDoubleClick={clearBitmapEditorSelectionOnDoubleClick} onKeyDown={handleFullBitmapCanvasKeyDown} onPointerDown={(event) => beginFullBitmapPointer(side, event)} onPointerMove={moveFullBitmapPointer} onPointerUp={endFullBitmapPointer} onPointerCancel={endFullBitmapPointer} />
          </div>
        </div>}
      </div>
      </div>
    </>;
  };
  const bitmapEditorPreview = bitmapEditorCell === null
    ? <p>Point at a converted cell first, then open the Unified editor.</p>
    : <>
        <p><strong>Cell {bitmapEditorSelection?.cellX ?? 0}, {bitmapEditorSelection?.cellY ?? 0}</strong> · Attribute 0x{bitmapEditorCell.attribute.toString(16).padStart(2, "0")}</p>
        <div className="bitmap-editor-layout">
          <div className="tile-editor-grid tile-editor-grid-main bitmap-editor-grid" role="grid" tabIndex={0} aria-label="Selected cell bitmap, 8 by 8 pixels" onKeyDown={handleBitmapEditorKey} onPointerDown={beginBitmapEditorPaint} onPointerMove={moveBitmapEditorPaint} onPointerUp={endBitmapEditorPaint} onPointerCancel={endBitmapEditorPaint}>
            {Array.from({ length: 64 }, (_, pixelIndex) => {
              const x = pixelIndex % 8;
              const y = Math.floor(pixelIndex / 8);
              const on = ((bitmapEditorCell.rows[y] ?? 0) & (0x80 >> x)) !== 0;
              const bright = (bitmapEditorCell.attribute & 0x40) !== 0;
              const ink = zxPaletteOptions[bitmapEditorCell.attribute & 7];
              const paper = zxPaletteOptions[(bitmapEditorCell.attribute >> 3) & 7];
              return <span className={`tile-editor-pixel${on ? " on" : ""}`} key={pixelIndex} role="gridcell" aria-label={`${x}, ${y}${on ? ": on" : ": off"}`} style={bitmapEditorUseColors ? { backgroundColor: on ? bright ? ink?.bright : ink?.normal : bright ? paper?.bright : paper?.normal } : undefined} />;
            })}
          </div>
          <div className="bitmap-editor-side">
            <div className="bitmap-editor-attributes">
              <label className="check-control"><input type="checkbox" checked={bitmapEditorUseColors} onChange={(event) => setBitmapEditorUseColors(event.target.checked)} /><span>Use INK/PAPER colors</span></label>
              <div className="bitmap-editor-color-group" role="group" aria-label="INK color">
                <span>INK</span>
                <div className="palette-options">
                  {zxPaletteOptions.map((color) => {
                    const selected = (bitmapEditorCell.attribute & 7) === color.code;
                    return <button className={`palette-option${selected ? " selected" : ""}`} type="button" key={color.code} aria-label={`Set INK to ${color.name}`} aria-pressed={selected} title={color.name} onClick={() => setBitmapEditorAttribute(7, color.code)}><span className="palette-swatch" style={{ background: (bitmapEditorCell.attribute & 0x40) !== 0 ? color.bright : color.normal }} aria-hidden="true" /></button>;
                  })}
                </div>
              </div>
              <div className="bitmap-editor-color-group" role="group" aria-label="PAPER color">
                <span>PAPER</span>
                <div className="palette-options">
                  {zxPaletteOptions.map((color) => {
                    const selected = ((bitmapEditorCell.attribute >> 3) & 7) === color.code;
                    return <button className={`palette-option${selected ? " selected" : ""}`} type="button" key={color.code} aria-label={`Set PAPER to ${color.name}`} aria-pressed={selected} title={color.name} onClick={() => setBitmapEditorAttribute(0x38, color.code << 3)}><span className="palette-swatch" style={{ background: (bitmapEditorCell.attribute & 0x40) !== 0 ? color.bright : color.normal }} aria-hidden="true" /></button>;
                  })}
                </div>
              </div>
              <label className="check-control"><input type="checkbox" checked={(bitmapEditorCell.attribute & 0x40) !== 0} onChange={(event) => setBitmapEditorAttribute(0x40, event.target.checked ? 0x40 : 0)} /><span>BRIGHT</span></label>
            </div>
            <div className="bitmap-editor-actions">
          <button className="secondary compact" type="button" onClick={() => applyBitmapEditorOperation({ kind: "invert" })}>Invert</button>
          <button className="secondary compact" type="button" onClick={invertBitmapEditorAttributes}>Invert attributes</button>
          <button className="secondary compact" type="button" onClick={() => applyBitmapEditorOperation({ kind: "shift", dx: -1, dy: 0 })}>←</button>
          <button className="secondary compact" type="button" onClick={() => applyBitmapEditorOperation({ kind: "shift", dx: 1, dy: 0 })}>→</button>
          <button className="secondary compact" type="button" onClick={() => applyBitmapEditorOperation({ kind: "shift", dx: 0, dy: -1 })}>↑</button>
          <button className="secondary compact" type="button" onClick={() => applyBitmapEditorOperation({ kind: "shift", dx: 0, dy: 1 })}>↓</button>
          <button className="secondary compact" type="button" onClick={undoBitmapEditor} disabled={bitmapEditorUndo.length === 0}>Undo</button>
          <button className="secondary compact" type="button" onClick={redoBitmapEditor} disabled={bitmapEditorRedo.length === 0}>Redo</button>
          <button className="secondary compact" type="button" onClick={revertBitmapEditorChanges} disabled={bitmapEditorOriginalResult === null}>Revert applied</button>
            </div>
          </div>
        </div>
      </>;
  const unifiedEditorPreview = workspaceMode === "palette"
    ? bitmapEditorPreview
    : charsetState.kind !== "ready"
      ? <p>Run Tilemap High to open the unified editor.</p>
    : (() => {
        const result = charsetState.result;
        const selectedCellIndex = tilemapEditorCell;
        const selectedAssignment = selectedCellIndex === null ? null : result.assignments[selectedCellIndex] ?? null;
        const mapCellAttribute = selectedCellIndex === null ? 0 : result.attributes[selectedCellIndex] ?? 0;
        const selectedAttribute = unifiedTileEditorContext === "stamp" ? tileStampDraft.attribute : mapCellAttribute;
        const selectedTransform = unifiedTileEditorContext === "stamp"
          ? tileStampDraft.transform
          : selectedAssignment?.transform ?? 0;
        const selectedInverted = unifiedTileEditorContext === "stamp"
          ? tileStampDraft.inverted
          : selectedAssignment?.inverted ?? false;
        const selectedTransformToggles = tileTransformToggleState(selectedTransform);
        const selectedTransformToggleActive = (toggle: TileTransformToggle) =>
          toggle === "rotate-ccw"
            ? selectedTransformToggles["mirror-x"] && selectedTransformToggles["rotate-cw"]
            : selectedTransformToggles[toggle];
        const previewAssignment = unifiedTileEditorContext === "stamp"
          ? tileStampDraft.characterIndex === null
            ? null
            : {
                characterIndex: tileStampDraft.characterIndex,
                transform: tileStampDraft.transform,
                inverted: tileStampDraft.inverted,
              }
          : selectedAssignment;
        const selectedTilePreview = previewAssignment === null
          ? new Uint8Array(8)
          : transformTile(result.charset.subarray(previewAssignment.characterIndex * 8, previewAssignment.characterIndex * 8 + 8), previewAssignment.transform);
        if (previewAssignment?.inverted) {
          for (let row = 0; row < selectedTilePreview.length; row += 1) selectedTilePreview[row] = (selectedTilePreview[row] ?? 0) ^ 0xff;
        }
        const selectedBright = (selectedAttribute & 0x40) !== 0;
        const selectedFlash = (selectedAttribute & 0x80) !== 0;
        const selectedInk = ZX_BASE_COLORS[selectedAttribute & 7];
        const selectedPaper = ZX_BASE_COLORS[(selectedAttribute >> 3) & 7];
        const invertSelectedFlash = selectedFlash && (
          bitmapEditorFlashPreviewMode === "inverted" ||
          (bitmapEditorFlashPreviewMode === "animate" && bitmapEditorFlashPreviewPhase)
        );
        const selectedPreviewInk = invertSelectedFlash ? selectedPaper : selectedInk;
        const selectedPreviewPaper = invertSelectedFlash ? selectedInk : selectedPaper;
        const selectedCellX = selectedCellIndex === null ? null : selectedCellIndex % 32;
        const selectedCellY = selectedCellIndex === null ? null : Math.floor(selectedCellIndex / 32);
        const hasSelectedMapCell = selectedCellIndex !== null && selectedAssignment !== null;
        const canEditSelectedCell = unifiedTileEditorContext === "stamp" || hasSelectedMapCell;
        return <div className="unified-editor" tabIndex={-1} onKeyDown={handleUnifiedEditorKey}>
          <div className="unified-editor-toolbar">
            <button className="secondary compact" type="button" onClick={undoTileEditor} disabled={tileEditorUndo.length === 0}>Undo</button>
            <button className="secondary compact" type="button" onClick={redoTileEditor} disabled={tileEditorRedo.length === 0}>Redo</button>
            <button className="secondary compact" type="button" onClick={revertSelectedTile} disabled={tileEditorOriginals[tileEditorSelected] === null}>Revert</button>
            <div className="unified-editor-context-tabs unified-segmented" role="tablist" aria-label="Tilemap editor context">
              <button className={`secondary compact${unifiedTileEditorContext === "map-cell" ? " active" : ""}`} id="tilemap-context-map-cell" type="button" role="tab" aria-selected={unifiedTileEditorContext === "map-cell"} aria-controls="tilemap-editor-panel" onClick={() => switchUnifiedTileEditorContext("map-cell")}>Map Cell</button>
              <button className={`secondary compact${unifiedTileEditorContext === "stamp" ? " active" : ""}`} id="tilemap-context-stamp" type="button" role="tab" aria-selected={unifiedTileEditorContext === "stamp"} aria-controls="tilemap-editor-panel" onClick={() => switchUnifiedTileEditorContext("stamp")}>Tile Stamp</button>
            </div>
          </div>
          <div className="unified-tile-layout">
            <section className="unified-tile-column" aria-label="Base tile editor">
              <div className="unified-tile-heading">
                <p><strong>Base tile {tileEditorSelected}</strong> · {tileUsage.find((item) => item.characterIndex === tileEditorSelected)?.count ?? 0} map cells use it</p>
              </div>
              <div className="unified-tile-bitmap" role="grid" aria-label={`Base tile ${tileEditorSelected} bitmap`} onPointerDown={beginTileEditorPaint} onPointerMove={moveTileEditorPaint} onPointerUp={endTileEditorPaint} onPointerCancel={endTileEditorPaint}>{Array.from({ length: 64 }, (_, pixelIndex) => { const x = pixelIndex % 8; const y = Math.floor(pixelIndex / 8); const row = result.charset[tileEditorSelected * 8 + y] ?? 0; const on = (row & (0x80 >> x)) !== 0; return <span className={`tile-editor-pixel${on ? " on" : ""}`} key={pixelIndex} role="gridcell" aria-label={`${x}, ${y}${on ? ": on" : ": off"}`} />; })}</div>
              <div className="unified-tile-navigation unified-segmented" role="group" aria-label="Base tile navigation"><button className="secondary compact" type="button" onClick={() => moveEditorTile(-1)} disabled={tileEditorSelected === 0} aria-label="Previous tile">◀ Previous</button><button className="secondary compact" type="button" onClick={() => moveEditorTile(1)} disabled={tileEditorSelected >= result.characterCount - 1} aria-label="Next tile">Next ▶</button></div>
              <div className="unified-base-tile-actions" aria-label="Base tile operations">
                <div className="tile-editor-toolbar unified-segmented" role="group" aria-label="Rotate or shift base tile"><button className="secondary compact" type="button" onClick={() => applyEditorOperation({ kind: "rotate-left" })} aria-label="Rotate base tile left">◀</button><button className="secondary compact" type="button" onClick={() => applyEditorOperation({ kind: "rotate-right" })} aria-label="Rotate base tile right">▶</button><button className="secondary compact" type="button" onClick={() => applyEditorOperation({ kind: "rotate-up" })} aria-label="Rotate base tile up">▲</button><button className="secondary compact" type="button" onClick={() => applyEditorOperation({ kind: "rotate-down" })} aria-label="Rotate base tile down">▼</button></div>
                <div className="unified-base-edit-actions unified-segmented" role="group" aria-label="Clear or invert base tile"><button className="secondary compact" type="button" onClick={() => applyEditorOperation({ kind: "clear" })}>Clear</button><button className="secondary compact" type="button" onClick={() => applyEditorOperation({ kind: "invert" })}>Invert</button></div>
              </div>
            </section>
            <section id="tilemap-editor-panel" className="unified-tile-column unified-cell-column" role="tabpanel" aria-labelledby={unifiedTileEditorContext === "stamp" ? "tilemap-context-stamp" : "tilemap-context-map-cell"} aria-label={unifiedTileEditorContext === "stamp" ? "Tile stamp preparation" : "Selected map cell preview and attributes"}>
              <div className="unified-tile-heading">
                <p><strong>{unifiedTileEditorContext === "stamp"
                  ? tileStampDraft.characterIndex === null ? "Tile stamp · no tile loaded" : `Tile stamp · Base tile ${tileStampDraft.characterIndex}`
                  : hasSelectedMapCell ? `Map cell ${selectedCellX},${selectedCellY}` : "No map cell selected"}</strong>{unifiedTileEditorContext === "stamp"
                    ? tileStampDraft.characterIndex === null ? " · Choose TILE to load a tile" : " · settings are independent of map cells"
                    : hasSelectedMapCell ? ` · Tile ${selectedAssignment.characterIndex}` : " · Select a cell in the tilemap preview"}</p>
              </div>
              <div className="unified-rendered-tile" role="img" aria-label={unifiedTileEditorContext === "stamp"
                ? tileStampDraft.characterIndex === null ? "Empty tile stamp preview" : `Tile stamp preview of base tile ${tileStampDraft.characterIndex}, ${tileTransformLabel(selectedTransform)}, INK ${selectedAttribute & 7}, PAPER ${(selectedAttribute >> 3) & 7}`
                : hasSelectedMapCell ? `Rendered tile at map cell ${selectedCellX},${selectedCellY}, ${tileTransformLabel(selectedTransform)}, INK ${selectedAttribute & 7}, PAPER ${(selectedAttribute >> 3) & 7}` : "No selected tilemap cell"}>
                {Array.from({ length: 64 }, (_, pixelIndex) => {
                  const x = pixelIndex % 8;
                  const y = Math.floor(pixelIndex / 8);
                  const on = ((selectedTilePreview[y] ?? 0) & (0x80 >> x)) !== 0;
                  const color = on ? selectedPreviewInk : selectedPreviewPaper;
                  return <span key={pixelIndex} style={{ backgroundColor: color === undefined ? "#000" : color[selectedBright ? "bright" : "normal"] }} />;
                })}
              </div>
              <div className="unified-transform-controls unified-segmented" role="group" aria-label={unifiedTileEditorContext === "stamp" ? "Prepared tile transformation" : "Selected cell transformation"}>
                {([
                  ["mirror-x", "Mirror X"],
                  ["mirror-y", "Mirror Y"],
                  ["rotate-cw", "R90 CW"],
                  ["rotate-ccw", "R90 CCW"],
                ] as const).map(([toggle, label]) => <button className={`secondary compact${selectedTransformToggleActive(toggle) ? " active" : ""}`} key={toggle} type="button" disabled={!canEditSelectedCell || !result.transformations} aria-pressed={selectedTransformToggleActive(toggle)} title={result.transformations ? `${label} ${unifiedTileEditorContext === "stamp" ? "prepared tile" : "selected map cell"}` : "Enable transformations in tilemap settings to edit transforms"} onClick={() => toggleSelectedTilemapTransform(toggle)}>{label}</button>)}
                <button className="secondary compact" type="button" disabled={!canEditSelectedCell || !result.transformations || (unifiedTileEditorContext === "stamp" ? selectedTransform === 0 && !selectedInverted : selectedTransform === 0)} title={`Reset ${unifiedTileEditorContext === "stamp" ? "prepared tile" : "selected cell"} transform`} onClick={resetTilemapEditorTransform}>Reset</button>
              </div>
              <p className="unified-transform-readout">{tileTransformLabel(selectedTransform)}{selectedInverted ? " · Inverted" : ""}{selectedFlash ? " · FLASH" : ""}</p>
                <div className="unified-cell-colors" aria-label={unifiedTileEditorContext === "stamp" ? "Prepared tile color attributes" : "Selected cell color attributes"}>
                <div className="unified-color-row"><button className="unified-color-swap-label" type="button" disabled={!canEditSelectedCell} title="Swap INK and PAPER colors" aria-label="Swap INK and PAPER colors (INK label)" onClick={swapSelectedTilemapInkPaper}>INK</button><div className="unified-color-swatches">{zxPaletteOptions.map((color) => <button className={`bitmap-editor-attribute-color${(selectedAttribute & 7) === color.code ? " selected" : ""}`} key={`ink-${color.code}`} type="button" disabled={!canEditSelectedCell} aria-label={`Set ${unifiedTileEditorContext === "stamp" ? "prepared tile" : "selected cell"} INK to ${color.name}`} aria-pressed={(selectedAttribute & 7) === color.code} title={`INK ${color.name}`} onClick={() => updateSelectedTilemapAttribute((attribute) => (attribute & ~7) | color.code)}><span style={{ background: selectedBright ? color.bright : color.normal }} /></button>)}</div></div>
                <div className="unified-color-row"><button className="unified-color-swap-label" type="button" disabled={!canEditSelectedCell} title="Swap INK and PAPER colors" aria-label="Swap INK and PAPER colors (PAPER label)" onClick={swapSelectedTilemapInkPaper}>PAPER</button><div className="unified-color-swatches">{zxPaletteOptions.map((color) => <button className={`bitmap-editor-attribute-color${((selectedAttribute >> 3) & 7) === color.code ? " selected" : ""}`} key={`paper-${color.code}`} type="button" disabled={!canEditSelectedCell} aria-label={`Set ${unifiedTileEditorContext === "stamp" ? "prepared tile" : "selected cell"} PAPER to ${color.name}`} aria-pressed={((selectedAttribute >> 3) & 7) === color.code} title={`PAPER ${color.name}`} onClick={() => updateSelectedTilemapAttribute((attribute) => (attribute & ~0x38) | (color.code << 3))}><span style={{ background: selectedBright ? color.bright : color.normal }} /></button>)}</div></div>
                <div className="unified-attribute-flags" aria-label="Selected cell attributes and pickers">
                  <div className="unified-segmented unified-cell-flag-buttons" role="group" aria-label={unifiedTileEditorContext === "stamp" ? "Prepared tile color flags" : "Cell color flags"}>
                    <button className={`secondary compact unified-attribute-toggle${selectedBright ? " active" : ""}`} type="button" disabled={!canEditSelectedCell} aria-pressed={selectedBright} onClick={() => updateSelectedTilemapAttribute((attribute) => attribute ^ 0x40)}>BRIGHT</button>
                    <button className={`secondary compact unified-attribute-toggle${selectedFlash ? " active" : ""}`} type="button" disabled={!canEditSelectedCell} aria-pressed={selectedFlash} onClick={() => updateSelectedTilemapAttribute((attribute) => attribute ^ 0x80)}>FLASH</button>
                    <button className="secondary compact" type="button" disabled={!canEditSelectedCell} title={`Swap INK and PAPER for this ${unifiedTileEditorContext === "stamp" ? "prepared tile" : "map cell"}; BRIGHT and FLASH remain unchanged`} aria-label="Invert INK/PAPER by swapping them" onClick={() => updateSelectedTilemapAttribute((attribute) =>
                      swapTilemapInkPaper(attribute)
                    )}>INV</button>
                  </div>
                  <div className={`unified-segmented unified-cell-pickers${unifiedTileEditorContext === "map-cell" ? " map-cell-pickers" : ""}`} role="group" aria-label={unifiedTileEditorContext === "stamp" ? "Tile stamp pickers and placement" : "Map cell pickers"}>
                    <button className={`secondary compact${tileEditorColorPickerActive ? " active" : ""}`} type="button" disabled={!canEditSelectedCell} aria-pressed={tileEditorColorPickerActive} title={unifiedTileEditorContext === "stamp" ? "Pick INK, PAPER, BRIGHT, and FLASH from a result cell for the prepared tile" : "Pick INK, PAPER, BRIGHT, and FLASH from a map cell, then apply them to the selected cell"} onClick={() => {
                    tilemapPutPointerRef.current = null;
                    setTilemapPutActive(false);
                    setTileEditorTilePickerActive(false);
                    setTileEditorColorPickerActive((active) => !active);
                    }}>COL</button>
                    <button className={`secondary compact${tileEditorTilePickerActive ? " active" : ""}`} type="button" disabled={!canEditSelectedCell} aria-pressed={tileEditorTilePickerActive} title={unifiedTileEditorContext === "stamp" ? "Choose a base tile from the converted screen or Charset tiles for the prepared stamp" : "Choose a tile from the converted screen or Charset tiles; replace the tile index only at the selected map cell"} onClick={() => {
                    tilemapPutPointerRef.current = null;
                    setTilemapPutActive(false);
                    setTileEditorColorPickerActive(false);
                    setTileEditorTilePickerActive((active) => !active);
                    }}>TILE</button>
                    {unifiedTileEditorContext === "stamp" ? <button className={`secondary compact${tilemapPutActive ? " active" : ""}`} type="button" disabled={tileStampDraft.characterIndex === null || tileStampDraft.characterIndex < 0 || tileStampDraft.characterIndex >= result.characterCount} aria-pressed={tilemapPutActive} title="Draw with the prepared tile, transform, polarity, and color settings on the converted result" onClick={() => {
                    tilemapPutPointerRef.current = null;
                    setTileEditorColorPickerActive(false);
                    setTileEditorTilePickerActive(false);
                    setTilemapPutActive((active) => !active);
                    }}>PUT</button> : null}
                  </div>
                </div>
                {tileEditorColorPickerActive ? <span className="control-help" role="status">{unifiedTileEditorContext === "stamp" ? "Click a converted result cell to copy its attributes into the prepared tile." : "Click a map cell to copy its attributes to the selected cell."}</span> : null}
                {tileEditorTilePickerActive ? <span className="control-help" role="status">{unifiedTileEditorContext === "stamp" ? "Choose a base tile from the converted screen or Charset tiles. This prepares the stamp without changing the map." : <>Choose a source tile from the converted screen or Charset tiles. Only map cell {selectedCellX},{selectedCellY} will change; other uses are untouched.</>} Press Escape to cancel.</span> : null}
                {tilemapPutActive && unifiedTileEditorContext === "stamp" ? <span className="control-help" role="status">PUT active: draw on the converted result to place base tile {tileStampDraft.characterIndex}, using the prepared transform and color settings. Drag to place repeatedly; Escape to stop.</span> : null}
              </div>
            </section>
          </div>
        </div>;
      })();
  const inspectionCellHeight = workspaceMode === "tilemap" ? 8 : displayedAttributeHeight;
  const inspectionCellOverlay = inspection === null
    ? null
    : {
        x: inspection.cellX * 8,
        y: inspection.cellY * inspectionCellHeight,
        width: 8,
        height: inspectionCellHeight,
      };
  const bitmapEditorSelectionOverlay = bitmapEditorSelection === null
    ? null
    : {
        x: bitmapEditorSelection.cellX * 8,
        y: bitmapEditorSelection.cellY * inspectionCellHeight,
        width: 8,
      height: inspectionCellHeight,
    };
  const tilemapEditorSelectionOverlay = workspaceMode !== "tilemap" || tilemapEditorCell === null
    ? null
    : {
        x: (tilemapEditorCell % 32) * 8,
        y: Math.floor(tilemapEditorCell / 32) * 8,
        width: 8,
        height: 8,
      };
  const highlightedTileCells = workspaceMode === "tilemap" && highlightSelectedTileUses && charsetState.kind === "ready"
    ? charsetState.result.assignments.flatMap((assignment, cellIndex) =>
        assignment.characterIndex === tileEditorSelected && cellIndex !== tilemapEditorCell
          ? [{ x: (cellIndex % 32) * 8, y: Math.floor(cellIndex / 32) * 8, width: 8, height: 8 }]
          : [],
      )
    : [];
  const previewAspectRatio = `${previewAspect.width} / ${previewAspect.height}`;

  return {
    bitmapEditorSelectionOverlay,
    fullBitmapEditorPreview,
    glyphActiveCount,
    glyphActiveIndexSet,
    highlightedTileCells,
    inspectedTileAssignment,
    inspectedTileIndex,
    inspectionCellOverlay,
    maximumTileUsage,
    previewAspect,
    previewAspectRatio,
    resultFitStageSize,
    resultZoom,
    sourceFitStageSize,
    sourceShowsImage,
    sourceStageAspect,
    sourceZoom,
    tilemapEditorSelectionOverlay,
    unifiedEditorPreview,
    visibleTileUsage,
  };
}
