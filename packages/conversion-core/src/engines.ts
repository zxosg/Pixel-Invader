import type {
  AttributeOptimizerId,
  DitherEngineId,
  DitheringMethod,
  PlatformId,
  OrderedMatrixId,
  TargetModeId,
} from "./types.js";

export type EffectiveEngineParameter =
  | "artistic-pattern"
  | "ordered-matrix"
  | "dithering-amount"
  | "error-randomization"
  | "error-line-suppression"
  | "attribute-optimizer"
  | "ql-mixed-optimizer";

export interface AttributeOptimizerDescriptor {
  readonly id: AttributeOptimizerId;
  readonly name: string;
  readonly version: number;
  readonly platforms: readonly PlatformId[];
  readonly family?: string;
  readonly compatibleDitherEngineIds?: readonly DitherEngineId[];
  readonly defaultDitherEngineId?: DitherEngineId;
  readonly lifecycle?: "experimental" | "promoted" | "legacy";
  readonly targetModeIds?: readonly TargetModeId[];
  readonly effectiveParameterIds?: readonly EffectiveEngineParameter[];
}

export interface DitherEngineDescriptor {
  readonly id: DitherEngineId;
  readonly name: string;
  readonly version: number;
  readonly method: DitheringMethod;
  readonly platforms: readonly PlatformId[];
  readonly family?: string;
  readonly compatibleAttributeOptimizerIds?: readonly AttributeOptimizerId[];
  readonly lifecycle?: "experimental" | "promoted" | "legacy";
  readonly orderedMatrixIds?: readonly OrderedMatrixId[];
  readonly targetModeIds?: readonly TargetModeId[];
  readonly effectiveParameterIds?: readonly EffectiveEngineParameter[];
  readonly equivalenceGroupByTarget?: Readonly<Partial<Record<TargetModeId, string>>>;
}

export const ATTRIBUTE_OPTIMIZERS: readonly AttributeOptimizerDescriptor[] = [
  {
    id: "pmd85-vertical-spatial-uniform-v1",
    name: "PMD 85 vertical spatial uniform v1",
    version: 1,
    platforms: ["pmd-85"],
    compatibleDitherEngineIds: [
      "vertical-spatial-none-v1",
      "vertical-spatial-ordered-v1",
      "vertical-spatial-error-diffusion-v1",
    ],
    defaultDitherEngineId: "vertical-spatial-none-v1",
    targetModeIds: [
      "pmd85-2-rgb-vertical-spatial",
      "pmd85-3-rgb-vertical-spatial",
      "pmd85-3-pal-vertical-spatial",
    ],
    lifecycle: "promoted",
  },
  {
    id: "ql-vertical-spatial-uniform-v1",
    name: "QL vertical spatial uniform v1",
    version: 1,
    platforms: ["sinclair-ql"],
    compatibleDitherEngineIds: [
      "vertical-spatial-none-v1",
      "vertical-spatial-ordered-v1",
      "vertical-spatial-error-diffusion-v1",
    ],
    defaultDitherEngineId: "vertical-spatial-none-v1",
    targetModeIds: [
      "mode8-vertical-spatial-256x256",
      "mode4-vertical-spatial-512x256",
    ],
    lifecycle: "promoted",
  },
  {
    id: "zx-vertical-spatial-uniform-v1",
    name: "ZX vertical spatial uniform v1",
    version: 1,
    platforms: ["zx-spectrum"],
    compatibleDitherEngineIds: [
      "vertical-spatial-none-v1",
      "vertical-spatial-ordered-v1",
      "vertical-spatial-error-diffusion-v1",
    ],
    defaultDitherEngineId: "vertical-spatial-none-v1",
    targetModeIds: ["zx48-vertical-spatial-256x192"],
    lifecycle: "promoted",
  },
  {
    id: "zx-vertical-spatial-detail-v1",
    name: "ZX vertical spatial detail v1 · experimental",
    version: 1,
    platforms: ["zx-spectrum"],
    compatibleDitherEngineIds: [
      "vertical-spatial-none-v1",
      "vertical-spatial-ordered-v1",
      "vertical-spatial-error-diffusion-v1",
    ],
    defaultDitherEngineId: "vertical-spatial-none-v1",
    targetModeIds: ["zx48-vertical-spatial-256x192"],
    lifecycle: "experimental",
  },
  {
    id: "pmd85-cell-v1",
    name: "PMD 85 fixed PAPER 0 cell v1",
    version: 1,
    platforms: ["pmd-85"],
    compatibleDitherEngineIds: [
      "none-discrete-v2",
      "ordered-strict-matrix-v6",
      "ordered-void-cluster-v1",
      "artistic-ordered-hybrid-v1",
      "error-diffusion-decorrelated-v3",
    ],
    defaultDitherEngineId: "error-diffusion-decorrelated-v3",
    lifecycle: "promoted",
  },
  {
    id: "zx-adaptive-v1",
    name: "Adaptive baseline v1",
    version: 1,
    platforms: ["zx-spectrum"],
  },
  {
    id: "zx-source-cell-v1",
    name: "Source cell v1",
    version: 1,
    platforms: ["zx-spectrum"],
  },
  {
    id: "zx-guide-local-v1",
    name: "Local guide v1",
    version: 1,
    platforms: ["zx-spectrum"],
  },
  {
    id: "zx-guide-reference-halo-v1",
    name: "Reference guide + halo v1",
    version: 1,
    platforms: ["zx-spectrum"],
    lifecycle: "promoted",
  },
  {
    id: "zx-guide-reference-halo-v2",
    name: "Reference guide + stronger halo v2",
    version: 2,
    platforms: ["zx-spectrum"],
    lifecycle: "legacy",
  },
  {
    id: "zx-guide-reference-rgb-halo-v3",
    name: "Reference guide + RGB-guarded halo v3 · experimental",
    version: 3,
    platforms: ["zx-spectrum"],
    lifecycle: "experimental",
    effectiveParameterIds: ["attribute-optimizer"],
  },
  {
    id: "zx-block-dbs-global-v1",
    name: "Legal-mask block DBS v1 · experimental",
    version: 1,
    platforms: ["zx-spectrum"],
    family: "zx-block-dbs-coupled",
    compatibleDitherEngineIds: ["pattern-legal-mask-dbs-v1"],
    defaultDitherEngineId: "pattern-legal-mask-dbs-v1",
    lifecycle: "experimental",
    targetModeIds: ["zx48-standard-256x192"],
  },
  {
    id: "zx-structured-global-v1",
    name: "Structured global v1 · legacy pixel-dominant",
    version: 1,
    platforms: ["zx-spectrum"],
    family: "zx-structured-coupled",
    compatibleDitherEngineIds: ["ordered-cell-pattern-v1"],
    defaultDitherEngineId: "ordered-cell-pattern-v1",
    targetModeIds: ["zx48-standard-256x192"],
  },
  {
    id: "zx-structured-global-v2",
    name: "Structured global v2 · unanchored mixtures",
    version: 2,
    platforms: ["zx-spectrum"],
    family: "zx-structured-coupled",
    compatibleDitherEngineIds: ["ordered-cell-pattern-v2"],
    defaultDitherEngineId: "ordered-cell-pattern-v2",
    targetModeIds: ["zx48-standard-256x192"],
  },
  {
    id: "zx-structured-global-v3",
    name: "Structured global v3 · source-color balanced",
    version: 3,
    platforms: ["zx-spectrum"],
    family: "zx-structured-coupled",
    compatibleDitherEngineIds: ["ordered-cell-pattern-v3"],
    defaultDitherEngineId: "ordered-cell-pattern-v3",
    targetModeIds: ["zx48-standard-256x192"],
  },
  {
    id: "zx-structured-global-v4",
    name: "Structured global v4 · topology-preserving",
    version: 4,
    platforms: ["zx-spectrum"],
    family: "zx-structured-coupled",
    compatibleDitherEngineIds: ["ordered-cell-pattern-v4"],
    defaultDitherEngineId: "ordered-cell-pattern-v4",
    targetModeIds: ["zx48-standard-256x192"],
  },
] as const;

export const DITHER_ENGINES: readonly DitherEngineDescriptor[] = [
  {
    id: "vertical-spatial-none-v1",
    name: "Vertical spatial no dithering v1",
    version: 1,
    method: "none",
    platforms: ["zx-spectrum", "sinclair-ql", "pmd-85"],
    compatibleAttributeOptimizerIds: [
      "zx-vertical-spatial-uniform-v1",
      "zx-vertical-spatial-detail-v1",
      "ql-vertical-spatial-uniform-v1",
      "pmd85-vertical-spatial-uniform-v1",
    ],
    targetModeIds: [
      "zx48-vertical-spatial-256x192",
      "mode8-vertical-spatial-256x256",
      "mode4-vertical-spatial-512x256",
      "pmd85-2-rgb-vertical-spatial",
      "pmd85-3-rgb-vertical-spatial",
      "pmd85-3-pal-vertical-spatial",
    ],
    lifecycle: "promoted",
  },
  {
    id: "vertical-spatial-ordered-v1",
    name: "Vertical spatial ordered v1",
    version: 1,
    method: "ordered",
    platforms: ["zx-spectrum", "sinclair-ql", "pmd-85"],
    compatibleAttributeOptimizerIds: [
      "zx-vertical-spatial-uniform-v1",
      "zx-vertical-spatial-detail-v1",
      "ql-vertical-spatial-uniform-v1",
      "pmd85-vertical-spatial-uniform-v1",
    ],
    orderedMatrixIds: [
      "checkerboard-2x1", "bayer-2x2", "bayer-4x4", "bayer-8x8",
    ],
    targetModeIds: [
      "zx48-vertical-spatial-256x192",
      "mode8-vertical-spatial-256x256",
      "mode4-vertical-spatial-512x256",
      "pmd85-2-rgb-vertical-spatial",
      "pmd85-3-rgb-vertical-spatial",
      "pmd85-3-pal-vertical-spatial",
    ],
    effectiveParameterIds: ["ordered-matrix", "dithering-amount"],
    lifecycle: "promoted",
  },
  {
    id: "vertical-spatial-error-diffusion-v1",
    name: "Vertical spatial error diffusion v1",
    version: 1,
    method: "error-diffusion",
    platforms: ["zx-spectrum", "sinclair-ql", "pmd-85"],
    compatibleAttributeOptimizerIds: [
      "zx-vertical-spatial-uniform-v1",
      "zx-vertical-spatial-detail-v1",
      "ql-vertical-spatial-uniform-v1",
      "pmd85-vertical-spatial-uniform-v1",
    ],
    targetModeIds: [
      "zx48-vertical-spatial-256x192",
      "mode8-vertical-spatial-256x256",
      "mode4-vertical-spatial-512x256",
      "pmd85-2-rgb-vertical-spatial",
      "pmd85-3-rgb-vertical-spatial",
      "pmd85-3-pal-vertical-spatial",
    ],
    effectiveParameterIds: ["dithering-amount", "error-randomization"],
    lifecycle: "promoted",
  },
  {
    id: "none-v1",
    name: "No dithering legacy v1",
    version: 1,
    method: "none",
    platforms: ["zx-spectrum", "sinclair-ql"],
    equivalenceGroupByTarget: {
      "mode8-256x256": "ql-none-nearest",
      "mode4-512x256": "ql-none-nearest",
      "mode8-mode4-mixed-512x256": "ql-none-nearest",
      "mode8-plain-256x256": "ql-none-nearest",
      "mode4-plain-512x256": "ql-none-nearest",
    },
  },
  {
    id: "none-discrete-v2",
    name: "No dithering discrete v2",
    version: 2,
    method: "none",
    platforms: ["zx-spectrum", "sinclair-ql", "pmd-85"],
    equivalenceGroupByTarget: {
      "mode8-256x256": "ql-none-nearest",
      "mode4-512x256": "ql-none-nearest",
      "mode8-mode4-mixed-512x256": "ql-none-nearest",
      "mode8-plain-256x256": "ql-none-nearest",
      "mode4-plain-512x256": "ql-none-nearest",
    },
  },
  {
    id: "ordered-osg-v1",
    name: "Osg ordered attribute-aware v1",
    version: 1,
    method: "ordered",
    platforms: ["zx-spectrum", "sinclair-ql"],
    equivalenceGroupByTarget: {
      "mode8-256x256": "ql-ordered-osg-unrestricted",
      "mode4-512x256": "ql-ordered-osg-unrestricted",
      "mode8-mode4-mixed-512x256": "ql-ordered-osg-unrestricted",
      "mode8-plain-256x256": "ql-ordered-osg-unrestricted",
      "mode4-plain-512x256": "ql-ordered-osg-unrestricted",
    },
  },
  {
    id: "ordered-unrestricted-v2",
    name: "Osg ordered unrestricted v2",
    version: 2,
    method: "ordered",
    platforms: ["zx-spectrum", "sinclair-ql"],
    equivalenceGroupByTarget: {
      "mode8-256x256": "ql-ordered-osg-unrestricted",
      "mode4-512x256": "ql-ordered-osg-unrestricted",
      "mode8-mode4-mixed-512x256": "ql-ordered-osg-unrestricted",
      "mode8-plain-256x256": "ql-ordered-osg-unrestricted",
      "mode4-plain-512x256": "ql-ordered-osg-unrestricted",
    },
  },
  {
    id: "ordered-local-tone-v3",
    name: "Ordered local-tone mixed v3",
    version: 3,
    method: "ordered",
    platforms: ["zx-spectrum", "sinclair-ql"],
    equivalenceGroupByTarget: {
      "mode8-256x256": "ql-ordered-local-strict",
      "mode4-512x256": "ql-ordered-local-strict",
      "mode8-mode4-mixed-512x256": "ql-ordered-local-strict",
      "mode8-plain-256x256": "ql-ordered-local-strict",
      "mode4-plain-512x256": "ql-ordered-local-strict",
    },
  },
  {
    id: "ordered-palette-pairs-v4",
    name: "Ordered exhaustive palette pairs v4",
    version: 4,
    method: "ordered",
    platforms: ["zx-spectrum", "sinclair-ql"],
  },
  {
    id: "ordered-baseline-additive-v5",
    name: "Ordered baseline-additive mixed v5",
    version: 5,
    method: "ordered",
    platforms: ["zx-spectrum", "sinclair-ql"],
  },
  {
    id: "ordered-strict-matrix-v6",
    name: "Ordered strict-matrix baseline v6",
    version: 6,
    method: "ordered",
    platforms: ["zx-spectrum", "sinclair-ql", "pmd-85"],
    orderedMatrixIds: [
      "checkerboard-2x1", "bayer-2x2", "bayer-4x4", "bayer-8x8",
    ],
    lifecycle: "promoted",
    equivalenceGroupByTarget: {
      "mode8-256x256": "ql-ordered-local-strict",
      "mode4-512x256": "ql-ordered-local-strict",
      "mode8-mode4-mixed-512x256": "ql-ordered-local-strict",
      "mode8-plain-256x256": "ql-ordered-local-strict",
      "mode4-plain-512x256": "ql-ordered-local-strict",
    },
  },
  {
    id: "ordered-coverage-normalized-v7",
    name: "Ordered coverage-normalized v7 · experimental",
    version: 7,
    method: "ordered",
    platforms: ["zx-spectrum", "sinclair-ql"],
    orderedMatrixIds: [
      "checkerboard-2x1", "bayer-2x2", "bayer-4x4", "bayer-8x8",
    ],
    lifecycle: "experimental",
    effectiveParameterIds: ["ordered-matrix", "dithering-amount"],
  },
  {
    id: "ordered-mixed-phase-stable-v8",
    name: "Ordered mixed phase-stable v8",
    version: 8,
    method: "ordered",
    platforms: ["zx-spectrum"],
    targetModeIds: ["zx48-mixed-256x192"],
    orderedMatrixIds: [
      "checkerboard-2x1", "bayer-2x2", "bayer-4x4", "bayer-8x8",
    ],
    lifecycle: "promoted",
    effectiveParameterIds: ["ordered-matrix", "dithering-amount"],
  },
  {
    id: "ordered-clustered-dot-v1",
    name: "Clustered-dot ordered v1 · experimental",
    version: 1,
    method: "ordered",
    platforms: ["zx-spectrum", "sinclair-ql"],
    orderedMatrixIds: ["clustered-dot-4x4", "clustered-dot-8x8"],
    lifecycle: "experimental",
  },
  {
    id: "ordered-void-cluster-v1",
    name: "Void-and-cluster threshold v1 · experimental",
    version: 1,
    method: "ordered",
    platforms: ["zx-spectrum", "sinclair-ql", "pmd-85"],
    orderedMatrixIds: ["void-cluster-8x8"],
    lifecycle: "experimental",
  },
  {
    id: "ordered-cell-pattern-v1",
    name: "Structured cell pattern v1 · legacy response",
    version: 1,
    method: "ordered",
    platforms: ["zx-spectrum"],
    family: "zx-structured-coupled",
    compatibleAttributeOptimizerIds: ["zx-structured-global-v1"],
    targetModeIds: ["zx48-standard-256x192"],
  },
  {
    id: "ordered-cell-pattern-v2",
    name: "Structured cell pattern v2 · unanchored response",
    version: 2,
    method: "ordered",
    platforms: ["zx-spectrum"],
    family: "zx-structured-coupled",
    compatibleAttributeOptimizerIds: ["zx-structured-global-v2"],
    targetModeIds: ["zx48-standard-256x192"],
  },
  {
    id: "ordered-cell-pattern-v3",
    name: "Structured cell pattern v3 · color-anchored",
    version: 3,
    method: "ordered",
    platforms: ["zx-spectrum"],
    family: "zx-structured-coupled",
    compatibleAttributeOptimizerIds: ["zx-structured-global-v3"],
    targetModeIds: ["zx48-standard-256x192"],
  },
  {
    id: "ordered-cell-pattern-v4",
    name: "Structured cell pattern v4 · topology-guided",
    version: 4,
    method: "ordered",
    platforms: ["zx-spectrum"],
    family: "zx-structured-coupled",
    compatibleAttributeOptimizerIds: ["zx-structured-global-v4"],
    targetModeIds: ["zx48-standard-256x192"],
  },
  {
    id: "artistic-ordered-hybrid-v1",
    name: "Artistic ordered hybrid · experimental",
    version: 1,
    method: "ordered",
    platforms: ["zx-spectrum", "sinclair-ql", "pmd-85"],
    compatibleAttributeOptimizerIds: ["zx-source-cell-v1", "zx-guide-local-v1", "zx-adaptive-v1", "zx-guide-reference-halo-v1", "zx-guide-reference-halo-v2", "zx-guide-reference-rgb-halo-v3", "pmd85-cell-v1"],
    lifecycle: "experimental",
    targetModeIds: [
      "zx48-standard-256x192",
      "zx48-mixed-256x192",
      "mode8-plain-256x256",
      "mode4-plain-512x256",
      "mode8-256x256",
      "mode4-512x256",
      "mode8-mode4-mixed-512x256",
    ],
    effectiveParameterIds: ["dithering-amount", "artistic-pattern", "attribute-optimizer"],
  },
  {
    id: "pattern-legal-mask-dbs-v1",
    name: "Legal 2×2 mask DBS v1 · experimental",
    version: 1,
    method: "ordered",
    platforms: ["zx-spectrum"],
    family: "zx-block-dbs-coupled",
    compatibleAttributeOptimizerIds: ["zx-block-dbs-global-v1"],
    lifecycle: "experimental",
    targetModeIds: ["zx48-standard-256x192"],
  },
  {
    id: "error-diffusion-projected-v1",
    name: "Projected error diffusion attribute-aware v1",
    version: 1,
    method: "error-diffusion",
    platforms: ["zx-spectrum", "sinclair-ql"],
  },
  {
    id: "error-diffusion-unrestricted-v2",
    name: "Projected error diffusion unrestricted v2",
    version: 2,
    method: "error-diffusion",
    platforms: ["zx-spectrum", "sinclair-ql"],
  },
  {
    id: "error-diffusion-phase-balanced-v3",
    name: "Projected phase-balanced v3 · experimental",
    version: 3,
    method: "error-diffusion",
    platforms: ["zx-spectrum", "sinclair-ql"],
    lifecycle: "experimental",
    effectiveParameterIds: [
      "dithering-amount", "error-randomization", "error-line-suppression",
    ],
  },
  {
    id: "error-diffusion-phase-balanced-checker-v3-1",
    name: "Phase-balanced checker placement v3.1 · experimental",
    version: 31,
    method: "error-diffusion",
    platforms: ["zx-spectrum", "sinclair-ql"],
    lifecycle: "experimental",
    effectiveParameterIds: [
      "dithering-amount", "error-randomization", "error-line-suppression",
    ],
  },
  {
    id: "error-diffusion-phase-balanced-checker-v3-2",
    name: "Phase-balanced checker quantization v3.2 · experimental",
    version: 32,
    method: "error-diffusion",
    platforms: ["zx-spectrum", "sinclair-ql"],
    lifecycle: "experimental",
    effectiveParameterIds: [
      "dithering-amount", "error-randomization", "error-line-suppression",
    ],
  },
  {
    id: "error-diffusion-phase-balanced-checker-v3-3",
    name: "Phase-balanced checker-only placement v3.3 · experimental",
    version: 33,
    method: "error-diffusion",
    platforms: ["zx-spectrum", "sinclair-ql"],
    lifecycle: "experimental",
    effectiveParameterIds: [
      "dithering-amount", "error-randomization", "error-line-suppression",
    ],
  },
  {
    id: "error-diffusion-checker-phase-v4",
    name: "Checker-phase error diffusion v4 · experimental",
    version: 4,
    method: "error-diffusion",
    platforms: ["zx-spectrum", "sinclair-ql"],
    lifecycle: "experimental",
    effectiveParameterIds: [
      "dithering-amount", "error-randomization", "error-line-suppression",
    ],
  },
  {
    id: "error-diffusion-checker-phase-v4-1",
    name: "Checker-phase artifact correction v4.1 · experimental",
    version: 41,
    method: "error-diffusion",
    platforms: ["zx-spectrum"],
    lifecycle: "experimental",
    effectiveParameterIds: [
      "dithering-amount", "error-randomization", "error-line-suppression",
    ],
  },
  {
    id: "error-diffusion-checker-phase-v4-2",
    name: "Checker-phase column-balanced v4.2 · experimental",
    version: 42,
    method: "error-diffusion",
    platforms: ["zx-spectrum"],
    lifecycle: "experimental",
    effectiveParameterIds: [
      "dithering-amount", "error-randomization", "error-line-suppression",
    ],
  },
  {
    id: "error-diffusion-checker-phase-v4-3",
    name: "Checker-phase direction-neutral v4.3 · experimental",
    version: 43,
    method: "error-diffusion",
    platforms: ["zx-spectrum", "sinclair-ql"],
    lifecycle: "experimental",
    effectiveParameterIds: [
      "dithering-amount", "error-randomization", "error-line-suppression",
    ],
  },
  {
    id: "error-diffusion-checker-phase-v5",
    name: "Balanced checker-phase error diffusion v5 · experimental",
    version: 5,
    method: "error-diffusion",
    platforms: ["zx-spectrum", "sinclair-ql"],
    lifecycle: "experimental",
    effectiveParameterIds: [
      "dithering-amount", "error-randomization", "error-line-suppression",
    ],
  },
  {
    id: "error-diffusion-matrix-guided-v1",
    name: "Matrix-guided error diffusion v1 · experimental",
    version: 1,
    method: "error-diffusion",
    platforms: ["zx-spectrum", "sinclair-ql"],
    lifecycle: "experimental",
    effectiveParameterIds: [
      "ordered-matrix", "dithering-amount", "error-randomization",
      "error-line-suppression",
    ],
  },
  {
    id: "error-diffusion-decorrelated-v3",
    name: "Decorrelated error diffusion v3",
    version: 3,
    method: "error-diffusion",
    platforms: ["zx-spectrum", "sinclair-ql", "pmd-85"],
    lifecycle: "promoted",
  },
  {
    id: "error-diffusion-atkinson-v1",
    name: "Atkinson serpentine v1 · experimental",
    version: 1,
    method: "error-diffusion",
    platforms: ["zx-spectrum", "sinclair-ql"],
    lifecycle: "experimental",
  },
  {
    id: "error-diffusion-riemersma-v1",
    name: "Riemersma Hilbert v1 · experimental",
    version: 1,
    method: "error-diffusion",
    platforms: ["zx-spectrum"],
    lifecycle: "experimental",
  },
] as const;

export function ditherMethodForEngine(id: DitherEngineId): DitheringMethod {
  const engine = DITHER_ENGINES.find((candidate) => candidate.id === id);
  if (!engine) throw new RangeError(`Unknown dither engine: ${id}.`);
  return engine.method;
}

export function latestDitherEngineForMethod(
  method: DitheringMethod,
): DitherEngineId {
  const engine = [...DITHER_ENGINES]
    .reverse()
    .find((candidate) =>
      candidate.method === method &&
      candidate.lifecycle !== "experimental" &&
      candidate.targetModeIds === undefined &&
      !("compatibleAttributeOptimizerIds" in candidate)
    );
  if (!engine) throw new RangeError(`No dither engine supports method: ${method}.`);
  return engine.id;
}

export function assertCompatibleEngines(
  platformId: PlatformId,
  attributeOptimizerId: AttributeOptimizerId,
  ditherEngineId: DitherEngineId,
): void {
  const dither = DITHER_ENGINES.find((candidate) => candidate.id === ditherEngineId);
  if (!dither?.platforms.includes(platformId as never)) {
    throw new RangeError(`Dither engine ${ditherEngineId} does not support ${platformId}.`);
  }
  if (platformId === "zx-spectrum" || platformId === "pmd-85") {
    const optimizer = ATTRIBUTE_OPTIMIZERS.find(
      (candidate) => candidate.id === attributeOptimizerId,
    );
    if (!optimizer) throw new RangeError(`Unknown attribute optimizer: ${attributeOptimizerId}.`);
    if (!isCompatibleEnginePair(attributeOptimizerId, ditherEngineId)) {
      throw new RangeError(
        `Attribute optimizer ${attributeOptimizerId} is incompatible with dither engine ${ditherEngineId}.`,
      );
    }
  }
}

export function isCompatibleEnginePair(
  attributeOptimizerId: AttributeOptimizerId,
  ditherEngineId: DitherEngineId,
): boolean {
  const optimizer = ATTRIBUTE_OPTIMIZERS.find(
    (candidate) => candidate.id === attributeOptimizerId,
  ) as AttributeOptimizerDescriptor | undefined;
  const dither = DITHER_ENGINES.find(
    (candidate) => candidate.id === ditherEngineId,
  ) as DitherEngineDescriptor | undefined;
  if (!optimizer || !dither) return false;
  if (
    optimizer.compatibleDitherEngineIds !== undefined &&
    !optimizer.compatibleDitherEngineIds.includes(ditherEngineId as never)
  ) return false;
  if (
    dither.compatibleAttributeOptimizerIds !== undefined &&
    !dither.compatibleAttributeOptimizerIds.includes(attributeOptimizerId as never)
  ) return false;
  const optimizerIsCoupled = optimizer.family !== undefined;
  const ditherIsCoupled = dither.family !== undefined;
  return optimizerIsCoupled === ditherIsCoupled &&
    (!optimizerIsCoupled || optimizer.family === dither.family);
}
