import { unzlibSync } from "fflate";
import { MAX_METADATA_BYTES } from "./limits.js";

const ICC_HEADER_BYTES = 128;
const ICC_SIGNATURE_OFFSET = 36;
const ICC_TAG_TABLE_OFFSET = 128;
const MAX_ICC_TAGS = 256;

const SRGB_MATRICES = [
  [
    0.4360747, 0.2225045, 0.0139322,
    0.3850649, 0.7168786, 0.0971045,
    0.1430804, 0.0606169, 0.7141733,
  ],
  [
    0.4124564, 0.2126729, 0.0193339,
    0.3575761, 0.7151522, 0.1191920,
    0.1804375, 0.0721750, 0.9503041,
  ],
] as const;

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
}

function readU32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, false);
}

function readS15Fixed16(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getInt32(offset, false) / 65536;
}

interface IccTag {
  readonly offset: number;
  readonly size: number;
}

function readTags(profile: Uint8Array): Map<string, IccTag> | undefined {
  if (profile.length < ICC_TAG_TABLE_OFFSET + 4) return undefined;
  const tagCount = readU32(profile, ICC_TAG_TABLE_OFFSET);
  if (tagCount > MAX_ICC_TAGS || ICC_TAG_TABLE_OFFSET + 4 + tagCount * 12 > profile.length) {
    return undefined;
  }

  const tags = new Map<string, IccTag>();
  for (let index = 0; index < tagCount; index += 1) {
    const entry = ICC_TAG_TABLE_OFFSET + 4 + index * 12;
    const signature = ascii(profile, entry, 4);
    const offset = readU32(profile, entry + 4);
    const size = readU32(profile, entry + 8);
    if (size < 4 || offset < ICC_HEADER_BYTES || offset > profile.length || size > profile.length - offset) {
      return undefined;
    }
    tags.set(signature, { offset, size });
  }
  return tags;
}

function description(profile: Uint8Array, tag: IccTag): string | undefined {
  if (tag.size < 8) return undefined;
  const type = ascii(profile, tag.offset, 4);
  if (type === "desc") {
    if (tag.size < 12) return undefined;
    const length = readU32(profile, tag.offset + 8);
    if (length < 1 || length > tag.size - 12) return undefined;
    return ascii(profile, tag.offset + 12, length - 1);
  }
  if (type === "mluc") {
    if (tag.size < 16) return undefined;
    const count = readU32(profile, tag.offset + 8);
    const recordSize = readU32(profile, tag.offset + 12);
    if (count < 1 || count > 64 || recordSize < 12 || count > Math.floor((tag.size - 16) / recordSize)) {
      return undefined;
    }
    const record = tag.offset + 16;
    const length = readU32(profile, record + 4);
    const offset = readU32(profile, record + 8);
    if (length < 2 || length % 2 !== 0 || offset > tag.size || length > tag.size - offset) {
      return undefined;
    }
    const chars: string[] = [];
    for (let index = 0; index < length; index += 2) {
      chars.push(String.fromCharCode((profile[tag.offset + offset + index] ?? 0) << 8 | (profile[tag.offset + offset + index + 1] ?? 0)));
    }
    return chars.join("");
  }
  return undefined;
}

function hasSrgbMatrix(profile: Uint8Array, tags: Map<string, IccTag>): boolean {
  const channelTags = ["rXYZ", "gXYZ", "bXYZ"] as const;
  const values: number[] = [];
  for (const signature of channelTags) {
    const tag = tags.get(signature);
    if (tag === undefined || tag.size < 20 || ascii(profile, tag.offset, 4) !== "XYZ ") return false;
    values.push(
      readS15Fixed16(profile, tag.offset + 8),
      readS15Fixed16(profile, tag.offset + 12),
      readS15Fixed16(profile, tag.offset + 16),
    );
  }
  return SRGB_MATRICES.some((matrix) =>
    values.every((value, index) => Math.abs(value - matrix[index]!) <= 0.01));
}

function hasTransferCurves(profile: Uint8Array, tags: Map<string, IccTag>): boolean {
  return (["rTRC", "gTRC", "bTRC"] as const).every((signature) => {
    const tag = tags.get(signature);
    if (tag === undefined || tag.size < 12) return false;
    const type = ascii(profile, tag.offset, 4);
    return type === "curv" || type === "para";
  });
}

export function isRecognizedSrgbIccProfile(profile: Uint8Array): boolean {
  if (
    profile.length < ICC_HEADER_BYTES ||
    profile.length > MAX_METADATA_BYTES ||
    readU32(profile, 0) !== profile.length
  ) return false;
  if (ascii(profile, ICC_SIGNATURE_OFFSET, 4) !== "acsp") return false;
  if (ascii(profile, 12, 4) !== "mntr" || ascii(profile, 16, 4) !== "RGB " || ascii(profile, 20, 4) !== "XYZ ") {
    return false;
  }
  const tags = readTags(profile);
  if (tags === undefined) return false;
  const descriptionTag = tags.get("desc");
  if (descriptionTag === undefined) return false;
  const profileDescription = description(profile, descriptionTag);
  if (profileDescription === undefined || !profileDescription.toLowerCase().includes("srgb")) return false;
  return hasSrgbMatrix(profile, tags) && hasTransferCurves(profile, tags);
}

/** Validate a PNG iCCP chunk against the controlled sRGB policy. */
export function isRecognizedSrgbPngIccp(chunk: Uint8Array): boolean {
  const nameEnd = chunk.indexOf(0);
  if (nameEnd < 1 || nameEnd > 79 || nameEnd + 2 > chunk.length || chunk[nameEnd + 1] !== 0) {
    return false;
  }
  const compressed = chunk.subarray(nameEnd + 2);
  if (compressed.length === 0 || compressed.length > MAX_METADATA_BYTES) return false;
  try {
    const profile = unzlibSync(compressed);
    return isRecognizedSrgbIccProfile(profile);
  } catch {
    return false;
  }
}
