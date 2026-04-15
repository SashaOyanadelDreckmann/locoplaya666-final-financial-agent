import { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';

export interface IntakeContext {
  incomeStability: 'low' | 'medium' | 'high';
  savingsAdequacy: 'none' | 'weak' | 'adequate';
  debtPressure: 'low' | 'medium' | 'high';
  financialLiteracy: 'low' | 'medium' | 'high';
  emotionalLoad: 'low' | 'moderate' | 'high';
  perceivedVsActualGap: number;
}

export function buildIntakeContext(
  intake: IntakeQuestionnaire
): IntakeContext {
  const knowledgeScore =
    Object.values(intake.financialKnowledge).filter(Boolean).length;

  const highStabilityStatuses = new Set([
    'employed',
    'employed_student',
  ]);
  const mediumStabilityStatuses = new Set([
    'freelance',
    'employed_freelance',
    'freelance_student',
    'employed_freelance_student',
  ]);

  return {
    incomeStability:
      highStabilityStatuses.has(intake.employmentStatus)
        ? 'high'
        : mediumStabilityStatuses.has(intake.employmentStatus)
        ? 'medium'
        : 'low',

    savingsAdequacy:
      !intake.hasSavingsOrInvestments
        ? 'none'
        : intake.savingsBand === 'none'
        ? 'none'
        : intake.savingsBand === '<300k'
        ? 'weak'
        : 'adequate',

    debtPressure:
      intake.hasDebt && intake.moneyStressLevel >= 6
        ? 'high'
        : intake.hasDebt
        ? 'medium'
        : 'low',

    financialLiteracy:
      knowledgeScore >= 10
        ? 'high'
        : knowledgeScore >= 6
        ? 'medium'
        : 'low',

    emotionalLoad:
      intake.moneyStressLevel >= 7
        ? 'high'
        : intake.moneyStressLevel >= 4
        ? 'moderate'
        : 'low',

    perceivedVsActualGap:
      intake.selfRatedUnderstanding / 10 -
      knowledgeScore / 15,
  };
}
