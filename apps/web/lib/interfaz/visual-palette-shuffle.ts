/** CSS vars consumed by visual-modes.css — random filter stack on <html>. */
export const PALETTE_SHUFFLE_CSS_VARS = [
  '--shuffle-hue',
  '--shuffle-sat',
  '--shuffle-bright',
  '--shuffle-contrast',
  '--shuffle-sepia',
] as const;

function randBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Random but bounded so contrast/legibility stay close to the color theme. */
export function buildPaletteShuffleFilter(): Record<(typeof PALETTE_SHUFFLE_CSS_VARS)[number], string> {
  const hue = Math.round(randBetween(18, 342));
  const sat = randBetween(0.82, 1.28).toFixed(3);
  const bright = randBetween(0.94, 1.06).toFixed(3);
  const contrast = randBetween(1.02, 1.14).toFixed(3);
  const sepia = randBetween(0, 0.22).toFixed(3);

  return {
    '--shuffle-hue': `${hue}deg`,
    '--shuffle-sat': sat,
    '--shuffle-bright': bright,
    '--shuffle-contrast': contrast,
    '--shuffle-sepia': sepia,
  };
}

export function applyPaletteShuffleToDocument(regenerate = false): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!regenerate && root.style.getPropertyValue('--shuffle-hue')) return;

  const mapping = buildPaletteShuffleFilter();
  for (const [key, value] of Object.entries(mapping)) {
    root.style.setProperty(key, value);
  }
}

export function clearPaletteShuffleFromDocument(): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  for (const key of PALETTE_SHUFFLE_CSS_VARS) {
    root.style.removeProperty(key);
  }
}
