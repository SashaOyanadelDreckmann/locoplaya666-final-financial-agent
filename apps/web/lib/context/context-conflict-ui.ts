import type {
  ContextConflict,
  ContextConflictSeverity,
  ContextFabricSessionSnapshot,
} from '@financial-agent/shared';

export type ContextFabricSessionView = ContextFabricSessionSnapshot;

const DISMISS_STORAGE_PREFIX = 'fa:context-conflict-dismissed:v1:';

const SEVERITY_RANK: Record<ContextConflictSeverity, number> = {
  high: 4,
  medium: 3,
  low: 2,
  info: 1,
};

export type ContextConflictUiAction =
  | 'budget'
  | 'transactions'
  | 'questionnaire'
  | 'interview'
  | null;

export type ContextConflictUiCopy = {
  title: string;
  body: string;
  ctaLabel: string | null;
  action: ContextConflictUiAction;
};

const CONFLICT_COPY: Record<string, Omit<ContextConflictUiCopy, 'body'> & { body?: string }> = {
  INTAKE_BUDGET_INCOME_MISMATCH: {
    title: 'Ingreso distinto entre cuestionario y presupuesto',
    ctaLabel: 'Actualizar presupuesto',
    action: 'budget',
  },
  BUDGET_TRANSACTION_INFLOW_MISMATCH: {
    title: 'Ingresos del presupuesto no calzan con la cartola',
    ctaLabel: 'Revisar transacciones',
    action: 'transactions',
  },
  DECLARED_NO_DEBT_HIGH_OUTFLOWS: {
    title: 'Declaraste sin deuda, pero hay gastos elevados',
    ctaLabel: 'Actualizar cuestionario',
    action: 'questionnaire',
  },
};

export function resolveContextConflictCopy(conflict: ContextConflict): ContextConflictUiCopy {
  const preset = CONFLICT_COPY[conflict.explanationCode];
  return {
    title: preset?.title ?? 'Inconsistencia en tu contexto financiero',
    body: conflict.deterministicReason,
    ctaLabel: preset?.ctaLabel ?? 'Revisar datos',
    action: preset?.action ?? null,
  };
}

export function sortContextConflicts(conflicts: ContextConflict[]): ContextConflict[] {
  return [...conflicts].sort((left, right) => {
    const rankDelta = SEVERITY_RANK[right.severity] - SEVERITY_RANK[left.severity];
    if (rankDelta !== 0) return rankDelta;
    return left.explanationCode.localeCompare(right.explanationCode);
  });
}

function dismissStorageKey(userId: string): string {
  return `${DISMISS_STORAGE_PREFIX}${userId}`;
}

function readDismissedMap(userId: string): Record<string, true> {
  if (typeof window === 'undefined' || !userId) return {};
  try {
    const raw = window.localStorage.getItem(dismissStorageKey(userId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next: Record<string, true> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value === true) next[key] = true;
    }
    return next;
  } catch {
    return {};
  }
}

export function buildContextConflictDismissKey(contextVersion: string, conflictId: string): string {
  return `${contextVersion}:${conflictId}`;
}

export function isContextConflictDismissed(
  userId: string | null | undefined,
  contextVersion: string,
  conflictId: string,
): boolean {
  if (!userId) return false;
  const key = buildContextConflictDismissKey(contextVersion, conflictId);
  return Boolean(readDismissedMap(userId)[key]);
}

export function dismissContextConflict(
  userId: string | null | undefined,
  contextVersion: string,
  conflictId: string,
): void {
  if (typeof window === 'undefined' || !userId) return;
  const storageKey = dismissStorageKey(userId);
  const next = readDismissedMap(userId);
  next[buildContextConflictDismissKey(contextVersion, conflictId)] = true;
  window.localStorage.setItem(storageKey, JSON.stringify(next));
}

export function listVisibleContextConflicts(input: {
  contextFabric?: ContextFabricSessionView | null;
  userId?: string | null;
}): ContextConflict[] {
  const fabric = input.contextFabric;
  const conflicts = fabric?.conflicts;
  if (!fabric?.contextVersion || !Array.isArray(conflicts) || conflicts.length === 0) {
    return [];
  }
  return sortContextConflicts(
    conflicts.filter(
      (conflict) =>
        !isContextConflictDismissed(input.userId, fabric.contextVersion, conflict.conflictId),
    ),
  );
}
