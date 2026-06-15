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
      products: [
        {
          productId: 'acct-1',
          label: 'Cuenta sueldo',
          bank: 'Banco Test',
          productType: 'checking_account',
          movements: [{ description: 'Abono sueldo', amount: 950_000, direction: 'income', category: 'Sueldo' }],
        },
      ],
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
      products: [
        {
          productId: 'acct-1',
          label: 'Cuenta sueldo',
          bank: 'Banco Test',
          productType: 'checking_account',
          movements: [{ description: 'Abono sueldo', amount: 950_000, direction: 'income', category: 'Sueldo' }],
        },
      ],
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

  it('rejects polished copy that opens with generic affirmations', () => {
    const context = buildBudgetAssistantContext({
      rows,
      products: [],
      chatAnswers: [{ q: '¿Cuánto es tu ingreso?', a: '850 mil líquidos' }],
    });
    const validated = validateWriterOutput(
      {
        turn: 'confirmation',
        deterministicReply: 'Por “gano mil liquidos”, dejé $850.000 como ingreso principal.',
        deterministicQuestion: '¿Cuánto pagas al mes en vivienda?',
        focusRow: rows[0],
        context,
        userAnswer: '850 mil líquidos',
      },
      {
        reply: 'Perfecto, dejé tu sueldo en $850.000.',
        question: '¿Cuánto pagas en vivienda?',
      },
    );

    expect(validated).toBeNull();
  });
});
