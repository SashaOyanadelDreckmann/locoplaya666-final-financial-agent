import { z } from 'zod';
import {
  buildTransactionChartBlocks,
  type TransactionChartVariant,
} from '@financial-agent/shared';
import type { MCPTool } from '../types';

const MovementInputSchema = z.object({
  label: z.string().optional(),
  merchant: z.string().optional(),
  amount: z.number().positive(),
  direction: z.enum(['income', 'expense']),
  date: z.string().optional(),
  category: z.string().optional(),
});

export const transactionsChartsTool: MCPTool = {
  name: 'finance.transactions_charts',
  description:
    'Genera gráficos de transacciones (evolución acumulada de ingresos/egresos, flujo financiero y categorías) a partir de movimientos fechados del usuario. Úsalo cuando debas mostrar, validar o recordar patrones de gasto/ingreso con evidencia visual.',
  argsSchema: z.object({
    variants: z
      .array(z.enum(['cumulative_cashflow', 'flow_bar', 'category_bar']))
      .min(1)
      .max(3)
      .default(['cumulative_cashflow', 'flow_bar']),
    movements: z.array(MovementInputSchema).min(1).max(250),
    inflowLabel: z.string().optional(),
    currency: z.string().default('CLP'),
  }),
  run: async (args) => {
    const agent_blocks = buildTransactionChartBlocks({
      movements: args.movements,
      variants: args.variants as TransactionChartVariant[],
      inflowLabel: args.inflowLabel,
      currency: args.currency,
    });

    return {
      tool_call: {
        tool: 'finance.transactions_charts',
        args,
        status: 'success',
      },
      data: {
        agent_blocks,
        charts_built: agent_blocks.length,
        variants_requested: args.variants,
      },
    };
  },
};
