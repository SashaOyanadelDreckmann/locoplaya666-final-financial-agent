export type BudgetMobileRowDeckPeekDirection = 'next' | 'prev' | null;

export type BudgetMobileRowDeckTransforms = {
  activeX: number;
  activeScale: number;
  activeOpacity: number;
  peekX: number;
  peekScale: number;
  peekOpacity: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function resolveBudgetMobileRowDeckPeekDirection(
  deltaX: number,
  canStepNext: boolean,
  canStepPrev: boolean,
): BudgetMobileRowDeckPeekDirection {
  if (deltaX < -4 && canStepNext) return 'next';
  if (deltaX > 4 && canStepPrev) return 'prev';
  return null;
}

export function computeBudgetMobileRowDeckTransforms(params: {
  deltaX: number;
  hostWidth: number;
  peekDirection: BudgetMobileRowDeckPeekDirection;
}): BudgetMobileRowDeckTransforms {
  const { deltaX, hostWidth, peekDirection } = params;
  const width = Math.max(hostWidth, 1);
  const progress = clamp(Math.abs(deltaX) / (width * 0.38), 0, 1);
  const eased = 1 - (1 - progress) ** 2;

  if (!peekDirection) {
    return {
      activeX: deltaX,
      activeScale: 1,
      activeOpacity: 1,
      peekX: 0,
      peekScale: 1,
      peekOpacity: 0,
    };
  }

  const peekBaseScale = 0.968;
  const peekTargetScale = 1;
  const peekScale = peekBaseScale + (peekTargetScale - peekBaseScale) * eased;
  const peekOpacity = clamp(0.72 + eased * 0.28, 0, 1);
  const activeScale = 1 - eased * 0.018;
  const activeOpacity = 1 - eased * 0.06;
  const parallax = deltaX * 0.22;

  if (peekDirection === 'next') {
    const restOffset = width * 0.034 * (1 - eased);
    return {
      activeX: deltaX,
      activeScale,
      activeOpacity,
      peekX: restOffset + parallax,
      peekScale,
      peekOpacity,
    };
  }

  const restOffset = -width * 0.034 * (1 - eased);
  return {
    activeX: deltaX,
    activeScale,
    activeOpacity,
    peekX: restOffset + parallax,
    peekScale,
    peekOpacity,
  };
}
