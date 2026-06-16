import {
  buildVoiceInterviewDossier,
  buildVoiceSessionInstructions,
  formatMoneyCompact,
  INTERVIEW_VOICE_OPENING_FOCUS,
  type InterviewVoiceFinalSummary,
  type InterviewVoiceSummaryEntry,
} from '@financial-agent/shared';

export type InterviewVoiceReport = {
  executive_report: string;
  key_findings: string[];
  stop_reason?: string;
  has_enough_information?: boolean;
  confidence?: 'high' | 'medium' | 'low';
  coverage_tier?: 'minimal' | 'partial' | 'substantial' | 'complete';
};

/** Persisted by voice finalize on the server (`memoryBlob.interviewVoice.lastReport`). */
export type InterviewVoiceLastReport = {
  executive_report: string;
  key_findings?: string[];
  ended_by?: string;
  stop_reason?: string;
  duration_sec?: number | null;
  has_enough_information?: boolean;
  confidence?: InterviewVoiceReport['confidence'];
  coverage_tier?: InterviewVoiceReport['coverage_tier'];
};

export type { InterviewVoiceSummaryEntry };

export type InterviewVoiceSnapshot = {
  callId?: string;
  activeCallId?: string | null;
  status?: 'idle' | 'in_progress' | 'paused' | 'completed';
  callSeconds?: number;
  totalUsedSec?: number;
  maxDurationSec?: number;
  remainingTotalSec?: number | null;
  minuteSummaries?: InterviewVoiceSummaryEntry[];
  finalSummary?: InterviewVoiceFinalSummary;
  voiceReport?: InterviewVoiceReport | null;
  /** Server finalize metadata; normalized to `voiceReport` during hydration. */
  lastReport?: InterviewVoiceLastReport | null;
  coverageTier?: InterviewVoiceReport['coverage_tier'];
  callsStarted?: number;
  completedAt?: string | null;
  startedAt?: string | null;
  lastUpdatedAt?: string | null;
};

export {
  resolveInterviewVoiceStateFlags,
  type InterviewVoiceStateFlags,
  type InterviewVoiceStateInput,
} from './interview-modal.helpers';

export {
  INTERVIEW_VOICE_OPENING_FOCUS,
  formatMoneyCompact,
  buildVoiceInterviewDossier,
  buildVoiceSessionInstructions,
};

export type VoiceSessionContext = {
  intake: unknown;
  minuteSummaries: InterviewVoiceSummaryEntry[];
  finalSummary: InterviewVoiceSnapshot['finalSummary'];
};

export function summarizeVoiceInterviewContext(intake: unknown) {
  const source = (intake ?? {}) as Record<string, unknown>;
  const products = source.__productsContext as Record<string, unknown> | undefined;
  const budget = source.__budgetContext as Record<string, unknown> | undefined;
  const parts: string[] = [];
  const knowledge =
    source.financialKnowledge && typeof source.financialKnowledge === 'object'
      ? (source.financialKnowledge as Record<string, unknown>)
      : {};
  const knownTopics = Object.entries(knowledge)
    .filter(([, value]) => value === true)
    .slice(0, 5)
    .map(([key]) => key.replace(/([A-Z])/g, ' $1').trim().toLowerCase());

  parts.push(
    [
      typeof source.age === 'number' ? `${source.age} años` : null,
      source.profession ? `profesión ${String(source.profession)}` : null,
      source.employmentStatus ? `situación ${String(source.employmentStatus).replace(/_/g, ' ')}` : null,
      typeof source.exactMonthlyIncome === 'number'
        ? `ingreso exacto ${formatMoneyCompact(source.exactMonthlyIncome)} CLP`
        : source.incomeBand
        ? `ingreso rango ${String(source.incomeBand)}`
        : null,
      source.expensesCoverage ? `cobertura ${String(source.expensesCoverage).replace(/_/g, ' ')}` : null,
      typeof source.tracksExpenses === 'boolean' ? `registra gastos ${source.tracksExpenses ? 'sí' : 'no'}` : null,
    ]
      .filter(Boolean)
      .join(', '),
  );

  parts.push(
    [
      typeof source.hasSavingsOrInvestments === 'boolean'
        ? `ahorros/inversiones ${source.hasSavingsOrInvestments ? 'sí' : 'no'}`
        : null,
      source.savingsBand ? `tramo ahorro ${String(source.savingsBand)}` : null,
      typeof source.exactSavingsAmount === 'number'
        ? `ahorro exacto ${formatMoneyCompact(source.exactSavingsAmount)} CLP`
        : null,
      typeof source.hasDebt === 'boolean' ? `deuda activa ${source.hasDebt ? 'sí' : 'no'}` : null,
    ]
      .filter(Boolean)
      .join(', '),
  );

  parts.push(
    [
      typeof source.moneyStressLevel === 'number' ? `estrés financiero ${source.moneyStressLevel}/10` : null,
      source.selfRatedUnderstanding ? `comprensión ${String(source.selfRatedUnderstanding)}` : null,
      source.riskReaction ? `reacción al riesgo ${String(source.riskReaction)}` : null,
      knownTopics.length ? `temas dominados ${knownTopics.join(' | ')}` : null,
    ]
      .filter(Boolean)
      .join(', '),
  );

  if (products && typeof products === 'object') {
    const transactionSummary =
      products.transactionSummary && typeof products.transactionSummary === 'object'
        ? (products.transactionSummary as Record<string, unknown>)
        : {};
    const alerts = Array.isArray(transactionSummary.alerts)
      ? transactionSummary.alerts.slice(0, 3).map((item) => String(item).trim()).filter(Boolean)
      : [];
    parts.push(
      `Productos: ${Math.max(0, Number(products.productsCount ?? 0))}, producto activo: ${String(products.activeProductLabel ?? 'sin foco')}, flujo neto: ${formatMoneyCompact(transactionSummary.netFlow)} CLP, movimientos: ${Math.round(Number(transactionSummary.movementCount ?? 0))}`,
    );
    if (alerts.length > 0) {
      parts.push(`Alertas detectadas: ${alerts.join(' | ')}`);
    }
  }

  if (budget && typeof budget === 'object') {
    const topRows = Array.isArray(budget.rows)
      ? budget.rows
          .slice(0, 5)
          .map((row) => {
            const item = row as Record<string, unknown>;
            return `${String(item.category ?? 'item')}: ${formatMoneyCompact(item.amount)}`;
          })
          .join(' | ')
      : '';
    parts.push(
      `Presupuesto: ingreso ${formatMoneyCompact(budget.income)} CLP, gasto ${formatMoneyCompact(budget.expenses)} CLP, balance ${formatMoneyCompact(budget.balance)} CLP, filas ${Math.round(Number(budget.rowsCount ?? 0))}`,
    );
    if (topRows) {
      parts.push(`Renglones relevantes: ${topRows}`);
    }
  }

  return parts.filter(Boolean).join('\n');
}

export function buildInterviewContextHighlights(intake: unknown, maxItems = 4) {
  return summarizeVoiceInterviewContext(intake)
    .split('\n')
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}
