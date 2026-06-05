import type { BudgetRow } from './budget-rows';
import { canonicalBudgetRowId } from './budget-rows';

export function isBareBudgetAmountAnswer(answer: string | null | undefined): boolean {
  const text = String(answer ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  if (!text || !/\d/.test(text)) return false;

  const withoutAmount = text
    .replace(/\$|\bclp\b/g, ' ')
    .replace(/[+-]?\d[\d.,\s]{0,18}(?:\s*(?:k|mil|m|mm|millones?))?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!withoutAmount) return true;
  return /^(si|sí|ok|dale|listo|ya|mm+|ah|bueno)$/.test(withoutAmount);
}

export function extractInferenceQuestionText(text: string | null | undefined): string {
  const raw = String(text ?? '').trim();
  if (!raw) return '';

  const questionParts = raw.match(/[^.!?\n]*\?/g);
  if (questionParts?.length) {
    return questionParts[questionParts.length - 1].trim();
  }

  const withoutConfirmation = raw.replace(/^listo:\s*[^.?!]+[.!?]\s*/i, '').trim();
  return withoutConfirmation || raw;
}

export function inferBudgetFocusRowId(question: string | null | undefined): string | null {
  const q = extractInferenceQuestionText(question).toLowerCase();
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
  options?: {
    manualFocusRowId?: string | null;
    assistantFocusRowId?: string | null;
    activeRow?: BudgetRow | null;
  },
): BudgetRow | null {
  const fromManual = findBudgetRowByFocusId(rows, options?.manualFocusRowId ?? null);
  if (fromManual) return fromManual;

  const fromAssistant = findBudgetRowByFocusId(rows, options?.assistantFocusRowId ?? null);
  if (fromAssistant) return fromAssistant;

  const fromQuestion = findBudgetRowByFocusId(
    rows,
    inferBudgetFocusRowId(extractInferenceQuestionText(question) || question),
  );
  if (fromQuestion) return fromQuestion;

  if (options?.activeRow) return options.activeRow;
  return null;
}
