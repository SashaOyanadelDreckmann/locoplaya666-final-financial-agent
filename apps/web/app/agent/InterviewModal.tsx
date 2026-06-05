'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { useInterviewStore } from '@/state/interview.store';
import { useProfileStore } from '@/state/profile.store';

import {
  abortInterviewRealtimeToken,
  finalizeInterviewVoiceCall,
  getInterviewRealtimeToken,
  getSessionInfo,
  nextConversationStep,
  saveInterviewVoiceState,
} from '@/lib/api';
import { ApiHttpError } from '@/lib/apiEnvelope';
import { toUserFacingError } from '@/lib/userError';
import { AiLoader } from '@/components/ui/ai-loader';
import {
  clearInterviewVoiceState,
  readInterviewVoiceState,
  writeInterviewVoiceState,
} from '@/lib/interviewVoiceState';
import { appendTranscriptChunk } from '@/lib/transcript';
import {
  INTERVIEW_CLOSEOUT_BUFFER_SEC,
  INTERVIEW_MAX_CALLS_PER_USER,
  INTERVIEW_TOTAL_LIMIT_MINUTES,
  INTERVIEW_TOTAL_LIMIT_SEC,
} from '@financial-agent/shared';

const DEFAULT_MAX_CALL_DURATION_SEC = INTERVIEW_TOTAL_LIMIT_SEC;

type InterviewVoiceReport = {
  executive_report: string;
  key_findings: string[];
  stop_reason?: string;
  has_enough_information?: boolean;
  confidence?: 'high' | 'medium' | 'low';
};

type InterviewVoiceSnapshot = {
  callId?: string;
  activeCallId?: string | null;
  status?: 'idle' | 'in_progress' | 'paused' | 'completed';
  callSeconds?: number;
  maxDurationSec?: number;
  remainingTotalSec?: number | null;
  pauseUsed?: boolean;
  voiceAgentTranscript?: string;
  voiceUserTranscript?: string;
  voicePartialTranscript?: string;
  transcript?: string;
  voiceReport?: InterviewVoiceReport | null;
  callsStarted?: number;
  completedAt?: string | null;
  startedAt?: string | null;
  lastUpdatedAt?: string | null;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onDiagnosisComplete?: () => void;
};

function formatMoneyCompact(value: unknown) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '0';
  return amount.toLocaleString('es-CL');
}

function formatBlockLabel(blockId?: string) {
  if (!blockId) return 'Exploración';
  const labels: Record<string, string> = {
    warmup: 'Apertura',
    cashflow: 'Flujo',
    resilience: 'Resiliencia',
    debt: 'Deuda',
    products: 'Productos',
    goals: 'Metas',
    knowledge: 'Comprensión',
    risk: 'Riesgo',
    emotional: 'Patrón emocional',
  };
  return labels[blockId] ?? blockId;
}

function formatIntakeFieldLabel(key: string) {
  const labels: Record<string, string> = {
    age: 'Edad',
    profession: 'Profesión',
    employmentStatus: 'Situación laboral',
    exactMonthlyIncome: 'Ingreso mensual exacto',
    incomeBand: 'Rango de ingreso',
    expensesCoverage: 'Cobertura de gastos',
    tracksExpenses: 'Registra gastos',
    hasSavingsOrInvestments: 'Tiene ahorros/inversiones',
    savingsBand: 'Tramo de ahorro',
    exactSavingsAmount: 'Ahorro exacto',
    hasDebt: 'Tiene deuda',
    moneyStressLevel: 'Estrés financiero',
    selfRatedUnderstanding: 'Autoevaluación comprensión',
    riskReaction: 'Reacción al riesgo',
    financialGoals: 'Metas financieras',
    mainFinancialConcern: 'Preocupación principal',
  };
  return labels[key] ?? key.replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim();
}

function buildSeniorVoicePersonaBlock() {
  return [
    'IDENTIDAD:',
    'Eres el entrevistador financiero senior de Financieramente — nivel family office, criterio ejecutivo, calma y precisión.',
    'VOZ Y TONO:',
    'Español chileno profesional (Santiago). Claro, sobrio, cálido sin ser informal. Usa tú; nunca voseo ni entonación rioplatense.',
    'Suenas como un director de diagnóstico con 20 años de experiencia: confiable, directo, nunca condescendiente.',
    'ESTILO DE ENTREVISTA:',
    'Una sola pregunta por turno, siempre anclada en datos reales del usuario (intake, presupuesto, cartolas).',
    'Cada 2-3 turnos entrega una microlectura ejecutiva de una frase — insight concreto, no generalidades.',
    'No expliques la plataforma ni el sistema. No repitas información que ya tienes.',
    'Valida cuando el usuario es transparente; repregunta con precisión cuando detectes inconsistencias.',
  ].join('\n');
}

function buildVoiceInterviewDossier(
  intake: unknown,
  transcriptEntries: Array<{ blockId?: string; answer?: string }>,
  completedBlocks?: Record<string, { summary?: string; signalsDetected?: string[] }>,
) {
  const source = (intake ?? {}) as Record<string, unknown>;
  const products = source.__productsContext as Record<string, unknown> | undefined;
  const budget = source.__budgetContext as Record<string, unknown> | undefined;
  const sections: string[] = [];

  sections.push('=== FICHA MAESTRA DEL USUARIO — FINANCIERAMENTE ===');
  sections.push(
    'Tienes acceso completo a 3 fuentes ya cargadas por el usuario en la plataforma. NO pidas datos que ya están abajo. Úsalos para preguntas quirúrgicas.',
  );

  // INTAKE
  const intakeLines: string[] = [];
  const skipKeys = new Set(['__productsContext', '__budgetContext']);
  for (const [key, value] of Object.entries(source)) {
    if (skipKeys.has(key) || value === null || value === undefined || value === '') continue;
    if (key === 'financialKnowledge' && typeof value === 'object') {
      const known = Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v === true)
        .map(([k]) => k);
      if (known.length) intakeLines.push(`Temas que domina: ${known.join(', ')}`);
      continue;
    }
    if (typeof value === 'object' && !Array.isArray(value)) continue;
    const label = formatIntakeFieldLabel(key);
    if (typeof value === 'boolean') intakeLines.push(`${label}: ${value ? 'sí' : 'no'}`);
    else if (typeof value === 'number' && /income|amount|savings/i.test(key))
      intakeLines.push(`${label}: ${formatMoneyCompact(value)} CLP`);
    else intakeLines.push(`${label}: ${String(value).replace(/_/g, ' ')}`);
  }
  sections.push('\n[FUENTE 1 — CUESTIONARIO / INTAKE (modal perfil)]');
  sections.push(intakeLines.length > 0 ? intakeLines.join('\n') : 'Sin intake detallado.');

  // PRODUCTOS
  sections.push('\n[FUENTE 2 — MODAL PRODUCTOS Y TRANSACCIONES (cartolas, movimientos reales)]');
  if (products && typeof products === 'object') {
    const txSummary =
      products.transactionSummary && typeof products.transactionSummary === 'object'
        ? (products.transactionSummary as Record<string, unknown>)
        : {};
    sections.push(`Productos enlazados: ${Math.max(0, Number(products.productsCount ?? 0))}`);
    sections.push(`Producto activo/foco: ${String(products.activeProductLabel ?? 'sin foco definido')}`);
    if (Array.isArray(products.uploadedFiles) && products.uploadedFiles.length > 0) {
      sections.push(`Respaldos/cartolas subidos: ${products.uploadedFiles.slice(0, 15).join(', ')}`);
    }
    sections.push(
      `Flujo agregado — entradas: ${formatMoneyCompact(txSummary.inflowsTotal)} CLP | salidas: ${formatMoneyCompact(txSummary.outflowsTotal)} CLP | neto: ${formatMoneyCompact(txSummary.netFlow)} CLP | movimientos: ${Math.round(Number(txSummary.movementCount ?? 0))}`,
    );
    const topCategories = Array.isArray(txSummary.topCategories)
      ? txSummary.topCategories
          .slice(0, 8)
          .map((c) => {
            const item = c as Record<string, unknown>;
            return `${String(item.name ?? 'cat')}: ${formatMoneyCompact(item.amount)} CLP`;
          })
          .join(' | ')
      : '';
    if (topCategories) sections.push(`Top categorías en movimientos: ${topCategories}`);
    const alerts = Array.isArray(txSummary.alerts)
      ? txSummary.alerts.slice(0, 6).map((a) => String(a)).filter(Boolean)
      : [];
    if (alerts.length) sections.push(`Alertas detectadas en productos: ${alerts.join(' | ')}`);
    const productsIndex = Array.isArray(products.productsIndex) ? products.productsIndex : [];
    for (const raw of productsIndex.slice(0, 8)) {
      const p = raw as Record<string, unknown>;
      sections.push(
        `  · ${String(p.label ?? 'Producto')} (${String(p.bank ?? '')} ${String(p.productType ?? '')}): ingresos ${formatMoneyCompact(p.inflowsTotal)} | egresos ${formatMoneyCompact(p.outflowsTotal)} | neto ${formatMoneyCompact(p.netFlow)} | ${Math.round(Number(p.movementCount ?? 0))} mov.`,
      );
    }
    const activeProduct = products.activeProduct as Record<string, unknown> | undefined;
    if (activeProduct && typeof activeProduct === 'object') {
      const topExp = Array.isArray(activeProduct.topExpenses)
        ? activeProduct.topExpenses
            .slice(0, 5)
            .map((e) => {
              const item = e as Record<string, unknown>;
              return `${String(item.label ?? item.category ?? 'gasto')}: ${formatMoneyCompact(item.amount)}`;
            })
            .join(' | ')
        : '';
      if (topExp) sections.push(`Top gastos producto activo: ${topExp}`);
      if (typeof activeProduct.dashboardSummary === 'string' && activeProduct.dashboardSummary.trim()) {
        sections.push(`Resumen dashboard producto activo: ${activeProduct.dashboardSummary.trim().slice(0, 400)}`);
      }
    }
  } else {
    sections.push('Sin productos/transacciones cargados aún.');
  }

  // PRESUPUESTO
  sections.push('\n[FUENTE 3 — MODAL PRESUPUESTO (filas reales del usuario)]');
  if (budget && typeof budget === 'object') {
    sections.push(
      `Totales — ingreso: ${formatMoneyCompact(budget.income)} CLP | gasto: ${formatMoneyCompact(budget.expenses)} CLP | balance: ${formatMoneyCompact(budget.balance)} CLP | filas con monto: ${Math.round(Number(budget.rowsCount ?? 0))}`,
    );
    const rows = Array.isArray(budget.rows) ? budget.rows : [];
    const incomeRows = rows
      .filter((r) => (r as Record<string, unknown>).type === 'income' && Number((r as Record<string, unknown>).amount ?? 0) > 0)
      .sort((a, b) => Number((b as Record<string, unknown>).amount ?? 0) - Number((a as Record<string, unknown>).amount ?? 0))
      .slice(0, 8);
    const expenseRows = rows
      .filter((r) => (r as Record<string, unknown>).type === 'expense' && Number((r as Record<string, unknown>).amount ?? 0) > 0)
      .sort((a, b) => Number((b as Record<string, unknown>).amount ?? 0) - Number((a as Record<string, unknown>).amount ?? 0))
      .slice(0, 12);
    if (incomeRows.length) {
      sections.push('Ingresos presupuesto:');
      for (const raw of incomeRows) {
        const row = raw as Record<string, unknown>;
        sections.push(`  + ${String(row.category ?? 'ingreso')}: ${formatMoneyCompact(row.amount)} CLP`);
      }
    }
    if (expenseRows.length) {
      sections.push('Gastos presupuesto:');
      for (const raw of expenseRows) {
        const row = raw as Record<string, unknown>;
        const extra = row.product ? ` [${String(row.product)}]` : row.institution ? ` [${String(row.institution)}]` : '';
        sections.push(`  - ${String(row.category ?? 'gasto')}: ${formatMoneyCompact(row.amount)} CLP${extra}`);
      }
    }
    if (Number(budget.balance ?? 0) < 0) {
      sections.push('⚠ TENSIÓN: presupuesto en rojo — prioriza preguntas sobre recorte, ingresos extra o deuda.');
    }
  } else {
    sections.push('Sin presupuesto cargado aún.');
  }

  // Tensiones heurísticas
  const tensions: string[] = [];
  if (source.tracksExpenses === false) tensions.push('Dice que no registra gastos pero hay presupuesto/cartolas — pregunta la brecha.');
  if (source.hasDebt === false && products) {
    const alerts = ((products.transactionSummary as Record<string, unknown>)?.alerts ?? []) as unknown[];
    if (Array.isArray(alerts) && alerts.some((a) => /deuda|crédito|credito|tarjeta/i.test(String(a))))
      tensions.push('Declaró sin deuda pero alertas de productos sugieren crédito — cruza con tacto y precisión.');
  }
  if (typeof source.exactMonthlyIncome === 'number' && budget && Number(budget.income ?? 0) > 0) {
    const diff = Math.abs(Number(source.exactMonthlyIncome) - Number(budget.income));
    if (diff > Number(source.exactMonthlyIncome) * 0.15)
      tensions.push(`Ingreso intake (${formatMoneyCompact(source.exactMonthlyIncome)}) vs presupuesto (${formatMoneyCompact(budget.income)}) no calza — pregunta cuál es el real.`);
  }
  if (tensions.length) {
    sections.push('\n[TENSIONES A PROFUNDIZAR (prioridad alta)]');
    sections.push(tensions.join('\n'));
  }

  // Entrevista previa
  const priorAnswers = transcriptEntries.filter((e) => e?.answer && String(e.answer).trim());
  if (priorAnswers.length > 0) {
    sections.push('\n[RESPUESTAS PREVIAS EN ESTA ENTREVISTA]');
    for (const entry of priorAnswers.slice(-8)) {
      sections.push(`  · ${formatBlockLabel(entry.blockId)}: ${String(entry.answer).trim().slice(0, 220)}`);
    }
  }
  if (completedBlocks && Object.keys(completedBlocks).length > 0) {
    sections.push('\n[BLOQUES YA CERRADOS]');
    for (const [id, block] of Object.entries(completedBlocks).slice(0, 6)) {
      sections.push(`  · ${formatBlockLabel(id)}: ${String(block.summary ?? '').slice(0, 180)}`);
      if (Array.isArray(block.signalsDetected) && block.signalsDetected.length)
        sections.push(`    Señales: ${block.signalsDetected.slice(0, 4).join(' | ')}`);
    }
  }

  sections.push(
    '\n[MANDATO DE ENTREVISTA]',
    'Cruza intake + presupuesto + productos en cada pregunta. Si hay inconsistencias, señálalas con respeto y profundiza.',
    'Objetivo: elevar el diagnóstico con evidencia, no repetir lo obvio ni sonar a formulario.',
  );

  return sections.join('\n');
}

function buildVoiceSessionInstructions(params: {
  intake: unknown;
  transcriptEntries: Array<{ blockId?: string; answer?: string }>;
  completedBlocks?: Record<string, { summary?: string; signalsDetected?: string[] }>;
  currentQuestion?: string;
  latestUserSnippet?: string;
  callPhase?: 'exploration' | 'closeout';
}) {
  const dossier = buildVoiceInterviewDossier(
    params.intake,
    params.transcriptEntries,
    params.completedBlocks,
  );
  const blocks = [
    buildSeniorVoicePersonaBlock(),
    `TIEMPO DE LLAMADA: máximo ${INTERVIEW_TOTAL_LIMIT_MINUTES} minutos. En los últimos ${INTERVIEW_CLOSEOUT_BUFFER_SEC} segundos cierra con <<CALL_COMPLETE>> y síntesis ejecutiva breve.`,
    'CONCIENCIA DEL SISTEMA: El usuario completó cuestionario (intake), cargó productos/cartolas y armó presupuesto en Financieramente. Toda la evidencia está abajo — cita montos, categorías o alertas concretas; no pidas lo que ya tienes.',
    dossier,
  ];
  if (params.currentQuestion?.trim()) {
    blocks.push(`PREGUNTA GUÍA DEL BLOQUE ACTIVO (para orientar profundidad, no la leas textual): ${params.currentQuestion.trim()}`);
  }
  if (params.latestUserSnippet?.trim()) {
    blocks.push(`ÚLTIMA RESPUESTA DEL USUARIO (incorpora y repregunta con precisión):\n${params.latestUserSnippet.trim()}`);
  }
  if (params.callPhase === 'closeout') {
    blocks.push(
      'FASE CIERRE: No abras temas nuevos. Sintetiza hallazgos principales en tono ejecutivo. Cierra con <<CALL_COMPLETE>>.',
    );
  } else {
    blocks.push(
      'MANDATO: Cada pregunta debe cruzar al menos dos fuentes (intake + presupuesto, presupuesto + cartola, etc.). Mantén estándar senior en todo momento.',
    );
  }
  return blocks.join('\n\n');
}

type VoiceSessionContext = {
  intake: unknown;
  transcriptEntries: Array<{ blockId?: string; answer?: string }>;
  completedBlocks: Record<string, { summary?: string; signalsDetected?: string[] }>;
  currentQuestion: string;
};

function emitVoiceSessionContext(
  sendVoiceEvent: ((payload: Record<string, unknown>) => void) | null,
  ctx: VoiceSessionContext,
  options?: {
    latestUserSnippet?: string;
    callPhase?: 'exploration' | 'closeout';
    startingFocus?: string;
    triggerResponse?: boolean;
  },
) {
  if (!sendVoiceEvent) return;
  sendVoiceEvent({
    type: 'session.update',
    session: {
      instructions: buildVoiceSessionInstructions({
        intake: ctx.intake,
        transcriptEntries: ctx.transcriptEntries,
        completedBlocks: ctx.completedBlocks,
        currentQuestion: ctx.currentQuestion,
        latestUserSnippet: options?.latestUserSnippet,
        callPhase: options?.callPhase ?? 'exploration',
      }),
    },
  });
  if (!options?.triggerResponse) return;
  const focus =
    options.startingFocus ||
    ctx.currentQuestion ||
    'Profundiza la tensión más relevante entre intake, presupuesto y cartolas.';
  sendVoiceEvent({
    type: 'response.create',
    response: {
      output_modalities: ['audio'],
      instructions: [
        'Inicia con tono ejecutivo chileno, sobrio y preciso.',
        'Demuestra dominio del caso citando un dato concreto del presupuesto, cartola o intake.',
        'Formula una sola pregunta de alto valor para profundizar el diagnóstico.',
        `Foco: ${focus}`,
      ].join(' '),
    },
  });
}

function summarizeVoiceInterviewContext(intake: unknown, transcriptEntries: Array<{ blockId?: string; answer?: string }>) {
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

  const priorAnswers = transcriptEntries
    .filter((entry) => entry?.answer && String(entry.answer).trim())
    .slice(-3)
    .map((entry) => `${formatBlockLabel(entry.blockId)}: ${String(entry.answer).trim().slice(0, 180)}`);
  if (priorAnswers.length > 0) {
    parts.push(`Respuestas previas: ${priorAnswers.join(' | ')}`);
  }

  return parts.map((item) => item.trim()).filter(Boolean).join(' || ');
}

function formatClock(totalSeconds: number | null) {
  if (totalSeconds === null) return '—';
  const safe = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(safe / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function InterviewModal({ isOpen, onClose, onDiagnosisComplete }: Props) {
  const router = useRouter();
  const bootedRef = useRef(false);
  const modalRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const eventIdRef = useRef(0);

  const {
    intake,
    answersByBlock,
    transcriptEntries,
    completedBlocks,
    lastResponse,
    addAnswer,
    resetBlock,
    setIntake,
    setResponse,
  } = useInterviewStore();

  const { setProfile } = useProfileStore();
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceConnecting, setVoiceConnecting] = useState(false);
  const [voiceConnected, setVoiceConnected] = useState(false);
  const [voiceListening, setVoiceListening] = useState(false);
  const [voiceSpeaking, setVoiceSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceAgentTranscript, setVoiceAgentTranscript] = useState('');
  const [voiceUserTranscript, setVoiceUserTranscript] = useState('');
  const [voicePartialTranscript, setVoicePartialTranscript] = useState('');
  const [voicePaused, setVoicePaused] = useState(false);
  const [pauseUsed, setPauseUsed] = useState(false);
  const [callSeconds, setCallSeconds] = useState(0);
  const [maxCallDurationSec, setMaxCallDurationSec] = useState(DEFAULT_MAX_CALL_DURATION_SEC);
  const [remainingTotalSec, setRemainingTotalSec] = useState<number | null>(null);
  const [callId, setCallId] = useState<string | null>(null);
  const [callsStarted, setCallsStarted] = useState(0);
  const [latestDiagnosticProfileId, setLatestDiagnosticProfileId] = useState<string | null>(null);
  const [isFinalizingCall, setIsFinalizingCall] = useState(false);
  const [voiceReport, setVoiceReport] = useState<InterviewVoiceReport | null>(null);
  const [intakeReady, setIntakeReady] = useState(false);
  const [microphoneReady, setMicrophoneReady] = useState(false);
  const [summaryComment, setSummaryComment] = useState('');
  const [summarySubmitting, setSummarySubmitting] = useState(false);
  const [isGeneratingDiagnosis, setIsGeneratingDiagnosis] = useState(false);
  const [bootError, setBootError] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [sessionAlreadyCompleted, setSessionAlreadyCompleted] = useState(false);
  const voiceSyncTimerRef = useRef<number | null>(null);
  /** Set to true once the server token is received; cleared on DataChannel open (success) or catch (abort). */
  const tokenIssuedRef = useRef(false);
  const voiceStateHydratedRef = useRef(false);
  const voiceSessionContextRef = useRef<VoiceSessionContext>({
    intake: null,
    transcriptEntries: [],
    completedBlocks: {},
    currentQuestion: '',
  });
  const sendVoiceEventRef = useRef<((payload: Record<string, unknown>) => void) | null>(null);
  const voiceResumeModeRef = useRef(false);
  const voiceAutoFinalizeRef = useRef(false);
  const voiceFinalizeTriggeredRef = useRef(false);
  const closeoutPromptSentRef = useRef(false);
  const voiceTranscriptRef = useRef({
    agent: '',
    user: '',
    partial: '',
  });
  const callSecondsRef = useRef(0);

  const currentQuestion =
    lastResponse?.type === 'question' && typeof lastResponse.question === 'string'
      ? lastResponse.question
      : '';
  const currentSummary =
    lastResponse?.type === 'block_summary' && typeof lastResponse.summary === 'string'
      ? lastResponse.summary
      : '';
  const awaitingSummaryValidation = Boolean(currentSummary);

  const interviewTranscriptSnapshot = useMemo(() => {
    const lines: string[] = [];

    for (const entry of transcriptEntries) {
      if (!entry?.answer || !String(entry.answer).trim()) continue;
      lines.push(`USUARIO [${entry.blockId}]: ${String(entry.answer).trim()}`);
    }

    return lines.join('\n').trim();
  }, [transcriptEntries]);

  useEffect(() => {
    voiceSessionContextRef.current = {
      intake,
      transcriptEntries,
      completedBlocks,
      currentQuestion,
    };
  }, [intake, transcriptEntries, completedBlocks, currentQuestion]);

  const hasCompletedVoiceInterview =
    Boolean(latestDiagnosticProfileId) || Boolean(voiceReport?.executive_report);
  const hasEverStartedVoiceCall =
    Boolean(callId) || callsStarted > 0 || callSeconds > 0 || Boolean(voiceReport);
  const hasRemainingInterviewTime =
    remainingTotalSec === null ? callSeconds < maxCallDurationSec : remainingTotalSec > 0;
  const hasLiveVoiceCall =
    Boolean(callId) && !hasCompletedVoiceInterview && hasRemainingInterviewTime;
  const isClosingWindow =
    voiceConnected &&
    hasRemainingInterviewTime &&
    (remainingTotalSec ?? Math.max(0, maxCallDurationSec - callSeconds)) <= INTERVIEW_CLOSEOUT_BUFFER_SEC;
  const voiceCallExhausted =
    !hasCompletedVoiceInterview &&
    !hasRemainingInterviewTime &&
    Boolean(callId || callsStarted > 0 || callSeconds > 0 || voiceReport);
  const voiceInterviewLocked = hasCompletedVoiceInterview || voiceCallExhausted;

  function handleUnauthorized(error: unknown) {
    if (error instanceof ApiHttpError && error.status === 401) {
      router.replace('/login');
      return true;
    }
    return false;
  }

  function getFocusableElements() {
    if (!modalRef.current) return [] as HTMLElement[];
    return Array.from(
      modalRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ),
    ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
  }

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    bootedRef.current = false;
    setIntakeReady(false);
    setBootError(null);
    setSessionAlreadyCompleted(false);
    voiceStateHydratedRef.current = false;
    voiceAutoFinalizeRef.current = false;
    voiceFinalizeTriggeredRef.current = false;
    closeoutPromptSentRef.current = false;

    async function hydrateInterviewContext() {
      try {
        const session = await getSessionInfo();
        const sessionIntake = session?.injectedIntake?.intake;
        const productsContext = session?.injectedIntake?.productsContext;
        const budgetContext = session?.injectedIntake?.budgetContext;
        const sessionVoice = (session?.interviewVoice ?? null) as InterviewVoiceSnapshot | null;
        const sessionDiagnosticProfileId =
          typeof session?.latestDiagnosticProfileId === 'string' && session.latestDiagnosticProfileId.length > 0
            ? session.latestDiagnosticProfileId
            : null;

        if (!cancelled && sessionIntake && typeof sessionIntake === 'object') {
          const mergedIntake = {
            ...(sessionIntake as Record<string, unknown>),
            __productsContext: productsContext ?? null,
            __budgetContext: budgetContext ?? null,
          };
          if (!intake) {
            setIntake(mergedIntake as any);
          } else {
            const current = intake as unknown as Record<string, unknown>;
            setIntake({
              ...current,
              __productsContext: current.__productsContext ?? productsContext ?? null,
              __budgetContext: current.__budgetContext ?? budgetContext ?? null,
            } as any);
          }
        } else if (!cancelled && !intake && !sessionIntake) {
          setBootError(
            'No se encontró información de perfil. Completa el cuestionario de intake para iniciar la entrevista.',
          );
          return;
        }

        if (!cancelled) {
          const saved = readInterviewVoiceState();
          const localSaved = saved && typeof saved === 'object' ? (saved as InterviewVoiceSnapshot) : null;

          /**
           * Merge strategy (senior rule):
           *   - Server (sessionVoice) is the source of truth for quota/timer fields:
           *     callsStarted, remainingTotalSec, maxDurationSec, status, completedAt, voiceReport, activeCallId.
           *   - Local sessionStorage wins only for transcript fields (not yet synced to server):
           *     voiceAgentTranscript, voiceUserTranscript, voicePartialTranscript.
           *   - callSeconds: take the larger of both (most recent progress).
           */
          const snapshot: InterviewVoiceSnapshot | null =
            localSaved || sessionVoice
              ? ({
                  ...(localSaved ?? {}),
                  // --- Server overrides all quota/timer/status fields ---
                  ...(sessionVoice
                    ? {
                        callsStarted: sessionVoice.callsStarted,
                        remainingTotalSec: sessionVoice.remainingTotalSec,
                        maxDurationSec: sessionVoice.maxDurationSec ?? localSaved?.maxDurationSec,
                        status: sessionVoice.status ?? localSaved?.status,
                        completedAt: sessionVoice.completedAt ?? localSaved?.completedAt,
                        voiceReport: sessionVoice.voiceReport ?? localSaved?.voiceReport,
                        callId: sessionVoice.activeCallId ?? sessionVoice.callId ?? localSaved?.callId,
                        callSeconds: Math.max(
                          Number(sessionVoice.callSeconds ?? 0),
                          Number(localSaved?.callSeconds ?? 0),
                        ),
                        pauseUsed: sessionVoice.pauseUsed ?? localSaved?.pauseUsed,
                      }
                    : {}),
                  // --- Local wins for transcripts (more up-to-date before server sync) ---
                  voiceAgentTranscript:
                    localSaved?.voiceAgentTranscript ||
                    sessionVoice?.voiceAgentTranscript ||
                    undefined,
                  voiceUserTranscript:
                    localSaved?.voiceUserTranscript ||
                    sessionVoice?.voiceUserTranscript ||
                    undefined,
                  voicePartialTranscript:
                    localSaved?.voicePartialTranscript ||
                    sessionVoice?.voicePartialTranscript ||
                    undefined,
                } as InterviewVoiceSnapshot)
              : null;

          if (snapshot && typeof snapshot === 'object') {
            if (typeof snapshot.callsStarted === 'number') {
              setCallsStarted(Math.max(0, Math.floor(snapshot.callsStarted)));
            }
            if (typeof snapshot.callSeconds === 'number') {
              setCallSeconds(Math.max(0, Math.floor(snapshot.callSeconds)));
            }
            if (typeof snapshot.maxDurationSec === 'number' && snapshot.maxDurationSec > 0) {
              setMaxCallDurationSec(
                Math.min(DEFAULT_MAX_CALL_DURATION_SEC, Math.max(1, Math.floor(snapshot.maxDurationSec))),
              );
            }
            if (typeof snapshot.remainingTotalSec === 'number') {
              setRemainingTotalSec(
                Math.min(DEFAULT_MAX_CALL_DURATION_SEC, Math.max(0, Math.floor(snapshot.remainingTotalSec))),
              );
            }
            if (typeof snapshot.callId === 'string' && snapshot.callId.length > 0) {
              setCallId(snapshot.callId);
            } else if (typeof snapshot.activeCallId === 'string' && snapshot.activeCallId.length > 0) {
              setCallId(snapshot.activeCallId);
            }
            if (typeof snapshot.pauseUsed === 'boolean') setPauseUsed(snapshot.pauseUsed);
            if (typeof snapshot.voiceAgentTranscript === 'string') {
              setVoiceAgentTranscript(snapshot.voiceAgentTranscript);
            }
            if (typeof snapshot.voiceUserTranscript === 'string') {
              setVoiceUserTranscript(snapshot.voiceUserTranscript);
            }
            if (typeof snapshot.voicePartialTranscript === 'string') {
              setVoicePartialTranscript(snapshot.voicePartialTranscript);
            }
            if (snapshot.voiceReport && typeof snapshot.voiceReport === 'object') {
              setVoiceReport(snapshot.voiceReport);
            }
          }
          if (sessionDiagnosticProfileId) {
            setLatestDiagnosticProfileId(sessionDiagnosticProfileId);
          }
          if (
            sessionDiagnosticProfileId ||
            snapshot?.status === 'completed' ||
            Boolean(snapshot?.completedAt) ||
            Boolean(snapshot?.voiceReport)
          ) {
            clearInterviewVoiceState();
            setSessionAlreadyCompleted(true);
            if (snapshot?.voiceReport && typeof snapshot.voiceReport === 'object') {
              setVoiceReport(snapshot.voiceReport as InterviewVoiceReport);
            }
            return;
          }
          voiceStateHydratedRef.current = true;
        }
      } catch (error) {
        if (!cancelled && handleUnauthorized(error)) return;
        if (!cancelled && !intake) {
          setBootError('Error al cargar la sesión. Verifica tu conexión e intenta de nuevo.');
          return;
        }
      } finally {
        if (!cancelled) setIntakeReady(true);
      }
    }

    void hydrateInterviewContext();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) return;
    setIsGeneratingDiagnosis(false);
    setSyncError(null);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusTimer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        if (isGeneratingDiagnosis || isFinalizingCall || voiceConnected || voiceConnecting) return;
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = getFocusableElements();
      if (focusable.length === 0) {
        event.preventDefault();
        modalRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const insideModal = activeElement ? modalRef.current?.contains(activeElement) : false;

      if (!insideModal) {
        event.preventDefault();
        first.focus();
        return;
      }

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = previousOverflow;
      if (restoreFocusRef.current && document.contains(restoreFocusRef.current)) {
        restoreFocusRef.current.focus();
      }
    };
  }, [isOpen, onClose, isGeneratingDiagnosis, isFinalizingCall, voiceConnected, voiceConnecting]);

  useEffect(() => {
    setVoiceSupported(
      typeof window !== 'undefined' &&
        typeof window.RTCPeerConnection !== 'undefined' &&
        typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia
    );
  }, []);

  // Boot contextual blocks in background (voice session does not depend on this)
  useEffect(() => {
    if (!isOpen || !intakeReady || !intake || bootedRef.current || currentQuestion) {
      return;
    }
    bootedRef.current = true;
    setBootError(null);

    nextConversationStep({
      intake,
      completedBlocks,
      interviewTranscript: interviewTranscriptSnapshot,
    })
      .then(setResponse)
      .catch((error) => {
        if (handleUnauthorized(error)) return;
        setBootError(toUserFacingError(error, 'interview.voice'));
      });
  }, [
    isOpen,
    intakeReady,
    intake,
    completedBlocks,
    currentQuestion,
    interviewTranscriptSnapshot,
    setResponse,
  ]);

  // Auto-advance
  useEffect(() => {
    if (!isOpen || voiceInterviewLocked || lastResponse?.type !== 'block_completed') return;

    const updatedCompleted = lastResponse.completedBlocks ?? completedBlocks;

    nextConversationStep({
      intake,
      completedBlocks: updatedCompleted,
      interviewTranscript: interviewTranscriptSnapshot,
    })
      .then((res) => {
        if (res?.blockId) resetBlock(res.blockId);
        setResponse(res);
      })
      .catch((error) => {
        if (handleUnauthorized(error)) return;
        setBootError(toUserFacingError(error, 'interview.voice'));
      });
  }, [isOpen, lastResponse, intake, completedBlocks, resetBlock, setResponse, voiceInterviewLocked, interviewTranscriptSnapshot]);

  useEffect(() => {
    if (!isOpen) return;
    writeInterviewVoiceState({
      callsStarted,
      callSeconds,
      maxCallDurationSec,
      remainingTotalSec,
      callId,
      activeCallId: callId ?? undefined,
      pauseUsed,
      voiceAgentTranscript,
      voiceUserTranscript,
      voicePartialTranscript,
      voiceReport,
      updatedAt: new Date().toISOString(),
    });
  }, [
    isOpen,
    callsStarted,
    callSeconds,
    maxCallDurationSec,
    remainingTotalSec,
    callId,
    pauseUsed,
    voiceAgentTranscript,
    voiceUserTranscript,
    voicePartialTranscript,
    voiceReport,
  ]);

  useEffect(() => {
    voiceTranscriptRef.current = {
      agent: voiceAgentTranscript,
      user: voiceUserTranscript,
      partial: voicePartialTranscript,
    };
  }, [voiceAgentTranscript, voiceUserTranscript, voicePartialTranscript]);

  useEffect(() => {
    callSecondsRef.current = callSeconds;
  }, [callSeconds]);

  useEffect(() => {
    if (!isOpen || !voiceStateHydratedRef.current) return;
    if (voiceSyncTimerRef.current) window.clearTimeout(voiceSyncTimerRef.current);

    const hasContent =
      Boolean(callId) ||
      Boolean(voiceAgentTranscript.trim()) ||
      Boolean(voiceUserTranscript.trim()) ||
      Boolean(voicePartialTranscript.trim()) ||
      Boolean(voiceReport);
    if (!hasContent) return;

    const status: InterviewVoiceSnapshot['status'] = voiceReport
      ? 'completed'
      : voiceConnected
      ? voicePaused
        ? 'paused'
        : 'in_progress'
      : callId
      ? 'paused'
      : 'idle';

    voiceSyncTimerRef.current = window.setTimeout(() => {
      const snapshot: InterviewVoiceSnapshot = {
        callsStarted,
        callId: callId ?? undefined,
        activeCallId: callId ?? undefined,
        status,
        callSeconds,
        maxDurationSec: Math.min(DEFAULT_MAX_CALL_DURATION_SEC, maxCallDurationSec),
        remainingTotalSec:
          remainingTotalSec === null
            ? null
            : Math.min(DEFAULT_MAX_CALL_DURATION_SEC, remainingTotalSec),
        pauseUsed,
        voiceAgentTranscript,
        voiceUserTranscript,
        voicePartialTranscript,
        completedAt: voiceReport ? new Date().toISOString() : undefined,
        transcript: [
          voiceAgentTranscript ? `AGENTE:\n${voiceAgentTranscript}` : '',
          voiceUserTranscript ? `USUARIO:\n${voiceUserTranscript}` : '',
        ]
          .filter(Boolean)
          .join('\n\n')
          .trim(),
        voiceReport,
      };

      writeInterviewVoiceState(snapshot);
      void saveInterviewVoiceState(snapshot).catch(() => {
        setSyncError('No se pudo sincronizar el progreso. La entrevista continúa; se reintentará en el próximo ciclo.');
        window.setTimeout(() => setSyncError(null), 6000);
      });
    }, 600);

    return () => {
      if (voiceSyncTimerRef.current) window.clearTimeout(voiceSyncTimerRef.current);
    };
  }, [
    isOpen,
    callsStarted,
    callId,
    callSeconds,
    maxCallDurationSec,
    remainingTotalSec,
    pauseUsed,
    voiceAgentTranscript,
    voiceUserTranscript,
    voicePartialTranscript,
    voiceReport,
    voiceConnected,
    voicePaused,
  ]);

  // Only derive remaining time from local counter when the server has NOT provided a value yet.
  // Once the server sets remainingTotalSec (via token or hydration), the call timer takes over.
  useEffect(() => {
    if (!isOpen || remainingTotalSec !== null) return;
    setRemainingTotalSec(Math.max(0, maxCallDurationSec - callSeconds));
  }, [isOpen, callSeconds, maxCallDurationSec, remainingTotalSec]);

  // Cleanup on unmount / close
  useEffect(() => {
    return () => {
      if (voiceSyncTimerRef.current) window.clearTimeout(voiceSyncTimerRef.current);
      if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
        try { dataChannelRef.current.close(); } catch {}
      }
      if (peerConnectionRef.current) {
        try { peerConnectionRef.current.close(); } catch {}
      }
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (remoteAudioRef.current) {
        remoteAudioRef.current.pause();
        remoteAudioRef.current.srcObject = null;
      }
    };
  }, []);

  // Call timer
  useEffect(() => {
    if (!isOpen || !voiceConnected || voicePaused) return;
    const timer = window.setInterval(() => {
      setCallSeconds((prev) => {
        const next = prev + 1;
        const nextRemaining = Math.max(0, maxCallDurationSec - next);
        setRemainingTotalSec(nextRemaining);
        if (next >= maxCallDurationSec) {
          window.clearInterval(timer);
          setRemainingTotalSec(0);
          void finalizeCallAndGenerateReport('timeout', { durationSecOverride: next });
        }
        return next;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isOpen, voiceConnected, voicePaused, maxCallDurationSec]);

  useEffect(() => {
    if (!isOpen || voiceReport || !voiceCallExhausted || isFinalizingCall) return;
    if (voiceAutoFinalizeRef.current) return;

    const persistedState = readInterviewVoiceState();
    const transcript = [
      voiceTranscriptRef.current.agent,
      voiceTranscriptRef.current.user,
      voiceTranscriptRef.current.partial,
      typeof persistedState?.transcript === 'string' ? persistedState.transcript : '',
    ]
      .map((item) => String(item ?? '').trim())
      .filter(Boolean)
      .join('\n\n')
      .trim();

    if (transcript.length < 10) return;

    voiceAutoFinalizeRef.current = true;
    void finalizeCallAndGenerateReport('timeout');
  }, [isOpen, voiceCallExhausted, voiceReport, isFinalizingCall]);

  useEffect(() => {
    if (!isOpen || !isClosingWindow || closeoutPromptSentRef.current) return;
    closeoutPromptSentRef.current = true;
    emitVoiceSessionContext(sendVoiceEventRef.current, voiceSessionContextRef.current, {
      callPhase: 'closeout',
      triggerResponse: true,
      startingFocus: 'Cierra la entrevista con síntesis ejecutiva clara. Empieza con <<CALL_COMPLETE>>.',
    });
  }, [isOpen, isClosingWindow]);

  // Auto-finalize on agent completion signal
  useEffect(() => {
    const normalized = voiceAgentTranscript.toUpperCase();
    if (!voiceConnected || isFinalizingCall || voiceFinalizeTriggeredRef.current) return;
    if (!normalized.includes('<<CALL_COMPLETE>>')) return;
    voiceFinalizeTriggeredRef.current = true;
    void finalizeCallAndGenerateReport('agent');
  }, [voiceAgentTranscript, voiceConnected, isFinalizingCall]);

  if (!isOpen) return null;

  const blockVoiceInteraction =
    voiceConnected || voiceConnecting || isFinalizingCall || isGeneratingDiagnosis;
  const canDismissOverlay = !blockVoiceInteraction;

  function handleOverlayDismiss() {
    if (!canDismissOverlay) return;
    onClose();
  }

  const blockId = lastResponse?.blockId;
  const answersInBlock = blockId ? answersByBlock[blockId] ?? [] : [];
  const hasSavedVoiceState =
    Boolean(callId) ||
    callSeconds > 0 ||
    Boolean(voiceAgentTranscript.trim()) ||
    Boolean(voiceUserTranscript.trim()) ||
    Boolean(voicePartialTranscript.trim()) ||
    Boolean(voiceReport);

  const stageLabel =
    voiceReport?.executive_report
      ? 'Diagnóstico listo'
      : voiceCallExhausted
      ? 'Llamada agotada'
      : voiceConnected
      ? 'En llamada'
      : hasEverStartedVoiceCall
      ? hasRemainingInterviewTime
        ? 'Pausada'
        : 'Llamada agotada'
      : 'Lista para iniciar';
  const callTimeLabel = `${Math.floor(callSeconds / 60).toString().padStart(2, '0')}:${(callSeconds % 60).toString().padStart(2, '0')}`;
  const maxCallTimeLabel = `${Math.floor(maxCallDurationSec / 60).toString().padStart(2, '0')}:${(maxCallDurationSec % 60).toString().padStart(2, '0')}`;

  const intakeSnapshot = [
    intake?.profession ? String(intake.profession) : null,
    intake?.employmentStatus ? String(intake.employmentStatus).replace(/_/g, ' / ') : null,
    intake?.incomeBand ? String(intake.incomeBand) : null,
    typeof intake?.moneyStressLevel === 'number' ? `Estrés ${intake.moneyStressLevel}/10` : null,
  ].filter(Boolean) as string[];

  const interviewContextSummary = summarizeVoiceInterviewContext(intake, transcriptEntries);
  const voiceKnowledgePacket = buildVoiceInterviewDossier(intake, transcriptEntries, completedBlocks);
  const enrichedIntake = intake as Record<string, unknown> | null;
  const productsContext = enrichedIntake?.__productsContext as Record<string, unknown> | undefined;
  const budgetContext = enrichedIntake?.__budgetContext as Record<string, unknown> | undefined;
  const currentBlockLabel = formatBlockLabel(blockId);
  const completedBlockCount = Object.keys(completedBlocks ?? {}).length;
  const productCount = Math.max(0, Number(productsContext?.productsCount ?? 0));
  const budgetBalance = Math.round(Number(budgetContext?.balance ?? 0));
  const budgetRowsCount = Math.max(0, Number(budgetContext?.rowsCount ?? 0));
  const interviewBriefPoints = [
    productCount > 0 ? `${productCount} producto${productCount === 1 ? '' : 's'} enlazado${productCount === 1 ? '' : 's'}` : null,
    budgetRowsCount > 0 ? `${budgetRowsCount} fila${budgetRowsCount === 1 ? '' : 's'} reales de presupuesto` : null,
    Number.isFinite(budgetBalance) && budgetRowsCount > 0
      ? `Balance mensual ${budgetBalance >= 0 ? '+' : ''}${budgetBalance.toLocaleString('es-CL')}`
      : null,
  ].filter(Boolean) as string[];
  const contextHighlights = interviewContextSummary
    ? interviewContextSummary
        .split('||')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 4)
    : [];
  const sessionStatusItems = [
    {
      label: 'Estado',
      value: stageLabel,
      tone: voiceConnected ? 'is-live' : voiceReport ? 'is-done' : '',
    },
    {
      label: 'Bloque activo',
      value: currentBlockLabel,
      tone: awaitingSummaryValidation ? 'is-review' : '',
    },
    {
      label: 'Cierre',
      value: voiceReport ? 'Informe listo' : awaitingSummaryValidation ? 'Validación pendiente' : isClosingWindow ? 'Ventana final' : 'Exploración abierta',
      tone: isClosingWindow ? 'is-closing' : voiceReport ? 'is-done' : '',
    },
  ];
  const workspaceCoachNote = awaitingSummaryValidation
    ? 'Puedes validar el bloque en paralelo. La llamada sigue disponible.'
    : voiceConnected
    ? 'Responde con ejemplos concretos. El entrevistador ya tiene tu intake, presupuesto y cartolas.'
    : hasEverStartedVoiceCall
    ? 'Puedes retomar la llamada donde quedó.'
    : 'Inicia la llamada para una entrevista ejecutiva breve con contexto completo.';

  const callProgressPct = Math.max(0, Math.min(100, Math.round((callSeconds / Math.max(1, maxCallDurationSec)) * 100)));

  function nextVoiceEventId() {
    eventIdRef.current += 1;
    return `voice-event-${eventIdRef.current}`;
  }

  function cleanupVoiceSession() {
    setVoiceConnected(false);
    setVoiceConnecting(false);
    setVoiceListening(false);
    setVoiceSpeaking(false);
    setVoicePaused(false);
    setMicrophoneReady(false);
    voiceResumeModeRef.current = false;
    closeoutPromptSentRef.current = false;
    if (dataChannelRef.current && dataChannelRef.current.readyState === 'open') {
      try { dataChannelRef.current.close(); } catch {}
    }
    if (peerConnectionRef.current) {
      try { peerConnectionRef.current.close(); } catch {}
    }
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    peerConnectionRef.current = null;
    dataChannelRef.current = null;
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
    }
  }

  function sendVoiceEvent(payload: Record<string, unknown>) {
    const dc = dataChannelRef.current;
    if (!dc || dc.readyState !== 'open') return;
    dc.send(JSON.stringify({ event_id: nextVoiceEventId(), ...payload }));
  }

  sendVoiceEventRef.current = sendVoiceEvent;

  function pushVoiceSessionContext(options?: {
    latestUserSnippet?: string;
    callPhase?: 'exploration' | 'closeout';
    startingFocus?: string;
    triggerResponse?: boolean;
  }) {
    emitVoiceSessionContext(sendVoiceEventRef.current, voiceSessionContextRef.current, options);
  }

  function primeVoiceQuestion(question: string, options?: { resetTranscript?: boolean }) {
    const startingFocus =
      question ||
      `Profundiza el bloque ${currentBlockLabel.toLowerCase()} cruzando intake, presupuesto y productos.`;
    if (options?.resetTranscript !== false) {
      setVoiceAgentTranscript('');
      setVoiceUserTranscript('');
      setVoicePartialTranscript('');
    }
    pushVoiceSessionContext({ startingFocus, triggerResponse: true });
  }

  function resolveVoiceCapabilityIssue() {
    if (typeof window === 'undefined') return null;
    if (!window.isSecureContext) {
      return 'La llamada en tiempo real requiere un contexto seguro (HTTPS o localhost).';
    }
    return null;
  }

  async function startVoiceSession() {
    if (!voiceSupported || voiceConnecting || voiceConnected) return;
    if (voiceCallExhausted && !hasLiveVoiceCall) {
      setVoiceError('El tiempo de la entrevista se agotó. Genera el informe con el botón inferior.');
      return;
    }
    if (voiceInterviewLocked && !hasLiveVoiceCall) {
      setVoiceError('Esta entrevista senior ya quedó cerrada y no admite otra llamada.');
      return;
    }
    if (!hasLiveVoiceCall && callsStarted >= INTERVIEW_MAX_CALLS_PER_USER) {
      setVoiceError('Solo se permite una llamada por usuario en esta entrevista.');
      return;
    }

    const capabilityIssue = resolveVoiceCapabilityIssue();
    if (capabilityIssue) { setVoiceError(capabilityIssue); return; }

    setVoiceError(null);
    setVoiceConnecting(true);
    closeoutPromptSentRef.current = false;

    try {
      const token = await getInterviewRealtimeToken();
      const ephemeralKey = token?.value;
      if (!ephemeralKey) throw new Error('No se recibió un client_secret válido');
      const tokenCallId = typeof token?.call_id === 'string' ? token.call_id : null;
      const hasPersistedCall =
        !voiceReport &&
        (Boolean(callId) ||
          callSeconds > 0 ||
          Boolean(voiceAgentTranscript.trim()) ||
          Boolean(voiceUserTranscript.trim()) ||
          Boolean(voicePartialTranscript.trim()));
      const nextCallId = tokenCallId ?? (hasPersistedCall ? callId : null) ?? null;
      voiceResumeModeRef.current = hasPersistedCall;
      tokenIssuedRef.current = true;
      setCallId(nextCallId);
      if (typeof token?.calls_used === 'number') {
        setCallsStarted(Math.max(0, Math.floor(token.calls_used)));
      } else if (typeof token?.interview_voice?.callsStarted === 'number') {
        setCallsStarted(Math.max(0, Math.floor(Number(token.interview_voice.callsStarted))));
      } else {
        setCallsStarted(1);
      }
      if (typeof token?.max_duration_sec === 'number' && token.max_duration_sec > 0) {
        setMaxCallDurationSec(Math.max(1, Math.floor(token.max_duration_sec)));
      } else {
        setMaxCallDurationSec(DEFAULT_MAX_CALL_DURATION_SEC);
      }
      if (typeof token?.remaining_total_sec === 'number') {
        setRemainingTotalSec(Math.max(0, Math.floor(token.remaining_total_sec)));
      } else {
        setRemainingTotalSec(null);
      }
      if (!hasPersistedCall) {
        setCallSeconds(0);
        setPauseUsed(false);
        setVoiceReport(null);
        setVoiceAgentTranscript('');
        setVoiceUserTranscript('');
        setVoicePartialTranscript('');
      } else {
        setVoiceReport((token?.interview_voice?.voiceReport as InterviewVoiceReport | undefined) ?? voiceReport ?? null);
      }

      const pc = new RTCPeerConnection();
      peerConnectionRef.current = pc;

      const audio = new Audio();
      audio.autoplay = true;
      remoteAudioRef.current = audio;

      pc.ontrack = (event) => { audio.srcObject = event.streams[0]; };

      const stream = localStreamRef.current ?? (await navigator.mediaDevices.getUserMedia({ audio: true }));
      localStreamRef.current = stream;
      setMicrophoneReady(true);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const dc = pc.createDataChannel('oai-events');
      dataChannelRef.current = dc;

      dc.addEventListener('open', () => {
        // WebRTC handshake confirmed — the call token is legitimately consumed.
        tokenIssuedRef.current = false;
        setVoiceConnected(true);
        setVoiceConnecting(false);
        primeVoiceQuestion(currentQuestion, { resetTranscript: !hasPersistedCall });
      });

      dc.addEventListener('close', () => { cleanupVoiceSession(); });

      dc.addEventListener('message', (event) => {
        try {
          const payload = JSON.parse(event.data);
          const type = String(payload?.type ?? '');

          if (type === 'input_audio_buffer.speech_started') setVoiceListening(true);
          if (type === 'input_audio_buffer.speech_stopped') setVoiceListening(false);
          if (type === 'response.created') setVoiceSpeaking(true);
          if (type === 'response.done') setVoiceSpeaking(false);
          if (type === 'response.audio_transcript.delta' && typeof payload.delta === 'string') {
            setVoiceAgentTranscript((prev) => appendTranscriptChunk(prev, payload.delta));
          }
          if (
            type === 'conversation.item.input_audio_transcription.completed' &&
            typeof payload.transcript === 'string'
          ) {
            setVoiceUserTranscript((prev) => appendTranscriptChunk(prev, payload.transcript));
            setVoicePartialTranscript('');
          }
          if (
            type === 'conversation.item.input_audio_transcription.delta' &&
            typeof payload.delta === 'string'
          ) {
            setVoicePartialTranscript((prev) => appendTranscriptChunk(prev, payload.delta));
          }
        } catch (parseErr) {
          console.error('[InterviewModal] DataChannel message parse error:', parseErr);
        }
      });

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      const sdpResponse = await fetch('https://api.openai.com/v1/realtime/calls', {
        method: 'POST',
        body: offer.sdp,
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          'Content-Type': 'application/sdp',
        },
      });

      if (!sdpResponse.ok) throw new Error(await sdpResponse.text());

      await pc.setRemoteDescription({ type: 'answer' as RTCSdpType, sdp: await sdpResponse.text() });
    } catch (error) {
      if (handleUnauthorized(error)) return;
      cleanupVoiceSession();
      voiceResumeModeRef.current = false;
      setVoiceConnecting(false);

      // If the server issued a token but WebRTC never reached DataChannel open,
      // roll back callsStarted so the user does not lose their one allowed call.
      if (tokenIssuedRef.current) {
        tokenIssuedRef.current = false;
        setCallsStarted((prev) => Math.max(0, prev - 1));
        void abortInterviewRealtimeToken().catch(() => {
          // Best-effort: if the abort fails, the quota remains incremented.
          // The user can contact support; we do not surface this as an error.
        });
      }

      const message = error instanceof Error ? error.message : 'No se pudo iniciar la llamada';
      if (
        /microphone is not allowed in this document/i.test(message) ||
        /Permission denied/i.test(message) ||
        /Permission dismissed/i.test(message)
      ) {
        setVoiceError('El navegador bloqueó el micrófono. Concede permiso e intenta de nuevo.');
        return;
      }
      setVoiceError(toUserFacingError(error, 'interview.voice'));
    }
  }

  function toggleCallPause() {
    if (!voiceConnected) return;
    if (voicePaused) {
      localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = true; });
      setVoicePaused(false);
      return;
    }
    if (pauseUsed) return;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = false; });
    setVoicePaused(true);
    setPauseUsed(true);
  }

  async function finalizeCallAndGenerateReport(
    endedBy: 'timeout' | 'agent' | 'user',
    options?: { durationSecOverride?: number },
  ) {
    if (isFinalizingCall || voiceFinalizeTriggeredRef.current) return;
    voiceFinalizeTriggeredRef.current = true;
    setIsFinalizingCall(true);
    setIsGeneratingDiagnosis(true);
    cleanupVoiceSession();
    try {
      const latestTranscript = voiceTranscriptRef.current;
      const rawTranscript = [
        latestTranscript.agent ? `AGENTE:\n${latestTranscript.agent}` : '',
        latestTranscript.user ? `USUARIO:\n${latestTranscript.user}` : '',
        latestTranscript.partial ? `PARCIAL:\n${latestTranscript.partial}` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
        .trim();
      const persistedState = readInterviewVoiceState();
      const persistedTranscript =
        typeof persistedState?.transcript === 'string' ? persistedState.transcript.trim() : '';
      const interviewFlowFallback = [
        currentQuestion ? `ULTIMA_PREGUNTA_PLANIFICADA:\n${currentQuestion}` : '',
        currentSummary ? `RESUMEN_ACTIVO:\n${currentSummary}` : '',
        interviewTranscriptSnapshot ? `HISTORIAL_ENTREVISTA:\n${interviewTranscriptSnapshot}` : '',
        voiceKnowledgePacket ? `CONTEXTO_USUARIO:\n${voiceKnowledgePacket}` : '',
        'NOTA: si la transcripción de audio es parcial, igual debes consolidar diagnóstico con el contexto estructurado disponible.',
      ]
        .filter(Boolean)
        .join('\n\n')
        .trim();
      const finalTranscript = [rawTranscript, persistedTranscript, interviewFlowFallback]
        .filter((item) => String(item || '').trim().length > 0)
        .join('\n\n')
        .trim();
      const safeTranscript =
        finalTranscript.length >= 10
          ? finalTranscript
          : [
              'TRANSCRIPCION_MINIMA:',
              'La llamada finalizó antes de consolidar suficiente audio limpio.',
              interviewFlowFallback || 'Se debe diagnosticar con intake y contexto estructurado disponible.',
            ]
              .filter(Boolean)
              .join('\n');

      let result: Awaited<ReturnType<typeof finalizeInterviewVoiceCall>> | null = null;
      let lastError: unknown = null;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          result = await finalizeInterviewVoiceCall({
            intake,
            transcript: safeTranscript,
            endedBy,
            durationSec: Math.max(
              1,
              Math.floor(options?.durationSecOverride ?? callSecondsRef.current ?? callSeconds),
            ),
            callId: callId ?? undefined,
          });
          break;
        } catch (error) {
          lastError = error;
          if (handleUnauthorized(error)) {
            setIsGeneratingDiagnosis(false);
            return;
          }
          if (attempt < 2) await wait(400 * (attempt + 1));
        }
      }
      if (!result) throw lastError ?? new Error('No se pudo finalizar la llamada');

      if (result?.profile) setProfile(result.profile);
      if (result?.type === 'interview_complete') setResponse(result);

      const interviewVoice = result?.interview_voice;
      if (typeof interviewVoice?.call_id === 'string' && interviewVoice.call_id.length > 0) {
        setCallId(interviewVoice.call_id);
      }
      if (typeof interviewVoice?.remaining_total_sec === 'number') {
        setRemainingTotalSec(Math.max(0, Math.floor(interviewVoice.remaining_total_sec)));
      }
      setCallsStarted((prev) => Math.max(prev, 1));

      const report = result?.voice_report;
      const executiveReport =
        typeof report?.executive_report === 'string' && report.executive_report.trim().length > 0
          ? report.executive_report.trim()
          : typeof result?.profile?.executiveSummary === 'string' && result.profile.executiveSummary.trim().length > 0
          ? result.profile.executiveSummary.trim()
          : 'Entrevista finalizada. Tu diagnóstico quedó consolidado y ya puedes revisarlo en detalle.';
      setVoiceReport({
        executive_report: executiveReport,
        key_findings: Array.isArray(report?.key_findings)
          ? report.key_findings.map((item: unknown) => String(item))
          : [],
        stop_reason: typeof report?.stop_reason === 'string' ? report.stop_reason : endedBy,
        has_enough_information:
          typeof report?.has_enough_information === 'boolean' ? report.has_enough_information : undefined,
        confidence:
          report?.confidence === 'high' || report?.confidence === 'medium' || report?.confidence === 'low'
            ? report.confidence
            : undefined,
      });
      clearInterviewVoiceState();
      setIsGeneratingDiagnosis(false);
      onDiagnosisComplete?.();
    } catch (error) {
      voiceFinalizeTriggeredRef.current = false;
      if (handleUnauthorized(error)) {
        setIsGeneratingDiagnosis(false);
        return;
      }
      setIsGeneratingDiagnosis(false);
      setVoiceError(toUserFacingError(error, 'interview.voice'));
    } finally {
      setIsFinalizingCall(false);
    }
  }

  async function applyVoiceTranscriptAsAnswer() {
    const clean = (voiceUserTranscript || voicePartialTranscript).trim();
    if (!clean || !blockId || awaitingSummaryValidation) return;

    addAnswer(blockId, clean);

    try {
      const nextInterviewTranscript = [
        interviewTranscriptSnapshot,
        `USUARIO [${blockId}]: ${clean}`,
      ]
        .filter(Boolean)
        .join('\n')
        .trim();

      const res = await nextConversationStep({
        intake,
        blockId,
        answersInCurrentBlock: [...answersInBlock, clean],
        completedBlocks,
        interviewTranscript: nextInterviewTranscript,
      });

      setVoiceUserTranscript('');
      setVoicePartialTranscript('');
      setResponse(res);
    } catch (error) {
      if (handleUnauthorized(error)) return;
    }
  }

  async function submitSummaryValidation(accepted: boolean) {
    if (!blockId || !currentSummary || summarySubmitting) return;
    setSummarySubmitting(true);
    try {
      const res = await nextConversationStep({
        intake,
        blockId,
        answersInCurrentBlock: answersInBlock,
        completedBlocks,
        summaryValidation: {
          accepted,
          comment: summaryComment.trim() || undefined,
        },
        interviewTranscript: interviewTranscriptSnapshot,
      });
      setSummaryComment('');
      setResponse(res);
    } catch (error) {
      if (handleUnauthorized(error)) return;
    } finally {
      setSummarySubmitting(false);
    }
  }

  const isLoading = !intakeReady || !intake;
  const showVoiceReport = Boolean(voiceReport?.executive_report);
  const voiceFocusHint = currentQuestion
    ? currentQuestion
    : `Explorar ${currentBlockLabel.toLowerCase()} con el contexto financiero disponible.`;

  return (
    <div
      className="agent-modal-overlay interview-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Entrevista estratégica"
      onClick={canDismissOverlay ? handleOverlayDismiss : undefined}
    >
      {isGeneratingDiagnosis ? (
        <div
          className="agent-modal interview-modal interview-modal--generating"
          ref={modalRef}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <AiLoader
            text="Generando diagnóstico"
            subtitle="Estamos consolidando tu diagnóstico profesional con toda la evidencia disponible."
          />
        </div>
      ) : (
      <div
        className="agent-modal interview-modal"
        ref={modalRef}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="bcc-modal-header interview-modal-header">
          <div className="bcc-modal-title-wrap">
            <span className="bcc-modal-eyebrow">Financieramente</span>
            <h3 className="bcc-modal-title">Entrevista estratégica</h3>
          </div>
          <button
            type="button"
            className="agent-modal-close"
            ref={closeButtonRef}
            onClick={canDismissOverlay ? onClose : undefined}
            disabled={!canDismissOverlay}
            aria-label="Cerrar entrevista"
          >
            ×
          </button>
        </div>

        <p className="agent-modal-intro interview-modal-intro">
          Llamada breve con contexto integrado de presupuesto y productos para convertir señales dispersas en diagnóstico ejecutivo.
        </p>

        {syncError ? (
          <div className="interview-sync-error-toast" role="status" aria-live="polite">
            {syncError}
          </div>
        ) : null}

        {isLoading ? (
          <div className="interview-modal-loading">
            <span>Cargando sesión…</span>
          </div>
        ) : sessionAlreadyCompleted && !showVoiceReport ? (
          <div className="interview-modal-completed">
            <div className="voice-call-transcript-card">
              <span className="voice-call-transcript-label">Entrevista completada</span>
              <p>Ya consolidamos tu diagnóstico financiero. Puedes revisarlo en detalle o exportarlo.</p>
            </div>
            <div className="voice-call-actions">
              <button
                type="button"
                className="summary-action-btn summary-action-accept"
                onClick={() => {
                  onClose();
                  router.push('/diagnosis');
                }}
              >
                Ver diagnóstico completo
              </button>
              <button type="button" className="summary-action-btn" onClick={onClose}>
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          <div className="interview-shell pro-interview-shell interview-modal-body">
            <div className="interview-stage-shell">
              <aside className="interview-panel-surface interview-panel-surface--sidebar">
                <div className="interview-brief-card">
                  <div className="interview-brief-top">
                    <div>
                      <span className="interview-surface-eyebrow">Resumen de sesión</span>
                      <h4>Entrevista guiada</h4>
                    </div>
                    <span className={`interview-brief-status${voiceConnected ? ' is-live' : voiceReport ? ' is-done' : ''}`}>
                      {voiceConnected ? 'En vivo' : voiceReport ? 'Listo' : stageLabel}
                    </span>
                  </div>
                  <p>
                    {voiceConnected
                      ? 'Sesión activa. Responde con ejemplos concretos de tu situación real.'
                      : showVoiceReport
                      ? 'Diagnóstico consolidado. Revisa el informe y continúa al detalle completo.'
                      : 'Conversación breve con contexto de presupuesto y productos para cerrar tu diagnóstico.'}
                  </p>
                  <div className="interview-brief-tags">
                    <span className="interview-brief-tag">{currentBlockLabel}</span>
                    <span className="interview-brief-tag">{completedBlockCount} bloque{completedBlockCount === 1 ? '' : 's'} cerrado{completedBlockCount === 1 ? '' : 's'}</span>
                    <span className="interview-brief-tag">Tiempo {callTimeLabel}</span>
                  </div>
                </div>

                <div className="interview-metrics-grid">
                  <article className="interview-metric-card">
                    <span>Tiempo restante</span>
                    <strong>{formatClock(remainingTotalSec)}</strong>
                  </article>
                  <article className="interview-metric-card">
                    <span>Balance base</span>
                    <strong>{budgetRowsCount > 0 ? `${budgetBalance >= 0 ? '+' : ''}${budgetBalance.toLocaleString('es-CL')}` : '—'}</strong>
                  </article>
                  <article className="interview-metric-card">
                    <span>Productos</span>
                    <strong>{productCount}</strong>
                  </article>
                  <article className="interview-metric-card">
                    <span>Pausa</span>
                    <strong>{pauseUsed ? (voicePaused ? 'Activa' : 'Usada') : 'Disponible'}</strong>
                  </article>
                </div>

                {interviewBriefPoints.length > 0 ? (
                  <div className="interview-notes-card">
                    <span className="interview-surface-eyebrow">Base detectada</span>
                    <ul>
                      {interviewBriefPoints.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {contextHighlights.length > 0 ? (
                  <div className="interview-notes-card">
                    <span className="interview-surface-eyebrow">Contexto consolidado</span>
                    <ul>
                      {contextHighlights.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="interview-status-rail">
                  <span className="interview-surface-eyebrow">Estado</span>
                  <div className="interview-status-list">
                    {sessionStatusItems.map((item) => (
                      <div key={item.label} className={`interview-status-item ${item.tone}`.trim()}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                </div>
              </aside>

              <div className="interview-column pro-interview-column interview-panel-surface interview-panel-surface--workspace">
              <section className={`voice-call-shell interview-live-shell${showVoiceReport ? ' is-hidden-by-report' : ''}`}>
                <div className="voice-call-topbar">
                  <div>
                    <span className="voice-call-label">Entrevista en tiempo real</span>
                    <h1>Entrevista estratégica</h1>
                    <p className="voice-call-subtitle">
                      {voiceCallExhausted && !showVoiceReport
                        ? 'Tiempo agotado — puedes generar el informe con lo registrado'
                        : voiceConnected
                        ? voicePaused
                          ? 'Llamada en pausa'
                          : voiceListening
                          ? 'Te escucho…'
                          : voiceSpeaking
                          ? 'Entrevistador hablando'
                          : 'Conversación activa'
                        : 'Presiona iniciar llamada para comenzar'}
                    </p>
                  </div>
                  <div className="voice-call-status">
                    <span className="voice-call-status-dot" />
                    {voiceConnecting
                      ? 'Conectando'
                      : voiceConnected
                      ? voicePaused
                        ? 'Pausada'
                        : voiceListening
                        ? 'Escuchando'
                        : voiceSpeaking
                        ? 'Hablando'
                        : 'En llamada'
                      : stageLabel}
                  </div>
                </div>

                <div className="voice-call-transcript-card interview-focus-card">
                  <span className="voice-call-transcript-label">Foco de conversación</span>
                  <p>{voiceFocusHint}</p>
                  <small className="interview-inline-note">{workspaceCoachNote}</small>
                </div>

                {awaitingSummaryValidation && !voiceConnected ? (
                  <div className="voice-call-transcript-card interview-validation-card">
                    <span className="voice-call-transcript-label">Validación de bloque (opcional)</span>
                    <p>{currentSummary}</p>
                    <textarea
                      className="agent-textarea"
                      rows={3}
                      value={summaryComment}
                      onChange={(event) => setSummaryComment(event.target.value)}
                      placeholder="Si falta algo, escríbelo aquí para afinar la siguiente repregunta."
                    />
                    <div className="voice-call-actions">
                      <button
                        type="button"
                        className="summary-action-btn summary-action-accept"
                        onClick={() => void submitSummaryValidation(true)}
                        disabled={summarySubmitting}
                      >
                        {summarySubmitting ? 'Guardando…' : 'Validar bloque'}
                      </button>
                      <button
                        type="button"
                        className="summary-action-btn summary-action-reject"
                        onClick={() => void submitSummaryValidation(false)}
                        disabled={summarySubmitting}
                      >
                        {summarySubmitting ? 'Repreguntando…' : 'Pedir repregunta'}
                      </button>
                    </div>
                  </div>
                ) : null}

                {bootError ? (
                  <p className="voice-call-error interview-call-error-banner">{bootError}</p>
                ) : null}

                <div className="voice-call-progress" aria-hidden="true">
                  <span style={{ width: `${callProgressPct}%` }} />
                </div>

                <div className="voice-call-context">
                  {intakeSnapshot.map((item) => (
                    <span key={item} className="voice-call-pill">{item}</span>
                  ))}
                </div>

                <div className="voice-call-actions interview-call-actions interview-call-actions--primary">
                  <button
                    type="button"
                    className="summary-action-btn summary-action-accept interview-call-start-btn"
                    onClick={() => void startVoiceSession()}
                    disabled={
                      !voiceSupported ||
                      voiceConnecting ||
                      voiceConnected ||
                      isFinalizingCall ||
                      showVoiceReport ||
                      (!voiceConnected && voiceCallExhausted && !hasLiveVoiceCall) ||
                      (!voiceConnected && voiceInterviewLocked && !hasLiveVoiceCall)
                    }
                  >
                    {voiceConnecting
                      ? 'Conectando llamada…'
                      : showVoiceReport
                      ? 'Diagnóstico listo'
                      : voiceConnected
                      ? 'Llamada activa'
                      : voiceCallExhausted && !showVoiceReport
                      ? 'Tiempo agotado'
                      : hasEverStartedVoiceCall && hasRemainingInterviewTime
                      ? 'Reanudar llamada'
                      : 'Iniciar llamada'}
                  </button>
                  <button
                    type="button"
                    className="summary-action-btn"
                    onClick={toggleCallPause}
                    disabled={!voiceConnected || showVoiceReport || (pauseUsed && !voicePaused)}
                    title={pauseUsed ? 'Ya usaste la pausa única de esta llamada' : 'Pausar una vez'}
                  >
                    {voicePaused ? 'Reanudar' : pauseUsed ? 'Pausa usada' : 'Pausar (1 vez)'}
                  </button>
                </div>

                <div className="voice-call-actions interview-call-actions interview-call-actions--secondary">
                  {(voiceUserTranscript || voicePartialTranscript) && blockId ? (
                    <button
                      type="button"
                      className="summary-action-btn summary-action-reject"
                      onClick={() => void applyVoiceTranscriptAsAnswer()}
                    >
                      Usar transcripción
                    </button>
                  ) : null}
                  {voiceCallExhausted && !showVoiceReport && !voiceConnected && !isFinalizingCall ? (
                    <button
                      type="button"
                      className="summary-action-btn summary-action-accept"
                      onClick={() => void finalizeCallAndGenerateReport('timeout')}
                    >
                      Generar informe con contexto disponible
                    </button>
                  ) : null}
                  {voiceConnected ? (
                    <button
                      type="button"
                      className="summary-action-btn summary-action-reject"
                      onClick={() => void finalizeCallAndGenerateReport('user')}
                      disabled={isFinalizingCall || showVoiceReport}
                    >
                      {isFinalizingCall ? 'Generando informe…' : 'Finalizar y generar informe'}
                    </button>
                  ) : null}
                </div>

                <div className="voice-call-context interview-call-meta">
                  <span className="voice-call-pill">Tiempo {callTimeLabel} / {maxCallTimeLabel}</span>
                  <span className="voice-call-pill">
                    Pausa: {pauseUsed ? (voicePaused ? 'en uso' : 'usada') : 'disponible'}
                  </span>
                  <span className="voice-call-pill">
                    Restante:{' '}
                    {remainingTotalSec === null
                      ? '—'
                      : `${Math.floor(remainingTotalSec / 60).toString().padStart(2, '0')}:${(remainingTotalSec % 60).toString().padStart(2, '0')}`}
                  </span>
                  <span className="voice-call-pill">Una sesión por usuario</span>
                </div>

                {voiceError ? <p className="voice-call-error interview-call-error-banner">{voiceError}</p> : null}

                {(voiceConnected || voiceUserTranscript || voicePartialTranscript || voiceAgentTranscript) && (
                  <div className="voice-call-transcripts">
                    <div className="voice-call-transcript-card">
                      <span className="voice-call-transcript-label">Agente</span>
                      <p>{voiceAgentTranscript || 'La pregunta hablada aparecerá aquí.'}</p>
                    </div>
                    <div className="voice-call-transcript-card">
                      <span className="voice-call-transcript-label">Tu voz</span>
                      <p>{voiceUserTranscript || voicePartialTranscript || 'Cuando hables, la transcripción se mostrará aquí.'}</p>
                    </div>
                  </div>
                )}
              </section>

              {showVoiceReport && voiceReport && (
                <section className="voice-call-shell diagnosis-ready-shell">
                  <div className="voice-call-topbar">
                    <div>
                      <span className="voice-call-brand">Financieramente</span>
                      <span className="voice-call-label">Informe ejecutivo</span>
                      <h1>Diagnóstico de la entrevista</h1>
                      <span className="voice-call-subtitle">Cierre consolidado de tu sesión</span>
                    </div>
                    <div className="voice-call-status">
                      <span className="voice-call-status-dot" />
                      Diagnóstico listo
                    </div>
                  </div>
                  <div className="voice-call-transcript-card">
                    <p>{voiceReport.executive_report}</p>
                  </div>
                  {voiceReport.key_findings.length > 0 && (
                    <div className="voice-call-transcript-card">
                      <span className="voice-call-transcript-label">Hallazgos principales</span>
                      <ul>
                        {voiceReport.key_findings.map((finding) => (
                          <li key={finding}>{finding}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="voice-call-actions">
                    <button
                      type="button"
                      className="summary-action-btn summary-action-accept"
                      onClick={() => {
                        onClose();
                        router.push('/diagnosis');
                      }}
                    >
                      Ver diagnóstico completo
                    </button>
                    <button type="button" className="summary-action-btn" onClick={onClose}>
                      Cerrar
                    </button>
                  </div>
                </section>
              )}
              </div>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
