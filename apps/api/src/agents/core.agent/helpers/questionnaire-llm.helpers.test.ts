import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  buildInteractiveTurnArtifacts,
  extractClosingQuestionsFromText,
  resolveInteractiveTurnWithLLM,
} from './questionnaire-llm.helpers';
import { extractQuestionnaireClosingChoices } from '@financial-agent/shared';

vi.mock('../../../services/llm.service', () => ({
  completeStructuredWithClaude: vi.fn(),
}));

import { completeStructuredWithClaude } from '../../../services/llm.service';

describe('questionnaire-llm.helpers', () => {
  beforeEach(() => {
    vi.mocked(completeStructuredWithClaude).mockReset();
  });

  it('extracts only the closing question for chat-2', () => {
    const questions = extractClosingQuestionsFromText(
      'Ruta A parece viable.\n\n¿Prefieres atacar la tarjeta o armar colchón primero?',
      'chat-2',
    );
    expect(questions).toHaveLength(1);
    expect(questions[0]).toMatch(/tarjeta|colch/i);
  });

  it('resolves questionnaire and suggestions in one LLM call', async () => {
    vi.mocked(completeStructuredWithClaude).mockResolvedValueOnce({
      questions: [
        {
          id: 'q_1',
          response_mode: 'choices',
          choices: ['Atacar la tarjeta', 'Armar colchón primero', 'Depende del mes'],
          allow_free_text: true,
          free_text_placeholder: 'Otro (escribe aquí)',
        },
      ],
      suggested_replies: ['Atacar la tarjeta', 'Armar colchón primero', 'Depende del mes'],
    });

    const result = await resolveInteractiveTurnWithLLM(
      [{ id: 'q_1', question: '¿Prefieres atacar la tarjeta o armar colchón primero?' }],
      { activeChatId: 'chat-2' },
    );

    expect(completeStructuredWithClaude).toHaveBeenCalledTimes(1);
    expect(result.questions[0].response_mode).toBe('choices');
    expect(result.suggested_replies[0]).toMatch(/tarjeta/i);
  });

  it('builds inferred questionnaire and aligned chips from assistant text', async () => {
    vi.mocked(completeStructuredWithClaude).mockResolvedValueOnce({
      questions: [
        {
          id: 'q_1',
          response_mode: 'open_text',
          choices: [],
          allow_free_text: true,
          free_text_placeholder: 'Escribe monto y tasa',
        },
      ],
      suggested_replies: ['Prefiero escribir la respuesta'],
    });

    const { agentBlocks, suggestedReplies } = await buildInteractiveTurnArtifacts({
      agentBlocks: [],
      assistantMessage:
        '¿Podrías confirmar el monto total y tasa de interés exacta de tu deuda actual para afinar la secuencia?',
      context: { activeChatId: 'chat-2' },
    });

    expect(completeStructuredWithClaude).toHaveBeenCalledTimes(1);
    expect(agentBlocks).toHaveLength(1);
    expect(agentBlocks[0].type).toBe('questionnaire');
    if (agentBlocks[0].type === 'questionnaire') {
      expect(agentBlocks[0].questionnaire.questions[0].response_mode).toBe('open_text');
      expect(agentBlocks[0].questionnaire.questions[0].choices).toEqual([]);
    }
    expect(suggestedReplies[0]).toMatch(/escribir/i);
  });

  it('re-enriches model-emitted questionnaire blocks in a single call', async () => {
    vi.mocked(completeStructuredWithClaude).mockResolvedValueOnce({
      questions: [
        {
          id: 'q_1',
          response_mode: 'open_text',
          choices: [],
          allow_free_text: true,
          free_text_placeholder: 'Escribe monto y tasa',
        },
      ],
      suggested_replies: ['Prefiero escribir la respuesta'],
    });

    const { agentBlocks, suggestedReplies } = await buildInteractiveTurnArtifacts({
      agentBlocks: [
        {
          type: 'questionnaire',
          questionnaire: {
            id: 'q-test',
            questions: [
              {
                id: 'q_1',
                question: '¿Podrías confirmar el monto total y tasa exacta?',
                choices: ['Tarjeta de crédito', 'Crédito de consumo', 'Hipotecario', 'Línea de crédito'],
                allow_free_text: true,
                required: true,
              },
            ],
          },
        },
      ],
      assistantMessage: 'Confirma monto y tasa para afinar la secuencia.',
      context: { activeChatId: 'chat-2' },
    });

    expect(completeStructuredWithClaude).toHaveBeenCalledTimes(1);
    if (agentBlocks[0]?.type === 'questionnaire') {
      expect(agentBlocks[0].questionnaire.questions[0].choices).toEqual([]);
      expect(agentBlocks[0].questionnaire.questions[0].response_mode).toBe('open_text');
    }
    expect(suggestedReplies[0]).toMatch(/escribir/i);
  });

  it('falls back safely when LLM fails', async () => {
    vi.mocked(completeStructuredWithClaude).mockRejectedValueOnce(new Error('timeout'));

    const { agentBlocks, suggestedReplies } = await buildInteractiveTurnArtifacts({
      agentBlocks: [],
      assistantMessage: '¿Cuánto puedes aportar al mes?',
      context: { activeChatId: 'chat-2' },
    });

    if (agentBlocks[0]?.type === 'questionnaire') {
      expect(agentBlocks[0].questionnaire.questions[0].response_mode).toBe('open_text');
    }
    expect(suggestedReplies.length).toBeGreaterThan(0);
  });

  it('keeps composer chips aligned with questionnaire closing choices', async () => {
    vi.mocked(completeStructuredWithClaude).mockResolvedValueOnce({
      questions: [
        {
          id: 'q_1',
          response_mode: 'choices',
          choices: ['Atacar la tarjeta', 'Armar colchón primero'],
          allow_free_text: true,
        },
      ],
      suggested_replies: ['Atacar la tarjeta', 'Armar colchón primero'],
    });

    const { agentBlocks, suggestedReplies } = await buildInteractiveTurnArtifacts({
      agentBlocks: [],
      assistantMessage: '¿Prefieres atacar la tarjeta o armar colchón primero?',
      context: { activeChatId: 'chat-2' },
    });

    const closingChoices = extractQuestionnaireClosingChoices(agentBlocks);
    expect(closingChoices[0]).toMatch(/tarjeta/i);
    expect(suggestedReplies[0]).toMatch(/tarjeta/i);
  });
});
