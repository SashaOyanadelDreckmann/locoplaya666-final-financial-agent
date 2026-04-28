import { getApiBaseUrl } from '@/lib/apiBase';
import type { ChatItem } from '@/lib/agent.response.types';

type ParsedDocument = { name: string; text: string };
type BankProductLike = { bank: string; parsedDocuments: ParsedDocument[] };

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
  const cleaned = raw
    .replace(/(?:^|\n)\s*SUGERENCIAS\s*:\s*\[[\s\S]*?\]\s*(?=\n|$)/gi, '\n')
    .replace(/<SUGERENCIAS>[\s\S]*?<\/SUGERENCIAS>/gi, '\n')
    .replace(/\bundefined\b/gi, '')
    .replace(/\bnull\b/gi, '')
    .replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1 $2')
    .replace(/([.,;:!?])([^\s])/g, '$1 $2')
    .replace(/([a-záéíóúñ])(\d)/gi, '$1 $2')
    .replace(/(\d)([a-záéíóúñ])/gi, '$1 $2')
    .replace(/\*\*/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return cleaned || fallback.trim();
}

export function sanitizeChatItems(items: ChatItem[]): ChatItem[] {
  return items
    .map((item) => {
      if (item.type !== 'message') return item;
      const content = sanitizeMessageText(item.content, item.role === 'assistant' ? '—' : '');
      if (!content && item.role !== 'assistant') return null;
      return { ...item, content };
    })
    .filter((item): item is ChatItem => Boolean(item));
}

export function resolveDocumentUrl(raw: string): string {
  if (!raw) return '#';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${getApiBaseUrl()}${raw}`;
  return `${getApiBaseUrl()}/${raw.replace(/^\/+/, '')}`;
}

export function firstNameOf(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return 'Usuario';
  return value.trim().split(/\s+/)[0] ?? 'Usuario';
}

function normalizeAmountToken(token: string): number | null {
  const cleaned = token.replace(/[^\d.,]/g, '').trim();
  if (!cleaned) return null;
  const normalized = cleaned.includes(',') ? cleaned.replace(/\./g, '').replace(',', '.') : cleaned.replace(/[.\s]/g, '');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function buildTransactionIntelligence(parsedDocuments: ParsedDocument[]) {
  const keywordMatchers = [
    { label: 'Supermercado', regex: /jumbo|lider|unimarc|tottus|supermercad/gi },
    { label: 'Transporte', regex: /uber|cabify|metro|copec|shell|bencina|combustible/gi },
    { label: 'Transferencias', regex: /transfer|transf|tef|spei|abono|deposito/gi },
    { label: 'Tarjetas', regex: /tarjeta|credito|debito|compra nacional|compra internacional/gi },
    { label: 'Cajero', regex: /giro|cajero|atm|efectivo/gi },
    { label: 'Servicios', regex: /agua|luz|internet|movistar|entel|vtr|wom|enel/gi },
    { label: 'Suscripciones', regex: /spotify|netflix|youtube|apple|google|amazon prime|subscription/gi },
    { label: 'Cuotas', regex: /cuota|cuotas|avance|credito de consumo/gi },
  ];
  const allText = parsedDocuments.map((doc) => doc.text ?? '').join('\n');
  const amounts = Array.from(allText.matchAll(/(?:\$|clp|monto|total|cargo|abono)?\s*([\d.]{4,}|\d{1,3}(?:[.\s]\d{3})+(?:,\d{1,2})?)/gi))
    .map((match) => normalizeAmountToken(match[1] ?? ''))
    .filter((value): value is number => value !== null)
    .slice(0, 400);
  const topKeywords = keywordMatchers
    .map((item) => ({ label: item.label, count: (allText.match(item.regex) ?? []).length }))
    .filter((item) => item.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  const rows = parsedDocuments.reduce((acc, doc) => acc + (doc.text.match(/\n/g)?.length ?? 0), 0);
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
  const productType = inferProductTypeFromText(allText);
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
      product.parsedDocuments.length > 0
        ? `${product.parsedDocuments.length} documento(s) analizado(s). ${activityInsight}`
        : 'Pendiente de cartola para identificar institución, producto y comportamiento mensual.',
    insights: [categoryInsight, readinessInsight],
  };
}
