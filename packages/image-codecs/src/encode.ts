import { encode as encodePng } from "fast-png";

export function encodeRgbaPng(
  rgba: Uint8Array,
  width: number,
  height: number,
): Uint8Array {
  if (
    !Number.isInteger(width) || !Number.isInteger(height) ||
    width < 1 || height < 1 || rgba.length !== width * height * 4
  ) {
    throw new RangeError("PNG RGBA dimensions are invalid.");
  }
  return Uint8Array.from(encodePng({ width, height, data: rgba, channels: 4 }));
}
