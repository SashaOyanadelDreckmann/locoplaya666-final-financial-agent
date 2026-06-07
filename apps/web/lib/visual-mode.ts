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

/** Duración del reveal cinematográfico al cambiar de modo (ms). */
export const VISUAL_MODE_TRANSITION_MS = 4000;
const SHIMMER_LINGER_MS = 4600;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/**
 * Capa de luz que viaja con el frente de onda del reveal: un anillo suave
 * que florece desde el origen y se disuelve. Puro adorno, pointer-events:none.
 */
function spawnTransitionShimmer(x: number, y: number): void {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.className = 'visual-mode-shimmer';
  el.style.setProperty('--vm-x', `${x}px`);
  el.style.setProperty('--vm-y', `${y}px`);
  el.style.setProperty('--vm-shimmer-ms', `${SHIMMER_LINGER_MS}ms`);
  document.body.appendChild(el);
  const cleanup = () => el.remove();
  el.addEventListener('animationend', cleanup, { once: true });
  window.setTimeout(cleanup, SHIMMER_LINGER_MS + 400);
}

type TransitionOrigin = { x: number; y: number } | null | undefined;

/**
 * Cambia de modo con un reveal circular premium (View Transitions API):
 * el nuevo estado se funde desde el punto donde está el botón en vez de
 * aparecer de golpe. Degrada con gracia si el navegador no soporta la API
 * o si el usuario pidió menos movimiento.
 */
export function runVisualModeTransition(
  origin: TransitionOrigin,
  apply: () => void,
): void {
  if (typeof document === 'undefined') {
    apply();
    return;
  }

  const docAny = document as unknown as {
    startViewTransition?: (cb: () => void) => { ready: Promise<void> };
  };
  const startViewTransition = docAny.startViewTransition?.bind(document);

  if (!startViewTransition || prefersReducedMotion()) {
    apply();
    return;
  }

  const cx = origin?.x ?? window.innerWidth / 2;
  const cy = origin?.y ?? window.innerHeight * 0.12;

  let applied = false;
  const applyOnce = () => {
    if (applied) return;
    applied = true;
    apply();
  };

  let transition: { ready: Promise<void> };
  try {
    transition = startViewTransition(() => {
      applyOnce();
    });
  } catch {
    applyOnce();
    return;
  }

  transition.ready
    .then(() => {
      const maxRadius = Math.hypot(
        Math.max(cx, window.innerWidth - cx),
        Math.max(cy, window.innerHeight - cy),
      );
      const root = document.documentElement;
      const revealEasing = 'cubic-bezier(0.12, 0.88, 0.22, 1)';
      const fadeEasing = 'cubic-bezier(0.42, 0, 0.58, 1)';

      // Entrante: círculo que florece con pasos intermedios para un reveal más gradual.
      root.animate(
        {
          clipPath: [
            `circle(0px at ${cx}px ${cy}px)`,
            `circle(${maxRadius * 0.12}px at ${cx}px ${cy}px)`,
            `circle(${maxRadius * 0.48}px at ${cx}px ${cy}px)`,
            `circle(${maxRadius}px at ${cx}px ${cy}px)`,
          ],
          opacity: [0.22, 0.48, 0.78, 1],
          filter: [
            'saturate(1.38) brightness(1.09)',
            'saturate(1.22) brightness(1.05)',
            'saturate(1.08) brightness(1.02)',
            'saturate(1) brightness(1)',
          ],
        },
        {
          duration: VISUAL_MODE_TRANSITION_MS,
          easing: revealEasing,
          pseudoElement: '::view-transition-new(root)',
        },
      );

      // Saliente: se desvanece y se desenfoca por debajo (mezcla, no corte).
      root.animate(
        {
          opacity: [1, 0.88, 0.52, 0],
          filter: ['blur(0px)', 'blur(2px)', 'blur(5px)', 'blur(8px)'],
          transform: ['scale(1)', 'scale(1.012)', 'scale(1.024)', 'scale(1.034)'],
        },
        {
          duration: Math.round(VISUAL_MODE_TRANSITION_MS * 0.92),
          easing: fadeEasing,
          pseudoElement: '::view-transition-old(root)',
        },
      );

      spawnTransitionShimmer(cx, cy);
    })
    .catch(() => {});
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
