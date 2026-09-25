import { describe, expect, it } from "vitest";
import { addGifBorder, encodeAnimatedGif, type GifRgbaFrame } from "./animated-gif.js";

function readWord(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

function collectGifFrames(bytes: Uint8Array): {
  readonly delays: readonly number[];
  readonly palettes: readonly Uint8Array[];
  readonly decodedIndices: readonly Uint8Array[];
} {
  let offset = 13;
  const delays: number[] = [];
  const palettes: Uint8Array[] = [];
  const decodedIndices: Uint8Array[] = [];
  while (offset < bytes.length && bytes[offset] !== 0x3b) {
    const marker = bytes[offset++];
    if (marker === 0x21) {
      const label = bytes[offset++];
      if (label === 0xf9) {
        expect(bytes[offset++]).toBe(4);
        offset += 1;
        delays.push(readWord(bytes, offset));
        offset += 2;
        offset += 2;
      } else {
        const firstBlockSize = bytes[offset++] ?? 0;
        offset += firstBlockSize;
        while ((bytes[offset] ?? 0) !== 0) {
          const length = bytes[offset++] ?? 0;
          offset += length;
        }
        offset += 1;
      }
      continue;
    }
    expect(marker).toBe(0x2c);
    offset += 8;
    const packed = bytes[offset++] ?? 0;
    expect((packed & 0x80) !== 0).toBe(true);
    const paletteSize = 1 << ((packed & 7) + 1);
    palettes.push(bytes.slice(offset, offset + paletteSize * 3));
    offset += paletteSize * 3;
    const minimumCodeSize = bytes[offset++] ?? 0;
    const compressed: number[] = [];
    while ((bytes[offset] ?? 0) !== 0) {
      const length = bytes[offset++] ?? 0;
      compressed.push(...bytes.subarray(offset, offset + length));
      offset += length;
    }
    offset += 1;

    const codes: number[] = [];
    let bitOffset = 0;
    let codeSize = minimumCodeSize + 1;
    const clearCode = 1 << minimumCodeSize;
    const endCode = clearCode + 1;
    let dictionary: number[][] = [];
    const resetDictionary = () => {
      dictionary = Array.from({ length: clearCode }, (_, index) => [index]);
      dictionary[clearCode] = [];
      dictionary[endCode] = [];
      codeSize = minimumCodeSize + 1;
    };
    const readCode = (): number => {
      let code = 0;
      for (let bit = 0; bit < codeSize; bit += 1) {
        const absoluteBit = bitOffset + bit;
        code |= (((compressed[Math.floor(absoluteBit / 8)] ?? 0) >> (absoluteBit % 8)) & 1) << bit;
      }
      bitOffset += codeSize;
      return code;
    };
    resetDictionary();
    let nextCode = endCode + 1;
    let previous: number[] | null = null;
    while (bitOffset + codeSize <= compressed.length * 8) {
      const code = readCode();
      if (code === clearCode) {
        resetDictionary();
        nextCode = endCode + 1;
        previous = null;
        continue;
      }
      if (code === endCode) break;
      const entry: number[] = dictionary[code] ?? (previous === null ? [] : [...previous, previous[0]!]);
      expect(entry.length).toBeGreaterThan(0);
      codes.push(...entry);
      if (previous !== null && nextCode < 4096) {
        dictionary[nextCode] = [...previous, entry[0]!];
        nextCode += 1;
        if (nextCode === (1 << codeSize) && codeSize < 12) codeSize += 1;
      }
      previous = entry;
    }
    decodedIndices.push(Uint8Array.from(codes));
  }
  expect(bytes[offset]).toBe(0x3b);
  return { delays, palettes, decodedIndices };
}

function rgba(...colors: readonly (readonly [number, number, number])[]): Uint8Array {
  return Uint8Array.from(colors.flatMap(([red, green, blue]) => [red, green, blue, 255]));
}

describe("animated GIF export", () => {
  it("adds symmetric background-colored padding without altering the source image", () => {
    const frame: GifRgbaFrame = { width: 2, height: 1, rgba: rgba([1, 2, 3], [4, 5, 6]) };
    const padded = addGifBorder(frame, { width: 1, color: [7, 8, 9] });
    expect([padded.width, padded.height]).toEqual([4, 3]);
    const at = (x: number, y: number) => Array.from(padded.rgba.subarray((y * padded.width + x) * 4, (y * padded.width + x + 1) * 4));
    expect(at(0, 0)).toEqual([7, 8, 9, 255]);
    expect(at(1, 1)).toEqual([1, 2, 3, 255]);
    expect(at(2, 1)).toEqual([4, 5, 6, 255]);
    expect(at(3, 2)).toEqual([7, 8, 9, 255]);
  });

  it("encodes looping full-color phases with exact per-frame palettes and 500 ms timing", () => {
    const frames: GifRgbaFrame[] = [
      { width: 2, height: 2, rgba: rgba([255, 0, 20], [0, 101, 21], [255, 0, 20], [0, 101, 21]) },
      { width: 2, height: 2, rgba: rgba([0, 101, 21], [255, 0, 20], [0, 101, 21], [255, 0, 20]) },
    ];
    const gif = encodeAnimatedGif(frames, 50);
    const parsed = collectGifFrames(gif);

    expect(new TextDecoder().decode(gif.subarray(0, 6))).toBe("GIF89a");
    expect(readWord(gif, 6)).toBe(2);
    expect(readWord(gif, 8)).toBe(2);
    expect(new TextDecoder().decode(gif).includes("NETSCAPE2.0")).toBe(true);
    expect(parsed.delays).toEqual([50, 50]);
    expect(parsed.decodedIndices).toEqual([
      Uint8Array.from([0, 1, 0, 1]),
      Uint8Array.from([0, 1, 0, 1]),
    ]);
    expect(parsed.palettes[0]?.slice(0, 6)).toEqual(Uint8Array.from([255, 0, 20, 0, 101, 21]));
    expect(parsed.palettes[1]?.slice(0, 6)).toEqual(Uint8Array.from([0, 101, 21, 255, 0, 20]));
  });

  it("rejects mismatched frame dimensions, invalid delays, and frames with over 256 colors", () => {
    const onePixel: GifRgbaFrame = { width: 1, height: 1, rgba: rgba([0, 0, 0]) };
    const still = encodeAnimatedGif([onePixel]);
    expect(new TextDecoder().decode(still.subarray(0, 6))).toBe("GIF89a");
    expect(readWord(still, 6)).toBe(1);
    expect(readWord(still, 8)).toBe(1);
    expect(collectGifFrames(still).delays).toEqual([50]);
    expect(() => encodeAnimatedGif([onePixel, { ...onePixel, width: 2 }])).toThrow(/same dimensions/);
    expect(() => encodeAnimatedGif([onePixel, onePixel], 0)).toThrow(/delay/);
    const colors = rgba(...Array.from({ length: 257 }, (_, index) => [index >> 8, index & 0xff, 1] as const));
    expect(() => encodeAnimatedGif([
      { width: 257, height: 1, rgba: colors },
      { width: 257, height: 1, rgba: colors },
    ])).toThrow(/256 distinct colors/);
  });

  it("preserves color indices when LZW code widths grow and the dictionary resets", () => {
    const width = 96;
    const height = 64;
    const palette = Array.from({ length: 256 }, (_, index) => [index, (index * 3) & 0xff, (index * 11) & 0xff] as const);
    let random = 0x12345678;
    const colors = Array.from({ length: width * height }, () => {
      random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
      return (random >>> 16) & 0xff;
    });
    const colorIndexes = new Map<number, number>();
    const frameRgba = Uint8Array.from(colors.flatMap((colorIndex) => {
      const color = palette[colorIndex]!;
      const packed = (color[0] << 16) | (color[1] << 8) | color[2];
      if (!colorIndexes.has(packed)) colorIndexes.set(packed, colorIndexes.size);
      return [...color, 255];
    }));
    const expectedIndices = Uint8Array.from(colors.map((colorIndex) => {
      const color = palette[colorIndex]!;
      return colorIndexes.get((color[0] << 16) | (color[1] << 8) | color[2])!;
    }));
    const frame = { width, height, rgba: frameRgba };
    const parsed = collectGifFrames(encodeAnimatedGif([frame, frame]));

    expect(parsed.decodedIndices[0]).toEqual(expectedIndices);
    expect(parsed.decodedIndices[1]).toEqual(expectedIndices);
  });
});
