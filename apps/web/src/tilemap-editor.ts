import type { CharsetAssignment, CharsetEncoding } from "@retro-converter/zx-charset";

export interface TilemapEditorSnapshot {
  readonly charset: Uint8Array;
  readonly assignments: readonly CharsetAssignment[];
  readonly attributes: Uint8Array;
  readonly encoding: CharsetEncoding;
}
export function snapshotTilemapEditor(input: TilemapEditorSnapshot): TilemapEditorSnapshot {
  return {
    charset: input.charset.slice(),
    assignments: input.assignments.map((assignment) => ({ ...assignment })),
    attributes: input.attributes.slice(),
    encoding: input.encoding,
  };
}

function sourceCoordinate(transform: number, x: number, y: number): readonly [number, number] {
  if (transform === 1) return [y, 7 - x];
  if (transform === 2) return [7 - x, 7 - y];
  if (transform === 3) return [7 - y, x];
  if (transform === 4) return [7 - x, y];
  if (transform === 5) return [x, 7 - y];
  if (transform === 6) return [y, x];
  if (transform === 7) return [7 - y, 7 - x];
  return [x, y];
}

export function tileForCell(
  charset: Uint8Array,
  assignment: CharsetAssignment,
): Uint8Array {
  const output = new Uint8Array(8);
  const base = charset.subarray(assignment.characterIndex * 8, assignment.characterIndex * 8 + 8);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const [sourceX, sourceY] = sourceCoordinate(assignment.transform, x, y);
      let on = ((base[sourceY] ?? 0) & (0x80 >> sourceX)) !== 0;
      if (assignment.inverted) on = !on;
      if (on) output[y] = (output[y] ?? 0) | (0x80 >> x);
    }
  }
  return output;
}

export function toggleCellPixel(
  charset: Uint8Array,
  assignment: CharsetAssignment,
  x: number,
  y: number,
): Uint8Array {
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x > 7 || y < 0 || y > 7) {
    throw new RangeError("Cell pixel coordinates must be from 0 through 7.");
  }
  const output = charset.slice();
  const [sourceX, sourceY] = sourceCoordinate(assignment.transform, x, y);
  output[assignment.characterIndex * 8 + sourceY] =
    (output[assignment.characterIndex * 8 + sourceY] ?? 0) ^ (0x80 >> sourceX);
  return output;
}

export function setCellPixel(
  charset: Uint8Array,
  assignment: CharsetAssignment,
  x: number,
  y: number,
  value: boolean,
): Uint8Array {
  const current = tileForCell(charset, assignment);
  const on = ((current[y] ?? 0) & (0x80 >> x)) !== 0;
  return on === value ? charset.slice() : toggleCellPixel(charset, assignment, x, y);
}
