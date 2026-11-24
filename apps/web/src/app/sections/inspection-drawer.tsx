import type { AppState } from "../app-state.js";
import { CHARSET_ARTIFACT_HEADER_BYTES } from "@retro-converter/zx-charset";
import { ZX_BASE_COLORS } from "../../inspection.js";

export function InspectionDrawer({ s }: { s: AppState }) {
  const {
    charsetState,
    displayedAttributeHeight,
    glyphActiveCount,
    glyphCount,
    inspectedTileAssignment,
    inspectedTileIndex,
    inspection,
    inspectionDrawerOpen,
    lastFinal,
    setInspectionDrawerOpen,
    tilemapStale,
    workspaceMode,
  } = s;
  return (
    <details
      className="inspection-drawer"
      open={inspectionDrawerOpen}
      onToggle={(event) => setInspectionDrawerOpen(event.currentTarget.open)}
    >
      <summary>Inspection details and palette usage</summary>
      <div className="inspection-details">
        <section aria-labelledby="cell-inspector-title">
        <h3 id="cell-inspector-title">
          {workspaceMode === "tilemap"
            ? "Tilemap inspector"
            : "Attribute inspector"}
        </h3>
        <p id="inspection-help">Point at the converted preview, or focus it and use arrow keys. Hold Shift to move eight pixels.</p>
        {inspection === null ? null : (
          workspaceMode === "tilemap" && inspectedTileIndex !== null &&
          charsetState.kind === "ready" &&
          inspectedTileAssignment !== null ? (
          <dl className="attribute-readout" aria-live="polite">
            <div><dt>Cell</dt><dd>{inspection.cellX}, {inspection.cellY} · index {inspectedTileIndex}</dd></div>
            <div><dt>Character</dt><dd>{inspectedTileAssignment.characterIndex}</dd></div>
            <div><dt>Transform</dt><dd>{inspectedTileAssignment.transform}</dd></div>
            <div><dt>Polarity</dt><dd>{inspectedTileAssignment.inverted ? "INK/PAPER swapped" : "Normal"}</dd></div>
            <div><dt>Cell error</dt><dd>{inspectedTileAssignment.distance.toFixed(6)}</dd></div>
            <div>
              <dt>Attributes</dt>
              <dd>
                original 0x{(lastFinal?.frames[0]?.encoded[
                  6144 + inspectedTileIndex
                ] ?? 0).toString(16).padStart(2, "0")} · decoded 0x{
                  (charsetState.result.attributes[inspectedTileIndex] ?? 0)
                    .toString(16).padStart(2, "0")
                }
              </dd>
            </div>
            <div>
              <dt>Mapping</dt>
              <dd>
                0x{(charsetState.result.artifact[
                  inspectedTileIndex + CHARSET_ARTIFACT_HEADER_BYTES
                ] ?? 0)
                  .toString(16).padStart(2, "0")}
              </dd>
            </div>
            <div>
              <dt>Charset</dt>
              <dd>
                {Array.from(charsetState.result.charset.subarray(
                  inspectedTileAssignment.characterIndex * 8,
                  inspectedTileAssignment.characterIndex * 8 + 8,
                )).map((value) =>
                  value.toString(16).padStart(2, "0")).join(" ")}
              </dd>
            </div>
          </dl>
          ) : (
          <dl className="attribute-readout" aria-live="polite">
            <div><dt>Pixel</dt><dd>{inspection.pixelX}, {inspection.pixelY} · bit {inspection.pixel}</dd></div>
            <div><dt>Cell</dt><dd>{inspection.cellX}, {inspection.cellY} · 8×{displayedAttributeHeight}</dd></div>
            <div><dt>Attribute</dt><dd>{inspection.attributeHex} · offset {inspection.attributeOffset}</dd></div>
            <div><dt>INK</dt><dd>{inspection.ink} · {ZX_BASE_COLORS[inspection.ink]?.name}</dd></div>
            <div><dt>PAPER</dt><dd>{inspection.paper} · {ZX_BASE_COLORS[inspection.paper]?.name}</dd></div>
            <div><dt>BRIGHT</dt><dd>{inspection.bright ? "On" : "Off"} · shared</dd></div>
            <div><dt>Bitmap</dt><dd>{inspection.bitmapBytes.map((value) => value.toString(16).padStart(2, "0")).join(" ")}</dd></div>
          </dl>
          )
        )}
        </section>
        {workspaceMode === "tilemap" && charsetState.kind === "ready" ? (
        <section aria-labelledby="tilemap-diagnostics-title">
          <h3 id="tilemap-diagnostics-title">Tilemap diagnostics</h3>
          <p
            className={`diagnostics-state ${tilemapStale ? "stale" : "current"}`}
            role="status"
          >
            {tilemapStale
              ? "Stale · values describe the previous Tilemap High result."
              : "Current · values match the displayed reconstruction."}
          </p>
          <dl className="attribute-readout">
            <div><dt>Available</dt><dd>{glyphCount}</dd></div>
            <div><dt>Active</dt><dd>{glyphActiveCount}</dd></div>
            <div><dt>Emitted</dt><dd>{charsetState.result.characterCount}</dd></div>
            <div><dt>Used</dt><dd>{charsetState.result.diagnostics.usedCharacterCount}</dd></div>
            <div><dt>Source patterns</dt><dd>{charsetState.result.diagnostics.uniqueCanonicalTiles}</dd></div>
            <div><dt>Exact cells</dt><dd>{charsetState.result.diagnostics.exactMatches} / 768</dd></div>
            <div><dt>RGB similarity</dt><dd>{charsetState.result.diagnostics.rgbSimilarityPercent.toFixed(2)}%</dd></div>
            <div><dt>RGB RMSE</dt><dd>{charsetState.result.diagnostics.rgbRmse.toFixed(2)}</dd></div>
            <div><dt>Mean cell error</dt><dd>{charsetState.result.diagnostics.averageStructuralError.toFixed(5)}</dd></div>
            <div><dt>Maximum cell error</dt><dd>{charsetState.result.diagnostics.maximumStructuralError.toFixed(5)}</dd></div>
            <div><dt>Global objective</dt><dd>{charsetState.result.diagnostics.globalObjective?.toFixed(5) ?? "—"}</dd></div>
            <div><dt>Refinement passes</dt><dd>{charsetState.result.diagnostics.refinementPasses ?? "—"}</dd></div>
            <div><dt>Initial RGB error</dt><dd>{charsetState.result.diagnostics.initialRgbSquaredError?.toLocaleString() ?? "—"}</dd></div>
            <div><dt>Final RGB error</dt><dd>{charsetState.result.diagnostics.finalRgbSquaredError?.toLocaleString() ?? "—"}</dd></div>
            <div><dt>Multiscale error</dt><dd>{charsetState.result.diagnostics.multiscaleError?.toFixed(2) ?? "—"}</dd></div>
            <div><dt>Edge error</dt><dd>{charsetState.result.diagnostics.edgeError?.toFixed(2) ?? "—"}</dd></div>
            <div><dt>RGB boundary error</dt><dd>{charsetState.result.diagnostics.rgbBoundaryError?.toFixed(2) ?? "—"}</dd></div>
            <div><dt>Saliency error</dt><dd>{charsetState.result.diagnostics.saliencyError?.toFixed(2) ?? "—"}</dd></div>
            <div><dt>Medoid swaps</dt><dd>{charsetState.result.diagnostics.medoidSwaps ?? "—"}</dd></div>
            <div><dt>Assignment changes</dt><dd>{charsetState.result.diagnostics.assignmentChanges ?? "—"}</dd></div>
            <div><dt>V4 candidates</dt><dd>{charsetState.result.diagnostics.candidatesEvaluated?.toLocaleString() ?? "—"}</dd></div>
            <div><dt>Equivalent candidates pruned</dt><dd>{charsetState.result.diagnostics.equivalentCandidatesPruned?.toLocaleString() ?? "—"}</dd></div>
            <div><dt>Cells recomputed</dt><dd>{charsetState.result.diagnostics.cellsRecomputed?.toLocaleString() ?? "—"}</dd></div>
            <div><dt>RGB boundary terms</dt><dd>{charsetState.result.diagnostics.boundaryTermsRecomputed?.toLocaleString() ?? "—"}</dd></div>
            <div><dt>Candidate cache hits</dt><dd>{charsetState.result.diagnostics.candidateCacheHits?.toLocaleString() ?? "—"}</dd></div>
            <div>
              <dt>Transformed cells</dt>
              <dd>
                {charsetState.result.diagnostics.transformHistogram
                  .slice(1)
                  .reduce((sum, count) => sum + count, 0)}
              </dd>
            </div>
            <div><dt>Polarity swaps</dt><dd>{charsetState.result.diagnostics.polaritySwaps}</dd></div>
            <div>
              <dt>Memory total</dt>
              <dd>{charsetState.result.diagnostics.memory.totalBytes.toLocaleString()} B</dd>
            </div>
            <div>
              <dt>Map</dt>
              <dd>{charsetState.result.diagnostics.memory.tilemapBytes.toLocaleString()} B</dd>
            </div>
            <div>
              <dt>Header</dt>
              <dd>{(charsetState.result.diagnostics.memory.headerBytes ?? 0).toLocaleString()} B</dd>
            </div>
            <div>
              <dt>Attributes</dt>
              <dd>{charsetState.result.diagnostics.memory.attributeBytes.toLocaleString()} B</dd>
            </div>
            <div>
              <dt>Transforms</dt>
              <dd>{charsetState.result.diagnostics.memory.transformBytes.toLocaleString()} B</dd>
            </div>
            <div>
              <dt>Charset</dt>
              <dd>{charsetState.result.diagnostics.memory.charsetBytes.toLocaleString()} B</dd>
            </div>
          </dl>
        </section>
        ) : null}
      </div>
    </details>
  );
}
