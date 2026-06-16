import type { ContextCadence, ContextSourceKind, ContextUnit, FinancialContextFact } from './context-contracts';

export function stableFactId(parts: string[]): string {
  return parts.map((p) => String(p).trim()).filter(Boolean).join('::');
}

export function normalizeMonthlyAmount(value: unknown, cadence?: ContextCadence): number | null {
  const amount = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(amount)) return null;
  switch (cadence) {
    case 'annual':
      return Math.round(amount / 12);
    case 'weekly':
      return Math.round((amount * 52) / 12);
    case 'daily':
      return Math.round((amount * 365) / 12);
    default:
      return Math.round(amount);
  }
}

export function buildFinancialFact(params: {
  subject: string;
  predicate: string;
  value: unknown;
  sourceKind: ContextSourceKind;
  sourceId: string;
  sourceVersion: string;
  contentHash: string;
  unit?: ContextUnit;
  cadence?: ContextCadence;
  confidence?: number;
  userConfirmed?: boolean;
  derived?: boolean;
  observedAt?: string;
}): FinancialContextFact {
  const observedAt = params.observedAt ?? new Date().toISOString();
  return {
    factId: stableFactId([params.sourceKind, params.sourceId, params.subject, params.predicate]),
    subject: params.subject,
    predicate: params.predicate,
    value: params.value,
    unit: params.unit,
    cadence: params.cadence,
    sourceKind: params.sourceKind,
    sourceId: params.sourceId,
    sourceVersion: params.sourceVersion,
    observedAt,
    confidence: params.confidence ?? 0.8,
    userConfirmed: params.userConfirmed ?? false,
    derived: params.derived ?? false,
    contentHash: params.contentHash,
  };
}

export function dedupeFacts(facts: FinancialContextFact[]): FinancialContextFact[] {
  const byId = new Map<string, FinancialContextFact>();
  for (const fact of facts) {
    const existing = byId.get(fact.factId);
    if (!existing) {
      byId.set(fact.factId, fact);
      continue;
    }
    const existingTs = Date.parse(existing.observedAt);
    const nextTs = Date.parse(fact.observedAt);
    if (nextTs >= existingTs) byId.set(fact.factId, fact);
  }
  return Array.from(byId.values());
}
