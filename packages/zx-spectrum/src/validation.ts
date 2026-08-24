import {
  ZX_ATTRIBUTE_BYTES,
  ZX_BITMAP_BYTES,
  ZX_FLASH_MASK,
  ZX_SCREEN_HEIGHT,
  ZX_SCREEN_WIDTH,
  ZX_SCR_BYTES,
} from "./constants.js";
import type { ZxScreen } from "./screen.js";

export type ZxValidationCode =
  | "SCREEN_PIXEL_LENGTH"
  | "SCREEN_PIXEL_VALUE"
  | "SCREEN_ATTRIBUTE_LENGTH"
  | "SCREEN_FLASH_SET"
  | "SCR_LENGTH"
  | "SCR_FLASH_SET";

export interface ZxValidationIssue {
  readonly code: ZxValidationCode;
  readonly message: string;
  readonly offset?: number;
}

export function validateScreen(screen: ZxScreen): ZxValidationIssue[] {
  const issues: ZxValidationIssue[] = [];
  const expectedPixels = ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT;

  if (screen.pixels.length !== expectedPixels) {
    issues.push({
      code: "SCREEN_PIXEL_LENGTH",
      message: `Expected ${expectedPixels} pixels, received ${screen.pixels.length}.`,
    });
  }

  const pixelLimit = Math.min(screen.pixels.length, expectedPixels);
  for (let offset = 0; offset < pixelLimit; offset += 1) {
    const value = screen.pixels[offset];
    if (value !== 0 && value !== 1) {
      issues.push({
        code: "SCREEN_PIXEL_VALUE",
        message: `Pixel ${offset} must be 0 or 1, received ${String(value)}.`,
        offset,
      });
      break;
    }
  }

  if (screen.attributes.length !== ZX_ATTRIBUTE_BYTES) {
    issues.push({
      code: "SCREEN_ATTRIBUTE_LENGTH",
      message: `Expected ${ZX_ATTRIBUTE_BYTES} attributes, received ${screen.attributes.length}.`,
    });
  }

  const attributeLimit = Math.min(
    screen.attributes.length,
    ZX_ATTRIBUTE_BYTES,
  );
  for (let offset = 0; offset < attributeLimit; offset += 1) {
    const value = screen.attributes[offset];
    if (value !== undefined && (value & ZX_FLASH_MASK) !== 0) {
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

export function validateScr(bytes: Uint8Array): ZxValidationIssue[] {
  const issues: ZxValidationIssue[] = [];

  if (bytes.length !== ZX_SCR_BYTES) {
    issues.push({
      code: "SCR_LENGTH",
      message: `Expected ${ZX_SCR_BYTES} bytes, received ${bytes.length}.`,
    });
    return issues;
  }

  for (let offset = ZX_BITMAP_BYTES; offset < ZX_SCR_BYTES; offset += 1) {
    const value = bytes[offset];
    if (value !== undefined && (value & ZX_FLASH_MASK) !== 0) {
      issues.push({
        code: "SCR_FLASH_SET",
        message: `Attribute byte ${offset - ZX_BITMAP_BYTES} has FLASH set.`,
        offset,
      });
      break;
    }
  }

  return issues;
}

export function assertValidScreen(screen: ZxScreen): void {
  const issues = validateScreen(screen);
  if (issues.length > 0) {
    throw new ZxValidationError(issues);
  }
}

export function assertValidScr(bytes: Uint8Array): void {
  const issues = validateScr(bytes);
  if (issues.length > 0) {
    throw new ZxValidationError(issues);
  }
}

export class ZxValidationError extends Error {
  readonly issues: readonly ZxValidationIssue[];

  constructor(issues: readonly ZxValidationIssue[]) {
    super(issues.map((issue) => issue.message).join(" "));
    this.name = "ZxValidationError";
    this.issues = issues;
  }
}

