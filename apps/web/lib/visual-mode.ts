import {
  applyPaletteShuffleToDocument,
  clearPaletteShuffleFromDocument,
} from './visual-palette-shuffle';

export type VisualMode =
  | 'off'
  | 'palette-shuffle'
  | 'grayscale'
  | 'dark-outline'
  | 'light-outline';

export const VISUAL_MODE_ORDER: VisualMode[] = [
  'off',
  'palette-shuffle',
  'grayscale',
  'dark-outline',
  'light-outline',
];

export const VISUAL_MODE_LABELS: Record<VisualMode, string> = {
  off: 'Color',
  'palette-shuffle': 'Filtro aleatorio',
  grayscale: 'Blanco y negro',
  'dark-outline': 'Negro full',
  'light-outline': 'Blanco full',
};

const STORAGE_KEY_V2 = 'agent.ui.visual-mode.v2';
const STORAGE_KEY_LEGACY = 'agent.ui.monochrome.v1';

export function isVisualModeActive(mode: VisualMode): boolean {
  return mode !== 'off';
}

export function cycleVisualMode(current: VisualMode): VisualMode {
  const index = VISUAL_MODE_ORDER.indexOf(current);
  const next = index < 0 ? 0 : (index + 1) % VISUAL_MODE_ORDER.length;
  return VISUAL_MODE_ORDER[next] ?? 'off';
}

export function readStoredVisualMode(): VisualMode {
  if (typeof window === 'undefined') return 'off';
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    if (raw === 'light-gray' || raw === 'invert') return 'off';
    if (raw && VISUAL_MODE_ORDER.includes(raw as VisualMode)) {
      return raw as VisualMode;
    }
    const legacy = localStorage.getItem(STORAGE_KEY_LEGACY);
    if (legacy === '1') return 'grayscale';
  } catch {}
  return 'off';
}

export function storeVisualMode(mode: VisualMode): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY_V2, mode);
    localStorage.setItem(STORAGE_KEY_LEGACY, mode === 'off' ? '0' : '1');
  } catch {}
}

export function clearStoredVisualMode(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY_V2);
    localStorage.removeItem(STORAGE_KEY_LEGACY);
  } catch {}
}

export function applyVisualModeToDocument(mode: VisualMode): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.classList.remove('agent-global-monochrome');
  for (const item of VISUAL_MODE_ORDER) {
    root.classList.remove(`agent-visual-mode-${item}`);
  }
  root.classList.remove('agent-visual-mode-light-gray', 'agent-visual-mode-invert');
  clearPaletteShuffleFromDocument();
  if (mode === 'off') {
    root.removeAttribute('data-visual-mode');
    return;
  }
  root.setAttribute('data-visual-mode', mode);
  root.classList.add(`agent-visual-mode-${mode}`);
  if (mode === 'grayscale') {
    root.classList.add('agent-global-monochrome');
  }
  if (mode === 'palette-shuffle') {
    applyPaletteShuffleToDocument(true);
  }
}
