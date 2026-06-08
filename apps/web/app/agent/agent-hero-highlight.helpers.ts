import {
  BUDGET_CADENCE_OPTIONS,
  BUDGET_MOVEMENT_TYPE_OPTIONS,
  BUDGET_PAYMENT_OPTIONS,
  inferBudgetFieldFromQuestion,
  type BudgetRowFieldGap,
} from '@financial-agent/shared';
import type { BudgetRow } from '@/lib/budget-rows.helpers';

export type AgentHeroTextSegment = {
  text: string;
  highlight: boolean;
};

const COLUMN_PHRASES: Record<Exclude<BudgetRowFieldGap, never>, string[]> = {
  amount: ['monto mensual', 'monto', 'cuánto', 'cuanto', 'pesos', 'dividendo'],
  cadence: ['recurrencia', 'cada mes', 'mes a mes', 'fijo', 'fija', 'variable'],
  paymentMethod: ['medio de pago', 'transferencia', 'débito', 'debito', 'crédito', 'credito', 'efectivo', 'prepago'],
  movementType: ['tipo de movimiento', 'movimiento'],
};

const ROW_ALIASES: Record<string, string[]> = {
  income_salary: ['sueldo líquido', 'sueldo', 'salario', 'ingreso principal', 'ingreso'],
  expense_rent: ['arriendo', 'vivienda', 'dividendo', 'hipoteca'],
  expense_food: ['alimentación', 'alimentacion', 'comida', 'supermercado'],
  expense_transport: ['transporte', 'bencina', 'combustible'],
  expense_services: ['servicios', 'internet', 'telefonía', 'telefonia'],
  expense_debt: ['deuda', 'cuota', 'cuotas', 'crédito', 'credito'],
  expense_savings: ['ahorro', 'inversión', 'inversion'],
  expense_other: ['otros gastos', 'otro gasto'],
};

function uniqueTerms(terms: Iterable<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of terms) {
    const term = raw.trim();
    if (term.length < 2) continue;
    const key = term.toLocaleLowerCase('es-CL');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(term);
  }
  return result.sort((a, b) => b.length - a.length);
}

function addCategoryTerms(terms: Set<string>, category: string | undefined) {
  if (!category?.trim()) return;
  terms.add(category.trim());
  for (const part of category.split(/[/|,]/)) {
    const piece = part.trim();
    if (piece.length > 2) terms.add(piece);
  }
}

function addAmountTerms(terms: Set<string>, text: string) {
  const patterns = [
    /\$[\d.,]+/g,
    /[\d][\d.,]*\s*(?:mil|millones?)/gi,
    /[\d]{1,3}(?:\.[\d]{3})+(?:,\d+)?/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      terms.add(match[0]);
    }
  }
}

function addFieldTerms(terms: Set<string>, field: BudgetRowFieldGap | null) {
  if (!field) return;
  for (const phrase of COLUMN_PHRASES[field] ?? []) terms.add(phrase);
  if (field === 'cadence') {
    for (const option of BUDGET_CADENCE_OPTIONS) terms.add(option.label.toLowerCase());
  }
  if (field === 'paymentMethod') {
    for (const option of BUDGET_PAYMENT_OPTIONS) terms.add(option.label.toLowerCase());
  }
  if (field === 'movementType') {
    for (const option of BUDGET_MOVEMENT_TYPE_OPTIONS) terms.add(option.label.toLowerCase());
  }
}

export function buildAgentHighlightTerms(params: {
  text: string;
  focusRow?: BudgetRow | null;
  budgetRows?: BudgetRow[];
  question?: string | null;
}): string[] {
  const terms = new Set<string>();
  const haystack = params.text.toLocaleLowerCase('es-CL');

  if (params.focusRow) {
    addCategoryTerms(terms, params.focusRow.category);
    for (const alias of ROW_ALIASES[params.focusRow.id] ?? []) terms.add(alias);
  }

  for (const row of params.budgetRows ?? []) {
    addCategoryTerms(terms, row.category);
    const categoryKey = row.category?.toLocaleLowerCase('es-CL') ?? '';
    if (categoryKey && haystack.includes(categoryKey.slice(0, Math.min(6, categoryKey.length)))) {
      terms.add(row.category);
    }
    for (const alias of ROW_ALIASES[row.id] ?? []) {
      if (haystack.includes(alias)) terms.add(alias);
    }
  }

  addAmountTerms(terms, params.text);

  const fieldFromQuestion = params.question ? inferBudgetFieldFromQuestion(params.question) : null;
  addFieldTerms(terms, fieldFromQuestion);

  const fieldFromText = inferBudgetFieldFromQuestion(params.text);
  addFieldTerms(terms, fieldFromText);

  return uniqueTerms(terms);
}

export function parseAgentHeroSegments(visibleText: string, terms: string[]): AgentHeroTextSegment[] {
  if (!visibleText) return [];

  const activeTerms = uniqueTerms(terms);
  const segments: AgentHeroTextSegment[] = [];
  let index = 0;

  while (index < visibleText.length) {
    let matchedLength = 0;

    for (const term of activeTerms) {
      if (visibleText.length - index < term.length) continue;
      const slice = visibleText.slice(index, index + term.length);
      if (slice.toLocaleLowerCase('es-CL') !== term.toLocaleLowerCase('es-CL')) continue;
      matchedLength = term.length;
      break;
    }

    if (matchedLength > 0) {
      segments.push({
        text: visibleText.slice(index, index + matchedLength),
        highlight: true,
      });
      index += matchedLength;
      continue;
    }

    let nextHighlight = visibleText.length;
    const lowerVisible = visibleText.toLocaleLowerCase('es-CL');
    for (const term of activeTerms) {
      const pos = lowerVisible.indexOf(term.toLocaleLowerCase('es-CL'), index + 1);
      if (pos >= 0 && pos < nextHighlight) nextHighlight = pos;
    }

    const chunkEnd = nextHighlight > index ? nextHighlight : index + 1;
    const chunk = visibleText.slice(index, chunkEnd);
    const last = segments[segments.length - 1];
    if (last && !last.highlight) {
      last.text += chunk;
    } else {
      segments.push({ text: chunk, highlight: false });
    }
    index = chunkEnd;
  }

  return segments;
}

function peelTrailingWordChars(text: string, count: number): { peeled: string; remainder: string } {
  if (!text || count <= 0) return { peeled: '', remainder: text };
  const trimmedEnd = text.replace(/[ \t]+$/, '');
  const trailingSpaces = text.slice(trimmedEnd.length);
  const wordMatch = trimmedEnd.match(/[\p{L}\p{N}]+$/u);
  if (!wordMatch) return { peeled: '', remainder: text };
  const word = wordMatch[0];
  const peeled = word.slice(-Math.min(count, word.length));
  const remainder = trimmedEnd.slice(0, trimmedEnd.length - peeled.length) + trailingSpaces;
  return { peeled, remainder };
}

function peelLeadingWordChars(text: string, count: number): { peeled: string; remainder: string } {
  if (!text || count <= 0) return { peeled: '', remainder: text };
  const leadingSpaces = text.match(/^[ \t]+/)?.[0] ?? '';
  const rest = text.slice(leadingSpaces.length);
  const wordMatch = rest.match(/^[\p{L}\p{N}]+/u);
  if (!wordMatch) return { peeled: '', remainder: text };
  const word = wordMatch[0];
  const peeled = word.slice(0, Math.min(count, word.length));
  const remainder = leadingSpaces + rest.slice(peeled.length);
  return { peeled, remainder };
}

/** Incluye 1 letra del vecino para que el gradiente sangre en palabras adyacentes. */
export function applyHighlightNeighborBleed(
  segments: AgentHeroTextSegment[],
  bleedChars = 1,
): AgentHeroTextSegment[] {
  if (bleedChars <= 0) return segments;
  const result = segments.map((segment) => ({ ...segment }));

  for (let i = 0; i < result.length; i += 1) {
    if (!result[i]?.highlight) continue;

    if (i > 0 && result[i - 1] && !result[i - 1].highlight) {
      const { peeled, remainder } = peelTrailingWordChars(result[i - 1].text, bleedChars);
      if (peeled) {
        result[i - 1].text = remainder;
        result[i].text = peeled + result[i].text;
      }
    }

    if (i < result.length - 1 && result[i + 1] && !result[i + 1].highlight) {
      const nextText = result[i + 1].text;
      const leadingSpaces = nextText.match(/^[ \t]+/)?.[0] ?? '';
      const { peeled, remainder } = peelLeadingWordChars(nextText, bleedChars);
      if (peeled) {
        result[i + 1].text = remainder;
        result[i].text = result[i].text + (leadingSpaces ? ' ' : '') + peeled;
      }
    }
  }

  return result.filter((segment) => segment.text.length > 0);
}
