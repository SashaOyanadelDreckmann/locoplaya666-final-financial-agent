import { getApiBaseUrl, getAppBaseUrl } from '@/lib/apiBase';
export {
  hasCompletedIntakeAccess,
  hasMeaningfulIntake,
  resolveAuthRedirectPath,
} from '@/lib/sessionAccess';
import { humanizeDiagnosticText } from '@/lib/diagnosticText';
import type { ChatItem } from '@/lib/agent.response.types';
import {
  getClosingModeTurn,
  MAX_CHAT_TURNS_BY_CHAT,
  resolveActionPlanFunnelStage,
} from '@financial-agent/shared';

export const MAX_CHAT_INTERACTIONS: Record<string, number> = {
  ...MAX_CHAT_TURNS_BY_CHAT,
};

export function getMaxChatInteractions(chatId?: string): number {
  if (!chatId) return MAX_CHAT_INTERACTIONS['chat-1'];
  return MAX_CHAT_INTERACTIONS[chatId] ?? MAX_CHAT_INTERACTIONS['chat-1'];
}

export function getClosingInteractionThreshold(chatId?: string): number {
  const id = (chatId ?? 'chat-1') as keyof typeof MAX_CHAT_TURNS_BY_CHAT;
  if (id in MAX_CHAT_TURNS_BY_CHAT) return getClosingModeTurn(id);
  return getClosingModeTurn('chat-1');
}

export function resolveActiveActionPlanStage(params: {
  chatId?: string;
  turnCount?: number;
  closingMode?: boolean;
}) {
  return resolveActionPlanFunnelStage({
    activeChatId: params.chatId,
    turnCount: params.turnCount,
    closingMode: params.closingMode,
  });
}

type ParsedDocument = {
  name: string;
  text: string;
  summary?: unknown;
  structuredData?: unknown;
  insight?: {
    reliability?: number;
    extracted_rows?: number;
    key_findings?: string[];
  };
};
type BankProductLike = {
  bank: string;
  parsedDocuments: ParsedDocument[];
  label?: string;
  dashboard?: {
    summary?: string;
    keyMetrics?: {
      inflows_total: number;
      outflows_total: number;
      net_flow: number;
      avg_movement: number;
      movement_count: number;
    };
    alerts?: string[];
  };
};

type CanonicalMovement = {
  date?: string;
  description: string;
  amount: number;
  direction: 'expense' | 'income';
  source_line?: string;
};

const INSTITUTION_THEME: Array<{ match: RegExp; color: string }> = [
  { match: /bancoestado|estado/gi, color: '#0054A6' },
  { match: /santander/gi, color: '#EC0000' },
  { match: /\bbci\b|credito e inversiones/gi, color: '#1F8EFA' },
  { match: /chile|edwards/gi, color: '#0039A6' },
  { match: /scotia|scotiabank/gi, color: '#E31937' },
  { match: /ita[uú]/gi, color: '#FF6A00' },
  { match: /falabella|cmr/gi, color: '#7AB800' },
  { match: /ripley/gi, color: '#7F3F98' },
  { match: /fintual/gi, color: '#0F2A4A' },
  { match: /mercado pago/gi, color: '#00AEEF' },
  { match: /tenpo/gi, color: '#5B2EFF' },
];

export function institutionColor(institution: string): string {
  const target = (institution || '').toLowerCase();
  for (const candidate of INSTITUTION_THEME) {
    candidate.match.lastIndex = 0;
    if (candidate.match.test(target)) return candidate.color;
  }
  return '#3B5B7A';
}

export function buildInitialAgentSuggestions(intakeLike: unknown): string[] {
  const asRecord = (v: unknown): Record<string, unknown> | null =>
    typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : null;

  const root = asRecord(intakeLike);
  const intake = asRecord(root?.intake) ?? root;

  const hasDebt = typeof intake?.hasDebt === 'boolean' ? intake.hasDebt : null;
  const hasSavings =
    typeof intake?.hasSavingsOrInvestments === 'boolean' ? intake.hasSavingsOrInvestments : null;
  const tracksExpenses = typeof intake?.tracksExpenses === 'string' ? intake.tracksExpenses : '';
  const riskReaction = typeof intake?.riskReaction === 'string' ? intake.riskReaction : '';
  const incomeBand = typeof intake?.incomeBand === 'string' ? intake.incomeBand : '';

  const suggestions: string[] = [
    'Diagnóstico express de mi situación financiera',
    'Construir plan de 90 días para ordenar mis finanzas',
    'Simular ahorro mensual con mi perfil actual',
    'Qué ajustar primero para mejorar mi flujo mensual',
  ];

  if (hasDebt === true) {
    suggestions.push('Priorizar mis deudas con estrategia avalancha', 'Simular prepago vs invertir mes a mes');
  } else {
    suggestions.push('Diseñar fondo de emergencia ideal para mi caso', 'Elegir entre ahorro conservador vs balanceado');
  }

  if (hasSavings === true) suggestions.push('Optimizar mis ahorros actuales con metas claras');
  else suggestions.push('Crear hábito de ahorro automático sin ahogarme');

  if (tracksExpenses === 'no' || tracksExpenses === 'sometimes') suggestions.push('Armar presupuesto base 50/30/20 personalizado');
  else suggestions.push('Detectar gastos hormiga y recuperar margen');

  if (riskReaction === 'sell' || riskReaction === 'never_invest') suggestions.push('Plan de inversión conservador paso a paso');
  else if (riskReaction === 'buy_more') suggestions.push('Simular cartera más agresiva con límites de riesgo');
  else suggestions.push('Comparar perfil conservador vs balanceado vs agresivo');

  if (incomeBand === 'variable' || incomeBand === 'no_income') suggestions.push('Plan financiero para ingresos variables');
  else suggestions.push('Proyección anual de ahorro con mis ingresos actuales');

  suggestions.push('Ver tasas actuales en Chile (UF, TPM, hipotecario)', 'Checklist de decisiones para este mes');

  return Array.from(new Set(suggestions)).slice(0, 12);
}

export function sanitizeMessageText(value: unknown, fallback = ''): string {
  const raw = typeof value === 'string' ? value : String(value ?? '');
  const shouldHumanizeReportText =
    /\bDiagn[oó]stico corto\b/i.test(raw) ||
    /\bajustes priorizados\b/i.test(raw) ||
    /\bmeta de ahorro mensual\b/i.test(raw) ||
    /\bResumen de flujo de caja\b/i.test(raw) ||
    /\bLectura editorial\b/i.test(raw) ||
    /\bNarrativa diagn[oó]stica\b/i.test(raw) ||
    /\bHallazgos clave\b/i.test(raw) ||
    /\bRecomendaciones priorizadas\b/i.test(raw) ||
    /\\(?:mu|sigma|alpha|beta|gamma|delta|epsilon|theta|pi|frac)\b/i.test(raw);

  if (shouldHumanizeReportText) {
    return humanizeDiagnosticText(raw, fallback);
  }

  const protectedSegments: Array<{ key: string; value: string }> = [];
  let protectedIndex = 0;
  const protect = (valueToProtect: string) => {
    const key = `@@SANITIZE_SEGMENT_${protectedIndex++}@@`;
    protectedSegments.push({ key, value: valueToProtect });
    return key;
  };

  const withProtectedMathAndCode = raw
    .replace(/```[\s\S]*?```/g, (segment) => protect(segment))
    .replace(/\$\$[\s\S]*?\$\$/g, (segment) => protect(segment))
    .replace(/\$[^$\n]+\$/g, (segment) => protect(segment));

  const cleaned = withProtectedMathAndCode
    .replace(/(?:^|\n)\s*SUGERENCIAS\s*:\s*\[[\s\S]*?\]\s*(?=\n|$)/gi, '\n')
    .replace(/<SUGERENCIAS>[\s\S]*?<\/SUGERENCIAS>/gi, '\n')
    .replace(/\bundefined\b/gi, '')
    .replace(/\bnull\b/gi, '')
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
    .replace(/([.,;:!?])([^\s])/g, '$1 $2')
    .replace(/([a-záéíóúñ])(\d)/gi, '$1 $2')
    .replace(/(\d)([a-záéíóúñ])/gi, '$1 $2')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();

  let restored = cleaned;
  for (const segment of protectedSegments) {
    restored = restored.replace(segment.key, segment.value);
  }

  return restored || fallback.trim();
}

function stripEditorialFormatting(input: string): string {
  return input
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/\[([^\]\n]+)\]\(style[-:][^)]+\)/gi, '$1')
    .replace(/\+\+([^+\n]+)\+\+/g, '$1');
}

export function sanitizeChatItems(items: ChatItem[]): ChatItem[] {
  return items
    .map((item) => {
      if (item.type !== 'message') return item;
      const raw = String(item.content ?? '');
      if (item.role === 'assistant' && !raw.trim()) {
        return { ...item, content: '' };
      }
      const content = sanitizeMessageText(item.content, item.role === 'assistant' ? '—' : '');
      if (!content && item.role !== 'assistant') return null;
      return { ...item, content };
    })
    .filter((item): item is ChatItem => Boolean(item));
}

export function hasAssistantMessage(items: ChatItem[]): boolean {
  return items.some((item) => item.type === 'message' && item.role === 'assistant');
}

function normalizeAssistantMessageContent(item: Extract<ChatItem, { type: 'message'; role: 'assistant' }>): string {
  return stripEditorialFormatting(sanitizeMessageText(item.content, ''))
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

export function dedupeConsecutiveAssistantMessages(items: ChatItem[]): ChatItem[] {
  let lastKeptAssistantContent = '';
  let lastKeptWasAssistant = false;
  return items.filter((item) => {
    if (item.type !== 'message' || item.role !== 'assistant') {
      lastKeptWasAssistant = false;
      return true;
    }
    const normalized = normalizeAssistantMessageContent(item);
    if (!normalized) {
      lastKeptAssistantContent = normalized;
      lastKeptWasAssistant = true;
      return true;
    }
    if (lastKeptWasAssistant && normalized === lastKeptAssistantContent) return false;
    lastKeptAssistantContent = normalized;
    lastKeptWasAssistant = true;
    return true;
  });
}

export function resolveUnlockedChatIds(params: {
  unlockedChats?: string[] | null;
  interviewCompleted?: boolean;
}): string[] {
  if (params.interviewCompleted) {
    return ['chat-1', 'chat-2', 'chat-3'];
  }

  const unlocked = (params.unlockedChats ?? [])
    .map((id) => String(id ?? '').trim())
    .filter(Boolean);

  return unlocked.includes('chat-1') ? unlocked : ['chat-1', ...unlocked];
}

export function formatRemainingInteractions(usedInteractions: number, chatId?: string): string {
  const maxInteractions = getMaxChatInteractions(chatId);
  const remaining = Math.max(0, maxInteractions - Math.max(0, Math.floor(usedInteractions)));
  if (remaining === maxInteractions) return `${maxInteractions} interacciones`;
  if (remaining === 1) return '1 interacción restante';
  return `${remaining} interacciones restantes`;
}

export function getChatDisplayTitle(params: {
  chatId: string;
  fallbackTitle: string;
  diagnosisUnlocked?: boolean;
}): string {
  if (params.chatId === 'chat-1' && params.diagnosisUnlocked) {
    return 'Chat general';
  }
  if (params.chatId === 'chat-1') {
    return 'Entrevista';
  }
  return params.fallbackTitle;
}

export function resolveDocumentUrl(raw: string): string {
  if (!raw) return '#';
  if (/^(https?:\/\/|blob:|data:)/i.test(raw)) return raw;
  const isLocalAsset = raw.startsWith('/generated/') || raw.startsWith('/planes/');
  const base = isLocalAsset ? getAppBaseUrl() : getApiBaseUrl();
  if (raw.startsWith('/')) return `${base}${raw}`;
  return `${base}/${raw.replace(/^\/+/, '')}`;
}

export function firstNameOf(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'Usuario';
  return value.trim().split(/\s+/)[0] ?? 'Usuario';
}

function normalizeAmountToken(token: string): number | null {
  if (/\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(token)) return null;
  if (/[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(token) && !/\b(?:clp|usd|uf)\b/i.test(token)) return null;
  const cleaned = token.replace(/[^\d.,+-]/g, '').trim();
  if (!cleaned) return null;
  const unsigned = cleaned.replace(/^[+-]/, '');
  const hasDot = unsigned.includes('.');
  const hasComma = unsigned.includes(',');
  let normalized = cleaned;
  if (hasDot && hasComma) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (hasComma) {
    const [, decimals = ''] = unsigned.split(',');
    normalized = decimals.length === 3 ? cleaned.replace(/,/g, '') : cleaned.replace(',', '.');
  } else {
    normalized = cleaned.replace(/[.\s]/g, '');
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed !== 0 ? Math.abs(parsed) : null;
}

export function buildTransactionIntelligence(
  parsedDocuments: ParsedDocument[],
  canonicalMovements: CanonicalMovement[] = [],
) {
  const keywordMatchers = [
    { label: 'Delivery', regex: /pedidos\s*ya|pedidosya|rappi|uber\s*eats|ubereats|cornershop|corner\s*shop|didi\s*food|didifood|glovo|delivery/gi },
    { label: 'Comida rapida', regex: /mcdonalds?|burger\s*king|kfc|subway|dominos?|papa\s*johns|doggis|dunkin|starbucks|pizza\s*hut|wok|sbarro/gi },
    { label: 'Supermercado', regex: /jumbo|lider(?:\s*express)?|express\s*de\s*lider|santa\s*isabel|unimarc|tottus|acuenta|superbodega\s*a\s*cuenta|superbodega|ekono|alvi|mayorista\s*10|provimarket|oxxo/gi },
    { label: 'Hogar', regex: /homecenter|sodimac|easy|construmart|ferreter[ií]a|muebles|decoraci[oó]n|hogar|ikea|casaideas|tricot|bata|paris|falabella|ripley|hites|abc(?:din)?|la\s*polar/gi },
    { label: 'Retail', regex: /mercadolibre|aliexpress|amazon|temu|shein|linio|falabella|ripley|paris|hites|abc(?:din)?|la\s*polar|tienda|retail|marketplace/gi },
    { label: 'Telefonia', regex: /movistar|entel|claro|wom|virgin|telsur|gtd|telefon[ií]a|celular|m[oó]vil|prepago|recarga/gi },
    { label: 'Servicios', regex: /aguas?|luz|electricidad|energia|gas|internet|wifi|fibra|servicio[s]?|sanitaria|alcantarillado|condominio|aseo|municipal/gi },
    { label: 'Transporte', regex: /uber|cabify|metro|copec|shell|bencina|combustible|peaje|taxi|bip|transantiago|redbus|red/gi },
    { label: 'Transferencias', regex: /transfer|transf|tef|spei|abono|deposito|dep[oó]sito|envio\s*de\s*dinero|pago\s*recibido/gi },
    { label: 'Tarjetas', regex: /tarjeta|credito|debito|compra nacional|compra internacional|avance|cuota/gi },
    { label: 'Suscripciones', regex: /spotify|netflix|youtube|apple|google|amazon prime|subscription|suscripci[oó]n|prime|icloud|office\s*365/gi },
    { label: 'Cajero', regex: /giro|cajero|atm|efectivo/gi },
    { label: 'Cuotas', regex: /cuota|cuotas|avance|credito de consumo/gi },
  ];
  const allText = parsedDocuments.map((doc) => doc.text ?? '').join('\n');
  const canonicalAmounts = canonicalMovements
    .map((movement) => Math.abs(Number(movement.amount) || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const structuredAmounts = parsedDocuments.flatMap((doc) => {
    const tables = Array.isArray((doc.structuredData as { tables?: unknown } | undefined)?.tables)
      ? ((doc.structuredData as { tables?: Array<{ rows?: unknown }> }).tables ?? [])
      : [];
    const values: number[] = [];
    for (const table of tables) {
      for (const row of Array.isArray(table?.rows) ? table.rows : []) {
        if (!Array.isArray(row)) continue;
        for (const cell of row) {
          const value = normalizeAmountToken(String(cell ?? ''));
          if (value !== null) values.push(value);
        }
      }
    }
    return values;
  });
  const heuristicAmounts = [
    ...structuredAmounts,
    ...Array.from(allText.matchAll(/(?:\$|clp|monto|total|cargo|abono)?\s*([\d.]{4,}|\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?)/gi))
      .map((match) => normalizeAmountToken(match[1] ?? ''))
      .filter((value): value is number => value !== null),
  ];
  const amounts = (canonicalAmounts.length > 0 ? canonicalAmounts : heuristicAmounts).slice(0, 400);
  const topKeywords = keywordMatchers
    .map((item) => ({ label: item.label, count: (allText.match(item.regex) ?? []).length }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  const structuredRows = parsedDocuments.reduce((acc, doc) => {
    const tables = Array.isArray((doc.structuredData as { tables?: unknown } | undefined)?.tables)
      ? ((doc.structuredData as { tables?: Array<{ rows?: unknown }> }).tables ?? [])
      : [];
    return acc + tables.reduce((tableAcc, table) => tableAcc + (Array.isArray(table?.rows) ? table.rows.length : 0), 0);
  }, 0);
  const textRows = parsedDocuments.reduce((acc, doc) => acc + (doc.text.match(/\n/g)?.length ?? 0), 0);
  const rows = canonicalMovements.length > 0 ? canonicalMovements.length : structuredRows > 0 ? structuredRows : textRows;
  const totalDetected = amounts.reduce((acc, value) => acc + value, 0);
  const averageDetected = amounts.length ? totalDetected / amounts.length : 0;
  const maxDetected = amounts.length ? Math.max(...amounts) : 0;
  const hasBankLanguage = /cartola|saldo|abono|cargo|movimiento|transfer|cuota|pago/gi.test(allText);
  const summary =
    parsedDocuments.length === 0
      ? 'Sin cartolas cargadas todavía.'
      : amounts.length === 0
      ? 'Hay documentos listos, pero aún no se detectan montos estructurados claros.'
      : `Detecté ${amounts.length} montos y ${topKeywords.length > 0 ? topKeywords.map((item) => item.label).join(', ') : 'actividad transaccional'} en ${parsedDocuments.length} documento(s).`;
  return { docs: parsedDocuments.length, rows, amounts, topKeywords, totalDetected, averageDetected, maxDetected, hasBankLanguage, summary };
}

export function inferInstitutionFromText(allText: string, bankHint: string): string {
  const source = `${bankHint}\n${allText}`.toLowerCase();
  const institutions = [
    { label: 'Banco de Chile', regex: /\bbanco\s*de\s*chile\b|chile\.cl|edwards/gi },
    { label: 'BancoEstado', regex: /\bbanco\s*estado\b|\bbancoestado\b/gi },
    { label: 'Santander', regex: /\bsantander\b/gi },
    { label: 'BCI', regex: /\bbci\b|credito e inversiones/gi },
    { label: 'Scotiabank', regex: /\bscotiabank\b|scotia/gi },
    { label: 'Itaú', regex: /\bita[uú]\b/gi },
    { label: 'Falabella', regex: /\bfalabella\b|cmr/gi },
    { label: 'Ripley', regex: /\bripley\b|banco ripley|rpay/gi },
  ];
  for (const institution of institutions) if (institution.regex.test(source)) return institution.label;
  return bankHint.trim() || 'Institución no identificada';
}

export function inferProductTypeFromText(allText: string): string {
  const source = allText.toLowerCase();
  const productPatterns = [
    { label: 'Cuenta Corriente', regex: /\bcuenta\s*corriente\b/gi },
    { label: 'Cuenta Vista', regex: /\bcuenta\s*vista\b|chequera electronica/gi },
    { label: 'Cuenta RUT', regex: /\bcuenta\s*rut\b/gi },
    { label: 'Tarjeta de Crédito', regex: /\btarjeta\s*de\s*cr[eé]dito\b|estado de cuenta/gi },
    { label: 'Línea de Crédito', regex: /\bl[ií]nea\s*de\s*cr[eé]dito\b|avance en efectivo/gi },
    { label: 'Crédito de Consumo', regex: /\bcr[eé]dito\s*de\s*consumo\b|cuota mensual/gi },
  ];
  for (const product of productPatterns) if (product.regex.test(source)) return product.label;
  return 'Producto financiero';
}

export function buildProductCardDescriptor(product: BankProductLike) {
  const allText = product.parsedDocuments.map((doc) => doc.text ?? '').join('\n');
  const intel = buildTransactionIntelligence(product.parsedDocuments);
  const institution = inferInstitutionFromText(allText, product.bank);
  const productType =
    product.label && product.label.trim().length > 0
      ? product.label.split('·')[1]?.trim() || inferProductTypeFromText(allText)
      : inferProductTypeFromText(allText);
  const title = `${institution} · ${productType}`;
  const activityInsight =
    intel.amounts.length > 0
      ? `Movimientos detectados: ${intel.amounts.length} con promedio $${Math.round(intel.averageDetected).toLocaleString('es-CL')}.`
      : 'Sin movimientos monetarios estructurados detectados todavía.';
  const categoryInsight =
    intel.topKeywords.length > 0
      ? `Patrones: ${intel.topKeywords.map((k) => `${k.label} (${k.count})`).join(', ')}.`
      : 'Aún no hay categorías suficientes para patrón robusto.';
  const readinessInsight = product.parsedDocuments.length > 0
    ? 'Listo para dashboard e insights ejecutivos.'
    : 'Carga una cartola o imagen para activar análisis.';
  return {
    title,
    description:
      product.dashboard?.summary && product.dashboard.summary.trim().length > 0
        ? product.dashboard.summary
        : product.parsedDocuments.length > 0
        ? `${product.parsedDocuments.length} documento(s) analizado(s). ${activityInsight}`
        : 'Pendiente de cartola para identificar institución, producto y comportamiento mensual.',
    insights: [
      categoryInsight,
      readinessInsight,
      ...(product.dashboard?.alerts?.slice(0, 1) ?? []),
    ].filter(Boolean),
    themeColor: institutionColor(institution),
  };
}
