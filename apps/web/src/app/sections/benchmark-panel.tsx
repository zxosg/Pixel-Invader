import type { AppState } from "../app-state.js";
import { createPortal } from "react-dom";
import { ditherMethodForEngine } from "@retro-converter/conversion-core";

export function BenchmarkPanel({ s }: { s: AppState }) {
  const {
    amount,
    attributeHeight,
    benchmarkCompareDigests,
    benchmarkComparisonPreviews,
    benchmarkOpen,
    benchmarkPanelHost,
    benchmarkRows,
    benchmarkRunning,
    benchmarkVisualFavorites,
    comparisonKind,
    developmentMode,
    dithering,
    downloadBenchmark,
    errorDiffusionLineSuppression,
    errorDiffusionRandomization,
    image,
    includeExperimentalEngines,
    paletteSelections,
    runEngineBenchmark,
    selectBenchmarkRow,
    selectTilemapBenchmarkRow,
    selectedPlatformId,
    setBenchmarkOpen,
    setBenchmarkRows,
    setIncludeExperimentalEngines,
    setTilemapBenchmarkOpen,
    settingsValid,
    sourceArtifact,
    targetModeId,
    tilemapBenchmarkOpen,
    tilemapBenchmarkRows,
    tilemapBenchmarkRunning,
    toggleBenchmarkComparison,
    toggleBenchmarkVisualFavorite,
    workspaceMode,
  } = s;
  return (
    <>{benchmarkPanelHost === null ? null : createPortal((developmentMode && workspaceMode === "palette" && benchmarkOpen ? (
   <details
     className="benchmark-panel"
     open
     onToggle={(event) => setBenchmarkOpen(event.currentTarget.open)}
   >
     <summary>
       <span>{comparisonKind === "dithering" ? "Dithering comparison" : "Conversion engine comparison"}</span>
       <span className="benchmark-summary">
         {benchmarkRunning
           ? "Benchmarking…"
           : benchmarkRows.length > 0
             ? `${benchmarkRows.length} results`
             : "Not run"}
       </span>
     </summary>
     <div className="benchmark-content">
       <div className="benchmark-toolbar">
         <label className="benchmark-experimental">
           <input
             type="checkbox"
             checked={includeExperimentalEngines}
             disabled={benchmarkRunning}
             onChange={(event) => {
               setIncludeExperimentalEngines(event.currentTarget.checked);
               setBenchmarkRows([]);
             }}
           />
           Include experimental methods in benchmark
         </label>
         <button
           className="secondary compact"
           type="button"
           disabled={image === null || !settingsValid || benchmarkRunning}
           onClick={() => void runEngineBenchmark()}
         >
           {benchmarkRunning ? "Benchmarking…" : "Run comparison"}
         </button>
         <span>Ranks compatible optimizer and dither combinations for the current image.</span>
         {benchmarkRows.length > 0 ? (
           <>
             <button className="secondary compact" type="button" onClick={() => downloadBenchmark("json")}>Export JSON</button>
             <button className="secondary compact" type="button" onClick={() => downloadBenchmark("csv")}>Export CSV</button>
           </>
         ) : null}
       </div>
       <p className="benchmark-context">
         Context: {selectedPlatformId} · {targetModeId} ·
         {" "}amount {dithering === "none" ? 0 : amount}% ·
         {" "}randomization {errorDiffusionRandomization}% ·
         {" "}line suppression {errorDiffusionLineSuppression}% ·
         {" "}attribute {attributeHeight === undefined ? "—" : `8×${attributeHeight}`} ·
         {" "}palettes {paletteSelections.map((selection) =>
           `S${selection.screenIndex + 1}:${selection.enabledColorIds.join(",")}${
             selection.brightMode === undefined
               ? ""
               : `/${selection.brightMode}`
           }`
         ).join(" | ")} · source {sourceArtifact?.sha256.slice(0, 12) ?? "unsaved"}
       </p>
       {benchmarkRows.length > 0 ? (
         <div className="benchmark-results">
           <p>
             Lower decoder-preview RGB error is better. Low-pass and
             edge scores are secondary; platform score is
             engine-specific and not comparable. Guidance identifies
             exact, smooth, fast, and non-dominated balanced tradeoffs.
           </p>
           {benchmarkCompareDigests.length === 2 ? (() => {
             const first = benchmarkRows.find((row) => row.digest === benchmarkCompareDigests[0]);
             const second = benchmarkRows.find((row) => row.digest === benchmarkCompareDigests[1]);
             return first !== undefined && second !== undefined ? (
               <div className="benchmark-comparison" aria-label="Selected engine comparison">
                 <strong>A/B metric difference · B minus A</strong>
                 <span>RGB {(second.score - first.score).toLocaleString()}</span>
                 <span>Low-pass {(second.lowPassScore - first.lowPassScore).toLocaleString()}</span>
                 <span>Edge {(second.edgeScore - first.edgeScore).toLocaleString()}</span>
                 <span>Anisotropy {((second.textureMetrics.directionalAnisotropy - first.textureMetrics.directionalAnisotropy) * 100).toFixed(2)} pp</span>
                 <span>Straight runs {(second.textureMetrics.straightRunPenalty - first.textureMetrics.straightRunPenalty).toLocaleString()}</span>
                 <span>Time {(second.elapsedMs - first.elapsedMs).toFixed(0)} ms</span>
                 {benchmarkComparisonPreviews !== null ? (
                   <div className="benchmark-preview-comparison">
                     <figure><img src={benchmarkComparisonPreviews.first} alt="Benchmark result A" /><figcaption>A</figcaption></figure>
                     <figure><img src={benchmarkComparisonPreviews.second} alt="Benchmark result B" /><figcaption>B</figcaption></figure>
                     <figure><img src={benchmarkComparisonPreviews.difference} alt="Amplified RGB difference heatmap" /><figcaption>Difference ×4</figcaption></figure>
                   </div>
                 ) : null}
               </div>
             ) : null;
           })() : null}
           <table>
             <thead>
               <tr>
                 <th>Rank</th>
                 {selectedPlatformId === "zx-spectrum"
                   ? <th>Attribute optimizer</th>
                   : null}
                 {targetModeId === "mode8-mode4-mixed-512x256"
                   ? <th>QL mixed optimizer</th>
                   : null}
                 <th>Dither</th><th>Matrix</th><th>RGB error</th>
                 <th>Low-pass 2×2</th><th>Edge error</th>
                 <th>Guidance</th><th>Texture diagnostics</th><th>Attribute boundary</th><th>v7 RMS / changed</th><th>Platform score*</th>
                 <th>Time</th><th />
               </tr>
             </thead>
             <tbody>
               {benchmarkRows.map((row, index) => (
                 <tr key={row.digest}>
                   <td>{index + 1}</td>
                   {selectedPlatformId === "zx-spectrum"
                     ? <td>{row.optimizerId}</td>
                     : null}
                   {targetModeId === "mode8-mode4-mixed-512x256"
                     ? <td>{row.qlMixedOptimizerId}</td>
                     : null}
                   <td>
                     <div>{row.ditherEngineId}</div>
                     {row.aliases.length > 0 ? (
                       <details>
                         <summary>
                           {row.aliases.length + 1} identical outputs
                         </summary>
                         {row.aliases.map((alias) => (
                           <div key={`${alias.optimizerId}:${alias.qlMixedOptimizerId}:${alias.ditherEngineId}:${alias.matrix}`}>
                             {selectedPlatformId === "zx-spectrum"
                               ? `${alias.optimizerId} · `
                               : targetModeId ===
                                   "mode8-mode4-mixed-512x256"
                               ? `${alias.qlMixedOptimizerId} · `
                               : ""}
                             {alias.ditherEngineId}
                             {ditherMethodForEngine(alias.ditherEngineId) ===
                                   "ordered"
                               ? ` · ${alias.matrix}`
                               : ""}
                           </div>
                         ))}
                       </details>
                     ) : null}
                   </td>
                   <td>{row.matrixEffective ? row.matrix : "—"}</td>
                   <td>{row.score.toLocaleString()}</td>
                   <td>{row.lowPassScore.toLocaleString()}</td>
                   <td>{row.edgeScore.toLocaleString()}</td>
                   <td title={row.classification.dominated
                     ? "Dominated on RGB, low-pass, and edge metrics."
                     : row.classification.guidance === "exact"
                       ? "Lowest canonical RGB error."
                       : row.classification.guidance === "smooth"
                         ? "Lowest low-pass perceived error."
                         : row.classification.guidance === "fast"
                           ? "Fastest result within 10% of the best RGB error."
                           : "Non-dominated quality tradeoff."}
                   >
                     {row.classification.guidance ?? (row.classification.dominated ? "dominated" : "—")}
                   </td>
                   <td>
                     <details>
                       <summary>
                         anisotropy {(row.textureMetrics.directionalAnisotropy * 100).toFixed(1)}%
                       </summary>
                       <div>straight runs {row.textureMetrics.straightRunPenalty.toLocaleString()}</div>
                       <div>low frequency {row.textureMetrics.lowFrequencyNoise.toFixed(2)}</div>
                       <div>clumping {row.textureMetrics.localErrorClumping.toFixed(2)}</div>
                       <div>edge displacement {row.textureMetrics.edgeDisplacement.toLocaleString()}</div>
                     </details>
                   </td>
                   <td>{row.attributeBoundaryScore?.toLocaleString() ?? "—"}</td>
                   <td>{row.orderedPerturbationRms === null
                     ? "—"
                     : `${row.orderedPerturbationRms.toFixed(5)} / ${row.outputPixelChangePercent?.toFixed(2) ?? "—"}%`}</td>
                   <td>{row.platformScore.toLocaleString()}</td>
                   <td>{row.elapsedMs.toFixed(0)} ms</td>
                   <td>
                     <label className="benchmark-compare-toggle">
                       <input
                         type="checkbox"
                         aria-label={`Compare ${row.ditherEngineId}`}
                         checked={benchmarkCompareDigests.includes(row.digest)}
                         onChange={() => toggleBenchmarkComparison(row.digest)}
                       />
                       A/B
                     </label>
                     <button className="secondary compact" type="button" onClick={() => selectBenchmarkRow(row)}>Use</button>
                     <button
                       className="secondary compact"
                       type="button"
                       aria-pressed={benchmarkVisualFavorites.has(row.digest)}
                       onClick={() => toggleBenchmarkVisualFavorite(row.digest)}
                       title="Mark this result as a visual favorite without changing its rank"
                     >
                       {benchmarkVisualFavorites.has(row.digest) ? "★ Favorite" : "☆ Favorite"}
                     </button>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
         </div>
       ) : null}
     </div>
   </details>
   ) : developmentMode && workspaceMode === "tilemap" && tilemapBenchmarkOpen ? (
   <details
     className="benchmark-panel"
     open
     onToggle={(event) =>
       setTilemapBenchmarkOpen(event.currentTarget.open)}
   >
     <summary>
       <span>Tilemap method comparison</span>
       <span className="benchmark-summary">
         {tilemapBenchmarkRunning
           ? "Benchmarking…"
           : tilemapBenchmarkRows.length > 0
             ? `${tilemapBenchmarkRows.length} results`
             : "Not run"}
       </span>
     </summary>
     <div className="benchmark-content">
       <div className="benchmark-toolbar">
         <span>
           Compares Frequency, Best coverage v1, and experimental Image
           similarity v2/v3/v4/v5 at the current character budget.
         </span>
       </div>
       {tilemapBenchmarkRows.length > 0 ? (
         <div className="benchmark-results">
           <p>
             Lower decoder-preview RGB error is better; runtime is
             informational.
           </p>
           <table>
             <thead>
               <tr>
                 <th>Rank</th><th>Method</th><th>RGB error</th>
                 <th>Objective / diagnostics</th><th>vs v2</th>
                 <th>Time</th><th />
               </tr>
             </thead>
             <tbody>
               {tilemapBenchmarkRows.map((row, index) => (
                 <tr key={row.strategy}>
                   <td>{index + 1}</td>
                   <td>{row.strategy}</td>
                   <td>{row.score.toLocaleString()}</td>
                   <td>
                     {row.strategy === "image-similarity-v4" ||
                         row.strategy === "image-similarity-v5" ? (
                       <details>
                         <summary>
                           RGB{" "}
                           {row.result.diagnostics.initialRgbSquaredError?.toLocaleString()}
                           {" → "}
                           {row.result.diagnostics.finalRgbSquaredError?.toLocaleString()}
                         </summary>
                         <div>
                           Multiscale{" "}
                           {row.result.diagnostics.multiscaleError?.toFixed(2)}
                           {" · "}edge{" "}
                           {row.result.diagnostics.edgeError?.toFixed(2)}
                           {" · "}boundary{" "}
                           {row.result.diagnostics.rgbBoundaryError?.toFixed(2)}
                           {" · "}saliency{" "}
                           {row.result.diagnostics.saliencyError?.toFixed(2)}
                           {" · "}passes{" "}
                           {row.result.diagnostics.refinementPasses ?? 0}
                           {" · "}swaps{" "}
                           {row.result.diagnostics.medoidSwaps ?? 0}
                           {" · "}assignments{" "}
                           {row.result.diagnostics.assignmentChanges ?? 0}
                           {" · "}candidates{" "}
                           {row.result.diagnostics.candidatesEvaluated?.toLocaleString() ?? "—"}
                           {" · "}pruned{" "}
                           {row.result.diagnostics.equivalentCandidatesPruned?.toLocaleString() ?? "—"}
                           {" · "}cache hits{" "}
                           {row.result.diagnostics.candidateCacheHits?.toLocaleString() ?? "—"}
                         </div>
                       </details>
                     ) : (
                       row.result.diagnostics.globalObjective?.toFixed(5) ??
                         "—"
                     )}
                   </td>
                   <td>{(() => {
                     const baseline = tilemapBenchmarkRows.find(
                       (candidate) =>
                         candidate.strategy === "image-similarity-v2",
                     )?.score;
                     return baseline === undefined
                       ? "—"
                       : `${((baseline - row.score) / baseline * 100).toFixed(2)}%`;
                   })()}</td>
                   <td>{row.elapsedMs.toFixed(0)} ms</td>
                   <td>
                     <button
                       className="secondary compact"
                       type="button"
                       onClick={() => selectTilemapBenchmarkRow(row)}
                     >
                       Use
                     </button>
                   </td>
                 </tr>
               ))}
             </tbody>
           </table>
         </div>
       ) : null}
     </div>
   </details>
   ) : null), benchmarkPanelHost)}</>
  );
}
