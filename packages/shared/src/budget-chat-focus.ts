import type { BudgetRow } from './budget-rows';
import { canonicalBudgetRowId } from './budget-rows';

export function inferBudgetFocusRowId(question: string | null | undefined): string | null {
  const q = String(question ?? '').toLowerCase();
  if (!q || q === '…') return null;
  if (/ingreso|sueldo/.test(q)) return 'income_salary';
  if (/arriendo|vivienda|hogar/.test(q)) return 'expense_rent';
  if (/delivery|pedidos\s*ya|pedidosya|rappi|uber\s*eats|ubereats|comida\s*rapida/.test(q)) return 'expense_food';
  if (/supermerc|lider|jumbo|unimarc|tottus|santa\s*isabel|acuenta|ekono|alvi|mayorista\s*10/.test(q)) {
    return 'expense_food';
  }
  if (/aliment|comida|restaurante|food|restaurant|caf[eé]|delivery/.test(q)) return 'expense_food';
  if (/retail|falabella|ripley|paris|hites|mercadolibre|shein|temu|amazon/.test(q)) return 'expense_other';
  if (/transporte|bencina|metro|uber/.test(q)) return 'expense_transport';
  if (/servicios|luz|agua|internet|telefon/.test(q)) return 'expense_services';
  if (/movistar|entel|claro|wom|telefon[ií]a|celular|m[oó]vil/.test(q)) return 'expense_services';
  if (/deuda|cuota|cr[eé]dito/.test(q)) return 'expense_debt';
  if (/ahorr|inviert/.test(q)) return 'expense_savings';
  if (/otros?|gasto adicional|variab/.test(q)) return 'expense_other';
  return null;
}

export function findBudgetRowByFocusId(rows: BudgetRow[], rowId: string | null | undefined): BudgetRow | null {
  if (!rowId) return null;
  const canonical = canonicalBudgetRowId(rowId);
  return rows.find((row) => canonicalBudgetRowId(row.id) === canonical) ?? null;
}

export function resolveBudgetChatTargetRow(
  rows: BudgetRow[],
  question: string,
  options?: { assistantFocusRowId?: string | null; activeRow?: BudgetRow | null },
): BudgetRow | null {
  const fromQuestion = findBudgetRowByFocusId(rows, inferBudgetFocusRowId(question));
  if (fromQuestion) return fromQuestion;
  const fromAssistant = findBudgetRowByFocusId(rows, options?.assistantFocusRowId ?? null);
  if (fromAssistant) return fromAssistant;
  if (options?.activeRow) return options.activeRow;
  return null;
}
