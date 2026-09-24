import {
  transformTile,
  type CharsetAssignment,
  type CharsetEncoding,
  type TileTransform,
} from "@retro-converter/zx-charset";

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

export type TileTransformToggle = "mirror-x" | "mirror-y" | "rotate-cw";

const TRANSFORM_MARKER: Uint8Array = Uint8Array.from([0x81, 0x42, 0x24, 0x18, 0x83, 0x46, 0x29, 0x17]);

function sameTile(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function transformForToggles(mirrorX: boolean, mirrorY: boolean, rotateCw: boolean): TileTransform {
  let transformed: Uint8Array = TRANSFORM_MARKER;
  if (mirrorX) transformed = transformTile(transformed, 4);
  if (mirrorY) transformed = transformTile(transformed, 5);
  if (rotateCw) transformed = transformTile(transformed, 1);
  for (let candidate = 0; candidate < 8; candidate += 1) {
    if (sameTile(transformTile(TRANSFORM_MARKER, candidate as TileTransform), transformed)) {
      return candidate as TileTransform;
    }
  }
  return 0;
}

export function tileTransformToggleState(transform: TileTransform): Readonly<Record<TileTransformToggle, boolean>> {
  for (const mirrorX of [false, true]) {
    for (const mirrorY of [false, true]) {
      for (const rotateCw of [false, true]) {
        if (transformForToggles(mirrorX, mirrorY, rotateCw) === transform) {
          return { "mirror-x": mirrorX, "mirror-y": mirrorY, "rotate-cw": rotateCw };
        }
      }
    }
  }
  return { "mirror-x": false, "mirror-y": false, "rotate-cw": false };
}

export function toggleTileTransform(transform: TileTransform, toggle: TileTransformToggle): TileTransform {
  const state = tileTransformToggleState(transform);
  return transformForToggles(
    toggle === "mirror-x" ? !state["mirror-x"] : state["mirror-x"],
    toggle === "mirror-y" ? !state["mirror-y"] : state["mirror-y"],
    toggle === "rotate-cw" ? !state["rotate-cw"] : state["rotate-cw"],
  );
}

export function tileTransformLabel(transform: TileTransform): string {
  return (["Normal", "R90 CW", "R180", "R270 CCW", "Mirror X", "Mirror Y", "Diagonal", "Anti-diagonal"] as const)[transform];
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
