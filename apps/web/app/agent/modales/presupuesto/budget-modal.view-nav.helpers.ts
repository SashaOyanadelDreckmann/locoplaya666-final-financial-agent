import type { BudgetViewMode } from './use-budget-modal-layout';

export function getBudgetViewModes(isDesktopLayout: boolean): BudgetViewMode[] {
  return isDesktopLayout ? [1, 2, 3] : [1, 2];
}

export function getBudgetViewModeLabel(isDesktopLayout: boolean, mode: BudgetViewMode): string {
  if (isDesktopLayout) {
    if (mode === 1) return 'asistente';
    if (mode === 2) return 'asistente + tabla';
    return 'tabla';
  }
  return mode === 1 ? 'asistente' : 'tabla';
}

export function canStepBudgetViewMode(
  current: BudgetViewMode,
  direction: 'prev' | 'next',
  isDesktopLayout: boolean,
): boolean {
  const modes = getBudgetViewModes(isDesktopLayout);
  const index = modes.indexOf(current);
  if (index < 0) return false;
  if (direction === 'prev') return index > 0;
  return index < modes.length - 1;
}

export function stepBudgetViewMode(
  current: BudgetViewMode,
  direction: 'prev' | 'next',
  isDesktopLayout: boolean,
): BudgetViewMode | null {
  const modes = getBudgetViewModes(isDesktopLayout);
  const index = modes.indexOf(current);
  if (index < 0) return null;
  if (direction === 'prev') {
    return index > 0 ? modes[index - 1] : null;
  }
  return index < modes.length - 1 ? modes[index + 1] : null;
}
