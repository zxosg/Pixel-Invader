import {
  ZX_ATTRIBUTE_BYTES,
  ZX_BITMAP_BYTES,
  ZX_SCREEN_HEIGHT,
  ZX_SCREEN_WIDTH,
  ZX_SCR_BYTES,
} from "./constants.js";
import { zxBitmapOffset } from "./addressing.js";
import type { ZxScreen } from "./screen.js";
import { assertValidScr, assertValidScreen } from "./validation.js";

export function serializeScr(screen: ZxScreen): Uint8Array {
  assertValidScreen(screen);

  const output = new Uint8Array(ZX_SCR_BYTES);

  for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
    const sourceRow = y * ZX_SCREEN_WIDTH;
    for (let xByte = 0; xByte < 32; xByte += 1) {
      let packed = 0;
      const sourceByte = sourceRow + xByte * 8;
      for (let bit = 0; bit < 8; bit += 1) {
        packed |= (screen.pixels[sourceByte + bit] ?? 0) << (7 - bit);
      }
      output[zxBitmapOffset(xByte, y)] = packed;
    }
  }

  output.set(screen.attributes, ZX_BITMAP_BYTES);
  assertValidScr(output);
  return output;
}

export function parseScr(bytes: Uint8Array): ZxScreen {
  assertValidScr(bytes);

  const pixels = new Uint8Array(ZX_SCREEN_WIDTH * ZX_SCREEN_HEIGHT);

  for (let y = 0; y < ZX_SCREEN_HEIGHT; y += 1) {
    const targetRow = y * ZX_SCREEN_WIDTH;
    for (let xByte = 0; xByte < 32; xByte += 1) {
      const packed = bytes[zxBitmapOffset(xByte, y)] ?? 0;
      const targetByte = targetRow + xByte * 8;
      for (let bit = 0; bit < 8; bit += 1) {
        pixels[targetByte + bit] = (packed >> (7 - bit)) & 1;
      }
    }
  }

  return {
    pixels,
    attributes: bytes.slice(
      ZX_BITMAP_BYTES,
      ZX_BITMAP_BYTES + ZX_ATTRIBUTE_BYTES,
    ),
  };
}

