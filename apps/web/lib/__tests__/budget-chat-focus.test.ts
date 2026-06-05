/** @jest-environment node */

import {
  extractInferenceQuestionText,
  inferBudgetFocusRowId,
  resolveBudgetChatTargetRow,
} from '@financial-agent/shared';

describe('budget-chat-focus helpers', () => {
  const rows = [
    { id: 'income_salary', category: 'Sueldo líquido', type: 'income' as const, amount: 0 },
    { id: 'expense_debt', category: 'Deuda / cuotas', type: 'expense' as const, amount: 0 },
    { id: 'expense_rent', category: 'Arriendo / vivienda', type: 'expense' as const, amount: 0 },
  ];

  it('extracts the last explicit question from combined assistant replies', () => {
    const combined =
      'Listo: Sueldo líquido quedó en $850.000. ¿Cuánto pagas al mes en cuotas o créditos?';
    expect(extractInferenceQuestionText(combined)).toBe('¿Cuánto pagas al mes en cuotas o créditos?');
    expect(inferBudgetFocusRowId(combined)).toBe('expense_debt');
  });

  it('prioritizes assistant focus over stale confirmation text', () => {
    const combined =
      'Listo: Sueldo líquido quedó en $850.000. ¿Cuánto pagas al mes en cuotas o créditos?';
    const target = resolveBudgetChatTargetRow(rows, combined, {
      assistantFocusRowId: 'expense_debt',
      activeRow: rows[0],
    });
    expect(target?.id).toBe('expense_debt');
  });

  it('infers debt from the question tail when focus id is missing', () => {
    const combined =
      'Listo: Sueldo líquido quedó en $850.000. ¿Cuánto pagas al mes en cuotas o créditos?';
    const target = resolveBudgetChatTargetRow(rows, combined, {
      activeRow: rows[0],
    });
    expect(target?.id).toBe('expense_debt');
  });
});
