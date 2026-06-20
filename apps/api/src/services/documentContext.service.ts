/**
 * Contexto no estándar de documentos TC/cartola: facturado, nacional/internacional, vencimiento, etc.
 */

export type BillingView = 'facturado' | 'no_facturado' | 'unknown';
export type CardScope = 'nacional' | 'internacional' | 'unknown';

export type TransactionDocumentContext = {
  billing_view: BillingView;
  card_scope: CardScope;
  payment_due_date?: string;
  billing_cycle_date?: string;
  minimum_payment?: number;
  available_credit?: number;
  notices: string[];
  confidence: number;
  source: 'vision' | 'heuristic' | 'profile' | 'merged';
};

const EMPTY_CONTEXT: TransactionDocumentContext = {
  billing_view: 'unknown',
  card_scope: 'unknown',
  notices: [],
  confidence: 0,
  source: 'heuristic',
};

function normalizeText(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function parseSpanishDateToken(token: string): string | undefined {
  const trimmed = String(token ?? '').trim();
  const iso = trimmed.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const slash = trimmed.match(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/);
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    return `${year}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`;
  }
  const words = trimmed.match(/\b(\d{1,2})\s+de\s+([a-z]+)\s+(?:del?\s+)?(\d{4})\b/i);
  if (!words) return undefined;
  const monthMap: Record<string, string> = {
    enero: '01',
    febrero: '02',
    marzo: '03',
    abril: '04',
    mayo: '05',
    junio: '06',
    julio: '07',
    agosto: '08',
    septiembre: '09',
    setiembre: '09',
    octubre: '10',
    noviembre: '11',
    diciembre: '12',
  };
  const month = monthMap[normalizeText(words[2])];
  if (!month) return undefined;
  return `${words[3]}-${month}-${words[1].padStart(2, '0')}`;
}

function parseAmountClp(token: string): number | undefined {
  const match = String(token ?? '').match(/\$?\s*([\d.]+)/);
  if (!match) return undefined;
  const parsed = Number(match[1].replace(/\./g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

export function inferDocumentContextFromText(
  text: string,
  filename = '',
): TransactionDocumentContext | null {
  const normalized = normalizeText(`${filename}\n${text}`);
  if (!normalized.trim()) return null;

  let billing_view: BillingView = 'unknown';
  if (/\bno\s+facturad/.test(normalized) || /saldo_y_mov_no_facturado|no_facturado/.test(normalized)) {
    billing_view = 'no_facturado';
  } else if (/\bfacturad/.test(normalized) || /mov_facturado/.test(normalized)) {
    billing_view = 'facturado';
  }

  let card_scope: CardScope = 'unknown';
  if (/\binternacional\b/.test(normalized) && !/\bnacional\b/.test(normalized)) {
    card_scope = 'internacional';
  } else if (/\bnacional\b/.test(normalized)) {
    card_scope = 'nacional';
  }

  const notices: string[] = [];
  const dueMatch = normalized.match(
    /(?:recuerda\s+pagar|pagar\s+hasta|vencimiento|fecha\s+de\s+pago)[^\n.]{0,80}?(\d{1,2}\s+de\s+[a-z]+\s+(?:del?\s+)?\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
  );
  const billingMatch =
    normalized.match(
      /(?:seran\s+facturados|sera\s+facturado|facturados?\s+el)[^\n.]{0,80}?(\d{1,2}\s+de\s+[a-z]+\s+(?:del?\s+)?\d{4}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i,
    ) ??
    normalized.match(
      /(\d{1,2}\s+de\s+[a-z]+\s+(?:del?\s+)?\d{4})[^\n.]{0,50}seran\s+facturados/i,
    );
  const payment_due_date = dueMatch ? parseSpanishDateToken(dueMatch[1]) : undefined;
  const billing_cycle_date = billingMatch
    ? parseSpanishDateToken(billingMatch[1] ?? billingMatch[0])
    : undefined;

  const minPaymentMatch = normalized.match(/pago\s+minimo[^\d$]{0,20}(\$?\s*[\d.]+)/i);
  const cupoMatch = normalized.match(/cupo\s+(?:disponible|total)[^\d$]{0,20}(\$?\s*[\d.]+)/i);

  if (payment_due_date) notices.push(`Vencimiento de pago: ${dueMatch?.[1] ?? payment_due_date}`);
  if (billing_cycle_date) notices.push(`Facturación prevista: ${billingMatch?.[1] ?? billing_cycle_date}`);

  let score = 0;
  if (billing_view !== 'unknown') score += 2;
  if (card_scope !== 'unknown') score += 1;
  if (payment_due_date || billing_cycle_date) score += 1;
  if (score === 0) return null;

  return {
    billing_view,
    card_scope,
    payment_due_date,
    billing_cycle_date,
    minimum_payment: minPaymentMatch ? parseAmountClp(minPaymentMatch[1]) : undefined,
    available_credit: cupoMatch ? parseAmountClp(cupoMatch[1]) : undefined,
    notices,
    confidence: Math.min(0.94, 0.55 + score * 0.12),
    source: 'heuristic',
  };
}

export function normalizeVisionDocumentContext(
  raw: Partial<TransactionDocumentContext> | null | undefined,
): TransactionDocumentContext | null {
  if (!raw || typeof raw !== 'object') return null;
  const billing =
    raw.billing_view === 'facturado' || raw.billing_view === 'no_facturado'
      ? raw.billing_view
      : 'unknown';
  const scope =
    raw.card_scope === 'nacional' || raw.card_scope === 'internacional' ? raw.card_scope : 'unknown';
  const notices = Array.isArray(raw.notices)
    ? raw.notices.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, 6)
    : [];
  const confidence = Number.isFinite(raw.confidence)
    ? Math.max(0, Math.min(1, Number(raw.confidence)))
    : billing !== 'unknown' || scope !== 'unknown'
      ? 0.78
      : 0.5;
  if (billing === 'unknown' && scope === 'unknown' && notices.length === 0) return null;
  return {
    billing_view: billing,
    card_scope: scope,
    payment_due_date: raw.payment_due_date ? parseSpanishDateToken(raw.payment_due_date) ?? raw.payment_due_date : undefined,
    billing_cycle_date: raw.billing_cycle_date
      ? parseSpanishDateToken(raw.billing_cycle_date) ?? raw.billing_cycle_date
      : undefined,
    minimum_payment:
      typeof raw.minimum_payment === 'number' && raw.minimum_payment > 0
        ? Math.round(raw.minimum_payment)
        : undefined,
    available_credit:
      typeof raw.available_credit === 'number' && raw.available_credit > 0
        ? Math.round(raw.available_credit)
        : undefined,
    notices,
    confidence,
    source: 'vision',
  };
}

export function mergeDocumentContext(
  primary: TransactionDocumentContext | null | undefined,
  secondary: TransactionDocumentContext | null | undefined,
): TransactionDocumentContext {
  if (!primary && !secondary) return { ...EMPTY_CONTEXT };
  if (!primary) return { ...(secondary as TransactionDocumentContext), source: 'merged' };
  if (!secondary) return primary;
  const winner = primary.confidence >= secondary.confidence ? primary : secondary;
  const loser = winner === primary ? secondary : primary;
  return {
    billing_view:
      winner.billing_view !== 'unknown'
        ? winner.billing_view
        : loser.billing_view !== 'unknown'
          ? loser.billing_view
          : 'unknown',
    card_scope:
      winner.card_scope !== 'unknown' ? winner.card_scope : loser.card_scope !== 'unknown' ? loser.card_scope : 'unknown',
    payment_due_date: winner.payment_due_date ?? loser.payment_due_date,
    billing_cycle_date: winner.billing_cycle_date ?? loser.billing_cycle_date,
    minimum_payment: winner.minimum_payment ?? loser.minimum_payment,
    available_credit: winner.available_credit ?? loser.available_credit,
    notices: [...new Set([...winner.notices, ...loser.notices])].slice(0, 8),
    confidence: Math.max(primary.confidence, secondary.confidence),
    source: 'merged',
  };
}

export function resolveDocumentContext(input: {
  text?: string;
  filename?: string;
  visionContext?: Partial<TransactionDocumentContext> | null;
  formatFamily?: string;
}): TransactionDocumentContext | null {
  const fromVision = normalizeVisionDocumentContext(input.visionContext ?? null);
  const fromText = inferDocumentContextFromText(input.text ?? '', input.filename ?? '');
  let merged = fromVision && fromText ? mergeDocumentContext(fromVision, fromText) : fromVision ?? fromText;

  const family = normalizeText(input.formatFamily ?? '');
  if (family.includes('no_facturado')) {
    merged = mergeDocumentContext(merged, {
      ...EMPTY_CONTEXT,
      billing_view: 'no_facturado',
      confidence: 0.9,
      source: 'profile',
    });
  } else if (family.includes('facturado')) {
    merged = mergeDocumentContext(merged, {
      ...EMPTY_CONTEXT,
      billing_view: 'facturado',
      confidence: 0.9,
      source: 'profile',
    });
  }

  return merged && (merged.billing_view !== 'unknown' || merged.card_scope !== 'unknown' || merged.notices.length > 0)
    ? merged
    : null;
}

export function applyBillingContextToMovements<T extends { description: string; amount: number }>(
  movements: T[],
  context: TransactionDocumentContext | null | undefined,
): Array<T & { billing_status?: BillingView; card_scope?: CardScope }> {
  if (!context || context.billing_view === 'unknown') return movements;
  if (context.confidence < 0.6) return movements;
  return movements.map((movement) => ({
    ...movement,
    billing_status: context.billing_view,
    card_scope: context.card_scope !== 'unknown' ? context.card_scope : undefined,
  }));
}

export function buildDocumentContextAlert(context: TransactionDocumentContext | null | undefined): string | null {
  if (!context) return null;
  const parts: string[] = [];
  if (context.billing_view === 'no_facturado') parts.push('Movimientos de la vista no facturada (aún no cierran en el estado de cuenta).');
  if (context.billing_view === 'facturado') parts.push('Movimientos ya facturados en el periodo de la tarjeta.');
  if (context.card_scope === 'nacional') parts.push('Alcance nacional.');
  if (context.card_scope === 'internacional') parts.push('Alcance internacional.');
  if (context.payment_due_date) parts.push(`Vencimiento de pago detectado: ${context.payment_due_date}.`);
  if (context.billing_cycle_date) parts.push(`Facturación prevista: ${context.billing_cycle_date}.`);
  return parts.length > 0 ? parts.join(' ') : null;
}
