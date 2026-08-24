import {
  decode as decodePng,
  type DecodedPng,
} from "fast-png";
import { decode as decodeJpeg } from "jpeg-js";
import { ImageImportError } from "./errors.js";
import { applyExifOrientation } from "./exif.js";
import { inspectImage, type ImageFormat } from "./headers.js";

export interface DecodedImage {
  readonly format: ImageFormat;
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

function sample8(data: Uint8Array | Uint8ClampedArray | Uint16Array, index: number): number {
  const value = data[index] ?? 0;
  return data instanceof Uint16Array ? Math.floor((value + 128) / 257) : value;
}

export function expandIndexedPng(decoded: DecodedPng): Uint8Array {
  const palette = decoded.palette;
  if (palette === undefined) {
    throw new RangeError("Indexed PNG palette is missing.");
  }
  if (![1, 2, 4, 8].includes(decoded.depth)) {
    throw new RangeError(`Indexed PNG depth ${decoded.depth} is unsupported.`);
  }
  const depth = decoded.depth;
  const rowBytes = Math.ceil(decoded.width * depth / 8);
  if (decoded.data.length !== rowBytes * decoded.height) {
    throw new RangeError("Indexed PNG data length does not match its dimensions.");
  }
  const mask = (1 << depth) - 1;
  const rgba = new Uint8Array(decoded.width * decoded.height * 4);
  for (let y = 0; y < decoded.height; y += 1) {
    for (let x = 0; x < decoded.width; x += 1) {
      const bitOffset = x * depth;
      const packed = decoded.data[y * rowBytes + Math.floor(bitOffset / 8)] ?? 0;
      const shift = 8 - depth - (bitOffset % 8);
      const paletteIndex = (packed >> shift) & mask;
      const color = palette[paletteIndex];
      if (color === undefined || color.length < 3) {
        throw new RangeError(
          `Indexed PNG palette entry ${paletteIndex} is unavailable.`,
        );
      }
      const target = (y * decoded.width + x) * 4;
      rgba[target] = color[0] ?? 0;
      rgba[target + 1] = color[1] ?? 0;
      rgba[target + 2] = color[2] ?? 0;
      rgba[target + 3] = color[3] ?? 255;
    }
  }
  return rgba;
}

function normalizePng(bytes: Uint8Array): { width: number; height: number; rgba: Uint8Array } {
  const decoded = decodePng(bytes, { checkCrc: true });
  if (decoded.palette !== undefined) {
    return {
      width: decoded.width,
      height: decoded.height,
      rgba: expandIndexedPng(decoded),
    };
  }
  const data = decoded.data;
  const channels = decoded.channels;
  const rgba = new Uint8Array(decoded.width * decoded.height * 4);
  for (let pixel = 0; pixel < decoded.width * decoded.height; pixel += 1) {
    const source = pixel * channels;
    const target = pixel * 4;
    if (channels === 1 || channels === 2) {
      const gray = sample8(data, source);
      rgba[target] = gray;
      rgba[target + 1] = gray;
      rgba[target + 2] = gray;
      rgba[target + 3] = channels === 2 ? sample8(data, source + 1) : 255;
    } else {
      rgba[target] = sample8(data, source);
      rgba[target + 1] = sample8(data, source + 1);
      rgba[target + 2] = sample8(data, source + 2);
      rgba[target + 3] = channels === 4 ? sample8(data, source + 3) : 255;
    }
  }
  return { width: decoded.width, height: decoded.height, rgba };
}

export function decodeImage(bytes: Uint8Array): DecodedImage {
  const header = inspectImage(bytes);
  try {
    const decoded = header.format === "png"
      ? normalizePng(bytes)
      : (() => {
          const jpeg = decodeJpeg(bytes, {
          useTArray: true,
          formatAsRGBA: true,
          tolerantDecoding: false,
          maxResolutionInMP: 32,
          maxMemoryUsageInMB: 256,
          });
          return { width: jpeg.width, height: jpeg.height, rgba: jpeg.data };
        })();
    if (decoded.width !== header.width || decoded.height !== header.height) {
      throw new Error("Decoded dimensions do not match the validated header.");
    }
    const oriented = applyExifOrientation(
      Uint8Array.from(decoded.rgba),
      decoded.width,
      decoded.height,
      header.orientation,
    );
    return { format: header.format, ...oriented };
  } catch (error: unknown) {
    if (error instanceof ImageImportError) throw error;
    throw new ImageImportError(
      "IMAGE_DECODE_FAILED",
      error instanceof Error ? `Image decoding failed: ${error.message}` : "Image decoding failed.",
    );
  }
}
