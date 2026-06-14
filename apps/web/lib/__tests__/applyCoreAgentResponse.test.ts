/** @jest-environment node */

import {
  applyCoreAgentErrorItems,
  applyCoreAgentResponseToItems,
  extractCoreAgentSideEffects,
} from '@/lib/agente/nucleo/applyCoreAgentResponse';
import type { AgentResponse } from '@/lib/agente/agent.response.types';

describe('applyCoreAgentResponse', () => {
  it('extracts lifecycle and fincoin side effects', () => {
    const response: AgentResponse = {
      message: 'Listo',
      mode: 'information',
      context_score: 42,
      budget_updates: [{ label: 'Arriendo', type: 'expense', amount: 450000 }],
      meta: {
        product_lifecycle: {
          phase: 'post_diagnosis',
          active_chat_id: 'chat-2',
          turn_count: 3,
        },
        fincoin_usage: {
          remaining_fincoins: 10,
          spent_fincoins: 5,
          warning_threshold: 3,
        },
      },
    };

    const effects = extractCoreAgentSideEffects(response);
    expect(effects.contextScore).toBe(42);
    expect(effects.budgetUpdates).toHaveLength(1);
    expect(effects.productLifecyclePatch?.phase).toBe('post_diagnosis');
    expect(effects.productLifecyclePatch?.chatTurns).toEqual({ 'chat-2': 3 });
    expect(effects.fincoinUsage?.remaining_fincoins).toBe(10);
  });

  it('replaces streaming placeholder with final assistant items', () => {
    const response: AgentResponse = {
      message: 'Respuesta final',
      mode: 'education',
      citations: [{ source: 'CMF', url: 'https://cmf.cl' }],
    };

    const items = applyCoreAgentResponseToItems({
      items: [
        { type: 'message', role: 'user', content: 'pregunta' },
        {
          type: 'message',
          role: 'assistant',
          content: 'parcial',
          stream: { tools: [], streaming: true, startedAt: 1 },
        },
      ],
      response,
    });

    expect(items.some((item) => item.type === 'message' && item.role === 'assistant' && item.content === 'parcial')).toBe(
      false,
    );
    expect(items.some((item) => item.type === 'message' && item.role === 'assistant' && item.content === 'Respuesta final')).toBe(
      true,
    );
    expect(items.some((item) => item.type === 'citation')).toBe(true);
  });

  it('keeps welcome shell and surfaces transient chat errors separately', () => {
    const result = applyCoreAgentErrorItems(
      [
        { type: 'message', role: 'assistant', content: '', mode: 'information' },
        { type: 'message', role: 'user', content: 'Hola' },
        {
          type: 'message',
          role: 'assistant',
          content: 'parcial',
          stream: { tools: [], streaming: true, startedAt: 1 },
        },
      ],
      'No pude procesar tu mensaje ahora. Inténtalo nuevamente en unos segundos.',
    );

    expect(result.transientError).toContain('No pude procesar');
    expect(result.items).toHaveLength(2);
    expect(result.items.some((item) => item.type === 'message' && item.role === 'assistant' && item.content?.includes('No pude'))).toBe(
      false,
    );
  });
});
