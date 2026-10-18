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

export function bitmapEditorCellModeLabel(mode: BitmapEditorCellMode): "FILL" | "TILE" {
  return mode === "filled" ? "FILL" : "TILE";
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
