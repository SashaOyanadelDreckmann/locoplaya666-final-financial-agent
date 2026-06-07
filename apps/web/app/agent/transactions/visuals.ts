import { PRODUCT_STACK_PALETTE, PRODUCT_STACK_TEXT_PALETTE } from './constants';

export function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.replace('#', '').trim();
  if (!/^[\da-f]{6}$/i.test(normalized)) return `rgba(59, 91, 122, ${alpha})`;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function productStackColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash << 5) - hash + seed.charCodeAt(i);
  return PRODUCT_STACK_PALETTE[Math.abs(hash) % PRODUCT_STACK_PALETTE.length];
}

export function productStackTextColor(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash << 5) - hash + seed.charCodeAt(i);
  return PRODUCT_STACK_TEXT_PALETTE[(Math.abs(hash) + 1) % PRODUCT_STACK_TEXT_PALETTE.length];
}

export function productVisualPalette(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash << 5) - hash + seed.charCodeAt(i);
  const hue = Math.abs(hash) % 360;
  const glowHue = (hue + 24) % 360;
  return {
    base: `hsl(${hue} 44% 22%)`,
    glow: `hsla(${glowHue} 90% 70% / 0.26)`,
    edge: `hsla(${hue} 86% 84% / 0.2)`,
    tint: `hsla(${glowHue} 100% 95% / 0.94)`,
  };
}

export function libraryCardSurface(palette: ReturnType<typeof productVisualPalette>) {
  return matteLibraryCardSurface(palette.base, palette.tint, palette.edge);
}

export function matteLibraryCardSurface(baseColor: string, accentColor: string, edgeColor?: string) {
  return {
    background: `linear-gradient(165deg, color-mix(in srgb, ${baseColor} 96%, #101820) 0%, color-mix(in srgb, ${baseColor} 78%, #0a1118) 100%)`,
    borderColor: edgeColor ?? hexToRgba(accentColor, 0.28),
    boxShadow:
      'inset 0 1px 0 rgba(255, 255, 255, 0.07), 0 12px 24px rgba(0, 0, 0, 0.3)',
    tint: accentColor,
  };
}
