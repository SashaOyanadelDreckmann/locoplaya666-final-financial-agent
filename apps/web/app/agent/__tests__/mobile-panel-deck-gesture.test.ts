import {
  computeSnapDuration,
  DECK_GESTURE,
  dragPhaseFromPointer,
  resolveSwipeTarget,
} from '../mobile-panel-deck-gesture';

describe('mobile-panel-deck-gesture', () => {
  const step = 100;

  it('maps drag distance 1:1 to deck phase', () => {
    expect(dragPhaseFromPointer(0, 100, step)).toBe(-1);
    expect(dragPhaseFromPointer(2, -400, step)).toBe(6);
  });

  it('snaps to the nearest card after a multi-card drag', () => {
    const target = resolveSwipeTarget(3.2, 0, -420, 0, step);
    expect(target).toBe(4);
  });

  it('projects fast flicks across several cards', () => {
    const target = resolveSwipeTarget(0, 0, -40, -1.2, step);
    expect(target).toBeGreaterThanOrEqual(2);
  });

  it('returns to start on tiny movement', () => {
    expect(resolveSwipeTarget(0.1, 0, 2, 0, step)).toBe(0);
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
