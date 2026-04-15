/**
 * format.helpers.ts
 * Text formatting and normalization utilities
 */

/**
 * Remove emoji characters from text
 */
export function stripEmojis(text: string): string {
  return text.replace(
    /(\u00d7|\u221a|[\u0300-\u036f]|[\u2600-\u27BF]|[\u2300-\u23FF]|[\u2000-\u206F]|[\u3000-\u303F]|[\uFE00-\uFE0F]|[\u{1F300}-\u{1FAFF}])/gu,
    ''
  );
}

/**
 * Normalize annual rate to 0-1 decimal (e.g., "5%" or "0.05" → 0.05)
 */
export function normalizeAnnualRate(rate: number | string): number {
  if (typeof rate === 'string') {
    const cleaned = rate.replace(/[^\d.]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num > 1 ? num / 100 : num;
  }
  return rate > 1 ? rate / 100 : rate;
}

/**
 * Safe number parsing with cleanup
 */
export function asNumber(value: any, fallback: number = 0): number {
  if (typeof value === 'number') return isFinite(value) ? value : fallback;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '.').trim();
    const num = parseFloat(cleaned);
    return isFinite(num) ? num : fallback;
  }
  return fallback;
}

/**
 * Build PDF title with metadata
 */
export function buildPdfTitle(
  baseTitle: string,
  userModel?: any,
  includeDate: boolean = true
): string {
  let title = baseTitle;

  if (userModel?.risk_profile) {
    title += ` [${userModel.risk_profile.charAt(0).toUpperCase()}]`;
  }

  if (includeDate) {
    const today = new Date().toLocaleDateString('es-CL');
    title += ` • ${today}`;
  }

  return title;
}
