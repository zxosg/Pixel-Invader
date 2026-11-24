

export function gridPathForDimensions(
  width: number,
  height: number,
  stepX: number,
  stepY: number,
): string {
  const segments: string[] = [];
  for (let x = stepX; x < width; x += stepX) segments.push(`M${x} 0V${height}`);
  for (let y = stepY; y < height; y += stepY) segments.push(`M0 ${y}H${width}`);
  return segments.join(" ");
}

export function bitmapEditorLinePoints(
  start: { readonly x: number; readonly y: number },
  end: { readonly x: number; readonly y: number },
): readonly { readonly x: number; readonly y: number }[] {
  const points: Array<{ readonly x: number; readonly y: number }> = [];
  let x = start.x;
  let y = start.y;
  const dx = Math.abs(end.x - start.x);
  const sx = start.x < end.x ? 1 : -1;
  const dy = -Math.abs(end.y - start.y);
  const sy = start.y < end.y ? 1 : -1;
  let error = dx + dy;
  while (x !== end.x || y !== end.y) {
    const doubled = error * 2;
    if (doubled >= dy) { error += dy; x += sx; }
    if (doubled <= dx) { error += dx; y += sy; }
    points.push({ x, y });
  }
  return points;
}
