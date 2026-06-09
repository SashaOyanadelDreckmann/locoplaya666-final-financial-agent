import {
  INTERVIEW_CLOSEOUT_BUFFER_SEC,
  INTERVIEW_TOTAL_LIMIT_MINUTES,
} from './interview.constants';

export const INTERVIEW_VOICE_OPENING_FOCUS =
  'Abre con una observación concreta del intake, presupuesto o productos y formula una sola pregunta ejecutiva de alto valor.';

export type InterviewVoiceSummaryEntry = {
  minute: number;
  summary: string;
  keyFindings: string[];
  confidence?: 'high' | 'medium' | 'low';
  createdAt?: string;
};

export type InterviewVoiceFinalSummary = {
  summary: string;
  keyFindings: string[];
  confidence?: 'high' | 'medium' | 'low';
  createdAt?: string;
} | null;

export function formatMoneyCompact(value: unknown) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '0';
  return amount.toLocaleString('es-CL');
}

export function resolveInterviewVoiceIntakeContext(injectedIntake: unknown): Record<string, unknown> {
  const envelope =
    injectedIntake && typeof injectedIntake === 'object'
      ? (injectedIntake as Record<string, unknown>)
      : null;
  const questionnaire =
    envelope?.intake && typeof envelope.intake === 'object'
      ? (envelope.intake as Record<string, unknown>)
      : {};
  return {
    ...questionnaire,
    __productsContext:
      envelope?.productsContext && typeof envelope.productsContext === 'object'
        ? envelope.productsContext
        : null,
    __budgetContext:
      envelope?.budgetContext && typeof envelope.budgetContext === 'object'
        ? envelope.budgetContext
        : null,
  };
}

export function countInterviewVoiceSourcesLoaded(intake: Record<string, unknown>) {
  const products = intake.__productsContext as Record<string, unknown> | null | undefined;
  const budget = intake.__budgetContext as Record<string, unknown> | null | undefined;
  const skipKeys = new Set(['__productsContext', '__budgetContext']);
  const hasIntake = Object.entries(intake).some(
    ([key, value]) =>
      !skipKeys.has(key) &&
      value !== null &&
      value !== undefined &&
      value !== '' &&
      (typeof value !== 'object' || (key === 'financialKnowledge' && typeof value === 'object')),
  );
  const hasProducts = Boolean(products && Math.max(0, Number(products.productsCount ?? 0)) > 0);
  const hasBudget = Boolean(budget && Math.max(0, Number(budget.rowsCount ?? 0)) > 0);
  return {
    intake: hasIntake,
    products: hasProducts,
    budget: hasBudget,
    total: [hasIntake, hasProducts, hasBudget].filter(Boolean).length,
  };
}

export function normalizeInterviewVoiceFinalSummary(source: unknown): InterviewVoiceFinalSummary {
  if (!source || typeof source !== 'object') return null;
  const row = source as Record<string, unknown>;
  const summary = String(row.summary ?? '').trim();
  if (!summary) return null;
  const entry: NonNullable<InterviewVoiceFinalSummary> = {
    summary,
    keyFindings: Array.isArray(row.keyFindings)
      ? row.keyFindings.map((finding) => String(finding)).filter(Boolean)
      : Array.isArray(row.key_findings)
        ? row.key_findings.map((finding) => String(finding)).filter(Boolean)
        : [],
  };
  if (row.confidence === 'high' || row.confidence === 'medium' || row.confidence === 'low') {
    entry.confidence = row.confidence;
  }
  if (typeof row.createdAt === 'string') {
    entry.createdAt = row.createdAt;
  }
  return entry;
}

export function normalizeInterviewVoiceMinuteSummaries(source: unknown): InterviewVoiceSummaryEntry[] {
  if (!Array.isArray(source)) return [];
  const normalized: InterviewVoiceSummaryEntry[] = [];
  source.forEach((item, index) => {
    const row = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const summary = String(row.summary ?? '').trim();
    if (!summary) return;
    const entry: InterviewVoiceSummaryEntry = {
      minute: typeof row.minute === 'number' ? row.minute : index + 1,
      summary,
      keyFindings: Array.isArray(row.keyFindings)
        ? row.keyFindings.map((finding) => String(finding)).filter(Boolean)
        : Array.isArray(row.key_findings)
          ? row.key_findings.map((finding) => String(finding)).filter(Boolean)
          : [],
    };
    if (row.confidence === 'high' || row.confidence === 'medium' || row.confidence === 'low') {
      entry.confidence = row.confidence;
    }
    if (typeof row.createdAt === 'string') {
      entry.createdAt = row.createdAt;
    }
    normalized.push(entry);
  });
  return normalized;
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
    'REGLA DE VERACIDAD (obligatoria):',
    'Solo puedes citar montos, categorías, productos, deudas o hechos que aparezcan literalmente en el dossier de abajo.',
    'Si una sección dice "Sin X cargado", NO inventes, NO asumas ni completes X.',
    'Si el usuario contradice el dossier en voz, repregunta sin tomar ninguna versión como verdad hasta aclararlo.',
    'Nunca extrapoles totales ni porcentajes que no estén escritos en las fuentes.',
  ].join('\n');
}

function buildSourceAvailabilityBlock(
  intakeLines: string[],
  products: Record<string, unknown> | undefined,
  budget: Record<string, unknown> | undefined,
) {
  const hasIntake = intakeLines.length > 0;
  const hasProducts = Boolean(products && Math.max(0, Number(products.productsCount ?? 0)) > 0);
  const hasBudget = Boolean(budget && Math.max(0, Number(budget.rowsCount ?? 0)) > 0);
  const loadedCount = [hasIntake, hasProducts, hasBudget].filter(Boolean).length;
  const missing: string[] = [];
  if (!hasIntake) missing.push('cuestionario');
  if (!hasProducts) missing.push('productos/cartolas');
  if (!hasBudget) missing.push('presupuesto');

  return [
    `Fuentes verificadas disponibles: ${loadedCount}/3.`,
    loadedCount < 3
      ? `Faltan: ${missing.join(', ')}. No cites ni supongas datos de fuentes ausentes.`
      : 'Las tres fuentes están cargadas; aun así solo cita lo que aparece literalmente abajo.',
  ].join(' ');
}

export function buildVoiceInterviewDossier(
  intake: unknown,
  minuteSummaries: InterviewVoiceSummaryEntry[] = [],
  finalSummary?: InterviewVoiceFinalSummary,
) {
  const source = (intake ?? {}) as Record<string, unknown>;
  const products = source.__productsContext as Record<string, unknown> | undefined;
  const budget = source.__budgetContext as Record<string, unknown> | undefined;
  const sections: string[] = [];

  sections.push('=== FICHA MAESTRA DEL USUARIO — FINANCIERAMENTE ===');

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
  sections.push(`\n${buildSourceAvailabilityBlock(intakeLines, products, budget)}`);
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
        sections.push(
          `Nota narrativa previa (no verificada, no usar cifras que no estén arriba): ${activeProduct.dashboardSummary.trim().slice(0, 300)}`,
        );
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
    sections.push('\n[SÍNTESIS INTERMEDIA — ORIENTATIVA, NO VERIFICADA]');
    sections.push('Usa estas notas solo como guía; ante contradicción con las fuentes 1-3, prevalecen las fuentes verificadas.');
    for (const summary of minuteSummaries.slice(-6)) {
      sections.push(
        `  · Minuto ${summary.minute}: ${summary.summary}${summary.keyFindings.length ? ` | hallazgos: ${summary.keyFindings.join(' | ')}` : ''}${summary.confidence ? ` | confianza: ${summary.confidence}` : ''}`,
      );
    }
  }
  if (finalSummary?.summary) {
    sections.push('\n[SÍNTESIS FINAL — ORIENTATIVA, NO VERIFICADA]');
    sections.push(`  · ${finalSummary.summary}`);
    if (Array.isArray(finalSummary.keyFindings) && finalSummary.keyFindings.length) {
      sections.push(`    Hallazgos: ${finalSummary.keyFindings.slice(0, 5).join(' | ')}`);
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
  minuteSummaries?: InterviewVoiceSummaryEntry[];
  finalSummary?: InterviewVoiceFinalSummary;
  latestUserSnippet?: string;
  callPhase?: 'exploration' | 'closeout';
}) {
  const dossier = buildVoiceInterviewDossier(params.intake, params.minuteSummaries ?? [], params.finalSummary);
  const blocks = [
    buildSeniorVoicePersonaBlock(),
    `TIEMPO DE LLAMADA: máximo ${INTERVIEW_TOTAL_LIMIT_MINUTES} minutos. En los últimos ${INTERVIEW_CLOSEOUT_BUFFER_SEC} segundos cierra con <<CALL_COMPLETE>> y síntesis ejecutiva breve.`,
    'CONCIENCIA DEL SISTEMA: El usuario puede haber completado hasta 3 fuentes en Financieramente (intake, productos/cartolas, presupuesto). Solo las secciones con datos reales están abajo — revisa el contador de fuentes y no pidas ni inventes lo ausente.',
    'SÍNTESIS OBJETIVO: Si se solicita una síntesis, responde solo con texto estructurado y conciso. No uses transcripción literal ni repitas audio.',
    `FOCO INICIAL DE LA LLAMADA: ${INTERVIEW_VOICE_OPENING_FOCUS}`,
    dossier,
  ];
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
