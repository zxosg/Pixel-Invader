import { ImageImportError } from "./errors.js";
import { parseExifOrientation, type ExifOrientation } from "./exif.js";
import { MAX_METADATA_BYTES, validateImageLimits } from "./limits.js";

export type ImageFormat = "png" | "jpeg";
export interface ImageHeader {
  readonly format: ImageFormat;
  readonly width: number;
  readonly height: number;
  readonly orientation: ExifOrientation;
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10] as const;

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function invalid(message: string): never {
  throw new ImageImportError("IMAGE_INVALID_DATA", message);
}

function enforceLimits(bytes: Uint8Array, width: number, height: number): void {
  try {
    validateImageLimits(bytes.length, width, height);
  } catch (error: unknown) {
    throw new ImageImportError(
      "IMAGE_LIMIT_EXCEEDED",
      error instanceof Error ? error.message : "Image exceeds a v1.0 resource limit.",
    );
  }
}

export function sniffImageFormat(bytes: Uint8Array): ImageFormat {
  if (PNG_SIGNATURE.every((value, index) => bytes[index] === value)) return "png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "jpeg";
  throw new ImageImportError(
    "IMAGE_UNSUPPORTED_FORMAT",
    "Only PNG and JPEG image content is supported in v1.0.",
  );
}

export function parsePngHeader(bytes: Uint8Array): ImageHeader {
  if (sniffImageFormat(bytes) !== "png") invalid("PNG signature is missing.");
  if (bytes.length < 33) invalid("PNG is truncated before IHDR.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let width = 0;
  let height = 0;
  let orientation: ExifOrientation = 1;
  let sawIhdr = false;

  while (offset + 12 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const type = ascii(bytes, offset + 4, 4);
    const dataOffset = offset + 8;
    const nextOffset = dataOffset + length + 4;
    if (length > bytes.length || nextOffset > bytes.length || nextOffset < offset) {
      invalid(`PNG chunk ${type || "(unknown)"} is truncated.`);
    }
    if (!sawIhdr) {
      if (type !== "IHDR" || length !== 13) invalid("PNG must start with a 13-byte IHDR chunk.");
      width = view.getUint32(dataOffset, false);
      height = view.getUint32(dataOffset + 4, false);
      const bitDepth = bytes[dataOffset + 8] ?? 0;
      const colorType = bytes[dataOffset + 9] ?? 255;
      const validDepths: Readonly<Record<number, readonly number[]>> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      if (!(validDepths[colorType]?.includes(bitDepth) ?? false)) {
        throw new ImageImportError(
          "IMAGE_COLOR_MODEL_UNSUPPORTED",
          "PNG bit depth and color type combination is unsupported.",
        );
      }
      const compression = bytes[dataOffset + 10];
      const filter = bytes[dataOffset + 11];
      const interlace = bytes[dataOffset + 12];
      if (compression !== 0 || filter !== 0 || (interlace !== 0 && interlace !== 1)) {
        invalid("PNG uses unsupported header methods.");
      }
      enforceLimits(bytes, width, height);
      sawIhdr = true;
    } else if (type === "acTL") {
      throw new ImageImportError("IMAGE_ANIMATION_UNSUPPORTED", "Animated PNG is not supported in v1.0.");
    } else if (type === "iCCP") {
      throw new ImageImportError(
        "IMAGE_COLOR_PROFILE_UNSUPPORTED",
        "Embedded PNG ICC profiles are not in the v1.0 sRGB allow-list.",
      );
    } else if (type === "eXIf") {
      if (length > MAX_METADATA_BYTES) {
        throw new ImageImportError("IMAGE_LIMIT_EXCEEDED", "PNG EXIF metadata exceeds 4 MiB.");
      }
      orientation = parseExifOrientation(bytes.subarray(dataOffset, dataOffset + length));
    }
    offset = nextOffset;
    if (type === "IEND") break;
  }
  if (!sawIhdr) invalid("PNG IHDR is missing.");
  return { format: "png", width, height, orientation };
}

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

export function parseJpegHeader(bytes: Uint8Array): ImageHeader {
  if (sniffImageFormat(bytes) !== "jpeg") invalid("JPEG SOI marker is missing.");
  let offset = 2;
  let width = 0;
  let height = 0;
  let orientation: ExifOrientation = 1;
  let sawFrame = false;

  while (offset < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) break;
    const marker = bytes[offset] ?? 0;
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) invalid("JPEG marker length is truncated.");
    const length = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (length < 2 || offset + length > bytes.length) invalid("JPEG marker payload is truncated.");
    const dataOffset = offset + 2;
    const dataLength = length - 2;

    if (JPEG_SOF_MARKERS.has(marker)) {
      if (marker !== 0xc0 && marker !== 0xc2) {
        throw new ImageImportError(
          "IMAGE_COLOR_MODEL_UNSUPPORTED",
          "Only baseline and progressive Huffman JPEG are supported in v1.0.",
        );
      }
      if (dataLength < 6) invalid("JPEG frame header is truncated.");
      height = ((bytes[dataOffset + 1] ?? 0) << 8) | (bytes[dataOffset + 2] ?? 0);
      width = ((bytes[dataOffset + 3] ?? 0) << 8) | (bytes[dataOffset + 4] ?? 0);
      const components = bytes[dataOffset + 5];
      if (components !== 1 && components !== 3) {
        throw new ImageImportError(
          "IMAGE_COLOR_MODEL_UNSUPPORTED",
          "CMYK and other non-grayscale/non-RGB JPEG color models are not supported in v1.0.",
        );
      }
      enforceLimits(bytes, width, height);
      sawFrame = true;
    } else if (marker === 0xe2 && ascii(bytes, dataOffset, Math.min(12, dataLength)) === "ICC_PROFILE\0") {
      throw new ImageImportError(
        "IMAGE_COLOR_PROFILE_UNSUPPORTED",
        "Embedded JPEG ICC profiles are not in the v1.0 sRGB allow-list.",
      );
    } else if (
      marker === 0xe1 &&
      dataLength >= 6 &&
      ascii(bytes, dataOffset, 6) === "Exif\0\0"
    ) {
      if (dataLength > MAX_METADATA_BYTES) {
        throw new ImageImportError("IMAGE_LIMIT_EXCEEDED", "JPEG EXIF metadata exceeds 4 MiB.");
      }
      orientation = parseExifOrientation(bytes.subarray(dataOffset + 6, dataOffset + dataLength));
    }
    offset += length;
  }
  if (!sawFrame) invalid("JPEG frame header is missing.");
  return { format: "jpeg", width, height, orientation };
}

export function inspectImage(bytes: Uint8Array): ImageHeader {
  return sniffImageFormat(bytes) === "png" ? parsePngHeader(bytes) : parseJpegHeader(bytes);
}
