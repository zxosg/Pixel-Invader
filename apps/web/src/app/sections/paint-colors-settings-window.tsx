import type { AppState } from "../app-state.js";
import { nativePaletteForResult } from "../../result-bitmap-editor.js";
import { ZX_BASE_COLORS } from "../../inspection.js";

export function PaintColorsSettingsWindow({ s }: { s: AppState }) {
  const {
    adjustWorkbenchFloatingSize,
    bitmapEditorActiveSide,
    bitmapEditorBrightPolicy,
    bitmapEditorColorPickerActive,
    bitmapEditorFlashPolicy,
    bitmapEditorInkColor,
    bitmapEditorPaperColor,
    bitmapEditorPickedCell,
    bitmapEditorResultFrameIndex,
    bitmapEditorResultPaletteIndex,
    bitmapEditorTarget,
    bringWorkbenchWindowToFront,
    displayedResult,
    handleWorkbenchTitlebarClick,
    handleWorkbenchTitlebarKeyDown,
    resultFrameInput,
    setBitmapEditorBrightPolicy,
    setBitmapEditorFlashPolicy,
    setBitmapEditorInkColor,
    setBitmapEditorPaperColor,
    setBitmapEditorResultPaletteIndex,
    setWorkbenchWindowOpen,
    startWorkbenchFloatingResize,
    startWorkbenchSectionDrag,
    startWorkbenchTitlebarDrag,
    toggleBitmapEditorColorPicker,
    updateWorkbenchWindowLayout,
    workbenchDockSplitHandle,
    workbenchDockWindowStyle,
    workbenchPaintColorsFloating,
    workbenchPortal,
    workbenchWindowActions,
    workbenchWindowDragAttributes,
    workbenchWindowLayout,
    workbenchWindowZIndex,
  } = s;
  return (
    <>{workbenchPortal("paint-colors", (() => {
     const paintLayout = workbenchWindowLayout("paint-colors");
     const paintOrientation = paintLayout.contentOrientation ?? "rows";
     const paintFrame = displayedResult?.frames[Math.min(bitmapEditorResultFrameIndex, Math.max(0, (displayedResult?.frames.length ?? 1) - 1))];
     const paintInput = displayedResult === null || paintFrame === undefined
       ? null
       : resultFrameInput(displayedResult, Math.min(bitmapEditorResultFrameIndex, displayedResult.frames.length - 1));
     const paintNativePalette = displayedResult?.platformId === "zx-spectrum" || paintInput === null
       ? []
       : nativePaletteForResult(paintInput);
     const pickedAttribute = bitmapEditorPickedCell?.attribute ?? 0;
     const selectedBright = bitmapEditorBrightPolicy ?? ((pickedAttribute & 0x40) !== 0);
     const paintColor = (index: number): string => {
       if (displayedResult?.platformId === "zx-spectrum") {
         const color = ZX_BASE_COLORS[index];
         return color?.[selectedBright ? "bright" : "normal"] ?? "#000000";
       }
       const color = paintNativePalette.find((candidate) => candidate.index === index);
       return color === undefined ? "#000000" : `rgb(${color.r} ${color.g} ${color.b})`;
     };
     const policyButton = (label: string, value: boolean | null, selected: boolean | null, update: (next: boolean | null) => void) => (
       <button className={`paint-colors-policy${selected === value ? " selected" : ""}${value === null ? " transparent" : ""}`} type="button" aria-label={`${label}: ${value === null ? "keep current" : value ? "set" : "reset"}`} title={`${label}: ${value === null ? "keep current" : value ? "set" : "reset"}`} aria-pressed={selected === value} onClick={() => update(value)}>
         {value === null ? <span className="bitmap-editor-transparent-swatch" aria-hidden="true" /> : value ? "●" : "○"}
       </button>
     );
     return (
       <details
         className={`workbench-settings-section workbench-window paint-colors-window${workbenchPaintColorsFloating ? " workbench-section-floating" : ""}`}
         {...workbenchWindowDragAttributes("paint-colors")}
         data-workbench-window="paint-colors"
         data-dock={paintLayout.dock}
         data-minimized={paintLayout.minimized ? "true" : "false"}
         data-orientation={paintOrientation}
         hidden={!paintLayout.visible || bitmapEditorActiveSide === null}
         open={paintLayout.open && !paintLayout.minimized}
         style={workbenchDockWindowStyle("paint-colors", workbenchPaintColorsFloating ? {
           position: "absolute",
           top: paintLayout.y,
           left: paintLayout.x,
           width: paintLayout.width,
           height: paintLayout.height,
           zIndex: workbenchWindowZIndex("paint-colors"),
         } : undefined)}
         onPointerDown={(event) => { if (workbenchPaintColorsFloating) { event.stopPropagation(); bringWorkbenchWindowToFront("paint-colors"); } }}
         onFocusCapture={() => { if (workbenchPaintColorsFloating) bringWorkbenchWindowToFront("paint-colors"); }}
         onToggle={(event) => setWorkbenchWindowOpen("paint-colors", event.currentTarget.open)}
       >
         <summary onPointerDown={(event) => startWorkbenchTitlebarDrag("paint-colors", event)} onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("paint-colors", event)} onClick={(event) => handleWorkbenchTitlebarClick("paint-colors", event)}>
           <span>Paint colors</span>
           {displayedResult?.platformId === "zx-spectrum" ? (
             <button
               className="paint-colors-orientation-control"
               type="button"
               role="switch"
               aria-label="Paint colors orientation"
               aria-checked={paintOrientation === "columns"}
               title={`Color layout: ${paintOrientation === "columns" ? "Vertical" : "Horizontal"}`}
               onPointerDown={(event) => event.stopPropagation()}
               onClick={(event) => {
                 event.preventDefault();
                 event.stopPropagation();
                 updateWorkbenchWindowLayout("paint-colors", (layout) => ({
                   ...layout,
                   contentOrientation: layout.contentOrientation === "columns" ? "rows" : "columns",
                 }));
               }}
             >
               <span className="paint-colors-orientation-switch" aria-hidden="true">
                 <span className="paint-colors-orientation-knob" aria-hidden="true" />
               </span>
               <span className="paint-colors-orientation-label">{paintOrientation === "columns" ? "Vertical" : "Horizontal"}</span>
             </button>
           ) : null}
           {workbenchWindowActions("paint-colors")}
           {workbenchPaintColorsFloating ? <span className="workbench-window-drag-handle" role="button" tabIndex={0} aria-label="Move Paint colors window" title="Drag to move Paint colors" onPointerDown={(event) => startWorkbenchSectionDrag("paint-colors", event)} onClick={(event) => { event.preventDefault(); event.stopPropagation(); }} onKeyDown={(event) => {
             const step = event.shiftKey ? 32 : 8;
             if (event.key.startsWith("Arrow")) event.preventDefault();
             updateWorkbenchWindowLayout("paint-colors", (layout) => ({ ...layout, x: Math.max(8, layout.x + (event.key === "ArrowRight" ? step : event.key === "ArrowLeft" ? -step : 0)), y: Math.max(8, layout.y + (event.key === "ArrowDown" ? step : event.key === "ArrowUp" ? -step : 0)) }));
           }}>⠿</span> : null}
         </summary>
         {workbenchDockSplitHandle("paint-colors")}
         {workbenchPaintColorsFloating ? <div className="workbench-floating-resize-handle" role="button" tabIndex={0} aria-label="Resize Paint colors window" onPointerDown={(event) => startWorkbenchFloatingResize("paint-colors", event)} onKeyDown={(event) => {
           const step = event.shiftKey ? 32 : 8;
           if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("paint-colors", step, 0);
           if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("paint-colors", -step, 0);
           if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("paint-colors", 0, step);
           if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("paint-colors", 0, -step);
         }} /> : null}
         <div className={`paint-colors-content paint-colors-content-${paintOrientation}`}>
           {displayedResult?.platformId === "zx-spectrum" ? <>
             {(["ink", "paper"] as const).map((kind) => {
               const active = kind === "ink" ? bitmapEditorInkColor : bitmapEditorPaperColor;
               const update = kind === "ink" ? setBitmapEditorInkColor : setBitmapEditorPaperColor;
               return <div className="paint-colors-role-row" data-color-role={kind} key={kind}>
                 <strong aria-hidden="true">{kind === "ink" ? "I" : "P"}</strong>
                 <div className="paint-colors-swatches" role="group" aria-label={`${kind.toUpperCase()} paint color`}>
                   <button className={`bitmap-editor-attribute-icon${active === null ? " selected" : ""}`} type="button" title={`Keep current ${kind.toUpperCase()}`} aria-label={`Keep current ${kind.toUpperCase()}`} aria-pressed={active === null} onClick={() => update(null)}><span className="bitmap-editor-transparent-swatch" aria-hidden="true" /></button>
                   {ZX_BASE_COLORS.map((color) => <button className={`bitmap-editor-attribute-color${active === color.code ? " selected" : ""}`} type="button" key={color.code} title={`Set ${kind.toUpperCase()} to ${color.name}`} aria-label={`Set ${kind.toUpperCase()} to ${color.name}`} aria-pressed={active === color.code} onClick={() => update(color.code)}><span style={{ background: paintColor(color.code) }} /></button>)}
                 </div>
                 <div className="paint-colors-flag" aria-label={kind === "ink" ? "BRIGHT" : "FLASH"}>
                   <strong aria-hidden="true">{kind === "ink" ? "☀" : "ϟ"}</strong>
                   {kind === "ink"
                     ? <>{policyButton("BRIGHT", null, bitmapEditorBrightPolicy, setBitmapEditorBrightPolicy)}{policyButton("BRIGHT", true, bitmapEditorBrightPolicy, setBitmapEditorBrightPolicy)}{policyButton("BRIGHT", false, bitmapEditorBrightPolicy, setBitmapEditorBrightPolicy)}</>
                     : <>{policyButton("FLASH", null, bitmapEditorFlashPolicy, setBitmapEditorFlashPolicy)}{policyButton("FLASH", true, bitmapEditorFlashPolicy, setBitmapEditorFlashPolicy)}{policyButton("FLASH", false, bitmapEditorFlashPolicy, setBitmapEditorFlashPolicy)}</>}
                 </div>
               </div>;
             })}
           </> : <div className="paint-colors-row" data-color-role="palette">
             <strong aria-hidden="true">C</strong>
             <div className="paint-colors-swatches" role="group" aria-label="Native paint colors">
               {paintNativePalette.map((color) => <button className={`bitmap-editor-attribute-color${bitmapEditorResultPaletteIndex === color.index ? " selected" : ""}`} type="button" key={color.index} title={`Use palette color ${color.index}`} aria-label={`Use palette color ${color.index}`} aria-pressed={bitmapEditorResultPaletteIndex === color.index} onClick={() => setBitmapEditorResultPaletteIndex(color.index)}><span style={{ background: `rgb(${color.r} ${color.g} ${color.b})` }} /></button>)}
             </div>
           </div>}
           <button className={`paint-colors-picker${bitmapEditorColorPickerActive ? " active" : ""}`} type="button" disabled={bitmapEditorTarget !== "result" || displayedResult?.platformId !== "zx-spectrum"} aria-label="Pick INK, PAPER, BRIGHT, and FLASH from the result" title="Pick attributes from the result" aria-pressed={bitmapEditorColorPickerActive} onClick={toggleBitmapEditorColorPicker}>⌖</button>
         </div>
       </details>
     );
   })())}</>
  );
}
