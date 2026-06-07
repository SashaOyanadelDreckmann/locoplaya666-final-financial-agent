import { describe, expect, it } from 'vitest';

import { buildBudgetAssistantContext } from '@financial-agent/shared';
import { validateWriterOutput } from './budget-chat-writer.service';

describe('budget-chat-writer.service', () => {
  const rows = [
    { id: 'income_salary', category: 'Sueldo líquido', type: 'income' as const, amount: 0 },
    { id: 'expense_food', category: 'Alimentación', type: 'expense' as const, amount: 0 },
  ];

  it('accepts polished copy when amounts stay within the brief', () => {
    const context = buildBudgetAssistantContext({
      rows,
      intakeData: { exactMonthlyIncome: 950000 },
      products: [],
      chatAnswers: [],
    });
    const validated = validateWriterOutput(
      {
        turn: 'init',
        deterministicReply: 'Según tu perfil, tu ingreso principal ronda $950.000. ¿Lo dejamos así?',
        deterministicQuestion: '¿Cuánto es tu ingreso principal mensual?',
        focusRow: rows[0],
        context,
      },
      {
        reply: 'Vi en tu perfil cerca de $950.000 de ingreso principal.',
        question: '¿Te acomoda dejarlo así en la tabla?',
      },
    );

    expect(validated?.reply).toMatch(/950/);
    expect(validated?.question).toContain('?');
  });

  it('rejects polished copy that introduces unknown amounts', () => {
    const context = buildBudgetAssistantContext({
      rows,
      intakeData: { exactMonthlyIncome: 950000 },
      products: [],
      chatAnswers: [],
    });
    const validated = validateWriterOutput(
      {
        turn: 'init',
        deterministicReply: 'Según tu perfil, tu ingreso principal ronda $950.000.',
        deterministicQuestion: '¿Cuánto es tu ingreso principal mensual?',
        focusRow: rows[0],
        context,
      },
      {
        reply: 'Perfecto, dejemos $2.500.000.',
        question: '¿Te hace sentido?',
      },
    );

    expect(validated).toBeNull();
  });
});
