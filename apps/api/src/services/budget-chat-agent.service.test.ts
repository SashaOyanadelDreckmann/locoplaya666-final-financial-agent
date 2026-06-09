import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildBudgetAssistantContext } from '@financial-agent/shared';
import { runBudgetChatAgent } from './budget-chat-agent.service';

const completeStructuredWithSchema = vi.fn();

vi.mock('./llm.service', () => ({
  completeStructuredWithSchema: (...args: unknown[]) => completeStructuredWithSchema(...args),
}));

describe('budget-chat-agent.service', () => {
  const rows = [
    { id: 'income_salary', category: 'Sueldo líquido', type: 'income' as const, amount: 900000 },
    { id: 'expense_food', category: 'Alimentación', type: 'expense' as const, amount: 0 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'development';
    process.env.OPENAI_API_KEY = 'sk-live-test';
    process.env.BUDGET_CHAT_AGENT_ENABLED = 'true';
  });

  it('maps bulk add instructions into validated actions', async () => {
    completeStructuredWithSchema.mockResolvedValueOnce({
      assistant_reply: 'Creo las filas que pediste.',
      next_question: '¿Les asigno montos ahora?',
      focus_row_id: 'expense-custom-gym',
      requires_confirmation: true,
      pending_summary: 'Agregar 3 gastos: gym, streaming y mascotas.',
      actions: [
        { kind: 'add', id: 'expense-custom-gym', category: 'Gym', type: 'expense' },
        { kind: 'add', id: 'expense-custom-streaming', category: 'Streaming', type: 'expense' },
        { kind: 'add', id: 'expense-custom-pets', category: 'Mascotas', type: 'expense' },
      ],
    });

    const context = buildBudgetAssistantContext({ rows, intakeData: {}, products: [], chatAnswers: [] });
    const result = await runBudgetChatAgent({
      rows,
      context,
      userAnswer: 'agrega gym, streaming y mascotas como gastos',
      currentQuestion: '¿Qué más quieres hacer con la tabla?',
      focusRow: null,
      chatAnswers: [],
      mode: 'reply',
    });

    expect(result.source).toBe('budget_agent');
    expect(result.requires_confirmation).toBe(true);
    expect(result.actions).toHaveLength(3);
    expect(result.actions[0]?.category).toBe('Gym');
  });

  it('applies explicit single-row update without confirmation', async () => {
    completeStructuredWithSchema.mockResolvedValueOnce({
      assistant_reply: 'Actualizo alimentación.',
      next_question: '¿Qué más quieres hacer con la tabla?',
      focus_row_id: 'expense_food',
      requires_confirmation: false,
      pending_summary: null,
      actions: [{ kind: 'update', id: 'expense_food', category: 'Alimentación', type: 'expense', amount: 180000 }],
    });

    const context = buildBudgetAssistantContext({ rows, intakeData: {}, products: [], chatAnswers: [] });
    const result = await runBudgetChatAgent({
      rows,
      context,
      userAnswer: 'en comida gasto 180 mil',
      currentQuestion: '¿Qué más quieres hacer con la tabla?',
      focusRow: rows[1],
      chatAnswers: [],
      mode: 'reply',
    });

    expect(result.requires_confirmation).toBe(false);
    expect(result.actions[0]?.amount).toBe(180000);
  });
});
