import type { BudgetRow } from '@/lib/presupuesto/filas.helpers';
import { isTransactionsEvidenceSatisfied } from '@/lib/transacciones/flujo.helpers';

export type CanOpenInterviewParams = {
  products: Parameters<typeof isTransactionsEvidenceSatisfied>[0];
  productsModuleSkipped?: boolean;
  budgetRows: BudgetRow[];
  interviewCompleted?: boolean;
};

/** Minimum budget rows with amount > 0 required before opening interview (matches page.tsx). */
const INTERVIEW_BUDGET_ROWS_REQUIRED = 3;

export function canOpenInterview(params: CanOpenInterviewParams): boolean {
  const hasBudgetData =
    params.budgetRows.filter((row) => row.amount > 0).length >= INTERVIEW_BUDGET_ROWS_REQUIRED;
  const hasTransactionsData = isTransactionsEvidenceSatisfied(
    params.products,
    params.productsModuleSkipped,
  );
  return Boolean(params.interviewCompleted) || (hasTransactionsData && hasBudgetData);
}
