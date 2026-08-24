import type {
  CropAspectRatio,
  PixelCrop,
  Rotation,
} from "@retro-converter/conversion-core";

export interface PixelSize {
  readonly width: number;
  readonly height: number;
}

export interface PixelPoint {
  readonly x: number;
  readonly y: number;
}

export interface CropPreviewFrame extends PixelSize {
  readonly x: number;
  readonly y: number;
}

export function pointIsInsideCrop(point: PixelPoint, crop: PixelCrop): boolean {
  return point.x >= crop.x && point.x < crop.x + crop.width &&
    point.y >= crop.y && point.y < crop.y + crop.height;
}

export function orientedSourceSize(
  width: number,
  height: number,
  rotation: Rotation,
): PixelSize {
  return rotation === 90 || rotation === 270
    ? { width: height, height: width }
    : { width, height };
}

export function cropAspectValue(
  aspect: CropAspectRatio,
  source: PixelSize,
): number | null {
  if (aspect === "none") return null;
  return aspect === "destination" ? 256 / 192 : source.width / source.height;
}

export function fitCropPreviewFrame(source: PixelSize): CropPreviewFrame {
  if (source.width * 192 > source.height * 256) {
    const height = Math.max(1, Math.round(source.height * 256 / source.width));
    return { x: 0, y: Math.floor((192 - height) / 2), width: 256, height };
  }
  const width = Math.max(1, Math.round(source.width * 192 / source.height));
  return { x: Math.floor((256 - width) / 2), y: 0, width, height: 192 };
}

export function clampPixelCrop(
  crop: PixelCrop,
  source: PixelSize,
): PixelCrop {
  const x = Math.max(0, Math.min(source.width - 1, Math.round(crop.x)));
  const y = Math.max(0, Math.min(source.height - 1, Math.round(crop.y)));
  const width = Math.max(1, Math.min(source.width - x, Math.round(crop.width)));
  const height = Math.max(1, Math.min(source.height - y, Math.round(crop.height)));
  return { x, y, width, height };
}

export function resizeCropToAspect(
  crop: PixelCrop,
  source: PixelSize,
  aspect: CropAspectRatio,
  primary: "width" | "height",
): PixelCrop {
  const clamped = clampPixelCrop(crop, source);
  const ratio = cropAspectValue(aspect, source);
  if (ratio === null) return clamped;
  const maximumWidth = source.width - clamped.x;
  const maximumHeight = source.height - clamped.y;
  let width = clamped.width;
  let height = clamped.height;
  if (primary === "width") {
    height = Math.max(1, Math.round(width / ratio));
    if (height > maximumHeight) {
      height = maximumHeight;
      width = Math.max(1, Math.round(height * ratio));
    }
  } else {
    width = Math.max(1, Math.round(height * ratio));
    if (width > maximumWidth) {
      width = maximumWidth;
      height = Math.max(1, Math.round(width / ratio));
    }
  }
  return clampPixelCrop({ ...clamped, width, height }, source);
}

export function selectionFromDrag(
  start: PixelPoint,
  current: PixelPoint,
  source: PixelSize,
  aspect: CropAspectRatio,
): PixelCrop {
  const startX = Math.max(0, Math.min(source.width - 1, Math.round(start.x)));
  const startY = Math.max(0, Math.min(source.height - 1, Math.round(start.y)));
  const currentX = Math.max(0, Math.min(source.width, Math.round(current.x)));
  const currentY = Math.max(0, Math.min(source.height, Math.round(current.y)));
  const signX = currentX < startX ? -1 : 1;
  const signY = currentY < startY ? -1 : 1;
  const maximumWidth = signX > 0 ? source.width - startX : startX + 1;
  const maximumHeight = signY > 0 ? source.height - startY : startY + 1;
  let width = Math.max(1, Math.min(maximumWidth, Math.abs(currentX - startX)));
  let height = Math.max(1, Math.min(maximumHeight, Math.abs(currentY - startY)));
  const ratio = cropAspectValue(aspect, source);
  if (ratio !== null) {
    if (width / height > ratio) width = Math.max(1, Math.round(height * ratio));
    else height = Math.max(1, Math.round(width / ratio));
    if (width > maximumWidth) {
      width = maximumWidth;
      height = Math.max(1, Math.round(width / ratio));
    }
    if (height > maximumHeight) {
      height = maximumHeight;
      width = Math.max(1, Math.round(height * ratio));
    }
  }
  const x = signX > 0 ? startX : startX - width + 1;
  const y = signY > 0 ? startY : startY - height + 1;
  return clampPixelCrop({ x, y, width, height }, source);
}

export function moveCropFromDrag(
  crop: PixelCrop,
  start: PixelPoint,
  current: PixelPoint,
  source: PixelSize,
): PixelCrop {
  const clamped = clampPixelCrop(crop, source);
  const deltaX = Math.round(current.x - start.x);
  const deltaY = Math.round(current.y - start.y);
  return {
    ...clamped,
    x: Math.max(0, Math.min(source.width - clamped.width, clamped.x + deltaX)),
    y: Math.max(0, Math.min(source.height - clamped.height, clamped.y + deltaY)),
  };
}

export function previewPointToSource(
  preview: PixelPoint,
  frame: CropPreviewFrame,
  source: PixelSize,
): PixelPoint {
  return {
    x: Math.max(0, Math.min(
      source.width,
      (preview.x - frame.x) * source.width / frame.width,
    )),
    y: Math.max(0, Math.min(
      source.height,
      (preview.y - frame.y) * source.height / frame.height,
    )),
  };
}
