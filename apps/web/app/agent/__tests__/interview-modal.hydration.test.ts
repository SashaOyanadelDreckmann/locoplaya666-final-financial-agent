import {
  deriveHydratedVoiceState,
  interviewIntakeContextsEqual,
  mergeInterviewIntake,
  mergeInterviewVoiceSnapshots,
  resolvePersistedVoiceReport,
} from '../modales/entrevista/interview-modal.hydration';

describe('interview modal hydration', () => {
  it('merges server lastReport into voiceReport during snapshot hydration', () => {
    const merged = mergeInterviewVoiceSnapshots(null, {
      status: 'completed',
      coverageTier: 'substantial',
      lastReport: {
        executive_report: 'Informe mergeado',
        key_findings: ['Hallazgo merge'],
        ended_by: 'user',
      },
    });

    expect(merged?.voiceReport).toEqual({
      executive_report: 'Informe mergeado',
      key_findings: ['Hallazgo merge'],
      stop_reason: 'user',
      coverage_tier: 'substantial',
    });
  });

  it('prefers server quota fields while keeping the highest callSeconds progress', () => {
    const merged = mergeInterviewVoiceSnapshots(
      {
        callId: 'local-call',
        callSeconds: 95,
        minuteSummaries: [{ minute: 1, summary: 'Local fresca', keyFindings: [], createdAt: 't1' }],
      },
      {
        activeCallId: 'server-call',
        callSeconds: 72,
        callsStarted: 1,
        remainingTotalSec: 108,
        maxDurationSec: 180,
        status: 'paused',
      },
    );

    expect(merged?.callId).toBe('server-call');
    expect(merged?.callSeconds).toBe(95);
    expect(merged?.remainingTotalSec).toBe(108);
    expect(merged?.callsStarted).toBe(1);
  });

  it('normalizes server lastReport into a client voiceReport', () => {
    const report = resolvePersistedVoiceReport({
      status: 'completed',
      coverageTier: 'partial',
      lastReport: {
        executive_report: 'Informe desde servidor',
        key_findings: ['Hallazgo A', 'Hallazgo B'],
        ended_by: 'user',
      },
    });

    expect(report).toEqual({
      executive_report: 'Informe desde servidor',
      key_findings: ['Hallazgo A', 'Hallazgo B'],
      stop_reason: 'user',
      coverage_tier: 'partial',
    });
  });

  it('prefers voiceReport over lastReport when both are present', () => {
    const report = resolvePersistedVoiceReport({
      voiceReport: {
        executive_report: 'Informe cliente',
        key_findings: ['Cliente'],
        stop_reason: 'agent',
        coverage_tier: 'complete',
      },
      lastReport: {
        executive_report: 'Informe servidor',
        key_findings: ['Servidor'],
      },
    });

    expect(report?.executive_report).toBe('Informe cliente');
    expect(report?.key_findings).toEqual(['Cliente']);
    expect(report?.stop_reason).toBe('agent');
    expect(report?.coverage_tier).toBe('complete');
  });

  it('hydrates diagnosis mode from persisted lastReport after refresh', () => {
    const hydrated = deriveHydratedVoiceState({
      snapshot: {
        status: 'completed',
        coverageTier: 'minimal',
        lastReport: {
          executive_report: 'Informe persistido',
          key_findings: ['Señal 1'],
          ended_by: 'timeout',
        },
      },
      sessionDiagnosticProfileId: 'profile-refresh-1',
    });

    expect(hydrated.sessionAlreadyCompleted).toBe(true);
    expect(hydrated.voiceReport).toEqual({
      executive_report: 'Informe persistido',
      key_findings: ['Señal 1'],
      stop_reason: 'timeout',
      coverage_tier: 'minimal',
    });
  });

  it('marks completed sessions and preserves report data', () => {
    const hydrated = deriveHydratedVoiceState({
      snapshot: {
        status: 'completed',
        voiceReport: {
          executive_report: 'Informe listo',
          key_findings: ['Hallazgo 1'],
        },
        minuteSummaries: [{ minute: 1, summary: 'Síntesis', keyFindings: [], createdAt: 't1' }],
      },
      sessionDiagnosticProfileId: 'profile-1',
    });

    expect(hydrated.sessionAlreadyCompleted).toBe(true);
    expect(hydrated.voiceReport?.executive_report).toBe('Informe listo');
    expect(hydrated.latestDiagnosticProfileId).toBe('profile-1');
  });

  it('prefers fresher server product and budget context over stale local cache', () => {
    const merged = mergeInterviewIntake(
      {
        profession: 'Abogado',
        __productsContext: { productsCount: 1 },
        __budgetContext: null,
      },
      { age: 40, profession: 'Abogado' },
      { productsCount: 2 },
      { rowsCount: 5, balance: 1000 },
    );

    expect(merged?.profession).toBe('Abogado');
    expect(merged?.__productsContext).toEqual({ productsCount: 2 });
    expect(merged?.__budgetContext).toEqual({ rowsCount: 5, balance: 1000 });
  });

  it('treats equivalent interview intake contexts as unchanged', () => {
    const base = {
      profession: 'Abogado',
      __productsContext: { productsCount: 2 },
      __budgetContext: { rowsCount: 5, balance: 1000 },
    };
    const merged = mergeInterviewIntake(
      base,
      { age: 40, profession: 'Abogado' },
      { productsCount: 2 },
      { rowsCount: 5, balance: 1000 },
    );

    expect(interviewIntakeContextsEqual(base, merged)).toBe(true);
  });

  it('hydrates a fresh intake object when the store is still empty', () => {
    const merged = mergeInterviewIntake(
      null,
      { age: 40, profession: 'Abogado' },
      { productsCount: 2 },
      { rowsCount: 5, balance: 1000 },
    );

    expect(merged?.age).toBe(40);
    expect(merged?.__productsContext).toEqual({ productsCount: 2 });
    expect(merged?.__budgetContext).toEqual({ rowsCount: 5, balance: 1000 });
  });
});
