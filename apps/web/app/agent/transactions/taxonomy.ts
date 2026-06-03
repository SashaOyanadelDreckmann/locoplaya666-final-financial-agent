import type { TransactionTaxonomyOverride } from './types';

export function normalizeTaxonomyKey(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b(compra|pago|cargo|abono|transferencia|debito|credito|webpay|pos|tef|visa|mastercard|trx)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function movementOverrideKey(movement: { merchant?: string; label: string }) {
  return normalizeTaxonomyKey(movement.merchant || movement.label);
}

export function resolveTransactionOverride(
  movement: { merchant?: string; label: string },
  overrides: TransactionTaxonomyOverride[],
) {
  const key = movementOverrideKey(movement);
  if (!key) return null;
  return overrides.find((item) => item.matchKey === key) ?? null;
}

export function normalizeTransactionTaxonomyOverride(raw: unknown): TransactionTaxonomyOverride | null {
  const value = raw as Partial<TransactionTaxonomyOverride> | null | undefined;
  const matchKey = normalizeTaxonomyKey(value?.matchKey ?? value?.matchLabel ?? value?.merchant);
  const category = String(value?.category ?? '').trim();
  const merchant = String(value?.merchant ?? '').trim();
  if (!matchKey || !category || !merchant) return null;
  return {
    id: String(value?.id ?? `${matchKey}:${category}`).trim(),
    matchKey,
    matchLabel: String(value?.matchLabel ?? merchant).trim() || merchant,
    merchant,
    category,
    updatedAt: typeof value?.updatedAt === 'string' ? value.updatedAt : new Date().toISOString(),
  };
}