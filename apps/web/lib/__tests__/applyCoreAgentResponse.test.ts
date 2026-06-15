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

  it('replaces stream session bubble even after run.complete sets streaming=false', () => {
    const items = applyCoreAgentResponseToItems({
      items: [
        { type: 'message', role: 'user', content: 'hola' },
        {
          type: 'message',
          role: 'assistant',
          content: '<PANEL>{"section":"profile","message":"tu perfil"}</PANEL>',
          stream: { tools: [], streaming: false, startedAt: 1, phaseStatus: 'done' },
        },
      ],
      response: {
        message: 'Hola, ¿qué tal? Bienvenido.',
        mode: 'information',
        panel_action: { section: 'profile', message: 'tu perfil' },
      },
    });

    expect(items.filter((item) => item.type === 'message' && item.role === 'assistant')).toHaveLength(1);
    expect(items.some((item) => item.type === 'message' && item.role === 'assistant' && item.content === 'Hola, ¿qué tal? Bienvenido.')).toBe(
      true,
    );
    expect(items.some((item) => item.type === 'message' && item.role === 'assistant' && String(item.content).includes('PANEL'))).toBe(
      false,
    );
  });

  it('preserves streamed text when format phase returns safe fallback', () => {
    const items = applyCoreAgentResponseToItems({
      items: [
        { type: 'message', role: 'user', content: 'hola' },
        {
          type: 'message',
          role: 'assistant',
          content: 'Respuesta real generada durante el stream',
          stream: { tools: [], streaming: false, startedAt: 1, phaseStatus: 'done' },
        },
      ],
      response: {
        message:
          'Preparé una respuesta base con los resultados disponibles. Si quieres, la refinamos en el siguiente mensaje.',
        mode: 'information',
      },
    });

    expect(
      items.some(
        (item) =>
          item.type === 'message' &&
          item.role === 'assistant' &&
          item.content === 'Respuesta real generada durante el stream',
      ),
    ).toBe(true);
  });

  it('preserves streamed text when final payload message is empty', () => {
    const items = applyCoreAgentResponseToItems({
      items: [
        { type: 'message', role: 'user', content: 'pregunta' },
        {
          type: 'message',
          role: 'assistant',
          content: 'Texto visible durante el stream',
          stream: { tools: [], streaming: false, startedAt: 1, phaseStatus: 'done' },
        },
      ],
      response: {
        message: '',
        mode: 'information',
        panel_action: { section: 'profile', message: 'tu perfil' },
      },
    });

    expect(
      items.some(
        (item) =>
          item.type === 'message' &&
          item.role === 'assistant' &&
          item.content === 'Texto visible durante el stream',
      ),
    ).toBe(true);
  });

  it('keeps assistant bubble when generic onboarding is filtered but citations remain', () => {
    const items = applyCoreAgentResponseToItems({
      items: [
        { type: 'message', role: 'assistant', content: '', mode: 'information' },
        { type: 'message', role: 'user', content: 'hola' },
        {
          type: 'message',
          role: 'assistant',
          content: 'Respuesta concreta para el usuario',
          stream: { tools: [], streaming: false, startedAt: 1, phaseStatus: 'done' },
        },
      ],
      response: {
        message: 'Hola, bienvenido. Soy tu agente financiero personal en Chile.',
        mode: 'information',
        citations: [{ title: 'CMF', source: 'CMF', url: 'https://cmf.cl' }],
      },
    });

    expect(items.filter((item) => item.type === 'message' && item.role === 'assistant')).toHaveLength(2);
    expect(
      items.some(
        (item) =>
          item.type === 'message' &&
          item.role === 'assistant' &&
          item.content === 'Respuesta concreta para el usuario',
      ),
    ).toBe(true);
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
    expect(result.items).toHaveLength(3);
    expect(result.items.some((item) => item.type === 'message' && item.role === 'assistant' && item.content?.includes('No pude'))).toBe(
      true,
    );
  });
});
