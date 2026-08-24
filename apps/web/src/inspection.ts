import {
  ZX_BITMAP_BYTES,
  assertValidSoftwareScr,
  zxBitmapOffset,
  type ZxAttributeHeight,
} from "@retro-converter/zx-spectrum";

export const ZX_BASE_COLORS = [
  { code: 0, name: "Black", normal: "#000000", bright: "#000000" },
  { code: 1, name: "Blue", normal: "#0000cd", bright: "#0000ff" },
  { code: 2, name: "Red", normal: "#cd0000", bright: "#ff0000" },
  { code: 3, name: "Magenta", normal: "#cd00cd", bright: "#ff00ff" },
  { code: 4, name: "Green", normal: "#00cd00", bright: "#00ff00" },
  { code: 5, name: "Cyan", normal: "#00cdcd", bright: "#00ffff" },
  { code: 6, name: "Yellow", normal: "#cdcd00", bright: "#ffff00" },
  { code: 7, name: "White", normal: "#cdcdcd", bright: "#ffffff" },
] as const;

export function buildGridPath(stepX: number, stepY: number): string {
  if (
    !Number.isInteger(stepX) || stepX < 1 || 256 % stepX !== 0 ||
    !Number.isInteger(stepY) || stepY < 1 || 192 % stepY !== 0
  ) throw new RangeError("Grid steps must divide the 256×192 display.");
  const commands: string[] = [];
  for (let x = stepX; x < 256; x += stepX) commands.push(`M${x} 0V192`);
  for (let y = stepY; y < 192; y += stepY) commands.push(`M0 ${y}H256`);
  return commands.join(" ");
}

export function mapSynchronizedScroll(
  sourcePosition: { readonly left: number; readonly top: number },
  sourceRange: { readonly width: number; readonly height: number },
  targetRange: { readonly width: number; readonly height: number },
): { readonly left: number; readonly top: number } {
  const sourceWidth = Math.max(1, sourceRange.width);
  const sourceHeight = Math.max(1, sourceRange.height);
  return {
    left: Math.max(0, Math.min(targetRange.width, sourcePosition.left / sourceWidth * targetRange.width)),
    top: Math.max(0, Math.min(targetRange.height, sourcePosition.top / sourceHeight * targetRange.height)),
  };
}

export interface InspectedAttribute {
  readonly pixelX: number;
  readonly pixelY: number;
  readonly cellX: number;
  readonly cellY: number;
  readonly attributeOffset: number;
  readonly attribute: number;
  readonly attributeHex: string;
  readonly ink: number;
  readonly paper: number;
  readonly bright: boolean;
  readonly pixel: 0 | 1;
  readonly selectedColor: number;
  readonly bitmapBytes: readonly number[];
}

export interface PaletteUsage {
  readonly baseColorCodes: readonly number[];
  readonly normalColorCodes: readonly number[];
  readonly brightColorCodes: readonly number[];
  readonly normalCells: number;
  readonly brightCells: number;
}

export function inspectSoftwareScr(
  scr: Uint8Array,
  attributeHeight: ZxAttributeHeight,
  pixelX: number,
  pixelY: number,
): InspectedAttribute {
  assertValidSoftwareScr(scr, attributeHeight);
  if (
    !Number.isInteger(pixelX) || pixelX < 0 || pixelX >= 256 ||
    !Number.isInteger(pixelY) || pixelY < 0 || pixelY >= 192
  ) throw new RangeError("Inspection coordinates must be inside the 256×192 active display.");
  const cellX = Math.floor(pixelX / 8);
  const cellY = Math.floor(pixelY / attributeHeight);
  const attributeOffset = cellY * 32 + cellX;
  const attribute = scr[ZX_BITMAP_BYTES + attributeOffset] ?? 0;
  const ink = attribute & 7;
  const paper = (attribute >> 3) & 7;
  const bright = (attribute & 0x40) !== 0;
  const bitmapByte = scr[zxBitmapOffset(cellX, pixelY)] ?? 0;
  const pixel = ((bitmapByte >> (7 - (pixelX & 7))) & 1) as 0 | 1;
  const bitmapBytes = Array.from(
    { length: attributeHeight },
    (_, localY) => scr[zxBitmapOffset(cellX, cellY * attributeHeight + localY)] ?? 0,
  );
  return {
    pixelX,
    pixelY,
    cellX,
    cellY,
    attributeOffset,
    attribute,
    attributeHex: `0x${attribute.toString(16).padStart(2, "0")}`,
    ink,
    paper,
    bright,
    pixel,
    selectedColor: pixel === 1 ? ink : paper,
    bitmapBytes,
  };
}

export function summarizePaletteUsage(
  scr: Uint8Array,
  attributeHeight: ZxAttributeHeight,
): PaletteUsage {
  assertValidSoftwareScr(scr, attributeHeight);
  const colors = new Set<number>();
  const normalColors = new Set<number>();
  const brightColors = new Set<number>();
  let normalCells = 0;
  let brightCells = 0;
  for (const attribute of scr.subarray(ZX_BITMAP_BYTES)) {
    colors.add(attribute & 7);
    colors.add((attribute >> 3) & 7);
    const planeColors = (attribute & 0x40) === 0 ? normalColors : brightColors;
    planeColors.add(attribute & 7);
    planeColors.add((attribute >> 3) & 7);
    if ((attribute & 0x40) === 0) normalCells += 1;
    else brightCells += 1;
  }
  return {
    baseColorCodes: [...colors].sort((left, right) => left - right),
    normalColorCodes: [...normalColors].sort((left, right) => left - right),
    brightColorCodes: [...brightColors].sort((left, right) => left - right),
    normalCells,
    brightCells,
  };
}

export function buildInspectionReport(
  scr: Uint8Array,
  attributeHeight: ZxAttributeHeight,
  enabledBaseColorCodes: readonly number[],
): Record<string, unknown> {
  const usage = summarizePaletteUsage(scr, attributeHeight);
  return {
    schema_version: "1.0.0",
    display: { width: 256, height: 192 },
    attribute_size: `8x${attributeHeight}`,
    attribute_columns: 32,
    attribute_rows: 192 / attributeHeight,
    bitmap_bytes: ZX_BITMAP_BYTES,
    attribute_bytes: scr.length - ZX_BITMAP_BYTES,
    total_bytes: scr.length,
    enabled_base_color_codes: [...enabledBaseColorCodes],
    used_base_color_codes: usage.baseColorCodes,
    used_normal_color_codes: usage.normalColorCodes,
    used_bright_color_codes: usage.brightColorCodes,
    normal_attribute_count: usage.normalCells,
    bright_attribute_count: usage.brightCells,
    attributes_hex: Array.from(scr.subarray(ZX_BITMAP_BYTES), (value) =>
      value.toString(16).padStart(2, "0")
    ).join(""),
  };
}
