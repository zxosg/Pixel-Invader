import type { ZxScreen } from "@retro-converter/zx-spectrum";
import type { TileTransform } from "./types.js";

export const TILE_BYTES = 8;
export const TILE_COUNT = 32 * 24;

export type Tile = Uint8Array;

export function assertTile(tile: Uint8Array): void {
  if (tile.length !== TILE_BYTES) {
    throw new RangeError(`A character tile must contain ${TILE_BYTES} bytes.`);
  }
}

export function tileKey(tile: Uint8Array): string {
  assertTile(tile);
  let key = "";
  for (const row of tile) key += row.toString(16).padStart(2, "0");
  return key;
}

export function compareTiles(left: Uint8Array, right: Uint8Array): number {
  assertTile(left);
  assertTile(right);
  for (let row = 0; row < TILE_BYTES; row += 1) {
    const difference = (left[row] ?? 0) - (right[row] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function invertTile(tile: Uint8Array): Tile {
  assertTile(tile);
  return Uint8Array.from(tile, (row) => row ^ 0xff);
}

function bitAt(tile: Uint8Array, x: number, y: number): number {
  return ((tile[y] ?? 0) >> (7 - x)) & 1;
}

function setBit(tile: Uint8Array, x: number, y: number, value: number): void {
  if (value !== 0) tile[y] = (tile[y] ?? 0) | (1 << (7 - x));
}

export function transformTile(tile: Uint8Array, transform: TileTransform): Tile {
  assertTile(tile);
  const output = new Uint8Array(TILE_BYTES);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      let sourceX = x;
      let sourceY = y;
      if (transform === 1) {
        sourceX = y;
        sourceY = 7 - x;
      } else if (transform === 2) {
        sourceX = 7 - x;
        sourceY = 7 - y;
      } else if (transform === 3) {
        sourceX = 7 - y;
        sourceY = x;
      } else if (transform === 4) {
        sourceX = 7 - x;
      } else if (transform === 5) {
        sourceY = 7 - y;
      } else if (transform === 6) {
        sourceX = y;
        sourceY = x;
      } else if (transform === 7) {
        sourceX = 7 - y;
        sourceY = 7 - x;
      }
      setBit(output, x, y, bitAt(tile, sourceX, sourceY));
    }
  }
  return output;
}

export function uniqueVariants(
  tile: Uint8Array,
  allowTransforms: boolean,
): readonly { readonly tile: Tile; readonly transform: TileTransform }[] {
  const variants: { tile: Tile; transform: TileTransform }[] = [];
  const seen = new Set<string>();
  const maximum = allowTransforms ? 8 : 1;
  for (let code = 0; code < maximum; code += 1) {
    const transform = code as TileTransform;
    const transformed = transformTile(tile, transform);
    const key = tileKey(transformed);
    if (seen.has(key)) continue;
    seen.add(key);
    variants.push({ tile: transformed, transform });
  }
  return variants;
}

export function canonicalTile(
  tile: Uint8Array,
  allowTransforms: boolean,
  allowPolarity: boolean,
): Tile {
  let best: Tile | null = null;
  for (const variant of uniqueVariants(tile, allowTransforms)) {
    const candidates = allowPolarity
      ? [variant.tile, invertTile(variant.tile)]
      : [variant.tile];
    for (const candidate of candidates) {
      if (best === null || compareTiles(candidate, best) < 0) best = candidate.slice();
    }
  }
  return best ?? tile.slice();
}

export function extractScreenTiles(screen: ZxScreen): readonly Tile[] {
  if (screen.pixels.length !== 256 * 192 || screen.attributes.length !== TILE_COUNT) {
    throw new RangeError("Charset conversion requires a standard 256×192 ZX screen with 768 attributes.");
  }
  const tiles: Tile[] = [];
  for (let cellY = 0; cellY < 24; cellY += 1) {
    for (let cellX = 0; cellX < 32; cellX += 1) {
      const tile = new Uint8Array(TILE_BYTES);
      for (let localY = 0; localY < 8; localY += 1) {
        let row = 0;
        const sourceOffset = (cellY * 8 + localY) * 256 + cellX * 8;
        for (let localX = 0; localX < 8; localX += 1) {
          row |= (screen.pixels[sourceOffset + localX] ?? 0) << (7 - localX);
        }
        tile[localY] = row;
      }
      tiles.push(tile);
    }
  }
  return tiles;
}

export function writeTileToScreen(
  pixels: Uint8Array,
  cellIndex: number,
  tile: Uint8Array,
): void {
  assertTile(tile);
  const cellX = cellIndex % 32;
  const cellY = Math.floor(cellIndex / 32);
  for (let localY = 0; localY < 8; localY += 1) {
    const targetOffset = (cellY * 8 + localY) * 256 + cellX * 8;
    for (let localX = 0; localX < 8; localX += 1) {
      pixels[targetOffset + localX] = ((tile[localY] ?? 0) >> (7 - localX)) & 1;
    }
  }
}

export function swapInkPaper(attribute: number): number {
  return (attribute & 0xc0) | ((attribute & 0x07) << 3) | ((attribute >> 3) & 0x07);
}
