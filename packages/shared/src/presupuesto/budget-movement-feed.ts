import type { BudgetProductSnapshot } from './budget-chat-context';

export type BudgetMovementRecord = {
  date?: string;
  description: string;
  amount: number;
  direction: 'income' | 'expense';
  category?: string;
  merchant?: string;
  confidence?: number;
};

export type BudgetProductMovementLedger = {
  productId: string;
  label: string;
  bank: string;
  productType: string;
  period?: { from?: string; to?: string };
  evidenceFidelity?: 'authoritative' | 'indicative';
  movements: BudgetMovementRecord[];
  totals: {
    inflows: number;
    outflows: number;
    net: number;
    movementCount: number;
  };
  categoryTotals: Array<{ name: string; amount: number; direction: 'income' | 'expense' }>;
};

const PRODUCT_TYPE_LABELS: Record<string, string> = {
  credit_card: 'Tarjeta de crédito',
  debit_account: 'Cuenta débito',
  checking_account: 'Cuenta corriente',
  savings_account: 'Cuenta de ahorro',
  consumer_loan: 'Crédito de consumo',
  mortgage: 'Crédito hipotecario',
  investment_account: 'Cuenta de inversión',
};

export function budgetProductTypeLabel(productType: string | undefined): string {
  const key = String(productType ?? '').trim();
  if (!key) return 'Producto financiero';
  return PRODUCT_TYPE_LABELS[key] ?? key.replace(/_/g, ' ');
}

function normalizeCategoryLabel(value: string): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeMovementDirection(value: unknown): 'income' | 'expense' {
  const raw = String(value ?? '').toLowerCase();
  if (raw === 'income' || raw === 'abono') return 'income';
  return 'expense';
}

export function normalizeBudgetMovementRecord(raw: unknown): BudgetMovementRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const description = normalizeCategoryLabel(String(item.description ?? ''));
  const amount = Math.max(0, Math.round(Math.abs(Number(item.amount ?? item.amount_signed ?? 0))));
  if (!description || amount <= 0) return null;
  const direction = normalizeMovementDirection(item.direction ?? item.movement_kind);
  const category = normalizeCategoryLabel(String(item.category ?? '')) || undefined;
  const merchant = normalizeCategoryLabel(String(item.merchant ?? '')) || undefined;
  const confidenceRaw = item.category_confidence ?? item.confidence;
  const confidence =
    typeof confidenceRaw === 'number' && Number.isFinite(confidenceRaw) ? confidenceRaw : undefined;
  const date = typeof item.date === 'string' && item.date.trim() ? item.date.trim() : undefined;
  return { date, description, amount, direction, category, merchant, confidence };
}

function sortMovementsChronologically(movements: BudgetMovementRecord[]): BudgetMovementRecord[] {
  return [...movements].sort((left, right) => {
    const leftDate = left.date ?? '';
    const rightDate = right.date ?? '';
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
    return left.description.localeCompare(right.description, 'es');
  });
}

function deriveCategoryTotals(movements: BudgetMovementRecord[]) {
  const totals = new Map<string, { name: string; amount: number; direction: 'income' | 'expense' }>();
  for (const movement of movements) {
    const name = movement.category || movement.merchant || movement.description;
    const key = `${movement.direction}:${name.toLowerCase()}`;
    const existing = totals.get(key);
    if (existing) {
      existing.amount += movement.amount;
      continue;
    }
    totals.set(key, { name, amount: movement.amount, direction: movement.direction });
  }
  return Array.from(totals.values()).sort((a, b) => b.amount - a.amount);
}

function deriveLedgerTotals(movements: BudgetMovementRecord[]) {
  let inflows = 0;
  let outflows = 0;
  for (const movement of movements) {
    if (movement.direction === 'income') inflows += movement.amount;
    else outflows += movement.amount;
  }
  return {
    inflows,
    outflows,
    net: inflows - outflows,
    movementCount: movements.length,
  };
}

export function buildBudgetProductMovementLedger(product: BudgetProductSnapshot): BudgetProductMovementLedger {
  const productId = String(product.productId ?? product.label ?? product.bank ?? 'product').trim() || 'product';
  const rawMovements = Array.isArray(product.movements) ? product.movements : [];
  const movements = sortMovementsChronologically(
    rawMovements.map((item) => normalizeBudgetMovementRecord(item)).filter((item): item is BudgetMovementRecord => Boolean(item)),
  );

  const totalsFromMovements = deriveLedgerTotals(movements);
  const keyMetrics = product.keyMetrics;
  const totals = {
    inflows:
      movements.length > 0
        ? totalsFromMovements.inflows
        : Math.max(0, Math.round(Number(keyMetrics?.inflows_total ?? 0))),
    outflows:
      movements.length > 0
        ? totalsFromMovements.outflows
        : Math.max(0, Math.round(Number(keyMetrics?.outflows_total ?? 0))),
    net:
      movements.length > 0
        ? totalsFromMovements.net
        : Math.max(0, Math.round(Number(keyMetrics?.net_flow ?? 0))),
    movementCount:
      movements.length > 0
        ? totalsFromMovements.movementCount
        : Math.max(0, Math.round(Number(keyMetrics?.movement_count ?? 0))),
  };

  const categoryTotals =
    movements.length > 0
      ? deriveCategoryTotals(movements)
      : (product.topCategories ?? []).map((item) => ({
          name: normalizeCategoryLabel(item.name),
          amount: Math.max(0, Math.round(Number(item.amount ?? 0))),
          direction: 'expense' as const,
        }));

  return {
    productId,
    label: normalizeCategoryLabel(product.label ?? '') || 'Producto',
    bank: normalizeCategoryLabel(product.bank ?? '') || 'Sin banco',
    productType: String(product.productType ?? '').trim() || 'unknown',
    period: product.period,
    evidenceFidelity: product.evidenceFidelity,
    movements,
    totals,
    categoryTotals: categoryTotals.filter((item) => item.name && item.amount > 0),
  };
}

export function buildBudgetMovementLedgers(products: BudgetProductSnapshot[]): BudgetProductMovementLedger[] {
  return products.slice(0, 8).map((product) => buildBudgetProductMovementLedger(product));
}
