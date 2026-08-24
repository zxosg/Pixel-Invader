import {
  ZX_ATTRIBUTE_BYTES,
  ZX_DEFAULT_ATTRIBUTE,
  ZX_SCREEN_HEIGHT,
  ZX_SCREEN_WIDTH,
} from "./constants.js";

export interface ZxScreen {
  readonly pixels: Uint8Array;
  readonly attributes: Uint8Array;
}

export function createBlankScreen(
  attribute: number = ZX_DEFAULT_ATTRIBUTE,
): ZxScreen {
  if (!Number.isInteger(attribute) || attribute < 0 || attribute > 0x7f) {
    throw new RangeError("Attribute must be an integer from 0 through 127.");
  }

  const attributes = new Uint8Array(ZX_ATTRIBUTE_BYTES);
  attributes.fill(attribute);

  return {
    pixels: new Uint8Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT),
    attributes,
  };
}

export function cloneScreen(screen: ZxScreen): ZxScreen {
  return {
    pixels: screen.pixels.slice(),
    attributes: screen.attributes.slice(),
  };
}

