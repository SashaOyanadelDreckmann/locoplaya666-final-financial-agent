/** @jest-environment node */

import {
  buildBudgetAcknowledgmentReply,
  buildBudgetAssistantContext,
  buildBudgetRowSuggestions,
  buildCategoryClarificationReply,
  buildContextualQuestion,
  buildOffTopicBriefReply,
  getChatTurnFieldForRow,
  isBudgetRowCategoryConfirmed,
  isBudgetRowMovementTypeConfirmed,
  isBudgetEducationalQuestion,
  isBudgetOffTopicAnswer,
  pickContextualFocusRow,
  resolveBudgetAffirmativeAmount,
  resolveOffTopicBriefAnswer,
} from '@financial-agent/shared';

describe('budget-chat-context', () => {
  const rows = [
    { id: 'income_salary', category: 'Sueldo líquido', type: 'income' as const, amount: 0 },
    { id: 'expense_rent', category: 'Arriendo / vivienda', type: 'expense' as const, amount: 0 },
    { id: 'expense_food', category: 'Alimentación', type: 'expense' as const, amount: 0 },
  ];

  it('asks movement type (categoría) validation before name and amount for unfilled rows', () => {
    const context = buildBudgetAssistantContext({
      rows,
      products: [],
      chatAnswers: [],
    });

    const question = buildContextualQuestion(rows[0], context);
    expect(question).toMatch(/tipo de movimiento|categoría/i);
    expect(question).toMatch(/Ingreso principal/i);
    expect(question).not.toMatch(/950\.000/);
  });

  it('asks movement name after movement type is confirmed in chat history', () => {
    const movementTypeQuestion =
      'En la tabla, «Sueldo líquido» tiene categoría «Ingreso principal» (tipo de movimiento). ¿Confirmas o cuál corresponde?';
    const context = buildBudgetAssistantContext({
      rows,
      products: [],
      chatAnswers: [{ q: movementTypeQuestion, a: 'sí' }],
    });

    expect(getChatTurnFieldForRow(context, 'income_salary', 'movementType')).not.toBeNull();
    expect(isBudgetRowMovementTypeConfirmed(rows[0], context)).toBe(true);
    expect(isBudgetRowCategoryConfirmed(rows[0], context)).toBe(false);

    const question = buildContextualQuestion(rows[0], context);
    expect(question).toMatch(/llamar este movimiento/i);
    expect(question).not.toMatch(/950\.000/);
  });

  it('asks monthly amount after movement type and name are confirmed', () => {
    const movementTypeQuestion =
      'En la tabla, «Sueldo líquido» tiene categoría «Ingreso principal» (tipo de movimiento). ¿Confirmas o cuál corresponde?';
    const nameQuestion =
      '¿Cómo quieres llamar este movimiento? En la tabla aparece «Sueldo líquido» como ingreso.';
    const context = buildBudgetAssistantContext({
      rows,
      products: [
        {
          productId: 'income-acct',
          label: 'Cuenta sueldo',
          bank: 'BCI',
          productType: 'checking_account',
          movements: [{ description: 'Abono sueldo', amount: 950_000, direction: 'income', category: 'Sueldo' }],
        },
      ],
      chatAnswers: [
        { q: movementTypeQuestion, a: 'sí' },
        { q: nameQuestion, a: 'sí' },
      ],
    });

    expect(getChatTurnFieldForRow(context, 'income_salary', 'category')).not.toBeNull();
    expect(isBudgetRowCategoryConfirmed(rows[0], context)).toBe(true);

    const question = buildContextualQuestion(rows[0], context);
    expect(question).toMatch(/monto mensual/i);
    expect(question).toMatch(/950\.000/);
  });

  it('builds contextual income question from detected movement inflows', () => {
    const movementTypeQuestion =
      'En la tabla, «Sueldo líquido» tiene categoría «Ingreso principal» (tipo de movimiento). ¿Confirmas o cuál corresponde?';
    const nameQuestion =
      '¿Cómo quieres llamar este movimiento? En la tabla aparece «Sueldo líquido» como ingreso.';
    const context = buildBudgetAssistantContext({
      rows,
      products: [
        {
          productId: 'acct-1',
          label: 'Cuenta corriente',
          bank: 'Banco X',
          productType: 'checking_account',
          movements: [
            { description: 'Abono sueldo', amount: 980_000, direction: 'income', category: 'Sueldo' },
            { description: 'Supermercado Lider', amount: 180_000, direction: 'expense', category: 'Supermercado Lider' },
          ],
        },
      ],
      chatAnswers: [
        { q: movementTypeQuestion, a: 'confirmo' },
        { q: nameQuestion, a: 'confirmo' },
      ],
    });

    const question = buildContextualQuestion(rows[0], context);
    expect(question).toMatch(/980\.000/);
    expect(question).toMatch(/monto mensual/i);
  });

  it('prioritizes expense rows with stronger movement signals', () => {
    const context = buildBudgetAssistantContext({
      rows,
      products: [
        {
          productId: 'card-1',
          label: 'Tarjeta',
          bank: 'Banco X',
          productType: 'credit_card',
          movements: [
            { description: 'Jumbo', amount: 240_000, direction: 'expense', category: 'Supermercado Jumbo' },
            { description: 'Arriendo', amount: 120_000, direction: 'expense', category: 'Arriendo' },
          ],
        },
      ],
      chatAnswers: [],
    });

    const focus = pickContextualFocusRow(rows, context);
    expect(focus?.id).toBe('expense_food');
  });

  it('remembers prior chat answers when asking again', () => {
    const movementTypeQuestion =
      'En la tabla, «Arriendo / vivienda» tiene categoría «Vivienda» (tipo de movimiento). ¿Confirmas o cuál corresponde?';
    const nameQuestion =
      '¿Cómo quieres llamar este movimiento? En la tabla aparece «Arriendo / vivienda» como gasto.';
    const context = buildBudgetAssistantContext({
      rows,
      products: [],
      chatAnswers: [
        { q: movementTypeQuestion, a: 'sí' },
        { q: nameQuestion, a: 'sí' },
        { q: '¿Cuánto pagas al mes en vivienda o dividendo?', a: '550 mil' },
      ],
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

  it('resolves affirmative confirmation from question amount before small movement hints', () => {
    const context = buildBudgetAssistantContext({
      rows,
      products: [
        {
          productId: 'demo',
          label: 'Cuenta demo',
          bank: 'Banco Demo',
          productType: 'checking_account',
          movements: [{ description: 'Cargo menor', amount: 1_000, direction: 'expense' }],
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

  it('falls back to movement inflows when affirmative answer has no explicit amount in question', () => {
    const context = buildBudgetAssistantContext({
      rows,
      products: [
        {
          productId: 'demo',
          label: 'Cuenta demo',
          bank: 'Banco Demo',
          productType: 'checking_account',
          movements: [{ description: 'Abono sueldo', amount: 1_450_000, direction: 'income', category: 'Sueldo' }],
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

  it('suggests adding unmapped movement categories as new rows', () => {
    const context = buildBudgetAssistantContext({
      rows,
      products: [
        {
          productId: 'card-1',
          label: 'Tarjeta',
          bank: 'Banco X',
          productType: 'credit_card',
          movements: [{ description: 'Colegio', amount: 210_000, direction: 'expense', category: 'Colegio San Patricio' }],
        },
      ],
      chatAnswers: [],
    });

    const suggestions = buildBudgetRowSuggestions(rows, context);
    expect(suggestions.some((item) => item.kind === 'add' && item.category.includes('Colegio'))).toBe(true);
  });

  it('treats only budget concepts as educational questions', () => {
    expect(isBudgetEducationalQuestion('que es un ingreso fijo y variable')).toBe(true);
    expect(isBudgetEducationalQuestion('que es la inflacion en chile')).toBe(false);
  });

  it('detects off-topic questions outside the budget domain', () => {
    expect(isBudgetOffTopicAnswer('cuantos satelites tiene la nasa en orbita?')).toBe(true);
    expect(isBudgetOffTopicAnswer('gasto 200 mil en comida')).toBe(false);
    expect(isBudgetOffTopicAnswer('900000')).toBe(false);
  });

  it('builds a brief off-topic answer and pivots back to the active row', () => {
    const context = buildBudgetAssistantContext({ rows, products: [], chatAnswers: [] });
    const brief = resolveOffTopicBriefAnswer('cuantos satelites tiene la nasa?');
    expect(brief).toMatch(/nasa|satelite/i);

    const packaged = buildOffTopicBriefReply({
      rows,
      focusRow: rows[0],
      context,
      briefAnswer: brief,
    });
    expect(packaged.reply).toMatch(/presupuesto/i);
    expect(packaged.followUp).toMatch(/\?/);
    expect(packaged.focusRowId).toBe('income_salary');
  });
});
