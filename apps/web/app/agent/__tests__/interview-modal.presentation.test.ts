import {
  buildInterviewInsightCells,
  resolveInterviewBackendSessionStatus,
} from '../modales/entrevista/interview-modal.presentation';
import { resolveInterviewVoiceStateFlags } from '../modales/entrevista/interview-modal.helpers';

describe('interview modal presentation', () => {
  const baseFlags = resolveInterviewVoiceStateFlags({ closeoutBufferSec: 25, callSeconds: 12, callId: 'call-1' });

  it('maps live conversation state to backend-aligned session status', () => {
    expect(
      resolveInterviewBackendSessionStatus({
        showVoiceReport: false,
        isFinalizingCall: false,
        isGeneratingDiagnosis: false,
        voiceAwaitingMic: false,
        voiceConnecting: false,
        voiceConnected: true,
        voicePaused: false,
        voiceFlags: baseFlags,
        callId: 'call-1',
      }),
    ).toEqual({ value: 'En curso', tone: 'live' });
  });

  it('builds compact insight cells from intake and voice runtime', () => {
    const cells = buildInterviewInsightCells({
      intake: {
        profession: 'Ingeniero',
        incomeBand: '1_2M',
        moneyStressLevel: 6,
        __productsContext: { productsCount: 2, activeProductLabel: 'Cuenta Vista' },
        __budgetContext: { rowsCount: 8, balance: 120000 },
      },
      intakeReady: true,
      showVoiceReport: false,
      isFinalizingCall: false,
      isGeneratingDiagnosis: false,
      voiceAwaitingMic: false,
      voiceConnecting: false,
      voiceConnected: true,
      voicePaused: false,
      voiceListening: true,
      voiceSpeaking: false,
      voiceSessionReady: true,
      summaryGenerating: false,
      syncError: null,
      voiceFlags: baseFlags,
      callId: 'call-1',
      minuteSummariesCount: 1,
      latestMinuteSummary: 'Gastos fijos altos en vivienda',
      hasFinalSummary: false,
      remainingTotalSec: 140,
    });

    expect(cells).toHaveLength(4);
    expect(cells.map((cell) => cell.key)).toEqual(['state', 'context', 'base', 'evidence']);
    expect(cells.find((cell) => cell.key === 'state')?.detail).toBe('Usuario habla');
    expect(cells.find((cell) => cell.key === 'context')?.value).toContain('Activo · 2 capas');
    expect(cells.find((cell) => cell.key === 'base')?.detail).toContain('Cuenta Vista');
    expect(cells.find((cell) => cell.key === 'evidence')?.value).toBe('1 acumulada');
  });
});
