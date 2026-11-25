import { useAppState } from "../app-state.js";
import { type ConversionSettings, defineCustomDiffusionKernel, defineCustomOrderedMatrix } from "@retro-converter/conversion-core";
import { BUILT_IN_COMPOSER_PROPAGATION_IDS, composerPropagationLabel, ORDERED_MATRIX_IDS, orderedMatrixLabel, parseKernelEntries, parseMatrixValues } from "../../dithering-labels.js";
import { composerMixOptions } from "../../dithering-ui.js";

export function DitherComposerControls() {
  const s = useAppState();
  const {
    composer,
    customDiffusionKernels,
    customKernelEntryText,
    customMatrixHeightEntry,
    customMatrixValuesEntry,
    customMatrixWidthEntry,
    customOrderedMatrices,
    customPatternError,
    ditherEngineId,
    setComposer,
    setCustomDiffusionKernels,
    setCustomKernelEntryText,
    setCustomMatrixHeightEntry,
    setCustomMatrixValuesEntry,
    setCustomMatrixWidthEntry,
    setCustomOrderedMatrices,
    setCustomPatternError,
    setState,
    syncKernelEditorFromSelection,
    syncMatrixEditorFromSelection,
  } = s;
  return (
    <>{ditherEngineId === "dither-composer-v1" ? (
     <div className="dithering-composer-grid" aria-label="Dither composer settings">
       <div className="control-row control-row-2">
       <label>
         <span className="dithering-composer-one-line-label">Dithering · Composer&nbsp;pattern</span>
         <select
           value={composer.patternId}
           onChange={(event) => {
             const nextPatternId = event.target.value as ConversionSettings["composer"]["patternId"];
             setComposer((current) => ({ ...current, patternId: nextPatternId }));
             syncMatrixEditorFromSelection(nextPatternId);
             setState({ kind: "idle" });
           }}
         >
           <optgroup label="Built-in matrices">
             {ORDERED_MATRIX_IDS.map((matrixId) => (
               <option key={matrixId} value={matrixId}>{orderedMatrixLabel(matrixId)}</option>
             ))}
           </optgroup>
           {customOrderedMatrices.length > 0 ? (
             <optgroup label="Custom matrices">
               {customOrderedMatrices.map((matrix) => (
                 <option key={matrix.id} value={matrix.id}>{matrix.id}</option>
               ))}
             </optgroup>
           ) : null}
         </select>
       </label>
       <label>
         <span className="dithering-composer-one-line-label">Kernel · Composer&nbsp;propagation</span>
         <select
           value={composer.propagationId}
           onChange={(event) => {
             const nextPropagationId = event.target.value as ConversionSettings["composer"]["propagationId"];
             setComposer((current) => ({ ...current, propagationId: nextPropagationId }));
             syncKernelEditorFromSelection(nextPropagationId);
             setState({ kind: "idle" });
           }}
         >
           <optgroup label="Built-in propagation">
             {BUILT_IN_COMPOSER_PROPAGATION_IDS.map((id) => (
               <option key={id} value={id}>{composerPropagationLabel(id)}</option>
             ))}
           </optgroup>
           {customDiffusionKernels.length > 0 ? (
             <optgroup label="Custom kernels">
               {customDiffusionKernels.map((kernel) => (
                 <option key={kernel.id} value={kernel.id}>{kernel.id}</option>
               ))}
             </optgroup>
           ) : null}
         </select>
       </label>
       </div>
       <div className="control-row control-row-2">
       <label>
         <span>Composer diffusion mix</span>
         <span className="control-cell-body">
           <select
             value={String(composer.mixWeight)}
             onChange={(event) => {
               setComposer((current) => ({ ...current, mixWeight: Number(event.target.value) }));
               setState({ kind: "idle" });
             }}
           >
             {composerMixOptions(composer.mixWeight).map((option) => (
               <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>
             ))}
           </select>
           <small>0% uses the pattern guide only; 100% uses diffusion only.</small>
         </span>
       </label>
       <label>
         <span>Carrier mode</span>
         <select
           value={composer.carrierMode}
           onChange={(event) => {
             setComposer((current) => ({ ...current, carrierMode: event.target.value as ConversionSettings["composer"]["carrierMode"] }));
             setState({ kind: "idle" });
           }}
         >
           <option value="off">Off</option>
           <option value="protected-checker">Protected checker</option>
           <option value="adaptive">Adaptive</option>
         </select>
       </label>
       </div>
       <div className="control-row control-row-2">
       <label>
         <span>Custom matrix dimensions (width × height)</span>
         <div className="dithering-pair-fields dithering-composer-dimensions-fields">
           <input aria-label="Custom matrix width" type="number" min="1" max="8" step="1" value={customMatrixWidthEntry} onChange={(event) => setCustomMatrixWidthEntry(event.target.value)} />
           <input aria-label="Custom matrix height" type="number" min="1" max="8" step="1" value={customMatrixHeightEntry} onChange={(event) => setCustomMatrixHeightEntry(event.target.value)} />
         </div>
       </label>
       <div className="dithering-composer-spacer" aria-hidden="true" />
       </div>
       <div className="control-row control-row-2">
       <label>
         <span>Custom matrix ranks</span>
         <span className="control-cell-body">
           <textarea
             className="dithering-composer-editor"
             rows={4}
             value={customMatrixValuesEntry}
             onChange={(event) => setCustomMatrixValuesEntry(event.target.value)}
           />
           <small>Ranks may repeat, but each distinct rank must occur equally often.</small>
         </span>
       </label>
       <label>
         <span>Custom kernel entries</span>
         <span className="control-cell-body">
           <textarea
             className="dithering-composer-editor"
             rows={4}
             value={customKernelEntryText}
             onChange={(event) => setCustomKernelEntryText(event.target.value)}
           />
           <small>One row per entry: dx dy weight</small>
         </span>
       </label>
       </div>
       <div className="control-row control-row-2 control-row-actions">
       <div className="dithering-composer-save-row" role="group" aria-label="Custom matrix actions">
         <button
           className="secondary compact"
           type="button"
           onClick={() => {
             try {
               const width = Number.parseInt(customMatrixWidthEntry, 10);
               const height = Number.parseInt(customMatrixHeightEntry, 10);
               const values = parseMatrixValues(customMatrixValuesEntry);
               const definition = defineCustomOrderedMatrix({ width, height, values });
               setCustomOrderedMatrices((current) => {
                 const next = current.filter((matrix) => matrix.id !== definition.id);
                 return [...next, definition];
               });
               setComposer((current) => ({ ...current, patternId: definition.id }));
               setCustomPatternError(null);
               setState({ kind: "idle" });
             } catch (error: unknown) {
               setCustomPatternError(error instanceof Error ? error.message : "Invalid custom matrix.");
             }
           }}
         >Save matrix</button>
         <button
           className="secondary compact destructive-action"
           type="button"
           disabled={!composer.patternId.startsWith("custom-ordered-")}
           onClick={() => {
             const matrixId = composer.patternId;
             if (!matrixId.startsWith("custom-ordered-")) return;
             setCustomOrderedMatrices((current) => current.filter((matrix) => matrix.id !== matrixId));
             setComposer((current) => ({ ...current, patternId: "bayer-4x4" }));
             syncMatrixEditorFromSelection("bayer-4x4");
             setCustomPatternError(null);
             setState({ kind: "idle" });
           }}
         >Delete matrix</button>
       </div>
       <div className="dithering-composer-save-row" role="group" aria-label="Custom kernel actions">
         <button
           className="secondary compact"
           type="button"
           onClick={() => {
             try {
               const entries = parseKernelEntries(customKernelEntryText);
               const definition = defineCustomDiffusionKernel(entries);
               setCustomDiffusionKernels((current) => {
                 const next = current.filter((kernel) => kernel.id !== definition.id);
                 return [...next, definition];
               });
               setComposer((current) => ({ ...current, propagationId: definition.id }));
               setCustomPatternError(null);
               setState({ kind: "idle" });
             } catch (error: unknown) {
               setCustomPatternError(error instanceof Error ? error.message : "Invalid custom kernel.");
             }
           }}
         >Save kernel</button>
         <button
           className="secondary compact destructive-action"
           type="button"
           disabled={!composer.propagationId.startsWith("custom-diffusion-")}
           onClick={() => {
             const kernelId = composer.propagationId;
             if (!kernelId.startsWith("custom-diffusion-")) return;
             setCustomDiffusionKernels((current) => current.filter((kernel) => kernel.id !== kernelId));
             setComposer((current) => ({ ...current, propagationId: "none" }));
             syncKernelEditorFromSelection("none");
             setCustomPatternError(null);
             setState({ kind: "idle" });
           }}
         >Delete kernel</button>
       </div>
       </div>
       {customPatternError === null ? null : <span className="field-error dithering-composer-error">{customPatternError}</span>}
     </div>
   ) : null}</>
  );
}
