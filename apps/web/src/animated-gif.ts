export interface GifRgbaFrame {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

export interface GifBorder {
  readonly width: number;
  readonly color: readonly [number, number, number];
}

/** Adds opaque, symmetric padding to a GIF frame without changing its pixels. */
export function addGifBorder(frame: GifRgbaFrame, border: GifBorder): GifRgbaFrame {
  if (!Number.isInteger(border.width) || border.width < 0 || border.width > 0xffff ||
      border.color.some((channel) => !Number.isInteger(channel) || channel < 0 || channel > 255)) {
    throw new RangeError("GIF border dimensions and color are invalid.");
  }
  if (frame.rgba.length !== frame.width * frame.height * 4) {
    throw new RangeError("GIF frame dimensions and RGBA data do not match.");
  }
  const width = frame.width + border.width * 2;
  const height = frame.height + border.width * 2;
  if (width > 0xffff || height > 0xffff) throw new RangeError("Padded GIF dimensions exceed the format limit.");
  const rgba = new Uint8Array(width * height * 4);
  const [red, green, blue] = border.color;
  for (let offset = 0; offset < rgba.length; offset += 4) {
    rgba[offset] = red;
    rgba[offset + 1] = green;
    rgba[offset + 2] = blue;
    rgba[offset + 3] = 255;
  }
  for (let y = 0; y < frame.height; y += 1) {
    const sourceStart = y * frame.width * 4;
    const targetStart = ((y + border.width) * width + border.width) * 4;
    rgba.set(frame.rgba.subarray(sourceStart, sourceStart + frame.width * 4), targetStart);
  }
  return { width, height, rgba };
}

function pushWord(bytes: number[], value: number): void {
  bytes.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeSubBlocks(bytes: number[], data: Uint8Array): void {
  for (let offset = 0; offset < data.length; offset += 255) {
    const block = data.subarray(offset, Math.min(offset + 255, data.length));
    bytes.push(block.length, ...block);
  }
  bytes.push(0);
}

function packCodes(codes: readonly { code: number; size: number }[]): Uint8Array {
  const bytes: number[] = [];
  let accumulator = 0;
  let bitCount = 0;
  for (const { code, size } of codes) {
    accumulator |= code << bitCount;
    bitCount += size;
    while (bitCount >= 8) {
      bytes.push(accumulator & 0xff);
      accumulator >>>= 8;
      bitCount -= 8;
    }
  }
  if (bitCount > 0) bytes.push(accumulator & 0xff);
  return Uint8Array.from(bytes);
}

function lzwEncode(indices: Uint8Array, minimumCodeSize: number): Uint8Array {
  const clearCode = 1 << minimumCodeSize;
  const endCode = clearCode + 1;
  const codes: { code: number; size: number }[] = [];
  let codeSize = minimumCodeSize + 1;
  let nextCode = endCode + 1;
  let dictionary = new Map<number, number>();
  let growCodeSizeAfterNextOutput = false;
  const emit = (code: number) => {
    codes.push({ code, size: codeSize });
    if (growCodeSizeAfterNextOutput && codeSize < 12) {
      codeSize += 1;
      growCodeSizeAfterNextOutput = false;
    }
  };
  emit(clearCode);

  if (indices.length === 0) {
    emit(endCode);
    return packCodes(codes);
  }

  let prefix = indices[0] ?? 0;
  for (let offset = 1; offset < indices.length; offset += 1) {
    const symbol = indices[offset] ?? 0;
    const key = (prefix << 8) | symbol;
    const found = dictionary.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }

    emit(prefix);
    if (nextCode < 4096) {
      dictionary.set(key, nextCode);
      nextCode += 1;
      if (nextCode === (1 << codeSize) && codeSize < 12) growCodeSizeAfterNextOutput = true;
    } else {
      emit(clearCode);
      dictionary = new Map();
      codeSize = minimumCodeSize + 1;
      nextCode = endCode + 1;
      growCodeSizeAfterNextOutput = false;
    }
    prefix = symbol;
  }
  emit(prefix);
  emit(endCode);
  return packCodes(codes);
}

function indexFrame(frame: GifRgbaFrame): {
  readonly palette: Uint8Array;
  readonly indices: Uint8Array;
  readonly tableBits: number;
} {
  if (!Number.isInteger(frame.width) || frame.width < 1 || frame.width > 0xffff ||
      !Number.isInteger(frame.height) || frame.height < 1 || frame.height > 0xffff ||
      frame.rgba.length !== frame.width * frame.height * 4) {
    throw new RangeError("GIF frame dimensions and RGBA data do not match.");
  }

  const paletteValues: number[] = [];
  const colorIndexes = new Map<number, number>();
  const indices = new Uint8Array(frame.width * frame.height);
  for (let pixel = 0; pixel < indices.length; pixel += 1) {
    const offset = pixel * 4;
    const color = ((frame.rgba[offset] ?? 0) << 16) |
      ((frame.rgba[offset + 1] ?? 0) << 8) |
      (frame.rgba[offset + 2] ?? 0);
    let index = colorIndexes.get(color);
    if (index === undefined) {
      index = paletteValues.length / 3;
      if (index >= 256) {
        throw new RangeError("An individual GIF frame cannot contain more than 256 distinct colors.");
      }
      colorIndexes.set(color, index);
      paletteValues.push((color >>> 16) & 0xff, (color >>> 8) & 0xff, color & 0xff);
    }
    indices[pixel] = index;
  }

  const colors = Math.max(2, paletteValues.length / 3);
  const tableBits = Math.max(1, Math.ceil(Math.log2(colors)));
  const tableSize = 1 << tableBits;
  const palette = new Uint8Array(tableSize * 3);
  palette.set(paletteValues);
  return { palette, indices, tableBits };
}

/** Encodes one or more opaque RGBA frames into a GIF with an exact palette per frame. */
export function encodeAnimatedGif(
  frames: readonly GifRgbaFrame[],
  delayCentiseconds = 50,
): Uint8Array {
  if (frames.length < 1) throw new RangeError("A GIF requires at least one frame.");
  if (!Number.isInteger(delayCentiseconds) || delayCentiseconds < 1 || delayCentiseconds > 0xffff) {
    throw new RangeError("GIF frame delay must be between 1 and 65535 centiseconds.");
  }
  const width = frames[0]?.width;
  const height = frames[0]?.height;
  if (width === undefined || height === undefined || frames.some((frame) => frame.width !== width || frame.height !== height)) {
    throw new RangeError("All GIF frames must have the same dimensions.");
  }

  const bytes: number[] = [
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // GIF89a
  ];
  pushWord(bytes, width);
  pushWord(bytes, height);
  bytes.push(0x70, 0, 0); // no global table; 8-bit color resolution
  // Loop forever.
  bytes.push(0x21, 0xff, 0x0b, ...[..."NETSCAPE2.0"].map((character) => character.charCodeAt(0)), 0x03, 0x01, 0x00, 0x00, 0x00);

  for (const frame of frames) {
    const { palette, indices, tableBits } = indexFrame(frame);
    // Full-canvas frames replace the previous image; delay is in 1/100-second units.
    bytes.push(0x21, 0xf9, 0x04, 0x00);
    pushWord(bytes, delayCentiseconds);
    bytes.push(0x00, 0x00);
    bytes.push(0x2c);
    pushWord(bytes, 0);
    pushWord(bytes, 0);
    pushWord(bytes, width);
    pushWord(bytes, height);
    bytes.push(0x80 | (tableBits - 1));
    bytes.push(...palette);
    const minimumCodeSize = Math.max(2, tableBits);
    bytes.push(minimumCodeSize);
    writeSubBlocks(bytes, lzwEncode(indices, minimumCodeSize));
  }
  bytes.push(0x3b);
  return Uint8Array.from(bytes);
}
