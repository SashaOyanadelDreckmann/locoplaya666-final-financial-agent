import type { ContextConflict, FinancialContextFact } from '@financial-agent/shared';
import { normalizeMonthlyAmount } from '@financial-agent/shared';
import { hashContent } from './context-version.service';

const INCOME_MISMATCH_RATIO = 0.15;

export function detectContextConflicts(params: {
  facts: FinancialContextFact[];
  contextVersion: string;
  diagnosticCompletedAt?: string | null;
  budgetLastModified?: string | null;
}): ContextConflict[] {
  const conflicts: ContextConflict[] = [];
  const detectedAt = new Date().toISOString();

  const intakeIncome = findNumericFact(params.facts, 'user.income', 'declared_monthly_income');
  const budgetIncome = findNumericFact(params.facts, 'budget.totals', 'monthly_income');
  const txInflows = findNumericFact(params.facts, 'transactions.summary', 'observed_inflows');

  if (intakeIncome && budgetIncome) {
    const intakeVal = normalizeMonthlyAmount(intakeIncome.value, intakeIncome.cadence) ?? Number(intakeIncome.value);
    const budgetVal = normalizeMonthlyAmount(budgetIncome.value, budgetIncome.cadence) ?? Number(budgetIncome.value);
    const diff = Math.abs(intakeVal - budgetVal);
    if (diff > Math.max(50_000, intakeVal * INCOME_MISMATCH_RATIO)) {
      conflicts.push(
        buildConflict({
          type: 'soft_value_mismatch',
          severity: 'medium',
          predicate: 'monthly_income',
          factIds: [intakeIncome.factId, budgetIncome.factId],
          sourceIds: [intakeIncome.sourceId, budgetIncome.sourceId],
          explanationCode: 'INTAKE_BUDGET_INCOME_MISMATCH',
          deterministicReason: `Ingreso declarado (${intakeVal}) difiere del presupuesto (${budgetVal}).`,
          contextVersion: params.contextVersion,
          detectedAt,
          suggestedResolution: 'ask_user',
        }),
      );
    }
  }

  if (budgetIncome && txInflows) {
    const budgetVal = Number(budgetIncome.value);
    const txVal = Number(txInflows.value);
    const diff = Math.abs(budgetVal - txVal);
    if (diff > Math.max(80_000, budgetVal * 0.2)) {
      conflicts.push(
        buildConflict({
          type: 'derived_source_disagreement',
          severity: 'low',
          predicate: 'monthly_income',
          factIds: [budgetIncome.factId, txInflows.factId],
          sourceIds: [budgetIncome.sourceId, txInflows.sourceId],
          explanationCode: 'BUDGET_TRANSACTION_INFLOW_MISMATCH',
          deterministicReason: `Ingreso presupuestado (${budgetVal}) difiere de abonos observados (${txVal}).`,
          contextVersion: params.contextVersion,
          detectedAt,
          suggestedResolution: 'ask_user',
        }),
      );
    }
  }

  const declaredNoDebt = params.facts.find(
    (fact) => fact.subject === 'user.debt' && fact.predicate === 'declared_has_debt' && fact.value === false,
  );
  if (declaredNoDebt && txInflows) {
    const outflows = findNumericFact(params.facts, 'transactions.summary', 'observed_outflows');
    if (outflows && Number(outflows.value) > Number(txInflows.value) * 1.5) {
      conflicts.push(
        buildConflict({
          type: 'missing_evidence',
          severity: 'info',
          predicate: 'debt_evidence',
          factIds: [declaredNoDebt.factId],
          sourceIds: [declaredNoDebt.sourceId, txInflows.sourceId],
          explanationCode: 'DECLARED_NO_DEBT_HIGH_OUTFLOWS',
          deterministicReason: 'Usuario declaró sin deuda pero hay salidas elevadas en transacciones.',
          contextVersion: params.contextVersion,
          detectedAt,
          suggestedResolution: 'ask_user',
        }),
      );
    }
  }

  if (
    params.diagnosticCompletedAt &&
    params.budgetLastModified &&
    Date.parse(params.budgetLastModified) > Date.parse(params.diagnosticCompletedAt)
  ) {
    conflicts.push(
      buildConflict({
        type: 'stale_source',
        severity: 'medium',
        predicate: 'diagnostic_budget_stale',
        factIds: [],
        sourceIds: ['diagnostic', 'budget'],
        explanationCode: 'DIAGNOSTIC_BUDGET_STALE',
        deterministicReason: 'El presupuesto cambió después del último diagnóstico.',
        contextVersion: params.contextVersion,
        detectedAt,
        suggestedResolution: 'refresh_source',
      }),
    );
  }

  return conflicts;
}

function findNumericFact(
  facts: FinancialContextFact[],
  subject: string,
  predicate: string,
): FinancialContextFact | null {
  return facts.find((fact) => fact.subject === subject && fact.predicate === predicate) ?? null;
}

function buildConflict(params: {
  type: ContextConflict['type'];
  severity: ContextConflict['severity'];
  predicate: string;
  factIds: string[];
  sourceIds: string[];
  explanationCode: string;
  deterministicReason: string;
  contextVersion: string;
  detectedAt: string;
  suggestedResolution: ContextConflict['suggestedResolution'];
}): ContextConflict {
  const conflictId = hashContent({
    type: params.type,
    predicate: params.predicate,
    factIds: params.factIds,
    contextVersion: params.contextVersion,
  });
  return {
    conflictId,
    type: params.type,
    severity: params.severity,
    status: 'open',
    predicate: params.predicate,
    factIds: params.factIds,
    sourceIds: params.sourceIds,
    explanationCode: params.explanationCode,
    deterministicReason: params.deterministicReason,
    detectedAt: params.detectedAt,
    contextVersion: params.contextVersion,
    suggestedResolution: params.suggestedResolution,
    autoResolvable: false,
  };
}
