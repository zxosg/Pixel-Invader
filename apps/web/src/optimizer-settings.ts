import { type AttributeOptimizerId, type StructuredConversionSettings } from "@retro-converter/conversion-core";

export function structuredSettingsForOptimizer(
  id: AttributeOptimizerId,
  current: StructuredConversionSettings,
): StructuredConversionSettings {
  const isVersion4 = id === "zx-structured-global-v4";
  const isVersion3 = id === "zx-structured-global-v3";
  const isVersion2 = id === "zx-structured-global-v2";
  if (
    id !== "zx-structured-global-v1" &&
    !isVersion2 &&
    !isVersion3 &&
    !isVersion4
  ) return current;
  return {
    ...current,
    ditherResponseCurveId: isVersion2 || isVersion3 || isVersion4
      ? "power-035-percent-v2"
      : "power-065-percent-v1",
    colorAnchorModelId: isVersion3 || isVersion4
      ? "srgb-squared-v1"
      : "none-v1",
    structuralModelId: isVersion4 ? "palette-topology-v1" : "none-v1",
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
  };
}
