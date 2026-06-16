/**
 * finance.budget_table_actions
 *
 * Valida y propone mutaciones de la tabla de presupuesto (add/update/delete).
 * Compartida entre Core Agent y Asistente de Presupuesto.
 */

import { z } from 'zod';
import {
  buildBudgetTablePatch,
  previewBudgetRowsAfterActions,
  toBudgetTableSnapshotInput,
  type BudgetTablePatch,
} from '@financial-agent/shared';
import type { MCPTool, ToolContext } from '../types';
import { checkRateLimit } from '../rate-limiter';
import { validateArrayLength } from '../input-sanitizer';
import { createMetricsCollector, recordToolMetrics } from '../telemetry';
import { wrapError } from '../error';

const BudgetSnapshotRow = z.object({
  id: z.string().min(1),
  category: z.string().optional(),
  type: z.enum(['income', 'expense']),
  amount: z.number().min(0).optional(),
  cadence: z.enum(['fixed', 'variable']).optional(),
  paymentMethod: z.string().optional(),
  movementType: z.string().optional(),
  note: z.string().optional(),
});

const BudgetAction = z.object({
  kind: z.enum(['add', 'update', 'delete']),
  id: z.string().min(1),
  category: z.string().optional(),
  type: z.enum(['income', 'expense']).optional(),
  amount: z.number().optional(),
  cadence: z.enum(['fixed', 'variable']).optional(),
  payment_method: z
    .enum(['transfer', 'debit', 'credit', 'cash', 'prepaid', 'other'])
    .optional(),
  movement_type: z.string().optional(),
});

export const budgetTableActionsTool: MCPTool = {
  name: 'finance.budget_table_actions',
  description:
    'Propone y valida cambios en la tabla de presupuesto del usuario (agregar, actualizar o eliminar filas). ' +
    'Pasa el snapshot actual de filas (ui_state.budget_rows con id) y las acciones propuestas. ' +
    'Devuelve acciones validadas, si requiere confirmación del usuario y un resumen legible. ' +
    'Usar cuando el usuario da montos concretos o pide editar el presupuesto.',
  argsSchema: z.object({
    rows: z.array(BudgetSnapshotRow).max(30),
    proposed_actions: z.array(BudgetAction).max(30),
    model_requires_confirmation: z.boolean().optional(),
    include_preview: z.boolean().optional(),
  }),
  run: async (args, ctx?: ToolContext) => {
    const metrics = createMetricsCollector('finance.budget_table_actions');

    try {
      await checkRateLimit('finance.budget_table_actions', ctx);
      validateArrayLength(args.rows ?? [], 0, 30, 'rows', 'finance.budget_table_actions');
      validateArrayLength(
        args.proposed_actions ?? [],
        0,
        30,
        'proposed_actions',
        'finance.budget_table_actions',
      );

      const rows = (args.rows ?? []).map((row: z.infer<typeof BudgetSnapshotRow>) => ({
        id: row.id,
        category: row.category?.trim() || (row.type === 'income' ? 'Ingreso' : 'Gasto'),
        type: row.type,
        amount: Math.max(0, Math.round(Number(row.amount ?? 0))),
        cadence: row.cadence,
        paymentMethod: row.paymentMethod as
          | 'transfer'
          | 'debit'
          | 'credit'
          | 'cash'
          | 'prepaid'
          | 'other'
          | undefined,
        movementType: row.movementType as
          | 'income_main'
          | 'income_extra'
          | 'housing'
          | 'home_services'
          | 'food'
          | 'transport'
          | 'health'
          | 'education'
          | 'debt'
          | 'savings_investment'
          | 'taxes_fees'
          | 'leisure_other'
          | undefined,
        note: row.note,
      }));

      const patch: BudgetTablePatch = buildBudgetTablePatch(
        rows,
        args.proposed_actions ?? [],
        { modelRequiresConfirmation: Boolean(args.model_requires_confirmation) },
      );

      const validatedForPreview =
        patch.pending_confirmation?.actions ?? patch.actions;
      const preview =
        args.include_preview === true && validatedForPreview.length > 0
          ? toBudgetTableSnapshotInput(previewBudgetRowsAfterActions(rows, validatedForPreview))
          : undefined;

      const toolMetrics = metrics.recordSuccess(ctx);
      recordToolMetrics(toolMetrics);

      return {
        tool_call: {
          tool: 'finance.budget_table_actions',
          args,
          status: 'success',
          result: {
            actions_count: validatedForPreview.length,
            requires_confirmation: patch.requires_confirmation,
            summary: patch.summary,
          },
        },
        data: {
          patch,
          validated_actions: validatedForPreview,
          requires_confirmation: patch.requires_confirmation,
          summary: patch.summary,
          preview_rows: preview,
        },
      };
    } catch (error) {
      const toolError = wrapError(error, 'finance.budget_table_actions');
      const toolMetrics = metrics.recordError(toolError.code, ctx);
      recordToolMetrics(toolMetrics);
      throw toolError;
    }
  },
};
