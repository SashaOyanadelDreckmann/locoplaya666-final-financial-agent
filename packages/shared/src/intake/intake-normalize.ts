import type { FinancialKnowledgeChecklist, IntakeQuestionnaire } from './intake-questionnaire.types';

export const EMPTY_FINANCIAL_KNOWLEDGE: FinancialKnowledgeChecklist = {
  interest: false,
  CAE: false,
  inflation: false,
  creditCard: false,
  creditLine: false,
  loanComponents: false,
  interestRate: false,
  liquidity: false,
  returnConcept: false,
  diversification: false,
  assetVsLiability: false,
  financialRisk: false,
  capitalMarkets: false,
  alternativeInvestments: false,
  fintech: false,
};

export function normalizeFinancialKnowledge(raw: unknown): FinancialKnowledgeChecklist {
  const base = { ...EMPTY_FINANCIAL_KNOWLEDGE };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const row = raw as Record<string, unknown>;
  for (const key of Object.keys(base) as Array<keyof FinancialKnowledgeChecklist>) {
    if (typeof row[key] === 'boolean') {
      base[key] = row[key] as boolean;
    }
  }
  return base;
}

function optionalTrimmedString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value >= 0 ? value : undefined;
}

export function normalizeIntakeQuestionnaire(raw: IntakeQuestionnaire): IntakeQuestionnaire {
  return {
    ...raw,
    city: optionalTrimmedString(raw.city),
    profession: optionalTrimmedString(raw.profession),
    riskReactionOther: optionalTrimmedString(raw.riskReactionOther),
    exactMonthlyIncome: optionalFiniteNumber(raw.exactMonthlyIncome),
    exactSavingsAmount: optionalFiniteNumber(raw.exactSavingsAmount),
    financialKnowledge: normalizeFinancialKnowledge(raw.financialKnowledge),
  };
}

export function normalizeIntakeBodyForValidation(body: unknown): unknown {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const raw = body as Record<string, unknown>;
  return {
    ...raw,
    city: optionalTrimmedString(raw.city),
    profession: optionalTrimmedString(raw.profession),
    riskReactionOther: optionalTrimmedString(raw.riskReactionOther),
    exactMonthlyIncome: optionalFiniteNumber(raw.exactMonthlyIncome),
    exactSavingsAmount: optionalFiniteNumber(raw.exactSavingsAmount),
    financialKnowledge: normalizeFinancialKnowledge(raw.financialKnowledge),
  };
}

export function normalizeIntakeQuestionnaireFromRecord(
  raw: Record<string, unknown> | null | undefined,
): IntakeQuestionnaire | null {
  if (!raw || typeof raw !== 'object') return null;
  const knowledge = normalizeFinancialKnowledge(raw.financialKnowledge);
  if (typeof raw.employmentStatus !== 'string' || typeof raw.incomeBand !== 'string') return null;
  if (typeof raw.expensesCoverage !== 'string' || typeof raw.tracksExpenses !== 'string') return null;
  if (typeof raw.hasDebt !== 'boolean' || typeof raw.hasSavingsOrInvestments !== 'boolean') return null;
  if (typeof raw.riskReaction !== 'string') return null;
  if (typeof raw.selfRatedUnderstanding !== 'number' || typeof raw.moneyStressLevel !== 'number') {
    return null;
  }

  return normalizeIntakeQuestionnaire({
    age: typeof raw.age === 'number' ? raw.age : undefined,
    city: typeof raw.city === 'string' ? raw.city : undefined,
    employmentStatus: raw.employmentStatus as IntakeQuestionnaire['employmentStatus'],
    profession: typeof raw.profession === 'string' ? raw.profession : undefined,
    incomeBand: raw.incomeBand as IntakeQuestionnaire['incomeBand'],
    exactMonthlyIncome:
      typeof raw.exactMonthlyIncome === 'number' ? raw.exactMonthlyIncome : undefined,
    expensesCoverage: raw.expensesCoverage as IntakeQuestionnaire['expensesCoverage'],
    tracksExpenses: raw.tracksExpenses as IntakeQuestionnaire['tracksExpenses'],
    hasSavingsOrInvestments: raw.hasSavingsOrInvestments,
    savingsBand:
      typeof raw.savingsBand === 'string'
        ? (raw.savingsBand as IntakeQuestionnaire['savingsBand'])
        : undefined,
    exactSavingsAmount:
      typeof raw.exactSavingsAmount === 'number' ? raw.exactSavingsAmount : undefined,
    hasDebt: raw.hasDebt,
    financialKnowledge: knowledge,
    riskReaction: raw.riskReaction as IntakeQuestionnaire['riskReaction'],
    riskReactionOther:
      typeof raw.riskReactionOther === 'string' ? raw.riskReactionOther : undefined,
    selfRatedUnderstanding: raw.selfRatedUnderstanding,
    moneyStressLevel: raw.moneyStressLevel,
  });
}
