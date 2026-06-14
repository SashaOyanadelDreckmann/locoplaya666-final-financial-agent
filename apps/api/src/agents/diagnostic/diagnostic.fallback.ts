import { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';

import { InterviewBlockId } from '../../orquestador/interview.flow';
import {
  DiagnosticEditorialLayer,
  FinancialDiagnosticProfile,
  InterviewBlockEvidence,
} from '../../schemas/profile.schema';

export type VoiceInterviewFallbackInput = {
  intake: IntakeQuestionnaire;
  blocks: Partial<Record<InterviewBlockId, InterviewBlockEvidence>>;
  executiveReport: string;
  keyFindings: string[];
  endedBy: string;
};

export function buildVoiceInterviewFallbackProfile(
  input: VoiceInterviewFallbackInput,
): FinancialDiagnosticProfile {
  const { intake, blocks, executiveReport, keyFindings, endedBy } = input;
  const traits = inferTraitsFromIntake(intake);
  const narrative = buildFallbackNarrative(executiveReport, keyFindings, endedBy);
  const tensions = buildFallbackTensions(intake, keyFindings);
  const hypotheses = buildFallbackHypotheses(intake, keyFindings);
  const openQuestions = buildFallbackOpenQuestions(intake, keyFindings);

  return {
    version: 'v2',
    meta: {
      completeness: estimateCompleteness(blocks),
      blocksExplored: Object.keys(blocks) as InterviewBlockId[],
      blocksSkipped: [],
      completedAt: new Date().toISOString(),
    },
    blocks,
    diagnosticNarrative: narrative,
    profile: traits,
    tensions,
    hypotheses,
    openQuestions,
    editorial: buildFallbackEditorial(intake, traits, keyFindings, executiveReport),
  };
}

function inferTraitsFromIntake(intake: IntakeQuestionnaire) {
  const source = intake as IntakeQuestionnaire & Record<string, unknown>;
  const budget = source.__budgetContext as Record<string, unknown> | undefined;
  const stress = clamp01(Number(source.moneyStressLevel ?? 5) / 10);
  const hasDebt = Boolean(source.hasDebt);
  const tracksExpenses = hasConsistentExpenseTracking(source.tracksExpenses);
  const income = Math.max(0, Number(budget?.income ?? source.exactMonthlyIncome ?? 0));
  const expenses = Math.max(0, Number(budget?.expenses ?? 0));
  const balance = Number(budget?.balance ?? income - expenses);
  const savings = Boolean(source.hasSavingsOrInvestments);

  const financialClarity: 'low' | 'medium' | 'high' =
    tracksExpenses && income > 0 ? (stress < 0.45 ? 'high' : 'medium') : stress > 0.65 ? 'low' : 'medium';

  const decisionStyle: 'reactive' | 'analytical' | 'avoidant' | 'delegated' | 'mixed' =
    tracksExpenses && savings
      ? 'analytical'
      : stress > 0.7
        ? 'avoidant'
        : hasDebt && !tracksExpenses
          ? 'reactive'
          : 'mixed';

  const timeHorizon: 'short_term' | 'mixed' | 'long_term' = savings
    ? balance >= 0
      ? 'long_term'
      : 'mixed'
    : hasDebt
      ? 'short_term'
      : 'mixed';

  const financialPressure: 'low' | 'moderate' | 'high' =
    stress >= 0.72 || (hasDebt && balance < 0)
      ? 'high'
      : stress >= 0.45 || hasDebt
        ? 'moderate'
        : 'low';

  const emotionalPattern: 'neutral' | 'anxious' | 'avoidant' | 'controlling' | 'conflicted' =
    stress >= 0.75
      ? 'anxious'
      : stress >= 0.55
        ? 'conflicted'
        : tracksExpenses
          ? 'controlling'
          : stress >= 0.35
            ? 'avoidant'
            : 'neutral';

  const planningScore = tracksExpenses ? 0.74 : 0.34;
  const debtScore = hasDebt ? 0.28 : 0.72;
  const balanceScore = income > 0 ? clamp01((balance / income + 1) / 2) : 0.5;
  const coherenceScore = clamp01((planningScore + debtScore + balanceScore + (1 - stress)) / 4);

  return {
    financialClarity,
    decisionStyle,
    timeHorizon,
    financialPressure,
    emotionalPattern,
    coherenceScore,
  };
}

function buildFallbackNarrative(executiveReport: string, keyFindings: string[], endedBy: string): string {
  const findingsBlock =
    keyFindings.length > 0
      ? ` Los hallazgos más visibles son: ${keyFindings.slice(0, 3).join('; ')}.`
      : '';
  const closeNote =
    endedBy === 'timeout'
      ? ' La entrevista cerró al agotar el tiempo disponible.'
      : endedBy === 'agent'
        ? ' La entrevista cerró cuando el entrevistador consolidó el contexto suficiente.'
        : endedBy === 'user'
          ? ' La entrevista cerró de forma anticipada por el usuario; el diagnóstico refleja solo el avance logrado.'
          : ' La entrevista cerró con el contexto disponible en ese momento.';

  return `${executiveReport.trim()}${findingsBlock}${closeNote}`.slice(0, 2400);
}

function buildFallbackTensions(intake: IntakeQuestionnaire, keyFindings: string[]): string[] {
  const source = intake as IntakeQuestionnaire & Record<string, unknown>;
  const budget = source.__budgetContext as Record<string, unknown> | undefined;
  const balance = Number(budget?.balance ?? 0);
  const stress = Number(source.moneyStressLevel ?? 0);
  const tensions = [
    stress >= 6 && balance >= 0
      ? 'Hay estabilidad operativa, pero la carga emocional sigue siendo visible.'
      : null,
    source.hasDebt && source.hasSavingsOrInvestments
      ? 'Conviven deuda activa y ahorro/inversión, lo que sugiere prioridades en tensión.'
      : null,
    lacksConsistentExpenseTracking(source.tracksExpenses) && stress >= 5
      ? 'La presión financiera aparece antes que una estructura de seguimiento consistente.'
      : null,
    ...keyFindings.slice(0, 2).map((finding) => `Hallazgo de entrevista: ${finding}`),
  ].filter(Boolean) as string[];

  return tensions.length > 0
    ? tensions.slice(0, 4)
    : ['La lectura integrada muestra señales mixtas entre flujo, hábitos y relación con el dinero.'];
}

function buildFallbackHypotheses(intake: IntakeQuestionnaire, keyFindings: string[]): string[] {
  const source = intake as IntakeQuestionnaire & Record<string, unknown>;
  const hypotheses = [
    hasConsistentExpenseTracking(source.tracksExpenses)
      ? 'El usuario tiende a operar con cierta estructura, aunque no necesariamente con tranquilidad emocional.'
      : 'El usuario podría estar tomando decisiones financieras más reactivas que planificadas.',
    source.hasDebt
      ? 'La deuda parece condicionar parte del margen de maniobra mensual.'
      : 'La ausencia de deuda visible no elimina por sí sola la sensación de presión financiera.',
    ...keyFindings.slice(0, 2).map((finding) => `La entrevista sugiere que ${finding.toLowerCase()}.`),
  ];

  return hypotheses.filter(Boolean).slice(0, 4);
}

function buildFallbackOpenQuestions(intake: IntakeQuestionnaire, keyFindings: string[]): string[] {
  const source = intake as IntakeQuestionnaire & Record<string, unknown>;
  const questions = [
    lacksConsistentExpenseTracking(source.tracksExpenses)
      ? '¿Qué parte del flujo mensual hoy se controla con datos y cuál sigue siendo intuitiva?'
      : null,
    source.hasDebt ? '¿Qué deuda concentra hoy la mayor fricción operativa o emocional?' : null,
    keyFindings.length === 0 ? '¿Qué decisión financiera reciente sintió más ambigua o postergada?' : null,
    '¿Qué objetivo financiero de mediano plazo hoy compite más con el gasto cotidiano?',
  ].filter(Boolean) as string[];

  return questions.slice(0, 4);
}

function buildFallbackEditorial(
  intake: IntakeQuestionnaire,
  traits: FinancialDiagnosticProfile['profile'],
  keyFindings: string[],
  executiveReport: string,
): DiagnosticEditorialLayer {
  const source = intake as IntakeQuestionnaire & Record<string, unknown>;
  const budget = source.__budgetContext as Record<string, unknown> | undefined;
  const income = Math.max(0, Number(budget?.income ?? source.exactMonthlyIncome ?? 0));
  const expenses = Math.max(0, Number(budget?.expenses ?? 0));
  const balance = Number(budget?.balance ?? income - expenses);
  const stress = clamp01(Number(source.moneyStressLevel ?? 0) / 10);
  const clarityScore = traits.financialClarity === 'high' ? 82 : traits.financialClarity === 'medium' ? 58 : 34;

  return {
    headline: executiveReport.split('.').find((line) => line.trim().length > 12)?.trim().slice(0, 120) ||
      'La entrevista dejó un mapa financiero suficiente para continuar.',
    dek: 'Diagnóstico consolidado con respaldo local cuando el motor principal no estuvo disponible.',
    keySignals:
      keyFindings.length > 0
        ? keyFindings.slice(0, 5)
        : [
            `Claridad ${traits.financialClarity}`,
            `Presión ${traits.financialPressure}`,
            `Horizonte ${traits.timeHorizon}`,
          ],
    scorecard: [
      {
        id: 'clarity',
        label: 'Claridad financiera',
        value: clarityScore,
        tone: clarityScore >= 70 ? 'strong' : clarityScore >= 45 ? 'watch' : 'critical',
        caption: 'Capacidad de ordenar la realidad financiera sin ruido.',
      },
      {
        id: 'coherence',
        label: 'Coherencia real',
        value: Math.round(traits.coherenceScore * 100),
        tone: traits.coherenceScore >= 0.7 ? 'strong' : traits.coherenceScore >= 0.45 ? 'watch' : 'critical',
        caption: 'Alineación entre discurso, estructura y decisiones.',
      },
      {
        id: 'stress',
        label: 'Tensión financiera',
        value: Math.round(stress * 100),
        tone: stress >= 0.7 ? 'critical' : stress >= 0.45 ? 'watch' : 'strong',
        caption: 'Carga emocional visible alrededor del dinero.',
      },
    ],
    cashflowBuckets: [
      { label: 'Ingreso', value: Math.round(income) },
      { label: 'Gasto', value: Math.round(expenses) },
      { label: 'Balance', value: Math.round(balance) },
    ],
    pressurePoints: [
      { label: 'Estrés', value: Math.round(stress * 100) },
      { label: 'Deuda', value: source.hasDebt ? 72 : 24 },
      { label: 'Holgura', value: Math.max(0, Math.round(((income - expenses) / Math.max(1, income)) * 100)) },
    ],
  };
}

function estimateCompleteness(blocks: Partial<Record<InterviewBlockId, InterviewBlockEvidence>>): number {
  const total = Object.keys(blocks).length;
  const validated = Object.values(blocks).filter((block) => block?.userValidated).length;
  if (total === 0) return 0.55;
  return Math.min(1, Math.max(0.45, validated / total));
}

function hasConsistentExpenseTracking(value: IntakeQuestionnaire['tracksExpenses'] | undefined): boolean {
  return value === 'yes';
}

function lacksConsistentExpenseTracking(value: IntakeQuestionnaire['tracksExpenses'] | undefined): boolean {
  return value === 'no' || value === 'sometimes';
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}
