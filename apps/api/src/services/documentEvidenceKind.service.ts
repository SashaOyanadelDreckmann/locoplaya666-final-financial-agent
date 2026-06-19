/**
 * Detecta el tipo de antecedente (cartola bancaria vs seguro vs inversión, etc.)
 * para enrutar el pipeline correcto y evitar aplicar abono/egreso donde no corresponde.
 */

import { completeStructuredWithSchema } from './llm.service';
import { isVisionImageFilename } from './movementDirectionVision.service';

export type EvidenceDocumentKind =
  | 'banking_movements'
  | 'insurance'
  | 'investment'
  | 'loan_contract'
  | 'other_qualitative';

export type EvidenceKindResult = {
  evidence_kind: EvidenceDocumentKind;
  confidence: number;
  uses_movement_pipeline: boolean;
  institution_hint?: string;
  product_label?: string;
  summary_blocks: Array<{ title: string; body: string }>;
  highlights: string[];
  visual_evidence: string;
};

const EVIDENCE_KIND_MODEL =
  process.env.TRANSACTIONS_EVIDENCE_KIND_MODEL?.trim() ||
  process.env.TRANSACTIONS_VISION_MODEL?.trim() ||
  'gpt-4.1-mini';

const EVIDENCE_KIND_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    evidence_kind: {
      type: 'string',
      enum: ['banking_movements', 'insurance', 'investment', 'loan_contract', 'other_qualitative'],
    },
    confidence: { type: 'number' },
    uses_movement_ledger: { type: 'boolean' },
    institution_hint: { type: 'string' },
    product_label: { type: 'string' },
    summary_blocks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          body: { type: 'string' },
        },
        required: ['title', 'body'],
      },
    },
    highlights: { type: 'array', items: { type: 'string' } },
    visual_evidence: { type: 'string' },
  },
  required: [
    'evidence_kind',
    'confidence',
    'uses_movement_ledger',
    'institution_hint',
    'product_label',
    'summary_blocks',
    'highlights',
    'visual_evidence',
  ],
} as const;

const BANKING_SIGNAL =
  /\b(cartola|movimientos?\s+de\s+tarjeta|cuenta\s+corriente|cuenta\s+vista|cargo|abono|d[eé]bito|cr[eé]dito|haber|debe|saldo\s+disponible|pago\s+pesos|facturados|no\s+facturados|transferencia\s+(?:recibida|enviada)|webpay|compras)\b/;

const INSURANCE_SIGNAL =
  /\b(p[oó]liza|prima(?:\s+(?:mensual|anual))?|cobertura|deducible|beneficiario|asegurad|siniestro|vigencia|seguro\s+(?:de\s+)?(?:vida|auto|salud|hogar)|compa[nñ][ií]a\s+de\s+seguros|metlife|sura|consorcio|mapfre|hdi|liberty)\b/;

const INVESTMENT_SIGNAL =
  /\b(valor\s+cuota|patrimonio|fondo\s+mutuo|cuota\s+apv|apv|cuenta\s+2|broker|acciones|etf|dividendo|rentabilidad|cartera|instrumento|ffmm|corredora|larrain|santander\s+asset|bice\s+inversiones|fintual|renta4|rescate|aporte)\b/;

const LOAN_CONTRACT_SIGNAL =
  /\b(contrato\s+de\s+cr[eé]dito|saldo\s+insoluto|tabla\s+de\s+desarrollo|dividendo\s+hipotec|cuota\s+del\s+cr[eé]dito|tasa\s+de\s+inter[eé]s\s+anual|plazo\s+restante|memor[aá]ndum\s+de\s+hipoteca)\b/;

function normalizeEvidenceText(value: string): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export function usesBankingMovementPipeline(kind: EvidenceDocumentKind): boolean {
  return kind === 'banking_movements';
}

export function shouldSuppressMovementLedger(kind: EvidenceDocumentKind, confidence: number): boolean {
  return (
    (kind === 'insurance' || kind === 'loan_contract' || kind === 'other_qualitative') &&
    confidence >= 0.68
  );
}

function scorePattern(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

function productLabelSuggestsKind(productLabelHint?: string): EvidenceDocumentKind | null {
  const label = normalizeEvidenceText(productLabelHint ?? '');
  if (!label) return null;
  if (/\bseguro/.test(label)) return 'insurance';
  if (/\b(accion|etf|fondo|apv|cuenta 2|inversi|broker|ffmm)/.test(label)) return 'investment';
  if (/\b(hipotec|credito|consumo|automotriz)/.test(label)) return 'loan_contract';
  if (/\b(cuenta|tarjeta|cartola|vista|rut|corriente|ahorro|deposito)/.test(label)) return 'banking_movements';
  return null;
}

export function inferEvidenceKindFromSignals(input: {
  text?: string;
  productTypeHint?: string;
  productLabelHint?: string;
  documentProfile?: {
    format_family?: string;
    product_type?: string;
    bank?: string;
  };
}): EvidenceKindResult | null {
  const text = normalizeEvidenceText(input.text ?? '');
  const formatFamily = normalizeEvidenceText(input.documentProfile?.format_family ?? '');
  const labelKind = productLabelSuggestsKind(input.productLabelHint);

  const bankingScore =
    scorePattern(text, BANKING_SIGNAL) +
    (formatFamily.includes('cartola') || formatFamily.includes('estado_cuenta') || formatFamily.includes('visa_signature')
      ? 3
      : 0);
  const insuranceScore = scorePattern(text, INSURANCE_SIGNAL) + (labelKind === 'insurance' ? 4 : 0);
  const investmentScore =
    scorePattern(text, INVESTMENT_SIGNAL) +
    (labelKind === 'investment' ? 3 : 0) +
    (input.productTypeHint === 'investment_account' && !bankingScore ? 1 : 0);
  const loanScore = scorePattern(text, LOAN_CONTRACT_SIGNAL) + (labelKind === 'loan_contract' ? 4 : 0);

  const ranked = [
    { kind: 'banking_movements' as const, score: bankingScore },
    { kind: 'insurance' as const, score: insuranceScore },
    { kind: 'investment' as const, score: investmentScore },
    { kind: 'loan_contract' as const, score: loanScore },
  ].sort((left, right) => right.score - left.score);

  const winner = ranked[0];
  const runnerUp = ranked[1];
  if (!winner || winner.score <= 0) return null;

  const margin = winner.score - (runnerUp?.score ?? 0);
  if (margin < 1 && winner.score < 3) return null;

  const confidence = Math.min(0.96, 0.58 + winner.score * 0.08 + margin * 0.05);
  if (confidence < 0.72) return null;

  return buildEvidenceKindResult(winner.kind, confidence, {
    institution_hint: input.documentProfile?.bank ?? '',
    product_label: input.productLabelHint ?? '',
    visual_evidence: `heuristic:${winner.kind}`,
    summary_blocks: [],
    highlights: [],
  });
}

function buildEvidenceKindResult(
  kind: EvidenceDocumentKind,
  confidence: number,
  extra: Partial<EvidenceKindResult> = {},
): EvidenceKindResult {
  return {
    evidence_kind: kind,
    confidence,
    uses_movement_pipeline:
      extra.uses_movement_pipeline ?? usesBankingMovementPipeline(kind),
    institution_hint: extra.institution_hint ?? '',
    product_label: extra.product_label ?? '',
    summary_blocks: extra.summary_blocks ?? [],
    highlights: extra.highlights ?? [],
    visual_evidence: extra.visual_evidence ?? '',
  };
}

const EVIDENCE_KIND_VISION_INSTRUCTIONS =
  'Clasifica el tipo de antecedente financiero en una captura o documento visual chileno.\n' +
  'Tipos:\n' +
  '- banking_movements: cartola, movimientos de tarjeta/cuenta, listados cargo/abono, apps bancarias con +/-.\n' +
  '- insurance: póliza, prima, coberturas, deducible, beneficiarios, compañía de seguros.\n' +
  '- investment: fondos, APV, acciones, ETF, valor cuota, patrimonio, broker, dividendos, cartera.\n' +
  '- loan_contract: contrato o estado de crédito/hipoteca con cuota, saldo insoluto, tabla de desarrollo.\n' +
  '- other_qualitative: antecedente financiero útil pero sin ledger de movimientos bancarios.\n' +
  'uses_movement_ledger=true SOLO para banking_movements.\n' +
  'Genera summary_blocks útiles (2-4 bloques) y highlights cortos para seguros/inversiones/contratos.\n' +
  'Ante duda entre banking_movements y otro tipo, elige banking_movements solo si ves claramente un listado de movimientos bancarios.';

export async function classifyEvidenceKindWithVision(input: {
  filename: string;
  buffer: Buffer;
  mimeType?: string;
  ocrText?: string;
  productTypeHint?: string;
  productLabelHint?: string;
  institutionHint?: string;
}): Promise<EvidenceKindResult | null> {
  if (!isVisionImageFilename(input.filename)) return null;
  const mime =
    String(input.mimeType ?? '').trim().toLowerCase().startsWith('image/')
      ? input.mimeType!
      : input.filename.toLowerCase().endsWith('.png')
        ? 'image/png'
        : input.filename.toLowerCase().endsWith('.webp')
          ? 'image/webp'
          : 'image/jpeg';

  try {
    const result = await completeStructuredWithSchema<{
      evidence_kind: EvidenceDocumentKind;
      confidence: number;
      uses_movement_ledger: boolean;
      institution_hint: string;
      product_label: string;
      summary_blocks: Array<{ title: string; body: string }>;
      highlights: string[];
      visual_evidence: string;
    }>({
      name: 'transaction_evidence_kind',
      description: 'Clasifica el tipo de antecedente financiero en una imagen.',
      model: EVIDENCE_KIND_MODEL,
      temperature: 0,
      maxOutputTokens: 1800,
      instructions: EVIDENCE_KIND_VISION_INSTRUCTIONS,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: JSON.stringify({
                filename: input.filename,
                product_type_hint: input.productTypeHint ?? null,
                product_label_hint: input.productLabelHint ?? null,
                institution_hint: input.institutionHint ?? null,
                ocr_excerpt: String(input.ocrText ?? '').slice(0, 2400),
              }),
            },
            {
              type: 'input_image',
              image_url: `data:${mime};base64,${input.buffer.toString('base64')}`,
              detail: 'high',
            },
          ],
        },
      ],
      schema: EVIDENCE_KIND_SCHEMA,
    });

    const kind = result.evidence_kind ?? 'other_qualitative';
    const confidence = Number.isFinite(result.confidence) ? Math.max(0, Math.min(1, result.confidence)) : 0.7;
    return buildEvidenceKindResult(kind, confidence, {
      uses_movement_pipeline: result.uses_movement_ledger === true && kind === 'banking_movements',
      institution_hint: result.institution_hint || input.institutionHint || '',
      product_label: result.product_label || input.productLabelHint || '',
      summary_blocks: Array.isArray(result.summary_blocks) ? result.summary_blocks.slice(0, 6) : [],
      highlights: Array.isArray(result.highlights) ? result.highlights.slice(0, 8) : [],
      visual_evidence: result.visual_evidence ?? '',
    });
  } catch {
    return null;
  }
}

export async function resolveDocumentEvidenceKind(input: {
  filename: string;
  text?: string;
  buffer?: Buffer;
  mimeType?: string;
  isVisionPhoto?: boolean;
  productTypeHint?: string;
  productLabelHint?: string;
  institutionHint?: string;
  documentProfile?: {
    format_family?: string;
    product_type?: string;
    bank?: string;
  };
}): Promise<EvidenceKindResult> {
  const heuristic = inferEvidenceKindFromSignals({
    text: input.text,
    productTypeHint: input.productTypeHint,
    productLabelHint: input.productLabelHint,
    documentProfile: input.documentProfile,
  });

  if (input.isVisionPhoto && input.buffer) {
    const vision =
      heuristic && heuristic.confidence >= 0.9 && heuristic.evidence_kind === 'banking_movements'
        ? null
        : await classifyEvidenceKindWithVision({
            filename: input.filename,
            buffer: input.buffer,
            mimeType: input.mimeType,
            ocrText: input.text,
            productTypeHint: input.productTypeHint,
            productLabelHint: input.productLabelHint,
            institutionHint: input.institutionHint,
          });

    if (vision && vision.confidence >= 0.68) {
      if (!heuristic || vision.confidence >= heuristic.confidence) return vision;
    }
  }

  if (heuristic) return heuristic;

  const labelKind = productLabelSuggestsKind(input.productLabelHint);
  if (labelKind && labelKind !== 'banking_movements') {
    return buildEvidenceKindResult(labelKind, 0.74, {
      institution_hint: input.institutionHint ?? input.documentProfile?.bank ?? '',
      product_label: input.productLabelHint ?? '',
      visual_evidence: 'product_label_hint',
      summary_blocks: [],
      highlights: [],
    });
  }

  return buildEvidenceKindResult('banking_movements', 0.55, {
    institution_hint: input.institutionHint ?? input.documentProfile?.bank ?? '',
    product_label: input.productLabelHint ?? '',
    visual_evidence: 'default_banking_fallback',
    summary_blocks: [],
    highlights: [],
  });
}

export function buildQualitativeExecutiveSummary(
  results: EvidenceKindResult[],
  fallbackProductLabel?: string,
): string {
  const primary =
    results.find((result) => result.summary_blocks.length > 0 || result.highlights.length > 0) ??
    results[0];
  if (!primary) {
    return 'Antecedente cualitativo\nNo se pudo caracterizar el documento con claridad.';
  }

  const kindLabel: Record<EvidenceDocumentKind, string> = {
    banking_movements: 'movimientos bancarios',
    insurance: 'seguro',
    investment: 'inversión',
    loan_contract: 'crédito o hipoteca',
    other_qualitative: 'antecedente financiero',
  };

  const blocks: string[] = [
    [
      'Lectura del antecedente',
      `Tipo detectado: ${kindLabel[primary.evidence_kind] ?? 'financiero'}${primary.product_label ? ` · ${primary.product_label}` : fallbackProductLabel ? ` · ${fallbackProductLabel}` : ''}.`,
    ].join('\n'),
  ];

  for (const section of primary.summary_blocks.slice(0, 4)) {
    if (section.title && section.body) {
      blocks.push([section.title, section.body].join('\n'));
    }
  }

  if (primary.highlights.length > 0) {
    blocks.push(
      ['Datos visibles', ...primary.highlights.slice(0, 6).map((item) => `• ${item}`)].join('\n'),
    );
  }

  blocks.push(
    'Nota\nEste antecedente no es una cartola bancaria. Los totales de ingresos/egresos no aplican; usa este resumen como contexto cualitativo.',
  );
  return blocks.join('\n\n');
}

export function resolveAggregateEvidenceKind(
  results: Map<string, EvidenceKindResult>,
): EvidenceDocumentKind {
  if (results.size === 0) return 'banking_movements';
  const kinds = Array.from(results.values()).map((result) => result.evidence_kind);
  if (kinds.some((kind) => kind === 'banking_movements')) return 'banking_movements';
  const counts = new Map<EvidenceDocumentKind, number>();
  for (const kind of kinds) {
    counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((left, right) => right[1] - left[1])[0]?.[0] ?? 'other_qualitative';
}
