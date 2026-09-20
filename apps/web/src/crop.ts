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

export type CropResizeHandle =
  | "nw" | "n" | "ne"
  | "e"
  | "se" | "s" | "sw"
  | "w";

function assertDestinationSize(destination: PixelSize): void {
  if (!Number.isInteger(destination.width) || destination.width < 1 ||
      !Number.isInteger(destination.height) || destination.height < 1) {
    throw new RangeError("Destination dimensions must be positive integers.");
  }
}

export function pointIsInsideCrop(point: PixelPoint, crop: PixelCrop): boolean {
  return point.x >= crop.x && point.x < crop.x + crop.width &&
    point.y >= crop.y && point.y < crop.y + crop.height;
}

export function cropResizeHandleAtPoint(
  point: PixelPoint,
  crop: PixelCrop,
  tolerance: number,
): CropResizeHandle | null {
  if (!Number.isFinite(tolerance) || tolerance < 0) return null;
  const left = crop.x;
  const right = crop.x + crop.width;
  const top = crop.y;
  const bottom = crop.y + crop.height;
  const withinX = point.x >= left - tolerance && point.x <= right + tolerance;
  const withinY = point.y >= top - tolerance && point.y <= bottom + tolerance;
  if (!withinX || !withinY) return null;
  const nearLeft = Math.abs(point.x - left) <= tolerance;
  const nearRight = Math.abs(point.x - right) <= tolerance;
  const nearTop = Math.abs(point.y - top) <= tolerance;
  const nearBottom = Math.abs(point.y - bottom) <= tolerance;
  if (nearTop && nearLeft) return "nw";
  if (nearTop && nearRight) return "ne";
  if (nearBottom && nearRight) return "se";
  if (nearBottom && nearLeft) return "sw";
  if (nearTop) return "n";
  if (nearRight) return "e";
  if (nearBottom) return "s";
  if (nearLeft) return "w";
  return null;
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
  destination: PixelSize,
): number | null {
  assertDestinationSize(destination);
  if (aspect === "none") return null;
  return aspect === "destination"
    ? destination.width / destination.height
    : source.width / source.height;
}

export function fitCropPreviewFrame(
  source: PixelSize,
  destination: PixelSize,
): CropPreviewFrame {
  assertDestinationSize(destination);
  if (source.width * destination.height > source.height * destination.width) {
    const height = Math.max(1, Math.round(
      source.height * destination.width / source.width,
    ));
    return {
      x: 0,
      y: Math.floor((destination.height - height) / 2),
      width: destination.width,
      height,
    };
  }
  const width = Math.max(1, Math.round(
    source.width * destination.height / source.height,
  ));
  return {
    x: Math.floor((destination.width - width) / 2),
    y: 0,
    width,
    height: destination.height,
  };
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
  destination: PixelSize,
): PixelCrop {
  const clamped = clampPixelCrop(crop, source);
  const ratio = cropAspectValue(aspect, source, destination);
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
  destination: PixelSize,
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
  const ratio = cropAspectValue(aspect, source, destination);
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

function resizeLockedCrop(
  crop: PixelCrop,
  current: PixelPoint,
  source: PixelSize,
  handle: CropResizeHandle,
  ratio: number,
): PixelCrop {
  const right = crop.x + crop.width;
  const bottom = crop.y + crop.height;
  const currentX = Math.max(0, Math.min(source.width, Math.round(current.x)));
  const currentY = Math.max(0, Math.min(source.height, Math.round(current.y)));
  const isLeft = handle.includes("w");
  const isTop = handle.includes("n");
  const isCorner = handle.length === 2;
  const anchorX = isLeft ? right : crop.x;
  const anchorY = isTop ? bottom : crop.y;
  const maxWidth = isLeft ? anchorX : source.width - anchorX;
  const maxHeight = isTop ? anchorY : source.height - anchorY;
  const rawWidth = isLeft ? anchorX - currentX : currentX - anchorX;
  const rawHeight = isTop ? anchorY - currentY : currentY - anchorY;

  if (isCorner) {
    let width = Math.max(1, Math.min(maxWidth, rawWidth, Math.floor(rawHeight * ratio)));
    let height = Math.max(1, Math.round(width / ratio));
    if (width > maxWidth) {
      width = maxWidth;
      height = Math.max(1, Math.round(width / ratio));
    }
    if (height > maxHeight) {
      height = maxHeight;
      width = Math.max(1, Math.round(height * ratio));
    }
    return clampPixelCrop({
      x: isLeft ? anchorX - width : anchorX,
      y: isTop ? anchorY - height : anchorY,
      width,
      height,
    }, source);
  }

  if (handle === "e" || handle === "w") {
    const requestedWidth = Math.max(1, Math.min(maxWidth, rawWidth));
    const centerY = crop.y + crop.height / 2;
    const availableHeight = Math.max(1, Math.floor(2 * Math.min(centerY, source.height - centerY)));
    const width = Math.max(1, Math.min(requestedWidth, Math.floor(availableHeight * ratio)));
    const height = Math.max(1, Math.round(width / ratio));
    return clampPixelCrop({
      x: handle === "w" ? anchorX - width : anchorX,
      y: Math.round(centerY - height / 2),
      width,
      height,
    }, source);
  }

  const requestedHeight = Math.max(1, Math.min(maxHeight, rawHeight));
  const centerX = crop.x + crop.width / 2;
  const availableWidth = Math.max(1, Math.floor(2 * Math.min(centerX, source.width - centerX)));
  const height = Math.max(1, Math.min(requestedHeight, Math.floor(availableWidth / ratio)));
  const width = Math.max(1, Math.round(height * ratio));
  return clampPixelCrop({
    x: Math.round(centerX - width / 2),
    y: handle === "n" ? anchorY - height : anchorY,
    width,
    height,
  }, source);
}

export function resizeCropFromDrag(
  crop: PixelCrop,
  current: PixelPoint,
  source: PixelSize,
  aspect: CropAspectRatio,
  handle: CropResizeHandle,
  destination: PixelSize,
): PixelCrop {
  const clamped = clampPixelCrop(crop, source);
  const currentX = Math.max(0, Math.min(source.width, Math.round(current.x)));
  const currentY = Math.max(0, Math.min(source.height, Math.round(current.y)));
  const right = clamped.x + clamped.width;
  const bottom = clamped.y + clamped.height;
  const isLeft = handle.includes("w");
  const isTop = handle.includes("n");
  const isCorner = handle.length === 2;
  const anchorX = isLeft ? right : clamped.x;
  const anchorY = isTop ? bottom : clamped.y;
  if (aspect === "none") {
    if (isCorner) {
      return clampPixelCrop({
        x: isLeft ? Math.min(currentX, anchorX - 1) : anchorX,
        y: isTop ? Math.min(currentY, anchorY - 1) : anchorY,
        width: Math.max(1, isLeft ? anchorX - currentX : currentX - anchorX),
        height: Math.max(1, isTop ? anchorY - currentY : currentY - anchorY),
      }, source);
    }
    if (handle === "e" || handle === "w") {
      const width = Math.max(1, isLeft ? anchorX - currentX : currentX - anchorX);
      return clampPixelCrop({
        x: isLeft ? anchorX - width : anchorX,
        y: clamped.y,
        width,
        height: clamped.height,
      }, source);
    }
    const height = Math.max(1, isTop ? anchorY - currentY : currentY - anchorY);
    return clampPixelCrop({
      x: clamped.x,
      y: isTop ? anchorY - height : anchorY,
      width: clamped.width,
      height,
    }, source);
  }
  const ratio = cropAspectValue(aspect, source, destination);
  if (ratio === null) return clamped;
  return resizeLockedCrop(clamped, current, source, handle, ratio);
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
