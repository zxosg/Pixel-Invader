import { useAppState } from "../app-state.js";
import { type ConversionSettings, DITHER_ENGINES, type DitherEngineId, ditherEngineSelectionGroupForTarget, isCompatibleEnginePair, isDitherEngineAvailableForSelection, type OrderedMatrixId, type QlMixedOptimizerId } from "@retro-converter/conversion-core";
import { RangeNumberControl } from "../../app-controls.js";
import { ORDERED_MATRIX_IDS, orderedMatrixLabel } from "../../dithering-labels.js";
import { levelAtLeast, type SettingLevel } from "../../settings-registry.js";
import { AdvancedConversionSettings } from "./advanced-conversion-settings.js";
import { DitherComposerControls } from "./dither-composer-controls.js";
import { ErrorDiffusionControls } from "./error-diffusion-controls.js";

export function DitheringControls({ level = "expert" }: { readonly level?: SettingLevel }) {
  const s = useAppState();
  const at = (minimum: SettingLevel) => levelAtLeast(level, minimum);
  const {
    artisticPattern,
    attributeHeight,
    attributeOptimizerId,
    ditherEngineId,
    dithering,
    errorDiffusionLineSuppression,
    isQl,
    orderedMatrix,
    qlMixedOptimizerId,
    selectDitherEngine,
    selectedPlatformId,
    setArtisticPattern,
    setErrorDiffusionLineSuppression,
    setOrderedMatrix,
    setQlMixedOptimizerId,
    setSliderValidity,
    setState,
    settingsSection,
    switchDithering,
    syncMatrixEditorFromSelection,
    targetModeId,
  } = s;
  return (
          <fieldset id="settings-dithering" className={`control-group dithering-group${settingsSection === "dithering" ? " settings-focused" : ""}`}>
            <legend className="visually-hidden">Dithering</legend>
          {at("advanced") ? <AdvancedConversionSettings /> : null}
          {at("expert") && isQl && targetModeId === "mode8-mode4-mixed-512x256" ? (
            <label className="dithering-wide">
              <span>Mixed optimizer</span>
              <select
                value={qlMixedOptimizerId}
                onChange={(event) => {
                  setQlMixedOptimizerId(
                    event.target.value as QlMixedOptimizerId,
                  );
                  setState({ kind: "idle" });
                }}
              >
                <option value="ql-mixed-average-v1">Average v1 · legacy</option>
                <option value="ql-mixed-low-perception-v2">Low perception v2</option>
                <option value="ql-mixed-high-detail-v2">High detail v2</option>
                <option value="ql-mixed-balanced-v2">Balanced v2 · default</option>
              </select>
            </label>
          ) : null}
          <fieldset className="dithering-method-control dithering-wide">
            <legend>Dithering method</legend>
            <div className="segmented-control" role="radiogroup" aria-label="Dithering method">
              {([
                ["none", "No dithering"],
                ["ordered", "Ordered"],
                ["error-diffusion", "Error diffusion"],
              ] as const).map(([value, label]) => (
                <label className="segmented-option" key={value}>
                  <input
                    type="radio"
                    name="dithering-method"
                    value={value}
                    checked={dithering === value}
                    onChange={() => switchDithering(value)}
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {at("advanced") && dithering === "error-diffusion" ? (
            <label className="dithering-wide">
              <span>Dither algorithm</span>
              <select
                value={ditherEngineId}
                onChange={(event) => selectDitherEngine(event.target.value as DitherEngineId)}
              >
                {(() => {
                  const compatible = DITHER_ENGINES.filter((engine) =>
                    engine.method === "error-diffusion" &&
                    isDitherEngineAvailableForSelection(
                      selectedPlatformId,
                      targetModeId,
                      attributeOptimizerId,
                      engine.id,
                    )
                  );
                  const recommended = new Set<DitherEngineId>([
                    "error-diffusion-decorrelated-v3",
                    "error-diffusion-atkinson-v1",
                    "error-diffusion-checker-artistic-v1",
                  ]);
                  return <>
                    <optgroup label="Recommended">
                      {compatible.filter((engine) => recommended.has(engine.id)).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                    <optgroup label="Alternatives and historical engines">
                      {compatible.filter((engine) =>
                        !recommended.has(engine.id) &&
                        ditherEngineSelectionGroupForTarget(engine.id, targetModeId) !== "to-be-hidden" &&
                        engine.lifecycle !== "experimental"
                      ).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                    <optgroup label="Experimental engines">
                      {compatible.filter((engine) =>
                        !recommended.has(engine.id) &&
                        ditherEngineSelectionGroupForTarget(engine.id, targetModeId) !== "to-be-hidden" &&
                        engine.lifecycle === "experimental"
                      ).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                    <optgroup label="To be hidden">
                      {compatible.filter((engine) =>
                        ditherEngineSelectionGroupForTarget(engine.id, targetModeId) === "to-be-hidden"
                      ).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                  </>;
                })()}
              </select>
            </label>
          ) : null}
          {at("advanced") && dithering !== "none" && dithering !== "error-diffusion" ? (
            <label className="dithering-wide">
              <span>Dither engine</span>
              <select
                value={ditherEngineId}
                onChange={(event) => selectDitherEngine(event.target.value as DitherEngineId)}
                title={DITHER_ENGINES.find((engine) => engine.id === ditherEngineId)?.name}
              >
                {(() => {
                  const compatible = DITHER_ENGINES.filter((engine) =>
                    engine.method === "ordered" &&
                    engine.platforms.includes(selectedPlatformId as never) &&
                    (selectedPlatformId === "sinclair-ql" ||
                      isCompatibleEnginePair(attributeOptimizerId, engine.id)) &&
                    (engine.targetModeIds === undefined || engine.targetModeIds.includes(targetModeId)) &&
                    (targetModeId !== "zx48-mixed-256x192" || !("family" in engine))
                  );
                  const recommended = new Set<DitherEngineId>([
                    "ordered-strict-matrix-v6",
                    "ordered-mixed-phase-stable-v8",
                  ]);
                  return <>
                    <optgroup label="Recommended">
                      {compatible.filter((engine) => recommended.has(engine.id)).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                    <optgroup label="Alternatives and historical engines">
                      {compatible.filter((engine) =>
                        !recommended.has(engine.id) &&
                        ditherEngineSelectionGroupForTarget(engine.id, targetModeId) !== "to-be-hidden" &&
                        engine.lifecycle !== "experimental"
                      ).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                    <optgroup label="Experimental engines">
                      {compatible.filter((engine) =>
                        ditherEngineSelectionGroupForTarget(engine.id, targetModeId) !== "to-be-hidden" &&
                        engine.lifecycle === "experimental"
                      ).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                    <optgroup label="To be hidden">
                      {compatible.filter((engine) =>
                        ditherEngineSelectionGroupForTarget(engine.id, targetModeId) === "to-be-hidden"
                      ).map((engine) =>
                        <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                    </optgroup>
                  </>;
                })()}
              </select>
            </label>
          ) : null}
          {at("advanced") && (ditherEngineId === "artistic-ordered-hybrid-v1" ||
            ditherEngineId === "artistic-ordered-tone-safe-v2" ||
            ditherEngineId === "artistic-chessboard-smooth-v1") ? (
            <label>
              <span>Pattern preference</span>
              <select value={artisticPattern} onChange={(event) => { setArtisticPattern(event.target.value as NonNullable<ConversionSettings["artisticPattern"]>); setState({ kind: "idle" }); }}>
                <option value="auto">Auto</option>
                <option value="checkerboard">Checkerboard</option>
                <option value="horizontal">Horizontal</option>
                <option value="vertical">Vertical</option>
              </select>
              {attributeHeight === 1 ? <small>8×1 cells use row-local alternating motifs.</small> : null}
            </label>
          ) : null}
          {at("advanced") && dithering === "ordered" &&
            ditherEngineId !== "artistic-ordered-hybrid-v1" &&
            ditherEngineId !== "artistic-ordered-tone-safe-v2" ? (
            <label>
              <span>Ordered matrix</span>
              <select value={orderedMatrix} onChange={(event) => {
                const nextMatrix = event.target.value as OrderedMatrixId;
                setOrderedMatrix(nextMatrix);
                syncMatrixEditorFromSelection(nextMatrix);
                setState({ kind: "idle" });
              }}>
                {(DITHER_ENGINES.find((engine) => engine.id === ditherEngineId)?.orderedMatrixIds ??
                  ORDERED_MATRIX_IDS.slice(0, 4)).map((matrixId) => (
                  <option key={matrixId} value={matrixId}>{orderedMatrixLabel(matrixId)}</option>
                ))}
              </select>
            </label>
          ) : null}
          {at("expert") ? <DitherComposerControls /> : null}
          <ErrorDiffusionControls level={level} />
          {at("expert") && ((ditherEngineId === "error-diffusion-phase-balanced-v3" ||
            ditherEngineId === "error-diffusion-phase-balanced-checker-v3-1" ||
            ditherEngineId === "error-diffusion-phase-balanced-checker-v3-2" ||
            ditherEngineId === "error-diffusion-phase-balanced-checker-v3-3" ||
            ditherEngineId === "error-diffusion-checker-phase-v4" ||
            ditherEngineId === "error-diffusion-checker-phase-v4-4" ||
            ditherEngineId === "error-diffusion-checker-artistic-v1" ||
            ditherEngineId === "error-diffusion-checker-phase-v4-5" ||
            ditherEngineId === "error-diffusion-checker-phase-v4-5-1" ||
            ditherEngineId === "error-diffusion-checker-phase-v4-1" ||
            ditherEngineId === "error-diffusion-checker-phase-v4-2" ||
            ditherEngineId === "error-diffusion-checker-phase-v4-3" ||
            ditherEngineId === "error-diffusion-checker-phase-v5" ||
            ditherEngineId === "error-diffusion-matrix-guided-v1") || (
            isQl &&
            targetModeId === "mode8-mode4-mixed-512x256" &&
            ditherEngineId === "artistic-ordered-hybrid-v1"
          )) ? (
            <div className="dithering-row">
              {(ditherEngineId === "error-diffusion-phase-balanced-v3" ||
                ditherEngineId === "error-diffusion-phase-balanced-checker-v3-1" ||
                ditherEngineId === "error-diffusion-phase-balanced-checker-v3-2" ||
                ditherEngineId === "error-diffusion-phase-balanced-checker-v3-3" ||
                ditherEngineId === "error-diffusion-checker-phase-v4" ||
                ditherEngineId === "error-diffusion-checker-phase-v4-4" ||
                ditherEngineId === "error-diffusion-checker-artistic-v1" ||
                ditherEngineId === "error-diffusion-checker-phase-v4-5" ||
                ditherEngineId === "error-diffusion-checker-phase-v4-5-1" ||
                ditherEngineId === "error-diffusion-checker-phase-v4-1" ||
                ditherEngineId === "error-diffusion-checker-phase-v4-2" ||
                ditherEngineId === "error-diffusion-checker-phase-v4-3" ||
                ditherEngineId === "error-diffusion-checker-phase-v5" ||
                ditherEngineId === "error-diffusion-matrix-guided-v1" ||
                (isQl &&
                  targetModeId === "mode8-mode4-mixed-512x256" &&
                  ditherEngineId === "artistic-ordered-hybrid-v1")) ? (
                <div
                  className="dithering-parameter"
                    title="Reduces vertical diffusion runs and favors balanced alternating 2×2 placement; v3.1 adds local placement, v3.2 integrates checker decisions into v3 propagation, v3.3 reorients only true 50% checker blocks, v4.4 adds a checker carrier, v4.5 adaptively selects checker or dispersed 4×4 carriers, and v4.5.1 uses coverage-preserving atomic 2×2 color-pair correction to reduce spikes without isolated pixel flips. At 0%, output matches Projected unrestricted v2."
                >
                  <RangeNumberControl
                    id="error-line-suppression"
                    label="Line suppression"
                    value={errorDiffusionLineSuppression}
                    min={0}
                    max={100}
                    unit="%"
                    onChange={(value) => {
                      setErrorDiffusionLineSuppression(value);
                      setState({ kind: "idle" });
                    }}
                    onValidityChange={setSliderValidity}
                  />
                  <span className="control-help">
                    Reduces vertical diffusion runs while retaining short 2×1 transitions. v3.1 applies local placement after v3; v3.2 integrates coverage-preserving 2×2 checker decisions into v3 propagation; v3.3 only reorients existing 50% checker blocks; v4.4 uses an artistic checker carrier as a conservative v3 tie-breaker; v4.5 adaptively selects stable checker or dispersed 4×4 carrier regions, while v4.5.1 prefers a stable complementary checker phase and applies only atomic, coverage-preserving 2×2 color-pair corrections in smooth regions. In QL Mode 8/4 mixed Artistic checker mode, line suppression scales the mixed-resolution checker carrier from 0% to 100%. For v4.4, v4.5, and v4.5.1, line suppression controls carrier strength from 0% to 100%; it does not change the underlying tone diffusion. At 0%, output matches Projected unrestricted v2.
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
          </fieldset>
  );
}
