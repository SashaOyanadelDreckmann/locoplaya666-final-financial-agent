import {
  isGenericQuestionnaireChoices,
  resolveQuestionnaireResponseMode,
  shouldUseOpenTextQuestionnaireInput,
} from '../../agente/questionnaire-response-mode';

describe('questionnaire-response-mode', () => {
  it('detects generic fallback choices', () => {
    expect(
      isGenericQuestionnaireChoices([
        'Opción más segura',
        'Opción equilibrada',
        'Opción agresiva',
        'Prefiero explicarlo yo',
      ]),
    ).toBe(true);
  });

  it('treats specific frequency choices as closed', () => {
    const choices = ['Mensual', 'Quincenal', 'Semanal', 'Depende de mi flujo'];
    expect(isGenericQuestionnaireChoices(choices)).toBe(false);
    expect(shouldUseOpenTextQuestionnaireInput('¿Con qué frecuencia ahorras?', choices)).toBe(false);
  });

  it('uses open text for location questions with mismatched frequency choices', () => {
    const question = '¿Dónde está ese dinero de $29.824 que sobra cada mes?';
    const choices = ['Mensual', 'Quincenal', 'Semanal', 'Depende de mi flujo'];
    expect(shouldUseOpenTextQuestionnaireInput(question, choices)).toBe(true);
    expect(resolveQuestionnaireResponseMode(question, choices, 'chat-1')).toBe('open-text');
  });

  it('uses open text for concrete investment objective questions', () => {
    const question = '¿Cuál es tu objetivo de inversión concreto?';
    const choices = ['Opción más segura', 'Opción equilibrada', 'Opción agresiva', 'Prefiero explicarlo yo'];
    expect(resolveQuestionnaireResponseMode(question, choices, 'chat-2')).toBe('open-text');
  });

  it('keeps closed choices for chat-1 when options fit the question', () => {
    const question = '¿Con qué frecuencia revisas tu presupuesto?';
    const choices = ['Mensual', 'Quincenal', 'Semanal', 'Depende de mi flujo'];
    expect(resolveQuestionnaireResponseMode(question, choices, 'chat-1')).toBe('choices');
  });

  it('forces open text in chat-3 regardless of choices', () => {
    const question = '¿Con qué frecuencia ahorras?';
    const choices = ['Mensual', 'Quincenal', 'Semanal', 'Depende de mi flujo'];
    expect(resolveQuestionnaireResponseMode(question, choices, 'chat-3')).toBe('open-text');
  });
});
