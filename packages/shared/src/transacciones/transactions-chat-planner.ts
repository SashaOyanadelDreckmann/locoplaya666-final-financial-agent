import {
  buildMovementPromptKey,
  extractQuestionSignals,
  retrieveMovementsForQuestion,
  type MovementRow,
  type QuestionSignals,
} from './transactions-chat';

type LooseRecord = Record<string, unknown>;

export type TxChatStarterChip = {
  id: string;
  label: string;
  question: string;
};

export type TxDeterministicAnswer = {
  reply: string;
  suggestedFollowups: string[];
  referencedMovementKeys: string[];
  source: 'deterministic';
};

export type TxDashboardDigest = {
  period?: { from?: string; to?: string } | null;
  currency?: string;
  keyMetrics?: {
    inflows_total?: number;
    abonos_total?: number;
    outflows_total?: number;
    net_flow?: number;
    avg_movement?: number;
    movement_count?: number;
    median_movement?: number;
    p90_movement?: number;
    max_income?: number;
    max_expense?: number;
    table_rows_verified?: number;
  } | null;
  topCategories?: Array<{ name?: string; amount?: number; count?: number }>;
  topMerchants?: Array<{ merchant?: string; amount?: number; count?: number }>;
  alerts?: string[];
  movements?: MovementRow[];
};

function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function formatTxClp(value: number, currency = 'CLP'): string {
  const safe = Number.isFinite(value) ? value : 0;
  if (currency !== 'CLP') return `${safe.toLocaleString('es-CL')} ${currency}`;
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(safe);
}

function readDashboard(dashboard: unknown): TxDashboardDigest | null {
  if (!dashboard || typeof dashboard !== 'object') return null;
  const d = dashboard as LooseRecord;
  return {
    period: (d.period as TxDashboardDigest['period']) ?? null,
    currency: typeof d.currency === 'string' ? d.currency : 'CLP',
    keyMetrics: (d.keyMetrics as TxDashboardDigest['keyMetrics']) ?? null,
    topCategories: Array.isArray(d.topCategories) ? (d.topCategories as TxDashboardDigest['topCategories']) : [],
    topMerchants: Array.isArray(d.topMerchants) ? (d.topMerchants as TxDashboardDigest['topMerchants']) : [],
    alerts: Array.isArray(d.alerts) ? d.alerts.map(String) : [],
    movements: Array.isArray(d.movements) ? (d.movements as MovementRow[]) : [],
  };
}

function movementDirection(row: MovementRow): 'expense' | 'income' {
  const direction = String(row.direction ?? '').toLowerCase();
  if (direction === 'income' || direction === 'inflow' || direction === 'abono') return 'income';
  const amount = Number(row.amount ?? 0);
  if (amount > 0 && direction !== 'expense') return 'income';
  return 'expense';
}

function movementAmount(row: MovementRow): number {
  return Math.abs(Number(row.amount ?? 0) || 0);
}

function movementSearchBlob(row: MovementRow): string {
  return normalizeSearchText([row.date, row.merchant, row.description, row.label, row.category].filter(Boolean).join(' '));
}

function questionBlob(question: string): string {
  return normalizeSearchText(question);
}

function matchesAny(blob: string, tokens: string[]): boolean {
  return tokens.some((token) => blob.includes(token));
}

const METRIC_INTENTS = {
  outflows: [
    'egreso total',
    'egresos totales',
    'total egresos',
    'total de egresos',
    'gasto total',
    'gastos totales',
    'total gastos',
    'total de gastos',
    'cuanto gaste en total',
    'cuánto gasté en total',
    'cuanto gaste total',
    'cuánto gasté total',
    'outflow',
    'outflows',
  ],
  inflows: ['ingreso', 'ingresos', 'abono', 'abonos', 'inflow', 'inflows', 'recibi', 'recibí', 'entrada', 'entradas'],
  netFlow: ['flujo neto', 'saldo neto', 'balance del periodo', 'resultado del periodo', 'cuanto me quedo', 'cuánto me quedó', 'cuanto queda', 'cuánto queda'],
  movementCount: ['cuantos movimientos', 'cuántos movimientos', 'cantidad de movimientos', 'numero de movimientos', 'número de movimientos', 'cuantas transacciones', 'cuántas transacciones'],
  avgTicket: ['ticket promedio', 'promedio por movimiento', 'monto promedio', 'gasto promedio'],
  topMerchants: ['top comercios', 'principales comercios', 'comercios destacados', 'donde gaste mas', 'donde gasté más', 'donde gasto mas', 'donde gasto más'],
  topCategories: ['top categorias', 'top categorías', 'principales categorias', 'principales categorías', 'categorias principales', 'categorías principales', 'en que gaste', 'en qué gasté', 'en que gasto', 'en qué gasto'],
  spendRatio: ['ratio', 'porcentaje gasto', 'gasto ingreso', 'gasto/ingreso', 'gasto sobre ingreso'],
  period: ['periodo', 'rango', 'desde cuando', 'desde cuándo', 'entre que fechas', 'entre qué fechas', 'fechas'],
  alerts: ['alerta', 'alertas', 'anomalia', 'anomalía', 'anomalias', 'anomalías', 'duplicado', 'duplicados', 'cargo duplicado', 'cargos duplicados'],
} as const;

function detectMetricIntent(blob: string): keyof typeof METRIC_INTENTS | null {
  for (const [intent, tokens] of Object.entries(METRIC_INTENTS) as Array<[keyof typeof METRIC_INTENTS, readonly string[]]>) {
    if (matchesAny(blob, [...tokens])) return intent;
  }
  return null;
}

function periodLabel(period: TxDashboardDigest['period']): string | null {
  if (!period?.from && !period?.to) return null;
  if (period?.from && period?.to) return `${period.from} a ${period.to}`;
  return period?.from ?? period?.to ?? null;
}

function sumMovements(rows: MovementRow[], direction?: 'expense' | 'income'): number {
  return rows
    .filter((row) => (direction ? movementDirection(row) === direction : true))
    .reduce((sum, row) => sum + movementAmount(row), 0);
}

function topKeywordMatches(blob: string, keywords: string[]): string[] {
  return keywords.filter((keyword) => blob.includes(keyword));
}

export function formatRetrievalSignalsLabel(
  signals: QuestionSignals,
  mode: 'targeted' | 'overview',
  matchedCount: number,
): string {
  if (mode === 'overview') return 'Vista general del periodo';
  const parts: string[] = [];
  if (signals.keywords.length > 0) parts.push(`términos: ${signals.keywords.slice(0, 4).join(', ')}`);
  if (signals.amounts.length > 0) {
    parts.push(`montos: ${signals.amounts.slice(0, 2).map((amount) => formatTxClp(amount)).join(', ')}`);
  }
  if (signals.dates.length > 0) {
    const dateBits = signals.dates
      .slice(0, 2)
      .map((date) => {
        if (date.iso) return date.iso;
        const chunks = [date.day, date.month, date.year].filter(Boolean);
        return chunks.length > 0 ? chunks.join('/') : '';
      })
      .filter(Boolean);
    if (dateBits.length > 0) parts.push(`fechas: ${dateBits.join(', ')}`);
  }
  const detail = parts.length > 0 ? parts.join(' · ') : 'coincidencias contextuales';
  return matchedCount > 0
    ? `Búsqueda focalizada · ${matchedCount} movimiento${matchedCount === 1 ? '' : 's'} · ${detail}`
    : `Búsqueda focalizada · ${detail}`;
}

export function buildTransactionStarterChips(dashboard: unknown, max = 6): TxChatStarterChip[] {
  const digest = readDashboard(dashboard);
  if (!digest) return [];
  const chips: TxChatStarterChip[] = [];
  const push = (id: string, label: string, question: string) => {
    if (chips.some((chip) => chip.id === id)) return;
    chips.push({ id, label, question });
  };

  push('total-outflows', 'Total egresos', '¿Cuánto fueron mis egresos totales?');
  push('net-flow', 'Flujo neto', '¿Cuál es mi flujo neto del periodo?');
  push('top-merchants', 'Top comercios', '¿Cuáles son mis principales comercios por monto?');

  const topMerchant = digest.topMerchants?.[0]?.merchant;
  if (topMerchant) {
    push(`merchant-${normalizeSearchText(topMerchant)}`, `Gasto en ${topMerchant}`, `¿Cuánto gasté en ${topMerchant}?`);
  }

  const topCategory = digest.topCategories?.[0]?.name;
  if (topCategory) {
    push(`category-${normalizeSearchText(topCategory)}`, `Categoría ${topCategory}`, `¿Cuánto gasté en ${topCategory}?`);
  }

  if ((digest.alerts?.length ?? 0) > 0) {
    push('alerts', 'Alertas', '¿Qué alertas o anomalías detectaste en mis movimientos?');
  }

  push('movement-count', 'Cantidad', '¿Cuántos movimientos válidos detectaste?');
  push('avg-ticket', 'Ticket promedio', '¿Cuál es el ticket promedio por movimiento?');

  return chips.slice(0, max);
}

export function buildTransactionSuggestedFollowups(
  question: string,
  dashboard: unknown,
  options?: { retrievalMode?: 'targeted' | 'overview'; exclude?: string[] },
): string[] {
  const digest = readDashboard(dashboard);
  const exclude = new Set((options?.exclude ?? []).map((item) => normalizeSearchText(item)));
  const starters = buildTransactionStarterChips(dashboard, 8)
    .map((chip) => chip.question)
    .filter((item) => !exclude.has(normalizeSearchText(item)) && normalizeSearchText(item) !== questionBlob(question));

  if (options?.retrievalMode === 'targeted' && digest?.topMerchants?.[0]?.merchant) {
    const merchant = digest.topMerchants[0].merchant!;
    const follow = `¿Qué otros cargos hay de ${merchant}?`;
    if (!exclude.has(normalizeSearchText(follow))) starters.unshift(follow);
  }

  return starters.slice(0, 3);
}

export function planDeterministicTransactionAnswer(
  question: string,
  dashboard: unknown,
): TxDeterministicAnswer | null {
  const digest = readDashboard(dashboard);
  if (!digest) return null;

  const metrics = digest.keyMetrics ?? {};
  const currency = digest.currency ?? 'CLP';
  const movements = digest.movements ?? [];
  const blob = questionBlob(question);
  const signals = extractQuestionSignals(question);
  const retrieval = retrieveMovementsForQuestion(question, movements, { maxRetrieved: 12, overviewSample: 16 });
  const referencedMovementKeys = retrieval.movements.map((row) => buildMovementPromptKey(row));
  const followups = () =>
    buildTransactionSuggestedFollowups(question, digest, {
      retrievalMode: retrieval.mode,
      exclude: [question],
    });

  const keywordHits = topKeywordMatches(blob, signals.keywords);
  if (keywordHits.length > 0 && movements.length > 0) {
    const matched = movements.filter((row) => keywordHits.some((keyword) => movementSearchBlob(row).includes(keyword)));
    if (matched.length > 0) {
      const expenseTotal = sumMovements(matched, 'expense');
      const incomeTotal = sumMovements(matched, 'income');
      const label = keywordHits[0];
      const dominant =
        expenseTotal >= incomeTotal
          ? `gastos por ${formatTxClp(expenseTotal, currency)}`
          : `abonos por ${formatTxClp(incomeTotal, currency)}`;
      const sample = matched
        .slice(0, 2)
        .map((row) => `${row.date ?? 's/f'} · ${row.merchant ?? row.description ?? row.label ?? 'Movimiento'} · ${formatTxClp(movementAmount(row), currency)}`)
        .join(' | ');
      return {
        reply: `Encontré ${matched.length} movimiento${matched.length === 1 ? '' : 's'} relacionados con "${label}" (${dominant}). Ejemplos: ${sample}.`,
        suggestedFollowups: buildTransactionSuggestedFollowups(question, digest, {
          retrievalMode: 'targeted',
          exclude: [question],
        }),
        referencedMovementKeys: matched.map((row) => buildMovementPromptKey(row)),
        source: 'deterministic',
      };
    }
  }

  const intent = detectMetricIntent(blob);
  const period = periodLabel(digest.period);

  if (intent === 'outflows') {
    const total = Number(metrics.outflows_total ?? 0) || sumMovements(movements, 'expense');
    return {
      reply: `Tus egresos totales${period ? ` entre ${period}` : ''} suman ${formatTxClp(total, currency)} según el dashboard consolidado.`,
      suggestedFollowups: followups(),
      referencedMovementKeys,
      source: 'deterministic',
    };
  }

  if (intent === 'inflows') {
    const total = Number(metrics.inflows_total ?? metrics.abonos_total ?? 0) || sumMovements(movements, 'income');
    return {
      reply: `Tus ingresos o abonos${period ? ` entre ${period}` : ''} suman ${formatTxClp(total, currency)}.`,
      suggestedFollowups: followups(),
      referencedMovementKeys,
      source: 'deterministic',
    };
  }

  if (intent === 'netFlow') {
    const inflows = Number(metrics.inflows_total ?? 0) || sumMovements(movements, 'income');
    const outflows = Number(metrics.outflows_total ?? 0) || sumMovements(movements, 'expense');
    const net = Number(metrics.net_flow ?? inflows - outflows);
    return {
      reply: `El flujo neto${period ? ` del periodo ${period}` : ''} es ${formatTxClp(net, currency)} (ingresos ${formatTxClp(inflows, currency)} vs egresos ${formatTxClp(outflows, currency)}).`,
      suggestedFollowups: followups(),
      referencedMovementKeys,
      source: 'deterministic',
    };
  }

  if (intent === 'movementCount') {
    const count = Number(metrics.movement_count ?? movements.length) || 0;
    const verified = Number(metrics.table_rows_verified ?? 0) || 0;
    const verifiedNote = verified > 0 ? `, con ${verified.toLocaleString('es-CL')} filas tabulares de alta fidelidad` : '';
    return {
      reply: `Detecté ${count.toLocaleString('es-CL')} movimientos válidos${period ? ` entre ${period}` : ''}${verifiedNote}.`,
      suggestedFollowups: followups(),
      referencedMovementKeys,
      source: 'deterministic',
    };
  }

  if (intent === 'avgTicket') {
    const avg = Number(metrics.avg_movement ?? 0) || (movements.length > 0 ? sumMovements(movements) / movements.length : 0);
    return {
      reply: `El ticket promedio por movimiento es ${formatTxClp(Math.round(avg), currency)}.`,
      suggestedFollowups: followups(),
      referencedMovementKeys,
      source: 'deterministic',
    };
  }

  if (intent === 'topMerchants') {
    const merchants = digest.topMerchants ?? [];
    if (merchants.length === 0) return null;
    const summary = merchants
      .slice(0, 3)
      .map((row) => `${row.merchant ?? 'Comercio'} (${formatTxClp(Number(row.amount ?? 0), currency)})`)
      .join('; ');
    return {
      reply: `Tus principales comercios por monto son: ${summary}.`,
      suggestedFollowups: followups(),
      referencedMovementKeys,
      source: 'deterministic',
    };
  }

  if (intent === 'topCategories') {
    const categories = digest.topCategories ?? [];
    if (categories.length === 0) return null;
    const summary = categories
      .slice(0, 3)
      .map((row) => `${row.name ?? 'Categoría'} (${formatTxClp(Number(row.amount ?? 0), currency)})`)
      .join('; ');
    return {
      reply: `Las categorías con mayor gasto son: ${summary}.`,
      suggestedFollowups: followups(),
      referencedMovementKeys,
      source: 'deterministic',
    };
  }

  if (intent === 'spendRatio') {
    const inflows = Number(metrics.inflows_total ?? 0) || sumMovements(movements, 'income');
    const outflows = Number(metrics.outflows_total ?? 0) || sumMovements(movements, 'expense');
    if (inflows <= 0) return null;
    const ratio = (outflows / inflows) * 100;
    return {
      reply: `Tu ratio gasto/ingreso es ${ratio.toFixed(1)}% (${formatTxClp(outflows, currency)} sobre ${formatTxClp(inflows, currency)}).`,
      suggestedFollowups: followups(),
      referencedMovementKeys,
      source: 'deterministic',
    };
  }

  if (intent === 'period') {
    if (!period) return null;
    const count = Number(metrics.movement_count ?? movements.length) || 0;
    return {
      reply: `El análisis cubre el periodo ${period} con ${count.toLocaleString('es-CL')} movimientos válidos.`,
      suggestedFollowups: followups(),
      referencedMovementKeys,
      source: 'deterministic',
    };
  }

  if (intent === 'alerts') {
    const alerts = digest.alerts ?? [];
    if (alerts.length === 0) {
      return {
        reply: 'No detecté alertas críticas en este producto; si quieres, revisamos un comercio o categoría puntual.',
        suggestedFollowups: followups(),
        referencedMovementKeys,
        source: 'deterministic',
      };
    }
    return {
      reply: `Puntos a revisar: ${alerts.slice(0, 3).join(' ')}`,
      suggestedFollowups: followups(),
      referencedMovementKeys,
      source: 'deterministic',
    };
  }

  return null;
}

export function collectRetrievalSignalsUsed(signals: QuestionSignals): string[] {
  const used: string[] = [];
  for (const keyword of signals.keywords.slice(0, 4)) used.push(keyword);
  for (const amount of signals.amounts.slice(0, 2)) used.push(formatTxClp(amount));
  for (const date of signals.dates.slice(0, 2)) {
    if (date.iso) used.push(date.iso);
    else {
      const chunks = [date.day, date.month, date.year].filter(Boolean);
      if (chunks.length > 0) used.push(chunks.join('/'));
    }
  }
  return used;
}
