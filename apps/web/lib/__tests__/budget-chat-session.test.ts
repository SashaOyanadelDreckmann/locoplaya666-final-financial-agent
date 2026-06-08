import {
  buildPendingConfirmation,
  isBudgetConfirmationAnswer,
  isBudgetRejectionAnswer,
} from '@financial-agent/shared';

describe('budget-chat-session', () => {
  it('builds pending confirmation payloads from validated actions', () => {
    const pending = buildPendingConfirmation(
      [{ kind: 'update', id: 'expense_rent', category: 'Arriendo / vivienda', amount: 420000 }],
      [{ id: 'expense_rent', category: 'Arriendo / vivienda', type: 'expense', amount: 0 }],
    );
    expect(pending?.summary).toMatch(/Actualizar|Arriendo/i);
    expect(pending?.summary).not.toContain('expense_rent');
    expect(pending?.actions).toHaveLength(1);
  });

  it('detects short affirmative and negative confirmation answers', () => {
    expect(isBudgetConfirmationAnswer('sí')).toBe(true);
    expect(isBudgetConfirmationAnswer('dale')).toBe(true);
    expect(isBudgetRejectionAnswer('no')).toBe(true);
    expect(isBudgetRejectionAnswer('mejor no')).toBe(true);
    expect(isBudgetConfirmationAnswer('420000')).toBe(false);
  });
});
