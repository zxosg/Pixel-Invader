import type { AppState } from "../app-state.js";
import { type PreviewContent } from "../../app-types.js";
import { gridPathForDimensions } from "../../bitmap-editor-geometry.js";
import { createPortal } from "react-dom";

export function ResultComparisonDock({ s }: { s: AppState }) {
  const {
    adjustWorkbenchFloatingSize,
    beginBitmapEditorNavigatorDrag,
    beginPreviewDrag,
    bitmapEditorActiveSide,
    bitmapEditorNavigatorViewport,
    bitmapEditorSelectionOverlay,
    borderHex,
    bringWorkbenchWindowToFront,
    canvasRef,
    charsetSource,
    charsetState,
    clearBitmapEditorSelectionOnDoubleClick,
    convertedCanvasRef,
    differencePreviewDataUrl,
    displayedAttributeHeight,
    displayedHeight,
    displayedResult,
    displayedWidth,
    draggingSide,
    endBitmapEditorNavigatorDrag,
    endPreviewDrag,
    fitPreview,
    fullBitmapEditorPreview,
    handleInspectorKey,
    handlePreviewScroll,
    handlePreviewWheel,
    handleTilemapPutPointerDown,
    handleTilemapPutPointerEnd,
    handleTilemapPutPointerMove,
    handleWorkbenchTitlebarClick,
    handleWorkbenchTitlebarKeyDown,
    hasMixedScreenTarget,
    hasQlMixedResolutionTarget,
    hasVerticalSpatialTarget,
    highlightedTileCells,
    image,
    inspectResultPixel,
    inspection,
    inspectionCellOverlay,
    isPmd,
    isZx,
    markPanSource,
    moveBitmapEditorNavigatorDrag,
    movePreviewDrag,
    outputPaletteColors,
    outputPreviewStage,
    paletteUsage,
    paletteUsageFilter,
    paletteUsagePercent,
    resultFitStageSize,
    resultLabel,
    resultPreviewContent,
    resultPreviewZoom,
    resultStageAspectRatio,
    resultStageWidth,
    resultViewportRef,
    resultZoom,
    selectPreviewContent,
    selectResultPixel,
    selectUsedTile,
    selectedPaletteColor,
    setPaletteUsageFilter,
    setSelectedPaletteColor,
    setTileUsageFilter,
    setWorkbenchResultDockedWidth,
    setWorkbenchResultFloatingX,
    setWorkbenchResultFloatingY,
    showAttributeGrid,
    showPixelGrid,
    standaloneTilemapPreview,
    startWorkbenchDockedPreviewResize,
    startWorkbenchFloatingResize,
    startWorkbenchSectionDrag,
    startWorkbenchTitlebarDrag,
    stepPreviewZoom,
    targetModeId,
    tileEditorSelected,
    tileUsage,
    tileUsageFilter,
    tilemapEditorSelectionOverlay,
    tilemapPutActive,
    tilemapStale,
    unifiedEditorPreview,
    unifiedTileEditorContext,
    visiblePaletteUsageColors,
    visibleTileUsage,
    windowImageFor,
    workbenchDockLayerFor,
    workbenchDockSplitHandle,
    workbenchDockWindowStyle,
    workbenchPreviewWorkspaceRef,
    workbenchResultDockedWidth,
    workbenchResultFloating,
    workbenchResultFloatingAutoHeight,
    workbenchWindowActions,
    workbenchWindowDragAttributes,
    workbenchWindowLayout,
    workbenchWindowZIndex,
    workspaceMode,
  } = s;
  return (
    <>{(() => {
   const resultDock = workbenchWindowLayout("result").dock;
   const resultDockTarget = workbenchDockLayerFor(resultDock);
   const resultPreviewPane = (
   <section
     className={`preview-panel result-panel${workbenchResultFloating ? ` preview-panel-floating preview-result-window${workbenchResultFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : " preview-panel-docked"} ${workspaceMode === "tilemap" ? "tilemap-preview-panel" : ""}`}
     {...workbenchWindowDragAttributes("result")}
     data-workbench-window="result"
     hidden={!workbenchWindowLayout("result").visible}
     data-dock={resultDock}
     data-minimized={workbenchWindowLayout("result").minimized ? "true" : "false"}
     aria-labelledby="result-preview-title"
     style={workbenchDockWindowStyle("result", workbenchResultFloating ? { zIndex: workbenchWindowZIndex("result") } : undefined)}
     onPointerDown={() => { if (workbenchResultFloating) bringWorkbenchWindowToFront("result"); }}
     onFocusCapture={() => { if (workbenchResultFloating) bringWorkbenchWindowToFront("result"); }}
   >
     {!workbenchResultFloating && resultDock === "center" ? (
       <div
         className="preview-docked-resize-handle preview-result-docked-resize"
         role="separator"
         aria-orientation="vertical"
         aria-label="Resize Result preview"
         aria-valuemin={240}
         aria-valuemax={Math.max(240, (workbenchPreviewWorkspaceRef.current?.clientWidth ?? 1200) - 288)}
         aria-valuenow={Math.min(Math.max(240, (workbenchPreviewWorkspaceRef.current?.clientWidth ?? 1200) - 288), Math.round(workbenchResultDockedWidth * Math.max(480, (workbenchPreviewWorkspaceRef.current?.clientWidth ?? 1200) - 80)))}
         tabIndex={0}
         onPointerDown={(event) => startWorkbenchDockedPreviewResize("result", event)}
         onKeyDown={(event) => {
           const step = event.shiftKey ? 0.08 : 0.02;
           if (event.key === "ArrowRight") setWorkbenchResultDockedWidth((width) => Math.min(10, width + step));
           if (event.key === "ArrowLeft") setWorkbenchResultDockedWidth((width) => Math.max(0.25, width - step));
         }}
       />
     ) : null}
     <div
       className="preview-panel-heading"
       tabIndex={0}
       onPointerDown={(event) => startWorkbenchTitlebarDrag("result", event)}
       onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("result", event)}
       onClick={(event) => handleWorkbenchTitlebarClick("result", event)}
     >
       <h3 className="preview-panel-title" id="result-preview-title">{resultPreviewContent === "image" || resultPreviewContent === "result-image" ? resultLabel : resultPreviewContent === "source-image" ? "Conversion input" : resultPreviewContent === "bitmap-editor" ? "Bitmap editor" : resultPreviewContent === "pre-attribute" ? "Pre-attribute dither" : resultPreviewContent === "screen-1" ? hasVerticalSpatialTarget ? "Full resolution" : "Screen 1" : resultPreviewContent === "screen-2" ? hasVerticalSpatialTarget ? "Analytic" : "Screen 2" : resultPreviewContent === "merged-low" ? "Merged · low resolution" : resultPreviewContent === "merged-high" ? "Merged · high resolution" : resultPreviewContent === "palette-usage" ? "Palette usage" : resultPreviewContent === "tile-usage" ? "Used tiles" : resultPreviewContent === "unified-editor" ? "Unified editor" : resultPreviewContent === "difference" ? "Difference heatmap" : "Inspector"}</h3>
       {workbenchWindowActions("result", true)}
       <label className="preview-content-selector">
         <span className="sr-only">Result window content</span>
         <select
           value={resultPreviewContent}
           disabled={bitmapEditorActiveSide === "source"}
           onChange={(event) => {
             selectPreviewContent("result", event.target.value as PreviewContent);
           }}
         >
           <option value="image">Result image</option>
           <option value="source-image">Source image</option>
           {workspaceMode === "palette" ? <option value="pre-attribute">Pre-attribute dither</option> : null}
           {hasMixedScreenTarget ? <>
             <option value="screen-1">Screen 1</option>
             <option value="screen-2">Screen 2</option>
           </> : null}
           {hasVerticalSpatialTarget ? <>
             <option value="screen-1">Full resolution</option>
             <option value="screen-2">Analytic</option>
           </> : null}
           {hasQlMixedResolutionTarget ? <>
             <option value="merged-low">Merged · low resolution</option>
             <option value="merged-high">Merged · high resolution</option>
           </> : null}
           <option value="palette-usage">Palette usage</option>
           {workspaceMode === "tilemap" ? <option value="tile-usage">Used tiles</option> : null}
           <option value="unified-editor">Unified editor</option>
           {workspaceMode === "palette" ? <option value="bitmap-editor">Bitmap editor</option> : null}
           <option value="difference">Difference heatmap</option>
           <option value="inspector">Inspector</option>
         </select>
       </label>
       <div className="preview-zoom-actions" aria-label="Result preview zoom">
         <button className="secondary compact" type="button" aria-label="Zoom out Result preview" title="Zoom out" onClick={() => stepPreviewZoom("result", -1)} disabled={bitmapEditorActiveSide === "source" || resultPreviewZoom === "fit"}>−</button>
         <button className="secondary compact" type="button" aria-label="Zoom in Result preview" title="Zoom in" onClick={() => stepPreviewZoom("result", 1)} disabled={bitmapEditorActiveSide === "source" || resultPreviewZoom === 16}>+</button>
         <button className="secondary compact" type="button" aria-label="Fit Result preview" title="Fit" onClick={() => fitPreview("result")}>%</button>
       </div>
       {workbenchResultFloating ? (
         <span
           className="workbench-window-drag-handle"
           role="button"
           tabIndex={0}
           aria-label="Move Result preview window"
           title="Drag to move Result preview"
           onPointerDown={(event) => startWorkbenchSectionDrag("result", event)}
           onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
           onKeyDown={(event) => {
             const step = event.shiftKey ? 32 : 8;
             if (event.key === "ArrowLeft") setWorkbenchResultFloatingX((x) => Math.max(8, x - step));
             if (event.key === "ArrowRight") setWorkbenchResultFloatingX((x) => x + step);
             if (event.key === "ArrowUp") setWorkbenchResultFloatingY((y) => Math.max(8, y - step));
             if (event.key === "ArrowDown") setWorkbenchResultFloatingY((y) => y + step);
           }}
         >⠿</span>
       ) : null}
     </div>
     {workbenchDockSplitHandle("result")}
     {resultPreviewContent === "bitmap-editor" ? fullBitmapEditorPreview("result") : resultPreviewContent === "image" || resultPreviewContent === "result-image" || resultPreviewContent === "source-image" || (hasVerticalSpatialTarget && (resultPreviewContent === "screen-1" || resultPreviewContent === "screen-2")) ? <div
       className={`preview-frame preview-viewport zx-preview ${draggingSide === "result" ? "dragging" : ""}`}
       ref={resultViewportRef}
       onScroll={(event) => handlePreviewScroll("result", event)}
       onPointerDown={(event) => beginPreviewDrag("result", event)}
       onPointerMove={movePreviewDrag}
       onPointerUp={endPreviewDrag}
       onPointerCancel={endPreviewDrag}
       onWheel={(event) => handlePreviewWheel("result", event)}
       onFocusCapture={() => markPanSource("result")}
       style={{ backgroundColor: borderHex, borderColor: borderHex }}
     >
       {((resultPreviewContent === "source-image" && image !== null) ||
         (standaloneTilemapPreview && (resultPreviewContent === "image" || resultPreviewContent === "result-image")) ||
         (displayedResult !== null &&
           (workspaceMode === "palette" || charsetState.kind === "ready")))
         ? (
           <div
             className={[
               "preview-stage",
               resultZoom === "fit" ? "fit-stage" : "",
               resultPreviewContent === "source-image" ? "source-image-stage" : "",
               showPixelGrid && resultZoom !== "fit" && resultZoom >= 4 ? "show-pixel-grid" : "",
               showAttributeGrid ? "show-attribute-grid" : "",
             ].filter(Boolean).join(" ")}
             style={{
               width: resultFitStageSize !== null ? `${resultFitStageSize.width}px` : resultStageWidth,
               height: resultFitStageSize !== null ? `${resultFitStageSize.height}px` : undefined,
               aspectRatio: resultStageAspectRatio,
             }}
           >
             <canvas
               ref={resultPreviewContent === "source-image" ? canvasRef : convertedCanvasRef}
               className={tilemapPutActive && unifiedTileEditorContext === "stamp" && workspaceMode === "tilemap" && resultPreviewContent !== "source-image" ? "tilemap-put-cursor" : undefined}
               aria-label={resultPreviewContent === "source-image" ? "Decoded source image preview" : "Converted hardware preview"}
               aria-describedby="inspection-help"
               tabIndex={resultPreviewContent === "source-image" ? undefined : 0}
               onPointerMove={resultPreviewContent === "source-image" ? undefined : tilemapPutActive && unifiedTileEditorContext === "stamp" && workspaceMode === "tilemap" ? handleTilemapPutPointerMove : inspectResultPixel}
               onPointerDown={resultPreviewContent === "source-image" ? undefined : tilemapPutActive && unifiedTileEditorContext === "stamp" && workspaceMode === "tilemap" ? handleTilemapPutPointerDown : selectResultPixel}
               onPointerUp={resultPreviewContent === "source-image" ? undefined : handleTilemapPutPointerEnd}
               onPointerCancel={resultPreviewContent === "source-image" ? undefined : handleTilemapPutPointerEnd}
               onDoubleClick={resultPreviewContent === "source-image" ? undefined : clearBitmapEditorSelectionOnDoubleClick}
               onKeyDown={resultPreviewContent === "source-image" ? undefined : handleInspectorKey}
             />
             <svg
               className="pixel-grid-overlay"
               viewBox={`0 0 ${displayedWidth} ${displayedHeight}`}
               preserveAspectRatio="none"
               aria-hidden="true"
             >
               <path d={gridPathForDimensions(displayedWidth, displayedHeight, 1, 1)} vectorEffect="non-scaling-stroke" />
             </svg>
             {(isZx || isPmd) && bitmapEditorActiveSide !== "source" ? <svg
               className="attribute-grid-overlay"
               viewBox={`0 0 ${displayedWidth} ${displayedHeight}`}
               preserveAspectRatio="none"
               aria-hidden="true"
             >
               <path d={gridPathForDimensions(displayedWidth, displayedHeight, isPmd ? 6 : 8, isPmd ? (targetModeId === "pmd85-colorace" ? 2 : 1) : displayedAttributeHeight)} vectorEffect="non-scaling-stroke" />
             </svg> : null}
             {resultPreviewContent !== "source-image" && inspectionCellOverlay !== null ? (
               <svg className="inspection-cell-overlay" viewBox={`0 0 ${displayedWidth} ${displayedHeight}`} preserveAspectRatio="none" aria-hidden="true">
                 <rect {...inspectionCellOverlay} />
               </svg>
             ) : null}
             {resultPreviewContent !== "source-image" && bitmapEditorSelectionOverlay !== null ? (
               <svg className="bitmap-editor-selection-overlay" viewBox={`0 0 ${displayedWidth} ${displayedHeight}`} preserveAspectRatio="none" aria-hidden="true">
                 <rect {...bitmapEditorSelectionOverlay} />
               </svg>
             ) : null}
             {resultPreviewContent !== "source-image" && tilemapEditorSelectionOverlay !== null ? (
               <svg className="tilemap-selection-overlay" viewBox={`0 0 ${displayedWidth} ${displayedHeight}`} preserveAspectRatio="none" aria-hidden="true">
                 {highlightedTileCells.map((cellIndexRect) => <rect className="tilemap-matching-cell-outline" key={`${cellIndexRect.x},${cellIndexRect.y}`} {...cellIndexRect} />)}
                 <rect {...tilemapEditorSelectionOverlay} />
               </svg>
             ) : null}
             {bitmapEditorActiveSide === "source" && (resultPreviewContent === "image" || resultPreviewContent === "result-image") ? <>
               <svg className="bitmap-editor-navigator-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" role="application" tabIndex={0} aria-label="Bitmap editor navigator · click or drag to pan" onPointerDown={(event) => beginBitmapEditorNavigatorDrag("result", event)} onPointerMove={moveBitmapEditorNavigatorDrag} onPointerUp={endBitmapEditorNavigatorDrag} onPointerCancel={endBitmapEditorNavigatorDrag}>
                 <rect x={bitmapEditorNavigatorViewport.left * 1000} y={bitmapEditorNavigatorViewport.top * 1000} width={bitmapEditorNavigatorViewport.width * 1000} height={bitmapEditorNavigatorViewport.height * 1000} />
               </svg>
               <span className="bitmap-editor-navigator-label">Navigator · drag to pan</span>
             </> : null}
             {workspaceMode === "tilemap" && tilemapStale ? (
               <span className="stale-preview-badge">
                 Stale · press Convert High
               </span>
             ) : null}
             </div>
         )
         : <p className="preview-placeholder">
             {workspaceMode === "tilemap"
               ? charsetState.kind === "running"
                 ? "Building decoder reconstruction…"
                 : "Run Tilemap High to generate the reconstruction."
               : "A Draft preview will appear automatically."}
           </p>}
     </div> : (
       <div className="preview-frame preview-content-card" aria-live="polite">
         {resultPreviewContent === "palette-usage" ? (
           paletteUsage === null ? <p>Palette usage appears with the converted preview.</p> : (
             <>
               <p><strong>{paletteUsage.normalCells + paletteUsage.brightCells}</strong> attribute cells analyzed · <strong>{paletteUsage.normalColorCodes.length + paletteUsage.brightColorCodes.length}</strong> colors used</p>
               <label className="preview-filter-control"><span>Show</span><select value={paletteUsageFilter} onChange={(event) => setPaletteUsageFilter(event.target.value as "used" | "all")}><option value="used">Used colors only</option><option value="all">All colors</option></select></label>
               <div className="usage-palette">
                 {visiblePaletteUsageColors.map((color) => {
                   const normalUsed = paletteUsage.normalColorCodes.includes(color.code);
                   const brightUsed = paletteUsage.brightColorCodes.includes(color.code);
                   return <button type="button" className={`usage-color usage-color-button ${normalUsed || brightUsed ? "used" : ""}${selectedPaletteColor === color.code ? " selected" : ""}`} key={color.code} aria-pressed={selectedPaletteColor === color.code} onClick={() => setSelectedPaletteColor(selectedPaletteColor === color.code ? null : color.code)}>
                     <span className="usage-swatches" aria-hidden="true"><span style={{ backgroundColor: color.normal }} /><span style={{ backgroundColor: color.bright }} /></span>
                     <span>{color.name}</span><small>N {paletteUsage.normalColorCounts[color.code]} ({paletteUsagePercent(paletteUsage.normalColorCounts[color.code] ?? 0)}) · B {paletteUsage.brightColorCounts[color.code]} ({paletteUsagePercent(paletteUsage.brightColorCounts[color.code] ?? 0)})</small>
                   </button>;
                 })}
               </div>
             </>
           )
         ) : resultPreviewContent === "tile-usage" ? (
           tileUsage.length === 0 ? <p>Run Tilemap High to inspect tile usage.</p> : <>
             <label className="preview-filter-control"><span>Show</span><select value={tileUsageFilter} onChange={(event) => setTileUsageFilter(event.target.value as "used" | "all")}><option value="used">Used tiles only</option><option value="all">All tiles</option></select></label>
             <div className="preview-usage-list">{visibleTileUsage.map(({ characterIndex, count }) => <button type="button" className={`preview-usage-row${tileEditorSelected === characterIndex ? " selected" : ""}`} key={characterIndex} aria-pressed={tileEditorSelected === characterIndex} onClick={() => { selectUsedTile(characterIndex); }}><span>Tile {characterIndex} · {charsetSource === "existing" ? "Loaded" : "Calculated"}</span><strong>{count} cells</strong></button>)}</div>
           </>
         ) : resultPreviewContent === "unified-editor" ? (
           unifiedEditorPreview
         ) : resultPreviewContent === "pre-attribute" || resultPreviewContent === "screen-1" || resultPreviewContent === "screen-2" || resultPreviewContent === "merged-low" || resultPreviewContent === "merged-high" ? (
           windowImageFor(resultPreviewContent)
         ) : resultPreviewContent === "difference" ? (
           differencePreviewDataUrl === null ? <p>Convert an image to inspect the difference heatmap.</p> : <img className="preview-difference-image" src={differencePreviewDataUrl} alt="Difference heatmap between adjusted source and output" />
         ) : inspection === null ? <p>Point at the converted preview, or focus it and use arrow keys, to inspect a cell.</p> : <dl className="attribute-readout"><div><dt>Pixel</dt><dd>{inspection.pixelX}, {inspection.pixelY}</dd></div><div><dt>Cell</dt><dd>{inspection.cellX}, {inspection.cellY}</dd></div><div><dt>Attribute</dt><dd>{inspection.attributeHex} · offset {inspection.attributeOffset}</dd></div><div><dt>INK / PAPER</dt><dd>{inspection.ink} / {inspection.paper}</dd></div><div><dt>BRIGHT</dt><dd>{inspection.bright ? "On" : "Off"}</dd></div></dl>}
       </div>
     )}
     {workspaceMode === "palette" ? (
     <div
       className="output-palette-bar"
       aria-label={`${outputPreviewStage === "merged"
         ? targetModeId.includes("vertical-spatial")
           ? "Analytic mixed used"
           : "Merged used"
         : outputPreviewStage === "screen-2"
           ? targetModeId.includes("vertical-spatial")
             ? "Analytic mixed used"
             : "Screen 2 selected"
           : "Screen 1 selected"} palette`}
     >
       {outputPaletteColors.map((color) => (
         <span
           key={color.key}
           title={color.title}
           style={{ background: color.background }}
         />
       ))}
     </div>
     ) : null}
     {workbenchResultFloating ? (
       <div
         className="workbench-floating-resize-handle"
         role="button"
         tabIndex={0}
         aria-label="Resize Result preview window"
         onPointerDown={(event) => startWorkbenchFloatingResize("result", event)}
         onKeyDown={(event) => {
           const step = event.shiftKey ? 32 : 8;
           if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("result", step, 0);
           if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("result", -step, 0);
           if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("result", 0, step);
           if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("result", 0, -step);
         }}
       />
     ) : null}
   </section>
   );
   return resultDock !== "center" && resultDockTarget !== null
     ? createPortal(resultPreviewPane, resultDockTarget, "result-preview")
     : resultPreviewPane;
   })()}</>
  );
}
