import { useAppState } from "../app-state.js";
import { RangeNumberControl } from "../../app-controls.js";

export function ErrorDiffusionControls() {
  const s = useAppState();
  const {
    amount,
    amountEntry,
    amountValid,
    dithering,
    errorDiffusionRandomization,
    setAmountEntry,
    setErrorDiffusionRandomization,
    setSliderValidity,
    setState,
  } = s;
  return (
    <>{dithering === "error-diffusion" ? (
     <div className="dithering-wide dithering-row dithering-row-paired control-row control-row-2">
       <div className="dithering-parameter">
         <label>
           <span>Dithering amount</span>
           <span className="filter-inputs">
             <input
               type="range"
               min="0"
               max="100"
               step="1"
               value={amountValid ? amount : 0}
               aria-label="Dithering amount slider"
               onInput={(event) => { setAmountEntry(event.currentTarget.value); setState({ kind: "idle" }); }}
             />
             <span className="range-number-entry">
               <input
                 className={amountValid ? undefined : "invalid"}
                 type="number"
                 min="0"
                 max="100"
                 step="1"
                 value={amountEntry}
                 aria-label="Dithering amount percentage"
                 aria-invalid={!amountValid}
                 aria-describedby={amountValid ? undefined : "amount-error"}
                 onChange={(event) => { setAmountEntry(event.target.value); setState({ kind: "idle" }); }}
               />
               <span className="range-unit" aria-hidden="true">%</span>
             </span>
           </span>
         </label>
         {amountValid ? null : <span className="field-error" id="amount-error">Invalid value</span>}
       </div>
       <div
         className="dithering-parameter"
         title="Deterministically breaks repeating Error-diffusion patterns."
       >
         <RangeNumberControl
           id="error-randomization"
           label="Error randomization"
           value={errorDiffusionRandomization}
           min={0}
           max={100}
           unit="%"
           onChange={(value) => {
             setErrorDiffusionRandomization(value);
             setState({ kind: "idle" });
           }}
           onValidityChange={setSliderValidity}
         />
         <span className="control-help">
           Deterministically breaks repeating Error-diffusion patterns.
         </span>
       </div>
     </div>
   ) : dithering !== "none" ? (
     <fieldset className="amount-control dithering-wide">
       <legend>Dithering amount</legend>
       <div className="amount-inputs">
         <input
           type="range"
           min="0"
           max="100"
           step="1"
           value={amountValid ? amount : 0}
           aria-label="Dithering amount slider"
           onInput={(event) => { setAmountEntry(event.currentTarget.value); setState({ kind: "idle" }); }}
         />
         <label className="percentage-entry">
           <span className="visually-hidden">Dithering amount percentage</span>
           <input
             className={amountValid ? undefined : "invalid"}
             type="number"
             min="0"
             max="100"
             step="1"
             value={amountEntry}
             aria-invalid={!amountValid}
             aria-describedby={amountValid ? undefined : "amount-error"}
             onChange={(event) => { setAmountEntry(event.target.value); setState({ kind: "idle" }); }}
           />
           <span aria-hidden="true">%</span>
         </label>
       </div>
       {amountValid ? null : <span className="field-error" id="amount-error">Invalid value</span>}
     </fieldset>
   ) : null}</>
  );
}
