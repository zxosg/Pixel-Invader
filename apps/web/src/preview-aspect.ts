export interface PreviewAspect {
  readonly width: number;
  readonly height: number;
}

export interface PreviewFitSize {
  readonly width: number;
  readonly height: number;
}

export function resolvePreviewAspect(
  imageWidth: number,
  imageHeight: number,
  applyDisplayPixelAspect: boolean,
  verticalPixelScale = 1,
  horizontalPixelScale = 4 / 3,
  logicalVerticalScale = 1,
): PreviewAspect {
  return {
    width: applyDisplayPixelAspect
      ? imageWidth * horizontalPixelScale
      : imageWidth,
    height: (applyDisplayPixelAspect
      ? imageHeight * verticalPixelScale
      : imageHeight) * logicalVerticalScale,
  };
}

/**
 * Return the largest aspect-ratio-preserving size that fits inside a viewport.
 * The dimensions are deliberately kept as floats so the browser can retain
 * the best possible fit for fractional CSS pixels.
 */
export function fitPreviewToViewport(
  viewportWidth: number,
  viewportHeight: number,
  contentWidth: number,
  contentHeight: number,
): PreviewFitSize | null {
  if (![viewportWidth, viewportHeight, contentWidth, contentHeight].every(Number.isFinite) ||
      viewportWidth <= 0 || viewportHeight <= 0 || contentWidth <= 0 || contentHeight <= 0) {
    return null;
  }
  const scale = Math.min(viewportWidth / contentWidth, viewportHeight / contentHeight);
  return {
    width: contentWidth * scale,
    height: contentHeight * scale,
  };
}
