/** @jest-environment node */

import {
  buildCoreAgentRequestBody,
  sanitizeCoreAgentHistory,
} from '@/lib/agent/buildCoreAgentRequest';

describe('buildCoreAgentRequest', () => {
  it('compacts history and merges profile into context', () => {
    const body = buildCoreAgentRequestBody({
      user_message: '¿Cuál es la UF hoy?',
      history: [
        { role: 'user', content: 'hola' },
        { role: 'assistant', content: 'hola' },
        { role: 'user', content: 'siguiente' },
      ],
      profile: { country: 'CL' },
      user_info: { name: 'Ana' },
      context: { foo: 'bar' },
      preferences: { language: 'es-CL' },
    });

    expect(body.user_message).toBe('¿Cuál es la UF hoy?');
    expect(body.user_name).toBe('Ana');
    expect(body.history.length).toBeGreaterThan(0);
    expect(body.context).toMatchObject({
      foo: 'bar',
      profile: { country: 'CL' },
      user_info: { name: 'Ana' },
    });
    expect(body.preferences).toEqual({ language: 'es-CL' });
  });

  it('filters invalid history rows', () => {
    const compact = sanitizeCoreAgentHistory([
      { role: 'user', content: 'ok' },
      { role: 'assistant', content: '' },
      // @ts-expect-error intentional bad row
      { role: 'system', content: 'nope' },
    ]);
    expect(compact.every((row) => row.role === 'user' || row.role === 'assistant')).toBe(true);
  });
});
