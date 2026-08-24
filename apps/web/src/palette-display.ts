export function distinctPreviewColors(rgba: Uint8Array): readonly string[] {
  const colors = new Set<number>();
  for (let offset = 0; offset < rgba.length; offset += 4) {
    colors.add(
      ((rgba[offset] ?? 0) << 16) |
      ((rgba[offset + 1] ?? 0) << 8) |
      (rgba[offset + 2] ?? 0),
    );
  }
  return [...colors]
    .sort((left, right) => left - right)
    .map((color) => `#${color.toString(16).padStart(6, "0")}`);
}

