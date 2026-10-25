import type { OrderedMatrix } from "@retro-converter/conversion-core";
import type { BitmapEditorPoint } from "./bitmap-editor-tools.js";

export type BitmapPrimitiveKind = "line" | "circle" | "ellipse" | "rectangle";

export interface BitmapPrimitiveRaster {
  readonly fill: readonly BitmapEditorPoint[];
  readonly outline: readonly BitmapEditorPoint[];
}

function uniquePoints(points: readonly BitmapEditorPoint[]): BitmapEditorPoint[] {
  const seen = new Set<string>();
  return points.filter(({ x, y }) => {
    const key = `${x},${y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function linePoints(
  start: BitmapEditorPoint,
  end: BitmapEditorPoint,
  width: number,
  height: number,
): BitmapEditorPoint[] {
  const points: BitmapEditorPoint[] = [];
  let x = start.x;
  let y = start.y;
  const dx = Math.abs(end.x - start.x);
  const sx = start.x < end.x ? 1 : -1;
  const dy = -Math.abs(end.y - start.y);
  const sy = start.y < end.y ? 1 : -1;
  let error = dx + dy;
  while (true) {
    if (x >= 0 && x < width && y >= 0 && y < height) points.push({ x, y });
    if (x === end.x && y === end.y) break;
    const doubled = error * 2;
    if (doubled >= dy) { error += dy; x += sx; }
    if (doubled <= dx) { error += dx; y += sy; }
  }
  return points;
}

function ellipsePoints(
  left: number,
  top: number,
  right: number,
  bottom: number,
): { fill: BitmapEditorPoint[]; outline: BitmapEditorPoint[] } {
  const width = right - left + 1;
  const height = bottom - top + 1;
  if (width === 1 || height === 1) {
    const fill = Array.from({ length: Math.max(width, height) }, (_, index) => ({
      x: width === 1 ? left : left + index,
      y: height === 1 ? top : top + index,
    }));
    return { fill, outline: fill };
  }

  const centerX = (left + right) / 2;
  const centerY = (top + bottom) / 2;
  const radiusX = width / 2;
  const radiusY = height / 2;
  const fill: BitmapEditorPoint[] = [];
  const fillKeys = new Set<string>();
  for (let y = top; y <= bottom; y += 1) {
    for (let x = left; x <= right; x += 1) {
      const normalizedX = (x - centerX) / radiusX;
      const normalizedY = (y - centerY) / radiusY;
      if (normalizedX * normalizedX + normalizedY * normalizedY > 1) continue;
      fill.push({ x, y });
      fillKeys.add(`${x},${y}`);
    }
  }
  const outline = fill.filter(({ x, y }) =>
    !fillKeys.has(`${x - 1},${y}`) || !fillKeys.has(`${x + 1},${y}`) ||
    !fillKeys.has(`${x},${y - 1}`) || !fillKeys.has(`${x},${y + 1}`),
  );
  return { fill, outline };
}

export function rasterizeBitmapPrimitive(
  kind: BitmapPrimitiveKind,
  first: BitmapEditorPoint,
  second: BitmapEditorPoint,
  width: number,
  height: number,
): BitmapPrimitiveRaster {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1) {
    throw new RangeError("Bitmap primitive dimensions must be positive integers.");
  }
  const clamp = (point: BitmapEditorPoint): BitmapEditorPoint => ({
    x: Math.max(0, Math.min(width - 1, Math.round(point.x))),
    y: Math.max(0, Math.min(height - 1, Math.round(point.y))),
  });
  const a = clamp(first);
  const b = clamp(second);
  if (kind === "line") return { fill: [], outline: linePoints(a, b, width, height) };

  if (kind === "circle") {
    const radius = Math.round(Math.hypot(b.x - a.x, b.y - a.y));
    const fill: BitmapEditorPoint[] = [];
    const outline: BitmapEditorPoint[] = [];
    const radiusSquared = radius * radius;
    for (let y = a.y - radius; y <= a.y + radius; y += 1) {
      for (let x = a.x - radius; x <= a.x + radius; x += 1) {
        const distanceSquared = (x - a.x) ** 2 + (y - a.y) ** 2;
        if (distanceSquared > radiusSquared || x < 0 || x >= width || y < 0 || y >= height) continue;
        const point = { x, y };
        fill.push(point);
        if (distanceSquared === radiusSquared ||
          (x - a.x - 1) ** 2 + (y - a.y) ** 2 > radiusSquared ||
          (x - a.x + 1) ** 2 + (y - a.y) ** 2 > radiusSquared ||
          (x - a.x) ** 2 + (y - a.y - 1) ** 2 > radiusSquared ||
          (x - a.x) ** 2 + (y - a.y + 1) ** 2 > radiusSquared) outline.push(point);
      }
    }
    return { fill, outline };
  }

  const left = Math.min(a.x, b.x);
  const right = Math.max(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const bottom = Math.max(a.y, b.y);
  if (kind === "rectangle") {
    const fill: BitmapEditorPoint[] = [];
    const outline: BitmapEditorPoint[] = [];
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const point = { x, y };
        fill.push(point);
        if (x === left || x === right || y === top || y === bottom) outline.push(point);
      }
    }
    return { fill, outline };
  }
  const ellipse = ellipsePoints(left, top, right, bottom);
  return { fill: ellipse.fill, outline: ellipse.outline };
}

export function rasterizeBitmapBrushStroke(
  points: readonly BitmapEditorPoint[],
  brush: (x: number, y: number) => readonly BitmapEditorPoint[],
): readonly BitmapEditorPoint[] {
  return uniquePoints(points.flatMap(({ x, y }) => brush(x, y)));
}

export function bitmapPrimitiveStippleOn(
  x: number,
  y: number,
  matrix: OrderedMatrix,
  densityPercent: number,
): boolean {
  const density = Math.max(0, Math.min(100, densityPercent)) / 100;
  const mx = ((x % matrix.width) + matrix.width) % matrix.width;
  const my = ((y % matrix.height) + matrix.height) % matrix.height;
  const rank = matrix.values[my * matrix.width + mx] ?? 0;
  return (rank + 0.5) / matrix.levels < density;
}

export function bitmapCustomPatternOn(
  x: number,
  y: number,
  pattern: Uint8Array,
): boolean {
  if (pattern.length !== 64) return false;
  const localX = ((x % 8) + 8) % 8;
  const localY = ((y % 8) + 8) % 8;
  return pattern[localY * 8 + localX] === 1;
}

export function sampleBitmapPrimitivePattern(
  paletteIndices: Uint8Array,
  width: number,
  height: number,
  pixel: BitmapEditorPoint,
): Uint8Array {
  if (!Number.isInteger(width) || width < 1 || !Number.isInteger(height) || height < 1 || paletteIndices.length !== width * height) {
    throw new RangeError("Custom bitmap pattern source dimensions are invalid.");
  }
  const originX = Math.floor(pixel.x / 8) * 8;
  const originY = Math.floor(pixel.y / 8) * 8;
  const pattern = new Uint8Array(64);
  for (let y = 0; y < 8; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      const sourceX = (originX + x) % width;
      const sourceY = (originY + y) % height;
      pattern[y * 8 + x] = (paletteIndices[sourceY * width + sourceX] ?? 0) === 0 ? 0 : 1;
    }
  }
  return pattern;
}

export function bitmapPrimitivePointsPath(points: readonly BitmapEditorPoint[]): string {
  const rows = new Map<number, number[]>();
  for (const { x, y } of points) {
    const row = rows.get(y) ?? [];
    row.push(x);
    rows.set(y, row);
  }
  const commands: string[] = [];
  for (const [y, values] of rows) {
    const xs = [...new Set(values)].sort((a, b) => a - b);
    if (xs.length === 0) continue;
    let runStart = xs[0]!;
    let previous = runStart;
    for (let index = 1; index <= xs.length; index += 1) {
      const next = xs[index];
      if (next !== undefined && next === previous + 1) {
        previous = next;
        continue;
      }
      const runWidth = previous - runStart + 1;
      commands.push(`M${runStart} ${y}h${runWidth}v1h-${runWidth}z`);
      if (next !== undefined) runStart = next;
      previous = next ?? previous;
    }
  }
  return commands.join("");
}

