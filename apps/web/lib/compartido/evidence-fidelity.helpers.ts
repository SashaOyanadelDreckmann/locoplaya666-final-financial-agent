import {
  buildIndicativeInstantSummary,
  isImageEvidenceFileName,
  resolveEvidenceFidelity,
  type EvidenceFidelity,
  type EvidenceSourceHint,
} from '@financial-agent/shared';
import type { BankProduct, TxUploadFormat } from '@/app/agent/modales/transacciones/types';
import { normalizeUploadFormat } from '@/app/agent/modales/transacciones/tx-assistant.helpers';
import { alignEvidenceUploadFormat } from '@/lib/compartido/evidence-format.helpers';

export type { EvidenceFidelity, EvidenceSourceHint };

export function inferEvidenceSourceFromFiles(files: File[]): EvidenceSourceHint | undefined {
  if (files.length === 0) return undefined;
  if (files.every((file) => file.type.startsWith('image/') || isImageEvidenceFileName(file.name))) {
    return 'photos';
  }
  if (files.some((file) => /\.(xls|xlsx|csv|tsv)$/i.test(file.name))) return 'spreadsheet';
  if (files.some((file) => file.type === 'application/pdf' || /\.pdf$/i.test(file.name))) return 'pdf';
  if (files.some((file) => /\.(txt|md|log)$/i.test(file.name))) return 'text';
  return undefined;
}

export function resolveUploadEvidenceSourceHint(params: {
  uploadFormat?: TxUploadFormat | null;
  files?: File[];
  looseTextEvidence?: boolean;
}): EvidenceSourceHint | undefined {
  const files = params.files ?? [];
  const normalizedFormat = normalizeUploadFormat(params.uploadFormat);

  if (params.looseTextEvidence && files.length === 0) return 'text';

  if (files.length > 0) {
    const aligned = alignEvidenceUploadFormat({
      uploadFormat: normalizedFormat,
      files,
      looseTextEvidence: params.looseTextEvidence,
    });
    if (aligned.ok) return aligned.sourceHint;
    return inferEvidenceSourceFromFiles(files);
  }

  if (normalizedFormat) return normalizedFormat;
  if (params.looseTextEvidence) return 'text';
  return undefined;
}

export function readProductEvidenceFidelity(
  product: Pick<BankProduct, 'dashboard' | 'parsedDocuments'> | null | undefined,
): EvidenceFidelity {
  const explicit = product?.dashboard?.evidenceFidelity;
  if (explicit === 'indicative' || explicit === 'authoritative') return explicit;

  const parserSignals = (product?.parsedDocuments ?? []).map((doc) => {
    const structured = (doc.structuredData ?? {}) as {
      parserMeta?: { mode?: string; confidence?: number };
    };
    return {
      mode: structured.parserMeta?.mode,
      confidence: structured.parserMeta?.confidence,
      name: doc.name,
    };
  });

  const movements = product?.dashboard?.movements ?? [];
  const tableMovementRatio =
    movements.length > 0
      ? movements.filter((movement) => movement.source_kind === 'table').length / movements.length
      : 1;

  return resolveEvidenceFidelity({
    fileNames: parserSignals.map((signal) => signal.name),
    parserModes: parserSignals.map((signal) => signal.mode),
    parserConfidences: parserSignals.map((signal) => Number(signal.confidence ?? 0) || 0),
    tableMovementRatio,
    movementCount: movements.length,
    looseTextEvidence: parserSignals.some((signal) => /\.(txt|md)$/i.test(signal.name)),
  });
}

export function isIndicativeEvidenceProduct(
  product: Pick<BankProduct, 'dashboard' | 'parsedDocuments'> | null | undefined,
): boolean {
  return readProductEvidenceFidelity(product) === 'indicative';
}

export function buildProductInstantSummary(
  dashboard: BankProduct['dashboard'] | null | undefined,
  productType?: BankProduct['productType'],
): string | null {
  if (!dashboard?.keyMetrics?.movement_count) return null;
  const formatAmount = (value: number) =>
    new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: dashboard.currency || 'CLP',
      maximumFractionDigits: 0,
    }).format(Number.isFinite(value) ? value : 0);

  if (dashboard.evidenceFidelity === 'indicative') {
    return (
      buildIndicativeInstantSummary({
        productType,
        movementCount: dashboard.keyMetrics.movement_count,
        topCategories: dashboard.topCategories ?? [],
        topMerchants: (dashboard.topMerchants ?? []).map((merchant) => ({
          merchant: merchant.merchant,
          amount: merchant.amount,
        })),
        topExpenses: dashboard.topExpenses ?? [],
        period: dashboard.period,
        formatAmount,
      }) ?? dashboard.summary ?? null
    );
  }

  const existing = typeof dashboard.summary === 'string' ? dashboard.summary.trim() : '';
  if (existing.length >= 40) return existing;
  return existing || null;
}
