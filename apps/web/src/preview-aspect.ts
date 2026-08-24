export interface PreviewAspect {
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
