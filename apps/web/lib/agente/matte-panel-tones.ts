/** Matte panel tones — yellow, blue, red + muted variants (welcome gradient cards). */
export const MATTE_PANEL_TONE_POOL = [
  '#b89346',
  '#38516f',
  '#742c2c',
  '#8a6f38',
  '#4d6278',
  '#521e1e',
] as const;

export const STREAM_PHASE_ORDER = ['classify', 'execute', 'format', 'validate', 'knowledge'] as const;

export const ONBOARDING_STEP_MATTE_COLORS = [
  '#b89346',
  '#38516f',
  '#742c2c',
] as const;

/** Shell backdrop only — inner elements stay opaque. */
export const MATTE_STATUS_SHELL_BG = 'rgba(10, 16, 26, 0.2)';

export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const arr = [...items];
  let state = Math.abs(seed) || 1;
  for (let i = arr.length - 1; i > 0; i -= 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    const j = state % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function buildStreamStepColors(startedAt: number, stepCount: number): string[] {
  const shuffled = seededShuffle(MATTE_PANEL_TONE_POOL, startedAt);
  return shuffled.slice(0, stepCount);
}

function streamPhaseIndex(phase?: string): number {
  if (!phase) return 0;
  const idx = STREAM_PHASE_ORDER.indexOf(phase as (typeof STREAM_PHASE_ORDER)[number]);
  return idx >= 0 ? idx : 0;
}

export function getStreamRailAccentColor(state: {
  phase?: string;
  startedAt: number;
}): string {
  const activeIndex = streamPhaseIndex(state.phase);
  const stepColors = buildStreamStepColors(state.startedAt, STREAM_PHASE_ORDER.length);
  return stepColors[activeIndex] ?? stepColors[0] ?? MATTE_PANEL_TONE_POOL[0];
}

export function getStreamRailStepColors(startedAt: number): string[] {
  return buildStreamStepColors(startedAt, STREAM_PHASE_ORDER.length);
}
