import { describe, expect, it } from 'vitest';

import {
  isQuestionnairePlaceholderUserMessage,
  isQuestionnaireResponsePayload,
  mergeAgentConversationHistory,
  QUESTIONNAIRE_PLACEHOLDER_USER_MESSAGE,
  resolveUserMessageForAgentHistory,
} from '../../agente/questionnaire-history';

describe('questionnaire-history', () => {
  it('detects questionnaire payloads and placeholders', () => {
    expect(isQuestionnaireResponsePayload('Formulario respondido. id=q1 respuestas=q1=Si')).toBe(
      true,
    );
    expect(isQuestionnairePlaceholderUserMessage(QUESTIONNAIRE_PLACEHOLDER_USER_MESSAGE)).toBe(true);
  });

  it('prefers agent_content for history resolution', () => {
    expect(
      resolveUserMessageForAgentHistory({
        content: QUESTIONNAIRE_PLACEHOLDER_USER_MESSAGE,
        agent_content: 'Formulario respondido. id=q1 respuestas=q1=Si',
      }),
    ).toBe('Formulario respondido. id=q1 respuestas=q1=Si');
  });

  it('merges storage payloads over client placeholders with equal length', () => {
    const merged = mergeAgentConversationHistory(
      [
        { role: 'user', content: QUESTIONNAIRE_PLACEHOLDER_USER_MESSAGE },
        { role: 'assistant', content: 'Gracias' },
      ],
      [
        { role: 'user', content: 'Formulario respondido. id=q1 respuestas=q1=Priorizar deuda' },
        { role: 'assistant', content: 'Gracias' },
      ],
    );

    expect(merged[0]?.content).toContain('Formulario respondido.');
    expect(merged[1]?.content).toBe('Gracias');
  });

  it('prefers longer storage history when client is shorter', () => {
    const merged = mergeAgentConversationHistory(
      [{ role: 'user', content: 'Hola' }],
      [
        { role: 'user', content: 'Hola' },
        { role: 'assistant', content: 'Bienvenido' },
      ],
    );

    expect(merged).toHaveLength(2);
  });
});
