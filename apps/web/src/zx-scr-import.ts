import { renderScreenRgba, resolveZxPalette, type ZxPalette, type ZxPaletteDefinition } from "@retro-converter/conversion-core";
import { parseScr, ZX_SCREEN_HEIGHT, ZX_SCREEN_WIDTH } from "@retro-converter/zx-spectrum";
import type { WorkerDecodedImage } from "./worker/client.js";

/** Decode a native 6,912-byte ZX Spectrum screen into a normal source image. */
export function decodeZxScrSource(
  bytes: Uint8Array,
  palette?: ZxPalette | ZxPaletteDefinition,
): WorkerDecodedImage {
  const screen = parseScr(bytes);
  return {
    format: "png",
    width: ZX_SCREEN_WIDTH,
    height: ZX_SCREEN_HEIGHT,
    rgba: renderScreenRgba(screen, palette === undefined
      ? undefined
      : "kind" in palette
        ? resolveZxPalette(palette)
        : palette),
  };
}
