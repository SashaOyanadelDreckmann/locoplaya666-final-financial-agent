import { describe, expect, it } from 'vitest';
import { resolveActionPlanFunnelStage } from './action-plan-funnel.helpers';

describe('resolveActionPlanFunnelStage', () => {
  it('returns null outside chat-2', () => {
    expect(resolveActionPlanFunnelStage({ activeChatId: 'chat-1', turnCount: 0 })).toBeNull();
  });

  it('starts in brainstorm', () => {
    expect(
      resolveActionPlanFunnelStage({ activeChatId: 'chat-2', turnCount: 0, closingMode: false }),
    ).toBe('brainstorm');
  });

  it('moves to converge after early turns', () => {
    expect(
      resolveActionPlanFunnelStage({ activeChatId: 'chat-2', turnCount: 8, closingMode: false }),
    ).toBe('converge');
  });

  it('enters deliver in closing mode', () => {
    expect(
      resolveActionPlanFunnelStage({ activeChatId: 'chat-2', turnCount: 8, closingMode: true }),
    ).toBe('deliver');
  });

  it('enters deliver when user asks for final plan', () => {
    expect(
      resolveActionPlanFunnelStage({
        activeChatId: 'chat-2',
        turnCount: 2,
        userMessage: 'listo, dame el plan final estructurado',
      }),
    ).toBe('deliver');
  });
});
