/** @jest-environment jsdom */

import { getAgentRequestUrl } from '../api/base';

describe('apiBase client', () => {
  const env = process.env as Record<string, string | undefined>;
  const originalNodeEnv = env.NODE_ENV;

  afterEach(() => {
    env.NODE_ENV = originalNodeEnv;
  });

  it('always routes agent requests through the same-origin proxy in the browser', () => {
    env.NODE_ENV = 'production';
    expect(getAgentRequestUrl()).toBe('/backend/api/agent');
    expect(getAgentRequestUrl('/api/agent')).toBe('/backend/api/agent');
    expect(getAgentRequestUrl('/api/agent/stream')).toBe('/api/agent/stream');
  });

  it('routes JSON agent calls through /backend rewrite in development', () => {
    env.NODE_ENV = 'development';
    expect(getAgentRequestUrl('/api/agent')).toBe('/backend/api/agent');
    expect(getAgentRequestUrl('/api/agent/stream')).toBe('/api/agent/stream');
  });
});
