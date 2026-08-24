export type QlMixedDisplayResolution = "high" | "low";

export function renderQlMixedDisplayPreview(
  lowPreviewRgba: Uint8Array,
  highPreviewRgba: Uint8Array,
  width: number,
  resolution: QlMixedDisplayResolution,
): Uint8Array {
  if (
    width <= 0 ||
    width % 2 !== 0 ||
    lowPreviewRgba.length !== highPreviewRgba.length ||
    lowPreviewRgba.length % (width * 4) !== 0
  ) {
    throw new RangeError("QL mixed previews must have matching even-width RGBA dimensions.");
  }

  const output = new Uint8Array(lowPreviewRgba.length);
  for (let rowOffset = 0; rowOffset < output.length; rowOffset += width * 4) {
    for (let x = 0; x < width; x += 2) {
      const leftOffset = rowOffset + x * 4;
      const rightOffset = leftOffset + 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const low = lowPreviewRgba[leftOffset + channel] ?? 0;
        const highLeft = highPreviewRgba[leftOffset + channel] ?? 0;
        const highRight = highPreviewRgba[rightOffset + channel] ?? 0;
        if (resolution === "low") {
          const highAverage = (highLeft + highRight) >> 1;
          const mixed = (low + highAverage) >> 1;
          output[leftOffset + channel] = mixed;
          output[rightOffset + channel] = mixed;
        } else {
          output[leftOffset + channel] = (low + highLeft) >> 1;
          output[rightOffset + channel] = (low + highRight) >> 1;
        }
      }
      output[leftOffset + 3] = 255;
      output[rightOffset + 3] = 255;
    }
  }
  return output;
}
