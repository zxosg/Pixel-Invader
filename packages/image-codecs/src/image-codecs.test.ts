import { describe, expect, it } from "vitest";
import { zlibSync } from "fflate";
import { encode as encodePng } from "fast-png";
import { encode as encodeJpeg } from "jpeg-js";
import {
  applyExifOrientation,
  decodeImage,
  encodeRgbaPng,
  ImageImportError,
  inspectImage,
  parseExifOrientation,
  sniffImageFormat,
} from "./index.js";

function expectCode(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error("Expected image import to fail.");
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(ImageImportError);
    expect((error as ImageImportError).code).toBe(code);
  }
}

function exifOrientation(value: number): Uint8Array {
  return Uint8Array.from([
    0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00,
    0x01, 0x00,
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00,
    value, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00,
  ]);
}

function injectJpegApp1(jpeg: Uint8Array, payload: Uint8Array): Uint8Array {
  const segmentLength = payload.length + 2;
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe1,
    segmentLength >> 8, segmentLength & 0xff,
    ...payload,
    ...jpeg.subarray(2),
  ]);
}

function pngCrc(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = Uint8Array.from(Array.from(type, (character) => character.charCodeAt(0)));
  const crcInput = Uint8Array.from([...typeBytes, ...data]);
  const crc = pngCrc(crcInput);
  return Uint8Array.from([
    data.length >>> 24, data.length >>> 16, data.length >>> 8, data.length,
    ...typeBytes, ...data,
    crc >>> 24, crc >>> 16, crc >>> 8, crc,
  ]);
}

function recognizedSrgbIccp(): Uint8Array {
  const description = "sRGB IEC61966-2.1";
  const tags = ["desc", "rXYZ", "gXYZ", "bXYZ", "rTRC", "gTRC", "bTRC"];
  const profileBuffer = new Uint8Array(1024);
  const view = new DataView(profileBuffer.buffer);
  const setAscii = (offset: number, value: string): void => {
    value.split("").forEach((character, index) => {
      profileBuffer[offset + index] = character.charCodeAt(0);
    });
  };
  setAscii(12, "mntr");
  setAscii(16, "RGB ");
  setAscii(20, "XYZ ");
  setAscii(36, "acsp");

  const tableOffset = 128;
  view.setUint32(tableOffset, tags.length, false);
  let dataOffset = tableOffset + 4 + tags.length * 12;
  const writeTag = (signature: string, data: Uint8Array): void => {
    const index = tags.indexOf(signature);
    if (index < 0) throw new Error(`Unexpected ICC tag ${signature}.`);
    const entry = tableOffset + 4 + index * 12;
    setAscii(entry, signature);
    view.setUint32(entry + 4, dataOffset, false);
    view.setUint32(entry + 8, data.length, false);
    profileBuffer.set(data, dataOffset);
    dataOffset += data.length;
  };
  const desc = new Uint8Array(12 + description.length + 1);
  const descView = new DataView(desc.buffer);
  desc.set(Uint8Array.from(Array.from("desc", (character) => character.charCodeAt(0))), 0);
  descView.setUint32(8, description.length + 1, false);
  desc.set(Uint8Array.from(Array.from(description, (character) => character.charCodeAt(0))), 12);
  writeTag("desc", desc);

  const matrix = [
    [0.4360747, 0.2225045, 0.0139322],
    [0.3850649, 0.7168786, 0.0971045],
    [0.1430804, 0.0606169, 0.7141733],
  ];
  matrix.forEach((values, index) => {
    const data = new Uint8Array(20);
    data.set(Uint8Array.from(Array.from("XYZ ", (character) => character.charCodeAt(0))), 0);
    const dataView = new DataView(data.buffer);
    values.forEach((value, valueIndex) => dataView.setInt32(8 + valueIndex * 4, Math.round(value * 65536), false));
    writeTag(tags[index + 1]!, data);
  });
  ["rTRC", "gTRC", "bTRC"].forEach((signature) => {
    const data = new Uint8Array(16);
    data.set(Uint8Array.from(Array.from("curv", (character) => character.charCodeAt(0))), 0);
    const dataView = new DataView(data.buffer);
    dataView.setUint32(8, 1, false);
    dataView.setUint16(12, 0x0266, false);
    writeTag(signature, data);
  });

  const profile = profileBuffer.slice(0, dataOffset);
  new DataView(profile.buffer).setUint32(0, profile.length, false);
  const compressed = zlibSync(profile);
  return Uint8Array.from([
    ...Array.from("sRGB", (character) => character.charCodeAt(0)), 0, 0,
    ...compressed,
  ]);
}

function packIndexedRows(
  rows: readonly (readonly number[])[],
  depth: 1 | 2 | 4 | 8,
): Uint8Array {
  const width = rows[0]?.length ?? 0;
  const rowBytes = Math.ceil(width * depth / 8);
  const packed = new Uint8Array(rowBytes * rows.length);
  const mask = (1 << depth) - 1;
  rows.forEach((row, y) => {
    row.forEach((index, x) => {
      const bitOffset = x * depth;
      const byteOffset = y * rowBytes + Math.floor(bitOffset / 8);
      const shift = 8 - depth - (bitOffset % 8);
      packed[byteOffset] =
        (packed[byteOffset] ?? 0) | ((index & mask) << shift);
    });
  });
  return packed;
}

describe("content inspection", () => {
  it("encodes an exact static RGBA preview PNG", () => {
    const rgba = Uint8Array.from([1, 2, 3, 255, 10, 20, 30, 128]);
    const encoded = encodeRgbaPng(rgba, 2, 1);
    const decoded = decodeImage(encoded);
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(1);
    expect(decoded.rgba).toEqual(rgba);
  });

  it("sniffs content instead of trusting a file name", () => {
    const png = encodePng({ width: 1, height: 1, data: Uint8Array.from([1, 2, 3, 255]), channels: 4 });
    expect(sniffImageFormat(png)).toBe("png");
    expectCode(() => sniffImageFormat(Uint8Array.from([0x47, 0x49, 0x46])), "IMAGE_UNSUPPORTED_FORMAT");
  });

  it("reads generated PNG and JPEG dimensions", () => {
    const png = encodePng({ width: 2, height: 1, data: new Uint8Array(8), channels: 4 });
    const jpeg = Uint8Array.from(encodeJpeg({ width: 2, height: 1, data: new Uint8Array(8) }, 90).data);
    expect(inspectImage(png)).toMatchObject({ format: "png", width: 2, height: 1 });
    expect(inspectImage(jpeg)).toMatchObject({ format: "jpeg", width: 2, height: 1 });
  });

  it("rejects APNG and embedded ICC before decode", () => {
    const png = encodePng({ width: 1, height: 1, data: new Uint8Array(4), channels: 4 });
    const ihdrEnd = 33;
    const chunk = (name: string) => Uint8Array.from([
      0, 0, 0, 0,
      ...Array.from(name, (character) => character.charCodeAt(0)),
      0, 0, 0, 0,
    ]);
    const withChunk = (name: string) => Uint8Array.from([
      ...png.subarray(0, ihdrEnd), ...chunk(name), ...png.subarray(ihdrEnd),
    ]);
    expectCode(() => inspectImage(withChunk("acTL")), "IMAGE_ANIMATION_UNSUPPORTED");
    expectCode(() => inspectImage(withChunk("iCCP")), "IMAGE_COLOR_PROFILE_UNSUPPORTED");
  });

  it("accepts a recognized embedded sRGB profile", () => {
    const png = encodePng({ width: 1, height: 1, data: Uint8Array.from([10, 20, 30, 255]), channels: 4 });
    const tagged = Uint8Array.from([
      ...png.subarray(0, 33),
      ...pngChunk("iCCP", recognizedSrgbIccp()),
      ...png.subarray(33),
    ]);
    expect(inspectImage(tagged)).toMatchObject({ format: "png", width: 1, height: 1 });
    expect(decodeImage(tagged).rgba).toEqual(Uint8Array.from([10, 20, 30, 255]));
  });
});

describe("EXIF orientation", () => {
  it("parses and applies orientation 6", () => {
    expect(parseExifOrientation(exifOrientation(6))).toBe(6);
    const source = Uint8Array.from([
      1, 0, 0, 255,
      2, 0, 0, 255,
    ]);
    const result = applyExifOrientation(source, 2, 1, 6);
    expect(result.width).toBe(1);
    expect(result.height).toBe(2);
    expect(Array.from(result.rgba)).toEqual(Array.from(source));
  });

  it("uses JPEG EXIF orientation during decode", () => {
    const raw = Uint8Array.from([
      255, 0, 0, 255,
      0, 255, 0, 255,
    ]);
    const jpeg = Uint8Array.from(encodeJpeg({ width: 2, height: 1, data: raw }, 100).data);
    const tagged = injectJpegApp1(
      jpeg,
      Uint8Array.from([0x45, 0x78, 0x69, 0x66, 0, 0, ...exifOrientation(6)]),
    );
    const decoded = decodeImage(tagged);
    expect(decoded).toMatchObject({ format: "jpeg", width: 1, height: 2 });
    expect(decoded.rgba).toHaveLength(8);
  });
});

describe("deterministic decode normalization", () => {
  it("decodes an RGBA PNG exactly", () => {
    const rgba = Uint8Array.from([10, 20, 30, 40, 200, 150, 100, 255]);
    const png = encodePng({ width: 2, height: 1, data: rgba, channels: 4 });
    expect(decodeImage(png)).toEqual({ format: "png", width: 2, height: 1, rgba });
  });

  it.each([1, 2, 4, 8] as const)(
    "expands %i-bit indexed PNG rows into true-color RGBA",
    (depth) => {
      const colorCount = 1 << depth;
      const palette = Array.from(
        { length: colorCount },
        (_, index) => [
          index,
          (index * 17) & 0xff,
          255 - index,
        ],
      );
      const rows = [
        [0, 1, Math.min(2, colorCount - 1), colorCount - 1, 0],
        [colorCount - 1, 0, 1, 0, colorCount - 1],
      ];
      const png = encodePng({
        width: 5,
        height: 2,
        data: packIndexedRows(rows, depth),
        channels: 1,
        depth,
        palette,
      });
      const expected = Uint8Array.from(
        rows.flatMap((row) =>
          row.flatMap((index) => [...palette[index]!, 255])
        ),
      );

      expect(decodeImage(png)).toEqual({
        format: "png",
        width: 5,
        height: 2,
        rgba: expected,
      });
    },
  );

  it("preserves indexed PNG palette transparency", () => {
    const palette = [
      [10, 20, 30, 0],
      [200, 150, 100, 128],
    ];
    const png = encodePng({
      width: 2,
      height: 1,
      data: Uint8Array.from([0, 1]),
      channels: 1,
      depth: 8,
      palette,
    });
    expect(decodeImage(png).rgba).toEqual(
      Uint8Array.from([10, 20, 30, 0, 200, 150, 100, 128]),
    );
  });

  it("normalizes indexed and equivalent true-color PNGs identically", () => {
    const palette = [
      [4, 8, 12],
      [120, 80, 40],
      [240, 220, 200],
    ];
    const indices = Uint8Array.from([2, 0, 1]);
    const rgba = Uint8Array.from([
      240, 220, 200, 255,
      4, 8, 12, 255,
      120, 80, 40, 255,
    ]);
    const indexed = encodePng({
      width: 3,
      height: 1,
      data: indices,
      channels: 1,
      depth: 8,
      palette,
    });
    const trueColor = encodePng({
      width: 3,
      height: 1,
      data: rgba,
      channels: 4,
    });

    expect(decodeImage(indexed).rgba).toEqual(decodeImage(trueColor).rgba);
  });

  it("reports corrupted PNG data with a stable error code", () => {
    const png = encodePng({ width: 1, height: 1, data: new Uint8Array(4), channels: 4 });
    png[png.length - 1] = (png[png.length - 1] ?? 0) ^ 0xff;
    expectCode(() => decodeImage(png), "IMAGE_DECODE_FAILED");
  });
});
