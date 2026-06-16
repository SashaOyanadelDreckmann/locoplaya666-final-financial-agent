import { describe, expect, it } from 'vitest';

import {
  buildFinancialEvidenceSnapshot,
  buildLoadedFinancialEvidenceBlock,
  resolveAgentBudgetRows,
} from './agent-financial-evidence.helpers';

describe('agent-financial-evidence.helpers', () => {
  it('prefers ui_state budget rows over persisted rows', () => {
    const rows = resolveAgentBudgetRows({
      uiState: {
        budget_rows: [{ id: 'expense_rent', category: 'Arriendo', type: 'expense', amount: 450000 }],
      },
      persistedBudgetContext: {
        rows: [{ id: 'expense_food', category: 'Comida', type: 'expense', amount: 120000 }],
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.category).toBe('Arriendo');
  });

  it('falls back to persisted budget rows when ui payload is slim', () => {
    const rows = resolveAgentBudgetRows({
      uiState: {},
      persistedBudgetContext: {
        rows: [{ id: 'income_salary', category: 'Sueldo', type: 'income', amount: 2100000 }],
      },
    });

    expect(rows[0]?.amount).toBe(2100000);
  });

  it('builds a block that forbids re-asking for loaded budget and transactions', () => {
    const budgetRows = [
      { id: 'income_salary', category: 'Sueldo', type: 'income', amount: 2100000 },
      { id: 'expense_rent', category: 'Arriendo', type: 'expense', amount: 550000 },
    ];
    const snapshot = buildFinancialEvidenceSnapshot({
      injectedBudget: { income: 2100000, expenses: 900000, balance: 1200000 },
      budgetRows,
      consolidatedContext: {
        transactions: {
          productsCount: 1,
          activeProductMovementCount: 24,
          activeProductLabel: 'Cuenta Vista',
          uploadedFiles: ['cartola-mayo.csv'],
        },
      },
      injectedProfile: { diagnosticNarrative: 'Perfil estable' },
      injectedIntake: { intake: { exactMonthlyIncome: 2100000 } },
      productPhase: 'diagnosis_ready',
      interviewCompleted: true,
    });

    const block = buildLoadedFinancialEvidenceBlock(snapshot, budgetRows);

    expect(block).toContain('Presupuesto: ingreso');
    expect(block).toContain('Productos/cartolas');
    expect(block).toContain('No declares presupuesto ni gastos reales como faltantes');
    expect(block).toContain('No declares cartolas ni movimientos como faltantes');
    expect(block).not.toContain('cartolas o movimientos del mes');
  });

  it('lists only genuine gaps when budget and transactions are missing', () => {
    const snapshot = buildFinancialEvidenceSnapshot({
      injectedBudget: { income: 0, expenses: 0, balance: 0 },
      budgetRows: [],
      consolidatedContext: {},
      injectedProfile: null,
      injectedIntake: null,
      productPhase: 'budget_needed',
      interviewCompleted: false,
    });

    const block = buildLoadedFinancialEvidenceBlock(snapshot, []);

    expect(block).toContain('presupuesto con montos');
    expect(block).toContain('cartolas o movimientos del mes');
    expect(block).toContain('meta de ahorro específica');
  });
});
