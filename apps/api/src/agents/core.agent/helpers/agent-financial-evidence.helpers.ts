/**
 * Resolves budget rows and financial evidence snapshots for core-agent prompts.
 * Keeps panel data (ui_state) and persisted intake (budgetContext) aligned for the LLM.
 */

export type AgentBudgetRow = {
  id: string;
  category: string;
  type: string;
  amount: number;
  note?: string;
  cadence?: string;
  paymentMethod?: string;
  movementType?: string;
};

function toRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function toFiniteNumber(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeBudgetRow(raw: unknown): AgentBudgetRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as Record<string, unknown>;
  const category = typeof row.category === 'string' ? row.category.trim() : '';
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const amount = toFiniteNumber(row.amount) ?? 0;
  if (!id && !category && amount <= 0) return null;

  return {
    id: id || `row_${category.toLowerCase().replace(/\s+/g, '_') || 'unknown'}`,
    category: category || 'Sin categoría',
    type: typeof row.type === 'string' ? row.type : 'expense',
    amount: Math.round(amount),
    note: typeof row.note === 'string' && row.note.trim() ? row.note.trim() : undefined,
    cadence: typeof row.cadence === 'string' ? row.cadence : undefined,
    paymentMethod: typeof row.paymentMethod === 'string' ? row.paymentMethod : undefined,
    movementType: typeof row.movementType === 'string' ? row.movementType : undefined,
  };
}

export function resolveAgentBudgetRows(params: {
  uiState?: Record<string, unknown>;
  persistedBudgetContext?: Record<string, unknown>;
}): AgentBudgetRow[] {
  const uiRows = Array.isArray(params.uiState?.budget_rows) ? params.uiState.budget_rows : [];
  const persistedRows = Array.isArray(params.persistedBudgetContext?.rows)
    ? params.persistedBudgetContext.rows
    : [];

  const source = uiRows.length > 0 ? uiRows : persistedRows;
  const dedup = new Map<string, AgentBudgetRow>();

  for (const raw of source) {
    const normalized = normalizeBudgetRow(raw);
    if (!normalized) continue;
    dedup.set(normalized.id, normalized);
  }

  return Array.from(dedup.values())
    .filter((row) => row.amount > 0 || row.category.trim().length > 0)
    .slice(0, 40);
}

function readTransactionEvidence(consolidatedContext: Record<string, unknown>) {
  const transactions = toRecord(consolidatedContext.transactions);
  const activeProduct = toRecord(transactions.activeProduct);
  const movementCount = Math.max(
    0,
    toFiniteNumber(transactions.activeProductMovementCount) ??
      toFiniteNumber(toRecord(transactions.transactionSummary).movementCount) ??
      toFiniteNumber(toRecord(activeProduct.keyMetrics).movement_count) ??
      (Array.isArray(activeProduct.movements) ? activeProduct.movements.length : 0),
  );
  const productsCount = Math.max(
    0,
    toFiniteNumber(transactions.productsCount) ??
      (Array.isArray(transactions.productsIndex) ? transactions.productsIndex.length : 0),
  );
  const uploadedFiles = Array.isArray(transactions.uploadedFiles) ? transactions.uploadedFiles : [];
  const parsedDocuments = Array.isArray(activeProduct.parsedDocuments)
    ? activeProduct.parsedDocuments
    : [];

  return {
    productsCount,
    movementCount,
    activeProductLabel:
      typeof transactions.activeProductLabel === 'string'
        ? transactions.activeProductLabel
        : typeof activeProduct.label === 'string'
          ? activeProduct.label
          : null,
    hasUploadedFiles: uploadedFiles.length > 0,
    hasParsedDocuments: parsedDocuments.length > 0,
    hasTransactions:
      productsCount > 0 &&
      (movementCount > 0 || uploadedFiles.length > 0 || parsedDocuments.length > 0),
  };
}

function readIntakeFinancialGoal(intake: unknown): string | null {
  const env = toRecord(intake);
  const raw = toRecord(env.intake && typeof env.intake === 'object' ? env.intake : env);
  const candidates = [
    raw.financialGoal,
    raw.primaryGoal,
    raw.savingsGoal,
    raw.goalDescription,
    raw.mainObjective,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length >= 4) {
      return candidate.trim();
    }
  }
  return null;
}

export type FinancialEvidenceSnapshot = {
  has_budget_totals: boolean;
  has_budget_rows: boolean;
  budget_income: number;
  budget_expenses: number;
  budget_balance: number;
  budget_rows_with_amount: number;
  has_transactions: boolean;
  products_count: number;
  movement_count: number;
  active_product_label: string | null;
  has_diagnostic_profile: boolean;
  has_intake: boolean;
  has_financial_goal: boolean;
  financial_goal: string | null;
  diagnosis_completed: boolean;
};

export function buildFinancialEvidenceSnapshot(params: {
  injectedBudget: { income: number; expenses: number; balance: number };
  budgetRows: AgentBudgetRow[];
  consolidatedContext?: Record<string, unknown>;
  injectedProfile?: unknown;
  injectedIntake?: unknown;
  productPhase?: unknown;
  interviewCompleted?: boolean;
}): FinancialEvidenceSnapshot {
  const budget = params.injectedBudget;
  const income = toFiniteNumber(budget.income) ?? 0;
  const expenses = toFiniteNumber(budget.expenses) ?? 0;
  const balance = toFiniteNumber(budget.balance) ?? income - expenses;
  const rowsWithAmount = params.budgetRows.filter((row) => row.amount > 0).length;
  const tx = readTransactionEvidence(params.consolidatedContext ?? {});
  const financialGoal = readIntakeFinancialGoal(params.injectedIntake);
  const phase = String(params.productPhase ?? '');
  const diagnosisCompleted =
    params.interviewCompleted === true ||
    phase === 'diagnosis_ready' ||
    phase === 'advisory_unlocked';

  return {
    has_budget_totals: income > 0 || expenses > 0,
    has_budget_rows: rowsWithAmount > 0,
    budget_income: Math.round(income),
    budget_expenses: Math.round(expenses),
    budget_balance: Math.round(balance),
    budget_rows_with_amount: rowsWithAmount,
    has_transactions: tx.hasTransactions,
    products_count: tx.productsCount,
    movement_count: tx.movementCount,
    active_product_label: tx.activeProductLabel,
    has_diagnostic_profile: Boolean(params.injectedProfile),
    has_intake: Boolean(params.injectedIntake),
    has_financial_goal: Boolean(financialGoal),
    financial_goal: financialGoal,
    diagnosis_completed: diagnosisCompleted,
  };
}

export function buildLoadedFinancialEvidenceBlock(
  snapshot: FinancialEvidenceSnapshot,
  budgetRows: AgentBudgetRow[],
): string {
  const lines: string[] = [
    'EVIDENCIA FINANCIERA YA CARGADA (usa estos datos; no pidas re-subir lo que ya existe):',
  ];

  if (snapshot.has_diagnostic_profile) {
    lines.push('- Diagnóstico integrado disponible en context.profile.');
  }
  if (snapshot.has_intake) {
    lines.push('- Intake/cuestionario disponible en context.intake.');
  }
  if (snapshot.has_budget_totals || snapshot.has_budget_rows) {
    lines.push(
      `- Presupuesto: ingreso $${snapshot.budget_income.toLocaleString('es-CL')} CLP, gasto $${snapshot.budget_expenses.toLocaleString('es-CL')} CLP, balance $${snapshot.budget_balance.toLocaleString('es-CL')} CLP (${snapshot.budget_rows_with_amount} filas con monto).`,
    );
    const topRows = budgetRows
      .filter((row) => row.amount > 0)
      .sort((left, right) => right.amount - left.amount)
      .slice(0, 8)
      .map(
        (row) =>
          `${row.category} (${row.type}): $${row.amount.toLocaleString('es-CL')} CLP`,
      );
    if (topRows.length > 0) {
      lines.push(`- Principales filas de presupuesto: ${topRows.join('; ')}.`);
    }
  }
  if (snapshot.has_transactions) {
    lines.push(
      `- Productos/cartolas: ${snapshot.products_count} producto(s), ${snapshot.movement_count} movimiento(s)${
        snapshot.active_product_label ? ` (activo: ${snapshot.active_product_label})` : ''
      }.`,
    );
  }
  if (snapshot.has_financial_goal && snapshot.financial_goal) {
    lines.push(`- Meta declarada en intake: ${snapshot.financial_goal}.`);
  }
  if (snapshot.diagnosis_completed) {
    lines.push('- Fase post-diagnóstico: el usuario ya completó entrevista y chat general está desbloqueado.');
  }

  if (snapshot.has_budget_totals || snapshot.has_budget_rows) {
    lines.push('- No declares presupuesto ni gastos reales como faltantes: ya están en contexto.');
  }
  if (snapshot.has_transactions) {
    lines.push('- No declares cartolas ni movimientos como faltantes: ya están en contexto.');
  }

  const missing: string[] = [];
  if (!snapshot.has_budget_totals && !snapshot.has_budget_rows) {
    missing.push('presupuesto con montos');
  }
  if (!snapshot.has_transactions) {
    missing.push('cartolas o movimientos del mes');
  }
  if (!snapshot.has_financial_goal) {
    missing.push('meta de ahorro específica (para qué y en cuánto tiempo)');
  }

  if (missing.length > 0) {
    lines.push(`- Datos aún no verificables en contexto: ${missing.join(', ')}.`);
    lines.push('- Solo lista esos ítems como faltantes si la pregunta del usuario lo requiere.');
  }

  return lines.join('\n');
}
