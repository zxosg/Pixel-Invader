export function allCharsetIndices(count: number): number[] {
  if (!Number.isInteger(count) || count < 0) {
    throw new RangeError("Charset count must be a non-negative integer.");
  }
  return Array.from({ length: count }, (_, index) => index);
}

export function effectiveCharsetSelection(
  selection: readonly number[] | null,
  count: number,
): number[] {
  const all = allCharsetIndices(count);
  if (selection === null) return all;
  return [...new Set(selection)].filter((index) => index >= 0 && index < count).sort((left, right) => left - right);
}

export function toggleCharsetSelection(
  selection: readonly number[] | null,
  count: number,
  index: number,
): number[] {
  const next = new Set(effectiveCharsetSelection(selection, count));
  if (next.has(index)) next.delete(index);
  else if (index >= 0 && index < count) next.add(index);
  return [...next].sort((left, right) => left - right);
}

export function invertCharsetSelection(
  selection: readonly number[] | null,
  count: number,
): number[] {
  const selected = new Set(effectiveCharsetSelection(selection, count));
  return allCharsetIndices(count).filter((index) => !selected.has(index));
}

export function remapCharsetSelection(
  selection: readonly number[] | null,
  remap: readonly number[],
): number[] | null {
  if (selection === null) return null;
  return [...new Set(selection
    .map((index) => remap[index] ?? -1)
    .filter((index) => index >= 0))].sort((left, right) => left - right);
}
