import {
  deriveHydratedVoiceState,
  mergeInterviewIntake,
  mergeInterviewVoiceSnapshots,
} from '../interview-modal.hydration';

describe('interview modal hydration', () => {
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

  it('merges intake contexts without dropping existing enriched fields', () => {
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
    expect(merged?.__productsContext).toEqual({ productsCount: 1 });
    expect(merged?.__budgetContext).toEqual({ rowsCount: 5, balance: 1000 });
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
