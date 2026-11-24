import type { AppState } from "../app-state.js";
import { ATTRIBUTE_OPTIMIZERS, type AttributeOptimizerId, DITHER_ENGINES, isDitherEngineAvailableForSelection, latestDitherEngineForMethod } from "@retro-converter/conversion-core";
import { isAttributeOptimizerAvailableForTarget } from "../../engine-preferences.js";

export function AdvancedConversionSettings({ s }: { s: AppState }) {
  const {
    attributeOptimizerId,
    ditherEngineId,
    dithering,
    isZx,
    setAttributeOptimizerId,
    setDitherEngineId,
    setDithering,
    setState,
    setStructuredSettings,
    targetModeId,
  } = s;
  return (
    <details className="engine-controls dithering-wide">
      <summary>Advanced conversion engines</summary>
      {isZx ? (
        <label>
          <span>Attribute optimizer</span>
          <select
            value={attributeOptimizerId}
            onChange={(event) => {
              const id = event.target.value as AttributeOptimizerId;
              setAttributeOptimizerId(id);
              if (id === "zx-block-dbs-global-v1") {
                setDitherEngineId("pattern-legal-mask-dbs-v1");
                setDithering("ordered");
              } else if (
                id === "zx-structured-global-v1" ||
                id === "zx-structured-global-v2" ||
                id === "zx-structured-global-v3" ||
                id === "zx-structured-global-v4"
              ) {
                const isVersion4 = id === "zx-structured-global-v4";
                const isVersion3 = id === "zx-structured-global-v3";
                const isVersion2 = id === "zx-structured-global-v2";
                setDitherEngineId(
                  isVersion4
                    ? "ordered-cell-pattern-v4"
                    : isVersion3
                    ? "ordered-cell-pattern-v3"
                    : isVersion2
                      ? "ordered-cell-pattern-v2"
                      : "ordered-cell-pattern-v1",
                );
                setDithering("ordered");
                setStructuredSettings((current) => ({
                  ...current,
                  ditherResponseCurveId: isVersion2 || isVersion3 || isVersion4
                    ? "power-035-percent-v2"
                    : "power-065-percent-v1",
                  colorAnchorModelId: isVersion3 || isVersion4
                    ? "srgb-squared-v1"
                    : "none-v1",
                  structuralModelId: isVersion4
                    ? "palette-topology-v1"
                    : "none-v1",
                  objectiveWeights: isVersion4
                    ? {
                        ...current.objectiveWeights,
                        pixel: 192,
                        rgbAnchor: 2048,
                        patternReference: 1536,
                        paletteDistribution: 1024,
                        luminanceRank: 512,
                        edgePolarity: 768,
                        mean: 768,
                        sharedEndpoint: 0,
                      }
                    : isVersion2 || isVersion3
                    ? {
                        ...current.objectiveWeights,
                        pixel: 192,
                        rgbAnchor: isVersion3 ? 6144 : 0,
                        patternReference: 0,
                        paletteDistribution: 0,
                        luminanceRank: 0,
                        edgePolarity: 0,
                        mean: 2048,
                      }
                    : {
                        ...current.objectiveWeights,
                        pixel: 1024,
                        rgbAnchor: 0,
                        patternReference: 0,
                        paletteDistribution: 0,
                        luminanceRank: 0,
                        edgePolarity: 0,
                        mean: 256,
                      },
                  candidateParameters: {
                    ...current.candidateParameters,
                    localAdmissibilityPermille: isVersion4 ? 100 : 1000,
                    boundaryCapPermille: isVersion4 ? 100 : 1000,
                  },
                }));
              } else if (
                ditherEngineId === "ordered-cell-pattern-v1" ||
                ditherEngineId === "ordered-cell-pattern-v2" ||
                ditherEngineId === "ordered-cell-pattern-v3" ||
                ditherEngineId === "ordered-cell-pattern-v4" ||
                ditherEngineId === "pattern-legal-mask-dbs-v1"
              ) {
                setDitherEngineId(latestDitherEngineForMethod(dithering));
              }
              setState({ kind: "idle" });
            }}
          >
            {(() => {
              const compatible = ATTRIBUTE_OPTIMIZERS.filter((engine) =>
                isAttributeOptimizerAvailableForTarget("zx-spectrum", targetModeId, engine.id) &&
                (targetModeId !== "zx48-mixed-256x192" || !("family" in engine)) &&
                DITHER_ENGINES.some((ditherEngine) =>
                  isDitherEngineAvailableForSelection(
                    "zx-spectrum",
                    targetModeId,
                    engine.id,
                    ditherEngine.id,
                  ),
                )
              );
              const recommended = new Set<AttributeOptimizerId>([
                "zx-source-cell-v1", "zx-guide-reference-halo-v1",
              ]);
              return <>
                <optgroup label="Recommended">
                  {compatible.filter((engine) => recommended.has(engine.id)).map((engine) =>
                    <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                </optgroup>
                <optgroup label="Alternatives and historical engines">
                  {compatible.filter((engine) =>
                    !recommended.has(engine.id) && engine.lifecycle !== "experimental"
                  ).map((engine) =>
                    <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                </optgroup>
                <optgroup label="Experimental engines">
                  {compatible.filter((engine) => engine.lifecycle === "experimental").map((engine) =>
                    <option key={engine.id} value={engine.id}>{engine.name}</option>)}
                </optgroup>
              </>;
            })()}
          </select>
        </label>
      ) : null}
    </details>
  );
}
