import {
  ZX_ATTRIBUTE_COLUMNS,
  ZX_BITMAP_BYTES,
  ZX_SCREEN_HEIGHT,
  ZX_SCREEN_WIDTH,
  zxBitmapOffset,
  zxSoftwareScrBytes,
} from "@retro-converter/zx-spectrum";

export type ZxAttributeCellHeight = 1 | 2 | 4 | 8;
export type ZxCellAction = "set" | "reset" | "invert";
export type ZxCellCopyMode = "color" | "clone" | "clone-color";

export interface ZxAttributeSelection {
  readonly ink: number | null;
  readonly paper: number | null;
  readonly bright: boolean | null;
  readonly flash: boolean | null;
}

export interface ZxAttributeCellSnapshot {
  readonly cellX: number;
  readonly cellY: number;
  readonly attributeHeight: ZxAttributeCellHeight;
  readonly rows: Uint8Array;
  readonly attribute: number;
}

function assertHeight(attributeHeight: number): asserts attributeHeight is ZxAttributeCellHeight {
  if (attributeHeight !== 1 && attributeHeight !== 2 && attributeHeight !== 4 && attributeHeight !== 8) {
    throw new RangeError("ZX attribute height must be 1, 2, 4, or 8.");
  }
}

function assertCell(cellX: number, cellY: number, attributeHeight: ZxAttributeCellHeight): void {
  if (!Number.isInteger(cellX) || cellX < 0 || cellX >= ZX_ATTRIBUTE_COLUMNS ||
      !Number.isInteger(cellY) || cellY < 0 || cellY >= ZX_SCREEN_HEIGHT / attributeHeight) {
    throw new RangeError("ZX attribute cell is outside the screen.");
  }
}

function assertScr(encoded: Uint8Array, attributeHeight: ZxAttributeCellHeight): void {
  if (encoded.length !== zxSoftwareScrBytes(attributeHeight)) {
    throw new RangeError(`ZX SCR must contain ${zxSoftwareScrBytes(attributeHeight)} bytes.`);
  }
}

export function cloneZxAttributeCell(cell: ZxAttributeCellSnapshot): ZxAttributeCellSnapshot {
  return { ...cell, rows: cell.rows.slice() };
}

export function readZxAttributeCell(
  encoded: Uint8Array,
  attributeHeight: ZxAttributeCellHeight,
  cellX: number,
  cellY: number,
): ZxAttributeCellSnapshot {
  assertHeight(attributeHeight);
  assertScr(encoded, attributeHeight);
  assertCell(cellX, cellY, attributeHeight);
  const rows = new Uint8Array(attributeHeight);
  for (let localY = 0; localY < attributeHeight; localY += 1) {
    rows[localY] = encoded[zxBitmapOffset(cellX, cellY * attributeHeight + localY)] ?? 0;
  }
  return {
    cellX,
    cellY,
    attributeHeight,
    rows,
    attribute: encoded[ZX_BITMAP_BYTES + cellY * ZX_ATTRIBUTE_COLUMNS + cellX] ?? 0,
  };
}

export function applyZxCellAction(
  cell: ZxAttributeCellSnapshot,
  action: ZxCellAction,
): ZxAttributeCellSnapshot {
  const rows = cell.rows.slice();
  for (let index = 0; index < rows.length; index += 1) {
    rows[index] = action === "set" ? 0xff : action === "reset" ? 0 : rows[index]! ^ 0xff;
  }
  return { ...cell, rows };
}

export function applyZxAttributeSelection(
  cell: ZxAttributeCellSnapshot,
  selection: ZxAttributeSelection,
): ZxAttributeCellSnapshot {
  let attribute = cell.attribute;
  if (selection.ink !== null) attribute = (attribute & ~0x07) | (selection.ink & 0x07);
  if (selection.paper !== null) attribute = (attribute & ~0x38) | ((selection.paper & 0x07) << 3);
  if (selection.bright !== null) attribute = selection.bright ? attribute | 0x40 : attribute & ~0x40;
  if (selection.flash !== null) attribute = selection.flash ? attribute | 0x80 : attribute & ~0x80;
  return { ...cell, attribute };
}

export function copyZxAttributeCell(
  destination: ZxAttributeCellSnapshot,
  source: ZxAttributeCellSnapshot,
  mode: ZxCellCopyMode,
): ZxAttributeCellSnapshot {
  if (destination.attributeHeight !== source.attributeHeight) {
    throw new RangeError("ZX attribute cells must have the same height.");
  }
  return {
    ...destination,
    rows: mode === "color" ? destination.rows.slice() : source.rows.slice(),
    attribute: mode === "clone" ? destination.attribute : source.attribute,
  };
}

export function zxAttributeCellsEqual(a: ZxAttributeCellSnapshot, b: ZxAttributeCellSnapshot): boolean {
  if (a.attribute !== b.attribute || a.rows.length !== b.rows.length) return false;
  for (let index = 0; index < a.rows.length; index += 1) {
    if (a.rows[index] !== b.rows[index]) return false;
  }
  return true;
}

export function writeZxAttributeCell(
  encoded: Uint8Array,
  cell: ZxAttributeCellSnapshot,
): Uint8Array {
  assertHeight(cell.attributeHeight);
  assertScr(encoded, cell.attributeHeight);
  assertCell(cell.cellX, cell.cellY, cell.attributeHeight);
  if (cell.rows.length !== cell.attributeHeight) {
    throw new RangeError("ZX attribute cell has an invalid bitmap height.");
  }
  const next = encoded.slice();
  for (let localY = 0; localY < cell.attributeHeight; localY += 1) {
    next[zxBitmapOffset(cell.cellX, cell.cellY * cell.attributeHeight + localY)] = cell.rows[localY] ?? 0;
  }
  next[ZX_BITMAP_BYTES + cell.cellY * ZX_ATTRIBUTE_COLUMNS + cell.cellX] = cell.attribute & 0xff;
  return next;
}

export function applyZxAttributeCellOperation(
  encoded: Uint8Array,
  attributeHeight: ZxAttributeCellHeight,
  cellX: number,
  cellY: number,
  operation: { readonly kind: "action"; readonly action: ZxCellAction } |
    { readonly kind: "copy"; readonly source: ZxAttributeCellSnapshot; readonly mode: ZxCellCopyMode },
): Uint8Array {
  const destination = readZxAttributeCell(encoded, attributeHeight, cellX, cellY);
  const edited = operation.kind === "action"
    ? applyZxCellAction(destination, operation.action)
    : copyZxAttributeCell(destination, operation.source, operation.mode);
  return zxAttributeCellsEqual(destination, edited) ? encoded.slice() : writeZxAttributeCell(encoded, edited);
}

export function applyZxAttributeCellMaskOperation(
  encoded: Uint8Array,
  attributeHeight: ZxAttributeCellHeight,
  cellX: number,
  cellY: number,
  maskRows: Uint8Array,
  operation: "copy" | "or" | "and" | "xor" | "none",
): Uint8Array {
  const destination = readZxAttributeCell(encoded, attributeHeight, cellX, cellY);
  if (maskRows.length !== attributeHeight) {
    throw new RangeError("ZX attribute cell mask has an invalid bitmap height.");
  }
  const rows = destination.rows.slice();
  for (let index = 0; index < rows.length; index += 1) {
    const mask = maskRows[index] ?? 0;
    rows[index] = operation === "copy"
      ? mask
      : operation === "or"
        ? rows[index]! | mask
        : operation === "and"
          ? rows[index]! & ~mask
          : operation === "xor"
            ? rows[index]! ^ mask
            : rows[index]!;
  }
  const edited = { ...destination, rows };
  return zxAttributeCellsEqual(destination, edited) ? encoded.slice() : writeZxAttributeCell(encoded, edited);
}

export function isZxAttributeCellCoordinate(
  x: number,
  y: number,
  attributeHeight: number,
): boolean {
  return Number.isInteger(attributeHeight) && [1, 2, 4, 8].includes(attributeHeight) &&
    Number.isInteger(x) && x >= 0 && x < ZX_SCREEN_WIDTH &&
    Number.isInteger(y) && y >= 0 && y < ZX_SCREEN_HEIGHT;
}
