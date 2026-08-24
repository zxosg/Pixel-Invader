export const MAX_INPUT_BYTES = 50 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 8_192;
export const MAX_IMAGE_PIXELS = 32_000_000;
export const MAX_METADATA_BYTES = 4 * 1024 * 1024;

export function validateImageLimits(
  inputBytes: number,
  width: number,
  height: number,
): void {
  if (inputBytes > MAX_INPUT_BYTES) {
    throw new RangeError("Image file exceeds the 50 MiB v1.0 limit.");
  }
  if (width < 1 || height < 1) {
    throw new RangeError("Image dimensions must be positive.");
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    throw new RangeError("Image dimension exceeds the 8,192 pixel v1.0 limit.");
  }
  if (width * height > MAX_IMAGE_PIXELS) {
    throw new RangeError("Image exceeds the 32 megapixel v1.0 limit.");
  }
}
