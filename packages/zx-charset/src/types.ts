import type { ZxScreen } from "@retro-converter/zx-spectrum";

export type CharsetEncoding = "compact" | "extended";
export type CharsetSource = "existing" | "derived";
export type DerivedCharsetStrategy =
  | "frequency"
  | "best-coverage"
  | "image-similarity-v2"
  | "image-similarity-v3"
  | "image-similarity-v4"
  | "image-similarity-v5";
export type CharsetDistanceMetric =
  | "hamming"
  | "hybrid"
  | "image-similarity-v2"
  | "image-similarity-v3"
  | "image-similarity-v4"
  | "image-similarity-v5";
export type TileTransform = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface CharsetConversionOptions {
  readonly source: CharsetSource;
  readonly existingCharset?: Uint8Array;
  readonly existingCharsetRange?: {
    readonly startIndex: number;
    readonly length: number;
  };
  readonly existingCharsetSelection?: {
    readonly indices: readonly number[];
  };
  readonly characterBudget: number;
  readonly encoding: CharsetEncoding;
  readonly allowTransforms: boolean;
  readonly allowPolarity: boolean;
  readonly derivedStrategy: DerivedCharsetStrategy;
  readonly distanceMetric: CharsetDistanceMetric;
  readonly visualWeighting: boolean;
  readonly swapRefinementPasses?: number;
}

export interface CharsetAssignment {
  readonly characterIndex: number;
  readonly transform: TileTransform;
  readonly inverted: boolean;
  readonly distance: number;
  readonly hamming: number;
}

export interface CharsetMemoryReport {
  readonly tilemapBytes: number;
  readonly attributeBytes: number;
  readonly transformBytes: number;
  readonly charsetBytes: number;
  readonly totalBytes: number;
}

export interface CharsetDiagnostics {
  readonly edited?: boolean;
  readonly uniqueCanonicalTiles: number;
  readonly usedCharacterCount: number;
  readonly exactMatches: number;
  readonly averageStructuralError: number;
  readonly maximumStructuralError: number;
  readonly rgbSquaredError: number;
  readonly rgbRmse: number;
  readonly rgbSimilarityPercent: number;
  readonly polaritySwaps: number;
  readonly transformHistogram: readonly number[];
  readonly globalObjective?: number;
  readonly refinementPasses?: number;
  readonly initialRgbSquaredError?: number;
  readonly finalRgbSquaredError?: number;
  readonly multiscaleError?: number;
  readonly edgeError?: number;
  readonly rgbBoundaryError?: number;
  readonly saliencyError?: number;
  readonly medoidSwaps?: number;
  readonly assignmentChanges?: number;
  readonly candidatesEvaluated?: number;
  readonly equivalentCandidatesPruned?: number;
  readonly cellsRecomputed?: number;
  readonly boundaryTermsRecomputed?: number;
  readonly candidateCacheHits?: number;
  readonly candidateSetsPrepared?: number;
  readonly memory: CharsetMemoryReport;
}

export interface CharsetArtifact {
  readonly encoding: CharsetEncoding;
  readonly transformations: boolean;
  readonly characterCount: number;
  readonly bytes: Uint8Array;
  readonly tilemap: Uint8Array;
  readonly attributes: Uint8Array;
  readonly transforms: Uint8Array;
  readonly charset: Uint8Array;
}

export interface CharsetConversionResult {
  readonly artifact: CharsetArtifact;
  readonly assignments: readonly CharsetAssignment[];
  readonly decodedScreen: ZxScreen;
  readonly decodedScr: Uint8Array;
  readonly previewRgba: Uint8Array;
  readonly diagnostics: CharsetDiagnostics;
}

export interface CharsetDecodeOptions {
  readonly encoding: CharsetEncoding;
  readonly characterCount: number;
  readonly transformations: boolean;
}
