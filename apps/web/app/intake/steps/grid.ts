/**
 * Pick a column count for a grid of `n` option cards so that rows stay balanced
 * and a single card is never left alone on its own row (no "orphan").
 *
 * Strategy: prefer an exact divisor (perfectly even rows); otherwise pick the
 * largest candidate (within 2..4) whose remainder isn't 1.
 */
export function balancedColumns(n: number): number {
  if (n <= 3) return Math.max(1, n); // single row is fine for 1–3 items
  const candidates = [4, 3, 2];
  for (const c of candidates) if (n % c === 0) return c; // perfectly even
  for (const c of candidates) if (n % c !== 1) return c; // avoid lone card
  return 3;
}
