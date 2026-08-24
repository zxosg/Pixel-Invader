import { ZX_ATTRIBUTE_COLUMNS, ZX_SCREEN_HEIGHT, ZX_SCREEN_WIDTH } from "@retro-converter/zx-spectrum";
import { zxColor } from "./palette.js";
import { ORDERED_MATRICES, orderedThreshold } from "./matrices.js";
import type {
  AttributeHeight,
  BrightMode,
  OptimizationLevel,
  OrderedMatrixId,
  StructuredConversionSettings,
  StructuredDiagnostics,
} from "./types.js";

const W = 1024;
const RESPONSE_CURVE_065 = [
  1024,973,943,919,898,878,860,842,826,810,795,780,766,752,739,726,713,
  700,688,676,664,653,641,630,619,608,597,587,576,566,556,546,536,526,
  516,506,497,487,478,469,460,450,441,432,423,415,406,397,389,380,371,
  363,355,346,338,330,322,313,305,297,289,281,273,266,258,250,242,235,
  227,219,212,204,197,189,182,175,167,160,153,145,138,131,124,117,110,
  103,96,89,82,75,68,61,54,47,40,34,27,20,13,7,0,
] as const;
const RESPONSE_CURVE_035 = [
  1024,820,764,724,692,665,641,620,601,583,567,551,536,523,509,497,485,
  473,462,451,441,431,421,412,403,394,385,376,368,360,352,344,337,329,
  322,315,308,301,294,288,281,274,268,262,256,250,244,238,232,226,221,
  215,209,204,199,193,188,183,178,173,168,163,158,153,148,143,139,134,
  129,125,120,116,111,107,102,98,94,90,85,81,77,73,69,65,61,57,53,49,
  45,41,37,33,29,26,22,18,15,11,7,4,0,
] as const;

interface Lab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

interface Pair {
  readonly id: number;
  readonly paperCode: number;
  readonly inkCode: number;
  readonly bright: boolean;
  readonly paper: Lab;
  readonly ink: Lab;
  readonly paperRgb: { readonly r: number; readonly g: number; readonly b: number };
  readonly inkRgb: { readonly r: number; readonly g: number; readonly b: number };
  readonly mixtures2: readonly Lab[];
  readonly mixtures4: readonly Lab[];
  readonly contrast: number;
}

interface RenderedCandidate {
  readonly pair: Pair;
  readonly bits: Uint8Array;
  readonly localCost: number;
  readonly deliberateFlips: number;
  readonly components: BlockCostComponents;
}

interface BlockCostComponents {
  readonly pixelCost: number;
  readonly rgbAnchorCost: number;
  readonly patternReferenceCost: number;
  readonly paletteDistributionCost: number;
  readonly luminanceRankCost: number;
  readonly edgePolarityCost: number;
  readonly meanCost: number;
  readonly edgeCost: number;
  readonly deviationFlipCost: number;
  readonly deviationContrastCost: number;
  readonly visibilityCost: number;
}

interface BoundaryCostComponents {
  readonly cost: number;
  readonly excessCost: number;
  readonly sharedEndpointBonus: number;
}

interface StructuredReferences {
  readonly labelKeys: Uint8Array;
  readonly patternKeys: Uint8Array;
  readonly labsByKey: readonly Lab[];
}

export interface StructuredZxOutput {
  readonly pixels: Uint8Array;
  readonly attributes: Uint8Array;
  readonly guideKeys: Uint8Array;
  readonly score: number;
  readonly diagnostics: StructuredDiagnostics;
}

export function validateStructuredSettings(
  settings: StructuredConversionSettings,
): void {
  if (
    settings.schemaVersion !== 1 ||
    !["linear-light-average-v1", "gamma-average-v1"].includes(
      settings.mixtureModelId,
    ) ||
    settings.perceptualModelId !== "oklab-quantized-v1" ||
    !["none-v1", "srgb-squared-v1"].includes(settings.colorAnchorModelId) ||
    !["none-v1", "palette-topology-v1"].includes(settings.structuralModelId) ||
    !["power-065-percent-v1", "power-035-percent-v2"].includes(
      settings.ditherResponseCurveId,
    )
  ) {
    throw new RangeError("Structured algorithm identifiers are invalid.");
  }
  const weights = [
    ...Object.values(settings.oklabWeights),
    ...Object.values(settings.objectiveWeights),
    ...Object.values(settings.boundaryParameters),
    ...Object.values(settings.candidateParameters),
  ];
  if (
    weights.some((weight) =>
      !Number.isInteger(weight) || weight < 0 || weight > 65_536
    )
  ) {
    throw new RangeError("Structured weights must be integers from 0 through 65536.");
  }
  const maximumChannelSquare = 4096 * 4096;
  const maximumDistanceNumerator =
    (settings.oklabWeights.l +
      settings.oklabWeights.a +
      settings.oklabWeights.b) *
    maximumChannelSquare;
  if (
    settings.boundaryParameters.edgeAttenuation > W ||
    settings.candidateParameters.strongEdgeThreshold > W ||
    settings.candidateParameters.importantMassPermille > 1000 ||
    settings.candidateParameters.localAdmissibilityPermille > 1000 ||
    settings.candidateParameters.boundaryCapPermille > 1000
  ) {
    throw new RangeError("Structured normalized parameters exceed their scale.");
  }
  const maximumDistance = roundDiv(maximumDistanceNumerator, W);
  const maximumWeight = Math.max(...Object.values(settings.objectiveWeights));
  const maximumPixelAndBlockTerms =
    roundDiv(maximumWeight * maximumDistance * ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT * 8, W);
  const maximumBoundaryTerms =
    roundDiv(maximumWeight * maximumDistance * 8 * 2 * ZX_ATTRIBUTE_COLUMNS * ZX_SCREEN_HEIGHT, W);
  const maximumTotal = (maximumPixelAndBlockTerms + maximumBoundaryTerms) * 4;
  if (
    !Number.isSafeInteger(maximumDistanceNumerator) ||
    !Number.isSafeInteger(maximumTotal)
  ) {
    throw new RangeError(
      "Structured settings can exceed the safe integer range.",
    );
  }
}

function roundDiv(value: number, divisor: number): number {
  return Math.floor((value + Math.floor(divisor / 2)) / divisor);
}

function srgbToLinear(value: number): number {
  const encoded = value / 255;
  return encoded <= 0.04045
    ? encoded / 12.92
    : ((encoded + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
  const encoded = value <= 0.0031308
    ? value * 12.92
    : 1.055 * value ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(encoded * 255)));
}

export function quantizedOklab(r: number, g: number, b: number): Lab {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return {
    l: Math.round(Math.max(0, Math.min(1, 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s)) * 4096),
    a: Math.round(Math.max(-0.5, Math.min(0.5, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s)) * 4096),
    b: Math.round(Math.max(-0.5, Math.min(0.5, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s)) * 4096),
  };
}

function labDistance(
  left: Lab,
  right: Lab,
  settings: StructuredConversionSettings,
): number {
  const dl = left.l - right.l;
  const da = left.a - right.a;
  const db = left.b - right.b;
  return roundDiv(
    settings.oklabWeights.l * dl * dl +
    settings.oklabWeights.a * da * da +
    settings.oklabWeights.b * db * db,
    W,
  );
}

function mixedLab(
  first: { readonly r: number; readonly g: number; readonly b: number },
  second: { readonly r: number; readonly g: number; readonly b: number },
  numerator: number,
  denominator: number,
  model: StructuredConversionSettings["mixtureModelId"],
): Lab {
  if (model === "gamma-average-v1") {
    return quantizedOklab(
      roundDiv(first.r * (denominator - numerator) + second.r * numerator, denominator),
      roundDiv(first.g * (denominator - numerator) + second.g * numerator, denominator),
      roundDiv(first.b * (denominator - numerator) + second.b * numerator, denominator),
    );
  }
  const channel = (a: number, b: number) => linearToSrgb(
    (
      srgbToLinear(a) * (denominator - numerator) +
      srgbToLinear(b) * numerator
    ) / denominator,
  );
  return quantizedOklab(
    channel(first.r, second.r),
    channel(first.g, second.g),
    channel(first.b, second.b),
  );
}

function legalPairs(
  enabled: ReadonlySet<number>,
  brightMode: BrightMode,
  settings: StructuredConversionSettings,
): readonly Pair[] {
  const brightValues = brightMode === "on"
    ? [true]
    : brightMode === "off" ? [false] : [false, true];
  const pairs: Pair[] = [];
  const seen = new Set<string>();
  for (const bright of brightValues) {
    for (let paperCode = 0; paperCode < 8; paperCode += 1) {
      if (!enabled.has(paperCode)) continue;
      for (let inkCode = paperCode; inkCode < 8; inkCode += 1) {
        if (!enabled.has(inkCode)) continue;
        if (paperCode === 0 && inkCode === 0 && bright) continue;
        const paperRgb = zxColor(paperCode, bright);
        const inkRgb = zxColor(inkCode, bright);
        const visualKey = `${paperRgb.r},${paperRgb.g},${paperRgb.b}:${inkRgb.r},${inkRgb.g},${inkRgb.b}`;
        if (seen.has(visualKey)) continue;
        seen.add(visualKey);
        const paper = quantizedOklab(paperRgb.r, paperRgb.g, paperRgb.b);
        const ink = quantizedOklab(inkRgb.r, inkRgb.g, inkRgb.b);
        pairs.push({
          id: (bright ? 64 : 0) + paperCode * 8 + inkCode,
          paperCode,
          inkCode,
          bright,
          paper,
          ink,
          paperRgb,
          inkRgb,
          mixtures2: [paper, mixedLab(paperRgb, inkRgb, 1, 2, settings.mixtureModelId), ink],
          mixtures4: [
            paper,
            mixedLab(paperRgb, inkRgb, 1, 4, settings.mixtureModelId),
            mixedLab(paperRgb, inkRgb, 1, 2, settings.mixtureModelId),
            mixedLab(paperRgb, inkRgb, 3, 4, settings.mixtureModelId),
            ink,
          ],
          contrast: labDistance(paper, ink, settings),
        });
      }
    }
  }
  return pairs.sort((left, right) => left.id - right.id);
}

function createStructuredReferences(
  source: Uint8Array,
  enabled: ReadonlySet<number>,
  brightMode: BrightMode,
  amountPermille: number,
  matrixId: OrderedMatrixId,
): StructuredReferences {
  const brightValues = brightMode === "on"
    ? [true]
    : brightMode === "off" ? [false] : [false, true];
  const colors: {
    readonly key: number;
    readonly rgb: { readonly r: number; readonly g: number; readonly b: number };
    readonly lab: Lab;
  }[] = [];
  const seen = new Set<string>();
  const labsByKey: Lab[] = Array.from(
    { length: 16 },
    () => quantizedOklab(0, 0, 0),
  );
  for (const bright of brightValues) {
    for (let code = 0; code < 8; code += 1) {
      if (!enabled.has(code)) continue;
      const rgb = zxColor(code, bright);
      const visual = `${rgb.r},${rgb.g},${rgb.b}`;
      if (seen.has(visual)) continue;
      seen.add(visual);
      const key = code + (bright ? 8 : 0);
      const lab = quantizedOklab(rgb.r, rgb.g, rgb.b);
      labsByKey[key] = lab;
      colors.push({ key, rgb, lab });
    }
  }
  colors.sort((left, right) => left.key - right.key);
  const labelKeys = new Uint8Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT);
  const patternKeys = new Uint8Array(labelKeys.length);
  const matrix = ORDERED_MATRICES[matrixId];
  const amountPercent = Math.round(amountPermille / 10);
  const levelTable = new Int16Array(2 * 8 * (matrix.levels + 1) * 3);
  const levelOffset = (
    bright: boolean,
    code: number,
    level: number,
    channel: number,
  ): number =>
    ((((bright ? 1 : 0) * 8 + code) * (matrix.levels + 1) + level) * 3 + channel);
  const base = Math.floor((100 - amountPercent) * 64 / 100);
  for (const bright of [false, true]) {
    for (let code = 0; code < 8; code += 1) {
      const color = zxColor(code, bright);
      for (let level = 0; level <= matrix.levels; level += 1) {
        for (const [channel, value] of [color.r, color.g, color.b].entries()) {
          levelTable[levelOffset(bright, code, level, channel)] =
            Math.floor(
              Math.floor(level * value / matrix.levels) *
                amountPercent /
                100,
            ) + base;
        }
      }
    }
  }
  const candidateSets = [false, true].map((bright) => {
    const red: number[] = [];
    const green: number[] = [];
    const blue: number[] = [];
    const first: number[] = [];
    const second: number[] = [];
    const pattern: number[] = [];
    const seenMixtures = new Set<string>();
    for (const firstCode of enabled) {
      for (const secondCode of enabled) {
        for (let level = 0; level < matrix.levels; level += 1) {
          const inverseLevel = matrix.levels - level;
          const mixedR =
            (levelTable[levelOffset(bright, firstCode, inverseLevel, 0)] ?? 0) +
            (levelTable[levelOffset(bright, secondCode, level, 0)] ?? 0);
          const mixedG =
            (levelTable[levelOffset(bright, firstCode, inverseLevel, 1)] ?? 0) +
            (levelTable[levelOffset(bright, secondCode, level, 1)] ?? 0);
          const mixedB =
            (levelTable[levelOffset(bright, firstCode, inverseLevel, 2)] ?? 0) +
            (levelTable[levelOffset(bright, secondCode, level, 2)] ?? 0);
          const mixtureKey = `${mixedR},${mixedG},${mixedB}`;
          if (seenMixtures.has(mixtureKey)) continue;
          seenMixtures.add(mixtureKey);
          red.push(mixedR);
          green.push(mixedG);
          blue.push(mixedB);
          first.push(firstCode);
          second.push(secondCode);
          pattern.push(level);
        }
      }
    }
    return { red, green, blue, first, second, pattern };
  });
  for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
    for (let x = 0; x < ZX_SCREEN_WIDTH; x += 1) {
      const pixel = y * ZX_SCREEN_WIDTH + x;
      const offset = pixel * 4;
      const r = source[offset] ?? 0;
      const g = source[offset + 1] ?? 0;
      const b = source[offset + 2] ?? 0;
      let first = colors[0]!;
      let firstDistance = Number.POSITIVE_INFINITY;
      for (const color of colors) {
        const dr = r - color.rgb.r;
        const dg = g - color.rgb.g;
        const db = b - color.rgb.b;
        const distance = dr * dr + dg * dg + db * db;
        if (
          distance < firstDistance ||
          (distance === firstDistance && color.key < first.key)
        ) {
          first = color;
          firstDistance = distance;
        }
      }
      labelKeys[pixel] = first.key;
      if (amountPermille === 0) {
        patternKeys[pixel] = first.key;
        continue;
      }
      let bestDistance = Number.POSITIVE_INFINITY;
      let bestBright = brightValues[0] ?? false;
      let firstCode = 0;
      let secondCode = 0;
      let patternLevel = 0;
      for (const bright of brightValues) {
        const candidates = candidateSets[bright ? 1 : 0]!;
        for (let candidate = 0; candidate < candidates.red.length; candidate += 1) {
          const dr = r - (candidates.red[candidate] ?? 0);
          const dg = g - (candidates.green[candidate] ?? 0);
          const db = b - (candidates.blue[candidate] ?? 0);
          const distance = dr * dr + dg * dg + db * db;
          if (distance < bestDistance) {
            bestDistance = distance;
            bestBright = bright;
            firstCode = candidates.first[candidate] ?? 0;
            secondCode = candidates.second[candidate] ?? 0;
            patternLevel = candidates.pattern[candidate] ?? 0;
          }
        }
      }
      const outputCode =
        orderedThreshold(matrix, x, y) + 1 > patternLevel
          ? firstCode
          : secondCode;
      patternKeys[pixel] = outputCode + (bestBright ? 8 : 0);
    }
  }
  return { labelKeys, patternKeys, labsByKey };
}

function sourceLabs(source: Uint8Array): readonly Lab[] {
  const output: Lab[] = [];
  for (let offset = 0; offset < source.length; offset += 4) {
    output.push(quantizedOklab(
      source[offset] ?? 0,
      source[offset + 1] ?? 0,
      source[offset + 2] ?? 0,
    ));
  }
  return output;
}

function sourceEdgeImportance(labs: readonly Lab[]): Uint16Array {
  const output = new Uint16Array(labs.length);
  for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
    for (let x = 0; x < ZX_SCREEN_WIDTH; x += 1) {
      const index = y * ZX_SCREEN_WIDTH + x;
      const center = labs[index]!;
      let strongest = 0;
      if (x > 0) strongest = Math.max(strongest, Math.abs(center.l - labs[index - 1]!.l));
      if (x + 1 < ZX_SCREEN_WIDTH) strongest = Math.max(strongest, Math.abs(center.l - labs[index + 1]!.l));
      if (y > 0) strongest = Math.max(strongest, Math.abs(center.l - labs[index - ZX_SCREEN_WIDTH]!.l));
      if (y + 1 < ZX_SCREEN_HEIGHT) strongest = Math.max(strongest, Math.abs(center.l - labs[index + ZX_SCREEN_WIDTH]!.l));
      output[index] = Math.min(W, roundDiv(strongest * W, 4096));
    }
  }
  return output;
}

function hamming(left: number, right: number): number {
  let value = left ^ right;
  let count = 0;
  while (value !== 0) {
    count += value & 1;
    value >>>= 1;
  }
  return count;
}

function popcount(value: number): number {
  return hamming(value, 0);
}

function alternatingEdges(mask: number, blockWidth: number, blockHeight: number): number {
  let count = 0;
  for (let y = 0; y < blockHeight; y += 1) {
    for (let x = 0; x < blockWidth; x += 1) {
      const bit = (mask >> (y * blockWidth + x)) & 1;
      if (x + 1 < blockWidth && bit !== ((mask >> (y * blockWidth + x + 1)) & 1)) count += 1;
      if (y + 1 < blockHeight && bit !== ((mask >> ((y + 1) * blockWidth + x)) & 1)) count += 1;
    }
  }
  return count;
}

function bestBlockMask(
  labs: readonly Lab[],
  sourceRgba: Uint8Array,
  references: StructuredReferences | null,
  indices: readonly number[],
  pair: Pair,
  amountPermille: number,
  blockWidth: number,
  blockHeight: number,
  settings: StructuredConversionSettings,
): {
  readonly mask: number;
  readonly cost: number;
  readonly flips: number;
  readonly components: BlockCostComponents;
} {
  let baseline = 0;
  for (let local = 0; local < indices.length; local += 1) {
    const source = labs[indices[local]!]!;
    if (labDistance(source, pair.paper, settings) > labDistance(source, pair.ink, settings)) {
      baseline |= 1 << local;
    }
  }
  const responseIndex = Math.max(0, Math.min(100, Math.round(amountPermille / 10)));
  const responseCurve = settings.ditherResponseCurveId === "power-035-percent-v2"
    ? RESPONSE_CURVE_035
    : RESPONSE_CURVE_065;
  const response = responseCurve[responseIndex] ?? 0;
  const maximumMask = 1 << indices.length;
  const firstMask = amountPermille === 0 ? baseline : 0;
  const lastMask = amountPermille === 0 ? baseline + 1 : maximumMask;
  let bestMask = baseline;
  let bestCost = Number.POSITIVE_INFINITY;
  let bestFlips = 0;
  let bestVisibility = 0;
  let bestComponents: BlockCostComponents = {
    pixelCost: 0,
    rgbAnchorCost: 0,
    patternReferenceCost: 0,
    paletteDistributionCost: 0,
    luminanceRankCost: 0,
    edgePolarityCost: 0,
    meanCost: 0,
    edgeCost: 0,
    deviationFlipCost: 0,
    deviationContrastCost: 0,
    visibilityCost: 0,
  };
  for (let mask = firstMask; mask < lastMask; mask += 1) {
    let pixelError = 0;
    let rgbAnchorError = 0;
    let patternReferenceError = 0;
    let sourceL = 0;
    for (let local = 0; local < indices.length; local += 1) {
      const source = labs[indices[local]!]!;
      sourceL += source.l;
      pixelError += labDistance(
        source,
        ((mask >> local) & 1) === 1 ? pair.ink : pair.paper,
        settings,
      );
      const sourceOffset = indices[local]! * 4;
      const outputRgb = ((mask >> local) & 1) === 1
        ? pair.inkRgb
        : pair.paperRgb;
      const output = ((mask >> local) & 1) === 1
        ? pair.ink
        : pair.paper;
      const dr = (sourceRgba[sourceOffset] ?? 0) - outputRgb.r;
      const dg = (sourceRgba[sourceOffset + 1] ?? 0) - outputRgb.g;
      const db = (sourceRgba[sourceOffset + 2] ?? 0) - outputRgb.b;
      if (settings.colorAnchorModelId === "srgb-squared-v1") {
        rgbAnchorError += (dr * dr + dg * dg + db * db) * 64;
      }
      if (references !== null) {
        const referenceKey = references.patternKeys[indices[local]!] ?? 0;
        patternReferenceError += labDistance(
          output,
          references.labsByKey[referenceKey] ?? references.labsByKey[0]!,
          settings,
        );
      }
    }
    const density = popcount(mask);
    const mixture = blockWidth * blockHeight === 4
      ? pair.mixtures4[density]!
      : pair.mixtures2[density]!;
    const meanSource: Lab = {
      l: roundDiv(sourceL, indices.length),
      a: roundDiv(indices.reduce((sum, index) => sum + labs[index]!.a, 0), indices.length),
      b: roundDiv(indices.reduce((sum, index) => sum + labs[index]!.b, 0), indices.length),
    };
    const meanError = labDistance(meanSource, mixture, settings);
    let edgeError = 0;
    let luminanceRankError = 0;
    let edgePolarityError = 0;
    for (let y = 0; y < blockHeight; y += 1) {
      for (let x = 0; x < blockWidth; x += 1) {
        const local = y * blockWidth + x;
        const source = labs[indices[local]!]!;
        const output = ((mask >> local) & 1) === 1 ? pair.ink : pair.paper;
        if (x + 1 < blockWidth) {
          const next = y * blockWidth + x + 1;
          const sourceDelta = source.l - labs[indices[next]!]!.l;
          const outputDelta = output.l - (((mask >> next) & 1) === 1 ? pair.ink : pair.paper).l;
          edgeError += Math.abs(Math.abs(sourceDelta) - Math.abs(outputDelta));
          luminanceRankError += Math.abs(sourceDelta - outputDelta);
          if (sourceDelta !== 0 && sourceDelta * outputDelta <= 0) {
            edgePolarityError += Math.abs(sourceDelta);
          }
        }
        if (y + 1 < blockHeight) {
          const next = (y + 1) * blockWidth + x;
          const sourceDelta = source.l - labs[indices[next]!]!.l;
          const outputDelta = output.l - (((mask >> next) & 1) === 1 ? pair.ink : pair.paper).l;
          edgeError += Math.abs(Math.abs(sourceDelta) - Math.abs(outputDelta));
          luminanceRankError += Math.abs(sourceDelta - outputDelta);
          if (sourceDelta !== 0 && sourceDelta * outputDelta <= 0) {
            edgePolarityError += Math.abs(sourceDelta);
          }
        }
      }
    }
    const flips = hamming(mask, baseline);
    const visibility = alternatingEdges(mask, blockWidth, blockHeight) * pair.contrast;
    const weights = settings.objectiveWeights;
    const components: BlockCostComponents = {
      pixelCost: roundDiv(weights.pixel * pixelError, W),
      rgbAnchorCost: roundDiv(weights.rgbAnchor * rgbAnchorError, W),
      patternReferenceCost: roundDiv(
        weights.patternReference * patternReferenceError,
        W,
      ),
      paletteDistributionCost: 0,
      luminanceRankCost: roundDiv(
        weights.luminanceRank * luminanceRankError * 64,
        W,
      ),
      edgePolarityCost: roundDiv(
        weights.edgePolarity * edgePolarityError * 64,
        W,
      ),
      meanCost: roundDiv(weights.mean * meanError, W),
      edgeCost: roundDiv(weights.edge * edgeError, W),
      deviationFlipCost: roundDiv(response * weights.deviationFlip * flips, W),
      deviationContrastCost: roundDiv(
        response *
          roundDiv(weights.deviationContrast * pair.contrast * flips, W),
        W,
      ),
      visibilityCost: roundDiv(weights.visibility * visibility, W),
    };
    const cost = Object.values(components).reduce((sum, value) => sum + value, 0);
    if (
      cost < bestCost ||
      (
        cost === bestCost &&
        (
          flips < bestFlips ||
          (flips === bestFlips && visibility < bestVisibility) ||
          (flips === bestFlips && visibility === bestVisibility && mask < bestMask)
        )
      )
    ) {
      bestCost = cost;
      bestMask = mask;
      bestFlips = flips;
      bestVisibility = visibility;
      bestComponents = components;
    }
  }
  return {
    mask: bestMask,
    cost: bestCost,
    flips: bestFlips,
    components: bestComponents,
  };
}

function cellPixelIndices(cellX: number, cellY: number, cellHeight: number): number[] {
  const indices: number[] = [];
  for (let y = 0; y < cellHeight; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      indices.push((cellY * cellHeight + y) * ZX_SCREEN_WIDTH + cellX * 8 + x);
    }
  }
  return indices;
}

function lowerBound(
  labs: readonly Lab[],
  indices: readonly number[],
  pair: Pair,
  blockHeight: number,
  settings: StructuredConversionSettings,
): number {
  const mixtures = blockHeight === 1 ? pair.mixtures2 : pair.mixtures4;
  let cost = 0;
  for (const index of indices) {
    let best = Number.POSITIVE_INFINITY;
    for (const mixture of mixtures) {
      best = Math.min(best, labDistance(labs[index]!, mixture, settings));
    }
    cost += best;
  }
  return cost;
}

function renderCell(
  labs: readonly Lab[],
  sourceRgba: Uint8Array,
  references: StructuredReferences | null,
  cellX: number,
  cellY: number,
  cellHeight: number,
  pair: Pair,
  amountPermille: number,
  settings: StructuredConversionSettings,
): RenderedCandidate {
  const bits = new Uint8Array(8 * cellHeight);
  const blockHeight = cellHeight === 1 ? 1 : 2;
  let localCost = 0;
  let deliberateFlips = 0;
  const components: Record<keyof BlockCostComponents, number> = {
    pixelCost: 0,
    rgbAnchorCost: 0,
    patternReferenceCost: 0,
    paletteDistributionCost: 0,
    luminanceRankCost: 0,
    edgePolarityCost: 0,
    meanCost: 0,
    edgeCost: 0,
    deviationFlipCost: 0,
    deviationContrastCost: 0,
    visibilityCost: 0,
  };
  for (let by = 0; by < cellHeight; by += blockHeight) {
    for (let bx = 0; bx < 8; bx += 2) {
      const indices: number[] = [];
      for (let y = 0; y < blockHeight; y += 1) {
        for (let x = 0; x < 2; x += 1) {
          indices.push(
            (cellY * cellHeight + by + y) * ZX_SCREEN_WIDTH +
            cellX * 8 + bx + x,
          );
        }
      }
      const selected = bestBlockMask(
        labs,
        sourceRgba,
        references,
        indices,
        pair,
        amountPermille,
        2,
        blockHeight,
        settings,
      );
      localCost += selected.cost;
      deliberateFlips += selected.flips;
      for (const key of Object.keys(components) as (keyof BlockCostComponents)[]) {
        components[key] += selected.components[key];
      }
      for (let local = 0; local < indices.length; local += 1) {
        const localY = Math.floor(local / 2);
        const localX = local % 2;
        bits[(by + localY) * 8 + bx + localX] =
          (selected.mask >> local) & 1;
      }
    }
  }
  if (references !== null) {
    const sourceCounts = new Uint16Array(16);
    for (let localY = 0; localY < cellHeight; localY += 1) {
      for (let localX = 0; localX < 8; localX += 1) {
        const globalIndex =
          (cellY * cellHeight + localY) * ZX_SCREEN_WIDTH +
          cellX * 8 + localX;
        const sourceKey = references.labelKeys[globalIndex] ?? 0;
        sourceCounts[sourceKey] = (sourceCounts[sourceKey] ?? 0) + 1;
      }
    }
    let paletteMismatch = 0;
    for (let key = 0; key < sourceCounts.length; key += 1) {
      const count = sourceCounts[key] ?? 0;
      if (count === 0) continue;
      const label = references.labsByKey[key] ?? references.labsByKey[0]!;
      paletteMismatch += count * Math.min(
        labDistance(label, pair.paper, settings),
        labDistance(label, pair.ink, settings),
      );
    }
    const distributionCost = roundDiv(
      settings.objectiveWeights.paletteDistribution *
        paletteMismatch,
      W,
    );
    components.paletteDistributionCost += distributionCost;
    localCost += distributionCost;
  }
  return { pair, bits, localCost, deliberateFlips, components };
}

function boundaryCost(
  left: RenderedCandidate,
  right: RenderedCandidate,
  direction: "horizontal" | "vertical",
  firstCellX: number,
  firstCellY: number,
  cellHeight: number,
  source: readonly Lab[],
  edgeImportance: Uint16Array,
  settings: StructuredConversionSettings,
): BoundaryCostComponents {
  const length = direction === "horizontal" ? cellHeight : 8;
  let rendered = 0;
  let sourceDiscontinuity = 0;
  let boundaryEdgeImportance = 0;
  for (let sample = 0; sample < length; sample += 1) {
    const leftIndex = direction === "horizontal"
      ? sample * 8 + 7
      : (cellHeight - 1) * 8 + sample;
    const rightIndex = direction === "horizontal"
      ? sample * 8
      : sample;
    const leftColor = left.bits[leftIndex] === 1 ? left.pair.ink : left.pair.paper;
    const rightColor = right.bits[rightIndex] === 1 ? right.pair.ink : right.pair.paper;
    rendered += labDistance(leftColor, rightColor, settings);
    const firstX = direction === "horizontal"
      ? firstCellX * 8 + 7
      : firstCellX * 8 + sample;
    const firstY = direction === "horizontal"
      ? firstCellY * cellHeight + sample
      : firstCellY * cellHeight + cellHeight - 1;
    const secondX = direction === "horizontal" ? firstX + 1 : firstX;
    const secondY = direction === "horizontal" ? firstY : firstY + 1;
    sourceDiscontinuity += labDistance(
      source[firstY * ZX_SCREEN_WIDTH + firstX]!,
      source[secondY * ZX_SCREEN_WIDTH + secondX]!,
      settings,
    );
    boundaryEdgeImportance += Math.max(
      edgeImportance[firstY * ZX_SCREEN_WIDTH + firstX] ?? 0,
      edgeImportance[secondY * ZX_SCREEN_WIDTH + secondX] ?? 0,
    );
  }
  const sameVisualColor = (first: Lab, second: Lab) =>
    first.l === second.l && first.a === second.a && first.b === second.b;
  const leftIsNonDuplicate = !sameVisualColor(left.pair.paper, left.pair.ink);
  const rightIsNonDuplicate = !sameVisualColor(right.pair.paper, right.pair.ink);
  const shared = leftIsNonDuplicate && rightIsNonDuplicate && (
    sameVisualColor(left.pair.paper, right.pair.paper) ||
    sameVisualColor(left.pair.paper, right.pair.ink) ||
    sameVisualColor(left.pair.ink, right.pair.paper) ||
    sameVisualColor(left.pair.ink, right.pair.ink)
  );
  const acceptedSourceDiscontinuity = roundDiv(
    settings.boundaryParameters.sourceDiscontinuityAllowance *
      sourceDiscontinuity,
    W,
  );
  const excess = Math.max(0, rendered - acceptedSourceDiscontinuity);
  const quantizedEdge = roundDiv(boundaryEdgeImportance, length);
  const attenuation = Math.max(
    0,
    W -
      roundDiv(
        settings.boundaryParameters.edgeAttenuation * quantizedEdge,
        W,
      ),
  );
  const excessCost = roundDiv(
    settings.objectiveWeights.boundary * attenuation * excess,
    W * W,
  );
  const sharedEndpointBonus = shared
    ? settings.objectiveWeights.sharedEndpoint
    : 0;
  const uncappedCost = Math.max(0, excessCost - sharedEndpointBonus);
  const boundaryCap = settings.structuralModelId === "palette-topology-v1"
    ? roundDiv(
        Math.min(left.localCost, right.localCost) *
          settings.candidateParameters.boundaryCapPermille,
        1000,
      )
    : Number.MAX_SAFE_INTEGER;
  return {
    cost: Math.min(uncappedCost, boundaryCap),
    excessCost,
    sharedEndpointBonus,
  };
}

function attributeByte(pair: Pair): number {
  return pair.inkCode | (pair.paperCode << 3) | (pair.bright ? 0x40 : 0);
}

export function convertStructuredZx(
  source: Uint8Array,
  cellHeight: AttributeHeight,
  enabledColors: ReadonlySet<number>,
  brightMode: BrightMode,
  amountPermille: number,
  orderedMatrixId: OrderedMatrixId,
  structured: StructuredConversionSettings,
  level: OptimizationLevel,
): StructuredZxOutput {
  validateStructuredSettings(structured);
  if (!Number.isInteger(amountPermille) || amountPermille < 0 || amountPermille > 1000) {
    throw new RangeError("Structured dithering amount must be 0 through 1000 permille.");
  }
  const labs = sourceLabs(source);
  const edgeImportance = sourceEdgeImportance(labs);
  const pairs = legalPairs(enabledColors, brightMode, structured);
  const references = structured.structuralModelId === "palette-topology-v1"
    ? createStructuredReferences(
        source,
        enabledColors,
        brightMode,
        amountPermille,
        orderedMatrixId,
      )
    : null;
  if (pairs.length === 0) throw new RangeError("Structured palette has no legal pair.");
  const rows = ZX_SCREEN_HEIGHT / cellHeight;
  const cellCount = ZX_ATTRIBUTE_COLUMNS * rows;
  const preliminaryLimit = level === "draft" ? 12 : 20;
  const finalLimit = level === "draft" ? 8 : 12;
  const candidates: RenderedCandidate[][] = [];
  for (let cellY = 0; cellY < rows; cellY += 1) {
    for (let cellX = 0; cellX < ZX_ATTRIBUTE_COLUMNS; cellX += 1) {
      const indices = cellPixelIndices(cellX, cellY, cellHeight);
      const scoredPairs = pairs
        .map((pair) => ({
          pair,
          cost: lowerBound(labs, indices, pair, cellHeight === 1 ? 1 : 2, structured),
        }))
        .sort((left, right) => left.cost - right.cost || left.pair.id - right.pair.id);
      const preliminary = scoredPairs.slice(0, preliminaryLimit);
      const paletteMass = new Int32Array(8);
      const strongEdgeMass = new Int32Array(8);
      for (const index of indices) {
        let bestCode = 0;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const pair of pairs) {
          for (const [code, color] of [
            [pair.paperCode, pair.paper],
            [pair.inkCode, pair.ink],
          ] as const) {
            const candidateDistance = labDistance(
              labs[index]!,
              color,
              structured,
            );
            if (
              candidateDistance < bestDistance ||
              (candidateDistance === bestDistance && code < bestCode)
            ) {
              bestDistance = candidateDistance;
              bestCode = code;
            }
          }
        }
        const importance = edgeImportance[index] ?? 0;
        const mass =
          W +
          roundDiv(
            structured.candidateParameters.edgeImportanceWeight * importance,
            W,
          );
        paletteMass[bestCode] = (paletteMass[bestCode] ?? 0) + mass;
        if (
          importance >=
          structured.candidateParameters.strongEdgeThreshold
        ) {
          strongEdgeMass[bestCode] =
            (strongEdgeMass[bestCode] ?? 0) + mass;
        }
      }
      const retainedPairIds = new Set(preliminary.map(({ pair }) => pair.id));
      const totalPaletteMass = paletteMass.reduce((sum, value) => sum + value, 0);
      const importantThreshold = roundDiv(
        totalPaletteMass *
          structured.candidateParameters.importantMassPermille,
        1000,
      );
      let dominantStrongEdgeCode = -1;
      let dominantStrongEdgeMass = 0;
      for (let code = 0; code < strongEdgeMass.length; code += 1) {
        if ((strongEdgeMass[code] ?? 0) > dominantStrongEdgeMass) {
          dominantStrongEdgeMass = strongEdgeMass[code] ?? 0;
          dominantStrongEdgeCode = code;
        }
      }
      for (let code = 0; code < paletteMass.length; code += 1) {
        if (
          (paletteMass[code] ?? 0) < importantThreshold &&
          code !== dominantStrongEdgeCode
        ) continue;
        const containing = scoredPairs.find(({ pair }) =>
          pair.paperCode === code || pair.inkCode === code
        );
        if (containing !== undefined && !retainedPairIds.has(containing.pair.id)) {
          preliminary.push(containing);
          retainedPairIds.add(containing.pair.id);
        }
      }
      const renderedCandidates = preliminary
        .map(({ pair }) => renderCell(
          labs,
          source,
          references,
          cellX,
          cellY,
          cellHeight,
          pair,
          amountPermille,
          structured,
        ))
        .sort((left, right) =>
          left.localCost - right.localCost || left.pair.id - right.pair.id
        );
      if (
        structured.structuralModelId === "palette-topology-v1" &&
        renderedCandidates.length > 0
      ) {
        const bestLocalCost = renderedCandidates[0]!.localCost;
        const detail = roundDiv(
          indices.reduce(
            (sum, index) => sum + (edgeImportance[index] ?? 0),
            0,
          ),
          indices.length,
        );
        const margin = roundDiv(
          bestLocalCost *
            structured.candidateParameters.localAdmissibilityPermille *
            (W + detail),
          1000 * W,
        );
        candidates.push(
          renderedCandidates
            .filter(({ localCost }) => localCost <= bestLocalCost + margin)
            .slice(0, finalLimit),
        );
      } else {
        candidates.push(renderedCandidates.slice(0, finalLimit));
      }
    }
  }
  const selected = new Int16Array(cellCount);
  const passes = level === "draft" ? 2 : 4;
  let completedPasses = 0;
  for (let pass = 0; pass < passes; pass += 1) {
    let changes = 0;
    const reverse = (pass & 1) === 1;
    for (let step = 0; step < cellCount; step += 1) {
      const cell = reverse ? cellCount - 1 - step : step;
      const cellX = cell % ZX_ATTRIBUTE_COLUMNS;
      const cellY = Math.floor(cell / ZX_ATTRIBUTE_COLUMNS);
      const options = candidates[cell]!;
      const current = selected[cell] ?? 0;
      let best = current;
      let bestEnergy = Number.POSITIVE_INFINITY;
      for (let option = 0; option < options.length; option += 1) {
        const candidate = options[option]!;
        let energy = candidate.localCost;
        if (cellX > 0) energy += boundaryCost(
          candidates[cell - 1]![selected[cell - 1] ?? 0]!,
          candidate,
          "horizontal",
          cellX - 1,
          cellY,
          cellHeight,
          labs,
          edgeImportance,
          structured,
        ).cost;
        if (cellX + 1 < ZX_ATTRIBUTE_COLUMNS) energy += boundaryCost(
          candidate,
          candidates[cell + 1]![selected[cell + 1] ?? 0]!,
          "horizontal",
          cellX,
          cellY,
          cellHeight,
          labs,
          edgeImportance,
          structured,
        ).cost;
        if (cellY > 0) energy += boundaryCost(
          candidates[cell - ZX_ATTRIBUTE_COLUMNS]![selected[cell - ZX_ATTRIBUTE_COLUMNS] ?? 0]!,
          candidate,
          "vertical",
          cellX,
          cellY - 1,
          cellHeight,
          labs,
          edgeImportance,
          structured,
        ).cost;
        if (cellY + 1 < rows) energy += boundaryCost(
          candidate,
          candidates[cell + ZX_ATTRIBUTE_COLUMNS]![selected[cell + ZX_ATTRIBUTE_COLUMNS] ?? 0]!,
          "vertical",
          cellX,
          cellY,
          cellHeight,
          labs,
          edgeImportance,
          structured,
        ).cost;
        if (energy < bestEnergy || (energy === bestEnergy && option === current)) {
          bestEnergy = energy;
          best = option;
        }
      }
      if (best !== current) {
        selected[cell] = best;
        changes += 1;
      }
    }
    completedPasses += 1;
    if (changes === 0) break;
  }
  const pixels = new Uint8Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT);
  const attributes = new Uint8Array(cellCount);
  let localCost = 0;
  let deliberateFlips = 0;
  const aggregateComponents: Record<keyof BlockCostComponents, number> = {
    pixelCost: 0,
    rgbAnchorCost: 0,
    patternReferenceCost: 0,
    paletteDistributionCost: 0,
    luminanceRankCost: 0,
    edgePolarityCost: 0,
    meanCost: 0,
    edgeCost: 0,
    deviationFlipCost: 0,
    deviationContrastCost: 0,
    visibilityCost: 0,
  };
  for (let cell = 0; cell < cellCount; cell += 1) {
    const candidate = candidates[cell]![selected[cell] ?? 0]!;
    const cellX = cell % ZX_ATTRIBUTE_COLUMNS;
    const cellY = Math.floor(cell / ZX_ATTRIBUTE_COLUMNS);
    attributes[cell] = attributeByte(candidate.pair);
    localCost += candidate.localCost;
    deliberateFlips += candidate.deliberateFlips;
    for (const key of Object.keys(aggregateComponents) as (keyof BlockCostComponents)[]) {
      aggregateComponents[key] += candidate.components[key];
    }
    for (let y = 0; y < cellHeight; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        pixels[(cellY * cellHeight + y) * ZX_SCREEN_WIDTH + cellX * 8 + x] =
          candidate.bits[y * 8 + x] ?? 0;
      }
    }
  }
  let totalBoundaryCost = 0;
  let boundaryExcessCost = 0;
  let sharedEndpointBonus = 0;
  for (let cellY = 0; cellY < rows; cellY += 1) {
    for (let cellX = 0; cellX < ZX_ATTRIBUTE_COLUMNS; cellX += 1) {
      const cell = cellY * ZX_ATTRIBUTE_COLUMNS + cellX;
      const candidate = candidates[cell]![selected[cell] ?? 0]!;
      if (cellX + 1 < ZX_ATTRIBUTE_COLUMNS) {
        const boundary = boundaryCost(
          candidate,
          candidates[cell + 1]![selected[cell + 1] ?? 0]!,
          "horizontal",
          cellX,
          cellY,
          cellHeight,
          labs,
          edgeImportance,
          structured,
        );
        totalBoundaryCost += boundary.cost;
        boundaryExcessCost += boundary.excessCost;
        sharedEndpointBonus += boundary.sharedEndpointBonus;
      }
      if (cellY + 1 < rows) {
        const boundary = boundaryCost(
          candidate,
          candidates[cell + ZX_ATTRIBUTE_COLUMNS]![selected[cell + ZX_ATTRIBUTE_COLUMNS] ?? 0]!,
          "vertical",
          cellX,
          cellY,
          cellHeight,
          labs,
          edgeImportance,
          structured,
        );
        totalBoundaryCost += boundary.cost;
        boundaryExcessCost += boundary.excessCost;
        sharedEndpointBonus += boundary.sharedEndpointBonus;
      }
    }
  }
  const guideKeys = references === null
    ? new Uint8Array(pixels.length)
    : Uint8Array.from(references.patternKeys);
  const blockHeight = cellHeight === 1 ? 1 : 2;
  for (let by = 0; references === null && by < ZX_SCREEN_HEIGHT; by += blockHeight) {
    for (let bx = 0; bx < ZX_SCREEN_WIDTH; bx += 2) {
      const indices: number[] = [];
      for (let y = 0; y < blockHeight; y += 1) {
        for (let x = 0; x < 2; x += 1) indices.push((by + y) * ZX_SCREEN_WIDTH + bx + x);
      }
      let bestPair = pairs[0]!;
      let best = bestBlockMask(
        labs,
        source,
        null,
        indices,
        bestPair,
        amountPermille,
        2,
        blockHeight,
        structured,
      );
      for (let pairIndex = 1; pairIndex < pairs.length; pairIndex += 1) {
        const pair = pairs[pairIndex]!;
        const candidate = bestBlockMask(
          labs,
          source,
          null,
          indices,
          pair,
          amountPermille,
          2,
          blockHeight,
          structured,
        );
        if (candidate.cost < best.cost || (candidate.cost === best.cost && pair.id < bestPair.id)) {
          best = candidate;
          bestPair = pair;
        }
      }
      for (let local = 0; local < indices.length; local += 1) {
        guideKeys[indices[local]!] =
          (((best.mask >> local) & 1) === 1 ? bestPair.inkCode : bestPair.paperCode) +
          (bestPair.bright ? 8 : 0);
      }
    }
  }
  const totalEnergy = localCost + totalBoundaryCost;
  if (!Number.isSafeInteger(totalEnergy)) {
    throw new RangeError("Structured optimizer score exceeds the safe integer range.");
  }
  return {
    pixels,
    attributes,
    guideKeys,
    score: totalEnergy,
    diagnostics: {
      engineVersion: structured.structuralModelId === "palette-topology-v1"
        ? "zx-structured-global-v4"
        : structured.colorAnchorModelId === "srgb-squared-v1"
        ? "zx-structured-global-v3"
        : structured.ditherResponseCurveId === "power-035-percent-v2"
          ? "zx-structured-global-v2"
          : "zx-structured-global-v1",
      ...aggregateComponents,
      boundaryExcessCost,
      sharedEndpointBonus,
      localCost,
      boundaryCost: totalBoundaryCost,
      totalEnergy,
      deliberateFlips,
      candidateCount: candidates.reduce((sum, values) => sum + values.length, 0),
      attributePasses: completedPasses,
      mixtureModelId: structured.mixtureModelId,
      perceptualModelId: structured.perceptualModelId,
      colorAnchorModelId: structured.colorAnchorModelId,
      responseCurveId: structured.ditherResponseCurveId,
      structuralModelId: structured.structuralModelId,
    },
  };
}
