import type { AppState } from "../app-state.js";
import { type QlMixedDisplayResolution } from "../../ql-mixed-preview.js";

export function ToolsSettingsWindow({ s }: { s: AppState }) {
  const {
    adjustWorkbenchFloatingSize,
    bitmapEditorActiveSide,
    bitmapEditorFlashPreviewMode,
    bringWorkbenchWindowToFront,
    charsetState,
    displayedAttributeHeight,
    flashPreviewAvailable,
    handleWorkbenchTitlebarClick,
    handleWorkbenchTitlebarKeyDown,
    hideAttributes,
    highlightSelectedTileUses,
    isPmd,
    isQl,
    isZx,
    previewZoom,
    qlMixedDisplayResolution,
    scaleQlToDisplayAspect,
    setBitmapEditorFlashPreviewMode,
    setBitmapEditorToolsHost,
    setHideAttributes,
    setHighlightSelectedTileUses,
    setQlMixedDisplayResolution,
    setResultPreviewZoom,
    setScaleQlToDisplayAspect,
    setShowAttributeGrid,
    setShowPixelGrid,
    setSourcePreviewZoom,
    setSynchronizePan,
    setSynchronizeZoom,
    setWorkbenchToolsFloatingX,
    setWorkbenchToolsFloatingY,
    setWorkbenchWindowOpen,
    setZoom,
    showAttributeGrid,
    showPixelGrid,
    startWorkbenchFloatingResize,
    startWorkbenchSectionDrag,
    startWorkbenchTitlebarDrag,
    stepZoom,
    synchronizePan,
    synchronizeZoom,
    targetModeId,
    workbenchDockSplitHandle,
    workbenchDockWindowStyle,
    workbenchPortal,
    workbenchToolsFloating,
    workbenchWindowActions,
    workbenchWindowDragAttributes,
    workbenchWindowLayout,
    workbenchWindowZIndex,
    workspaceMode,
  } = s;
  return (
    <>{workbenchPortal("tools", (
   <details
     className={`workbench-settings-section workbench-window${workbenchToolsFloating ? " workbench-section-floating workbench-tools-floating" : ""}`}
     {...workbenchWindowDragAttributes("tools")}
     data-workbench-window="tools"
     hidden={!workbenchWindowLayout("tools").visible}
     data-dock={workbenchWindowLayout("tools").dock}
     data-minimized={workbenchWindowLayout("tools").minimized ? "true" : "false"}
     open={workbenchWindowLayout("tools").open && !workbenchWindowLayout("tools").minimized}
     style={workbenchDockWindowStyle("tools", workbenchToolsFloating ? { zIndex: workbenchWindowZIndex("tools") } : undefined)}
     onPointerDown={(event) => {
       if (workbenchToolsFloating) {
         event.stopPropagation();
         bringWorkbenchWindowToFront("tools");
       }
     }}
     onFocusCapture={() => {
       if (workbenchToolsFloating) bringWorkbenchWindowToFront("tools");
     }}
     onToggle={(event) => setWorkbenchWindowOpen("tools", event.currentTarget.open)}
   >
     <summary
       aria-label="Tools"
       onPointerDown={(event) => startWorkbenchTitlebarDrag("tools", event)}
       onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("tools", event)}
       onClick={(event) => handleWorkbenchTitlebarClick("tools", event)}
     >
       <span>Tools</span>
       {workbenchWindowActions("tools")}
       {workbenchToolsFloating ? (
         <span
           className="workbench-window-drag-handle"
           role="button"
           tabIndex={0}
           aria-label="Move Tools window"
           title="Drag to move Tools"
           onPointerDown={(event) => startWorkbenchSectionDrag("tools", event)}
           onClick={(event) => {
             event.preventDefault();
             event.stopPropagation();
           }}
           onKeyDown={(event) => {
             const step = event.shiftKey ? 32 : 8;
             if (event.key === "ArrowLeft") setWorkbenchToolsFloatingX((x) => Math.max(8, x - step));
             if (event.key === "ArrowRight") setWorkbenchToolsFloatingX((x) => x + step);
             if (event.key === "ArrowUp") setWorkbenchToolsFloatingY((y) => Math.max(8, y - step));
             if (event.key === "ArrowDown") setWorkbenchToolsFloatingY((y) => y + step);
           }}
         >⠿</span>
       ) : null}
     </summary>
     {workbenchDockSplitHandle("tools")}
     {workbenchToolsFloating ? (
       <div
         className="workbench-floating-resize-handle"
         role="button"
         tabIndex={0}
         aria-label="Resize Tools window"
         onPointerDown={(event) => startWorkbenchFloatingResize("tools", event)}
         onKeyDown={(event) => {
           const step = event.shiftKey ? 32 : 8;
           if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("tools", step, 0);
           if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("tools", -step, 0);
           if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("tools", 0, step);
           if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("tools", 0, -step);
         }}
       />
     ) : null}
     <div className="workbench-window-content workbench-tools-content">
     {bitmapEditorActiveSide !== null ? <section className="bitmap-editor-tools-section" aria-label="Bitmap editor commands">
       <div className="bitmap-editor-tools-section-heading">Bitmap editor</div>
       <div className="bitmap-editor-tools-host" ref={setBitmapEditorToolsHost} />
     </section> : null}
     <div className={`control-row tools-control-row tools-primary-row control-row-${isZx ? 4 + (workspaceMode === "tilemap" ? 1 : 0) : isPmd ? 3 : 2}`}>
       <div className="tools-zoom-controls" aria-label="Preview zoom">
         <span>Zoom</span>
         <div className="pan-pad tools-zoom-pad">
           <button type="button" aria-label="Zoom out preview" title="Zoom out" onClick={() => stepZoom(-1)} disabled={previewZoom === "fit"}>−</button>
           <button type="button" aria-label="Zoom in preview" title="Zoom in" onClick={() => stepZoom(1)} disabled={previewZoom === 16}>+</button>
           <button type="button" aria-label="Fit preview" title="Fit" onClick={() => setZoom("fit")}>%</button>
         </div>
       </div>
       <label className="check-control tools-option-pixel">
         <input type="checkbox" checked={showPixelGrid} onChange={(event) => setShowPixelGrid(event.target.checked)} />
         <span>Pixel grid</span>
       </label>
       {(isZx || isPmd) ? <label className="check-control tools-option-cell">
         <input type="checkbox" checked={showAttributeGrid} onChange={(event) => setShowAttributeGrid(event.target.checked)} />
         <span>Cell grid {isPmd ? `6×${targetModeId === "pmd85-colorace" ? 2 : 1}` : `8×${displayedAttributeHeight}`}</span>
       </label> : null}
       {isZx ? <label className="check-control tools-option-hide">
         <input
           type="checkbox"
           checked={hideAttributes}
           onChange={(event) => setHideAttributes(event.target.checked)}
         />
         <span>Hide attributes</span>
       </label> : null}
       {workspaceMode === "tilemap" && charsetState.kind === "ready" ? <label className="check-control tools-option-highlight">
         <input type="checkbox" checked={highlightSelectedTileUses} onChange={(event) => setHighlightSelectedTileUses(event.target.checked)} />
         <span>Highlight selected tile uses</span>
       </label> : null}
     </div>
     {flashPreviewAvailable ? (
       <div className="tools-flash-preview" role="radiogroup" aria-label="FLASH preview">
         <span>FLASH preview</span>
         {(["animate", "normal", "inverted"] as const).map((mode) => (
           <label className="tools-flash-radio" key={mode}>
             <input
               type="radio"
               name="zx-flash-preview-mode"
               value={mode}
               disabled={mode !== "normal" && !flashPreviewAvailable}
               checked={bitmapEditorFlashPreviewMode === mode}
               onChange={() => setBitmapEditorFlashPreviewMode(mode)}
             />
             <span>
               {mode === "animate" ? "Animate" : mode === "normal" ? "Normal" : "Inverted"}
             </span>
           </label>
         ))}
         <small>Live result previews · 500 ms</small>
       </div>
     ) : null}
     <div className={`control-row tools-control-row tools-secondary-row control-row-${2 + (isQl && workspaceMode === "palette" ? 1 : 0) + (isQl && workspaceMode === "palette" && targetModeId === "mode8-mode4-mixed-512x256" ? 1 : 0)}`}>
       <label className="check-control tools-option-pan">
         <input type="checkbox" checked={synchronizePan} onChange={(event) => setSynchronizePan(event.target.checked)} />
         <span>Synchronize pan</span>
       </label>
       <label className="check-control tools-option-zoom" title="Keep source and result preview zoom levels aligned. Selecting an editor or inspection layout disables this option.">
         <input
           type="checkbox"
           checked={synchronizeZoom}
           onChange={(event) => {
             const enabled = event.target.checked;
             setSynchronizeZoom(enabled);
             if (enabled) {
               setSourcePreviewZoom(previewZoom);
               setResultPreviewZoom(previewZoom);
             }
           }}
         />
         <span>Synchronize zoom</span>
       </label>
       {isQl && workspaceMode === "palette" ? <label
         className="check-control"
         title="Display Mode 8 pixels at 4/3 × 1 and Mode 4 pixels at 4/3 × 2, producing the physical 4:3 monitor image. Disable for square-pixel inspection."
       >
         <input
           type="checkbox"
           checked={scaleQlToDisplayAspect}
           onChange={(event) => setScaleQlToDisplayAspect(event.target.checked)}
         />
         <span>4:3 display aspect</span>
       </label> : null}
       {isQl &&
         workspaceMode === "palette" &&
         targetModeId === "mode8-mode4-mixed-512x256" ? (
           <label title="Choose whether the Merged tab preserves both Mode 4 subpixels or averages each pair into one low-resolution perceived color.">
             <span>Mixed display</span>
             <select
               value={qlMixedDisplayResolution}
               onChange={(event) =>
                 setQlMixedDisplayResolution(
                   event.target.value as QlMixedDisplayResolution,
                 )}
             >
               <option value="high">High resolution</option>
               <option value="low">Low resolution</option>
             </select>
           </label>
         ) : null}
     </div>
     </div>
   </details>
   ))}</>
  );
}
