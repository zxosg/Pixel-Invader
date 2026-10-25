export type BitmapEditorScope = "pixel" | "cell";
export type BitmapEditorOperation = "copy" | "or" | "and" | "xor" | "none";
export type BitmapEditorCellMode = "filled" | "picked";
export type BitmapEditorBrushSize = "1x1" | "2x2" | "3x3" | "4x4";

export interface BitmapEditorPoint {
  readonly x: number;
  readonly y: number;
}

const BRUSH_DIMENSIONS: Readonly<Record<BitmapEditorBrushSize, { readonly width: number; readonly height: number }>> = {
  "1x1": { width: 1, height: 1 },
  "2x2": { width: 2, height: 2 },
  "3x3": { width: 3, height: 3 },
  "4x4": { width: 4, height: 4 },
};

export const BITMAP_EDITOR_BRUSH_SIZES: readonly BitmapEditorBrushSize[] = ["1x1", "2x2", "3x3", "4x4"];

export function bitmapEditorOperationLabel(operation: BitmapEditorOperation): "Copy" | "OR" | "AND" | "XOR" | "None" {
  return operation === "copy" ? "Copy"
    : operation === "or" ? "OR"
      : operation === "and" ? "AND"
        : operation === "xor" ? "XOR"
          : "None";
}

export function bitmapEditorOperationDescription(operation: BitmapEditorOperation, _scope: BitmapEditorScope = "cell"): "Copy" | "OR" | "Remove" | "Inverse" | "Nothing" {
  return operation === "copy" ? "Copy"
    : operation === "or" ? "OR"
      : operation === "and" ? "Remove"
        : operation === "xor" ? "Inverse"
          : "Nothing";
}

export function bitmapEditorCellModeLabel(mode: BitmapEditorCellMode): "CELL" | "TILE" {
  return mode === "filled" ? "CELL" : "TILE";
}

export function bitmapEditorBrushDimensions(size: BitmapEditorBrushSize): { readonly width: number; readonly height: number } {
  return BRUSH_DIMENSIONS[size];
}

/** Returns the clipped brush footprint with the pointer as its top-left pixel. */
export function bitmapEditorBrushPixels(
  x: number,
  y: number,
  size: BitmapEditorBrushSize,
  width: number,
  height: number,
): readonly BitmapEditorPoint[] {
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError("Bitmap brush geometry is invalid.");
  }
  const dimensions = bitmapEditorBrushDimensions(size);
  const pixels: BitmapEditorPoint[] = [];
  for (let localY = 0; localY < dimensions.height; localY += 1) {
    for (let localX = 0; localX < dimensions.width; localX += 1) {
      const pixelX = x + localX;
      const pixelY = y + localY;
      if (pixelX >= 0 && pixelX < width && pixelY >= 0 && pixelY < height) {
        pixels.push({ x: pixelX, y: pixelY });
      }
    }
  }
  return pixels;
}

/** Collects the four-connected region sharing the seed pixel's native value. */
export function bitmapEditorConnectedRegion(
  pixels: Uint8Array,
  width: number,
  height: number,
  seedX: number,
  seedY: number,
): readonly BitmapEditorPoint[] {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 ||
      pixels.length !== width * height || !Number.isInteger(seedX) || seedX < 0 || seedX >= width ||
      !Number.isInteger(seedY) || seedY < 0 || seedY >= height) {
    throw new RangeError("Flood-fill bitmap geometry or seed is invalid.");
  }
  const seedIndex = seedY * width + seedX;
  const seedValue = pixels[seedIndex] ?? 0;
  const visited = new Uint8Array(pixels.length);
  const queue = new Int32Array(pixels.length);
  const region: BitmapEditorPoint[] = [];
  let read = 0;
  let write = 0;
  queue[write++] = seedIndex;
  visited[seedIndex] = 1;
  while (read < write) {
    const index = queue[read++]!;
    const x = index % width;
    const y = Math.floor(index / width);
    region.push({ x, y });
    const add = (next: number) => {
      if (visited[next] === 0 && pixels[next] === seedValue) {
        visited[next] = 1;
        queue[write++] = next;
      }
    };
    if (x > 0) add(index - 1);
    if (x + 1 < width) add(index + 1);
    if (y > 0) add(index - width);
    if (y + 1 < height) add(index + width);
  }
  return region;
}

export function applyBitmapEditorOperation(
  current: 0 | 1,
  mask: 0 | 1,
  operation: BitmapEditorOperation,
): 0 | 1 {
  if (operation === "none") return current;
  if (operation === "copy") return mask;
  if (operation === "or") return (current | mask) as 0 | 1;
  if (operation === "and") return (current & (mask === 0 ? 1 : 0)) as 0 | 1;
  return (current ^ mask) as 0 | 1;
}

export function nextBitmapEditorOperation(operation: BitmapEditorOperation): BitmapEditorOperation {
  return operation === "copy" ? "or" : operation === "or" ? "and" : operation === "and" ? "xor" : operation === "xor" ? "none" : "copy";
}

export function nextBitmapEditorBrushSize(size: BitmapEditorBrushSize): BitmapEditorBrushSize {
  const index = BITMAP_EDITOR_BRUSH_SIZES.indexOf(size);
  return BITMAP_EDITOR_BRUSH_SIZES[(index + 1) % BITMAP_EDITOR_BRUSH_SIZES.length] ?? "1x1";
}

export function nextBitmapEditorCellMode(mode: BitmapEditorCellMode): BitmapEditorCellMode {
  return mode === "filled" ? "picked" : "filled";
}
