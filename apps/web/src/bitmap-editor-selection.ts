import type { OrderedMatrix } from "@retro-converter/conversion-core";
import type { BitmapEditorPoint, BitmapEditorBrushSize } from "./bitmap-editor-tools.js";
import { bitmapEditorBrushPixels } from "./bitmap-editor-tools.js";

export type BitmapSelectionResolution = "pixel" | "attribute";
export type BitmapSelectionKind = "rectangle" | "freeform";
export type BitmapSelectionTransform = "mirror-x" | "mirror-y" | "rotate-cw" | "rotate-ccw";

export interface BitmapRegionSelection {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Row-major 0/1 pixel mask, local to x/y. */
  readonly mask: Uint8Array;
  readonly resolution: BitmapSelectionResolution;
  readonly gridWidth: number;
  readonly gridHeight: number;
}

export interface BitmapSelectionGrid {
  readonly width: number | null;
  readonly height: number | null;
}

export function transformBitmapRegionData(
  data: Uint8Array,
  width: number,
  height: number,
  transform: BitmapSelectionTransform,
  valuesPerCell = 1,
): { readonly width: number; readonly height: number; readonly data: Uint8Array } {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 ||
      !Number.isInteger(valuesPerCell) || valuesPerCell < 1 || data.length !== width * height * valuesPerCell) {
    throw new RangeError("Bitmap selection data dimensions are invalid.");
  }
  const rotates = transform === "rotate-cw" || transform === "rotate-ccw";
  const outputWidth = rotates ? height : width;
  const outputHeight = rotates ? width : height;
  const output = new Uint8Array(data.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const targetX = transform === "mirror-x" ? width - 1 - x
        : transform === "mirror-y" ? x
          : transform === "rotate-cw" ? height - 1 - y : y;
      const targetY = transform === "mirror-x" ? y
        : transform === "mirror-y" ? height - 1 - y
          : transform === "rotate-cw" ? x : width - 1 - x;
      const sourceOffset = (y * width + x) * valuesPerCell;
      const targetOffset = (targetY * outputWidth + targetX) * valuesPerCell;
      output.set(data.subarray(sourceOffset, sourceOffset + valuesPerCell), targetOffset);
    }
  }
  return { width: outputWidth, height: outputHeight, data: output };
}

export function transformBitmapRegionSelection(
  selection: BitmapRegionSelection,
  transform: BitmapSelectionTransform,
): BitmapRegionSelection {
  const transformed = transformBitmapRegionData(selection.mask, selection.width, selection.height, transform);
  return { ...selection, width: transformed.width, height: transformed.height, mask: transformed.data };
}

function assertDimensions(width: number, height: number): void {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new RangeError("Bitmap selection dimensions must be positive integers.");
  }
}

function pointInPolygon(x: number, y: number, points: readonly BitmapEditorPoint[]): boolean {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const a = points[index];
    const b = points[previous];
    if (a === undefined || b === undefined) continue;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

function selectionGeometry(
  resolution: BitmapSelectionResolution,
  grid: BitmapSelectionGrid,
): { readonly width: number; readonly height: number } {
  if (resolution === "pixel") return { width: 1, height: 1 };
  if (grid.width === null || grid.height === null || grid.width < 1 || grid.height < 1) {
    return { width: 1, height: 1 };
  }
  return { width: grid.width, height: grid.height };
}

function snappedBounds(
  points: readonly BitmapEditorPoint[],
  width: number,
  height: number,
  resolution: BitmapSelectionResolution,
  grid: BitmapSelectionGrid,
): { readonly x: number; readonly y: number; readonly right: number; readonly bottom: number } | null {
  if (points.length === 0) return null;
  const geometry = selectionGeometry(resolution, grid);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  const x = Math.max(0, Math.floor(minX / geometry.width) * geometry.width);
  const y = Math.max(0, Math.floor(minY / geometry.height) * geometry.height);
  const right = Math.min(width, Math.ceil((maxX + 1) / geometry.width) * geometry.width);
  const bottom = Math.min(height, Math.ceil((maxY + 1) / geometry.height) * geometry.height);
  return right > x && bottom > y ? { x, y, right, bottom } : null;
}

export function makeBitmapRegionSelection(
  kind: BitmapSelectionKind,
  points: readonly BitmapEditorPoint[],
  width: number,
  height: number,
  resolution: BitmapSelectionResolution,
  grid: BitmapSelectionGrid,
): BitmapRegionSelection | null {
  assertDimensions(width, height);
  const bounds = snappedBounds(points, width, height, resolution, grid);
  if (bounds === null) return null;
  const selectionWidth = bounds.right - bounds.x;
  const selectionHeight = bounds.bottom - bounds.y;
  const mask = new Uint8Array(selectionWidth * selectionHeight);
  const polygon = kind === "rectangle"
    ? [
        { x: bounds.x, y: bounds.y },
        { x: bounds.right, y: bounds.y },
        { x: bounds.right, y: bounds.bottom },
        { x: bounds.x, y: bounds.bottom },
      ]
    : points;
  const geometry = selectionGeometry(resolution, grid);
  for (let localY = 0; localY < selectionHeight; localY += 1) {
    for (let localX = 0; localX < selectionWidth; localX += 1) {
      const pixelX = bounds.x + localX;
      const pixelY = bounds.y + localY;
      const sampleX = pixelX + 0.5;
      const sampleY = pixelY + 0.5;
      let selected = pointInPolygon(sampleX, sampleY, polygon);
      if (resolution === "attribute" && selected) {
        const cellX = Math.floor(pixelX / geometry.width);
        const cellY = Math.floor(pixelY / geometry.height);
        selected = pointInPolygon(
          cellX * geometry.width + geometry.width / 2,
          cellY * geometry.height + geometry.height / 2,
          polygon,
        );
      }
      if (kind === "rectangle") selected = true;
      if (selected) mask[localY * selectionWidth + localX] = 1;
    }
  }
  return {
    x: bounds.x,
    y: bounds.y,
    width: selectionWidth,
    height: selectionHeight,
    mask,
    resolution,
    gridWidth: geometry.width,
    gridHeight: geometry.height,
  };
}

export function bitmapSelectionPoints(selection: BitmapRegionSelection): readonly BitmapEditorPoint[] {
  const result: BitmapEditorPoint[] = [];
  for (let y = 0; y < selection.height; y += 1) {
    for (let x = 0; x < selection.width; x += 1) {
      if (selection.mask[y * selection.width + x] === 1) result.push({ x: selection.x + x, y: selection.y + y });
    }
  }
  return result;
}

export function bitmapSelectionOutlinePath(selection: BitmapRegionSelection): string {
  const edges: string[] = [];
  for (let y = 0; y < selection.height; y += 1) {
    for (let x = 0; x < selection.width; x += 1) {
      if (selection.mask[y * selection.width + x] !== 1) continue;
      const px = selection.x + x;
      const py = selection.y + y;
      if (y === 0 || selection.mask[(y - 1) * selection.width + x] !== 1) edges.push(`M${px} ${py}h1`);
      if (y === selection.height - 1 || selection.mask[(y + 1) * selection.width + x] !== 1) edges.push(`M${px} ${py + 1}h1`);
      if (x === 0 || selection.mask[y * selection.width + x - 1] !== 1) edges.push(`M${px} ${py}v1`);
      if (x === selection.width - 1 || selection.mask[y * selection.width + x + 1] !== 1) edges.push(`M${px + 1} ${py}v1`);
    }
  }
  return edges.join("");
}

/** Shifts selected pixel values cyclically inside the selection mask. */
export function shiftBitmapRegionPixels(
  values: Uint8Array,
  mask: Uint8Array,
  width: number,
  height: number,
  direction: "left" | "right" | "up" | "down",
): Uint8Array {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 ||
      values.length !== width * height || mask.length !== width * height) {
    throw new RangeError("Bitmap selection dimensions are invalid.");
  }
  const shifted = values.slice();
  const lines = direction === "left" || direction === "right" ? height : width;
  const span = direction === "left" || direction === "right" ? width : height;
  for (let line = 0; line < lines; line += 1) {
    const offsets: number[] = [];
    for (let position = 0; position < span; position += 1) {
      const x = direction === "left" || direction === "right" ? position : line;
      const y = direction === "left" || direction === "right" ? line : position;
      const offset = y * width + x;
      if (mask[offset] === 1) offsets.push(offset);
    }
    if (offsets.length < 2) continue;
    for (let index = 0; index < offsets.length; index += 1) {
      const destination = offsets[index];
      const sourceIndex = direction === "left" || direction === "up"
        ? (index + 1) % offsets.length
        : (index + offsets.length - 1) % offsets.length;
      const source = offsets[sourceIndex];
      if (destination !== undefined && source !== undefined) shifted[destination] = values[source] ?? 0;
    }
  }
  return shifted;
}

export function bitmapEditorStippleFootprint(
  x: number,
  y: number,
  size: BitmapEditorBrushSize,
  width: number,
  height: number,
  matrix: OrderedMatrix,
  densityPercent: number,
  includeOff: boolean,
): readonly BitmapEditorPoint[] {
  const density = Math.max(0, Math.min(100, densityPercent)) / 100;
  return bitmapEditorBrushPixels(x, y, size, width, height).filter((point) => {
    const rank = matrix.values[(point.y % matrix.height) * matrix.width + (point.x % matrix.width)] ?? 0;
    const on = (rank + 0.5) / matrix.levels < density;
    return includeOff || on;
  });
}
