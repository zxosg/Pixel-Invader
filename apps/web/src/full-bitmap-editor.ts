export type BitmapPaintMode = "set" | "reset" | "toggle" | "none";

export interface BitmapEditorBuffer {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
  /** Optional logical pixel state used by attribute-aware targets. */
  readonly pixels?: Uint8Array;
}

export type BitmapPixelColor = (
  x: number,
  y: number,
  on: boolean,
) => readonly [number, number, number, number] | null;

export interface BitmapEditorGeometry {
  readonly attributeWidth: number | null;
  readonly attributeHeight: number | null;
}

export interface BitmapEditorSnapshot {
  readonly buffer: BitmapEditorBuffer;
  readonly selectedPixel: { readonly x: number; readonly y: number } | null;
}

export function assertBitmapEditorBuffer(buffer: BitmapEditorBuffer): void {
  if (!Number.isInteger(buffer.width) || buffer.width < 1 ||
      !Number.isInteger(buffer.height) || buffer.height < 1 ||
      buffer.rgba.length !== buffer.width * buffer.height * 4 ||
      (buffer.pixels !== undefined && buffer.pixels.length !== buffer.width * buffer.height)) {
    throw new RangeError("Bitmap editor buffer dimensions are invalid.");
  }
}

export function pixelAt(
  buffer: BitmapEditorBuffer,
  x: number,
  y: number,
): readonly [number, number, number, number] {
  assertBitmapEditorBuffer(buffer);
  if (!Number.isInteger(x) || x < 0 || x >= buffer.width ||
      !Number.isInteger(y) || y < 0 || y >= buffer.height) {
    throw new RangeError("Bitmap editor pixel is outside the bitmap.");
  }
  const offset = (y * buffer.width + x) * 4;
  return [
    buffer.rgba[offset] ?? 0,
    buffer.rgba[offset + 1] ?? 0,
    buffer.rgba[offset + 2] ?? 0,
    buffer.rgba[offset + 3] ?? 255,
  ];
}

export function paintPixel(
  buffer: BitmapEditorBuffer,
  x: number,
  y: number,
  mode: BitmapPaintMode,
  colorForState?: BitmapPixelColor,
): BitmapEditorBuffer {
  if (mode === "none") return { ...buffer, rgba: buffer.rgba.slice(), ...(buffer.pixels === undefined ? {} : { pixels: buffer.pixels.slice() }) };
  const [red, green, blue, alpha] = pixelAt(buffer, x, y);
  const next = buffer.rgba.slice();
  const offset = (y * buffer.width + x) * 4;
  const pixelIndex = y * buffer.width + x;
  const currentOn = buffer.pixels === undefined
    ? (red + green + blue) >= 384
    : buffer.pixels[pixelIndex] === 1;
  const nextOn = mode === "set" ? true : mode === "reset" ? false : !currentOn;
  const color = colorForState?.(x, y, nextOn);
  if (color !== null && color !== undefined) {
    next[offset] = color[0];
    next[offset + 1] = color[1];
    next[offset + 2] = color[2];
    next[offset + 3] = color[3];
  } else {
    const value = nextOn ? 255 : 0;
    next[offset] = value;
    next[offset + 1] = value;
    next[offset + 2] = value;
    next[offset + 3] = alpha;
  }
  const pixels = buffer.pixels?.slice();
  if (pixels !== undefined) pixels[pixelIndex] = nextOn ? 1 : 0;
  return { ...buffer, rgba: next, ...(pixels === undefined ? {} : { pixels }) };
}

export function paintPixels(
  buffer: BitmapEditorBuffer,
  pixels: readonly { readonly x: number; readonly y: number }[],
  mode: BitmapPaintMode,
  colorForState?: BitmapPixelColor,
): BitmapEditorBuffer {
  let next = buffer;
  const visited = new Set<string>();
  for (const pixel of pixels) {
    const key = `${pixel.x},${pixel.y}`;
    if (visited.has(key)) continue;
    visited.add(key);
    next = paintPixel(next, pixel.x, pixel.y, mode, colorForState);
  }
  return next;
}

export function bitmapEditorCell(
  pixel: { readonly x: number; readonly y: number },
  geometry: BitmapEditorGeometry,
): { readonly cellX: number; readonly cellY: number; readonly localX: number; readonly localY: number } | null {
  if (geometry.attributeWidth === null || geometry.attributeHeight === null) return null;
  if (geometry.attributeWidth < 1 || geometry.attributeHeight < 1) {
    throw new RangeError("Bitmap attribute geometry must be positive.");
  }
  return {
    cellX: Math.floor(pixel.x / geometry.attributeWidth),
    cellY: Math.floor(pixel.y / geometry.attributeHeight),
    localX: pixel.x % geometry.attributeWidth,
    localY: pixel.y % geometry.attributeHeight,
  };
}

export function cloneBitmapBuffer(buffer: BitmapEditorBuffer): BitmapEditorBuffer {
  assertBitmapEditorBuffer(buffer);
  return { ...buffer, rgba: buffer.rgba.slice(), ...(buffer.pixels === undefined ? {} : { pixels: buffer.pixels.slice() }) };
}
