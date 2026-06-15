import { describe, expect, it } from 'vitest';

import {
  buildActionPlanSessionBrief,
  buildRecentThreadContextBlock,
} from '../../flujo/action-plan-session';

describe('action-plan-session', () => {
  it('builds a recent thread block for chat-2 continuity', () => {
    const block = buildRecentThreadContextBlock(
      [
        { role: 'user', content: 'Quiero priorizar deuda de tarjeta' },
        { role: 'assistant', content: 'Perfecto, partamos por liquidez y tasa.' },
      ],
      'chat-2',
    );

    expect(block).toContain('HILO ACTUAL');
    expect(block).toContain('priorizar deuda');
  });

  it('builds an executive brief with diagnosis and user priorities', () => {
    const brief = buildActionPlanSessionBrief({
      profile: {
        editorial: { headline: 'Oxigeno financiero bajo presion' },
        tensions: ['Falta colchon de emergencia'],
      },
      intake: { intake: { hasDebt: true, exactMonthlyIncome: 1_500_000 } },
      budget: { income: 1_500_000, expenses: 1_200_000, balance: 300_000 },
      funnelStage: 'converge',
      turnCount: 5,
      turnsRemaining: 14,
      history: [{ role: 'user', content: 'Prioricemos la deuda cara primero' }],
    });

    expect(brief).toContain('Oxigeno financiero bajo presion');
    expect(brief).toContain('Convergencia');
    expect(brief).toContain('Prioricemos la deuda cara primero');
    expect(brief).toContain('no reinicies el plan');
  });
});
