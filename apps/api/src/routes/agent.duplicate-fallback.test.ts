import { describe, expect, it } from 'vitest';
import {
  isTooSimilarMessage,
  shouldReplaceWithDuplicateFallback,
} from './agent';

describe('agent duplicate fallback', () => {
  it('only treats normalized exact repeats as duplicates', () => {
    expect(
      isTooSimilarMessage(
        'Hubo una intermitencia técnica puntual, pero sigo contigo en el flujo.',
        'Hubo una intermitencia tecnica puntual pero sigo contigo en el flujo'
      )
    ).toBe(true);

    expect(
      isTooSimilarMessage(
        'Informe diagnóstico financiero listo.',
        'Informe diagnóstico financiero con próximos pasos listos.'
      )
    ).toBe(false);
  });

  it('does not replace a short but non-identical response', () => {
    const response = {
      message: 'Informe diagnóstico financiero listo.',
      agent_blocks: [],
      artifacts: [],
      citations: [],
      budget_updates: [],
    };

    expect(
      shouldReplaceWithDuplicateFallback({
        response,
        recentAssistantMessages: ['Informe diagnóstico financiero con próximos pasos listos.'],
      })
    ).toBe(false);
  });
});
