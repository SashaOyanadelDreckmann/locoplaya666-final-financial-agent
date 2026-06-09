import { describe, expect, it } from 'vitest';

import {
  CORE_AGENT_DEFAULT_CLIENT_TIMEOUT_MS,
  CORE_AGENT_PROXY_BUFFER_MS,
  CORE_AGENT_STREAM_EXTRA_TIMEOUT_MS,
  resolveCoreAgentClientTimeoutMs,
  resolveCoreAgentProxyTimeoutMs,
  resolveCoreAgentStreamClientTimeoutMs,
} from '../agent-timeouts';

describe('agent-timeouts', () => {
  it('uses defaults when env is missing or invalid', () => {
    expect(resolveCoreAgentClientTimeoutMs(undefined)).toBe(CORE_AGENT_DEFAULT_CLIENT_TIMEOUT_MS);
    expect(resolveCoreAgentClientTimeoutMs('0')).toBe(CORE_AGENT_DEFAULT_CLIENT_TIMEOUT_MS);
    expect(resolveCoreAgentStreamClientTimeoutMs(undefined)).toBe(
      CORE_AGENT_DEFAULT_CLIENT_TIMEOUT_MS + CORE_AGENT_STREAM_EXTRA_TIMEOUT_MS,
    );
    expect(resolveCoreAgentProxyTimeoutMs(undefined)).toBe(
      CORE_AGENT_DEFAULT_CLIENT_TIMEOUT_MS +
        CORE_AGENT_STREAM_EXTRA_TIMEOUT_MS +
        CORE_AGENT_PROXY_BUFFER_MS,
    );
  });

  it('respects explicit client timeout', () => {
    expect(resolveCoreAgentClientTimeoutMs('45000')).toBe(45000);
    expect(resolveCoreAgentStreamClientTimeoutMs('45000')).toBe(
      45000 + CORE_AGENT_STREAM_EXTRA_TIMEOUT_MS,
    );
  });
});
