import { ZX_SCREEN_HEIGHT, ZX_SCREEN_WIDTH } from "@retro-converter/zx-spectrum";
import type { ConversionSettings, RgbColor, Rotation } from "./types.js";

export interface OutputPixelAspect {
  readonly width: number;
  readonly height: number;
}

export interface FillGeometry {
  readonly activeAxis: "x" | "y" | null;
  readonly sourceSpanWidth: number;
  readonly sourceSpanHeight: number;
  readonly maximumOffsetX: number;
  readonly maximumOffsetY: number;
  readonly resolvedOffsetX: number;
  readonly resolvedOffsetY: number;
}

function validateColor(color: RgbColor): void {
  for (const value of [color.r, color.g, color.b]) {
    if (!Number.isInteger(value) || value < 0 || value > 255) {
      throw new RangeError("Background channels must be integers from 0 through 255.");
    }
  }
}

function roundDiv(numerator: number, denominator: number): number {
  return Math.floor((numerator + Math.floor(denominator / 2)) / denominator);
}

export function fillGeometryForDimensions(
  inputWidth: number,
  inputHeight: number,
  outputWidth: number,
  outputHeight: number,
  rotation: Rotation = 0,
  outputPixelAspect: OutputPixelAspect = { width: 1, height: 1 },
  fillOffsetX: number | null = null,
  fillOffsetY: number | null = null,
): FillGeometry {
  const sourceWidth = rotation === 90 || rotation === 270
    ? inputHeight
    : inputWidth;
  const sourceHeight = rotation === 90 || rotation === 270
    ? inputWidth
    : inputHeight;
  const sourceIsWider =
    sourceWidth * outputHeight * outputPixelAspect.height >
    sourceHeight * outputWidth * outputPixelAspect.width;
  let sourceSpanWidth = sourceWidth;
  let sourceSpanHeight = sourceHeight;
  if (sourceIsWider) {
    sourceSpanWidth = Math.max(
      1,
      Math.floor(
        sourceHeight * outputWidth * outputPixelAspect.width /
          (outputHeight * outputPixelAspect.height),
      ),
    );
  } else {
    sourceSpanHeight = Math.max(
      1,
      Math.floor(
        sourceWidth * outputHeight * outputPixelAspect.height /
          (outputWidth * outputPixelAspect.width),
      ),
    );
  }
  const maximumOffsetX = Math.max(0, sourceWidth - sourceSpanWidth);
  const maximumOffsetY = Math.max(0, sourceHeight - sourceSpanHeight);
  return {
    activeAxis: maximumOffsetX > 0 ? "x" : maximumOffsetY > 0 ? "y" : null,
    sourceSpanWidth,
    sourceSpanHeight,
    maximumOffsetX,
    maximumOffsetY,
    resolvedOffsetX: maximumOffsetX === 0
      ? 0
      : fillOffsetX === null
        ? Math.floor(maximumOffsetX / 2)
        : Math.min(fillOffsetX, maximumOffsetX),
    resolvedOffsetY: maximumOffsetY === 0
      ? 0
      : fillOffsetY === null
        ? Math.floor(maximumOffsetY / 2)
        : Math.min(fillOffsetY, maximumOffsetY),
  };
}

function compositeChannel(source: number, alpha: number, background: number): number {
  return Math.floor((source * alpha + background * (255 - alpha) + 127) / 255);
}

const LANCZOS_RADIUS = 3;
const LANCZOS_TABLE_STEPS = 256;
const LANCZOS_WEIGHT_SCALE = 16_384;
const LANCZOS_WEIGHTS = new Int32Array(LANCZOS_RADIUS * LANCZOS_TABLE_STEPS + 1);

for (let index = 0; index < LANCZOS_WEIGHTS.length; index += 1) {
  const distance = index / LANCZOS_TABLE_STEPS;
  if (distance === 0) {
    LANCZOS_WEIGHTS[index] = LANCZOS_WEIGHT_SCALE;
  } else if (distance >= LANCZOS_RADIUS) {
    LANCZOS_WEIGHTS[index] = 0;
  } else {
    const piDistance = Math.PI * distance;
    const value =
      (Math.sin(piDistance) / piDistance) *
      (Math.sin(piDistance / LANCZOS_RADIUS) / (piDistance / LANCZOS_RADIUS));
    LANCZOS_WEIGHTS[index] = Math.round(value * LANCZOS_WEIGHT_SCALE);
  }
}

function lanczosWeight(distanceFixed: number): number {
  const index = Math.min(
    LANCZOS_RADIUS * LANCZOS_TABLE_STEPS,
    Math.floor((Math.abs(distanceFixed) + 128) / 256),
  );
  return LANCZOS_WEIGHTS[index] ?? 0;
}

function signedRoundDivide(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  const sign = numerator < 0 !== denominator < 0 ? -1 : 1;
  const rounded = Math.floor(
    (Math.abs(numerator) + Math.floor(Math.abs(denominator) / 2)) /
      Math.abs(denominator),
  );
  return sign * rounded;
}

interface LanczosContributor {
  readonly index: number;
  readonly weight: number;
}

function normalizeContributors(
  combined: ReadonlyMap<number, number>,
  weightScale: number,
  fallbackIndex: number,
): LanczosContributor[] {
  let rawSum = 0;
  for (const weight of combined.values()) rawSum += weight;
  if (rawSum === 0) {
    return [{ index: fallbackIndex, weight: weightScale }];
  }

  const normalized = Array.from(combined, ([index, weight]) => ({
    index,
    weight: signedRoundDivide(weight * weightScale, rawSum),
  }));
  let normalizedSum = 0;
  let strongest = 0;
  for (let index = 0; index < normalized.length; index += 1) {
    normalizedSum += normalized[index]?.weight ?? 0;
    if (
      Math.abs(normalized[index]?.weight ?? 0) >
      Math.abs(normalized[strongest]?.weight ?? 0)
    ) {
      strongest = index;
    }
  }
  const correction = weightScale - normalizedSum;
  const selected = normalized[strongest];
  if (selected && correction !== 0) {
    normalized[strongest] = {
      index: selected.index,
      weight: selected.weight + correction,
    };
  }
  return normalized;
}

function sourceCenterFixed(
  destination: number,
  sourceStart: number,
  sourceSpan: number,
  destinationSpan: number,
): number {
  const numerator =
    ((2 * destination + 1) * sourceSpan - destinationSpan) * 65_536;
  return sourceStart * 65_536 +
    Math.floor(numerator / (2 * destinationSpan));
}

function buildBilinearContributors(
  sourceStart: number,
  sourceSpan: number,
  destinationSpan: number,
): readonly LanczosContributor[][] {
  const filterScaleFixed = Math.max(
    65_536,
    roundDiv(sourceSpan * 65_536, destinationSpan),
  );
  const sourceEnd = sourceStart + sourceSpan - 1;
  const contributors: LanczosContributor[][] = [];

  for (let destination = 0; destination < destinationSpan; destination += 1) {
    const centerFixed = sourceCenterFixed(
      destination,
      sourceStart,
      sourceSpan,
      destinationSpan,
    );
    const first = Math.ceil((centerFixed - filterScaleFixed) / 65_536);
    const last = Math.floor((centerFixed + filterScaleFixed) / 65_536);
    const combined = new Map<number, number>();

    for (let sample = first; sample <= last; sample += 1) {
      const distanceFixed = Math.abs(sample * 65_536 - centerFixed);
      if (distanceFixed >= filterScaleFixed) continue;
      const weight = filterScaleFixed - distanceFixed;
      const clipped = Math.max(sourceStart, Math.min(sourceEnd, sample));
      combined.set(clipped, (combined.get(clipped) ?? 0) + weight);
    }

    const nearest = Math.max(
      sourceStart,
      Math.min(sourceEnd, Math.floor((centerFixed + 32_768) / 65_536)),
    );
    contributors.push(normalizeContributors(combined, 65_536, nearest));
  }

  return contributors;
}

function buildLanczosContributors(
  sourceStart: number,
  sourceSpan: number,
  destinationSpan: number,
): readonly LanczosContributor[][] {
  const filterScaleFixed = Math.max(
    65_536,
    roundDiv(sourceSpan * 65_536, destinationSpan),
  );
  const supportFixed = LANCZOS_RADIUS * filterScaleFixed;
  const sourceEnd = sourceStart + sourceSpan - 1;
  const contributors: LanczosContributor[][] = [];

  for (let destination = 0; destination < destinationSpan; destination += 1) {
    const centerFixed = sourceCenterFixed(
      destination,
      sourceStart,
      sourceSpan,
      destinationSpan,
    );
    const first = Math.ceil((centerFixed - supportFixed) / 65_536);
    const last = Math.floor((centerFixed + supportFixed) / 65_536);
    const combined = new Map<number, number>();

    for (let sample = first; sample <= last; sample += 1) {
      const distanceFixed = Math.abs(sample * 65_536 - centerFixed);
      if (distanceFixed >= supportFixed) continue;
      const normalizedDistanceFixed = roundDiv(
        distanceFixed * 65_536,
        filterScaleFixed,
      );
      const weight = lanczosWeight(normalizedDistanceFixed);
      if (weight === 0) continue;
      const clipped = Math.max(sourceStart, Math.min(sourceEnd, sample));
      combined.set(clipped, (combined.get(clipped) ?? 0) + weight);
    }

    const nearest = Math.max(
      sourceStart,
      Math.min(sourceEnd, Math.floor((centerFixed + 32_768) / 65_536)),
    );
    contributors.push(normalizeContributors(
      combined,
      LANCZOS_WEIGHT_SCALE,
      nearest,
    ));
  }

  return contributors;
}

export function frameRgba(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  settings: Pick<ConversionSettings, "framing" | "background"> &
    Partial<Pick<ConversionSettings,
      "resampling" | "rotation" | "mirrorHorizontal" | "mirrorVertical" |
      "fillOffsetX" | "fillOffsetY" | "panOffsetX" | "panOffsetY" |
      "panEdgeMode" | "crop">>,
): Uint8Array {
  return frameRgbaToDimensions(
    source,
    sourceWidth,
    sourceHeight,
    ZX_SCREEN_WIDTH,
    ZX_SCREEN_HEIGHT,
    settings,
  );
}

export function frameRgbaToDimensions(
  source: Uint8Array,
  sourceWidth: number,
  sourceHeight: number,
  outputWidth: number,
  outputHeight: number,
  settings: Pick<ConversionSettings, "framing" | "background"> &
    Partial<Pick<ConversionSettings,
      "resampling" | "rotation" | "mirrorHorizontal" | "mirrorVertical" |
      "fillOffsetX" | "fillOffsetY" | "panOffsetX" | "panOffsetY" |
      "panEdgeMode" | "crop">>,
  outputPixelAspect: OutputPixelAspect = { width: 1, height: 1 },
): Uint8Array {
  if (
    !Number.isInteger(sourceWidth) || !Number.isInteger(sourceHeight) ||
    sourceWidth < 1 || sourceHeight < 1 || source.length !== sourceWidth * sourceHeight * 4 ||
    !Number.isInteger(outputWidth) || !Number.isInteger(outputHeight) ||
    outputWidth < 1 || outputHeight < 1
  ) {
    throw new RangeError("Source RGBA dimensions are invalid.");
  }
  if (
    !Number.isSafeInteger(outputPixelAspect.width) ||
    !Number.isSafeInteger(outputPixelAspect.height) ||
    outputPixelAspect.width < 1 ||
    outputPixelAspect.height < 1
  ) {
    throw new RangeError("Output pixel aspect units must be positive integers.");
  }
  const inputWidth = sourceWidth;
  const inputHeight = sourceHeight;
  const rotation: Rotation = settings.rotation ?? 0;
  const mirrorHorizontal = settings.mirrorHorizontal ?? false;
  const mirrorVertical = settings.mirrorVertical ?? false;
  const fillOffsetX = settings.fillOffsetX ?? null;
  const fillOffsetY = settings.fillOffsetY ?? null;
  const panOffsetX = settings.panOffsetX ?? 0;
  const panOffsetY = settings.panOffsetY ?? 0;
  const panEdgeMode = settings.panEdgeMode ?? "background";
  if (![0, 90, 180, 270].includes(rotation)) {
    throw new RangeError("Rotation must be 0, 90, 180, or 270 degrees.");
  }
  if (
    ![fillOffsetX, fillOffsetY].every((value) =>
      value === null || (Number.isInteger(value) && value >= 0)
    )
  ) {
    throw new RangeError("Fill offsets must be null or non-negative integers.");
  }
  if (![panOffsetX, panOffsetY].every(Number.isInteger)) {
    throw new RangeError("Pan offsets must be integers.");
  }
  if (!["background", "clamp", "wrap"].includes(panEdgeMode)) {
    throw new RangeError("Pan edge mode must be background, clamp, or wrap.");
  }
  const resolvedPanOffsetX = Math.max(-outputWidth, Math.min(outputWidth, panOffsetX));
  const resolvedPanOffsetY = Math.max(-outputHeight, Math.min(outputHeight, panOffsetY));
  sourceWidth = rotation === 90 || rotation === 270 ? inputHeight : inputWidth;
  sourceHeight = rotation === 90 || rotation === 270 ? inputWidth : inputHeight;
  const crop = settings.crop ?? {
    x: 0,
    y: 0,
    width: sourceWidth,
    height: sourceHeight,
  };
  if (![crop.x, crop.y, crop.width, crop.height].every(Number.isInteger)) {
    throw new RangeError("Crop coordinates must be integers.");
  }
  validateColor(settings.background);
  const output = new Uint8Array(outputWidth * outputHeight * 4);
  let renderWidth = outputWidth;
  let renderHeight = outputHeight;
  let offsetX = 0;
  let offsetY = 0;
  let sourceStartX = 0;
  let sourceStartY = 0;
  let sourceSpanWidth = sourceWidth;
  let sourceSpanHeight = sourceHeight;
  const pixelAspectWidth = outputPixelAspect.width;
  const pixelAspectHeight = outputPixelAspect.height;
  const sourceIsWiderThanOutput =
    sourceWidth * outputHeight * pixelAspectHeight >
    sourceHeight * outputWidth * pixelAspectWidth;

  if (settings.framing === "fit") {
    if (sourceIsWiderThanOutput) {
      renderHeight = Math.max(
        1,
        roundDiv(
          sourceHeight * outputWidth * pixelAspectWidth,
          sourceWidth * pixelAspectHeight,
        ),
      );
      offsetY = Math.floor((outputHeight - renderHeight) / 2);
    } else {
      renderWidth = Math.max(
        1,
        roundDiv(
          sourceWidth * outputHeight * pixelAspectHeight,
          sourceHeight * pixelAspectWidth,
        ),
      );
      offsetX = Math.floor((outputWidth - renderWidth) / 2);
    }
  } else if (settings.framing === "fill") {
    const fill = fillGeometryForDimensions(
      inputWidth,
      inputHeight,
      outputWidth,
      outputHeight,
      rotation,
      outputPixelAspect,
      fillOffsetX,
      fillOffsetY,
    );
    sourceSpanWidth = fill.sourceSpanWidth;
    sourceSpanHeight = fill.sourceSpanHeight;
    sourceStartX = fill.resolvedOffsetX;
    sourceStartY = fill.resolvedOffsetY;
  } else if (settings.framing === "crop") {
    if (
      crop.x < 0 || crop.y < 0 || crop.width < 1 || crop.height < 1 ||
      crop.x + crop.width > sourceWidth || crop.y + crop.height > sourceHeight
    ) {
      throw new RangeError("Crop pixels must define a non-empty rectangle inside the oriented source.");
    }
    sourceStartX = crop.x;
    sourceStartY = crop.y;
    sourceSpanWidth = crop.width;
    sourceSpanHeight = crop.height;
  }

  function composited(sampleX: number, sampleY: number, channel: number): number {
    let mirroredX: number;
    let mirroredY: number;
    if (rotation === 90) {
      mirroredX = sampleY;
      mirroredY = inputHeight - 1 - sampleX;
    } else if (rotation === 180) {
      mirroredX = inputWidth - 1 - sampleX;
      mirroredY = inputHeight - 1 - sampleY;
    } else if (rotation === 270) {
      mirroredX = inputWidth - 1 - sampleY;
      mirroredY = sampleX;
    } else {
      mirroredX = sampleX;
      mirroredY = sampleY;
    }
    const originalX = mirrorHorizontal ? inputWidth - 1 - mirroredX : mirroredX;
    const originalY = mirrorVertical ? inputHeight - 1 - mirroredY : mirroredY;
    const sourceOffset = (originalY * inputWidth + originalX) * 4;
    const alpha = source[sourceOffset + 3] ?? 255;
    const background = channel === 0
      ? settings.background.r
      : channel === 1 ? settings.background.g : settings.background.b;
    return compositeChannel(source[sourceOffset + channel] ?? 0, alpha, background);
  }

  function resampleSeparable(
    horizontal: readonly (readonly LanczosContributor[])[],
    vertical: readonly (readonly LanczosContributor[])[],
    weightScale: number,
  ): Int32Array {
    const intermediate = new Int32Array(
      sourceSpanHeight * renderWidth * 3,
    );

    for (let sourceLocalY = 0; sourceLocalY < sourceSpanHeight; sourceLocalY += 1) {
      const sampleY = sourceStartY + sourceLocalY;
      for (let destinationX = 0; destinationX < renderWidth; destinationX += 1) {
        const target = (sourceLocalY * renderWidth + destinationX) * 3;
        for (const contributor of horizontal[destinationX] ?? []) {
          intermediate[target] = (intermediate[target] ?? 0) +
            composited(contributor.index, sampleY, 0) * contributor.weight;
          intermediate[target + 1] = (intermediate[target + 1] ?? 0) +
            composited(contributor.index, sampleY, 1) * contributor.weight;
          intermediate[target + 2] = (intermediate[target + 2] ?? 0) +
            composited(contributor.index, sampleY, 2) * contributor.weight;
        }
      }
    }

    const frame = new Int32Array(renderWidth * renderHeight * 3);
    const combinedScale = weightScale * weightScale;
    for (let destinationY = 0; destinationY < renderHeight; destinationY += 1) {
      for (let destinationX = 0; destinationX < renderWidth; destinationX += 1) {
        const target = (destinationY * renderWidth + destinationX) * 3;
        let red = 0;
        let green = 0;
        let blue = 0;
        for (const contributor of vertical[destinationY] ?? []) {
          const sourceLocalY = contributor.index - sourceStartY;
          const sourceOffset = (sourceLocalY * renderWidth + destinationX) * 3;
          red += (intermediate[sourceOffset] ?? 0) * contributor.weight;
          green += (intermediate[sourceOffset + 1] ?? 0) * contributor.weight;
          blue += (intermediate[sourceOffset + 2] ?? 0) * contributor.weight;
        }
        frame[target] = Math.max(
          0,
          Math.min(255, signedRoundDivide(red, combinedScale)),
        );
        frame[target + 1] = Math.max(
          0,
          Math.min(255, signedRoundDivide(green, combinedScale)),
        );
        frame[target + 2] = Math.max(
          0,
          Math.min(255, signedRoundDivide(blue, combinedScale)),
        );
      }
    }
    return frame;
  }

  let filteredFrame: Int32Array | undefined;
  if (settings.resampling === "bilinear") {
    filteredFrame = resampleSeparable(
      buildBilinearContributors(sourceStartX, sourceSpanWidth, renderWidth),
      buildBilinearContributors(sourceStartY, sourceSpanHeight, renderHeight),
      65_536,
    );
  } else if (settings.resampling === "lanczos") {
    filteredFrame = resampleSeparable(
      buildLanczosContributors(sourceStartX, sourceSpanWidth, renderWidth),
      buildLanczosContributors(sourceStartY, sourceSpanHeight, renderHeight),
      LANCZOS_WEIGHT_SCALE,
    );
  }

  const wrapCoordinate = (value: number, size: number) =>
    ((value % size) + size) % size;

  for (let y = 0; y < outputHeight; y += 1) {
    for (let x = 0; x < outputWidth; x += 1) {
      const target = (y * outputWidth + x) * 4;
      const contentX = x - offsetX - resolvedPanOffsetX;
      const contentY = y - offsetY - resolvedPanOffsetY;
      const inside =
        contentX >= 0 && contentX < renderWidth &&
        contentY >= 0 && contentY < renderHeight;

      let sampleX = contentX;
      let sampleY = contentY;
      if (!inside && panEdgeMode === "clamp") {
        sampleX = Math.max(0, Math.min(renderWidth - 1, contentX));
        sampleY = Math.max(0, Math.min(renderHeight - 1, contentY));
      } else if (!inside && panEdgeMode === "wrap") {
        sampleX = wrapCoordinate(contentX, renderWidth);
        sampleY = wrapCoordinate(contentY, renderHeight);
      }

      if (!inside && panEdgeMode === "background") {
        output[target] = settings.background.r;
        output[target + 1] = settings.background.g;
        output[target + 2] = settings.background.b;
      } else if (filteredFrame) {
        const sourceOffset = (sampleY * renderWidth + sampleX) * 3;
        output[target] = filteredFrame[sourceOffset] ?? 0;
        output[target + 1] = filteredFrame[sourceOffset + 1] ?? 0;
        output[target + 2] = filteredFrame[sourceOffset + 2] ?? 0;
      } else {
        const sourceSampleX = sourceStartX + Math.min(
          sourceSpanWidth - 1,
          Math.floor(((2 * sampleX + 1) * sourceSpanWidth) / (2 * renderWidth)),
        );
        const sourceSampleY = sourceStartY + Math.min(
          sourceSpanHeight - 1,
          Math.floor(((2 * sampleY + 1) * sourceSpanHeight) / (2 * renderHeight)),
        );
        output[target] = composited(sourceSampleX, sourceSampleY, 0);
        output[target + 1] = composited(sourceSampleX, sourceSampleY, 1);
        output[target + 2] = composited(sourceSampleX, sourceSampleY, 2);
      }
      output[target + 3] = 255;
    }
  }
  return output;
}
