import type { AppState } from "../app-state.js";
import { RangeNumberControl } from "../../app-controls.js";

export function AdjustmentsSettingsWindow({ s }: { s: AppState }) {
  const {
    adjustWorkbenchFloatingSize,
    brightness,
    bringWorkbenchWindowToFront,
    colorize,
    contrast,
    gamma,
    handleWorkbenchTitlebarClick,
    handleWorkbenchTitlebarKeyDown,
    hslSaturation,
    hueShift,
    lightness,
    setBrightness,
    setColorize,
    setContrast,
    setGamma,
    setHslSaturation,
    setHueShift,
    setLightness,
    setSaturation,
    setSharpening,
    setSliderValidity,
    setSmoothing,
    setState,
    setWorkbenchAdjustmentsFloatingX,
    setWorkbenchAdjustmentsFloatingY,
    setWorkbenchWindowOpen,
    settingsSection,
    sharpening,
    smoothing,
    startWorkbenchFloatingResize,
    startWorkbenchSectionDrag,
    startWorkbenchTitlebarDrag,
    workbenchAdjustmentsFloating,
    workbenchAdjustmentsFloatingAutoHeight,
    workbenchDockSplitHandle,
    workbenchDockWindowStyle,
    workbenchPortal,
    workbenchWindowActions,
    workbenchWindowDragAttributes,
    workbenchWindowLayout,
    workbenchWindowZIndex,
  } = s;
  return (
    <>{workbenchPortal("adjustments", (
   <details
     className={`workbench-settings-section workbench-window${workbenchAdjustmentsFloating ? ` workbench-section-floating workbench-adjustments-floating${workbenchAdjustmentsFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : ""}`}
     {...workbenchWindowDragAttributes("adjustments")}
     data-workbench-window="adjustments"
     hidden={!workbenchWindowLayout("adjustments").visible}
     data-dock={workbenchWindowLayout("adjustments").dock}
     data-minimized={workbenchWindowLayout("adjustments").minimized ? "true" : "false"}
     open={workbenchWindowLayout("adjustments").open && !workbenchWindowLayout("adjustments").minimized}
     style={workbenchDockWindowStyle("adjustments", workbenchAdjustmentsFloating ? { zIndex: workbenchWindowZIndex("adjustments") } : undefined)}
     onPointerDown={(event) => {
       if (workbenchAdjustmentsFloating) {
         event.stopPropagation();
         bringWorkbenchWindowToFront("adjustments");
       }
     }}
     onFocusCapture={() => {
       if (workbenchAdjustmentsFloating) bringWorkbenchWindowToFront("adjustments");
     }}
     onToggle={(event) => setWorkbenchWindowOpen("adjustments", event.currentTarget.open)}
   >
     <summary
       onPointerDown={(event) => {
         startWorkbenchTitlebarDrag("adjustments", event);
       }}
       onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("adjustments", event)}
       onClick={(event) => handleWorkbenchTitlebarClick("adjustments", event)}
     >
       <span>Image adjustments</span>
       {workbenchWindowActions("adjustments")}
       {workbenchAdjustmentsFloating ? (
         <span
           className="workbench-window-drag-handle"
           role="button"
           tabIndex={0}
           aria-label="Move Image adjustments window"
           title="Drag to move Image adjustments"
           onPointerDown={(event) => startWorkbenchSectionDrag("adjustments", event)}
           onClick={(event) => {
             event.preventDefault();
             event.stopPropagation();
           }}
           onKeyDown={(event) => {
             const step = event.shiftKey ? 32 : 8;
             if (event.key === "ArrowLeft") setWorkbenchAdjustmentsFloatingX((x) => Math.max(8, x - step));
             if (event.key === "ArrowRight") setWorkbenchAdjustmentsFloatingX((x) => x + step);
             if (event.key === "ArrowUp") setWorkbenchAdjustmentsFloatingY((y) => Math.max(8, y - step));
             if (event.key === "ArrowDown") setWorkbenchAdjustmentsFloatingY((y) => y + step);
           }}
         >⠿</span>
       ) : null}
     </summary>
     {workbenchDockSplitHandle("adjustments")}
     {workbenchAdjustmentsFloating ? (
       <div
         className="workbench-floating-resize-handle"
         role="button"
         tabIndex={0}
         aria-label="Resize Image adjustments window"
         onPointerDown={(event) => startWorkbenchFloatingResize("adjustments", event)}
         onKeyDown={(event) => {
           const step = event.shiftKey ? 32 : 8;
           if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("adjustments", step, 0);
           if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("adjustments", -step, 0);
           if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("adjustments", 0, step);
           if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("adjustments", 0, -step);
         }}
       />
     ) : null}
   <fieldset id="settings-adjustments" className={`adjustment-control control-group${settingsSection === "adjustments" ? " settings-focused" : ""}`}>
     <legend className="visually-hidden">Image adjustments</legend>
     <div className="control-row control-row-2">
     <RangeNumberControl id="brightness" label="Brightness" value={brightness} min={-100} max={100} resetValue={0} onChange={(value) => { setBrightness(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
     <RangeNumberControl id="contrast" label="Contrast" value={contrast} min={-100} max={100} resetValue={0} onChange={(value) => { setContrast(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
     </div>
     <div className="control-row control-row-2">
     <RangeNumberControl id="gamma" label="Gamma" value={gamma} min={10} max={300} unit="%" resetValue={100} onChange={(value) => { setGamma(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
     </div>
     <div className="control-row control-row-2">
     <RangeNumberControl id="hue-shift" label="Hue" value={hueShift} min={-180} max={180} unit="°" resetValue={0} onChange={(value) => { setHueShift(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
     <RangeNumberControl id="hsl-saturation" label="Saturation" value={hslSaturation} min={-100} max={100} resetValue={0} onChange={(value) => { setHslSaturation(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
     </div>
     <div className="control-row control-row-2">
     <RangeNumberControl id="lightness" label="HSL Lightness" value={lightness} min={-100} max={100} resetValue={0} onChange={(value) => { setLightness(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
     <label className="check-control"><input id="colorize" type="checkbox" checked={colorize} onChange={(event) => { setColorize(event.target.checked); setState({ kind: "idle" }); }} /><span>Colorize</span></label>
     </div>
     <div className="control-row control-row-2">
     <RangeNumberControl id="smoothing" label="Smoothing" value={smoothing} min={0} max={100} unit="%" resetValue={0} onChange={(value) => { setSmoothing(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
     <RangeNumberControl id="sharpening" label="Sharpening" value={sharpening} min={0} max={100} unit="%" resetValue={0} onChange={(value) => { setSharpening(value); setState({ kind: "idle" }); }} onValidityChange={setSliderValidity} />
     </div>
     <div className="control-row control-row-2">
     </div>
     <button className="secondary compact" type="button" onClick={() => {
       setBrightness(0);
       setContrast(0);
       setSaturation(0);
       setHueShift(0);
       setHslSaturation(0);
       setLightness(0);
       setColorize(false);
       setGamma(100);
       setSmoothing(0);
       setSharpening(0);
       setState({ kind: "idle" });
     }}>Reset adjustments</button>
   </fieldset>
   </details>
   ))}</>
  );
}
