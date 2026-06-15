/** @jest-environment node */

import {
  computeBudgetMobileRowDeckTransforms,
  resolveBudgetMobileRowDeckPeekDirection,
} from '../modales/presupuesto/budget-modal.mobile-row-deck';

describe('budget modal mobile row deck', () => {
  it('resolves peek direction from horizontal drag and available steps', () => {
    expect(resolveBudgetMobileRowDeckPeekDirection(-24, true, true)).toBe('next');
    expect(resolveBudgetMobileRowDeckPeekDirection(24, true, true)).toBe('prev');
    expect(resolveBudgetMobileRowDeckPeekDirection(-24, false, true)).toBeNull();
    expect(resolveBudgetMobileRowDeckPeekDirection(24, true, false)).toBeNull();
  });

  it('reveals the next card behind with subtle parallax while swiping left', () => {
    const transforms = computeBudgetMobileRowDeckTransforms({
      deltaX: -80,
      hostWidth: 360,
      peekDirection: 'next',
    });

    expect(transforms.activeX).toBe(-80);
    expect(transforms.activeScale).toBeLessThan(1);
    expect(transforms.peekX).toBeGreaterThan(-40);
    expect(transforms.peekX).toBeLessThan(20);
    expect(transforms.peekOpacity).toBeGreaterThan(0.8);
    expect(transforms.peekScale).toBeGreaterThan(0.96);
    expect(transforms.peekScale).toBeLessThanOrEqual(1);
  });

  it('reveals the previous card behind while swiping right', () => {
    const transforms = computeBudgetMobileRowDeckTransforms({
      deltaX: 80,
      hostWidth: 360,
      peekDirection: 'prev',
    });

    expect(transforms.activeX).toBe(80);
    expect(transforms.peekX).toBeLessThan(40);
    expect(transforms.peekX).toBeGreaterThan(-20);
    expect(transforms.peekOpacity).toBeGreaterThan(0.8);
  });
});
