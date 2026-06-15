/** @jest-environment node */

import {
  inferBudgetAssistantToneFromText,
  resolveBudgetAssistantHeroTone,
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

  it('infers expense tone from debt and gasto language in assistant copy', () => {
    expect(
      inferBudgetAssistantToneFromText(
        'Las deudas con Fallabella, Bice y BCH están en 200 mil con recurrencia variable.',
      ),
    ).toBe('expense');
    expect(resolveBudgetAssistantHeroTone(undefined, 'registré tus gastos de arriendo')).toBe('expense');
    expect(resolveBudgetAssistantHeroToneClass(undefined, 'deuda con tarjeta Falabella')).toBe(
      'is-budget-assistant-expense',
    );
  });

  it('infers income tone from ingreso and sueldo language', () => {
    expect(inferBudgetAssistantToneFromText('Tu sueldo líquido quedó en 2 millones')).toBe('income');
    expect(resolveBudgetAssistantHeroToneClass(undefined, 'sumemos tus ingresos del mes')).toBe(
      'is-budget-assistant-income',
    );
  });

  it('prefers focused row type over inferred text tone', () => {
    expect(resolveBudgetAssistantHeroTone('income', 'deudas con Falabella')).toBe('income');
    expect(resolveBudgetAssistantHeroTone('expense', 'tu sueldo líquido')).toBe('expense');
  });

  it('stays neutral when copy references both ingreso and gasto equally', () => {
    expect(inferBudgetAssistantToneFromText('¿Es un gasto o un ingreso?')).toBe('neutral');
    expect(resolveBudgetAssistantHeroToneClass(undefined, 'gasto o ingreso mensual')).toBe(
      'is-budget-assistant-neutral',
    );
  });
});
