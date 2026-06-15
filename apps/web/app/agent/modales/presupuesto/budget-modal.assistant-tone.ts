export type BudgetAssistantRowTone = 'income' | 'expense' | 'neutral';

const EXPENSE_TONE_PATTERN =
  /\b(deuda?s?|gastos?|egresos?|cr[eé]ditos?|cuotas?|arriendo|hipoteca|dividendo|falabella|bice|bch|transporte|servicios?|supermercado|combustible|bencina)\b/giu;

const INCOME_TONE_PATTERN =
  /\b(ingresos?|sueldos?|salarios?|honorarios?|rentas?|dividendos?\s+recibidos?|liquido|l[ií]quido)\b/giu;

export function resolveBudgetAssistantRowTone(
  rowType: string | undefined,
): BudgetAssistantRowTone {
  if (rowType === 'income') return 'income';
  if (rowType === 'expense') return 'expense';
  return 'neutral';
}

export function inferBudgetAssistantToneFromText(
  contextText: string | null | undefined,
): BudgetAssistantRowTone {
  const text = contextText?.trim();
  if (!text) return 'neutral';

  const expenseHits = text.match(EXPENSE_TONE_PATTERN)?.length ?? 0;
  const incomeHits = text.match(INCOME_TONE_PATTERN)?.length ?? 0;

  if (expenseHits > incomeHits) return 'expense';
  if (incomeHits > expenseHits) return 'income';
  return 'neutral';
}

export function resolveBudgetAssistantHeroTone(
  rowType: string | undefined,
  contextText?: string | null,
): BudgetAssistantRowTone {
  const fromRow = resolveBudgetAssistantRowTone(rowType);
  if (fromRow !== 'neutral') return fromRow;
  return inferBudgetAssistantToneFromText(contextText);
}

export function resolveBudgetAssistantHeroToneClass(
  rowType: string | undefined,
  contextText?: string | null,
): string {
  const tone = resolveBudgetAssistantHeroTone(rowType, contextText);
  if (tone === 'income') return 'is-budget-assistant-income';
  if (tone === 'expense') return 'is-budget-assistant-expense';
  return 'is-budget-assistant-neutral';
}
