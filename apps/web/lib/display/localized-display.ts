import {
  decisionStyleMap,
  emotionalPatternMap,
  financialClarityMap,
  financialPressureMap,
  timeHorizonMap,
} from '@/lib/diagnostico/i18n';

const PROFILE_FIELD_LABELS: Record<string, string> = {
  financialClarity: 'Claridad financiera',
  decisionStyle: 'Estilo de decisión',
  timeHorizon: 'Horizonte temporal',
  financialPressure: 'Presión financiera',
  emotionalPattern: 'Patrón emocional',
  coherenceScore: 'Puntaje de coherencia',
};

const EMPLOYMENT_LABELS: Record<string, string> = {
  employed: 'Dependiente',
  freelance: 'Independiente',
  employed_freelance: 'Dependiente + independiente',
  student: 'Estudiante',
  employed_student: 'Estudiante + trabajo',
  freelance_student: 'Independiente + estudiante',
  employed_freelance_student: 'Dependiente + independiente + estudiante',
  unemployed: 'Sin trabajo',
  employee: 'Dependiente',
  self_employed: 'Independiente',
  retired: 'Jubilado',
};

const INCOME_BAND_LABELS: Record<string, string> = {
  no_income: 'Sin ingresos',
  '<300k': 'Hasta $300 mil',
  '300k-600k': '$300k – $600k',
  '600k-1m': '$600k – $1M',
  '600k-1M': '$600k – $1M',
  '1m-2m': '$1M – $2M',
  '1M-2M': '$1M – $2M',
  '2m-4m': '$2M – $4M',
  '2M-4M': '$2M – $4M',
  '>4m': 'Más de $4M',
  '>4M': 'Más de $4M',
  variable: 'Variable',
};

const EXPENSES_COVERAGE_LABELS: Record<string, string> = {
  surplus: 'Me sobra',
  tight: 'Llego justo',
  sometimes: 'A veces no alcanza',
  no: 'No alcanza',
};

const EXPENSE_TRACKING_LABELS: Record<string, string> = {
  yes: 'Sí, siempre',
  sometimes: 'A veces',
  no: 'No registro',
};

const SAVINGS_BAND_LABELS: Record<string, string> = {
  none: 'Sin ahorro',
  '<300k': 'Menos de $300k',
  '300k-1m': '$300k – $1M',
  '300k-1M': '$300k – $1M',
  '1m-3m': '$1M – $3M',
  '1M-3M': '$1M – $3M',
  '3m-10m': '$3M – $10M',
  '3M-10M': '$3M – $10M',
  '>10m': 'Más de $10M',
  '>10M': 'Más de $10M',
};

const RISK_REACTION_LABELS: Record<string, string> = {
  sell: 'Vendo todo',
  hold: 'Espero',
  buy_more: 'Compro más',
  never_invest: 'No invierto',
  other: 'Otro',
  reduce: 'Reducir',
  increase: 'Aumentar',
  conservative: 'Conservador',
  moderate: 'Moderado',
  aggressive: 'Agresivo',
};

const BOOLEAN_LABELS: Record<string, string> = {
  true: 'Sí',
  false: 'No',
  yes: 'Sí',
  no: 'No',
};

const FIELD_VALUE_MAPS: Record<string, Record<string, string>> = {
  financialClarity: financialClarityMap,
  decisionStyle: decisionStyleMap,
  timeHorizon: timeHorizonMap,
  financialPressure: financialPressureMap,
  emotionalPattern: emotionalPatternMap,
  employmentStatus: EMPLOYMENT_LABELS,
  incomeBand: INCOME_BAND_LABELS,
  expensesCoverage: EXPENSES_COVERAGE_LABELS,
  tracksExpenses: EXPENSE_TRACKING_LABELS,
  savingsBand: SAVINGS_BAND_LABELS,
  riskReaction: RISK_REACTION_LABELS,
};

const GENERIC_VALUE_LABELS: Record<string, string> = {
  ...BOOLEAN_LABELS,
  ...financialClarityMap,
  ...decisionStyleMap,
  ...timeHorizonMap,
  ...financialPressureMap,
  ...emotionalPatternMap,
  ...EMPLOYMENT_LABELS,
  ...INCOME_BAND_LABELS,
  ...EXPENSES_COVERAGE_LABELS,
  ...EXPENSE_TRACKING_LABELS,
  ...SAVINGS_BAND_LABELS,
  ...RISK_REACTION_LABELS,
  none: 'No declarado',
  unknown: 'No declarado',
  'no declarado': 'No declarado',
};

function normalizeFieldKey(key: string): string {
  return key
    .trim()
    .replace(/[_-]+([a-z])/g, (_, letter: string) => letter.toUpperCase())
    .replace(/^[A-Z]/, (letter) => letter.toLowerCase());
}

function lookupInMap(map: Record<string, string>, raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (map[trimmed]) return map[trimmed];
  const lower = trimmed.toLowerCase();
  if (map[lower]) return map[lower];
  return null;
}

export function localizeFieldKey(key: string): string {
  const canonical = normalizeFieldKey(key);
  return PROFILE_FIELD_LABELS[canonical] ?? PROFILE_FIELD_LABELS[key] ?? key;
}

export function localizeDisplayValue(value: unknown, fieldKey?: string): string {
  if (Array.isArray(value)) {
    return value.map((item) => localizeDisplayValue(item, fieldKey)).join(' · ');
  }
  if (typeof value === 'boolean') {
    return value ? 'Sí' : 'No';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toLocaleString('es-CL') : value.toLocaleString('es-CL', { maximumFractionDigits: 2 });
  }
  if (value === null || value === undefined) {
    return 'No declarado';
  }

  const raw = String(value).trim();
  if (!raw) return 'No declarado';

  const canonicalField = fieldKey ? normalizeFieldKey(fieldKey) : null;
  if (canonicalField) {
    const fieldMap = FIELD_VALUE_MAPS[canonicalField];
    const fieldMatch = fieldMap ? lookupInMap(fieldMap, raw) : null;
    if (fieldMatch) return fieldMatch;
  }

  const genericMatch = lookupInMap(GENERIC_VALUE_LABELS, raw);
  if (genericMatch) return genericMatch;

  return raw;
}
