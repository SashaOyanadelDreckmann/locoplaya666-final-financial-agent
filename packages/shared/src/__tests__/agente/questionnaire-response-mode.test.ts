import { describe, expect, it } from 'vitest';
import {
  extractQuestionnaireClosingChoices,
  hasActiveQuestionnaireBlock,
  resolveQuestionnaireResponseMode,
} from '../../agente/questionnaire-response-mode';

describe('questionnaire-response-mode', () => {
  it('uses backend response_mode when provided', () => {
    expect(
      resolveQuestionnaireResponseMode(
        '¿Cuánto es tu deuda?',
        ['Tarjeta de crédito'],
        'chat-2',
        'open_text',
      ),
    ).toBe('open-text');
  });

  it('uses choices when backend marks choices mode', () => {
    expect(
      resolveQuestionnaireResponseMode(
        '¿Prefieres atacar la tarjeta o armar colchón primero?',
        ['Atacar la tarjeta', 'Armar colchón primero'],
        'chat-2',
        'choices',
      ),
    ).toBe('choices');
  });

  it('falls back to open text when there are no choices', () => {
    expect(resolveQuestionnaireResponseMode('¿Cuánto es tu deuda?', [], 'chat-2')).toBe('open-text');
  });

  it('forces open text in chat-3 regardless of choices', () => {
    expect(
      resolveQuestionnaireResponseMode(
        '¿Con qué frecuencia ahorras?',
        ['Mensual', 'Quincenal'],
        'chat-3',
        'choices',
      ),
    ).toBe('open-text');
  });

  it('detects active questionnaire blocks', () => {
    expect(
      hasActiveQuestionnaireBlock([
        {
          type: 'questionnaire',
          questionnaire: { questions: [{ question: '¿Cuánto es tu deuda?' }] },
        },
      ]),
    ).toBe(true);
    expect(hasActiveQuestionnaireBlock([])).toBe(false);
  });

  it('extracts closing choices from questionnaire blocks', () => {
    const choices = extractQuestionnaireClosingChoices([
      {
        type: 'questionnaire',
        questionnaire: {
          questions: [
            {
              choices: ['Atacar la tarjeta', 'Armar colchón primero'],
              response_mode: 'choices',
            },
          ],
        },
      },
    ]);

    expect(choices).toEqual(['Atacar la tarjeta', 'Armar colchón primero']);
  });
});
