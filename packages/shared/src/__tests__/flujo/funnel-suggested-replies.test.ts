import { describe, expect, it } from 'vitest';
import {
  buildTurnContextActionPlanReplies,
  buildTurnContextSocialConsciousnessReplies,
  extractAssistantAlignedReplies,
  mergeFunnelSuggestedReplies,
} from '../../flujo/funnel-suggested-replies';

describe('extractAssistantAlignedReplies', () => {
  it('extracts closing questions from assistant message', () => {
    const replies = extractAssistantAlignedReplies(
      'Priorizo liquidez este mes.\n\n¿Prefieres atacar la tarjeta o armar colchón primero?',
    );
    expect(replies[0]).toMatch(/tarjeta|colchón/i);
  });
});

describe('buildTurnContextActionPlanReplies', () => {
  it('derives debt-focused chips from user message', () => {
    const replies = buildTurnContextActionPlanReplies(
      'Me preocupa la deuda de la tarjeta, ¿la pago antes que ahorrar?',
    );
    expect(replies[0]).toMatch(/deuda/i);
    expect(replies.some((r) => /ahorro|deuda/i.test(r))).toBe(true);
  });

  it('returns empty for generic short messages', () => {
    expect(buildTurnContextActionPlanReplies('hola')).toEqual([]);
  });
});

describe('buildTurnContextSocialConsciousnessReplies', () => {
  it('derives guilt-focused chips', () => {
    const replies = buildTurnContextSocialConsciousnessReplies(
      'Siento culpa cuando compro cosas que me gustan',
    );
    expect(replies[0]).toMatch(/culpa|miedo/i);
  });
});

describe('mergeFunnelSuggestedReplies', () => {
  it('mixes contextual and funnel chips for chat-2', () => {
    const merged = mergeFunnelSuggestedReplies({
      activeChatId: 'chat-2',
      turnCount: 1,
      closingMode: false,
      userMessage: '¿Qué hago primero con mi deuda de consumo?',
      modelSuggestedReplies: ['Simular escenario conservador'],
    });

    expect(merged.length).toBeGreaterThanOrEqual(3);
    expect(merged.length).toBeLessThanOrEqual(4);
    expect(merged.some((r) => /deuda|conservador/i.test(r))).toBe(true);
    expect(merged.some((r) => /liquidez|deuda|ahorro/i.test(r))).toBe(true);
  });

  it('mixes contextual and funnel chips for chat-3', () => {
    const merged = mergeFunnelSuggestedReplies({
      activeChatId: 'chat-3',
      turnCount: 1,
      closingMode: false,
      userMessage: 'Siento culpa cuando compro cosas que me gustan',
    });

    expect(merged.some((r) => /culpa|valores|gasto/i.test(r))).toBe(true);
    expect(merged.some((r) => /libertad|valores|mundo/i.test(r))).toBe(true);
  });

  it('dedupes repeated suggestions', () => {
    const merged = mergeFunnelSuggestedReplies({
      activeChatId: 'chat-2',
      turnCount: 1,
      userMessage: 'Priorizar liquidez este mes',
      modelSuggestedReplies: ['Priorizar liquidez', 'Explorar deuda'],
    });

    const keys = merged.map((r) => r.toLowerCase());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('prefers assistant-aligned chips over generic funnel defaults', () => {
    const merged = mergeFunnelSuggestedReplies({
      activeChatId: 'chat-2',
      turnCount: 2,
      userMessage: 'Tengo deuda de consumo',
      assistantMessage: '¿Pagamos tarjeta antes que ahorrar?',
      modelSuggestedReplies: ['Pagar tarjeta primero', 'Ahorrar en paralelo'],
    });

    expect(merged.some((chip) => /tarjeta|ahorrar/i.test(chip))).toBe(true);
    expect(merged.length).toBeLessThanOrEqual(4);
  });

  it('filters chips that repeat recent assistant questions', () => {
    const merged = mergeFunnelSuggestedReplies({
      activeChatId: 'chat-2',
      turnCount: 3,
      userMessage: 'Sigamos',
      assistantMessage: '¿Validamos la ruta tentativa?',
      recentSuggestedReplies: ['¿Validamos la ruta tentativa?'],
    });

    expect(merged.some((chip) => /validamos la ruta tentativa/i.test(chip))).toBe(false);
  });
});
