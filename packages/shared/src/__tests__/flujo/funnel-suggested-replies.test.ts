import { describe, expect, it } from 'vitest';
import {
  buildChat1PhaseReplies,
  buildTurnContextActionPlanReplies,
  buildTurnContextChat1Replies,
  buildTurnContextSocialConsciousnessReplies,
  extractAssistantAlignedReplies,
  mergeFunnelSuggestedReplies,
} from '../../flujo/funnel-suggested-replies';

describe('extractAssistantAlignedReplies', () => {
  it('uses questionnaire closing choices when provided', () => {
    const replies = extractAssistantAlignedReplies(
      'Priorizo liquidez este mes.\n\n¿Prefieres atacar la tarjeta o armar colchón primero?',
      ['Atacar la tarjeta', 'Armar colchón primero'],
    );
    expect(replies[0]).toMatch(/tarjeta/i);
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

describe('buildTurnContextChat1Replies', () => {
  it('derives simulation-focused chips from user message', () => {
    const replies = buildTurnContextChat1Replies('Quiero simular un escenario de ahorro');
    expect(replies.some((r) => /simul|escenario/i.test(r))).toBe(true);
  });
});

describe('buildChat1PhaseReplies', () => {
  it('suggests cartola upload when transactions are missing', () => {
    const replies = buildChat1PhaseReplies({
      phase: 'transactions_needed',
      hasBudget: false,
      hasTransactions: false,
    });
    expect(replies[0]).toMatch(/cartola|movimientos/i);
  });
});

describe('mergeFunnelSuggestedReplies', () => {
  it('mixes contextual and onboarding chips for chat-1', () => {
    const merged = mergeFunnelSuggestedReplies({
      activeChatId: 'chat-1',
      turnCount: 1,
      closingMode: false,
      onboardingPhase: 'transactions_needed',
      hasBudget: false,
      hasTransactions: false,
      userMessage: 'Quiero simular cuanto puedo ahorrar al mes',
      modelSuggestedReplies: ['Simular fondo de emergencia'],
    });

    expect(merged.length).toBeGreaterThanOrEqual(3);
    expect(merged.length).toBeLessThanOrEqual(4);
    expect(merged.some((r) => /simul|ahorr/i.test(r))).toBe(true);
    expect(merged.some((r) => /cartola|movimientos|deuda/i.test(r))).toBe(true);
  });

  it('prefers questionnaire-aligned chips for chat-1', () => {
    const merged = mergeFunnelSuggestedReplies({
      activeChatId: 'chat-1',
      turnCount: 2,
      userMessage: 'Tengo dudas con mi deuda',
      assistantMessage: '¿Prefieres simular deuda o revisar presupuesto primero?',
      modelSuggestedReplies: ['Simular deuda', 'Revisar presupuesto'],
      questionnaireClosingChoices: ['Simular deuda', 'Revisar presupuesto'],
    });

    expect(merged.some((chip) => /simular deuda|revisar presupuesto/i.test(chip))).toBe(true);
  });

  it('does not dilute questionnaire chips with onboarding defaults', () => {
    const merged = mergeFunnelSuggestedReplies({
      activeChatId: 'chat-1',
      turnCount: 1,
      onboardingPhase: 'transactions_needed',
      hasBudget: false,
      hasTransactions: false,
      userMessage: 'hola',
      modelSuggestedReplies: ['Atacar la tarjeta', 'Armar colchón primero'],
      questionnaireBlocks: [
        {
          type: 'questionnaire',
          questionnaire: {
            questions: [
              {
                question: '¿Prefieres atacar la tarjeta o armar colchón primero?',
                choices: ['Atacar la tarjeta', 'Armar colchón primero'],
                response_mode: 'choices',
              },
            ],
          },
        },
      ],
    });

    expect(merged.some((chip) => /cartola|subir/i.test(chip))).toBe(false);
    expect(merged.some((chip) => /tarjeta|colch/i.test(chip))).toBe(true);
  });

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
      questionnaireClosingChoices: ['Pagar tarjeta primero', 'Ahorrar en paralelo'],
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
