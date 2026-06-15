/** @jest-environment node */

import {
  resolveBudgetAssistantHeroToneClass,
  resolveBudgetAssistantRowTone,
} from '../modales/presupuesto/budget-modal.assistant-tone';

describe('budget modal assistant tone', () => {
  it('maps row type to matte hero tone classes', () => {
    expect(resolveBudgetAssistantRowTone('income')).toBe('income');
    expect(resolveBudgetAssistantRowTone('expense')).toBe('expense');
    expect(resolveBudgetAssistantRowTone(undefined)).toBe('neutral');
    expect(resolveBudgetAssistantHeroToneClass('income')).toBe('is-budget-assistant-income');
    expect(resolveBudgetAssistantHeroToneClass('expense')).toBe('is-budget-assistant-expense');
    expect(resolveBudgetAssistantHeroToneClass(undefined)).toBe('is-budget-assistant-neutral');
  });
});
