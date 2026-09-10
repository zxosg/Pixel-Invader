import {
  ZX_ATTRIBUTE_COLUMNS,
  ZX_BITMAP_BYTES,
  ZX_FLASH_MASK,
  ZX_SCREEN_HEIGHT,
  ZX_SCREEN_WIDTH,
} from "./constants.js";
import { zxBitmapOffset } from "./addressing.js";
import { ZxValidationError, type ZxValidationIssue } from "./validation.js";

export type ZxAttributeHeight = 1 | 2 | 4 | 8;

export function zxAttributeRows(attributeHeight: ZxAttributeHeight): number {
  return ZX_SCREEN_HEIGHT / attributeHeight;
}

export function zxSoftwareScrBytes(attributeHeight: ZxAttributeHeight): number {
  return ZX_BITMAP_BYTES + ZX_ATTRIBUTE_COLUMNS * zxAttributeRows(attributeHeight);
}

/** Canonical linear interchange size for the full-screen 8×1 software mode. */
export const ZX_SOFTWARE_8X1_LINEAR_BYTES = ZX_BITMAP_BYTES * 2;

export function validateSoftwareScreen(
  pixels: Uint8Array,
  attributes: Uint8Array,
  attributeHeight: ZxAttributeHeight,
): ZxValidationIssue[] {
  const issues: ZxValidationIssue[] = [];
  const expectedPixels = ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT;
  const expectedAttributes = ZX_ATTRIBUTE_COLUMNS * zxAttributeRows(attributeHeight);
  if (pixels.length !== expectedPixels) {
    issues.push({
      code: "SCREEN_PIXEL_LENGTH",
      message: `Expected ${expectedPixels} pixels, received ${pixels.length}.`,
    });
  }
  for (let offset = 0; offset < Math.min(pixels.length, expectedPixels); offset += 1) {
    const value = pixels[offset];
    if (value !== 0 && value !== 1) {
      issues.push({
        code: "SCREEN_PIXEL_VALUE",
        message: `Pixel ${offset} must be 0 or 1, received ${String(value)}.`,
        offset,
      });
      break;
    }
  }
  if (attributes.length !== expectedAttributes) {
    issues.push({
      code: "SCREEN_ATTRIBUTE_LENGTH",
      message: `Expected ${expectedAttributes} attributes, received ${attributes.length}.`,
    });
  }
  for (let offset = 0; offset < Math.min(attributes.length, expectedAttributes); offset += 1) {
    if (((attributes[offset] ?? 0) & ZX_FLASH_MASK) !== 0) {
      issues.push({
        code: "SCREEN_FLASH_SET",
        message: `Attribute ${offset} has FLASH set.`,
        offset,
      });
      break;
    }
  }
  return issues;
}

export function serializeSoftwareScr(
  pixels: Uint8Array,
  attributes: Uint8Array,
  attributeHeight: ZxAttributeHeight,
): Uint8Array {
  const issues = validateSoftwareScreen(pixels, attributes, attributeHeight);
  if (issues.length > 0) throw new ZxValidationError(issues);
  const output = new Uint8Array(zxSoftwareScrBytes(attributeHeight));
  for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
    const sourceRow = y * ZX_SCREEN_WIDTH;
    for (let xByte = 0; xByte < ZX_ATTRIBUTE_COLUMNS; xByte += 1) {
      let packed = 0;
      const sourceByte = sourceRow + xByte * 8;
      for (let bit = 0; bit < 8; bit += 1) {
        packed |= (pixels[sourceByte + bit] ?? 0) << (7 - bit);
      }
      output[zxBitmapOffset(xByte, y)] = packed;
    }
  }
  output.set(attributes, ZX_BITMAP_BYTES);
  return output;
}

/**
 * Serializes the canonical full-screen 8×1 software-attribute interchange
 * payload: a linear row-major pixel plane followed by a linear row-major
 * 32×192 attribute plane. This is intentionally separate from standard .scr.
 */
export function serializeSoftware8x1Linear(
  pixels: Uint8Array,
  attributes: Uint8Array,
): Uint8Array {
  const issues = validateSoftwareScreen(pixels, attributes, 1);
  if (issues.length > 0) throw new ZxValidationError(issues);
  const output = new Uint8Array(ZX_SOFTWARE_8X1_LINEAR_BYTES);
  for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
    for (let xByte = 0; xByte < ZX_ATTRIBUTE_COLUMNS; xByte += 1) {
      let packed = 0;
      const source = y * ZX_SCREEN_WIDTH + xByte * 8;
      for (let bit = 0; bit < 8; bit += 1) {
        packed |= (pixels[source + bit] ?? 0) << (7 - bit);
      }
      output[y * ZX_ATTRIBUTE_COLUMNS + xByte] = packed;
    }
  }
  output.set(attributes, ZX_BITMAP_BYTES);
  return output;
}

export function validateSoftware8x1Linear(bytes: Uint8Array): ZxValidationIssue[] {
  if (bytes.length !== ZX_SOFTWARE_8X1_LINEAR_BYTES) {
    return [{
      code: "SCR_LENGTH",
      message: `Expected ${ZX_SOFTWARE_8X1_LINEAR_BYTES} bytes, received ${bytes.length}.`,
    }];
  }
  const attributes = bytes.subarray(ZX_BITMAP_BYTES);
  const issues: ZxValidationIssue[] = [];
  for (let offset = 0; offset < attributes.length; offset += 1) {
    if ((attributes[offset]! & ZX_FLASH_MASK) !== 0) {
      issues.push({
        code: "SCREEN_FLASH_SET",
        message: `Attribute ${offset} has FLASH set.`,
        offset,
      });
      break;
    }
  }
  return issues;
}

export function assertValidSoftware8x1Linear(bytes: Uint8Array): void {
  const issues = validateSoftware8x1Linear(bytes);
  if (issues.length > 0) throw new ZxValidationError(issues);
}

export function validateSoftwareScr(
  bytes: Uint8Array,
  attributeHeight: ZxAttributeHeight,
): ZxValidationIssue[] {
  const expected = zxSoftwareScrBytes(attributeHeight);
  if (bytes.length !== expected) {
    return [{
      code: "SCR_LENGTH",
      message: `Expected ${expected} bytes, received ${bytes.length}.`,
    }];
  }
  for (let offset = ZX_BITMAP_BYTES; offset < bytes.length; offset += 1) {
    if (((bytes[offset] ?? 0) & ZX_FLASH_MASK) !== 0) {
      return [{
        code: "SCR_FLASH_SET",
        message: `Attribute byte ${offset - ZX_BITMAP_BYTES} has FLASH set.`,
        offset,
      }];
    }
  }
  return [];
}

export function assertValidSoftwareScr(
  bytes: Uint8Array,
  attributeHeight: ZxAttributeHeight,
): void {
  const issues = validateSoftwareScr(bytes, attributeHeight);
  if (issues.length > 0) throw new ZxValidationError(issues);
}
