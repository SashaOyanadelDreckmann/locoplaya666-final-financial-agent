/** @jest-environment node */

import {
  buildBudgetAcknowledgmentReply,
  buildBudgetAssistantContext,
  buildBudgetRowSuggestions,
  buildCategoryClarificationReply,
  buildContextualQuestion,
  pickContextualFocusRow,
  resolveBudgetAffirmativeAmount,
} from '@financial-agent/shared';

describe('budget-chat-context', () => {
  const rows = [
    { id: 'income_salary', category: 'Sueldo líquido', type: 'income' as const, amount: 0 },
    { id: 'expense_rent', category: 'Arriendo / vivienda', type: 'expense' as const, amount: 0 },
    { id: 'expense_food', category: 'Alimentación', type: 'expense' as const, amount: 0 },
  ];

  it('builds contextual income question from intake and transaction inflows', () => {
    const context = buildBudgetAssistantContext({
      rows,
      intakeData: { exactMonthlyIncome: 950000, hasDebt: true },
      products: [
        {
          label: 'Cuenta corriente',
          bank: 'Banco X',
          keyMetrics: { inflows_total: 980000, outflows_total: 620000 },
          topCategories: [{ name: 'Supermercado Lider', amount: 180000 }],
        },
      ],
      chatAnswers: [],
    });

    const question = buildContextualQuestion(rows[0], context);
    expect(question).toMatch(/950\.000|980\.000/);
    expect(question).toMatch(/ingreso principal/i);
  });

  it('prioritizes expense rows with stronger transaction signals', () => {
    const context = buildBudgetAssistantContext({
      rows,
      intakeData: {},
      products: [
        {
          label: 'Tarjeta',
          topCategories: [
            { name: 'Supermercado Jumbo', amount: 240000 },
            { name: 'Arriendo', amount: 120000 },
          ],
        },
      ],
      chatAnswers: [],
    });

    const focus = pickContextualFocusRow(rows, context);
    expect(focus?.id).toBe('expense_food');
  });

  it('remembers prior chat answers when asking again', () => {
    const context = buildBudgetAssistantContext({
      rows,
      intakeData: {},
      products: [],
      chatAnswers: [{ q: '¿Cuánto pagas al mes en vivienda o dividendo?', a: '550 mil' }],
    });

    const question = buildContextualQuestion(rows[1], context);
    expect(question).toMatch(/550\.000/i);
    expect(question).toMatch(/confirm/i);
  });

  it('builds conversational acknowledgments that mirror user phrasing', () => {
    const incomeReply = buildBudgetAcknowledgmentReply({
      userAnswer: 'gano 850 mil líquidos',
      row: rows[0],
      amount: 850000,
    });
    expect(incomeReply).toMatch(/850\.000/);
    expect(incomeReply).toMatch(/líquido|ingreso/i);
    expect(incomeReply).not.toMatch(/^perfecto/i);

    const foodClarify = buildCategoryClarificationReply({
      userAnswer: 'gasto harto en comida fuera',
      row: rows[2],
    });
    expect(foodClarify.reply).toMatch(/comida/i);
    expect(foodClarify.reply).not.toMatch(/^entendido|^perfecto|^claro/i);
    expect(foodClarify.followUp).toMatch(/\?/);
  });

  it('resolves affirmative confirmation from question amount before small transaction hints', () => {
    const context = buildBudgetAssistantContext({
      rows,
      intakeData: { exactMonthlyIncome: 1_450_000 },
      products: [
        {
          label: 'Cuenta demo',
          bank: 'Banco Demo',
          keyMetrics: { inflows_total: 1000, outflows_total: 0 },
        },
      ],
      chatAnswers: [],
    });

    const amount = resolveBudgetAffirmativeAmount({
      row: rows[0],
      context,
      question:
        'Tu ingreso principal es de $1.450.000 según lo que tenemos registrado. ¿Confirmas que ese es el monto?',
    });

    expect(amount).toBe(1_450_000);
  });

  it('falls back to intake income when affirmative answer has no explicit amount in question', () => {
    const context = buildBudgetAssistantContext({
      rows,
      intakeData: { exactMonthlyIncome: 1_450_000 },
      products: [
        {
          label: 'Cuenta demo',
          bank: 'Banco Demo',
          keyMetrics: { inflows_total: 1000, outflows_total: 0 },
        },
      ],
      chatAnswers: [],
    });

    const amount = resolveBudgetAffirmativeAmount({
      row: rows[0],
      context,
      question: '¿Confirmamos ese ingreso principal?',
    });

    expect(amount).toBe(1_450_000);
  });

  it('suggests adding unmapped transaction categories as new rows', () => {
    const context = buildBudgetAssistantContext({
      rows,
      intakeData: {},
      products: [
        {
          label: 'Tarjeta',
          topCategories: [{ name: 'Colegio San Patricio', amount: 210000 }],
        },
      ],
      chatAnswers: [],
    });

    const suggestions = buildBudgetRowSuggestions(rows, context);
    expect(suggestions.some((item) => item.kind === 'add' && item.category.includes('Colegio'))).toBe(true);
  });
});
