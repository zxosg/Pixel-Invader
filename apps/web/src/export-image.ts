/** Enlarge an RGBA image by exact pixel replication, without interpolation. */
export function scaleRgbaNearest(
  rgba: Uint8Array,
  width: number,
  height: number,
  factor: 1 | 2 | 3 | 4,
): { readonly rgba: Uint8Array; readonly width: number; readonly height: number } {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 ||
      !Number.isInteger(factor) || factor < 1 || factor > 4 || rgba.length !== width * height * 4) {
    throw new RangeError("Image dimensions, zoom factor, and RGBA data must be valid.");
  }
  if (factor === 1) return { rgba, width, height };
  const scaledWidth = width * factor;
  const scaledHeight = height * factor;
  const scaled = new Uint8Array(scaledWidth * scaledHeight * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (y * width + x) * 4;
      for (let repeatY = 0; repeatY < factor; repeatY += 1) {
        const rowOffset = ((y * factor + repeatY) * scaledWidth + x * factor) * 4;
        for (let repeatX = 0; repeatX < factor; repeatX += 1) {
          const targetOffset = rowOffset + repeatX * 4;
          scaled[targetOffset] = rgba[sourceOffset]!;
          scaled[targetOffset + 1] = rgba[sourceOffset + 1]!;
          scaled[targetOffset + 2] = rgba[sourceOffset + 2]!;
          scaled[targetOffset + 3] = rgba[sourceOffset + 3]!;
        }
      }
    }
  }
  return { rgba: scaled, width: scaledWidth, height: scaledHeight };
}
