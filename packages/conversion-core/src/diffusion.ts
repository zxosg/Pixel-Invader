function signedRoundDiv(numerator: number, denominator: number): number {
  return numerator < 0
    ? -Math.floor((-numerator + Math.floor(denominator / 2)) / denominator)
    : Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

export function diffusionHash(
  x: number,
  y: number,
  channel: number,
): number {
  let value =
    Math.imul(x + 1, 0x1f123bb5) ^
    Math.imul(y + 1, 0x5f356495) ^
    Math.imul(channel + 1, 0x6c8e9cf5) ^
    1;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return value >>> 0;
}

export function diffusionNoiseOffset(
  x: number,
  y: number,
  channel: number,
  randomization: number,
  maximumChannelOffset: number,
): number {
  if (randomization === 0) return 0;
  const signedNoise = ((diffusionHash(x, y, channel) >>> 16) & 0xffff) - 32_768;
  return signedRoundDiv(
    signedNoise * randomization * maximumChannelOffset,
    32_768 * 100,
  );
}

/**
 * A serpentine Stucki kernel. Its wider two-row footprint breaks the short
 * feedback loops that produce Floyd–Steinberg worms and straight columns.
 */
export function decorrelatedDiffusionKernel(
  direction: -1 | 1,
): readonly (readonly [dx: number, dy: number, weight: number])[] {
  return [
    [direction, 0, 8],
    [direction * 2, 0, 4],
    [direction * -2, 1, 2],
    [direction * -1, 1, 4],
    [0, 1, 8],
    [direction, 1, 4],
    [direction * 2, 1, 2],
    [direction * -2, 2, 1],
    [direction * -1, 2, 2],
    [0, 2, 4],
    [direction, 2, 2],
    [direction * 2, 2, 1],
  ];
}

/** Classic short-range Atkinson diffusion. Six eighths of the error propagate. */
export function atkinsonDiffusionKernel(
  direction: -1 | 1,
): readonly (readonly [dx: number, dy: number, weight: number])[] {
  return [
    [direction, 0, 1],
    [direction * 2, 0, 1],
    [direction * -1, 1, 1],
    [0, 1, 1],
    [direction, 1, 1],
    [0, 2, 1],
  ];
}

/**
 * Floyd–Steinberg-compatible propagation with deterministic phase balancing.
 * At zero suppression the historical 7/3/5/1 kernel is returned exactly.
 */
export function phaseBalancedDiffusionKernel(
  direction: -1 | 1,
  x: number,
  y: number,
  suppression: number,
  verticalRunLength = 0,
): readonly (readonly [dx: number, dy: number, weight: number])[] {
  if (suppression <= 0) {
    return [
      [direction, 0, 7],
      [-direction, 1, 3],
      [0, 1, 5],
      [direction, 1, 1],
    ];
  }
  const strength = Math.min(1, suppression / 100);
  const shift = strength;
  let forward = 7;
  let downBack = 3;
  let down = 5;
  let downForward = 1;
  // Preserve the historical direct-down feedback. Moving weight away from it
  // allows a quantization decision to repeat in the same column, which is the
  // opposite of line suppression. Phase balancing therefore moves only the
  // lateral/diagonal share until a real vertical run is detected.
  switch (diffusionHash(x, y, 7) % 3) {
    case 0:
      downBack += shift / 2;
      downForward += shift / 2;
      forward -= shift;
      break;
    case 1:
      downBack -= shift;
      downForward += shift;
      break;
    default:
      forward -= shift / 2;
      downBack += shift;
      downForward -= shift / 2;
      break;
  }
  if (verticalRunLength >= 4) {
    // Strengthen corrective feedback into the same column after a run begins.
    // Take the weight from the forward pixel so 2x1 transitions and the total
    // propagated error remain stable.
    const runShift = Math.min(forward, 2 * strength);
    forward -= runShift;
    down += runShift;
  }
  return [
    [direction, 0, forward],
    [-direction, 1, downBack],
    [0, 1, down],
    [direction, 1, downForward],
  ];
}

function rotateHilbert(
  size: number,
  x: number,
  y: number,
  rx: number,
  ry: number,
): readonly [number, number] {
  if (ry !== 0) return [x, y];
  const nextX = rx === 1 ? size - 1 - x : x;
  const nextY = rx === 1 ? size - 1 - y : y;
  return [nextY, nextX];
}

/** Frozen Hilbert traversal clipped to the requested rectangle. */
export function hilbertTraversal(
  width: number,
  height: number,
): readonly (readonly [x: number, y: number])[] {
  let size = 1;
  while (size < Math.max(width, height)) size *= 2;
  const coordinates: (readonly [number, number])[] = [];
  for (let distance = 0; distance < size * size; distance += 1) {
    let value = distance;
    let x = 0;
    let y = 0;
    for (let scale = 1; scale < size; scale *= 2) {
      const rx = 1 & Math.floor(value / 2);
      const ry = 1 & (value ^ rx);
      [x, y] = rotateHilbert(scale, x, y, rx, ry);
      x += scale * rx;
      y += scale * ry;
      value = Math.floor(value / 4);
    }
    if (x < width && y < height) coordinates.push([x, y]);
  }
  return coordinates;
}
