import { InterviewBlockId } from '../orchestrator/interview.flow';
import { IntakeQuestionnaire } from '@financial-agent/shared/src/intake/intake-questionnaire.types';

type InterviewAnswerQuality = 'none' | 'thin' | 'substantive';

export type InterviewStrategicBrief = {
  answerQuality: InterviewAnswerQuality;
  userSnapshot: string[];
  prioritySignals: string[];
  blindSpots: string[];
  questionAngles: string[];
  recentEvidence: string[];
  blockPressure: string;
};

function formatMoneyCompact(value: unknown) {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return '0';
  return amount.toLocaleString('es-CL');
}

export function buildInterviewContextDigest(intake: IntakeQuestionnaire) {
  const source = intake as unknown as Record<string, unknown>;
  const products = source.__productsContext as Record<string, unknown> | undefined;
  const budget = source.__budgetContext as Record<string, unknown> | undefined;

  return {
    products:
      products && typeof products === 'object'
        ? {
            productsCount: Number(products.productsCount ?? 0),
            activeProductLabel: String(products.activeProductLabel ?? ''),
            transactionSummary: products.transactionSummary ?? null,
            topAlerts: Array.isArray(products.alerts) ? products.alerts.slice(0, 5) : [],
          }
        : null,
    budget:
      budget && typeof budget === 'object'
        ? {
            income: Number(budget.income ?? 0),
            expenses: Number(budget.expenses ?? 0),
            balance: Number(budget.balance ?? 0),
            rowsCount: Number(budget.rowsCount ?? 0),
            topRows: Array.isArray(budget.rows) ? budget.rows.slice(0, 8) : [],
          }
        : null,
  };
}

function detectAnswerQuality(answers: string[]): InterviewAnswerQuality {
  const text = answers.map((item) => item.trim()).filter(Boolean).join(' ');
  if (!text) return 'none';
  if (text.length < 120) return 'thin';
  return 'substantive';
}

function getTopBudgetRows(rows: unknown[]) {
  return rows
    .map((row) => (row && typeof row === 'object' ? (row as Record<string, unknown>) : {}))
    .filter((row) => Number(row.amount ?? 0) > 0)
    .sort((a, b) => Number(b.amount ?? 0) - Number(a.amount ?? 0))
    .slice(0, 3)
    .map((row) => `${String(row.category ?? 'Item')}: ${formatMoneyCompact(row.amount)} CLP`);
}

function getQuestionAngles(blockId: InterviewBlockId) {
  const blockMap: Record<InterviewBlockId, string[]> = {
    warmup: [
      'entrar por la tension financiera mas concreta ya visible',
      'usar una observacion especifica, no una bienvenida generica',
      'activar curiosidad con una sola idea potente',
    ],
    cashflow: [
      'descubrir que parte del mes pierde control',
      'forzar un ejemplo reciente donde el flujo se desordeno',
      'explorar diferencia entre ingreso declarado y caja real',
    ],
    resilience: [
      'medir margen real frente a imprevistos',
      'detectar dependencia de una sola fuente o colchón insuficiente',
      'explorar cuanto tiempo aguanta sin tension adicional',
    ],
    debt: [
      'entender si la deuda financia hábito, urgencia o mala estructura',
      'buscar rollover, cuotas invisibles o normalizacion del costo',
      'separar deuda tactica de deuda sintomatica',
    ],
    products: [
      'explorar si usa productos por estrategia o por inercia',
      'buscar friccion entre producto activo y necesidad real',
      'detectar comisiones, limites o usos que esconden tension',
    ],
    goals: [
      'hacer visible el trade-off real entre objetivo y flujo actual',
      'medir realismo temporal y prioridad efectiva',
      'explorar que meta siempre se posterga y por que',
    ],
    knowledge: [
      'distinguir ignorancia puntual de sobreconfianza',
      'buscar conceptos evitados que bloquean decisiones',
      'medir comprension aplicada, no teorica',
    ],
    risk: [
      'contrastar tolerancia declarada con reaccion probable',
      'forzar escenario concreto de perdida o volatilidad',
      'medir necesidad de liquidez versus discurso de largo plazo',
    ],
    emotional: [
      'identificar gatillo emocional dominante con dinero',
      'buscar contradiccion entre control y evitacion',
      'explorar un patron repetido que deteriore ejecucion',
    ],
  };

  return blockMap[blockId] ?? blockMap.warmup;
}

export function buildInterviewStrategicBrief(params: {
  blockId: InterviewBlockId;
  intake: IntakeQuestionnaire;
  answersInCurrentBlock: string[];
}) : InterviewStrategicBrief {
  const { blockId, intake, answersInCurrentBlock } = params;
  const source = intake as unknown as Record<string, unknown>;
  const products = source.__productsContext as Record<string, unknown> | undefined;
  const budget = source.__budgetContext as Record<string, unknown> | undefined;
  const transactionSummary =
    products?.transactionSummary && typeof products.transactionSummary === 'object'
      ? (products.transactionSummary as Record<string, unknown>)
      : {};
  const budgetRows = Array.isArray(budget?.rows) ? budget.rows : [];
  const topBudgetRows = getTopBudgetRows(budgetRows);
  const answerQuality = detectAnswerQuality(answersInCurrentBlock);

  const userSnapshot = [
    typeof source.age === 'number' ? `${source.age} años` : null,
    source.profession ? `profesión ${String(source.profession)}` : null,
    typeof source.exactMonthlyIncome === 'number'
      ? `ingreso ${formatMoneyCompact(source.exactMonthlyIncome)} CLP`
      : source.incomeBand
      ? `ingreso ${String(source.incomeBand)}`
      : null,
    typeof source.moneyStressLevel === 'number' ? `estrés ${source.moneyStressLevel}/10` : null,
    typeof source.hasDebt === 'boolean' ? `deuda ${source.hasDebt ? 'activa' : 'sin deuda declarada'}` : null,
  ].filter(Boolean) as string[];

  const prioritySignals = [
    Number(budget?.balance ?? 0) < 0 ? 'el presupuesto ya muestra balance negativo' : null,
    Number(transactionSummary.netFlow ?? 0) < 0 ? 'los movimientos sugieren salida neta de caja' : null,
    typeof source.moneyStressLevel === 'number' && source.moneyStressLevel >= 7
      ? 'el estrés financiero declarado es alto'
      : null,
    source.hasDebt ? 'hay deuda activa que puede estar absorbiendo flexibilidad' : null,
    Array.isArray(transactionSummary.alerts) && transactionSummary.alerts.length > 0
      ? `hay alertas en productos: ${transactionSummary.alerts.slice(0, 2).join(' | ')}`
      : null,
    topBudgetRows.length > 0 ? `los renglones mas pesados son ${topBudgetRows.join(' | ')}` : null,
  ].filter(Boolean) as string[];

  const blindSpots = [
    source.tracksExpenses === false ? 'no registra gastos con disciplina' : null,
    source.hasSavingsOrInvestments === false ? 'no aparece un colchon claro' : null,
    source.expensesCoverage === 'dont_know' ? 'no tiene claridad sobre cobertura de gastos' : null,
    source.selfRatedUnderstanding === 'low' ? 'la comprension financiera declarada es baja' : null,
    Number(products?.productsCount ?? 0) > 1 ? 'podria haber dispersion de productos sin tesis clara' : null,
  ].filter(Boolean) as string[];

  const recentEvidence = answersInCurrentBlock
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(-2)
    .map((item) => item.slice(0, 180));

  const blockPressureMap: Record<InterviewAnswerQuality, string> = {
    none: 'abre con una pregunta amplia pero anclada a una señal concreta',
    thin: 'la respuesta vino corta; pide un ejemplo real o una escena reciente',
    substantive: 'ya hay material; ahora conviene tensar contradicciones o trade-offs',
  };

  return {
    answerQuality,
    userSnapshot,
    prioritySignals: prioritySignals.slice(0, 4),
    blindSpots: blindSpots.slice(0, 3),
    questionAngles: getQuestionAngles(blockId).slice(0, 3),
    recentEvidence,
    blockPressure: blockPressureMap[answerQuality],
  };
}
