import type { BankProduct, TransactionTaxonomyOverride } from '@/app/agent/transactions/types';
import { normalizeTaxonomyKey } from '@/app/agent/transactions/taxonomy';

export function normalizeProductAssistantState(
  raw: Partial<NonNullable<BankProduct['assistant']>> | undefined,
): NonNullable<BankProduct['assistant']> {
  return {
    messages: Array.isArray(raw?.messages) ? raw!.messages : [],
    uploadFormat:
      raw?.uploadFormat === 'photos' ||
      raw?.uploadFormat === 'pdf' ||
      raw?.uploadFormat === 'spreadsheet' ||
      raw?.uploadFormat === 'text'
        ? raw.uploadFormat
        : null,
    summaryText: typeof raw?.summaryText === 'string' ? raw.summaryText : null,
    summaryModel: typeof raw?.summaryModel === 'string' ? raw.summaryModel : null,
    summaryGeneratedAt: typeof raw?.summaryGeneratedAt === 'string' ? raw.summaryGeneratedAt : null,
    summaryRegenerationsUsed: Math.max(0, Number(raw?.summaryRegenerationsUsed ?? 0) || 0),
    lastSummaryFeedback: typeof raw?.lastSummaryFeedback === 'string' ? raw.lastSummaryFeedback : null,
  };
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
