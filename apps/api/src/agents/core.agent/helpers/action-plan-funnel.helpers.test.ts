import { describe, expect, it } from 'vitest';
import {
  buildActionPlanSuggestedReplies,
  enforceDeliverPlanStructure,
  resolveActionPlanFunnelStage,
} from '@financial-agent/shared';

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
      resolveActionPlanFunnelStage({ activeChatId: 'chat-2', turnCount: 5, closingMode: false }),
    ).toBe('converge');
  });

  it('enters deliver only in last 2 turns or on explicit request', () => {
    expect(
      resolveActionPlanFunnelStage({ activeChatId: 'chat-2', turnCount: 6, closingMode: true }),
    ).toBe('converge');
    expect(
      resolveActionPlanFunnelStage({ activeChatId: 'chat-2', turnCount: 9, closingMode: true }),
    ).toBe('converge');
    expect(
      resolveActionPlanFunnelStage({ activeChatId: 'chat-2', turnCount: 10, closingMode: true }),
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

  it('enters deliver when user asks for executive plan', () => {
    expect(
      resolveActionPlanFunnelStage({
        activeChatId: 'chat-2',
        turnCount: 1,
        userMessage: 'quiero el plan ejecutivo completo',
      }),
    ).toBe('deliver');
  });

  it('builds stage-aware suggested replies', () => {
    expect(buildActionPlanSuggestedReplies('brainstorm')).toContain('Priorizar liquidez');
    expect(buildActionPlanSuggestedReplies('converge')).toContain('Cerrar plan ejecutivo');
    expect(buildActionPlanSuggestedReplies('deliver')).toContain('Guardar en biblioteca');
  });

  it('appends missing deliver sections', () => {
    const out = enforceDeliverPlanStructure('## Resumen ejecutivo\nCierre rapido.');
    expect(out).toContain('## Secuencia de ejecucion');
    expect(out).toContain('## Prioridades 0-90 dias');
  });
});
