const RETIRED_ORDERED_MATRIX_IDS = new Set([
  "dithvide-grid-4x4",
  "dithvide-triangle-4x4",
  "dithvide-cluster-4x4",
  "dithvide-oblique-4x4",
]);

/** Maps removed project/profile choices to the stable general-purpose default. */
export function migrateRetiredOrderedMatrix(value: unknown): unknown {
  return typeof value === "string" && RETIRED_ORDERED_MATRIX_IDS.has(value)
    ? "bayer-4x4"
    : value;
}
