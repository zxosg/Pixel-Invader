export interface BitmapCell {
  readonly rows: Uint8Array;
  readonly attribute: number;
}

export type BitmapCellEditOperation =
  | { readonly kind: "toggle-pixel"; readonly x: number; readonly y: number }
  | { readonly kind: "set-pixel"; readonly x: number; readonly y: number; readonly value: boolean }
  | { readonly kind: "invert" }
  | { readonly kind: "shift"; readonly dx: -1 | 0 | 1; readonly dy: -1 | 0 | 1 }
  | { readonly kind: "set-attribute"; readonly attribute: number };

function assertPixelCoordinate(x: number, y: number): void {
  if (!Number.isInteger(x) || x < 0 || x >= 8 ||
      !Number.isInteger(y) || y < 0 || y >= 8) {
    throw new RangeError("Bitmap pixel coordinates must be inside an 8×8 cell.");
  }
}

function normalizedRows(rows: Uint8Array): Uint8Array {
  if (rows.length !== 8) throw new RangeError("Bitmap cells must contain exactly 8 rows.");
  return Uint8Array.from(rows, (row) => row & 0xff);
}

function shiftedRows(rows: Uint8Array, dx: -1 | 0 | 1, dy: -1 | 0 | 1): Uint8Array {
  const output = new Uint8Array(8);
  for (let y = 0; y < 8; y += 1) {
    const sourceY = y - dy;
    if (sourceY < 0 || sourceY >= 8) continue;
    const source = rows[sourceY] ?? 0;
    output[y] = dx === 1
      ? (source >> 1) & 0x7f
      : dx === -1
        ? (source << 1) & 0xfe
        : source;
  }
  return output;
}

export function applyBitmapCellEdit(
  cell: BitmapCell,
  operation: BitmapCellEditOperation,
): BitmapCell {
  const rows = normalizedRows(cell.rows);
  const attribute = cell.attribute & 0xff;
  switch (operation.kind) {
    case "toggle-pixel": {
      assertPixelCoordinate(operation.x, operation.y);
      rows[operation.y] = (rows[operation.y] ?? 0) ^ (0x80 >> operation.x);
      return { rows, attribute };
    }
    case "set-pixel": {
      assertPixelCoordinate(operation.x, operation.y);
      const mask = 0x80 >> operation.x;
      rows[operation.y] = operation.value
        ? (rows[operation.y] ?? 0) | mask
        : (rows[operation.y] ?? 0) & ~mask;
      return { rows, attribute };
    }
    case "invert":
      return { rows: Uint8Array.from(rows, (row) => row ^ 0xff), attribute };
    case "shift":
      if (![-1, 0, 1].includes(operation.dx) || ![-1, 0, 1].includes(operation.dy)) {
        throw new RangeError("Bitmap shifts are limited to one pixel per operation.");
      }
      return { rows: shiftedRows(rows, operation.dx, operation.dy), attribute };
    case "set-attribute":
      if (!Number.isInteger(operation.attribute) || operation.attribute < 0 || operation.attribute > 0xff) {
        throw new RangeError("ZX attributes must be an 8-bit value.");
      }
      return { rows, attribute: operation.attribute };
  }
}
