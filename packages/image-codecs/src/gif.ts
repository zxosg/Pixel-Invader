import { ImageImportError } from "./errors.js";
import { validateImageLimits } from "./limits.js";

const MAX_GIF_FRAMES = 10_000;

interface GifFrameRecord {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly palette: Uint8Array;
  readonly interlaced: boolean;
  readonly compressed: Uint8Array;
  readonly minimumCodeSize: number;
  readonly transparentIndex: number | null;
  readonly disposal: number;
}

interface ParsedGif {
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
  readonly frames: readonly GifFrameRecord[];
}

function invalid(message: string): never {
  throw new ImageImportError("IMAGE_INVALID_DATA", message);
}

function readWord(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function readPalette(bytes: Uint8Array, offset: number, count: number): Uint8Array {
  const length = count * 3;
  if (offset + length > bytes.length) invalid("GIF color table is truncated.");
  return bytes.subarray(offset, offset + length);
}

function skipSubBlocks(bytes: Uint8Array, offset: number): number {
  let cursor = offset;
  while (true) {
    if (cursor >= bytes.length) invalid("GIF data sub-blocks are truncated.");
    const length = bytes[cursor++] ?? 0;
    if (length === 0) return cursor;
    if (cursor + length > bytes.length) invalid("GIF data sub-block is truncated.");
    cursor += length;
  }
}

function readSubBlocks(bytes: Uint8Array, offset: number): { data: Uint8Array; next: number } {
  let cursor = offset;
  let totalLength = 0;
  while (true) {
    if (cursor >= bytes.length) invalid("GIF image data is truncated.");
    const length = bytes[cursor++] ?? 0;
    if (length === 0) break;
    if (cursor + length > bytes.length) invalid("GIF image data sub-block is truncated.");
    totalLength += length;
    cursor += length;
  }
  const data = new Uint8Array(totalLength);
  let source = offset;
  let target = 0;
  while (source < cursor) {
    const length = bytes[source++] ?? 0;
    if (length === 0) break;
    data.set(bytes.subarray(source, source + length), target);
    source += length;
    target += length;
  }
  return { data, next: cursor };
}

function parseGif(bytes: Uint8Array, retainFrames: boolean): ParsedGif {
  if (bytes.length < 13) invalid("GIF file is truncated before its logical screen descriptor.");
  const signature = String.fromCharCode(...bytes.subarray(0, 6));
  if (signature !== "GIF87a" && signature !== "GIF89a") {
    throw new ImageImportError("IMAGE_UNSUPPORTED_FORMAT", "GIF87a or GIF89a content is required.");
  }
  const width = readWord(bytes, 6);
  const height = readWord(bytes, 8);
  try {
    validateImageLimits(bytes.length, width, height);
  } catch (error: unknown) {
    throw new ImageImportError("IMAGE_LIMIT_EXCEEDED", error instanceof Error ? error.message : "GIF exceeds image limits.");
  }
  const packed = bytes[10] ?? 0;
  const globalPalette = (packed & 0x80) !== 0
    ? readPalette(bytes, 13, 1 << ((packed & 0x07) + 1))
    : null;
  let cursor = 13 + (globalPalette?.length ?? 0);
  let control = { disposal: 0, transparentIndex: null as number | null };
  const frames: GifFrameRecord[] = [];
  let frameCount = 0;
  let sawTrailer = false;
  while (cursor < bytes.length) {
    const marker = bytes[cursor++] ?? 0;
    if (marker === 0x3b) {
      sawTrailer = true;
      break;
    }
    if (marker === 0x21) {
      if (cursor >= bytes.length) invalid("GIF extension is truncated.");
      const label = bytes[cursor++] ?? 0;
      if (label === 0xf9) {
        const length = bytes[cursor++] ?? 0;
        if (length !== 4 || cursor + 5 > bytes.length) invalid("GIF graphic control extension is invalid.");
        const flags = bytes[cursor] ?? 0;
        control = {
          disposal: (flags >> 2) & 0x07,
          transparentIndex: (flags & 1) !== 0 ? bytes[cursor + 3] ?? 0 : null,
        };
        cursor += 4;
        if ((bytes[cursor++] ?? 1) !== 0) invalid("GIF graphic control extension terminator is missing.");
      } else {
        cursor = skipSubBlocks(bytes, cursor);
      }
      continue;
    }
    if (marker !== 0x2c) invalid(`GIF contains an unknown block marker 0x${marker.toString(16)}.`);
    if (cursor + 9 > bytes.length) invalid("GIF image descriptor is truncated.");
    const left = readWord(bytes, cursor);
    const top = readWord(bytes, cursor + 2);
    const frameWidth = readWord(bytes, cursor + 4);
    const frameHeight = readWord(bytes, cursor + 6);
    const descriptorFlags = bytes[cursor + 8] ?? 0;
    cursor += 9;
    if (frameWidth < 1 || frameHeight < 1 || left + frameWidth > width || top + frameHeight > height) {
      invalid("GIF frame dimensions are invalid.");
    }
    let palette = globalPalette;
    if ((descriptorFlags & 0x80) !== 0) {
      palette = readPalette(bytes, cursor, 1 << ((descriptorFlags & 0x07) + 1));
      cursor += palette.length;
    }
    if (palette === null) invalid("GIF frame has no color table.");
    if (cursor >= bytes.length) invalid("GIF LZW code size is missing.");
    const minimumCodeSize = bytes[cursor++] ?? 0;
    if (minimumCodeSize < 2 || minimumCodeSize > 8) invalid("GIF LZW code size is invalid.");
    let compressed: Uint8Array = new Uint8Array();
    if (retainFrames) {
      const imageData = readSubBlocks(bytes, cursor);
      cursor = imageData.next;
      compressed = imageData.data;
    } else {
      cursor = skipSubBlocks(bytes, cursor);
    }
    frameCount += 1;
    if (frameCount > MAX_GIF_FRAMES) {
      throw new ImageImportError("IMAGE_LIMIT_EXCEEDED", `GIF contains more than ${MAX_GIF_FRAMES} frames.`);
    }
    if (retainFrames) frames.push({
      left, top, width: frameWidth, height: frameHeight, palette,
      interlaced: (descriptorFlags & 0x40) !== 0,
      compressed,
      minimumCodeSize,
      transparentIndex: control.transparentIndex,
      disposal: control.disposal,
    });
    control = { disposal: 0, transparentIndex: null };
  }
  if (!sawTrailer) invalid("GIF trailer is missing.");
  if (frameCount === 0) invalid("GIF contains no image frames.");
  return { width, height, frameCount, frames };
}

function decodeLzw(data: Uint8Array, minimumCodeSize: number, expectedLength: number): Uint8Array {
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  const prefix = new Int16Array(4096);
  const suffix = new Uint8Array(4096);
  const stack = new Uint8Array(4097);
  const output = new Uint8Array(expectedLength);
  let outputOffset = 0;
  let bitOffset = 0;
  let codeSize = minimumCodeSize + 1;
  let nextCode = endCode + 1;
  let previousCode = -1;
  let firstCharacter = 0;
  const readCode = (): number => {
    if (bitOffset + codeSize > data.length * 8) return endCode;
    let code = 0;
    for (let bit = 0; bit < codeSize; bit += 1) {
      const absoluteBit = bitOffset + bit;
      code |= (((data[absoluteBit >> 3] ?? 0) >> (absoluteBit & 7)) & 1) << bit;
    }
    bitOffset += codeSize;
    return code;
  };
  while (outputOffset < expectedLength) {
    const inputCode = readCode();
    if (inputCode === endCode) break;
    if (inputCode === clearCode) {
      codeSize = minimumCodeSize + 1;
      nextCode = endCode + 1;
      previousCode = -1;
      continue;
    }
    if (inputCode > nextCode || inputCode >= 4096) invalid("GIF LZW stream contains an invalid code.");
    let code = inputCode;
    let stackSize = 0;
    if (code === nextCode && previousCode >= 0) {
      stack[stackSize++] = firstCharacter;
      code = previousCode;
    }
    while (code >= clearCode) {
      if (code >= nextCode || stackSize >= stack.length) invalid("GIF LZW dictionary reference is invalid.");
      stack[stackSize++] = suffix[code] ?? 0;
      code = prefix[code] ?? 0;
    }
    firstCharacter = code;
    stack[stackSize++] = firstCharacter;
    while (stackSize > 0 && outputOffset < expectedLength) {
      output[outputOffset++] = stack[--stackSize] ?? 0;
    }
    if (previousCode >= 0 && nextCode < 4096) {
      prefix[nextCode] = previousCode;
      suffix[nextCode] = firstCharacter;
      nextCode += 1;
      if (nextCode === (1 << codeSize) && codeSize < 12) codeSize += 1;
    }
    previousCode = inputCode;
  }
  if (outputOffset !== expectedLength) invalid("GIF LZW stream ended before the frame was complete.");
  return output;
}

function orderedIndices(frame: GifFrameRecord): Uint8Array {
  const decoded = decodeLzw(frame.compressed, frame.minimumCodeSize, frame.width * frame.height);
  if (!frame.interlaced) return decoded;
  const ordered = new Uint8Array(decoded.length);
  let source = 0;
  for (const pass of [[0, 8], [4, 8], [2, 4], [1, 2]] as const) {
    const [start, step] = pass;
    for (let y = start; y < frame.height; y += step) {
      ordered.set(decoded.subarray(source, source + frame.width), y * frame.width);
      source += frame.width;
    }
  }
  return ordered;
}

export interface GifInfo {
  readonly width: number;
  readonly height: number;
  readonly frameCount: number;
}

export function inspectGif(bytes: Uint8Array): GifInfo {
  const parsed = parseGif(bytes, false);
  return { width: parsed.width, height: parsed.height, frameCount: parsed.frameCount };
}

export function decodeGifFrame(bytes: Uint8Array, frameIndex: number): GifInfo & { readonly rgba: Uint8Array } {
  const gif = parseGif(bytes, true);
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= gif.frameCount) {
    throw new RangeError(`GIF frame index must be from 0 through ${gif.frameCount - 1}.`);
  }
  const canvas = new Uint8Array(gif.width * gif.height * 4);
  let previous: GifFrameRecord | null = null;
  let restoreCanvas: Uint8Array | null = null;
  for (let index = 0; index <= frameIndex; index += 1) {
    if (previous !== null) {
      if (previous.disposal === 2) {
        for (let y = 0; y < previous.height; y += 1) {
          for (let x = 0; x < previous.width; x += 1) {
            const px = previous.left + x, py = previous.top + y;
            if (px >= gif.width || py >= gif.height) continue;
            canvas.fill(0, (py * gif.width + px) * 4, (py * gif.width + px) * 4 + 4);
          }
        }
      } else if (previous.disposal === 3 && restoreCanvas !== null) {
        canvas.set(restoreCanvas);
      }
    }
    const frame = gif.frames[index]!;
    restoreCanvas = frame.disposal === 3 ? canvas.slice() : null;
    const indices = orderedIndices(frame);
    for (let y = 0; y < frame.height; y += 1) {
      const py = frame.top + y;
      if (py >= gif.height) continue;
      for (let x = 0; x < frame.width; x += 1) {
        const px = frame.left + x;
        if (px >= gif.width) continue;
        const colorIndex = indices[y * frame.width + x] ?? 0;
        if (colorIndex === frame.transparentIndex) continue;
        const paletteOffset = colorIndex * 3;
        if (paletteOffset + 2 >= frame.palette.length) invalid("GIF pixel references a missing palette color.");
        const outputOffset = (py * gif.width + px) * 4;
        canvas[outputOffset] = frame.palette[paletteOffset] ?? 0;
        canvas[outputOffset + 1] = frame.palette[paletteOffset + 1] ?? 0;
        canvas[outputOffset + 2] = frame.palette[paletteOffset + 2] ?? 0;
        canvas[outputOffset + 3] = 255;
      }
    }
    previous = frame;
  }
  return { width: gif.width, height: gif.height, frameCount: gif.frameCount, rgba: canvas };
}
