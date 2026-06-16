export type BudgetRow = {
  id: string;
  category: string;
  type: 'income' | 'expense';
  amount: number;
  parentId?: string;
  product?: string;
  institution?: string;
  note?: string;
  cadence?: 'fixed' | 'variable' | 'oneoff';
  paymentMethod?: 'transfer' | 'debit' | 'credit' | 'cash' | 'prepaid' | 'other';
  movementType?:
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
    | 'leisure_other';
  momentum?: 'up' | 'steady' | 'down';
  strategy?: 'shield' | 'review' | 'optimize';
};

export const MAX_BUDGET_ROWS = 30;

const BUDGET_ROW_ID_ALIASES: Record<string, string> = {
  'income-salary': 'income_salary',
  'expense-rent': 'expense_rent',
  'expense-food': 'expense_food',
  'expense-transport': 'expense_transport',
  'expense-services': 'expense_services',
  'expense-debt': 'expense_debt',
  'expense-savings': 'expense_savings',
  'expense-other': 'expense_other',
};

export function canonicalBudgetRowId(id: string): string {
  return BUDGET_ROW_ID_ALIASES[id] ?? id;
}

export function createBudgetStarterRows(): BudgetRow[] {
  return [
    {
      id: 'income_salary',
      category: 'Ingreso principal',
      type: 'income',
      amount: 0,
      product: 'Ingresos',
      institution: '',
      movementType: 'income_main',
    },
    {
      id: 'expense_rent',
      category: 'Gasto principal',
      type: 'expense',
      amount: 0,
      product: 'Gastos',
      institution: '',
      movementType: 'housing',
    },
    {
      id: 'expense_other',
      category: 'Otro gasto',
      type: 'expense',
      amount: 0,
      product: 'Gastos',
      institution: '',
      movementType: 'leisure_other',
    },
  ];
}

export const DEFAULT_BUDGET_ROWS: BudgetRow[] = createBudgetStarterRows();

export function normalizeBudgetRow(row: BudgetRow): BudgetRow {
  const { id, ...rest } = row;
  return { ...rest, id: canonicalBudgetRowId(id) };
}

export function getEffectiveBudgetRows(rows: BudgetRow[]): BudgetRow[] {
  const parentIds = new Set(rows.filter((row) => row.parentId).map((row) => row.parentId as string));
  return rows.filter((row) => !parentIds.has(row.id));
}

export function collectBudgetDescendantIds(rows: BudgetRow[], rootId: string) {
  const deleteIds = new Set<string>([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const row of rows) {
      if (row.parentId && deleteIds.has(row.parentId) && !deleteIds.has(row.id)) {
        deleteIds.add(row.id);
        changed = true;
      }
    }
  }
  return deleteIds;
}

export function reconcileBudgetRows(rows: BudgetRow[]): BudgetRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const typed = rows.map((row) => {
    if (!row.parentId || row.parentId === row.id) {
      return row.parentId === row.id ? { ...row, parentId: undefined } : row;
    }
    const parent = byId.get(row.parentId);
    if (!parent) return { ...row, parentId: undefined };
    if (row.type === parent.type) return row;
    return { ...row, type: parent.type };
  });
  const childrenByParentId = new Map<string, BudgetRow[]>();
  typed.forEach((row) => {
    if (!row.parentId) return;
    const bucket = childrenByParentId.get(row.parentId) ?? [];
    bucket.push(row);
    childrenByParentId.set(row.parentId, bucket);
  });
  const amountMemo = new Map<string, number>();
  const activeStack = new Set<string>();
  const computeRolledUpAmount = (row: BudgetRow): number => {
    if (amountMemo.has(row.id)) return amountMemo.get(row.id)!;
    if (activeStack.has(row.id)) return Math.max(0, Number(row.amount) || 0);
    activeStack.add(row.id);
    const children = childrenByParentId.get(row.id) ?? [];
    if (children.length === 0) {
      const selfAmount = Math.max(0, Number(row.amount) || 0);
      amountMemo.set(row.id, selfAmount);
      activeStack.delete(row.id);
      return selfAmount;
    }
    const rolled = children.reduce((sum, child) => sum + computeRolledUpAmount(child), 0);
    amountMemo.set(row.id, rolled);
    activeStack.delete(row.id);
    return rolled;
  };
  return typed.map((row) => {
    const children = childrenByParentId.get(row.id) ?? [];
    if (children.length === 0) return row;
    return { ...row, amount: computeRolledUpAmount(row) };
  });
}

export function computeBudgetTotals(rows: BudgetRow[]) {
  const effectiveRows = getEffectiveBudgetRows(rows);
  const income = effectiveRows.filter((r) => r.type === 'income').reduce((acc, r) => acc + r.amount, 0);
  const expenses = effectiveRows.filter((r) => r.type === 'expense').reduce((acc, r) => acc + r.amount, 0);
  return { income, expenses, balance: income - expenses };
}

export type BudgetTopExpense = { id: string; label: string; amount: number; pct: number };

export function computeBudgetInsights(rows: BudgetRow[], totals: ReturnType<typeof computeBudgetTotals>) {
  const effectiveRows = getEffectiveBudgetRows(rows);
  const nonZeroRows = effectiveRows.filter((row) => row.amount > 0);
  const expenseRows = nonZeroRows.filter((row) => row.type === 'expense');
  const fixedLike = expenseRows.filter((row) =>
    /(arriendo|hipoteca|luz|agua|internet|suscrip|colegio|seguro|deuda)/i.test(`${row.category} ${row.note ?? ''}`),
  );
  const variableLike = expenseRows.filter((row) => !fixedLike.some((f) => f.id === row.id));
  const fixedTotal = fixedLike.reduce((sum, row) => sum + row.amount, 0);
  const variableTotal = variableLike.reduce((sum, row) => sum + row.amount, 0);
  const savingsRate = totals.income > 0 ? Math.max(0, (totals.balance / totals.income) * 100) : 0;
  const healthScore = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (totals.balance >= 0 ? 45 : 15) + Math.min(30, savingsRate * 1.2) + Math.min(25, nonZeroRows.length * 2.5),
      ),
    ),
  );
  const topExpenses: BudgetTopExpense[] = expenseRows
    .slice()
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 4)
    .map((row) => ({
      id: row.id,
      label: row.category || 'Sin categoria',
      amount: row.amount,
      pct: totals.expenses > 0 ? Math.round((row.amount / totals.expenses) * 100) : 0,
    }));
  return { nonZeroRows, expenseRows, fixedTotal, variableTotal, savingsRate, healthScore, topExpenses };
}

export function computeBudgetCompletion(rows: BudgetRow[]) {
  const effectiveRows = getEffectiveBudgetRows(rows);
  const filledRows = effectiveRows.filter((row) => row.amount > 0);
  const fillRate = effectiveRows.length > 0 ? Math.round((filledRows.length / effectiveRows.length) * 100) : 0;
  return { filledRows, fillRate, totalRows: effectiveRows.length };
}

export function computeBudgetSignals(
  rows: BudgetRow[],
  totals: ReturnType<typeof computeBudgetTotals>,
  healthScore: number,
) {
  const activeCanonicalIds = new Set(rows.filter((row) => row.amount > 0).map((row) => canonicalBudgetRowId(row.id)));
  const coreFilledCount = DEFAULT_BUDGET_ROWS.reduce(
    (count, templateRow) => count + (activeCanonicalIds.has(templateRow.id) ? 1 : 0),
    0,
  );
  const coreFillRate =
    DEFAULT_BUDGET_ROWS.length > 0 ? Math.round((coreFilledCount / DEFAULT_BUDGET_ROWS.length) * 100) : 0;
  const balanceTone: 'surplus' | 'deficit' | 'balanced' =
    totals.balance > 0 ? 'surplus' : totals.balance < 0 ? 'deficit' : 'balanced';
  const balanceLabel =
    balanceTone === 'surplus' ? 'Superávit' : balanceTone === 'deficit' ? 'Déficit' : 'Punto de equilibrio';
  const balanceHint =
    balanceTone === 'surplus'
      ? 'Hay margen para acelerar ahorro o inversión.'
      : balanceTone === 'deficit'
        ? 'Conviene reducir presión fija antes de escalar metas.'
        : 'La base está equilibrada: el siguiente paso es capturar margen.';
  const readinessScore = Math.max(0, Math.min(100, Math.round(coreFillRate * 0.62 + healthScore * 0.38)));
  const nextAction =
    balanceTone === 'deficit'
      ? 'Completa vivienda, deuda y servicios para cerrar fugas.'
      : coreFillRate < 70
        ? 'Llena la plantilla base antes de refinar categorías secundarias.'
        : 'Afina variables y convierte el balance en una meta concreta.';
  return {
    balanceTone,
    balanceLabel,
    balanceHint,
    coreFilledCount,
    coreTotal: DEFAULT_BUDGET_ROWS.length,
    coreFillRate,
    readinessScore,
    nextAction,
    risingExpenseCount: rows.filter((row) => row.type === 'expense' && row.momentum === 'up').length,
    optimizePotential: rows
      .filter((row) => row.type === 'expense' && row.strategy === 'optimize')
      .reduce((sum, row) => sum + Math.max(0, Number(row.amount) || 0), 0),
  };
}

export function mergeBudgetTemplate(rows: BudgetRow[]): BudgetRow[] {
  const starterRows = createBudgetStarterRows();
  const normalizedRows = rows.map(normalizeBudgetRow);
  const rowsById = new Map(normalizedRows.map((row) => [row.id, row]));
  const templateIds = new Set(starterRows.map((row) => row.id));
  const mergedStarterRows = starterRows.map((templateRow) => {
    const existing = rowsById.get(templateRow.id);
    return existing ? { ...templateRow, ...existing } : templateRow;
  });
  const customRows = normalizedRows.filter((row) => !templateIds.has(row.id));
  return [...mergedStarterRows, ...customRows];
}

export function buildPersistableBudgetContext(rows: BudgetRow[], totals: ReturnType<typeof computeBudgetTotals>) {
  return {
    income: Math.round(Number(totals.income) || 0),
    expenses: Math.round(Number(totals.expenses) || 0),
    balance: Math.round(Number(totals.balance) || 0),
    rowsCount: rows.filter((row) => row.amount > 0).length,
    rows: rows
      .filter((row) => row.amount > 0 || row.category.trim().length > 0)
      .slice(0, 80)
      .map((row) => ({
        id: row.id,
        category: row.category,
        type: row.type,
        amount: Math.round(Number(row.amount) || 0),
        note: row.note || undefined,
        parentId: row.parentId ?? null,
        product: row.product || undefined,
        institution: row.institution || undefined,
        cadence: row.cadence || undefined,
        paymentMethod: row.paymentMethod || undefined,
        movementType: row.movementType || undefined,
        momentum: row.momentum || undefined,
        strategy: row.strategy || undefined,
      })),
  };
}
