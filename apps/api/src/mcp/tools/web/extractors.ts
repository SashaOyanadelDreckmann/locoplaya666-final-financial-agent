/** Normalize "1.234,56" or "1,234.56" -> number */
export function parseNumberLoose(input: string): number | null {
  const raw = input.trim();
  if (!raw) return null;

  // Keep digits, separators, minus
  const cleaned = raw.replace(/[^\d.,-]/g, '');
  if (!cleaned) return null;

  // Heuristic:
  // If has both "." and "," assume "." thousands and "," decimals (common CL)
  // Else if only "," assume "," decimals
  // Else "." decimals
  let normalized = cleaned;

  const hasDot = normalized.includes('.');
  const hasComma = normalized.includes(',');

  if (hasDot && hasComma) {
    normalized = normalized.replace(/\./g, '').replace(/,/g, '.');
  } else if (hasComma && !hasDot) {
    normalized = normalized.replace(/,/g, '.');
  } // else keep dot decimals

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function extractFirstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re);
  if (!m) return null;
  // Prefer first capture group if exists
  return (m[1] ?? m[0] ?? '').toString().trim() || null;
}
