import { describe, expect, it } from 'vitest';
import {
  mergeFunnelSuggestedReplies,
  extractAssistantAlignedReplies,
} from '../../flujo/funnel-suggested-replies';
import {
  resolveActionPlanFunnelStage,
  buildActionPlanSuggestedReplies,
  getActionPlanFullDeliverFrom,
} from '../../flujo/action-plan-funnel';
import { getMaxChatTurns, getClosingModeTurn } from '../../chat/chat-lifecycle.constants';
import {
  FUNNEL_CONCISENESS_DIRECTIVE,
  FUNNEL_ANTI_REPETITION_DIRECTIVE,
  FUNNEL_EVIDENCE_JUSTIFICATION_DIRECTIVE,
} from '../../flujo/funnel-user-turn';

const MAX = getMaxChatTurns('chat-2');
const CLOSING = getClosingModeTurn('chat-2');

type Turn = {
  user: string;
  assistant: string;
  modelChips: string[];
};

const SCENARIO_DEBT: Turn[] = [
  {
    user: 'Me preocupa la deuda de la tarjeta, ¿la pago antes que ahorrar?',
    assistant:
      'Tu tarjeta compite con el colchón.\n\n¿Quieres priorizar la deuda de consumo o armar fondo de emergencia primero?',
    modelChips: ['Pagar tarjeta primero', 'Armar colchón mínimo', 'Ver cuánto pesa la deuda'],
  },
  {
    user: 'Prefiero atacar la tarjeta, tengo $800 mil de saldo',
    assistant:
      'Con $800 mil conviene ordenar vencimientos.\n\n¿Tienes cuota mínima al día o hay atraso?',
    modelChips: ['Cuota al día', 'Hay atraso', 'Simular pago acelerado'],
  },
  {
    user: 'Cuota al día, pero el interés me mata',
    assistant:
      'El interés rotativo es el costo real.\n\n¿Quieres comparar pago mínimo vs abono extra este mes?',
    modelChips: ['Comparar pago mínimo vs extra', 'Ver tasa efectiva', 'Congelar consumos'],
  },
  {
    user: 'Sí, comparemos',
    assistant:
      'Ruta A: abono extra reduce interés. Ruta B: colchón paralelo.\n\n¿Validamos abono extra de $150 mil?',
    modelChips: ['Validar abono $150 mil', 'Mantener mínimo', 'Pedir plan final'],
  },
  {
    user: 'Validemos abono extra',
    assistant:
      'Prioridad confirmada: tarjeta con abono extra.\n\n¿Cerramos secuencia 0-90 días?',
    modelChips: ['Cerrar secuencia', 'Ajustar monto', 'Ver trade-offs'],
  },
  {
    user: 'Dame el plan final estructurado',
    assistant: '## Resumen ejecutivo\nPlan personalizado...',
    modelChips: ['Ajustar secuencia', 'Profundizar prioridades', 'Guardar en biblioteca'],
  },
];

function simulateTurns(turns: Turn[]) {
  const chipHistory: string[] = [];
  const results: Array<{
    turn: number;
    stage: string | null;
    chips: string[];
    repeatedChips: string[];
  }> = [];

  for (let turn = 0; turn < turns.length; turn++) {
    const { user, assistant, modelChips } = turns[turn];
    const closingMode = turn >= CLOSING;
    const stage = resolveActionPlanFunnelStage({
      activeChatId: 'chat-2',
      turnCount: turn,
      closingMode,
      userMessage: user,
    });
    const chips = mergeFunnelSuggestedReplies({
      activeChatId: 'chat-2',
      turnCount: turn,
      closingMode,
      userMessage: user,
      assistantMessage: assistant,
      modelSuggestedReplies: modelChips,
      recentSuggestedReplies: chipHistory.slice(-6),
    });
    const repeatedChips = chips.filter((chip) =>
      chipHistory.some((prev) => prev.toLowerCase() === chip.toLowerCase()),
    );
    chipHistory.push(...chips);
    results.push({ turn: turn + 1, stage, chips, repeatedChips });
  }

  return results;
}

describe('chat-2 conversation audit (deterministic)', () => {
  it('uses 12 max interactions and closing from turn 7', () => {
    expect(MAX).toBe(12);
    expect(CLOSING).toBe(6);
  });

  it('includes brevity, evidence and anti-repetition directives', () => {
    expect(FUNNEL_CONCISENESS_DIRECTIVE).toContain('BREVEDAD');
    expect(FUNNEL_ANTI_REPETITION_DIRECTIVE).toContain('ANTI-REPETICION');
    expect(FUNNEL_EVIDENCE_JUSTIFICATION_DIRECTIVE).toContain('JUSTIFICACION CON EVIDENCIA');
  });

  it('progresses funnel: brainstorm → converge → deliver (last 2 turns only)', () => {
    expect(
      resolveActionPlanFunnelStage({ activeChatId: 'chat-2', turnCount: 1, closingMode: false }),
    ).toBe('brainstorm');
    expect(
      resolveActionPlanFunnelStage({ activeChatId: 'chat-2', turnCount: 5, closingMode: false }),
    ).toBe('converge');
    expect(
      resolveActionPlanFunnelStage({ activeChatId: 'chat-2', turnCount: 6, closingMode: true }),
    ).toBe('converge');
    expect(
      resolveActionPlanFunnelStage({ activeChatId: 'chat-2', turnCount: 10, closingMode: true }),
    ).toBe('deliver');
    expect(getActionPlanFullDeliverFrom()).toBe(MAX - 2);
    expect(
      resolveActionPlanFunnelStage({
        activeChatId: 'chat-2',
        turnCount: 2,
        userMessage: 'dame el plan final estructurado',
      }),
    ).toBe('deliver');
  });

  it('keeps converge through turn 9 on a 12-interaction chat', () => {
    const stages = Array.from({ length: MAX }, (_, turn) =>
      resolveActionPlanFunnelStage({
        activeChatId: 'chat-2',
        turnCount: turn,
        closingMode: turn >= CLOSING,
      }),
    );
    expect(stages.slice(0, 4).every((s) => s === 'brainstorm')).toBe(true);
    expect(stages.slice(4, 10).every((s) => s === 'converge')).toBe(true);
    expect(stages.slice(10).every((s) => s === 'deliver')).toBe(true);
  });

  it('rotates default funnel chips across turns', () => {
    const t0 = buildActionPlanSuggestedReplies('brainstorm', 0);
    const t2 = buildActionPlanSuggestedReplies('brainstorm', 2);
    expect(t0).not.toEqual(t2);
  });

  it('debt scenario: chips stay contextual and rarely repeat', () => {
    const results = simulateTurns(SCENARIO_DEBT);

    for (const row of results) {
      expect(row.chips.length).toBeGreaterThanOrEqual(3);
      expect(row.chips.length).toBeLessThanOrEqual(4);
    }

    const allRepeated = results.flatMap((r) => r.repeatedChips);
    expect(allRepeated.length).toBeLessThanOrEqual(1);

    expect(results[0].chips.some((c) => /tarjeta|deuda|colchón|ahorro/i.test(c))).toBe(true);
    expect(extractAssistantAlignedReplies(SCENARIO_DEBT[0].assistant)[0]).toMatch(
      /deuda|emergencia|colchón/i,
    );
  });

  it('generic messages still get funnel chips but aligned when assistant asks', () => {
    const assistant = '¿Cuál es tu prioridad financiera este mes?';
    const chips = mergeFunnelSuggestedReplies({
      activeChatId: 'chat-2',
      turnCount: 1,
      userMessage: 'Hola',
      assistantMessage: assistant,
      modelSuggestedReplies: [],
    });
    expect(chips.length).toBeGreaterThanOrEqual(3);
    expect(extractAssistantAlignedReplies(assistant)[0]).toMatch(/prioridad/i);
  });

  it('filters chips that duplicate recent assistant questions', () => {
    const question = '¿Validamos la ruta tentativa?';
    const chips = mergeFunnelSuggestedReplies({
      activeChatId: 'chat-2',
      turnCount: 4,
      userMessage: 'Sigamos',
      assistantMessage: question,
      recentSuggestedReplies: [question],
    });
    expect(chips.some((c) => /validamos la ruta tentativa/i.test(c))).toBe(false);
  });
});
