export const DECK_GESTURE = {
  SWIPE_COMMIT_PX: 4,
  SWIPE_COMMIT_RATIO: 0.045,
  SWIPE_VELOCITY_COMMIT: 0.14,
  FLICK_PROJECTION_MS: 340,
  DRAG_SENSITIVITY: 1.62,
  SNAP_DURATION_MS: 180,
  MIN_TWEEN_MS: 70,
  MAX_SNAP_DURATION_MS: 520,
  MS_PER_CARD_STEP: 46,
} as const;

export function dragPhaseFromPointer(startPhase: number, dx: number, step: number) {
  if (step <= 0) return startPhase;
  return startPhase - (dx / step) * DECK_GESTURE.DRAG_SENSITIVITY;
}

export function computeSnapDuration(from: number, to: number, velocity = 0) {
  const steps = Math.abs(to - from);
  if (steps < 0.05) return DECK_GESTURE.SNAP_DURATION_MS;
  const base = DECK_GESTURE.SNAP_DURATION_MS + steps * DECK_GESTURE.MS_PER_CARD_STEP;
  const velocityBoost = Math.min(base * 0.62, Math.abs(velocity) * 130);
  return Math.max(
    DECK_GESTURE.MIN_TWEEN_MS,
    Math.min(DECK_GESTURE.MAX_SNAP_DURATION_MS, base - velocityBoost)
  );
}

export function resolveSwipeTarget(
  current: number,
  startPhase: number,
  dx: number,
  velocity: number,
  step: number
) {
  const moved = Math.abs(dx);
  const ratioMoved = step > 0 ? moved / step : 0;
  const dragPhase = dragPhaseFromPointer(startPhase, dx, step);
  const flickCards =
    step > 0
      ? (-velocity / step) * DECK_GESTURE.DRAG_SENSITIVITY * DECK_GESTURE.FLICK_PROJECTION_MS
      : 0;

  if (Math.abs(velocity) >= DECK_GESTURE.SWIPE_VELOCITY_COMMIT) {
    return Math.round(current + flickCards);
  }

  if (moved >= DECK_GESTURE.SWIPE_COMMIT_PX || ratioMoved >= DECK_GESTURE.SWIPE_COMMIT_RATIO) {
    return Math.round(dragPhase);
  }

  return Math.round(startPhase);
}
