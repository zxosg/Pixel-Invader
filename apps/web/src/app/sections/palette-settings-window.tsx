import { useAppState } from "../app-state.js";
import { type AttributeHaloRadius, type AttributeHeight, paletteSelectionsMatch } from "@retro-converter/conversion-core";
import { RangeNumberControl } from "../../app-controls.js";

export function PaletteSettingsWindow() {
  const s = useAppState();
  const {
    adjustWorkbenchFloatingSize,
    attributeHaloHorizontal,
    attributeHaloInfluence,
    attributeHaloVertical,
    attributeHeight,
    attributeOptimizerId,
    attributeSmoothing,
    bringWorkbenchWindowToFront,
    changePmd85Calibration,
    dithering,
    effectivePaletteOptionsByScreen,
    flickerSuppressionEffective,
    flickerSuppressionPolicyMismatch,
    handleWorkbenchTitlebarClick,
    handleWorkbenchTitlebarKeyDown,
    image,
    isPmd,
    isQl,
    isZx,
    paletteSelections,
    paletteValid,
    pmd85GapPolicy,
    pmd85PaletteCalibrationId,
    screenFlickerSuppression,
    selectedModePalette,
    setAttributeHaloHorizontal,
    setAttributeHaloInfluence,
    setAttributeHaloVertical,
    setAttributeHeight,
    setAttributeSmoothing,
    setPaletteBrightMode,
    setPmd85GapPolicy,
    setScreenFlickerSuppression,
    setSliderValidity,
    setState,
    setVerticalSpatialSwapRows,
    setWorkbenchPaletteFloatingX,
    setWorkbenchPaletteFloatingY,
    setWorkbenchWindowOpen,
    setZxMixedAttributesOnly,
    settingsSection,
    startWorkbenchFloatingResize,
    startWorkbenchSectionDrag,
    startWorkbenchTitlebarDrag,
    targetModeId,
    togglePaletteColor,
    verticalSpatialSwapRows,
    workbenchDockSplitHandle,
    workbenchDockWindowStyle,
    workbenchPaletteFloating,
    workbenchPaletteFloatingAutoHeight,
    workbenchPortal,
    workbenchWindowActions,
    workbenchWindowDragAttributes,
    workbenchWindowLayout,
    workbenchWindowZIndex,
    zxMixedAttributesOnly,
  } = s;
  return (
    <>{workbenchPortal("palette", (
   <details
     className={`workbench-settings-section workbench-window${workbenchPaletteFloating ? ` workbench-section-floating workbench-palette-floating${workbenchPaletteFloatingAutoHeight ? " workbench-floating-auto-height" : ""}` : ""}`}
     {...workbenchWindowDragAttributes("palette")}
     data-workbench-window="palette"
     hidden={!workbenchWindowLayout("palette").visible}
     data-dock={workbenchWindowLayout("palette").dock}
     data-minimized={workbenchWindowLayout("palette").minimized ? "true" : "false"}
     open={workbenchWindowLayout("palette").open && !workbenchWindowLayout("palette").minimized}
     style={workbenchDockWindowStyle("palette", workbenchPaletteFloating ? { zIndex: workbenchWindowZIndex("palette") } : undefined)}
     onPointerDown={(event) => {
       if (workbenchPaletteFloating) {
         event.stopPropagation();
         bringWorkbenchWindowToFront("palette");
       }
     }}
     onFocusCapture={() => {
       if (workbenchPaletteFloating) bringWorkbenchWindowToFront("palette");
     }}
     onToggle={(event) => setWorkbenchWindowOpen("palette", event.currentTarget.open)}
   >
     <summary
       onPointerDown={(event) => startWorkbenchTitlebarDrag("palette", event)}
       onKeyDown={(event) => handleWorkbenchTitlebarKeyDown("palette", event)}
     onClick={(event) => handleWorkbenchTitlebarClick("palette", event)}
     >
       <span>{isQl ? "QL palette" : isPmd ? "PMD 85 palette" : "ZX palette and attributes"}</span>
       {workbenchWindowActions("palette")}
       {workbenchPaletteFloating ? (
         <span
           className="workbench-window-drag-handle"
           role="button"
           tabIndex={0}
           aria-label="Move Palette window"
           title="Drag to move Palette"
           onPointerDown={(event) => startWorkbenchSectionDrag("palette", event)}
           onClick={(event) => {
             event.preventDefault();
             event.stopPropagation();
           }}
           onKeyDown={(event) => {
             const step = event.shiftKey ? 32 : 8;
             if (event.key === "ArrowLeft") setWorkbenchPaletteFloatingX((x) => Math.max(8, x - step));
             if (event.key === "ArrowRight") setWorkbenchPaletteFloatingX((x) => x + step);
             if (event.key === "ArrowUp") setWorkbenchPaletteFloatingY((y) => Math.max(8, y - step));
             if (event.key === "ArrowDown") setWorkbenchPaletteFloatingY((y) => y + step);
           }}
         >⠿</span>
       ) : null}
     </summary>
     {workbenchDockSplitHandle("palette")}
     {workbenchPaletteFloating ? (
       <div
         className="workbench-floating-resize-handle"
         role="button"
         tabIndex={0}
         aria-label="Resize Palette window"
         onPointerDown={(event) => startWorkbenchFloatingResize("palette", event)}
         onKeyDown={(event) => {
           const step = event.shiftKey ? 32 : 8;
           if (event.key === "ArrowRight") adjustWorkbenchFloatingSize("palette", step, 0);
           if (event.key === "ArrowLeft") adjustWorkbenchFloatingSize("palette", -step, 0);
           if (event.key === "ArrowDown") adjustWorkbenchFloatingSize("palette", 0, step);
           if (event.key === "ArrowUp") adjustWorkbenchFloatingSize("palette", 0, -step);
         }}
       />
     ) : null}
   <fieldset id="settings-palette" className={`control-group palette-group${settingsSection === "palette" ? " settings-focused" : ""}`}>
     <legend className="visually-hidden">{isQl ? "QL palette" : isPmd ? "PMD 85 palette" : "ZX palette and attributes"}</legend>
     <div className="palette-attributes-grid">
     <section className="palette-subcard" aria-labelledby="palette-subcard-title">
       <h3 id="palette-subcard-title">Palette</h3>
       <p className="subcard-help">Select the colors available to each output screen.</p>
       <div className="palette-screen-grid">
         {paletteSelections.map((selection) => (
           <section
             className="palette-screen"
             data-color-count={(effectivePaletteOptionsByScreen[selection.screenIndex] ??
               effectivePaletteOptionsByScreen[0] ?? []).length}
             key={selection.screenIndex}
           >
             <div className="palette-screen-heading">
               <strong>Screen {selection.screenIndex + 1}</strong>
               <span>{selection.enabledColorIds.length} selected</span>
             </div>
             {isZx ? (
               <fieldset className="bright-control">
                 <legend>BRIGHT</legend>
                 <div className="segmented-control compact-segmented" role="radiogroup" aria-label={`Screen ${selection.screenIndex + 1} BRIGHT policy`}>
                   {(["auto", "on", "off"] as const).map((mode) => (
                     <label className="segmented-option" key={mode}>
                       <input
                         type="radio"
                         name={`screen-${selection.screenIndex}-bright`}
                         value={mode}
                         checked={(selection.brightMode ?? "auto") === mode}
                         onChange={() => setPaletteBrightMode(selection.screenIndex, mode)}
                       />
                       <span>{mode === "auto" ? "Auto" : mode === "on" ? "On" : "Off"}</span>
                     </label>
                   ))}
                 </div>
               </fieldset>
             ) : null}
             <div
               className="palette-options"
               role="group"
               aria-label={`Screen ${selection.screenIndex + 1} available colors`}
             >
               {(effectivePaletteOptionsByScreen[selection.screenIndex] ??
                 effectivePaletteOptionsByScreen[0] ??
                 []).map((option) => {
                   const selected = selection.enabledColorIds.includes(option.code);
                   return (
                     <button
                       className={`palette-option${selected ? " selected" : ""}`}
                       type="button"
                       key={option.code}
                       aria-label={`${selected ? "Remove" : "Add"} ${option.name} (${option.code}) from Screen ${selection.screenIndex + 1}`}
                       aria-pressed={selected}
                       title={`${option.name} (${option.code})`}
                       onClick={() => togglePaletteColor(selection.screenIndex, option.code)}
                     >
                       <span
                         className="palette-swatch"
                         style={{
                           background: isZx && selection.brightMode === "auto"
                             ? `linear-gradient(90deg, ${option.normal} 0 50%, ${option.bright} 50% 100%)`
                             : isZx && selection.brightMode === "on"
                               ? option.bright
                               : option.normal,
                         }}
                         aria-hidden="true"
                       />
                     </button>
                   );
                 })}
             </div>
           </section>
         ))}
       </div>
       {paletteValid ? null : (
         <span className="field-error" id="palette-error">
           Select at least one color for every screen.
         </span>
       )}
     </section>
     <section className={`attributes-subcard${isPmd ? " pmd-attributes-subcard" : ""}`} aria-labelledby="attributes-subcard-title">
       <h3 id="attributes-subcard-title">Attributes</h3>
     {targetModeId.includes("vertical-spatial") ? (
       <label className="check-control" title="Allow the optimizer to exchange the upper and lower physical rows in each mixed cell.">
         <input
           type="checkbox"
           checked={verticalSpatialSwapRows}
           onChange={(event) => {
             setVerticalSpatialSwapRows(event.target.checked);
             setState({ kind: "idle" });
           }}
         />
         <span>Swap physical row order</span>
       </label>
     ) : null}
   {isZx ? (
   <>
   <fieldset className="attribute-size-control">
     <legend>Size</legend>
     <div className="segmented-control attribute-size-options" role="radiogroup" aria-label="Attribute size">
       {([8, 4, 2, 1] as const).map((height) => (
         <label className="segmented-option" key={height}>
           <input
             type="radio"
             name="attribute-size"
             value={height}
             checked={attributeHeight === height}
             onChange={() => {
               setAttributeHeight(height as AttributeHeight);
               if (height < 4) setAttributeHaloVertical(0);
               setState({ kind: "idle" });
             }}
           />
           <span>8×{height}</span>
         </label>
       ))}
     </div>
   </fieldset>
   <RangeNumberControl
     id="attribute-smoothing"
     label={attributeOptimizerId === "zx-guide-reference-halo-v2" ||
         attributeOptimizerId === "zx-guide-reference-rgb-halo-v3"
       ? "Halo influence"
       : "Attribute smoothing"}
     value={attributeOptimizerId === "zx-guide-reference-halo-v2" ||
         attributeOptimizerId === "zx-guide-reference-rgb-halo-v3"
       ? attributeHaloInfluence
       : attributeSmoothing}
     min={0}
     max={attributeOptimizerId === "zx-guide-reference-halo-v2" ||
         attributeOptimizerId === "zx-guide-reference-rgb-halo-v3"
       ? 400
       : 100}
     unit="%"
     disabled={dithering === "none"}
     onChange={(value) => {
       if (
         attributeOptimizerId === "zx-guide-reference-halo-v2" ||
         attributeOptimizerId === "zx-guide-reference-rgb-halo-v3"
       ) {
         setAttributeHaloInfluence(value);
       } else {
         setAttributeSmoothing(value);
       }
       setState({ kind: "idle" });
     }}
     onValidityChange={setSliderValidity}
   />
   <span className="control-help">
     Edge-aware pair selection for Ordered and Error diffusion.
   </span>
   <fieldset className="halo-controls">
     <legend>Attribute halo</legend>
     <fieldset className="halo-control">
       <legend>Horizontal</legend>
       <div className="segmented-control halo-options" role="radiogroup" aria-label="Horizontal halo">
         {([0, 1, 2] as const).map((radius) => (
           <label className="segmented-option" key={radius}>
             <input
               type="radio"
               name="horizontal-halo"
               value={radius}
               aria-label={`${radius} pixel${radius === 1 ? "" : "s"}`}
               checked={attributeHaloHorizontal === radius}
               disabled={dithering === "none"}
               onChange={() => {
                 setAttributeHaloHorizontal(radius as AttributeHaloRadius);
                 setState({ kind: "idle" });
               }}
             />
             <span>{radius}</span>
           </label>
         ))}
       </div>
     </fieldset>
     <fieldset className="halo-control">
       <legend>Vertical</legend>
       <div className="segmented-control halo-options" role="radiogroup" aria-label="Vertical halo">
         {([0, 1, 2] as const).map((radius) => (
           <label className="segmented-option" key={radius}>
             <input
               type="radio"
               name="vertical-halo"
               value={radius}
               aria-label={`${radius} pixel${radius === 1 ? "" : "s"}`}
               checked={(attributeHeight >= 4 ? attributeHaloVertical : 0) === radius}
               disabled={dithering === "none" || attributeHeight < 4}
               onChange={() => {
                 setAttributeHaloVertical(radius as AttributeHaloRadius);
                 setState({ kind: "idle" });
               }}
             />
             <span>{radius}</span>
           </label>
         ))}
       </div>
     </fieldset>
   </fieldset>
   </>
   ) : isPmd ? (
     <>
       <span className="control-help">
         Black is fixed. Each {targetModeId === "pmd85-colorace" ? "6×2" : "6×1"} hardware cell selects black plus one enabled foreground.
       </span>
       {image?.format === "pmd85-bin" ? (
         <label className="check-control">
           <input
             type="checkbox"
             checked={pmd85GapPolicy === "zero"}
             onChange={(event) => {
               setPmd85GapPolicy(event.target.checked ? "zero" : "preserve-imported");
               setState({ kind: "idle" });
             }}
           />
           <span>Sanitize gaps (zero-fill on reconversion)</span>
         </label>
       ) : null}
     </>
   ) : null}
   {targetModeId === "zx48-mixed-256x192" ||
   targetModeId === "mode8-256x256" ||
   targetModeId === "mode4-512x256" ||
   targetModeId === "mode8-mode4-mixed-512x256" ? (
     <label>
       <span>Screen flicker suppression</span>
       <span>
         <input
           type="checkbox"
           checked={flickerSuppressionEffective === true}
           disabled={paletteSelections.length !== 2 ||
             (
               targetModeId !== "mode8-mode4-mixed-512x256" &&
               !paletteSelectionsMatch(paletteSelections[0]!, paletteSelections[1]!)
             )}
           onChange={(event) => {
             setScreenFlickerSuppression(event.target.checked);
             setState({ kind: "idle" });
           }}
         />
         <span className="control-help">
           {flickerSuppressionPolicyMismatch
             ? `${screenFlickerSuppression ? "Requested suppression is inactive. " : ""}Different screen palette/BRIGHT policies affect the 50/50 Merged preview and prevent flicker suppression.`
             : targetModeId === "mode8-mode4-mixed-512x256"
             ? "Adapt the left/right Mode 4 pair order across stable regions."
             : paletteSelections.length === 2 &&
             paletteSelectionsMatch(paletteSelections[0]!, paletteSelections[1]!)
             ? isQl
               ? "Swap temporal endpoints at pixel level."
               : "Swap temporal endpoints only between complete attribute cells."
             : "Available only when both screen palettes and BRIGHT policies match."}
         </span>
       </span>
     </label>
   ) : null}
   {isZx && targetModeId === "zx48-mixed-256x192" ? (
     <label>
       <span>Mix attributes only</span>
       <span>
         <input
           type="checkbox"
           checked={zxMixedAttributesOnly}
           onChange={(event) => {
             setZxMixedAttributesOnly(event.target.checked);
             setState({ kind: "idle" });
           }}
         />
         <span className="control-help">
           Shares bitmap pixels while optimizing INK, PAPER, and BRIGHT attributes independently. Merged shows their 50/50 RGB average, which may include colors neither screen displays alone.
         </span>
       </span>
     </label>
   ) : null}
   {isPmd ? (
     <label className="pmd-palette-calibration">
       <span>Palette calibration</span>
       <select
         value={pmd85PaletteCalibrationId}
         onChange={(event) => void changePmd85Calibration(event.target.value)}
       >
         {selectedModePalette?.base_calibration_id === undefined ? null : (
           <option value={selectedModePalette.base_calibration_id}>
             {selectedModePalette.base_calibration_id === "pure-rgb"
               ? "Pure RGB"
               : selectedModePalette.base_calibration_id === "neutral-white"
                 ? "Neutral white/silver"
                 : "Emulator-soft"}
           </option>
         )}
         {selectedModePalette?.calibrations?.map((calibration) => (
           <option key={calibration.id} value={calibration.id}>{calibration.name}</option>
         ))}
       </select>
     </label>
   ) : null}
     </section>
     </div>
   </fieldset>
   </details>
   ))}</>
  );
}
