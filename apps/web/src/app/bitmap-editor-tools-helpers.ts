import { type BitmapRegionSelection } from "../bitmap-editor-selection.js";

export function selectionContainsPixel(selection: BitmapRegionSelection, pixel: { readonly x: number; readonly y: number }): boolean {
  const localX = pixel.x - selection.x;
  const localY = pixel.y - selection.y;
  return localX >= 0 && localX < selection.width && localY >= 0 && localY < selection.height &&
    selection.mask[localY * selection.width + localX] === 1;
}

export function bitmapEditorSelectionResizeHandles(selection: BitmapRegionSelection): readonly { readonly x: number; readonly y: number; readonly width: number; readonly height: number }[] {
  if (!selection.mask.every((pixel) => pixel === 1)) return [];
  const size = 3;
  const half = size / 2;
  const left = selection.x;
  const right = selection.x + selection.width;
  const top = selection.y;
  const bottom = selection.y + selection.height;
  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  return [
    [left, top], [centerX, top], [right, top],
    [right, centerY], [right, bottom], [centerX, bottom],
    [left, bottom], [left, centerY],
  ].map(([x, y]) => ({ x: x! - half, y: y! - half, width: size, height: size }));
}
