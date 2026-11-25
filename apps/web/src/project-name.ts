export function normalizeProjectName(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 120)
    .trim() || "Untitled project";
}
