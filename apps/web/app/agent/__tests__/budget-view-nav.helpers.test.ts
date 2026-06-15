import {
  canStepBudgetViewMode,
  getBudgetViewModeLabel,
  getBudgetViewModes,
  stepBudgetViewMode,
} from '../modales/presupuesto/budget-modal.view-nav.helpers';

describe('budget view nav helpers', () => {
  it('exposes two mobile modes and three desktop modes', () => {
    expect(getBudgetViewModes(false)).toEqual([1, 2]);
    expect(getBudgetViewModes(true)).toEqual([1, 2, 3]);
  });

  it('steps without wrapping at the edges', () => {
    expect(stepBudgetViewMode(1, 'prev', false)).toBeNull();
    expect(stepBudgetViewMode(2, 'next', false)).toBeNull();
    expect(stepBudgetViewMode(1, 'next', false)).toBe(2);
    expect(stepBudgetViewMode(2, 'prev', false)).toBe(1);
    expect(stepBudgetViewMode(3, 'next', true)).toBeNull();
    expect(stepBudgetViewMode(2, 'next', true)).toBe(3);
  });

  it('labels desktop split mode distinctly', () => {
    expect(getBudgetViewModeLabel(true, 2)).toBe('asistente + tabla');
    expect(getBudgetViewModeLabel(false, 2)).toBe('tabla');
  });

  it('reports edge availability for arrows', () => {
    expect(canStepBudgetViewMode(1, 'prev', true)).toBe(false);
    expect(canStepBudgetViewMode(1, 'next', true)).toBe(true);
    expect(canStepBudgetViewMode(3, 'next', true)).toBe(false);
  });
});
