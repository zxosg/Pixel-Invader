import type { QlRgbColor } from "@retro-converter/sinclair-ql";
import type { Pmd85RgbColor } from "@retro-converter/pmd-85";
import { decorrelatedDiffusionKernel, diffusionNoiseOffset } from "./diffusion.js";
import { ORDERED_MATRICES, orderedThreshold } from "./matrices.js";
import { zxColor } from "./palette.js";
import type {
  BrightMode,
  DitheringMethod,
  OrderedMatrixId,
  RgbColor,
  VerticalSpatialDiagnostics,
  VerticalSpatialMixSettings,
} from "./types.js";

export const VERTICAL_SPATIAL_LINEAR_SCALE = 65_535;
const LUMA_R = 13_933;
const LUMA_G = 46_871;
const LUMA_B = 4_732;

export const VERTICAL_SPATIAL_SRGB_TO_LINEAR_Q16 = Object.freeze([
  0, 20, 40, 60, 80, 99, 119, 139, 159, 179, 199, 219, 241, 264, 288, 313,
  340, 367, 396, 427, 458, 491, 526, 562, 599, 637, 677, 718, 761, 805, 851, 898,
  947, 997, 1048, 1101, 1156, 1212, 1270, 1330, 1391, 1453, 1517, 1583, 1651, 1720, 1790, 1863,
  1937, 2013, 2090, 2170, 2250, 2333, 2418, 2504, 2592, 2681, 2773, 2866, 2961, 3058, 3157, 3258,
  3360, 3464, 3570, 3678, 3788, 3900, 4014, 4129, 4247, 4366, 4488, 4611, 4736, 4864, 4993, 5124,
  5257, 5392, 5530, 5669, 5810, 5953, 6099, 6246, 6395, 6547, 6700, 6856, 7014, 7174, 7335, 7500,
  7666, 7834, 8004, 8177, 8352, 8528, 8708, 8889, 9072, 9258, 9445, 9635, 9828, 10022, 10219, 10417,
  10619, 10822, 11028, 11235, 11446, 11658, 11873, 12090, 12309, 12530, 12754, 12980, 13209, 13440, 13673, 13909,
  14146, 14387, 14629, 14874, 15122, 15371, 15623, 15878, 16135, 16394, 16656, 16920, 17187, 17456, 17727, 18001,
  18277, 18556, 18837, 19121, 19407, 19696, 19987, 20281, 20577, 20876, 21177, 21481, 21787, 22096, 22407, 22721,
  23038, 23357, 23678, 24002, 24329, 24658, 24990, 25325, 25662, 26001, 26344, 26688, 27036, 27386, 27739, 28094,
  28452, 28813, 29176, 29542, 29911, 30282, 30656, 31033, 31412, 31794, 32179, 32567, 32957, 33350, 33745, 34143,
  34544, 34948, 35355, 35764, 36176, 36591, 37008, 37429, 37852, 38278, 38706, 39138, 39572, 40009, 40449, 40891,
  41337, 41785, 42236, 42690, 43147, 43606, 44069, 44534, 45002, 45473, 45947, 46423, 46903, 47385, 47871, 48359,
  48850, 49344, 49841, 50341, 50844, 51349, 51858, 52369, 52884, 53401, 53921, 54445, 54971, 55500, 56032, 56567,
  57105, 57646, 58190, 58737, 59287, 59840, 60396, 60955, 61517, 62082, 62650, 63221, 63795, 64372, 64952, 65535,
] as const);

interface LinearColor {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

interface PairCost {
  readonly color: number;
  readonly stripe: number;
  readonly total: number;
}

interface SpatialPlanes {
  readonly upperIndices: Uint8Array;
  readonly lowerIndices: Uint8Array;
  readonly diagnostics: VerticalSpatialDiagnostics;
}

interface CellPlanes {
  readonly pixelMasks: Uint8Array;
  readonly attributes: Uint8Array;
  readonly diagnostics: VerticalSpatialDiagnostics;
}

export interface VerticalSpatialDitherOptions {
  readonly method: DitheringMethod;
  readonly amount: number;
  readonly orderedMatrix: OrderedMatrixId;
  readonly errorRandomization: number;
}

const DEFAULT_VERTICAL_SPATIAL_DITHER: VerticalSpatialDitherOptions = {
  method: "none",
  amount: 0,
  orderedMatrix: "bayer-4x4",
  errorRandomization: 0,
};

interface SpatialDitherTarget {
  readonly target: Int32Array;
  direction(logicalY: number): -1 | 1;
  prepareCell(logicalY: number, cellX: number): void;
  commitCell(logicalY: number, cellX: number, realized: readonly LinearColor[]): void;
}

function signedRoundDiv(numerator: number, denominator: number): number {
  return numerator < 0
    ? -Math.floor((-numerator + Math.floor(denominator / 2)) / denominator)
    : Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

function clampLinear(value: number): number {
  return Math.max(0, Math.min(VERTICAL_SPATIAL_LINEAR_SCALE, value));
}

function createSpatialDitherTarget(
  base: Int32Array,
  width: number,
  height: number,
  cellWidth: number,
  options: VerticalSpatialDitherOptions,
): SpatialDitherTarget {
  if (!Number.isInteger(options.amount) || options.amount < 0 || options.amount > 100) {
    throw new RangeError("Vertical spatial dithering amount must be an integer from 0 through 100.");
  }
  const logicalHeight = height / 2;
  const columns = width / cellWidth;
  const target = Int32Array.from(base);
  if (options.method === "ordered" && options.amount > 0) {
    const matrix = ORDERED_MATRICES[options.orderedMatrix];
    for (let y = 0; y < logicalHeight; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const threshold = orderedThreshold(matrix, x, y);
        const centeredNumerator = 2 * threshold + 1 - matrix.levels;
        const offset = signedRoundDiv(
          centeredNumerator * options.amount * VERTICAL_SPATIAL_LINEAR_SCALE,
          4 * matrix.levels * 100,
        );
        const baseOffset = (y * width + x) * 3;
        for (let channel = 0; channel < 3; channel += 1) {
          target[baseOffset + channel] = clampLinear((base[baseOffset + channel] ?? 0) + offset);
        }
      }
    }
  }
  const errors = new Int32Array(columns * logicalHeight * 3);
  const direction = (logicalY: number): -1 | 1 =>
    options.method === "error-diffusion" && logicalY % 2 !== 0 ? -1 : 1;
  return {
    target,
    direction,
    prepareCell(logicalY, cellX) {
      if (options.method !== "error-diffusion" || options.amount === 0) return;
      const errorOffset = (logicalY * columns + cellX) * 3;
      for (let pixel = 0; pixel < cellWidth; pixel += 1) {
        const x = cellX * cellWidth + pixel;
        const targetOffset = (logicalY * width + x) * 3;
        for (let channel = 0; channel < 3; channel += 1) {
          const noise = diffusionNoiseOffset(
            x,
            logicalY,
            channel,
            options.errorRandomization,
            Math.floor(2_048 * options.amount / 100),
          );
          target[targetOffset + channel] = clampLinear(
            (base[targetOffset + channel] ?? 0) + (errors[errorOffset + channel] ?? 0) + noise,
          );
        }
      }
    },
    commitCell(logicalY, cellX, realized) {
      if (options.method !== "error-diffusion" || options.amount === 0) return;
      const averagedError = [0, 0, 0];
      for (let pixel = 0; pixel < cellWidth; pixel += 1) {
        const x = cellX * cellWidth + pixel;
        const targetOffset = (logicalY * width + x) * 3;
        const output = realized[pixel]!;
        averagedError[0] = (averagedError[0] ?? 0) + (target[targetOffset] ?? 0) - output.r;
        averagedError[1] = (averagedError[1] ?? 0) + (target[targetOffset + 1] ?? 0) - output.g;
        averagedError[2] = (averagedError[2] ?? 0) + (target[targetOffset + 2] ?? 0) - output.b;
      }
      const scanDirection = direction(logicalY);
      for (const [dx, dy, weight] of decorrelatedDiffusionKernel(scanDirection)) {
        const destinationX = cellX + dx;
        const destinationY = logicalY + dy;
        if (destinationX < 0 || destinationX >= columns || destinationY >= logicalHeight) continue;
        const destination = (destinationY * columns + destinationX) * 3;
        for (let channel = 0; channel < 3; channel += 1) {
          const scaled = signedRoundDiv(
            (averagedError[channel] ?? 0) * options.amount * weight,
            cellWidth * 100 * 42,
          );
          errors[destination + channel] = Math.max(
            -VERTICAL_SPATIAL_LINEAR_SCALE,
            Math.min(VERTICAL_SPATIAL_LINEAR_SCALE, (errors[destination + channel] ?? 0) + scaled),
          );
        }
      }
    },
  };
}

function mixedLinear(upper: LinearColor, lower: LinearColor): LinearColor {
  return {
    r: mixChannel(upper.r, lower.r),
    g: mixChannel(upper.g, lower.g),
    b: mixChannel(upper.b, lower.b),
  };
}

function linearColor(color: RgbColor): LinearColor {
  return {
    r: VERTICAL_SPATIAL_SRGB_TO_LINEAR_Q16[color.r] ?? 0,
    g: VERTICAL_SPATIAL_SRGB_TO_LINEAR_Q16[color.g] ?? 0,
    b: VERTICAL_SPATIAL_SRGB_TO_LINEAR_Q16[color.b] ?? 0,
  };
}

function linearToSrgb(value: number): number {
  const target = Math.max(0, Math.min(VERTICAL_SPATIAL_LINEAR_SCALE, Math.round(value)));
  let lower = 0;
  let upper = 255;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) / 2);
    if ((VERTICAL_SPATIAL_SRGB_TO_LINEAR_Q16[middle] ?? 0) < target) {
      lower = middle + 1;
    } else {
      upper = middle;
    }
  }
  if (lower === 0) return 0;
  const highDistance = Math.abs((VERTICAL_SPATIAL_SRGB_TO_LINEAR_Q16[lower] ?? 0) - target);
  const lowDistance = Math.abs((VERTICAL_SPATIAL_SRGB_TO_LINEAR_Q16[lower - 1] ?? 0) - target);
  return lowDistance < highDistance ? lower - 1 : lower;
}

function luminance(color: LinearColor): number {
  return Math.floor(
    (color.r * LUMA_R + color.g * LUMA_G + color.b * LUMA_B + 32_768) /
      65_536,
  );
}

function mixChannel(upper: number, lower: number): number {
  return Math.floor((upper + lower + 1) / 2);
}

function pairCost(target: Int32Array, offset: number, upper: LinearColor, lower: LinearColor): PairCost {
  const dr = (target[offset] ?? 0) - mixChannel(upper.r, lower.r);
  const dg = (target[offset + 1] ?? 0) - mixChannel(upper.g, lower.g);
  const db = (target[offset + 2] ?? 0) - mixChannel(upper.b, lower.b);
  const color = Math.floor((dr * dr + dg * dg + db * db) / 3);
  const stripeDelta = luminance(upper) - luminance(lower);
  const stripe = stripeDelta * stripeDelta;
  return { color, stripe, total: 5 * color + stripe };
}

export function validateVerticalSpatialMixSettings(
  settings: VerticalSpatialMixSettings | undefined,
): asserts settings is VerticalSpatialMixSettings {
  if (
    settings?.schemaVersion !== 1 ||
    settings.algorithmId !== "vertical-spatial-uniform-v1" ||
    settings.calibrationId !== "srgb-ideal-v1"
  ) {
    throw new RangeError("Vertical spatial mixing settings are invalid.");
  }
}

export function buildVerticalSpatialTarget(
  physicalRgba: Uint8Array,
  width: number,
  height: number,
): Int32Array {
  if (height % 2 !== 0 || physicalRgba.length !== width * height * 4) {
    throw new RangeError("Vertical spatial source geometry is invalid.");
  }
  const target = new Int32Array(width * (height / 2) * 3);
  for (let logicalY = 0; logicalY < height / 2; logicalY += 1) {
    for (let x = 0; x < width; x += 1) {
      const upper = ((logicalY * 2) * width + x) * 4;
      const lower = (((logicalY * 2) + 1) * width + x) * 4;
      const output = (logicalY * width + x) * 3;
      for (let channel = 0; channel < 3; channel += 1) {
        target[output + channel] = mixChannel(
          VERTICAL_SPATIAL_SRGB_TO_LINEAR_Q16[physicalRgba[upper + channel] ?? 0] ?? 0,
          VERTICAL_SPATIAL_SRGB_TO_LINEAR_Q16[physicalRgba[lower + channel] ?? 0] ?? 0,
        );
      }
    }
  }
  return target;
}

export function buildVerticalSpatialAnalyticPreview(
  physicalRgba: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  const target = buildVerticalSpatialTarget(physicalRgba, width, height);
  const output = new Uint8Array(width * (height / 2) * 4);
  for (let pixel = 0; pixel < width * (height / 2); pixel += 1) {
    const linear = pixel * 3;
    const rgba = pixel * 4;
    output[rgba] = linearToSrgb(target[linear] ?? 0);
    output[rgba + 1] = linearToSrgb(target[linear + 1] ?? 0);
    output[rgba + 2] = linearToSrgb(target[linear + 2] ?? 0);
    output[rgba + 3] = 255;
  }
  return output;
}

function diagnostics(
  preview: Uint8Array,
  width: number,
  height: number,
  colorCost: number,
  stripeCost: number,
): VerticalSpatialDiagnostics {
  return {
    algorithmId: "vertical-spatial-uniform-v1",
    calibrationId: "srgb-ideal-v1",
    logicalWidth: width,
    logicalHeight: height / 2,
    analyticPreviewRgba: preview,
    colorCost,
    stripeCost,
    totalCost: 5 * colorCost + stripeCost,
  };
}

export function optimizeVerticalSpatialPixels(
  physicalSource: Uint8Array,
  width: number,
  height: number,
  palette: readonly QlRgbColor[],
  enabled: readonly number[],
  ditherOptions: VerticalSpatialDitherOptions = DEFAULT_VERTICAL_SPATIAL_DITHER,
): SpatialPlanes {
  const baseTarget = buildVerticalSpatialTarget(physicalSource, width, height);
  const dither = createSpatialDitherTarget(baseTarget, width, height, 1, ditherOptions);
  const target = dither.target;
  const linearPalette = palette.map(linearColor);
  const upperIndices = new Uint8Array(width * height);
  const lowerIndices = upperIndices;
  let colorCost = 0;
  let stripeCost = 0;
  for (let logicalY = 0; logicalY < height / 2; logicalY += 1) {
    const direction = dither.direction(logicalY);
    for (let step = 0; step < width; step += 1) {
      const x = direction === 1 ? step : width - 1 - step;
      dither.prepareCell(logicalY, x);
      const targetOffset = (logicalY * width + x) * 3;
      let bestUpper = enabled[0] ?? 0;
      let bestLower = bestUpper;
      let best = { color: Number.POSITIVE_INFINITY, stripe: Number.POSITIVE_INFINITY, total: Number.POSITIVE_INFINITY };
      for (const upper of enabled) {
        for (const lower of enabled) {
          const cost = pairCost(target, targetOffset, linearPalette[upper]!, linearPalette[lower]!);
          if (
            cost.total < best.total ||
            (cost.total === best.total && (
              cost.stripe < best.stripe ||
              (cost.stripe === best.stripe && (
                Number(upper !== lower) < Number(bestUpper !== bestLower) ||
                (Number(upper !== lower) === Number(bestUpper !== bestLower) &&
                  (upper < bestUpper || (upper === bestUpper && lower < bestLower)))
              ))
            ))
          ) {
            best = cost;
            bestUpper = upper;
            bestLower = lower;
          }
        }
      }
      upperIndices[(logicalY * 2) * width + x] = bestUpper;
      upperIndices[(logicalY * 2 + 1) * width + x] = bestLower;
      const actual = pairCost(baseTarget, targetOffset, linearPalette[bestUpper]!, linearPalette[bestLower]!);
      colorCost += actual.color;
      stripeCost += actual.stripe;
      dither.commitCell(logicalY, x, [mixedLinear(linearPalette[bestUpper]!, linearPalette[bestLower]!)]);
    }
  }
  return {
    upperIndices,
    lowerIndices,
    diagnostics: diagnostics(new Uint8Array(), width, height, colorCost, stripeCost),
  };
}

function bestState(
  target: Int32Array,
  offset: number,
  upperOff: LinearColor,
  upperOn: LinearColor,
  lowerOff: LinearColor,
  lowerOn: LinearColor,
): { state: number; cost: PairCost } {
  let bestState = 0;
  let best = { color: Number.POSITIVE_INFINITY, stripe: Number.POSITIVE_INFINITY, total: Number.POSITIVE_INFINITY };
  for (let state = 0; state < 4; state += 1) {
    const cost = pairCost(
      target,
      offset,
      (state & 2) === 0 ? upperOff : upperOn,
      (state & 1) === 0 ? lowerOff : lowerOn,
    );
    if (cost.total < best.total || (cost.total === best.total && state < bestState)) {
      bestState = state;
      best = cost;
    }
  }
  return { state: bestState, cost: best };
}

export function optimizeVerticalSpatialPmd(
  physicalSource: Uint8Array,
  width: number,
  height: number,
  palette: readonly Pmd85RgbColor[],
  enabled: readonly number[],
  ditherOptions: VerticalSpatialDitherOptions = DEFAULT_VERTICAL_SPATIAL_DITHER,
): CellPlanes {
  const baseTarget = buildVerticalSpatialTarget(physicalSource, width, height);
  const dither = createSpatialDitherTarget(baseTarget, width, height, 6, ditherOptions);
  const target = dither.target;
  const black = linearColor({ r: 0, g: 0, b: 0 });
  const linearPalette = palette.map(linearColor);
  const bytesPerRow = width / 6;
  const pixelMasks = new Uint8Array(bytesPerRow * height);
  const attributes = new Uint8Array(bytesPerRow * height);
  let colorCost = 0;
  let stripeCost = 0;
  for (let logicalY = 0; logicalY < height / 2; logicalY += 1) {
    const direction = dither.direction(logicalY);
    for (let step = 0; step < bytesPerRow; step += 1) {
      const byteX = direction === 1 ? step : bytesPerRow - 1 - step;
      dither.prepareCell(logicalY, byteX);
      let bestUpper = enabled[0] ?? 0;
      let bestLower = bestUpper;
      let bestUpperMask = 0;
      let bestLowerMask = 0;
      let bestStripe = 0;
      let bestTotal = Number.POSITIVE_INFINITY;
      for (const upper of enabled) {
        for (const lower of enabled) {
          let upperMask = 0;
          let lowerMask = 0;
          let candidateColor = 0;
          let candidateStripe = 0;
          for (let pixel = 0; pixel < 6; pixel += 1) {
            const result = bestState(
              target,
              (logicalY * width + byteX * 6 + pixel) * 3,
              black,
              linearPalette[upper]!,
              black,
              linearPalette[lower]!,
            );
            if ((result.state & 2) !== 0) upperMask |= 1 << pixel;
            if ((result.state & 1) !== 0) lowerMask |= 1 << pixel;
            candidateColor += result.cost.color;
            candidateStripe += result.cost.stripe;
          }
          const candidateTotal = 5 * candidateColor + candidateStripe;
          const candidateTuple = [
            candidateTotal, candidateStripe, Number(upper !== lower),
            upper, lower, upperMask, lowerMask,
          ];
          const bestTuple = [
            bestTotal, bestStripe, Number(bestUpper !== bestLower),
            bestUpper, bestLower, bestUpperMask, bestLowerMask,
          ];
          if (candidateTuple.some((value, index) =>
            value < bestTuple[index]! && candidateTuple.slice(0, index).every((prior, priorIndex) => prior === bestTuple[priorIndex])
          )) {
            bestUpper = upper;
            bestLower = lower;
            bestUpperMask = upperMask;
            bestLowerMask = lowerMask;
            bestStripe = candidateStripe;
            bestTotal = candidateTotal;
          }
        }
      }
      const upperIndex = (logicalY * 2) * bytesPerRow + byteX;
      const lowerIndex = upperIndex + bytesPerRow;
      attributes[upperIndex] = bestUpper;
      attributes[lowerIndex] = bestLower;
      pixelMasks[upperIndex] = bestUpperMask;
      pixelMasks[lowerIndex] = bestLowerMask;
      const realized: LinearColor[] = [];
      for (let pixel = 0; pixel < 6; pixel += 1) {
        const upper = (bestUpperMask & (1 << pixel)) === 0 ? black : linearPalette[bestUpper]!;
        const lower = (bestLowerMask & (1 << pixel)) === 0 ? black : linearPalette[bestLower]!;
        const targetOffset = (logicalY * width + byteX * 6 + pixel) * 3;
        const actual = pairCost(baseTarget, targetOffset, upper, lower);
        colorCost += actual.color;
        stripeCost += actual.stripe;
        realized.push(mixedLinear(upper, lower));
      }
      dither.commitCell(logicalY, byteX, realized);
    }
  }
  return { pixelMasks, attributes, diagnostics: diagnostics(new Uint8Array(), width, height, colorCost, stripeCost) };
}

interface ZxAttributeCandidate {
  readonly value: number;
  readonly paper: LinearColor;
  readonly ink: LinearColor;
}

export function optimizeVerticalSpatialZx(
  physicalSource: Uint8Array,
  enabled: readonly number[],
  brightMode: BrightMode,
  ditherOptions: VerticalSpatialDitherOptions = DEFAULT_VERTICAL_SPATIAL_DITHER,
): CellPlanes {
  const width = 256;
  const height = 192;
  const baseTarget = buildVerticalSpatialTarget(physicalSource, width, height);
  const dither = createSpatialDitherTarget(baseTarget, width, height, 8, ditherOptions);
  const target = dither.target;
  const brightValues = brightMode === "on" ? [true] : brightMode === "off" ? [false] : [false, true];
  const candidates: ZxAttributeCandidate[] = [];
  for (const bright of brightValues) {
    for (let inkIndex = 0; inkIndex < enabled.length; inkIndex += 1) {
      for (let paperIndex = inkIndex; paperIndex < enabled.length; paperIndex += 1) {
        const inkCode = enabled[inkIndex] ?? 0;
        const paperCode = enabled[paperIndex] ?? inkCode;
        candidates.push({
          value: (bright ? 0x40 : 0) | (paperCode << 3) | inkCode,
          paper: linearColor(zxColor(paperCode, bright)),
          ink: linearColor(zxColor(inkCode, bright)),
        });
      }
    }
  }
  const bytesPerRow = 32;
  const pixelMasks = new Uint8Array(width * height);
  const attributes = new Uint8Array(bytesPerRow * height);
  let colorCost = 0;
  let stripeCost = 0;
  for (let logicalY = 0; logicalY < height / 2; logicalY += 1) {
    const direction = dither.direction(logicalY);
    for (let step = 0; step < bytesPerRow; step += 1) {
      const byteX = direction === 1 ? step : bytesPerRow - 1 - step;
      dither.prepareCell(logicalY, byteX);
      let bestUpper = candidates[0]!;
      let bestLower = candidates[0]!;
      let bestUpperMask = 0;
      let bestLowerMask = 0;
      let bestStripe = 0;
      let bestTotal = Number.POSITIVE_INFINITY;
      for (const upper of candidates) {
        for (const lower of candidates) {
          let upperMask = 0;
          let lowerMask = 0;
          let candidateColor = 0;
          let candidateStripe = 0;
          for (let pixel = 0; pixel < 8; pixel += 1) {
            const result = bestState(
              target,
              (logicalY * width + byteX * 8 + pixel) * 3,
              upper.paper,
              upper.ink,
              lower.paper,
              lower.ink,
            );
            if ((result.state & 2) !== 0) upperMask |= 1 << (7 - pixel);
            if ((result.state & 1) !== 0) lowerMask |= 1 << (7 - pixel);
            candidateColor += result.cost.color;
            candidateStripe += result.cost.stripe;
          }
          const candidateTotal = 5 * candidateColor + candidateStripe;
          const candidateTuple = [candidateTotal, candidateStripe, Number(upper.value !== lower.value), upper.value, lower.value, upperMask, lowerMask];
          const bestTuple = [bestTotal, bestStripe, Number(bestUpper.value !== bestLower.value), bestUpper.value, bestLower.value, bestUpperMask, bestLowerMask];
          if (candidateTuple.some((value, index) =>
            value < bestTuple[index]! && candidateTuple.slice(0, index).every((prior, priorIndex) => prior === bestTuple[priorIndex])
          )) {
            bestUpper = upper;
            bestLower = lower;
            bestUpperMask = upperMask;
            bestLowerMask = lowerMask;
            bestStripe = candidateStripe;
            bestTotal = candidateTotal;
          }
        }
      }
      const upperAttr = (logicalY * 2) * bytesPerRow + byteX;
      const lowerAttr = upperAttr + bytesPerRow;
      attributes[upperAttr] = bestUpper.value;
      attributes[lowerAttr] = bestLower.value;
      for (let pixel = 0; pixel < 8; pixel += 1) {
        pixelMasks[(logicalY * 2) * width + byteX * 8 + pixel] = (bestUpperMask >> (7 - pixel)) & 1;
        pixelMasks[(logicalY * 2 + 1) * width + byteX * 8 + pixel] = (bestLowerMask >> (7 - pixel)) & 1;
      }
      const realized: LinearColor[] = [];
      for (let pixel = 0; pixel < 8; pixel += 1) {
        const upper = (bestUpperMask & (1 << (7 - pixel))) === 0 ? bestUpper.paper : bestUpper.ink;
        const lower = (bestLowerMask & (1 << (7 - pixel))) === 0 ? bestLower.paper : bestLower.ink;
        const targetOffset = (logicalY * width + byteX * 8 + pixel) * 3;
        const actual = pairCost(baseTarget, targetOffset, upper, lower);
        colorCost += actual.color;
        stripeCost += actual.stripe;
        realized.push(mixedLinear(upper, lower));
      }
      dither.commitCell(logicalY, byteX, realized);
    }
  }
  return { pixelMasks, attributes, diagnostics: diagnostics(new Uint8Array(), width, height, colorCost, stripeCost) };
}

export function withAnalyticPreview(
  value: VerticalSpatialDiagnostics,
  physicalPreview: Uint8Array,
  width: number,
  height: number,
): VerticalSpatialDiagnostics {
  return { ...value, analyticPreviewRgba: buildVerticalSpatialAnalyticPreview(physicalPreview, width, height) };
}
