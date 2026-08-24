import {
  invertTile,
  uniqueVariants,
  type Tile,
} from "./tiles.js";
import type {
  CharsetDistanceMetric,
  TileTransform,
} from "./types.js";

const POPCOUNT = Uint8Array.from(
  { length: 256 },
  (_, value) => {
    let count = 0;
    let remaining = value;
    while (remaining !== 0) {
      count += remaining & 1;
      remaining >>>= 1;
    }
    return count;
  },
);

export interface TileDistance {
  readonly distance: number;
  readonly hamming: number;
  readonly transform: TileTransform;
  readonly inverted: boolean;
}

export function hammingBits(left: Uint8Array, right: Uint8Array): number {
  let distance = 0;
  for (let row = 0; row < 8; row += 1) {
    distance += POPCOUNT[(left[row] ?? 0) ^ (right[row] ?? 0)] ?? 0;
  }
  return distance;
}

function pixel(tile: Uint8Array, x: number, y: number): number {
  return ((tile[y] ?? 0) >> (7 - x)) & 1;
}

function edgeDistance(left: Uint8Array, right: Uint8Array): number {
  let mismatch = 0;
  let count = 0;
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 7; x += 1) {
      mismatch += (pixel(left, x, y) ^ pixel(left, x + 1, y)) ^
        (pixel(right, x, y) ^ pixel(right, x + 1, y));
      count += 1;
    }
  }
  for (let y = 0; y < 7; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      mismatch += (pixel(left, x, y) ^ pixel(left, x, y + 1)) ^
        (pixel(right, x, y) ^ pixel(right, x, y + 1));
      count += 1;
    }
  }
  return mismatch / count;
}

function occupancyDistance(
  left: Uint8Array,
  right: Uint8Array,
  blockSize: 2 | 4,
): number {
  let difference = 0;
  for (let blockY = 0; blockY < 8; blockY += blockSize) {
    for (let blockX = 0; blockX < 8; blockX += blockSize) {
      let leftMass = 0;
      let rightMass = 0;
      for (let y = 0; y < blockSize; y += 1) {
        for (let x = 0; x < blockSize; x += 1) {
          leftMass += pixel(left, blockX + x, blockY + y);
          rightMass += pixel(right, blockX + x, blockY + y);
        }
      }
      difference += Math.abs(leftMass - rightMass);
    }
  }
  return difference / 64;
}

function averagedColorDistance(
  left: Uint8Array,
  right: Uint8Array,
  blockSize: 2 | 4,
): number {
  let squaredDifference = 0;
  let blocks = 0;
  const blockArea = blockSize * blockSize;
  for (let blockY = 0; blockY < 8; blockY += blockSize) {
    for (let blockX = 0; blockX < 8; blockX += blockSize) {
      let leftMass = 0;
      let rightMass = 0;
      for (let y = 0; y < blockSize; y += 1) {
        for (let x = 0; x < blockSize; x += 1) {
          leftMass += pixel(left, blockX + x, blockY + y);
          rightMass += pixel(right, blockX + x, blockY + y);
        }
      }
      const difference = (leftMass - rightMass) / blockArea;
      squaredDifference += difference * difference;
      blocks += 1;
    }
  }
  return blocks === 0 ? 0 : squaredDifference / blocks;
}

function boundaryDistance(left: Uint8Array, right: Uint8Array): number {
  let mismatch = 0;
  let samples = 0;
  for (let x = 0; x < 8; x += 1) {
    mismatch += pixel(left, x, 0) ^ pixel(right, x, 0);
    mismatch += pixel(left, x, 7) ^ pixel(right, x, 7);
    samples += 2;
  }
  for (let y = 1; y < 7; y += 1) {
    mismatch += pixel(left, 0, y) ^ pixel(right, 0, y);
    mismatch += pixel(left, 7, y) ^ pixel(right, 7, y);
    samples += 2;
  }
  return mismatch / samples;
}

function attributeRgbContrast(attribute: number): number {
  const ink = attribute & 0x07;
  const paper = (attribute >> 3) & 0x07;
  const level = (attribute & 0x40) !== 0 ? 255 : 205;
  const channelDifference = (bit: number) =>
    ((ink & bit) !== 0 ? level : 0) - ((paper & bit) !== 0 ? level : 0);
  const red = channelDifference(0x02);
  const green = channelDifference(0x04);
  const blue = channelDifference(0x01);
  return (red * red + green * green + blue * blue) / (3 * 255 * 255);
}

export function directTileDistance(
  left: Uint8Array,
  right: Uint8Array,
  metric: CharsetDistanceMetric,
  attribute = 0x47,
): { readonly distance: number; readonly hamming: number } {
  const hamming = hammingBits(left, right);
  if (metric === "hamming") return { distance: hamming / 64, hamming };
  if (
    metric === "image-similarity-v2" ||
    metric === "image-similarity-v3" ||
    metric === "image-similarity-v4" ||
    metric === "image-similarity-v5"
  ) {
    const contrast = attributeRgbContrast(attribute);
    const visibleRgbError = hamming / 64 * contrast;
    const multiscaleError = (
      averagedColorDistance(left, right, 2) +
      averagedColorDistance(left, right, 4)
    ) / 2 * contrast;
    if (metric === "image-similarity-v3" || metric === "image-similarity-v4" || metric === "image-similarity-v5") {
      return {
        distance:
          0.55 * visibleRgbError +
          0.20 * multiscaleError +
          0.10 * edgeDistance(left, right),
        hamming,
      };
    }
    const distance =
      0.60 * visibleRgbError +
      0.25 * multiscaleError +
      0.10 * edgeDistance(left, right) +
      0.05 * boundaryDistance(left, right);
    return { distance, hamming };
  }
  // The specification's lightweight structural matcher is used in the
  // interactive browser implementation. It preserves exact pixels, local
  // occupancy at two scales, and edge structure while keeping global
  // dictionary selection practical for as many as 768 unique source tiles.
  const distance = (
    4 * (hamming / 64) +
    2 * occupancyDistance(left, right, 2) +
    occupancyDistance(left, right, 4) +
    2 * edgeDistance(left, right)
  ) / 9;
  return { distance, hamming };
}

export function bestTileDistance(
  source: Uint8Array,
  base: Uint8Array,
  allowTransforms: boolean,
  allowPolarity: boolean,
  metric: CharsetDistanceMetric,
  attribute = 0x47,
): TileDistance {
  let best: TileDistance | null = null;
  for (const variant of uniqueVariants(base, allowTransforms)) {
    const candidates: readonly { tile: Tile; inverted: boolean }[] =
      allowPolarity
        ? [
            { tile: variant.tile, inverted: false },
            { tile: invertTile(variant.tile), inverted: true },
          ]
        : [{ tile: variant.tile, inverted: false }];
    for (const candidate of candidates) {
      const measured = directTileDistance(
        source,
        candidate.tile,
        metric,
        attribute,
      );
      const result: TileDistance = {
        ...measured,
        transform: variant.transform,
        inverted: candidate.inverted,
      };
      if (
        best === null ||
        result.distance < best.distance ||
        (result.distance === best.distance && result.hamming < best.hamming) ||
        (result.distance === best.distance && result.hamming === best.hamming &&
          Number(result.inverted) < Number(best.inverted)) ||
        (result.distance === best.distance && result.hamming === best.hamming &&
          result.inverted === best.inverted && result.transform < best.transform)
      ) best = result;
    }
  }
  if (best === null) throw new Error("No legal tile variant was generated.");
  return best;
}
