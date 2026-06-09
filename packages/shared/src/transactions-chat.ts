import {
  TRANSACTIONS_CHAT_HISTORY_CHAR_LIMIT,
  TRANSACTIONS_CHAT_HISTORY_MESSAGE_LIMIT,
} from './chat-history';

type LooseRecord = Record<string, unknown>;

export type MovementRow = {
  date?: string;
  description?: string;
  label?: string;
  amount?: number;
  direction?: string;
  category?: string;
  merchant?: string;
};

export type QuestionSignals = {
  keywords: string[];
  amounts: number[];
  dates: Array<{ day?: number; month?: number; year?: number; iso?: string }>;
};

export type MovementRetrievalResult = {
  movements: MovementRow[];
  mode: 'targeted' | 'overview';
  matchedCount: number;
  signals: QuestionSignals;
};

const STOPWORDS = new Set([
  'que','qué','como','cómo','cuanto','cuánto','donde','dónde','cual','cuál','este','esta','estos','estas','ese','esa',
  'del','de','la','el','los','las','un','una','por','para','con','sin','sobre','mis','tus','sus','fue','fueron','hay',
  'tiene','tengo','movimiento','movimientos','compra','compras','gasto','gastos','cargo','cargos','abono','abonos',
  'transaccion','transacciones','producto','resumen','total','totales','general','generales','patron','patrones',
  'analisis','análisis','revisa','revisar','explica','explicar','dime','mostrar','muestrame','muéstrame','ver',
]);

const SPANISH_MONTHS: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

function normalizeSearchText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function movementAmount(row: MovementRow): number {
  return Math.abs(Number(row.amount ?? 0) || 0);
}

function movementDirection(row: MovementRow): 'expense' | 'income' {
  const direction = String(row.direction ?? '').toLowerCase();
  if (direction === 'income' || direction === 'inflow' || direction === 'abono') return 'income';
  const amount = Number(row.amount ?? 0);
  if (amount > 0 && direction !== 'expense') return 'income';
  return 'expense';
}

export function buildMovementPromptKey(row: MovementRow): string {
  return [String(row.date ?? ''), String(row.merchant ?? row.description ?? row.label ?? ''), String(row.amount ?? '')].join('|');
}

function movementKey(row: MovementRow): string {
  return buildMovementPromptKey(row);
}

export function selectMovementsForPrompt(movements: MovementRow[], maxMovements: number): MovementRow[] {
  if (movements.length <= maxMovements) return movements;
  const picked = new Map<string, MovementRow>();
  const take = (rows: MovementRow[]) => {
    for (const row of rows) {
      if (picked.size >= maxMovements) break;
      const key = movementKey(row);
      if (!picked.has(key)) picked.set(key, row);
    }
  };
  const expenses = movements.filter((row) => movementDirection(row) === 'expense');
  const incomes = movements.filter((row) => movementDirection(row) === 'income');
  take([...expenses].sort((a, b) => movementAmount(b) - movementAmount(a)).slice(0, Math.ceil(maxMovements * 0.45)));
  take([...incomes].sort((a, b) => movementAmount(b) - movementAmount(a)).slice(0, Math.ceil(maxMovements * 0.15)));
  take([...movements].reverse().slice(0, Math.ceil(maxMovements * 0.25)));
  take(movements.filter((row) => !picked.has(movementKey(row))).sort((a, b) => movementAmount(b) - movementAmount(a)));
  return Array.from(picked.values()).slice(0, maxMovements);
}

export function extractQuestionSignals(question: string): QuestionSignals {
  const normalized = normalizeSearchText(question);
  const keywords = normalized.replace(/[^\p{L}\p{N}\s$./-]/gu, ' ').split(/\s+/).filter((token) => token.length >= 3 && !STOPWORDS.has(token));
  const amounts = Array.from(new Set([...question.matchAll(/(?:\$|\bclp\b\s*)?(\d{1,3}(?:[.\s]\d{3})+|\d{4,8})(?:\s*clp)?/gi)]
    .map((match) => Number(String(match[1]).replace(/[.\s]/g, '')))
    .filter((value) => Number.isFinite(value) && value >= 100))).slice(0, 4);
  const dates: QuestionSignals['dates'] = [];
  for (const match of question.matchAll(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/g)) {
    dates.push({ year: Number(match[1]), month: Number(match[2]), day: Number(match[3]), iso: `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}` });
  }
  for (const match of question.matchAll(/\b(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?\b/g)) {
    dates.push({ day: Number(match[1]), month: Number(match[2]), year: match[3] ? Number(match[3].length === 2 ? `20${match[3]}` : match[3]) : undefined });
  }
  for (const match of question.matchAll(/\b(\d{1,2})\s+de\s+(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)(?:\s+de\s+(20\d{2}))?\b/gi)) {
    dates.push({ day: Number(match[1]), month: SPANISH_MONTHS[normalizeSearchText(match[2])], year: match[3] ? Number(match[3]) : undefined });
  }
  return { keywords, amounts, dates: dates.slice(0, 4) };
}

function movementSearchBlob(row: MovementRow): string {
  return normalizeSearchText([row.date, row.merchant, row.description, row.label, row.category].filter(Boolean).join(' '));
}

function parseMovementDateParts(rawDate: unknown): { day?: number; month?: number; year?: number; iso?: string } {
  const value = String(rawDate ?? '').trim();
  if (!value) return {};
  const isoMatch = value.match(/\b(20\d{2})[-/](\d{1,2})[-/](\d{1,2})\b/);
  if (isoMatch) return { year: Number(isoMatch[1]), month: Number(isoMatch[2]), day: Number(isoMatch[3]), iso: `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}-${isoMatch[3].padStart(2, '0')}` };
  const dmyMatch = value.match(/\b(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?\b/);
  if (dmyMatch) return { day: Number(dmyMatch[1]), month: Number(dmyMatch[2]), year: dmyMatch[3] ? Number(dmyMatch[3].length === 2 ? `20${dmyMatch[3]}` : dmyMatch[3]) : undefined };
  return {};
}

function movementMatchesDate(row: MovementRow, signal: QuestionSignals['dates'][number]): boolean {
  const parts = parseMovementDateParts(row.date);
  if (signal.iso && parts.iso) return parts.iso === signal.iso;
  if (signal.day && parts.day && signal.day !== parts.day) return false;
  if (signal.month && parts.month && signal.month !== parts.month) return false;
  if (signal.year && parts.year && signal.year !== parts.year) return false;
  return Boolean(signal.day || signal.month || signal.year || signal.iso);
}

function scoreMovementForQuestion(row: MovementRow, signals: QuestionSignals): number {
  let score = 0;
  const blob = movementSearchBlob(row);
  for (const keyword of signals.keywords) if (blob.includes(keyword)) score += 4;
  for (const amount of signals.amounts) {
    const rowAmount = movementAmount(row);
    if (rowAmount === amount) score += 10;
    else if (amount > 0 && Math.abs(rowAmount - amount) / amount <= 0.02) score += 6;
  }
  for (const dateSignal of signals.dates) if (movementMatchesDate(row, dateSignal)) score += 8;
  return score;
}

function isOverviewQuestion(signals: QuestionSignals): boolean {
  return !(signals.keywords.length > 0 || signals.amounts.length > 0 || signals.dates.length > 0);
}

export function retrieveMovementsForQuestion(
  question: string,
  movements: MovementRow[],
  options?: { maxRetrieved?: number; overviewSample?: number; minScore?: number },
): MovementRetrievalResult {
  const maxRetrieved = options?.maxRetrieved ?? 12;
  const overviewSample = options?.overviewSample ?? 24;
  const minScore = options?.minScore ?? 4;
  const signals = extractQuestionSignals(question);
  if (movements.length === 0) return { movements: [], mode: 'overview', matchedCount: 0, signals };
  if (isOverviewQuestion(signals)) {
    return { movements: selectMovementsForPrompt(movements, overviewSample), mode: 'overview', matchedCount: 0, signals };
  }
  const ranked = movements.map((row) => ({ row, score: scoreMovementForQuestion(row, signals) })).filter((entry) => entry.score >= minScore).sort((a, b) => b.score - a.score || movementAmount(b.row) - movementAmount(a.row));
  if (ranked.length === 0) return { movements: selectMovementsForPrompt(movements, overviewSample), mode: 'overview', matchedCount: 0, signals };
  const targeted = ranked.slice(0, maxRetrieved).map((entry) => entry.row);
  if (targeted.length >= maxRetrieved) return { movements: targeted, mode: 'targeted', matchedCount: ranked.length, signals };
  const targetedKeys = new Set(targeted.map((row) => movementKey(row)));
  const supplement = selectMovementsForPrompt(movements.filter((row) => !targetedKeys.has(movementKey(row))), Math.max(0, overviewSample - targeted.length));
  return { movements: [...targeted, ...supplement], mode: 'targeted', matchedCount: ranked.length, signals };
}

function compactMovementRow(row: MovementRow) {
  return { date: row.date ?? '', description: compactTxText(row.description ?? row.label ?? '', 96), amount: row.amount ?? 0, direction: row.direction ?? 'expense', category: compactTxText(row.category ?? '', 48), merchant: compactTxText(row.merchant ?? '', 48) };
}

export function buildChatDashboardForQuestion(dashboard: unknown, question: string, options?: { maxRetrieved?: number; overviewSample?: number }): LooseRecord | null {
  if (!dashboard || typeof dashboard !== 'object') return null;
  const d = dashboard as LooseRecord;
  const allMovements = Array.isArray(d.movements) ? (d.movements as MovementRow[]) : [];
  const retrieval = retrieveMovementsForQuestion(question, allMovements, options);
  return { period: d.period ?? null, currency: d.currency ?? null, keyMetrics: d.keyMetrics ?? null, topCategories: Array.isArray(d.topCategories) ? d.topCategories.slice(0, 8) : [], topMerchants: Array.isArray(d.topMerchants) ? d.topMerchants.slice(0, 10) : [], spendClusters: Array.isArray(d.spendClusters) ? d.spendClusters.slice(0, 4) : [], alerts: Array.isArray(d.alerts) ? d.alerts.slice(0, 3) : [], retrieval: { mode: retrieval.mode, matchedCount: retrieval.matchedCount, signals: retrieval.signals }, movements: retrieval.movements.map(compactMovementRow) };
}

export function compactTxText(value: unknown, max = 16000): string {
  return String(value ?? '').trim().slice(0, max);
}

export function compactDashboardForPrompt(dashboard: unknown, options?: { maxMovements?: number; maxMerchants?: number }): LooseRecord | null {
  if (!dashboard || typeof dashboard !== 'object') return null;
  const d = dashboard as LooseRecord;
  const maxMovements = options?.maxMovements ?? 64;
  const maxMerchants = options?.maxMerchants ?? 10;
  const movements = Array.isArray(d.movements) ? (d.movements as MovementRow[]) : [];
  const selectedMovements = selectMovementsForPrompt(movements, maxMovements);
  return { period: d.period ?? null, currency: d.currency ?? null, keyMetrics: d.keyMetrics ?? null, topCategories: Array.isArray(d.topCategories) ? d.topCategories.slice(0, 8) : [], topMerchants: Array.isArray(d.topMerchants) ? d.topMerchants.slice(0, maxMerchants) : [], spendClusters: Array.isArray(d.spendClusters) ? d.spendClusters.slice(0, 6) : [], alerts: Array.isArray(d.alerts) ? d.alerts.slice(0, 4) : [], alertDetails: Array.isArray(d.alertDetails) ? d.alertDetails.slice(0, 4) : [], movements: selectedMovements.map((row) => compactMovementRow(row)) };
}

export function compactDocumentsForPrompt(docs: Array<{ documentId?: string; name?: string; text?: string; insight?: unknown; summary?: unknown; documentProfile?: unknown }>, options?: { maxDocs?: number; maxText?: number }) {
  const maxDocs = options?.maxDocs ?? 4;
  const maxText = options?.maxText ?? 900;
  return docs.slice(0, maxDocs).map((doc) => ({
    documentId: doc.documentId,
    name: compactTxText(doc.name ?? '', 120),
    insight: doc.insight ?? null,
    documentProfile: doc.documentProfile ?? null,
    text: compactTxText(doc.text ?? '', maxText),
  }));
}

export function compactChatHistory(
  messages: Array<{ role?: string; text?: string }>,
  maxMessages = TRANSACTIONS_CHAT_HISTORY_MESSAGE_LIMIT,
  maxText = TRANSACTIONS_CHAT_HISTORY_CHAR_LIMIT,
) {
  return messages.slice(-maxMessages).map((message) => ({ role: message.role === 'assistant' ? 'assistant' : 'user', text: compactTxText(message.text ?? '', maxText) }));
}
