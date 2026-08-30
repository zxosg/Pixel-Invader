import { assertTile, type Tile } from "./tiles.js";
import type { CharsetAssignment } from "./types.js";

export type TileEditOperation =
  | { readonly kind: "xor-pixel"; readonly x: number; readonly y: number }
  | { readonly kind: "rotate-left" }
  | { readonly kind: "rotate-right" }
  | { readonly kind: "rotate-up" }
  | { readonly kind: "rotate-down" }
  | { readonly kind: "clear" }
  | { readonly kind: "invert" };

function setPixel(tile: Tile, x: number, y: number, value: number): void {
  if (value !== 0) tile[y] = (tile[y] ?? 0) | (1 << (7 - x));
  else tile[y] = (tile[y] ?? 0) & ~(1 << (7 - x));
}

function pixel(tile: Tile, x: number, y: number): number {
  return ((tile[y] ?? 0) >> (7 - x)) & 1;
}

function rotate(tile: Tile, dx: number, dy: number): Tile {
  const output = new Uint8Array(8);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const sourceX = (x - dx + 8) % 8;
      const sourceY = (y - dy + 8) % 8;
      setPixel(output, x, y, pixel(tile, sourceX, sourceY));
    }
  }
  return output;
}

export function applyTileEdit(tile: Uint8Array, operation: TileEditOperation): Tile {
  assertTile(tile);
  if (operation.kind === "xor-pixel") {
    if (!Number.isInteger(operation.x) || !Number.isInteger(operation.y) ||
        operation.x < 0 || operation.x > 7 || operation.y < 0 || operation.y > 7) {
      throw new RangeError("Tile pixel coordinates must be from 0 through 7.");
    }
    const output = tile.slice();
    output[operation.y] = (output[operation.y] ?? 0) ^ (1 << (7 - operation.x));
    return output;
  }
  if (operation.kind === "clear") return new Uint8Array(8);
  if (operation.kind === "invert") return Uint8Array.from(tile, (row) => row ^ 0xff);
  if (operation.kind === "rotate-left") return rotate(tile, -1, 0);
  if (operation.kind === "rotate-right") return rotate(tile, 1, 0);
  if (operation.kind === "rotate-up") return rotate(tile, 0, -1);
  return rotate(tile, 0, 1);
}

export function replaceTileInCharset(
  charset: Uint8Array,
  index: number,
  tile: Uint8Array,
): Uint8Array {
  if (charset.length === 0 || charset.length % 8 !== 0) throw new RangeError("Invalid charset.");
  if (!Number.isInteger(index) || index < 0 || index >= charset.length / 8) throw new RangeError("Tile index is out of range.");
  assertTile(tile);
  const output = charset.slice();
  output.set(tile, index * 8);
  return output;
}

export function appendBlankTile(charset: Uint8Array): Uint8Array {
  if (charset.length === 0 || charset.length % 8 !== 0 || charset.length >= 256 * 8) throw new RangeError("Charset cannot contain another tile.");
  const output = new Uint8Array(charset.length + 8);
  output.set(charset);
  return output;
}

export function reorderCharsetTiles(
  charset: Uint8Array,
  assignments: readonly CharsetAssignment[],
  order: readonly number[],
): { readonly charset: Uint8Array; readonly assignments: readonly CharsetAssignment[] } {
  if (charset.length === 0 || charset.length % 8 !== 0) throw new RangeError("Invalid charset.");
  const count = charset.length / 8;
  if (order.length !== count || new Set(order).size !== count || order.some((index) => index < 0 || index >= count)) {
    throw new RangeError("Tile order must contain every tile exactly once.");
  }
  const remap = new Uint8Array(count);
  const output = new Uint8Array(charset.length);
  order.forEach((oldIndex, newIndex) => {
    output.set(charset.subarray(oldIndex * 8, oldIndex * 8 + 8), newIndex * 8);
    remap[oldIndex] = newIndex;
  });
  return {
    charset: output,
    assignments: assignments.map((assignment) => ({
      ...assignment,
      characterIndex: remap[assignment.characterIndex] ?? assignment.characterIndex,
    })),
  };
}
