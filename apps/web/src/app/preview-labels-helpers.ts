import { type WorkerConversionResult } from "../worker/client.js";

export const sharedBitmapDiagnosticsText = (result: WorkerConversionResult): string => {
  const diagnostics = result.sharedBitmapDiagnostics;
  if (diagnostics === undefined) return "";
  const percentChange = (before: number, after: number): string => before === 0
    ? "0.00%"
    : `${((after - before) / before * 100).toFixed(2)}%`;
  if (result.attributeOptimizerId === "zx-mixed-shared-bitmap-v3") {
    const change = (before: number | undefined, after: number | undefined): string =>
      before === undefined || after === undefined || before === 0
        ? "n/a"
        : `${((after - before) / before * 100).toFixed(2)}%`;
    return ` Shared bitmap v3 fixed objective — J ${change(diagnostics.objectiveBaseline, diagnostics.objectiveFinal)}; ` +
      `color ${change(diagnostics.baselineColorError, diagnostics.finalColorError)}; ` +
      `attribute visibility ${change(diagnostics.baselineAttributeVisibilityError, diagnostics.finalAttributeVisibilityError)}; ` +
      `boundary transitions ${change(diagnostics.baselineBoundaryTransitionError, diagnostics.finalBoundaryTransitionError)}; ` +
      `${diagnostics.acceptedPasses}/${diagnostics.evaluatedPasses} passes accepted/evaluated, ${diagnostics.runtimeMs} ms.`;
  }
  if (result.attributeOptimizerId === "zx-mixed-shared-bitmap-v4") {
    const change = (before: number | undefined, after: number | undefined): string =>
      before === undefined || after === undefined || before === 0
        ? "n/a"
        : `${((after - before) / before * 100).toFixed(2)}%`;
    return ` Shared bitmap v4 fixed objective — J ${change(diagnostics.objectiveBaseline, diagnostics.objectiveFinal)}; ` +
      `seeds normal ${diagnostics.normalSeedObjective?.toFixed(4) ?? "n/a"}, halo ${diagnostics.haloSeedObjective?.toFixed(4) ?? "n/a"}; ` +
      `pixel ${change(diagnostics.baselineColorError, diagnostics.finalColorError)}; ` +
      `cell tone ${change(diagnostics.baselineCellError, diagnostics.finalCellError)}; ` +
      `attribute boundaries ${change(diagnostics.baselineBoundaryTransitionError, diagnostics.finalBoundaryTransitionError)}; ` +
      `${diagnostics.acceptedAttributeMoves ?? 0} attribute / ${diagnostics.acceptedBitmapMoves ?? 0} bitmap moves, ` +
      `${diagnostics.candidateCount ?? 0} candidates, ${diagnostics.evaluatedPasses} passes, ${diagnostics.runtimeMs} ms.`;
  }
  const version = result.attributeOptimizerId.startsWith("zx-mixed-shared-bitmap-v2-budget-")
    ? `v2 · +${diagnostics.rgbBudgetPercent}% RGB budget`
    : "v1 legacy objective";
  return ` Shared bitmap ${version} — RGB ${percentChange(diagnostics.baselineRgbError, diagnostics.finalRgbError)}; ` +
    `2×2 ${percentChange(diagnostics.baselineLowPassError, diagnostics.finalLowPassError)}; ` +
    `4×4 ${percentChange(diagnostics.baselineLowPass4Error, diagnostics.finalLowPass4Error)}; ` +
    `attribute seams ${percentChange(diagnostics.baselineBoundaryError, diagnostics.finalBoundaryError)}; ` +
    `source edges ${percentChange(diagnostics.baselineEdgeError, diagnostics.finalEdgeError)}; ` +
    `${diagnostics.acceptedPasses}/${diagnostics.evaluatedPasses} refinement passes accepted/evaluated, ${diagnostics.runtimeMs} ms.`;
};
