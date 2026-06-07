import { describe, expect, it } from 'vitest';

import { buildVoiceInterviewFallbackProfile } from './diagnostic.fallback';

describe('buildVoiceInterviewFallbackProfile', () => {
  it('builds a complete v2 profile without LLM output', () => {
    const profile = buildVoiceInterviewFallbackProfile({
      intake: {
        hasDebt: true,
        tracksExpenses: false,
        moneyStressLevel: 8,
        hasSavingsOrInvestments: false,
      },
      blocks: {
        warmup: {
          blockId: 'warmup',
          summary: 'Contexto inicial validado.',
          signalsDetected: ['Presión visible'],
          confidence: 'medium',
          userValidated: true,
        },
      },
      executiveReport: 'La entrevista reveló presión financiera y poca estructura operativa.',
      keyFindings: ['Deuda activa', 'Seguimiento irregular'],
      endedBy: 'timeout',
    });

    expect(profile.version).toBe('v2');
    expect(profile.diagnosticNarrative).toContain('La entrevista reveló presión financiera');
    expect(profile.profile.financialPressure).toBe('high');
    expect(profile.tensions.length).toBeGreaterThan(0);
    expect(profile.editorial?.headline).toBeTruthy();
  });
});
