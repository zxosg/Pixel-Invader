import type { AppState } from "../app-state.js";
import { type PreviewContent } from "../../app-types.js";
import { createPortal } from "react-dom";

export function SourceComparisonDock({ s }: { s: AppState }) {
  const {
    adjustWorkbenchFloatingSize,
    beginBitmapEditorNavigatorDrag,
    beginCropSelection,
    beginPreviewDrag,
    bitmapEditorActiveSide,
    bitmapEditorNavigatorViewport,
    bitmapEditorSelectionOverlay,
    bringWorkbenchWindowToFront,
    canvasRef,
    charsetSource,
    clearBitmapEditorSelectionOnDoubleClick,
    clearCropSelection,
    cropDragRef,
    cropOverlay,
    cropPointerMode,
    cropSourceSize,
    differencePreviewDataUrl,
    displayedHeight,
    displayedWidth,
    draggingSide,
    endBitmapEditorNavigatorDrag,
    endCropSelection,
    endPreviewDrag,
    fitPreview,
    framing,
    fullBitmapEditorPreview,
    handleInspectorKey,
    handlePreviewScroll,
    handlePreviewWheel,
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
    markPanSource,
    moveBitmapEditorNavigatorDrag,
    moveCropSelection,
    moveCropWithKeyboard,
    movePreviewDrag,
    paletteUsage,
    paletteUsageFilter,
    paletteUsagePercent,
    resultLabel,
    selectPreviewContent,
    selectResultPixel,
    selectUsedTile,
    selectedPaletteColor,
    setCropPointerMode,
    setPaletteUsageFilter,
    setSelectedPaletteColor,
    setTileUsageFilter,
    setWorkbenchSourceDockedWidth,
    setWorkbenchSourceFloatingX,
    setWorkbenchSourceFloatingY,
    sourceConvertedCanvasRef,
    sourceFitStageSize,
    sourcePreviewContent,
    sourcePreviewZoom,
    sourceShowsImage,
    sourceStageAspectRatio,
    sourceStageWidth,
    sourceViewportRef,
    sourceZoom,
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
    unifiedEditorPreview,
    visiblePaletteUsageColors,
    visibleTileUsage,
    windowImageFor,
    workbenchDockLayerFor,
    workbenchDockSplitHandle,
    workbenchDockWindowStyle,
    workbenchPreviewWorkspaceRef,
    workbenchSourceDockedWidth,
    workbenchSourceFloating,
    workbenchSourceFloatingAutoHeight,
    workbenchWindowActions,
    workbenchWindowDragAttributes,
    workbenchWindowLayout,
    workbenchWindowZIndex,
    workspaceMode,
  } = s;
  return (
    <>{(() => {
   const sourceDock = workbenchWindowLayout("source").dock;
   const sourceDockTarget = workbenchDockLayerFor(sourceDock);
   const sourcePreviewPane = (
   <section
     className={`preview-panel source-panel${workbenchSourceFloating ? ` preview-panel-floating preview-source-window${workbenchSourceFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : " preview-panel-docked"} ${workspaceMode === "tilemap" ? "tilemap-preview-panel" : ""}`}
     {...workbenchWindowDragAttributes("source")}
     data-workbench-window="source"
     hidden={!workbenchWindowLayout("source").visible}
     data-dock={sourceDock}
     data-minimized={workbenchWindowLayout("source").minimized ? "true" : "false"}
     aria-labelledby="source-preview-title"
     style={workbenchDockWindowStyle("source", workbenchSourceFloating ? { zIndex: workbenchWindowZIndex("source") } : undefined)}
     onPointerDown={() => { if (workbenchSourceFloating) bringWorkbenchWindowToFront("source"); }}
     onFocusCapture={() => { if (workbenchSourceFloating) bringWorkbenchWindowToFront("source"); }}
   >
     {!workbenchSourceFloating && sourceDock === "center" ? (
       <div
         className="preview-docked-resize-handle preview-source-docked-resize"
         role="separator"
         aria-orientation="vertical"
         aria-label="Resize Source preview"
         aria-valuemin={240}
         aria-valuemax={Math.max(240, (workbenchPreviewWorkspaceRef.current?.clientWidth ?? 1200) - 288)}
         aria-valuenow={Math.min(Math.max(240, (workbenchPreviewWorkspaceRef.current?.clientWidth ?? 1200) - 288), Math.round(workbenchSourceDockedWidth * Math.max(480, (workbenchPreviewWorkspaceRef.current?.clientWidth ?? 1200) - 80)))}
         tabIndex={0}
         onPointerDown={(event) => startWorkbenchDockedPreviewResize("source", event)}
         onKeyDown={(event) => {
           const step = event.shiftKey ? 0.08 : 0.02;
           if (event.key === "ArrowRight") setWorkbenchSourceDockedWidth((width) => Math.min(10, width + step));
           if (event.key === "ArrowLeft") setWorkbenchSourceDockedWidth((width) => Math.max(0.25, width - step));
         }}
       />
     ) : null}
     <div
       className="preview-panel-heading"
       tabIndex={0}
       onPointerDown={(event) => startWorkbenchTitlebarDrag("source", event)}
       onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("source", event)}
       onClick={(event) => handleWorkbenchTitlebarClick("source", event)}
     >
       <h3 className="preview-panel-title" id="source-preview-title">
         {sourcePreviewContent === "image" || sourcePreviewContent === "source-image"
           ? workspaceMode === "tilemap" ? "Palette source" : "Conversion input"
             : sourcePreviewContent === "result-image"
               ? resultLabel
           : sourcePreviewContent === "pre-attribute"
             ? "Pre-attribute dither"
           : sourcePreviewContent === "screen-1"
             ? hasVerticalSpatialTarget ? "Full resolution" : "Screen 1"
           : sourcePreviewContent === "screen-2"
             ? hasVerticalSpatialTarget ? "Analytic" : "Screen 2"
           : sourcePreviewContent === "merged-low"
             ? "Merged · low resolution"
           : sourcePreviewContent === "merged-high"
             ? "Merged · high resolution"
           : sourcePreviewContent === "palette-usage"
             ? "Palette usage"
             : sourcePreviewContent === "tile-usage"
               ? "Used tiles"
               : sourcePreviewContent === "unified-editor"
                 ? "Unified editor"
               : sourcePreviewContent === "bitmap-editor"
                 ? "Bitmap editor"
               : sourcePreviewContent === "difference"
                 ? "Difference heatmap"
               : "Inspector"}
       </h3>
       {workbenchWindowActions("source", true)}
       <label className="preview-content-selector">
         <span className="sr-only">Source window content</span>
         <select
           value={sourcePreviewContent}
           disabled={bitmapEditorActiveSide === "result"}
           onChange={(event) => {
             selectPreviewContent("source", event.target.value as PreviewContent);
           }}
         >
           <option value="image">Source image</option>
           <option value="result-image">Result image</option>
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
       <div className="preview-zoom-actions" aria-label="Source preview zoom">
         <button className="secondary compact" type="button" aria-label="Zoom out Source preview" title="Zoom out" onClick={() => stepPreviewZoom("source", -1)} disabled={bitmapEditorActiveSide === "result" || sourcePreviewZoom === "fit"}>−</button>
         <button className="secondary compact" type="button" aria-label="Zoom in Source preview" title="Zoom in" onClick={() => stepPreviewZoom("source", 1)} disabled={bitmapEditorActiveSide === "result" || sourcePreviewZoom === 16}>+</button>
         <button className="secondary compact" type="button" aria-label="Fit Source preview" title="Fit" onClick={() => fitPreview("source")}>%</button>
       </div>
       {workbenchSourceFloating ? (
         <span
           className="workbench-window-drag-handle"
           role="button"
           tabIndex={0}
           aria-label="Move Source preview window"
           title="Drag to move Source preview"
           onPointerDown={(event) => startWorkbenchSectionDrag("source", event)}
           onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
           onKeyDown={(event) => {
             const step = event.shiftKey ? 32 : 8;
             if (event.key === "ArrowLeft") setWorkbenchSourceFloatingX((x) => Math.max(8, x - step));
             if (event.key === "ArrowRight") setWorkbenchSourceFloatingX((x) => x + step);
             if (event.key === "ArrowUp") setWorkbenchSourceFloatingY((y) => Math.max(8, y - step));
             if (event.key === "ArrowDown") setWorkbenchSourceFloatingY((y) => y + step);
           }}
         >⠿</span>
       ) : null}
     </div>
     {workbenchDockSplitHandle("source")}
     {sourcePreviewContent === "bitmap-editor" ? fullBitmapEditorPreview("source") : sourcePreviewContent === "image" || sourcePreviewContent === "source-image" || sourcePreviewContent === "result-image" || (hasVerticalSpatialTarget && (sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2")) ? <div
       className={`preview-frame preview-viewport source-preview-frame ${draggingSide === "source" ? "dragging" : ""}`}
       ref={sourceViewportRef}
       onScroll={(event) => handlePreviewScroll("source", event)}
       onPointerDown={(event) => beginPreviewDrag("source", event)}
       onPointerMove={movePreviewDrag}
       onPointerUp={endPreviewDrag}
       onPointerCancel={endPreviewDrag}
       onWheel={(event) => handlePreviewWheel("source", event)}
       onFocusCapture={() => markPanSource("source")}
     >
       {image === null
         ? null
         : (
           <div
             className={`preview-stage ${sourceZoom === "fit" ? "fit-stage" : ""}${sourceShowsImage ? " source-image-stage" : ""}`}
             style={{
               width: sourceFitStageSize !== null ? `${sourceFitStageSize.width}px` : sourceStageWidth,
               height: sourceFitStageSize !== null ? `${sourceFitStageSize.height}px` : undefined,
               aspectRatio: sourceStageAspectRatio,
             }}
           >
             <canvas
               ref={sourcePreviewContent === "result-image" || (hasVerticalSpatialTarget && (sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2")) ? sourceConvertedCanvasRef : canvasRef}
               className={framing === "crop"
                 ? `crop-editor-canvas crop-pointer-${cropPointerMode}`
                 : undefined}
               aria-label={sourcePreviewContent === "result-image" || (hasVerticalSpatialTarget && (sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2"))
                 ? "Converted hardware preview"
                 : framing === "crop"
                 ? "Source image crop editor"
                 : "Decoded source image preview"}
               tabIndex={sourcePreviewContent === "result-image" || (hasVerticalSpatialTarget && (sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2")) ? 0 : framing === "crop" ? 0 : undefined}
               onPointerDown={sourcePreviewContent === "result-image" ? selectResultPixel : framing === "crop" ? beginCropSelection : undefined}
               onPointerMove={sourcePreviewContent === "result-image" ? inspectResultPixel : framing === "crop" ? moveCropSelection : undefined}
               onPointerUp={sourcePreviewContent === "result-image" ? undefined : framing === "crop" ? endCropSelection : undefined}
               onPointerCancel={sourcePreviewContent === "result-image" ? undefined : framing === "crop" ? endCropSelection : undefined}
               onDoubleClick={sourcePreviewContent === "result-image" ? clearBitmapEditorSelectionOnDoubleClick : framing === "crop" ? clearCropSelection : undefined}
               onKeyDown={sourcePreviewContent === "result-image" ? handleInspectorKey : framing === "crop" ? moveCropWithKeyboard : undefined}
               onPointerLeave={framing === "crop"
                 ? () => {
                     if (cropDragRef.current === null) {
                       setCropPointerMode("create");
                     }
                   }
                 : undefined}
             />
             {sourcePreviewContent !== "result-image" && framing === "crop" && cropOverlay !== null ? (
               <svg
                 className="crop-selection-overlay"
                 viewBox={`0 0 ${cropSourceSize?.width ?? 1} ${cropSourceSize?.height ?? 1}`}
                 preserveAspectRatio="none"
                 aria-hidden="true"
               >
                 <path
                   className="crop-selection-shade"
                   d={`M0 0H${cropSourceSize?.width ?? 1}V${cropSourceSize?.height ?? 1}H0Z M${cropOverlay.x} ${cropOverlay.y}h${cropOverlay.width}v${cropOverlay.height}h-${cropOverlay.width}Z`}
                   fillRule="evenodd"
                 />
                 <rect
                   className="crop-selection-rect"
                   x={cropOverlay.x}
                   y={cropOverlay.y}
                   width={cropOverlay.width}
                   height={cropOverlay.height}
                 />
                 {(() => {
                   const size = Math.max(
                     8,
                     Math.round(Math.min(cropSourceSize?.width ?? 8, cropSourceSize?.height ?? 8) * 0.02),
                   );
                   const half = size / 2;
                   const points: readonly (readonly [number, number])[] = [
                     [cropOverlay.x, cropOverlay.y],
                     [cropOverlay.x + cropOverlay.width / 2, cropOverlay.y],
                     [cropOverlay.x + cropOverlay.width, cropOverlay.y],
                     [cropOverlay.x + cropOverlay.width, cropOverlay.y + cropOverlay.height / 2],
                     [cropOverlay.x + cropOverlay.width, cropOverlay.y + cropOverlay.height],
                     [cropOverlay.x + cropOverlay.width / 2, cropOverlay.y + cropOverlay.height],
                     [cropOverlay.x, cropOverlay.y + cropOverlay.height],
                     [cropOverlay.x, cropOverlay.y + cropOverlay.height / 2],
                   ];
                   return points.map(([x, y], index) => (
                     <rect
                       className="crop-resize-handle"
                       key={index}
                       x={x - half}
                       y={y - half}
                       width={size}
                       height={size}
                     />
                   ));
                 })()}
               </svg>
             ) : null}
             {sourcePreviewContent === "result-image" && inspectionCellOverlay !== null ? (
               <svg className="inspection-cell-overlay" viewBox={`0 0 ${displayedWidth} ${displayedHeight}`} preserveAspectRatio="none" aria-hidden="true">
                 <rect {...inspectionCellOverlay} />
               </svg>
             ) : null}
             {sourcePreviewContent === "result-image" && bitmapEditorSelectionOverlay !== null ? (
               <svg className="bitmap-editor-selection-overlay" viewBox={`0 0 ${displayedWidth} ${displayedHeight}`} preserveAspectRatio="none" aria-hidden="true">
                 <rect {...bitmapEditorSelectionOverlay} />
               </svg>
             ) : null}
             {sourcePreviewContent === "result-image" && tilemapEditorSelectionOverlay !== null ? (
               <svg className="tilemap-selection-overlay" viewBox={`0 0 ${displayedWidth} ${displayedHeight}`} preserveAspectRatio="none" aria-hidden="true">
                 {highlightedTileCells.map((cellIndexRect) => <rect className="tilemap-matching-cell-outline" key={`${cellIndexRect.x},${cellIndexRect.y}`} {...cellIndexRect} />)}
                 <rect {...tilemapEditorSelectionOverlay} />
               </svg>
             ) : null}
             {bitmapEditorActiveSide === "result" && sourcePreviewContent === "result-image" ? <>
               <svg className="bitmap-editor-navigator-overlay" viewBox="0 0 1000 1000" preserveAspectRatio="none" role="application" tabIndex={0} aria-label="Bitmap editor navigator · click or drag to pan" onPointerDown={(event) => beginBitmapEditorNavigatorDrag("source", event)} onPointerMove={moveBitmapEditorNavigatorDrag} onPointerUp={endBitmapEditorNavigatorDrag} onPointerCancel={endBitmapEditorNavigatorDrag}>
                 <rect x={bitmapEditorNavigatorViewport.left * 1000} y={bitmapEditorNavigatorViewport.top * 1000} width={bitmapEditorNavigatorViewport.width * 1000} height={bitmapEditorNavigatorViewport.height * 1000} />
               </svg>
               <span className="bitmap-editor-navigator-label">Navigator · drag to pan</span>
             </> : null}
           </div>
         )}
     </div> : (
       <div className="preview-frame preview-content-card" aria-live="polite">
         {sourcePreviewContent === "palette-usage" ? (
           paletteUsage === null ? <p>Palette usage appears with the converted preview.</p> : (
             <>
               <p><strong>{paletteUsage.normalCells + paletteUsage.brightCells}</strong> attribute cells analyzed</p>
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
         ) : sourcePreviewContent === "tile-usage" ? (
           tileUsage.length === 0 ? <p>Run Tilemap High to inspect tile usage.</p> : <>
             <label className="preview-filter-control"><span>Show</span><select value={tileUsageFilter} onChange={(event) => setTileUsageFilter(event.target.value as "used" | "all")}><option value="used">Used tiles only</option><option value="all">All tiles</option></select></label>
             <div className="preview-usage-list">
               {visibleTileUsage.map(({ characterIndex, count }) => <button type="button" className={`preview-usage-row${tileEditorSelected === characterIndex ? " selected" : ""}`} key={characterIndex} aria-pressed={tileEditorSelected === characterIndex} onClick={() => { selectUsedTile(characterIndex); }}><span>Tile {characterIndex} · {charsetSource === "existing" ? "Loaded" : "Calculated"}</span><strong>{count} cells</strong></button>)}
             </div>
           </>
         ) : sourcePreviewContent === "unified-editor" ? (
           unifiedEditorPreview
         ) : sourcePreviewContent === "pre-attribute" || sourcePreviewContent === "screen-1" || sourcePreviewContent === "screen-2" || sourcePreviewContent === "merged-low" || sourcePreviewContent === "merged-high" ? (
           windowImageFor(sourcePreviewContent)
         ) : sourcePreviewContent === "difference" ? (
           differencePreviewDataUrl === null ? <p>Convert an image to inspect the difference heatmap.</p> : <img className="preview-difference-image" src={differencePreviewDataUrl} alt="Difference heatmap between adjusted source and output" />
         ) : inspection === null ? <p>Point at the converted preview, or focus it and use arrow keys, to inspect a cell.</p> : (
           <dl className="attribute-readout">
             <div><dt>Pixel</dt><dd>{inspection.pixelX}, {inspection.pixelY}</dd></div>
             <div><dt>Cell</dt><dd>{inspection.cellX}, {inspection.cellY}</dd></div>
             <div><dt>Attribute</dt><dd>{inspection.attributeHex} · offset {inspection.attributeOffset}</dd></div>
             <div><dt>INK / PAPER</dt><dd>{inspection.ink} / {inspection.paper}</dd></div>
             <div><dt>BRIGHT</dt><dd>{inspection.bright ? "On" : "Off"}</dd></div>
           </dl>
         )}
       </div>
     )}
     {isPmd && targetModeId === "pmd85-2-tv" ? (
       <p className="pmd-tv-note">
         Blink animation is unsupported. Bit 7 is accepted and displayed as static intensity: 10 Bright, 11 Dim.
       </p>
     ) : null}
     {workbenchSourceFloating ? (
       <div
         className="workbench-floating-resize-handle"
         role="button"
         tabIndex={0}
         aria-label="Resize Source preview window"
         onPointerDown={(event) => startWorkbenchFloatingResize("source", event)}
         onKeyDown={(event) => {
           const step = event.shiftKey ? 32 : 8;
           if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("source", step, 0);
           if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("source", -step, 0);
           if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("source", 0, step);
           if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("source", 0, -step);
         }}
       />
     ) : null}
   </section>
   );
   return sourceDock !== "center" && sourceDockTarget !== null
     ? createPortal(sourcePreviewPane, sourceDockTarget, "source-preview")
     : sourcePreviewPane;
   })()}</>
  );
}
