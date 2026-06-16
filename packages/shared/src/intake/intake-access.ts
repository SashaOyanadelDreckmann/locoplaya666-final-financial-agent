import type { WelcomeIntroCache } from '../welcome/welcome-intro.types';

/** Persisted session blob: immutable questionnaire + mutable financial context layers. */
export type SessionIntakeEnvelope = {
  /** Questionnaire answers — initial submit + user corrections via PATCH /intake/update. */
  intake?: Record<string, unknown>;
  intakeContext?: unknown;
  llmSummary?: unknown;
  /** Cartolas / productos — updated from panel merge. */
  productsContext?: unknown;
  /** Presupuesto — updated from panel merge. */
  budgetContext?: unknown;
  welcomeIntroCache?: WelcomeIntroCache;
};

export function hasMeaningfulIntake(
  injectedIntake: { intake?: unknown } | null | undefined,
): boolean {
  const intake = injectedIntake?.intake;
  if (!intake || typeof intake !== 'object') return false;

  const data = intake as Record<string, unknown>;
  const knowledge = data.financialKnowledge;
  const hasKnowledge =
    knowledge !== null &&
    typeof knowledge === 'object' &&
    !Array.isArray(knowledge);

  return (
    typeof data.employmentStatus === 'string' &&
    data.employmentStatus.length > 0 &&
    typeof data.incomeBand === 'string' &&
    data.incomeBand.length > 0 &&
    typeof data.expensesCoverage === 'string' &&
    typeof data.tracksExpenses === 'string' &&
    typeof data.hasSavingsOrInvestments === 'boolean' &&
    typeof data.hasDebt === 'boolean' &&
    typeof data.riskReaction === 'string' &&
    typeof data.selfRatedUnderstanding === 'number' &&
    Number.isFinite(data.selfRatedUnderstanding) &&
    typeof data.moneyStressLevel === 'number' &&
    Number.isFinite(data.moneyStressLevel) &&
    hasKnowledge
  );
}

/** Minimum gate to enter /agent (employment + income band). */
export function hasCompletedIntakeAccess(
  injectedIntake: { intake?: unknown } | null | undefined,
): boolean {
  if (hasMeaningfulIntake(injectedIntake)) return true;
  const intake = injectedIntake?.intake;
  if (!intake || typeof intake !== 'object') return false;
  const data = intake as Record<string, unknown>;
  return (
    typeof data.employmentStatus === 'string' &&
    data.employmentStatus.length > 0 &&
    typeof data.incomeBand === 'string' &&
    data.incomeBand.length > 0
  );
}

export function readSessionIntakeEnvelope(injectedIntake: unknown): SessionIntakeEnvelope {
  if (!injectedIntake || typeof injectedIntake !== 'object') return {};
  return injectedIntake as SessionIntakeEnvelope;
}
