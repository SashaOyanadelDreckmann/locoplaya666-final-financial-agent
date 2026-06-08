import { buildMovementPromptKey } from '@/lib/transactions-chat.helpers';

export function buildMerchantAskQuestion(merchant: string): string {
  const label = merchant.trim();
  return `¿Cuánto gasté en ${label}?`;
}

export function buildCategoryAskQuestion(category: string): string {
  const label = category.trim();
  return `¿Cuánto gasté en la categoría ${label}?`;
}

export function buildMovementAskQuestion(input: {
  date?: string;
  merchant?: string;
  label?: string;
  amount?: number;
  category?: string;
}): string {
  const merchant = (input.merchant || input.label || 'este movimiento').trim();
  const date = input.date?.trim();
  const category = input.category?.trim();
  const parts = [`¿Qué puedes decirme del movimiento de ${merchant}`];
  if (date) parts.push(`del ${date}`);
  if (category) parts.push(`en ${category}`);
  parts.push('?');
  return parts.join(' ');
}

export function buildMovementPromptKeyFromRow(input: {
  date?: string;
  merchant?: string;
  description?: string;
  label?: string;
  amount?: number;
  rawAmount?: number;
}): string {
  return buildMovementPromptKey({
    date: input.date,
    merchant: input.merchant,
    description: input.description ?? input.label,
    label: input.label,
    amount: input.rawAmount ?? input.amount,
  });
}

export function mapPromptKeysToUiKeys(
  promptKeys: string[],
  rows: Array<{ uiKey: string; promptKey: string }>,
): string[] {
  const byPromptKey = new Map(rows.map((row) => [row.promptKey, row.uiKey]));
  return promptKeys.map((key) => byPromptKey.get(key)).filter((key): key is string => Boolean(key));
}
