import {
  serializeScr,
  type ZxScreen,
} from "@retro-converter/zx-spectrum";
import {
  transformTile,
  writeTileToScreen,
} from "./tiles.js";
import type {
  CharsetArtifact,
  CharsetDecodeOptions,
  CharsetEncoding,
  TileTransform,
} from "./types.js";

const TILE_COUNT = 768;
const ATTRIBUTE_BYTES = 768;
export const CHARSET_ARTIFACT_HEADER_BYTES = 2;

/** Maps the converter's D4 transform enum to the Z80 viewer's operation flags. */
const Z80_FLAGS_BY_TRANSFORM = [0, 4, 3, 7, 1, 2, 6, 5] as const;
const TRANSFORM_BY_Z80_FLAGS = [0, 4, 5, 2, 1, 7, 6, 3] as const;

export type CharsetViewerType = 0 | 1 | 2;

export function charsetViewerType(
  encoding: CharsetEncoding,
  transformations: boolean,
): CharsetViewerType {
  if (!transformations) return 1;
  return encoding === "compact" ? 0 : 2;
}

export function z80TransformFlags(transform: number): number {
  const flags = Z80_FLAGS_BY_TRANSFORM[transform];
  if (flags === undefined) throw new RangeError("Transform codes must be from 0 through 7.");
  return flags;
}

function converterTransform(flags: number): TileTransform {
  const transform = TRANSFORM_BY_Z80_FLAGS[flags];
  if (transform === undefined) throw new RangeError("Z80 transform flags must be from 0 through 7.");
  return transform as TileTransform;
}

function transformPlaneBytes(transformations: boolean): number {
  return transformations ? Math.ceil(TILE_COUNT * 3 / 8) : 0;
}

export function packTransforms(transforms: Uint8Array): Uint8Array {
  if (transforms.length !== TILE_COUNT) {
    throw new RangeError("A transform plane requires 768 three-bit transform values.");
  }
  const output = new Uint8Array(Math.ceil(TILE_COUNT * 3 / 8));
  let bitOffset = 0;
  for (const transform of transforms) {
    if (transform > 7) throw new RangeError("Transform codes must be from 0 through 7.");
    for (let bit = 0; bit < 3; bit += 1) {
      if (((transform >> bit) & 1) !== 0) {
        output[Math.floor(bitOffset / 8)] =
          (output[Math.floor(bitOffset / 8)] ?? 0) | (1 << (bitOffset % 8));
      }
      bitOffset += 1;
    }
  }
  return output;
}

export function unpackTransforms(bytes: Uint8Array): Uint8Array {
  if (bytes.length !== transformPlaneBytes(true)) {
    throw new RangeError("The packed transform plane must contain 288 bytes.");
  }
  const transforms = new Uint8Array(TILE_COUNT);
  let bitOffset = 0;
  for (let index = 0; index < TILE_COUNT; index += 1) {
    let transform = 0;
    for (let bit = 0; bit < 3; bit += 1) {
      transform |= (((bytes[Math.floor(bitOffset / 8)] ?? 0) >> (bitOffset % 8)) & 1) << bit;
      bitOffset += 1;
    }
    transforms[index] = transform;
  }
  return transforms;
}

export function encodeCharsetArtifact(input: {
  readonly encoding: CharsetEncoding;
  readonly characterCount: number;
  readonly transformations: boolean;
  readonly characterIndices: Uint8Array;
  readonly attributes: Uint8Array;
  readonly transforms: Uint8Array;
  readonly charset: Uint8Array;
}): CharsetArtifact {
  if (input.characterIndices.length !== TILE_COUNT || input.attributes.length !== ATTRIBUTE_BYTES) {
    throw new RangeError("Charset artifacts require 768 tile references and attributes.");
  }
  if (input.transforms.length !== TILE_COUNT) {
    throw new RangeError("Charset artifacts require 768 internal transform codes.");
  }
  if (input.characterCount < 1 || input.characterCount > 256 ||
      input.charset.length !== input.characterCount * 8) {
    throw new RangeError("Charset size does not match the declared character count.");
  }
  if (input.encoding === "compact" && input.characterCount > 32) {
    throw new RangeError("Compact mapping supports at most 32 base characters.");
  }
  const viewerType = charsetViewerType(input.encoding, input.transformations);
  const tilemap = new Uint8Array(TILE_COUNT);
  let transformBytes: Uint8Array = new Uint8Array();
  if (viewerType === 0) {
    for (let index = 0; index < TILE_COUNT; index += 1) {
      const character = input.characterIndices[index] ?? 0;
      const transform = z80TransformFlags(input.transforms[index] ?? 0);
      if (character >= input.characterCount) throw new RangeError("Character index is out of range.");
      tilemap[index] = (character << 3) | transform;
    }
  } else {
    tilemap.set(input.characterIndices);
    for (const character of tilemap) {
      if (character >= input.characterCount) throw new RangeError("Character index is out of range.");
    }
    if (viewerType === 2) {
      const z80Transforms = Uint8Array.from(input.transforms, z80TransformFlags);
      transformBytes = packTransforms(z80Transforms);
    }
  }
  const bytes = new Uint8Array(
    CHARSET_ARTIFACT_HEADER_BYTES +
      tilemap.length +
      input.attributes.length +
      transformBytes.length +
      input.charset.length,
  );
  bytes[0] = input.characterCount === 256 ? 0 : input.characterCount;
  bytes[1] = viewerType;
  let offset = CHARSET_ARTIFACT_HEADER_BYTES;
  bytes.set(tilemap, offset);
  offset += tilemap.length;
  bytes.set(input.attributes, offset);
  offset += input.attributes.length;
  bytes.set(transformBytes, offset);
  offset += transformBytes.length;
  bytes.set(input.charset, offset);
  return {
    encoding: input.encoding,
    transformations: input.transformations,
    characterCount: input.characterCount,
    bytes,
    tilemap,
    attributes: input.attributes.slice(),
    transforms: transformBytes,
    charset: input.charset.slice(),
  };
}

export function decodeCharsetArtifact(
  bytes: Uint8Array,
  options: CharsetDecodeOptions,
): {
  readonly artifact: CharsetArtifact;
  readonly screen: ZxScreen;
  readonly scr: Uint8Array;
} {
  if (options.characterCount < 1 || options.characterCount > 256) {
    throw new RangeError("Character count must be from 1 through 256.");
  }
  if (options.encoding === "compact" && options.characterCount > 32) {
    throw new RangeError("Compact mapping supports at most 32 base characters.");
  }
  const viewerType = charsetViewerType(options.encoding, options.transformations);
  const encodedCharacterCount = bytes[0] === 0 ? 256 : bytes[0];
  if (encodedCharacterCount !== options.characterCount || bytes[1] !== viewerType) {
    throw new RangeError("Charset artifact header does not match the declared conversion options.");
  }
  const transformLength = viewerType === 2 ? transformPlaneBytes(true) : 0;
  const expected =
    CHARSET_ARTIFACT_HEADER_BYTES +
    TILE_COUNT +
    ATTRIBUTE_BYTES +
    transformLength +
    options.characterCount * 8;
  if (bytes.length !== expected) {
    throw new RangeError(`Expected ${expected} charset artifact bytes, received ${bytes.length}.`);
  }
  const tilemapStart = CHARSET_ARTIFACT_HEADER_BYTES;
  const attributesStart = tilemapStart + TILE_COUNT;
  const transformsStart = attributesStart + ATTRIBUTE_BYTES;
  const charsetStart = transformsStart + transformLength;
  const tilemap = bytes.slice(tilemapStart, attributesStart);
  const attributes = bytes.slice(attributesStart, transformsStart);
  const transformBytes = bytes.slice(transformsStart, charsetStart);
  const charset = bytes.slice(charsetStart);
  const characterIndices = new Uint8Array(TILE_COUNT);
  let z80Transforms: Uint8Array;
  if (viewerType === 0) {
    z80Transforms = new Uint8Array(TILE_COUNT);
    for (let index = 0; index < TILE_COUNT; index += 1) {
      characterIndices[index] = (tilemap[index] ?? 0) >> 3;
      z80Transforms[index] = (tilemap[index] ?? 0) & 0x07;
    }
  } else {
    characterIndices.set(tilemap);
    z80Transforms = viewerType === 2
      ? unpackTransforms(transformBytes)
      : new Uint8Array(TILE_COUNT);
  }
  const transforms = Uint8Array.from(z80Transforms, converterTransform);
  const pixels = new Uint8Array(256 * 192);
  for (let index = 0; index < TILE_COUNT; index += 1) {
    const character = characterIndices[index] ?? 0;
    if (character >= options.characterCount) {
      throw new RangeError(`Character index ${character} is out of range.`);
    }
    const base = charset.slice(character * 8, character * 8 + 8);
    const tile = transformTile(base, transforms[index] as TileTransform);
    writeTileToScreen(pixels, index, tile);
  }
  const screen: ZxScreen = { pixels, attributes };
  const scr = serializeScr(screen);
  return {
    artifact: {
      encoding: options.encoding,
      transformations: options.transformations,
      characterCount: options.characterCount,
      bytes: bytes.slice(),
      tilemap,
      attributes,
      transforms: transformBytes,
      charset,
    },
    screen,
    scr,
  };
}

/** Recreates the pre-header artifact bytes for verification of saved projects. */
export function encodeLegacyCharsetArtifact(input: {
  readonly encoding: CharsetEncoding;
  readonly characterCount: number;
  readonly transformations: boolean;
  readonly characterIndices: Uint8Array;
  readonly attributes: Uint8Array;
  readonly transforms: Uint8Array;
  readonly charset: Uint8Array;
}): Uint8Array {
  const tilemap = new Uint8Array(TILE_COUNT);
  let transformBytes: Uint8Array = new Uint8Array();
  if (input.encoding === "compact") {
    for (let index = 0; index < TILE_COUNT; index += 1) {
      const character = input.characterIndices[index] ?? 0;
      const transform = input.transformations ? input.transforms[index] ?? 0 : 0;
      tilemap[index] = (character << 3) | transform;
    }
  } else {
    tilemap.set(input.characterIndices);
    transformBytes = input.transformations
      ? packTransforms(input.transforms)
      : new Uint8Array();
  }
  const bytes = new Uint8Array(
    tilemap.length + input.attributes.length + transformBytes.length + input.charset.length,
  );
  let offset = 0;
  bytes.set(tilemap, offset);
  offset += tilemap.length;
  bytes.set(input.attributes, offset);
  offset += input.attributes.length;
  bytes.set(transformBytes, offset);
  offset += transformBytes.length;
  bytes.set(input.charset, offset);
  return bytes;
}
