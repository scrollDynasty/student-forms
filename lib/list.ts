/** A copy of `list` with the items at `i` and `j` swapped; out-of-range indexes leave it unchanged. */
export function swapped<T>(list: readonly T[], i: number, j: number): T[] {
  const next = [...list];
  const a = next[i];
  const b = next[j];
  if (a === undefined || b === undefined) return next;
  next[i] = b;
  next[j] = a;
  return next;
}
