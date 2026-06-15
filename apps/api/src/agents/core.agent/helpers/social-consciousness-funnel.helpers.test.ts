import { describe, expect, it } from 'vitest';
import {
  buildSocialConsciousnessFallbackMessage,
  buildSocialConsciousnessSuggestedReplies,
  enforceSocialSynthesisStructure,
  isChat3BlockedTool,
  resolveSocialConsciousnessFunnelStage,
} from '@financial-agent/shared';

describe('resolveSocialConsciousnessFunnelStage', () => {
  it('returns null outside chat-3', () => {
    expect(resolveSocialConsciousnessFunnelStage({ activeChatId: 'chat-1', turnCount: 0 })).toBeNull();
  });

  it('starts in explore', () => {
    expect(
      resolveSocialConsciousnessFunnelStage({ activeChatId: 'chat-3', turnCount: 0, closingMode: false }),
    ).toBe('explore');
  });

  it('moves to tension in the middle arc', () => {
    expect(
      resolveSocialConsciousnessFunnelStage({ activeChatId: 'chat-3', turnCount: 5, closingMode: false }),
    ).toBe('tension');
  });

  it('enters synthesis in closing mode', () => {
    expect(
      resolveSocialConsciousnessFunnelStage({ activeChatId: 'chat-3', turnCount: 9, closingMode: true }),
    ).toBe('synthesis');
  });

  it('enters synthesis when user asks for consolidated reading', () => {
    expect(
      resolveSocialConsciousnessFunnelStage({
        activeChatId: 'chat-3',
        turnCount: 1,
        userMessage: 'quiero la síntesis reflexiva final',
      }),
    ).toBe('synthesis');
  });
});

describe('buildSocialConsciousnessSuggestedReplies', () => {
  it('returns philosophical prompts in explore', () => {
    expect(buildSocialConsciousnessSuggestedReplies('explore')[0]).toContain('libertad');
  });
});

describe('enforceSocialSynthesisStructure', () => {
  it('appends missing synthesis sections', () => {
    const output = enforceSocialSynthesisStructure('## Lectura central\nTexto.');
    expect(output).toContain('## Valores en tensión');
    expect(output).toContain('## Pregunta abierta para seguir');
  });
});

describe('buildSocialConsciousnessFallbackMessage', () => {
  it('keeps philosophical tone', () => {
    expect(buildSocialConsciousnessFallbackMessage()).toMatch(/reflexi[oó]n|valores/i);
  });
});

describe('isChat3BlockedTool', () => {
  it('blocks finance tools in philosophical mode', () => {
    expect(isChat3BlockedTool('finance.transactions_charts', '¿El dinero compra libertad?')).toBe(true);
  });

  it('allows finance tools when user asks for numbers', () => {
    expect(isChat3BlockedTool('finance.transactions_charts', 'simular mi ahorro con números')).toBe(false);
  });
});
