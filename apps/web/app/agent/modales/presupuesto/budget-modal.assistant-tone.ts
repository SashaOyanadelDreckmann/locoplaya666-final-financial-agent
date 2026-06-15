export type BudgetAssistantRowTone = 'income' | 'expense' | 'neutral';

export function resolveBudgetAssistantRowTone(
  rowType: string | undefined,
): BudgetAssistantRowTone {
  if (rowType === 'income') return 'income';
  if (rowType === 'expense') return 'expense';
  return 'neutral';
}

export function resolveBudgetAssistantHeroToneClass(
  rowType: string | undefined,
): string {
  const tone = resolveBudgetAssistantRowTone(rowType);
  if (tone === 'income') return 'is-budget-assistant-income';
  if (tone === 'expense') return 'is-budget-assistant-expense';
  return 'is-budget-assistant-neutral';
}
