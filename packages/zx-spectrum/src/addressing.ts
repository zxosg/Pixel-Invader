import {
  ZX_ATTRIBUTE_COLUMNS,
  ZX_ATTRIBUTE_ROWS,
  ZX_BITMAP_BYTES,
  ZX_SCREEN_HEIGHT,
} from "./constants.js";

export function zxBitmapOffset(xByte: number, y: number): number {
  if (!Number.isInteger(xByte) || xByte < 0 || xByte >= 32) {
    throw new RangeError("xByte must be an integer from 0 through 31.");
  }
  if (!Number.isInteger(y) || y < 0 || y >= ZX_SCREEN_HEIGHT) {
    throw new RangeError("y must be an integer from 0 through 191.");
  }

  return (
    ((y & 0xc0) << 5) |
    ((y & 0x07) << 8) |
    ((y & 0x38) << 2) |
    xByte
  );
}

export function zxAttributeOffset(xCell: number, yCell: number): number {
  if (
    !Number.isInteger(xCell) ||
    xCell < 0 ||
    xCell >= ZX_ATTRIBUTE_COLUMNS
  ) {
    throw new RangeError("xCell must be an integer from 0 through 31.");
  }
  if (
    !Number.isInteger(yCell) ||
    yCell < 0 ||
    yCell >= ZX_ATTRIBUTE_ROWS
  ) {
    throw new RangeError("yCell must be an integer from 0 through 23.");
  }

  return ZX_BITMAP_BYTES + yCell * ZX_ATTRIBUTE_COLUMNS + xCell;
}

