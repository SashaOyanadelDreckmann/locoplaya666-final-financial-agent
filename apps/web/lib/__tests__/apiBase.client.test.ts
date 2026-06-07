/** @jest-environment jsdom */

import { getAgentRequestUrl } from '../apiBase';

describe('apiBase client', () => {
  const env = process.env as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;

  afterEach(() => {
    env.NODE_ENV = originalNodeEnv;
  });

  it('always routes agent requests through the same-origin proxy in the browser', () => {
    env.NODE_ENV = 'production';
    expect(getAgentRequestUrl()).toBe('/api/agent');
    expect(getAgentRequestUrl('/api/agent')).toBe('/api/agent');
  });
});
