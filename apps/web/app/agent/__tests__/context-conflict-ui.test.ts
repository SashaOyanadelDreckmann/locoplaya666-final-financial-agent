import type { ContextConflict } from '@financial-agent/shared';

import {
  buildContextConflictDismissKey,
  dismissContextConflict,
  isContextConflictDismissed,
  listVisibleContextConflicts,
  resolveContextConflictCopy,
  sortContextConflicts,
} from '@/lib/context/context-conflict-ui';

function sampleConflict(overrides: Partial<ContextConflict> = {}): ContextConflict {
  return {
    conflictId: 'conflict-1',
    type: 'soft_value_mismatch',
    severity: 'medium',
    status: 'open',
    predicate: 'monthly_income',
    factIds: [],
    sourceIds: [],
    explanationCode: 'INTAKE_BUDGET_INCOME_MISMATCH',
    deterministicReason: 'Ingreso declarado (1500000) difiere del presupuesto (900000).',
    detectedAt: '2026-01-01T00:00:00.000Z',
    contextVersion: 'ctx-1',
    suggestedResolution: 'ask_user',
    autoResolvable: false,
    ...overrides,
  };
}

describe('context-conflict-ui', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it('maps known explanation codes to review actions', () => {
    const copy = resolveContextConflictCopy(sampleConflict());
    expect(copy.title).toContain('cuestionario');
    expect(copy.ctaLabel).toBe('Actualizar presupuesto');
    expect(copy.action).toBe('budget');
  });

  it('routes debt declaration conflicts to questionnaire edit', () => {
    const copy = resolveContextConflictCopy(
      sampleConflict({ explanationCode: 'DECLARED_NO_DEBT_HIGH_OUTFLOWS' }),
    );
    expect(copy.ctaLabel).toBe('Actualizar cuestionario');
    expect(copy.action).toBe('questionnaire');
  });

  it('sorts conflicts by severity', () => {
    const sorted = sortContextConflicts([
      sampleConflict({ conflictId: 'a', severity: 'low' }),
      sampleConflict({ conflictId: 'b', severity: 'high' }),
      sampleConflict({ conflictId: 'c', severity: 'medium' }),
    ]);
    expect(sorted.map((conflict) => conflict.severity)).toEqual(['high', 'medium', 'low']);
  });

  it('persists dismissals per user and context version', () => {
    const key = buildContextConflictDismissKey('ctx-1', 'conflict-1');
    expect(key).toBe('ctx-1:conflict-1');
    dismissContextConflict('user-1', 'ctx-1', 'conflict-1');
    expect(isContextConflictDismissed('user-1', 'ctx-1', 'conflict-1')).toBe(true);
    expect(isContextConflictDismissed('user-1', 'ctx-2', 'conflict-1')).toBe(false);
  });

  it('filters dismissed conflicts from the visible list', () => {
    dismissContextConflict('user-1', 'ctx-1', 'conflict-1');
    const visible = listVisibleContextConflicts({
      userId: 'user-1',
      contextFabric: {
        contextVersion: 'ctx-1',
        activeConflictCount: 2,
        lifecycle: {
          activeChat: 'chat-1',
          diagnosisCompleted: false,
          interviewStatus: 'pending',
        },
        conflicts: [
          sampleConflict({ conflictId: 'conflict-1' }),
          sampleConflict({
            conflictId: 'conflict-2',
            explanationCode: 'BUDGET_TRANSACTION_INFLOW_MISMATCH',
          }),
        ],
      },
    });
    expect(visible).toHaveLength(1);
    expect(visible[0]?.conflictId).toBe('conflict-2');
  });
});
