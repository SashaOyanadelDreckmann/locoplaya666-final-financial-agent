import {
  computeSnapDuration,
  DECK_GESTURE,
  dragPhaseFromPointer,
  resolveSwipeTarget,
} from '../mobile-panel-deck-gesture';

describe('mobile-panel-deck-gesture', () => {
  const step = 100;

  it('maps drag distance with hyper sensitivity', () => {
    expect(dragPhaseFromPointer(0, 100, step)).toBeCloseTo(-DECK_GESTURE.DRAG_SENSITIVITY, 5);
    expect(dragPhaseFromPointer(2, -400, step)).toBeCloseTo(2 + 4 * DECK_GESTURE.DRAG_SENSITIVITY, 5);
  });

  it('snaps to finger position after a multi-card drag', () => {
    const current = dragPhaseFromPointer(0, -430, step);
    const target = resolveSwipeTarget(current, 0, -430, 0, step);
    expect(target).toBe(Math.round(current));
  });

  it('projects fast flicks across several cards', () => {
    const target = resolveSwipeTarget(0, 0, -40, -1.2, step);
    expect(target).toBeGreaterThanOrEqual(3);
  });

  it('returns to start on tiny movement', () => {
    expect(resolveSwipeTarget(0.1, 0, 1, 0, step)).toBe(0);
  });

  it('scales settle duration with card distance', () => {
    const one = computeSnapDuration(0, 1);
    const four = computeSnapDuration(0, 4);
    expect(four).toBeGreaterThan(one);
    expect(four).toBeLessThanOrEqual(DECK_GESTURE.MAX_SNAP_DURATION_MS);
  });

  it('shortens duration for high-velocity flicks', () => {
    const slow = computeSnapDuration(0, 4, 0);
    const fast = computeSnapDuration(0, 4, -2.5);
    expect(fast).toBeLessThan(slow);
  });
});
