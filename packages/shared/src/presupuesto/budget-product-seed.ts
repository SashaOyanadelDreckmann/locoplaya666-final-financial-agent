import type { BudgetProductSnapshot } from './budget-chat-context';
import { inferBudgetMovementTypeFromText } from './budget-chat-focus';
import {
  buildBudgetMovementLedgers,
  budgetProductTypeLabel,
  type BudgetProductMovementLedger,
} from './budget-movement-feed';
import type { BudgetRow } from './budget-rows';
import {
  MAX_BUDGET_ROWS,
  createBudgetStarterRows,
  mergeBudgetTemplate,
  reconcileBudgetRows,
} from './budget-rows';

type GroupSource = {
  product: string;
  institution: string;
};

export type InferredBudgetCategoryGroup = {
  name: string;
  direction: 'income' | 'expense';
  amount: number;
  sources: GroupSource[];
};

function slugifySeedToken(value: string): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function normalizeSeedLabel(value: string): string {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function hasBudgetProductSeedInput(products: BudgetProductSnapshot[] | undefined): boolean {
  if (!Array.isArray(products) || products.length === 0) return false;
  return products.some((product) => {
    const label = normalizeSeedLabel(product.label ?? '');
    const bank = normalizeSeedLabel(product.bank ?? '');
    const productId = normalizeSeedLabel(product.productId ?? '');
    return Boolean(label || bank || productId);
  });
}

function pickPrimarySource(sources: GroupSource[]): GroupSource {
  return sources[0] ?? { product: 'Varios productos', institution: '' };
}

function mergeCategoryGroup(
  groups: Map<string, InferredBudgetCategoryGroup>,
  name: string,
  direction: 'income' | 'expense',
  amount: number,
  source: GroupSource,
) {
  const label = normalizeSeedLabel(name);
  const nextAmount = Math.max(0, Math.round(amount));
  if (!label || nextAmount <= 0) return;
  const key = `${direction}:${slugifySeedToken(label)}`;
  const existing = groups.get(key);
  if (!existing) {
    groups.set(key, {
      name: label,
      direction,
      amount: nextAmount,
      sources: [source],
    });
    return;
  }
  existing.amount += nextAmount;
  if (!existing.sources.some((item) => item.product === source.product && item.institution === source.institution)) {
    existing.sources.push(source);
  }
}

export function inferBudgetRowGroupsFromLedgers(ledgers: BudgetProductMovementLedger[]) {
  const groups = new Map<string, InferredBudgetCategoryGroup>();
  let totalInflows = 0;
  let totalOutflows = 0;
  let hasCategoryEvidence = false;

  for (const ledger of ledgers) {
    const source: GroupSource = {
      product: ledger.label,
      institution: ledger.bank,
    };
    totalInflows += ledger.totals.inflows;
    totalOutflows += ledger.totals.outflows;

    for (const category of ledger.categoryTotals) {
      const name = normalizeSeedLabel(category.name);
      const amount = Math.max(0, Math.round(Number(category.amount ?? 0)));
      if (!name || amount <= 0) continue;
      hasCategoryEvidence = true;
      mergeCategoryGroup(groups, name, category.direction, amount, source);
    }
  }

  if (totalInflows > 0 && !Array.from(groups.values()).some((group) => group.direction === 'income')) {
    mergeCategoryGroup(
      groups,
      'Abonos / ingresos detectados',
      'income',
      totalInflows,
      pickPrimarySource(ledgers.map((ledger) => ({ product: ledger.label, institution: ledger.bank }))),
    );
    hasCategoryEvidence = true;
  }

  return { groups, hasCategoryEvidence, totalInflows, totalOutflows };
}

function buildCategoryGroupRow(group: InferredBudgetCategoryGroup): BudgetRow {
  const slug = slugifySeedToken(group.name) || 'custom';
  const primary = pickPrimarySource(group.sources);
  const product =
    group.sources.length > 1 ? 'Varios productos' : primary.product || 'Producto bancario';
  return {
    id: `product-group-${group.direction}-${slug}`,
    category: group.name,
    type: group.direction,
    amount: group.amount,
    product,
    institution: group.sources.length > 1 ? '' : primary.institution,
    movementType: inferBudgetMovementTypeFromText(group.name, group.direction),
  };
}

function buildProductPlaceholderRow(ledger: BudgetProductMovementLedger): BudgetRow {
  const productToken = slugifySeedToken(ledger.productId) || 'product';
  const type: BudgetRow['type'] =
    ledger.totals.inflows > 0 && ledger.totals.outflows <= 0 ? 'income' : 'expense';
  const category =
    ledger.label || budgetProductTypeLabel(ledger.productType) || 'Movimiento del producto';
  return {
    id: `product-${productToken}`,
    category,
    type,
    amount: 0,
    product: ledger.label,
    institution: ledger.bank,
    movementType: inferBudgetMovementTypeFromText(category, type),
  };
}

export function buildBudgetRowsFromProducts(products: BudgetProductSnapshot[]): BudgetRow[] {
  const ledgers = buildBudgetMovementLedgers(products);
  const { groups, hasCategoryEvidence } = inferBudgetRowGroupsFromLedgers(ledgers);

  if (!hasCategoryEvidence) {
    const placeholders = ledgers
      .slice(0, MAX_BUDGET_ROWS)
      .map((ledger) => buildProductPlaceholderRow(ledger));
    if (placeholders.length > 0) {
      return placeholders;
    }
    return createBudgetStarterRows();
  }

  const rows = Array.from(groups.values())
    .map((group) => buildCategoryGroupRow(group))
    .sort((left, right) => right.amount - left.amount)
    .slice(0, MAX_BUDGET_ROWS);

  if (rows.length === 0) {
    return createBudgetStarterRows();
  }

  return rows;
}

export function mergeBudgetInitialRows(
  products: BudgetProductSnapshot[] | undefined,
  existingRows: BudgetRow[] = [],
): BudgetRow[] {
  if (hasBudgetProductSeedInput(products)) {
    return reconcileBudgetRows(buildBudgetRowsFromProducts(products ?? []));
  }
  return mergeBudgetTemplate(existingRows);
}
