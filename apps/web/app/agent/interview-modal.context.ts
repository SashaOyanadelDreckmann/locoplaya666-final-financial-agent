export type InterviewVoiceReport = {
  executive_report: string;
  key_findings: string[];
  stop_reason?: string;
  has_enough_information?: boolean;
  confidence?: 'high' | 'medium' | 'low';
};

export type InterviewVoiceSummaryEntry = {
  minute: number;
  summary: string;
  keyFindings: string[];
  confidence?: 'high' | 'medium' | 'low';
  createdAt: string;
};

export type InterviewVoiceSnapshot = {
  callId?: string;
  activeCallId?: string | null;
  status?: 'idle' | 'in_progress' | 'paused' | 'completed';
  callSeconds?: number;
  maxDurationSec?: number;
  remainingTotalSec?: number | null;
  pauseUsed?: boolean;
  minuteSummaries?: InterviewVoiceSummaryEntry[];
  finalSummary?: {
    summary: string;
    keyFindings: string[];
    confidence?: 'high' | 'medium' | 'low';
    createdAt: string;
  } | null;
  voiceReport?: InterviewVoiceReport | null;
  callsStarted?: number;
  completedAt?: string | null;
  startedAt?: string | null;
  lastUpdatedAt?: string | null;
};

export type InterviewVoiceStateInput = {
  latestDiagnosticProfileId?: string | null;
  voiceReportExecutiveReport?: string | null;
  callId?: string | null;
  callsStarted?: number;
  callSeconds?: number;
  minuteSummariesCount?: number;
  hasFinalSummary?: boolean;
  hasVoiceReport?: boolean;
  remainingTotalSec?: number | null;
  maxCallDurationSec?: number;
  closeoutBufferSec: number;
  voiceConnected?: boolean;
};

export type InterviewVoiceStateFlags = {
  hasCompletedVoiceInterview: boolean;
  hasEverStartedVoiceCall: boolean;
  hasRemainingInterviewTime: boolean;
  hasLiveVoiceCall: boolean;
  isClosingWindow: boolean;
  voiceCallExhausted: boolean;
  voiceInterviewLocked: boolean;
};

export function formatMoneyCompact(value: unknown) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '0';
  return amount.toLocaleString('es-CL');
}

export function formatBlockLabel(blockId?: string) {
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

export function buildVoiceInterviewDossier(
  intake: unknown,
  transcriptEntries: Array<{ blockId?: string; answer?: string }>,
  minuteSummaries: InterviewVoiceSummaryEntry[] = [],
  finalSummary?: InterviewVoiceSnapshot['finalSummary'],
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

  if (minuteSummaries.length > 0) {
    sections.push('\n[SÍNTESIS DE LLAMADA POR MINUTO]');
    for (const summary of minuteSummaries.slice(-6)) {
      sections.push(
        `  · Minuto ${summary.minute}: ${summary.summary}${summary.keyFindings.length ? ` | hallazgos: ${summary.keyFindings.join(' | ')}` : ''}${summary.confidence ? ` | confianza: ${summary.confidence}` : ''}`,
      );
    }
  }
  if (finalSummary?.summary) {
    sections.push('\n[SÍNTESIS FINAL DE LA LLAMADA]');
    sections.push(`  · ${finalSummary.summary}`);
    if (Array.isArray(finalSummary.keyFindings) && finalSummary.keyFindings.length) {
      sections.push(`    Hallazgos: ${finalSummary.keyFindings.slice(0, 5).join(' | ')}`);
    }
  }
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

export function buildVoiceSessionInstructions(params: {
  intake: unknown;
  transcriptEntries: Array<{ blockId?: string; answer?: string }>;
  minuteSummaries?: InterviewVoiceSummaryEntry[];
  finalSummary?: InterviewVoiceSnapshot['finalSummary'];
  completedBlocks?: Record<string, { summary?: string; signalsDetected?: string[] }>;
  currentQuestion?: string;
  latestUserSnippet?: string;
  callPhase?: 'exploration' | 'closeout';
}) {
  const dossier = buildVoiceInterviewDossier(
    params.intake,
    params.transcriptEntries,
    params.minuteSummaries ?? [],
    params.finalSummary,
    params.completedBlocks,
  );
  const blocks = [
    buildSeniorVoicePersonaBlock(),
    `TIEMPO DE LLAMADA: máximo 3 minutos. En los últimos 25 segundos cierra con <<CALL_COMPLETE>> y síntesis ejecutiva breve.`,
    'CONCIENCIA DEL SISTEMA: El usuario completó cuestionario (intake), cargó productos/cartolas y armó presupuesto en Financieramente. Toda la evidencia está abajo — cita montos, categorías o alertas concretas; no pidas lo que ya tienes.',
    'SÍNTESIS OBJETIVO: Si se solicita una síntesis, responde solo con texto estructurado y conciso. No uses transcripción literal ni repitas audio.',
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

export type VoiceSessionContext = {
  intake: unknown;
  transcriptEntries: Array<{ blockId?: string; answer?: string }>;
  minuteSummaries: InterviewVoiceSummaryEntry[];
  finalSummary: InterviewVoiceSnapshot['finalSummary'];
  completedBlocks: Record<string, { summary?: string; signalsDetected?: string[] }>;
  currentQuestion: string;
};

export function summarizeVoiceInterviewContext(intake: unknown, transcriptEntries: Array<{ blockId?: string; answer?: string }>) {
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

  return parts.filter(Boolean).join('\n');
}

export function resolveInterviewVoiceStateFlags(input: InterviewVoiceStateInput): InterviewVoiceStateFlags {
  const hasCompletedVoiceInterview = Boolean(input.latestDiagnosticProfileId) || Boolean(input.voiceReportExecutiveReport);
  const hasEverStartedVoiceCall =
    Boolean(input.callId) ||
    Number(input.callsStarted ?? 0) > 0 ||
    Number(input.callSeconds ?? 0) > 0 ||
    Number(input.minuteSummariesCount ?? 0) > 0 ||
    Boolean(input.hasFinalSummary) ||
    Boolean(input.hasVoiceReport);
  const hasRemainingInterviewTime =
    input.remainingTotalSec === null
      ? Number(input.callSeconds ?? 0) < Number(input.maxCallDurationSec ?? 0)
      : Number(input.remainingTotalSec ?? 0) > 0;
  const hasLiveVoiceCall = Boolean(input.callId) && !hasCompletedVoiceInterview && hasRemainingInterviewTime;
  const isClosingWindow =
    Boolean(input.voiceConnected) &&
    hasRemainingInterviewTime &&
    (input.remainingTotalSec ?? Math.max(0, Number(input.maxCallDurationSec ?? 0) - Number(input.callSeconds ?? 0))) <=
      input.closeoutBufferSec;
  const voiceCallExhausted =
    !hasCompletedVoiceInterview &&
    !hasRemainingInterviewTime &&
    Boolean(
      input.callId ||
        Number(input.callsStarted ?? 0) > 0 ||
        Number(input.callSeconds ?? 0) > 0 ||
        Number(input.minuteSummariesCount ?? 0) > 0 ||
        input.hasFinalSummary ||
        input.hasVoiceReport,
    );
  const voiceInterviewLocked = hasCompletedVoiceInterview || voiceCallExhausted;

  return {
    hasCompletedVoiceInterview,
    hasEverStartedVoiceCall,
    hasRemainingInterviewTime,
    hasLiveVoiceCall,
    isClosingWindow,
    voiceCallExhausted,
    voiceInterviewLocked,
  };
}
