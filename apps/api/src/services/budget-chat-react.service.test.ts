import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildBudgetAssistantContext } from '@financial-agent/shared';
import { runMCPTool } from '../mcp/tools/runMCPTool';
import { runBudgetChatAgent } from './budget-chat-agent.service';
import { isBudgetReactEnabled } from './budget-chat-react.service';
import { executeBudgetReactTool } from './budget-chat-react.tools';

const chatCompletionsCreate = vi.fn();
const completeStructuredWithSchema = vi.fn();

vi.mock('./llm.service', () => ({
  getOpenAIClient: () => ({
    chat: {
      completions: {
        create: (...args: unknown[]) => chatCompletionsCreate(...args),
      },
    },
  }),
  withCompatibleTemperature: (params: unknown) => params,
  completeStructuredWithSchema: (...args: unknown[]) => completeStructuredWithSchema(...args),
}));

vi.mock('../mcp/tools/runMCPTool', () => ({
  runMCPTool: vi.fn().mockResolvedValue({
    tool_call: { status: 'success' },
    data: { health_score: 72, rule_502030: { needs: 50, wants: 30, savings: 20 } },
  }),
}));

describe('budget-chat-react.service', () => {
  const rows = [
    { id: 'income_salary', category: 'Sueldo', type: 'income' as const, amount: 1_000_000 },
    { id: 'expense_food', category: 'Comida', type: 'expense' as const, amount: 200_000 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NODE_ENV = 'development';
    process.env.OPENAI_API_KEY = 'sk-live-test';
    process.env.BUDGET_CHAT_AGENT_ENABLED = 'true';
    process.env.BUDGET_CHAT_REACT_ENABLED = 'true';
    process.env.BUDGET_CHAT_REACT_MAX_ITERATIONS = '2';
  });

  it('runs a basic ReAct loop and completes via budget__complete_turn', async () => {
    chatCompletionsCreate
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'budget__analyze_health', arguments: '{}' },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_2',
                  type: 'function',
                  function: {
                    name: 'budget__complete_turn',
                    arguments: JSON.stringify({
                      assistant_reply: 'Tu margen se ve ajustado.',
                      next_question: '¿Ajustamos algún gasto fijo?',
                      focus_row_id: 'expense_food',
                      requires_confirmation: false,
                      pending_summary: null,
                      actions: [
                        {
                          kind: 'update',
                          id: 'expense_food',
                          category: 'Comida',
                          type: 'expense',
                          amount: 220000,
                        },
                      ],
                    }),
                  },
                },
              ],
            },
          },
        ],
      });

    const context = buildBudgetAssistantContext({ rows, intakeData: {}, products: [], chatAnswers: [] });
    const result = await runBudgetChatAgent({
      rows,
      context,
      userAnswer: '¿cómo voy con mi presupuesto?',
      currentQuestion: '¿Qué más quieres hacer con la tabla?',
      focusRow: null,
      chatAnswers: [],
      mode: 'reply',
      userId: 'user-test',
    });

    expect(result.source).toBe('budget_agent_react');
    expect(result.actions[0]?.amount).toBe(220000);
    expect(result.react_trace?.length).toBeGreaterThanOrEqual(2);
    expect(chatCompletionsCreate).toHaveBeenCalledTimes(2);
  });

  it('falls back to structured agent when ReAct loop returns null', async () => {
    chatCompletionsCreate.mockResolvedValue({
      choices: [{ message: { role: 'assistant', content: 'sin herramientas', tool_calls: [] } }],
    });
    completeStructuredWithSchema.mockResolvedValueOnce({
      assistant_reply: 'Fallback structured.',
      next_question: '¿Qué más quieres hacer con la tabla?',
      focus_row_id: 'expense_food',
      requires_confirmation: false,
      pending_summary: null,
      actions: [{ kind: 'update', id: 'expense_food', category: 'Comida', type: 'expense', amount: 210000 }],
    });

    const context = buildBudgetAssistantContext({ rows, intakeData: {}, products: [], chatAnswers: [] });
    const result = await runBudgetChatAgent({
      rows,
      context,
      userAnswer: 'ajusta comida',
      currentQuestion: '¿Qué más quieres hacer con la tabla?',
      focusRow: null,
      chatAnswers: [],
      mode: 'reply',
      userId: 'user-test',
    });

    expect(result.source).toBe('budget_agent');
    expect(result.actions[0]?.amount).toBe(210000);
    expect(result.react_trace).toBeUndefined();
    expect(completeStructuredWithSchema).toHaveBeenCalledTimes(1);
  });
});

describe('executeBudgetReactTool finance.budget_analyzer', () => {
  const expenseOnlyRows = [
    { id: 'expense_food', category: 'Comida', type: 'expense' as const, amount: 200_000 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns no_income_rows without calling MCP when totals.income <= 0', async () => {
    const context = buildBudgetAssistantContext({
      rows: expenseOnlyRows,
      intakeData: {},
      products: [],
      chatAnswers: [],
    });

    const result = await executeBudgetReactTool({
      tool: 'finance.budget_analyzer',
      rows: expenseOnlyRows,
      context,
      userId: 'user-test',
      turnId: 'turn-no-income',
    });

    expect(result.ok).toBe(false);
    expect(result.error).toBe('no_income_rows');
    expect(result.data).toEqual({ message: 'No hay ingresos en la tabla para analizar con MCP.' });
    expect(runMCPTool).not.toHaveBeenCalled();
  });

  it('calls MCP with real income when income rows exist', async () => {
    const incomeRows = [
      { id: 'income_salary', category: 'Sueldo', type: 'income' as const, amount: 1_000_000 },
      { id: 'expense_food', category: 'Comida', type: 'expense' as const, amount: 200_000 },
    ];
    const context = buildBudgetAssistantContext({
      rows: incomeRows,
      intakeData: {},
      products: [],
      chatAnswers: [],
    });

    const result = await executeBudgetReactTool({
      tool: 'finance.budget_analyzer',
      rows: incomeRows,
      context,
      userId: 'user-test',
      turnId: 'turn-with-income',
    });

    expect(result.ok).toBe(true);
    expect(runMCPTool).toHaveBeenCalledWith(
      expect.objectContaining({
        tool: 'finance.budget_analyzer',
        args: expect.objectContaining({ monthlyIncome: 1_000_000 }),
      }),
    );
  });
});

describe('isBudgetReactEnabled', () => {
  it('returns false when BUDGET_CHAT_REACT_ENABLED=false', () => {
    process.env.NODE_ENV = 'development';
    process.env.BUDGET_CHAT_AGENT_ENABLED = 'true';
    process.env.BUDGET_CHAT_REACT_ENABLED = 'false';
    expect(isBudgetReactEnabled()).toBe(false);
  });

  it('returns false in test env unless BUDGET_CHAT_REACT_ENABLED=true', () => {
    process.env.NODE_ENV = 'test';
    process.env.BUDGET_CHAT_AGENT_ENABLED = 'true';
    delete process.env.BUDGET_CHAT_REACT_ENABLED;
    expect(isBudgetReactEnabled()).toBe(false);
  });

  it('returns true in test env when BUDGET_CHAT_REACT_ENABLED=true', () => {
    process.env.NODE_ENV = 'test';
    process.env.BUDGET_CHAT_AGENT_ENABLED = 'true';
    process.env.BUDGET_CHAT_REACT_ENABLED = 'true';
    expect(isBudgetReactEnabled()).toBe(true);
  });
});
