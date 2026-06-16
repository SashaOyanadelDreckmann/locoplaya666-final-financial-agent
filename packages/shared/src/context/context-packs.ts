import type { BuildContextPackInput, ContextPackPurpose } from './context-contracts';
import type { ContextSectionName } from './context-versions';

const GREETING_PATTERN =
  /^\s*(hola|buenas|buenos dias|buenas tardes|buenas noches|gracias|ok|dale|listo|perfecto)\s*[.!?]*\s*$/i;

const REGULATION_PATTERN =
  /\b(cmf|fintec|fintech|ley\s*21\.?521|normativa|regulator|sfa|finanzas abiertas|comision para el mercado financiero)\b/i;

export function isTrivialGreeting(userMessage?: string): boolean {
  const msg = String(userMessage ?? '').trim();
  if (!msg) return true;
  return GREETING_PATTERN.test(msg);
}

export function isRegulationPurpose(purpose: ContextPackPurpose, userMessage?: string): boolean {
  if (purpose === 'regulation') return true;
  return REGULATION_PATTERN.test(String(userMessage ?? ''));
}

export function selectContextSections(input: BuildContextPackInput): {
  included: ContextSectionName[];
  omitted: ContextSectionName[];
} {
  const all: ContextSectionName[] = [
    'intake',
    'budget',
    'transactions',
    'documents',
    'diagnostic',
    'interview',
    'social_reflections',
    'memory',
    'lifecycle',
  ];

  if (input.requiredSections?.length) {
    const required = input.requiredSections.filter((name): name is ContextSectionName =>
      all.includes(name as ContextSectionName),
    );
    const omitted = all.filter((name) => !required.includes(name));
    return { included: required, omitted };
  }

  if (isTrivialGreeting(input.userMessage)) {
    return { included: ['lifecycle'], omitted: all.filter((n) => n !== 'lifecycle') };
  }

  if (input.activeChat === 'chat-3' || input.purpose === 'social_reflection') {
    const included: ContextSectionName[] = ['lifecycle', 'social_reflections', 'intake', 'diagnostic'];
    if (input.userMessage && /\b(presupuesto|ingreso|gasto|deuda|monto|clp|uf)\b/i.test(input.userMessage)) {
      included.push('budget', 'transactions');
    }
    return { included, omitted: all.filter((n) => !included.includes(n)) };
  }

  if (isRegulationPurpose(input.purpose, input.userMessage)) {
    const included: ContextSectionName[] = ['intake', 'lifecycle', 'diagnostic'];
    return { included, omitted: all.filter((n) => !included.includes(n)) };
  }

  if (input.purpose === 'transaction_analysis') {
    const included: ContextSectionName[] = ['transactions', 'documents', 'lifecycle', 'budget'];
    return { included, omitted: all.filter((n) => !included.includes(n)) };
  }

  if (input.purpose === 'budget_analysis' || input.consumer === 'budget-agent') {
    const included: ContextSectionName[] = ['budget', 'intake', 'transactions', 'lifecycle'];
    return { included, omitted: all.filter((n) => !included.includes(n)) };
  }

  if (input.purpose === 'diagnosis' || input.consumer === 'diagnostic-agent' || input.consumer === 'interview-agent') {
    const included: ContextSectionName[] = [
      'intake',
      'budget',
      'transactions',
      'documents',
      'interview',
      'diagnostic',
      'lifecycle',
    ];
    return { included, omitted: all.filter((n) => !included.includes(n)) };
  }

  const included: ContextSectionName[] = [
    'intake',
    'budget',
    'transactions',
    'diagnostic',
    'memory',
    'lifecycle',
  ];
  if (input.optionalSections?.length) {
    for (const name of input.optionalSections) {
      if (all.includes(name as ContextSectionName) && !included.includes(name as ContextSectionName)) {
        included.push(name as ContextSectionName);
      }
    }
  }
  return { included, omitted: all.filter((n) => !included.includes(n)) };
}

export function trimPackToTokenBudget<T extends { tokenEstimate: number }>(
  pack: T & {
    facts: unknown[];
    deterministicSummaries: Record<string, unknown>;
    omittedSections: string[];
    resourceUris: string[];
  },
  maxTokens: number,
): T & { omitted?: boolean; hasMore?: boolean } {
  if (pack.tokenEstimate <= maxTokens) return pack;

  const next = {
    ...pack,
    facts: pack.facts.slice(0, Math.max(1, Math.floor(pack.facts.length / 2))),
    deterministicSummaries: Object.fromEntries(
      Object.entries(pack.deterministicSummaries).slice(0, 2),
    ),
    omitted: true,
    hasMore: true,
    omittedSections: [...pack.omittedSections],
    resourceUris: [...pack.resourceUris],
    tokenEstimate: Math.ceil(pack.tokenEstimate / 2),
  };
  return next;
}
