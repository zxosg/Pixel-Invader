import { useCallback, useEffect, useRef, useState } from "react";
import { ConversionWorkerClient, type WorkerConversionResult, type WorkerDecodedImage } from "../worker/client.js";
import { type WorkspaceConversionMode } from "../projects.js";
import { type ConversionSettings, DEFAULT_CONVERSION_SETTINGS } from "@retro-converter/conversion-core";
import { type BitmapEditorClipboard, type BitmapEditorResultHistoryEntry, type BitmapEditorSelectionPointer, type BitmapEditorTarget, type CharsetState, type ConversionState, type DraftState, type PreviewSide, type TileStampDraft, type UnifiedTileEditorContext } from "../app-types.js";
import { type CropResizeHandle, type PixelPoint } from "../crop.js";
import { type BitmapEditorBuffer } from "../full-bitmap-editor.js";
import { type TilemapEditorSnapshot, type TilemapStamp } from "../tilemap-editor.js";
import { type BitmapCell } from "../bitmap-editor.js";
import { type InspectedAttribute } from "../inspection.js";
import { type BitmapEditorBrushSize, type BitmapEditorCellMode, type BitmapEditorOperation, type BitmapEditorScope } from "../bitmap-editor-tools.js";
import { type BitmapRegionSelection, type BitmapSelectionKind, type BitmapSelectionResolution } from "../bitmap-editor-selection.js";
import { type ZxAttributeCellSnapshot } from "../bitmap-attribute-cell-editor.js";
import { type NativeResultBitmap } from "../result-bitmap-editor.js";

export function useRuntimeState() {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [invalidSliderIds, setInvalidSliderIds] =
    useState<ReadonlySet<string>>(() => new Set());
  const setSliderValidity = useCallback((id: string, valid: boolean) => {
    setInvalidSliderIds((current) => {
      const next = new Set(current);
      if (valid) next.delete(id);
      else next.add(id);
      if (next.size === current.size &&
          [...next].every((value) => current.has(value))) return current;
      return next;
    });
  }, []);
  const workerRef = useRef<ConversionWorkerClient | null>(null);
  const draftWorkerRef = useRef<ConversionWorkerClient | null>(null);
  const benchmarkWorkerRef = useRef<ConversionWorkerClient | null>(null);
  const charsetWorkerRef = useRef<ConversionWorkerClient | null>(null);
  const benchmarkRunRef = useRef(0);
  const benchmarkContextKeyRef = useRef("");
  const revisionRef = useRef(0);
  const finalJobRef = useRef(0);
  const finalRunningRef = useRef(false);
  const lastFinalRevisionRef = useRef(-1);
  const pendingOpenedFinalRef = useRef<{
    readonly result: WorkerConversionResult;
    readonly completedAtUtc: string;
  } | null>(null);
  const pendingOpenedResultEditedRef = useRef(false);
  const pendingOpenedResultQualityRef = useRef<"Draft" | "High">("High");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const convertedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceConvertedCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bitmapEditorSourceCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bitmapEditorResultCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const bitmapEditorMergedFlashCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pendingModeHighRef = useRef<WorkspaceConversionMode | null>(null);
  const workspaceModeRef = useRef<WorkspaceConversionMode>("palette");
  const lastZxSettingsRef = useRef<ConversionSettings>(
    DEFAULT_CONVERSION_SETTINGS,
  );
  const sourceViewportRef = useRef<HTMLDivElement | null>(null);
  const resultViewportRef = useRef<HTMLDivElement | null>(null);
  const activePanSideRef = useRef<PreviewSide | null>(null);
  const panDragRef = useRef<{
    readonly side: PreviewSide;
    readonly pointerId: number;
    readonly startX: number;
    readonly startY: number;
    readonly scrollLeft: number;
    readonly scrollTop: number;
  } | null>(null);
  const cropDragRef = useRef<{
    readonly pointerId: number;
    readonly start: PixelPoint;
    readonly mode: "create" | "move" | CropResizeHandle;
    readonly originalCrop: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
  } | null>(null);
  const charsetSelectionDragRef = useRef<{
    readonly pointerId: number;
    readonly selecting: boolean;
    readonly visited: Set<number>;
    readonly characterIndex: number;
  } | null>(null);
  const charsetSelectionClickRef = useRef<Map<number, number>>(new Map());
  const charsetGlyphRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tileEditorPointerRef = useRef<{ pointerId: number; visited: Set<string> } | null>(null);
  const bitmapEditorPointerRef = useRef<{ pointerId: number; visited: Set<string> } | null>(null);
  const bitmapEditorFullBufferRef = useRef<BitmapEditorBuffer | null>(null);
  const bitmapEditorEncodedRef = useRef<Uint8Array | null>(null);
  const skipNextDraftAfterBitmapEditRef = useRef(false);
  const bitmapEditorFullPointerRef = useRef<{
    readonly side: PreviewSide;
    readonly pointerId: number;
    readonly visited: Set<string>;
    readonly pan: boolean;
    readonly nativeCells: boolean;
    readonly button: number;
    lastPixel?: { readonly x: number; readonly y: number } | null;
    moved: boolean;
    historyCaptured: boolean;
    readonly startX: number;
    readonly startY: number;
    readonly scrollLeft: number;
    readonly scrollTop: number;
  } | null>(null);
  const bitmapEditorSelectionPointerRef = useRef<BitmapEditorSelectionPointer | null>(null);
  const existingCharsetSelectionRef =
    useRef<readonly number[] | null>(null);
  const [state, setState] = useState<ConversionState>({ kind: "idle" });
  const [draftState, setDraftState] = useState<DraftState>({ kind: "idle" });
  const [lastFinal, setLastFinal] = useState<WorkerConversionResult | null>(null);
  const [charsetState, setCharsetState] = useState<CharsetState>({ kind: "idle" });
  const [tileEditorSelected, setTileEditorSelected] = useState(0);
  const [tileEditorOriginals, setTileEditorOriginals] = useState<readonly (Uint8Array | null)[]>([]);
  const [tileEditorUsageSort, setTileEditorUsageSort] = useState(false);
  const [tileEditorUndo, setTileEditorUndo] = useState<readonly TilemapEditorSnapshot[]>([]);
  const [tileEditorRedo, setTileEditorRedo] = useState<readonly TilemapEditorSnapshot[]>([]);
  const [tileEditorEdited, setTileEditorEdited] = useState(false);
  const [tilemapEditorCell, setTilemapEditorCell] = useState<number | null>(null);
  const [unifiedTileEditorContext, setUnifiedTileEditorContext] = useState<UnifiedTileEditorContext>("map-cell");
  const [tileStampDraft, setTileStampDraft] = useState<TileStampDraft>({
    characterIndex: null,
    transform: 0,
    inverted: false,
    attribute: 0x38,
  });
  const [tileEditorColorPickerActive, setTileEditorColorPickerActive] = useState(false);
  const [tileEditorTilePickerActive, setTileEditorTilePickerActive] = useState(false);
  const [tilemapPutActive, setTilemapPutActive] = useState(false);
  const tilemapPutPointerRef = useRef<{
    readonly pointerId: number;
    readonly stamp: TilemapStamp;
    readonly visited: Set<number>;
    lastX: number;
    lastY: number;
    historyCaptured: boolean;
  } | null>(null);
  const tileEditorTilePickerClickGuardRef = useRef<{ readonly index: number; readonly until: number } | null>(null);
  const [highlightSelectedTileUses, setHighlightSelectedTileUses] = useState(false);
  useEffect(() => {
    if (!tileEditorColorPickerActive && !tileEditorTilePickerActive) return;
    const cancelPickersOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setTileEditorColorPickerActive(false);
      setTileEditorTilePickerActive(false);
      event.preventDefault();
    };
    window.addEventListener("keydown", cancelPickersOnEscape);
    return () => window.removeEventListener("keydown", cancelPickersOnEscape);
  }, [tileEditorColorPickerActive, tileEditorTilePickerActive]);
  useEffect(() => {
    if (!tilemapPutActive) return;
    const cancelPutOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      tilemapPutPointerRef.current = null;
      setTilemapPutActive(false);
      event.preventDefault();
    };
    window.addEventListener("keydown", cancelPutOnEscape);
    return () => window.removeEventListener("keydown", cancelPutOnEscape);
  }, [tilemapPutActive]);
  const [bitmapEditorCell, setBitmapEditorCell] = useState<BitmapCell | null>(null);
  const [bitmapEditorUndo, setBitmapEditorUndo] = useState<readonly BitmapCell[]>([]);
  const [bitmapEditorRedo, setBitmapEditorRedo] = useState<readonly BitmapCell[]>([]);
  const [bitmapEditorSelection, setBitmapEditorSelection] = useState<InspectedAttribute | null>(null);
  const [bitmapEditorOriginalResult, setBitmapEditorOriginalResult] = useState<WorkerConversionResult | null>(null);
  const [bitmapEditorUseColors, setBitmapEditorUseColors] = useState(false);
  const [bitmapEditorBuffer, setBitmapEditorBuffer] = useState<BitmapEditorBuffer | null>(null);
  const [bitmapEditorUndoFull, setBitmapEditorUndoFull] = useState<readonly BitmapEditorBuffer[]>([]);
  const [bitmapEditorRedoFull, setBitmapEditorRedoFull] = useState<readonly BitmapEditorBuffer[]>([]);
  const [bitmapEditorRevertSource, setBitmapEditorRevertSource] = useState<WorkerDecodedImage | null>(null);
  const [bitmapEditorScope, setBitmapEditorScope] = useState<BitmapEditorScope>("pixel");
  const [bitmapEditorFloodFillActive, setBitmapEditorFloodFillActive] = useState(false);
  const [bitmapEditorOperation, setBitmapEditorOperation] = useState<BitmapEditorOperation>("copy");
  const [bitmapEditorBrushSize, setBitmapEditorBrushSize] = useState<BitmapEditorBrushSize>("1x1");
  const [bitmapEditorSelectionTool, setBitmapEditorSelectionTool] = useState<"none" | BitmapSelectionKind>("rectangle");
  const [bitmapEditorSelectionResolution, setBitmapEditorSelectionResolution] = useState<BitmapSelectionResolution>("pixel");
  const [bitmapEditorColorOperation, setBitmapEditorColorOperation] = useState<"replace" | "increase" | "decrease">("replace");
  const [bitmapEditorColorFrom, setBitmapEditorColorFrom] = useState(0);
  const [bitmapEditorColorTo, setBitmapEditorColorTo] = useState(6);
  const [bitmapEditorColorChannel, setBitmapEditorColorChannel] = useState<"both" | "ink" | "paper">("both");
  const [bitmapEditorColorScope, setBitmapEditorColorScope] = useState<"selection" | "image">("selection");
  const [bitmapEditorGridMode, setBitmapEditorGridMode] = useState<"pixel" | "cell" | "off">("pixel");
  const [bitmapEditorShowPixels, setBitmapEditorShowPixels] = useState(true);
  const [bitmapEditorShowAttributes, setBitmapEditorShowAttributes] = useState(true);
  const [bitmapEditorPastePixels, setBitmapEditorPastePixels] = useState(true);
  const [bitmapEditorPasteAttributes, setBitmapEditorPasteAttributes] = useState(true);
  const [bitmapEditorRegionSelection, setBitmapEditorRegionSelection] = useState<BitmapRegionSelection | null>(null);
  const [bitmapEditorSelectionDraft, setBitmapEditorSelectionDraft] = useState<BitmapRegionSelection | null>(null);
  const [bitmapEditorClipboard, setBitmapEditorClipboard] = useState<BitmapEditorClipboard | null>(null);
  const [bitmapEditorPasteMode, setBitmapEditorPasteMode] = useState<"copy" | "move" | null>(null);
  const [bitmapEditorStippleEnabled, setBitmapEditorStippleEnabled] = useState(false);
  const [bitmapEditorConnectPoints, setBitmapEditorConnectPoints] = useState(false);
  const [bitmapEditorStipplePattern, setBitmapEditorStipplePattern] = useState<string>(DEFAULT_CONVERSION_SETTINGS.orderedMatrix);
  const [bitmapEditorStippleDensity, setBitmapEditorStippleDensity] = useState(50);
  const [bitmapEditorCellMode, setBitmapEditorCellMode] = useState<BitmapEditorCellMode>("filled");
  const [bitmapEditorInkColor, setBitmapEditorInkColor] = useState<number | null>(null);
  const [bitmapEditorPaperColor, setBitmapEditorPaperColor] = useState<number | null>(null);
  const [bitmapEditorBrightPolicy, setBitmapEditorBrightPolicy] = useState<boolean | null>(null);
  const [bitmapEditorFlashPolicy, setBitmapEditorFlashPolicy] = useState<boolean | null>(null);
  const [bitmapEditorFlashPreviewMode, setBitmapEditorFlashPreviewMode] =
    useState<"animate" | "normal" | "inverted" | "off">("normal");
  const [bitmapEditorFlashPreviewPhase, setBitmapEditorFlashPreviewPhase] =
    useState(false);
  const [bitmapEditorColorPickerActive, setBitmapEditorColorPickerActive] = useState(false);
  const [bitmapEditorPatternPickerActive, setBitmapEditorPatternPickerActive] = useState(false);
  const [bitmapEditorPickedCell, setBitmapEditorPickedCell] = useState<ZxAttributeCellSnapshot | null>(null);
  const [bitmapEditorPickedFrameIndex, setBitmapEditorPickedFrameIndex] = useState<number | null>(null);
  const [bitmapEditorTarget] = useState<BitmapEditorTarget>("result");
  const [bitmapEditorResultFrameIndex, setBitmapEditorResultFrameIndex] = useState(0);
  const [bitmapEditorResultBuffer, setBitmapEditorResultBuffer] = useState<NativeResultBitmap | null>(null);
  const bitmapEditorResultBufferRef = useRef<NativeResultBitmap | null>(null);
  const bitmapEditorColorDraftRef = useRef<{
    readonly result: WorkerConversionResult;
    readonly frameIndex: number;
    readonly baseline: NativeResultBitmap;
    steps: number;
  } | null>(null);
  const bitmapEditorResultSourceRef = useRef<WorkerConversionResult | null>(null);
  const bitmapEditorCurrentResultRef = useRef<WorkerConversionResult | null>(null);
  const [bitmapEditorResultUndo, setBitmapEditorResultUndo] = useState<readonly BitmapEditorResultHistoryEntry[]>([]);
  const [bitmapEditorResultRedo, setBitmapEditorResultRedo] = useState<readonly BitmapEditorResultHistoryEntry[]>([]);
  const [bitmapEditorResultOriginal, setBitmapEditorResultOriginal] = useState<NativeResultBitmap | null>(null);
  const [bitmapEditorResultOriginalResult, setBitmapEditorResultOriginalResult] = useState<WorkerConversionResult | null>(null);
  const [bitmapEditorResultEdited, setBitmapEditorResultEdited] = useState(false);
  const [bitmapEditorResultQuality, setBitmapEditorResultQuality] = useState<"Draft" | "High">("High");
  const [bitmapEditorResultPaletteIndex, setBitmapEditorResultPaletteIndex] = useState(1);
  const [bitmapEditorSourceColor, setBitmapEditorSourceColor] = useState<readonly [number, number, number, number] | null>(null);

  return {
    aboutOpen,
    activePanSideRef,
    benchmarkContextKeyRef,
    benchmarkRunRef,
    benchmarkWorkerRef,
    bitmapEditorBrightPolicy,
    bitmapEditorBrushSize,
    bitmapEditorBuffer,
    bitmapEditorCell,
    bitmapEditorCellMode,
    bitmapEditorClipboard,
    bitmapEditorColorChannel,
    bitmapEditorColorDraftRef,
    bitmapEditorColorFrom,
    bitmapEditorColorOperation,
    bitmapEditorColorPickerActive,
    bitmapEditorColorScope,
    bitmapEditorColorTo,
    bitmapEditorConnectPoints,
    bitmapEditorCurrentResultRef,
    bitmapEditorEncodedRef,
    bitmapEditorFlashPolicy,
    bitmapEditorFlashPreviewMode,
    bitmapEditorFlashPreviewPhase,
    bitmapEditorFloodFillActive,
    bitmapEditorFullBufferRef,
    bitmapEditorFullPointerRef,
    bitmapEditorGridMode,
    bitmapEditorInkColor,
    bitmapEditorMergedFlashCanvasRef,
    bitmapEditorOperation,
    bitmapEditorOriginalResult,
    bitmapEditorPaperColor,
    bitmapEditorPasteAttributes,
    bitmapEditorPasteMode,
    bitmapEditorPastePixels,
    bitmapEditorPatternPickerActive,
    bitmapEditorPickedCell,
    bitmapEditorPickedFrameIndex,
    bitmapEditorPointerRef,
    bitmapEditorRedo,
    bitmapEditorRedoFull,
    bitmapEditorRegionSelection,
    bitmapEditorResultBuffer,
    bitmapEditorResultBufferRef,
    bitmapEditorResultCanvasRef,
    bitmapEditorResultEdited,
    bitmapEditorResultFrameIndex,
    bitmapEditorResultOriginal,
    bitmapEditorResultOriginalResult,
    bitmapEditorResultPaletteIndex,
    bitmapEditorResultQuality,
    bitmapEditorResultRedo,
    bitmapEditorResultSourceRef,
    bitmapEditorResultUndo,
    bitmapEditorRevertSource,
    bitmapEditorScope,
    bitmapEditorSelection,
    bitmapEditorSelectionDraft,
    bitmapEditorSelectionPointerRef,
    bitmapEditorSelectionResolution,
    bitmapEditorSelectionTool,
    bitmapEditorShowAttributes,
    bitmapEditorShowPixels,
    bitmapEditorSourceCanvasRef,
    bitmapEditorSourceColor,
    bitmapEditorStippleDensity,
    bitmapEditorStippleEnabled,
    bitmapEditorStipplePattern,
    bitmapEditorTarget,
    bitmapEditorUndo,
    bitmapEditorUndoFull,
    bitmapEditorUseColors,
    canvasRef,
    charsetGlyphRefs,
    charsetSelectionClickRef,
    charsetSelectionDragRef,
    charsetState,
    charsetWorkerRef,
    convertedCanvasRef,
    cropDragRef,
    draftState,
    draftWorkerRef,
    existingCharsetSelectionRef,
    finalJobRef,
    finalRunningRef,
    highlightSelectedTileUses,
    invalidSliderIds,
    lastFinal,
    lastFinalRevisionRef,
    lastZxSettingsRef,
    panDragRef,
    pendingModeHighRef,
    pendingOpenedFinalRef,
    pendingOpenedResultEditedRef,
    pendingOpenedResultQualityRef,
    resultViewportRef,
    revisionRef,
    setAboutOpen,
    setBitmapEditorBrightPolicy,
    setBitmapEditorBrushSize,
    setBitmapEditorBuffer,
    setBitmapEditorCell,
    setBitmapEditorCellMode,
    setBitmapEditorClipboard,
    setBitmapEditorColorChannel,
    setBitmapEditorColorFrom,
    setBitmapEditorColorOperation,
    setBitmapEditorColorPickerActive,
    setBitmapEditorColorScope,
    setBitmapEditorColorTo,
    setBitmapEditorConnectPoints,
    setBitmapEditorFlashPolicy,
    setBitmapEditorFlashPreviewMode,
    setBitmapEditorFlashPreviewPhase,
    setBitmapEditorFloodFillActive,
    setBitmapEditorGridMode,
    setBitmapEditorInkColor,
    setBitmapEditorOperation,
    setBitmapEditorOriginalResult,
    setBitmapEditorPaperColor,
    setBitmapEditorPasteAttributes,
    setBitmapEditorPasteMode,
    setBitmapEditorPastePixels,
    setBitmapEditorPatternPickerActive,
    setBitmapEditorPickedCell,
    setBitmapEditorPickedFrameIndex,
    setBitmapEditorRedo,
    setBitmapEditorRedoFull,
    setBitmapEditorRegionSelection,
    setBitmapEditorResultBuffer,
    setBitmapEditorResultEdited,
    setBitmapEditorResultFrameIndex,
    setBitmapEditorResultOriginal,
    setBitmapEditorResultOriginalResult,
    setBitmapEditorResultPaletteIndex,
    setBitmapEditorResultQuality,
    setBitmapEditorResultRedo,
    setBitmapEditorResultUndo,
    setBitmapEditorRevertSource,
    setBitmapEditorScope,
    setBitmapEditorSelection,
    setBitmapEditorSelectionDraft,
    setBitmapEditorSelectionResolution,
    setBitmapEditorSelectionTool,
    setBitmapEditorShowAttributes,
    setBitmapEditorShowPixels,
    setBitmapEditorSourceColor,
    setBitmapEditorStippleDensity,
    setBitmapEditorStippleEnabled,
    setBitmapEditorStipplePattern,
    setBitmapEditorUndo,
    setBitmapEditorUndoFull,
    setBitmapEditorUseColors,
    setCharsetState,
    setDraftState,
    setHighlightSelectedTileUses,
    setLastFinal,
    setSliderValidity,
    setState,
    setTileEditorColorPickerActive,
    setTileEditorEdited,
    setTileEditorOriginals,
    setTileEditorRedo,
    setTileEditorSelected,
    setTileEditorTilePickerActive,
    setTileEditorUndo,
    setTileEditorUsageSort,
    setTileStampDraft,
    setTilemapEditorCell,
    setTilemapPutActive,
    setUnifiedTileEditorContext,
    skipNextDraftAfterBitmapEditRef,
    sourceConvertedCanvasRef,
    sourceViewportRef,
    state,
    tileEditorColorPickerActive,
    tileEditorEdited,
    tileEditorOriginals,
    tileEditorPointerRef,
    tileEditorRedo,
    tileEditorSelected,
    tileEditorTilePickerActive,
    tileEditorTilePickerClickGuardRef,
    tileEditorUndo,
    tileEditorUsageSort,
    tileStampDraft,
    tilemapEditorCell,
    tilemapPutActive,
    tilemapPutPointerRef,
    unifiedTileEditorContext,
    workerRef,
    workspaceModeRef,
  };
}
