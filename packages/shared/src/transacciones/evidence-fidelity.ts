export type EvidenceFidelity = 'authoritative' | 'indicative';

export type EvidenceSourceHint = 'photos' | 'pdf' | 'spreadsheet' | 'text';

export const INDICATIVE_EVIDENCE_DISCLAIMER =
  'Lectura orientativa desde capturas o texto libre. Los montos y totales son aproximados; para cifras exactas sube Excel, CSV o cartola PDF estructurada.';

export const PRODUCT_TYPE_LABELS: Record<string, string> = {
  credit_card: 'tarjeta de crédito',
  debit_account: 'cuenta vista o débito',
  checking_account: 'cuenta corriente',
  savings_account: 'cuenta de ahorro',
  consumer_loan: 'crédito de consumo',
  mortgage: 'hipoteca',
  investment_account: 'inversión',
};

export function productTypeLabel(productType?: string | null): string {
  const key = String(productType ?? '').trim();
  return PRODUCT_TYPE_LABELS[key] ?? 'producto financiero';
}

export function isImageEvidenceFileName(name: string): boolean {
  return /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(String(name ?? '').trim());
}

export function isStructuredTableParserMode(mode: string | null | undefined): boolean {
  const normalized = String(mode ?? '').toLowerCase();
  return (
    normalized === 'csv_exact' ||
    normalized === 'exact_sheet' ||
    normalized === 'xlsx_exact' ||
    normalized.includes('exact')
  );
}

export function isVisionParserMode(mode: string | null | undefined): boolean {
  const normalized = String(mode ?? '').toLowerCase();
  return normalized.includes('vision') || normalized === 'pdf_vision';
}

export type ResolveEvidenceFidelityInput = {
  sourceHint?: EvidenceSourceHint | null;
  fileNames?: string[];
  parserModes?: Array<string | null | undefined>;
  parserConfidences?: number[];
  tableMovementRatio?: number;
  movementCount?: number;
  looseTextEvidence?: boolean;
};

export function resolveEvidenceFidelity(input: ResolveEvidenceFidelityInput): EvidenceFidelity {
  if (input.sourceHint === 'photos' || input.sourceHint === 'text' || input.looseTextEvidence) {
    return 'indicative';
  }

  const fileNames = input.fileNames ?? [];
  if (fileNames.some((name) => isImageEvidenceFileName(name))) {
    return 'indicative';
  }

  const modes = (input.parserModes ?? []).map((mode) => String(mode ?? '').toLowerCase()).filter(Boolean);
  const confidences = (input.parserConfidences ?? []).filter((value) => Number.isFinite(value) && value > 0);
  const avgConfidence =
    confidences.length > 0 ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : 0;

  if (input.sourceHint === 'spreadsheet') {
    if (modes.some((mode) => isStructuredTableParserMode(mode)) && avgConfidence >= 0.82) {
      return 'authoritative';
    }
    if (modes.length === 0) return 'authoritative';
  }

  const tableRatio = Number(input.tableMovementRatio ?? 1);
  const movementCount = Math.max(0, Number(input.movementCount ?? 0) || 0);
  if (movementCount > 0 && tableRatio < 0.42) {
    return 'indicative';
  }

  if (modes.length > 0 && modes.every((mode) => isVisionParserMode(mode))) {
    return avgConfidence >= 0.88 && tableRatio >= 0.65 ? 'authoritative' : 'indicative';
  }

  if (modes.some((mode) => isVisionParserMode(mode)) && avgConfidence < 0.78) {
    return 'indicative';
  }

  if (modes.some((mode) => isStructuredTableParserMode(mode)) && avgConfidence >= 0.9 && tableRatio >= 0.55) {
    return 'authoritative';
  }

  return 'authoritative';
}

export function buildIndicativeExecutiveSummary(params: {
  productType?: string | null;
  movementCount: number;
  topExpenses: Array<{ label: string; amount: number; date?: string }>;
  topCategories: Array<{ name: string; amount: number }>;
  topMerchants: Array<{ merchant: string; amount: number }>;
  spendClusters?: Array<{ name: string; share_pct?: number; examples?: string[] }>;
  period?: { from?: string; to?: string };
  alerts?: string[];
  formatAmount: (value: number) => string;
}): string {
  if (params.movementCount === 0) {
    return `Sin lectura clara\nNo alcanzamos a leer movimientos en este antecedente. Prueba capturas más nítidas o un archivo estructurado.\n\n${INDICATIVE_EVIDENCE_DISCLAIMER}`;
  }

  const productLabel = productTypeLabel(params.productType);
  const periodLabel =
    params.period?.from && params.period?.to
      ? `${params.period.from} a ${params.period.to}`
      : null;

  const blocks: string[] = [
    [
      'Lectura orientativa',
      [
        `Patrón visible en tu ${productLabel}${periodLabel ? ` (${periodLabel})` : ''}.`,
        `Identificamos ${params.movementCount} movimiento${params.movementCount === 1 ? '' : 's'} en el antecedente.`,
      ].join(' '),
    ].join('\n'),
  ];

  if (params.topExpenses.length > 0) {
    blocks.push(
      [
        'Cargos más visibles',
        ...params.topExpenses.slice(0, 5).map((item) => {
          const dateSuffix = item.date ? ` (${item.date})` : '';
          return `• ${item.label}${dateSuffix} — ~${params.formatAmount(item.amount)}`;
        }),
      ].join('\n'),
    );
  }

  if (params.topCategories.length > 0) {
    blocks.push(
      [
        'Concentración de gasto',
        ...params.topCategories
          .slice(0, 4)
          .map((category) => `• ${category.name} — ~${params.formatAmount(category.amount)}`),
      ].join('\n'),
    );
  } else if (params.spendClusters && params.spendClusters.length > 0) {
    const cluster = params.spendClusters[0];
    const example = cluster.examples?.[0];
    blocks.push(
      [
        'Patrón dominante',
        `• ${cluster.name}${cluster.share_pct ? ` — ~${cluster.share_pct.toFixed(0)}% del gasto leído` : ''}${example ? ` · ejemplo: ${example}` : ''}`,
      ].join('\n'),
    );
  }

  if (params.topMerchants.length > 0) {
    blocks.push(
      [
        'Comercios recurrentes',
        ...params.topMerchants
          .slice(0, 3)
          .map((merchant) => `• ${merchant.merchant} — ~${params.formatAmount(merchant.amount)}`),
      ].join('\n'),
    );
  }

  const softAlerts = (params.alerts ?? []).filter((alert) => !/flujo neto|ingresos|egresos/i.test(alert));
  if (softAlerts.length > 0) {
    blocks.push(
      [
        'Señales a revisar',
        ...softAlerts.slice(0, 2).map((alert) => `• ${alert}`),
      ].join('\n'),
    );
  }

  blocks.push(`Nota de fidelidad\n${INDICATIVE_EVIDENCE_DISCLAIMER}`);
  return blocks.join('\n\n');
}

export function buildIndicativeInstantSummary(params: {
  productType?: string | null;
  movementCount: number;
  topCategories: Array<{ name: string; amount: number }>;
  topMerchants: Array<{ merchant: string; amount: number }>;
  topExpenses: Array<{ label: string; amount: number }>;
  period?: { from?: string; to?: string };
  formatAmount: (value: number) => string;
}): string | null {
  if (params.movementCount <= 0) return null;
  return buildIndicativeExecutiveSummary({
    productType: params.productType,
    movementCount: params.movementCount,
    topExpenses: params.topExpenses,
    topCategories: params.topCategories,
    topMerchants: params.topMerchants,
    period: params.period,
    formatAmount: params.formatAmount,
  });
}
