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

function transformPlaneBytes(transformations: boolean): number {
  return transformations ? Math.ceil(TILE_COUNT * 3 / 8) : 0;
}

export function packTransforms(transforms: Uint8Array): Uint8Array {
  if (transforms.length !== TILE_COUNT) {
    throw new RangeError("A transform plane requires 768 transform codes.");
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
  const tilemap = new Uint8Array(TILE_COUNT);
  let transformBytes: Uint8Array = new Uint8Array();
  if (input.encoding === "compact") {
    for (let index = 0; index < TILE_COUNT; index += 1) {
      const character = input.characterIndices[index] ?? 0;
      const transform = input.transformations ? input.transforms[index] ?? 0 : 0;
      if (character >= input.characterCount) throw new RangeError("Character index is out of range.");
      tilemap[index] = (character << 3) | transform;
    }
  } else {
    tilemap.set(input.characterIndices);
    for (const character of tilemap) {
      if (character >= input.characterCount) throw new RangeError("Character index is out of range.");
    }
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
  const transformLength = options.encoding === "extended"
    ? transformPlaneBytes(options.transformations)
    : 0;
  const expected = TILE_COUNT + ATTRIBUTE_BYTES + transformLength + options.characterCount * 8;
  if (bytes.length !== expected) {
    throw new RangeError(`Expected ${expected} charset artifact bytes, received ${bytes.length}.`);
  }
  const tilemap = bytes.slice(0, TILE_COUNT);
  const attributes = bytes.slice(TILE_COUNT, TILE_COUNT + ATTRIBUTE_BYTES);
  const transformBytes = bytes.slice(
    TILE_COUNT + ATTRIBUTE_BYTES,
    TILE_COUNT + ATTRIBUTE_BYTES + transformLength,
  );
  const charset = bytes.slice(TILE_COUNT + ATTRIBUTE_BYTES + transformLength);
  const characterIndices = new Uint8Array(TILE_COUNT);
  let transforms: Uint8Array;
  if (options.encoding === "compact") {
    transforms = new Uint8Array(TILE_COUNT);
    for (let index = 0; index < TILE_COUNT; index += 1) {
      characterIndices[index] = (tilemap[index] ?? 0) >> 3;
      transforms[index] = options.transformations ? (tilemap[index] ?? 0) & 0x07 : 0;
    }
  } else {
    characterIndices.set(tilemap);
    transforms = options.transformations
      ? unpackTransforms(transformBytes)
      : new Uint8Array(TILE_COUNT);
  }
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
