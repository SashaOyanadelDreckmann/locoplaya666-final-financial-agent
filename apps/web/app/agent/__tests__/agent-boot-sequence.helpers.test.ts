/** @jest-environment node */

import {
  buildBootScriptLines,
  AGENT_BOOT_FROM_INTAKE_KEY,
} from '../agent-boot-sequence.helpers';

describe('agent boot sequence helpers', () => {
  it('builds script lines from real intake session data', () => {
    const lines = buildBootScriptLines({
      name: 'María López',
      injectedIntake: {
        intake: {
          city: 'Santiago',
          incomeBand: '600k-1M',
          employmentStatus: 'employed',
          expensesCoverage: 'tight',
          moneyStressLevel: 6,
          selfRatedUnderstanding: 7,
          hasDebt: false,
          hasSavingsOrInvestments: true,
          riskReaction: 'hold',
          financialKnowledge: { interest: true, inflation: true },
        },
      },
    });

    const joined = lines.map((l) => l.text).join('\n');
    expect(joined).toContain('María López');
    expect(joined).toContain('Santiago');
    expect(joined).toContain('600k-1M');
    expect(joined).toContain('analyzeIntake');
    expect(joined).toContain('readyForInterview: true');
  });

  it('exports stable session storage key', () => {
    expect(AGENT_BOOT_FROM_INTAKE_KEY).toBe('agent.boot.from-intake');
  });
});
