import { useAppState } from "../app-state.js";
import { levelAtLeast, type SettingLevel } from "../../settings-registry.js";
import { type CropAspectRatio, type FramingMode, type PanEdgeMode, type ResamplingMethod, type Rotation } from "@retro-converter/conversion-core";
import { RangeNumberControl } from "../../app-controls.js";
import { hexToRgb, rgbToHex } from "../../dithering-labels.js";

export function GeometryControls({ level = "expert" }: { readonly level?: SettingLevel }) {
  const s = useAppState();
  const {
    background,
    changeCropAspectRatio,
    cropAspectRatio,
    cropHeightEntry,
    cropSourceSize,
    cropValid,
    cropWidthEntry,
    cropXEntry,
    cropYEntry,
    ensurePixelCrop,
    fillGeometry,
    framing,
    image,
    mirrorHorizontal,
    mirrorVertical,
    panEdgeMode,
    panMaximumX,
    panMaximumY,
    panOffsetX,
    panOffsetY,
    resampling,
    rotation,
    setBackground,
    setFillOffsetX,
    setFillOffsetY,
    setFraming,
    setMirrorHorizontal,
    setMirrorVertical,
    setPanEdgeMode,
    setPanOffsetX,
    setPanOffsetY,
    setResampling,
    setRotation,
    setSliderValidity,
    setState,
    settingsSection,
    updateCropEntry,
  } = s;
  return (
   <fieldset id="settings-geometry" className={`control-group geometry-group${settingsSection === "geometry" ? " settings-focused" : ""}`}>
     <legend className="visually-hidden">Geometry</legend>
   <div className="geometry-row geometry-primary-row control-row control-row-3">
   <label>
     <span>Framing</span>
     <select aria-label="Framing" value={framing} onChange={(event) => {
       const next = event.target.value as FramingMode;
       if (next === "crop") ensurePixelCrop();
       setFraming(next);
       setState({ kind: "idle" });
     }}>
       <option value="fit">Fit</option>
       <option value="fill">Fill</option>
       <option value="crop">Crop</option>
       <option value="stretch">Stretch</option>
     </select>
   </label>
   {levelAtLeast(level, "advanced") ? (
   <>
   <label>
     <span>Resampling</span>
     <select value={resampling} onChange={(event) => { setResampling(event.target.value as ResamplingMethod); setState({ kind: "idle" }); }}>
       <option value="nearest">Nearest-neighbor</option>
       <option value="bilinear">Bilinear</option>
       <option value="lanczos">Lanczos-3</option>
     </select>
   </label>
   <label>
     <span>Rotation</span>
     <select value={rotation} onChange={(event) => {
       const next = Number(event.target.value) as Rotation;
       ensurePixelCrop(next);
       setFillOffsetX(null);
       setFillOffsetY(null);
       setRotation(next);
       setState({ kind: "idle" });
     }}>
       <option value={0}>0°</option>
       <option value={90}>90° clockwise</option>
       <option value={180}>180°</option>
       <option value={270}>270° clockwise</option>
     </select>
   </label>
   </>
   ) : null}
   </div>
   {framing === "fill" ? (
     <fieldset className="geometry-row framing-detail focal-control control-row control-row-2">
       <legend>Fill crop offset (source pixels)</legend>
       <RangeNumberControl
         id="fill-offset-x"
         label="Horizontal"
         value={fillGeometry?.resolvedOffsetX ?? 0}
         min={0}
         max={fillGeometry?.maximumOffsetX ?? 0}
         unit=" px"
         disabled={fillGeometry?.activeAxis !== "x"}
         onChange={(value) => {
           setFillOffsetX(value);
           setState({ kind: "idle" });
         }}
         onValidityChange={setSliderValidity}
       />
       <RangeNumberControl
         id="fill-offset-y"
         label="Vertical"
         value={fillGeometry?.resolvedOffsetY ?? 0}
         min={0}
         max={fillGeometry?.maximumOffsetY ?? 0}
         unit=" px"
         disabled={fillGeometry?.activeAxis !== "y"}
         onChange={(value) => {
           setFillOffsetY(value);
           setState({ kind: "idle" });
         }}
         onValidityChange={setSliderValidity}
       />
     </fieldset>
   ) : null}
   {framing === "fit" ? (
     <fieldset className="geometry-row framing-detail fit-position-control control-row control-row-2">
       <legend>Fit position adjustment (output pixels)</legend>
       <RangeNumberControl
         id="fit-position-x"
         label="Horizontal position"
         value={panOffsetX}
         min={-panMaximumX}
         max={panMaximumX}
         unit=" px"
         resetValue={0}
         onChange={(value) => {
           setPanOffsetX(value);
           setState({ kind: "idle" });
         }}
         onValidityChange={setSliderValidity}
       />
       <RangeNumberControl
         id="fit-position-y"
         label="Vertical position"
         value={panOffsetY}
         min={-panMaximumY}
         max={panMaximumY}
         unit=" px"
         resetValue={0}
         onChange={(value) => {
           setPanOffsetY(value);
           setState({ kind: "idle" });
         }}
         onValidityChange={setSliderValidity}
       />
       <span className="control-help fit-position-help">
         Positive values move the fitted image right or down; negative values move it left or up. Use the arrow pad below for one-pixel steps.
       </span>
     </fieldset>
   ) : null}
   {framing === "crop" ? (
     <fieldset className="geometry-row framing-detail crop-control control-row control-row-5" aria-describedby={cropValid ? "crop-help" : "crop-error"}>
       <legend>Crop rectangle (source pixels)</legend>
       <label className="crop-aspect-control">
         <span>Aspect ratio</span>
         <select
           aria-label="Crop aspect ratio"
           value={cropAspectRatio}
           onChange={(event) => changeCropAspectRatio(event.target.value as CropAspectRatio)}
           disabled={image === null}
         >
           <option value="none">No aspect ratio</option>
           <option value="source">Lock aspect ratio as source image</option>
           <option value="destination">Lock aspect ratio as destination image</option>
         </select>
       </label>
       <label>
         <span>X</span>
         <input aria-label="Crop X" className={cropValid ? undefined : "invalid"} type="number" min="0" max={Math.max(0, (cropSourceSize?.width ?? 1) - 1)} step="1" value={cropXEntry} aria-invalid={!cropValid} disabled={image === null} onChange={(event) => updateCropEntry("x", event.target.value)} />
       </label>
       <label>
         <span>Y</span>
         <input aria-label="Crop Y" className={cropValid ? undefined : "invalid"} type="number" min="0" max={Math.max(0, (cropSourceSize?.height ?? 1) - 1)} step="1" value={cropYEntry} aria-invalid={!cropValid} disabled={image === null} onChange={(event) => updateCropEntry("y", event.target.value)} />
       </label>
       <label>
         <span>Width</span>
         <input aria-label="Crop width" className={cropValid ? undefined : "invalid"} type="number" min="1" max={cropSourceSize?.width ?? 1} step="1" value={cropWidthEntry} aria-invalid={!cropValid} disabled={image === null} onChange={(event) => updateCropEntry("width", event.target.value)} />
       </label>
       <label>
         <span>Height</span>
         <input aria-label="Crop height" className={cropValid ? undefined : "invalid"} type="number" min="1" max={cropSourceSize?.height ?? 1} step="1" value={cropHeightEntry} aria-invalid={!cropValid} disabled={image === null} onChange={(event) => updateCropEntry("height", event.target.value)} />
       </label>
       <span className="control-help crop-help" id="crop-help">
         Drag on the Source image to select. Drag inside to move; use Arrow keys to move one pixel; double-click inside to clear. Coordinates refer to the oriented source.
       </span>
       <span className="crop-help-icon" title="Drag on the Source image to select. Drag inside to move; use Arrow keys to move one pixel; double-click inside to clear." aria-label="Crop selection help">ⓘ</span>
       {cropValid ? null : <span className="field-error" id="crop-error">Invalid value</span>}
     </fieldset>
   ) : null}
   {levelAtLeast(level, "advanced") ? (
   <div className="geometry-row orientation-actions control-row control-row-4">
     <fieldset className="orientation-control">
       <legend>Mirror</legend>
       <div className="mirror-actions">
         <button
           className="mirror-toggle"
           type="button"
           aria-label="Mirror horizontally"
           aria-pressed={mirrorHorizontal}
           title="Mirror horizontally (left to right)"
           onClick={() => { setMirrorHorizontal((current) => !current); setState({ kind: "idle" }); }}
         >
           <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
             <defs>
               <pattern id="mirror-horizontal-hatch" width="3" height="3" patternTransform="rotate(35)" patternUnits="userSpaceOnUse">
                 <path d="M0 0V3" stroke="currentColor" strokeWidth="1.2" />
               </pattern>
             </defs>
             <path className="mirror-icon-solid" d="M2 20 10.4 4v16Z" />
             <path className="mirror-icon-hatched" d="M13.6 4 22 20h-8.4Z" />
             <path className="mirror-icon-axis" d="M12 3v18" />
           </svg>
         </button>
         <button
           className="mirror-toggle mirror-toggle-vertical"
           type="button"
           aria-label="Mirror vertically"
           aria-pressed={mirrorVertical}
           title="Mirror vertically (top to bottom)"
           onClick={() => { setMirrorVertical((current) => !current); setState({ kind: "idle" }); }}
         >
           <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
             <defs>
               <pattern id="mirror-vertical-hatch" width="3" height="3" patternTransform="rotate(35)" patternUnits="userSpaceOnUse">
                 <path d="M0 0V3" stroke="currentColor" strokeWidth="1.2" />
               </pattern>
             </defs>
             <path className="mirror-icon-solid" d="M3 10.4 12 3l9 7.4Z" />
             <path className="mirror-icon-hatched" d="m3 13.6 9 7.4 9-7.4Z" />
             <path className="mirror-icon-axis" d="M2 12h20" />
           </svg>
         </button>
       </div>
     </fieldset>
     <fieldset className="pan-control">
       <legend>Position</legend>
       <div className="pan-pad" aria-label="Adjust image position by one output pixel">
         <button className="pan-up" type="button" aria-label="Move bitmap up one pixel" title="Move bitmap up one pixel" disabled={panOffsetY <= -panMaximumY} onClick={() => { setPanOffsetY((current) => Math.max(-panMaximumY, current - 1)); setState({ kind: "idle" }); }}>▲</button>
         <button className="pan-left" type="button" aria-label="Move bitmap left one pixel" title="Move bitmap left one pixel" disabled={panOffsetX <= -panMaximumX} onClick={() => { setPanOffsetX((current) => Math.max(-panMaximumX, current - 1)); setState({ kind: "idle" }); }}>◀</button>
         <button className="pan-center" type="button" aria-label="Center bitmap" title="Center bitmap" disabled={panOffsetX === 0 && panOffsetY === 0} onClick={() => { setPanOffsetX(0); setPanOffsetY(0); setState({ kind: "idle" }); }}>●</button>
         <button className="pan-right" type="button" aria-label="Move bitmap right one pixel" title="Move bitmap right one pixel" disabled={panOffsetX >= panMaximumX} onClick={() => { setPanOffsetX((current) => Math.min(panMaximumX, current + 1)); setState({ kind: "idle" }); }}>▶</button>
         <button className="pan-down" type="button" aria-label="Move bitmap down one pixel" title="Move bitmap down one pixel" disabled={panOffsetY >= panMaximumY} onClick={() => { setPanOffsetY((current) => Math.min(panMaximumY, current + 1)); setState({ kind: "idle" }); }}>▼</button>
       </div>
     </fieldset>
     <fieldset className="pan-edge-control edge-control">
       <legend>Edges</legend>
       <select aria-label="Pan edge handling" value={panEdgeMode} onChange={(event) => { setPanEdgeMode(event.target.value as PanEdgeMode); setState({ kind: "idle" }); }}>
         <option value="background">Background</option>
         <option value="clamp">Clamp</option>
         <option value="wrap">Wrap</option>
       </select>
     </fieldset>
     <fieldset className="background-control">
       <legend>Background</legend>
       <input className="background-picker" type="color" aria-label="Background color" title="Choose background color; the color dialog supports manual RGB entry" value={rgbToHex(background)} onChange={(event) => { setBackground(hexToRgb(event.target.value)); setState({ kind: "idle" }); }} />
     </fieldset>
   </div>
   ) : null}
   </fieldset>
  );
}

export function GeometrySettingsWindow() {
  const s = useAppState();
  const {
    adjustWorkbenchFloatingSize,
    bringWorkbenchWindowToFront,
    handleWorkbenchTitlebarClick,
    handleWorkbenchTitlebarKeyDown,
    setWorkbenchGeometryFloatingX,
    setWorkbenchGeometryFloatingY,
    setWorkbenchWindowOpen,
    startWorkbenchFloatingResize,
    startWorkbenchSectionDrag,
    startWorkbenchTitlebarDrag,
    workbenchDockSplitHandle,
    workbenchDockWindowStyle,
    workbenchGeometryFloating,
    workbenchGeometryFloatingAutoHeight,
    workbenchPortal,
    workbenchWindowActions,
    workbenchWindowDragAttributes,
    workbenchWindowLayout,
    workbenchWindowZIndex,
  } = s;
  if (s.uiLayout === "guided") return null;
  return (
    <>{workbenchPortal("geometry", (
   <details
     className={`workbench-settings-section workbench-window${workbenchGeometryFloating ? ` workbench-section-floating workbench-geometry-floating${workbenchGeometryFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : ""}`}
     {...workbenchWindowDragAttributes("geometry")}
     data-workbench-window="geometry"
     hidden={!workbenchWindowLayout("geometry").visible}
     data-dock={workbenchWindowLayout("geometry").dock}
     data-minimized={workbenchWindowLayout("geometry").minimized ? "true" : "false"}
     open={workbenchWindowLayout("geometry").open && !workbenchWindowLayout("geometry").minimized}
     style={workbenchDockWindowStyle("geometry", workbenchGeometryFloating ? { zIndex: workbenchWindowZIndex("geometry") } : undefined)}
     onPointerDown={(event) => {
       if (workbenchGeometryFloating) {
         event.stopPropagation();
         bringWorkbenchWindowToFront("geometry");
       }
     }}
     onFocusCapture={() => {
       if (workbenchGeometryFloating) bringWorkbenchWindowToFront("geometry");
     }}
     onToggle={(event) => setWorkbenchWindowOpen("geometry", event.currentTarget.open)}
   >
     <summary
       onPointerDown={(event) => {
         startWorkbenchTitlebarDrag("geometry", event);
       }}
       onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("geometry", event)}
       onClick={(event) => handleWorkbenchTitlebarClick("geometry", event)}
     >
       <span>Geometry</span>
       {workbenchWindowActions("geometry")}
       {workbenchGeometryFloating ? (
         <span
           className="workbench-window-drag-handle"
           role="button"
           tabIndex={0}
           aria-label="Move Geometry window"
           title="Drag to move Geometry"
           onPointerDown={(event) => startWorkbenchSectionDrag("geometry", event)}
           onClick={(event) => {
             event.preventDefault();
             event.stopPropagation();
           }}
           onKeyDown={(event) => {
             const step = event.shiftKey ? 32 : 8;
             if (event.key === "ArrowLeft") setWorkbenchGeometryFloatingX((x) => Math.max(8, x - step));
             if (event.key === "ArrowRight") setWorkbenchGeometryFloatingX((x) => x + step);
             if (event.key === "ArrowUp") setWorkbenchGeometryFloatingY((y) => Math.max(8, y - step));
             if (event.key === "ArrowDown") setWorkbenchGeometryFloatingY((y) => y + step);
           }}
         >⠿</span>
       ) : null}
     </summary>
     {workbenchDockSplitHandle("geometry")}
     {workbenchGeometryFloating ? (
       <div
         className="workbench-floating-resize-handle"
         role="button"
         tabIndex={0}
         aria-label="Resize Geometry window"
         onPointerDown={(event) => startWorkbenchFloatingResize("geometry", event)}
         onKeyDown={(event) => {
           const step = event.shiftKey ? 32 : 8;
           if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("geometry", step, 0);
           if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("geometry", -step, 0);
           if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("geometry", 0, step);
           if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("geometry", 0, -step);
         }}
       />
     ) : null}
   <GeometryControls level="expert" />
   </details>
   ))}</>
  );
}
