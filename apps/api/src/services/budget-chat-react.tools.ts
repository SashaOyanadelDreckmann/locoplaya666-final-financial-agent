import type { BudgetAssistantContext, BudgetRow } from '@financial-agent/shared';
import {
  buildBudgetTableSnapshot,
  computeBudgetCompletion,
  computeBudgetInsights,
  computeBudgetTotals,
  type BudgetTableAction,
} from '@financial-agent/shared';
import { runMCPTool } from '../mcp/tools/runMCPTool';

export type BudgetReactCompleteTurn = {
  assistant_reply?: string;
  next_question?: string;
  focus_row_id?: string | null;
  actions?: BudgetTableAction[];
  requires_confirmation?: boolean;
  pending_summary?: string | null;
};

export type BudgetReactToolName =
  | 'budget.table_snapshot'
  | 'budget.analyze_health'
  | 'finance.budget_analyzer'
  | 'budget.complete_turn';

export const BUDGET_REACT_OPENAI_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'budget__table_snapshot',
      description: 'Lee el estado actual de la tabla de presupuesto (filas y totales).',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'budget__analyze_health',
      description:
        'Calcula salud del presupuesto localmente: ingresos, gastos, balance, completion y health score.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'finance__budget_analyzer',
      description:
        'Análisis 50/30/20, score de salud, fondo de emergencia y recomendaciones (MCP). Usar cuando el usuario pide diagnóstico o consejo analítico.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'budget__complete_turn',
      description:
        'Cierra el turno con la respuesta al usuario y las mutaciones de tabla (actions). Obligatorio para terminar.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          assistant_reply: { type: 'string' },
          next_question: { type: 'string' },
          focus_row_id: { type: ['string', 'null'] },
          requires_confirmation: { type: 'boolean' },
          pending_summary: { type: ['string', 'null'] },
          actions: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                kind: { type: 'string', enum: ['add', 'update', 'delete'] },
                id: { type: 'string' },
                category: { type: 'string' },
                type: { type: 'string', enum: ['income', 'expense'] },
                amount: { type: 'number' },
                cadence: { type: 'string', enum: ['fixed', 'variable'] },
                payment_method: {
                  type: 'string',
                  enum: ['transfer', 'debit', 'credit', 'cash', 'prepaid', 'other'],
                },
                movement_type: { type: 'string' },
              },
              required: ['kind', 'id'],
            },
          },
        },
        required: [
          'assistant_reply',
          'next_question',
          'focus_row_id',
          'actions',
          'requires_confirmation',
          'pending_summary',
        ],
      },
    },
  },
];

export function budgetReactToolFromSanitized(name: string): BudgetReactToolName | null {
  switch (name) {
    case 'budget__table_snapshot':
      return 'budget.table_snapshot';
    case 'budget__analyze_health':
      return 'budget.analyze_health';
    case 'finance__budget_analyzer':
      return 'finance.budget_analyzer';
    case 'budget__complete_turn':
      return 'budget.complete_turn';
    default:
      return null;
  }
}

function buildMcpExpenses(rows: BudgetRow[]) {
  return rows
    .filter((row) => row.type === 'expense' && Number(row.amount ?? 0) > 0)
    .map((row) => ({
      category: row.category,
      amount: Math.round(Number(row.amount)),
      type:
        row.movementType === 'debt'
          ? ('debt' as const)
          : row.movementType === 'savings_investment'
            ? ('savings' as const)
            : row.cadence === 'fixed'
              ? ('needs' as const)
              : ('wants' as const),
    }));
}

export async function executeBudgetReactTool(params: {
  tool: BudgetReactToolName;
  rows: BudgetRow[];
  context: BudgetAssistantContext;
  userId: string;
  turnId: string;
}): Promise<{ ok: boolean; data: unknown; error?: string }> {
  const { tool, rows, context } = params;
  const totals = computeBudgetTotals(rows);

  if (tool === 'budget.table_snapshot') {
    return {
      ok: true,
      data: {
        rows: buildBudgetTableSnapshot(rows),
        totals,
        filled_rows: computeBudgetCompletion(rows).filledRows,
      },
    };
  }

  if (tool === 'budget.analyze_health') {
    const insights = computeBudgetInsights(rows, totals);
    const completion = computeBudgetCompletion(rows);
    return {
      ok: true,
      data: {
        totals,
        health_score: insights.healthScore,
        completion,
        signals: insights,
        products_count: context.products.length,
        movement_inflows: context.totalInflows,
        movement_outflows: context.totalOutflows,
      },
    };
  }

  if (tool === 'finance.budget_analyzer') {
    const rawIncome = Math.round(Number(totals.income) || 0);
    if (rawIncome <= 0) {
      return {
        ok: false,
        error: 'no_income_rows',
        data: { message: 'No hay ingresos en la tabla para analizar con MCP.' },
      };
    }
    const monthlyIncome = Math.max(1, rawIncome);
    const expenses = buildMcpExpenses(rows);
    const debtPayments = expenses
      .filter((row) => row.type === 'debt')
      .reduce((sum, row) => sum + row.amount, 0);

    const result = await runMCPTool({
      tool: 'finance.budget_analyzer',
      args: {
        monthlyIncome,
        expenses: expenses.length > 0 ? expenses : undefined,
        totalDebtPayments: debtPayments > 0 ? debtPayments : undefined,
      },
      turn_id: params.turnId,
      user_id: params.userId,
    });

    const success = result.tool_call?.status !== 'error';
    return {
      ok: success,
      data: result.data ?? null,
      error: success ? undefined : String(result.tool_call?.error_message ?? 'mcp_error'),
    };
  }

  return { ok: false, error: 'unknown_tool', data: null };
}
